import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { prisma } from "../../prisma";
import { validateSearchQuery } from "../tool-guards";

export const createCatalogoTool = (storeId: string) => {
    return new DynamicStructuredTool({
        name: "consultar_catalogo",
        description: "Busca produtos no catálogo da loja por nome, categoria ou marca. Retorna uma lista de produtos compatíveis, mas não garante disponibilidade de estoque para um tamanho específico (use verificar_estoque para isso).",
        schema: z.object({
            query: z.string().describe("O termo de busca (ex: 'tenis nike', 'chuteira', 'camiseta preta')"),
            categoria: z.string().optional().describe("Filtro opcional de categoria (ex: 'tenis', 'vestuario')"),
            marca: z.string().optional().describe("Filtro opcional de marca (ex: 'nike', 'adidas')"),
        }),
        func: async ({ query, categoria, marca }) => {
            try {
                const validation = validateSearchQuery(query);
                if (!validation.valid) {
                    return JSON.stringify({
                        source: "catalogo_db",
                        error: validation.error
                    });
                }

                // Implementação simplificada de busca textual no Prisma
                // Idealmente usaria full-text search do PostgreSQL, mas para SQLite/MySQL usamos contains
                const whereClause: any = {
                    storeId,
                    OR: [
                        { description: { contains: query } },
                        { sku: { contains: query } }
                    ]
                };

                if (categoria) whereClause.groupName = { contains: categoria };
                if (marca) whereClause.brand = { contains: marca };

                const produtos = await prisma.product.findMany({
                    where: whereClause,
                    take: 5,
                    select: {
                        id: true,
                        description: true,
                        price: true,
                        groupName: true,
                        brand: true,
                    }
                });

                return JSON.stringify({
                    source: "catalogo_db",
                    storeId,
                    timestamp: new Date().toISOString(),
                    metadata: {
                        query, totalEncontrado: produtos.length
                    },
                    resultados: produtos.map(p => ({
                        id: p.id,
                        nome: p.description,
                        preco: Number(p.price),
                        marca: p.brand,
                        categoria: p.groupName
                    }))
                });
            } catch (error) {
                console.error("[TOOL:Catalogo] Erro ao buscar dados:", error);
                return JSON.stringify({
                    source: "catalogo_db",
                    error: "Falha técnica ao acessar o catálogo."
                });
            }
        },
    });
};
