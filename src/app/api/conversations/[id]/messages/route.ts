import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isChatOnlyMode } from "@/lib/chat-mode";
import { getLastReply, getOutboxEntryByConversationId } from "@/lib/chat-outbox";

// GET /api/conversations/[id]/messages — Histórico de mensagens
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        if (isChatOnlyMode()) {
            const byConversationId = getOutboxEntryByConversationId(id);
            const phoneFromId = id.startsWith("chatonly_conv_") ? id.replace("chatonly_conv_", "") : "";
            const byPhone = phoneFromId ? getLastReply(phoneFromId) : null;
            const entry = byConversationId || byPhone;
            if (!entry) {
                return NextResponse.json(
                    { error: "Conversa não encontrada" },
                    { status: 404 }
                );
            }

            return NextResponse.json({
                conversationId: id,
                status: entry.status === "PENDING_HUMAN" || entry.status === "HUMAN" ? "PENDING_HUMAN" : "open",
                messages: [
                    {
                        id: entry.id,
                        direction: "outbound",
                        content: entry.content,
                        timestamp: new Date(entry.timestamp).toISOString(),
                        metadata: {
                            source: "chat_outbox",
                            state: entry.state || "unknown",
                        },
                    },
                ],
            });
        }

        // Verificar se a conversa existe
        const conversation = await prisma.conversation.findUnique({
            where: { id },
            select: { id: true, status: true },
        });

        if (!conversation) {
            return NextResponse.json(
                { error: "Conversa não encontrada" },
                { status: 404 }
            );
        }

        const messages = await prisma.message.findMany({
            where: { conversationId: id },
            orderBy: { timestamp: "asc" },
            select: {
                id: true,
                direction: true,
                content: true,
                timestamp: true,
                metadata: true,
            },
        });

        return NextResponse.json({
            conversationId: id,
            status: conversation.status,
            messages,
        });
    } catch (error) {
        console.error("[API] Erro ao buscar mensagens:", error);
        return NextResponse.json(
            { error: "Erro interno" },
            { status: 500 }
        );
    }
}
