import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

export const createPoliticasTool = (storeId: string) => {
    return new DynamicStructuredTool({
        name: "consultar_politicas",
        description: "Consulta políticas da loja: prazos de troca, garantias, horário de funcionamento, endereço e devolução.",
        schema: z.object({
            topico: z.enum([
                "troca", "devolucao", "garantia", "horario_funcionamento", "endereco_loja", "retirada_loja"
            ]).describe("O tópico da política a ser consultada"),
        }),
        func: async ({ topico }) => {
            try {
                // Em um cenário real, essas informações viriam do DB: prisma.store.findUnique
                // Aqui vamos mockar as respostas base padrão

                let reposta = "";
                let dados;

                switch (topico) {
                    case "troca":
                        reposta = "O prazo de troca é de até 30 dias após a compra, com a etiqueta fixada e cupom fiscal. Trocas apenas por defeito ou tamanho/cor incorretos.";
                        dados = { prazoDias: 30, exigeEtiqueta: true, exigeNota: true };
                        break;
                    case "devolucao":
                        reposta = "O prazo de devolução e estorno é de 7 dias úteis após o recebimento, válido apenas para compras online.";
                        dados = { prazoDias: 7, apenasOnline: true };
                        break;
                    case "garantia":
                        reposta = "Garantia de 90 dias contra defeitos de fabricação direto conosco. Após isso, deve-se acionar o fabricante.";
                        dados = { garantiaDiasLoja: 90 };
                        break;
                    case "horario_funcionamento":
                        reposta = "Segunda a Sábado das 09h às 19h. Domingos e Feriados não abrimos.";
                        dados = { horario: "Seg-Sab 09:00-19:00" };
                        break;
                    case "endereco_loja":
                        reposta = "Av. Monsenhor Angelo Sampaio, nº 100, Centro - Petrolina-PE, CEP 56304-920.";
                        dados = { enderecoCompleto: "Av. Monsenhor Angelo Sampaio, nº 100, Centro - Petrolina-PE", googleMapsUrl: "https://maps.google.com/?q=Av.+Monsenhor+Angelo+Sampaio,+100,+Petrolina-PE" };
                        break;
                    case "retirada_loja":
                        reposta = "A retirada pode ser feita pelo titular apresentando documento de identidade, ou por um terceiro mediante autorização e foto do documento do titular.";
                        dados = { aceitaTerceiros: true, documentoNecessario: true };
                        break;
                }

                return JSON.stringify({
                    source: "politicas_db",
                    storeId,
                    timestamp: new Date().toISOString(),
                    metadata: { topico },
                    politicaDetalhamento: reposta,
                    dadosEstruturados: dados
                });

            } catch (error) {
                console.error("[TOOL:Politicas] Erro ao buscar politicas:", error);
                return JSON.stringify({
                    source: "politicas_db",
                    error: "Falha técnica ao acessar as políticas da loja."
                });
            }
        },
    });
};
