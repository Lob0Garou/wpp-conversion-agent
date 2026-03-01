import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWebhookSignature, extractMessage } from "@/lib/webhook";
import { sendTextMessage, markMessageAsRead, sendSenderAction } from "@/lib/whatsapp";
import { appendRalphLog } from "@/lib/ralphLogger";
import { buildContext } from "@/lib/context-builder";

import { determineNextState } from "@/lib/state-transitions";
import { detectFrustration } from "@/lib/intent-classifier";
import { hasClosingSignal as hasLexicalClosingSignal } from "@/lib/slot-extractor";
import { buildSlotQuestion, extractKnownEntities, getMissingSlots, type KnownEntities, type Slot } from "@/lib/slot-extractor";
import { findFootballTeamMention, hasFootballTeamMention } from "@/lib/football-teams";
import { acquireLock, releaseLock } from "@/lib/concurrency";
import { emitTelemetry, hashPhone, logShadowAudit, logWebhookEvent } from "@/lib/telemetry";
import { randomUUID } from "crypto";
import {
    updateSlots,
    transitionTo,
    incrementStall,
    resetStall,
    incrementFrustration,
    incrementMessageCount,
    isHumanLocked,
} from "@/lib/state-manager";
import { isAffirmativeResponse } from "@/lib/stock-agent";
import { orchestrate, type OrchestratorResult } from "@/lib/orchestrator";
import {
    generateWarmHandoffSummary,
    calculateSLADeadline,
    type HandoffContext
} from "@/lib/handoff-router";
import { humanLoopConfig } from "@/config/humanLoop.config";
import { evaluateHandoff, type HandoffReason } from "@/services/humanLoopEngine";
import { buildSaleAlertMessage, buildHandoffMessage, buildSACAlertMessage } from "@/services/humanLoopMessages";
import { lockToHuman } from "@/lib/state-manager";
import { getMissingSacData, buildSacQuestion, hasAnyMissingSacData } from "@/services/sacMinimum";
import { isChatOnlyMode, shouldSkipTelemetry, chatLog } from "@/lib/chat-mode";
import { getLastReply, saveToOutbox, saveTranscriptMessage } from "@/lib/chat-outbox";
import { getAgentRuntimeForConversation } from "@/lib/agent/config";

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Module-level debug logging Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
import * as fs from "fs";

function debugLog(msg: string) {
    try {
        fs.appendFileSync("webhook.log", `[${new Date().toISOString()}] ${msg}\n`);
    } catch {
        // Silently ignore file write errors in production
    }
}

function shouldBypassSacMinimumForPolicyInfo(intent: string, currentState: string, userMessage: string): boolean {
    if (intent === "INFO" || intent.startsWith("INFO_")) return true;

    const normalized = userMessage
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    // PadrÃµes de polÃ­tica de troca/presente - bypass independente do state
    const policyBypassSignals = [
        "trocar um presente", "trocar o presente", "trocar presente",
        "troca de presente", "presente que ganhei", "ganhei de presente",
        "so saber", "apenas saber", "somente saber",
        "prazo pra troca", "prazo para troca", "prazo de troca",
        "politica de troca", "como funciona a troca",
        "estorno", "reembolso", "dinheiro de volta", "prazos de estorno", "prazo do estorno",
        "ainda nao caiu", "ainda nÃ£o caiu", "nao caiu o estorno", "nÃ£o caiu o estorno"
    ];
    if (policyBypassSignals.some((s) => normalized.includes(s))) return true;

    if (currentState !== "support_sac") return false;

    const explicitInfoSignals = [
        "so uma informacao",
        "apenas uma informacao",
        "era so uma informacao",
        "e so uma informacao",
        "so uma duvida",
        "apenas uma duvida",
        "nao foi pedido",
        "nao e defeito",
        "nao e pedido",
    ];

    const policySignals = [
        "troca",
        "presente",
        "retirar",
        "retirada",
        "marido",
        "esposa",
        "terceiro",
        "outra pessoa",
        "token",
        "liberacao",
    ];

    return explicitInfoSignals.some((s) => normalized.includes(s)) &&
        policySignals.some((s) => normalized.includes(s));
}

type NextStepContext = {
    intent?: string;
    effective_intent?: string;
    state?: string;
    action?: string;
    is_chat_only?: boolean;
    missing?: string[];
};

type ClaimGuardContext = {
    source?: string;
    isChatOnly: boolean;
    action?: string;
};

type ClaimGuardResult = {
    text: string;
    applied: boolean;
    reasons: string[];
};

function normalizeText(text: string): string {
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function isReservationOfferPrompt(text: string): boolean {
    const normalized = normalizeText(text || "");
    return /\b(vou reservar|posso reservar|quer que eu reserve|deseja reservar|confirmar a reserva)\b/i.test(normalized);
}

function isStrongAffirmative(text: string): boolean {
    const normalized = normalizeText(text || "").replace(/\s+/g, " ").trim();
    if (!normalized) return false;
    if (isAffirmativeResponse(normalized)) return true;
    return /^(sim|pode|por favor|isso|isso mesmo|perfeito|fechado|ok|okay|blz|beleza|pode sim)([.!?\s]*)$/i.test(normalized);
}

function shouldForceReservationHandoff(userMessage: string, lastAssistantReply: string): boolean {
    return isReservationOfferPrompt(lastAssistantReply) && isStrongAffirmative(userMessage);
}

function shouldSendClosingAck(userMessage: string): boolean {
    const normalized = normalizeText(userMessage || "").replace(/\s+/g, " ").trim();
    if (!normalized || normalized.includes("?")) return false;

    const closingSignals =
        /\b(obrigad[oa]|valeu|vlw|obg|agradec|brigad|so isso|soh isso|era so isso|nao obrigado|nenhum obrigado|nao precisa)\b/i;
    if (!closingSignals.test(normalized)) return false;

    const explicitNewRequest =
        /\b(pedido|cpf|troca|reembolso|estorno|endereco|horario|produto|camisa|tenis|chuteira|tamanho|numero|reserva|preco|valor|entrega)\b/i;
    const closureGuard =
        /\b(obrigad[oa]|valeu|vlw|obg|so isso|era so isso|nao obrigado|nenhum obrigado)\b/i;

    if (explicitNewRequest.test(normalized) && !closureGuard.test(normalized)) {
        return false;
    }

    return true;
}

function isSacIntakePrompt(lastAssistantReply: string): boolean {
    const normalized = normalizeText(lastAssistantReply || "");
    if (!normalized) return false;
    const asksIntake =
        normalized.includes("para abrir seu atendimento") ||
        normalized.includes("para abrir o atendimento");
    const asksSacFields =
        normalized.includes("nome completo") ||
        normalized.includes("numero do pedido") ||
        normalized.includes("e-mail") ||
        normalized.includes("cpf");
    return asksIntake && asksSacFields;
}

function hasNameLikePrefix(userMessage: string): boolean {
    const normalized = normalizeText(userMessage || "").replace(/\s+/g, " ").trim();
    if (!normalized) return false;
    const head = normalized.split(",")[0]?.trim() || normalized;
    const tokens = head.split(" ").filter(Boolean);
    if (tokens.length < 2 || tokens.length > 4) return false;
    const blocked = new Set(["pedido", "cpf", "email", "e-mail", "atrasado", "atraso", "status", "rastreio"]);
    return tokens.every((t) => /^[a-z]{2,}$/.test(t) && !blocked.has(t));
}

function hasSacIntakePayload(userMessage: string, customerPhone?: string): boolean {
    const extraction = extractKnownEntities(
        [{ role: "user", content: userMessage || "" }],
        { customerPhone }
    );
    const known = extraction.known;
    const hasIdentifier = Boolean(known.orderId || known.email || known.cpf);
    const hasName = Boolean(known.customerName) || hasNameLikePrefix(userMessage);
    return hasIdentifier && hasName;
}

/**
 * Extrai nome de vendedor mencionado na mensagem
 * Ex: "quero falar com o JoÃ£o" -> "Joao"
 */
function extractVendedorName(msg: string): string | undefined {
    const normalized = normalizeText(msg || "").replace(/\s+/g, " ").trim();
    if (!normalized) return undefined;

    const blocked = new Set([
        "oi", "ola", "sim", "nao", "ok", "pode", "encaminhar", "transferir",
        "pedido", "cpf", "atendente", "humano", "vendedor", "vendedora",
        "obrigado", "obrigada", "um", "uma", "alguem", "pessoa", "gerente",
        "por", "favor", "corrida", "academia", "casual", "dia", "uso", "m", "g", "gg",
    ]);

    const toTitleCase = (text: string): string =>
        text
            .split(" ")
            .filter(Boolean)
            .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
            .join(" ");

    const isLikelyName = (candidate: string): boolean => {
        const tokens = candidate.split(" ").filter(Boolean);
        if (tokens.length < 1 || tokens.length > 2) return false;
        if (tokens.some((t) => t.length < 3 || t.length > 20)) return false;
        if (tokens.some((t) => !/^[a-z]+$/i.test(t))) return false;
        if (tokens.some((t) => blocked.has(t))) return false;
        return true;
    };

    // PadrÃµes com menÃ§Ã£o explÃ­cita ao vendedor/atendente.
    const patterns = [
        /\b(?:vendedor|vendedora|atendente)\s+([a-z]+(?:\s+[a-z]+)?)/i,
        /\b(?:falar|passar|encaminhar|transferir)\s+com\s+(?:o|a)?\s*([a-z]+(?:\s+[a-z]+)?)/i,
        /\bcom\s+(?:o|a)\s+([a-z]+(?:\s+[a-z]+)?)/i,
    ];

    for (const pattern of patterns) {
        const match = normalized.match(pattern);
        const candidate = (match?.[1] || "").trim();
        if (candidate && isLikelyName(candidate)) {
            return toTitleCase(candidate);
        }
    }

    // Fallback: nome isolado enviado apÃ³s pedido de handoff (ex: "joaquim", "maria clara")
    if (isLikelyName(normalized)) {
        return toTitleCase(normalized);
    }

    return undefined;
}

function isTrustedClaimSource(source?: string): boolean {
    const normalized = normalizeText(source || "");
    return normalized.includes("db") || normalized.includes("tool");
}

function sanitizeUnsafeClaims(replyText: string, ctx: ClaimGuardContext): ClaimGuardResult {
    const original = (replyText || "").trim();
    if (!original) {
        return { text: replyText, applied: false, reasons: [] };
    }

    const untrusted = ctx.isChatOnly || !isTrustedClaimSource(ctx.source);
    if (!untrusted) {
        return { text: original, applied: false, reasons: [] };
    }

    const reasons: string[] = [];
    let safeText = original;
    const normalized = normalizeText(original);
    const hasVerificationLanguage = /\b(verific|chec|confirm|consult|encaminh|acionar)\b/i.test(normalized);

    const hasStockClaim = /\b(temos sim|tem sim|esta disponivel|disponivel em estoque|\d+\s+unidades?)\b/i.test(normalized);
    if (hasStockClaim && !hasVerificationLanguage) {
        safeText = "Posso confirmar no sistema pra vocÃª. Me diga o modelo, cor e tamanho para eu checar a disponibilidade.";
        reasons.push("stock_claim_without_evidence");
    }

    const hasTrackingClaim = /\b(em rota|saiu para entrega|entregue|a caminho|pedido faturado|pedido aprovado)\b/i.test(normalized);
    if (hasTrackingClaim && !hasVerificationLanguage) {
        safeText = "Preciso confirmar o status no sistema antes de te dar esse retorno. Me informe o CPF e o nÃºmero do pedido para eu verificar.";
        reasons.push("tracking_claim_without_evidence");
    }

    const hasActionClaim = /\b(ja gerei|ja cancelei|ja solicitei|ja finalizei|ja resolvi|acabei de gerar|acabei de cancelar)\b/i.test(normalized);
    if (hasActionClaim && !hasVerificationLanguage) {
        safeText = "Ainda preciso confirmar essa aÃ§Ã£o no sistema. Me passe os dados do pedido para eu encaminhar a checagem.";
        reasons.push("action_claim_without_evidence");
    }

    // Prevent temporal claims that trigger F001 when no explicit verification exists.
    const temporalClaimPattern = /\b(hoje|amanha|\d{1,2}\/\d{1,2}|\d{1,2}\s+de\s+[a-z]+)/i;
    if (temporalClaimPattern.test(normalizeText(safeText)) && !hasVerificationLanguage) {
        let rewritten = safeText
            .replace(/\bcomo posso te ajudar hoje\??/gi, "como posso te ajudar?")
            .replace(/\best[aÃ¡]\s+procurando hoje\??/gi, "esta procurando?")
            .replace(/\bprocurando hoje\??/gi, "procurando?")
            .replace(/\bhoje\b/gi, "agora")
            .replace(/\bamanha\b/gi, "nos proximos passos");

        // Remove date-like commitments in untrusted paths.
        rewritten = rewritten
            .replace(/\b\d{1,2}\/\d{1,2}\b/g, "")
            .replace(/\b\d{1,2}\s+de\s+[a-z]+\b/gi, "")
            .replace(/\s{2,}/g, " ")
            .trim();

        if (rewritten !== safeText) {
            safeText = rewritten;
            reasons.push("temporal_claim_without_evidence");
        }
    }

    return {
        text: safeText,
        applied: reasons.length > 0,
        reasons,
    };
}

function ensureNextStep(replyText: string, ctx: NextStepContext): string {
    const original = (replyText || "").trim();
    if (!original) {
        if (process.env.CADU_DEBUG === "1") {
            console.log(`[NEXT_STEP] appended_next_step=false reason=empty_reply`);
        }
        return replyText;
    }

    const normalizedReply = normalizeText(original);
    const intent = String(ctx.effective_intent || ctx.intent || "").toUpperCase();
    const action = String(ctx.action || "").toUpperCase();

    const isInfoOrSupport =
        intent === "SUPPORT" ||
        intent === "INFO" ||
        intent.startsWith("INFO_");
    const hasF003Keyword = /\b(proximo|farei|vou|irei|aguarde|entrarei|te informo|te aviso|um momento|verificando|consultando)\b/i.test(normalizedReply);
    const isSacIntent =
        intent.startsWith("SAC_") ||
        intent === "ORDER_STATUS" ||
        intent === "TRACKING" ||
        intent === "EXCHANGE_REQUEST" ||
        intent === "REFUND_REQUEST";

    if (isInfoOrSupport) {
        // F003 fix: respostas INFO/SUPPORT tambÃ©m precisam de keyword de prÃ³ximo passo
        if (!hasF003Keyword && original.length > 20) {
            const separator = original.endsWith(".") || original.endsWith("!") || original.endsWith("?") ? " " : ". ";
            if (process.env.CADU_DEBUG === "1") {
                console.log(`[NEXT_STEP] appended_next_step=true reason=info_support_missing_f003`);
            }
            return `${original}${separator}Vou tirar qualquer dÃºvida!`;
        }
        if (process.env.CADU_DEBUG === "1") {
            console.log(`[NEXT_STEP] appended_next_step=false reason=support_or_info`);
        }
        return original;
    }

    // Safety net: quando CLARIFICATION cai em PROVIDE_POLICY, ainda precisa de prÃ³ximo passo explÃ­cito.
    if (action === "PROVIDE_POLICY" && intent === "CLARIFICATION" && !hasF003Keyword && original.length > 20) {
        const separator = original.endsWith(".") || original.endsWith("!") || original.endsWith("?") ? " " : ". ";
        if (process.env.CADU_DEBUG === "1") {
            console.log(`[NEXT_STEP] appended_next_step=true reason=clarification_policy_missing_f003`);
        }
        return `${original}${separator}Vou te orientar agora.`;
    }

    const hasRequestVerb =
        /\b(me informe|me informa|me manda|pode me dizer|confirma|envie|me passa)\b/i.test(normalizedReply);
    const hasReservationCta =
        /\b(quer que eu reserve|posso reservar|vou reservar|deseja reservar|confirmar a reserva)\b/i.test(normalizedReply);
    const hasSalesDiscoveryQuestion =
        /\b(qual produto|qual modelo|qual marca|qual tamanho|qual numeracao|qual numera[Ã§c][aÃ£]o|me diga o tamanho|me diga a marca|me diga o modelo|pra qual uso|para qual uso)\b/i.test(normalizedReply);

    const endsWithQuestion = /\?\s*$/.test(original);
    const asksForDataAtEnd =
        /\b(cpf|pedido|numero do pedido)\b/i.test(normalizedReply.slice(-160));

    const hasActionNextStep =
        /\b(proximo passo|agora)\b.*\b(vou verificar|posso acionar|quer que eu reserve|posso reservar|vou encaminhar|posso encaminhar|vou transferir|vou te transferir|posso transferir|vou direcionar|vou te direcionar|posso direcionar|vou abrir)\b/i
            .test(normalizedReply) ||
        /\b(vou transferir|vou te transferir|vou encaminhar|posso encaminhar|posso transferir|vou direcionar|vou te direcionar|posso direcionar)\b/i
            .test(normalizedReply) ||
        /\b(ja foi encaminhado|ja foi encaminhada|jÃ¡ foi encaminhado|jÃ¡ foi encaminhada)\b/i
            .test(normalizedReply);

    if (normalizedReply.includes("proximo passo:")) {
        if (process.env.CADU_DEBUG === "1") {
            console.log(`[NEXT_STEP] appended_next_step=false reason=already_has_proximo_passo`);
        }
        return original;
    }

    if (hasActionNextStep) {
        if (process.env.CADU_DEBUG === "1") {
            console.log(`[NEXT_STEP] appended_next_step=false reason=already_has_action_next_step`);
        }
        return original;
    }

    if (!isSacIntent && (hasRequestVerb || hasReservationCta || hasSalesDiscoveryQuestion || (endsWithQuestion && asksForDataAtEnd))) {
        if (process.env.CADU_DEBUG === "1") {
            const reason = hasRequestVerb
                ? "already_has_request_verb"
                : hasReservationCta
                    ? "already_has_reservation_cta"
                : hasSalesDiscoveryQuestion
                    ? "already_has_sales_discovery_question"
                : (endsWithQuestion && asksForDataAtEnd)
                    ? "already_has_data_question"
                    : "already_has_action_next_step";
            console.log(`[NEXT_STEP] appended_next_step=false reason=${reason}`);
        }
        return original;
    }

    let nextStep = "";

    if (action === "ESCALATE") {
        nextStep = "Posso encaminhar para um atendente humano agora, se vocÃª confirmar.";
    } else if (intent === "ORDER_STATUS" || intent === "TRACKING" || intent === "SAC_ATRASO") {
        nextStep = "Me confirme o CPF e o nÃºmero do pedido, vou verificar o status agora!";
    } else if (
        intent === "STOCK_AVAILABILITY" ||
        intent === "SALES" ||
        intent === "RESERVATION" ||
        intent === "CLOSING_SALE" ||
        intent === "STOCK"
    ) {
        nextStep = "Me diga o tamanho e o modelo, vou verificar a disponibilidade!";
    }

    if (!nextStep) {
        if (process.env.CADU_DEBUG === "1") {
            console.log(`[NEXT_STEP] appended_next_step=false reason=action_not_supported`);
        }
        return original;
    }

    const separator = original.endsWith(".") || original.endsWith("!") || original.endsWith("?") ? "\n" : ".\n";
    const updated = `${original}${separator}${nextStep}`;

    if (process.env.CADU_DEBUG === "1") {
        console.log(`[NEXT_STEP] appended_next_step=true reason=no_question_detected intent=${intent || "UNKNOWN"} action=${action || "UNKNOWN"}`);
    }

    return updated;
}

type SlotCollectionDecision = {
    shouldCollect: boolean;
    text: string;
    missingSlots: Slot[];
    known: KnownEntities;
    slotSource: Partial<Record<Slot, string>>;
    profileIntent: string;
    reason: string;
};

function isKnownSlotIntent(intent: string): boolean {
    const normalized = String(intent || "").toUpperCase();
    return [
        "ORDER_STATUS",
        "TRACKING",
        "DELIVERY_DELAY",
        "EXCHANGE_REQUEST",
        "REFUND_REQUEST",
        "RETURN_PROCESS",
        "VOUCHER_GENERATION",
        "STOCK_AVAILABILITY",
        "STORE_RESERVATION",
        "RESERVATION",
        "SAC_ATRASO",
        "SAC_TROCA",
        "SAC_REEMBOLSO",
        "SAC_RETIRADA",
        "SUPPORT",
        "INFO",
        "INFO_ADDRESS",
        "INFO_HOURS",
        "INFO_SAC_POLICY",
    ].includes(normalized);
}

function inferSlotProfileIntent(
    intent: string | undefined,
    userMessage: string,
    replyText: string,
    known: KnownEntities,
    state?: string
): string {
    const rawIntent = String(intent || "").toUpperCase().trim();
    const normalizedMsg = normalizeText(userMessage || "");
    const normalizedReply = normalizeText(replyText || "");
    const compactMsg = normalizedMsg.replace(/\s+/g, " ").trim();
    const footballTeamMention = findFootballTeamMention(userMessage || "");
    const looksLikeAmbiguousComment =
        /^\s*\(.*\)\s*$/.test(userMessage || "") ||
        /\b(nao entendeu|nao era isso|mensagem padrao|resposta errada|voce errou|se atente)\b/.test(normalizedMsg);
    const hasRefundSignal =
        /\b(reembolso|estorno|devolucao|devolver|pix de volta|dinheiro de volta|devolver o dinheiro|a dinheiro)\b/.test(normalizedMsg) ||
        /\b(quero|prefiro|preciso).{0,20}\bdinheiro\b/.test(normalizedMsg);

    // Priority 1: Explicit SAC keywords in message
    if (hasRefundSignal) return "REFUND_REQUEST";
    if (/\b(troca|trocar|vale troca|vt)\b/.test(normalizedMsg)) return "EXCHANGE_REQUEST";
    if (/\b(rastreio|tracking|transportadora|atras|nao chegou|entrega|retirada|status)\b/.test(normalizedMsg)) return "ORDER_STATUS";

    // Priority 2: Stick to SAC if already in support state or if we have SAC data
    const inSupport = state === "support_sac" || state === "support";
    const hasSacContext = !!(known.orderId || known.ticketId || known.cpf || (known.canalVenda && known.canalVenda !== "unknown"));

    if (inSupport || hasSacContext) {
        // If it's a SAC intent, keep it
        if (rawIntent.startsWith("SAC_") || ["ORDER_STATUS", "REFUND_REQUEST", "EXCHANGE_REQUEST", "SUPPORT"].includes(rawIntent)) {
            return rawIntent;
        }
        // If intent is generic but we have SAC context, default to the most likely SAC intent
        const isGenericSupportIntent = !rawIntent || rawIntent === "SALES" || rawIntent === "CLARIFICATION" || rawIntent === "UNKNOWN" || rawIntent === "STOCK_AVAILABILITY" || rawIntent === "STOCK";
        if (isGenericSupportIntent) {
            // Em comentÃ¡rio/meta-feedback ambÃ­guo, sempre cair na triagem padrÃ£o (nÃ£o pedir CPF/pedido direto).
            if (looksLikeAmbiguousComment) return "LOW_CONTEXT_UNCERTAIN";
            // Mensagem curta nÃ£o-SAC em suporte (ex: nome de vendedor) tambÃ©m deve cair na triagem padrÃ£o.
            if (
                compactMsg.length <= 24 &&
                !/\b(pedido|cpf|troca|reembolso|estorno|devolucao|rastreio|status|ticket)\b/.test(normalizedMsg)
            ) {
                return "LOW_CONTEXT_UNCERTAIN";
            }
            if (hasRefundSignal || /\b(estorno|reembolso|pix)\b/.test(normalizedReply) || /\b(veio errado|produto errado|devolver o valor)\b/.test(normalizedMsg)) return "REFUND_REQUEST";
            if (/\b(troca|trocar)\b/.test(normalizedReply) || /\b(troca|trocar)\b/.test(normalizedMsg)) return "EXCHANGE_REQUEST";
            return "ORDER_STATUS";
        }
    }

    if (/\b(loja fisica|fisica|no shopping|no river)\b/.test(normalizedMsg)) return "EXCHANGE_REQUEST";
    if (/\b(reserva|reservar)\b/.test(normalizedMsg)) return "RESERVATION";
    if (footballTeamMention) return "STOCK_AVAILABILITY";
    if (/\b(estoque|produto|modelo|cor|tamanho|numero|numera|tenis|chuteira|camisa)\b/.test(normalizedMsg)) return "STOCK_AVAILABILITY";
    if (known.orderId || known.ticketId) return "ORDER_STATUS";
    if (isKnownSlotIntent(rawIntent)) return rawIntent;

    const hasGenericSalesPrompt =
        normalizedReply.includes("qual produto voce procura") ||
        normalizedReply.includes("me diga o tamanho e a cor/modelo") ||
        normalizedReply.includes("qual numero voce calca") ||
        normalizedReply.includes("pra qual uso voce vai usar");
    const hasProductSignalInMsg =
        /\b(tenis|chuteira|camisa|mochila|produto|modelo|cor|tamanho|numero|numera|nike|adidas|mizuno|puma|fila|olympikus|valor|preco|r\$)\b/.test(normalizedMsg) ||
        footballTeamMention !== null;
    const compact = normalizedMsg.replace(/\s+/g, " ").trim();
    const isShort = compact.length <= 24;
    const isAckLike = /^(ok|okay|sim|nao|obrigad[oa]?|valeu|vlw|tabom|ta bom|blz|beleza|\?)$/.test(compact);
    const hasSacSignal =
        /\b(pedido|troca|reembolso|estorno|devolucao|transportadora|retirada|atraso|status|ticket|central|resolver)\b/.test(normalizedMsg);

    // Low-confidence fallback: avoid answering SALES for short/ambiguous fragments.
    if (rawIntent === "SALES" && hasGenericSalesPrompt && !hasProductSignalInMsg && (isShort || isAckLike || hasSacSignal || compact.length <= 80)) {
        return "LOW_CONTEXT_UNCERTAIN";
    }

    return rawIntent || "UNKNOWN";
}

function isExchangePolicyQuestion(text: string): boolean {
    const normalized = normalizeText(text || "");
    if (!normalized) return false;

    const hasExchangeSignal = /\b(troca|trocar|devolucao|devolver|vale troca|presente|politica)\b/.test(normalized);
    if (!hasExchangeSignal) return false;

    const hasTransactionalSignal =
        /\b(cpf|numero do pedido|n do pedido|rastreio|tracking|protocolo|ticket|pedido \d{6,})\b/.test(normalized);

    return hasExchangeSignal && !hasTransactionalSignal;
}

function buildExchangePolicyFastPathReply(): string {
    return "PolÃ­tica de troca (resumo):\n1) Prazo: em geral, atÃ© 30 dias corridos.\n2) CondiÃ§Ãµes: produto sem uso, com etiqueta e comprovante (NF/cupom).\n3) Presente: seguimos a mesma regra, validando o canal da compra.\nVou te orientar com as regras corretas! Me confirme se a compra foi na loja fÃ­sica ou no site/app.";
}

function buildLowContextTriageQuestion(known: KnownEntities, isChatOnly: boolean, profileIntent: string): string {
    const isLojaFisica = known.canalVenda === "loja_fisica";
    const isOnline = known.canalVenda === "online" || known.canalVenda === "site_app";

    const needOrder = !known.orderId;
    const needCpf = !known.cpf;
    const needSize = !known.size;

    let sacClause = "";
    if (isLojaFisica) {
        sacClause = needCpf ? "me passa o seu CPF (pra eu verificar sua compra em loja)" : "";
    } else if (isOnline) {
        sacClause = needOrder ? "me passa o nÃºmero do pedido (pra eu verificar sua compra online)" : "";
    } else {
        // Unknown channel
        if (needOrder && needCpf) {
            sacClause = "se a compra foi no Site/App, me passa o nÃºmero do pedido. Se foi em Loja FÃ­sica, me passa seu CPF";
        } else if (needOrder) {
            sacClause = "me passa o nÃºmero do pedido (se comprou online)";
        } else if (needCpf) {
            sacClause = "me passa o seu CPF (se comprou em loja)";
        }
    }

    const isSales = ["SALES", "STOCK_AVAILABILITY", "RESERVATION", "STOCK"].includes(profileIntent || "");
    const stockClause = (needSize && isSales)
        ? " Se for sobre estoque, me diga tamanho e cor."
        : "";
    const handoffClause = isChatOnly
        ? " Com isso eu jÃ¡ agilizo seu atendimento!"
        : "";

    return `Para te ajudar, ${sacClause}. Vou verificar assim que receber!${stockClause}${handoffClause}`;
}

/**
 * Nova mensagem de triagem padrÃ£o mais informativa.
 * Usada quando o contexto nÃ£o Ã© claro (fallback).
 * Evita mensagens genÃ©ricas de vendas ("Me diga o tamanho") em contextos SAC.
 */
function buildImprovedTriageQuestion(known: KnownEntities, isChatOnly: boolean, profileIntent: string): string {
    const isSales = ["SALES", "STOCK_AVAILABILITY", "RESERVATION", "STOCK"].includes(profileIntent || "");
    const isSac = ["ORDER_STATUS", "TRACKING", "DELIVERY_DELAY", "SAC_ATRASO", "SAC_TROCA", "SAC_REEMBOLSO", "RETURN_PROCESS", "REFUND_REQUEST"].includes(profileIntent || "");

    // Se jÃ¡ identificou contexto de vendas, use a mensagem especÃ­fica de vendas
    if (isSales) {
        return buildLowContextTriageQuestion(known, isChatOnly, profileIntent);
    }

    // Se jÃ¡ identificou contexto SAC, use a mensagem especÃ­fica de SAC
    if (isSac) {
        return buildLowContextTriageQuestion(known, isChatOnly, profileIntent);
    }

    // Contexto desconhecido â€” mensagem neutra e informativa
    const handoffClause = isChatOnly
        ? " Assim jÃ¡ agilizo seu atendimento com os dados necessÃ¡rios!"
        : "";

    return `Vou te ajudar! Me diz do que se trata:

ðŸ”¹ Se for sobre *compra/produto*: qual item, marca, cor e tamanho vocÃª procura?
ðŸ”¹ Se for sobre *pedido/SAC*: nÃºmero do pedido (se comprou online) ou CPF (se comprou em loja)?
ðŸ”¹ Se for apenas uma *dÃºvida*: pode perguntar que eu respondo!${handoffClause}`;
}

function isAmbiguousMessageForTriage(message: string): boolean {
    const normalized = normalizeText(message || "").replace(/\s+/g, " ").trim();
    if (!normalized) return false;

    const isGreetingOnly =
        /^(oi|ola|olÃ¡|opa|bom dia|boa tarde|boa noite|tudo bem|tudo bem\?)$/.test(normalized);
    if (isGreetingOnly) return false;

    const ackOnly =
        /^(ok|okay|sim|nao|nÃ£o|obrigad[oa]?|valeu|vlw|blz|beleza|por favor|pfv|\?)$/.test(normalized);
    const veryShort = normalized.length <= 18;
    const hasClarifyingMetaSignal =
        /\b(nao entendi|nÃ£o entendi|nao era isso|nÃ£o era isso|explica melhor|como assim|confuso|ambiguo|ambÃ­guo)\b/.test(normalized);
    const hasClearDomainSignal =
        /\b(camis|tenis|tÃªnis|chuteira|produto|marca|cor|tamanho|numero|numeraÃ§Ã£o|pedido|cpf|troca|reembolso|estorno|entrega|endereco|endereÃ§o|horario|horÃ¡rio|funcionamento|reserva|vendedor|atendente|humano)\b/.test(normalized);

    if (hasClarifyingMetaSignal) return true;
    if ((ackOnly || veryShort) && !hasClearDomainSignal) return true;
    return false;
}

function buildSacOrderIssueIntakeMessage(known: KnownEntities): string {
    const needName = !known.customerName;
    const needOrder = !known.orderId;
    const needEmail = !known.email;

    const fields: string[] = [];
    if (needName) fields.push("nome completo");
    if (needOrder) fields.push("número do pedido");
    if (needEmail) fields.push("e-mail cadastrado");

    if (fields.length === 0) {
        return "Perfeito! Já tenho os dados principais e vou encaminhar seu caso para o atendimento humano agora.";
    }

    return `Para abrir seu atendimento e repassar ao agente humano, me passa: ${fields.join(", ")}. Se a compra foi em loja física, pode enviar CPF no lugar de pedido/e-mail.`;
}
function maskCpfForTelemetry(cpf?: string): string | undefined {
    if (!cpf) return undefined;
    const digits = cpf.replace(/[^\d]/g, "");
    if (!digits) return undefined;
    return `***.***.***-${digits.slice(-2)}`;
}

function maskKnownEntitiesForTelemetry(known: KnownEntities): Record<string, string> {
    const masked: Record<string, string> = {};
    if (known.orderId) masked.orderId = known.orderId;
    if (known.ticketId) masked.ticketId = known.ticketId;
    if (known.size) masked.size = known.size;
    const cpfMasked = maskCpfForTelemetry(known.cpf);
    if (cpfMasked) masked.cpf = cpfMasked;
    if (known.customerPhone) masked.customerPhone = `***${known.customerPhone.slice(-4)}`;
    return masked;
}

function maybeCollectMissingSlot(params: {
    intent?: string;
    userMessage: string;
    replyText: string;
    customerPhone?: string;
    isChatOnly: boolean;
    slots?: Record<string, any>;
    state?: string;
}): SlotCollectionDecision {
    const extraction = extractKnownEntities(
        [{ role: "user", content: params.userMessage || "" }],
        { customerPhone: params.customerPhone }
    );
    // Merge existing slots with fresh extraction to maintain memory in CHAT_ONLY mode
    const known: KnownEntities = {
        ...(params.slots || {}),
        ...extraction.known
    };
    const slotSource = extraction.slotSource;
    const profileIntent = inferSlotProfileIntent(params.intent, params.userMessage, params.replyText, known, params.state);
    const normalizedReply = normalizeText(params.replyText || "");
    const replyLooksConfused =
        /\b(nao entendi|nÃ£o entendi|nao ficou claro|nÃ£o ficou claro|pode explicar|pode repetir)\b/.test(normalizedReply);
    const hasCollectedContext =
        Boolean(known.product || known.marca || known.timeFutebol || known.orderId || known.cpf || known.ticketId || known.canalVenda);
    const ambiguousWithoutContext =
        isAmbiguousMessageForTriage(params.userMessage) && !hasCollectedContext;
    const forceStandardTriage =
        profileIntent === "LOW_CONTEXT_UNCERTAIN" ||
        ambiguousWithoutContext ||
        replyLooksConfused;

    if (forceStandardTriage) {
        return {
            shouldCollect: true,
            text: buildImprovedTriageQuestion(known, params.isChatOnly, "LOW_CONTEXT_UNCERTAIN"),
            missingSlots: [],
            known,
            slotSource,
            profileIntent: "LOW_CONTEXT_UNCERTAIN",
            reason: "forced_standard_triage",
        };
    }

    if (
        (profileIntent === "EXCHANGE_REQUEST" || profileIntent === "SAC_TROCA") &&
        isExchangePolicyQuestion(params.userMessage)
    ) {
        return {
            shouldCollect: false,
            text: buildExchangePolicyFastPathReply(),
            missingSlots: [],
            known,
            slotSource,
            profileIntent,
            reason: "policy_fast_path",
        };
    }

    const normalizedUserMessage = normalizeText(params.userMessage || "");
    const isExplicitOrderIssue =
        /\b(pedido|nao chegou|não chegou|atras|atraso|status|rastreio|tracking|entrega)\b/.test(normalizedUserMessage);
    const isOrderIssueIntent =
        ["ORDER_STATUS", "TRACKING", "DELIVERY_DELAY", "SAC_ATRASO", "SUPPORT"].includes(profileIntent) ||
        ["ORDER_STATUS", "TRACKING", "SAC_ATRASO", "SUPPORT"].includes(String(params.intent || "").toUpperCase());

    if (isOrderIssueIntent && isExplicitOrderIssue) {
        const intakeMessage = buildSacOrderIssueIntakeMessage(known);
        return {
            shouldCollect: true,
            text: intakeMessage,
            missingSlots: [],
            known,
            slotSource,
            profileIntent,
            reason: "sac_order_issue_intake",
        };
    }

    // ðŸ†• FLUXO: Cliente pediu vendedor diretamente (VERIFICAR PRIMEIRO, antes de outros fluxos)
    const isRequestingHuman = params.intent === "REQUEST_HUMAN" ||
        params.intent === "HANDOFF" ||
        /\b(vendedor|atendente|humano|transfer|encaminh)\b/.test(normalizedUserMessage);

    if (isRequestingHuman) {
        const slots = params.slots || {};
        const vendedorName = extractVendedorName(params.userMessage);
        const hasVendedorName = Boolean(vendedorName);
        const hasProduct = Boolean(slots.product);
        const wasAskedAboutVendedor = params.replyText?.includes("Qual vendedor");

        // Se a Ãºltima pergunta foi sobre vendedor E o cliente respondeu com um nome
        if (wasAskedAboutVendedor && hasVendedorName) {
            // Cliente respondeu com nome do vendedor â€” fazer handoff
            return {
                shouldCollect: false,
                text: `Perfeito! Vou encaminhar vocÃª para o vendedor ${vendedorName}. Posso transferir agora?`,
                missingSlots: [],
                known,
                slotSource,
                profileIntent,
                reason: "handoff_vendedor_especifico",
            };
        }

        // Se ainda nÃ£o perguntamos sobre o vendedor/item e nÃ£o temos contexto
        if (!hasVendedorName && !hasProduct && !wasAskedAboutVendedor) {
            return {
                shouldCollect: true,
                text: "Qual vendedor vocÃª gostaria de falar? Ou me diga qual item vocÃª procura, vou te ajudar!",
                missingSlots: [],
                known,
                slotSource,
                profileIntent,
                reason: "request_human_vendedor_context",
            };
        }

        // Se tem nome do vendedor na mensagem inicial (ex: "vendedor Joaquim")
        if (hasVendedorName && !slots.product) {
            return {
                shouldCollect: false,
                text: `Vou encaminhar vocÃª para o vendedor ${vendedorName}. Posso transferir agora?`,
                missingSlots: [],
                known,
                slotSource,
                profileIntent,
                reason: "handoff_vendedor_especifico",
            };
        }
    }

    if (profileIntent === "LOW_CONTEXT_UNCERTAIN" || profileIntent === "EXCHANGE_REQUEST") {
        const canalVenda = params.slots?.canalVenda || known.canalVenda;
        if (canalVenda === "loja_fisica" && (profileIntent === "EXCHANGE_REQUEST" || params.intent === "EXCHANGE_REQUEST" || params.intent === "SAC_TROCA")) {
            return {
                shouldCollect: false,
                text: "Para trocas em loja fÃ­sica, basta levar o produto com etiqueta, a nota fiscal e um documento com foto. Se quiser, me passe o modelo, marca e tamanho que vou verificar a disponibilidade!",
                missingSlots: [],
                known,
                slotSource,
                profileIntent,
                reason: "physical_store_exchange_discovery",
            };
        }

        // ðŸš¨ BLOQUEIO CRÃTICO: Nunca usar triagem SAC (pedido/CPF) em fluxos de vendas
        const isSalesIntent = ["SALES", "STOCK_AVAILABILITY", "RESERVATION", "STOCK"].includes(params.intent || "") ||
            ["SALES", "STOCK_AVAILABILITY", "RESERVATION", "STOCK"].includes(profileIntent || "");

        // ðŸš¨ BLOQUEIO DEFINITIVO: Se hÃ¡ contexto SAC (orderId, cpf, ticketId), NUNCA tratar como vendas
        const hasSacContext = !!(params.slots?.orderId || params.slots?.cpf || params.slots?.ticketId ||
            known.orderId || known.cpf || known.ticketId);
        const footballTeamMention = findFootballTeamMention(params.userMessage || "");
        const slotsRecord = (params.slots || {}) as Record<string, unknown>;
        const knownFootballTeam = typeof slotsRecord.timeFutebol === "string"
            ? slotsRecord.timeFutebol
            : undefined;
        const footballTeam = footballTeamMention?.team || knownFootballTeam;

        // ðŸ†• Se a mensagem Ã© ambÃ­gua/meta-comentÃ¡rio (parÃªnteses, curta, sem sinais claros), forÃ§ar triagem
        const looksLikeAmbiguousComment =
            /^\s*\(.*\)\s*$/.test(params.userMessage) || // Entre parÃªnteses
            (params.userMessage.length < 50 &&
                !/\b(tenis|chuteira|camisa|produto|marca|tamanho|pedido|cpf|entrega|troca|reembolso)\b/i.test(params.userMessage) &&
                !hasFootballTeamMention(params.userMessage));

        if (isSalesIntent && !hasSacContext && !looksLikeAmbiguousComment) {
            // Em vendas, perguntar pelo produto/marca/tamanho â€” NUNCA pedido/CPF
            // Usar slots dos params (contexto completo) em vez de known (extraÃ­do sÃ³ da mensagem atual)
            const slots = params.slots || {};
            const hasProduct = Boolean(slots.product);
            const hasMarca = Boolean(slots.marca) || Boolean(footballTeam);
            const hasSize = Boolean(known.size || slots.size);

            if (!hasProduct || !hasMarca || !hasSize) {
                let question = "";
                if (!hasProduct) {
                    question = footballTeam
                        ? `Perfeito! Para ${footballTeam}, vocÃª quer camisa, shorts ou chuteira?`
                        : "Qual modelo ou produto vocÃª estÃ¡ procurando? Vou te ajudar!";
                } else if (!hasMarca) {
                    question = "Qual a marca? Vou verificar no estoque!";
                } else if (!hasSize) {
                    question = footballTeam
                        ? `Me diga o tamanho ou numeraÃ§Ã£o do item do ${footballTeam}, vou verificar no estoque!`
                        : "Me diga o tamanho ou numeraÃ§Ã£o, vou verificar no estoque!";
                }

                const missingSlots = [
                    !hasProduct ? "product" : null,
                    (!hasMarca && !footballTeam) ? "marca" : null,
                    !hasSize ? "size" : null,
                ].filter(Boolean) as Slot[];

                return {
                    shouldCollect: true,
                    text: question,
                    missingSlots,
                    known,
                    slotSource,
                    profileIntent,
                    reason: "sales_context_fallback",
                };
            }
        }

        const missingSlots: Slot[] = [];
        if (!known.orderId) missingSlots.push("orderId");
        if (!known.cpf) missingSlots.push("cpf");
        if (!known.size) missingSlots.push("size");
        if (missingSlots.length > 0) {
            return {
                shouldCollect: true,
                text: buildImprovedTriageQuestion(known, params.isChatOnly, profileIntent),
                missingSlots,
                known,
                slotSource,
                profileIntent,
                reason: "low_context_fallback",
            };
        }
    }

    let missingSlots = getMissingSlots(profileIntent, known);
    if (missingSlots.length > 0) {
        // ðŸš¨ BLOQUEIO: Em contextos SAC/pedido, NUNCA pedir slots de vendas (size)
        const sacIntents = ["ORDER_STATUS", "TRACKING", "DELIVERY_DELAY", "SAC_ATRASO", "SAC_TROCA", "SAC_REEMBOLSO", "RETURN_PROCESS", "REFUND_REQUEST"];
        if (sacIntents.includes(profileIntent)) {
            missingSlots = missingSlots.filter(s => s !== "size");
            if (missingSlots.length === 0) {
                return {
                    shouldCollect: false,
                    text: params.replyText,
                    missingSlots: [],
                    known,
                    slotSource,
                    profileIntent,
                    reason: "all_sac_slots_present",
                };
            }
        }

        // InferÃªncia de canal (sincronizada com sacMinimum.ts)
        const hasOrderId = Boolean(known.orderId);
        const hasCPF = Boolean(known.cpf);

        const isExplicitlyLojaFisica = known.canalVenda === "loja_fisica";
        const isExplicitlyOnline = known.canalVenda === "online" || known.canalVenda === "site_app";

        const inferredLojaFisica = !isExplicitlyOnline && hasCPF && !hasOrderId;
        const inferredOnline = !isExplicitlyLojaFisica && hasOrderId && !hasCPF;

        const isLojaFisica = isExplicitlyLojaFisica || inferredLojaFisica;
        const isOnline = isExplicitlyOnline || inferredOnline;

        const requiresSacPair =
            [
                "ORDER_STATUS",
                "TRACKING",
                "DELIVERY_DELAY",
                "EXCHANGE_REQUEST",
                "REFUND_REQUEST",
                "RETURN_PROCESS",
                "VOUCHER_GENERATION",
                "SAC_ATRASO",
            ].includes(profileIntent) &&
            !isLojaFisica && !isOnline && // Only ask pair if channel is unknown
            missingSlots.includes("orderId") &&
            missingSlots.includes("cpf");

        let text = "";
        if (requiresSacPair) {
            text = "Me passa o nÃºmero do pedido (se comprou no Site/App) ou o seu CPF (se comprou em Loja FÃ­sica), vou verificar agora!";
        } else if (isLojaFisica && missingSlots.includes("orderId")) {
            // Se Ã© loja fÃ­sica, ignora o orderId faltante e pula para o prÃ³ximo slot ou encerra
            const nextMissing = missingSlots.filter(s => s !== "orderId");
            if (nextMissing.length > 0) {
                text = buildSlotQuestion(nextMissing[0], profileIntent, known, { isChatOnly: params.isChatOnly });
            } else {
                return {
                    shouldCollect: false,
                    text: params.replyText,
                    missingSlots: [],
                    known,
                    slotSource,
                    profileIntent,
                    reason: "all_relevant_slots_present_loja_fisica",
                };
            }
        } else {
            text = buildSlotQuestion(missingSlots[0], profileIntent, known, { isChatOnly: params.isChatOnly });
        }
        return {
            shouldCollect: true,
            text,
            missingSlots,
            known,
            slotSource,
            profileIntent,
            reason: "required_slot_missing",
        };
    }

    return {
        shouldCollect: false,
        text: params.replyText,
        missingSlots: [],
        known,
        slotSource,
        profileIntent,
        reason: "all_required_slots_present",
    };
}

// Validar ambiente ao iniciar
console.log("[WEBHOOK] Ã°Å¸Å¡â‚¬ Module loaded. Dev server runs on port 3001 Ã¢â‚¬â€ ensure ngrok targets the correct port.");
if (!process.env.WHATSAPP_VERIFY_TOKEN) {
    console.warn("[WEBHOOK] Ã¢Å¡Â Ã¯Â¸Â WHATSAPP_VERIFY_TOKEN nÃƒÂ£o definido no .env");
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ GET: VerificaÃƒÂ§ÃƒÂ£o do Webhook (Meta) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;

    const mode = searchParams.get("hub.mode");
    const token = searchParams.get("hub.verify_token");
    const challenge = searchParams.get("hub.challenge");

    console.log("[WEBHOOK] Ã°Å¸Å’Â GET Verification Request:", { mode, token, challenge });

    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

    if (mode === "subscribe" && token === verifyToken) {
        console.log("[WEBHOOK] Ã¢Å“â€¦ VerificaÃƒÂ§ÃƒÂ£o bem-sucedida! Retornando challenge.");
        return new NextResponse(challenge, { status: 200 });
    }

    console.warn("[WEBHOOK] Ã¢ÂÅ’ VerificaÃƒÂ§ÃƒÂ£o falhou. Token invÃƒÂ¡lido ou mode incorreto.");
    return NextResponse.json(
        { error: "Forbidden", detail: "Verify Token mismatch" },
        { status: 403 }
    );
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ POST: Receber mensagens do WhatsApp Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
export async function POST(request: NextRequest) {
    const requestStartTime = Date.now();
    let rawBody = "";
    let conversationId = "unknown";
    let storeId = "unknown";

    // Verificar modo CHAT_ONLY para logs simplificados
    const chatOnlyAtEntry = isChatOnlyMode();

    try {
        rawBody = await request.text();

        // Log simplificado com tags em CHAT_ONLY
        if (chatOnlyAtEntry) {
            // Extract basic message info for logging
            let inboundMsg = "";
            try {
                const body = JSON.parse(rawBody);
                const msg = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
                if (msg?.text?.body) {
                    inboundMsg = msg.text.body.substring(0, 30);
                    conversationId = `pending_${msg.from?.slice(-8) || "unknown"}`;
                }
            } catch { /* ignore */ }
            console.log(`[INBOUND] msg="${inboundMsg}..." phone=${conversationId.split('_')[1] || 'unknown'}`);
        } else {
            console.log("[WEBHOOK] Ã°Å¸â€œÂ¥ POST Payload RAW:", rawBody);
        }

        // Extract conversation and store info for logging if available
        try {
            const body = JSON.parse(rawBody);
            const value = body.entry?.[0]?.changes?.[0]?.value;
            if (value?.messages?.[0]) {
                const msg = value.messages[0];
                // Try to find conversation - this is a best effort since we don't have DB access yet
                conversationId = `pending_${msg.from.slice(-8)}`;
            }
        } catch {
            // Ignore parsing errors at this stage
        }
    } catch (readError) {
        console.error("[WEBHOOK] Ã¢ÂÅ’ Falha ao ler corpo da requisiÃƒÂ§ÃƒÂ£o:", readError);

        // Log webhook error
        logWebhookEvent({
            conversationId,
            storeId,
            event: "ERROR",
            message: "Failed to read request body",
            processingTimeMs: Date.now() - requestStartTime,
            result: "error",
        });

        return NextResponse.json({ error: "Read Error" }, { status: 400 });
    }

    // Log webhook entry
    logWebhookEvent({
        conversationId,
        storeId,
        event: "ENTRY",
        message: "Webhook received",
        processingTimeMs: Date.now() - requestStartTime,
        result: "success",
    });

    // 1. Validar Assinatura
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    const isTestMode = process.env.TEST_MODE === "true" || isChatOnlyMode();

    if (false && appSecret && !isTestMode) {
        // Em modo normal, exige assinatura vÃƒÂ¡lida
        const signature = request.headers.get("x-hub-signature-256");
        if (signature && !verifyWebhookSignature(rawBody, signature, appSecret)) {
            console.warn("[WEBHOOK] Ã¢ÂÅ’ Assinatura invÃƒÂ¡lida");

            // Log webhook error
            logWebhookEvent({
                conversationId,
                storeId,
                event: "ERROR",
                message: "Invalid webhook signature",
                processingTimeMs: Date.now() - requestStartTime,
                result: "error",
            });

            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
    } else if (appSecret && isTestMode && chatOnlyAtEntry) {
        // Em CHAT_ONLY, permite webhook sem assinatura (para teste via terminal)
        console.log("[INBOUND] [SKIP] assinatura ignorada em modo CHAT_ONLY");
    }

    // 2. Parsear JSON com Try/Catch Isolado
    let body: any;
    try {
        body = JSON.parse(rawBody);
    } catch (e) {
        console.error("[WEBHOOK] Ã¢ÂÅ’ JSON invÃƒÂ¡lido:", rawBody);

        // Log webhook error
        logWebhookEvent({
            conversationId,
            storeId,
            event: "ERROR",
            message: "Invalid JSON payload",
            processingTimeMs: Date.now() - requestStartTime,
            result: "error",
        });

        return NextResponse.json({ status: "ignored_invalid_json" }, { status: 200 });
    }

    // 3. Ingestion Phase (Sync Persistence)
    let ingestionContext: any = null;
    try {
        const result = await ingestMessage(body);

        // Se retornar null (bloqueado, ignorado, etc), retornamos 200 e paramos.
        // O `ingestMessage` jÃƒÂ¡ logou o motivo.
        if (!result) {
            return NextResponse.json({ status: "ignored_or_handled" }, { status: 200 });
        }
        ingestionContext = result;

    } catch (e: any) {
        console.error("[WEBHOOK] Ã¢ÂÅ’ Erro de IngestÃƒÂ£o:", e);
        if (isChatOnlyMode()) {
            return NextResponse.json({
                ok: false,
                mode: "chat_only",
                error: String(e.message || e),
                debug: { skipped_db: true }
            }, { status: 200 });
        }
        return NextResponse.json({ status: "error_handled", error: String(e.message || e) }, { status: 200 });
    }

    // 4. Processing Phase
    // Em CHAT_ONLY mode, processamento sync para Ralph Loop poder capturar resposta
    const chatOnly = isChatOnlyMode();

    if (chatOnly) {
        const incomingUserText = String(ingestionContext?.msg?.text || ingestionContext?.userMessage || "");
        const incomingPhone = String(ingestionContext?.msg?.from || "");
        const lastAssistantReply = incomingPhone ? String(getLastReply(incomingPhone)?.content || "") : "";
        const forceReservationHandoff = shouldForceReservationHandoff(incomingUserText, lastAssistantReply);
        const forceClosingAck = !forceReservationHandoff && shouldSendClosingAck(incomingUserText);
        const forceSacIntakeHandoff =
            !forceReservationHandoff &&
            !forceClosingAck &&
            isSacIntakePrompt(lastAssistantReply) &&
            hasSacIntakePayload(incomingUserText, incomingPhone);

        if (forceReservationHandoff) {
            ingestionContext.responseText = "Perfeito! Vou encaminhar sua reserva para um vendedor humano agora.";
            ingestionContext.detectedIntent = "HANDOFF";
            (ingestionContext as any).action = "ESCALATE";
            (ingestionContext as any).source = "reservation_confirmation_handoff";
            const convId = String(ingestionContext?.conversation?.id || "");
            if (convId) {
                await lockToHuman(convId).catch(() => { });
            }
            console.log("[WEBHOOK] [CHAT_ONLY] Forced reservation handoff applied");
        } else if (forceSacIntakeHandoff) {
            ingestionContext.responseText = "Perfeito! Recebi seus dados e vou te direcionar para nosso time de atendimento agora.";
            ingestionContext.detectedIntent = "HANDOFF";
            (ingestionContext as any).action = "ESCALATE";
            (ingestionContext as any).source = "sac_intake_handoff";
            const convId = String(ingestionContext?.conversation?.id || "");
            if (convId) {
                await lockToHuman(convId).catch(() => { });
            }
            console.log("[WEBHOOK] [CHAT_ONLY] SAC intake handoff applied");
        } else if (forceClosingAck) {
            ingestionContext.responseText = "Perfeito! Qualquer duvida, e so me chamar por aqui.";
            ingestionContext.detectedIntent = "CLARIFICATION";
            (ingestionContext as any).action = "CLOSE_ACK";
            (ingestionContext as any).source = "user_closing_ack";
            console.log("[WEBHOOK] [CHAT_ONLY] Closing ack applied");
        } else {
        // CHAT_ONLY: Processamento sync para retornar dados
        try {
            console.time("llm_process_sync");
            const aiResult = await processAI(ingestionContext);
            // Adicionar resultado ao contexto para retorno.
            // Se a conversa ja esta travada para humano, processAI pode retornar undefined.
            // Nesse caso, devolvemos uma mensagem explicita para evitar "No response" no harness.
            if (!aiResult || !(aiResult as any)?.text) {
                const humanLockReply = "Seu atendimento ja foi encaminhado para um agente humano e ele continua por aqui.";
                ingestionContext.responseText = humanLockReply;
                ingestionContext.detectedIntent = ingestionContext.detectedIntent || "HANDOFF";
                (ingestionContext as any).action = "ESCALATE";
                (ingestionContext as any).source = "human_lock";
            } else {
                ingestionContext.responseText = (aiResult as any).text || "";
                ingestionContext.detectedIntent = (aiResult as any).intent || "UNKNOWN";
                (ingestionContext as any).action = (aiResult as any).action;
                (ingestionContext as any).source = (aiResult as any).source;
            }
            if ((aiResult as any)?.state && ingestionContext.conversation) {
                (ingestionContext.conversation as any).currentState = (aiResult as any).state;
            }
            if ((aiResult as any)?.slots) {
                ingestionContext.slots = (aiResult as any).slots;
            }
            console.log(`[WEBHOOK] [CHAT_ONLY] Sync processing complete: ${ingestionContext.responseText?.substring(0, 50)}`);
        } catch (err) {
            console.error(`[WEBHOOK] Ã¢ÂÅ’ Sync Worker Error: ${err}`);
            ingestionContext.responseText = `[ERRO] ${err}`;
        } finally {
            console.timeEnd("llm_process_sync");
        }
        }
    } else {
        // ProduÃƒÂ§ÃƒÂ£o: Fire-and-Forget (async)
        (async () => {
            try {
                console.time("llm_process");
                await processAI(ingestionContext);
            } catch (err) {
                console.error(`[WEBHOOK] Ã¢ÂÅ’ Async Worker Error (Conv: ${ingestionContext.conversation.id}):`, err);
                debugLog(`[CRITICAL] Async Worker Error: ${err}`);
            } finally {
                console.timeEnd("llm_process");
            }
        })();
    }

    // 5. Return 200 OK Immediately
    console.log(`[WEBHOOK] Ã¢Å¡Â¡ Returning 200 OK to Meta immediately.`);

    const responseData: any = { status: "received", ok: true };

    if (chatOnly) {
        responseData.mode = "chat_only";
        responseData.debug = { skipped_db: true };

        if (ingestionContext) {
            const conv = ingestionContext.conversation;
            const detectedIntent = String(ingestionContext.detectedIntent || "").toUpperCase();
            const actionUpper = String(ingestionContext.action || "").toUpperCase();
            const sourceLower = String(ingestionContext.source || "").toLowerCase();
            const shouldBypassSlotCollector =
                actionUpper === "ESCALATE" ||
                actionUpper === "ESCALATE_HUMAN" ||
                actionUpper === "CLOSE_ACK" ||
                detectedIntent === "HANDOFF" ||
                detectedIntent === "REQUEST_HUMAN" ||
                sourceLower === "user_closing_ack" ||
                sourceLower === "human_lock" ||
                sourceLower.startsWith("human_loop");

            let slotDecision: SlotCollectionDecision;
            if (shouldBypassSlotCollector) {
                const extraction = extractKnownEntities(
                    [{ role: "user", content: ingestionContext.msg?.text || "" }],
                    { customerPhone: ingestionContext.msg?.from }
                );
                const detectedSellerName =
                    detectedIntent === "HANDOFF" &&
                        sourceLower !== "human_lock" &&
                        sourceLower !== "reservation_confirmation_handoff" &&
                        sourceLower !== "sac_intake_handoff" &&
                        !sourceLower.startsWith("human_loop")
                        ? extractVendedorName(ingestionContext.msg?.text || "")
                        : undefined;
                const handoffText = detectedSellerName
                    ? `Perfeito! Vou encaminhar vocÃª para o vendedor ${detectedSellerName} agora.`
                    : (ingestionContext.responseText || "");
                slotDecision = {
                    shouldCollect: false,
                    text: handoffText,
                    missingSlots: [],
                    known: {
                        ...(ingestionContext.slots || {}),
                        ...extraction.known,
                    },
                    slotSource: extraction.slotSource,
                    profileIntent: detectedIntent || "HANDOFF",
                    reason: detectedSellerName ? "handoff_vendedor_especifico" : "handoff_skip_slot_collection",
                };
            } else {
                slotDecision = maybeCollectMissingSlot({
                    intent: ingestionContext.detectedIntent,
                    userMessage: ingestionContext.msg?.text || "",
                    replyText: ingestionContext.responseText || "",
                    customerPhone: ingestionContext.msg?.from,
                    isChatOnly: true,
                    slots: ingestionContext.slots,
                    state: ingestionContext.currentState,
                });
            }

            if (slotDecision.shouldCollect) {
                ingestionContext.responseText = slotDecision.text;
                ingestionContext.action = "COLLECT_SLOT";
                ingestionContext.source = "slot_collector";
                if (process.env.CADU_DEBUG === "1") {
                    console.log(`[SLOT_COLLECTOR] active=true intent=${slotDecision.profileIntent} missing=${slotDecision.missingSlots.join(",")}`);
                }
            } else if (
                slotDecision.reason === "policy_fast_path" ||
                slotDecision.reason === "physical_store_exchange_discovery" ||
                slotDecision.reason === "handoff_vendedor_especifico"
            ) {
                ingestionContext.responseText = slotDecision.text;
                ingestionContext.action =
                    slotDecision.reason === "policy_fast_path"
                        ? "POLICY_INFO"
                        : slotDecision.reason === "physical_store_exchange_discovery"
                            ? "EXCHANGE_DISCOVERY"
                            : "ESCALATE";
                ingestionContext.source = slotDecision.reason;
                if (process.env.CADU_DEBUG === "1") {
                    console.log(`[SLOT_COLLECTOR] active=false reason=policy_fast_path intent=${slotDecision.profileIntent}`);
                }
            } else if (process.env.CADU_DEBUG === "1") {
                console.log(`[SLOT_COLLECTOR] active=false reason=${slotDecision.reason}`);
            }

            let finalReplyText = (slotDecision.shouldCollect || slotDecision.reason === "policy_fast_path")
                ? (ingestionContext.responseText || "")
                : ensureNextStep(ingestionContext.responseText || "", {
                    intent: ingestionContext.detectedIntent,
                    effective_intent: ingestionContext.effectiveIntent,
                    state: (conv != null ? (conv as any).currentState : null) ?? "unknown",
                    action: ingestionContext.action ?? "respond",
                    is_chat_only: true,
                });
            const claimGuard = sanitizeUnsafeClaims(finalReplyText, {
                source: ingestionContext.source,
                isChatOnly: true,
                action: ingestionContext.action,
            });
            finalReplyText = claimGuard.text;
            if (process.env.CADU_DEBUG === "1") {
                console.log(`[CLAIM_GUARD] applied=${claimGuard.applied} source=${ingestionContext.source || "unknown"} reasons=${claimGuard.reasons.join(",") || "none"}`);
            }
            // Removed automatic "Vou seguir com isso agora" suffix unconditionally here.
            ingestionContext.responseText = finalReplyText;
            responseData.replyText = finalReplyText;

            // RALPH LOGGING â€” fire-and-forget, never blocks response, opt-in via RALPH_LOGGING=1
            if (process.env.RALPH_LOGGING === "1") {
                appendRalphLog({
                    input: ingestionContext.userMessage ?? "",
                    response: finalReplyText,
                    intent: ingestionContext.detectedIntent ?? null,
                    action: String(ingestionContext.action ?? ""),
                    metadata: {
                        state: ingestionContext.state ?? null,
                        slots: ingestionContext.slots ?? {},
                        source: ingestionContext.source ?? null,
                        phoneHash: hashPhone(ingestionContext.msg?.from ?? ""),
                    },
                    timestamp: new Date().toISOString(),
                }).catch(() => { }); // never throws
            }

            const phone = ingestionContext.msg?.from;
            if (phone) {
                const action = String(ingestionContext.action || "").toUpperCase();
                const isHuman = action === "ESCALATE" || action === "ESCALATE_HUMAN";
                saveToOutbox(phone, {
                    conversationId: conv?.id ?? `chatonly_conv_${phone}`,
                    content: finalReplyText,
                    timestamp: Date.now(),
                    id: `chatonly_out_${Date.now()}`,
                    status: isHuman ? "PENDING_HUMAN" : "BOT",
                    state: (conv != null ? (conv as any).currentState : null) ?? "unknown",
                });
            }
            responseData.telemetry = {
                conversationId: conv?.id ?? "unknown",
                customerPhone: ingestionContext.msg?.from ?? "unknown",
                intent: ingestionContext.detectedIntent ?? "UNKNOWN",
                // currentState may throw if conversation is null; guard explicitly
                state: (conv != null ? (conv as any).currentState : null) ?? "unknown",
                action: ingestionContext.action ?? "respond",
            };
            if (ingestionContext.source) {
                responseData.telemetry.source = ingestionContext.source;
            }
            responseData.telemetry.slotProfileIntent = slotDecision.profileIntent;
            responseData.telemetry.missingSlots = slotDecision.missingSlots;
            responseData.telemetry.knownEntities = maskKnownEntitiesForTelemetry(slotDecision.known);
            responseData.telemetry.slotSource = slotDecision.slotSource;
            responseData.telemetry.slotReason = slotDecision.reason;
            responseData.telemetry.claimGuardApplied = claimGuard.applied;
            responseData.telemetry.claimGuardReasons = claimGuard.reasons;
        }
        console.log(`[WEBHOOK] [CHAT_ONLY] Returning telemetry in response`);
    }

    // Log webhook exit
    logWebhookEvent({
        conversationId,
        storeId,
        event: "EXIT",
        message: "Webhook processed, response sent",
        processingTimeMs: Date.now() - requestStartTime,
        result: "success",
    });

    return NextResponse.json(responseData, { status: 200 });
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ INGESTION (Sync) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// Retorna contexto se deve processar, ou null se ignorar/bloquear
async function ingestMessage(body: any) {
    const value = body.entry?.[0]?.changes?.[0]?.value;

    // A. Filtrar Status Updates (Lido, Entregue)
    if (value?.statuses) {
        const statuses = value.statuses;
        const status = statuses[0];
        console.log(`[WEBHOOK] Ã°Å¸â€œÂ¶ Status Update: ${status?.status} (ID: ${status?.id})`);
        return null;
    }

    // B. Extrair Mensagem
    const msg = extractMessage(body);
    if (!msg) {
        console.log("[WEBHOOK] Ã¢â€žÂ¹Ã¯Â¸Â Ignorado: NÃƒÂ£o ÃƒÂ© mensagem de texto/ÃƒÂ¡udio suportada");
        return null;
    }

    // C. Immediate Feedback
    markMessageAsRead(msg.waMessageId).catch(() => { });

    // C. CHAT_ONLY MODE: Simula store, customer e conversation em memÃƒÂ³ria
    const chatOnly = isChatOnlyMode();
    if (chatOnly) {
        console.log("[WEBHOOK] [CHAT_ONLY] Modo sem banco - simulando dados");
        const conversationId = `chatonly_conv_${msg.from}`;
        saveTranscriptMessage({
            conversationId,
            id: msg.waMessageId || `in_${Date.now()}`,
            direction: "inbound",
            content: msg.text,
            timestamp: Date.now(),
            metadata: { source: "webhook_inbound" },
        });
        const mockStore = {
            id: "chatonly_store",
            phoneNumberId: msg.phoneNumberId,
            name: "Chat Only Store",
        };
        return {
            msg,
            store: mockStore,
            customer: { id: `chatonly_cust_${msg.from}`, phone: msg.from },
            conversation: { id: conversationId, currentState: "idle" },
            newConversationCreated: true,
        };
    }

    // D. Resolver Store com fallback defensivo para schema drift
    let store;
    try {
        store = await prisma.store.findUnique({
            where: { phoneNumberId: msg.phoneNumberId },
        });
    } catch (schemaErr: any) {
        // Erro de schema (ex: column does not exist)
        const errMsg = String(schemaErr?.message || schemaErr || "");
        if (errMsg.includes("does not exist") || errMsg.includes("P2022")) {
            console.error(`[WEBHOOK] Ã¢ÂÅ’ Schema drift detectado: ${errMsg}`);

            // Em CHAT_ONLY, gravar erro na outbox para o terminal mostrar
            const chatOnly = isChatOnlyMode();
            if (chatOnly) {
                try {
                    const { saveToOutbox } = await import("@/lib/chat-outbox");
                    saveToOutbox(msg.from, {
                        conversationId: `error_${Date.now()}`,
                        content: `[ERRO CHAT_ONLY] Schema desatualizado. Rode: npm run prisma:sandbox:push`,
                        timestamp: Date.now(),
                        id: `err_${Date.now()}`,
                        status: "BOT",
                        state: "error",
                    });
                    console.log("[OUTBOX] erro de schema gravado para diagnÃƒÂ³stico");
                } catch { /* outbox pode nÃƒÂ£o estar disponÃƒÂ­vel */ }
            }

            return null;
        }
        throw schemaErr; // Re-lanÃƒÂ§a outros erros
    }

    if (!store) {
        console.warn(`[WEBHOOK] Ã¢ÂÅ’ Store nÃƒÂ£o encontrada: ${msg.phoneNumberId}`);
        return null;
    }

    // E. (REMOVED) Pre-Flight Check: CAUSAVA RACE CONDITION.
    // Vamos confiar APENAS no UNIQUE CONSTRAINT do banco no passo G.

    // F. Upsert Dados Relacionados (Customer -> Conversation)
    // CHAT_ONLY mode: skip DB operations
    if (chatOnly) {
        // Already handled above - this should never be reached
        return null;
    }
    let customer: any = { id: `chatonly_${Date.now()}`, storeId: store.id, phone: msg.from };
    // Fallback para conversation em modo CHAT_ONLY (evita null reference no catch)
    let conversation: any = chatOnly
        ? { id: `chatonly_conv_${msg.from}`, currentState: "idle", customerId: customer.id, storeId: store.id }
        : null;
    let newConversationCreated = false;

    try {
        customer = await prisma.customer.upsert({
            where: { storeId_phone: { storeId: store.id, phone: msg.from } },
            create: { storeId: store.id, phone: msg.from },
            update: {},
        });

        // Race Conditions na criaÃƒÂ§ÃƒÂ£o de conversa
        conversation = await prisma.conversation.findFirst({
            where: {
                storeId: store.id,
                customerId: customer.id,
                status: { in: ["open", "PENDING_HUMAN"] },
            },
            orderBy: { startedAt: "desc" },
        });

        if (!conversation) {
            conversation = await prisma.conversation.create({
                data: {
                    storeId: store.id,
                    customerId: customer.id,
                    status: "open",
                    currentState: "greeting",
                    slots: {},
                },
            });
            newConversationCreated = true;
            debugLog(`New conversation created: ${conversation.id}`);
        }
    } catch (dbError: any) {
        if (chatOnly) {
            console.log("[WEBHOOK] [CHAT_ONLY] DB unavailable, using in-memory fallback");
            // Criar objetos mÃƒÂ­nimos em memÃƒÂ³ria
            customer = { id: `chatonly_cust_${Date.now()}`, storeId: store.id, phone: msg.from };
            conversation = {
                id: `chatonly_conv_${msg.from}`,
                storeId: store.id,
                customerId: customer.id,
                status: "open",
                currentState: "greeting",
                slots: {},
                startedAt: new Date(),
            };
            newConversationCreated = true;
        } else {
            throw dbError;
        }
    }

    // G. PersistÃƒÂªncia da Mensagem (Inbound) - FAIL FAST (Physical DB Check)
    try {
        await prisma.message.create({
            data: {
                storeId: store.id,
                conversationId: conversation.id,
                direction: "inbound",
                content: msg.text,
                waMessageId: msg.waMessageId,
            },
        });
        console.log(`[WEBHOOK] Ã¢Å“â€¦ Mensagem persistida: "${msg.text}"`);
    } catch (e: any) {
        // IDEMPOTÃƒÅ NCIA RIGOROSA (NÃƒÂVEL FÃƒÂSICO)
        if (e.code === 'P2002') {
            console.log(`[WEBHOOK] Ã°Å¸â€ºâ€˜ GHOST MESSAGE BLOCKED (ID: ${msg.waMessageId})`);
            debugLog(`[GHOST BLOCKED] Duplicate WAMID: ${msg.waMessageId}`);

            // CLEANUP: Se criamos conversa nova para este duplicado, deletamos
            if (newConversationCreated) {
                await prisma.conversation.delete({ where: { id: conversation.id } }).catch(() => { });
                console.log(`[WEBHOOK] Ã°Å¸Â§Â¹ Orphan conversation cleaned up.`);
            }

            return null; // Bloqueia processamento
        }

        // CHAT_ONLY FALLBACK: Se DB falhar por outro motivo, continua
        if (chatOnly) {
            console.log(`[WEBHOOK] [CHAT_ONLY] DB error on message create: ${e.message}`);
        } else {
            throw e;
        }
    }

    if (chatOnly) {
        saveTranscriptMessage({
            conversationId: conversation.id,
            id: msg.waMessageId || `in_${Date.now()}`,
            direction: "inbound",
            content: msg.text,
            timestamp: Date.now(),
            metadata: { source: "webhook_inbound" },
        });
    }

    // Reset Command Hook
    if (msg.text.toLowerCase().trim() === "reset") {
        try {
            await prisma.conversation.update({
                where: { id: conversation.id },
                data: {
                    status: "open",
                    currentState: "greeting",
                    slots: {},
                    stallCount: 0,
                    frustrationLevel: 0,
                    messageCount: 0,
                    processingUntil: null
                }
            });
        } catch (dbError: any) {
            if (!chatOnly) throw dbError;
            console.log("[WEBHOOK] [CHAT_ONLY] Reset failed, continuing anyway");
        }
        await sendTextMessage(msg.from, "Ã°Å¸â€â€ž Conversa resetada.");
        return null;
    }

    return { store, customer, conversation, msg };
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ WORKER (Async Background) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
async function processAI(ctx: any) {
    const { store, conversation, msg } = ctx;

    // CHAT_ONLY mode: desativa telemetria para reduzir latÃƒÂªncia e ignora locks de banco
    const chatOnly = isChatOnlyMode();

    // 1. Acquire Lock
    let lockAcquired = true;
    if (!chatOnly) {
        lockAcquired = await acquireLock(conversation.id);
    }

    if (!lockAcquired) {
        console.log(`[WORKER] Ã°Å¸â€â€™ Lock ocupado. Mensagem salva mas nÃƒÂ£o processada (Debounce): ${msg.waMessageId}`);
        return;
    }

    const startTime = Date.now();

    // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Telemetry identifiers (1 per processing cycle) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    const requestId = randomUUID();
    const customerIdHash = hashPhone(msg.from); // LGPD Ã¢â‚¬â€ never log msg.from directly
    const telemetryBase = {
        storeId: store.id,
        conversationId: conversation.id,
        customerId: customerIdHash,
        requestId,
    };

    // CHAT_ONLY: Result captured inside try block for safe return after finally
    let _chatOnlyResult: { text: string; intent: string; state: string; action?: string; source?: string } | undefined;

    // Telemetry and other declarations...
    try {
        // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ HUMAN LOOP GATE: Verifica se conversa estÃƒÂ¡ travada em modo HUMAN Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
        const isLocked = await isHumanLocked(conversation.id);
        if (isLocked) {
            console.log(`[HANDOFF] conversation locked (HUMAN), ignoring bot reply for ${conversation.id}`);
            return;
        }

        if (conversation.status === "PENDING_HUMAN") {
            console.log(`[WORKER] Ã°Å¸â€â€¡ Ignorando (Humano pendente)`);
            return;
        }

        // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ UX: Typing indicator (fire-and-forget, nunca bloqueia pipeline) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
        // Dura 25s ou atÃƒÂ© a prÃƒÂ³xima mensagem ser enviada Ã¢â‚¬â€ mais que suficiente para o LLM
        sendSenderAction(msg.from, "typing_on").catch(() => { });

        await incrementMessageCount(conversation.id);

        const context = await buildContext({
            conversationId: conversation.id,
            userMessage: msg.text,
            storeId: store.id,
            storeName: store.name || "Loja",
            customerName: ctx.customer.name || undefined,
            currentWaMessageId: msg.waMessageId,
            customerPhone: msg.from,
        });

        // Persistir nome do cliente quando vier claro na mensagem (ajuda SAC a nao repetir coleta)
        if (!ctx.customer.name && typeof context.slots.customerName === "string" && context.slots.customerName.trim().length >= 3) {
            prisma.customer.update({
                where: { id: ctx.customer.id },
                data: { name: context.slots.customerName.trim() },
            }).catch(() => { });
            ctx.customer.name = context.slots.customerName.trim();
        }

        // Log de classify em CHAT_ONLY
        if (chatOnly) {
            console.log(`[CLASSIFY] intent=${context.detectedIntent} state=${context.currentState} slots=${JSON.stringify(context.slots).substring(0, 50)}`);
        }

        if (detectFrustration(msg.text, context.conversationHistory)) {
            await incrementFrustration(conversation.id);
        }

        const transition = determineNextState(
            context.currentState, context.slots, context.detectedIntent,
            context.stallCount, context.frustrationLevel, context.messageCount
        );

        if (transition.nextState) {
            await transitionTo(conversation.id, transition.nextState, transition.reason, store.id);
            context.currentState = transition.nextState!;
            // Log de state em CHAT_ONLY
            if (chatOnly) {
                console.log(`[STATE] transition ${context.currentState} <- ${transition.reason}`);
            }
        }

        if (context.slotExtraction.hasNewData) {
            await updateSlots(conversation.id, context.slotExtraction.extracted, context.slots);
            await resetStall(conversation.id);
        } else {
            await incrementStall(conversation.id);
        }

        // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ FASE 2: AUTO-ROUTING SAC Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
        // Roteia conversa baseado no intent detectado pelo buildContext
        // Nota: uses raw SQL pois prisma client ainda nÃƒÂ£o foi regenerado com conversationType
        if (!chatOnly) {
            const sacIntents = ["SUPPORT", "HANDOFF", "SAC_TROCA", "SAC_ATRASO", "SAC_RETIRADA", "SAC_REEMBOLSO"];
            const targetType =
                context.currentState === "support_sac" || sacIntents.includes(context.detectedIntent)
                    ? "sac"
                    : "sales";

            const rows = await prisma.$queryRaw<{ conversation_type: string }[]>`
                SELECT conversation_type FROM conversations WHERE id = ${conversation.id} LIMIT 1
            `;

            if (rows[0] && rows[0].conversation_type !== targetType) {
                await prisma.$executeRaw`
                    UPDATE conversations SET conversation_type = ${targetType} WHERE id = ${conversation.id}
                `;
                console.log(`[WORKER] Ã°Å¸Å¡Â¦ Conversa ${conversation.id} roteada para: ${targetType} (intent: ${context.detectedIntent})`);
            }
        }
        // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ FIM FASE 2 Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

        // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ TELEMETRY: Momento 1 Ã¢â‚¬â€ Eventos de estoque (pÃƒÂ³s buildContext) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
        const hasProductSignal = Boolean(
            context.slots.product || context.slots.usage ||
            context.slots.marca || context.slots.categoria || context.slots.size
        );

        // TELEMETRY: SKIP em CHAT_ONLY para reduzir latÃƒÂªncia
        if (!chatOnly && context.detectedIntent === "SALES" && hasProductSignal) {
            // A: O que o cliente queria buscar
            emitTelemetry({
                ...telemetryBase,
                eventType: "product_interest",
                payload: {
                    ...telemetryBase,
                    channel: "whatsapp",
                    waMessageId: msg.waMessageId,
                    query_original: msg.text,
                    marca: context.slots.marca,
                    categoria: context.slots.categoria,
                    genero: context.slots.genero,
                    tamanho: context.slots.size,
                    uso: context.slots.usage,
                    goal: context.slots.goal,
                },
            });

            // B: ParÃƒÂ¢metros que o motor de busca recebeu
            emitTelemetry({
                ...telemetryBase,
                eventType: "stock_check",
                payload: {
                    ...telemetryBase,
                    channel: "whatsapp",
                    waMessageId: msg.waMessageId,
                    query_normalizada: context.slots.product ?? context.slots.usage ?? msg.text,
                    engine: "findRelevantProducts",
                    slots_snapshot: {
                        marca: context.slots.marca,
                        categoria: context.slots.categoria,
                        tamanho: context.slots.size,
                        uso: context.slots.usage,
                    },
                },
            });

            // C: Resultado do motor de busca
            const stockStatus = context.availableProducts.length > 0 ? "found" : "not_found";
            emitTelemetry({
                ...telemetryBase,
                eventType: "stock_result",
                payload: {
                    ...telemetryBase,
                    channel: "whatsapp",
                    waMessageId: msg.waMessageId,
                    status: stockStatus,
                    sku_encontrado: context.availableProducts[0]?.description,
                    quantidade_disponivel: context.availableProducts[0]?.quantity,
                    similares: context.availableProducts.slice(1).map(p => p.description),
                    motivo_falha: stockStatus === "not_found" ? "sem_estoque" : undefined,
                },
            });
        }

        // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ HUMAN LOOP: Verifica se deve transferir para humano Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
        // Esta verificaÃƒÂ§ÃƒÂ£o acontece APÃƒâ€œS a checagem de estoque (context.stockResult)
        //
        // PRIORIDADES:
        // 1. Se cliente quer reserva (lead quente) Ã¢â€ â€™ handoff independente do estoque
        // 2. Se estoque indisponÃƒÂ­vel + alta intenÃƒÂ§ÃƒÂ£o Ã¢â€ â€™ handoff
        // 3. Caso contrÃƒÂ¡rio Ã¢â€ â€™ continua fluxo normal
        {
            const sessionData = {
                intent: context.detectedIntent,
                slots: context.slots,
                botStatus: 'BOT' as 'BOT' | 'HUMAN',
                alertSent: null,
            };

            const handoffDecision = evaluateHandoff(
                sessionData,
                context.stockResult,
                msg.text,
                0.8 // Higher intent score since we're in SALES flow with product info
            );

            if (handoffDecision.shouldHandoff) {
                const reason = handoffDecision.reason as HandoffReason;
                console.log(`[humanLoop] handoff { reason: ${reason}, product: ${context.slots.product}, clientId: ${msg.from}, until: end_of_day }`);
                if (chatOnly) console.log(`[ACTION] handoff_sales reason=${reason}`);

                // 1. Envia alerta para o grupo de vendas (com reason)
                const salesGroupId = humanLoopConfig.groups.sales;
                if (salesGroupId) {
                    const alertMessage = buildSaleAlertMessage(context.slots, msg.from, reason);
                    const alertResult = await sendTextMessage(salesGroupId, alertMessage);
                    console.log(`[humanLoop] Alert sent to sales group: ${alertResult.success}`);

                    // 2. Envia mensagem de transferÃƒÂªncia para o cliente
                    const handoffMessage = buildHandoffMessage();
                    const handoffSendResult = await sendTextMessage(msg.from, handoffMessage);
                    const handoffMessageId = handoffSendResult.data?.messages?.[0]?.id || `handoff_${Date.now()}`;
                    if (chatOnly) {
                        console.log(`[RESPONSE] "${handoffMessage.substring(0, 50)}..." source=human_loop_sales`);
                        saveToOutbox(msg.from, {
                            conversationId: conversation.id,
                            content: `[ESCALADO] ${handoffMessage}`,
                            timestamp: Date.now(),
                            id: handoffMessageId,
                            status: "PENDING_HUMAN",
                            state: "handoff_sales",
                        });
                        console.log(`[OUTBOUND] handoff_sales to=${msg.from} conv=${conversation.id} success=${handoffSendResult.success}`);
                    }
                    try {
                        await prisma.message.create({
                            data: {
                                storeId: store.id,
                                conversationId: conversation.id,
                                direction: "outbound",
                                content: handoffMessage,
                                waMessageId: handoffMessageId,
                                metadata: { handoff: true, queue: "sales", reason },
                            },
                        });
                    } catch (err) {
                        const msgErr = String((err as any)?.message || err || "");
                        if (msgErr.includes("disk I/O error")) {
                            console.warn(chatOnly ? "[OUTBOX] [WARN] disk I/O on sales handoff persist (ignored)" : "[WORKER] disk I/O on sales handoff persist");
                        } else {
                            throw err;
                        }
                    }

                    // 3. Trava a conversa em modo HUMAN atÃƒÂ© fim do dia
                    await lockToHuman(conversation.id, {
                        type: 'SALE',
                        messageId: alertResult.data?.messages?.[0]?.id || `alert_${Date.now()}`,
                        groupId: salesGroupId,
                    });

                    // 4. NÃƒÂ£o chama o orchestrator - retorna imediatamente
                    // O humano owns a conversa pelo resto do dia
                    console.log(`[humanLoop] Ã¢Å“â€¦ Handoff completo para ${conversation.id}`);
                    if (chatOnly) {
                        _chatOnlyResult = {
                            text: handoffMessage,
                            intent: "HANDOFF",
                            state: "support_sac",
                            action: "ESCALATE",
                            source: "human_loop_sales",
                        };
                        return _chatOnlyResult;
                    }
                    return;
                } else {
                    console.warn(`[humanLoop] WPP_GROUP_SALES_ID nÃƒÂ£o configurado, pulando handoff`);
                }
            }
        }

        // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ SAC FLOW: Coleta mÃƒÂ­nimo de dados antes do handoff Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
        // Se intent ÃƒÂ© SAC, verifica se dados mÃƒÂ­nimos estÃƒÂ£o completos
        const sacIntents = ['SAC_ATRASO', 'SAC_TROCA', 'SAC_REEMBOLSO', 'SAC_RETIRADA', 'SUPPORT'];
        const isSacConversation = sacIntents.includes(context.detectedIntent) || context.currentState === "support_sac";
        const bypassSacMinimumForInfo = shouldBypassSacMinimumForPolicyInfo(
            context.detectedIntent,
            context.currentState,
            msg.text
        );
        if (isSacConversation && bypassSacMinimumForInfo) {
            console.log(`[SAC] Bypass sac_minimum: consulta de politica/info detectada (intent=${context.detectedIntent})`);
        }
        if (isSacConversation && !bypassSacMinimumForInfo) {
            const effectiveCustomerName = (ctx.customer.name || context.slots.customerName || "").trim() || undefined;
            const effectiveEmail = String(context.slots.email || "").trim() || undefined;
            const sacSlotsForMinimum = {
                ...context.slots,
                // Se jÃƒÂ¡ estamos no fluxo SAC, o problema-base jÃƒÂ¡ foi descrito antes.
                statusPedido: context.slots.statusPedido || "informado",
            };
            const missingData = getMissingSacData(effectiveCustomerName, sacSlotsForMinimum, { email: effectiveEmail });

            if (hasAnyMissingSacData(effectiveCustomerName, sacSlotsForMinimum, { email: effectiveEmail })) {
                // Dados SAC incompletos - pergunta TODOS os campos de uma vez
                // NÃƒÆ’O envia alerta, NÃƒÆ’O faz handoff
                // Passa slots para diferenciar loja fÃƒÂ­sica vs site
                const sacQuestion = buildSacQuestion(missingData, context.slots);
                console.log(`[SAC] Pedindo dados: ${JSON.stringify(missingData)}`);
                if (chatOnly) {
                    console.log("[ACTION] request_order_data");
                    console.log(`[RESPONSE] "${sacQuestion.substring(0, 50)}..." source=sac_minimum`);
                }

                // Envia a pergunta ao cliente
                const sacQuestionSend = await sendTextMessage(msg.from, sacQuestion);
                const sacQuestionMessageId = sacQuestionSend.data?.messages?.[0]?.id || `sac_q_${Date.now()}`;
                if (chatOnly) {
                    saveToOutbox(msg.from, {
                        conversationId: conversation.id,
                        content: sacQuestion,
                        timestamp: Date.now(),
                        id: sacQuestionMessageId,
                        status: "BOT",
                        state: "support_sac",
                    });
                    console.log(`[OUTBOUND] sac_question to=${msg.from} conv=${conversation.id} success=${sacQuestionSend.success}`);
                }

                // Persiste a mensagem de resposta (SQLite em WSL/OneDrive pode falhar transitoriamente)
                const sacOutboundData = {
                    storeId: store.id,
                    conversationId: conversation.id,
                    direction: 'outbound',
                    content: sacQuestion,
                    waMessageId: sacQuestionMessageId,
                    metadata: {
                        intent: context.detectedIntent,
                        missingName: missingData.missingName,
                        missingOrderOrEmail: missingData.missingOrderOrEmail,
                        missingProblem: missingData.missingProblem,
                    },
                };
                try {
                    await prisma.message.create({ data: sacOutboundData });
                } catch (err) {
                    const msgErr = String((err as any)?.message || err || "");
                    if (msgErr.includes("disk I/O error")) {
                        console.warn("[SAC] Ã¢Å¡Â Ã¯Â¸Â SQLite disk I/O error ao salvar pergunta SAC. Retry em 150ms...");
                        await new Promise((r) => setTimeout(r, 150));
                        await prisma.message.create({ data: sacOutboundData });
                    } else {
                        throw err;
                    }
                }

                // Retorna sem chamar orchestrator -bot fez uma pergunta com todos os dados
                console.log(`[SAC] Dados incompletos, pergunta enviada. Retornando.`);
                if (chatOnly) {
                    _chatOnlyResult = {
                        text: sacQuestion,
                        intent: context.detectedIntent,
                        state: "support_sac",
                        action: "REQUEST_ORDER_DATA",
                        source: "sac_minimum",
                    };
                    return _chatOnlyResult;
                }
                return;
            } else {
                // Dados mÃƒÂ­nimos completos - faz handoff para SAC
                const sacGroupId = humanLoopConfig.groups.sac;
                if (sacGroupId) {
                    console.log(`[SAC] Dados mÃƒÂ­nimos completos. Enviando alerta para grupo SAC.`);
                    if (chatOnly) console.log("[ACTION] handoff_sac");

                    // 1. Envia alerta para o grupo SAC
                    const sacAlertMessage = buildSACAlertMessage(
                        context.slots,
                        context.detectedIntent,
                        effectiveCustomerName,
                        msg.from,
                        effectiveEmail
                    );
                    const alertResult = await sendTextMessage(sacGroupId, sacAlertMessage);
                    console.log(`[SAC] Alert sent to SAC group: ${alertResult.success}`);

                    // 2. Envia mensagem de transferÃƒÂªncia para o cliente
                    const handoffMessage = "Vou te direcionar para nosso time de atendimento, e eles vao priorizar seu caso por aqui.";
                    const sacHandoffSend = await sendTextMessage(msg.from, handoffMessage);
                    const sacHandoffMessageId = sacHandoffSend.data?.messages?.[0]?.id || `sac_handoff_${Date.now()}`;
                    if (chatOnly) {
                        console.log(`[RESPONSE] "${handoffMessage.substring(0, 50)}..." source=human_loop_sac`);
                        saveToOutbox(msg.from, {
                            conversationId: conversation.id,
                            content: `[ESCALADO] ${handoffMessage}`,
                            timestamp: Date.now(),
                            id: sacHandoffMessageId,
                            status: "PENDING_HUMAN",
                            state: "handoff_sac",
                        });
                        console.log(`[OUTBOUND] handoff_sac to=${msg.from} conv=${conversation.id} success=${sacHandoffSend.success}`);
                    }

                    // 3. Trava a conversa em modo HUMAN atÃƒÂ© fim do dia
                    await lockToHuman(conversation.id, {
                        type: 'SAC',
                        messageId: alertResult.data?.messages?.[0]?.id || `sac_alert_${Date.now()}`,
                        groupId: sacGroupId,
                    });

                    // 4. Persiste mensagem de handoff
                    try {
                        await prisma.message.create({
                            data: {
                                storeId: store.id,
                                conversationId: conversation.id,
                                direction: 'outbound',
                                content: handoffMessage,
                                waMessageId: sacHandoffMessageId,
                                metadata: { intent: context.detectedIntent, handoff: true },
                            },
                        });
                    } catch (err) {
                        const msgErr = String((err as any)?.message || err || "");
                        if (msgErr.includes("disk I/O error")) {
                            console.warn(chatOnly ? "[OUTBOX] [WARN] disk I/O on sac handoff persist (ignored)" : "[SAC] disk I/O on handoff persist");
                        } else {
                            throw err;
                        }
                    }

                    console.log(`[SAC] Ã¢Å“â€¦ Handoff completo para ${conversation.id}`);
                    if (chatOnly) {
                        _chatOnlyResult = {
                            text: handoffMessage,
                            intent: "HANDOFF",
                            state: "support_sac",
                            action: "ESCALATE",
                            source: "human_loop_sac",
                        };
                        return _chatOnlyResult;
                    }
                    return;
                } else {
                    console.warn(`[SAC] WPP_GROUP_SAC_ID nÃƒÂ£o configurado, pulando handoff SAC`);
                }
            }
        }

        // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ AGENT RUNTIME: Unificado - Template + LLM + Guardrails Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
        // O orchestrator legado faz: decideAction() -> template -> llm fallback -> guardrails
        console.time("orchestrator_call");
        const storeAddressText =
            (store as any).addressText ||
            "Av. Monsenhor Angelo Sampaio, nÃ‚Âº 100, Centro - Petrolina-PE, CEP 56304-920";
        const storeMapsUrl =
            (store as any).mapsUrl ||
            "https://maps.google.com/?q=Av.+Monsenhor+Angelo+Sampaio,+100,+Petrolina-PE";
        const responseSlots = {
            ...context.slots,
            addressText: storeAddressText,
            mapsUrl: storeMapsUrl,
        };

        // Setup AgentRuntime environment
        const runtimeEnv = getAgentRuntimeForConversation(msg.from);

        // Prepare context for the runtime
        const runtimeContext = {
            storeId: store.id,
            conversationId: conversation.id,
            customerId: ctx.customer.id,
            customerPhone: msg.from,
            state: {
                currentState: context.currentState,
                frustrationLevel: context.frustrationLevel,
                lastQuestionType: context.lastQuestionType,
                messageCount: context.messageCount,
                stallCount: context.stallCount,
                slots: responseSlots,
                botStatus: (context as any).botStatus || 'BOT',
                handoffUntil: (context as any).handoffUntil || null,
                alertSent: (context as any).alertSent || null,
            },
            slots: responseSlots,
            intent: context.detectedIntent,
            lastIntent: context.detectedIntent,
            lastAction: undefined,
            messages: context.conversationHistory.map((m, idx) => ({
                direction: m.role === 'user' ? 'inbound' as const : 'outbound' as const,
                content: m.content,
                timestamp: new Date(Date.now() - (context.conversationHistory.length - idx) * 60000),
            })),
            frustrationLevel: context.frustrationLevel,
            lastQuestionType: context.lastQuestionType,
            hasClosingSignal: context.currentState === 'closing' || hasLexicalClosingSignal(msg.text),
            stockResult: context.stockResult,
            customerName: context.customerName,
        };

        let orchestratorResult: OrchestratorResult;

        if (runtimeEnv === "langgraph") {
            const { LangGraphRuntime } = await import("@/lib/agent/runtime-langgraph");
            const runtime = new LangGraphRuntime();
            const langgraphStart = Date.now();
            const out = await runtime.generateReply({
                conversationId: runtimeContext.conversationId,
                storeId: runtimeContext.storeId,
                customerId: runtimeContext.customerId,
                customerPhone: runtimeContext.customerPhone,
                message: msg.text,
            });
            orchestratorResult = {
                text: out.reply,
                action: out.requiresHuman ? "ESCALATE" : "RESPOND",
                source: "langgraph",
                metadata: out.metadata as any,
            };
            const langgraphMeta = (out.metadata || {}) as Record<string, any>;
            logShadowAudit({
                conversationId: conversation.id,
                storeId: store.id,
                runtimeMode: process.env.AGENT_RUNTIME === "langgraph" ? "langgraph_active" : "langgraph_canary",
                result: "success",
                durationMs: Date.now() - langgraphStart,
                langgraphPreview: out.reply,
                langgraphActiveAgent: typeof langgraphMeta.activeAgent === "string" ? langgraphMeta.activeAgent : undefined,
                langgraphToolCallsCount: typeof langgraphMeta.toolCallsCount === "number" ? langgraphMeta.toolCallsCount : undefined,
                langgraphToolNames: Array.isArray(langgraphMeta.toolNames) ? langgraphMeta.toolNames : undefined,
                langgraphUsedMockTool: langgraphMeta.usedMockTool === true,
                langgraphLoopSignal: langgraphMeta.loopSignal === true,
                langgraphSummaryPresent: langgraphMeta.summaryPresent === true,
                langgraphSummaryLength: typeof langgraphMeta.summaryLength === "number" ? langgraphMeta.summaryLength : undefined,
            });
        } else if (runtimeEnv === "shadow") {
            // Shadow Mode: Run legacy sequentially and LangGraph asynchronously
            orchestratorResult = await orchestrate(msg.text, runtimeContext);

            // Fire and forget the LangGraph run for telemetry/comparison
            Promise.resolve().then(async () => {
                const startTime = Date.now();
                try {
                    const { LangGraphRuntime } = await import("@/lib/agent/runtime-langgraph");
                    const runtime = new LangGraphRuntime();
                    const shadowTimeoutMsRaw = Number(process.env.LANGGRAPH_SHADOW_TIMEOUT_MS || "");
                    const shadowTimeoutMs = Number.isFinite(shadowTimeoutMsRaw) && shadowTimeoutMsRaw > 0
                        ? shadowTimeoutMsRaw
                        : (chatOnly ? 15000 : 8000);

                    // Timebox configurÃƒÂ¡vel (CHAT_ONLY precisa mais folga para auditoria)
                    const timeoutPromise = new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error("LangGraph Shadow Mode Timeout")), shadowTimeoutMs)
                    );

                    const out = await Promise.race([
                        runtime.generateReply({
                            conversationId: runtimeContext.conversationId,
                            storeId: runtimeContext.storeId,
                            customerId: runtimeContext.customerId,
                            customerPhone: runtimeContext.customerPhone,
                            message: msg.text,
                        }),
                        timeoutPromise
                    ]);

                    const duration = Date.now() - startTime;
                    const langgraphMeta = (out.metadata || {}) as Record<string, any>;
                    const route = typeof langgraphMeta.activeAgent === "string" ? langgraphMeta.activeAgent : "unknown";
                    const tools = Array.isArray(langgraphMeta.toolNames) ? langgraphMeta.toolNames.join(",") : "";
                    console.log(`[SHADOW] route=${route} tools=[${tools}] mock=${langgraphMeta.usedMockTool === true} loop=${langgraphMeta.loopSignal === true}`);
                    logShadowAudit({
                        conversationId: conversation.id,
                        storeId: store.id,
                        runtimeMode: "shadow",
                        result: "success",
                        durationMs: duration,
                        legacyAction: orchestratorResult.action,
                        legacySource: orchestratorResult.source,
                        legacyPreview: orchestratorResult.text,
                        langgraphPreview: out.reply,
                        langgraphActiveAgent: typeof langgraphMeta.activeAgent === "string" ? langgraphMeta.activeAgent : undefined,
                        langgraphToolCallsCount: typeof langgraphMeta.toolCallsCount === "number" ? langgraphMeta.toolCallsCount : undefined,
                        langgraphToolNames: Array.isArray(langgraphMeta.toolNames) ? langgraphMeta.toolNames : undefined,
                        langgraphUsedMockTool: langgraphMeta.usedMockTool === true,
                        langgraphLoopSignal: langgraphMeta.loopSignal === true,
                        langgraphSummaryPresent: langgraphMeta.summaryPresent === true,
                        langgraphSummaryLength: typeof langgraphMeta.summaryLength === "number" ? langgraphMeta.summaryLength : undefined,
                    });
                    console.log(`[SHADOW] Ã¢Å¡Â¡ LangGraph executado em ${duration}ms!`);
                    console.log(`[SHADOW] Ã°Å¸â€œÂ Legacy: "${orchestratorResult.text.substring(0, 100).replace(/\n/g, ' ')}..."`);
                    console.log(`[SHADOW] Ã°Å¸Â¤â€“ LangGraph: "${out.reply.substring(0, 100).replace(/\n/g, ' ')}..."`);
                } catch (err: any) {
                    const shadowErrorMessage = String(err?.message || err || "unknown shadow error");
                    logShadowAudit({
                        conversationId: conversation.id,
                        storeId: store.id,
                        runtimeMode: "shadow",
                        result: "error",
                        durationMs: Date.now() - startTime,
                        timedOut: shadowErrorMessage.includes("Timeout"),
                        errorMessage: shadowErrorMessage,
                        legacyAction: orchestratorResult.action,
                        legacySource: orchestratorResult.source,
                        legacyPreview: orchestratorResult.text,
                    });
                    console.error("[SHADOW] Ã¢ÂÅ’ Erro/Timeout na execuÃƒÂ§ÃƒÂ£o LangGraph paralela:", err.message);
                }
            });
        } else {
            // Legacy Mode
            orchestratorResult = await orchestrate(msg.text, runtimeContext);
        }

        console.timeEnd("orchestrator_call");

        const decision: { reply_text: string; requires_human: boolean } = {
            reply_text: orchestratorResult.text,
            requires_human: orchestratorResult.action === "ESCALATE" ||
                (orchestratorResult.metadata?.guardrailChecks?.shouldEscalate === true),
        };
        if (chatOnly && orchestratorResult.action) console.log(`[ACTION] ${orchestratorResult.action}`);

        // CHAT_ONLY: Capture result now and return early Ã¢â‚¬â€ avoids all WA/DB side-effects below
        if (chatOnly) {
            const chatOnlyIntent = decision.requires_human ? "HANDOFF" : context.detectedIntent;
            return {
                text: decision.reply_text,
                intent: chatOnlyIntent,
                state: context.currentState,
                action: orchestratorResult.action,
                source: orchestratorResult.source ?? "legacy",
                slots: context.slots,
            };
        }

        // Override with transition decision if needed
        if (transition.shouldEscalate) decision.requires_human = true;

        // Log com tags padronizadas em CHAT_ONLY
        if (chatOnly) {
            console.log(`[RESPONSE] "${decision.reply_text.substring(0, 50)}..." source=${orchestratorResult.source}`);
        } else {
            console.log(`[WORKER] Ã°Å¸â€œÂ¤ Enviando: "${decision.reply_text}" (source: ${orchestratorResult.source})`);
        }

        const sendResult = await sendTextMessage(msg.from, decision.reply_text);

        let outMessageId = `out_${Date.now()}`;
        if (sendResult.success && sendResult.data?.messages?.[0]?.id) {
            outMessageId = sendResult.data.messages[0].id;
        }

        const outboundMessageData = {
            storeId: store.id,
            conversationId: conversation.id,
            direction: "outbound",
            content: decision.reply_text,
            waMessageId: outMessageId,
            metadata: {
                intent: decision.requires_human ? "HANDOFF" : context.detectedIntent,
                requires_human: decision.requires_human,
                state: context.currentState,
            },
        };

        // Ã°Å¸â€œÂ¦ Persistir no banco com retry para disk I/O error
        try {
            await prisma.message.create({ data: outboundMessageData });
        } catch (err) {
            const msgErr = String((err as any)?.message || err || "");
            if (msgErr.includes("disk I/O error")) {
                const warnMsg = chatOnly
                    ? "[OUTBOX] [WARN] disk I/O error, retrying..."
                    : "[WORKER] Ã¢Å¡Â Ã¯Â¸Â SQLite disk I/O error ao salvar outbound. Retry em 150ms...";
                console.warn(warnMsg);
                await new Promise((r) => setTimeout(r, 150));
                await prisma.message.create({ data: outboundMessageData });
            } else {
                throw err;
            }
        }

        // Ã°Å¸â€™Â¾ Salvar na outbox in-memory (CHAT_ONLY mode)
        if (chatOnly) {
            // Se hÃƒÂ¡ handoff para humano, mostra mensagem de escalaÃƒÂ§ÃƒÂ£o
            const outboxContent = decision.requires_human
                ? ((context.detectedIntent.startsWith("SAC_") || context.detectedIntent === "SUPPORT" || context.currentState === "support_sac")
                    ? "[ESCALADO] Sua solicitacao foi encaminhada para o time de atendimento. Alguem vai priorizar seu caso por aqui."
                    : "[ESCALADO] Sua solicitacao foi encaminhada para nossa equipe da loja. Aguarde contato.")
                : decision.reply_text;

            saveToOutbox(msg.from, {
                conversationId: conversation.id,
                content: outboxContent,
                timestamp: Date.now(),
                id: outMessageId,
                status: decision.requires_human ? "PENDING_HUMAN" : "BOT",
                state: context.currentState,
            });
        }

        // Ã°Å¸â€œÂ¤ Log de outbound
        if (chatOnly) {
            console.log(`[OUTBOUND] sent to=${msg.from} conv=${conversation.id} success=${sendResult.success}`);
        }

        if (decision.requires_human) {
            // Gerar Warm Handoff
            const handoffContext: HandoffContext = {
                intent: context.detectedIntent,
                slots: context.slots,
                frustrationLevel: context.frustrationLevel,
                customerName: context.customerName,
                orderId: context.slots.orderId,
                conversationId: conversation.id,
                storeId: store.id,
                messageCount: context.messageCount,
                stallCount: context.stallCount,
                conversationHistory: context.conversationHistory,
            };

            const handoff = generateWarmHandoffSummary(handoffContext);
            const slaDeadline = calculateSLADeadline(handoff.queue, handoff.priority);

            // Criar Ticket de escalonamento (skip in CHAT_ONLY Ã¢â‚¬â€ no real DB conversation)
            const ticket = chatOnly ? { id: `chatonly_ticket_${Date.now()}` } : await prisma.ticket.create({
                data: {
                    storeId: store.id,
                    customerId: ctx.customer.id,
                    conversationId: conversation.id,
                    type: handoff.queue === "SALES_RESERVE" ? "reserva" : "sac",
                    queueType: handoff.queue,
                    priority: handoff.priority,
                    warmHandoffSummary: handoff.summary,
                    status: "open",
                    escalatedAt: new Date(),
                    slaDeadline: slaDeadline,
                },
            });

            // Atualizar Conversation (skip in CHAT_ONLY)
            if (!chatOnly) {
                await prisma.conversation.update({
                    where: { id: conversation.id },
                    data: {
                        status: "PENDING_HUMAN",
                        currentQueue: handoff.queue,
                    },
                });
            }

            // Log estruturado
            console.log(`[WORKER] Ã°Å¸Å¡Â¨ Handoff criado:`, {
                ticketId: ticket.id,
                queue: handoff.queue,
                priority: handoff.priority,
                slaMinutes: handoff.slaMinutes,
            });

            // Emitir telemetria de escalonamento (SKIP em CHAT_ONLY)
            if (!chatOnly) {
                emitTelemetry({
                    ...telemetryBase,
                    eventType: "sac_case",
                    payload: {
                        ticket_id: ticket.id,
                        queue_type: handoff.queue,
                        priority: handoff.priority,
                        frustration_level: context.frustrationLevel,
                        intent: context.detectedIntent,
                        sla_deadline: slaDeadline.toISOString(),
                    },
                });
            }
        } else {
            console.log(`[WORKER] Ã¢Å“â€¦ Fim. t=${Date.now() - startTime}ms`);
        }

        // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ RESERVE CONFIRMATION TRACKING Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
        // Se Cadu perguntou se quer confirmar/reservar, marca a conversa.
        // Assim, na prÃƒÂ³xima mensagem do cliente, saberemos que uma resposta
        // "sim" ÃƒÂ© confirmaÃƒÂ§ÃƒÂ£o de reserva (nÃƒÂ£o resposta a outra pergunta).
        {
            const replyLower = decision.reply_text.toLowerCase();
            const isAskingConfirmation =
                context.stockResult.requiresPhysicalCheck &&
                (replyLower.includes("confirmar no estoque") ||
                    replyLower.includes("confirme no estoque") ||
                    replyLower.includes("separe pra vocÃƒÂª") ||
                    replyLower.includes("separar pra vocÃƒÂª") ||
                    replyLower.includes("quer que a gente confirme") ||
                    replyLower.includes("quer que separe"));

            if (isAskingConfirmation) {
                prisma.conversation.update({
                    where: { id: conversation.id },
                    data: { lastQuestionType: "RESERVE_CONFIRMATION" },
                }).catch(err => console.error("[WORKER] lastQuestionType update error:", err));
            } else if (context.lastQuestionType === "RESERVE_CONFIRMATION") {
                // Limpa o flag apÃƒÂ³s qualquer outra resposta (evita trigger em mensagens futuras)
                prisma.conversation.update({
                    where: { id: conversation.id },
                    data: { lastQuestionType: null },
                }).catch(() => { });
            }
        }
        // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ FIM RESERVE CONFIRMATION Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

        // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ STOCK CHECK TICKET (fire-and-forget) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
        // Cria ticket de checagem fÃƒÂ­sica quando:
        // 1. Stock Agent indicou requiresPhysicalCheck
        // 2. Cliente confirmou com resposta afirmativa
        // 3. Cadu havia perguntado sobre confirmaÃƒÂ§ÃƒÂ£o (lastQuestionType = RESERVE_CONFIRMATION)
        {
            const sr = context.stockResult;
            const shouldCreateTicket =
                sr.requiresPhysicalCheck &&
                sr.missingSlots.length === 0 &&
                context.lastQuestionType === "RESERVE_CONFIRMATION" &&
                isAffirmativeResponse(msg.text);

            if (shouldCreateTicket) {
                const checkPayload = {
                    conversationId: conversation.id,
                    productDescription: sr.best?.description ?? context.slots.product,
                    size: sr.best?.size ?? context.slots.size,
                    quantity: 1,
                };

                fetch(`http://localhost:${process.env.PORT ?? 3000}/api/inventory/check`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(checkPayload),
                }).then(async r => {
                    const data = await r.json();
                    console.log(`[STOCK CHECK] Ã°Å¸Å½Å¸Ã¯Â¸Â Ticket criado: ${data.ticketNumber}`);
                }).catch(err => console.error("[STOCK CHECK] Ã¢ÂÅ’ Falha ao criar ticket:", err));
            }
        }
        // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ FIM STOCK CHECK Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

        // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ FASE 2: AUTO-LEARNING REMOVED Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
        // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ FIM FASE 2 Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

        // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ TELEMETRY: Momento 2 Ã¢â‚¬â€ Desfechos (pÃƒÂ³s envio) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
        // SKIP em CHAT_ONLY: telemetria adiciona latÃƒÂªncia desnecessÃƒÂ¡ria
        if (!chatOnly) {
            // D: Resultado da venda
            emitTelemetry({
                ...telemetryBase,
                eventType: "sale_outcome",
                payload: {
                    ...telemetryBase,
                    channel: "whatsapp",
                    waMessageId: msg.waMessageId,
                    status: decision.requires_human
                        ? "escalated"
                        : context.currentState === "closing"
                            ? "converted"
                            : "pending",
                    motivo: transition.reason,
                },
            });

            // E: Caso SAC (somente em escalaÃƒÂ§ÃƒÂµes por suporte/handoff)
            if (
                decision.requires_human &&
                (context.detectedIntent === "SUPPORT" || context.detectedIntent === "HANDOFF")
            ) {
                emitTelemetry({
                    ...telemetryBase,
                    eventType: "sac_case",
                    payload: {
                        ...telemetryBase,
                        channel: "whatsapp",
                        waMessageId: msg.waMessageId,
                        tipo: context.detectedIntent,
                        sentimento: context.frustrationLevel >= 2 ? "negativo" : "neutro",
                    },
                });
            }
        }

    } catch (error) {
        console.error("[WORKER] Ã¢ÂÅ’ Erro no processamento:", error);
        // Retorna erro em modo CHAT_ONLY
        if (chatOnly) {
            return { text: `[ERRO] ${error}`, intent: "ERROR", state: (conversation as any)?.currentState ?? "unknown" };
        }
    } finally {
        if (!chatOnly) {
            await releaseLock(conversation.id);
        }
    }

    // Retorna dados para CHAT_ONLY (fallback Ã¢â‚¬â€ normally returned early from inside try block)
    if (chatOnly) return _chatOnlyResult;
}



