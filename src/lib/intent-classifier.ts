import type { ConversationStateType } from "./state-manager";

export type Intent =
    | "SALES"
    | "SUPPORT"
    | "HANDOFF"
    | "OBJECTION"
    | "CLARIFICATION"
    | "INFO"
    | "INFO_HOURS"
    | "INFO_ADDRESS"
    | "INFO_PICKUP_POLICY"
    | "INFO_SAC_POLICY"
    | "SAC_TROCA"
    | "SAC_ATRASO"
    | "SAC_RETIRADA"
    | "SAC_REEMBOLSO"
    | "RESERVATION"
    | "CLOSING_SALE";

const HANDOFF_KEYWORDS = [
    "procon", "advogado", "justica", "justiÃ§a", "processo", "processar",
    "policia", "polÃ­cia", "fraude", "golpe", "roubo", "enganado",
    "falar com atendente", "humano", "pessoa real", "alguem real", "alguÃ©m real",
    "gerente", "representante", "ligar", "quero falar com",
    // Quer falar com vendedor específico ou quer atendimento humano
    "falar com vendedor", "quero o vendedor", "passa vendedor",
    "vendedor airton", "vendedor ailton", "atendente humano",
    "quero falar com humano", "preciso de um vendedor",
];

const SAC_TROCA_KEYWORDS = [
    "defeito", "quebrado", "estragado", "tamanho errado",
    // Defeito com tempo de uso - indicação clara de problema com produto
    "abriu", "rasgou", "soltou", "descolou", "furou",
    "dias de uso", "dias que uso", "tempo de uso",
    "ja usei", "já usei", "estou usando",
    // Expressões de problema pós-compra
    "comprei o", "comprei um", "fui usar", "quando fui usar",
    // Troca com pedido/produto específico = ação
    "quero trocar o", "trocar o pedido", "trocar meu",
    "realizar uma troca", "fazer uma troca", "gostaria de trocar", "quero realizar uma troca", "preciso trocar",
    "quero trocar",
];
const SAC_ATRASO_KEYWORDS = ["atraso", "demora", "nao chegou", "nÃ£o chegou", "cade meu pedido", "cadÃª meu pedido", "onde esta meu", "onde estÃ¡ meu", "quando chega", "esta atrasado", "estÃ¡ atrasado", "pedido atrasou"];
const SAC_RETIRADA_KEYWORDS = ["retirada", "retirar na loja", "buscar", "ja posso buscar", "jÃ¡ posso buscar"];
const SAC_REEMBOLSO_KEYWORDS = ["devolucao", "devoluÃ§Ã£o", "reembolso", "cancelar", "estorno", "cancelamento", "dinheiro de volta"];
const GENERIC_SUPPORT_KEYWORDS = ["problema", "reclamacao", "reclamaÃ§Ã£o", "reclamar", "pedido", "encomenda"];

const INFO_HOURS_KEYWORDS = [
    "horario", "horÃ¡rio", "funcionamento", "que horas", "que horas abre", "que horas fecha", "abre que horas", "fecha que horas",
];
const INFO_ADDRESS_KEYWORDS = [
    "endereco", "endereÃ§o", "localizacao", "localizaÃ§Ã£o", "onde fica", "qual o endereco", "qual o endereÃ§o",
];
const INFO_PICKUP_POLICY_KEYWORDS = [
    "comprar no site e retirar", "compra no site e retirar", "retirar agora", "retirar na loja",
    "retirada em loja", "retira em loja", "retirada de compra online",
    // Perguntas sobre política de retirada por terceiros
    "pode retirar por mim", "pode retirar por", "retirar por mim",
    "outra pessoa pode retirar", "terceiro pode retirar",
    "meu marido pode retirar", "minha esposa pode retirar", "minha mae pode retirar",
    "alguem pode retirar", "alguém pode retirar",
    "meu marido consegue retirar", "minha esposa consegue retirar", "outra pessoa consegue retirar",
    "retirar meu pedido por mim", "retirar o pedido por mim",
];
const INFO_KEYWORDS = [...INFO_HOURS_KEYWORDS, ...INFO_ADDRESS_KEYWORDS];

const META_CLARIFICATION_KEYWORDS = [
    "nao me cumprimentou", "nÃ£o me cumprimentou",
    "nao me perguntou", "nÃ£o me perguntou",
    "nao reagiu", "nÃ£o reagiu",
    "nao entendeu", "nÃ£o entendeu",
    "eu nao falei", "eu nÃ£o falei",
    "nada a ver",
    "pare de falar",
    "seja mais objetivo",
    "caiu em loop",
    "confundindo as mensagens",
    "que seco",
    "ta seco",
    "tÃ¡ seco",
    "seco demais",
    "amistosidade",
    "seja mais amigavel",
    "seja mais amigÃ¡vel",
    "porque tao seco",
    "porque tÃ£o seco",
    "nossa que seco",
    "faltou ser cordial", "faltou ser mais cordial", "mais cordial",
    "nao cumprimentou", "não cumprimentou",
    "grosso",
    // Meta-feedback: cliente corrigindo a resposta do bot
    "nao perguntei", "nÃ£o perguntei",
    "porque me disse", "por que me disse",
    "nao era isso", "nÃ£o era isso",
    "voce errou", "vocÃª errou",
    "resposta errada",
    "se atente", "se atenta",
    "voce disse", "vocÃª disse",
    "eu disse que nao", "eu disse que nÃ£o",
    "dados errados", "dados incorretos", "informacao errada", "informaÃ§Ã£o errada",
    "nao foi isso", "nÃ£o foi isso", "troca e diferente", "troca Ã© diferente",
];

const OBJECTION_KEYWORDS = [
    "caro", "muito caro", "barato", "desconto",
    "nao sei", "nÃ£o sei", "vou pensar", "depois", "talvez",
    "ta caro", "tÃ¡ caro", "preco alto", "preÃ§o alto", "salgado",
    "tem mais barato", "outra opcao", "outra opÃ§Ã£o",
];

const SALES_KEYWORDS = [
    "preco", "preÃ§o", "valor", "comprar", "parcela", "parcelar",
    "pix", "cartao", "cartÃ£o", "promocao", "promoÃ§Ã£o", "quero", "levo",
    "tem", "disponivel", "disponÃ­vel", "estoque", "tamanho",
    "cor", "modelo", "marca", "tenis", "tÃªnis", "chuteira",
    "camisa", "camiseta", "meia", "meiao", "meiÃ£o",
];

// Perguntas sobre políticas da loja (INFO) vs solicitações de ação (SAC)
const SAC_INFO_PATTERNS = [
    "qual o prazo", "qual e o prazo", "qual Ã© o prazo",
    "prazo para troca", "prazo pra troca",
    "prazo para reembolso", "prazo para estorno", "politica de troca",
    "politica de reembolso", "como funciona a troca", "como funciona o reembolso",
    "posso trocar", "posso devolver", "da pra trocar", "da pra devolver",
    "regras de troca", "regras de devolucao",
    // Perguntas sobre garantia - são INFO, não SAC
    "qual a garantia", "qual e a garantia", "qual Ã© a garantia",
    "garantia para defeito", "garantia de defeito", "garantia do produto",
    "tempo de garantia", "prazo de garantia",
    // Cliente deixando claro que é só informação, não chamado
    "so uma informacao", "sÃ³ uma informaÃ§Ã£o",
    "e apenas uma informacao", "Ã© apenas uma informaÃ§Ã£o",
    "apenas uma informacao", "apenas uma duvida", "apenas uma dÃºvida",
    "so uma duvida", "sÃ³ uma dÃºvida",
    "nao e um chamado", "nÃ£o Ã© um chamado",
    "nao e um problema", "nÃ£o Ã© um problema",
    // Troca de presente = pergunta sobre política, não ação
    "trocar um presente", "trocar o presente", "trocar presente",
    "troca de presente", "troca de um presente",
    "presente que ganhei", "ganhei de presente",
    "ganhei um presente", "ganhei presente",
    // Informação relacionada a troca
    "informacao sobre troca", "informaÃ§Ã£o sobre troca", "informaÃ§Ã£o de troca",
    "como faco pra trocar", "como faÃ§o pra trocar", "como e a troca",
    // Perguntas sobre prazo - CRÍTICO para separar INFO de SAC
    "quantos dias", "quantas dias",
    "qual o tempo", "qual e o tempo",
    "tenho quantos dias", "tenho quanto tempo",
    // Perguntas sobre estorno/reembolso
    "estorno cai", "estorno cai quando", "quando cai o estorno",
    "reembolso cai", "dinheiro volta", "dinheiro cai",
    // Perguntas sobre política de retirada
    "politica de retirada", "como funciona a retirada",
    "posso buscar por", "pode buscar por",
];

const RESERVATION_KEYWORDS = [
    "reservar", "reserva", "guardar", "separar",
    "deixa comigo", "segura", "agendar",
    "vou buscar", "passo buscando", "passo pra buscar",
];

const FRUSTRATION_INDICATORS = [
    "pessimo", "pÃ©ssimo", "horrivel", "horrÃ­vel", "absurdo", "vergonha",
    "nunca mais", "pior", "demora", "lento",
    // Indicadores de loop/problema
    "loop", "repetindo", "mesma coisa", "insiste", "nao entende",
    "nÃ£o entende", "nao entendeu", "nÃ£o entendeu",
];

const GREETING_ONLY_PATTERNS = [
    /^(oi|ola|olÃ¡|opa|e ai|e aÃ­|bom dia|boa tarde|boa noite)\s*!*$/i,
    /^(oi|ola|olá|bom dia|boa tarde|boa noite)[,\s]+tudo bem\??\s*!*$/i,
    /^tudo bem\??\s*!*$/i,
    /^o+i+\s*!*$/i,
    /^oi+e+\s*!*$/i,
];

export function hasNegationPrefix(msg: string, keyword: string): boolean {
    const NEGATION_WORDS = [
        "nao ", "nÃ£o ", "nunca ", "jamais ", "sem ", "nenhum ",
        "nenhuma ", "nem ", "tampouco ", "sequer ",
    ];

    const keywordIndex = msg.indexOf(keyword);
    if (keywordIndex === -1) return false;

    const windowStart = Math.max(0, keywordIndex - 25);
    const prefix = msg.substring(windowStart, keywordIndex);
    return NEGATION_WORDS.some((neg) => prefix.includes(neg));
}

function matchesAnyWithNegation(text: string, keywords: string[]): boolean {
    return keywords.some((k) => text.includes(k) && !hasNegationPrefix(text, k));
}

export function classifyIntent(
    userMessage: string,
    currentState: ConversationStateType,
    conversationHistory: { role: "user" | "assistant"; content: string }[]
): Intent {
    const msg = userMessage.toLowerCase().trim();
    const normalizedMsg = msg
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    // ========== PRIORIDADE ABSOLUTA: Perguntas sobre prazo/política ==========
    // "Quero fazer uma troca, tenho quantos dias?" = pergunta sobre política
    // "fiz um estorno e ainda não caiu" = pergunta sobre política
    // ESTA VERIFICAÇÃO DEVE SER A PRIMEIRA PARA EVITAR CLASSIFICAÇÃO ERRADA
    const hasPrazoQuestion = /quantos\s+dias|quantas\s+dias|qual\s+o\s+prazo|qual\s+e\s+o\s+prazo|tenho\s+quanto\s+tempo|sao\s+quantos\s+dias/i.test(normalizedMsg);
    const hasRefundQuestion = /estorno|estorn|reembolso|reembols|refund|dinheiro.*volta|dinheiro.*cai|dinheiro.*cair/i.test(normalizedMsg);

    if (hasPrazoQuestion || hasRefundQuestion) {
        return "INFO_SAC_POLICY";
    }

    // Fast-path INFO (mais robusto para acentos/variações frasais)
    // Padrão flexível para horário - captura variações e erros de digitação
    const asksAboutHours =
        normalizedMsg.includes("que horas") ||
        normalizedMsg.includes("quando a loja abre") ||
        normalizedMsg.includes("quando abre") ||
        normalizedMsg.includes("horario da loja") ||
        normalizedMsg.includes("funcionamento da loja") ||
        /^abre\s+que\s+hor/i.test(normalizedMsg) ||      // "abre que horas" / "abre que horaas"
        /^fecha\s+que\s+hor/i.test(normalizedMsg) ||      // "fecha que horas"
        /\bhor[aá]r[iio]/i.test(normalizedMsg) ||         // "horario", "horário"
        /\bfuncionamento\b/i.test(normalizedMsg) ||       // "funcionamento"
        /que\s*horas?\s*(abre|fecha|abrimos|fechamos)/i.test(normalizedMsg); // "que horas abre"

    if (asksAboutHours) {
        return "INFO_HOURS";
    }
    if (
        normalizedMsg.includes("endereco da loja") ||
        normalizedMsg.includes("qual o endereco") ||
        normalizedMsg.includes("onde a loja fica") ||
        normalizedMsg.includes("onde fica a loja")
    ) {
        return "INFO_ADDRESS";
    }
    if (
        normalizedMsg.includes("comprar no site e retirar") ||
        normalizedMsg.includes("compra no site e retirar") ||
        normalizedMsg.includes("retirar agora") ||
        normalizedMsg.includes("retirada em loja") ||
        ((normalizedMsg.includes("retirar") || normalizedMsg.includes("retirada")) &&
            (normalizedMsg.includes("marido") ||
                normalizedMsg.includes("esposa") ||
                normalizedMsg.includes("terceiro") ||
                normalizedMsg.includes("outra pessoa") ||
                normalizedMsg.includes("alguem") ||
                normalizedMsg.includes("alguém")))
    ) {
        return "INFO_PICKUP_POLICY";
    }

    // Fast-path meta feedback (evita cair em SALES por "quero")
    if (
        normalizedMsg.includes("nao me respondeu") ||
        normalizedMsg.includes("não me respondeu") ||
        normalizedMsg.includes("de primeira") ||
        normalizedMsg.includes("por que nao") ||
        normalizedMsg.includes("porque nao me respondeu") ||
        normalizedMsg.includes("que seco") ||
        normalizedMsg.includes("amistosidade") ||
        normalizedMsg.includes("nao cumprimentou") ||
        normalizedMsg.includes("não cumprimentou") ||
        (normalizedMsg.includes("seco") && normalizedMsg.includes("cumprimentou")) ||
        normalizedMsg.includes("mais cordial")
    ) {
        return "CLARIFICATION";
    }

    if (matchesAnyWithNegation(msg, HANDOFF_KEYWORDS)) return "HANDOFF";

    if (hasFrustrationSignal(msg, userMessage)) return "HANDOFF";

    if (isRepeatedMessage(msg, conversationHistory) && currentState !== "greeting") {
        return "CLARIFICATION";
    }

    if (GREETING_ONLY_PATTERNS.some((p) => p.test(msg))) return "CLARIFICATION";

    // Fast-path: cliente dizendo explicitamente que quer informação
    if (
        msg.includes("informacao") ||
        msg.includes("informaçã") ||
        msg.includes("iformacao") ||
        msg.includes("iformaçã") ||
        msg.includes("uma duvida") ||
        msg.includes("uma dúvida") ||
        msg.includes("so uma") ||
        msg.includes("só uma") ||
        msg.includes("quero saber") ||
        msg.includes("gostaria de saber") ||
        msg.includes("preciso saber")
    ) {
        // Verificar se não tem produto específico
        const hasProductContext = msg.includes("tenis") || msg.includes("tênis") ||
            msg.includes("camisa") || msg.includes("shorts") || msg.includes("chuteira");

        // Se a mensagem mencionar "troca", é INFO_SAC_POLICY (informação de troca)
        if (msg.includes("troca")) {
            return "INFO_SAC_POLICY";
        }

        if (!hasProductContext) {
            return "CLARIFICATION"; // Vai para LLM que pergunta qual é a dúvida
        }
    }

    if (matchesAnyWithNegation(msg, META_CLARIFICATION_KEYWORDS)) return "CLARIFICATION";

    // ========== PERGUNTAS SOBRE POLÍTICA (INFO) - VERIFICAR ANTES DE SAC ==========
    // Importante: perguntas como "qual o prazo" ou "tenho X dias" são INFO, não ação SAC
    // Estes padrões DEVEM ser verificados antes de SAC_TROCA, SAC_ATRASO, etc.

    // PRIORIDADE 1: Perguntas sobre prazo/política (VERIFICAR PRIMEIRO!)
    // "Quero fazer uma troca, tenho quantos dias?" = pergunta sobre política
    // "fiz um estorno e ainda não caiu" = pergunta sobre política
    if (hasPrazoQuestion || hasRefundQuestion) {
        return "INFO_SAC_POLICY";
    }

    if (matchesAnyWithNegation(msg, SAC_INFO_PATTERNS)) return "INFO_SAC_POLICY";
    if (matchesAnyWithNegation(msg, INFO_PICKUP_POLICY_KEYWORDS)) return "INFO_PICKUP_POLICY";
    if (matchesAnyWithNegation(msg, INFO_HOURS_KEYWORDS)) return "INFO_HOURS";
    if (matchesAnyWithNegation(msg, INFO_ADDRESS_KEYWORDS)) return "INFO_ADDRESS";
    if (matchesAnyWithNegation(msg, INFO_KEYWORDS)) return "INFO";

    // ========== AÇÕES/CHAMADOS SAC - VERIFICAR DEPOIS DE INFO ==========
    if (matchesAnyWithNegation(msg, SAC_TROCA_KEYWORDS)) return "SAC_TROCA";
    if (matchesAnyWithNegation(msg, SAC_ATRASO_KEYWORDS)) return "SAC_ATRASO";
    if (matchesAnyWithNegation(msg, SAC_RETIRADA_KEYWORDS)) return "SAC_RETIRADA";
    if (matchesAnyWithNegation(msg, SAC_REEMBOLSO_KEYWORDS)) return "SAC_REEMBOLSO";

    if ((currentState === "proposal" || currentState === "closing") && matchesAnyWithNegation(msg, OBJECTION_KEYWORDS)) {
        return "OBJECTION";
    }

    if (matchesAnyWithNegation(msg, RESERVATION_KEYWORDS)) return "RESERVATION";
    if (matchesAnyWithNegation(msg, SALES_KEYWORDS)) return "SALES";

    switch (currentState) {
        case "greeting":
            return "SALES";
        case "discovery":
        case "proposal":
        case "closing":
            return "SALES";
        case "objection":
            return "OBJECTION";
        case "support":
            return "SUPPORT";
        case "post_sale":
            return "CLARIFICATION";
        default:
            return "CLARIFICATION";
    }
}

export function detectFrustration(
    userMessage: string,
    conversationHistory: { role: "user" | "assistant"; content: string }[]
): boolean {
    const msg = userMessage.toLowerCase();

    if (FRUSTRATION_INDICATORS.some((k) => msg.includes(k))) return true;
    if (/[!?]{3,}/.test(userMessage)) return true;
    if (userMessage.length > 5 && userMessage === userMessage.toUpperCase() && /[A-Z]/.test(userMessage)) return true;
    if (isRepeatedMessage(msg, conversationHistory)) return true;
    return false;
}

function hasFrustrationSignal(msgLower: string, msgOriginal: string): boolean {
    if (FRUSTRATION_INDICATORS.some((k) => msgLower.includes(k))) return true;
    if (/[!?]{3,}/.test(msgOriginal)) return true;
    if (msgOriginal.length > 5 && msgOriginal === msgOriginal.toUpperCase() && /[A-Z]/.test(msgOriginal)) return true;
    // Textão (mensagem muito longa) = sinal de problema
    if (msgOriginal.length > 150) return true;
    return false;
}

function isRepeatedMessage(
    msg: string,
    history: { role: "user" | "assistant"; content: string }[]
): boolean {
    const userMessages = history
        .filter((h) => h.role === "user")
        .map((h) => h.content.toLowerCase().trim());
    const recentUserMessages = userMessages.slice(-3);
    return recentUserMessages.filter((m) => m === msg).length >= 1;
}

function shouldPrioritizeHoursOnly(msg: string): boolean {
    const asksHours = INFO_HOURS_KEYWORDS.some((k) => msg.includes(k));
    if (!asksHours) return false;
    if (msg.includes("so o horario") || msg.includes("sÃ³ o horario") || msg.includes("sÃ³ o horÃ¡rio")) return true;
    if (msg.includes("nao o endereco") || msg.includes("nÃ£o o endereÃ§o") || msg.includes("nao quero produto")) return true;
    return false;
}

function shouldPrioritizeAddressOnly(msg: string): boolean {
    const asksAddress = INFO_ADDRESS_KEYWORDS.some((k) => msg.includes(k));
    if (!asksAddress) return false;
    if (msg.includes("so o endereco") || msg.includes("sÃ³ o endereco") || msg.includes("sÃ³ o endereÃ§o")) return true;
    if (msg.includes("nao o horario") || msg.includes("nÃ£o o horÃ¡rio")) return true;
    return false;
}
