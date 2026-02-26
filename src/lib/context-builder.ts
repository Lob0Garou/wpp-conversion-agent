import { prisma } from "./prisma";
import { loadState, type ConversationStateType } from "./state-manager";
import { classifyIntent, type Intent } from "./intent-classifier";
import { extractSlots } from "./slot-extractor";
import { findRelevantProducts } from "./products";
import { validateStockRequest, findAlternatives, createStockUnknownResult, type StockResult } from "./stock-agent";
import { hasActiveSnapshot, getActiveImportId } from "./inventory-snapshot";

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
}): Promise<ConversationContext> {
    const { conversationId, userMessage, storeId, storeName, customerName } = params;

    // 1. Load current state
    const state = await loadState(conversationId);

    // 2. Fetch conversation history (last 8 messages = ~4 turnos completos)
    // 8 msgs são suficientes para SAC e vendas — reduz custo de tokens em ~33%
    const historyLimit = getSafeHistoryLimit();
    const lastMessages = await prisma.message.findMany({
        where: {
            conversationId,
            NOT: { waMessageId: params.currentWaMessageId ?? "" }, // Fix 3
        },
        orderBy: { timestamp: "desc" }, // Keep original orderBy
        take: historyLimit,
    });

    // Fix 4: Return structured roles
    const conversationHistory = lastMessages.reverse().map((m) => ({
        role: (m.direction === "inbound" ? "user" : "assistant") as "user" | "assistant",
        content: m.content,
    }));

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
        const snapshotExists = await hasActiveSnapshot(storeId);

        if (!snapshotExists) {
            console.log(`[CONTEXT] [WARN] Sem snapshot ativo para store ${storeId}`);
            stockResult = createStockUnknownResult();
        } else {
            const activeImportId = await getActiveImportId(storeId);
            availableProducts = await findRelevantProducts(
                userMessage,
                storeId,
                mergedSlots,
                activeImportId ?? undefined
            );

            stockResult = validateStockRequest(availableProducts, mergedSlots);
            if (stockResult.status === "UNAVAILABLE") {
                const alternatives = await findAlternatives(
                    storeId,
                    mergedSlots,
                    stockResult.best?.description,
                );
                stockResult.alternatives = alternatives;
            }
        }
    }
    // 6. Get customer name if available
    let fetchedCustomerName = customerName;
    if (!fetchedCustomerName) {
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: { customer: { select: { name: true } } },
        });
        fetchedCustomerName = conversation?.customer?.name || undefined;
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
