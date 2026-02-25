import type { Intent } from "./intent-classifier";
import type { ConversationStateType, Slots } from "./state-manager";
import { logActionDecision } from "./telemetry";

export type AgentAction =
    | "ASK_SIZE"
    | "ASK_USAGE"
    | "ASK_PRODUCT"
    | "SHOW_PRODUCT"
    | "OFFER_RESERVATION"
    | "REQUEST_ORDER_DATA"
    | "PROVIDE_POLICY"
    | "ESCALATE"
    | "LLM_FALLBACK";

export interface ActionDecisionContext {
    intent: Intent;
    state: ConversationStateType;
    slots: Slots;
    frustrationLevel: number;
    lastQuestionType: string | null;
    hasClosingSignal?: boolean;
    messageCount?: number;
}

export function decideAction(context: ActionDecisionContext): AgentAction {
    const { intent, state, slots, frustrationLevel, hasClosingSignal, messageCount } = context;

    if (frustrationLevel >= 3) return "ESCALATE";
    if (intent === "HANDOFF") return "ESCALATE";

    // INFO_SAC_POLICY: perguntas sobre políticas - NUNCA pede dados, mesmo em support_sac
    if (intent === "INFO_SAC_POLICY") return "PROVIDE_POLICY";

    if (intent.startsWith("SAC_")) return decideSacAction(context);
    if (state === "support_sac" && (intent === "SUPPORT" || intent === "CLARIFICATION")) {
        return decideSacAction({ ...context, intent: "SAC_ATRASO" });
    }
    // INFO: perguntas gerais - não precisa de dados
    if (intent === "INFO" || intent.startsWith("INFO_")) return "PROVIDE_POLICY";
    if (intent === "SUPPORT") return "LLM_FALLBACK";

    if (intent === "OBJECTION") {
        if (hasClosingSignal && slots.product && slots.size) {
            return "OFFER_RESERVATION";
        }
        return "LLM_FALLBACK";
    }

    if (intent === "CLARIFICATION") {
        if (slots.infoTopic) return "PROVIDE_POLICY";
        const hasSalesContext =
            Boolean(slots.product) ||
            Boolean(slots.categoria) ||
            Boolean(slots.usage) ||
            Boolean(slots.size) ||
            hasClosingSignal === true;

        if (
            hasSalesContext &&
            (state === "greeting" || state === "discovery" || state === "proposal" || state === "closing")
        ) {
            return decideSalesAction({ ...context, intent: "SALES" });
        }

        // IMPORTANTE: Nao perguntar produto automaticamente quando nao entendeu
        // Deixa o LLM pedir esclarecimento de forma natural
        if (state === "greeting") return "LLM_FALLBACK";
        if ((state === "discovery" || state === "proposal" || state === "closing") && !slots.product && !slots.categoria) {
            return "LLM_FALLBACK";
        }
        return "LLM_FALLBACK";
    }

    if (intent === "RESERVATION") {
        if (slots.product && slots.size) return "OFFER_RESERVATION";
        if (slots.product) return "ASK_SIZE";
        return "ASK_PRODUCT";
    }

    if (intent === "CLOSING_SALE") {
        if (slots.product && slots.size) return "OFFER_RESERVATION";
        return "LLM_FALLBACK";
    }

    if (intent === "SALES") return decideSalesAction(context);

    return "LLM_FALLBACK";
}

function isProductJustBrand(slots: Slots): boolean {
    return Boolean(
        slots.product &&
        slots.marca &&
        slots.product.toLowerCase() === slots.marca.toLowerCase()
    );
}

function decideSalesAction(context: ActionDecisionContext): AgentAction {
    const { state, slots, hasClosingSignal, messageCount } = context;
    const isApparel = slots.categoria === "vestuario";

    // PRIMEIRA MENSAGEM: usar saudação amigável
    // mesmo que tenha produto (ex: "Boa noite, tem camisa do brasil?")
    // O template de saudação será selecionado pelo state="greeting"
    if (state === "greeting") {
        return "ASK_PRODUCT";
    }

    if (hasClosingSignal) {
        if (isApparel && !slots.size) {
            return "ASK_SIZE";
        }
        if (isProductJustBrand(slots) && !slots.categoria) {
            return "ASK_USAGE";
        }
        if (slots.size && (slots.categoria || (slots.product && !isProductJustBrand(slots)))) {
            return "OFFER_RESERVATION";
        }
        if (slots.product || slots.categoria) {
            if (!slots.usage) return "ASK_USAGE";
            return "ASK_SIZE";
        }
        return "ASK_PRODUCT";
    }

    if (state === "discovery") {
        if (!slots.product && !slots.categoria) return "ASK_PRODUCT";
        if (isApparel && !slots.size) return "ASK_SIZE";
        if (isProductJustBrand(slots) && !slots.categoria) return "ASK_USAGE";
        if (!slots.usage) return "ASK_USAGE";
        if (!slots.size) return "ASK_SIZE";
        return "SHOW_PRODUCT";
    }

    if (state === "proposal") {
        if (isApparel && !slots.size) return "ASK_SIZE";
        if (!slots.usage && (slots.product || slots.categoria)) return "ASK_USAGE";
        if (slots.size && (slots.categoria || (slots.product && !isProductJustBrand(slots)))) {
            return "OFFER_RESERVATION";
        }
        if (slots.product || slots.categoria) return "ASK_SIZE";
        return "SHOW_PRODUCT";
    }

    if (state === "closing") {
        if (slots.product && slots.size) return "OFFER_RESERVATION";
        if (isApparel && !slots.size) return "ASK_SIZE";
        if (!slots.usage && (slots.product || slots.categoria)) return "ASK_USAGE";
        if (!slots.size && (slots.product || slots.categoria)) return "ASK_SIZE";
        return "SHOW_PRODUCT";
    }

    if (state === "objection") return "LLM_FALLBACK";
    if (state === "support" || state === "support_sac") return decideSacAction(context);

    if (!slots.product) return "ASK_PRODUCT";
    if (!slots.usage) return "ASK_USAGE";
    if (!slots.size) return "ASK_SIZE";
    return "SHOW_PRODUCT";
}

function decideSacAction(context: ActionDecisionContext): AgentAction {
    const { intent, slots } = context;

    // Loja física: não precisa de orderId, só CPF
    const isLojaFisica = slots.canalVenda === "loja_fisica";
    const needsOrderData = isLojaFisica
        ? !slots.cpf
        : !slots.orderId || !slots.cpf;

    switch (intent) {
        case "SAC_TROCA":
            return needsOrderData ? "REQUEST_ORDER_DATA" : "PROVIDE_POLICY";
        case "SAC_ATRASO":
            return needsOrderData ? "REQUEST_ORDER_DATA" : "PROVIDE_POLICY";
        case "SAC_RETIRADA":
            return needsOrderData ? "REQUEST_ORDER_DATA" : "PROVIDE_POLICY";
        case "SAC_REEMBOLSO":
            return needsOrderData ? "REQUEST_ORDER_DATA" : "PROVIDE_POLICY";
        default:
            return "LLM_FALLBACK";
    }
}

export function actionToString(action: AgentAction): string {
    return action;
}

export function getActionPriority(action: AgentAction): number {
    const priorities: Record<AgentAction, number> = {
        ESCALATE: 1,
        OFFER_RESERVATION: 2,
        SHOW_PRODUCT: 3,
        PROVIDE_POLICY: 4,
        ASK_SIZE: 5,
        ASK_USAGE: 6,
        ASK_PRODUCT: 7,
        REQUEST_ORDER_DATA: 8,
        LLM_FALLBACK: 9,
    };
    return priorities[action];
}

// Keep import referenced to avoid accidental removal in some build configs.
void logActionDecision;