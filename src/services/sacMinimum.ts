import type { Slots } from '../lib/state-manager';

/**
 * SAC Minimum Data Tracker (OTIMIZADO)
 *
 * Os 3 dados mínimos necessários para abrir um chamado SAC:
 * 1. Nome completo do cliente
 * 2. Número do pedido OU email cadastrado (qualquer um é aceito)
 * 3. Descrição breve do problema
 *
 * O bot pede os 3 dados de uma vez na primeira mensagem SAC.
 */

export interface SacMissingData {
    missingName: boolean;
    missingOrderOrEmail: boolean;
    missingProblem: boolean;
}

/**
 * getMissingSacData: retorna os campos SAC faltantes
 *
 * Retorna objeto indicando quais dados estão faltando.
 *
 * REGRA DE NEGÓCIO (policy_ground_truth.md):
 * - Loja física: CPF + problema (pedido é OPCIONAL)
 * - Site/app: CPF + pedido
 */
export function getMissingSacData(
    customerName: string | null | undefined,
    slots: Slots,
    sacData?: { email?: string }
): SacMissingData {
    const effectiveName = (customerName || slots.customerName || "").trim();
    const missingName = !effectiveName || effectiveName.length < 3;

    const hasOrderId = Boolean(slots.orderId);
    const hasEmail = Boolean(sacData?.email || slots.email);
    const hasCPF = Boolean(slots.cpf);

    // Loja física: pedido é OPCIONAL, só precisa CPF
    // Site/app ou não definido: precisa de pedido OU email
    const isLojaFisica = slots.canalVenda === "loja_fisica";
    const missingOrderOrEmail = isLojaFisica
        ? !hasCPF // Loja física: só precisa de CPF
        : !hasOrderId && !hasEmail; // Site/app: precisa de pedido ou email

    const hasProblem = Boolean(slots.motivoTroca || slots.statusPedido);
    const missingProblem = !hasProblem;

    return {
        missingName,
        missingOrderOrEmail,
        missingProblem,
    };
}

/**
 * hasAnyMissingSacData: verifica se algum dado está faltando
 */
export function hasAnyMissingSacData(
    customerName: string | null | undefined,
    slots: Slots,
    sacData?: { email?: string }
): boolean {
    const missing = getMissingSacData(customerName, slots, sacData);
    return missing.missingName || missing.missingOrderOrEmail || missing.missingProblem;
}

/**
 * buildSacQuestion: gera PERGUNTA ÚNICA pedindo todos os dados faltantes
 *
 * Uma única mensagem com todos os dados necessários.
 *
 * @param missingData - Dados faltantes identificados
 * @param slots - Slots atuais para verificar contexto (loja física vs site)
 */
export function buildSacQuestion(missingData: SacMissingData, slots?: Slots): string {
    const parts: string[] = [];
    const isLojaFisica = slots?.canalVenda === "loja_fisica";

    if (missingData.missingName) {
        parts.push('nome completo');
    }

    if (missingData.missingOrderOrEmail) {
        // Loja física: pede CPF, não pedido
        // Site/app: pede número do pedido ou email
        if (isLojaFisica) {
            parts.push('seu CPF');
        } else {
            parts.push('número do pedido ou email');
        }
    }

    if (missingData.missingProblem) {
        parts.push('o que aconteceu');
    }

    if (parts.length === 0) {
        return '';
    }

    // Uma pergunta única com todos os dados
    return `Para abrir o atendimento, me passa: ${parts.join(', ')}.`;
}

/**
 * isSacDataComplete: verifica se todos os dados mínimos SAC estão presentes
 */
export function isSacDataComplete(
    customerName: string | null | undefined,
    slots: Slots,
    sacData?: { email?: string }
): boolean {
    return !hasAnyMissingSacData(customerName, slots, sacData);
}

// Alias para compatibilidade com código existente
export type SacMissingField = 'NAME' | 'ORDER_OR_EMAIL' | 'PROBLEM' | null;

export function getMissingSacField(
    customerName: string | null | undefined,
    slots: Slots,
    sacData?: { email?: string }
): SacMissingField {
    const missing = getMissingSacData(customerName, slots, sacData);

    if (missing.missingName) return 'NAME';
    if (missing.missingOrderOrEmail) return 'ORDER_OR_EMAIL';
    if (missing.missingProblem) return 'PROBLEM';

    return null;
}
