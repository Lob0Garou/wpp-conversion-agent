import type { Slots } from '../lib/state-manager';

/**
 * Lead Quente (Hot Lead) Detection
 *
 * Detecta quando o cliente confirma que quer RESERVAR ou demonstra intenção clara
 * de compra imediata (hoje/agora).
 *
 * Sinais de lead quente em pt-BR:
 * - "reservar", "reserva", "separa", "separar", "deixa separado"
 * - "guardar", "quero pegar hoje", "vou buscar hoje", "vou buscar agora"
 * - "quero comprar", "pode reservar", "pode separar"
 * - "já vou", "passo amanhã", "passo hoje"
 */

// Sinais de reserva/confirmação de compra
const RESERVATION_SIGNALS = [
    'reservar',
    'reserva',
    'separa',
    'separar',
    'deixa separado',
    'deixar separado',
    'guardar',
    'guarda',
    'pode reservar',
    'pode separar',
    'quero reservar',
    'queroreservar',
    'pode guardar',
    'guarda pra mim',
];

// Sinais de compra imediata (hoje/agora)
const IMMEDIATE_BUY_SIGNALS = [
    'quero comprar',
    'levar',
    'vou buscar',
    'vou buscar hoje',
    'vou buscar agora',
    'passo buscando',
    'passo pra buscar',
    'passo hoje',
    'passo amanhã',
    'já vou',
    'agora',
    'hoje',
    'pode fazer',
    'fecha comigo',
    'fecha a venda',
];

// Combina todos os sinais
const ALL_HOT_LEAD_SIGNALS = [...RESERVATION_SIGNALS, ...IMMEDIATE_BUY_SIGNALS];

/**
 * isLeadHot: detecta se o cliente é um lead quente (quase fechando venda)
 *
 * @param session - dados da sessão (slots, intent, etc)
 * @param lastUserMessage - última mensagem do usuário
 * @returns true se o cliente demonstrou intenção de reserva/compra imediata
 */
export function isLeadHot(
    session: {
        slots?: Slots;
        intent?: string;
        flags?: {
            wantsReservation?: boolean;
        };
    },
    lastUserMessage: string
): boolean {
    const normalized = lastUserMessage.toLowerCase().trim();

    // A) Verifica flag explícita (se existir no sistema)
    if (session.flags?.wantsReservation === true) {
        return true;
    }

    // B) Verifica sinais de intenção na mensagem
    const hasHotSignal = ALL_HOT_LEAD_SIGNALS.some(signal => normalized.includes(signal));

    return hasHotSignal;
}

/**
 * hasAnyReservationSignal: verifica se a mensagem contém qualquer sinal de reserva
 * (usado para detecção mais granular)
 */
export function hasAnyReservationSignal(message: string): boolean {
    const normalized = message.toLowerCase();
    return RESERVATION_SIGNALS.some(signal => normalized.includes(signal));
}

/**
 * hasImmediateBuySignal: verifica se a mensagem contém sinal de compra imediata
 */
export function hasImmediateBuySignal(message: string): boolean {
    const normalized = message.toLowerCase();
    return IMMEDIATE_BUY_SIGNALS.some(signal => normalized.includes(signal));
}
