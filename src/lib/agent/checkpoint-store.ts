import {
    BaseCheckpointSaver,
    Checkpoint,
    CheckpointMetadata,
    CheckpointTuple,
} from "@langchain/langgraph-checkpoint";
import {
    coerceMessageLikeToMessage,
    mapChatMessagesToStoredMessages,
    mapStoredMessagesToChatMessages,
    type BaseMessage,
} from "@langchain/core/messages";
import { prisma } from "../prisma";

/**
 * Custom Prisma Checkpoint Saver for LangGraph MVP
 * Salva apenas o último estado da conversa no campo `Conversation.langgraphState`
 * para evitar overhead de histórico infinito no banco de dados.
 */
export class PrismaCheckpointSaver extends BaseCheckpointSaver {
    constructor() {
        super();
    }

    // @ts-ignore
    async deleteThread(thread_id: string): Promise<void> {
        await prisma.conversation.update({
            where: { id: thread_id },
            data: { langgraphState: null as any }
        }).catch(() => { });
    }

    async put(
        config: { configurable?: { thread_id?: string;[key: string]: any } },
        checkpoint: Checkpoint,
        metadata: CheckpointMetadata
    ): Promise<any> {
        const thread_id = config.configurable?.thread_id;
        if (!thread_id) return { configurable: config.configurable };

        const checkpointForStorage = serializeCheckpointForStorage(checkpoint);
        const statePayload = {
            checkpoint: JSON.stringify(checkpointForStorage),
            metadata: JSON.stringify(metadata),
            parentConfig: config.configurable,
        };

        await (prisma.conversation as any).update({
            where: { id: thread_id },
            data: {
                langgraphState: statePayload,
            },
            select: { id: true },
        }).catch((e) => {
            console.error(`[CHECKPOINT] Erro ao salvar estado da conversa ${thread_id}:`, e.message);
        });

        return {
            configurable: {
                ...config.configurable,
                checkpoint_id: checkpoint.id,
            },
        };
    }

    async putWrites(
        config: { configurable?: { thread_id?: string;[key: string]: any } },
        writes: any[],
        taskId: string
    ): Promise<void> {
        // Suporte a escritas concorrentes e sub-grafos não é essencial pro fluxo principal WPP
        // Pode ser implementado no futuro se a arquitetura multi-agent escalar
        return;
    }

    async getTuple(
        config: { configurable?: { thread_id?: string;[key: string]: any } }
    ): Promise<CheckpointTuple | undefined> {
        const thread_id = config.configurable?.thread_id;
        if (!thread_id) return undefined;

        const conv = await prisma.conversation.findUnique({
            where: { id: thread_id },
            select: { langgraphState: true },
        });

        if (!conv || !conv.langgraphState) return undefined;

        try {
            const state = conv.langgraphState as any;
            return {
                config: {
                    configurable: {
                        thread_id,
                        checkpoint_id: "latest",
                    },
                },
                checkpoint: deserializeCheckpointFromStorage(
                    JSON.parse(state.checkpoint) as Checkpoint
                ),
                metadata: JSON.parse(state.metadata) as CheckpointMetadata,
                parentConfig: state.parentConfig,
            };
        } catch (e) {
            console.error(`[CHECKPOINT] Falha ao desserializar estado da conversa ${thread_id}:`, e);
            return undefined;
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async *list(config: any): AsyncGenerator<CheckpointTuple> {
        const tuple = await this.getTuple(config);
        if (tuple) yield tuple;
    }
}

function serializeCheckpointForStorage(checkpoint: Checkpoint): Checkpoint {
    const cp = structuredClone(checkpoint) as Checkpoint;
    const originalMessages = (checkpoint as any)?.channel_values?.messages;
    if (Array.isArray(originalMessages) && originalMessages.length > 0) {
        // Persist messages as StoredMessage[] so they can be rehydrated into BaseMessage subclasses.
        const first = originalMessages[0];
        const looksStoredMessage =
            typeof first === "object" &&
            first !== null &&
            ("type" in first || "data" in first) &&
            typeof (first as any)?.toDict !== "function";

        if (looksStoredMessage) {
            (cp as any).channel_values.messages = originalMessages;
        } else {
            const normalized = originalMessages.map((m: any) =>
                typeof m?.toDict === "function" ? m : coerceMessageLikeToMessage(m)
            );
            (cp as any).channel_values.messages = mapChatMessagesToStoredMessages(normalized as BaseMessage[]);
        }
    }
    return cp;
}

function deserializeCheckpointFromStorage(checkpoint: Checkpoint): Checkpoint {
    const cp = structuredClone(checkpoint) as Checkpoint;
    const messages = (cp as any)?.channel_values?.messages;
    if (Array.isArray(messages) && messages.length > 0) {
        const looksStoredMessage =
            typeof messages[0] === "object" &&
            messages[0] !== null &&
            ("type" in messages[0] || "data" in messages[0]);
        if (looksStoredMessage) {
            (cp as any).channel_values.messages = mapStoredMessagesToChatMessages(messages as any[]);
        }
    }
    return cp;
}
