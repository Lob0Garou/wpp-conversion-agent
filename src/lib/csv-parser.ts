// ─── csv-parser.ts ─────────────────────────────────────────────────
// Faz parse do CSV de estoque da loja no formato da Centauro/genérico.
// Colunas esperadas (case-insensitive, BOM-tolerante):
//   Codigo | SKU | Produto | Descricao | Marca | Grupo | Tamanho | Qtd | Quantide | Preco | Price

export interface ParsedProduct {
    sku: string;
    description: string;
    brand?: string;
    groupName?: string;
    size?: string;
    quantity: number;
    price?: number;
}

export interface ParseResult {
    valid: ParsedProduct[];
    invalid: { line: number; reason: string; raw: string }[];
    totalRows: number;
}

// Normalize header: lowercase, sem acentos, sem espaços extras
function normalizeHeader(h: string): string {
    return h
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "_");
}

// Resolver mapeamento de colunas a partir dos cabeçalhos reais
function resolveColumns(headers: string[]): Record<string, number> {
    const map: Record<string, number> = {};
    const normalized = headers.map(normalizeHeader);

    const ALIASES: Record<string, string[]> = {
        sku: ["sku", "codigo", "cod", "ref", "referencia"],
        description: ["descricao", "produto", "description", "nome", "sku_description"],
        brand: ["marca", "brand"],
        groupName: ["grupo", "group", "categoria", "category", "grupo_nome", "dept_name"],
        size: ["tamanho", "size", "tam", "numero", "num"],
        quantity: ["qtd", "quantidade", "qty", "estoque", "saldo", "expected"],
        price: ["preco", "price", "valor", "preco_venda"],
    };

    for (const [field, aliases] of Object.entries(ALIASES)) {
        const idx = normalized.findIndex(n => aliases.includes(n));
        if (idx !== -1) map[field] = idx;
    }

    return map;
}

// Parsear número no formato brasileiro (1.234,56 → 1234.56)
function parseBrNumber(value: string): number {
    if (!value || value.trim() === "") return NaN;
    const cleaned = value.trim()
        .replace(/[R$\s]/g, "")
        .replace(/\./g, "")     // milhar
        .replace(",", ".");     // decimal
    return parseFloat(cleaned);
}

// Parsear uma linha CSV simples (sem suporte a aspas com vírgula interna)
function parseLine(line: string, delimiter: string): string[] {
    // Suporte básico a aspas
    const result: string[] = [];
    let current = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"' && !inQuote) { inQuote = true; continue; }
        if (ch === '"' && inQuote) { inQuote = false; continue; }
        if (ch === delimiter && !inQuote) { result.push(current.trim()); current = ""; continue; }
        current += ch;
    }
    result.push(current.trim());
    return result;
}

export function parseInventoryCSV(raw: string): ParseResult {
    // Remover BOM (UTF-8 BOM = 0xEF 0xBB 0xBF)
    const cleaned = raw.replace(/^\uFEFF/, "").trim();

    const lines = cleaned.split(/\r?\n/).filter(l => l.trim() !== "");
    if (lines.length < 2) {
        return { valid: [], invalid: [{ line: 0, reason: "Arquivo vazio ou sem dados", raw: "" }], totalRows: 0 };
    }

    // Detectar delimitador (;, ,, \t)
    const firstLine = lines[0];
    const delimiter = firstLine.includes(";") ? ";" : firstLine.includes("\t") ? "\t" : ",";

    const headers = parseLine(firstLine, delimiter);
    const colMap = resolveColumns(headers);

    if (colMap.description === undefined && colMap.sku === undefined) {
        return {
            valid: [],
            invalid: [{ line: 1, reason: "Cabeçalho não reconhecido — nenhuma coluna de produto/SKU/descrição encontrada", raw: firstLine }],
            totalRows: 0,
        };
    }

    const valid: ParsedProduct[] = [];
    const invalid: { line: number; reason: string; raw: string }[] = [];

    for (let i = 1; i < lines.length; i++) {
        const lineNum = i + 1;
        const raw = lines[i];
        const cols = parseLine(raw, delimiter);

        const description = colMap.description !== undefined ? cols[colMap.description] ?? "" : "";
        const sku = colMap.sku !== undefined ? cols[colMap.sku] ?? "" : "";

        if (!description && !sku) {
            invalid.push({ line: lineNum, reason: "Produto e SKU ausentes", raw });
            continue;
        }

        const qtyRaw = colMap.quantity !== undefined ? cols[colMap.quantity] ?? "" : "";
        const qty = parseInt(qtyRaw.trim()) || 0;
        if (qty < 0) {
            invalid.push({ line: lineNum, reason: `Quantidade inválida: "${qtyRaw}"`, raw });
            continue;
        }

        const priceRaw = colMap.price !== undefined ? cols[colMap.price] ?? "" : "";
        const price = priceRaw ? parseBrNumber(priceRaw) : undefined;

        valid.push({
            sku: sku || description.slice(0, 40),
            description: description || sku,
            brand: colMap.brand !== undefined ? cols[colMap.brand] || undefined : undefined,
            groupName: colMap.groupName !== undefined ? cols[colMap.groupName] || undefined : undefined,
            size: colMap.size !== undefined ? cols[colMap.size] || undefined : undefined,
            quantity: qty,
            price: price !== undefined && isNaN(price) ? undefined : price,
        });
    }

    return {
        valid,
        invalid,
        totalRows: lines.length - 1,
    };
}
