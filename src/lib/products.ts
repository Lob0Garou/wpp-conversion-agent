import { prisma } from "./prisma";
import type { Slots } from "./state-manager";

const USAGE_SEARCH_KEYWORDS: Record<string, string[]> = {
    running: ["corrida", "running", "correr", "maratona", "cooper", "caminhada"],
    gym: ["academia", "treino", "crossfit", "musculação", "fitness"],
    casual: ["casual", "dia a dia", "passeio", "social"],
    football: ["futebol", "chuteira", "society", "futsal", "campo"],
};

export async function findRelevantProducts(
    userMessage: string,
    storeId: string,
    slots?: Partial<Slots>,
    importId?: string | null // Filtrar por snapshot ativo
) {
    try {
        // 1. Extract keywords from message
        const stopWords = [
            "quero", "tem", "você", "gostaria", "para", "com",
            "uma", "uns", "umas", "preço", "valor", "custa", "quanto",
            "esse", "aquele", "qual", "como", "onde", "quando",
        ];

        const words = userMessage
            .toLowerCase()
            .replace(/[^\w\sáéíóúãõâêîôûç]/gi, "")
            .split(/\s+/)
            .filter(w => w.length > 3 && !stopWords.includes(w));

        // 2. Build search terms: combine message keywords + slot context
        const searchTerms: string[] = [...words];

        // Add usage-related keywords from slots
        if (slots?.usage && USAGE_SEARCH_KEYWORDS[slots.usage]) {
            searchTerms.push(...USAGE_SEARCH_KEYWORDS[slots.usage]);
        }

        // Add product name from slots
        if (slots?.product) {
            searchTerms.push(slots.product.toLowerCase());
        }

        if (searchTerms.length === 0) {
            return [];
        }

        // 3. Pick the best search term (longest word = most specific)
        const mainKeyword = searchTerms.reduce((a, b) =>
            a.length > b.length ? a : b, ""
        );

        console.log(`[RAG] 🔍 Buscando produtos por: "${mainKeyword}"${slots?.usage ? ` (uso: ${slots.usage})` : ""}${importId ? ` (snapshot: ${importId.slice(0, 8)}...)` : ""}`);

        // 4. Build where clause - filtrar por importId se disponível (snapshot ativo)
        const whereClause: {
            storeId: string;
            description: { contains: string; mode: "insensitive" };
            quantity: { gt: number };
            importId?: string;
        } = {
            storeId: storeId,
            description: {
                contains: mainKeyword,
                mode: "insensitive",
            },
            quantity: {
                gt: 0,
            },
        };

        // Se temos importId do snapshot ativo, filtrar apenas por ele
        if (importId) {
            whereClause.importId = importId;
        }

        const products = await prisma.product.findMany({
            where: whereClause,
            take: 5,
            select: {
                description: true,
                quantity: true,
                sku: true,
                size: true,
                brand: true,
                groupName: true,
                price: true,
            },
        });

        console.log(`[RAG] ✅ Encontrados ${products.length} produtos.`);
        return products;

    } catch (error) {
        console.error("[RAG] ❌ Erro ao buscar produtos:", error);
        return [];
    }
}
