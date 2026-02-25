export type RuntimeEnvironment = "legacy" | "langgraph" | "shadow";

export const getAgentRuntimeConfig = (): RuntimeEnvironment => {
    const envVar = process.env.AGENT_RUNTIME;
    if (envVar === "langgraph") return "langgraph";
    if (envVar === "shadow") return "shadow";
    return "legacy"; // Default for safety
};

function normalizePhone(phone: string | undefined | null): string {
    return String(phone || "").replace(/\D/g, "");
}

export function getAgentRuntimeForConversation(phone?: string): RuntimeEnvironment {
    const base = getAgentRuntimeConfig();
    const canaryPhonesRaw = process.env.AGENT_RUNTIME_CANARY_PHONES || "";
    const canaryPhones = new Set(
        canaryPhonesRaw
            .split(",")
            .map((p) => normalizePhone(p))
            .filter(Boolean)
    );

    // If global runtime is legacy, keep it legacy unless explicitly forced.
    if (base === "legacy") {
        const forceCanary = process.env.AGENT_RUNTIME_CANARY_ENABLE === "true";
        if (forceCanary && canaryPhones.size > 0 && canaryPhones.has(normalizePhone(phone))) {
            return "langgraph";
        }
        return "legacy";
    }

    // In shadow mode, allow per-phone canary to receive LangGraph response directly.
    if (base === "shadow" && canaryPhones.size > 0 && canaryPhones.has(normalizePhone(phone))) {
        return "langgraph";
    }

    return base;
}
