import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseInventoryCSV } from "@/lib/csv-parser";
import { parseInventoryXLSX } from "@/lib/xlsx-parser";
import { createInventorySnapshot, getActiveSnapshot, getImportHistory, getActiveProductsSourceCount } from "@/lib/inventory-snapshot";

// ─── POST /api/inventory/upload ───
// multipart/form-data: campo "file" (CSV ou XLSX)
// Implementa snapshot-based import: staging + swap atômico
export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get("file");

        if (!file || typeof file === "string") {
            return NextResponse.json({ error: "Campo 'file' ausente ou inválido" }, { status: 400 });
        }

        const blob = file as File;
        const fileName = blob.name.toLowerCase();
        const isXlsx = fileName.endsWith(".xlsx");
        const isCsv = fileName.endsWith(".csv") || fileName.endsWith(".txt");

        if (!isXlsx && !isCsv) {
            return NextResponse.json({ error: "Formato não suportado. Use .csv, .txt ou .xlsx" }, { status: 400 });
        }

        const store = await prisma.store.findFirst({ where: { active: true } });
        if (!store) return NextResponse.json({ error: "Store não encontrada" }, { status: 404 });

        // ── Parse: CSV = DETAILED, XLSX = AGGREGATED ──
        let valid: ReturnType<typeof parseInventoryCSV>["valid"];
        let invalid: ReturnType<typeof parseInventoryCSV>["invalid"];
        let totalRows: number;
        const sourceType: "DETAILED" | "AGGREGATED" = isXlsx ? "AGGREGATED" : "DETAILED";

        if (isXlsx) {
            const arrayBuffer = await blob.arrayBuffer();
            const parsed = parseInventoryXLSX(arrayBuffer, blob.name);
            valid = parsed.valid;
            invalid = parsed.invalid;
            totalRows = parsed.totalRows;
        } else {
            const raw = await blob.text();
            const parsed = parseInventoryCSV(raw);
            valid = parsed.valid;
            invalid = parsed.invalid;
            totalRows = parsed.totalRows;
        }

        if (valid.length === 0) {
            return NextResponse.json({
                success: false,
                error: invalid.length > 0
                    ? `Nenhum produto válido encontrado. Primeiro erro: ${invalid[0].reason}`
                    : "Arquivo vazio ou sem dados reconhecidos",
                totalRows,
                validRows: 0,
                invalidRows: invalid.length,
                inserted: 0,
                updated: 0,
                upserted: 0,
                skipped: 0,
                errors: invalid.slice(0, 20),
            }, { status: 422 });
        }

        // ── SNAPSHOT-BASED IMPORT ──
        // Criar snapshot com staging + swap atômico
        const result = await createInventorySnapshot(
            store.id,
            blob.name,
            valid,
            sourceType,
            invalid,
            totalRows
        );

        if (!result.success) {
            return NextResponse.json({
                success: false,
                error: result.error || "Falha na importação",
                importId: result.importId,
                totalRows,
                validRows: valid.length,
                invalidRows: invalid.length,
                inserted: 0,
                updated: 0,
                upserted: 0,
                skipped: valid.length,
                errors: invalid.slice(0, 20),
            }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            importId: result.importId,
            sourceType,
            totalRows,
            validRows: valid.length,
            invalidRows: invalid.length,
            inserted: valid.length, // Todos os produtos são novos no snapshot
            updated: 0, // No snapshot mode, não há atualização — é full refresh
            upserted: valid.length,
            skipped: 0,
            errors: invalid.slice(0, 20),
            message: "Snapshot criado com sucesso. O estoque anterior foi substituído.",
        });
    } catch (error) {
        console.error("[API/inventory/upload]", error);
        return NextResponse.json({ error: "Erro interno ao processar arquivo" }, { status: 500 });
    }
}

// ─── GET /api/inventory/upload — Sumário do estoque atual ───
export async function GET() {
    try {
        const store = await prisma.store.findFirst({ where: { active: true } });
        if (!store) return NextResponse.json({ error: "Store não encontrada" }, { status: 404 });

        // Buscar snapshot ativo
        const activeSnapshot = await getActiveSnapshot(store.id);

        // Sumário por grupo+marca (apenas do snapshot ativo)
        let summary: {
            groupName: string | null;
            brand: string | null;
            totalProducts: number;
            totalStock: number;
            outOfStock: number;
        }[] = [];

        if (activeSnapshot) {
            const rawSummary = await prisma.$queryRaw<{
                group_name: string | null;
                brand: string | null;
                total_products: bigint;
                total_stock: bigint;
                out_of_stock: bigint;
            }[]>`
                SELECT
                    group_name,
                    brand,
                    COUNT(*) AS total_products,
                    SUM(quantity) AS total_stock,
                    COUNT(*) FILTER (WHERE quantity = 0) AS out_of_stock
                FROM products
                WHERE store_id = ${store.id} AND import_id = ${activeSnapshot.id}
                GROUP BY group_name, brand
                ORDER BY total_stock DESC
                LIMIT 50
            `;
            summary = rawSummary.map(s => ({
                groupName: s.group_name,
                brand: s.brand,
                totalProducts: Number(s.total_products),
                totalStock: Number(s.total_stock),
                outOfStock: Number(s.out_of_stock),
            }));
        }

        // Histórico de importações
        const importHistory = await getImportHistory(store.id, 10);

        // Tickets de checagem pendentes
        const pendingTickets = await prisma.ticket.count({
            where: {
                storeId: store.id,
                category: { startsWith: "checagem_fisica" },
                status: "open",
            },
        });

        // Produtos por fonte (DETAILED vs AGGREGATED)
        const productsBySource = await getActiveProductsSourceCount(store.id);

        return NextResponse.json({
            summary,
            activeSnapshot: activeSnapshot ? {
                id: activeSnapshot.id,
                fileName: activeSnapshot.fileName,
                totalRows: activeSnapshot.totalRows,
                validRows: activeSnapshot.validRows,
                importedAt: activeSnapshot.importedAt,
            } : null,
            lastImport: importHistory[0] ?? null,
            importHistory: importHistory.map(r => ({
                id: r.id,
                fileName: r.fileName,
                totalRows: r.totalRows,
                validRows: r.validRows,
                status: r.status,
                importedAt: r.importedAt,
                supersededAt: r.supersededAt,
            })),
            pendingTickets,
            productsBySource,
        });
    } catch (error) {
        console.error("[API/inventory/upload GET]", error);
        return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }
}