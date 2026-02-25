import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { prisma } from "../../prisma";
import { validateSearchQuery } from "../tool-guards";

export const createEstoqueTool = (storeId: string) => {
    return new DynamicStructuredTool({
        name: "verificar_estoque",
        description: "Verifica a disponibilidade em estoque de um produto específico com base no seu nome, marca e tamanho detalhado.",
        schema: z.object({
            nomeProduto: z.string().describe("O nome completo ou parcial mais exato do produto (ex: 'Tenis Nike Revolution 6')"),
            tamanho: z.string().describe("Tamanho numérico ou por letra (ex: '40', 'M')"),
            marca: z.string().optional().describe("Marca desejada (ex: 'nike')"),
        }),
        func: async ({ nomeProduto, tamanho, marca }) => {
            try {
                const validation = validateSearchQuery(nomeProduto);
                if (!validation.valid) {
                    return JSON.stringify({
                        source: "estoque_db",
                        error: validation.error
                    });
                }

                // Em um cenário real de e-commerce o DB terá Product -> Variation -> Stock
                // Aqui simularemos a busca combinada.
                const whereClause: any = {
                    storeId,
                    description: { contains: nomeProduto }
                };
                if (marca) whereClause.brand = { contains: marca };

                // Encontra os produtos genéricos primeiro
                const produtos = await prisma.product.findMany({
                    where: whereClause,
                    select: { id: true, description: true, price: true, quantity: true, size: true }
                });

                if (produtos.length === 0) {
                    return JSON.stringify({
                        source: "estoque_db", storeId,
                        timestamp: new Date().toISOString(),
                        status: "not_found",
                        mensagem: `Produto não encontrado: ${nomeProduto}`
                    });
                }

                // Como a tabela productVariation não existe no schema atual,
                // vamos simular o estoque no próprio Product (ou retornar fixo para MVP)
                const resultadosEstoque = produtos.map((p) => {
                    // Simulando que produtos pares tem estoque e ímpares não
                    const temEstoque = true;
                    return {
                        produto: p,
                        variacoesDisponiveis: temEstoque ? [{ id: "mock-var-1", size: tamanho || p.size || "Único", stockQuantity: p.quantity }] : []
                    };
                });

                const disponiveis = resultadosEstoque.filter(r => r.variacoesDisponiveis.length > 0);

                if (disponiveis.length > 0) {
                    return JSON.stringify({
                        source: "estoque_db", storeId,
                        timestamp: new Date().toISOString(),
                        status: "available",
                        mock: true,
                        aviso: "Atenção: A disponibilidade de variação atual é simulada. Não confirme a reserva de fato.",
                        metadata: { quer_tamanho: tamanho },
                        produtos: disponiveis.map(d => ({
                            id: d.produto.id,
                            nome: d.produto.description,
                            preco: Number(d.produto.price),
                            tamanhoDisponiveis: d.variacoesDisponiveis.map((v: any) => ({
                                idVariacao: v.id,
                                tamanho: v.size,
                                quantidade: v.stockQuantity
                            }))
                        }))
                    });
                } else {
                    return JSON.stringify({
                        source: "estoque_db", storeId,
                        timestamp: new Date().toISOString(),
                        status: "out_of_stock",
                        metadata: { quer_tamanho: tamanho },
                        mensagem: `O produto '${nomeProduto}' esgotou para o tamanho ${tamanho}. Sugira outros modelos.`
                    });
                }
            } catch (error) {
                console.error("[TOOL:Estoque] Erro ao buscar dados:", error);
                return JSON.stringify({
                    source: "estoque_db",
                    error: "Falha técnica ao acessar o estoque do armazém."
                });
            }
        },
    });
};
