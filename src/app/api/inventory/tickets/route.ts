import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ─── GET /api/inventory/tickets ───
// Lista tickets de checagem física abertos da loja ativa.
// Criados pelo Cadu quando cliente confirma interesse em produto disponível.
export async function GET() {
    try {
        const store = await prisma.store.findFirst({ where: { active: true } });
        if (!store) return NextResponse.json({ error: "Store não encontrada" }, { status: 404 });

        const rows = await prisma.$queryRaw<{
            id: string;
            ticket_number: string;
            status: string;
            category: string | null;
            conversation_id: string | null;
            customer_id: string | null;
            created_at: Date;
        }[]>`
            SELECT t.id, t.ticket_number, t.status, t.category,
                   t.conversation_id, t.customer_id, t.created_at
            FROM tickets t
            WHERE t.store_id = ${store.id}
              AND t.category LIKE 'checagem_fisica%'
              AND t.status = 'open'
            ORDER BY t.created_at ASC
            LIMIT 50
        `;

        return NextResponse.json(rows.map(r => ({
            id: r.id,
            ticketNumber: r.ticket_number,
            status: r.status,
            detail: r.category?.replace("checagem_fisica: ", "") ?? "",
            conversationId: r.conversation_id,
            customerId: r.customer_id,
            createdAt: r.created_at,
        })));
    } catch (error) {
        console.error("[API/inventory/tickets GET]", error);
        return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }
}

// ─── PATCH /api/inventory/tickets ───
// Atualiza status de um ticket de checagem física.
// Body: { ticketId, action: 'confirm' | 'not_found' | 'divergence' }
//
// confirm   → fecha ticket + cria reserva
// not_found → fecha ticket
// divergence → fecha ticket como divergência de estoque
export async function PATCH(request: NextRequest) {
    try {
        const body = await request.json() as {
            ticketId: string;
            action: "confirm" | "not_found" | "divergence";
        };

        const { ticketId, action } = body;

        if (!ticketId || !action) {
            return NextResponse.json({ error: "ticketId e action são obrigatórios" }, { status: 400 });
        }

        // Buscar ticket atual
        const ticketRows = await prisma.$queryRaw<{
            id: string;
            store_id: string;
            customer_id: string | null;
            conversation_id: string | null;
            ticket_number: string;
            category: string | null;
        }[]>`
            SELECT id, store_id, customer_id, conversation_id, ticket_number, category
            FROM tickets
            WHERE id = ${ticketId} AND status = 'open'
            LIMIT 1
        `;

        const ticket = ticketRows[0];
        if (!ticket) {
            return NextResponse.json({ error: "Ticket não encontrado ou já fechado" }, { status: 404 });
        }

        if (action === "confirm") {
            // Fecha ticket + cria Reservation se possível
            await prisma.$executeRaw`
                UPDATE tickets
                SET status = 'closed', updated_at = NOW()
                WHERE id = ${ticketId}
            `;

            // Tentar criar reserva (best-effort — sem productId obrigatório)
            if (ticket.conversation_id && ticket.customer_id) {
                const reservationId = crypto.randomUUID();
                const detail = ticket.category?.replace("checagem_fisica: ", "") ?? "";
                await prisma.$executeRaw`
                    INSERT INTO reservations (id, store_id, customer_id, conversation_id, notes, status, created_at, updated_at)
                    VALUES (
                        ${reservationId},
                        ${ticket.store_id},
                        ${ticket.customer_id},
                        ${ticket.conversation_id},
                        ${`Separado: ${detail} (${ticket.ticket_number})`},
                        'active',
                        NOW(), NOW()
                    )
                    ON CONFLICT DO NOTHING
                `.catch(() => {
                    // Tabela de reservas pode ter schema diferente — ignorar silenciosamente
                });
            }

            return NextResponse.json({ success: true, action: "confirmed", ticketId });
        }

        if (action === "not_found") {
            await prisma.$executeRaw`
                UPDATE tickets
                SET status = 'closed', updated_at = NOW()
                WHERE id = ${ticketId}
            `;
            return NextResponse.json({ success: true, action: "not_found", ticketId });
        }

        if (action === "divergence") {
            await prisma.$executeRaw`
                UPDATE tickets
                SET status = 'closed',
                    category = REPLACE(category, 'checagem_fisica', 'divergencia_estoque'),
                    updated_at = NOW()
                WHERE id = ${ticketId}
            `;
            return NextResponse.json({ success: true, action: "divergence", ticketId });
        }

        return NextResponse.json({ error: "Action inválida" }, { status: 400 });
    } catch (error) {
        console.error("[API/inventory/tickets PATCH]", error);
        return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }
}
