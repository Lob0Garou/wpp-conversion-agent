"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAIResponse = generateAIResponse;
exports.callLLMRaw = callLLMRaw;
exports.validateReplyWithGuardrail = validateReplyWithGuardrail;
exports.generateValidatedResponse = generateValidatedResponse;
var openai_1 = require("openai");
// Model configuration - supports separate router/final models
var MODEL_CONFIG = {
    // Final model (for generating responses to customers)
    get final() {
        return process.env.FINAL_MODEL || process.env.OPENROUTER_MODEL || process.env.AI_MODEL || "moonshotai/kimi-k2.5";
    },
    // Router model (for intent classification/tools)
    get router() {
        return process.env.ROUTER_MODEL || process.env.OPENROUTER_MODEL || process.env.AI_MODEL || "moonshotai/kimi-k2.5";
    },
    // Timeout in ms
    get timeout() {
        return parseInt(process.env.AI_TIMEOUT_MS || "20000", 10);
    },
    // Max tokens for response
    get maxTokens() {
        return parseInt(process.env.AI_MAX_TOKENS || "200", 10);
    },
};
var openai = new openai_1.default({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
    defaultHeaders: {
        "HTTP-Referer": process.env.OPENROUTER_REFERER || "https://github.com/wpp-conversion-agent",
        "X-Title": process.env.OPENROUTER_TITLE || "WhatsApp Conversion Agent",
    },
});
function stripCodeFences(text) {
    return text.replace(/```json\n?|```/g, "").trim();
}
function extractFirstJsonObject(text) {
    var start = text.indexOf("{");
    if (start === -1)
        return null;
    var depth = 0;
    var inString = false;
    var escaped = false;
    for (var i = start; i < text.length; i++) {
        var ch = text[i];
        if (inString) {
            if (escaped) {
                escaped = false;
            }
            else if (ch === "\\") {
                escaped = true;
            }
            else if (ch === "\"") {
                inString = false;
            }
            continue;
        }
        if (ch === "\"") {
            inString = true;
            continue;
        }
        if (ch === "{")
            depth++;
        if (ch === "}") {
            depth--;
            if (depth === 0) {
                return text.slice(start, i + 1);
            }
        }
    }
    return null;
}
function parseJsonLoosely(raw) {
    var cleaned = stripCodeFences(raw);
    try {
        return JSON.parse(cleaned);
    }
    catch (_a) {
        var firstObject = extractFirstJsonObject(cleaned);
        if (firstObject) {
            return JSON.parse(firstObject);
        }
        throw new Error("Invalid JSON payload");
    }
}
function coerceAgentDecision(content) {
    var _a, _b, _c, _d;
    var parsed = parseJsonLoosely(content);
    var replyTextCandidate = (_d = (_c = (_b = (_a = parsed === null || parsed === void 0 ? void 0 : parsed.reply_text) !== null && _a !== void 0 ? _a : parsed === null || parsed === void 0 ? void 0 : parsed.reply) !== null && _b !== void 0 ? _b : parsed === null || parsed === void 0 ? void 0 : parsed.response) !== null && _c !== void 0 ? _c : parsed === null || parsed === void 0 ? void 0 : parsed.message) !== null && _d !== void 0 ? _d : parsed === null || parsed === void 0 ? void 0 : parsed.text;
    if (!replyTextCandidate || typeof replyTextCandidate !== "string") {
        throw new Error("Invalid AI response: missing reply_text");
    }
    return {
        reply_text: replyTextCandidate.trim(),
        requires_human: typeof (parsed === null || parsed === void 0 ? void 0 : parsed.requires_human) === "boolean" ? parsed.requires_human : false,
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
function generateAIResponse(systemPrompt_1, userMessage_1, conversationHistory_1) {
    return __awaiter(this, arguments, void 0, function (systemPrompt, userMessage, conversationHistory, useRouterModel) {
        var messages, AI_MODEL, AI_TIMEOUT, MAX_TOKENS, startTime, completion, endTime, content, decision, error_1;
        var _a;
        if (useRouterModel === void 0) { useRouterModel = false; }
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    messages = __spreadArray(__spreadArray([
                        {
                            role: "system",
                            content: systemPrompt,
                            // @ts-expect-error - OpenRouter specific feature
                            cache_control: { type: "ephemeral" }
                        }
                    ], conversationHistory, true), [
                        { role: "user", content: userMessage },
                    ], false);
                    AI_MODEL = useRouterModel ? MODEL_CONFIG.router : MODEL_CONFIG.final;
                    AI_TIMEOUT = MODEL_CONFIG.timeout;
                    MAX_TOKENS = MODEL_CONFIG.maxTokens;
                    console.log("[AI SERVICE] \uD83E\uDDE0 Requesting completion model=".concat(AI_MODEL, ", timeout=").concat(AI_TIMEOUT, "ms, max_tokens=").concat(MAX_TOKENS));
                    startTime = Date.now();
                    return [4 /*yield*/, openai.chat.completions.create({
                            model: AI_MODEL,
                            messages: messages,
                            response_format: { type: "json_object" },
                            temperature: 0.7,
                            max_tokens: MAX_TOKENS,
                        }, { timeout: AI_TIMEOUT })];
                case 1:
                    completion = _b.sent();
                    endTime = Date.now();
                    console.log("[AI SERVICE] \u23F1\uFE0F t_llm_ms=".concat(endTime - startTime));
                    content = (_a = completion.choices[0].message) === null || _a === void 0 ? void 0 : _a.content;
                    if (!content) {
                        throw new Error("No content received from AI");
                    }
                    decision = coerceAgentDecision(content);
                    return [2 /*return*/, decision];
                case 2:
                    error_1 = _b.sent();
                    console.error("[AI SERVICE] ❌ Error generating decision:", error_1);
                    // fs.appendFileSync('webhook.log', `[ERROR] AI Generation failed: ${error}\n`);
                    // Fallback safe mode - NÃO escalona para humano, permite retry
                    return [2 /*return*/, {
                            reply_text: "Deixa eu verificar essa informação pra você. Um momento, por favor!",
                            requires_human: false, // NÃO escalona - deixa a conversa continuar
                        }];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Raw LLM call that returns any JSON shape — used by the Evaluator/Judge.
 * Unlike generateAIResponse, does NOT enforce the reply_text/requires_human schema.
 *
 * @param systemPrompt - System prompt for the judge
 * @param userMessage  - Content to evaluate
 * @param useRouterModel - Use cheap/fast router model (default: true)
 */
function callLLMRaw(systemPrompt_1, userMessage_1) {
    return __awaiter(this, arguments, void 0, function (systemPrompt, userMessage, useRouterModel) {
        var AI_MODEL, completion, content;
        var _a, _b, _c;
        if (useRouterModel === void 0) { useRouterModel = true; }
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    AI_MODEL = useRouterModel ? MODEL_CONFIG.router : MODEL_CONFIG.final;
                    return [4 /*yield*/, openai.chat.completions.create({
                            model: AI_MODEL,
                            messages: [
                                { role: "system", content: systemPrompt },
                                { role: "user", content: userMessage },
                            ],
                            response_format: { type: "json_object" },
                            temperature: 0.1,
                            max_tokens: 256,
                        }, { timeout: 12000 })];
                case 1:
                    completion = _d.sent();
                    content = (_c = (_b = (_a = completion.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) !== null && _c !== void 0 ? _c : "{}";
                    return [2 /*return*/, parseJsonLoosely(content)];
            }
        });
    });
}
/**
 * Validate a draft response using a fast LLM guardrail.
 *
 * @param replyText - The draft response to validate
 * @param intent - The intent of the conversation
 * @param context - Optional conversation context with slots for smarter validation
 */
function validateReplyWithGuardrail(replyText, intent, context) {
    return __awaiter(this, void 0, void 0, function () {
        var contextSection, filledSlots, guardrailPrompt, messages, startTime, completion, endTime, content, validation, error_2;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    contextSection = "";
                    if (context === null || context === void 0 ? void 0 : context.slots) {
                        filledSlots = Object.entries(context.slots)
                            .filter(function (_a) {
                            var v = _a[1];
                            return v !== undefined && v !== null && v !== "";
                        })
                            .map(function (_a) {
                            var k = _a[0], v = _a[1];
                            return "  - ".concat(k, ": ").concat(v);
                        })
                            .join("\n");
                        if (filledSlots) {
                            contextSection += "\nDADOS DO CLIENTE J\u00C1 COLETADOS:\n".concat(filledSlots, "\n");
                        }
                    }
                    if (context === null || context === void 0 ? void 0 : context.stockInfo) {
                        contextSection += "\nINFORMA\u00C7\u00C3O DE ESTOQUE:\n  Dispon\u00EDvel: ".concat(context.stockInfo.available ? "Sim" : "Não");
                        if (context.stockInfo.products && context.stockInfo.products.length > 0) {
                            contextSection += "\n  Produtos: ".concat(context.stockInfo.products.join(", "));
                        }
                        contextSection += "\n";
                    }
                    if (context === null || context === void 0 ? void 0 : context.customerName) {
                        contextSection += "\nNOME DO CLIENTE: ".concat(context.customerName, "\n");
                    }
                    guardrailPrompt = "Voc\u00EA \u00E9 um Validador de Seguran\u00E7a e Qualidade de Atendimento (Guardrail).\nSua \u00DANICA fun\u00E7\u00E3o \u00E9 analisar a resposta gerada por um Agente de IA para um cliente e verificar se ela viola alguma Regra de Ouro.\n\nREGRAS DE OURO:\n1. DESCONTOS: \u00C9 proibido oferecer, prometer ou sugerir qualquer desconto, abatimento ou promo\u00E7\u00E3o que n\u00E3o exista explicitamente. O Agente N\u00C3O pode diminuir o pre\u00E7o.\n2. ALUCINA\u00C7\u00C3O DE ESTOQUE/DATAS: O Agente N\u00C3O pode prometer entregas \"para amanh\u00E3\" ou inventar dados n\u00E3o fornecidos. Use apenas informa\u00E7\u00F5es presentes no contexto abaixo.\n3. ESTORNO IMEDIATO (PIX/Cart\u00E3o): \u00C9 proibido oferecer estorno/dinheiro de volta proativamente. O Vale Troca deve ser oferecido primeiro.\n4. CONSIST\u00CANCIA: A resposta deve ser coerente com os dados j\u00E1 coletados do cliente. N\u00E3o contradiga informa\u00E7\u00F5es que o cliente j\u00E1 forneceu.\n\n".concat(contextSection, "\n\nMENSAGEM A VALIDAR:\n\"\"\"\n").concat(replyText, "\n\"\"\"\n\nINTEN\u00C7\u00C3O DETECTADA DA CONVERSA: ").concat(intent, "\n\nResponda OBRIGATORIAMENTE em JSON no formato:\n{\n  \"approved\": boolean,  // true se a mensagem N\u00C3O violar as regras, false se violar.\n  \"reason\": string      // Explicar o motivo da viola\u00E7\u00E3o SE approved for false. Caso contr\u00E1rio, retorne \"\".\n}");
                    messages = [
                        { role: "system", content: guardrailPrompt }
                    ];
                    console.log("[GUARDRAIL] \uD83D\uDEE1\uFE0F Validando draft (Model: ".concat(MODEL_CONFIG.router, ")"));
                    startTime = Date.now();
                    return [4 /*yield*/, openai.chat.completions.create({
                            model: MODEL_CONFIG.router,
                            messages: messages,
                            response_format: { type: "json_object" },
                            temperature: 0.1, // Low temp for strict evaluation
                            max_tokens: 150,
                        }, { timeout: 15000 })];
                case 1:
                    completion = _b.sent();
                    endTime = Date.now();
                    content = (_a = completion.choices[0].message) === null || _a === void 0 ? void 0 : _a.content;
                    if (!content) {
                        console.warn("[GUARDRAIL] \u26A0\uFE0F Sem resposta do LLM validador. Aprovando por fallback. (t=".concat(endTime - startTime, "ms)"));
                        return [2 /*return*/, { approved: true }]; // Fall open on guardrail timeout/error to not block chat completely if OpenRouter is flaky
                    }
                    validation = parseJsonLoosely(content);
                    console.log("[GUARDRAIL] \u23F1\uFE0F t_guardrail_ms=".concat(endTime - startTime, " | Approved: ").concat(validation.approved, " | Reason: ").concat(validation.reason));
                    return [2 /*return*/, {
                            approved: !!validation.approved,
                            reason: validation.reason || "Violação de regra"
                        }];
                case 2:
                    error_2 = _b.sent();
                    console.error("[GUARDRAIL] ❌ Erro ao validar:", error_2);
                    return [2 /*return*/, { approved: true }]; // Fall open
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Generates an AI response wrapped in a Guardrail retry loop.
 */
function generateValidatedResponse(systemPrompt, userMessage, conversationHistory, intent, guardrailContext) {
    return __awaiter(this, void 0, void 0, function () {
        var MAX_RETRIES, attempt, decision, guardrailApproved, historyContext, check;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    MAX_RETRIES = 2;
                    attempt = 0;
                    decision = { reply_text: "", requires_human: false };
                    guardrailApproved = false;
                    historyContext = __spreadArray([], conversationHistory, true);
                    console.time("llm_api_call_loop");
                    _a.label = 1;
                case 1:
                    if (!(attempt <= MAX_RETRIES)) return [3 /*break*/, 4];
                    console.log("[AI SERVICE] \uD83D\uDD04 Gera\u00E7\u00E3o AI tentativa ".concat(attempt + 1, "/").concat(MAX_RETRIES + 1));
                    return [4 /*yield*/, generateAIResponse(systemPrompt, userMessage, historyContext)];
                case 2:
                    decision = _a.sent();
                    return [4 /*yield*/, validateReplyWithGuardrail(decision.reply_text, intent, guardrailContext)];
                case 3:
                    check = _a.sent();
                    if (check.approved) {
                        guardrailApproved = true;
                        return [3 /*break*/, 4];
                    }
                    console.log("[AI SERVICE] \u26A0\uFE0F Retry acionado pelo Guardrail. Motivo: ".concat(check.reason));
                    historyContext.push({
                        role: "assistant",
                        content: decision.reply_text
                    });
                    historyContext.push({
                        // OpenAI and OpenRouter support system messages anywhere in the array for most models, 
                        // but we can also use 'user' role for corrections if 'system' is rejected.
                        // Many instruct models respond well to system corrections.
                        role: "system",
                        content: "CORRE\u00C7\u00C3O OBRIGAT\u00D3RIA: O sistema de seguran\u00E7a validou sua \u00FAltima resposta e a rejeitou. Motivo: ".concat(check.reason, ". Reescreva sua resposta imediatamente corrigindo este erro.")
                    });
                    attempt++;
                    return [3 /*break*/, 1];
                case 4:
                    console.timeEnd("llm_api_call_loop");
                    if (!guardrailApproved) {
                        console.error("[AI SERVICE] 🚨 Guardrail bloqueou todas as tentativas. Acionando fallback humano.");
                        decision = {
                            reply_text: "Desculpe, estou enfrentando uma leve instabilidade para verificar essa informação com segurança. Vou transferir seu atendimento para um de nossos especialistas.",
                            requires_human: true
                        };
                    }
                    return [2 /*return*/, __assign(__assign({}, decision), { guardrailApproved: guardrailApproved })];
            }
        });
    });
}
