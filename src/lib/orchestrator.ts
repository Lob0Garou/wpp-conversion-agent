// Arquivo: src/lib/orchestrator.ts
// Propósito: Único ponto de entrada para processar mensagens do usuário
// Arquitetura: Determinístico-first, LLM como fallback controlado

import { decideAction, type AgentAction, type ActionDecisionContext } from './action-decider';
import { getTemplateEngine, type TemplateEngine, type TemplateMatch } from './template-engine';
import { generateValidatedResponse, type AgentDecision } from './ai';
import { validateResponse, type GuardrailsResult } from './guardrails';
import { buildContext } from './context-builder';
import { allTemplates } from './templates';
import type { ConversationContext, ConversationContext as ConversationContextType, ConversationState, GuardrailResult, LLMResult } from './types';
import type { Slots, ConversationStateType } from './state-manager';
import type { Intent } from './intent-classifier';
import {
    logOrchestratorDecision,
    logTemplateHitMiss,
    logLLMFallback,
    logGuardrailIntervention,
    logActionDecision,
} from './telemetry';
import { extractKnownEntitiesFromHistory, getMissingData, getFirstMissingQuestion, type KnownEntities } from './slot-extractor';

/**
 * Resultado do orchestrator
 */
export interface OrchestratorResult {
    source: 'template' | 'llm' | 'guardrail_fallback' | 'error' | 'langgraph';
    action: string;
    text: string;
    metadata: {
        templateUsed?: string;
        guardrailChecks?: GuardrailResult;
        llmModel?: string;
        tokensUsed?: number;
    };
}

/**
 * Constrói o contexto para o action-decider a partir do ConversationContext
 */
function buildActionContext(context: ConversationContext): ActionDecisionContext {
    return {
        intent: context.intent || context.lastIntent || 'SALES',
        state: context.state.currentState as ConversationStateType,
        slots: context.slots as Slots,
        frustrationLevel: context.frustrationLevel || context.state.frustrationLevel || 0,
        lastQuestionType: context.lastQuestionType || context.state.lastQuestionType || null,
        hasClosingSignal: context.hasClosingSignal || false,
    };
}

/**
 * Tipo de intent suportado pelo guardrail
 */
type GuardrailIntentType = "SALES" | "SAC_TROCA" | "SAC_ATRASO" | "SAC_RETIRADA" | "SAC_REEMBOLSO" | "INFO" | "HANDOFF" | "STOCK" | undefined;

/**
 * Constrói o contexto para guardrails
 */
function buildGuardrailContext(context: ConversationContext, action: AgentAction): {
    currentState: ConversationStateType;
    slots: Slots;
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
    availableProducts: Array<{ description: string; quantity: number }>;
    frustrationLevel: number;
    intentType?: GuardrailIntentType;
    productCatalog?: string[];
    policyPatterns?: string[];
} {
    // Converte o Intent para o tipo suportado pelo guardrail
    const intentMap: Record<string, GuardrailIntentType> = {
        'SALES': 'SALES',
        'SAC_TROCA': 'SAC_TROCA',
        'SAC_ATRASO': 'SAC_ATRASO',
        'SAC_RETIRADA': 'SAC_RETIRADA',
        'SAC_REEMBOLSO': 'SAC_REEMBOLSO',
        'INFO': 'INFO',
        'HANDOFF': 'HANDOFF',
        'STOCK': 'STOCK',
    };
    const intent = context.intent || context.lastIntent;
    const guardrailIntent = intent ? intentMap[intent] : undefined;

    // Extrai catálogo de produtos do stockResult
    let productCatalog: string[] = [];
    if (context.stockResult) {
        productCatalog = context.stockResult.candidates.map(c => c.description);
        if (context.stockResult.best) {
            productCatalog.push(context.stockResult.best.description);
        }
    }

    // Políticas conhecidas da empresa (podem vir de config)
    const policyPatterns = [
        'troca em até 30 dias',
        'atendimento em até 48h úteis',
        'frete gratis',
        'frete grátis',
        'entrega conforme o cep',
        'retirada em loja em até 7 dias',
        'pagamento via pix',
        'parcelamento em até 12x',
    ];

    return {
        currentState: context.state.currentState as ConversationStateType,
        slots: context.slots as Slots,
        conversationHistory: context.messages.map(m => ({
            role: (m.direction === 'inbound' ? 'user' : 'assistant') as 'user' | 'assistant',
            content: m.content,
        })),
        availableProducts: [],
        frustrationLevel: context.frustrationLevel || context.state.frustrationLevel || 0,
        intentType: guardrailIntent,
        productCatalog,
        policyPatterns,
    };
}

/**
 * Orquestra todo o fluxo de resposta:
 * 1. decideAction() - Decide ação determinística
 * 2. Tenta template primeiro (se modo ativo)
 * 3. Fallback para LLM (UMA única chamada)
 * 4. Guardrails ANTES do envio
 *
 * @param userMessage - Mensagem do usuário
 * @param context - Contexto da conversa
 * @returns OrchestratorResult com resposta validada
 */
export async function orchestrate(
    userMessage: string,
    context: ConversationContext
): Promise<OrchestratorResult> {
    const startTime = Date.now();
    const storeId = context.storeId || "unknown";
    const conversationId = context.conversationId || "unknown";

    // 1. DECIDE ACTION - Determinístico
    const actionContext = buildActionContext(context);
    const actionResult = decideAction(actionContext);

    console.log(`[ORCHESTRATOR] Action decided: ${actionResult}`);

    // Log action decision
    logActionDecision({
        conversationId,
        storeId,
        action: actionResult,
        intent: context.intent || context.lastIntent || "SALES",
        state: context.state.currentState,
        slots: context.slots as Record<string, unknown>,
        frustrationLevel: context.frustrationLevel || 0,
        result: "success",
    });

    // 2. TENTA TEMPLATE PRIMEIRO (se modo ativo)
    const templateMode = process.env.TEMPLATE_ENGINE_MODE || 'active';
    const templateEngine = getTemplateEngine(allTemplates);

    if (templateMode === 'active') {
        const intent = context.intent || context.lastIntent || 'SALES';
        const state = context.state.currentState as ConversationStateType;
        const slots = context.slots as Slots;

        const templateMatch = templateEngine.match(
            actionResult,
            intent,
            state,
            slots
        );

        if (templateMatch && templateMatch.slotsMissing && templateMatch.slotsMissing.length === 0) {
            // Template encontrado e completo - usa template
            console.log(`[ORCHESTRATOR] Using template: ${templateMatch.template.id}`);

            // Log template hit
            logTemplateHitMiss({
                conversationId,
                storeId,
                action: actionResult,
                intent: context.intent || context.lastIntent || "SALES",
                state: context.state.currentState,
                hit: true,
                templateId: templateMatch.template.id,
                slotsMissing: [],
                result: "success",
            });

            // Log orchestrator decision
            logOrchestratorDecision({
                conversationId,
                storeId,
                action: actionResult,
                source: "template",
                templateUsed: templateMatch.template.id,
                processingTimeMs: Date.now() - startTime,
                result: "success",
            });

            return {
                source: 'template',
                action: actionResult,
                text: templateMatch.filledText,
                metadata: {
                    templateUsed: templateMatch.template.id,
                },
            };
        }

        if (templateMatch) {
            console.log(`[ORCHESTRATOR] Template found but slots missing: ${templateMatch.slotsMissing?.join(', ')}`);

            // Log template miss (slots missing)
            logTemplateHitMiss({
                conversationId,
                storeId,
                action: actionResult,
                intent: context.intent || context.lastIntent || "SALES",
                state: context.state.currentState,
                hit: false,
                templateId: templateMatch.template.id,
                slotsMissing: templateMatch.slotsMissing,
                result: "success",
            });

            // Log LLM fallback reason
            logLLMFallback({
                conversationId,
                storeId,
                action: actionResult,
                reason: "slots_missing",
                result: "success",
            });
        } else {
            // Log template miss (no template found)
            logTemplateHitMiss({
                conversationId,
                storeId,
                action: actionResult,
                intent: context.intent || context.lastIntent || "SALES",
                state: context.state.currentState,
                hit: false,
                result: "success",
            });

            // Log LLM fallback reason
            logLLMFallback({
                conversationId,
                storeId,
                action: actionResult,
                reason: "no_template",
                result: "success",
            });
        }
    } else {
        // Template mode is disabled
        logLLMFallback({
            conversationId,
            storeId,
            action: actionResult,
            reason: "template_disabled",
            result: "success",
        });
    }

    // 3. LLM FALLBACK - UMA única chamada
    // Para o generateValidatedResponse, precisamos construir o prompt
    const systemPrompt = buildSystemPrompt(actionResult, context);
    const conversationHistory = context.messages.map(m => ({
        role: m.direction === 'inbound' ? 'user' as const : 'assistant' as const,
        content: m.content,
    }));
    const intent = context.intent || context.lastIntent || 'SALES';

    // 4. GUARDRAILS - Build context BEFORE calling LLM
    const guardrailContext = buildGuardrailContext(context, actionResult);

    console.log(`[ORCHESTRATOR] Calling LLM for action: ${actionResult}`);

    const llmResult = await generateValidatedResponse(
        systemPrompt,
        userMessage,
        conversationHistory,
        intent,
        {
            slots: context.slots,
            stockInfo: context.stockResult ? {
                available: context.stockResult.status === 'AVAILABLE',
                products: context.stockResult.candidates.map(c => c.description),
            } : undefined,
            customerName: context.customerName,
        }
    );
    const guardrailInput: AgentDecision = {
        reply_text: llmResult.reply_text,
        requires_human: llmResult.requires_human,
    };

    const guardrailResult = validateResponse(guardrailInput, guardrailContext);

    // Log guardrail intervention
    logGuardrailIntervention({
        conversationId,
        storeId,
        action: actionResult,
        approved: guardrailResult.approved,
        reason: guardrailResult.reason,
        modifiedReply: guardrailResult.modifiedReply,
        shouldEscalate: guardrailResult.shouldEscalate,
        retryCount: guardrailResult.retryCount,
        result: "success",
    });

    if (!guardrailResult.approved) {
        // Guardrail reprovou - usa modifiedReply ou fallback
        console.log(`[ORCHESTRATOR] Guardrail rejected, using fallback`);

        // Log LLM fallback due to guardrail rejection
        logLLMFallback({
            conversationId,
            storeId,
            action: actionResult,
            reason: "guardrail_rejection",
            model: process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash",
            result: "success",
        });

        // Log orchestrator decision
        logOrchestratorDecision({
            conversationId,
            storeId,
            action: actionResult,
            source: "guardrail_fallback",
            guardrailRejected: true,
            guardrailReason: guardrailResult.reason,
            processingTimeMs: Date.now() - startTime,
            result: "success",
        });

        return {
            source: 'guardrail_fallback',
            action: actionResult,
            text: guardrailResult.modifiedReply || 'Desculpe, não consegui processar sua solicitação.',
            metadata: {
                guardrailChecks: {
                    approved: guardrailResult.approved,
                    reason: guardrailResult.reason,
                    modifiedReply: guardrailResult.modifiedReply,
                    shouldEscalate: guardrailResult.shouldEscalate,
                },
            },
        };
    }

    // Log LLM success
    logLLMFallback({
        conversationId,
        storeId,
        action: actionResult,
        reason: "success" as "no_template" | "slots_missing" | "template_disabled" | "guardrail_rejection" | "success" | "error",
        model: process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash",
        result: "success",
    });

    // Log orchestrator decision (LLM source)
    logOrchestratorDecision({
        conversationId,
        storeId,
        action: actionResult,
        source: "llm",
        llmModel: process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash",
        processingTimeMs: Date.now() - startTime,
        result: "success",
    });

    // 5. Retorna resultado validado
    return {
        source: 'llm',
        action: actionResult,
        text: llmResult.reply_text,
        metadata: {
            llmModel: process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash",
            tokensUsed: 0, // OpenRouter não retorna tokens por padrão
        },
    };
}

/**
 * Constrói o system prompt baseado na ação
 * Usa ResponseController para comportamento determinístico
 */
function buildSystemPrompt(action: AgentAction, context: ConversationContext): string {
    // Try to use the strict response controller first
    try {
        const { buildStrictSystemPrompt } = require('./response-controller');
        const history = context.messages.map(m => ({
            role: m.direction === 'inbound' ? 'user' as const : 'assistant' as const,
            content: m.content,
        }));

        // F002 SLOT AWARE: Extrai entidades do histórico antes de chamar response-controller
        let intent = context.intent || context.lastIntent || 'SALES';

        // Se a ação é pedir dados, mas o intent é genérico (SUPPORT/CLARIFICATION),
        // forçamos um intent de SAC que exige dados (SAC_ATRASO) para que o getMissingData
        // retorne os campos faltantes corretamente e ative a pergunta de triagem.
        if (action === 'REQUEST_ORDER_DATA' && (intent === 'SUPPORT' || intent === 'CLARIFICATION')) {
            intent = 'SAC_ATRASO';
        }

        const knownEntities = extractKnownEntitiesFromHistory(history);
        const missingFields = getMissingData(intent, knownEntities);

        // Log para debug (apenas se CADU_DEBUG=1)
        if (process.env.CADU_DEBUG === '1') {
            console.log(`[F002 SLOT AWARE] Intent: ${intent}, Known: ${JSON.stringify(knownEntities)}, Missing: ${missingFields.join(', ')}`);
        }

        // Se há campos faltantes e a ação é REQUEST_ORDER_DATA, pergunta apenas o primeiro
        if (missingFields.length > 0 && action === 'REQUEST_ORDER_DATA') {
            const firstMissing = missingFields[0];
            const question = getFirstMissingQuestion(firstMissing, knownEntities);

            // Retorna um prompt específico para perguntar apenas o primeiro campo
            return `Você está no fluxo de SAC.
DADOS JÁ COLETADOS DO HISTÓRICO: ${Object.entries(knownEntities).filter(([_, v]) => v).map(([k, v]) => `${k}=${v}`).join(', ') || 'nenhum'}

FALTANDO: ${missingFields.join(', ')}

AÇÃO: Faça APENAS uma pergunta: "${question}"

Responda de forma direta e amigável, pedindo apenas esse dado.`;
        }

        return buildStrictSystemPrompt(action, context.slots as Slots, context.intent || 'SALES', history);
    } catch (e) {
        // Fallback to simple prompts if response-controller fails
        console.log('[ORCHESTRATOR] ⚠️ Using fallback prompts (response-controller not available)');
    }

    const basePrompt = `Você é um assistente de vendas via WhatsApp da SportPrime, uma loja de artigos esportivos.
Seu objetivo é ajudar clientes a encontrar o produto ideal para suas necessidades.

Regras importantes:
- Responda de forma direta e concisa (máximo 15 palavras para vendas)
- Faça APENAS uma pergunta por resposta
- Use linguagem amigável e emojis moderados
- Sempre tente avançar a conversa para o próximo passo
- Se o cliente quiser comprar, ofereça a reserva

## AÇÃO ATUAL: ${action}
`;

    const actionPrompts: Record<AgentAction, string> = {
        ASK_SIZE: `${basePrompt}

Pergunte qual numeração/tamanho o cliente usa.`,
        ASK_USAGE: `${basePrompt}

Pergunte qual o uso intended (corrida, academia, dia a dia, etc).`,
        ASK_PRODUCT: `${basePrompt}

Pergunte qual produto o cliente está procurando.`,
        SHOW_PRODUCT: `${basePrompt}

Mostre o produto encontrado com detalhes relevantes.`,
        OFFER_RESERVATION: `${basePrompt}

CONFIRME disponibilidade E ofereça a reserva. Use: "Temos! Posso separar?"`,
        REQUEST_ORDER_DATA: `${basePrompt}

Você está no fluxo de SAC. Peça TODOS os dados de uma vez: nome, e-mail, número do pedido.`,
        PROVIDE_POLICY: `${basePrompt}

Informe a política da loja sobre trocas/reembolsos/entregas.`,
        ESCALATE: `${basePrompt}

Escale para um humano.`,
        LLM_FALLBACK: `${basePrompt}

Responda à mensagem do cliente de forma adequada.`,
    };

    return actionPrompts[action] || actionPrompts.LLM_FALLBACK;
}

/**
 * Versão síncrona para quando não precisa de LLM
 * Usa apenas lógica determinística
 */
export function orchestrateSync(
    userMessage: string,
    context: ConversationContext
): OrchestratorResult {

    const actionContext = buildActionContext(context);
    const actionResult = decideAction(actionContext);

    const templateMode = process.env.TEMPLATE_ENGINE_MODE || 'active';
    const templateEngine = getTemplateEngine(allTemplates);

    if (templateMode === 'active') {
        const intent = context.intent || context.lastIntent || 'SALES';
        const state = context.state.currentState as ConversationStateType;
        const slots = context.slots as Slots;

        const templateMatch = templateEngine.match(
            actionResult,
            intent,
            state,
            slots
        );

        if (templateMatch && templateMatch.slotsMissing && templateMatch.slotsMissing.length === 0) {
            return {
                source: 'template',
                action: actionResult,
                text: templateMatch.filledText,
                metadata: {
                    templateUsed: templateMatch.template.id,
                },
            };
        }
    }

    // Sem LLM disponível - retorna erro controlado
    return {
        source: 'error',
        action: actionResult,
        text: 'Sistema temporariamente indisponível. Tente novamente em alguns minutos.',
        metadata: {},
    };
}

/**
 * Versão alternativa que usa o TemplateEngine passado como parâmetro
 * Útil para testes e injeção de dependência
 */
export async function orchestrateWithEngine(
    userMessage: string,
    context: ConversationContext,
    templateEngine: TemplateEngine
): Promise<OrchestratorResult> {

    // 1. DECIDE ACTION
    const actionContext = buildActionContext(context);
    const actionResult = decideAction(actionContext);

    // 2. TENTA TEMPLATE PRIMEIRO
    const templateMode = process.env.TEMPLATE_ENGINE_MODE || 'active';

    if (templateMode === 'active') {
        const intent = context.intent || context.lastIntent || 'SALES';
        const state = context.state.currentState as ConversationStateType;
        const slots = context.slots as Slots;

        const templateMatch = templateEngine.match(
            actionResult,
            intent,
            state,
            slots
        );

        if (templateMatch && templateMatch.slotsMissing && templateMatch.slotsMissing.length === 0) {
            return {
                source: 'template',
                action: actionResult,
                text: templateMatch.filledText,
                metadata: {
                    templateUsed: templateMatch.template.id,
                },
            };
        }
    }

    // 3. LLM FALLBACK
    const systemPrompt = buildSystemPrompt(actionResult, context);
    const conversationHistory = context.messages.map(m => ({
        role: m.direction === 'inbound' ? 'user' as const : 'assistant' as const,
        content: m.content,
    }));
    const intent = context.intent || context.lastIntent || 'SALES';

    // 4. GUARDRAILS - Build context BEFORE calling LLM
    const guardrailContext = buildGuardrailContext(context, actionResult);

    const llmResult = await generateValidatedResponse(
        systemPrompt,
        userMessage,
        conversationHistory,
        intent,
        {
            slots: context.slots,
            stockInfo: context.stockResult ? {
                available: context.stockResult.status === 'AVAILABLE',
                products: context.stockResult.candidates.map(c => c.description),
            } : undefined,
            customerName: context.customerName,
        }
    );
    const guardrailInput: AgentDecision = {
        reply_text: llmResult.reply_text,
        requires_human: llmResult.requires_human,
    };

    const guardrailResult = validateResponse(guardrailInput, guardrailContext);

    if (!guardrailResult.approved) {
        return {
            source: 'guardrail_fallback',
            action: actionResult,
            text: guardrailResult.modifiedReply || 'Desculpe, não consegui processar sua solicitação.',
            metadata: {
                guardrailChecks: {
                    approved: guardrailResult.approved,
                    reason: guardrailResult.reason,
                    modifiedReply: guardrailResult.modifiedReply,
                    shouldEscalate: guardrailResult.shouldEscalate,
                },
            },
        };
    }

    return {
        source: 'llm',
        action: actionResult,
        text: llmResult.reply_text,
        metadata: {
            llmModel: process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash",
            tokensUsed: 0,
        },
    };
}
