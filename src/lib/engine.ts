
export type Intent = "sales" | "stock" | "sac" | "human" | "unknown";
export type Risk = "low" | "medium" | "high";
export type Action = "auto_reply" | "handoff";

export interface AnalysisResult {
    intent: Intent;
    risk: Risk;
    action: Action;
    replyText: string;
    matched?: string[];
}

const KEYWORDS = {
    highRisk: ["procon", "advogado", "justiça", "processo", "processar", "polícia", "fraude", "golpe", "roubo", "enganado"],
    human: ["falar com atendente", "humano", "pessoa", "alguém real", "gerente", "representante", "ligar"],
    sac: ["troca", "devolução", "estorno", "reembolso", "cancelar", "cancelamento", "cobrança", "não chegou", "cadê meu pedido", "atraso", "defeito", "quebrado", "estragado"],
    stock: ["tamanho", "numeração", "cor", "disponível", "disponivel", "estoque", "tem", "tem aí", "tem ai"],
    sales: ["preço", "preco", "valor", "comprar", "parcela", "parcelar", "pix", "cartão", "cartao", "promoção", "promocao"],
};

export function analyzeMessage(text: string): AnalysisResult {
    const lowerText = text.toLowerCase();

    // Helper to find matches
    const findMatch = (keywords: string[]) => keywords.filter((k) => lowerText.includes(k));

    // A) High Risk
    const highRiskMatches = findMatch(KEYWORDS.highRisk);
    if (highRiskMatches.length > 0) {
        return {
            intent: "human",
            risk: "high",
            action: "handoff",
            replyText: "Para resolver isso da melhor forma, vou te passar para a equipe agora. Só um instante.",
            matched: highRiskMatches,
        };
    }

    // B) Human (Low/Medium Risk depending on context, handled as Low for strict "human" request)
    const humanMatches = findMatch(KEYWORDS.human);
    if (humanMatches.length > 0) {
        return {
            intent: "human",
            risk: "low",
            action: "handoff",
            replyText: "Para resolver isso da melhor forma, vou te passar para a equipe agora. Só um instante.",
            matched: humanMatches,
        };
    }

    // C) SAC (Medium Risk)
    const sacMatches = findMatch(KEYWORDS.sac);
    if (sacMatches.length > 0) {
        return {
            intent: "sac",
            risk: "medium",
            action: "handoff",
            replyText: "Para resolver isso da melhor forma, vou te passar para a equipe agora. Só um instante.",
            matched: sacMatches,
        };
    }

    // D) Stock (Low Risk)
    const stockMatches = findMatch(KEYWORDS.stock);
    if (stockMatches.length > 0) {
        return {
            intent: "stock",
            risk: "low",
            action: "auto_reply",
            replyText: "Verifico a disponibilidade pra você agora. Qual o modelo e o tamanho?",
            matched: stockMatches,
        };
    }

    // E) Sales (Low Risk)
    const salesMatches = findMatch(KEYWORDS.sales);
    if (salesMatches.length > 0) {
        return {
            intent: "sales",
            risk: "low",
            action: "auto_reply",
            replyText: "Te ajudo a escolher rápido. É pra qual esporte e qual faixa de tamanho você usa?",
            matched: salesMatches,
        };
    }

    // F) Fallback
    return {
        intent: "unknown",
        risk: "low",
        action: "auto_reply",
        replyText: "Sou o assistente da loja. Você quer ver produto, checar estoque ou falar sobre um pedido?",
    };
}
