import { prisma } from "./prisma";
import type { ConversationState, Slots, ConversationStateType } from "./conversation-types";

// ─── STATE MANAGER (Neutral Persistence Layer) ───

export async function loadState(conversationId: string): Promise<ConversationState> {
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
    const conv = await prisma.conversation.update({
        where: { id: conversationId },
        data: { stallCount: { increment: 1 } },
        select: { stallCount: true },
    });

    console.log(`[STATE] ⏸️ Stall count: ${conv.stallCount}`);
    return conv.stallCount;
}

export async function resetStall(conversationId: string): Promise<void> {
    await prisma.conversation.update({
        where: { id: conversationId },
        data: { stallCount: 0 },
    });
}

export async function incrementFrustration(conversationId: string): Promise<number> {
    const conv = await prisma.conversation.update({
        where: { id: conversationId },
        data: { frustrationLevel: { increment: 1 } },
        select: { frustrationLevel: true },
    });

    console.log(`[STATE] 😤 Frustration level: ${conv.frustrationLevel}`);
    return conv.frustrationLevel;
}

export async function incrementMessageCount(conversationId: string): Promise<number> {
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
    await prisma.conversation.update({
        where: { id: conversationId },
        data: { lastQuestionType: questionType },
    });
}

// ─── HUMAN LOOP HELPERS ───

export async function isHumanLocked(conversationId: string): Promise<boolean> {
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
    await prisma.conversation.update({
        where: { id: conversationId },
        data: {
            botStatus: 'BOT',
            handoffUntil: null,
        },
    });

    console.log(`[HUMAN_LOOP] 🔓 Conversa ${conversationId} destravada manualmente`);
}
