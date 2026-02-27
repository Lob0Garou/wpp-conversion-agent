import { prisma } from "./prisma";
import type { ConversationState, Slots, ConversationStateType } from "./conversation-types";
import { isChatOnlyMode } from "./chat-mode";

// ─── IN-MEMORY STORE (CHAT_ONLY mode) ───

const _mem = new Map<string, ConversationState>();

function _getOrCreate(id: string): ConversationState {
    if (!_mem.has(id)) {
        _mem.set(id, {
            currentState: "greeting" as ConversationStateType,
            slots: {},
            messageCount: 0,
            stallCount: 0,
            lastQuestionType: null,
            frustrationLevel: 0,
            botStatus: "BOT",
            handoffUntil: null,
            alertSent: null,
        });
    }
    return _mem.get(id)!;
}

// ─── STATE MANAGER (Neutral Persistence Layer) ───

export async function loadState(conversationId: string): Promise<ConversationState> {
    if (isChatOnlyMode()) {
        return { ..._getOrCreate(conversationId) };
    }

    const conv = await prisma.conversation.findUniqueOrThrow({
        where: { id: conversationId },
        select: {
            currentState: true,
            slots: true,
            messageCount: true,
            stallCount: true,
            lastQuestionType: true,
            frustrationLevel: true,
            botStatus: true,
            handoffUntil: true,
            alertSent: true,
        },
    });

    return {
        currentState: conv.currentState as ConversationStateType,
        slots: (conv.slots as Slots) || {},
        messageCount: conv.messageCount,
        stallCount: conv.stallCount,
        lastQuestionType: conv.lastQuestionType,
        frustrationLevel: conv.frustrationLevel,
        botStatus: (conv.botStatus as 'BOT' | 'HUMAN') || 'BOT',
        handoffUntil: conv.handoffUntil,
        alertSent: conv.alertSent as ConversationState['alertSent'],
    };
}

export async function updateSlots(
    conversationId: string,
    newSlots: Partial<Slots>,
    currentSlots?: Slots
): Promise<void> {
    if (isChatOnlyMode()) {
        const s = _getOrCreate(conversationId);
        s.slots = { ...s.slots, ...newSlots };
        return;
    }

    let existingSlots = currentSlots;

    if (!existingSlots) {
        const conv = await prisma.conversation.findUniqueOrThrow({
            where: { id: conversationId },
            select: { slots: true },
        });
        existingSlots = (conv.slots as Slots) || {};
    }

    const mergedSlots = { ...existingSlots, ...newSlots };

    await prisma.conversation.update({
        where: { id: conversationId },
        data: { slots: mergedSlots as any },
    });
}

export async function transitionTo(
    conversationId: string,
    newState: ConversationStateType,
    reason: string,
    storeId?: string
): Promise<void> {
    if (isChatOnlyMode()) {
        const s = _getOrCreate(conversationId);
        const oldState = s.currentState;
        s.currentState = newState;
        s.stallCount = 0;
        console.log(`[STATE] 🔄 ${oldState} → ${newState} (reason: ${reason})`);
        return;
    }

    const conv = await prisma.conversation.findUniqueOrThrow({
        where: { id: conversationId },
        select: { currentState: true, storeId: true },
    });

    const oldState = conv.currentState;

    await Promise.all([
        prisma.conversation.update({
            where: { id: conversationId },
            data: {
                currentState: newState,
                stallCount: 0, // Reset stall on transition
            },
        }),
        prisma.auditLog.create({
            data: {
                storeId: storeId || conv.storeId,
                event: "STATE_TRANSITION",
                metadata: {
                    conversationId,
                    fromState: oldState,
                    toState: newState,
                    reason,
                },
            },
        }),
    ]);

    console.log(`[STATE] 🔄 ${oldState} → ${newState} (reason: ${reason})`);
}

export async function incrementStall(conversationId: string): Promise<number> {
    if (isChatOnlyMode()) {
        const s = _getOrCreate(conversationId);
        s.stallCount += 1;
        console.log(`[STATE] ⏸️ Stall count: ${s.stallCount}`);
        return s.stallCount;
    }

    const conv = await prisma.conversation.update({
        where: { id: conversationId },
        data: { stallCount: { increment: 1 } },
        select: { stallCount: true },
    });

    console.log(`[STATE] ⏸️ Stall count: ${conv.stallCount}`);
    return conv.stallCount;
}

export async function resetStall(conversationId: string): Promise<void> {
    if (isChatOnlyMode()) {
        _getOrCreate(conversationId).stallCount = 0;
        return;
    }

    await prisma.conversation.update({
        where: { id: conversationId },
        data: { stallCount: 0 },
    });
}

export async function incrementFrustration(conversationId: string): Promise<number> {
    if (isChatOnlyMode()) {
        const s = _getOrCreate(conversationId);
        s.frustrationLevel += 1;
        console.log(`[STATE] 😤 Frustration level: ${s.frustrationLevel}`);
        return s.frustrationLevel;
    }

    const conv = await prisma.conversation.update({
        where: { id: conversationId },
        data: { frustrationLevel: { increment: 1 } },
        select: { frustrationLevel: true },
    });

    console.log(`[STATE] 😤 Frustration level: ${conv.frustrationLevel}`);
    return conv.frustrationLevel;
}

export async function incrementMessageCount(conversationId: string): Promise<number> {
    if (isChatOnlyMode()) {
        const s = _getOrCreate(conversationId);
        s.messageCount += 1;
        return s.messageCount;
    }

    const conv = await prisma.conversation.update({
        where: { id: conversationId },
        data: { messageCount: { increment: 1 } },
        select: { messageCount: true },
    });

    return conv.messageCount;
}

export async function setLastQuestionType(
    conversationId: string,
    questionType: string
): Promise<void> {
    if (isChatOnlyMode()) {
        _getOrCreate(conversationId).lastQuestionType = questionType;
        return;
    }

    await prisma.conversation.update({
        where: { id: conversationId },
        data: { lastQuestionType: questionType },
    });
}

// ─── HUMAN LOOP HELPERS ───

export async function isHumanLocked(conversationId: string): Promise<boolean> {
    if (isChatOnlyMode()) {
        const s = _getOrCreate(conversationId);
        if (s.botStatus !== 'HUMAN') return false;
        if (s.handoffUntil && new Date() > s.handoffUntil) {
            s.botStatus = 'BOT';
            s.handoffUntil = null;
            return false;
        }
        return s.handoffUntil !== null && s.handoffUntil > new Date();
    }

    const conv = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: {
            botStatus: true,
            handoffUntil: true,
        },
    });

    if (!conv || conv.botStatus !== 'HUMAN') {
        return false;
    }

    if (conv.handoffUntil && new Date() > conv.handoffUntil) {
        // Auto-unlock: volta para BOT
        await prisma.conversation.update({
            where: { id: conversationId },
            data: {
                botStatus: 'BOT',
                handoffUntil: null,
            },
        });
        console.log(`[HUMAN_LOOP] 🔓 Conversa ${conversationId} destravada automaticamente (fim do dia)`);
        return false;
    }

    return conv.handoffUntil !== null && conv.handoffUntil > new Date();
}

export async function lockToHuman(
    conversationId: string,
    alertSent?: {
        type: 'SALE' | 'SAC';
        messageId: string;
        groupId: string;
    }
): Promise<void> {
    // Calcula fim do dia (23:59:59)
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    if (isChatOnlyMode()) {
        const s = _getOrCreate(conversationId);
        s.botStatus = 'HUMAN';
        s.handoffUntil = endOfDay;
        if (alertSent) {
            s.alertSent = { type: alertSent.type, sentAt: now, messageId: alertSent.messageId, groupId: alertSent.groupId };
        }
        console.log(`[HUMAN_LOOP] 🔒 Conversa ${conversationId} travada até ${endOfDay.toISOString()}`);
        return;
    }

    await prisma.conversation.update({
        where: { id: conversationId },
        data: {
            botStatus: 'HUMAN',
            handoffUntil: endOfDay,
            alertSent: alertSent ? {
                type: alertSent.type,
                sentAt: now,
                messageId: alertSent.messageId,
                groupId: alertSent.groupId,
            } : undefined,
        },
    });

    console.log(`[HUMAN_LOOP] 🔒 Conversa ${conversationId} travada até ${endOfDay.toISOString()}`);
}

export async function unlockFromHuman(conversationId: string): Promise<void> {
    if (isChatOnlyMode()) {
        const s = _getOrCreate(conversationId);
        s.botStatus = 'BOT';
        s.handoffUntil = null;
        console.log(`[HUMAN_LOOP] 🔓 Conversa ${conversationId} destravada manualmente`);
        return;
    }

    await prisma.conversation.update({
        where: { id: conversationId },
        data: {
            botStatus: 'BOT',
            handoffUntil: null,
        },
    });

    console.log(`[HUMAN_LOOP] 🔓 Conversa ${conversationId} destravada manualmente`);
}
