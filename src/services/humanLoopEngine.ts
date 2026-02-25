import type { StockResult } from '../lib/stock-agent';
import type { Slots } from '../lib/state-manager';
import type { Intent } from '../lib/intent-classifier';
import { humanLoopConfig } from '../config/humanLoop.config';
import { isLeadHot } from './leadHot';

// Tipo para razão do handoff
export type HandoffReason = 'RESERVA_CONFIRMADA' | 'SEM_ESTOQUE_CONVERTER';

// Interface estendida para sessão com flags
export interface HumanLoopSessionExtended extends HumanLoopSession {
    flags?: {
        wantsReservation?: boolean;
    };
}

export interface HumanLoopSession {
    intent: Intent;
    slots: Slots;
    botStatus: 'BOT' | 'HUMAN';
    alertSent: {
        type: 'SALE' | 'SAC';
        sentAt: Date;
        messageId: string;
        groupId: string;
    } | null;
}

/**
 * Detecta se a mensagem do cliente contém sinais de alta intenção de compra
 */
function hasHighIntentSignal(message: string): boolean {
    const normalized = message.toLowerCase();
    return humanLoopConfig.highIntentSignals.some(signal => normalized.includes(signal));
}

/**
 * Converte confidence string para valor numérico (0-1)
 */
function confidenceToNumber(confidence: string): number {
    switch (confidence) {
        case 'ALTA': return 0.9;
        case 'MEDIA': return 0.6;
        case 'BAIXA': return 0.3;
        default: return 0.5;
    }
}

/**
 * Verifica se temos produto com atributos suficientes para acionar o handoff.
 *
 * Regra: marca sozinha NÃO é suficiente.
 * O vendedor precisa saber QUAL produto buscar, não só a marca.
 *
 * Suficiente:
 *   - modelo específico (product ≠ marca) + tamanho/gênero  → ex: "ultraboost 40"
 *   - categoria + tamanho/gênero                            → ex: "tênis adidas 40"
 *
 * Insuficiente:
 *   - só marca + tamanho                                    → ex: "adidas 40" (falta modelo/categoria)
 */
function hasSufficientProductInfo(slots: Slots): boolean {
    // product sendo apenas a marca não qualifica como modelo específico
    // (slots.product e slots.marca são normalizados da mesma forma pelo extractor)
    const isProductJustBrand = Boolean(
        slots.product && slots.marca &&
        slots.product.toLowerCase() === slots.marca.toLowerCase()
    );

    const hasSpecificModel = Boolean(slots.product && !isProductJustBrand);
    const hasCategory = Boolean(slots.categoria);

    const hasSize = Boolean(slots.size);
    const hasGenero = Boolean(slots.genero);

    // Regras mínimas por categoria para evitar handoff precoce.
    if (slots.categoria === "vestuario") {
        return (hasSpecificModel || hasCategory) && hasSize;
    }
    if (slots.categoria === "tenis" || slots.categoria === "chuteira" || slots.categoria === "sandalia") {
        return (hasSpecificModel || hasCategory) && hasSize;
    }

    // Demais categorias (ex.: mochila) podem seguir com genero/estilo.
    return (hasSpecificModel || hasCategory) && (hasSize || hasGenero);
}

/**
 * shouldCreateSaleAlert: determina se devemos enviar alerta para o grupo de vendas
 *
 * Regras:
 * - intent === 'SALES'
 * - produto com nome/modelo existe
 * - pelo menos size OU color existe
 * - NENHUM alerta enviado nesta sessão
 * - alta intenção OU estoque indisponível OU baixa confiança
 */
export function shouldCreateSaleAlert(session: HumanLoopSession): boolean {
    // Só alertas de vendas
    if (session.intent !== 'SALES') {
        return false;
    }

    // Já enviou alerta nesta sessão?
    if (session.alertSent !== null) {
        return false;
    }

    // Precisa de info suficiente do produto
    if (!hasSufficientProductInfo(session.slots)) {
        return false;
    }

    return true;
}

/**
 * shouldHandoffToHuman: determina se devemos transferir para atendimento humano
 *
 * Regras:
 * - intent === 'SALES'
 * - stockResult.status é 'UNAVAILABLE' OU confidence < 0.70
 * - cliente mostra intenção de comprar (intentScore > 0.75 OU mensagem contém sinais)
 * - sessão NÃO está em modo HUMAN
 */
export function shouldHandoffToHuman(
    session: HumanLoopSession,
    stockResult: StockResult,
    userMessage: string,
    intentScore: number = 0.5
): boolean {
    // Só transfere se não está já em modo human
    if (session.botStatus === 'HUMAN') {
        return false;
    }

    // Só transfere em intent de vendas
    if (session.intent !== 'SALES') {
        return false;
    }

    // Verifica se temos info suficiente do produto
    if (!hasSufficientProductInfo(session.slots)) {
        return false;
    }

    // Condição 1: Estoque indisponível OU baixa confiança
    const isUnavailable = stockResult.status === 'UNAVAILABLE';
    const isLowConfidence = confidenceToNumber(stockResult.confidence) < 0.70;
    const needsHumanCheck = stockResult.status === 'NEEDS_HUMAN_CHECK';

    if (!isUnavailable && !isLowConfidence && !needsHumanCheck) {
        return false;
    }

    // Condição 2: Cliente mostra intenção de comprar
    // Pode ser via intentScore alto OU sinais na mensagem
    const hasBuyingIntent = intentScore > 0.75 || hasHighIntentSignal(userMessage);

    if (!hasBuyingIntent) {
        return false;
    }

    return true;
}

/**
 * shouldCreateSACAlert: determina se devemos enviar alerta para SAC
 * (Implementação similar para SAC)
 */
export function shouldCreateSACAlert(session: HumanLoopSession): boolean {
    // Verifica se é intent de SAC
    const sacIntents = ['SAC_TROCA', 'SAC_ATRASO', 'SAC_RETIRADA', 'SAC_REEMBOLSO', 'SUPPORT'];
    if (!sacIntents.includes(session.intent)) {
        return false;
    }

    // Já enviou alerta nesta sessão?
    if (session.alertSent !== null) {
        return false;
    }

    return true;
}

// ─── NOVAS FUNÇÕES PARA LEAD QUENTE ───

/**
 * shouldHandoffOnReservation: determina se devemos transferir quando cliente confirma reserva
 *
 * PRIORIDADE 1 - Este é o caminho prioritário!
 * Se o cliente demonstra intenção clara de reserva/compra, transfere para humano
 * INDEPENDENTEMENTE se o estoque está disponível.
 *
 * Regras:
 * - intent === 'SALES'
 * - isLeadHot() === true (cliente quer reservar/comprar agora)
 * - sessão NÃO está em modo HUMAN
 */
export function shouldHandoffOnReservation(
    session: HumanLoopSession,
    userMessage: string
): boolean {
    // Já está em modo human?
    if (session.botStatus === 'HUMAN') {
        return false;
    }

    // Só em intent de vendas
    if (session.intent !== 'SALES') {
        return false;
    }

    // Verifica se tem info mínima do produto
    if (!hasSufficientProductInfo(session.slots)) {
        return false;
    }

    // Verifica se é lead quente (quer reservar/comprar agora)
    return isLeadHot({ slots: session.slots, intent: session.intent }, userMessage);
}

/**
 * evaluateHandoff: função principal que avalia se deve fazer handoff
 *
 * PRIORIDADES:
 * 1. Se cliente quer reserva (lead quente) → handoff independente do estoque
 * 2. Se estoque indisponível + alta intenção → handoff
 * 3. Caso contrário → continua fluxo normal do bot
 *
 * Retorna: { shouldHandoff: boolean, reason: HandoffReason | null }
 */
export function evaluateHandoff(
    session: HumanLoopSession,
    stockResult: StockResult,
    userMessage: string,
    intentScore: number = 0.5
): { shouldHandoff: boolean; reason: HandoffReason | null } {
    // Prioridade 1: Lead quente (quer reserva) - transfere mesmo com estoque disponível
    if (shouldHandoffOnReservation(session, userMessage)) {
        return { shouldHandoff: true, reason: 'RESERVA_CONFIRMADA' };
    }

    // Prioridade 2: Estoque indisponível + alta intenção de compra
    const isUnavailable = stockResult.status === 'UNAVAILABLE';
    const isLowConfidence = confidenceToNumber(stockResult.confidence) < 0.70;
    const needsHumanCheck = stockResult.status === 'NEEDS_HUMAN_CHECK';

    const stockIssue = isUnavailable || isLowConfidence || needsHumanCheck;
    const hasBuyingIntent = intentScore > 0.75 || hasHighIntentSignal(userMessage);

    if (stockIssue && hasBuyingIntent && hasSufficientProductInfo(session.slots)) {
        return { shouldHandoff: true, reason: 'SEM_ESTOQUE_CONVERTER' };
    }

    // Não faz handoff - continua fluxo normal
    return { shouldHandoff: false, reason: null };
}
