/**
 * Hybrid Response Generator - Integração Templates + LLM
 *
 * Este módulo integra o sistema de templates com o pipeline existente do webhook.
 *
 * Modo passivo (default): apenas loga hits/misses, não altera comportamento
 * Modo ativo: usa templates para gerar respostas quando disponíveis
 */

import { generateResponse, type ResponseContext, type GeneratedResponse } from "./response-generator";
import { TemplateEngine } from "./template-engine";
import { allTemplates } from "./templates";
import type { Intent } from "./intent-classifier";
import type { ConversationStateType, Slots } from "./state-manager";

// ─── ENGINE INSTANCE ───

let templateEngine: TemplateEngine | null = null;

function getEngine(): TemplateEngine {
    if (!templateEngine) {
        templateEngine = new TemplateEngine(allTemplates);

        // Configurar modo a partir de variáveis de ambiente
        // Default: active se não especificado (para facilitar testes)
        const envMode = process.env.TEMPLATE_ENGINE_MODE;
        const mode: "passive" | "active" = (envMode === "passive" || envMode === "active") ? envMode : "active";
        templateEngine.setMode(mode);

        // Configurar logging
        const logHits = process.env.TEMPLATE_LOG_HITS !== "false";
        const logMisses = process.env.TEMPLATE_LOG_MISSES !== "false";
        templateEngine.setLogging(logHits, logMisses);

        console.log(`[HYBRID] Template Engine initialized in ${mode} mode (env: ${envMode || 'default active'})`);
    }
    return templateEngine;
}

// ─── HYBRID RESPONSE FUNCTION ───

export interface HybridResponseOptions {
    // Função de fallback que retorna a resposta do LLM
    llmFallback: () => Promise<string>;

    // Contexto da conversa
    context: {
        intent: Intent;
        state: ConversationStateType;
        slots: Slots;
        frustrationLevel: number;
        lastQuestionType: string | null;
        hasClosingSignal?: boolean;
    };
}

/**
 * Gera uma resposta híbrida usando templates + LLM fallback.
 *
 * Fluxo:
 * 1. Decide a ação (action-decider)
 * 2. Tenta encontrar template correspondente
 * 3. Se template encontrado + modo ativo + slots disponíveis → usa template
 * 4. Caso contrário → usa LLM fallback
 */
export async function generateHybridResponse(
    options: HybridResponseOptions
): Promise<GeneratedResponse> {
    const engine = getEngine();
    const { llmFallback, context } = options;

    const responseContext: ResponseContext = {
        intent: context.intent,
        state: context.state,
        slots: context.slots,
        frustrationLevel: context.frustrationLevel,
        lastQuestionType: context.lastQuestionType,
        hasClosingSignal: context.hasClosingSignal,
    };

    // Tentar gerar resposta via template engine
    const templateResponse = await generateResponse(responseContext, {
        templateEngine: engine,
        useFallback: llmFallback,
    });

    // Log estruturado para métricas
    logStructuredResponse(templateResponse, context);

    return templateResponse;
}

/**
 * Versão síncrona que usa texto de fallback fixo (para testes)
 */
export function generateHybridResponseSync(
    context: {
        intent: Intent;
        state: ConversationStateType;
        slots: Slots;
        frustrationLevel: number;
        lastQuestionType: string | null;
        hasClosingSignal?: boolean;
    },
    fallbackText: string
): GeneratedResponse {
    const engine = getEngine();

    const responseContext: ResponseContext = {
        intent: context.intent,
        state: context.state,
        slots: context.slots,
        frustrationLevel: context.frustrationLevel,
        lastQuestionType: context.lastQuestionType,
        hasClosingSignal: context.hasClosingSignal,
    };

    // Import dinâmico para evitar ciclo
    const { generateResponseSync } = require("./response-generator");

    const templateResponse = generateResponseSync(responseContext, {
        templateEngine: engine,
        fallbackText,
    });

    logStructuredResponse(templateResponse, context);

    return templateResponse;
}

// ─── LOGGING ESTRUTURADO ───

function logStructuredResponse(
    response: GeneratedResponse,
    context: {
        intent: Intent;
        state: ConversationStateType;
    }
): void {
    const logEntry = {
        timestamp: new Date().toISOString(),
        source: response.source,
        action: response.action,
        templateId: response.templateId || null,
        intent: context.intent,
        state: context.state,
    };

    console.log(`[RESPONSE] ${JSON.stringify(logEntry)}`);
}

// ─── CONFIGURAÇÃO ───

export function setTemplateMode(mode: "passive" | "active"): void {
    getEngine().setMode(mode);
    console.log(`[HYBRID] Template mode changed to: ${mode}`);
}

export function getTemplateMode(): "passive" | "active" {
    return getEngine().getMode();
}

export function getTemplateStats(): { totalTemplates: number; actionsCovered: number } {
    const stats = getEngine().getStats();
    return {
        totalTemplates: stats.totalTemplates,
        actionsCovered: stats.actionsCovered.size,
    };
}
