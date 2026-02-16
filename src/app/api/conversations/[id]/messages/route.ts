import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/conversations/[id]/messages — Histórico de mensagens
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

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
