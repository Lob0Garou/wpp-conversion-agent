import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMetricsSummary, getRecentLogs, type LogCategory } from "@/lib/telemetry";
import { isChatOnlyMode } from "@/lib/chat-mode";

// GET /api/metrics?range=today|7d|30d
// GET /api/metrics?type=summary|orchestrator|templates|llm|guardrails|logs
//
// CHAT_ONLY: Rota desabilitada (retorna 404) para reduzir peso
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    // Em modo CHAT_ONLY, retorna 404 para indicar rota desabilitada
    // Exceção: logs em memória (ex.: SHADOW audit) são leves e úteis para calibração.
    if (isChatOnlyMode() && type !== "logs") {
        return NextResponse.json(
            { error: "Rota desabilitada em modo CHAT_ONLY" },
            { status: 404 }
        );
    }

    // Handle new structured metrics endpoints
    if (type === "summary") {
        return handleSummaryMetrics();
    }

    if (type === "orchestrator") {
        return handleOrchestratorMetrics();
    }

    if (type === "templates") {
        return handleTemplateMetrics();
    }

    if (type === "llm") {
        return handleLLMMetrics();
    }

    if (type === "guardrails") {
        return handleGuardrailMetrics();
    }

    if (type === "logs") {
        return handleLogRetrieval(searchParams);
    }

    // Fall back to original metrics if no type specified
    return handleLegacyMetrics(request);
}

// ─── Summary Metrics ────────────────────────────────────────────────
async function handleSummaryMetrics() {
    try {
        const summary = getMetricsSummary();
        return NextResponse.json(summary);
    } catch (error) {
        console.error("[API/metrics/summary] Erro:", error);
        return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }
}

// ─── Orchestrator Metrics ───────────────────────────────────────────
async function handleOrchestratorMetrics() {
    try {
        const summary = getMetricsSummary();

        // Get additional DB metrics
        const store = await prisma.store.findFirst({ where: { active: true } });
        if (!store) {
            return NextResponse.json({ error: "Nenhuma store encontrada" }, { status: 404 });
        }

        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        // Get conversation counts from DB
        const [totalConversations, openConversations, pendingHuman] = await Promise.all([
            prisma.conversation.count({
                where: { storeId: store.id, startedAt: { gte: oneDayAgo } },
            }),
            prisma.conversation.count({
                where: { storeId: store.id, status: "open", startedAt: { gte: oneDayAgo } },
            }),
            prisma.conversation.count({
                where: { storeId: store.id, status: "PENDING_HUMAN", startedAt: { gte: oneDayAgo } },
            }),
        ]);

        return NextResponse.json({
            timeRange: "1d",
            generatedAt: new Date().toISOString(),
            sources: summary.sources,
            actions: summary.actions,
            totalConversations,
            openConversations,
            pendingHumanEscalation: pendingHuman,
            inMemoryLogs: {
                total: summary.totalLogs,
                orchestrator: summary.totalLogs > 0 ?
                    summary.totalLogs - (summary.template.hits + summary.template.misses + summary.llm.fallbacks + summary.guardrail.approved + summary.guardrail.rejected) : 0,
            },
        });
    } catch (error) {
        console.error("[API/metrics/orchestrator] Erro:", error);
        return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }
}

// ─── Template Metrics ────────────────────────────────────────────────
async function handleTemplateMetrics() {
    try {
        const summary = getMetricsSummary();

        return NextResponse.json({
            timeRange: "1h",
            generatedAt: new Date().toISOString(),
            hits: summary.template.hits,
            misses: summary.template.misses,
            hitRate: summary.template.hitRate,
            totalAttempts: summary.template.hits + summary.template.misses,
        });
    } catch (error) {
        console.error("[API/metrics/templates] Erro:", error);
        return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }
}

// ─── LLM Metrics ────────────────────────────────────────────────────
async function handleLLMMetrics() {
    try {
        const summary = getMetricsSummary();

        // Get recent LLM logs to analyze fallback reasons
        const recentLogs = getRecentLogs(1000, "LLM");

        // Analyze fallback reasons
        const fallbackReasons: Record<string, number> = {};
        for (const log of recentLogs) {
            const reason = log.metadata.reason as string;
            fallbackReasons[reason] = (fallbackReasons[reason] || 0) + 1;
        }

        return NextResponse.json({
            timeRange: "1h",
            generatedAt: new Date().toISOString(),
            fallbacks: summary.llm.fallbacks,
            errors: summary.llm.errors,
            errorRate: summary.llm.errorRate,
            fallbackReasons,
            modelsUsed: {
                "moonshotai/kimi-k2.5": summary.llm.fallbacks,
            },
        });
    } catch (error) {
        console.error("[API/metrics/llm] Erro:", error);
        return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }
}

// ─── Guardrail Metrics ───────────────────────────────────────────────
async function handleGuardrailMetrics() {
    try {
        const summary = getMetricsSummary();

        // Get recent guardrail logs to analyze intervention reasons
        const recentLogs = getRecentLogs(1000, "GUARDRAIL");

        // Analyze rejection reasons
        const rejectionReasons: Record<string, number> = {};
        const interventionsByType: Record<string, number> = {
            checkRepetition: 0,
            checkLength: 0,
            checkMaxQuestions: 0,
            checkEngagement: 0,
            checkFrustrationEscalation: 0,
            checkStockHallucination: 0,
            checkPolicyInvention: 0,
            checkCTAMissing: 0,
            loopDetection: 0,
        };

        for (const log of recentLogs) {
            if (log.metadata.approved === false) {
                const reason = log.metadata.reason as string;
                if (reason) {
                    rejectionReasons[reason] = (rejectionReasons[reason] || 0) + 1;
                }
            }
        }

        return NextResponse.json({
            timeRange: "1h",
            generatedAt: new Date().toISOString(),
            approved: summary.guardrail.approved,
            rejected: summary.guardrail.rejected,
            rejectionRate: summary.guardrail.rejectionRate,
            rejectionReasons,
            checksPerformed: interventionsByType,
        });
    } catch (error) {
        console.error("[API/metrics/guardrails] Erro:", error);
        return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }
}

// ─── Log Retrieval ───────────────────────────────────────────────────
async function handleLogRetrieval(searchParams: URLSearchParams) {
    try {
        const limit = parseInt(searchParams.get("limit") || "100");
        const category = searchParams.get("category") as LogCategory | null;

        const logs = getRecentLogs(limit, category || undefined);

        return NextResponse.json({
            generatedAt: new Date().toISOString(),
            count: logs.length,
            logs,
        });
    } catch (error) {
        console.error("[API/metrics/logs] Erro:", error);
        return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }
}

// ─── Legacy Metrics Handler ──────────────────────────────────────────
async function handleLegacyMetrics(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const range = searchParams.get("range") ?? "today";

        const store = await prisma.store.findFirst({ where: { active: true } });
        if (!store) {
            return NextResponse.json({ error: "Nenhuma store encontrada" }, { status: 404 });
        }

        // ─── Calcular data inicial ───
        const now = new Date();
        let startDate: Date;

        if (range === "today") {
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        } else if (range === "7d") {
            startDate = new Date(now);
            startDate.setDate(startDate.getDate() - 7);
        } else if (range === "30d") {
            startDate = new Date(now);
            startDate.setDate(startDate.getDate() - 30);
        } else {
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        }

        // ─── Query paralela: vendas + reservas + conversas interessadas ───
        const [saleRows, reservationRows, interestedCount] = await Promise.all([
            // Vendas no período
            prisma.$queryRaw<{
                sale_count: bigint;
                total_revenue: string | null;
                avg_ticket: string | null;
            }[]>`
                SELECT
                    COUNT(*) AS sale_count,
                    CAST(SUM(total_price) AS TEXT) AS total_revenue,
                    CAST(AVG(total_price) AS TEXT) AS avg_ticket
                FROM sale_events
                WHERE store_id = ${store.id}
                  AND sold_at >= ${startDate}
            `,

            // Reservas ativas no período
            prisma.$queryRaw<{ reservation_count: bigint }[]>`
                SELECT COUNT(*) AS reservation_count
                FROM reservations
                WHERE store_id = ${store.id}
                  AND reserved_at >= ${startDate}
                  AND status IN ('active', 'converted')
            `,

            // Conversas com sinal de interesse (tipo: sales, produto mencionado)
            prisma.$queryRaw<{ interested_count: bigint }[]>`
                SELECT COUNT(DISTINCT te.conversation_id) AS interested_count
                FROM telemetry_events te
                WHERE te.store_id = ${store.id}
                  AND te.event_type = 'product_interest'
                  AND te.created_at >= ${startDate}
            `,
        ]);

        const saleCount = Number(saleRows[0]?.sale_count ?? 0);
        const totalRevenue = parseFloat(saleRows[0]?.total_revenue ?? "0") || 0;
        const avgTicket = parseFloat(saleRows[0]?.avg_ticket ?? "0") || 0;
        const reservationCount = Number(reservationRows[0]?.reservation_count ?? 0);
        const interested = Number(interestedCount[0]?.interested_count ?? 0);

        // ─── Últimas vendas (max 10) ───
        const recentSales = await prisma.$queryRaw<{
            id: string;
            product_description: string;
            quantity: number;
            total_price: string;
            sold_at: Date;
        }[]>`
            SELECT id, product_description, quantity, CAST(total_price AS TEXT) as total_price, sold_at
            FROM sale_events
            WHERE store_id = ${store.id}
              AND sold_at >= ${startDate}
            ORDER BY sold_at DESC
            LIMIT 10
        `;

        return NextResponse.json({
            range,
            interestedCount: interested,
            reservationCount,
            saleCount,
            totalRevenue: totalRevenue.toFixed(2),
            avgTicket: avgTicket.toFixed(2),
            soldItems: recentSales.map(s => ({
                id: s.id,
                description: s.product_description,
                quantity: s.quantity,
                totalPrice: parseFloat(s.total_price),
                soldAt: s.sold_at,
            })),
        });
    } catch (error) {
        console.error("[API/metrics] Erro:", error);
        return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }
}
