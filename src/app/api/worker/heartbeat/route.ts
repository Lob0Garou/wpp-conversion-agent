/**
 * Endpoint DEV-ONLY para iniciar o heartbeat worker localmente.
 *
 * NÃO chamar em produção — usar startHeartbeat() diretamente no bootstrap do servidor.
 *
 * Uso: GET http://localhost:8080/api/worker/heartbeat
 */
import { startHeartbeat } from "@/workers/heartbeat";

let started = false;

export async function GET() {
    if (process.env.NODE_ENV === "production") {
        return Response.json(
            { error: "Endpoint não disponível em produção. Use startHeartbeat() no bootstrap." },
            { status: 403 }
        );
    }

    if (!started) {
        try {
            startHeartbeat(); // NOT awaited — runs indefinitely via setInterval
            started = true;
            return Response.json({ status: "started" });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return Response.json({ status: "error", message }, { status: 500 });
        }
    }

    return Response.json({ status: "already_running" });
}
