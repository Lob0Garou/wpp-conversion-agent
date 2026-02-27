import type { Slots } from "./state-manager";

export interface SlotExtractionResult {
    extracted: Partial<Slots>;
    hasNewData: boolean;
}

// â”€â”€â”€ PATTERNS â”€â”€â”€

// PadrÃ£o explÃ­cito para tamanho que previne "40 reais" virar size=40
const SIZE_CONTEXT_PATTERNS = [
    /\btamanho\s+(1[0-9]|2[0-9]|3[0-9]|4[0-6])\b/i,
    /\bn[uÃº]mero\s+(1[0-9]|2[0-9]|3[0-9]|4[0-6])\b/i,
    /\bnumera[Ã§c][aÃ£]o\s+(1[0-9]|2[0-9]|3[0-9]|4[0-6])\b/i,
    /\bcalÃ§o\s+(3[4-9]|4[0-6])\b/i,                 // "calÃ§o 42"
    /\b(PP|P|M|G|GG|XG|XGG)\b/i,
];

const USAGE_KEYWORDS: Record<string, string[]> = {
    running: ["correr", "corrida", "correndo", "corr", "run", "running", "maratona", "cooper", "caminhada", "caminhar"],
    gym: ["academia", "muscula", "treino", "treinar", "crossfit", "cross", "malhar", "malhando", "gym", "fitness"],
    casual: ["dia a dia", "casual", "passeio", "passear", "trabalho", "social", "sair", "usar no dia", "dia dia", "uso diario", "uso diário"],
    football: ["futebol", "fut", "pelada", "society", "campo", "chuteira", "quadra"],
    volleyball: ["volei", "vÃ´lei", "voleibol", "vÃ´lei de praia"],
    basketball: ["basquete", "basket", "basketball"],
};

const CLOSING_KEYWORDS = ["quero", "levo", "vou levar", "comprar", "pegar", "fechar", "pode mandar", "manda", "quero esse", "esse mesmo"];

// â”€â”€â”€ TELEMETRY PATTERNS â”€â”€â”€

const MARCA_PATTERN = /\b(nike|adidas|puma|new\s*balance|asics|mizuno|fila|olympikus|under\s*armour|reebok|vans|converse|hering|penalty)\b/i;

const CATEGORIA_KEYWORDS: Record<string, string[]> = {
    tenis: ["tÃªnis", "tenis", "sneaker", "sapatilha", "air max", "air force", "ultraboost", "superstar"],
    chuteira: ["chuteira", "society", "futsal"],
    sandalia: ["sandÃ¡lia", "sandalia", "chinelo", "slide", "rasteirinha"],
    mochila: ["mochila", "bolsa", "bag", "mala"],
    vestuario: ["camiseta", "camisa", "shorts", "bermuda", "calÃ§a", "meia", "meiao", "meião", "bonÃ©", "cap", "meias", "calcao", "calção", "maio", "maiô", "regata", "top"],
    bola: ["bola", "ball"],
    equipamento: ["luva", "joelheira", "cotoveleira", "munhequeira", "capacete", "oogle", "óculos", "nadar", "natacao", "natação", "cadarco", "cadarço", "caneleira"],
};

const GENERO_PATTERNS: Record<string, RegExp> = {
    masculino: /\b(masculino|masc\.?|homem|homens|menino|meninos|male|adulto\s*m)\b/i,
    feminino: /\b(feminino|fem\.?|mulher|mulheres|menina|meninas|female|adulta\s*f)\b/i,
    infantil: /\b(infantil|crianÃ§a|criancas|kids?|jÃºnior|junior)\b/i,
    unissex: /\b(unissex|unisex)\b/i,
};

// Modelos especÃ­ficos DEVEM vir ANTES das marcas na regex
// para que "Nike Pegasus" seja extraÃ­do como "Pegasus" (modelo), nÃ£o "Nike" (marca)
const PRODUCT_PATTERNS = [
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
const ORDER_ID_PATTERNS = [
    /PED[-_\s]?\d+/i,
    /#\d+/i,
    /\b(?:pedido|compra)\s*(?:n[Ãºu]mero|n[oÂº]?|#|:)?\s*(\d{5,})\b/i,
    /\b(\d{8,14})\b/,
];

const CPF_PATTERN = /\b\d{3}[\.\s]?\d{3}[\.\s]?\d{3}[-\.\s]?\d{2}\b/;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

const MOTIVO_TROCA_MAP: Record<string, string[]> = {
    "tamanho errado": ["tamanho", "grande", "pequeno", "apertado", "largo", "ficou grande", "ficou pequeno"],
    "defeito": ["defeito", "quebrado", "estragado", "rasgado", "descolou", "furado"],
    "presente": ["presente", "ganhei", "ganhado"],
    "arrependimento": ["arrependimento", "nÃ£o gostei", "desisti", "devolver", "achei feio"],
    "atraso": ["atraso", "atrasado", "demorou", "nÃ£o chegou", "passou do prazo"],
};

// â”€â”€â”€ BRAND-ONLY DETECTION â”€â”€â”€

const BRAND_NAMES = [
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
function isBrandOnlyMessage(userMessage: string, extractedProduct: string | undefined): boolean {
    if (!extractedProduct) return false;

    const msgLower = userMessage.toLowerCase().trim();
    const productLower = extractedProduct.toLowerCase();

    // Se o produto Ã© uma marca conhecida
    if (BRAND_NAMES.includes(productLower)) {
        // Verificar se a mensagem original tem mais conteÃºdo alÃ©m da marca
        // Remover a marca da mensagem e ver se sobrou algo significativo
        const remaining = msgLower.replace(productLower, '').trim();
        // Se sobrou algo (tamanho, modelo, etc.), nÃ£o Ã© brand-only
        if (remaining.length > 0) {
            // Verificar se o que sobrou Ã© sÃ³ ruÃ­do (nÃºmeros isolados, etc.)
            const noisePatterns = [/^\d+$/, /^,/, /^!/, /^\./];
            const isNoiseOnly = noisePatterns.some(p => p.test(remaining));
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
function detectsCategoryConflict(
    newUsage: string | undefined,
    newCategoria: string | undefined,
    currentSlots: Slots
): boolean {
    // Novo uso diferente do atual â†’ conflito
    if (newUsage && currentSlots.usage && newUsage !== currentSlots.usage) {
        return true;
    }
    // Nova categoria diferente da atual â†’ conflito
    if (newCategoria && currentSlots.categoria && newCategoria !== currentSlots.categoria) {
        return true;
    }
    // TÃªnis vs chuteira sÃ£o categorias mutuamente exclusivas
    if (newCategoria === "chuteira" && currentSlots.categoria === "tenis") return true;
    if (newCategoria === "tenis" && currentSlots.categoria === "chuteira") return true;
    return false;
}

// â”€â”€â”€ EXTRACTOR â”€â”€â”€

export function extractSlots(
    userMessage: string,
    currentSlots: Slots
): SlotExtractionResult {
    const msg = userMessage.toLowerCase().trim();
    const extracted: Partial<Slots> = {};
    let hasNewData = false;

    // â”€â”€â”€ ORDEM IMPORTA: categoria â†’ usage â†’ marca â†’ product â†’ size â†’ goal â†’ genero â”€â”€â”€
    // Categoria e usage primeiro para detectar conflito antes de tentar extrair produto

    // 1. Extract categoria (ANTES de usage/product â€” detecta conflito primeiro)
    const newCategoria = extractCategoria(userMessage);
    if (newCategoria) {
        const hasConflict = detectsCategoryConflict(undefined, newCategoria, currentSlots);
        if (hasConflict || !currentSlots.categoria) {
            extracted.categoria = newCategoria;
            hasNewData = true;
            if (hasConflict) {
                // Limpar slots conflitantes: produto e marca podem ser de outra categoria
                extracted.product = undefined;
                extracted.marca = undefined;
                console.log(`[SLOTS] ðŸ”„ Conflito de categoria detectado (${currentSlots.categoria} â†’ ${newCategoria}). Resetando product/marca.`);
            }
        }
    }

    // 2. Extract usage (ANTES de product â€” define o contexto de busca)
    const newUsage = extractUsage(msg);
    if (newUsage) {
        const hasConflict = detectsCategoryConflict(newUsage, undefined, currentSlots);
        if (hasConflict || !currentSlots.usage) {
            extracted.usage = newUsage;
            hasNewData = true;
            if (hasConflict) {
                // Limpar produto/marca antigos que eram de outro uso
                extracted.product = extracted.product ?? undefined;
                if (!extracted.product) extracted.product = undefined;
                console.log(`[SLOTS] ðŸ”„ Conflito de uso detectado (${currentSlots.usage} â†’ ${newUsage}). Resetando contexto de busca.`);
            }
        }
    }

    // 3. Extract marca (brand) â€” for telemetry BI
    if (!currentSlots.marca || extracted.product === undefined) {
        const marca = extractMarca(userMessage);
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
        const product = extractProduct(msg);
        if (product && !isBrandOnlyMessage(userMessage, product)) {
            extracted.product = product;
            hasNewData = true;
        } else if (product && isBrandOnlyMessage(userMessage, product)) {
            console.log(`[SLOTS] âš ï¸ Brand-only detectado (${product}), nÃ£o definindo product.`);
        }
    }

    // 5. Extract size â€” com padrÃ£o mais seguro para evitar "40 reais" â†’ size=40
    if (!currentSlots.size) {
        const size = extractSizeSafe(msg);
        if (size) {
            extracted.size = size;
            hasNewData = true;
        }
    }

    // 6. Extract goal from context
    if (!currentSlots.goal) {
        const goal = extractGoal(msg);
        if (goal) {
            extracted.goal = goal;
            hasNewData = true;
        }
    }

    // 7. Extract genero (gender) â€” for telemetry BI
    if (!currentSlots.genero) {
        const genero = extractGenero(userMessage);
        if (genero) {
            extracted.genero = genero;
            hasNewData = true;
        }
    }

    // â”€â”€â”€ SAC Extractions â”€â”€â”€
    if (!currentSlots.orderId) {
        const orderId = extractOrderId(msg);
        if (orderId) {
            extracted.orderId = orderId;
            hasNewData = true;
        }
    }

    if (!currentSlots.cpf) {
        const cpf = extractCPF(msg);
        if (cpf) {
            extracted.cpf = cpf;
            hasNewData = true;
        }
    }

    const canOverrideMotivoTroca =
        (currentSlots.motivoTroca === "defeito" && /\bn[aã]o\s+(e|eh|é)\s+defeito\b/i.test(msg)) ||
        (typeof currentSlots.motivoTroca === "string" && currentSlots.motivoTroca !== "presente" && /\bpresente\b/i.test(msg) && /\btroc/.test(msg));

    if (!currentSlots.motivoTroca || canOverrideMotivoTroca) {
        const motivo = extractMotivoTroca(msg);
        if (motivo) {
            extracted.motivoTroca = motivo;
            hasNewData = true;
        }
    }

    if (!currentSlots.statusPedido) {
        const statusPedido = extractStatusPedido(msg);
        if (statusPedido) {
            extracted.statusPedido = statusPedido;
            hasNewData = true;
        }
    }

    if (!currentSlots.email) {
        const email = extractEmail(userMessage);
        if (email) {
            extracted.email = email;
            hasNewData = true;
        }
    }

    if (!currentSlots.customerName) {
        const customerName = extractCustomerName(userMessage);
        if (customerName) {
            extracted.customerName = customerName;
            hasNewData = true;
        }
    }

    if (!currentSlots.infoTopic) {
        const infoTopic = extractInfoTopic(msg);
        if (infoTopic) {
            extracted.infoTopic = infoTopic;
            hasNewData = true;
        }
    }

    // Extract canalVenda (loja física vs site/app)
    const canalVenda = extractCanalVenda(msg);
    if (canalVenda) {
        extracted.canalVenda = canalVenda;
        hasNewData = true;
    }

    return { extracted, hasNewData };
}

function extractCanalVenda(msg: string): string | undefined {
    // Detectar compra em loja física
    if (
        msg.includes("compra em loja") ||
        msg.includes("comprei na loja") ||
        msg.includes("loja fisica") ||
        msg.includes("loja física") ||
        msg.includes("comprei em loja") ||
        msg.includes("fui na loja") ||
        msg.includes("peguei na loja") ||
        msg.includes("retirei na loja") ||
        msg.includes("comprei ai") ||
        msg.includes("comprei aí")
    ) {
        return "loja_fisica";
    }
    // Detectar compra online/site/app
    if (
        msg.includes("comprei no site") ||
        msg.includes("comprei pelo site") ||
        msg.includes("comprei no app") ||
        msg.includes("comprei pelo app") ||
        msg.includes("compra online") ||
        msg.includes("pedido online") ||
        msg.includes("site e") ||
        msg.includes("pelo site")
    ) {
        return "site_app";
    }
    return undefined;
}

// â”€â”€â”€ SIZE EXTRACTION (segura contra falsos positivos) â”€â”€â”€

/**
 * Extrai tamanho preferindo padrÃµes contextuais ("tamanho 42", "nÃºmero 42")
 * antes de padrÃµes numÃ©ricos puros (evita "40 reais" â†’ size=40).
 */
function extractSizeSafe(msg: string): string | undefined {
    // Primeiro: padrÃµes com contexto explÃ­cito (mais seguros)
    for (const pattern of SIZE_CONTEXT_PATTERNS) {
        const match = msg.match(pattern);
        if (match) {
            return match[1] || match[0];
        }
    }

    // Segundo: tamanho numÃ©rico puro â€” APENAS se nÃ£o houver "reais", "R$", "% " prÃ³ximo
    const numericPattern = /\b(3[4-9]|4[0-6])\b/;
    const match = msg.match(numericPattern);
    if (match) {
        const idx = match.index ?? 0;
        const surroundingText = msg.substring(Math.max(0, idx - 10), idx + 10);
        // Ignorar se parece contexto de preÃ§o ou porcentagem
        if (/reais|r\$|\bR\$|desconto|%|off/.test(surroundingText)) {
            return undefined;
        }
        return match[1] || match[0];
    }

    return undefined;
}

function extractUsage(msg: string): string | undefined {
    for (const [usage, keywords] of Object.entries(USAGE_KEYWORDS)) {
        for (const keyword of keywords) {
            if (msg.includes(keyword)) {
                return usage;
            }
        }
    }
    return undefined;
}

function extractProduct(msg: string): string | undefined {
    for (const pattern of PRODUCT_PATTERNS) {
        const match = msg.match(pattern);
        if (match) {
            return match[0];
        }
    }
    return undefined;
}

function extractGoal(msg: string): string | undefined {
    const goalKeywords: Record<string, string> = {
        performance: "performance|velocidade|rÃ¡pido|competiÃ§Ã£o|competir",
        comfort: "conforto|confortÃ¡vel|macio|amortecimento",
        durability: "durabilidade|durÃ¡vel|resistente|aguentar",
        style: "bonito|estilo|visual|moda|combinar",
        price: "barato|econÃ´mico|em conta|custo benefÃ­cio|custo-benefÃ­cio|promoÃ§Ã£o",
    };

    for (const [goal, pattern] of Object.entries(goalKeywords)) {
        if (new RegExp(pattern, "i").test(msg)) {
            return goal;
        }
    }
    return undefined;
}

export function hasClosingSignal(msg: string): boolean {
    const lowerMsg = msg.toLowerCase();
    return CLOSING_KEYWORDS.some((k) => lowerMsg.includes(k));
}

// â”€â”€â”€ SAC EXTRACTORS â”€â”€â”€

function extractOrderId(msg: string): string | undefined {
    for (const pattern of ORDER_ID_PATTERNS) {
        const match = msg.match(pattern);
        if (match) {
            // Se o padrÃ£o tem grupo de captura (ex: pedido (\d+)), retorna ele
            return match[1] || match[0];
        }
    }
    return undefined;
}

function extractCPF(msg: string): string | undefined {
    const match = msg.match(CPF_PATTERN);
    if (match) {
        // Limpa pontuaÃ§Ãµes para padronizar
        return match[0].replace(/[^\d]/g, '');
    }
    return undefined;
}

function extractMotivoTroca(msg: string): string | undefined {
    for (const [motivo, keywords] of Object.entries(MOTIVO_TROCA_MAP)) {
        for (const keyword of keywords) {
            const normalizedKeyword = keyword.toLowerCase();
            if (msg.includes(normalizedKeyword) && !hasNegationNearKeyword(msg, normalizedKeyword)) {
                return motivo;
            }
        }
    }
    return undefined;
}

function hasNegationNearKeyword(msg: string, keyword: string): boolean {
    const idx = msg.indexOf(keyword);
    if (idx === -1) return false;
    const prefix = msg.slice(Math.max(0, idx - 20), idx);
    return /\b(n[aã]o|nem|sem)\b/i.test(prefix);
}

function extractEmail(text: string): string | undefined {
    const sanitized = text.replace(/@\|/g, "@").replace(/\s+/g, "");
    const match = sanitized.match(EMAIL_PATTERN);
    if (!match) return undefined;
    return match[0].toLowerCase();
}

function extractStatusPedido(msg: string): string | undefined {
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

function extractCustomerName(text: string): string | undefined {
    // Normalizar text para remover chars invisíveis que o WhatsApp pode inserir
    const textCleaned = text.replace(/[\u200B-\u200D\uFEFF]/g, "");
    const trimmed = textCleaned.trim();
    const greetingLike = /^(boa noite|boa tarde|bom dia|oi|ola|ol[aá]|tudo bem|ol[aá]\s+tudo bem|oi\s+tudo bem)$/i;

    // Heuristica 1: "meu nome é X Y"
    const explicit = trimmed.match(/meu nome (e|eh|é)\s+([A-Za-z]+(?:\s+[A-Za-z]+){1,3})/i);
    if (explicit?.[2]) {
        return explicit[2].trim();
    }

    // Heuristica 2: primeira parte separada por vírgula, ponto e vírgula ou quebra de linha
    const chunks = trimmed.split(/[,;\n]+/).map((c) => c.trim()).filter(Boolean);
    for (const chunk of chunks) {
        if (greetingLike.test(chunk.toLowerCase())) continue;
        if (/^(n[aã]o|não)\s+(e|eh|é)\b/i.test(chunk)) continue;
        if (/^(era|e)\s+s[oó]\b/i.test(chunk)) continue;
        // Ignorar se tiver dígitos (pedido, CPF, telefone - assumindo que não temos nomes com números)
        if (/\d/.test(chunk)) continue;
        if (EMAIL_PATTERN.test(chunk)) continue;

        if (/(pedido|atrasado|troca|estorno|reembolso|defeito|garantia|retirada|retirar|quero|gostaria|preciso)\b/i.test(chunk) && !/^([A-Za-zÀ-ÿ]+\s+[A-Za-zÀ-ÿ]+)/i.test(chunk)) {
            continue;
        }
        if (/(quantos dias|qual prazo|qual o prazo|sao quantos|sÃ£o quantos)/i.test(chunk)) continue;

        const cleaned = chunk.replace(/^j[aá]\s+falei[:,]?\s*/i, "").trim();
        if (!cleaned) continue;

        const nameCandidate = cleaned.replace(/[^\w\sÀ-ÿ]/g, "").trim();
        const words = nameCandidate.split(/\s+/).filter(Boolean);

        // Aceita 1-4 palavras (ex: "Yuri queiroz" = 2 palavras)
        if (words.length >= 1 && words.length <= 4 && words.every((w) => /^[A-Za-zàáâãéêíóôõúçÀÁÂÃÉÊÍÓÔÕÚÇ]+$/i.test(w))) {
            if (words.length >= 2 || (words.length === 1 && words[0].length >= 3)) {
                return nameCandidate;
            }
        }
    }

    // Heuristica 3: Mensagem curta pura (sem vírgulas) fallback
    const justAlpha = textCleaned.replace(/[^\w\sÀ-ÿ]/g, "").trim();
    if (justAlpha && !/\d/.test(textCleaned)) {
        const words = justAlpha.split(/\s+/).filter(Boolean);
        if (words.length >= 2 && words.length <= 4) {
            if (!/(pedido|atrasado|troca|estorno|reembolso|defeito|garantia|retirada|retirar|quero|gostaria|preciso|informacao|duvida|ajuda)\b/i.test(justAlpha)) {
                return justAlpha;
            }
        }
    }

    return undefined;
}

function extractInfoTopic(msg: string): string | undefined {
    const lower = msg.toLowerCase();
    const normalized = lower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (
        normalized.includes("comprar no site e retirar") ||
        normalized.includes("compra no site e retirar") ||
        normalized.includes("retirada em loja") ||
        normalized.includes("retirar na loja") ||
        ((normalized.includes("retirar") || normalized.includes("retirada")) &&
            (normalized.includes("marido") ||
                normalized.includes("esposa") ||
                normalized.includes("terceiro") ||
                normalized.includes("outra pessoa") ||
                normalized.includes("alguem")))
    ) {
        return "pickup_policy";
    }
    if (
        normalized.includes("que horas") ||
        normalized.includes("quando a loja abre") ||
        normalized.includes("quando abre") ||
        normalized.includes("horario") ||
        normalized.includes("funcionamento")
    ) {
        return "hours";
    }
    if (
        normalized.includes("endereco") ||
        normalized.includes("onde fica") ||
        normalized.includes("onde a loja fica") ||
        normalized.includes("localizacao")
    ) {
        return "address";
    }
    if (normalized.includes("troca") || normalized.includes("trocar")) {
        return "exchange";
    }
    if (normalized.includes("estorno") || normalized.includes("reembolso") || normalized.includes("devolucao") || normalized.includes("devolver")) {
        return "refund";
    }
    return undefined;
}

// â”€â”€â”€ TELEMETRY EXTRACTORS â”€â”€â”€

/** Normalize text: lowercase + strip accents + spacesâ†’underscore */
function normalizeSlot(text: string): string {
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "_");
}

function extractMarca(msg: string): string | undefined {
    const match = msg.match(MARCA_PATTERN);
    return match ? normalizeSlot(match[1]) : undefined;
}

function extractCategoria(msg: string): string | undefined {
    const lower = msg
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
    for (const [categoria, keywords] of Object.entries(CATEGORIA_KEYWORDS)) {
        if (
            keywords.some((kw) =>
                lower.includes(kw.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))
            )
        ) {
            return categoria;
        }
    }
    return undefined;
}

function extractGenero(msg: string): string | undefined {
    for (const [genero, pattern] of Object.entries(GENERO_PATTERNS)) {
        if (pattern.test(msg)) return genero;
    }
    return undefined;
}

// ============================================================
// F002 SLOT AWARE - Extrai entidades do histórico de conversa
// ============================================================

export type Slot = "orderId" | "cpf" | "size" | "ticketId";

export interface KnownEntities {
    orderId?: string;
    ticketId?: string;
    cpf?: string;
    size?: string;
    customerPhone?: string;
}

export interface KnownEntitiesExtraction {
    known: KnownEntities;
    slotSource: Partial<Record<Slot, string>>;
}

const SLOT_REQUIREMENTS: Record<string, Slot[]> = {
    ORDER_STATUS: ["orderId", "cpf"],
    TRACKING: ["orderId", "cpf"],
    DELIVERY_DELAY: ["orderId", "cpf"],
    EXCHANGE_REQUEST: ["orderId", "cpf"],
    REFUND_REQUEST: ["orderId", "cpf"],
    RETURN_PROCESS: ["orderId", "cpf"],
    VOUCHER_GENERATION: ["orderId", "cpf"],
    STOCK_AVAILABILITY: ["size"],
    STORE_RESERVATION: ["size"],
    RESERVATION: ["size"],
    // Mapeamento para intents internas do Cadu
    SAC_ATRASO: ["orderId", "cpf"],
    SAC_TROCA: ["orderId", "cpf"],
    SAC_REEMBOLSO: ["orderId", "cpf"],
    SAC_RETIRADA: ["orderId", "cpf"],
    SUPPORT: [],
    INFO: [],
    INFO_ADDRESS: [],
    INFO_HOURS: [],
    INFO_SAC_POLICY: [],
};

function normalizeIntent(intent: string): string {
    return String(intent || "").toUpperCase().trim();
}

function toHistoryText(input: string | Array<{ role?: string; content: string }>): string {
    if (typeof input === "string") {
        return input;
    }
    return input
        .filter((msg) => !msg.role || msg.role === "user")
        .map((msg) => msg.content || "")
        .join(" \n ");
}

function isLikelyCpf(value: string): boolean {
    const digits = value.replace(/[^\d]/g, "");
    if (digits.length !== 11) return false;
    // Evita CPFs triviais 00000000000 etc.
    if (/^(\d)\1{10}$/.test(digits)) return false;
    return true;
}

function maskNonDigits(value: string): string {
    return value.replace(/[^\d]/g, "");
}

/**
 * Extrai entidades conhecidas do histórico ou de uma única mensagem.
 * Retorna também a origem de cada slot (slotSource) para auditoria.
 */
export function extractKnownEntities(
    historyTextOrMessages: string | Array<{ role?: string; content: string }>,
    opts?: { customerPhone?: string }
): KnownEntitiesExtraction {
    const known: KnownEntities = {};
    const slotSource: Partial<Record<Slot, string>> = {};

    const text = toHistoryText(historyTextOrMessages);
    const normalizedPhone = opts?.customerPhone ? maskNonDigits(opts.customerPhone) : "";
    if (normalizedPhone) {
        known.customerPhone = normalizedPhone;
    }

    // Ticket: "Ticket #12345" / "#12345"
    const ticketMatch = text.match(/(?:ticket\s*#?\s*|#)\s*(\d{5,})/i);
    if (ticketMatch?.[1]) {
        known.ticketId = ticketMatch[1];
        slotSource.ticketId = "regex_ticket";
    }

    // CPF: 11 dígitos com ou sem máscara
    const cpfMatch = text.match(/\b\d{3}[\.\s]?\d{3}[\.\s]?\d{3}[-\.\s]?\d{2}\b/);
    if (cpfMatch?.[0]) {
        const cpfDigits = maskNonDigits(cpfMatch[0]);
        if (isLikelyCpf(cpfDigits)) {
            known.cpf = cpfDigits;
            slotSource.cpf = "regex_cpf";
        }
    }

    // Pedido explícito com contexto lexical
    const explicitOrderMatch = text.match(/\b(?:pedido|compra)\s*(?:n[uú]mero|n[oº]?|#|:)?\s*(\d{5,14})\b/i);
    if (explicitOrderMatch?.[1]) {
        known.orderId = explicitOrderMatch[1];
        slotSource.orderId = "regex_order_context";
    }

    // Fallback: número isolado 8-14 (evita CPF e ticket)
    if (!known.orderId) {
        const numberMatches = [...text.matchAll(/\b(\d{8,14})\b/g)];
        for (const match of numberMatches) {
            const candidate = match[1];
            if (!candidate) continue;
            if (known.cpf && candidate === known.cpf) continue;
            if (known.ticketId && candidate === known.ticketId) continue;
            // Evita confundir com telefone do cliente quando disponível
            if (normalizedPhone && candidate.endsWith(normalizedPhone.slice(-8))) continue;
            known.orderId = candidate;
            slotSource.orderId = "regex_order_numeric";
            break;
        }
    }

    // Tamanho com contexto (tam 42 / tamanho 42 / número 42 / 42BR / calço 42)
    const sizeMatch =
        text.match(/\b(?:tam(?:anho)?|numera(?:ção|cao)|n(?:[º°]|úmero)?|cal[cç]o)\s*[:#-]?\s*(3[3-9]|4[0-8])\b/i) ||
        text.match(/\b(3[3-9]|4[0-8])\s*br\b/i);
    if (sizeMatch?.[1]) {
        known.size = sizeMatch[1];
        slotSource.size = "regex_size_context";
    }

    return { known, slotSource };
}

/**
 * Extrai entidades conhecidas do histórico de conversa.
 * Retorna orderId, ticketId, cpf e size encontrados em mensagens anteriores.
 */
export function extractKnownEntitiesFromHistory(
    history: Array<{ role: string; content: string }>
): KnownEntities {
    return extractKnownEntities(history).known;
}

/**
 * Mapeamento de campos obrigatórios por intent (F002).
 * Retorna array de campos necessários para cada intent.
 */
function getRequiredFieldsForIntent(intent: string): string[] {
    return SLOT_REQUIREMENTS[normalizeIntent(intent)] || [];
}

/**
 * Retorna slots faltantes para um intent/estado.
 */
export function getMissingSlots(intent: string, known: KnownEntities): Slot[] {
    const required = getRequiredFieldsForIntent(intent) as Slot[];
    return required.filter((field) => {
        if (field === "orderId") {
            return !(known.orderId || known.ticketId);
        }
        return !known[field];
    });
}

/**
 * Pergunta determinística para coleta de slot.
 * Pede apenas o slot prioritário (1 por turno).
 */
export function buildSlotQuestion(
    slot: Slot,
    intent: string,
    known: KnownEntities,
    opts?: { isChatOnly?: boolean }
): string {
    const isChatOnly = Boolean(opts?.isChatOnly);
    const normalizedIntent = normalizeIntent(intent);
    const isSacIntent =
        normalizedIntent === "ORDER_STATUS" ||
        normalizedIntent === "TRACKING" ||
        normalizedIntent === "DELIVERY_DELAY" ||
        normalizedIntent === "EXCHANGE_REQUEST" ||
        normalizedIntent === "REFUND_REQUEST" ||
        normalizedIntent === "RETURN_PROCESS" ||
        normalizedIntent === "VOUCHER_GENERATION" ||
        normalizedIntent.startsWith("SAC_");

    if (slot === "orderId") {
        const tail = isChatOnly && isSacIntent
            ? " Com isso, eu já encaminho para checagem humana sem te fazer repetir tudo."
            : "";
        return `Próximo passo: vou seguir com a verificação assim que você me informar o número do pedido.${tail}`;
    }

    if (slot === "cpf") {
        const preface = known.orderId || known.ticketId
            ? "Perfeito, já tenho a referência do pedido."
            : "Próximo passo:";
        const tail = isChatOnly && isSacIntent
            ? " Com esses dados, eu encaminho para checagem humana quando necessário."
            : "";
        return `${preface} agora me confirme o CPF do titular e eu vou continuar.${tail}`;
    }

    if (slot === "size") {
        return "Próximo passo: me diga o tamanho/número (ex.: 38, 40 ou 42) e eu vou continuar.";
    }

    return "Próximo passo: me informe o número do ticket para eu continuar.";
}

/**
 * Retorna os campos faltantes para o intent atual.
 * Compara as entidades conhecidas (do histórico) com os campos necessários.
 */
export function getMissingData(
    intent: string,
    known: KnownEntities
): string[] {
    return getMissingSlots(intent, known);
}

/**
 * Gera a pergunta para o primeiro campo faltante.
 * Retorna a pergunta apropriada para o campo.
 */
export function getFirstMissingQuestion(field: string): string {
    if (field === "orderId" || field === "cpf" || field === "size" || field === "ticketId") {
        return buildSlotQuestion(field, "UNKNOWN", {});
    }
    return `Qual é o ${field}?`;
}
