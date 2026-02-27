import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isChatOnlyMode } from "@/lib/chat-mode";
import { listOutboxEntries } from "@/lib/chat-outbox";


export const dynamic = "force-dynamic";

// GET /api/conversations?type=sales|sac|all&phone=5585...
// type: filtra por conversationType (default: all)
// phone: quando informado, busca por telefone em todas as stores (útil para o simulador)
//
// CHAT_ONLY: Rota desabilitada (retorna 404) para reduzir peso
export async function GET(request: NextRequest) {
    // CHAT_ONLY: Originalmente desabilitada, ativada sob a demanda do usuário para listar no admin
    // if (isChatOnlyMode()) {
    //     return NextResponse.json(
    //         { error: "Rota desabilitada em modo CHAT_ONLY. Use /api/test/last-reply para buscar respostas." },
    //         { status: 404 }
    //     );
    // }

    try {
        const { searchParams } = new URL(request.url);
        const typeFilter = searchParams.get("type");
        const phoneFilter = searchParams.get("phone")?.trim();

        if (isChatOnlyMode()) {
            const entries = listOutboxEntries();
            const mapped = entries
                .filter((entry) => !phoneFilter || entry.phone === phoneFilter)
                .map((entry) => {
                    const state = String(entry.state || "").toLowerCase();
                    const status = entry.status === "PENDING_HUMAN" || entry.status === "HUMAN" ? "PENDING_HUMAN" : "open";
                    const conversationType = (state.includes("support") || status === "PENDING_HUMAN") ? "sac" : "sales";
                    return {
                        id: entry.conversationId,
                        status,
                        conversationType,
                        frustrationLevel: status === "PENDING_HUMAN" ? 2 : 0,
                        slots: {},
                        customerPhone: entry.phone,
                        customerName: null,
                        lastMessage: entry.content || "",
                        lastMessageAt: new Date(entry.timestamp).toISOString(),
                        lastMessageDirection: "outbound",
                    };
                })
                .filter((row) => !typeFilter || typeFilter === "all" || row.conversationType === typeFilter);

            return NextResponse.json(mapped);
        }

        const whereClause: any = {};
        if (typeFilter && typeFilter !== "all") {
            whereClause.conversationType = typeFilter;
        }

        if (phoneFilter) {
            // The chat simulator may post to a different store than the Admin's default store.
            // Search by customer phone across stores so we can find the active thread reliably.
            whereClause.customer = { phone: phoneFilter };
        } else {
            // No store filter applied in local admin so all test conversations appear
        }

        const convs = await prisma.conversation.findMany({
            where: whereClause,
            include: {
                customer: true,
                messages: {
                    orderBy: { timestamp: "desc" },
                    take: 1,
                },
            },
            orderBy: {
                startedAt: "desc",
            },
        });

        // Sort by last message time, then dedupe by phone (keep latest)
        convs.sort((a, b) => {
            const timeA = a.messages[0]?.timestamp?.getTime() ?? a.startedAt.getTime();
            const timeB = b.messages[0]?.timestamp?.getTime() ?? b.startedAt.getTime();
            return timeB - timeA;
        });

        const seenPhones = new Set<string>();
        const formatted = [];

        for (const conv of convs) {
            const phone = conv.customer?.phone || "";
            if (seenPhones.has(phone)) continue;
            seenPhones.add(phone);

            const lastMsg = conv.messages[0];

            let parsedSlots = conv.slots;
            if (typeof parsedSlots === "string") {
                try {
                    parsedSlots = JSON.parse(parsedSlots);
                } catch {
                    // keep raw value if parse fails
                }
            }

            formatted.push({
                id: conv.id,
                status: conv.status,
                conversationType: conv.conversationType,
                frustrationLevel: conv.frustrationLevel,
                slots: parsedSlots,
                customerPhone: phone,
                customerName: conv.customer?.name || null,
                lastMessage: lastMsg?.content || "",
                lastMessageAt: lastMsg?.timestamp || conv.startedAt,
                lastMessageDirection: lastMsg?.direction || "inbound",
            });
        }

        return NextResponse.json(formatted);
    } catch (error) {
        console.error("[API] Erro ao listar conversas:", error);
        return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }
}
