import type { ConversationStateType, Slots } from "./state-manager";
import type { Intent } from "./intent-classifier";

export interface TransitionResult {
    nextState: ConversationStateType | null;
    reason: string;
    shouldEscalate: boolean;
}

function isProductJustBrand(slots: Slots): boolean {
    return Boolean(
        slots.product &&
        slots.marca &&
        slots.product.toLowerCase() === slots.marca.toLowerCase()
    );
}

export function determineNextState(
    currentState: ConversationStateType,
    slots: Slots,
    intent: Intent,
    stallCount: number,
    frustrationLevel: number,
    messageCount: number
): TransitionResult {
    if (frustrationLevel >= 3) {
        return { nextState: "support", reason: "frustration_escalation", shouldEscalate: true };
    }

    if (intent === "HANDOFF") {
        return { nextState: "support", reason: "handoff_requested", shouldEscalate: true };
    }

    const softSacIntents: string[] = [];
    if ((intent.startsWith("SAC_") || intent === "SUPPORT") && !softSacIntents.includes(intent)) {
        return {
            nextState: "support_sac",
            reason: `sac_intent_detected_${intent}`,
            shouldEscalate: false,
        };
    }

    if (intent === "INFO" || intent.startsWith("INFO_")) {
        return { nextState: null, reason: "info_request", shouldEscalate: false };
    }

    switch (currentState) {
        case "greeting": {
            if (intent === "SALES") {
                return { nextState: "discovery", reason: "sales_intent", shouldEscalate: false };
            }

            const hasFullProduct = Boolean(slots.product && !isProductJustBrand(slots));
            if (slots.usage || slots.size || hasFullProduct || slots.categoria) {
                return { nextState: "discovery", reason: "slots_provided", shouldEscalate: false };
            }

            if (messageCount >= 2) {
                return { nextState: "discovery", reason: "greeting_timeout", shouldEscalate: false };
            }

            return { nextState: null, reason: "stay_greeting", shouldEscalate: false };
        }

        case "discovery":
            if (slots.usage && slots.size) {
                return { nextState: "proposal", reason: "slots_filled", shouldEscalate: false };
            }
            if (slots.product && !isProductJustBrand(slots)) {
                return { nextState: "proposal", reason: "product_mentioned", shouldEscalate: false };
            }
            if (slots.categoria) {
                return { nextState: "proposal", reason: "categoria_provided", shouldEscalate: false };
            }
            if (stallCount >= 2) {
                return { nextState: "proposal", reason: "stall_recovery", shouldEscalate: false };
            }
            if (messageCount > 10 && !slots.usage && !slots.size) {
                return { nextState: "proposal", reason: "discovery_timeout", shouldEscalate: false };
            }
            return { nextState: null, reason: "stay_discovery", shouldEscalate: false };

        case "proposal":
            if (intent === "OBJECTION") {
                return { nextState: "objection", reason: "objection_detected", shouldEscalate: false };
            }
            if (slots.product && !isProductJustBrand(slots) && hasClosingSignal(intent)) {
                return { nextState: "closing", reason: "closing_signal", shouldEscalate: false };
            }
            if (slots.categoria && hasClosingSignal(intent)) {
                return { nextState: "closing", reason: "closing_signal", shouldEscalate: false };
            }
            if (stallCount >= 3) {
                return { nextState: "closing", reason: "proposal_stall", shouldEscalate: false };
            }
            return { nextState: null, reason: "stay_proposal", shouldEscalate: false };

        case "objection":
            if (intent === "SALES" || intent === "RESERVATION" || intent === "CLOSING_SALE") {
                return { nextState: "closing", reason: "objection_resolved", shouldEscalate: false };
            }
            if (stallCount >= 3) {
                return { nextState: "support", reason: "objection_stall", shouldEscalate: true };
            }
            return { nextState: null, reason: "stay_objection", shouldEscalate: false };

        case "closing":
            if (intent === "OBJECTION") {
                return { nextState: "objection", reason: "late_objection", shouldEscalate: false };
            }
            if (slots.orderId) {
                return { nextState: "post_sale", reason: "order_confirmed", shouldEscalate: false };
            }
            return { nextState: null, reason: "stay_closing", shouldEscalate: false };

        case "post_sale":
            if (intent === "SALES") {
                return { nextState: "discovery", reason: "new_purchase", shouldEscalate: false };
            }
            return { nextState: null, reason: "stay_post_sale", shouldEscalate: false };

        case "support":
            if (intent === "SALES" && frustrationLevel === 0) {
                return { nextState: "discovery", reason: "support_to_sales", shouldEscalate: false };
            }
            return { nextState: null, reason: "stay_support", shouldEscalate: false };

        default:
            return { nextState: null, reason: "unknown_state", shouldEscalate: false };
    }
}

function hasClosingSignal(intent: Intent): boolean {
    // Only explicit reservation/buy-now intents should advance proposal -> closing.
    return intent === "RESERVATION" || intent === "CLOSING_SALE";
}
