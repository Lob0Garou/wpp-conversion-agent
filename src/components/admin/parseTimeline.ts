// ─── parseTimeline.ts ────────────────────────────────────────────
// Pure UI utility — no backend imports. Transforms flat message list
// into a hybrid timeline with system log cards injected between bubbles.

export interface RawMessage {
    id: string;
    direction: "inbound" | "outbound";
    content: string;
    timestamp: string;
    metadata?: {
        intent?: string;
        requires_human?: boolean;
        state?: string;
        source?: string;
        event?: string;
        ticket_id?: string;
        ticket_type?: string;
        ticket_status?: string;
        ticket_notes?: string;
    } | null;
}

export type SystemLogType = "stock_check" | "state_transition" | "handoff" | "ticket_created";

export interface SystemLogData {
    type: SystemLogType;
    // stock_check
    query?: string;
    result?: "found" | "not_found" | "unknown";
    // state_transition
    fromState?: string;
    toState?: string;
    reason?: string;
    // handoff
    // (uses type discriminant)
    // ticket_created
    ticketId?: string;
    ticketType?: string;
    ticketStatus?: string;
    ticketNotes?: string;
}

export type TimelineItem =
    | { kind: "customer"; message: RawMessage }
    | { kind: "agent"; message: RawMessage; isManual: boolean }
    | { kind: "system_log"; logType: SystemLogType; data: SystemLogData; timestamp: string };

// ─── Slot inference from message content ─────────────────────────

const MARCA_RE = /\b(nike|adidas|puma|asics|mizuno|new\s*balance|fila|olympikus|reebok|vans|converse)\b/i;
const SIZE_SAFE_RE = /\b(?:tamanho|número|numero|calço)\s*(3[4-9]|4[0-8])\b|\b(PP|P\b|M\b|G\b|GG\b|XG\b|XGG\b)/i;
const SIZE_NUMERIC_RE = /\b(3[5-9]|4[0-8])\b/;
const PRICE_CONTEXT_RE = /reais|r\$|desconto|%|off/i;

const CATEGORIA_MAP: Record<string, string[]> = {
    tenis: ["tênis", "tenis", "sneaker", "sapatilha", "air max", "air force"],
    chuteira: ["chuteira", "society", "futsal"],
    sandalia: ["sandália", "sandalia", "chinelo", "slide"],
    mochila: ["mochila", "bolsa", "bag"],
    vestuario: ["camiseta", "camisa", "shorts", "bermuda", "calça", "meia", "boné"],
};

const USO_MAP: Record<string, string[]> = {
    corrida: ["correr", "corrida", "running", "maratona", "cooper"],
    treino: ["academia", "musculação", "crossfit", "treino", "fitness", "gym"],
    casual: ["dia a dia", "casual", "passeio", "trabalho"],
    futebol: ["futebol", "futsal", "society", "pelada"],
};

export interface InferredSlots {
    marca?: string;
    size?: string;
    categoria?: string;
    uso?: string;
    intent?: string;
}

export function inferSlotsFromMessages(messages: RawMessage[]): InferredSlots {
    const inboundTexts = messages
        .filter(m => m.direction === "inbound")
        .map(m => m.content)
        .join(" ");

    const lower = inboundTexts.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    const slots: InferredSlots = {};

    // marca
    const marcaMatch = inboundTexts.match(MARCA_RE);
    if (marcaMatch) slots.marca = marcaMatch[1].toLowerCase().replace(/\s+/g, "_");

    // size — prefer contextual pattern
    const safeMatch = inboundTexts.match(SIZE_SAFE_RE);
    if (safeMatch) {
        slots.size = safeMatch[1] ?? safeMatch[2];
    } else {
        const numMatch = inboundTexts.match(SIZE_NUMERIC_RE);
        if (numMatch) {
            const idx = numMatch.index ?? 0;
            const surrounding = inboundTexts.substring(Math.max(0, idx - 12), idx + 12);
            if (!PRICE_CONTEXT_RE.test(surrounding)) {
                slots.size = numMatch[1];
            }
        }
    }

    // categoria
    for (const [cat, keywords] of Object.entries(CATEGORIA_MAP)) {
        if (keywords.some(kw => lower.includes(kw.normalize("NFD").replace(/[\u0300-\u036f]/g, "")))) {
            slots.categoria = cat;
            break;
        }
    }

    // uso
    for (const [uso, keywords] of Object.entries(USO_MAP)) {
        if (keywords.some(kw => lower.includes(kw.normalize("NFD").replace(/[\u0300-\u036f]/g, "")))) {
            slots.uso = uso;
            break;
        }
    }

    return slots;
}

// ─── Timeline parser ──────────────────────────────────────────────

// ─── Timeline parser ──────────────────────────────────────────────

const NOT_FOUND_RE = /indispon|não temos|sem estoque|esgotad|fora do estoque|falta no estoque|acabou|sem numeração|não encontrei/i;
const FOUND_RE = /temos|disponível|em estoque|encontrei|posso separar|vi aqui|está aqui/i;

// Helper to check if message metadata contains ticket creation info
function hasTicketCreation(meta: RawMessage["metadata"]): boolean {
    if (!meta) return false;
    // Check for ticket_created event in metadata
    if (meta.event === "ticket_created") return true;
    if (meta.ticket_id) return true;
    return false;
}

// Extract ticket data from metadata
function extractTicketData(meta: RawMessage["metadata"]): SystemLogData | null {
    if (!meta) return null;
    if (!hasTicketCreation(meta)) return null;

    return {
        type: "ticket_created",
        ticketId: meta.ticket_id as string | undefined,
        ticketType: meta.ticket_type as string | undefined,
        ticketStatus: meta.ticket_status as string | undefined,
        ticketNotes: meta.ticket_notes as string | undefined,
    };
}

export function parseTimelineItems(messages: RawMessage[]): TimelineItem[] {
    const items: TimelineItem[] = [];
    let lastState: string | undefined = undefined;
    let handoffInserted = false;

    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        const meta = msg.metadata ?? {};

        // ── 1. State transition card ──────────────────────────────
        const currentState = meta.state;
        if (currentState && lastState && currentState !== lastState) {
            items.push({
                kind: "system_log",
                logType: "state_transition",
                data: { type: "state_transition", fromState: lastState, toState: currentState },
                timestamp: msg.timestamp,
            });
        }
        if (currentState) lastState = currentState;

        // ── 2. Ticket created card ────────────────────────────────
        if (hasTicketCreation(meta)) {
            const ticketData = extractTicketData(meta);
            if (ticketData) {
                // Push the message first, then the ticket log
                if (msg.direction === "inbound") {
                    items.push({ kind: "customer", message: msg });
                } else {
                    items.push({
                        kind: "agent",
                        message: msg,
                        isManual: meta.source === "manual_reply",
                    });
                }
                items.push({
                    kind: "system_log",
                    logType: "ticket_created",
                    data: ticketData,
                    timestamp: msg.timestamp,
                });
                continue; // skip the normal push below
            }
        }

        // ── 3. Stock check card ───────────────────────────────────
        // Inject after an inbound SALES message when the next message is outbound
        if (
            msg.direction === "inbound" &&
            meta.intent === "SALES"
        ) {
            const nextMsg = messages[i + 1];
            if (nextMsg && nextMsg.direction === "outbound") {
                // Build query description from inbound content
                const inboundSlots = inferSlotsFromMessages([msg]);
                const queryParts: string[] = [];
                if (inboundSlots.marca) queryParts.push(inboundSlots.marca);
                if (inboundSlots.categoria) queryParts.push(inboundSlots.categoria);
                if (inboundSlots.size) queryParts.push(`tam. ${inboundSlots.size}`);
                const query = queryParts.length ? queryParts.join(" · ") : msg.content.slice(0, 40);

                // Heuristic: Check if AI reply mentions availability
                const nextContent = nextMsg.content.toLowerCase();
                let result: "found" | "not_found" | "unknown" = "unknown";

                if (NOT_FOUND_RE.test(nextContent)) {
                    result = "not_found";
                } else if (FOUND_RE.test(nextContent)) {
                    result = "found";
                } else {
                    result = "unknown";
                }

                // Push customer bubble first, then the stock log
                items.push({ kind: "customer", message: msg });
                items.push({
                    kind: "system_log",
                    logType: "stock_check",
                    data: { type: "stock_check", query, result },
                    timestamp: nextMsg.timestamp,
                });
                continue; // skip the normal push below
            }
        }

        // ── 4. Handoff card ───────────────────────────────────────
        if (
            msg.direction === "outbound" &&
            meta.requires_human === true &&
            !handoffInserted
        ) {
            handoffInserted = true;
            items.push({
                kind: meta.source === "manual_reply" ? "agent" : "agent",
                message: msg,
                isManual: meta.source === "manual_reply",
            } as TimelineItem);
            items.push({
                kind: "system_log",
                logType: "handoff",
                data: { type: "handoff" },
                timestamp: msg.timestamp,
            });
            continue;
        }

        // ── Default: push as customer or agent bubble ─────────────
        if (msg.direction === "inbound") {
            items.push({ kind: "customer", message: msg });
        } else {
            items.push({
                kind: "agent",
                message: msg,
                isManual: meta.source === "manual_reply",
            });
        }
    }

    return items;
}
