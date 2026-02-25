import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ─── POST /api/sales ───
// Body: { conversationId, productDescription, productSku?, quantity, unitPrice, reservationId? }
// Registra uma venda confirmada e cancela a reserva se existir
export async function POST(request: NextRequest) {
    try {
        const body = await request.json() as {
            conversationId: string;
            productDescription: string;
            productSku?: string;
            quantity: number;
            unitPrice: number;
            reservationId?: string;
        };

        const {
            conversationId,
            productDescription,
            productSku,
            quantity = 1,
            unitPrice,
            reservationId,
        } = body;

        if (!conversationId || !productDescription || !unitPrice) {
            return NextResponse.json(
                { error: "conversationId, productDescription e unitPrice são obrigatórios" },
                { status: 400 }
            );
        }

        // Buscar dados da conversa
        const convRows = await prisma.$queryRaw<{
            id: string;
            store_id: string;
            customer_id: string;
        }[]>`
            SELECT id, store_id, customer_id FROM conversations WHERE id = ${conversationId} LIMIT 1
        `;

        const conv = convRows[0];
        if (!conv) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });

        const totalPrice = parseFloat((quantity * unitPrice).toFixed(2));
        const saleId = crypto.randomUUID();

        // Inserir venda + marcar reserva como convertida (se existir)
        await prisma.$executeRaw`
            INSERT INTO sale_events (
                id, store_id, customer_id, conversation_id, reservation_id,
                product_description, product_sku, quantity, unit_price, total_price, sold_at
            ) VALUES (
                ${saleId},
                ${conv.store_id},
                ${conv.customer_id},
                ${conversationId},
                ${reservationId ?? null},
                ${productDescription},
                ${productSku ?? null},
                ${quantity},
                ${unitPrice},
                ${totalPrice},
                NOW()
            )
        `;

        // Marcar reserva como convertida (se veio do frontend)
        if (reservationId) {
            await prisma.$executeRaw`
                UPDATE reservations
                SET status = 'converted', converted_at = NOW()
                WHERE id = ${reservationId}
            `;
        }

        // Fechar a conversa
        await prisma.$executeRaw`
            UPDATE conversations
            SET status = 'closed', closed_at = NOW()
            WHERE id = ${conversationId}
        `;

        return NextResponse.json({
            success: true,
            saleId,
            totalPrice,
        });
    } catch (error) {
        console.error("[API/sales POST]", error);
        return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }
}
