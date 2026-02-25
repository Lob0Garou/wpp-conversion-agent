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
exports.clearPromptCache = clearPromptCache;
exports.clearPromptCacheForFile = clearPromptCacheForFile;
exports.reloadPromptFile = reloadPromptFile;
exports.getPromptCacheStats = getPromptCacheStats;
exports.selectPromptFile = selectPromptFile;
exports.composeSystemPrompt = composeSystemPrompt;
var fs = require("fs");
var path = require("path");
var skill_loader_1 = require("./skill-loader");
// ─── PROMPT CACHE ───
// Prompts estáticos são carregados 1x por processo e cacheados em memória.
// Isso permite que o cache_control: ephemeral do OpenRouter/Anthropic funcione:
// a parte estática (persona + policies) nunca muda → custo de tokens reduzido em até 90%.
//
// ⚠️ IMPORTANTE: O cache DEVE ser invalidado quando patches são aplicados!
// Use clearPromptCache() ou clearPromptCacheForFile() após modificar prompts.
var promptCache = new Map();
/**
 * Limpa todo o cache de prompts.
 * DEVE ser chamado após aplicar patches nos arquivos de prompt.
 */
function clearPromptCache() {
    var size = promptCache.size;
    promptCache.clear();
    console.log("[PROMPTS] \uD83D\uDD04 Cache limpo (".concat(size, " entradas removidas)"));
}
/**
 * Limpa o cache para um arquivo específico.
 * Útil quando apenas um prompt foi modificado.
 */
function clearPromptCacheForFile(filename) {
    var deleted = promptCache.delete(filename);
    if (deleted) {
        console.log("[PROMPTS] \uD83D\uDD04 Cache limpo para: ".concat(filename));
    }
}
/**
 * Recarrega um prompt do disco, ignorando o cache.
 * Útil para verificar se o arquivo foi modificado.
 */
function reloadPromptFile(filename) {
    clearPromptCacheForFile(filename);
    return loadPromptFile(filename);
}
/**
 * Retorna estatísticas do cache para debug.
 */
function getPromptCacheStats() {
    return {
        size: promptCache.size,
        keys: Array.from(promptCache.keys()),
    };
}
function loadPromptFile(filename) {
    if (promptCache.has(filename)) {
        return promptCache.get(filename);
    }
    var promptPath = path.join(process.cwd(), "src", "prompts", filename);
    try {
        var content = fs.readFileSync(promptPath, "utf-8");
        promptCache.set(filename, content);
        return content;
    }
    catch (error) {
        console.error("[PROMPTS] \u274C Failed to load prompt: ".concat(filename), error);
        return "";
    }
}
function loadSoulFile() {
    var cacheKey = "__soul__";
    if (promptCache.has(cacheKey)) {
        return promptCache.get(cacheKey);
    }
    var soulPath = path.join(process.cwd(), "soul.md");
    try {
        var content = fs.readFileSync(soulPath, "utf-8");
        promptCache.set(cacheKey, content);
        return content;
    }
    catch (error) {
        console.error("[PROMPTS] \u274C Failed to load soul.md", error);
        return "";
    }
}
// ─── PROMPT SELECTION ───
function selectPromptFile(state, intent) {
    // Support/Handoff always uses support prompt
    if (intent === "HANDOFF" || intent === "SUPPORT" || state === "support") {
        return "support_resolution.txt";
    }
    if (state === "support_sac" || intent.startsWith("SAC_")) {
        return "support_sac.txt";
    }
    switch (state) {
        case "greeting":
            return "sales_greeting.txt";
        case "discovery":
            return "sales_discovery.txt";
        case "proposal":
            return "sales_proposal.txt";
        case "objection":
            return "sales_objection.txt";
        case "closing":
            return "sales_closing.txt";
        case "post_sale":
            return "sales_closing.txt"; // Reuse closing for post-sale
        default:
            return "sales_greeting.txt";
    }
}
// ─── INVENTORY FORMATTER ───
/**
 * Formata a lista de produtos para leitura natural pelo LLM.
 * NUNCA inclui `quantity` — dado operacional irrelevante para a conversa.
 * Inclui SKU quando disponível, preço quando disponível.
 */
function formatProductsForPrompt(products) {
    if (products.length === 0)
        return "";
    return products
        .map(function (p, i) {
        var parts = ["".concat(i + 1, ".")];
        if (p.sku)
            parts.push("[".concat(p.sku, "]"));
        parts.push(p.description);
        if (p.price != null && Number(p.price) > 0) {
            parts.push("\u2014 R$ ".concat(Number(p.price).toFixed(2).replace(".", ",")));
        }
        parts.push("✅ Em estoque");
        return parts.join(" ");
    })
        .join("\n");
}
// ─── CONTEXT SECTION BUILDER ───
function buildContextSection(context) {
    var SEP = "═══════════════════════════════════════";
    var parts = [];
    var now = new Date();
    var dateStr = now.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
    var timeStr = now.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
    var weekday = now.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long" }).toUpperCase();
    // ── Bloco 1: Estado da conversa ──────────────────────────────────────
    parts.push(SEP);
    parts.push("CONTEXTO DESTA MENSAGEM - ".concat(dateStr, " ").concat(timeStr, " (").concat(weekday, ")"));
    parts.push(SEP);
    parts.push("ESTADO ATUAL: ".concat(translateState(context.currentState)));
    parts.push("INTEN\u00C7\u00C3O DETECTADA: ".concat(context.detectedIntent));
    parts.push("TURNO: ".concat(context.messageCount));
    // ── Bloco 2: Perfil do cliente (slots coletados) ─────────────────────
    var filledSlots = Object.entries(context.slots)
        .filter(function (_a) {
        var v = _a[1];
        return v !== undefined && v !== null && v !== "";
    })
        .map(function (_a) {
        var k = _a[0], v = _a[1];
        return "  - ".concat(translateSlot(k), ": ").concat(v);
    });
    parts.push("");
    parts.push("PERFIL DO CLIENTE (já coletado):");
    if (filledSlots.length > 0) {
        parts.push(filledSlots.join("\n"));
    }
    else {
        parts.push("  (nenhuma informação coletada ainda)");
    }
    // ── Bloco 3: Status do Pedido (Simulação Tool) ───────────────────────
    if (context.slots.orderId) {
        parts.push("");
        parts.push("STATUS DO PEDIDO (Consulta via get_order_status):");
        // Em um ambiente real, chamaríamos a API da transportadora aqui.
        // Simulando resposta com base na intenção para testes do SAC.
        var statusString = "Pedido ".concat(context.slots.orderId, " -> Status: Em separa\u00E7\u00E3o | Previs\u00E3o: Hoje");
        if (context.detectedIntent === "SAC_ATRASO") {
            statusString = "Pedido ".concat(context.slots.orderId, " -> Status: Em transporte | Previs\u00E3o: 15/02 | Atrasado: 5 dias");
        }
        else if (context.detectedIntent === "SAC_REEMBOLSO") {
            statusString = "Pedido ".concat(context.slots.orderId, " -> Status: Cancelado (Arrependimento) | Estorno processado: Sim");
        }
        else if (context.detectedIntent === "SAC_RETIRADA") {
            statusString = "Pedido ".concat(context.slots.orderId, " -> Status: Aguardando Retirada | Loja: Centauro ").concat(context.storeName);
        }
        parts.push(statusString);
    }
    // ── Bloco 4: Próximo objetivo ────────────────────────────────────────
    var missingSlots = getMissingSlots(context);
    if (missingSlots.length > 0) {
        parts.push("");
        parts.push("PRÓXIMO OBJETIVO:");
        parts.push("  Coletar: ".concat(missingSlots.join(", ")));
    }
    // ── Bloco 4: Alertas de estado ───────────────────────────────────────
    if (context.stallCount >= 2) {
        parts.push("");
        parts.push("⚠️ CONVERSA ESTAGNADA: Mude a abordagem. Faça uma sugestão direta em vez de mais perguntas.");
    }
    if (context.frustrationLevel >= 2) {
        parts.push("");
        parts.push("🚨 CLIENTE FRUSTRADO: Seja empático e resolva rápido. Não faça perguntas desnecessárias. Priorize solução.");
    }
    if (context.customerName) {
        parts.push("");
        parts.push("NOME DO CLIENTE: ".concat(context.customerName));
    }
    // ── Bloco 5: Estoque validado (Agente Estoquista) ────────────────────
    parts.push("");
    parts.push(SEP);
    {
        var sr = context.stockResult;
        parts.push("\uD83D\uDCE6 ESTOQUE: ".concat(sr.status, " (confian\u00E7a ").concat(sr.confidence, ")"));
        parts.push("\u2192 ".concat(sr.promptHint));
        if (sr.best) {
            var sizeTag = sr.best.size ? " | Tam. ".concat(sr.best.size) : "";
            parts.push("  Melhor match: ".concat(sr.best.description).concat(sizeTag));
        }
        if (sr.status === "UNAVAILABLE" && sr.alternatives.length > 0) {
            var altList = sr.alternatives.map(function (a) { return a.description; }).join(" | ");
            parts.push("  Similares dispon\u00EDveis: ".concat(altList));
        }
        if (sr.missingSlots.length > 0) {
            parts.push("  Faltando coletar: ".concat(sr.missingSlots.join(", ")));
        }
        parts.push(SEP);
        // Lista de candidatos (para o LLM não inventar fora desta lista)
        if (sr.candidates.length > 0) {
            parts.push("PRODUTOS DISPONÍVEIS — use APENAS estes. Nunca invente produtos fora desta lista:");
            parts.push(formatProductsForPrompt(sr.candidates.map(function (c) { var _a; return ({ description: c.description, quantity: c.quantity, sku: (_a = c.sku) !== null && _a !== void 0 ? _a : null }); })));
        }
        else {
            parts.push("PRODUTOS DISPONÍVEIS: Nenhum encontrado para esta busca.");
            parts.push("INSTRUÇÃO: Não invente produtos. Informe honestamente que este item está indisponível no momento.");
            parts.push("Ofereça alternativas: buscar similar, reservar quando chegar, ou direcionar para atendente.");
        }
    }
    return parts.join("\n");
}
// ─── PROMPT COMPOSITION ───
function getFewShots(intent, state) {
    // Prioritize SAC examples for SAC intents
    if (intent.startsWith("SAC") || state === "support_sac" || state === "support") {
        return "\n### EXEMPLOS DE ATENDIMENTO (SAC)\n- Objetivo: Empatia curta + Coleta de dados (Nome, CPF, Pedido) + Resolu\u00E7\u00E3o ou Ticket.\n\nExemplo 1 (Erro T\u00E9cnico - Vale Troca):\nUser: \"Tentei usar o vale troca no app e deu erro C\u00D3D CHK099.\"\nAssistant: \"Oi! Esse erro CHK099 acontece por seguran\u00E7a quando o endere\u00E7o de entrega \u00E9 alterado. O sistema bloqueia pra evitar fraudes. Tenta manter o endere\u00E7o original ou me passa seu CPF que verifico se consigo liberar por aqui.\"\n\nExemplo 2 (Log\u00EDstica Cruzada - Nike/Centauro):\nUser: \"Fiz uma compra na Nike, deu endere\u00E7o errado e voltou. Vi que o CD \u00E9 na Centauro, t\u00E1 a\u00ED?\"\nAssistant: \"Entendo a confus\u00E3o. Como somos do mesmo grupo (SBF), compartilhamos a malha log\u00EDstica, mas o estoque \u00E9 separado. Vou consultar onde o pedido est\u00E1 exatamente. Me passa o n\u00FAmero do pedido e CPF?\"\n\nExemplo 3 (Atraso/Extravio):\nUser: \"O app diz que entregou mas n\u00E3o recebi nada. O motoboy roubou?\"\nAssistant: \"Sinto muito por esse susto \uD83D\uDE15 Pode ter sido uma baixa indevida da transportadora. Me passa seu CPF e n\u00FAmero do pedido? Vou abrir uma acarea\u00E7\u00E3o agora mesmo pra localizar sua entrega.\"";
    }
    // Sales examples
    if (intent === "SALES" || state === "discovery" || state === "proposal" || state === "closing") {
        return "\n### EXEMPLOS DE ATENDIMENTO (VENDAS)\n- Objetivo: Confirmar estoque real + Oferecer reserva/retirada.\n\nExemplo 1 (Fit/Forma do Produto):\nUser: \"Tem a chuteira Umbro Pro 5 Bump? Uso 42 se a forma for grande.\"\nAssistant: \"Tenho sim a Pro 5 Bump! Ela tem a forma mais justa (apertada) por causa do amortecimento. Se voc\u00EA usa 42, talvez fique exata. Temos a 42 e 43 na cor preta. Quer que eu separe as duas pra voc\u00EA provar aqui?\"\n\nExemplo 2 (Disponibilidade Espec\u00EDfica):\nUser: \"Chegou camisa do Palmeiras feminina?\"\nAssistant: \"Oi! Chegou reposi\u00E7\u00E3o ontem. Tenho a verde (home) e a branca (away) nos tamanhos P e M. A G esgotou. Quer que eu guarde alguma pra voc\u00EA?\"\n\nExemplo 3 (Alternativa de Estoque):\nUser: \"Tem o Nike Metcon 9 no 40?\"\nAssistant: \"O Metcon 9 no 40 acabou de sair. Mas chegou o *Reebok Nano X3* que tem a mesma estabilidade pra Crossfit e t\u00E1 com pre\u00E7o \u00F3timo. Quer ver uma foto ou prefere encomendar o Metcon?\"";
    }
    // Info examples
    if (intent.startsWith("INFO")) {
        return "\n### EXEMPLOS DE ATENDIMENTO (INFO)\n- Objetivo: Resposta direta + Gancho para venda.\n\nExemplo 1 (Retira Loja vs Site):\nUser: \"Tentei comprar no site pra retirar a\u00ED mas n\u00E3o apareceu a op\u00E7\u00E3o.\"\nAssistant: \"Isso acontece quando o produto n\u00E3o est\u00E1 no nosso estoque f\u00EDsico da loja (vem do dep\u00F3sito). O 'Retira R\u00E1pido' s\u00F3 ativa se a gente tiver o item aqui na prateleira. Me manda o link do produto? Se eu tiver aqui, j\u00E1 separo pra voc\u00EA agora.\"\n\nExemplo 2 (Troca sem Nota):\nUser: \"Ganhei um t\u00EAnis mas n\u00E3o tenho a nota, posso trocar?\"\nAssistant: \"Pra troca, a gente precisa vincular a venda. Se quem te deu informou o CPF na compra, a gente consegue puxar a nota fiscal pelo sistema aqui na loja. Sabe me dizer o CPF do comprador?\"";
    }
    return "";
}
/**
 * Compõe o system prompt final combinando:
 * 1. Bloco ESTÁTICO (persona + output format) — candidato a prompt caching
 * 2. Bloco FEW-SHOT DINÂMICO (exemplos reais do MemoryBank por intenção)
 * 3. Bloco DINÂMICO (contexto da conversa + prompt de estado) — muda a cada turno
 *
 * A separação é importante para que o cache_control: ephemeral no ai.ts
 * possa cachear o bloco estático, reduzindo custo de tokens em até 90%.
 */
function composeSystemPrompt(context) {
    return __awaiter(this, void 0, void 0, function () {
        var soul, basePrompt, fewShots, learnedLessons, skillContent, skillBlock, contextSection, statePromptFile, statePrompt;
        return __generator(this, function (_a) {
            soul = loadSoulFile();
            basePrompt = loadPromptFile("system_cadu_v3.txt");
            fewShots = getFewShots(context.detectedIntent, context.currentState);
            learnedLessons = "";
            skillContent = (0, skill_loader_1.loadSkill)(context.detectedIntent, context.currentState);
            skillBlock = skillContent
                ? "\n\n\u2550\u2550\u2550 SKILL ATIVA \u2550\u2550\u2550\n".concat(skillContent, "\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550")
                : "";
            contextSection = buildContextSection(context);
            statePromptFile = selectPromptFile(context.currentState, context.detectedIntent);
            statePrompt = loadPromptFile(statePromptFile);
            // Ordem: alma → base estática → few-shots → PADRÃO OURO → SKILL ATIVA → contexto dinâmico → instrução de estado
            // A alma vem primeiro como camada constitucional inegociável.
            // Os few-shots ficam logo após a base para estabelecer tom antes do contexto.
            // A skill ativa injeta regras táticas específicas antes dos dados variáveis.
            // O state prompt no final define o PRÓXIMO PASSO — posição mais recente = mais atenção do modelo.
            return [2 /*return*/, "".concat(soul, "\n\n# \u2500\u2500\u2500 ALMA DO AGENTE (INEGOCI\u00C1VEL) \u2500\u2500\u2500\n\n").concat(basePrompt).concat(fewShots).concat(learnedLessons).concat(skillBlock, "\n\n").concat(contextSection, "\n\n").concat(statePrompt)];
        });
    });
}
// ─── HELPERS ───
function getMissingSlots(context) {
    var missing = [];
    if (context.currentState === "discovery" || context.currentState === "greeting") {
        if (!context.slots.usage)
            missing.push("uso (corrida/academia/casual/futebol)");
        if (!context.slots.size)
            missing.push("tamanho/numeração");
    }
    if (context.currentState === "proposal") {
        if (!context.slots.product)
            missing.push("produto escolhido");
    }
    if (context.currentState === "support_sac") {
        // Defer to AI prompt logic (it will ask for orderId ONLY if online purchase)
        // if (!context.slots.orderId && !context.slots.cpf) missing.push("nº do pedido ou CPF");
    }
    return missing;
}
function translateState(state) {
    var translations = {
        greeting: "Saudação inicial",
        discovery: "Descoberta de necessidade",
        proposal: "Recomendação de produtos",
        objection: "Tratamento de objeção",
        closing: "Fechamento da venda",
        post_sale: "Pós-venda",
        support: "Atendimento Geral",
        support_sac: "SAC - Tratativa de Problemas",
    };
    return translations[state] || state;
}
function translateSlot(key) {
    var translations = {
        usage: "Uso",
        goal: "Objetivo",
        size: "Tamanho",
        product: "Produto",
        orderId: "Nº do Pedido",
        cpf: "CPF",
        motivoTroca: "Motivo da Troca",
        dataEntrega: "Data de Entrega",
        marca: "Marca",
        categoria: "Categoria",
        genero: "Gênero",
    };
    return translations[key] || key;
}
