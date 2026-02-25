// Arquivo: src/lib/types.ts
// Propósito: Tipos centrais para o Conversation Context

import type { Intent } from "./intent-classifier";
import type { Slots, ConversationStateType, ConversationState as ConversationStateData } from "./state-manager";
import type { AgentAction } from "./action-decider";
import type { StockResult } from "./stock-agent";

/**
 * Contexto da conversa passado para o orchestrator
 * Este é o tipo principal usado nas chamadas do orchestrator
 */
export interface ConversationContext {
    // Campos básicos
    storeId: string;
    conversationId: string;
    customerId: string;
    customerPhone: string;
    state: ConversationStateData;
    slots: Slots;
    lastIntent?: Intent;
    lastAction?: AgentAction;
    messages: Array<{
        direction: 'inbound' | 'outbound';
        content: string;
        timestamp: Date;
    }>;
    // Campos adicionais necessários para action-decider
    intent?: Intent;
    frustrationLevel?: number;
    lastQuestionType?: string | null;
    hasClosingSignal?: boolean;
    // Campos para guardrails e stock
    stockResult?: StockResult;
    customerName?: string;
    // Campos do context-builder (para compatibilidade)
    currentState?: ConversationStateType;
    detectedIntent?: Intent;
    stallCount?: number;
    messageCount?: number;
    conversationHistory?: { role: "user" | "assistant"; content: string }[];
    availableProducts?: any[];
    slotExtraction?: {
        hasNewData: boolean;
        extracted: Record<string, any>;
    };
    userMessage?: string;
    storeName?: string;
}

/**
 * Estados da conversa
 */
export type ConversationState =
    | 'greeting'
    | 'discovery'
    | 'proposal'
    | 'objection'
    | 'closing'
    | 'post_sale'
    | 'support'
    | 'support_sac';

/**
 * Resultado do action-decider
 */
export interface ActionResult {
    action: AgentAction;
    reason?: string;
}

/**
 * Resultado do template match
 */
export interface TemplateMatchResult {
    templateId: string;
    text: string;
    slotsFilled: boolean;
    slotsMissing?: string[];
}

/**
 * Resultado do guardrail
 */
export interface GuardrailResult {
    approved: boolean;
    reason?: string;
    fallback?: string;
    modifiedReply?: string;
    shouldEscalate?: boolean;
}

/**
 * Resultado LLM
 */
export interface LLMResult {
    text: string;
    model: string;
    tokens: number;
    requiresHuman?: boolean;
}
