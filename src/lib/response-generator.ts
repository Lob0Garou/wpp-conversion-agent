import { decideAction, type AgentAction, type ActionDecisionContext } from "./action-decider";
import { TemplateEngine, type TemplateMatch } from "./template-engine";
import type { Intent } from "./intent-classifier";
import type { ConversationStateType, Slots } from "./state-manager";

// ─── TYPES ───

export interface ResponseContext {
    intent: Intent;
    state: ConversationStateType;
    slots: Slots;
    frustrationLevel: number;
    lastQuestionType: string | null;
    hasClosingSignal?: boolean;
}

export interface GeneratedResponse {
    text: string;
    source: "template" | "llm";
    action: AgentAction;
    templateId?: string;
    match?: TemplateMatch;
}

export interface ResponseGeneratorOptions {
    templateEngine: TemplateEngine;
    useFallback: (context: ResponseContext) => Promise<string>;
}

// ─── MAIN GENERATOR ───

/**
 * Gera resposta usando o sistema híbrido Templates + LLM Fallback
 *
 * 1. decideAction() → ação determinística
 * 2. templateEngine.match() → template ou null
 * 3. Se template e modo ativo → retorna template
 * 4. Senão → fallback LLM
 */
export async function generateResponse(
    context: ResponseContext,
    options: ResponseGeneratorOptions
): Promise<GeneratedResponse> {
    const { templateEngine, useFallback } = options;

    // Passo 1: Decidir ação
    const actionDecision: ActionDecisionContext = {
        intent: context.intent,
        state: context.state,
        slots: context.slots,
        frustrationLevel: context.frustrationLevel,
        lastQuestionType: context.lastQuestionType,
        hasClosingSignal: context.hasClosingSignal,
    };

    const action = decideAction(actionDecision);

    // Log da decisão de ação
    console.log(`[RESPONSE] action=${action} intent=${context.intent} state=${context.state}`);

    // Passo 2: Tentar encontrar template
    const match = templateEngine.match(
        action,
        context.intent,
        context.state,
        context.slots
    );

    // Passo 3: Se encontrou template e modo ativo, usar template
    if (match && templateEngine.getMode() === "active") {
        // Verificar se todos os slots obrigatórios estão preenchidos
        if (match.slotsMissing.length === 0) {
            console.log(`[RESPONSE] source=template action=${action} template=${match.template.id}`);
            return {
                text: match.filledText,
                source: "template",
                action,
                templateId: match.template.id,
                match: match ?? undefined,
            };
        }
    }

    // Passo 4: Log quando não encontra template ou slots faltando
    if (!match) {
        console.log(`[RESPONSE] source=llm action=${action} reason=no_template`);
    } else if (match.slotsMissing.length > 0) {
        console.log(`[RESPONSE] source=llm action=${action} reason=missing_slots:${match.slotsMissing.join(",")}`);
    }

    // Passo 5: Fallback para LLM
    const llmText = await useFallback(context);

    return {
        text: llmText,
        source: "llm",
        action,
        templateId: match?.template.id,
        match: match ?? undefined,
    };
}

/**
 * Versão síncrona para quando não precisa de LLM (apenas para testes)
 */
export function generateResponseSync(
    context: ResponseContext,
    options: Omit<ResponseGeneratorOptions, "useFallback"> & { fallbackText: string }
): GeneratedResponse {
    const { templateEngine, fallbackText } = options;

    // Passo 1: Decidir ação
    const actionDecision: ActionDecisionContext = {
        intent: context.intent,
        state: context.state,
        slots: context.slots,
        frustrationLevel: context.frustrationLevel,
        lastQuestionType: context.lastQuestionType,
        hasClosingSignal: context.hasClosingSignal,
    };

    const action = decideAction(actionDecision);

    console.log(`[RESPONSE] action=${action} intent=${context.intent} state=${context.state}`);

    // Passo 2: Tentar encontrar template
    const match = templateEngine.match(
        action,
        context.intent,
        context.state,
        context.slots
    );

    // Passo 3: Se encontrou template e modo ativo, usar template
    if (match && templateEngine.getMode() === "active") {
        if (match.slotsMissing.length === 0) {
            console.log(`[RESPONSE] source=template action=${action} template=${match.template.id}`);
            return {
                text: match.filledText,
                source: "template",
                action,
                templateId: match.template.id,
                match: match ?? undefined,
            };
        }
    }

    // Log e fallback
    if (!match) {
        console.log(`[RESPONSE] source=llm action=${action} reason=no_template`);
    } else if (match.slotsMissing.length > 0) {
        console.log(`[RESPONSE] source=llm action=${action} reason=missing_slots:${match.slotsMissing.join(",")}`);
    }

    return {
        text: fallbackText,
        source: "llm",
        action,
        templateId: match?.template.id,
        match: match ?? undefined,
    };
}

// ─── FACTORY ───

import { allTemplates } from "./templates";

export function createResponseGenerator(): ResponseGeneratorOptions {
    const templateEngine = new TemplateEngine(allTemplates);

    // Configurar modo a partir de variáveis de ambiente
    const mode = (process.env.TEMPLATE_ENGINE_MODE as "passive" | "active") || "passive";
    templateEngine.setMode(mode);

    // Configurar logging
    const logHits = process.env.TEMPLATE_LOG_HITS !== "false";
    const logMisses = process.env.TEMPLATE_LOG_MISSES !== "false";
    templateEngine.setLogging(logHits, logMisses);

    return {
        templateEngine,
        useFallback: async (_context: ResponseContext) => {
            // Placeholder - a implementação real usa o LLM
            return "";
        },
    };
}
