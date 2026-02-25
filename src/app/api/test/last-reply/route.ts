import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isChatOnlyMode, shouldUseOutbox } from "@/lib/chat-mode";
import { getLastReply } from "@/lib/chat-outbox";

export const dynamic = "force-dynamic";

// GET /api/test/last-reply?phone=5585...
// Endpoint leve para o simulador de terminal buscar a última resposta outbound do bot.
//
// Em CHAT_ONLY mode:
// 1. Primeiro tenta ler da outbox in-memory (rápido)
// 2. Fallback para banco de dados se não encontrar
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const phone = searchParams.get("phone")?.trim();

        if (!phone) {
            return NextResponse.json({ error: "phone é obrigatório" }, { status: 400 });
        }

        const chatOnlyMode = isChatOnlyMode();

        // 🔥 FAST PATH: Tenta ler da outbox in-memory primeiro em CHAT_ONLY
        if (chatOnlyMode && shouldUseOutbox()) {
            const outboxEntry = getLastReply(phone);
            if (outboxEntry) {
                let conversationSnapshot = {
                    id: outboxEntry.conversationId,
                    status: outboxEntry.status || "open",
                    botStatus: outboxEntry.status === "HUMAN" ? "HUMAN" : (outboxEntry.status === "PENDING_HUMAN" ? "HUMAN" : "BOT"),
                    currentState: outboxEntry.state || "unknown",
                };

                // Evita timeout por outbox stale: se a conversa já estiver em HUMAN/PENDING_HUMAN no banco,
                // prioriza esse status mesmo que a última outbox ainda seja BOT.
                if (outboxEntry.status !== "HUMAN" && outboxEntry.status !== "PENDING_HUMAN") {
                    try {
                        const latestConv = await prisma.conversation.findFirst({
                            where: { customer: { phone } },
                            select: { id: true, status: true, botStatus: true, currentState: true, startedAt: true },
                            orderBy: { startedAt: "desc" },
                        });
                        if (latestConv && (latestConv.status === "PENDING_HUMAN" || latestConv.botStatus === "HUMAN")) {
                            conversationSnapshot = {
                                id: latestConv.id,
                                status: latestConv.status,
                                botStatus: latestConv.botStatus || "HUMAN",
                                currentState: latestConv.currentState || "unknown",
                            };
                            console.log(`[OUTBOX] status_override phone=${phone} conv=${latestConv.id} status=${latestConv.status} bot=${latestConv.botStatus}`);
                        }
                    } catch (statusErr) {
                        console.warn("[OUTBOX] [WARN] status_override_failed", String((statusErr as any)?.message || statusErr || "").substring(0, 120));
                    }
                }

                // Mapear status: PENDING_HUMAN ou HUMAN -> mostra como human pending no terminal
                return NextResponse.json({
                    found: true,
                    conversation: conversationSnapshot,
                    reply: {
                        id: outboxEntry.id,
                        conversationId: outboxEntry.conversationId,
                        content: outboxEntry.content,
                        timestamp: new Date(outboxEntry.timestamp),
                    },
                    source: "outbox",
                });
            }
        }

        // 📦 FALLBACK: Ler do banco de dados
        const convs = await prisma.conversation.findMany({
            where: {
                customer: { phone },
            },
            select: {
                id: true,
                startedAt: true,
                status: true,
                botStatus: true,
                currentState: true,
            },
            orderBy: { startedAt: "desc" },
            take: 10,
        });

        if (convs.length === 0) {
            return NextResponse.json({
                found: false,
                reason: "conversation_not_found",
                conversation: null,
            });
        }

        const latestOutbound = await prisma.message.findFirst({
            where: {
                conversationId: { in: convs.map((c) => c.id) },
                direction: "outbound",
            },
            orderBy: { timestamp: "desc" },
            select: {
                id: true,
                conversationId: true,
                content: true,
                timestamp: true,
            },
        });

        if (!latestOutbound) {
            return NextResponse.json({
                found: false,
                reason: "no_outbound_message",
                conversation: convs[0],
            });
        }

        return NextResponse.json({
            found: true,
            conversation: convs[0],
            reply: latestOutbound,
            source: "db",
        });
    } catch (error) {
        const errMsg = String(error?.message || error || "");
        const isChatOnly = isChatOnlyMode();

        // Em CHAT_ONLY, retorna diagnóstico claro em vez de "Erro interno"
        if (isChatOnly && (errMsg.includes("does not exist") || errMsg.includes("P2022"))) {
            console.error("[OUTBOX] [ERROR] schema drift:", errMsg.substring(0, 100));
            return NextResponse.json({
                error: "Erro de schema (CHAT_ONLY). Rode: npm run prisma:sandbox:push",
                details: "schema_drift"
            }, { status: 500 });
        }

        console.error("[OUTBOX] [ERROR]", errMsg.substring(0, 200));
        return NextResponse.json({
            error: isChatOnly ? "Erro interno (CHAT_ONLY). Verifique logs do servidor." : "Erro interno"
        }, { status: 500 });
    }
}
