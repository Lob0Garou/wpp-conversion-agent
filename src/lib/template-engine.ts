import type { AgentAction } from "./action-decider";
import type { Intent } from "./intent-classifier";
import type { ConversationStateType, Slots } from "./state-manager";
import { logTemplateHitMiss } from "./telemetry";

// ─── TYPES ───

export interface Template {
    id: string;
    action: AgentAction;
    intent: Intent | Intent[];
    state: ConversationStateType | ConversationStateType[];
    requiredSlots: string[];
    template: string;
    maxChars: number;
    maxQuestions: number;
    // Condições adicionais de slots para matching fino (ex: categoria="bola")
    slotConditions?: Record<string, string>;
}

export interface TemplateMatch {
    template: Template;
    filledText: string;
    slotsMissing: string[];
}

export type TemplateMode = "passive" | "active";

// ─── TEMPLATE ENGINE ───

export class TemplateEngine {
    private templates: Template[] = [];
    private mode: TemplateMode = "passive";
    private logHits: boolean = true;
    private logMisses: boolean = true;

    constructor(templates: Template[] = []) {
        this.templates = templates;
    }

    /**
     * Adiciona templates ao engine
     */
    addTemplates(templates: Template[]): void {
        this.templates.push(...templates);
    }

    /**
     * Define o modo de operação
     * - passive: apenas loga, não altera comportamento
     * - active: usa templates para gerar respostas
     */
    setMode(mode: TemplateMode): void {
        this.mode = mode;
    }

    getMode(): TemplateMode {
        return this.mode;
    }

    /**
     * Configura logging
     */
    setLogging(hits: boolean, misses: boolean): void {
        this.logHits = hits;
        this.logMisses = misses;
    }

    /**
     * Encontra o melhor template para a ação/intent/state atual
     */
    match(
        action: AgentAction,
        intent: Intent,
        state: ConversationStateType,
        slots: Slots
    ): TemplateMatch | null {
        // Filtrar templates que correspondem à ação
        const candidates = this.templates.filter((t) => {
            // Verificar action
            if (t.action !== action) return false;

            // Verificar intent (pode ser array)
            const intents = Array.isArray(t.intent) ? t.intent : [t.intent];
            if (!intents.includes(intent)) return false;

            // Verificar state (pode ser array)
            const states = Array.isArray(t.state) ? t.state : [t.state];
            if (!states.includes(state)) return false;

            // Verificar slotConditions (se definidas)
            if (t.slotConditions) {
                for (const [slotName, expectedValue] of Object.entries(t.slotConditions)) {
                    if (slots[slotName] !== expectedValue) return false;
                }
            }

            return true;
        });

        // Se não encontrou candidatos, loga falha
        if (candidates.length === 0) {
            if (this.logMisses) {
                console.log(`[TEMPLATE] ❌ No template for action=${action} intent=${intent} state=${state}`);
            }
            return null;
        }

        // Selecionar melhor template (completo > mais especifico > menos slots faltando)
        const ranked = candidates
            .map((template) => {
                const slotsMissing = template.requiredSlots.filter((slot) => !slots[slot]);
                return {
                    template,
                    slotsMissing,
                    isComplete: slotsMissing.length === 0,
                    specificity: template.requiredSlots.length,
                    templateLen: template.template.length,
                    isFallbackLike:
                        template.id.includes("need_more_info") ||
                        template.id.includes("fallback") ||
                        template.id.includes("generic"),
                };
            })
            .sort((a, b) => {
                if (a.isComplete !== b.isComplete) return a.isComplete ? -1 : 1;
                if (a.isComplete && b.isComplete) {
                    if (a.specificity !== b.specificity) return b.specificity - a.specificity;
                    if (a.isFallbackLike !== b.isFallbackLike) return a.isFallbackLike ? 1 : -1;
                    return b.templateLen - a.templateLen;
                }
                if (a.slotsMissing.length !== b.slotsMissing.length) return a.slotsMissing.length - b.slotsMissing.length;
                if (a.specificity !== b.specificity) return b.specificity - a.specificity;
                if (a.isFallbackLike !== b.isFallbackLike) return a.isFallbackLike ? 1 : -1;
                return b.templateLen - a.templateLen;
            });

        const best = ranked[0];
        const template = best.template;

        // Verificar slots obrigatorios
        const slotsMissing = best.slotsMissing;

        // Preencher template
        const filledText = this.fillTemplate(template, slots);

        if (this.logHits) {
            console.log(`[TEMPLATE] ✅ Matched template=${template.id} action=${action} intent=${intent} state=${state}`);
        }

        return {
            template,
            filledText,
            slotsMissing,
        };
    }

    /**
     * Preenche o template com os slots disponíveis
     * Substitui placeholders {slot_name} pelos valores
     */
    fillTemplate(template: Template, slots: Slots): string {
        let text = template.template;

        // Substituir placeholders
        for (const slotName of template.requiredSlots) {
            const value = humanizeSlotValue(slotName, slots[slotName]);
            if (value) {
                text = text.replace(new RegExp(`\\{${slotName}\\}`, "g"), value);
            }
        }

        // Limpar placeholders não preenchidos
        text = text.replace(/\{[a-zA-Z_]+\}/g, "");

        // Limpar espaços extras
        text = text.replace(/\s+/g, " ").trim();

        return text;
    }

    /**
     * Verifica se há template disponível para a ação
     */
    hasTemplate(action: AgentAction, intent: Intent, state: ConversationStateType): boolean {
        return this.templates.some((t) => {
            const intents = Array.isArray(t.intent) ? t.intent : [t.intent];
            const states = Array.isArray(t.state) ? t.state : [t.state];
            return t.action === action && intents.includes(intent) && states.includes(state);
        });
    }

    /**
     * Retorna estatísticas de templates
     */
    getStats(): { totalTemplates: number; actionsCovered: Set<string> } {
        const actionsCovered = new Set(this.templates.map((t) => t.action));
        return {
            totalTemplates: this.templates.length,
            actionsCovered,
        };
    }
}

function humanizeSlotValue(slotName: string, value: unknown): string | undefined {
    if (!value || typeof value !== "string") return undefined;

    if (slotName === "usage") {
        const usageMap: Record<string, string> = {
            running: "corrida",
            gym: "academia",
            casual: "dia a dia",
            football: "futebol",
        };
        return usageMap[value] || value;
    }

    return value;
}

// ─── DEFAULT ENGINE (singleton) ───

let defaultEngine: TemplateEngine | null = null;

export function getTemplateEngine(templates?: Template[]): TemplateEngine {
    if (!defaultEngine) {
        defaultEngine = new TemplateEngine(templates);
    } else if (templates && templates.length > 0 && defaultEngine.getStats().totalTemplates === 0) {
        // If the singleton was created empty earlier, hydrate it on first real use.
        defaultEngine.addTemplates(templates);
    }
    return defaultEngine;
}

export function setDefaultEngine(engine: TemplateEngine): void {
    defaultEngine = engine;
}
