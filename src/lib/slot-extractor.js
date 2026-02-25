"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractSlots = extractSlots;
exports.hasClosingSignal = hasClosingSignal;
// â”€â”€â”€ PATTERNS â”€â”€â”€
// PadrÃ£o explÃ­cito para tamanho que previne "40 reais" virar size=40
var SIZE_CONTEXT_PATTERNS = [
    /\btamanho\s+(1[0-9]|2[0-9]|3[0-9]|4[0-6])\b/i,
    /\bn[uÃº]mero\s+(1[0-9]|2[0-9]|3[0-9]|4[0-6])\b/i,
    /\bnumera[Ã§c][aÃ£]o\s+(1[0-9]|2[0-9]|3[0-9]|4[0-6])\b/i,
    /\bcalÃ§o\s+(3[4-9]|4[0-6])\b/i, // "calÃ§o 42"
    /\b(PP|P|M|G|GG|XG|XGG)\b/i,
];
var USAGE_KEYWORDS = {
    running: ["correr", "corrida", "correndo", "corr", "run", "running", "maratona", "cooper", "caminhada", "caminhar"],
    gym: ["academia", "muscula", "treino", "treinar", "crossfit", "cross", "malhar", "malhando", "gym", "fitness"],
    casual: ["dia a dia", "casual", "passeio", "passear", "trabalho", "social", "sair", "usar no dia", "dia dia", "uso diario", "uso diário"],
    football: ["futebol", "fut", "pelada", "society", "campo", "chuteira", "quadra"],
    volleyball: ["volei", "vÃ´lei", "voleibol", "vÃ´lei de praia"],
    basketball: ["basquete", "basket", "basketball"],
};
var CLOSING_KEYWORDS = ["quero", "levo", "vou levar", "comprar", "pegar", "fechar", "pode mandar", "manda", "quero esse", "esse mesmo"];
// â”€â”€â”€ TELEMETRY PATTERNS â”€â”€â”€
var MARCA_PATTERN = /\b(nike|adidas|puma|new\s*balance|asics|mizuno|fila|olympikus|under\s*armour|reebok|vans|converse|hering|penalty)\b/i;
var CATEGORIA_KEYWORDS = {
    tenis: ["tÃªnis", "tenis", "sneaker", "sapatilha", "air max", "air force", "ultraboost", "superstar"],
    chuteira: ["chuteira", "society", "futsal"],
    sandalia: ["sandÃ¡lia", "sandalia", "chinelo", "slide", "rasteirinha"],
    mochila: ["mochila", "bolsa", "bag", "mala"],
    vestuario: ["camiseta", "camisa", "shorts", "bermuda", "calÃ§a", "meia", "meiao", "meião", "bonÃ©", "cap", "meias", "calcao", "calção", "maio", "maiô", "regata", "top"],
    bola: ["bola", "ball"],
    equipamento: ["luva", "joelheira", "cotoveleira", "munhequeira", "capacete", "oogle", "óculos", "nadar", "natacao", "natação", "cadarco", "cadarço", "caneleira"],
};
var GENERO_PATTERNS = {
    masculino: /\b(masculino|masc\.?|homem|homens|menino|meninos|male|adulto\s*m)\b/i,
    feminino: /\b(feminino|fem\.?|mulher|mulheres|menina|meninas|female|adulta\s*f)\b/i,
    infantil: /\b(infantil|crianÃ§a|criancas|kids?|jÃºnior|junior)\b/i,
    unissex: /\b(unissex|unisex)\b/i,
};
// Modelos especÃ­ficos DEVEM vir ANTES das marcas na regex
// para que "Nike Pegasus" seja extraÃ­do como "Pegasus" (modelo), nÃ£o "Nike" (marca)
var PRODUCT_PATTERNS = [
    // Modelos especÃ­ficos primeiro (mais especÃ­ficos)
    /\b(pegasus|ultraboost|air max|air force|superstar|nmd|gel|wave|runfalcon|ultrafly)\b/i,
    // Produtos esportivos - bolas e equipamentos
    /\b(bola\s*(de\s*)?(volei|vÃ´lei|futebol|futsal|basquete|handebol|tenis|tÃªnis)?|bola)\b/i,
    // Categorias genÃ©ricas
    /\b(t[eÃª]nis|chuteira|sandalia|sand[aÃ¡]lia|chinelo|mochila|camiseta|camisa|shorts|bermuda|cal[Ã§c]a|meia|meiao|mei[aã]o|bon[eÃ©])\b/i,
    // Marcas por Ãºltimo (menos especÃ­ficas)
    /\b(nike|adidas|puma|new balance|asics|mizuno|fila|olympikus|under armour|reebok)\b/i,
];
// â”€â”€â”€ SAC PATTERNS â”€â”€â”€
var ORDER_ID_PATTERNS = [
    /PED[-_\s]?\d+/i,
    /#\d+/i,
    /\b(?:pedido|compra)\s*(?:n[Ãºu]mero|n[oÂº]?|#|:)?\s*(\d{5,})\b/i,
    /\b(\d{8,14})\b/,
];
var CPF_PATTERN = /\b\d{3}[\.\s]?\d{3}[\.\s]?\d{3}[-\.\s]?\d{2}\b/;
var EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
var MOTIVO_TROCA_MAP = {
    "tamanho errado": ["tamanho", "grande", "pequeno", "apertado", "largo", "ficou grande", "ficou pequeno"],
    "defeito": ["defeito", "quebrado", "estragado", "rasgado", "descolou", "furado"],
    "arrependimento": ["arrependimento", "nÃ£o gostei", "desisti", "devolver", "achei feio"],
    "atraso": ["atraso", "atrasado", "demorou", "nÃ£o chegou", "passou do prazo"],
};
// â”€â”€â”€ BRAND-ONLY DETECTION â”€â”€â”€
var BRAND_NAMES = [
    "nike", "adidas", "puma", "new balance", "asics", "mizuno", "fila",
    "olympikus", "under armour", "reebok", "vans", "converse", "hering", "penalty"
];
/**
 * Verifica se a mensagem ORIGINAL contÃ©m apenas uma marca (sem modelo adicional).
 * Ex: "Adidas" â†’ true (brand-only)
 *      "Adidas tamanho 40" â†’ false (tem tamanho)
 *      "Nike Pegasus" â†’ false (tem modelo)
 *      "Nike Pegasus tamanho 42" â†’ false (tem modelo e tamanho)
 *
 * A verificaÃ§Ã£o Ã© feita na mensagem ORIGINAL, nÃ£o no produto extraÃ­do,
 * porque o produto extraÃ­do pode ser sÃ³ a marca.
 */
function isBrandOnlyMessage(userMessage, extractedProduct) {
    if (!extractedProduct)
        return false;
    var msgLower = userMessage.toLowerCase().trim();
    var productLower = extractedProduct.toLowerCase();
    // Se o produto Ã© uma marca conhecida
    if (BRAND_NAMES.includes(productLower)) {
        // Verificar se a mensagem original tem mais conteÃºdo alÃ©m da marca
        // Remover a marca da mensagem e ver se sobrou algo significativo
        var remaining_1 = msgLower.replace(productLower, '').trim();
        // Se sobrou algo (tamanho, modelo, etc.), nÃ£o Ã© brand-only
        if (remaining_1.length > 0) {
            // Verificar se o que sobrou Ã© sÃ³ ruÃ­do (nÃºmeros isolados, etc.)
            var noisePatterns = [/^\d+$/, /^,/, /^!/, /^\./];
            var isNoiseOnly = noisePatterns.some(function (p) { return p.test(remaining_1); });
            if (!isNoiseOnly) {
                return false; // Tem conteÃºdo adicional â†’ nÃ£o Ã© brand-only
            }
        }
        return true; // SÃ³ tem a marca â†’ Ã© brand-only
    }
    return false; // Produto nÃ£o Ã© uma marca conhecida â†’ nÃ£o Ã© brand-only
}
// â”€â”€â”€ CONFLICT DETECTION â”€â”€â”€
/**
 * Verifica se um novo valor de categoria/uso conflita com o que jÃ¡ foi detectado.
 * Se sim, os slots antigos relacionados devem ser limpos para evitar buscas incorretas.
 */
function detectsCategoryConflict(newUsage, newCategoria, currentSlots) {
    // Novo uso diferente do atual â†’ conflito
    if (newUsage && currentSlots.usage && newUsage !== currentSlots.usage) {
        return true;
    }
    // Nova categoria diferente da atual â†’ conflito
    if (newCategoria && currentSlots.categoria && newCategoria !== currentSlots.categoria) {
        return true;
    }
    // TÃªnis vs chuteira sÃ£o categorias mutuamente exclusivas
    if (newCategoria === "chuteira" && currentSlots.categoria === "tenis")
        return true;
    if (newCategoria === "tenis" && currentSlots.categoria === "chuteira")
        return true;
    return false;
}
// â”€â”€â”€ EXTRACTOR â”€â”€â”€
function extractSlots(userMessage, currentSlots) {
    var _a;
    var msg = userMessage.toLowerCase().trim();
    var extracted = {};
    var hasNewData = false;
    // â”€â”€â”€ ORDEM IMPORTA: categoria â†’ usage â†’ marca â†’ product â†’ size â†’ goal â†’ genero â”€â”€â”€
    // Categoria e usage primeiro para detectar conflito antes de tentar extrair produto
    // 1. Extract categoria (ANTES de usage/product â€” detecta conflito primeiro)
    var newCategoria = extractCategoria(userMessage);
    if (newCategoria) {
        var hasConflict = detectsCategoryConflict(undefined, newCategoria, currentSlots);
        if (hasConflict || !currentSlots.categoria) {
            extracted.categoria = newCategoria;
            hasNewData = true;
            if (hasConflict) {
                // Limpar slots conflitantes: produto e marca podem ser de outra categoria
                extracted.product = undefined;
                extracted.marca = undefined;
                console.log("[SLOTS] \u00F0\u0178\u201D\u201E Conflito de categoria detectado (".concat(currentSlots.categoria, " \u00E2\u2020\u2019 ").concat(newCategoria, "). Resetando product/marca."));
            }
        }
    }
    // 2. Extract usage (ANTES de product â€” define o contexto de busca)
    var newUsage = extractUsage(msg);
    if (newUsage) {
        var hasConflict = detectsCategoryConflict(newUsage, undefined, currentSlots);
        if (hasConflict || !currentSlots.usage) {
            extracted.usage = newUsage;
            hasNewData = true;
            if (hasConflict) {
                // Limpar produto/marca antigos que eram de outro uso
                extracted.product = (_a = extracted.product) !== null && _a !== void 0 ? _a : undefined;
                if (!extracted.product)
                    extracted.product = undefined;
                console.log("[SLOTS] \u00F0\u0178\u201D\u201E Conflito de uso detectado (".concat(currentSlots.usage, " \u00E2\u2020\u2019 ").concat(newUsage, "). Resetando contexto de busca."));
            }
        }
    }
    // 3. Extract marca (brand) â€” for telemetry BI
    if (!currentSlots.marca || extracted.product === undefined) {
        var marca = extractMarca(userMessage);
        if (marca) {
            extracted.marca = marca;
            hasNewData = true;
        }
    }
    // 4. Extract product mention (APÃ“S categoria/usage â€” para usar contexto correto)
    // NÃƒO extrair produto se for apenas uma marca (sem modelo)
    // "Adidas" â†’ nÃ£o define product (sÃ³ marca)
    // "Nike Pegasus" â†’ define product como "Nike Pegasus"
    if (!currentSlots.product || extracted.product === undefined) {
        var product = extractProduct(msg);
        if (product && !isBrandOnlyMessage(userMessage, product)) {
            extracted.product = product;
            hasNewData = true;
        }
        else if (product && isBrandOnlyMessage(userMessage, product)) {
            console.log("[SLOTS] \u00E2\u0161\u00A0\u00EF\u00B8\u008F Brand-only detectado (".concat(product, "), n\u00C3\u00A3o definindo product."));
        }
    }
    // 5. Extract size â€” com padrÃ£o mais seguro para evitar "40 reais" â†’ size=40
    if (!currentSlots.size) {
        var size = extractSizeSafe(msg);
        if (size) {
            extracted.size = size;
            hasNewData = true;
        }
    }
    // 6. Extract goal from context
    if (!currentSlots.goal) {
        var goal = extractGoal(msg);
        if (goal) {
            extracted.goal = goal;
            hasNewData = true;
        }
    }
    // 7. Extract genero (gender) â€” for telemetry BI
    if (!currentSlots.genero) {
        var genero = extractGenero(userMessage);
        if (genero) {
            extracted.genero = genero;
            hasNewData = true;
        }
    }
    // â”€â”€â”€ SAC Extractions â”€â”€â”€
    if (!currentSlots.orderId) {
        var orderId = extractOrderId(msg);
        if (orderId) {
            extracted.orderId = orderId;
            hasNewData = true;
        }
    }
    if (!currentSlots.cpf) {
        var cpf = extractCPF(msg);
        if (cpf) {
            extracted.cpf = cpf;
            hasNewData = true;
        }
    }
    if (!currentSlots.motivoTroca) {
        var motivo = extractMotivoTroca(msg);
        if (motivo) {
            extracted.motivoTroca = motivo;
            hasNewData = true;
        }
    }
    if (!currentSlots.statusPedido) {
        var statusPedido = extractStatusPedido(msg);
        if (statusPedido) {
            extracted.statusPedido = statusPedido;
            hasNewData = true;
        }
    }
    if (!currentSlots.email) {
        var email = extractEmail(userMessage);
        if (email) {
            extracted.email = email;
            hasNewData = true;
        }
    }
    if (!currentSlots.customerName) {
        var customerName = extractCustomerName(userMessage);
        if (customerName) {
            extracted.customerName = customerName;
            hasNewData = true;
        }
    }
    if (!currentSlots.infoTopic) {
        var infoTopic = extractInfoTopic(msg);
        if (infoTopic) {
            extracted.infoTopic = infoTopic;
            hasNewData = true;
        }
    }
    // Extract canalVenda (loja física vs site/app)
    var canalVenda = extractCanalVenda(msg);
    if (canalVenda) {
        extracted.canalVenda = canalVenda;
        hasNewData = true;
    }
    return { extracted: extracted, hasNewData: hasNewData };
}
function extractCanalVenda(msg) {
    // Detectar compra em loja física
    if (msg.includes("compra em loja") ||
        msg.includes("comprei na loja") ||
        msg.includes("loja fisica") ||
        msg.includes("loja física") ||
        msg.includes("comprei em loja") ||
        msg.includes("fui na loja") ||
        msg.includes("peguei na loja") ||
        msg.includes("retirei na loja")) {
        return "loja_fisica";
    }
    // Detectar compra online/site/app
    if (msg.includes("comprei no site") ||
        msg.includes("comprei pelo site") ||
        msg.includes("comprei no app") ||
        msg.includes("comprei pelo app") ||
        msg.includes("compra online") ||
        msg.includes("pedido online") ||
        msg.includes("site e") ||
        msg.includes("pelo site")) {
        return "site_app";
    }
    return undefined;
}
// â”€â”€â”€ SIZE EXTRACTION (segura contra falsos positivos) â”€â”€â”€
/**
 * Extrai tamanho preferindo padrÃµes contextuais ("tamanho 42", "nÃºmero 42")
 * antes de padrÃµes numÃ©ricos puros (evita "40 reais" â†’ size=40).
 */
function extractSizeSafe(msg) {
    var _a;
    // Primeiro: padrÃµes com contexto explÃ­cito (mais seguros)
    for (var _i = 0, SIZE_CONTEXT_PATTERNS_1 = SIZE_CONTEXT_PATTERNS; _i < SIZE_CONTEXT_PATTERNS_1.length; _i++) {
        var pattern = SIZE_CONTEXT_PATTERNS_1[_i];
        var match_1 = msg.match(pattern);
        if (match_1) {
            return match_1[1] || match_1[0];
        }
    }
    // Segundo: tamanho numÃ©rico puro â€” APENAS se nÃ£o houver "reais", "R$", "% " prÃ³ximo
    var numericPattern = /\b(3[4-9]|4[0-6])\b/;
    var match = msg.match(numericPattern);
    if (match) {
        var idx = (_a = match.index) !== null && _a !== void 0 ? _a : 0;
        var surroundingText = msg.substring(Math.max(0, idx - 10), idx + 10);
        // Ignorar se parece contexto de preÃ§o ou porcentagem
        if (/reais|r\$|\bR\$|desconto|%|off/.test(surroundingText)) {
            return undefined;
        }
        return match[1] || match[0];
    }
    return undefined;
}
function extractUsage(msg) {
    for (var _i = 0, _a = Object.entries(USAGE_KEYWORDS); _i < _a.length; _i++) {
        var _b = _a[_i], usage = _b[0], keywords = _b[1];
        for (var _c = 0, keywords_1 = keywords; _c < keywords_1.length; _c++) {
            var keyword = keywords_1[_c];
            if (msg.includes(keyword)) {
                return usage;
            }
        }
    }
    return undefined;
}
function extractProduct(msg) {
    for (var _i = 0, PRODUCT_PATTERNS_1 = PRODUCT_PATTERNS; _i < PRODUCT_PATTERNS_1.length; _i++) {
        var pattern = PRODUCT_PATTERNS_1[_i];
        var match = msg.match(pattern);
        if (match) {
            return match[0];
        }
    }
    return undefined;
}
function extractGoal(msg) {
    var goalKeywords = {
        performance: "performance|velocidade|rÃ¡pido|competiÃ§Ã£o|competir",
        comfort: "conforto|confortÃ¡vel|macio|amortecimento",
        durability: "durabilidade|durÃ¡vel|resistente|aguentar",
        style: "bonito|estilo|visual|moda|combinar",
        price: "barato|econÃ´mico|em conta|custo benefÃ­cio|custo-benefÃ­cio|promoÃ§Ã£o",
    };
    for (var _i = 0, _a = Object.entries(goalKeywords); _i < _a.length; _i++) {
        var _b = _a[_i], goal = _b[0], pattern = _b[1];
        if (new RegExp(pattern, "i").test(msg)) {
            return goal;
        }
    }
    return undefined;
}
function hasClosingSignal(msg) {
    var lowerMsg = msg.toLowerCase();
    return CLOSING_KEYWORDS.some(function (k) { return lowerMsg.includes(k); });
}
// â”€â”€â”€ SAC EXTRACTORS â”€â”€â”€
function extractOrderId(msg) {
    for (var _i = 0, ORDER_ID_PATTERNS_1 = ORDER_ID_PATTERNS; _i < ORDER_ID_PATTERNS_1.length; _i++) {
        var pattern = ORDER_ID_PATTERNS_1[_i];
        var match = msg.match(pattern);
        if (match) {
            // Se o padrÃ£o tem grupo de captura (ex: pedido (\d+)), retorna ele
            return match[1] || match[0];
        }
    }
    return undefined;
}
function extractCPF(msg) {
    var match = msg.match(CPF_PATTERN);
    if (match) {
        // Limpa pontuaÃ§Ãµes para padronizar
        return match[0].replace(/[^\d]/g, '');
    }
    return undefined;
}
function extractMotivoTroca(msg) {
    for (var _i = 0, _a = Object.entries(MOTIVO_TROCA_MAP); _i < _a.length; _i++) {
        var _b = _a[_i], motivo = _b[0], keywords = _b[1];
        for (var _c = 0, keywords_2 = keywords; _c < keywords_2.length; _c++) {
            var keyword = keywords_2[_c];
            if (msg.includes(keyword.toLowerCase())) {
                return motivo;
            }
        }
    }
    return undefined;
}
function extractEmail(text) {
    var sanitized = text.replace(/@\|/g, "@").replace(/\s+/g, "");
    var match = sanitized.match(EMAIL_PATTERN);
    if (!match)
        return undefined;
    return match[0].toLowerCase();
}
function extractStatusPedido(msg) {
    if (/(atrasado|atraso|demorou|nao chegou|nÃ£o chegou|passou do prazo)/i.test(msg)) {
        return "atrasado";
    }
    if (/(estorno|reembolso|dinheiro de volta)/i.test(msg)) {
        return "reembolso";
    }
    if (/(retirada|retirar na loja|buscar)/i.test(msg)) {
        return "retirada";
    }
    return undefined;
}
function extractCustomerName(text) {
    // Normalizar text para remover chars invisíveis que o WhatsApp pode inserir
    var textCleaned = text.replace(/[\u200B-\u200D\uFEFF]/g, "");
    var trimmed = textCleaned.trim();
    var greetingLike = /^(boa noite|boa tarde|bom dia|oi|ola|ol[aá])$/i;
    // Heuristica 1: "meu nome é X Y"
    var explicit = trimmed.match(/meu nome (e|eh|é)\s+([A-Za-z]+(?:\s+[A-Za-z]+){1,3})/i);
    if (explicit === null || explicit === void 0 ? void 0 : explicit[2]) {
        return explicit[2].trim();
    }
    // Heuristica 2: primeira parte separada por vírgula, ponto e vírgula ou quebra de linha
    var chunks = trimmed.split(/[,;\n]+/).map(function (c) { return c.trim(); }).filter(Boolean);
    for (var _i = 0, chunks_1 = chunks; _i < chunks_1.length; _i++) {
        var chunk = chunks_1[_i];
        if (greetingLike.test(chunk.toLowerCase()))
            continue;
        // Ignorar se tiver dígitos (pedido, CPF, telefone - assumindo que não temos nomes com números)
        if (/\d/.test(chunk))
            continue;
        if (EMAIL_PATTERN.test(chunk))
            continue;
        if (/(pedido|atrasado|troca|estorno|reembolso|quero|gostaria|preciso)\b/i.test(chunk) && !/^([A-Za-zÀ-ÿ]+\s+[A-Za-zÀ-ÿ]+)/i.test(chunk)) {
            continue;
        }
        var cleaned = chunk.replace(/^j[aá]\s+falei[:,]?\s*/i, "").trim();
        if (!cleaned)
            continue;
        var nameCandidate = cleaned.replace(/[^\w\sÀ-ÿ]/g, "").trim();
        var words = nameCandidate.split(/\s+/).filter(Boolean);
        // Aceita 1-4 palavras (ex: "Yuri queiroz" = 2 palavras)
        if (words.length >= 1 && words.length <= 4 && words.every(function (w) { return /^[A-Za-zàáâãéêíóôõúçÀÁÂÃÉÊÍÓÔÕÚÇ]+$/i.test(w); })) {
            if (words.length >= 2 || (words.length === 1 && words[0].length >= 3)) {
                return nameCandidate;
            }
        }
    }
    // Heuristica 3: Mensagem curta pura (sem vírgulas) fallback
    var justAlpha = textCleaned.replace(/[^\w\sÀ-ÿ]/g, "").trim();
    if (justAlpha && !/\d/.test(textCleaned)) {
        var words = justAlpha.split(/\s+/).filter(Boolean);
        if (words.length >= 2 && words.length <= 4) {
            if (!/(pedido|atrasado|troca|estorno|reembolso|quero|gostaria|preciso|informacao|duvida|ajuda)\b/i.test(justAlpha)) {
                return justAlpha;
            }
        }
    }
    return undefined;
}
function extractInfoTopic(msg) {
    var lower = msg.toLowerCase();
    var normalized = lower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (normalized.includes("comprar no site e retirar") ||
        normalized.includes("compra no site e retirar") ||
        normalized.includes("retirada em loja") ||
        normalized.includes("retirar na loja")) {
        return "pickup_policy";
    }
    if (normalized.includes("que horas") ||
        normalized.includes("quando a loja abre") ||
        normalized.includes("quando abre") ||
        normalized.includes("horario") ||
        normalized.includes("funcionamento")) {
        return "hours";
    }
    if (normalized.includes("endereco") ||
        normalized.includes("onde fica") ||
        normalized.includes("onde a loja fica") ||
        normalized.includes("localizacao")) {
        return "address";
    }
    return undefined;
}
// â”€â”€â”€ TELEMETRY EXTRACTORS â”€â”€â”€
/** Normalize text: lowercase + strip accents + spacesâ†’underscore */
function normalizeSlot(text) {
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "_");
}
function extractMarca(msg) {
    var match = msg.match(MARCA_PATTERN);
    return match ? normalizeSlot(match[1]) : undefined;
}
function extractCategoria(msg) {
    var lower = msg
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
    for (var _i = 0, _a = Object.entries(CATEGORIA_KEYWORDS); _i < _a.length; _i++) {
        var _b = _a[_i], categoria = _b[0], keywords = _b[1];
        if (keywords.some(function (kw) {
            return lower.includes(kw.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
        })) {
            return categoria;
        }
    }
    return undefined;
}
function extractGenero(msg) {
    for (var _i = 0, _a = Object.entries(GENERO_PATTERNS); _i < _a.length; _i++) {
        var _b = _a[_i], genero = _b[0], pattern = _b[1];
        if (pattern.test(msg))
            return genero;
    }
    return undefined;
}
