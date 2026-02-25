"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateStockRequest = validateStockRequest;
exports.findAlternatives = findAlternatives;
exports.isAffirmativeResponse = isAffirmativeResponse;
exports.createStockUnknownResult = createStockUnknownResult;
var prisma_1 = require("./prisma");
// ─── HELPERS ───
/**
 * Infer se o produto vem de uma fonte detalhada (CSV com SKU+tamanho)
 * ou agregada (XLSX sem detalhe de tamanho por SKU).
 */
function inferSource(product) {
    return product.sku && product.size ? "DETAILED" : "AGGREGATED";
}
/**
 * Calcula score de relevância do candidato para os slots do cliente.
 * Score 0-100: mais alto = match mais preciso.
 */
function scoreCandidate(product, slots) {
    var score = 0;
    var desc = product.description.toLowerCase();
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
function buildPromptHint(status, confidence, missingSlots) {
    switch (status) {
        case "AVAILABLE":
            return "Produto encontrado no sistema. Pergunte se o cliente quer confirmar no estoque físico e reservar.";
        case "UNAVAILABLE":
            return "Produto indisponível. Ofereça os similares listados ou opção de encomenda.";
        case "NEEDS_INFO":
            return "Colete as informa\u00E7\u00F5es faltantes antes de confirmar: ".concat(missingSlots.join(", "), ".");
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
function validateStockRequest(products, slots) {
    var _a;
    var missingSlots = [];
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
            missingSlots: missingSlots,
            requiresPhysicalCheck: false,
            promptHint: buildPromptHint("NEEDS_INFO", "BAIXA", missingSlots),
            reasonCode: "NO_MATCH",
        };
    }
    // Calcular score de cada candidato
    var candidates = products.map(function (p) {
        var _a, _b, _c;
        return ({
            sku: (_a = p.sku) !== null && _a !== void 0 ? _a : undefined,
            description: p.description,
            brand: (_b = p.brand) !== null && _b !== void 0 ? _b : undefined,
            size: (_c = p.size) !== null && _c !== void 0 ? _c : undefined,
            quantity: p.quantity,
            source: inferSource(p),
            score: scoreCandidate(p, slots),
        });
    }).sort(function (a, b) { return b.score - a.score; });
    var topCandidates = candidates.slice(0, 3);
    var best = topCandidates[0];
    // ── REGRA 1: Todos os candidatos têm score baixo (match fraco) ───────
    if (best.score < 40) {
        return {
            status: "NEEDS_HUMAN_CHECK",
            confidence: "BAIXA",
            best: best,
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
        var detailedWithSize = candidates.filter(function (c) { return c.source === "DETAILED" && c.size && c.score >= 60; });
        // Caso A: temos match detalhado (SKU+size) bom
        if (detailedWithSize.length > 0) {
            var detailedBest = detailedWithSize[0];
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
            }
            else {
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
        var aggregatedWithQty_1 = candidates.filter(function (c) { return c.source === "AGGREGATED" && c.quantity > 0 && c.score >= 40; });
        if (aggregatedWithQty_1.length > 0) {
            return {
                status: "DIVERGENCE",
                confidence: "MEDIA",
                best: aggregatedWithQty_1[0],
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
            best: best,
            candidates: topCandidates,
            alternatives: [],
            missingSlots: [],
            requiresPhysicalCheck: false,
            promptHint: buildPromptHint("UNAVAILABLE", "MEDIA", []),
            reasonCode: "FOUND_DETAILED_QTY_ZERO",
        };
    }
    // ── REGRA 3: Sem tamanho nos slots ────────────────────────────────────
    var aggregatedWithQty = candidates.filter(function (c) { return c.source === "AGGREGATED" && c.quantity > 0; });
    var detailedWithQty = candidates.filter(function (c) { return c.source === "DETAILED" && c.quantity > 0; });
    if (aggregatedWithQty.length > 0 || detailedWithQty.length > 0) {
        missingSlots.push("size");
        return {
            status: "NEEDS_INFO",
            confidence: "MEDIA",
            best: ((_a = detailedWithQty[0]) !== null && _a !== void 0 ? _a : aggregatedWithQty[0]),
            candidates: topCandidates,
            alternatives: [],
            missingSlots: missingSlots,
            requiresPhysicalCheck: false,
            promptHint: buildPromptHint("NEEDS_INFO", "MEDIA", missingSlots),
            reasonCode: "FOUND_AGGREGATED_ONLY",
        };
    }
    // qty = 0 em todos os candidatos
    return {
        status: "UNAVAILABLE",
        confidence: "MEDIA",
        best: best,
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
function findAlternatives(storeId_1, slots_1, currentDescription_1) {
    return __awaiter(this, arguments, void 0, function (storeId, slots, currentDescription, limit) {
        var conditions, orFilters, results, error_1;
        if (limit === void 0) { limit = 3; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    conditions = {
                        storeId: storeId,
                        quantity: { gt: 0 },
                    };
                    // Excluir o produto atual da lista de alternativas
                    if (currentDescription) {
                        conditions.description = { not: currentDescription };
                    }
                    orFilters = [];
                    if (slots.marca) {
                        orFilters.push({ brand: { contains: slots.marca, mode: "insensitive" } });
                    }
                    if (slots.categoria) {
                        orFilters.push({ groupName: { contains: slots.categoria, mode: "insensitive" } });
                    }
                    if (orFilters.length > 0) {
                        conditions.OR = orFilters;
                    }
                    return [4 /*yield*/, prisma_1.prisma.product.findMany({
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
                        })];
                case 1:
                    results = _a.sent();
                    return [2 /*return*/, results.map(function (p) {
                            var _a, _b, _c;
                            return ({
                                sku: (_a = p.sku) !== null && _a !== void 0 ? _a : undefined,
                                description: p.description,
                                brand: (_b = p.brand) !== null && _b !== void 0 ? _b : undefined,
                                size: (_c = p.size) !== null && _c !== void 0 ? _c : undefined,
                                quantity: p.quantity,
                                source: inferSource(p),
                                score: scoreCandidate(p, slots),
                            });
                        })];
                case 2:
                    error_1 = _a.sent();
                    console.error("[STOCK] ❌ Erro ao buscar alternativas:", error_1);
                    return [2 /*return*/, []];
                case 3: return [2 /*return*/];
            }
        });
    });
}
// ─── AFFIRMATIVE RESPONSE DETECTOR ───
/**
 * Detecta se o cliente respondeu positivamente a uma pergunta de confirmação.
 * Usado para disparar criação de ticket de checagem física.
 */
function isAffirmativeResponse(message) {
    var normalized = message.toLowerCase().trim();
    var patterns = [
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
    return patterns.some(function (p) { return p.test(normalized); });
}
// ─── STOCK UNKNOWN RESULT ───
/**
 * Cria um resultado STOCK_UNKNOWN quando não há snapshot ativo.
 * O DB NÃO é source of truth — sem snapshot, não podemos responder sobre estoque.
 *
 * IMPORTANTE: Chamar esta função antes de validar estoque se não houver snapshot ativo.
 * O Cadu NÃO deve afirmar disponibilidade sem dados.
 */
function createStockUnknownResult() {
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
