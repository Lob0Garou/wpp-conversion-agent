import { prisma } from "./prisma";
import { loadState, type ConversationStateType } from "./state-manager";
import { classifyIntent, type Intent } from "./intent-classifier";
import { extractSlots } from "./slot-extractor";
import { findRelevantProducts } from "./products";
import { validateStockRequest, findAlternatives, createStockUnknownResult, type StockResult } from "./stock-agent";
import { hasActiveSnapshot, getActiveImportId } from "./inventory-snapshot";
import { getLastReply } from "./chat-outbox";

/**
 * Check if running in CHAT_ONLY mode (for Ralph Loop testing without DB)
 */
function isChatOnlyMode(): boolean {
    return process.env.CADU_MODE === "CHAT_ONLY";
}

export interface ConversationContext {
    // State
    currentState: ConversationStateType;
    conversationId: string;
    slots: Record<string, any>;
    detectedIntent: Intent;
    stallCount: number;
    frustrationLevel: number;
    messageCount: number;
    lastQuestionType: string | null;
    conversationHistory: { role: "user" | "assistant"; content: string }[];
    availableProducts: any[];
    stockResult: StockResult;
    slotExtraction: {
        hasNewData: boolean;
        extracted: Record<string, any>;
    };
    // User data
    userMessage: string;
    customerName?: string;
    storeName: string;
}

function getSafeHistoryLimit(): number {
    const raw = process.env.MAX_HISTORY_MESSAGES;
    const parsed = Number.parseInt(raw ?? "8", 10);
    if (!Number.isFinite(parsed)) return 8;
    return Math.min(Math.max(parsed, 1), 30);
}

export async function buildContext(params: {
    conversationId: string;
    userMessage: string;
    storeId: string;
    storeName: string;
    customerName?: string; // Fix 1: Accept customer name
    currentWaMessageId?: string; // Fix 3: Exclude current message
    customerPhone?: string;
}): Promise<ConversationContext> {
    const { conversationId, userMessage, storeId, storeName, customerName } = params;
    const chatOnly = isChatOnlyMode();

    // 1. Load current state
    const state = await loadState(conversationId);

    // 2. Fetch conversation history (last 8 messages = ~4 turnos completos)
    // 8 msgs são suficientes para SAC e vendas — reduz custo de tokens em ~33%
    const historyLimit = getSafeHistoryLimit();

    // CHAT_ONLY FALLBACK: Se DB falhar, retorna histórico vazio
    let lastMessages: any[] = [];
    try {
        lastMessages = await prisma.message.findMany({
            where: {
                conversationId,
                NOT: { waMessageId: params.currentWaMessageId ?? "" }, // Fix 3
            },
            orderBy: { timestamp: "desc" }, // Keep original orderBy
            take: historyLimit,
        });
    } catch (dbError: any) {
        if (chatOnly) {
            console.log("[CONTEXT] [CHAT_ONLY] DB unavailable, using empty history");
            lastMessages = [];
        } else {
            throw dbError; // Re-throw in production
        }
    }

    // Fix 4: Return structured roles
    const conversationHistory = lastMessages.reverse().map((m) => ({
        role: (m.direction === "inbound" ? "user" : "assistant") as "user" | "assistant",
        content: m.content,
    }));

    // CHAT_ONLY: sem DB, reaproveita ultima resposta da outbox como contexto minimo.
    if (chatOnly && conversationHistory.length === 0 && params.customerPhone) {
        const lastReply = getLastReply(params.customerPhone);
        if (lastReply?.content) {
            conversationHistory.push({
                role: "assistant",
                content: String(lastReply.content),
            });
        }
    }

    // 3. Extract slots from user history + current message
    const userHistoryText = conversationHistory
        .filter((m) => m.role === "user")
        .map((m) => m.content)
        .join("\n ");
    const textToExtract = userHistoryText ? `${userHistoryText}\n ${userMessage}` : userMessage;
    const slotExtraction = extractSlots(textToExtract, state.slots);

    // 4. Classify intent (context-aware)
    const detectedIntent = classifyIntent(
        userMessage,
        state.currentState,
        conversationHistory
    );

    // 5. RAG: Search relevant products (somente quando a intencao precisa)
    const mergedSlots = { ...state.slots, ...slotExtraction.extracted };
    const isInfoIntent = detectedIntent === "INFO" || detectedIntent.startsWith("INFO_");
    const isSacIntent = detectedIntent === "SUPPORT" || detectedIntent.startsWith("SAC_");
    const shouldSkipProductSearch = isInfoIntent || isSacIntent;

    let availableProducts: Awaited<ReturnType<typeof findRelevantProducts>> = [];
    let stockResult: StockResult;

    if (shouldSkipProductSearch) {
        stockResult = createStockUnknownResult();
    } else {
        // CHAT_ONLY FALLBACK: Skip stock check if DB unavailable
        let snapshotExists = false;
        try {
            snapshotExists = await hasActiveSnapshot(storeId);
        } catch (dbError: any) {
            if (chatOnly) {
                console.log("[CONTEXT] [CHAT_ONLY] Snapshot check failed, using unknown result");
                snapshotExists = false;
            } else {
                throw dbError;
            }
        }

        if (!snapshotExists) {
            console.log(`[CONTEXT] [WARN] Sem snapshot ativo para store ${storeId}`);
            stockResult = createStockUnknownResult();
        } else {
            let activeImportId: string | null = null;
            try {
                activeImportId = await getActiveImportId(storeId);
            } catch (dbError: any) {
                if (chatOnly) {
                    console.log("[CONTEXT] [CHAT_ONLY] Import ID lookup failed");
                    activeImportId = null;
                } else {
                    throw dbError;
                }
            }

            try {
                availableProducts = await findRelevantProducts(
                    userMessage,
                    storeId,
                    mergedSlots,
                    activeImportId ?? undefined
                );
            } catch (dbError: any) {
                if (chatOnly) {
                    availableProducts = [];
                } else {
                    throw dbError;
                }
            }

            stockResult = validateStockRequest(availableProducts, mergedSlots);
            if (stockResult.status === "UNAVAILABLE") {
                try {
                    const alternatives = await findAlternatives(
                        storeId,
                        mergedSlots,
                        stockResult.best?.description,
                    );
                    stockResult.alternatives = alternatives;
                } catch {
                    // Alternatives failed - that's okay, continue without alternatives
                }
            }
        }
    }
    // 6. Get customer name if available
    let fetchedCustomerName = customerName;
    if (!fetchedCustomerName) {
        try {
            const conversation = await prisma.conversation.findUnique({
                where: { id: conversationId },
                include: { customer: { select: { name: true } } },
            });
            fetchedCustomerName = conversation?.customer?.name || undefined;
        } catch (dbError: any) {
            if (chatOnly) {
                console.log("[CONTEXT] [CHAT_ONLY] Customer lookup failed, using default");
                fetchedCustomerName = undefined;
            } else {
                throw dbError;
            }
        }
    }

    return {
        conversationId,
        currentState: state.currentState,
        slots: mergedSlots,
        messageCount: state.messageCount,
        stallCount: state.stallCount,
        frustrationLevel: state.frustrationLevel,
        lastQuestionType: state.lastQuestionType,
        userMessage,
        conversationHistory,
        customerName: fetchedCustomerName,
        availableProducts,
        stockResult,
        storeName,
        detectedIntent,
        slotExtraction,
    };
}
