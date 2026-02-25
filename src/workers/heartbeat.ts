/**
 * Heartbeat worker — scans for unhealthy conversation states on every tick.
 *
 * Scans performed:
 *  1. Stalled PENDING_HUMAN conversations (> 30 min without an outbound message)
 *  2. Ghost locks (processingUntil stuck > 5 min in the past) → cleared automatically
 *  3. Summary log: total open, pending human, ghost locks cleared
 *
 * Usage (dev): GET /api/worker/heartbeat
 * Usage (prod): call startHeartbeat() directly from your server bootstrap
 */
import { prisma } from "../lib/prisma";

const INTERVAL_MS = Number(process.env.HEARTBEAT_INTERVAL_MS ?? 60_000);
const STALL_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
const GHOST_LOCK_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

let intervalId: ReturnType<typeof setInterval> | null = null;

// ─── Scan 1: Stalled PENDING_HUMAN conversations ────────────────────────────

async function scanStalledPendingHuman(): Promise<number> {
    const cutoff = new Date(Date.now() - STALL_THRESHOLD_MS);

    // Find conversations that are PENDING_HUMAN and started more than 30 min ago
    // with no outbound message in the last 30 min.
    const stalled = await prisma.conversation.findMany({
        where: {
            status: "PENDING_HUMAN",
            startedAt: { lt: cutoff },
        },
        select: {
            id: true,
            storeId: true,
            startedAt: true,
            messages: {
                where: {
                    direction: "outbound",
                    timestamp: { gte: cutoff },
                },
                select: { id: true },
                take: 1,
            },
        },
    });

    // Filter to only those with NO outbound message in the window
    const trulyStalled = stalled.filter((c) => c.messages.length === 0);

    if (trulyStalled.length > 0) {
        console.warn(
            `[HEARTBEAT] ALERT — ${trulyStalled.length} conversa(s) PENDING_HUMAN parada(s) há mais de 30 min:`,
            trulyStalled.map((c) => ({
                id: c.id,
                storeId: c.storeId,
                startedAt: c.startedAt.toISOString(),
            }))
        );
    }

    return trulyStalled.length;
}

// ─── Scan 2: Ghost locks ────────────────────────────────────────────────────

async function clearGhostLocks(): Promise<number> {
    const cutoff = new Date(Date.now() - GHOST_LOCK_THRESHOLD_MS);

    const result = await prisma.conversation.updateMany({
        where: {
            processingUntil: { not: null, lt: cutoff },
        },
        data: {
            processingUntil: null,
        },
    });

    if (result.count > 0) {
        console.warn(
            `[HEARTBEAT] ${result.count} ghost lock(s) limpo(s) (processingUntil expirado há > 5 min)`
        );
    }

    return result.count;
}

// ─── Scan 3: Summary counts ─────────────────────────────────────────────────

async function logSummary(stalledCount: number, ghostLocksCleared: number): Promise<void> {
    const [totalOpen, totalPendingHuman] = await Promise.all([
        prisma.conversation.count({
            where: { status: { in: ["open", "PENDING_HUMAN"] } },
        }),
        prisma.conversation.count({
            where: { status: "PENDING_HUMAN" },
        }),
    ]);

    console.log(
        `[HEARTBEAT] Tick — abertas: ${totalOpen} | pendente humano: ${totalPendingHuman} | ` +
        `paradas (alerta): ${stalledCount} | ghost locks limpos: ${ghostLocksCleared}`
    );
}

// ─── Main tick ──────────────────────────────────────────────────────────────

async function tick(): Promise<void> {
    try {
        const [stalledCount, ghostLocksCleared] = await Promise.all([
            scanStalledPendingHuman(),
            clearGhostLocks(),
        ]);
        await logSummary(stalledCount, ghostLocksCleared);
    } catch (err) {
        // Heartbeat must NEVER crash the process
        console.error("[HEARTBEAT] Erro durante tick — ignorado:", err);
    }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Starts the heartbeat. Safe to call multiple times — subsequent calls are
 * no-ops if the heartbeat is already running.
 * Returns immediately; the interval runs in the background.
 */
export function startHeartbeat(): void {
    if (intervalId !== null) {
        console.log("[HEARTBEAT] Já está rodando — startHeartbeat() ignorado");
        return;
    }

    console.log(`[HEARTBEAT] Iniciando com intervalo de ${INTERVAL_MS}ms`);

    // Run the first tick immediately so we don't have to wait one full interval
    void tick();

    intervalId = setInterval(() => {
        void tick();
    }, INTERVAL_MS);
}

/**
 * Stops the heartbeat interval. Useful for graceful shutdown.
 */
export function stopHeartbeat(): void {
    if (intervalId === null) {
        return;
    }
    clearInterval(intervalId);
    intervalId = null;
    console.log("[HEARTBEAT] Parado");
}
