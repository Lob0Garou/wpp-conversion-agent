import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { prisma } from "../../prisma";
import { validateOrderId } from "../tool-guards";

export const createPedidosTool = (storeId: string) => {
    return new DynamicStructuredTool({
        name: "consultar_pedido",
        description: "Consulta o status atual, data de entrega prevista ou rastreio de um pedido de um cliente usando o número do pedido ou CPF.",
        schema: z.object({
            identificador: z.string().describe("Número do pedido (ex: '#1234') ou CPF do cliente (ex: '000.000.000-00')"),
            tipo: z.enum(["pedido", "cpf"]).describe("O tipo de identificador de busca fornecido"),
        }),
        func: async ({ identificador, tipo }) => {
            try {
                // Remove formatação para buscar limpo no DB
                const cleanIdentificador = identificador.replace(/\D/g, '');

                let whereClause: any = { storeId };

                if (tipo === "pedido") {
                    const validation = validateOrderId(cleanIdentificador);
                    if (!validation.valid) {
                        return JSON.stringify({
                            source: "pedidos_db",
                            error: validation.error
                        });
                    }
                    whereClause.orderNumber = cleanIdentificador;
                } else if (tipo === "cpf") {
                    // Cuidado: Num banco real o CPF pode estar em Customer
                    whereClause.customer = { document: cleanIdentificador };
                }

                // Usando uma tabela Order fictícia do Prisma do projeto original
                // Pode requerer adaptação dependendo do schema exato. Aqui buscaremos em order / invoice
                // Vamos simular a consulta caso a tabela explícita não exista na versão do schema
                // TODO: Update para prisma.order real do bot se existir
                const pedido = await prisma.conversation.findFirst({
                    where: { storeId: storeId }, // Dummy query to check connection
                    select: { id: true }
                });

                if (pedido) {
                    return JSON.stringify({
                        source: "pedidos_db", storeId,
                        timestamp: new Date().toISOString(),
                        status: "encontrado",
                        mock: true,
                        pedidoEncontrado: {
                            numero: cleanIdentificador,
                            statusPedido: "EM_ROTA_DE_ENTREGA",
                            dataPrevista: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
                            produtos: ["Tenis XYZ - 40"],
                            transportadora: "Correios",
                            codigoRastreio: "BR123456789XP"
                        },
                        aviso: "Dados simulados em Modo SAC (A adaptar para DB de Vendas)"
                    });
                }

                return JSON.stringify({
                    source: "pedidos_db", storeId,
                    timestamp: new Date().toISOString(),
                    status: "not_found",
                    mensagem: `Não localizamos o pedido com identificador: ${identificador}`
                });
            } catch (error) {
                console.error("[TOOL:Pedidos] Erro ao buscar dados:", error);
                return JSON.stringify({
                    source: "pedidos_db",
                    error: "Falha técnica ao acessar o sistema de pedidos."
                });
            }
        },
    });
};
