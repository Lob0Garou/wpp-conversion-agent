/**
 * Chat-Only Mode Utility
 *
 * Feature flag para режим CHAT_ONLY:
 * - CADU_MODE=CHAT_ONLY
 * - CHAT_ONLY=true
 *
 * Quando ativo:
 * - Desativa telemetria complexa
 * - Simplifica logs
 * - Usa outbox in-memory para last-reply
 * - Retorna 404 em rotas pesadas (admin, metrics, conversations list)
 */

/**
 * Verifica se o modo CHAT_ONLY está ativo
 */
export function isChatOnlyMode(): boolean {
    const caduMode = process.env.CADU_MODE;
    const chatOnly = process.env.CHAT_ONLY;

    return (
        caduMode === "CHAT_ONLY" ||
        caduMode === "chat_only" ||
        chatOnly === "true" ||
        chatOnly === "1" ||
        chatOnly === "yes"
    );
}

/**
 * Helper para logging condicional em CHAT_ONLY
 * Em modo CHAT_ONLY, usa tags curtas: [INBOUND], [CLASSIFY], etc.
 */
export function chatLog(tag: string, message: string, ...args: unknown[]): void {
    if (isChatOnlyMode()) {
        console.log(`[${tag}] ${message}`, ...args);
    } else {
        console.log(message, ...args);
    }
}

/**
 * Verifica se deve desativar telemetria complexa em CHAT_ONLY
 */
export function shouldSkipTelemetry(): boolean {
    return isChatOnlyMode();
}

/**
 * Verifica se deve usar outbox in-memory para last-reply (sempre true em CHAT_ONLY)
 */
export function shouldUseOutbox(): boolean {
    return isChatOnlyMode();
}
