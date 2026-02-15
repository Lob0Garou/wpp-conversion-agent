import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWebhookSignature, extractMessage } from "@/lib/webhook";
import { sendTextMessage } from "@/lib/whatsapp";
import { analyzeMessage } from "@/lib/engine";

// ─── GET: Verificação do Webhook (Meta) ───

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;

    const mode = searchParams.get("hub.mode");
    const token = searchParams.get("hub.verify_token");
    const challenge = searchParams.get("hub.challenge");

    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

    if (mode === "subscribe" && token === verifyToken) {
        console.log("[WEBHOOK] ✅ Verificação bem-sucedida");
        return new NextResponse(challenge, { status: 200 });
    }

    console.warn("[WEBHOOK] ❌ Verificação falhou", { mode, token });
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// ─── POST: Receber mensagens do WhatsApp ───

export async function POST(request: NextRequest) {
    // 1. Ler body como texto (necessário para validar assinatura)
    const rawBody = await request.text();

    // 2. Validar assinatura Meta (X-Hub-Signature-256)
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (appSecret) {
        const signature = request.headers.get("x-hub-signature-256");
        if (!verifyWebhookSignature(rawBody, signature, appSecret)) {
            console.warn("[WEBHOOK] ❌ Assinatura inválida");
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
    }

    // 3. Parsear payload
    let body: unknown;
    try {
        body = JSON.parse(rawBody);
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    console.log("[WEBHOOK] 📩 Payload recebido (reduzido):");
    console.log(`[WEBHOOK] JSON: ${JSON.stringify(body).substring(0, 200)}...`);

    // 4. Extrair dados da mensagem
    const msg = extractMessage(body);
    if (!msg) {
        // Não é uma mensagem (pode ser status update, etc.) — retorna 200
        return NextResponse.json({ status: "ignored" }, { status: 200 });
    }

    try {
        // 5. Resolver store pelo phone_number_id (Isolamento Absoluto)
        const store = await prisma.store.findUnique({
            where: { phoneNumberId: msg.phoneNumberId },
        });

        if (!store) {
            console.warn(
                `[WEBHOOK] ❌ Store não encontrada para phone_number_id: ${msg.phoneNumberId}`
            );
            return NextResponse.json({ status: "received" }, { status: 200 });
        }

        // 6. Idempotência: verificar se mensagem já existe
        const existing = await prisma.message.findUnique({
            where: {
                storeId_waMessageId: {
                    storeId: store.id,
                    waMessageId: msg.waMessageId,
                },
            },
        });

        if (existing) {
            console.log(`[WEBHOOK] ⏭️ Mensagem duplicada ignorada: ${msg.waMessageId}`);
            return NextResponse.json({ status: "duplicate" }, { status: 200 });
        }

        // 7. Criar/encontrar customer
        const customer = await prisma.customer.upsert({
            where: {
                storeId_phone: {
                    storeId: store.id,
                    phone: msg.from,
                },
            },
            update: {},
            create: {
                storeId: store.id,
                phone: msg.from,
            },
        });

        // 8. Encontrar conversa aberta ou criar nova
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

        // 9. Salvar mensagem inbound
        await prisma.message.create({
            data: {
                storeId: store.id,
                conversationId: conversation.id,
                direction: "inbound",
                content: msg.text,
                waMessageId: msg.waMessageId,
            },
        });

        console.log(
            `[WEBHOOK] ✅ Mensagem salva | store=${store.name} | from=${msg.from} | text="${msg.text}"`
        );

        // 10. Engine de Decisão
        const analysis = analyzeMessage(msg.text);

        console.log(`[ENGINE] 🧠 Análise completa:`);
        console.log(`[ENGINE]   - Intent: ${analysis.intent}`);
        console.log(`[ENGINE]   - Risk: ${analysis.risk}`);
        console.log(`[ENGINE]   - Action: ${analysis.action}`);
        console.log(`[ENGINE]   - Reply: "${analysis.replyText}"`);
        if (analysis.matched?.length) {
            console.log(`[ENGINE]   - Matched keywords: ${analysis.matched.join(", ")}`);
        }

        // 11. Verificar Estado da Conversa (Handoff)
        if (conversation.status === "PENDING_HUMAN") {
            // Se já está aguardando humano, NÃO responder automaticamente
            console.log(`[ENGINE] 🔇 Auto-reply ignorado (Status: PENDING_HUMAN)`);

            await prisma.auditLog.create({
                data: {
                    storeId: store.id,
                    event: "IGNORED_AUTOREPLY_PENDING_HUMAN",
                    action: "IGNORE",
                    metadata: {
                        conversationId: conversation.id,
                        inboundText: msg.text
                    }
                }
            });
            // Apenas retorna 200, pois a msg inbound já foi salva
            return NextResponse.json({ status: "received" }, { status: 200 });
        }

        // 12. Executar Ação da Engine
        if (analysis.action === "handoff") {
            // Atualizar status para PENDING_HUMAN
            await prisma.conversation.update({
                where: { id: conversation.id },
                data: { status: "PENDING_HUMAN" }
            });

            // Log de Handoff
            await prisma.auditLog.create({
                data: {
                    storeId: store.id,
                    event: "HANDOFF_TRIGGERED",
                    intent: analysis.intent,
                    risk: analysis.risk,
                    action: "HANDOFF",
                    metadata: {
                        conversationId: conversation.id,
                        reason: analysis.matched || "rule_matched"
                    }
                }
            });
        }

        // 13. Enviar Resposta (se não foi ignorada)
        console.log(`[WEBHOOK] 📤 Enviando auto-reply...`);
        const sendResult = await sendTextMessage(msg.from, analysis.replyText);

        if (sendResult.success) {
            const outWaMessageId =
                sendResult.data?.messages?.[0]?.id ?? `out_${crypto.randomUUID()}`;

            // 14. Persistir mensagem outbound com Metadata da Engine
            await prisma.message.create({
                data: {
                    storeId: store.id,
                    conversationId: conversation.id,
                    direction: "outbound",
                    content: analysis.replyText,
                    waMessageId: outWaMessageId,
                    metadata: {
                        engineIntent: analysis.intent,
                        engineRisk: analysis.risk,
                        engineAction: analysis.action
                    }
                },
            });

            console.log(`[WEBHOOK] ✅ Ciclo completo:`);
            console.log(`[WEBHOOK]   - RECEBIDO: "${msg.text}"`);
            console.log(`[WEBHOOK]   - RESPONDIDO: "${analysis.replyText}"`);
            console.log(`[WEBHOOK]   - SALVO: intent=${analysis.intent} | risk=${analysis.risk}`);
            console.log(`[WEBHOOK]   - Message ID: ${outWaMessageId}`);
        } else {
            console.error(
                "[WEBHOOK] ❌ Erro ao enviar resposta:",
                sendResult.error
            );
            await prisma.auditLog.create({
                data: {
                    storeId: store.id,
                    event: "SEND_ERROR",
                    action: "REPLY_FAILED",
                    metadata: {
                        to: msg.from,
                        error: sendResult.error,
                        conversationId: conversation.id,
                    },
                },
            });
        }

        return NextResponse.json({ status: "received" }, { status: 200 });
    } catch (error) {
        console.error("[WEBHOOK] Erro ao processar mensagem:", error);
        return NextResponse.json({ status: "error" }, { status: 200 });
    }
}
