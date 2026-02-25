import * as fs from "fs";
import * as path from "path";
import type { ConversationContext } from "./context-builder";
import type { ConversationStateType } from "./state-manager";
import type { Intent } from "./intent-classifier";
import { loadSkill } from "./skill-loader";

// ─── PROMPT CACHE ───
// Prompts estáticos são carregados 1x por processo e cacheados em memória.
// Isso permite que o cache_control: ephemeral do OpenRouter/Anthropic funcione:
// a parte estática (persona + policies) nunca muda → custo de tokens reduzido em até 90%.
//
// ⚠️ IMPORTANTE: O cache DEVE ser invalidado quando patches são aplicados!
// Use clearPromptCache() ou clearPromptCacheForFile() após modificar prompts.

const promptCache = new Map<string, string>();

/**
 * Limpa todo o cache de prompts.
 * DEVE ser chamado após aplicar patches nos arquivos de prompt.
 */
export function clearPromptCache(): void {
    const size = promptCache.size;
    promptCache.clear();
    console.log(`[PROMPTS] 🔄 Cache limpo (${size} entradas removidas)`);
}

/**
 * Limpa o cache para um arquivo específico.
 * Útil quando apenas um prompt foi modificado.
 */
export function clearPromptCacheForFile(filename: string): void {
    const deleted = promptCache.delete(filename);
    if (deleted) {
        console.log(`[PROMPTS] 🔄 Cache limpo para: ${filename}`);
    }
}

/**
 * Recarrega um prompt do disco, ignorando o cache.
 * Útil para verificar se o arquivo foi modificado.
 */
export function reloadPromptFile(filename: string): string {
    clearPromptCacheForFile(filename);
    return loadPromptFile(filename);
}

/**
 * Retorna estatísticas do cache para debug.
 */
export function getPromptCacheStats(): { size: number; keys: string[] } {
    return {
        size: promptCache.size,
        keys: Array.from(promptCache.keys()),
    };
}

function loadPromptFile(filename: string): string {
    if (promptCache.has(filename)) {
        return promptCache.get(filename)!;
    }

    const promptPath = path.join(process.cwd(), "src", "prompts", filename);
    try {
        const content = fs.readFileSync(promptPath, "utf-8");
        promptCache.set(filename, content);
        return content;
    } catch (error) {
        console.error(`[PROMPTS] ❌ Failed to load prompt: ${filename}`, error);
        return "";
    }
}

function loadSoulFile(): string {
    const cacheKey = "__soul__";
    if (promptCache.has(cacheKey)) {
        return promptCache.get(cacheKey)!;
    }

    const soulPath = path.join(process.cwd(), "soul.md");
    try {
        const content = fs.readFileSync(soulPath, "utf-8");
        promptCache.set(cacheKey, content);
        return content;
    } catch (error) {
        console.error(`[PROMPTS] ❌ Failed to load soul.md`, error);
        return "";
    }
}

// ─── PROMPT SELECTION ───

export function selectPromptFile(
    state: ConversationStateType,
    intent: Intent
): string {
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
function formatProductsForPrompt(
    products: { description: string; quantity: number; sku?: string | null; price?: string | number | null }[]
): string {
    if (products.length === 0) return "";

    return products
        .map((p, i) => {
            const parts: string[] = [`${i + 1}.`];
            if (p.sku) parts.push(`[${p.sku}]`);
            parts.push(p.description);
            if (p.price != null && Number(p.price) > 0) {
                parts.push(`— R$ ${Number(p.price).toFixed(2).replace(".", ",")}`);
            }
            parts.push("✅ Em estoque");
            return parts.join(" ");
        })
        .join("\n");
}

// ─── CONTEXT SECTION BUILDER ───

function buildContextSection(context: ConversationContext): string {
    const SEP = "═══════════════════════════════════════";
    const parts: string[] = [];

    const now = new Date();
    const dateStr = now.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const timeStr = now.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
    const weekday = now.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long" }).toUpperCase();

    // ── Bloco 1: Estado da conversa ──────────────────────────────────────
    parts.push(SEP);
    parts.push(`CONTEXTO DESTA MENSAGEM - ${dateStr} ${timeStr} (${weekday})`);
    parts.push(SEP);
    parts.push(`ESTADO ATUAL: ${translateState(context.currentState)}`);
    parts.push(`INTENÇÃO DETECTADA: ${context.detectedIntent}`);
    parts.push(`TURNO: ${context.messageCount}`);

    // ── Bloco 2: Perfil do cliente (slots coletados) ─────────────────────
    const filledSlots = Object.entries(context.slots)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => `  - ${translateSlot(k)}: ${v}`);

    parts.push("");
    parts.push("PERFIL DO CLIENTE (já coletado):");
    if (filledSlots.length > 0) {
        parts.push(filledSlots.join("\n"));
    } else {
        parts.push("  (nenhuma informação coletada ainda)");
    }

    // ── Bloco 3: Status do Pedido (Simulação Tool) ───────────────────────
    if (context.slots.orderId) {
        parts.push("");
        parts.push("STATUS DO PEDIDO (Consulta via get_order_status):");
        // Em um ambiente real, chamaríamos a API da transportadora aqui.
        // Simulando resposta com base na intenção para testes do SAC.
        let statusString = `Pedido ${context.slots.orderId} -> Status: Em separação | Previsão: Hoje`;
        if (context.detectedIntent === "SAC_ATRASO") {
            statusString = `Pedido ${context.slots.orderId} -> Status: Em transporte | Previsão: 15/02 | Atrasado: 5 dias`;
        } else if (context.detectedIntent === "SAC_REEMBOLSO") {
            statusString = `Pedido ${context.slots.orderId} -> Status: Cancelado (Arrependimento) | Estorno processado: Sim`;
        } else if (context.detectedIntent === "SAC_RETIRADA") {
            statusString = `Pedido ${context.slots.orderId} -> Status: Aguardando Retirada | Loja: Centauro ${context.storeName}`;
        }
        parts.push(statusString);
    }

    // ── Bloco 4: Próximo objetivo ────────────────────────────────────────
    const missingSlots = getMissingSlots(context);
    if (missingSlots.length > 0) {
        parts.push("");
        parts.push("PRÓXIMO OBJETIVO:");
        parts.push(`  Coletar: ${missingSlots.join(", ")}`);
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
        parts.push(`NOME DO CLIENTE: ${context.customerName}`);
    }

    // ── Bloco 5: Estoque validado (Agente Estoquista) ────────────────────
    parts.push("");
    parts.push(SEP);
    {
        const sr = context.stockResult;
        parts.push(`📦 ESTOQUE: ${sr.status} (confiança ${sr.confidence})`);
        parts.push(`→ ${sr.promptHint}`);

        if (sr.best) {
            const sizeTag = sr.best.size ? ` | Tam. ${sr.best.size}` : "";
            parts.push(`  Melhor match: ${sr.best.description}${sizeTag}`);
        }

        if (sr.status === "UNAVAILABLE" && sr.alternatives.length > 0) {
            const altList = sr.alternatives.map(a => a.description).join(" | ");
            parts.push(`  Similares disponíveis: ${altList}`);
        }

        if (sr.missingSlots.length > 0) {
            parts.push(`  Faltando coletar: ${sr.missingSlots.join(", ")}`);
        }

        parts.push(SEP);

        // Lista de candidatos (para o LLM não inventar fora desta lista)
        if (sr.candidates.length > 0) {
            parts.push("PRODUTOS DISPONÍVEIS — use APENAS estes. Nunca invente produtos fora desta lista:");
            parts.push(formatProductsForPrompt(
                sr.candidates.map(c => ({ description: c.description, quantity: c.quantity, sku: c.sku ?? null }))
            ));
        } else {
            parts.push("PRODUTOS DISPONÍVEIS: Nenhum encontrado para esta busca.");
            parts.push("INSTRUÇÃO: Não invente produtos. Informe honestamente que este item está indisponível no momento.");
            parts.push("Ofereça alternativas: buscar similar, reservar quando chegar, ou direcionar para atendente.");
        }
    }

    return parts.join("\n");
}





// ─── PROMPT COMPOSITION ───

function getFewShots(intent: Intent, state: ConversationStateType): string {
    // Prioritize SAC examples for SAC intents
    if (intent.startsWith("SAC") || state === "support_sac" || state === "support") {
        return `
### EXEMPLOS DE ATENDIMENTO (SAC)
- Objetivo: Empatia curta + Coleta de dados (Nome, CPF, Pedido) + Resolução ou Ticket.

Exemplo 1 (Erro Técnico - Vale Troca):
User: "Tentei usar o vale troca no app e deu erro CÓD CHK099."
Assistant: "Oi! Esse erro CHK099 acontece por segurança quando o endereço de entrega é alterado. O sistema bloqueia pra evitar fraudes. Tenta manter o endereço original ou me passa seu CPF que verifico se consigo liberar por aqui."

Exemplo 2 (Logística Cruzada - Nike/Centauro):
User: "Fiz uma compra na Nike, deu endereço errado e voltou. Vi que o CD é na Centauro, tá aí?"
Assistant: "Entendo a confusão. Como somos do mesmo grupo (SBF), compartilhamos a malha logística, mas o estoque é separado. Vou consultar onde o pedido está exatamente. Me passa o número do pedido e CPF?"

Exemplo 3 (Atraso/Extravio):
User: "O app diz que entregou mas não recebi nada. O motoboy roubou?"
Assistant: "Sinto muito por esse susto 😕 Pode ter sido uma baixa indevida da transportadora. Me passa seu CPF e número do pedido? Vou abrir uma acareação agora mesmo pra localizar sua entrega."`;
    }

    // Sales examples
    if (intent === "SALES" || state === "discovery" || state === "proposal" || state === "closing") {
        return `
### EXEMPLOS DE ATENDIMENTO (VENDAS)
- Objetivo: Confirmar estoque real + Oferecer reserva/retirada.

Exemplo 1 (Fit/Forma do Produto):
User: "Tem a chuteira Umbro Pro 5 Bump? Uso 42 se a forma for grande."
Assistant: "Tenho sim a Pro 5 Bump! Ela tem a forma mais justa (apertada) por causa do amortecimento. Se você usa 42, talvez fique exata. Temos a 42 e 43 na cor preta. Quer que eu separe as duas pra você provar aqui?"

Exemplo 2 (Disponibilidade Específica):
User: "Chegou camisa do Palmeiras feminina?"
Assistant: "Oi! Chegou reposição ontem. Tenho a verde (home) e a branca (away) nos tamanhos P e M. A G esgotou. Quer que eu guarde alguma pra você?"

Exemplo 3 (Alternativa de Estoque):
User: "Tem o Nike Metcon 9 no 40?"
Assistant: "O Metcon 9 no 40 acabou de sair. Mas chegou o *Reebok Nano X3* que tem a mesma estabilidade pra Crossfit e tá com preço ótimo. Quer ver uma foto ou prefere encomendar o Metcon?"`;
    }

    // Info examples
    if (intent.startsWith("INFO")) {
        return `
### EXEMPLOS DE ATENDIMENTO (INFO)
- Objetivo: Resposta direta + Gancho para venda.

Exemplo 1 (Retira Loja vs Site):
User: "Tentei comprar no site pra retirar aí mas não apareceu a opção."
Assistant: "Isso acontece quando o produto não está no nosso estoque físico da loja (vem do depósito). O 'Retira Rápido' só ativa se a gente tiver o item aqui na prateleira. Me manda o link do produto? Se eu tiver aqui, já separo pra você agora."

Exemplo 2 (Troca sem Nota):
User: "Ganhei um tênis mas não tenho a nota, posso trocar?"
Assistant: "Pra troca, a gente precisa vincular a venda. Se quem te deu informou o CPF na compra, a gente consegue puxar a nota fiscal pelo sistema aqui na loja. Sabe me dizer o CPF do comprador?"`;
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
export async function composeSystemPrompt(
    context: ConversationContext
): Promise<string> {
    // 0. Alma do agente (identidade inegociável — camada constitucional, sempre primeiro)
    const soul = loadSoulFile();

    // 1. Bloco estático (cacheável via cache_control no ai.ts)
    // Usa v3 com regras de condução e limites
    const basePrompt = loadPromptFile("system_cadu_v3.txt");

    // 2. Few-shots dinâmicos baseados no histórico real (Calibração de Contexto)
    const fewShots = getFewShots(context.detectedIntent, context.currentState);

    const learnedLessons = "";

    // 3. Skill ativa — instruções táticas específicas para a intenção/estado atual
    // Posicionada após os few-shots e antes do contexto dinâmico para que o modelo
    // absorva as regras da skill antes de ler os dados variáveis da conversa.
    const skillContent = loadSkill(context.detectedIntent, context.currentState);
    const skillBlock = skillContent
        ? `\n\n═══ SKILL ATIVA ═══\n${skillContent}\n═══════════════════`
        : "";

    // 4. Bloco dinâmico (contexto que muda a cada turno)
    const contextSection = buildContextSection(context);

    // 5. Prompt de estado (muda por estado/intenção, mas é estático por si só)
    const statePromptFile = selectPromptFile(context.currentState, context.detectedIntent);
    const statePrompt = loadPromptFile(statePromptFile);

    // Ordem: alma → base estática → few-shots → PADRÃO OURO → SKILL ATIVA → contexto dinâmico → instrução de estado
    // A alma vem primeiro como camada constitucional inegociável.
    // Os few-shots ficam logo após a base para estabelecer tom antes do contexto.
    // A skill ativa injeta regras táticas específicas antes dos dados variáveis.
    // O state prompt no final define o PRÓXIMO PASSO — posição mais recente = mais atenção do modelo.
    return `${soul}

# ─── ALMA DO AGENTE (INEGOCIÁVEL) ───

${basePrompt}${fewShots}${learnedLessons}${skillBlock}

${contextSection}

${statePrompt}`;
}

// ─── HELPERS ───

function getMissingSlots(context: ConversationContext): string[] {
    const missing: string[] = [];

    if (context.currentState === "discovery" || context.currentState === "greeting") {
        if (!context.slots.usage) missing.push("uso (corrida/academia/casual/futebol)");
        if (!context.slots.size) missing.push("tamanho/numeração");
    }

    if (context.currentState === "proposal") {
        if (!context.slots.product) missing.push("produto escolhido");
    }

    if (context.currentState === "support_sac") {
        // Defer to AI prompt logic (it will ask for orderId ONLY if online purchase)
        // if (!context.slots.orderId && !context.slots.cpf) missing.push("nº do pedido ou CPF");
    }

    return missing;
}

function translateState(state: ConversationStateType): string {
    const translations: Record<ConversationStateType, string> = {
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

function translateSlot(key: string): string {
    const translations: Record<string, string> = {
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
