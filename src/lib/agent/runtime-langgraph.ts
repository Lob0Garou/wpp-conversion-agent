import { AgentRuntime, AgentRuntimeInput, AgentRuntimeOutput } from "./types";
import { HumanMessage, coerceMessageLikeToMessage } from "@langchain/core/messages";
import { createAgentGraph } from "./graph";
import { AgentStateType } from "./graph/state";

function safeStringContent(content: unknown): string {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) return content.map((p) => JSON.stringify(p)).join(" ");
    if (content == null) return "";
    return String(content);
}

function extractToolCallNames(messages: any[]): string[] {
    const names: string[] = [];
    for (const raw of messages) {
        const msg = typeof raw?._getType === "function" ? raw : coerceMessageLikeToMessage(raw);
        if (msg._getType() !== "ai") continue;
        const toolCalls = Array.isArray((msg as any).tool_calls) ? (msg as any).tool_calls : [];
        for (const call of toolCalls) {
            if (typeof call?.name === "string" && call.name.trim()) {
                names.push(call.name.trim());
            }
        }
    }
    return names;
}

function messageContainsMockFlag(raw: any): boolean {
    const msg = typeof raw?._getType === "function" ? raw : coerceMessageLikeToMessage(raw);
    if (msg._getType() !== "tool") return false;
    const content = (msg as any).content;

    if (typeof content === "string") {
        return content.includes("\"mock\":true") || content.includes("\"mock\": true");
    }

    if (Array.isArray(content)) {
        return content.some((part) => {
            const text = typeof part === "string"
                ? part
                : typeof part?.text === "string"
                    ? part.text
                    : JSON.stringify(part);
            return text.includes("\"mock\":true") || text.includes("\"mock\": true");
        });
    }

    return false;
}

function detectSimpleRepeatLoop(messages: any[]): boolean {
    const aiMessages = messages
        .map((raw) => (typeof raw?._getType === "function" ? raw : coerceMessageLikeToMessage(raw)))
        .filter((msg) => msg._getType() === "ai")
        .map((msg) => safeStringContent((msg as any).content).trim().toLowerCase())
        .filter(Boolean);

    if (aiMessages.length < 2) return false;
    const last = aiMessages[aiMessages.length - 1];
    const prev = aiMessages[aiMessages.length - 2];
    return last.length > 0 && last === prev;
}

export class LangGraphRuntime implements AgentRuntime {
    async generateReply(input: AgentRuntimeInput): Promise<AgentRuntimeOutput> {
        try {
            // Inicializa a representação do grafo de estado e injeta o Checkpointer
            const { PrismaCheckpointSaver } = await import("./checkpoint-store");
            const checkpointer = new PrismaCheckpointSaver();

            // Recompilamos o grafo com o checkpointer para este run
            // Em prod, o ideal é compilar 1x, mas no webhook o runtime é instanciado on the fly
            const workflowConfig = { checkpointer };
            const graph = createAgentGraph(input.storeId, workflowConfig);

            // O thread_id define qual "memória" o LangGraph vai carregar e salvar
            const runtimeConfig = {
                configurable: {
                    thread_id: input.conversationId,
                }
            };

            // Compõe entrada inicial (não precisa re-alimentar o state se houver checkpointer, apenas a nova HumanMessage)
            const inputState = {
                storeId: input.storeId,
                conversationId: input.conversationId,
                messages: [new HumanMessage(input.message)],
                customerId: input.customerId || "anonymous",
                customerPhone: input.customerPhone || "unknown",
            };

            // Injeta o inputState; o LangGraph internamente aplicará o Reducer para juntar isso ao estado salvo
            const resultState = await graph.invoke(inputState, runtimeConfig) as AgentStateType;

            const finalMessages = Array.isArray(resultState.messages) ? resultState.messages : [];
            const normalizedMessages = finalMessages.map((m) =>
                typeof (m as any)?._getType === "function" ? m : coerceMessageLikeToMessage(m as any)
            );
            const lastMessage = normalizedMessages[normalizedMessages.length - 1];
            const toolCallNames = extractToolCallNames(normalizedMessages as any[]);
            const usedMockTool = normalizedMessages.some((m) => messageContainsMockFlag(m));
            const loopSignal = detectSimpleRepeatLoop(normalizedMessages as any[]);
            const summaryText = typeof resultState.summary === "string" ? resultState.summary : "";

            // Formata a string de saída final
            return {
                reply: safeStringContent((lastMessage as any)?.content),
                requiresHuman: false, // Fase 6 tratará o routing dinâmico para humano
                metadata: {
                    runtimeUsed: "langgraph-subagents",
                    totalMessagesExchanged: normalizedMessages.length,
                    activeAgent: resultState.activeAgent,
                    summaryPresent: summaryText.trim().length > 0,
                    summaryLength: summaryText.length,
                    toolCallsCount: toolCallNames.length,
                    toolNames: toolCallNames,
                    usedMockTool,
                    loopSignal,
                }
            };
        } catch (error) {
            console.error("[LangGraphRuntime] Erro fatal no processamento do agente:", error);
            if (error instanceof Error) {
                console.error(error.stack);
            }
            return {
                reply: "Desculpe, enfrentei uma instabilidade técnica. Pode repetir?",
                requiresHuman: true, // Força handoff safe em caso de erro da LLM
            };
        }
    }
}
