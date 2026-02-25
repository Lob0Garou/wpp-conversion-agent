/**
 * Worker standalone de telemetria — para uso em PRODUÇÃO.
 *
 * Executar como processo separado:
 *   npx tsx src/workers/telemetry.ts
 *
 * Em dev, usar o endpoint GET /api/worker em vez deste script.
 */
import "dotenv/config";
import { startTelemetryWorker } from "@/lib/telemetry";

startTelemetryWorker()
    .then(() => console.log("[WORKER] Telemetry worker online"))
    .catch((err) => {
        console.error("[WORKER] Falha ao iniciar worker:", err);
        process.exit(1);
    });

// Graceful shutdown
process.on("SIGTERM", () => {
    console.log("[WORKER] SIGTERM recebido — encerrando");
    process.exit(0);
});
process.on("SIGINT", () => {
    console.log("[WORKER] SIGINT recebido — encerrando");
    process.exit(0);
});
