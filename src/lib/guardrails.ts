import type { ConversationStateType, Slots } from "./state-manager";

interface AgentDecision {
    reply_text: string;
    requires_human: boolean;
}

// ─── Guardrail Check Names for Logging ───────────────────────────────
const GUARDRAIL_CHECK_NAMES = [
    "checkRepetition",
    "checkLength",
    "checkMaxQuestions",
    "checkEngagement",
    "checkFrustrationEscalation",
    "checkStockHallucination",
    "checkPolicyInvention",
    "checkCTAMissing",
    "loopDetection",
];

interface GuardrailContext {
    currentState: ConversationStateType;
    slots: Slots;
    conversationHistory: { role: "user" | "assistant"; content: string }[];
    availableProducts: Array<{ description: string; quantity: number }>;
    frustrationLevel: number;
    intentType?: "SALES" | "SAC_TROCA" | "SAC_ATRASO" | "SAC_RETIRADA" | "SAC_REEMBOLSO" | "INFO" | "HANDOFF" | "STOCK";
    productCatalog?: string[];  // Catálogo de produtos disponíveis
    policyPatterns?: string[]; // Padrões de políticas conhecidas
}

// Configuração de retry
const MAX_RETRY_ATTEMPTS = 2;
const RETRY_DELAY_MS = 100;

export interface GuardrailsResult {
    approved: boolean;
    reason?: string;
    modifiedReply?: string;
    shouldEscalate?: boolean;
    retryCount?: number;
    triedAutoFix?: boolean;
}

// ─── MAIN VALIDATOR ───

/**
 * Valida a resposta do agente com lógica de retry automático.
 * Tenta corrigir automaticamente até MAX_RETRY_ATTEMPTS vezes
 * antes de escalar para humano.
 */
export function validateResponse(
    aiResponse: AgentDecision,
    context: GuardrailContext,
    retryCount: number = 0
): GuardrailsResult {
    // Guard: reply_text não pode ser vazio ou só espaços
    if (!aiResponse.reply_text || !aiResponse.reply_text.trim()) {
        return handleValidationFailure(
            {
                approved: false,
                reason: "reply_text está vazio ou apenas espaços",
                modifiedReply: "Desculpe, um momento por favor. Estou verificando as informações pra você.",
            },
            aiResponse,
            context,
            retryCount
        );
    }

    // Executa todas as validações
    const checks = [
        checkRepetition(aiResponse.reply_text, context.conversationHistory),
        checkLength(aiResponse.reply_text, context.currentState, context.intentType),
        checkMaxQuestions(aiResponse.reply_text),
        checkEngagement(aiResponse.reply_text, context.currentState),
        checkFrustrationEscalation(context.frustrationLevel, aiResponse),
        // Novas validações
        checkStockHallucination(aiResponse.reply_text, context.availableProducts, context.productCatalog),
        checkPolicyInvention(aiResponse.reply_text, context.policyPatterns),
        checkCTAMissing(aiResponse.reply_text, context.currentState, context.intentType),
        loopDetection(context.conversationHistory),
    ];

    // Processa os resultados
    for (const check of checks) {
        if (!check.approved) {
            console.log(`[GUARDRAILS] ❌ ${check.reason}`);

            // Se tem modifiedReply e ainda tem tentativas, tenta corrigir automaticamente
            if (check.modifiedReply && retryCount < MAX_RETRY_ATTEMPTS) {
                console.log(`[GUARDRAILS] 🔄 Tentativa ${retryCount + 1}/${MAX_RETRY_ATTEMPTS} - Tentando corrigir...`);

                // Aplica a correção e revisa
                const correctedResponse: AgentDecision = {
                    ...aiResponse,
                    reply_text: check.modifiedReply,
                };

                // Retry recursivo com a resposta corrigida
                const retryResult = validateResponse(correctedResponse, context, retryCount + 1);

                return {
                    ...retryResult,
                    triedAutoFix: true,
                };
            }

            // Se não tem modifiedReply ou excedeu tentativas, faz handle de falha
            return handleValidationFailure(check, aiResponse, context, retryCount);
        }
    }

    return { approved: true };
}

/**
 * Lida com falha de validação - tenta fallback inteligente
 * Só escala para humano após 2 tentativas falhas
 */
function handleValidationFailure(
    result: GuardrailsResult,
    originalResponse: AgentDecision,
    context: GuardrailContext,
    retryCount: number
): GuardrailsResult {
    // Tentativas esgotadas - escala para humano
    if (retryCount >= MAX_RETRY_ATTEMPTS) {
        console.log(`[GUARDRAILS] ⚠️ Escalando para humano após ${MAX_RETRY_ATTEMPTS} tentativas`);

        return {
            approved: false,
            reason: `${result.reason} - Escalado para humano após ${MAX_RETRY_ATTEMPTS} tentativas`,
            shouldEscalate: true,
            modifiedReply: generateHumanEscalationMessage(context),
            retryCount: retryCount,
            triedAutoFix: true,
        };
    }

    // Se tem modifiedReply, usa ele
    if (result.modifiedReply) {
        return {
            ...result,
            retryCount: retryCount,
            triedAutoFix: true,
        };
    }

    // Gera fallback inteligente baseado no tipo de falha
    const fallbackReply = generateIntelligentFallback(result.reason || "unknown", context);

    return {
        ...result,
        modifiedReply: fallbackReply,
        retryCount: retryCount,
        triedAutoFix: true,
    };
}

/**
 * Gera mensagem de fallback inteligente baseada no contexto
 */
function generateIntelligentFallback(reason: string, context: GuardrailContext): string {
    const state = context.currentState;

    // Mapeia razões para fallbacks específicos
    if (reason?.includes("too long") || reason?.includes("chars") || reason?.includes("words")) {
        return truncateToWords(
            "Entendi. Posso te ajudar melhor com mais detalhes. O que gostaria de saber?",
            15
        );
    }

    if (reason?.includes("Repetition") || reason?.includes("similar")) {
        return "Deixa eu te ajudar de outra forma. O que você precisa saber?";
    }

    if (reason?.includes("questions")) {
        return "Tem alguma dúvida sobre nossos produtos?";
    }

    if (reason?.includes("engagement") || reason?.includes("requires a question")) {
        // Fallback baseado no estado
        if (state === "discovery") {
            return "Qual tipo de produto você está procurando?";
        }
        if (state === "proposal") {
            return "Esse produto te interessa? Posso te passar mais detalhes.";
        }
        return "Posso te ajudar com algo mais?";
    }

    if (reason?.includes("Stock hallucination")) {
        return "Desculpe, não tenho esse produto disponível no momento. Posso te mostrar outras opções?";
    }

    if (reason?.includes("Policy invention")) {
        return "Posso verificar essa informação pra você. O que gostaria de saber sobre nossas políticas?";
    }

    if (reason?.includes("CTA missing")) {
        return "Posso te ajudar em algo mais?";
    }

    if (reason?.includes("Loop detected")) {
        return "Parece que estamos em um loop. Posso te transferir para um atendimento humano?";
    }

    // Fallback genérico
    return "Desculpe, estou tendo dificuldade. Posso te ajudar de outra forma?";
}

/**
 * Gera mensagem de escalação para humano
 */
function generateHumanEscalationMessage(context: GuardrailContext): string {
    if (context.frustrationLevel >= 3) {
        return "Compreendo sua frustração. Vou te passar para a equipe resolver isso agora mesmo.";
    }

    return "Desculpe, estou tendo dificuldade para te ajudar. Vou transferir para um atendimento humano.";
}

// ─── INDIVIDUAL CHECKS ───

function checkRepetition(reply: string, history: { role: "user" | "assistant"; content: string }[]): GuardrailsResult {
    const lastBotMessages = history
        .filter((h) => h.role === "assistant")
        .map((h) => h.content.toLowerCase().trim())
        .slice(-2);

    const replyLower = reply.toLowerCase().trim();

    for (const lastMsg of lastBotMessages) {
        if (lastMsg && similarity(replyLower, lastMsg) > 0.8) {
            return {
                approved: false,
                reason: "Reply too similar to previous bot message",
                modifiedReply: generateVariation(reply),
            };
        }
    }

    return { approved: true };
}

/**
 * Verifica se a resposta está dentro do limite de caracteres E palavras.
 *
 * Limites de caracteres (atualizados para o sistema híbrido):
 * - SALES: máx 240 chars
 * - STOCK: máx 220 chars
 * - INFO: máx 180 chars
 * - SAC: máx 320 chars
 * - HANDOFF: máx 180 chars
 *
 * Limites de palavras (hard-coded para força):
 * - SALES: 15 palavras
 * - SAC: 20 palavras
 * - INFO: 10 palavras
 */
function checkLength(reply: string, state: ConversationStateType, intentType?: "SALES" | "SAC_TROCA" | "SAC_ATRASO" | "SAC_RETIRADA" | "SAC_REEMBOLSO" | "INFO" | "HANDOFF" | "STOCK"): GuardrailsResult {
    // Limite de caracteres baseado no intent type
    const maxLen = getMaxCharsByIntent(intentType, state);

    if (reply.length > maxLen) {
        return {
            approved: false,
            reason: `Reply too long (${reply.length} chars, max ${maxLen})`,
            modifiedReply: truncateAtSentence(reply, maxLen - 30),
        };
    }

    // Limite de palavras - mais restritivo (hard-coded)
    const maxWords = getMaxWordsStrict(state, intentType);
    const wordCount = countWords(reply);

    if (wordCount > maxWords) {
        return {
            approved: false,
            reason: `Reply too long (${wordCount} words, max ${maxWords})`,
            modifiedReply: truncateToWords(reply, maxWords - 2),
        };
    }

    return { approved: true };
}

/**
 * Retorna o limite de caracteres baseado no intent type.
 * Segue a especificação do sistema híbrido Templates + LLM.
 */
function getMaxCharsByIntent(
    intentType?: "SALES" | "SAC_TROCA" | "SAC_ATRASO" | "SAC_RETIRADA" | "SAC_REEMBOLSO" | "INFO" | "HANDOFF" | "STOCK",
    state?: ConversationStateType
): number {
    // Mapeamento de intents para limites de caracteres
    const intentLimits: Record<string, number> = {
        SALES: 240,
        STOCK: 220,
        INFO: 180,
        SAC_TROCA: 320,
        SAC_ATRASO: 320,
        SAC_RETIRADA: 320,
        SAC_REEMBOLSO: 320,
        HANDOFF: 180,
        SUPPORT: 320,
        OBJECTION: 240,
        CLARIFICATION: 200,
    };

    // Se tem intentType, usar o limite correspondente
    if (intentType && intentLimits[intentType]) {
        return intentLimits[intentType];
    }

    // Fallback baseado no estado
    if (state === "support" || state === "support_sac") return 320;
    if (state === "greeting") return 150;
    return 240; // Default para sales flow
}

/**
 * Limites de palavras hard-coded (forçado)
 */
function getMaxWordsStrict(state: ConversationStateType, intentType?: string): number {
    // Usar intent type se disponível
    if (intentType === "SALES") return 28;
    if (intentType === "SAC_TROCA" || intentType === "SAC_ATRASO" || intentType === "SAC_RETIRADA" || intentType === "SAC_REEMBOLSO") return 28;
    if (intentType === "INFO") return 14;

    // Fallback por estado
    if (state === "support" || state === "support_sac") return 28;
    if (state === "greeting") return 12;
    if (state === "proposal" || state === "objection" || state === "closing") return 26;
    return 18; // discovery, post_sale
}

/**
 * Determina o limite de palavras baseado no estado e intent.
 */
function getMaxWords(state: ConversationStateType, intentType?: string): number {
    // Primeiro tenta usar o intentType se fornecido
    if (intentType === "SALES") return parseInt(process.env.MAX_AGENT_WORDS_SALES || "10");
    if (intentType === "SAC_TROCA") return parseInt(process.env.MAX_AGENT_WORDS_SAC_TROCA || "15");
    if (intentType === "SAC_ATRASO") return parseInt(process.env.MAX_AGENT_WORDS_SAC_ATRASO || "15");
    if (intentType === "INFO") return parseInt(process.env.MAX_AGENT_WORDS_INFO || "6");

    // Fallback baseado no estado
    if (state === "support" || state === "support_sac") return parseInt(process.env.MAX_AGENT_WORDS_SAC_TROCA || "15");
    if (state === "greeting") return parseInt(process.env.MAX_AGENT_WORDS_INFO || "6");
    // discovery, proposal, objection, closing, post_sale
    return parseInt(process.env.MAX_AGENT_WORDS_SALES || "10");
}

/**
 * Conta o número de palavras em um texto.
 */
function countWords(text: string): number {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Trunca o texto para o número máximo de palavras.
 */
function truncateToWords(text: string, maxWords: number): string {
    const words = text.trim().split(/\s+/);
    if (words.length <= maxWords) return text;

    const truncated = words.slice(0, maxWords).join(" ");
    // Tenta terminar em pontuação completa
    const lastPunct = Math.max(
        truncated.lastIndexOf("."),
        truncated.lastIndexOf("?"),
        truncated.lastIndexOf("!"),
        truncated.lastIndexOf(",")
    );

    if (lastPunct > maxWords * 3) { // Se tem pontuação razoável
        return truncated.substring(0, lastPunct + 1);
    }

    return truncated + "...";
}

/**
 * Verifica se a resposta tem no máximo 1 pergunta.
 * O sistema híbrido usa templates com máximo de 1 pergunta por resposta.
 * Respostas com mais de 1 "?" são truncadas.
 */
function checkMaxQuestions(reply: string): GuardrailsResult {
    const questionCount = (reply.match(/\?/g) || []).length;

    if (questionCount > 1) {
        // Truncar na segunda pergunta
        const firstQuestionIdx = reply.indexOf("?");
        const secondQuestionIdx = reply.indexOf("?", firstQuestionIdx + 1);

        if (secondQuestionIdx !== -1) {
            const truncated = reply.substring(0, secondQuestionIdx).trim();
            return {
                approved: false,
                reason: `Reply has ${questionCount} questions (max 1)`,
                modifiedReply: truncated,
            };
        }
    }

    return { approved: true };
}

/**
 * Verifica se a resposta contém pelo menos uma pergunta em estados onde
 * o engajamento é crítico para avançar a conversa.
 *
 * Estados críticos: discovery (coletar info) e proposal (confirmar escolha).
 * Para esses estados, uma resposta sem "?" não avança a conversa → reprovada.
 */
function checkEngagement(reply: string, state: ConversationStateType): GuardrailsResult {
    const ENGAGEMENT_REQUIRED_STATES: ConversationStateType[] = ["discovery", "proposal"];
    const replyLower = reply.toLowerCase();
    const hasQuestion = reply.includes("?");
    const hasCtaSignal = ["posso", "quer", "vamos", "te mostro", "te passo", "reservo", "separo"]
        .some((token) => replyLower.includes(token));

    if (ENGAGEMENT_REQUIRED_STATES.includes(state) && !hasQuestion && !hasCtaSignal) {
        console.log(`[GUARDRAILS] ⚠️ Estado "${state}" sem pergunta de engajamento — modificando resposta.`);
        const engagementPrompt = state === "discovery"
            ? "Pra eu te indicar melhor, qual uso você procura?"
            : "Quer que eu te indique a melhor opção pra você?";
        return {
            approved: false,
            reason: `State "${state}" requires engagement question or CTA`,
            modifiedReply: `${reply.trimEnd()} ${engagementPrompt}`.trim(),
        };
    }

    // Soft warning para outros estados (não rejeita)
    if (!["closing", "post_sale", "support"].includes(state) && !hasQuestion) {
        console.log(`[GUARDRAILS] ℹ️ Reply no estado "${state}" sem pergunta (aviso, não rejeição)`);
    }

    return { approved: true };
}

function checkFrustrationEscalation(
    frustrationLevel: number,
    aiResponse: AgentDecision
): GuardrailsResult {
    if (frustrationLevel >= 3 && !aiResponse.requires_human) {
        return {
            approved: false,
            reason: "High frustration but not escalating",
            shouldEscalate: true,
            modifiedReply: "Compreendo sua frustração. Vou te passar para a equipe resolver isso agora mesmo.",
        };
    }

    return { approved: true };
}

// ─── NOVAS VALIDAÇÕES ADICIONADAS ───

/**
 * Verifica não se o agente inventando informações está sobre produtos (stock hallucination).
 * Compara menções de produtos no texto com o catálogo disponível.
 */
function checkStockHallucination(
    reply: string,
    availableProducts: Array<{ description: string; quantity: number }>,
    productCatalog?: string[]
): GuardrailsResult {
    // Se não há catálogo disponível, não pode validar - retorna aprovado
    if ((!availableProducts || availableProducts.length === 0) && (!productCatalog || productCatalog.length === 0)) {
        return { approved: true };
    }

    // Normaliza o catálogo para array de strings
    const catalog = productCatalog || availableProducts.map(p => p.description.toLowerCase());

    // Padrões que indicam que o agente pode estar inventando informações de stock
    const stockPhrases = [
        /temos\s+(\d+)\s+unidades?/i,
        /temos\s+em\s+estoque/i,
        /está\s+disponível\s+em\s+estoque/i,
        /estoque\s+disponível/i,
        /produto\s+em\s+estoque/i,
    ];

    // Verifica se a resposta menciona informações de estoque
    for (const pattern of stockPhrases) {
        const match = reply.match(pattern);
        if (match) {
            // Extrai o produto mencionado (procura por substantivos após a frase de stock)
            const afterMatch = reply.substring(match.index || 0);
            const mentionedProducts = extractProductMentions(afterMatch);

            // Verifica se algum produto mencionado está no catálogo
            for (const mentioned of mentionedProducts) {
                const foundInCatalog = catalog.some(cat =>
                    cat.toLowerCase().includes(mentioned.toLowerCase()) ||
                    mentioned.toLowerCase().includes(cat.toLowerCase())
                );

                if (!foundInCatalog) {
                    console.log(`[GUARDRAILS] ⚠️ Stock hallucination detectada: "${mentioned}" não está no catálogo`);
                    return {
                        approved: false,
                        reason: `Stock hallucination: produto "${mentioned}" não encontrado no catálogo`,
                        modifiedReply: generateStockCorrection(reply, mentioned),
                    };
                }
            }
        }
    }

    return { approved: true };
}

/**
 * Extrai menções de produtos de um texto
 */
function extractProductMentions(text: string): string[] {
    // Palavras que geralmente indicam início de menção de produto
    const products: string[] = [];
    const words = text.split(/\s+/);

    // Padrões de produtos esportivos comuns (simplificado)
    const productKeywords = ['tênis', 'sapato', 'bola', 'roupa', 'camisa', 'bermuda', 'luva', 'raquete', 'bola'];

    for (let i = 0; i < words.length; i++) {
        const word = words[i].toLowerCase().replace(/[.,!?]/g, '');

        // Se é palavra-chave de produto, pega as próximas palavras como possível nome
        if (productKeywords.some(pk => word.includes(pk))) {
            const product = words.slice(i, i + 3).join(' ').replace(/[.,!?]/g, '');
            if (product.length > 2) {
                products.push(product);
            }
        }
    }

    return products;
}

/**
 * Gera correção para resposta com stock hallucination
 */
function generateStockCorrection(reply: string, mentionedProduct: string): string {
    // Remove a menção de estoque e substitui por frase mais neutra
    let corrected = reply
        .replace(/temos\s+\d+\s+unidades?/gi, 'temos disponível')
        .replace(/está\s+disponível\s+em\s+estoque/gi, 'podemos verificar a disponibilidade')
        .replace(/estoque\s+disponível/gi, 'disponibilidade');

    // Se a correção ficou muito diferente, usa fallback
    if (corrected === reply || corrected.length < 10) {
        return "Posso verificar a disponibilidade desse produto para você. Qual é o modelo que te interessa?";
    }

    return corrected;
}

/**
 * Verifica se o agente não está inventando políticas (policy invention).
 * Detecta frases como "não temos essa política" sem bases.
 */
function checkPolicyInvention(
    reply: string,
    policyPatterns?: string[]
): GuardrailsResult {
    // Padrões de políticas reais conhecidas (podem ser expandidos)
    const knownPolicies = [
        'troca', 'reembolso', 'prazo', 'entrega', 'devolução', 'garantia',
        'reserva', 'pagamento', 'parcelamento', 'frete', 'retirada',
        'vale troca', 'erro', 'sistema', 'logística', 'estoque', 'nota fiscal'
    ];

    // Frases que indicam que o agente está inventando/negiando políticas
    const inventionPatterns = [
        /não\s+temos?\s+essa?\s+política/i,
        /não\s+temos?\s+essa?\s+regra/i,
        /não\s+temos?\s+esse?\s+procedimento/i,
        /nossa\s+política\s+(não|nao)\s+/i,
        /não\s+é\s+possível/i,
        /não\s+temos?\s+como/i,
    ];

    // Verifica se a resposta nega algo sem ser uma pergunta de clarification
    const isQuestion = reply.includes('?');

    for (const pattern of inventionPatterns) {
        if (pattern.test(reply) && !isQuestion) {
            // Verifica se a negação é sobre algo que a empresa realmente não tem política
            const negatedWord = reply.match(pattern);
            if (negatedWord) {
                const context = reply.substring(Math.max(0, (negatedWord.index || 0) - 20), (negatedWord.index || 0) + 30);

                // Se提到了已知策略，但说没有，返回false
                const mentionedPolicy = knownPolicies.find(p => context.toLowerCase().includes(p));
                if (mentionedPolicy) {
                    console.log(`[GUARDRAILS] ⚠️ Policy invention detectada: negação de política "${mentionedPolicy}"`);

                    return {
                        approved: false,
                        reason: `Policy invention: possível negação inventada de política de "${mentionedPolicy}"`,
                        modifiedReply: generatePolicyCorrection(reply, mentionedPolicy),
                    };
                }
            }
        }
    }

    return { approved: true };
}

/**
 * Gera correção para resposta com policy invention
 */
function generatePolicyCorrection(reply: string, policy: string): string {
    // Transforma negação em pergunta para verificar
    let corrected = reply
        .replace(/não\s+temos?\s+essa?\s+política/gi, 'posso verificar essa política')
        .replace(/não\s+temos?\s+essa?\s+regra/gi, 'posso verificar essa regra')
        .replace(/não\s+temos?\s+esse?\s+procedimento/gi, 'posso verificar esse procedimento')
        .replace(/não\s+é\s+possível/gi, 'vou verificar se é possível')
        .replace(/não\s+temos?\s+como/gi, 'vou verificar uma forma de');

    if (corrected === reply) {
        return `Posso verificar as informações sobre ${policy} para você.`;
    }

    return corrected;
}

/**
 * Verifica se a resposta tem CTA (Call to Action) em estados críticos.
 * Estados críticos precisam de um próximo passo claro.
 */
function checkCTAMissing(
    reply: string,
    state: ConversationStateType,
    intentType?: string
): GuardrailsResult {
    // Estados onde CTA é crítico
    const CTA_REQUIRED_STATES: ConversationStateType[] = [
        'proposal',
        'closing',
        'objection',
    ];

    // Estados onde CTA é opcional
    const CTA_OPTIONAL_STATES: ConversationStateType[] = [
        'discovery',
        'support',
        'support_sac',
    ];

    // Se não é estado crítico, não precisa validar
    if (!CTA_REQUIRED_STATES.includes(state)) {
        return { approved: true };
    }

    // Verifica se tem indicador de próximo passo
    const ctaIndicators = [
        '?',           // Pergunta
        'posso',       // Oferecimento
        'quer',        // Proposta
        'vamos',       // Ação
        'agora',       // Urgência
        'reserva',     // CTA de venda
        'verificar',   // Próximo passo
        'te passo',   // CTA de transferência
        'encaminhando', // CTA de escalação
    ];

    const hasCTA = ctaIndicators.some(indicator => reply.toLowerCase().includes(indicator));

    if (!hasCTA) {
        console.log(`[GUARDRAILS] ⚠️ CTA missing no estado "${state}"`);

        const suggestedCTA = getSuggestedCTA(state, intentType);

        return {
            approved: false,
            reason: `CTA missing: estado "${state}" sem próximo passo claro`,
            modifiedReply: reply.trimEnd() + ' ' + suggestedCTA,
        };
    }

    return { approved: true };
}

/**
 * Retorna CTA sugerido baseado no estado
 */
function getSuggestedCTA(state: ConversationStateType, intentType?: string): string {
    switch (state) {
        case 'proposal':
            return 'Quer que eu te mostre a melhor opção pra você?';
        case 'closing':
            return 'Quer que eu separe pra você?';
        case 'objection':
            return 'Quer que eu te mostre uma opção mais em conta?';
        default:
            return 'Em que posso te ajudar?';
    }
}

/**
 * Detecta loops de conversa - quando o bot e o usuário
 * estão repetindo o mesmo padrão.
 */
function loopDetection(
    history: { role: "user" | "assistant"; content: string }[]
): GuardrailsResult {
    if (history.length < 4) {
        return { approved: true };
    }

    // Pega as últimas 4 mensagens (2 do usuário, 2 do bot)
    const recentMessages = history.slice(-4);

    // Verifica se há 2+ mensagens do bot consecutivas muito similares
    const botMessages = recentMessages
        .filter(m => m.role === 'assistant')
        .map(m => m.content.toLowerCase().trim());

    if (botMessages.length >= 2) {
        const similarity1 = similarity(botMessages[botMessages.length - 2], botMessages[botMessages.length - 1]);

        // Se as últimas 2 mensagens do bot são muito similares (> 85%)
        if (similarity1 > 0.85) {
            console.log(`[GUARDRAILS] ⚠️ Loop detectado:相似度 ${similarity1}`);

            return {
                approved: false,
                reason: `Loop detected: bot repetindo respostas similares (${similarity1})`,
                modifiedReply: "Percebi que estamos nesse ponto. Posso te transferir para um atendimento humano?",
            };
        }
    }

    // Verifica padrão de pergunta-resposta repetitiva
    const userQuestions = recentMessages
        .filter(m => m.role === 'user')
        .map(m => m.content.toLowerCase().trim());

    if (userQuestions.length >= 2) {
        const questionSimilarity = similarity(userQuestions[userQuestions.length - 2], userQuestions[userQuestions.length - 1]);

        // Se usuário fez perguntas muito similares
        if (questionSimilarity > 0.7) {
            console.log(`[GUARDRAILS] ⚠️ Loop detectado: usuário repetindo perguntas`);

            return {
                approved: false,
                reason: "Loop detected: usuário repetindo perguntas similares",
                modifiedReply: "Não entendi direito. Pode me explicar de outra forma o que você precisa?",
            };
        }
    }

    return { approved: true };
}

// ─── UTILITIES ───

function similarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    // Simple word overlap similarity (Jaccard)
    const wordsA = Array.from(new Set(a.split(/\s+/)));
    const wordsB = Array.from(new Set(b.split(/\s+/)));

    let overlap = 0;
    for (const word of wordsA) {
        if (wordsB.includes(word)) overlap++;
    }

    const allWords = [...wordsA, ...wordsB];
    const totalUnique = new Set(allWords).size;
    return totalUnique > 0 ? overlap / totalUnique : 0;
}

function truncateAtSentence(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;

    const truncated = text.substring(0, maxLen);
    const lastSentence = truncated.lastIndexOf(".");
    const lastQuestion = truncated.lastIndexOf("?");
    const lastBreak = Math.max(lastSentence, lastQuestion);

    if (lastBreak > maxLen * 0.5) {
        return truncated.substring(0, lastBreak + 1);
    }

    return truncated.trimEnd() + "...";
}

/**
 * Gera variação da resposta quando há repetição detectada.
 * Em vez de adicionar prefixo sintético ("Complementando, "),
 * tenta reenquadrar com abordagem de pergunta direta.
 */
function generateVariation(reply: string): string {
    // Se a resposta já tem pergunta, adicionar contexto de abordagem diferente
    if (reply.includes("?")) {
        return "Deixa eu tentar de outro ângulo. " + reply;
    }
    // Se não tem pergunta, encerrar com uma que avança a conversa
    return reply.trimEnd() + "\n\nO que faz mais sentido pra você?";
}
