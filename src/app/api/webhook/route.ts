import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWebhookSignature, extractMessage } from "@/lib/webhook";
import { sendTextMessage } from "@/lib/whatsapp";
import { generateAIResponse } from "@/lib/ai";
import { buildContext } from "@/lib/context-builder";
import { composeSystemPrompt } from "@/lib/prompt-system";
import { validateResponse } from "@/lib/guardrails";
import { determineNextState } from "@/lib/state-transitions";
import { detectFrustration } from "@/lib/intent-classifier";
import {
    updateSlots,
    transitionTo,
    incrementStall,
    resetStall,
    incrementFrustration,
    incrementMessageCount,
} from "@/lib/state-manager";

// ─── Module-level debug logging ───
import * as fs from "fs";

function debugLog(msg: string) {
    try {
        fs.appendFileSync("webhook.log", `[${new Date().toISOString()}] ${msg}\n`);
    } catch {
        // Silently ignore file write errors in production
    }
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
    // 1. Ler e validar assinatura
    const rawBody = await request.text();
    const appSecret = process.env.WHATSAPP_APP_SECRET;

    console.log("[WEBHOOK] 📥 POST recebido (Raw Body size):", rawBody.length);

    if (appSecret) {
        const signature = request.headers.get("x-hub-signature-256");
        if (!verifyWebhookSignature(rawBody, signature, appSecret)) {
            console.warn("[WEBHOOK] ❌ Assinatura inválida (X-Hub-Signature-256)");
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
    }

    // 2. Parsear JSON
    let body: any;
    try {
        body = JSON.parse(rawBody);
    } catch (e) {
        console.error("[WEBHOOK] ❌ JSON inválido");
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    // 3. Retornar 200 IMEDIATAMENTE (requisito Meta)
    processPayload(body).catch(err => {
        console.error("[WEBHOOK] ❌ Erro no processamento assíncrono:", err);
    });

    return NextResponse.json({ status: "received" }, { status: 200 });
}

// ─── Processamento Assíncrono com State Machine ───
async function processPayload(body: any) {
    const value = body.entry?.[0]?.changes?.[0]?.value;

    // Log de Status Updates (Entregue, Lido, Falhou)
    if (value?.statuses) {
        const statuses = value.statuses;
        console.log(`[WEBHOOK] 📶 Status Update: ${JSON.stringify(statuses)}`);
        if (statuses[0]?.status === "failed") {
            console.log(`[WEBHOOK] ❌ Mensagem falhou! Erro: ${JSON.stringify(statuses[0].errors)}`);
        }
        return;
    }

    const msg = extractMessage(body);
    if (!msg) {
        console.log("[WEBHOOK] ℹ️ Evento ignorado (não é mensagem de texto)");
        return;
    }

    debugLog(`WEBHOOK MSG RCVD: ${JSON.stringify(msg)}`);
    console.log(`[WEBHOOK] 📥 Mensagem recebida de ${msg.from}: "${msg.text}"`);

    try {
        // ─── STEP 1: Resolve Store (Multi-tenant) ───
        const store = await prisma.store.findUnique({
            where: { phoneNumberId: msg.phoneNumberId },
        });

        debugLog(`Store lookup for ${msg.phoneNumberId}: ${store ? "FOUND" : "NOT FOUND"}`);

        if (!store) {
            console.warn(`[WEBHOOK] ❌ Store não encontrada para ID: ${msg.phoneNumberId}`);
            debugLog("Store not found. Aborting.");
            return;
        }

        // ─── STEP 2: Idempotency Check ───
        const existing = await prisma.message.findUnique({
            where: {
                storeId_waMessageId: {
                    storeId: store.id,
                    waMessageId: msg.waMessageId,
                },
            },
        });

        if (existing) {
            console.log(`[WEBHOOK] ⏭️ Mensagem duplicada: ${msg.waMessageId}`);
            return;
        }

        // ─── STEP 3: Upsert Customer ───
        const customer = await prisma.customer.upsert({
            where: {
                storeId_phone: { storeId: store.id, phone: msg.from },
            },
            create: { storeId: store.id, phone: msg.from },
            update: {},
        });

        // ─── STEP 4: Find/Create Conversation ───
        console.log(`[WEBHOOK] 🔍 Buscando conversa para Customer ID: ${customer.id}`);
        let conversation = await prisma.conversation.findFirst({
            where: {
                storeId: store.id,
                customerId: customer.id,
                status: { in: ["open", "PENDING_HUMAN"] },
            },
        });
        console.log(`[WEBHOOK] 🔍 Resultado busca conversa: ${conversation ? conversation.id : "Nova conversa"}`);
        debugLog(`Conversation: ${conversation ? "FOUND" : "CREATING NEW"}`);

        if (!conversation) {
            conversation = await prisma.conversation.create({
                data: {
                    storeId: store.id,
                    customerId: customer.id,
                    status: "open",
                    currentState: "greeting",
                    slots: {},
                    messageCount: 0,
                    stallCount: 0,
                    frustrationLevel: 0,
                },
            });
            debugLog(`New conversation created: ${conversation.id}`);
        }

        // ─── STEP 5: Save Inbound Message ───
        await prisma.message.create({
            data: {
                storeId: store.id,
                conversationId: conversation.id,
                direction: "inbound",
                content: msg.text,
                waMessageId: msg.waMessageId,
            },
        });

        console.log(`[WEBHOOK] ✅ Mensagem salva: "${msg.text}" de ${msg.from}`);
        debugLog(`Message saved: ${msg.text}`);
        debugLog(`Current Status: ${conversation.status}`);

        // ─── STEP 6: Skip if pending human ───
        if (conversation.status === "PENDING_HUMAN") {
            console.log(`[WEBHOOK] 🔇 Ignorando auto-reply (Humano pendente)`);
            return;
        }
        debugLog("Step 6 passed (Not pending human)");

        // ─── STEP 7: Increment message count ───
        await incrementMessageCount(conversation.id);
        debugLog("Step 7 passed (Msg count inc)");

        // ─── STEP 8: Build full context (includes conversation history) ───
        const context = await buildContext({
            conversationId: conversation.id,
            userMessage: msg.text,
            storeId: store.id,
            storeName: store.name || "Nossa Loja",
        });
        debugLog("Step 8 passed (Context built)");

        // ─── STEP 9: Detect frustration (uses context history) ───
        if (detectFrustration(msg.text, context.conversationHistory)) {
            const frustLevel = await incrementFrustration(conversation.id);
            console.log(`[WEBHOOK] 😤 Frustração detectada (nível ${frustLevel})`);
        }
        debugLog("Step 9 passed (Frustration check)");

        // ─── STEP 10: Check state transition ───
        const transition = determineNextState(
            context.currentState,
            context.slots,
            context.detectedIntent,
            context.stallCount,
            context.frustrationLevel,
            context.messageCount
        );

        if (transition.nextState) {
            await transitionTo(
                conversation.id,
                transition.nextState,
                transition.reason,
                store.id
            );
            context.currentState = transition.nextState;
        }
        debugLog("Step 10 passed (State transition)");

        // ─── STEP 11: Update slots if new data extracted ───
        if (context.slotExtraction.hasNewData) {
            await updateSlots(conversation.id, context.slotExtraction.extracted);
            await resetStall(conversation.id);
            console.log(`[WEBHOOK] 📋 Slots atualizados:`, context.slotExtraction.extracted);
        } else {
            const stallCount = await incrementStall(conversation.id);
            if (stallCount >= 3) {
                console.log(`[WEBHOOK] ⚠️ Conversa estagnada (${stallCount} stalls)`);
            }
        }
        debugLog("Step 11 passed (Slot update)");

        // ─── STEP 12: Compose prompt + Call LLM ───
        const systemPrompt = composeSystemPrompt(context);

        console.log(`[WEBHOOK] 🧠 Chamando IA (estado: ${context.currentState}, intent: ${context.detectedIntent})`);
        debugLog(`Step 12 Start. API Key present: ${process.env.OPENROUTER_API_KEY ? "YES" : "NO"}`);

        let decision = await generateAIResponse(
            systemPrompt,
            msg.text,
            context.conversationHistory
        );
        debugLog(`Step 12 End. Decision: ${JSON.stringify(decision)}`);

        console.log("[WEBHOOK] 🧠 Decisão:", JSON.stringify(decision, null, 2));

        // ─── STEP 13: Guardrails validation ───
        const validation = validateResponse(decision, {
            currentState: context.currentState,
            slots: context.slots,
            conversationHistory: context.conversationHistory,
            availableProducts: context.availableProducts,
            frustrationLevel: context.frustrationLevel,
        });

        if (!validation.approved) {
            console.log(`[GUARDRAILS] ❌ Resposta rejeitada: ${validation.reason}`);
            if (validation.shouldEscalate) {
                decision.requires_human = true;
                decision.intent = "HANDOFF";
            }
            if (validation.modifiedReply) {
                decision.reply_text = validation.modifiedReply;
            }
        }

        // ─── STEP 14: Handle forced escalation ───
        if (transition.shouldEscalate) {
            decision.requires_human = true;
            decision.intent = "HANDOFF";
            if (!decision.reply_text.includes("equipe") && !decision.reply_text.includes("transferir")) {
                decision.reply_text = "Vou te passar para a equipe resolver isso agora. Só um momento.";
            }
        }

        // ─── STEP 15: Send response ───
        console.log(`[WEBHOOK] 📤 Enviando resposta para ${msg.from}: "${decision.reply_text}"`);
        const sendResult = await sendTextMessage(msg.from, decision.reply_text);
        console.log(`[WEBHOOK] 📤 Resultado envio: success=${sendResult.success}, http=${sendResult.httpStatus}, error=${sendResult.error}`);
        let outMessageId = `out_${Date.now()}`;

        if (sendResult.success && sendResult.data?.messages?.[0]?.id) {
            outMessageId = sendResult.data.messages[0].id;
        }

        // ─── STEP 16: Save outbound message ───
        await prisma.message.create({
            data: {
                storeId: store.id,
                conversationId: conversation.id,
                direction: "outbound",
                content: decision.reply_text,
                waMessageId: outMessageId,
                metadata: {
                    intent: decision.intent,
                    requires_human: decision.requires_human,
                    engine: "cadu-v2-state-driven",
                    state: context.currentState,
                    slots: context.slots,
                },
            },
        });

        // ─── STEP 17: Execute action ───
        if (decision.requires_human) {
            console.log("[WEBHOOK] 🚨 Handoff acionado");
            await prisma.conversation.update({
                where: { id: conversation.id },
                data: { status: "PENDING_HUMAN" },
            });
        } else {
            console.log(`[WEBHOOK] ✅ Resposta enviada (estado: ${context.currentState})`);
        }

    } catch (error: any) {
        console.error("[WEBHOOK] ❌ Erro Crítico no processamento:", error);
        debugLog(`[ERROR] Critical error: ${error?.message || error}`);
    }
}
