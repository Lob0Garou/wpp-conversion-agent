/**
 * Endpoint DEV-ONLY para iniciar o worker de telemetria localmente.
 *
 * NÃO chamar em produção — usar src/workers/telemetry.ts em vez disso.
 *
 * Uso: GET http://localhost:8080/api/worker
 * Requer: TELEMETRY_ENABLED=true no .env
 */
import { startTelemetryWorker } from "@/lib/telemetry";

let started = false;

export async function GET() {
    if (process.env.NODE_ENV === "production") {
        return Response.json(
            { error: "Endpoint não disponível em produção. Use src/workers/telemetry.ts" },
            { status: 403 }
        );
    }

    if (!started) {
        try {
            await startTelemetryWorker();
            started = true;
            return Response.json({ status: "worker started" });
        } catch (err: any) {
            return Response.json(
                { status: "error", message: err?.message ?? String(err) },
                { status: 500 }
            );
        }
    }

    return Response.json({ status: "worker already running" });
}
