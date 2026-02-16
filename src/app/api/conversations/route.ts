import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/conversations — Lista de conversas ativas
export async function GET() {
    try {
        // Provisório: usar a primeira store do banco (sem auth ainda)
        const store = await prisma.store.findFirst({ where: { active: true } });

        if (!store) {
            return NextResponse.json(
                { error: "Nenhuma store encontrada" },
                { status: 404 }
            );
        }

        const conversations = await prisma.conversation.findMany({
            where: { storeId: store.id },
            include: {
                customer: { select: { phone: true, name: true } },
                messages: {
                    orderBy: { timestamp: "desc" },
                    take: 1,
                    select: { content: true, timestamp: true, direction: true },
                },
            },
            orderBy: { startedAt: "desc" },
        });

        // Formatar para o frontend
        const formatted = conversations
            .map((conv) => ({
                id: conv.id,
                status: conv.status,
                customerPhone: conv.customer.phone,
                customerName: conv.customer.name,
                lastMessage: conv.messages[0]?.content ?? "",
                lastMessageAt: conv.messages[0]?.timestamp ?? conv.startedAt,
                lastMessageDirection: conv.messages[0]?.direction ?? "inbound",
            }))
            // Ordenar pela última mensagem (mais recente primeiro)
            .sort(
                (a, b) =>
                    new Date(b.lastMessageAt).getTime() -
                    new Date(a.lastMessageAt).getTime()
            );

        return NextResponse.json(formatted);
    } catch (error) {
        console.error("[API] Erro ao listar conversas:", error);
        return NextResponse.json(
            { error: "Erro interno" },
            { status: 500 }
        );
    }
}
