// ─── xlsx-parser.ts ─────────────────────────────────────────────
// Faz parse de arquivos .xlsx de estoque (fonte AGREGADA).
// Produto XLSX = sem SKU nem size por linha → source: AGGREGATED.
// Colunas esperadas (case-insensitive):
//   Modelo | Produto | Grupo | Categoria | Marca | Brand | Qtd | Quantidade | Preço

import * as XLSX from "xlsx";
import type { ParsedProduct, ParseResult } from "./csv-parser";

// Normalize header: lowercase, sem acentos, sem espaços
function normalizeHeader(h: string): string {
    return String(h)
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "_");
}

const ALIASES: Record<string, string[]> = {
    description: ["descricao", "produto", "description", "nome", "modelo", "sku_description", "produto_nome"],
    brand:       ["marca", "brand", "fabricante"],
    groupName:   ["grupo", "group", "categoria", "category", "grupo_nome", "dept_name", "departamento"],
    quantity:    ["qtd", "quantidade", "qty", "estoque", "saldo", "expected", "disponivel"],
    price:       ["preco", "price", "valor", "preco_venda", "vlr_venda"],
};

function resolveColumns(headers: string[]): Record<string, number> {
    const map: Record<string, number> = {};
    const normalized = headers.map(normalizeHeader);

    for (const [field, aliases] of Object.entries(ALIASES)) {
        for (const alias of aliases) {
            const idx = normalized.indexOf(alias);
            if (idx !== -1) {
                map[field] = idx;
                break;
            }
        }
    }
    return map;
}

/**
 * Faz parse de um arquivo .xlsx e retorna lista de ParsedProduct.
 * Produtos XLSX não terão SKU nem size — serão tratados como AGGREGATED
 * pelo stock-agent (inferência: `sku && size` ausentes → AGGREGATED).
 *
 * @param buffer - ArrayBuffer do arquivo .xlsx
 * @param fileName - nome do arquivo (para logs)
 */
export function parseInventoryXLSX(
    buffer: ArrayBuffer,
    fileName = "arquivo.xlsx"
): ParseResult {
    const valid: ParsedProduct[] = [];
    const invalid: { line: number; reason: string; raw: string }[] = [];

    try {
        const workbook = XLSX.read(buffer, { type: "array" });

        // Usa a primeira aba
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
            return { valid: [], invalid: [{ line: 0, reason: "Arquivo XLSX sem abas", raw: fileName }], totalRows: 0 };
        }

        const sheet = workbook.Sheets[sheetName];
        // Convert para array de arrays
        const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

        if (rows.length < 2) {
            return { valid: [], invalid: [], totalRows: 0 };
        }

        // Primeira linha = cabeçalho
        const headers = (rows[0] as string[]).map(String);
        const col = resolveColumns(headers);

        if (col.description === undefined) {
            return {
                valid: [],
                invalid: [{ line: 1, reason: "Coluna de descrição/produto não encontrada", raw: headers.join(", ") }],
                totalRows: rows.length - 1,
            };
        }

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i] as unknown[];
            const lineNum = i + 1;

            const rawDescription = String(row[col.description] ?? "").trim();
            if (!rawDescription) {
                // Linha vazia — ignorar silenciosamente
                continue;
            }

            // Quantity
            let quantity = 0;
            if (col.quantity !== undefined) {
                const rawQty = String(row[col.quantity] ?? "0").replace(",", ".").trim();
                quantity = parseInt(rawQty, 10);
                if (isNaN(quantity)) quantity = 0;
            }

            // Price (opcional)
            let price: number | undefined;
            if (col.price !== undefined) {
                const rawPrice = String(row[col.price] ?? "").replace(/[^0-9,.]/g, "").replace(",", ".");
                const parsed = parseFloat(rawPrice);
                if (!isNaN(parsed) && parsed > 0) price = parsed;
            }

            const product: ParsedProduct = {
                sku: "",                                                           // sem SKU → AGGREGATED
                description: rawDescription,
                brand: col.brand !== undefined ? String(row[col.brand] ?? "").trim() || undefined : undefined,
                groupName: col.groupName !== undefined ? String(row[col.groupName] ?? "").trim() || undefined : undefined,
                size: undefined,                                                   // sem size → AGGREGATED
                quantity,
                price,
            };

            if (!product.description) {
                invalid.push({ line: lineNum, reason: "Descrição vazia", raw: row.join("|") });
                continue;
            }

            valid.push(product);
        }
    } catch (err) {
        invalid.push({ line: 0, reason: `Erro ao ler XLSX: ${String(err)}`, raw: fileName });
    }

    return {
        valid,
        invalid,
        totalRows: valid.length + invalid.length,
    };
}
