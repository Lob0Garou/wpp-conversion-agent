import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTextMessage } from "@/lib/whatsapp";

// POST /api/conversations/[id]/reply — Resposta manual do atendente
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const { text } = body;

        if (!text || typeof text !== "string" || text.trim().length === 0) {
            return NextResponse.json(
                { error: "Texto da mensagem é obrigatório" },
                { status: 400 }
            );
        }

        // Buscar conversa com customer
        const conversation = await prisma.conversation.findUnique({
            where: { id },
            include: { customer: { select: { phone: true } } },
        });

        if (!conversation) {
            return NextResponse.json(
                { error: "Conversa não encontrada" },
                { status: 404 }
            );
        }

        // Enviar mensagem via WhatsApp
        console.log(`[REPLY] 📤 Enviando resposta manual para ${conversation.customer.phone}...`);
        const sendResult = await sendTextMessage(conversation.customer.phone, text.trim());

        if (!sendResult.success) {
            console.error("[REPLY] ❌ Erro ao enviar:", sendResult.error);
            return NextResponse.json(
                { error: `Falha ao enviar: ${sendResult.error}` },
                { status: 502 }
            );
        }

        // Gerar waMessageId a partir da resposta da API ou fallback
        const waMessageId =
            sendResult.data?.messages?.[0]?.id ?? `manual_${crypto.randomUUID()}`;

        // Salvar mensagem outbound no banco
        const message = await prisma.message.create({
            data: {
                storeId: conversation.storeId,
                conversationId: id,
                direction: "outbound",
                content: text.trim(),
                waMessageId,
                metadata: { source: "manual_reply" },
            },
        });

        // Se conversa estava PENDING_HUMAN, mover para open
        if (conversation.status === "PENDING_HUMAN") {
            await prisma.conversation.update({
                where: { id },
                data: { status: "open" },
            });

            await prisma.auditLog.create({
                data: {
                    storeId: conversation.storeId,
                    event: "HUMAN_REPLIED",
                    action: "STATUS_CHANGE",
                    metadata: {
                        conversationId: id,
                        from: "PENDING_HUMAN",
                        to: "open",
                    },
                },
            });

            console.log(`[REPLY] ✅ Status alterado: PENDING_HUMAN → open`);
        }

        console.log(`[REPLY] ✅ Resposta manual enviada e salva | msgId=${message.id}`);

        return NextResponse.json({
            success: true,
            messageId: message.id,
            waMessageId,
        });
    } catch (error) {
        console.error("[REPLY] Erro ao processar resposta manual:", error);
        return NextResponse.json(
            { error: "Erro interno" },
            { status: 500 }
        );
    }
}
