/**
 * Response Controller - Deterministic LLM Behavior Enforcement
 *
 * This layer ensures the LLM follows action-decider decisions STRICTLY.
 * No improvisation, no free-form responses - the action controls the response.
 */

import type { AgentAction } from './action-decider';
import type { Slots } from './state-manager';

export interface ResponseTemplate {
    template: string;
    requiredSlots: string[];
    mustInclude: string[];
    mustNotInclude: string[];
    examples: string[];
}

function getMaxWordsByAction(action: AgentAction): number {
    switch (action) {
        case 'REQUEST_ORDER_DATA':
        case 'PROVIDE_POLICY':
        case 'LLM_FALLBACK':
            return 35;
        case 'ESCALATE':
            return 22;
        default:
            return 24;
    }
}

/**
 * Response Controller - maps actions to STRICT response templates
 *
 * The LLM MUST use these templates. No deviation allowed.
 */
export function getResponseTemplate(
    action: AgentAction,
    slots: Slots,
    intent: string
): ResponseTemplate {
    switch (action) {
        case 'ASK_SIZE':
            return {
                template: 'Pergunte a numeração/tamanho do produto.',
                requiredSlots: [],
                mustInclude: ['pergunte', 'tamanho', 'número', 'numeração'],
                mustNotInclude: ['reserva', 'disponível', 'tenho'],
                examples: [
                    'Qual numeração você usa?',
                    'Qual tamanho você precisa?',
                    'Qual número calça?'
                ]
            };

        case 'ASK_USAGE':
            return {
                template: 'Pergunte o uso/intenção do produto.',
                requiredSlots: [],
                mustInclude: ['pergunte', 'uso', 'para que', 'intenção'],
                mustNotInclude: ['reserva', 'tenho', 'disponível'],
                examples: [
                    'Para qual uso? Corrida, academia ou dia a dia?',
                    'Você vai usar para quê?',
                    'Qual a intenção do produto? Corrida, academia...?'
                ]
            };

        case 'ASK_PRODUCT':
            return {
                template: 'Pergunte qual produto o cliente procura.',
                requiredSlots: [],
                mustInclude: ['pergunte', 'produto', 'procurar', 'quer'],
                mustNotInclude: ['reserva', 'tenho', 'disponível'],
                examples: [
                    'Qual produto você está procurando?',
                    'O que você precisa?',
                    'Qual tênis/modelo você quer?'
                ]
            };

        case 'SHOW_PRODUCT':
            const hasProduct = slots.product || slots.categoria;
            if (!hasProduct) {
                return getResponseTemplate('ASK_PRODUCT', slots, intent);
            }
            return {
                template: 'Mostre o produto encontrado com detalhes.',
                requiredSlots: ['product', 'size'],
                mustInclude: ['produto', 'descrição', 'detalhe'],
                mustNotInclude: ['reserva', 'separar'],
                examples: [
                    'Temos o [PRODUTO]!',
                    'Encontrei o [PRODUTO] tamanho [TAMANHO].'
                ]
            };

        case 'OFFER_RESERVATION':
            // Must confirm availability first, then induce reservation
            const hasFullInfo = (slots.product && slots.size) || slots.categoria;
            if (!hasFullInfo) {
                // Missing info - ask for it first
                if (!slots.size) {
                    return getResponseTemplate('ASK_SIZE', slots, intent);
                }
                return getResponseTemplate('ASK_PRODUCT', slots, intent);
            }
            return {
                template: 'CONFIRME disponibilidade E ofereça reserva.',
                requiredSlots: ['product', 'size'],
                mustInclude: ['temos', 'disponível', 'separar', 'reserva'],
                mustNotInclude: [],
                examples: [
                    'Temos! Posso separar agora?',
                    'Está disponível! Quer que separe pra você?',
                    'A reserva é gratuita e vale 24h. Quer separar?'
                ]
            };

        case 'REQUEST_ORDER_DATA':
            return {
                template: 'Solicite TODOS os dados necessários de uma vez.',
                requiredSlots: [],
                mustInclude: ['nome', 'pedido', 'e-mail', 'cpf'],
                mustNotInclude: [],
                examples: [
                    'Para abrir o atendimento, me passa: nome completo, número do pedido e e-mail.',
                    'Me passa: seu nome, e-mail e número do pedido.'
                ]
            };

        case 'PROVIDE_POLICY':
            return {
                template: 'Informe a política da loja.',
                requiredSlots: [],
                mustInclude: ['política', 'informação', 'prazo'],
                mustNotInclude: ['pergunte', 'preciso'],
                examples: [
                    'A política de troca é...',
                    'O prazo de reembolso é...'
                ]
            };

        case 'ESCALATE':
            return {
                template: 'Escalone para atendimento humano.',
                requiredSlots: [],
                mustInclude: ['atendente', 'humano', 'transferir'],
                mustNotInclude: [],
                examples: [
                    'Vou transferir para um atendente.',
                    'Um humano vai te ajudar.'
                ]
            };

        case 'LLM_FALLBACK':
        default:
            return {
                template: 'Responda adequadamente mantendo tom da Centauro.',
                requiredSlots: [],
                mustInclude: [],
                mustNotInclude: [],
                examples: []
            };
    }
}

/**
 * Validates that the LLM response follows the action template
 * Returns true if response is compliant, false otherwise
 */
export function validateResponseCompliance(
    action: AgentAction,
    response: string,
    slots: Slots
): { compliant: boolean; violations: string[] } {
    const template = getResponseTemplate(action, slots, '');
    const violations: string[] = [];
    const responseLower = response.toLowerCase();

    // Check must-include
    for (const mustInclude of template.mustInclude) {
        if (!responseLower.includes(mustInclude)) {
            violations.push(`Missing required: "${mustInclude}"`);
        }
    }

    // Check must-not-include
    for (const mustNotInclude of template.mustNotInclude) {
        if (responseLower.includes(mustNotInclude)) {
            violations.push(`Forbidden content: "${mustNotInclude}"`);
        }
    }

    return {
        compliant: violations.length === 0,
        violations
    };
}

/**
 * Build strict system prompt for LLM based on action
 * This ensures the LLM CANNOT deviate from the action
 */
export function buildStrictSystemPrompt(
    action: AgentAction,
    slots: Slots,
    intent: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
): string {
    const template = getResponseTemplate(action, slots, intent);
    const maxWords = getMaxWordsByAction(action);

    let prompt = `Você é o assistente virtual da Centauro.

## REGRA ABSOLUTA
A ação determinada pelo sistema é: ${action}
${template.template}

`;

    // Add strict constraints
    prompt += `## CONSTRAINTS\n`;
    prompt += `- Use APENAS as instruções acima\n`;
    prompt += `- Não mude a intenção da resposta (siga a ação definida)\n`;
    prompt += `- Soe natural, como vendedor/atendente humano no WhatsApp\n`;
    prompt += `- Resposta curta, clara e direta (máx ${maxWords} palavras)\n`;
    prompt += `- Evite listar muitas informações de uma vez\n`;

    // Add examples
    if (template.examples.length > 0) {
        prompt += `\n## EXEMPLOS DE RESPOSTAS CORRETAS\n`;
        for (const example of template.examples) {
            prompt += `- ${example}\n`;
        }
    }

    // Add context about current slots
    if (Object.keys(slots).length > 0) {
        prompt += `\n##Slots atuais: ${JSON.stringify(slots)}\n`;
    }

    return prompt;
}
