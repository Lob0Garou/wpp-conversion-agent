import { ChatOpenAI } from "@langchain/openai";
import { AgentStateType } from "./graph/state";
import { HumanMessage, RemoveMessage } from "@langchain/core/messages";
import { END } from "@langchain/langgraph";

/**
 * Summarizer node for LangGraph
 * Compacta o histórico da conversa se exceder o limite de mensagens,
 * atualizando o "summary" do estado e encurtando as "messages" enviadas.
 * Como o reducer atual usa `messagesStateReducer`, remover mensagens requer a classe `RemoveMessage`.
 */
export const summarizeConversation = async (state: AgentStateType) => {
    const { messages, summary } = state;

    // Configuração do LLM via OpenRouter para o resumo (usando mini/flash se possível, ou o padrão)
    const model = new ChatOpenAI({
        modelName: process.env.OPENROUTER_MODEL || process.env.AI_MODEL || process.env.ROUTER_MODEL || "google/gemini-2.5-flash",
        temperature: 0.1,
        apiKey: process.env.OPENROUTER_API_KEY,
        openAIApiKey: process.env.OPENROUTER_API_KEY,
        configuration: {
            baseURL: "https://openrouter.ai/api/v1",
            defaultHeaders: {
                "HTTP-Referer": process.env.OPENROUTER_REFERER || "https://github.com/wpp-conversion-agent",
                "X-Title": process.env.OPENROUTER_TITLE || "WhatsApp Conversion Agent",
            }
        }
    });

    // Cria o prompt de resumo
    let summaryPrompt = `Resume a conversa acima. O resumo deve focar nos interesses do cliente, produtos discutidos, problemas relatados e progresso da venda ou suporte. Seja conciso e mantenha os dados críticos (IDs de pedido, modelos, tamanhos, nomes).`;

    if (summary) {
        summaryPrompt = `Este é o resumo atual da conversa:\n${summary}\n\nEvolua este resumo incorporando as novas informações das mensagens recentes acima. Mantenha os detalhes cruciais (IDs, intenções, produtos). Substitua o resumo antigo por este novo completamente.`;
    }

    // Passamos o histórico inteiro pro LLM gerar o resumo
    const response = await model.invoke([
        ...messages,
        new HumanMessage(summaryPrompt),
    ]);

    const newSummary = typeof response.content === 'string' ? response.content : "Resumo indisponível";

    // Expurgar as mensagens antigas emitindo `RemoveMessage` pro messagesStateReducer do state.ts
    // Vamos manter apenas as últimas 6 mensagens que não são do tipo "system" 
    const userAndAiMessages = messages.filter(m => m._getType() !== "system");

    // Mapeamos as mensagens que vão sobrar
    const messagesToKeep = userAndAiMessages.slice(-6);
    const keepIds = new Set(messagesToKeep.map(m => m.id));

    // Tudo que não está no Set de keepIds vai pro saco
    const deleteMessages = messages
        .filter(m => m.id && !keepIds.has(m.id))
        .map(m => new RemoveMessage({ id: m.id as string }));

    return {
        summary: newSummary,
        messages: deleteMessages,
    };
};

/**
 * Função condicional edge: Se mensagens > 10, vai para o summarizer.
 */
export function shouldSummarize(state: AgentStateType) {
    const { messages } = state;
    // Ignora system messages e tool calls na conta se quiser, mas de forma simples:
    if (messages.length > 8) {
        return "summarize";
    }
    return END;
}
