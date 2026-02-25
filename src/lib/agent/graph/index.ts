import { StateGraph, START, END } from "@langchain/langgraph";
import { AgentState, AgentStateType } from "./state";
import { supervisorNode, vendasNode, sacNode, createVendasToolNode, createSacToolNode } from "./nodes";
import { summarizeConversation } from "../summarizer";
import { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";

// Regra de roteamento a partir do Supervisor
function supervisorRouter(state: AgentStateType) {
    if (state.activeAgent === "vendas") {
        return "vendas";
    }
    if (state.activeAgent === "sac") {
        return "sac";
    }
    return "vendas"; // Fallback de segurança
}

// Regra de roteamento pós-Vendas
function vendasRouter(state: AgentStateType) {
    const messages = state.messages;
    const lastMessage = messages[messages.length - 1];

    if ("tool_calls" in lastMessage && Array.isArray(lastMessage.tool_calls) && lastMessage.tool_calls.length > 0) {
        return "tools_vendas";
    }

    if (messages.length > 6) {
        return "summarize";
    }
    return END;
}

// Regra de roteamento pós-SAC
function sacRouter(state: AgentStateType) {
    const messages = state.messages;
    const lastMessage = messages[messages.length - 1];

    if ("tool_calls" in lastMessage && Array.isArray(lastMessage.tool_calls) && lastMessage.tool_calls.length > 0) {
        return "tools_sac";
    }

    if (messages.length > 6) {
        return "summarize";
    }
    return END;
}

export function createAgentGraph(storeId: string, workflowConfig?: { checkpointer?: BaseCheckpointSaver }) {
    const toolsVendas = createVendasToolNode(storeId);
    const toolsSac = createSacToolNode(storeId);

    const workflow = new StateGraph(AgentState)
        // Adiciona os nós na DAG
        .addNode("supervisor", supervisorNode)
        .addNode("vendas", vendasNode)
        .addNode("sac", sacNode)
        .addNode("tools_vendas", toolsVendas)
        .addNode("tools_sac", toolsSac)
        .addNode("summarize", summarizeConversation)

        // Entrypoint sempre cai no supervisor para triagem
        .addEdge(START, "supervisor")

        // Supervisor decide para qual hub ir baseando-se no state.activeAgent
        .addConditionalEdges("supervisor", supervisorRouter, {
            vendas: "vendas",
            sac: "sac",
        })

        // Vendas pode chamar ferramentas da loja ou encerrar
        .addConditionalEdges("vendas", vendasRouter, {
            tools_vendas: "tools_vendas",
            summarize: "summarize",
            [END]: END,
        })

        // SAC pode chamar ferramentas de order ou encerrar
        .addConditionalEdges("sac", sacRouter, {
            tools_sac: "tools_sac",
            summarize: "summarize",
            [END]: END,
        })

        // Ferramentas sempre devolvem a bola para seus respectivos donos
        .addEdge("tools_vendas", "vendas")
        .addEdge("tools_sac", "sac")

        // Sumarizador encerra o loop de processamento
        .addEdge("summarize", END);

    return workflow.compile(workflowConfig);
}
