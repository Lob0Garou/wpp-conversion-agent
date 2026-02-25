import { prisma } from "./prisma";
import type { Slots } from "./state-manager";

// ─── TYPES ───

export type StockStatus =
    | "AVAILABLE"          // match forte + qty > 0
    | "UNAVAILABLE"        // match forte + qty = 0
    | "NEEDS_INFO"         // falta tamanho/cor/gênero para confirmar
    | "NEEDS_HUMAN_CHECK"  // match fraco, produto pode existir
    | "DIVERGENCE"         // fonte agregada indica qty>0 mas sem detalhe de tamanho
    | "STOCK_UNKNOWN";     // nenhum snapshot ativo — DB não é source of truth

type Confidence = "ALTA" | "MEDIA" | "BAIXA";

export type ReasonCode =
    | "FOUND_DETAILED_QTY_POS"   // SKU+size exato, qty > 0
    | "FOUND_DETAILED_QTY_ZERO"  // SKU+size exato, qty = 0
    | "FOUND_AGGREGATED_ONLY"    // modelo encontrado sem tamanho específico
    | "CONFLICT_SOURCES"         // agregado diz >0, mas sem detalhe do tamanho pedido
    | "LOW_MATCH"                // score < 40 em todos os candidatos
    | "NO_MATCH"                 // nenhum resultado
    | "NO_ACTIVE_SNAPSHOT";      // nenhum snapshot ativo no DB

export interface StockCandidate {
    sku?: string;
    description: string;
    brand?: string;
    size?: string;
    quantity: number;
    source: "DETAILED" | "AGGREGATED";
    score: number;
}

export interface StockResult {
    status: StockStatus;
    confidence: Confidence;
    best?: StockCandidate;
    candidates: StockCandidate[];
    alternatives: StockCandidate[];
    missingSlots: Array<"size" | "color" | "gender">;
    requiresPhysicalCheck: boolean;
    promptHint: string;
    reasonCode: ReasonCode;
}

// ─── HELPERS ───

/**
 * Infer se o produto vem de uma fonte detalhada (CSV com SKU+tamanho)
 * ou agregada (XLSX sem detalhe de tamanho por SKU).
 */
function inferSource(product: {
    sku?: string | null;
    size?: string | null;
}): "DETAILED" | "AGGREGATED" {
    return product.sku && product.size ? "DETAILED" : "AGGREGATED";
}

/**
 * Calcula score de relevância do candidato para os slots do cliente.
 * Score 0-100: mais alto = match mais preciso.
 */
function scoreCandidate(
    product: { description: string; brand?: string | null; size?: string | null; groupName?: string | null },
    slots: Partial<Slots>
): number {
    let score = 0;
    const desc = product.description.toLowerCase();

    // +40 se description contém o produto buscado
    if (slots.product && desc.includes(slots.product.toLowerCase())) {
        score += 40;
    }

    // +30 se tamanho bate exatamente
    if (slots.size && product.size) {
        if (product.size.toLowerCase() === slots.size.toLowerCase()) {
            score += 30;
        }
    }

    // +20 se marca bate
    if (slots.marca && product.brand) {
        if (product.brand.toLowerCase().includes(slots.marca.toLowerCase())) {
            score += 20;
        }
    }

    // +10 se categoria/groupName bate
    if (slots.categoria && product.groupName) {
        if (product.groupName.toLowerCase().includes(slots.categoria.toLowerCase())) {
            score += 10;
        }
    }

    return score;
}

function buildPromptHint(status: StockStatus, confidence: Confidence, missingSlots: string[]): string {
    switch (status) {
        case "AVAILABLE":
            return "Produto encontrado no sistema. Pergunte se o cliente quer confirmar no estoque físico e reservar.";
        case "UNAVAILABLE":
            return "Produto indisponível. Ofereça os similares listados ou opção de encomenda.";
        case "NEEDS_INFO":
            return `Colete as informações faltantes antes de confirmar: ${missingSlots.join(", ")}.`;
        case "NEEDS_HUMAN_CHECK":
            return "Match fraco no sistema — produto pode existir. Oriente cliente a aguardar confirmação da equipe.";
        case "DIVERGENCE":
            return "Sistema indica estoque no geral, mas tamanho específico precisa de verificação física.";
        case "STOCK_UNKNOWN":
            return "Sistema sem dados de estoque. Pergunte se o cliente gostaria de falar com um atendente ou peça para importar o arquivo de estoque.";
    }
}

// ─── MAIN FUNCTION ───

/**
 * Valida o pedido do cliente contra os produtos disponíveis no DB.
 * 100% rule-based — zero chamadas ao LLM.
 *
 * @param products - resultado de findRelevantProducts()
 * @param slots    - slots extraídos da conversa
 */
export function validateStockRequest(
    products: Array<{
        description: string;
        quantity: number;
        sku?: string | null;
        size?: string | null;
        brand?: string | null;
        groupName?: string | null;
    }>,
    slots: Partial<Slots>
): StockResult {
    const missingSlots: Array<"size" | "color" | "gender"> = [];

    // Sem nenhum produto encontrado na RAG
    if (products.length === 0) {
        if (!slots.size && (slots.product || slots.marca || slots.categoria)) {
            missingSlots.push("size");
        }
        return {
            status: "NEEDS_INFO",
            confidence: "BAIXA",
            candidates: [],
            alternatives: [],
            missingSlots,
            requiresPhysicalCheck: false,
            promptHint: buildPromptHint("NEEDS_INFO", "BAIXA", missingSlots),
            reasonCode: "NO_MATCH",
        };
    }

    // Calcular score de cada candidato
    const candidates: StockCandidate[] = products.map(p => ({
        sku: p.sku ?? undefined,
        description: p.description,
        brand: p.brand ?? undefined,
        size: p.size ?? undefined,
        quantity: p.quantity,
        source: inferSource(p),
        score: scoreCandidate(p, slots),
    })).sort((a, b) => b.score - a.score);

    const topCandidates = candidates.slice(0, 3);
    const best = topCandidates[0];

    // ── REGRA 1: Todos os candidatos têm score baixo (match fraco) ───────
    if (best.score < 40) {
        return {
            status: "NEEDS_HUMAN_CHECK",
            confidence: "BAIXA",
            best,
            candidates: topCandidates,
            alternatives: [],
            missingSlots: [],
            requiresPhysicalCheck: true,
            promptHint: buildPromptHint("NEEDS_HUMAN_CHECK", "BAIXA", []),
            reasonCode: "LOW_MATCH",
        };
    }

    // ── REGRA 2: Cliente informou tamanho ─────────────────────────────────
    if (slots.size) {
        const detailedWithSize = candidates.filter(
            c => c.source === "DETAILED" && c.size && c.score >= 60
        );

        // Caso A: temos match detalhado (SKU+size) bom
        if (detailedWithSize.length > 0) {
            const detailedBest = detailedWithSize[0];
            if (detailedBest.quantity > 0) {
                return {
                    status: "AVAILABLE",
                    confidence: "ALTA",
                    best: detailedBest,
                    candidates: topCandidates,
                    alternatives: [],
                    missingSlots: [],
                    requiresPhysicalCheck: true,
                    promptHint: buildPromptHint("AVAILABLE", "ALTA", []),
                    reasonCode: "FOUND_DETAILED_QTY_POS",
                };
            } else {
                return {
                    status: "UNAVAILABLE",
                    confidence: "ALTA",
                    best: detailedBest,
                    candidates: topCandidates,
                    alternatives: [],
                    missingSlots: [],
                    requiresPhysicalCheck: false,
                    promptHint: buildPromptHint("UNAVAILABLE", "ALTA", []),
                    reasonCode: "FOUND_DETAILED_QTY_ZERO",
                };
            }
        }

        // Caso B: só temos fonte agregada com qty > 0 (tamanho solicitado mas sem detalhe)
        const aggregatedWithQty = candidates.filter(
            c => c.source === "AGGREGATED" && c.quantity > 0 && c.score >= 40
        );
        if (aggregatedWithQty.length > 0) {
            return {
                status: "DIVERGENCE",
                confidence: "MEDIA",
                best: aggregatedWithQty[0],
                candidates: topCandidates,
                alternatives: [],
                missingSlots: [],
                requiresPhysicalCheck: true,
                promptHint: buildPromptHint("DIVERGENCE", "MEDIA", []),
                reasonCode: "CONFLICT_SOURCES",
            };
        }

        // Caso C: nenhum match útil com o tamanho
        return {
            status: "UNAVAILABLE",
            confidence: "MEDIA",
            best,
            candidates: topCandidates,
            alternatives: [],
            missingSlots: [],
            requiresPhysicalCheck: false,
            promptHint: buildPromptHint("UNAVAILABLE", "MEDIA", []),
            reasonCode: "FOUND_DETAILED_QTY_ZERO",
        };
    }

    // ── REGRA 3: Sem tamanho nos slots ────────────────────────────────────
    const aggregatedWithQty = candidates.filter(
        c => c.source === "AGGREGATED" && c.quantity > 0
    );
    const detailedWithQty = candidates.filter(
        c => c.source === "DETAILED" && c.quantity > 0
    );

    if (aggregatedWithQty.length > 0 || detailedWithQty.length > 0) {
        missingSlots.push("size");
        return {
            status: "NEEDS_INFO",
            confidence: "MEDIA",
            best: (detailedWithQty[0] ?? aggregatedWithQty[0]),
            candidates: topCandidates,
            alternatives: [],
            missingSlots,
            requiresPhysicalCheck: false,
            promptHint: buildPromptHint("NEEDS_INFO", "MEDIA", missingSlots),
            reasonCode: "FOUND_AGGREGATED_ONLY",
        };
    }

    // qty = 0 em todos os candidatos
    return {
        status: "UNAVAILABLE",
        confidence: "MEDIA",
        best,
        candidates: topCandidates,
        alternatives: [],
        missingSlots: [],
        requiresPhysicalCheck: false,
        promptHint: buildPromptHint("UNAVAILABLE", "MEDIA", []),
        reasonCode: "FOUND_DETAILED_QTY_ZERO",
    };
}

// ─── ALTERNATIVES LOOKUP ───

/**
 * Busca produtos similares (mesma marca OU categoria) com qty > 0.
 * Chamado apenas quando status === UNAVAILABLE.
 */
export async function findAlternatives(
    storeId: string,
    slots: Partial<Slots>,
    currentDescription?: string,
    limit = 3
): Promise<StockCandidate[]> {
    try {
        const conditions: any = {
            storeId,
            quantity: { gt: 0 },
        };

        // Excluir o produto atual da lista de alternativas
        if (currentDescription) {
            conditions.description = { not: currentDescription };
        }

        // Filtrar por mesma marca ou mesma categoria
        const orFilters: any[] = [];
        if (slots.marca) {
            orFilters.push({ brand: { contains: slots.marca, mode: "insensitive" } });
        }
        if (slots.categoria) {
            orFilters.push({ groupName: { contains: slots.categoria, mode: "insensitive" } });
        }
        if (orFilters.length > 0) {
            conditions.OR = orFilters;
        }

        const results = await prisma.product.findMany({
            where: conditions,
            take: limit,
            select: {
                sku: true,
                description: true,
                brand: true,
                size: true,
                quantity: true,
                groupName: true,
            },
        });

        return results.map(p => ({
            sku: p.sku ?? undefined,
            description: p.description,
            brand: p.brand ?? undefined,
            size: p.size ?? undefined,
            quantity: p.quantity,
            source: inferSource(p),
            score: scoreCandidate(p, slots),
        }));
    } catch (error) {
        console.error("[STOCK] ❌ Erro ao buscar alternativas:", error);
        return [];
    }
}

// ─── AFFIRMATIVE RESPONSE DETECTOR ───

/**
 * Detecta se o cliente respondeu positivamente a uma pergunta de confirmação.
 * Usado para disparar criação de ticket de checagem física.
 */
export function isAffirmativeResponse(message: string): boolean {
    const normalized = message.toLowerCase().trim();
    const patterns = [
        /^sim$/,
        /^s$/,
        /\bsim\b/,
        /\bquero\b/,
        /\bpode\b/,
        /\bpode ser\b/,
        /\bconfirma\b/,
        /\bvai\b/,
        /\bfaz isso\b/,
        /\bpor favor\b/,
        /\bvamos\b/,
        /\bclaro\b/,
        /\blógico\b/,
        /\bperfeito\b/,
        /\bótimo\b/,
        /\bcerto\b/,
        /\bokay\b/,
        /\bok\b/,
    ];
    return patterns.some(p => p.test(normalized));
}

// ─── STOCK UNKNOWN RESULT ───

/**
 * Cria um resultado STOCK_UNKNOWN quando não há snapshot ativo.
 * O DB NÃO é source of truth — sem snapshot, não podemos responder sobre estoque.
 * 
 * IMPORTANTE: Chamar esta função antes de validar estoque se não houver snapshot ativo.
 * O Cadu NÃO deve afirmar disponibilidade sem dados.
 */
export function createStockUnknownResult(): StockResult {
    return {
        status: "STOCK_UNKNOWN",
        confidence: "BAIXA",
        candidates: [],
        alternatives: [],
        missingSlots: [],
        requiresPhysicalCheck: false,
        promptHint: buildPromptHint("STOCK_UNKNOWN", "BAIXA", []),
        reasonCode: "NO_ACTIVE_SNAPSHOT",
    };
}
