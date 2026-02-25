import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";


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
