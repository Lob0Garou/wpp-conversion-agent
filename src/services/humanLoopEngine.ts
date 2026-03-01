import type { StockResult } from '../lib/stock-agent';
import type { Slots } from '../lib/state-manager';
import type { Intent } from '../lib/intent-classifier';
import { humanLoopConfig } from '../config/humanLoop.config';
import { isLeadHot } from './leadHot';

// Tipo para razÃ£o do handoff
export type HandoffReason = 'RESERVA_CONFIRMADA' | 'SEM_ESTOQUE_CONVERTER' | 'DADOS_VENDA_COLETADOS';

// Interface estendida para sessÃ£o com flags
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
 * Detecta se a mensagem do cliente contÃ©m sinais de alta intenÃ§Ã£o de compra
 */
function hasHighIntentSignal(message: string): boolean {
    const normalized = message.toLowerCase();
    return humanLoopConfig.highIntentSignals.some(signal => normalized.includes(signal));
}

/**
 * Converte confidence string para valor numÃ©rico (0-1)
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
 * REGRA: MÃ­nimo 3 dados para handoff de vendas:
 * 1. Nome do item/produto (slots.product)
 * 2. Marca (slots.marca)
 * 3. NÃºmero/tamanho (slots.size)
 *
 * Isso evita handoff precoce e garante que o vendedor tenha contexto completo.
 */
function hasSufficientProductInfo(slots: Slots): boolean {
    // Product sendo apenas a marca não qualifica como item válido
    const isProductJustBrand = Boolean(
        slots.product && slots.marca &&
        slots.product.toLowerCase() === slots.marca.toLowerCase()
    );

    const hasProduct = Boolean(slots.product && !isProductJustBrand);
    const hasSize = Boolean(slots.size);
    const hasQualifier = Boolean(slots.usage || slots.timeFutebol);

    return hasProduct && hasSize && hasQualifier;
}

/**
 * shouldCreateSaleAlert: determina se devemos enviar alerta para o grupo de vendas
 *
 * Regras:
 * - intent === 'SALES'
 * - produto com nome/modelo existe
 * - pelo menos size OU color existe
 * - NENHUM alerta enviado nesta sessÃ£o
 * - alta intenÃ§Ã£o OU estoque indisponÃ­vel OU baixa confianÃ§a
 */
export function shouldCreateSaleAlert(session: HumanLoopSession): boolean {
    // SÃ³ alertas de vendas
    if (session.intent !== 'SALES') {
        return false;
    }

    // JÃ¡ enviou alerta nesta sessÃ£o?
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
 * - stockResult.status Ã© 'UNAVAILABLE' OU confidence < 0.70
 * - cliente mostra intenÃ§Ã£o de comprar (intentScore > 0.75 OU mensagem contÃ©m sinais)
 * - sessÃ£o NÃƒO estÃ¡ em modo HUMAN
 */
export function shouldHandoffToHuman(
    session: HumanLoopSession,
    stockResult: StockResult,
    userMessage: string,
    intentScore: number = 0.5
): boolean {
    // SÃ³ transfere se nÃ£o estÃ¡ jÃ¡ em modo human
    if (session.botStatus === 'HUMAN') {
        return false;
    }

    // SÃ³ transfere em intent de vendas
    if (session.intent !== 'SALES') {
        return false;
    }

    // Verifica se temos info suficiente do produto
    if (!hasSufficientProductInfo(session.slots)) {
        return false;
    }

    // CondiÃ§Ã£o 1: Estoque indisponÃ­vel OU baixa confianÃ§a
    const isUnavailable = stockResult.status === 'UNAVAILABLE';
    const isLowConfidence = confidenceToNumber(stockResult.confidence) < 0.70;
    const needsHumanCheck = stockResult.status === 'NEEDS_HUMAN_CHECK';

    if (!isUnavailable && !isLowConfidence && !needsHumanCheck) {
        return false;
    }

    // CondiÃ§Ã£o 2: Cliente mostra intenÃ§Ã£o de comprar
    // Pode ser via intentScore alto OU sinais na mensagem
    const hasBuyingIntent = intentScore > 0.75 || hasHighIntentSignal(userMessage);

    if (!hasBuyingIntent) {
        return false;
    }

    return true;
}

/**
 * shouldCreateSACAlert: determina se devemos enviar alerta para SAC
 * (ImplementaÃ§Ã£o similar para SAC)
 */
export function shouldCreateSACAlert(session: HumanLoopSession): boolean {
    // Verifica se Ã© intent de SAC
    const sacIntents = ['SAC_TROCA', 'SAC_ATRASO', 'SAC_RETIRADA', 'SAC_REEMBOLSO', 'SUPPORT'];
    if (!sacIntents.includes(session.intent)) {
        return false;
    }

    // JÃ¡ enviou alerta nesta sessÃ£o?
    if (session.alertSent !== null) {
        return false;
    }

    return true;
}

// â”€â”€â”€ NOVAS FUNÃ‡Ã•ES PARA LEAD QUENTE â”€â”€â”€

/**
 * shouldHandoffOnReservation: determina se devemos transferir quando cliente confirma reserva
 *
 * PRIORIDADE 1 - Este Ã© o caminho prioritÃ¡rio!
 * Se o cliente demonstra intenÃ§Ã£o clara de reserva/compra, transfere para humano
 * INDEPENDENTEMENTE se o estoque estÃ¡ disponÃ­vel.
 *
 * Regras:
 * - intent === 'SALES'
 * - isLeadHot() === true (cliente quer reservar/comprar agora)
 * - sessÃ£o NÃƒO estÃ¡ em modo HUMAN
 */
export function shouldHandoffOnReservation(
    session: HumanLoopSession,
    userMessage: string
): boolean {
    // JÃ¡ estÃ¡ em modo human?
    if (session.botStatus === 'HUMAN') {
        return false;
    }

    // SÃ³ em intent de vendas
    if (session.intent !== 'SALES') {
        return false;
    }

    // Verifica se tem info mÃ­nima do produto
    if (!hasSufficientProductInfo(session.slots)) {
        return false;
    }

    // Verifica se Ã© lead quente (quer reservar/comprar agora)
    return isLeadHot({ slots: session.slots, intent: session.intent }, userMessage);
}

/**
 * evaluateHandoff: funÃ§Ã£o principal que avalia se deve fazer handoff
 *
 * PRIORIDADES:
 * 1. Se cliente quer reserva (lead quente) â†’ handoff independente do estoque
 * 2. Se estoque indisponÃ­vel + alta intenÃ§Ã£o â†’ handoff
 * 3. Caso contrÃ¡rio â†’ continua fluxo normal do bot
 *
 * Retorna: { shouldHandoff: boolean, reason: HandoffReason | null }
 */
export function evaluateHandoff(
    session: HumanLoopSession,
    stockResult: StockResult,
    userMessage: string,
    intentScore: number = 0.5
): { shouldHandoff: boolean; reason: HandoffReason | null } {
    // Prioridade 1: Lead quente (quer reserva) - transfere mesmo com estoque disponÃ­vel
    if (shouldHandoffOnReservation(session, userMessage)) {
        return { shouldHandoff: true, reason: 'RESERVA_CONFIRMADA' };
    }

    // Prioridade 2: dados de venda completos - repasse para fechamento humano
    if (session.intent === 'SALES' && hasSufficientProductInfo(session.slots)) {
        return { shouldHandoff: true, reason: 'DADOS_VENDA_COLETADOS' };
    }

    // Prioridade 3: Estoque indisponÃ­vel + alta intenÃ§Ã£o de compra
    const isUnavailable = stockResult.status === 'UNAVAILABLE';
    const isLowConfidence = confidenceToNumber(stockResult.confidence) < 0.70;
    const needsHumanCheck = stockResult.status === 'NEEDS_HUMAN_CHECK';

    const stockIssue = isUnavailable || isLowConfidence || needsHumanCheck;
    const hasBuyingIntent = intentScore > 0.75 || hasHighIntentSignal(userMessage);

    if (stockIssue && hasBuyingIntent && hasSufficientProductInfo(session.slots)) {
        return { shouldHandoff: true, reason: 'SEM_ESTOQUE_CONVERTER' };
    }

    // NÃ£o faz handoff - continua fluxo normal
    return { shouldHandoff: false, reason: null };
}

