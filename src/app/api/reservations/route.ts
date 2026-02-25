import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ─── POST /api/reservations ───
// Body: { conversationId, productId, quantity? }
// Cria uma reserva e decrementa o estoque temporariamente
export async function POST(request: NextRequest) {
    try {
        const body = await request.json() as {
            conversationId: string;
            productId: string;
            quantity?: number;
        };

        const { conversationId, productId, quantity = 1 } = body;

        if (!conversationId || !productId) {
            return NextResponse.json(
                { error: "conversationId e productId são obrigatórios" },
                { status: 400 }
            );
        }

        // Buscar conversa + produto em paralelo
        const [convRows, productRows] = await Promise.all([
            prisma.$queryRaw<{ id: string; store_id: string; customer_id: string }[]>`
                SELECT id, store_id, customer_id FROM conversations WHERE id = ${conversationId} LIMIT 1
            `,
            prisma.$queryRaw<{ id: string; quantity: number; description: string }[]>`
                SELECT id, quantity, description FROM products WHERE id = ${productId} LIMIT 1
            `,
        ]);

        const conv = convRows[0];
        const product = productRows[0];

        if (!conv) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
        if (!product) return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });

        if (product.quantity < quantity) {
            return NextResponse.json(
                { error: `Estoque insuficiente: disponível ${product.quantity}` },
                { status: 422 }
            );
        }

        // Verificar reserva ativa existente para este produto + conversa
        const existingRows = await prisma.$queryRaw<{ id: string }[]>`
            SELECT id FROM reservations
            WHERE conversation_id = ${conversationId}
              AND product_id = ${productId}
              AND status = 'active'
            LIMIT 1
        `;

        if (existingRows[0]) {
            return NextResponse.json(
                { error: "Já existe uma reserva ativa para este produto nesta conversa" },
                { status: 409 }
            );
        }

        // Calcular expiração: mesmo dia 23:59 BRT (UTC-3)
        const now = new Date();
        const expiresAt = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            23, 59, 59, 0
        );
        // Ajustar para UTC (BRT = UTC-3)
        expiresAt.setTime(expiresAt.getTime() + 3 * 60 * 60 * 1000);

        // Criar reserva + decrementar estoque em transação
        await prisma.$executeRaw`
            BEGIN;
            INSERT INTO reservations (id, store_id, customer_id, conversation_id, product_id, quantity, status, reserved_at, expires_at)
            VALUES (
                gen_random_uuid(),
                ${conv.store_id},
                ${conv.customer_id},
                ${conversationId},
                ${productId},
                ${quantity},
                'active',
                NOW(),
                ${expiresAt}
            );
            UPDATE products SET quantity = quantity - ${quantity} WHERE id = ${productId};
            COMMIT;
        `;

        return NextResponse.json({ success: true, expiresAt });
    } catch (error) {
        console.error("[API/reservations POST]", error);
        return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }
}

// ─── GET /api/reservations?conversationId=xxx ───
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const conversationId = searchParams.get("conversationId");

        if (!conversationId) {
            return NextResponse.json({ error: "conversationId obrigatório" }, { status: 400 });
        }

        const rows = await prisma.$queryRaw<{
            id: string;
            product_id: string;
            quantity: number;
            status: string;
            expires_at: Date;
            description: string;
        }[]>`
            SELECT r.id, r.product_id, r.quantity, r.status, r.expires_at, p.description
            FROM reservations r
            JOIN products p ON p.id = r.product_id
            WHERE r.conversation_id = ${conversationId}
            ORDER BY r.reserved_at DESC
        `;

        return NextResponse.json(rows.map(r => ({
            id: r.id,
            productId: r.product_id,
            productName: r.description,
            quantity: r.quantity,
            status: r.status,
            expiresAt: r.expires_at,
        })));
    } catch (error) {
        console.error("[API/reservations GET]", error);
        return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }
}
