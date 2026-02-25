import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ─── GET /api/tickets?conversationId=xxx ───
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const conversationId = searchParams.get("conversationId");

        if (!conversationId) {
            return NextResponse.json({ error: "conversationId obrigatório" }, { status: 400 });
        }

        const rows = await prisma.$queryRaw<{
            id: string;
            ticket_number: string | null;
            status: string;
            category: string | null;
            order_id: string | null;
            email: string | null;
            created_at: Date;
        }[]>`
            SELECT id, ticket_number, status, category, order_id, email, created_at
            FROM tickets
            WHERE conversation_id = ${conversationId}
            ORDER BY created_at DESC
        `;

        return NextResponse.json(rows.map(r => ({
            id: r.id,
            ticketNumber: r.ticket_number,
            status: r.status,
            category: r.category,
            orderId: r.order_id,
            email: r.email,
            createdAt: r.created_at,
        })));
    } catch (error) {
        console.error("[API/tickets GET]", error);
        return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }
}

// ─── POST /api/tickets ───
// Body: { conversationId, category?, orderId?, email?, cpf? }
export async function POST(request: NextRequest) {
    try {
        const body = await request.json() as {
            conversationId: string;
            category?: string;
            orderId?: string;
            email?: string;
            cpf?: string;
        };

        const { conversationId, category, orderId, email, cpf } = body;

        if (!conversationId) {
            return NextResponse.json({ error: "conversationId obrigatório" }, { status: 400 });
        }

        // Buscar storeId da conversa
        const convRows = await prisma.$queryRaw<{ store_id: string; customer_id: string }[]>`
            SELECT store_id, customer_id FROM conversations WHERE id = ${conversationId} LIMIT 1
        `;
        const conv = convRows[0];
        if (!conv) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });

        // Gerar número de ticket: TKT-YYYYMMDD-XXXX
        const now = new Date();
        const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
        const randPart = Math.random().toString(36).slice(2, 6).toUpperCase();
        const ticketNumber = `TKT-${datePart}-${randPart}`;

        const ticketId = crypto.randomUUID();

        await prisma.$executeRaw`
            INSERT INTO tickets (
                id, store_id, customer_id, conversation_id,
                ticket_number, status, category, order_id, email, cpf,
                created_at, updated_at
            ) VALUES (
                ${ticketId},
                ${conv.store_id},
                ${conv.customer_id},
                ${conversationId},
                ${ticketNumber},
                'open',
                ${category ?? null},
                ${orderId ?? null},
                ${email ?? null},
                ${cpf ?? null},
                NOW(), NOW()
            )
        `;

        return NextResponse.json({ success: true, ticketId, ticketNumber });
    } catch (error) {
        console.error("[API/tickets POST]", error);
        return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }
}
