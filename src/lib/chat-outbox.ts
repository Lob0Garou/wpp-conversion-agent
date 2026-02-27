/**
 * Chat Outbox - Armazenamento in-memory da última resposta por phone
 *
 * Usado pelo modo CHAT_ONLY para resposta rápida no terminal:
 * - Armazena última resposta outbound por phone
 * - Rápido: O(1) para lookup
 * - Logs com tag [OUTBOX]
 *
 * Este módulo é importado pelo webhook para salvar respostas
 * e pelo last-reply route para consultas rápidas.
 */

import { isChatOnlyMode } from "./chat-mode";

export interface OutboxEntry {
    phone: string;
    conversationId: string;
    content: string;
    timestamp: number;
    id: string;
    status?: "PENDING_HUMAN" | "HUMAN" | "BOT";
    state?: string;
}

// In-memory store: phone -> OutboxEntry
const outbox = new Map<string, OutboxEntry>();

const MAX_OUTBOX_SIZE = 10000; // Limite para evitar vazamento de memória

/**
 * Salva uma resposta na outbox
 * @param phone - Número do cliente
 * @param entry - Dados da resposta
 */
export function saveToOutbox(phone: string, entry: Omit<OutboxEntry, "phone">): void {
    if (!isChatOnlyMode()) {
        return; // Só salva em modo CHAT_ONLY
    }

    // Limita tamanho da outbox
    if (outbox.size >= MAX_OUTBOX_SIZE) {
        // Remove entrada mais antiga
        const firstKey = outbox.keys().next().value;
        if (firstKey) {
            outbox.delete(firstKey);
        }
    }

    const fullEntry: OutboxEntry = {
        ...entry,
        phone,
    };

    outbox.set(phone, fullEntry);

    console.log(`[OUTBOX] save phone=${phone} conv=${entry.conversationId} id=${entry.id}`);
}

/**
 * Recupera a última resposta para um phone
 * @param phone - Número do cliente
 * @returns Entry ou null se não existir
 */
export function getLastReply(phone: string): OutboxEntry | null {
    if (!isChatOnlyMode()) {
        return null;
    }

    const entry = outbox.get(phone);

    if (entry) {
        console.log(`[OUTBOX] hit phone=${phone} conv=${entry.conversationId}`);
    } else {
        console.log(`[OUTBOX] miss phone=${phone}`);
    }

    return entry || null;
}

/**
 * Verifica se existe entrada para um phone
 */
export function hasOutboxEntry(phone: string): boolean {
    if (!isChatOnlyMode()) {
        return false;
    }
    return outbox.has(phone);
}

/**
 * Remove entrada da outbox (para testing/debug)
 */
export function clearOutboxEntry(phone: string): void {
    if (!isChatOnlyMode()) {
        return;
    }
    outbox.delete(phone);
    console.log(`[OUTBOX] clear phone=${phone}`);
}

/**
 * Limpa toda a outbox
 */
export function clearAllOutbox(): void {
    if (!isChatOnlyMode()) {
        return;
    }
    outbox.clear();
    console.log("[OUTBOX] clear all");
}

/**
 * Retorna tamanho atual da outbox (para debugging)
 */
export function getOutboxSize(): number {
    return outbox.size;
}

/**
 * Lista entradas atuais da outbox (mais recentes primeiro)
 */
export function listOutboxEntries(): OutboxEntry[] {
    if (!isChatOnlyMode()) {
        return [];
    }
    return Array.from(outbox.values()).sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Busca entrada por conversationId
 */
export function getOutboxEntryByConversationId(conversationId: string): OutboxEntry | null {
    if (!isChatOnlyMode()) {
        return null;
    }
    for (const entry of outbox.values()) {
        if (entry.conversationId === conversationId) {
            return entry;
        }
    }
    return null;
}
