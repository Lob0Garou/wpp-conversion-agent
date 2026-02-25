import { ChatOpenAI } from "@langchain/openai";
import { AgentStateType } from "./state";
import { getVendasTools, getSacTools } from "../tools";
import { generateSystemPrompt } from "./prompts";
import { SystemMessage, coerceMessageLikeToMessage, AIMessage } from "@langchain/core/messages";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { z } from "zod";

// Tools exportadas individualmente
export const createVendasToolNode = (storeId: string) => new ToolNode(getVendasTools(storeId));
export const createSacToolNode = (storeId: string) => new ToolNode(getSacTools(storeId));

const getBaseModel = () => {
    return new ChatOpenAI({
        modelName: process.env.OPENROUTER_MODEL || "moonshotai/kimi-k2.5",
        temperature: 0.3,
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
};

const filterAndFormatMessages = (messages: any[], systemPrompt: string, summary?: string) => {
    let finalPrompt = systemPrompt;
    if (summary) {
        finalPrompt += `\n\n[RESUMO DA CONVERSA ATÉ AGORA]\n${summary}`;
    }
    const systemMessage = new SystemMessage(finalPrompt);

    const normalizedMessages = messages.map((m) =>
        typeof (m as any)?._getType === "function" ? m : coerceMessageLikeToMessage(m as any)
    );
    const userAndAiMessages = normalizedMessages.filter(m => m._getType() !== "system");

    return [systemMessage, ...userAndAiMessages];
};

export const supervisorNode = async (state: AgentStateType) => {
    const { messages, summary } = state;
    const model = getBaseModel();

    // O router object usa Zod para forçar uma saída JSON estruturada (tool calling)
    const routerSchema = z.object({
        route: z.enum(["vendas", "sac"]).describe("A qual setor essa conversa deve ir? 'vendas' para interesse em produtos/compras, e 'sac' para dúvidas de pedidos/regras.")
    });

    const modelWithSchema = model.withStructuredOutput(routerSchema, { name: "route_conversation" });

    const prompt = "Você é um supervisor de triagem. Avalie a última mensagem do usuário " +
        "e escolha para qual agente direcionar. " +
        "Direcione para 'vendas' quando o assunto for comprar produtos, ver catálogo, numeração, preço ou sugestão de presente. " +
        "Direcione para 'sac' quando for dúvida sobre um pedido em andamento, troca, estorno, devolução, políticas e frete.";

    const fullMessages = filterAndFormatMessages(messages, prompt, summary);

    // Call model e capta o JSON
    const result = await modelWithSchema.invoke(fullMessages);

    // Transições diretas via retorno
    return { activeAgent: result.route };
};

export const vendasNode = async (state: AgentStateType) => {
    const { messages, storeId, summary } = state;
    const model = getBaseModel();
    const tools = getVendasTools(storeId);
    const modelWithTools = model.bindTools(tools);

    const fullMessages = filterAndFormatMessages(messages, generateSystemPrompt("vendas"), summary);
    const response = await modelWithTools.invoke(fullMessages);

    return { messages: [response] };
};

export const sacNode = async (state: AgentStateType) => {
    const { messages, storeId, summary } = state;
    const model = getBaseModel();
    const tools = getSacTools(storeId);
    const modelWithTools = model.bindTools(tools);

    const fullMessages = filterAndFormatMessages(messages, generateSystemPrompt("sac"), summary);
    const response = await modelWithTools.invoke(fullMessages);

    return { messages: [response] };
};
