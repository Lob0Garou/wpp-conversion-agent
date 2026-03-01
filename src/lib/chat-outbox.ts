/**
 * Chat Outbox - in-memory storage for CHAT_ONLY mode.
 *
 * Keeps:
 * - latest outbound reply per phone (for list/quick checks)
 * - transcript per conversation (for full chat timeline in admin)
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

export interface ChatTranscriptMessage {
    id: string;
    direction: "inbound" | "outbound";
    content: string;
    timestamp: string;
    metadata?: Record<string, unknown>;
}

// In-memory store: phone -> latest outbox entry
const outbox = new Map<string, OutboxEntry>();
// In-memory store: conversationId -> full transcript
const transcripts = new Map<string, ChatTranscriptMessage[]>();

const MAX_OUTBOX_SIZE = 10000;
const MAX_TRANSCRIPT_MESSAGES = 120;

function normalizeTimestamp(input: number | string): string {
    if (typeof input === "number") {
        return new Date(input).toISOString();
    }
    const parsed = new Date(input);
    if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
    }
    return new Date().toISOString();
}

function appendTranscriptMessage(params: {
    conversationId: string;
    id: string;
    direction: "inbound" | "outbound";
    content: string;
    timestamp: number | string;
    metadata?: Record<string, unknown>;
}): void {
    const { conversationId, id, direction, content, timestamp, metadata } = params;
    const list = transcripts.get(conversationId) ?? [];

    if (list.some((item) => item.id === id)) {
        return;
    }

    list.push({
        id,
        direction,
        content,
        timestamp: normalizeTimestamp(timestamp),
        metadata,
    });

    if (list.length > MAX_TRANSCRIPT_MESSAGES) {
        list.splice(0, list.length - MAX_TRANSCRIPT_MESSAGES);
    }

    transcripts.set(conversationId, list);
}

export function saveToOutbox(phone: string, entry: Omit<OutboxEntry, "phone">): void {
    if (!isChatOnlyMode()) {
        return;
    }

    if (outbox.size >= MAX_OUTBOX_SIZE) {
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

    appendTranscriptMessage({
        conversationId: entry.conversationId,
        id: entry.id,
        direction: "outbound",
        content: entry.content,
        timestamp: entry.timestamp,
        metadata: {
            source: "chat_outbox",
            state: entry.state ?? "unknown",
        },
    });

    console.log(`[OUTBOX] save phone=${phone} conv=${entry.conversationId} id=${entry.id}`);
}

export function saveTranscriptMessage(params: {
    conversationId: string;
    id: string;
    direction: "inbound" | "outbound";
    content: string;
    timestamp: number | string;
    metadata?: Record<string, unknown>;
}): void {
    if (!isChatOnlyMode()) {
        return;
    }
    appendTranscriptMessage(params);
}

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

export function hasOutboxEntry(phone: string): boolean {
    if (!isChatOnlyMode()) {
        return false;
    }
    return outbox.has(phone);
}

export function clearOutboxEntry(phone: string): void {
    if (!isChatOnlyMode()) {
        return;
    }
    const existing = outbox.get(phone);
    outbox.delete(phone);
    if (existing?.conversationId) {
        transcripts.delete(existing.conversationId);
    }
    console.log(`[OUTBOX] clear phone=${phone}`);
}

export function clearAllOutbox(): void {
    if (!isChatOnlyMode()) {
        return;
    }
    outbox.clear();
    transcripts.clear();
    console.log("[OUTBOX] clear all");
}

export function getOutboxSize(): number {
    return outbox.size;
}

export function listOutboxEntries(): OutboxEntry[] {
    if (!isChatOnlyMode()) {
        return [];
    }
    return Array.from(outbox.values()).sort((a, b) => b.timestamp - a.timestamp);
}

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

export function getTranscriptByConversationId(conversationId: string): ChatTranscriptMessage[] {
    if (!isChatOnlyMode()) {
        return [];
    }
    const list = transcripts.get(conversationId) ?? [];
    return [...list].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
}
