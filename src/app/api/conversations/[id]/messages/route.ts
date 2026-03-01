import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isChatOnlyMode } from "@/lib/chat-mode";
import {
    getLastReply,
    getOutboxEntryByConversationId,
    getTranscriptByConversationId,
} from "@/lib/chat-outbox";

// GET /api/conversations/[id]/messages
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
                    { error: "Conversa nao encontrada" },
                    { status: 404 }
                );
            }

            const transcript = getTranscriptByConversationId(entry.conversationId);
            const messages = transcript.length > 0
                ? transcript
                : [
                    {
                        id: entry.id,
                        direction: "outbound" as const,
                        content: entry.content,
                        timestamp: new Date(entry.timestamp).toISOString(),
                        metadata: {
                            source: "chat_outbox",
                            state: entry.state || "unknown",
                        },
                    },
                ];

            return NextResponse.json({
                conversationId: entry.conversationId,
                status: entry.status === "PENDING_HUMAN" || entry.status === "HUMAN" ? "PENDING_HUMAN" : "open",
                messages,
            });
        }

        const conversation = await prisma.conversation.findUnique({
            where: { id },
            select: { id: true, status: true },
        });

        if (!conversation) {
            return NextResponse.json(
                { error: "Conversa nao encontrada" },
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
