/**
 * Define a estrutura de estado que flui através do LangGraph.
 */
import { BaseMessage } from "@langchain/core/messages";
import { Annotation, messagesStateReducer } from "@langchain/langgraph";

export const AgentState = Annotation.Root({
    // Histórico de mensagens da conversa (usuário, AI, tool calls)
    // messagesStateReducer gerencia as mensagens por ID, 
    // permitindo a deleção enviando objetos `RemoveMessage`.
    messages: Annotation<BaseMessage[]>({
        reducer: messagesStateReducer,
        default: () => [],
    }),

    // Resumo da conversa para contexto de longo prazo
    summary: Annotation<string>({
        reducer: (x, y) => y, // O novo resumo sempre substitui o antigo
        default: () => "",
    }),

    // Contexto de identificação essencial
    storeId: Annotation<string>(),
    conversationId: Annotation<string>(),
    customerId: Annotation<string>(),
    customerPhone: Annotation<string>(),

    // Subagent Routing Tracking (supervisor acts as router)
    activeAgent: Annotation<"supervisor" | "vendas" | "sac">({
        reducer: (x, y) => y, // O último agente a receber a bola guarda o estado
        default: () => "supervisor",
    }),
});

export type AgentStateType = typeof AgentState.State;
