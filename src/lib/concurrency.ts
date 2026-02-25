import { prisma } from "./prisma";

/**
 * Tenta adquirir um lock de processamento exclusivo para a conversa.
 *
 * Operação ATÔMICA: usa updateMany com condição WHERE que inclui o estado do lock.
 * Apenas 1 processo vence — o banco garante serialização via row-level locking.
 *
 * @param conversationId  ID da conversa a ser bloqueada
 * @param ttlSeconds      Duração máxima do lock (safety net contra crashes). Default: 10s
 * @returns true  se o lock foi adquirido (prosseguir com o processamento)
 * @returns false se a conversa já está sendo processada (descartar silenciosamente)
 */
/**
 * Adquire um lock, com suporte a roubo de locks zumbis (expirados).
 */
export async function acquireLock(
    conversationId: string,
    ttlSeconds: number = 60 // Aumentado para 60s (segurança contra timeout da IA)
): Promise<boolean> {
    const now = new Date();
    const until = new Date(now.getTime() + ttlSeconds * 1000);

    // ATOMIC UPDATE: Tenta pegar o lock se:
    // 1. Ele está livre (null)
    // 2. OU ele expirou (processingUntil < agora) -> "Steal"
    const result = await prisma.conversation.updateMany({
        where: {
            id: conversationId,
            OR: [
                { processingUntil: null },
                { processingUntil: { lt: now } },
            ],
        },
        data: { processingUntil: until },
    });

    const acquired = result.count > 0;

    if (acquired) {
        console.log(`[LOCK] ✅ Adquirido conversationId=${conversationId} ttl=${ttlSeconds}s until=${until.toISOString()}`);
    } else {
        console.log(`[LOCK] 🔒 Bloqueado conversationId=${conversationId} — lock ativo e válido`);
    }

    return acquired;
}

/**
 * Libera o lock ao final do processamento.
 */
export async function releaseLock(conversationId: string): Promise<void> {
    try {
        await prisma.conversation.updateMany({
            where: { id: conversationId }, // Use updateMany to avoid error if record missing
            data: { processingUntil: null },
        });
        console.log(`[LOCK] 🔓 Liberado conversationId=${conversationId}`);
    } catch (err) {
        console.error(`[LOCK] ⚠️ Falha ao liberar lock conversationId=${conversationId}:`, err);
    }
}
