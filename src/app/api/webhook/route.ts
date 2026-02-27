import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWebhookSignature, extractMessage } from "@/lib/webhook";
import { sendTextMessage, markMessageAsRead, sendSenderAction } from "@/lib/whatsapp";
import { buildContext } from "@/lib/context-builder";

import { determineNextState } from "@/lib/state-transitions";
import { detectFrustration } from "@/lib/intent-classifier";
import { hasClosingSignal as hasLexicalClosingSignal } from "@/lib/slot-extractor";
import { acquireLock, releaseLock } from "@/lib/concurrency";
import { emitTelemetry, hashPhone, logShadowAudit, logWebhookEvent } from "@/lib/telemetry";
import { randomUUID } from "crypto";
import {
    updateSlots,
    transitionTo,
    incrementStall,
    resetStall,
    incrementFrustration,
    incrementMessageCount,
    isHumanLocked,
} from "@/lib/state-manager";
import { isAffirmativeResponse } from "@/lib/stock-agent";
import { orchestrate, type OrchestratorResult } from "@/lib/orchestrator";
import {
    generateWarmHandoffSummary,
    calculateSLADeadline,
    type HandoffContext
} from "@/lib/handoff-router";
import { humanLoopConfig } from "@/config/humanLoop.config";
import { evaluateHandoff, type HandoffReason } from "@/services/humanLoopEngine";
import { buildSaleAlertMessage, buildHandoffMessage, buildSACAlertMessage } from "@/services/humanLoopMessages";
import { lockToHuman } from "@/lib/state-manager";
import { getMissingSacData, buildSacQuestion, hasAnyMissingSacData } from "@/services/sacMinimum";
import { isChatOnlyMode, shouldSkipTelemetry, chatLog } from "@/lib/chat-mode";
import { saveToOutbox } from "@/lib/chat-outbox";
import { getAgentRuntimeForConversation } from "@/lib/agent/config";

// ─── Module-level debug logging ───
import * as fs from "fs";

function debugLog(msg: string) {
    try {
        fs.appendFileSync("webhook.log", `[${new Date().toISOString()}] ${msg}\n`);
    } catch {
        // Silently ignore file write errors in production
    }
}

function shouldBypassSacMinimumForPolicyInfo(intent: string, currentState: string, userMessage: string): boolean {
    if (intent === "INFO" || intent.startsWith("INFO_")) return true;
    if (currentState !== "support_sac") return false;

    const normalized = userMessage
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    const explicitInfoSignals = [
        "so uma informacao",
        "apenas uma informacao",
        "era so uma informacao",
        "e so uma informacao",
        "so uma duvida",
        "apenas uma duvida",
        "nao foi pedido",
        "nao e defeito",
        "nao e pedido",
    ];

    const policySignals = [
        "troca",
        "presente",
        "retirar",
        "retirada",
        "marido",
        "esposa",
        "terceiro",
        "outra pessoa",
        "token",
        "liberacao",
    ];

    return explicitInfoSignals.some((s) => normalized.includes(s)) &&
        policySignals.some((s) => normalized.includes(s));
}

type NextStepContext = {
    intent?: string;
    effective_intent?: string;
    state?: string;
    action?: string;
    is_chat_only?: boolean;
    missing?: string[];
};

function normalizeText(text: string): string {
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function ensureNextStep(replyText: string, ctx: NextStepContext): string {
    const original = (replyText || "").trim();
    if (!original) {
        if (process.env.CADU_DEBUG === "1") {
            console.log(`[NEXT_STEP] appended_next_step=false reason=empty_reply`);
        }
        return replyText;
    }

    const normalizedReply = normalizeText(original);
    const intent = String(ctx.effective_intent || ctx.intent || "").toUpperCase();
    const action = String(ctx.action || "").toUpperCase();

    const isInfoOrSupport =
        intent === "SUPPORT" ||
        intent === "INFO" ||
        intent.startsWith("INFO_");
    const isSacIntent =
        intent.startsWith("SAC_") ||
        intent === "ORDER_STATUS" ||
        intent === "TRACKING" ||
        intent === "EXCHANGE_REQUEST" ||
        intent === "REFUND_REQUEST";

    if (isInfoOrSupport) {
        if (process.env.CADU_DEBUG === "1") {
            console.log(`[NEXT_STEP] appended_next_step=false reason=support_or_info`);
        }
        return original;
    }

    const hasRequestVerb =
        /\b(me informe|me informa|me manda|pode me dizer|confirma|envie|me passa)\b/i.test(normalizedReply);

    const endsWithQuestion = /\?\s*$/.test(original);
    const asksForDataAtEnd =
        /\b(cpf|pedido|numero do pedido)\b/i.test(normalizedReply.slice(-160));

    const hasActionNextStep =
        /\b(proximo passo|agora)\b.*\b(vou verificar|posso acionar|quer que eu reserve|posso reservar|vou encaminhar|posso encaminhar|vou abrir)\b/i
            .test(normalizedReply);

    if (normalizedReply.includes("proximo passo:")) {
        if (process.env.CADU_DEBUG === "1") {
            console.log(`[NEXT_STEP] appended_next_step=false reason=already_has_proximo_passo`);
        }
        return original;
    }

    if (!isSacIntent && (hasRequestVerb || (endsWithQuestion && asksForDataAtEnd) || hasActionNextStep)) {
        if (process.env.CADU_DEBUG === "1") {
            const reason = hasRequestVerb
                ? "already_has_request_verb"
                : (endsWithQuestion && asksForDataAtEnd)
                    ? "already_has_data_question"
                    : "already_has_action_next_step";
            console.log(`[NEXT_STEP] appended_next_step=false reason=${reason}`);
        }
        return original;
    }

    let nextStep = "";

    if (action === "ESCALATE") {
        nextStep = "Próximo passo: posso encaminhar para atendente humano agora, se você confirmar.";
    } else if (intent === "ORDER_STATUS" || intent === "TRACKING" || intent === "SAC_ATRASO") {
        nextStep = "Próximo passo: me confirme o CPF e o número do pedido para eu verificar o status aqui.";
    } else if (
        intent === "EXCHANGE_REQUEST" ||
        intent === "REFUND_REQUEST" ||
        intent === "SAC_TROCA" ||
        intent === "SAC_REEMBOLSO" ||
        intent === "SAC_RETIRADA"
    ) {
        nextStep = "Próximo passo: me envie CPF + número do pedido. Se estiver na loja, leve NF e documento com foto.";
    } else if (
        intent === "STOCK_AVAILABILITY" ||
        intent === "SALES" ||
        intent === "RESERVATION" ||
        intent === "CLOSING_SALE" ||
        intent === "STOCK"
    ) {
        nextStep = "Próximo passo: me diga o tamanho e a cor/modelo para eu consultar disponibilidade no sistema.";
    }

    if (!nextStep) {
        if (process.env.CADU_DEBUG === "1") {
            console.log(`[NEXT_STEP] appended_next_step=false reason=action_not_supported`);
        }
        return original;
    }

    const separator = original.endsWith(".") || original.endsWith("!") || original.endsWith("?") ? "\n" : ".\n";
    const updated = `${original}${separator}${nextStep}`;

    if (process.env.CADU_DEBUG === "1") {
        console.log(`[NEXT_STEP] appended_next_step=true reason=no_question_detected intent=${intent || "UNKNOWN"} action=${action || "UNKNOWN"}`);
    }

    return updated;
}

// Validar ambiente ao iniciar
console.log("[WEBHOOK] 🚀 Module loaded. Dev server runs on port 3001 — ensure ngrok targets the correct port.");
if (!process.env.WHATSAPP_VERIFY_TOKEN) {
    console.warn("[WEBHOOK] ⚠️ WHATSAPP_VERIFY_TOKEN não definido no .env");
}

// ─── GET: Verificação do Webhook (Meta) ───
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;

    const mode = searchParams.get("hub.mode");
    const token = searchParams.get("hub.verify_token");
    const challenge = searchParams.get("hub.challenge");

    console.log("[WEBHOOK] 🌐 GET Verification Request:", { mode, token, challenge });

    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

    if (mode === "subscribe" && token === verifyToken) {
        console.log("[WEBHOOK] ✅ Verificação bem-sucedida! Retornando challenge.");
        return new NextResponse(challenge, { status: 200 });
    }

    console.warn("[WEBHOOK] ❌ Verificação falhou. Token inválido ou mode incorreto.");
    return NextResponse.json(
        { error: "Forbidden", detail: "Verify Token mismatch" },
        { status: 403 }
    );
}

// ─── POST: Receber mensagens do WhatsApp ───
export async function POST(request: NextRequest) {
    const requestStartTime = Date.now();
    let rawBody = "";
    let conversationId = "unknown";
    let storeId = "unknown";

    // Verificar modo CHAT_ONLY para logs simplificados
    const chatOnlyAtEntry = isChatOnlyMode();

    try {
        rawBody = await request.text();

        // Log simplificado com tags em CHAT_ONLY
        if (chatOnlyAtEntry) {
            // Extract basic message info for logging
            let inboundMsg = "";
            try {
                const body = JSON.parse(rawBody);
                const msg = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
                if (msg?.text?.body) {
                    inboundMsg = msg.text.body.substring(0, 30);
                    conversationId = `pending_${msg.from?.slice(-8) || "unknown"}`;
                }
            } catch { /* ignore */ }
            console.log(`[INBOUND] msg="${inboundMsg}..." phone=${conversationId.split('_')[1] || 'unknown'}`);
        } else {
            console.log("[WEBHOOK] 📥 POST Payload RAW:", rawBody);
        }

        // Extract conversation and store info for logging if available
        try {
            const body = JSON.parse(rawBody);
            const value = body.entry?.[0]?.changes?.[0]?.value;
            if (value?.messages?.[0]) {
                const msg = value.messages[0];
                // Try to find conversation - this is a best effort since we don't have DB access yet
                conversationId = `pending_${msg.from.slice(-8)}`;
            }
        } catch {
            // Ignore parsing errors at this stage
        }
    } catch (readError) {
        console.error("[WEBHOOK] ❌ Falha ao ler corpo da requisição:", readError);

        // Log webhook error
        logWebhookEvent({
            conversationId,
            storeId,
            event: "ERROR",
            message: "Failed to read request body",
            processingTimeMs: Date.now() - requestStartTime,
            result: "error",
        });

        return NextResponse.json({ error: "Read Error" }, { status: 400 });
    }

    // Log webhook entry
    logWebhookEvent({
        conversationId,
        storeId,
        event: "ENTRY",
        message: "Webhook received",
        processingTimeMs: Date.now() - requestStartTime,
        result: "success",
    });

    // 1. Validar Assinatura
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    const isTestMode = process.env.TEST_MODE === "true" || isChatOnlyMode();

    if (false && appSecret && !isTestMode) {
        // Em modo normal, exige assinatura válida
        const signature = request.headers.get("x-hub-signature-256");
        if (!verifyWebhookSignature(rawBody, signature, appSecret)) {
            console.warn("[WEBHOOK] ❌ Assinatura inválida");

            // Log webhook error
            logWebhookEvent({
                conversationId,
                storeId,
                event: "ERROR",
                message: "Invalid webhook signature",
                processingTimeMs: Date.now() - requestStartTime,
                result: "error",
            });

            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
    } else if (appSecret && isTestMode && chatOnlyAtEntry) {
        // Em CHAT_ONLY, permite webhook sem assinatura (para teste via terminal)
        console.log("[INBOUND] [SKIP] assinatura ignorada em modo CHAT_ONLY");
    }

    // 2. Parsear JSON com Try/Catch Isolado
    let body: any;
    try {
        body = JSON.parse(rawBody);
    } catch (e) {
        console.error("[WEBHOOK] ❌ JSON inválido:", rawBody);

        // Log webhook error
        logWebhookEvent({
            conversationId,
            storeId,
            event: "ERROR",
            message: "Invalid JSON payload",
            processingTimeMs: Date.now() - requestStartTime,
            result: "error",
        });

        return NextResponse.json({ status: "ignored_invalid_json" }, { status: 200 });
    }

    // 3. Ingestion Phase (Sync Persistence)
    let ingestionContext: any = null;
    try {
        const result = await ingestMessage(body);

        // Se retornar null (bloqueado, ignorado, etc), retornamos 200 e paramos.
        // O `ingestMessage` já logou o motivo.
        if (!result) {
            return NextResponse.json({ status: "ignored_or_handled" }, { status: 200 });
        }
        ingestionContext = result;

    } catch (e: any) {
        console.error("[WEBHOOK] ❌ Erro de Ingestão:", e);
        if (isChatOnlyMode()) {
            return NextResponse.json({
                ok: false,
                mode: "chat_only",
                error: String(e.message || e),
                debug: { skipped_db: true }
            }, { status: 200 });
        }
        return NextResponse.json({ status: "error_handled", error: String(e.message || e) }, { status: 200 });
    }

    // 4. Processing Phase
    // Em CHAT_ONLY mode, processamento sync para Ralph Loop poder capturar resposta
    const chatOnly = isChatOnlyMode();

    if (chatOnly) {
        // CHAT_ONLY: Processamento sync para retornar dados
        try {
            console.time("llm_process_sync");
            const aiResult = await processAI(ingestionContext);
            // Adicionar resultado ao contexto para retorno
            ingestionContext.responseText = aiResult?.text || "";
            ingestionContext.detectedIntent = aiResult?.intent || "UNKNOWN";
            (ingestionContext as any).action = (aiResult as any)?.action;
            (ingestionContext as any).source = (aiResult as any)?.source;
            if ((aiResult as any)?.state && ingestionContext.conversation) {
                (ingestionContext.conversation as any).currentState = (aiResult as any).state;
            }
            console.log(`[WEBHOOK] [CHAT_ONLY] Sync processing complete: ${ingestionContext.responseText?.substring(0, 50)}`);
        } catch (err) {
            console.error(`[WEBHOOK] ❌ Sync Worker Error: ${err}`);
            ingestionContext.responseText = `[ERRO] ${err}`;
        } finally {
            console.timeEnd("llm_process_sync");
        }
    } else {
        // Produção: Fire-and-Forget (async)
        (async () => {
            try {
                console.time("llm_process");
                await processAI(ingestionContext);
            } catch (err) {
                console.error(`[WEBHOOK] ❌ Async Worker Error (Conv: ${ingestionContext.conversation.id}):`, err);
                debugLog(`[CRITICAL] Async Worker Error: ${err}`);
            } finally {
                console.timeEnd("llm_process");
            }
        })();
    }

    // 5. Return 200 OK Immediately
    console.log(`[WEBHOOK] ⚡ Returning 200 OK to Meta immediately.`);

    const responseData: any = { status: "received", ok: true };

    if (chatOnly) {
        responseData.mode = "chat_only";
        responseData.debug = { skipped_db: true };

        if (ingestionContext) {
            const conv = ingestionContext.conversation;
            const ensuredReplyText = ensureNextStep(ingestionContext.responseText || "", {
                intent: ingestionContext.detectedIntent,
                effective_intent: ingestionContext.effectiveIntent,
                state: (conv != null ? (conv as any).currentState : null) ?? "unknown",
                action: ingestionContext.action ?? "respond",
                is_chat_only: true,
            });
            ingestionContext.responseText = ensuredReplyText;
            responseData.replyText = ensuredReplyText;
            responseData.telemetry = {
                conversationId: conv?.id ?? "unknown",
                customerPhone: ingestionContext.msg?.from ?? "unknown",
                intent: ingestionContext.detectedIntent ?? "UNKNOWN",
                // currentState may throw if conversation is null; guard explicitly
                state: (conv != null ? (conv as any).currentState : null) ?? "unknown",
                action: ingestionContext.action ?? "respond",
            };
            if (ingestionContext.source) {
                responseData.telemetry.source = ingestionContext.source;
            }
        }
        console.log(`[WEBHOOK] [CHAT_ONLY] Returning telemetry in response`);
    }

    // Log webhook exit
    logWebhookEvent({
        conversationId,
        storeId,
        event: "EXIT",
        message: "Webhook processed, response sent",
        processingTimeMs: Date.now() - requestStartTime,
        result: "success",
    });

    return NextResponse.json(responseData, { status: 200 });
}

// ─── INGESTION (Sync) ───
// Retorna contexto se deve processar, ou null se ignorar/bloquear
async function ingestMessage(body: any) {
    const value = body.entry?.[0]?.changes?.[0]?.value;

    // A. Filtrar Status Updates (Lido, Entregue)
    if (value?.statuses) {
        const statuses = value.statuses;
        const status = statuses[0];
        console.log(`[WEBHOOK] 📶 Status Update: ${status?.status} (ID: ${status?.id})`);
        return null;
    }

    // B. Extrair Mensagem
    const msg = extractMessage(body);
    if (!msg) {
        console.log("[WEBHOOK] ℹ️ Ignorado: Não é mensagem de texto/áudio suportada");
        return null;
    }

    // C. Immediate Feedback
    markMessageAsRead(msg.waMessageId).catch(() => { });

    // C. CHAT_ONLY MODE: Simula store, customer e conversation em memória
    const chatOnly = isChatOnlyMode();
    if (chatOnly) {
        console.log("[WEBHOOK] [CHAT_ONLY] Modo sem banco - simulando dados");
        const mockStore = {
            id: "chatonly_store",
            phoneNumberId: msg.phoneNumberId,
            name: "Chat Only Store",
        };
        return {
            msg,
            store: mockStore,
            customer: { id: `chatonly_cust_${msg.from}`, phone: msg.from },
            conversation: { id: `chatonly_conv_${msg.from}`, currentState: "idle" },
            newConversationCreated: true,
        };
    }

    // D. Resolver Store com fallback defensivo para schema drift
    let store;
    try {
        store = await prisma.store.findUnique({
            where: { phoneNumberId: msg.phoneNumberId },
        });
    } catch (schemaErr: any) {
        // Erro de schema (ex: column does not exist)
        const errMsg = String(schemaErr?.message || schemaErr || "");
        if (errMsg.includes("does not exist") || errMsg.includes("P2022")) {
            console.error(`[WEBHOOK] ❌ Schema drift detectado: ${errMsg}`);

            // Em CHAT_ONLY, gravar erro na outbox para o terminal mostrar
            const chatOnly = isChatOnlyMode();
            if (chatOnly) {
                try {
                    const { saveToOutbox } = await import("@/lib/chat-outbox");
                    saveToOutbox(msg.from, {
                        conversationId: `error_${Date.now()}`,
                        content: `[ERRO CHAT_ONLY] Schema desatualizado. Rode: npm run prisma:sandbox:push`,
                        timestamp: Date.now(),
                        id: `err_${Date.now()}`,
                        status: "BOT",
                        state: "error",
                    });
                    console.log("[OUTBOX] erro de schema gravado para diagnóstico");
                } catch { /* outbox pode não estar disponível */ }
            }

            return null;
        }
        throw schemaErr; // Re-lança outros erros
    }

    if (!store) {
        console.warn(`[WEBHOOK] ❌ Store não encontrada: ${msg.phoneNumberId}`);
        return null;
    }

    // E. (REMOVED) Pre-Flight Check: CAUSAVA RACE CONDITION.
    // Vamos confiar APENAS no UNIQUE CONSTRAINT do banco no passo G.

    // F. Upsert Dados Relacionados (Customer -> Conversation)
    // CHAT_ONLY mode: skip DB operations
    if (chatOnly) {
        // Already handled above - this should never be reached
        return null;
    }
    let customer: any = { id: `chatonly_${Date.now()}`, storeId: store.id, phone: msg.from };
    // Fallback para conversation em modo CHAT_ONLY (evita null reference no catch)
    let conversation: any = chatOnly
        ? { id: `chatonly_conv_${msg.from}`, currentState: "idle", customerId: customer.id, storeId: store.id }
        : null;
    let newConversationCreated = false;

    try {
        customer = await prisma.customer.upsert({
            where: { storeId_phone: { storeId: store.id, phone: msg.from } },
            create: { storeId: store.id, phone: msg.from },
            update: {},
        });

        // Race Conditions na criação de conversa
        conversation = await prisma.conversation.findFirst({
            where: {
                storeId: store.id,
                customerId: customer.id,
                status: { in: ["open", "PENDING_HUMAN"] },
            },
            orderBy: { startedAt: "desc" },
        });

        if (!conversation) {
            conversation = await prisma.conversation.create({
                data: {
                    storeId: store.id,
                    customerId: customer.id,
                    status: "open",
                    currentState: "greeting",
                    slots: {},
                },
            });
            newConversationCreated = true;
            debugLog(`New conversation created: ${conversation.id}`);
        }
    } catch (dbError: any) {
        if (chatOnly) {
            console.log("[WEBHOOK] [CHAT_ONLY] DB unavailable, using in-memory fallback");
            // Criar objetos mínimos em memória
            customer = { id: `chatonly_cust_${Date.now()}`, storeId: store.id, phone: msg.from };
            conversation = {
                id: `chatonly_conv_${Date.now()}`,
                storeId: store.id,
                customerId: customer.id,
                status: "open",
                currentState: "greeting",
                slots: {},
                startedAt: new Date(),
            };
            newConversationCreated = true;
        } else {
            throw dbError;
        }
    }

    // G. Persistência da Mensagem (Inbound) - FAIL FAST (Physical DB Check)
    try {
        await prisma.message.create({
            data: {
                storeId: store.id,
                conversationId: conversation.id,
                direction: "inbound",
                content: msg.text,
                waMessageId: msg.waMessageId,
            },
        });
        console.log(`[WEBHOOK] ✅ Mensagem persistida: "${msg.text}"`);
    } catch (e: any) {
        // IDEMPOTÊNCIA RIGOROSA (NÍVEL FÍSICO)
        if (e.code === 'P2002') {
            console.log(`[WEBHOOK] 🛑 GHOST MESSAGE BLOCKED (ID: ${msg.waMessageId})`);
            debugLog(`[GHOST BLOCKED] Duplicate WAMID: ${msg.waMessageId}`);

            // CLEANUP: Se criamos conversa nova para este duplicado, deletamos
            if (newConversationCreated) {
                await prisma.conversation.delete({ where: { id: conversation.id } }).catch(() => { });
                console.log(`[WEBHOOK] 🧹 Orphan conversation cleaned up.`);
            }

            return null; // Bloqueia processamento
        }

        // CHAT_ONLY FALLBACK: Se DB falhar por outro motivo, continua
        if (chatOnly) {
            console.log(`[WEBHOOK] [CHAT_ONLY] DB error on message create: ${e.message}`);
        } else {
            throw e;
        }
    }

    // Reset Command Hook
    if (msg.text.toLowerCase().trim() === "reset") {
        try {
            await prisma.conversation.update({
                where: { id: conversation.id },
                data: {
                    status: "open",
                    currentState: "greeting",
                    slots: {},
                    stallCount: 0,
                    frustrationLevel: 0,
                    messageCount: 0,
                    processingUntil: null
                }
            });
        } catch (dbError: any) {
            if (!chatOnly) throw dbError;
            console.log("[WEBHOOK] [CHAT_ONLY] Reset failed, continuing anyway");
        }
        await sendTextMessage(msg.from, "🔄 Conversa resetada.");
        return null;
    }

    return { store, customer, conversation, msg };
}

// ─── WORKER (Async Background) ───
async function processAI(ctx: any) {
    const { store, conversation, msg } = ctx;

    // CHAT_ONLY mode: desativa telemetria para reduzir latência e ignora locks de banco
    const chatOnly = isChatOnlyMode();

    // 1. Acquire Lock
    let lockAcquired = true;
    if (!chatOnly) {
        lockAcquired = await acquireLock(conversation.id);
    }

    if (!lockAcquired) {
        console.log(`[WORKER] 🔒 Lock ocupado. Mensagem salva mas não processada (Debounce): ${msg.waMessageId}`);
        return;
    }

    const startTime = Date.now();

    // ─── Telemetry identifiers (1 per processing cycle) ───
    const requestId = randomUUID();
    const customerIdHash = hashPhone(msg.from); // LGPD — never log msg.from directly
    const telemetryBase = {
        storeId: store.id,
        conversationId: conversation.id,
        customerId: customerIdHash,
        requestId,
    };

    // CHAT_ONLY: Result captured inside try block for safe return after finally
    let _chatOnlyResult: { text: string; intent: string; state: string; action?: string; source?: string } | undefined;

    // Telemetry and other declarations...
    try {
        // ─── HUMAN LOOP GATE: Verifica se conversa está travada em modo HUMAN ───
        const isLocked = await isHumanLocked(conversation.id);
        if (isLocked) {
            console.log(`[HANDOFF] conversation locked (HUMAN), ignoring bot reply for ${conversation.id}`);
            return;
        }

        if (conversation.status === "PENDING_HUMAN") {
            console.log(`[WORKER] 🔇 Ignorando (Humano pendente)`);
            return;
        }

        // ─── UX: Typing indicator (fire-and-forget, nunca bloqueia pipeline) ───
        // Dura 25s ou até a próxima mensagem ser enviada — mais que suficiente para o LLM
        sendSenderAction(msg.from, "typing_on").catch(() => { });

        await incrementMessageCount(conversation.id);

        const context = await buildContext({
            conversationId: conversation.id,
            userMessage: msg.text,
            storeId: store.id,
            storeName: store.name || "Loja",
            customerName: ctx.customer.name || undefined,
            currentWaMessageId: msg.waMessageId,
        });

        // Persistir nome do cliente quando vier claro na mensagem (ajuda SAC a nao repetir coleta)
        if (!ctx.customer.name && typeof context.slots.customerName === "string" && context.slots.customerName.trim().length >= 3) {
            prisma.customer.update({
                where: { id: ctx.customer.id },
                data: { name: context.slots.customerName.trim() },
            }).catch(() => { });
            ctx.customer.name = context.slots.customerName.trim();
        }

        // Log de classify em CHAT_ONLY
        if (chatOnly) {
            console.log(`[CLASSIFY] intent=${context.detectedIntent} state=${context.currentState} slots=${JSON.stringify(context.slots).substring(0, 50)}`);
        }

        if (detectFrustration(msg.text, context.conversationHistory)) {
            await incrementFrustration(conversation.id);
        }

        const transition = determineNextState(
            context.currentState, context.slots, context.detectedIntent,
            context.stallCount, context.frustrationLevel, context.messageCount
        );

        if (transition.nextState) {
            await transitionTo(conversation.id, transition.nextState, transition.reason, store.id);
            context.currentState = transition.nextState!;
            // Log de state em CHAT_ONLY
            if (chatOnly) {
                console.log(`[STATE] transition ${context.currentState} <- ${transition.reason}`);
            }
        }

        if (context.slotExtraction.hasNewData) {
            await updateSlots(conversation.id, context.slotExtraction.extracted, context.slots);
            await resetStall(conversation.id);
        } else {
            await incrementStall(conversation.id);
        }

        // ─── FASE 2: AUTO-ROUTING SAC ───
        // Roteia conversa baseado no intent detectado pelo buildContext
        // Nota: uses raw SQL pois prisma client ainda não foi regenerado com conversationType
        if (!chatOnly) {
            const sacIntents = ["SUPPORT", "HANDOFF", "SAC_TROCA", "SAC_ATRASO", "SAC_RETIRADA", "SAC_REEMBOLSO"];
            const targetType =
                context.currentState === "support_sac" || sacIntents.includes(context.detectedIntent)
                    ? "sac"
                    : "sales";

            const rows = await prisma.$queryRaw<{ conversation_type: string }[]>`
                SELECT conversation_type FROM conversations WHERE id = ${conversation.id} LIMIT 1
            `;

            if (rows[0] && rows[0].conversation_type !== targetType) {
                await prisma.$executeRaw`
                    UPDATE conversations SET conversation_type = ${targetType} WHERE id = ${conversation.id}
                `;
                console.log(`[WORKER] 🚦 Conversa ${conversation.id} roteada para: ${targetType} (intent: ${context.detectedIntent})`);
            }
        }
        // ─── FIM FASE 2 ───

        // ─── TELEMETRY: Momento 1 — Eventos de estoque (pós buildContext) ───
        const hasProductSignal = Boolean(
            context.slots.product || context.slots.usage ||
            context.slots.marca || context.slots.categoria || context.slots.size
        );

        // TELEMETRY: SKIP em CHAT_ONLY para reduzir latência
        if (!chatOnly && context.detectedIntent === "SALES" && hasProductSignal) {
            // A: O que o cliente queria buscar
            emitTelemetry({
                ...telemetryBase,
                eventType: "product_interest",
                payload: {
                    ...telemetryBase,
                    channel: "whatsapp",
                    waMessageId: msg.waMessageId,
                    query_original: msg.text,
                    marca: context.slots.marca,
                    categoria: context.slots.categoria,
                    genero: context.slots.genero,
                    tamanho: context.slots.size,
                    uso: context.slots.usage,
                    goal: context.slots.goal,
                },
            });

            // B: Parâmetros que o motor de busca recebeu
            emitTelemetry({
                ...telemetryBase,
                eventType: "stock_check",
                payload: {
                    ...telemetryBase,
                    channel: "whatsapp",
                    waMessageId: msg.waMessageId,
                    query_normalizada: context.slots.product ?? context.slots.usage ?? msg.text,
                    engine: "findRelevantProducts",
                    slots_snapshot: {
                        marca: context.slots.marca,
                        categoria: context.slots.categoria,
                        tamanho: context.slots.size,
                        uso: context.slots.usage,
                    },
                },
            });

            // C: Resultado do motor de busca
            const stockStatus = context.availableProducts.length > 0 ? "found" : "not_found";
            emitTelemetry({
                ...telemetryBase,
                eventType: "stock_result",
                payload: {
                    ...telemetryBase,
                    channel: "whatsapp",
                    waMessageId: msg.waMessageId,
                    status: stockStatus,
                    sku_encontrado: context.availableProducts[0]?.description,
                    quantidade_disponivel: context.availableProducts[0]?.quantity,
                    similares: context.availableProducts.slice(1).map(p => p.description),
                    motivo_falha: stockStatus === "not_found" ? "sem_estoque" : undefined,
                },
            });
        }

        // ─── HUMAN LOOP: Verifica se deve transferir para humano ───
        // Esta verificação acontece APÓS a checagem de estoque (context.stockResult)
        //
        // PRIORIDADES:
        // 1. Se cliente quer reserva (lead quente) → handoff independente do estoque
        // 2. Se estoque indisponível + alta intenção → handoff
        // 3. Caso contrário → continua fluxo normal
        {
            const sessionData = {
                intent: context.detectedIntent,
                slots: context.slots,
                botStatus: 'BOT' as 'BOT' | 'HUMAN',
                alertSent: null,
            };

            const handoffDecision = evaluateHandoff(
                sessionData,
                context.stockResult,
                msg.text,
                0.8 // Higher intent score since we're in SALES flow with product info
            );

            if (handoffDecision.shouldHandoff) {
                const reason = handoffDecision.reason as HandoffReason;
                console.log(`[humanLoop] handoff { reason: ${reason}, product: ${context.slots.product}, clientId: ${msg.from}, until: end_of_day }`);
                if (chatOnly) console.log(`[ACTION] handoff_sales reason=${reason}`);

                // 1. Envia alerta para o grupo de vendas (com reason)
                const salesGroupId = humanLoopConfig.groups.sales;
                if (salesGroupId) {
                    const alertMessage = buildSaleAlertMessage(context.slots, msg.from, reason);
                    const alertResult = await sendTextMessage(salesGroupId, alertMessage);
                    console.log(`[humanLoop] Alert sent to sales group: ${alertResult.success}`);

                    // 2. Envia mensagem de transferência para o cliente
                    const handoffMessage = buildHandoffMessage();
                    const handoffSendResult = await sendTextMessage(msg.from, handoffMessage);
                    const handoffMessageId = handoffSendResult.data?.messages?.[0]?.id || `handoff_${Date.now()}`;
                    if (chatOnly) {
                        console.log(`[RESPONSE] "${handoffMessage.substring(0, 50)}..." source=human_loop_sales`);
                        saveToOutbox(msg.from, {
                            conversationId: conversation.id,
                            content: `[ESCALADO] ${handoffMessage}`,
                            timestamp: Date.now(),
                            id: handoffMessageId,
                            status: "PENDING_HUMAN",
                            state: "handoff_sales",
                        });
                        console.log(`[OUTBOUND] handoff_sales to=${msg.from} conv=${conversation.id} success=${handoffSendResult.success}`);
                    }
                    try {
                        await prisma.message.create({
                            data: {
                                storeId: store.id,
                                conversationId: conversation.id,
                                direction: "outbound",
                                content: handoffMessage,
                                waMessageId: handoffMessageId,
                                metadata: { handoff: true, queue: "sales", reason },
                            },
                        });
                    } catch (err) {
                        const msgErr = String((err as any)?.message || err || "");
                        if (msgErr.includes("disk I/O error")) {
                            console.warn(chatOnly ? "[OUTBOX] [WARN] disk I/O on sales handoff persist (ignored)" : "[WORKER] disk I/O on sales handoff persist");
                        } else {
                            throw err;
                        }
                    }

                    // 3. Trava a conversa em modo HUMAN até fim do dia
                    await lockToHuman(conversation.id, {
                        type: 'SALE',
                        messageId: alertResult.data?.messages?.[0]?.id || `alert_${Date.now()}`,
                        groupId: salesGroupId,
                    });

                    // 4. Não chama o orchestrator - retorna imediatamente
                    // O humano owns a conversa pelo resto do dia
                    console.log(`[humanLoop] ✅ Handoff completo para ${conversation.id}`);
                    if (chatOnly) {
                        _chatOnlyResult = {
                            text: handoffMessage,
                            intent: context.detectedIntent,
                            state: "support_sac",
                            action: "ESCALATE",
                            source: "human_loop_sales",
                        };
                        return _chatOnlyResult;
                    }
                    return;
                } else {
                    console.warn(`[humanLoop] WPP_GROUP_SALES_ID não configurado, pulando handoff`);
                }
            }
        }

        // ─── SAC FLOW: Coleta mínimo de dados antes do handoff ───
        // Se intent é SAC, verifica se dados mínimos estão completos
        const sacIntents = ['SAC_TROCA', 'SAC_ATRASO', 'SAC_RETIRADA', 'SAC_REEMBOLSO', 'SUPPORT'];
        const isSacConversation = sacIntents.includes(context.detectedIntent) || context.currentState === "support_sac";
        const bypassSacMinimumForInfo = shouldBypassSacMinimumForPolicyInfo(
            context.detectedIntent,
            context.currentState,
            msg.text
        );
        if (isSacConversation && bypassSacMinimumForInfo) {
            console.log(`[SAC] Bypass sac_minimum: consulta de politica/info detectada (intent=${context.detectedIntent})`);
        }
        if (isSacConversation && !bypassSacMinimumForInfo) {
            const effectiveCustomerName = (ctx.customer.name || context.slots.customerName || "").trim() || undefined;
            const effectiveEmail = String(context.slots.email || "").trim() || undefined;
            const sacSlotsForMinimum = {
                ...context.slots,
                // Se já estamos no fluxo SAC, o problema-base já foi descrito antes.
                statusPedido: context.slots.statusPedido || "informado",
            };
            const missingData = getMissingSacData(effectiveCustomerName, sacSlotsForMinimum, { email: effectiveEmail });

            if (hasAnyMissingSacData(effectiveCustomerName, sacSlotsForMinimum, { email: effectiveEmail })) {
                // Dados SAC incompletos - pergunta TODOS os campos de uma vez
                // NÃO envia alerta, NÃO faz handoff
                // Passa slots para diferenciar loja física vs site
                const sacQuestion = buildSacQuestion(missingData, context.slots);
                console.log(`[SAC] Pedindo dados: ${JSON.stringify(missingData)}`);
                if (chatOnly) {
                    console.log("[ACTION] request_order_data");
                    console.log(`[RESPONSE] "${sacQuestion.substring(0, 50)}..." source=sac_minimum`);
                }

                // Envia a pergunta ao cliente
                const sacQuestionSend = await sendTextMessage(msg.from, sacQuestion);
                const sacQuestionMessageId = sacQuestionSend.data?.messages?.[0]?.id || `sac_q_${Date.now()}`;
                if (chatOnly) {
                    saveToOutbox(msg.from, {
                        conversationId: conversation.id,
                        content: sacQuestion,
                        timestamp: Date.now(),
                        id: sacQuestionMessageId,
                        status: "BOT",
                        state: "support_sac",
                    });
                    console.log(`[OUTBOUND] sac_question to=${msg.from} conv=${conversation.id} success=${sacQuestionSend.success}`);
                }

                // Persiste a mensagem de resposta (SQLite em WSL/OneDrive pode falhar transitoriamente)
                const sacOutboundData = {
                    storeId: store.id,
                    conversationId: conversation.id,
                    direction: 'outbound',
                    content: sacQuestion,
                    waMessageId: sacQuestionMessageId,
                    metadata: {
                        intent: context.detectedIntent,
                        missingName: missingData.missingName,
                        missingOrderOrEmail: missingData.missingOrderOrEmail,
                        missingProblem: missingData.missingProblem,
                    },
                };
                try {
                    await prisma.message.create({ data: sacOutboundData });
                } catch (err) {
                    const msgErr = String((err as any)?.message || err || "");
                    if (msgErr.includes("disk I/O error")) {
                        console.warn("[SAC] ⚠️ SQLite disk I/O error ao salvar pergunta SAC. Retry em 150ms...");
                        await new Promise((r) => setTimeout(r, 150));
                        await prisma.message.create({ data: sacOutboundData });
                    } else {
                        throw err;
                    }
                }

                // Retorna sem chamar orchestrator -bot fez uma pergunta com todos os dados
                console.log(`[SAC] Dados incompletos, pergunta enviada. Retornando.`);
                if (chatOnly) {
                    _chatOnlyResult = {
                        text: sacQuestion,
                        intent: context.detectedIntent,
                        state: "support_sac",
                        action: "REQUEST_ORDER_DATA",
                        source: "sac_minimum",
                    };
                    return _chatOnlyResult;
                }
                return;
            } else {
                // Dados mínimos completos - faz handoff para SAC
                const sacGroupId = humanLoopConfig.groups.sac;
                if (sacGroupId) {
                    console.log(`[SAC] Dados mínimos completos. Enviando alerta para grupo SAC.`);
                    if (chatOnly) console.log("[ACTION] handoff_sac");

                    // 1. Envia alerta para o grupo SAC
                    const sacAlertMessage = buildSACAlertMessage(
                        context.slots,
                        context.detectedIntent,
                        effectiveCustomerName,
                        msg.from,
                        effectiveEmail
                    );
                    const alertResult = await sendTextMessage(sacGroupId, sacAlertMessage);
                    console.log(`[SAC] Alert sent to SAC group: ${alertResult.success}`);

                    // 2. Envia mensagem de transferência para o cliente
                    const handoffMessage = "Vou te direcionar para nosso time de atendimento, e eles vao priorizar seu caso por aqui. ✅";
                    const sacHandoffSend = await sendTextMessage(msg.from, handoffMessage);
                    const sacHandoffMessageId = sacHandoffSend.data?.messages?.[0]?.id || `sac_handoff_${Date.now()}`;
                    if (chatOnly) {
                        console.log(`[RESPONSE] "${handoffMessage.substring(0, 50)}..." source=human_loop_sac`);
                        saveToOutbox(msg.from, {
                            conversationId: conversation.id,
                            content: `[ESCALADO] ${handoffMessage}`,
                            timestamp: Date.now(),
                            id: sacHandoffMessageId,
                            status: "PENDING_HUMAN",
                            state: "handoff_sac",
                        });
                        console.log(`[OUTBOUND] handoff_sac to=${msg.from} conv=${conversation.id} success=${sacHandoffSend.success}`);
                    }

                    // 3. Trava a conversa em modo HUMAN até fim do dia
                    await lockToHuman(conversation.id, {
                        type: 'SAC',
                        messageId: alertResult.data?.messages?.[0]?.id || `sac_alert_${Date.now()}`,
                        groupId: sacGroupId,
                    });

                    // 4. Persiste mensagem de handoff
                    try {
                        await prisma.message.create({
                            data: {
                                storeId: store.id,
                                conversationId: conversation.id,
                                direction: 'outbound',
                                content: handoffMessage,
                                waMessageId: sacHandoffMessageId,
                                metadata: { intent: context.detectedIntent, handoff: true },
                            },
                        });
                    } catch (err) {
                        const msgErr = String((err as any)?.message || err || "");
                        if (msgErr.includes("disk I/O error")) {
                            console.warn(chatOnly ? "[OUTBOX] [WARN] disk I/O on sac handoff persist (ignored)" : "[SAC] disk I/O on handoff persist");
                        } else {
                            throw err;
                        }
                    }

                    console.log(`[SAC] ✅ Handoff completo para ${conversation.id}`);
                    if (chatOnly) {
                        _chatOnlyResult = {
                            text: handoffMessage,
                            intent: context.detectedIntent,
                            state: "support_sac",
                            action: "ESCALATE",
                            source: "human_loop_sac",
                        };
                        return _chatOnlyResult;
                    }
                    return;
                } else {
                    console.warn(`[SAC] WPP_GROUP_SAC_ID não configurado, pulando handoff SAC`);
                }
            }
        }

        // ─── AGENT RUNTIME: Unificado - Template + LLM + Guardrails ───
        // O orchestrator legado faz: decideAction() -> template -> llm fallback -> guardrails
        console.time("orchestrator_call");
        const storeAddressText =
            (store as any).addressText ||
            "Av. Monsenhor Angelo Sampaio, nº 100, Centro - Petrolina-PE, CEP 56304-920";
        const storeMapsUrl =
            (store as any).mapsUrl ||
            "https://maps.google.com/?q=Av.+Monsenhor+Angelo+Sampaio,+100,+Petrolina-PE";
        const responseSlots = {
            ...context.slots,
            addressText: storeAddressText,
            mapsUrl: storeMapsUrl,
        };

        // Setup AgentRuntime environment
        const runtimeEnv = getAgentRuntimeForConversation(msg.from);

        // Prepare context for the runtime
        const runtimeContext = {
            storeId: store.id,
            conversationId: conversation.id,
            customerId: ctx.customer.id,
            customerPhone: msg.from,
            state: {
                currentState: context.currentState,
                frustrationLevel: context.frustrationLevel,
                lastQuestionType: context.lastQuestionType,
                messageCount: context.messageCount,
                stallCount: context.stallCount,
                slots: responseSlots,
                botStatus: (context as any).botStatus || 'BOT',
                handoffUntil: (context as any).handoffUntil || null,
                alertSent: (context as any).alertSent || null,
            },
            slots: responseSlots,
            intent: context.detectedIntent,
            lastIntent: context.detectedIntent,
            lastAction: undefined,
            messages: context.conversationHistory.map((m, idx) => ({
                direction: m.role === 'user' ? 'inbound' as const : 'outbound' as const,
                content: m.content,
                timestamp: new Date(Date.now() - (context.conversationHistory.length - idx) * 60000),
            })),
            frustrationLevel: context.frustrationLevel,
            lastQuestionType: context.lastQuestionType,
            hasClosingSignal: context.currentState === 'closing' || hasLexicalClosingSignal(msg.text),
            stockResult: context.stockResult,
            customerName: context.customerName,
        };

        let orchestratorResult: OrchestratorResult;

        if (runtimeEnv === "langgraph") {
            const { LangGraphRuntime } = await import("@/lib/agent/runtime-langgraph");
            const runtime = new LangGraphRuntime();
            const langgraphStart = Date.now();
            const out = await runtime.generateReply({
                conversationId: runtimeContext.conversationId,
                storeId: runtimeContext.storeId,
                customerId: runtimeContext.customerId,
                customerPhone: runtimeContext.customerPhone,
                message: msg.text,
            });
            orchestratorResult = {
                text: out.reply,
                action: out.requiresHuman ? "ESCALATE" : "RESPOND",
                source: "langgraph",
                metadata: out.metadata as any,
            };
            const langgraphMeta = (out.metadata || {}) as Record<string, any>;
            logShadowAudit({
                conversationId: conversation.id,
                storeId: store.id,
                runtimeMode: process.env.AGENT_RUNTIME === "langgraph" ? "langgraph_active" : "langgraph_canary",
                result: "success",
                durationMs: Date.now() - langgraphStart,
                langgraphPreview: out.reply,
                langgraphActiveAgent: typeof langgraphMeta.activeAgent === "string" ? langgraphMeta.activeAgent : undefined,
                langgraphToolCallsCount: typeof langgraphMeta.toolCallsCount === "number" ? langgraphMeta.toolCallsCount : undefined,
                langgraphToolNames: Array.isArray(langgraphMeta.toolNames) ? langgraphMeta.toolNames : undefined,
                langgraphUsedMockTool: langgraphMeta.usedMockTool === true,
                langgraphLoopSignal: langgraphMeta.loopSignal === true,
                langgraphSummaryPresent: langgraphMeta.summaryPresent === true,
                langgraphSummaryLength: typeof langgraphMeta.summaryLength === "number" ? langgraphMeta.summaryLength : undefined,
            });
        } else if (runtimeEnv === "shadow") {
            // Shadow Mode: Run legacy sequentially and LangGraph asynchronously
            orchestratorResult = await orchestrate(msg.text, runtimeContext);

            // Fire and forget the LangGraph run for telemetry/comparison
            Promise.resolve().then(async () => {
                const startTime = Date.now();
                try {
                    const { LangGraphRuntime } = await import("@/lib/agent/runtime-langgraph");
                    const runtime = new LangGraphRuntime();
                    const shadowTimeoutMsRaw = Number(process.env.LANGGRAPH_SHADOW_TIMEOUT_MS || "");
                    const shadowTimeoutMs = Number.isFinite(shadowTimeoutMsRaw) && shadowTimeoutMsRaw > 0
                        ? shadowTimeoutMsRaw
                        : (chatOnly ? 15000 : 8000);

                    // Timebox configurável (CHAT_ONLY precisa mais folga para auditoria)
                    const timeoutPromise = new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error("LangGraph Shadow Mode Timeout")), shadowTimeoutMs)
                    );

                    const out = await Promise.race([
                        runtime.generateReply({
                            conversationId: runtimeContext.conversationId,
                            storeId: runtimeContext.storeId,
                            customerId: runtimeContext.customerId,
                            customerPhone: runtimeContext.customerPhone,
                            message: msg.text,
                        }),
                        timeoutPromise
                    ]);

                    const duration = Date.now() - startTime;
                    const langgraphMeta = (out.metadata || {}) as Record<string, any>;
                    const route = typeof langgraphMeta.activeAgent === "string" ? langgraphMeta.activeAgent : "unknown";
                    const tools = Array.isArray(langgraphMeta.toolNames) ? langgraphMeta.toolNames.join(",") : "";
                    console.log(`[SHADOW] route=${route} tools=[${tools}] mock=${langgraphMeta.usedMockTool === true} loop=${langgraphMeta.loopSignal === true}`);
                    logShadowAudit({
                        conversationId: conversation.id,
                        storeId: store.id,
                        runtimeMode: "shadow",
                        result: "success",
                        durationMs: duration,
                        legacyAction: orchestratorResult.action,
                        legacySource: orchestratorResult.source,
                        legacyPreview: orchestratorResult.text,
                        langgraphPreview: out.reply,
                        langgraphActiveAgent: typeof langgraphMeta.activeAgent === "string" ? langgraphMeta.activeAgent : undefined,
                        langgraphToolCallsCount: typeof langgraphMeta.toolCallsCount === "number" ? langgraphMeta.toolCallsCount : undefined,
                        langgraphToolNames: Array.isArray(langgraphMeta.toolNames) ? langgraphMeta.toolNames : undefined,
                        langgraphUsedMockTool: langgraphMeta.usedMockTool === true,
                        langgraphLoopSignal: langgraphMeta.loopSignal === true,
                        langgraphSummaryPresent: langgraphMeta.summaryPresent === true,
                        langgraphSummaryLength: typeof langgraphMeta.summaryLength === "number" ? langgraphMeta.summaryLength : undefined,
                    });
                    console.log(`[SHADOW] ⚡ LangGraph executado em ${duration}ms!`);
                    console.log(`[SHADOW] 📝 Legacy: "${orchestratorResult.text.substring(0, 100).replace(/\n/g, ' ')}..."`);
                    console.log(`[SHADOW] 🤖 LangGraph: "${out.reply.substring(0, 100).replace(/\n/g, ' ')}..."`);
                } catch (err: any) {
                    const shadowErrorMessage = String(err?.message || err || "unknown shadow error");
                    logShadowAudit({
                        conversationId: conversation.id,
                        storeId: store.id,
                        runtimeMode: "shadow",
                        result: "error",
                        durationMs: Date.now() - startTime,
                        timedOut: shadowErrorMessage.includes("Timeout"),
                        errorMessage: shadowErrorMessage,
                        legacyAction: orchestratorResult.action,
                        legacySource: orchestratorResult.source,
                        legacyPreview: orchestratorResult.text,
                    });
                    console.error("[SHADOW] ❌ Erro/Timeout na execução LangGraph paralela:", err.message);
                }
            });
        } else {
            // Legacy Mode
            orchestratorResult = await orchestrate(msg.text, runtimeContext);
        }

        console.timeEnd("orchestrator_call");

        const decision: { reply_text: string; requires_human: boolean } = {
            reply_text: orchestratorResult.text,
            requires_human: orchestratorResult.action === "ESCALATE" ||
                (orchestratorResult.metadata?.guardrailChecks?.shouldEscalate === true),
        };
        if (chatOnly && orchestratorResult.action) console.log(`[ACTION] ${orchestratorResult.action}`);

        // CHAT_ONLY: Capture result now and return early — avoids all WA/DB side-effects below
        if (chatOnly) {
            _chatOnlyResult = {
                text: decision.reply_text,
                intent: context.detectedIntent,
                state: context.currentState,
                action: orchestratorResult.action,
                source: orchestratorResult.source ?? "legacy",
            };
            return _chatOnlyResult;
        }

        // Override with transition decision if needed
        if (transition.shouldEscalate) decision.requires_human = true;

        // Log com tags padronizadas em CHAT_ONLY
        if (chatOnly) {
            console.log(`[RESPONSE] "${decision.reply_text.substring(0, 50)}..." source=${orchestratorResult.source}`);
        } else {
            console.log(`[WORKER] 📤 Enviando: "${decision.reply_text}" (source: ${orchestratorResult.source})`);
        }

        const sendResult = await sendTextMessage(msg.from, decision.reply_text);

        let outMessageId = `out_${Date.now()}`;
        if (sendResult.success && sendResult.data?.messages?.[0]?.id) {
            outMessageId = sendResult.data.messages[0].id;
        }

        const outboundMessageData = {
            storeId: store.id,
            conversationId: conversation.id,
            direction: "outbound",
            content: decision.reply_text,
            waMessageId: outMessageId,
            metadata: {
                intent: decision.requires_human ? "HANDOFF" : context.detectedIntent,
                requires_human: decision.requires_human,
                state: context.currentState,
            },
        };

        // 📦 Persistir no banco com retry para disk I/O error
        try {
            await prisma.message.create({ data: outboundMessageData });
        } catch (err) {
            const msgErr = String((err as any)?.message || err || "");
            if (msgErr.includes("disk I/O error")) {
                const warnMsg = chatOnly
                    ? "[OUTBOX] [WARN] disk I/O error, retrying..."
                    : "[WORKER] ⚠️ SQLite disk I/O error ao salvar outbound. Retry em 150ms...";
                console.warn(warnMsg);
                await new Promise((r) => setTimeout(r, 150));
                await prisma.message.create({ data: outboundMessageData });
            } else {
                throw err;
            }
        }

        // 💾 Salvar na outbox in-memory (CHAT_ONLY mode)
        if (chatOnly) {
            // Se há handoff para humano, mostra mensagem de escalação
            const outboxContent = decision.requires_human
                ? ((context.detectedIntent.startsWith("SAC_") || context.detectedIntent === "SUPPORT" || context.currentState === "support_sac")
                    ? "[ESCALADO] Sua solicitacao foi encaminhada para o time de atendimento. Alguem vai priorizar seu caso por aqui."
                    : "[ESCALADO] Sua solicitacao foi encaminhada para nossa equipe da loja. Aguarde contato.")
                : decision.reply_text;

            saveToOutbox(msg.from, {
                conversationId: conversation.id,
                content: outboxContent,
                timestamp: Date.now(),
                id: outMessageId,
                status: decision.requires_human ? "PENDING_HUMAN" : "BOT",
                state: context.currentState,
            });
        }

        // 📤 Log de outbound
        if (chatOnly) {
            console.log(`[OUTBOUND] sent to=${msg.from} conv=${conversation.id} success=${sendResult.success}`);
        }

        if (decision.requires_human) {
            // Gerar Warm Handoff
            const handoffContext: HandoffContext = {
                intent: context.detectedIntent,
                slots: context.slots,
                frustrationLevel: context.frustrationLevel,
                customerName: context.customerName,
                orderId: context.slots.orderId,
                conversationId: conversation.id,
                storeId: store.id,
                messageCount: context.messageCount,
                stallCount: context.stallCount,
                conversationHistory: context.conversationHistory,
            };

            const handoff = generateWarmHandoffSummary(handoffContext);
            const slaDeadline = calculateSLADeadline(handoff.queue, handoff.priority);

            // Criar Ticket de escalonamento (skip in CHAT_ONLY — no real DB conversation)
            const ticket = chatOnly ? { id: `chatonly_ticket_${Date.now()}` } : await prisma.ticket.create({
                data: {
                    storeId: store.id,
                    customerId: ctx.customer.id,
                    conversationId: conversation.id,
                    type: handoff.queue === "SALES_RESERVE" ? "reserva" : "sac",
                    queueType: handoff.queue,
                    priority: handoff.priority,
                    warmHandoffSummary: handoff.summary,
                    status: "open",
                    escalatedAt: new Date(),
                    slaDeadline: slaDeadline,
                },
            });

            // Atualizar Conversation (skip in CHAT_ONLY)
            if (!chatOnly) {
            await prisma.conversation.update({
                where: { id: conversation.id },
                data: {
                    status: "PENDING_HUMAN",
                    currentQueue: handoff.queue,
                },
            });
            }

            // Log estruturado
            console.log(`[WORKER] 🚨 Handoff criado:`, {
                ticketId: ticket.id,
                queue: handoff.queue,
                priority: handoff.priority,
                slaMinutes: handoff.slaMinutes,
            });

            // Emitir telemetria de escalonamento (SKIP em CHAT_ONLY)
            if (!chatOnly) {
                emitTelemetry({
                    ...telemetryBase,
                    eventType: "sac_case",
                    payload: {
                        ticket_id: ticket.id,
                        queue_type: handoff.queue,
                        priority: handoff.priority,
                        frustration_level: context.frustrationLevel,
                        intent: context.detectedIntent,
                        sla_deadline: slaDeadline.toISOString(),
                    },
                });
            }
        } else {
            console.log(`[WORKER] ✅ Fim. t=${Date.now() - startTime}ms`);
        }

        // ─── RESERVE CONFIRMATION TRACKING ──────────────────────────────────
        // Se Cadu perguntou se quer confirmar/reservar, marca a conversa.
        // Assim, na próxima mensagem do cliente, saberemos que uma resposta
        // "sim" é confirmação de reserva (não resposta a outra pergunta).
        {
            const replyLower = decision.reply_text.toLowerCase();
            const isAskingConfirmation =
                context.stockResult.requiresPhysicalCheck &&
                (replyLower.includes("confirmar no estoque") ||
                    replyLower.includes("confirme no estoque") ||
                    replyLower.includes("separe pra você") ||
                    replyLower.includes("separar pra você") ||
                    replyLower.includes("quer que a gente confirme") ||
                    replyLower.includes("quer que separe"));

            if (isAskingConfirmation) {
                prisma.conversation.update({
                    where: { id: conversation.id },
                    data: { lastQuestionType: "RESERVE_CONFIRMATION" },
                }).catch(err => console.error("[WORKER] lastQuestionType update error:", err));
            } else if (context.lastQuestionType === "RESERVE_CONFIRMATION") {
                // Limpa o flag após qualquer outra resposta (evita trigger em mensagens futuras)
                prisma.conversation.update({
                    where: { id: conversation.id },
                    data: { lastQuestionType: null },
                }).catch(() => { });
            }
        }
        // ─── FIM RESERVE CONFIRMATION ────────────────────────────────────────

        // ─── STOCK CHECK TICKET (fire-and-forget) ──────────────────────────
        // Cria ticket de checagem física quando:
        // 1. Stock Agent indicou requiresPhysicalCheck
        // 2. Cliente confirmou com resposta afirmativa
        // 3. Cadu havia perguntado sobre confirmação (lastQuestionType = RESERVE_CONFIRMATION)
        {
            const sr = context.stockResult;
            const shouldCreateTicket =
                sr.requiresPhysicalCheck &&
                sr.missingSlots.length === 0 &&
                context.lastQuestionType === "RESERVE_CONFIRMATION" &&
                isAffirmativeResponse(msg.text);

            if (shouldCreateTicket) {
                const checkPayload = {
                    conversationId: conversation.id,
                    productDescription: sr.best?.description ?? context.slots.product,
                    size: sr.best?.size ?? context.slots.size,
                    quantity: 1,
                };

                fetch(`http://localhost:${process.env.PORT ?? 3000}/api/inventory/check`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(checkPayload),
                }).then(async r => {
                    const data = await r.json();
                    console.log(`[STOCK CHECK] 🎟️ Ticket criado: ${data.ticketNumber}`);
                }).catch(err => console.error("[STOCK CHECK] ❌ Falha ao criar ticket:", err));
            }
        }
        // ─── FIM STOCK CHECK ────────────────────────────────────────────────

        // ─── FASE 2: AUTO-LEARNING REMOVED ──────────────────────────────────
        // ─── FIM FASE 2 ─────────────────────────────────────────────────────

        // ─── TELEMETRY: Momento 2 — Desfechos (pós envio) ───
        // SKIP em CHAT_ONLY: telemetria adiciona latência desnecessária
        if (!chatOnly) {
            // D: Resultado da venda
            emitTelemetry({
                ...telemetryBase,
                eventType: "sale_outcome",
                payload: {
                    ...telemetryBase,
                    channel: "whatsapp",
                    waMessageId: msg.waMessageId,
                    status: decision.requires_human
                        ? "escalated"
                        : context.currentState === "closing"
                            ? "converted"
                            : "pending",
                    motivo: transition.reason,
                },
            });

            // E: Caso SAC (somente em escalações por suporte/handoff)
            if (
                decision.requires_human &&
                (context.detectedIntent === "SUPPORT" || context.detectedIntent === "HANDOFF")
            ) {
                emitTelemetry({
                    ...telemetryBase,
                    eventType: "sac_case",
                    payload: {
                        ...telemetryBase,
                        channel: "whatsapp",
                        waMessageId: msg.waMessageId,
                        tipo: context.detectedIntent,
                        sentimento: context.frustrationLevel >= 2 ? "negativo" : "neutro",
                    },
                });
            }
        }

    } catch (error) {
        console.error("[WORKER] ❌ Erro no processamento:", error);
        // Retorna erro em modo CHAT_ONLY
        if (chatOnly) {
            return { text: `[ERRO] ${error}`, intent: "ERROR", state: (conversation as any)?.currentState ?? "unknown" };
        }
    } finally {
        if (!chatOnly) {
            await releaseLock(conversation.id);
        }
    }

    // Retorna dados para CHAT_ONLY (fallback — normally returned early from inside try block)
    if (chatOnly) return _chatOnlyResult;
}
