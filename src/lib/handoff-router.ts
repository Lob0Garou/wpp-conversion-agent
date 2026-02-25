/**
 * HandoffRouter - Sistema de Roteamento de Escalonamento (Dual-Hub)
 * 
 * Responsabilidades:
 * - Determinar a fila correta (SALES_RESERVE | SAC_SUPPORT)
 * - Calcular prioridade (NORMAL | URGENT)
 * - Gerar resumo de Warm Handoff para o atendente
 * - Calcular deadline de SLA
 */

import type { Intent } from "./intent-classifier";
import type { Slots } from "./state-manager";

// ─── Types ───

export type QueueType = "SALES_RESERVE" | "SAC_SUPPORT";
export type Priority = "NORMAL" | "URGENT";

export interface HandoffContext {
    intent: Intent;
    slots: Slots;
    frustrationLevel: number;
    customerName?: string;
    orderId?: string;
    conversationId: string;
    storeId: string;
    messageCount: number;
    stallCount: number;
    conversationHistory: Array<{ role: string; content: string }>;
}

export interface HandoffResult {
    queue: QueueType;
    priority: Priority;
    summary: string;
    adminLink: string;
    slaMinutes: number;
}

// ─── Constants ───

/**
 * SLA em minutos por fila e prioridade
 */
const SLA_MINUTES: Record<QueueType, Record<Priority, number>> = {
    SALES_RESERVE: {
        NORMAL: 120,    // 2 horas
        URGENT: 30,     // 30 minutos
    },
    SAC_SUPPORT: {
        NORMAL: 60,     // 1 hora
        URGENT: 15,     // 15 minutos
    },
};

/**
 * Palavras-chave que indicam ameaça legal
 */
const LEGAL_THREAT_KEYWORDS = [
    "procon", "advogado", "justiça", "processo", "processar",
    "reclame aqui", "direitos do consumidor", "código de defesa",
    "defensoria", "pequenas causas", "juizado especial",
];

// ─── Main Functions ───

/**
 * Determina a fila de escalonamento baseado no intent e slots.
 * 
 * Regras:
 * - SALES + produto identificado → SALES_RESERVE
 * - SAC_* → SAC_SUPPORT
 * - HANDOFF/SUPPORT → SAC_SUPPORT
 * - Frustração alta → SAC_SUPPORT (prioridade URGENT)
 * 
 * @param intent - Intenção detectada pelo classificador
 * @param slots - Slots extraídos da conversa
 * @returns Fila de escalonamento
 */
export function determineQueue(intent: Intent, slots: Slots): QueueType {
    // Vendas com produto identificado → fila de reservas
    if (intent === "SALES" && hasProductSlots(slots)) {
        return "SALES_RESERVE";
    }

    // Todo o resto → SAC
    return "SAC_SUPPORT";
}

/**
 * Determina a prioridade baseado no contexto.
 * 
 * Regras para URGENT:
 * - Frustração >= 3
 * - Ameaça legal detectada
 * - Stall alto (cliente preso na conversa)
 * 
 * @param frustrationLevel - Nível de frustração (0-3)
 * @param conversationHistory - Histórico da conversa
 * @param stallCount - Contador de stalls
 * @returns Prioridade do ticket
 */
export function determinePriority(
    frustrationLevel: number,
    conversationHistory: Array<{ role: string; content: string }>,
    stallCount: number
): Priority {
    // Frustração alta
    if (frustrationLevel >= 3) {
        return "URGENT";
    }

    // Ameaça legal nas últimas mensagens
    const recentMessages = conversationHistory
        .filter(m => m.role === "user")
        .slice(-3)
        .map(m => m.content.toLowerCase());

    const hasLegalThreat = recentMessages.some(msg =>
        LEGAL_THREAT_KEYWORDS.some(keyword => msg.includes(keyword))
    );

    if (hasLegalThreat) {
        return "URGENT";
    }

    // Stall alto (cliente está preso)
    if (stallCount >= 4) {
        return "URGENT";
    }

    return "NORMAL";
}

/**
 * Gera o resumo de Warm Handoff para o atendente.
 * 
 * @param ctx - Contexto completo do handoff
 * @returns Resultado do handoff com fila, prioridade, resumo e SLA
 */
export function generateWarmHandoffSummary(ctx: HandoffContext): HandoffResult {
    const queue = determineQueue(ctx.intent, ctx.slots);
    const priority = determinePriority(
        ctx.frustrationLevel,
        ctx.conversationHistory,
        ctx.stallCount
    );
    const slaMinutes = SLA_MINUTES[queue][priority];
    const adminLink = buildAdminLink(ctx.conversationId, ctx.storeId);

    const summary = queue === "SALES_RESERVE"
        ? formatSalesSummary(ctx, priority, adminLink)
        : formatSACSummary(ctx, priority, adminLink);

    return {
        queue,
        priority,
        summary,
        adminLink,
        slaMinutes,
    };
}

/**
 * Calcula o deadline de SLA baseado na fila e prioridade.
 * 
 * @param queue - Fila de escalonamento
 * @param priority - Prioridade do ticket
 * @returns Data/hora limite para atendimento
 */
export function calculateSLADeadline(
    queue: QueueType,
    priority: Priority
): Date {
    const minutes = SLA_MINUTES[queue][priority];
    const deadline = new Date();
    deadline.setMinutes(deadline.getMinutes() + minutes);
    return deadline;
}

// ─── Helper Functions ───

/**
 * Verifica se há slots de produto preenchidos
 */
function hasProductSlots(slots: Slots): boolean {
    return Boolean(slots.product || slots.size || slots.marca);
}

/**
 * Constrói o link para o painel admin
 */
function buildAdminLink(conversationId: string, storeId: string): string {
    const baseUrl = process.env.ADMIN_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    return `${baseUrl}/admin/conversations/${conversationId}?store=${storeId}`;
}

/**
 * Formata resumo para fila de vendas
 */
function formatSalesSummary(
    ctx: HandoffContext,
    priority: Priority,
    link: string
): string {
    const prefix = priority === "URGENT" ? "🚨 [URGENTE] " : "🚨 ";
    const name = ctx.customerName || "Cliente";
    const product = ctx.slots.product || "produto não identificado";
    const size = ctx.slots.size ? `Tam ${ctx.slots.size}` : "";
    const brand = ctx.slots.marca || "";

    const parts = [
        `${prefix}[NOVA RESERVA]`,
        `${name} quer ${product}`,
        size,
        brand && `(${brand})`,
    ].filter(Boolean);

    return `${parts.join(" ")}\n🔗 ${link}`;
}

/**
 * Formata resumo para fila de SAC
 */
function formatSACSummary(
    ctx: HandoffContext,
    priority: Priority,
    link: string
): string {
    const prefix = priority === "URGENT" ? "⚠️ [SAC CRÍTICO]" : "📋 [SAC]";
    const intentDesc = describeIntent(ctx.intent);
    const orderId = ctx.orderId ? `Pedido: #${ctx.orderId}` : "";
    const frustration = ctx.frustrationLevel >= 2 ? `Frustração: ${ctx.frustrationLevel}/3` : "";

    const parts = [
        `${prefix} ${intentDesc}`,
        orderId,
        frustration,
    ].filter(Boolean);

    return `${parts.join(" | ")}\n🔗 ${link}`;
}

/**
 * Descreve a intenção em linguagem natural
 */
function describeIntent(intent: Intent): string {
    const descriptions: Record<Intent, string> = {
        SALES: "Interesse em compra",
        SUPPORT: "Dúvida geral",
        HANDOFF: "Solicitou atendente",
        OBJECTION: "Objeção de venda",
        CLARIFICATION: "Esclarecimento",
        SAC_TROCA: "Troca",
        SAC_ATRASO: "Atraso na entrega",
        SAC_RETIRADA: "Retirada",
        SAC_REEMBOLSO: "Reembolso",
        RESERVATION: "Reserva de produto",
        CLOSING_SALE: "Fechamento de venda",
    };
    return descriptions[intent] || "Atendimento";
}

// ─── Utility Exports ───

/**
 * Retorna os minutos de SLA para uma combinação fila/prioridade
 */
export function getSLAMinutes(queue: QueueType, priority: Priority): number {
    return SLA_MINUTES[queue][priority];
}

/**
 * Verifica se há ameaça legal no histórico
 */
export function hasLegalThreatInHistory(
    conversationHistory: Array<{ role: string; content: string }>
): boolean {
    const userMessages = conversationHistory
        .filter(m => m.role === "user")
        .map(m => m.content.toLowerCase());

    return userMessages.some(msg =>
        LEGAL_THREAT_KEYWORDS.some(keyword => msg.includes(keyword))
    );
}
