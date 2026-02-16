import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWebhookSignature, extractMessage } from "@/lib/webhook";
import { sendTextMessage } from "@/lib/whatsapp";
import { analyzeMessage } from "@/lib/engine";

// Validar ambiente ao iniciar
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
    console.warn(`[WEBHOOK]   - Esperado: ${verifyToken}`);
    console.warn(`[WEBHOOK]   - Recebido: ${token}`);

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

    // Log detalhado para debug
    console.log("[WEBHOOK] 📥 POST recebido (Raw Body size):", rawBody.length);

    if (appSecret) {
        const signature = request.headers.get("x-hub-signature-256");
        if (!verifyWebhookSignature(rawBody, signature, appSecret)) {
            console.warn("[WEBHOOK] ❌ Assinatura inválida (X-Hub-Signature-256)");
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
    }

    // 2. Parsear e LOGAR
    let body: any;
    try {
        body = JSON.parse(rawBody);
        console.log("[WEBHOOK] 📦 Payload JSON:", JSON.stringify(body, null, 2));
    } catch (e) {
        console.error("[WEBHOOK] ❌ JSON inválido");
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    // 3. Retornar 200 IMEDIATAMENTE (requisito Meta)
    // Processamento acontece em background (fire-and-forget para Node.js local)
    processPayload(body).catch(err => {
        console.error("[WEBHOOK] ❌ Erro no processamento assíncrono:", err);
    });

    return NextResponse.json({ status: "received" }, { status: 200 });
}

// ─── Processamento Assíncrono ───
async function processPayload(body: any) {
    const value = body.entry?.[0]?.changes?.[0]?.value;

    // Log de Status (Entregue, Lido, Falhou)
    if (value?.statuses) {
        const statuses = value.statuses;
        console.log(`[WEBHOOK] 📶 Status Update: ${JSON.stringify(statuses)}`);
        console.log("[WEBHOOK] 📶 Status Update:", JSON.stringify(statuses, null, 2));

        // Se falhou, logar erro
        if (statuses[0]?.status === 'failed') {
            console.log(`[WEBHOOK] ❌ Mensagem falhou! Erro: ${JSON.stringify(statuses[0].errors)}`);
        }
        return;
    }

    const msg = extractMessage(body);
    if (!msg) {
        console.log("[WEBHOOK] ℹ️ Evento ignorado (não é mensagem de texto ou status relevando)");
        console.log("[WEBHOOK] ℹ️ Evento ignorado (não é mensagem de texto)");
        return;
    }

    console.log(`[WEBHOOK] 📥 Mensagem recebida de ${msg.from}: ${msg.text}`);
    /* 
    Isolamento de Erros: 
    Todo o bloco lógico original agora roda aqui dentro.
    */
    try {
        // Resolver store
        const store = await prisma.store.findUnique({
            where: { phoneNumberId: msg.phoneNumberId },
        });

        if (!store) {
            console.warn(`[WEBHOOK] ❌ Store não encontrada para ID: ${msg.phoneNumberId}`);
            return;
        }

        // Idempotência
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

        // Criar/Atualizar Customer
        const customer = await prisma.customer.upsert({
            where: {
                storeId_phone: { storeId: store.id, phone: msg.from },
            },
            create: { storeId: store.id, phone: msg.from },
            update: {},
        });

        // Conversa
        let conversation = await prisma.conversation.findFirst({
            where: {
                storeId: store.id,
                customerId: customer.id,
                status: "open",
            },
        });

        if (!conversation) {
            conversation = await prisma.conversation.create({
                data: {
                    storeId: store.id,
                    customerId: customer.id,
                    status: "open",
                },
            });
        }

        // Salvar Inbound
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

        // Engine
        const analysis = analyzeMessage(msg.text);

        if (conversation.status === "PENDING_HUMAN") {
            console.log(`[WEBHOOK] 🔇 Ignorando auto-reply (Humano pendente)`);
            return;
        }

        if (analysis.action === "handoff") {
            await prisma.conversation.update({
                where: { id: conversation.id },
                data: { status: "PENDING_HUMAN" },
            });
            await prisma.auditLog.create({
                data: {
                    storeId: store.id,
                    event: "HANDOFF",
                    action: "HANDOFF",
                    metadata: { reason: analysis.matched },
                }
            });
        }

        // Enviar Auto-Reply
        console.log(`[WEBHOOK] 📤 Enviando resposta: "${analysis.replyText}"`);
        const sendResult = await sendTextMessage(msg.from, analysis.replyText);

        if (sendResult.success) {
            const outId = sendResult.data?.messages?.[0]?.id ?? `out_${Date.now()}`;
            await prisma.message.create({
                data: {
                    storeId: store.id,
                    conversationId: conversation.id,
                    direction: "outbound",
                    content: analysis.replyText,
                    waMessageId: outId,
                    metadata: {
                        intent: analysis.intent,
                        risk: analysis.risk
                    }
                }
            });
            console.log(`[WEBHOOK] ✅ Resposta enviada e salva (ID: ${outId})`);
        } else {
            console.error(`[WEBHOOK] ❌ Falha no envio: ${sendResult.error}`);
        }

    } catch (error) {
        console.error("[WEBHOOK] ❌ Erro Crítico no processamento:", error);
    }
}
