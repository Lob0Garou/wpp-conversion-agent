import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ─── POST /api/inventory/check ───
// Cria ticket de checagem física quando cliente confirma interesse.
// Chamado internamente pelo webhook após detectar resposta afirmativa
// com stockResult.requiresPhysicalCheck = true.
//
// Body: { conversationId, productDescription, size?, quantity? }

export async function POST(request: NextRequest) {
    try {
        const body = await request.json() as {
            conversationId: string;
            productDescription?: string;
            size?: string;
            quantity?: number;
        };

        const { conversationId, productDescription, size, quantity = 1 } = body;

        if (!conversationId) {
            return NextResponse.json({ error: "conversationId obrigatório" }, { status: 400 });
        }

        // Buscar store e customer da conversa
        const convRows = await prisma.$queryRaw<{ store_id: string; customer_id: string }[]>`
            SELECT store_id, customer_id FROM conversations WHERE id = ${conversationId} LIMIT 1
        `;
        const conv = convRows[0];
        if (!conv) {
            return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });
        }

        // Gerar número de ticket: STK-YYYYMMDD-XXXX
        const now = new Date();
        const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
        const randPart = Math.random().toString(36).slice(2, 6).toUpperCase();
        const ticketNumber = `STK-${datePart}-${randPart}`;
        const ticketId = crypto.randomUUID();

        // Montar categoria com detalhe do produto
        const categoryDetail = [
            productDescription,
            size ? `Tam. ${size}` : null,
            quantity > 1 ? `Qtd: ${quantity}` : null,
        ].filter(Boolean).join(" | ");

        await prisma.$executeRaw`
            INSERT INTO tickets (
                id, store_id, customer_id, conversation_id,
                ticket_number, status, category,
                created_at, updated_at
            ) VALUES (
                ${ticketId},
                ${conv.store_id},
                ${conv.customer_id},
                ${conversationId},
                ${ticketNumber},
                'open',
                ${`checagem_fisica: ${categoryDetail}`},
                NOW(), NOW()
            )
        `;

        console.log(`[STOCK CHECK] ✅ Ticket criado: ${ticketNumber} | ${categoryDetail}`);

        return NextResponse.json({
            success: true,
            ticketId,
            ticketNumber,
            detail: categoryDetail,
        });
    } catch (error) {
        console.error("[API/inventory/check POST]", error);
        return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }
}

// ─── GET /api/inventory/check?conversationId=xxx ───
// Lista tickets de checagem física de uma conversa.

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const conversationId = searchParams.get("conversationId");

        if (!conversationId) {
            return NextResponse.json({ error: "conversationId obrigatório" }, { status: 400 });
        }

        const rows = await prisma.$queryRaw<{
            id: string;
            ticket_number: string;
            status: string;
            category: string | null;
            created_at: Date;
        }[]>`
            SELECT id, ticket_number, status, category, created_at
            FROM tickets
            WHERE conversation_id = ${conversationId}
              AND category LIKE 'checagem_fisica%'
            ORDER BY created_at DESC
        `;

        return NextResponse.json(rows.map(r => ({
            id: r.id,
            ticketNumber: r.ticket_number,
            status: r.status,
            detail: r.category?.replace("checagem_fisica: ", "") ?? "",
            createdAt: r.created_at,
        })));
    } catch (error) {
        console.error("[API/inventory/check GET]", error);
        return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }
}
