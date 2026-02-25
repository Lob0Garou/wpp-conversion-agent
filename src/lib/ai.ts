import OpenAI from "openai";

export interface AgentDecision {
    reply_text: string;
    requires_human: boolean;
}

// Model configuration - supports separate router/final models
const MODEL_CONFIG = {
    // Final model (for generating responses to customers)
    get final(): string {
        return process.env.FINAL_MODEL || process.env.OPENROUTER_MODEL || process.env.AI_MODEL || "moonshotai/kimi-k2.5";
    },
    // Router model (for intent classification/tools)
    get router(): string {
        return process.env.ROUTER_MODEL || process.env.OPENROUTER_MODEL || process.env.AI_MODEL || "moonshotai/kimi-k2.5";
    },
    // Timeout in ms
    get timeout(): number {
        return parseInt(process.env.AI_TIMEOUT_MS || "20000", 10);
    },
    // Max tokens for response
    get maxTokens(): number {
        return parseInt(process.env.AI_MAX_TOKENS || "200", 10);
    },
};

const openai = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
    defaultHeaders: {
        "HTTP-Referer": process.env.OPENROUTER_REFERER || "https://github.com/wpp-conversion-agent",
        "X-Title": process.env.OPENROUTER_TITLE || "WhatsApp Conversion Agent",
    },
});

function stripCodeFences(text: string): string {
    return text.replace(/```json\n?|```/g, "").trim();
}

function extractFirstJsonObject(text: string): string | null {
    const start = text.indexOf("{");
    if (start === -1) return null;
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (ch === "\\") {
                escaped = true;
            } else if (ch === "\"") {
                inString = false;
            }
            continue;
        }

        if (ch === "\"") {
            inString = true;
            continue;
        }
        if (ch === "{") depth++;
        if (ch === "}") {
            depth--;
            if (depth === 0) {
                return text.slice(start, i + 1);
            }
        }
    }

    return null;
}

function parseJsonLoosely<T = unknown>(raw: string): T {
    const cleaned = stripCodeFences(raw);
    try {
        return JSON.parse(cleaned) as T;
    } catch {
        const firstObject = extractFirstJsonObject(cleaned);
        if (firstObject) {
            return JSON.parse(firstObject) as T;
        }
        throw new Error("Invalid JSON payload");
    }
}

function coerceAgentDecision(content: string): AgentDecision {
    const parsed = parseJsonLoosely<any>(content);

    const replyTextCandidate =
        parsed?.reply_text ??
        parsed?.reply ??
        parsed?.response ??
        parsed?.message ??
        parsed?.text;

    if (!replyTextCandidate || typeof replyTextCandidate !== "string") {
        throw new Error("Invalid AI response: missing reply_text");
    }

    return {
        reply_text: replyTextCandidate.trim(),
        requires_human: typeof parsed?.requires_human === "boolean" ? parsed.requires_human : false,
    };
}

/**
 * Generate AI response using a pre-composed system prompt.
 * The prompt is built externally by the prompt-system module.
 * 
 * @param systemPrompt - The system prompt
 * @param userMessage - The user's message
 * @param conversationHistory - Previous messages in the conversation
 * @param useRouterModel - If true, uses router model instead of final model (for lightweight tasks)
 */
export async function generateAIResponse(
    systemPrompt: string,
    userMessage: string,
    conversationHistory: { role: "user" | "assistant" | "system"; content: string }[],
    useRouterModel: boolean = false
): Promise<AgentDecision> {
    try {
        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            {
                role: "system",
                content: systemPrompt,
                // @ts-expect-error - OpenRouter specific feature
                cache_control: { type: "ephemeral" }
            },
            ...conversationHistory,
            { role: "user", content: userMessage },
        ];

        // Select model based on task type
        const AI_MODEL = useRouterModel ? MODEL_CONFIG.router : MODEL_CONFIG.final;
        const AI_TIMEOUT = MODEL_CONFIG.timeout;
        const MAX_TOKENS = MODEL_CONFIG.maxTokens;

        console.log(`[AI SERVICE] 🧠 Requesting completion model=${AI_MODEL}, timeout=${AI_TIMEOUT}ms, max_tokens=${MAX_TOKENS}`);

        const startTime = Date.now();
        const completion = await openai.chat.completions.create({
            model: AI_MODEL,
            messages: messages,
            response_format: { type: "json_object" },
            temperature: 0.7,
            max_tokens: MAX_TOKENS,
        }, { timeout: AI_TIMEOUT });
        const endTime = Date.now();
        console.log(`[AI SERVICE] ⏱️ t_llm_ms=${endTime - startTime}`);

        const content = completion.choices[0].message?.content;

        if (!content) {
            throw new Error("No content received from AI");
        }

        const decision = coerceAgentDecision(content);

        return decision;

    } catch (error) {
        console.error("[AI SERVICE] ❌ Error generating decision:", error);
        // fs.appendFileSync('webhook.log', `[ERROR] AI Generation failed: ${error}\n`);
        // Fallback safe mode - NÃO escalona para humano, permite retry
        return {
            reply_text: "Deixa eu verificar essa informação pra você. Um momento, por favor!",
            requires_human: false,  // NÃO escalona - deixa a conversa continuar
        };
    }
}

/**
 * Raw LLM call that returns any JSON shape — used by the Evaluator/Judge.
 * Unlike generateAIResponse, does NOT enforce the reply_text/requires_human schema.
 *
 * @param systemPrompt - System prompt for the judge
 * @param userMessage  - Content to evaluate
 * @param useRouterModel - Use cheap/fast router model (default: true)
 */
export async function callLLMRaw<T = unknown>(
    systemPrompt: string,
    userMessage: string,
    useRouterModel = true
): Promise<T> {
    const AI_MODEL = useRouterModel ? MODEL_CONFIG.router : MODEL_CONFIG.final;

    const completion = await openai.chat.completions.create({
        model: AI_MODEL,
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 256,
    }, { timeout: 12000 });

    const content = completion.choices[0]?.message?.content ?? "{}";
    return parseJsonLoosely<T>(content);
}

/**
 * Validate a draft response using a fast LLM guardrail.
 *
 * @param replyText - The draft response to validate
 * @param intent - The intent of the conversation
 * @param context - Optional conversation context with slots for smarter validation
 */
export async function validateReplyWithGuardrail(
    replyText: string,
    intent: string,
    context?: {
        slots?: Record<string, unknown>;
        stockInfo?: { available: boolean; products?: string[] };
        customerName?: string;
    }
): Promise<{ approved: boolean; reason?: string }> {
    try {
        // Build context section for smarter validation
        let contextSection = "";
        if (context?.slots) {
            const filledSlots = Object.entries(context.slots)
                .filter(([, v]) => v !== undefined && v !== null && v !== "")
                .map(([k, v]) => `  - ${k}: ${v}`)
                .join("\n");
            if (filledSlots) {
                contextSection += `\nDADOS DO CLIENTE JÁ COLETADOS:\n${filledSlots}\n`;
            }
        }
        if (context?.stockInfo) {
            contextSection += `\nINFORMAÇÃO DE ESTOQUE:\n  Disponível: ${context.stockInfo.available ? "Sim" : "Não"}`;
            if (context.stockInfo.products && context.stockInfo.products.length > 0) {
                contextSection += `\n  Produtos: ${context.stockInfo.products.join(", ")}`;
            }
            contextSection += "\n";
        }
        if (context?.customerName) {
            contextSection += `\nNOME DO CLIENTE: ${context.customerName}\n`;
        }

        const guardrailPrompt = `Você é um Validador de Segurança e Qualidade de Atendimento (Guardrail).
Sua ÚNICA função é analisar a resposta gerada por um Agente de IA para um cliente e verificar se ela viola alguma Regra de Ouro.

REGRAS DE OURO:
1. DESCONTOS: É proibido oferecer, prometer ou sugerir qualquer desconto, abatimento ou promoção que não exista explicitamente. O Agente NÃO pode diminuir o preço.
2. ALUCINAÇÃO DE ESTOQUE/DATAS: O Agente NÃO pode prometer entregas "para amanhã" ou inventar dados não fornecidos. Use apenas informações presentes no contexto abaixo.
3. ESTORNO IMEDIATO (PIX/Cartão): É proibido oferecer estorno/dinheiro de volta proativamente. O Vale Troca deve ser oferecido primeiro.
4. CONSISTÊNCIA: A resposta deve ser coerente com os dados já coletados do cliente. Não contradiga informações que o cliente já forneceu.

${contextSection}

MENSAGEM A VALIDAR:
"""
${replyText}
"""

INTENÇÃO DETECTADA DA CONVERSA: ${intent}

Responda OBRIGATORIAMENTE em JSON no formato:
{
  "approved": boolean,  // true se a mensagem NÃO violar as regras, false se violar.
  "reason": string      // Explicar o motivo da violação SE approved for false. Caso contrário, retorne "".
}`;

        const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
            { role: "system", content: guardrailPrompt }
        ];

        console.log(`[GUARDRAIL] 🛡️ Validando draft (Model: ${MODEL_CONFIG.router})`);
        const startTime = Date.now();
        const completion = await openai.chat.completions.create({
            model: MODEL_CONFIG.router,
            messages: messages,
            response_format: { type: "json_object" },
            temperature: 0.1, // Low temp for strict evaluation
            max_tokens: 150,
        }, { timeout: 15000 });
        const endTime = Date.now();

        const content = completion.choices[0].message?.content;
        if (!content) {
            console.warn(`[GUARDRAIL] ⚠️ Sem resposta do LLM validador. Aprovando por fallback. (t=${endTime - startTime}ms)`);
            return { approved: true }; // Fall open on guardrail timeout/error to not block chat completely if OpenRouter is flaky
        }

        const validation = parseJsonLoosely<{ approved: boolean; reason: string }>(content);

        console.log(`[GUARDRAIL] ⏱️ t_guardrail_ms=${endTime - startTime} | Approved: ${validation.approved} | Reason: ${validation.reason}`);

        return {
            approved: !!validation.approved,
            reason: validation.reason || "Violação de regra"
        };
    } catch (error) {
        console.error("[GUARDRAIL] ❌ Erro ao validar:", error);
        return { approved: true }; // Fall open
    }
}

/**
 * Generates an AI response wrapped in a Guardrail retry loop.
 */
export async function generateValidatedResponse(
    systemPrompt: string,
    userMessage: string,
    conversationHistory: { role: "user" | "assistant" | "system"; content: string }[],
    intent: string,
    guardrailContext?: {
        slots?: Record<string, unknown>;
        stockInfo?: { available: boolean; products?: string[] };
        customerName?: string;
    }
): Promise<AgentDecision & { guardrailApproved: boolean }> {
    const MAX_RETRIES = 2;
    let attempt = 0;
    let decision: AgentDecision = { reply_text: "", requires_human: false };
    let guardrailApproved = false;

    // Clone history to avoid mutating the original array passed by reference
    const historyContext = [...conversationHistory];

    console.time("llm_api_call_loop");
    while (attempt <= MAX_RETRIES) {
        console.log(`[AI SERVICE] 🔄 Geração AI tentativa ${attempt + 1}/${MAX_RETRIES + 1}`);
        decision = await generateAIResponse(systemPrompt, userMessage, historyContext);

        const check = await validateReplyWithGuardrail(decision.reply_text, intent, guardrailContext);

        if (check.approved) {
            guardrailApproved = true;
            break;
        }

        console.log(`[AI SERVICE] ⚠️ Retry acionado pelo Guardrail. Motivo: ${check.reason}`);
        historyContext.push({
            role: "assistant",
            content: decision.reply_text
        });
        historyContext.push({
            // OpenAI and OpenRouter support system messages anywhere in the array for most models, 
            // but we can also use 'user' role for corrections if 'system' is rejected.
            // Many instruct models respond well to system corrections.
            role: "system",
            content: `CORREÇÃO OBRIGATÓRIA: O sistema de segurança validou sua última resposta e a rejeitou. Motivo: ${check.reason}. Reescreva sua resposta imediatamente corrigindo este erro.`
        });
        attempt++;
    }
    console.timeEnd("llm_api_call_loop");

    if (!guardrailApproved) {
        console.error("[AI SERVICE] 🚨 Guardrail bloqueou todas as tentativas. Acionando fallback humano.");
        decision = {
            reply_text: "Desculpe, estou enfrentando uma leve instabilidade para verificar essa informação com segurança. Vou transferir seu atendimento para um de nossos especialistas.",
            requires_human: true
        };
    }

    return { ...decision, guardrailApproved };
}
