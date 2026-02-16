/**
 * GET /api/webhook-status-log
 *
 * Retorna os últimos webhooks de status recebidos (delivery status)
 * Útil para debug em tempo real no admin
 */

import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        // Buscar os últimos 20 audit logs de status
        const logs = await prisma.auditLog.findMany({
            where: {
                event: {
                    in: ["MESSAGE_SENT", "SEND_ERROR", "DELIVERY_STATUS"],
                },
            },
            orderBy: { timestamp: "desc" },
            take: 20,
            select: {
                id: true,
                event: true,
                action: true,
                metadata: true,
                timestamp: true,
                store: {
                    select: { name: true },
                },
            },
        });

        return Response.json(
            {
                status: "ok",
                count: logs.length,
                logs: logs.map((log) => ({
                    id: log.id,
                    event: log.event,
                    action: log.action,
                    store: log.store?.name || "Unknown",
                    metadata: log.metadata,
                    timestamp: log.timestamp,
                    timeAgo: getTimeAgo(log.timestamp),
                })),
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("[WEBHOOK-STATUS-LOG] Erro:", error);
        return Response.json(
            { status: "error", error: "Failed to fetch logs" },
            { status: 500 }
        );
    }
}

function getTimeAgo(date: Date): string {
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return `${seconds}s atrás`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m atrás`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h atrás`;
    return `${Math.floor(seconds / 86400)}d atrás`;
}
