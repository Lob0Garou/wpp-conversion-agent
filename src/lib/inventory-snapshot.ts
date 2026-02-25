// ─── inventory-snapshot.ts ───
// Gerencia o ciclo de vida de snapshots de estoque.
// O DB NÃO é source of truth — espelha o último CSV/XLSX importado.
//
// Fluxo de importação:
// 1. Parse do arquivo → validação
// 2. Criar InventoryImport com status=PENDING
// 3. Inserir produtos com importId (staging)
// 4. Transação atômica:
//    a) Marcar import anterior como SUPERSEDED
//    b) Marcar novo import como ACTIVE
//    c) Deletar produtos do import anterior
// 5. Se falhar, marcar import como FAILED

import { prisma } from "./prisma";
import type { ImportStatus } from "@prisma/client";

// ─── TYPES ───

export interface ActiveSnapshot {
    id: string;
    fileName: string;
    totalRows: number;
    validRows: number;
    importedAt: Date;
}

export interface SnapshotCheckResult {
    hasActiveSnapshot: boolean;
    snapshot: ActiveSnapshot | null;
}

function isMissingInventoryImportStatusField(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes("Unknown argument `status`");
}

// ─── CORE FUNCTIONS ───

/**
 * Verifica se existe um snapshot ativo para a loja.
 * Usado pelo Stock Agent para decidir se pode responder.
 */
export async function getActiveSnapshot(storeId: string): Promise<ActiveSnapshot | null> {
    try {
        const activeImport = await prisma.inventoryImport.findFirst({
            where: {
                storeId,
                status: "ACTIVE",
            },
            select: {
                id: true,
                fileName: true,
                totalRows: true,
                validRows: true,
                importedAt: true,
            },
        });

        return activeImport;
    } catch (error) {
        if (!isMissingInventoryImportStatusField(error)) throw error;
        console.warn("[SNAPSHOT] inventory_imports sem campo status no sandbox - usando import mais recente");
        return prisma.inventoryImport.findFirst({
            where: { storeId },
            orderBy: { importedAt: "desc" },
            select: {
                id: true,
                fileName: true,
                totalRows: true,
                validRows: true,
                importedAt: true,
            },
        });
    }
}

/**
 * Verifica se a loja tem snapshot ativo.
 * Atalho para validação no stock-agent.
 */
export async function hasActiveSnapshot(storeId: string): Promise<boolean> {
    try {
        const count = await prisma.inventoryImport.count({
            where: {
                storeId,
                status: "ACTIVE",
            },
        });
        return count > 0;
    } catch (error) {
        if (!isMissingInventoryImportStatusField(error)) throw error;
        const count = await prisma.inventoryImport.count({
            where: { storeId },
        });
        return count > 0;
    }
}

/**
 * Obtém o importId do snapshot ativo.
 * Retorna null se não houver snapshot ativo.
 */
export async function getActiveImportId(storeId: string): Promise<string | null> {
    try {
        const activeImport = await prisma.inventoryImport.findFirst({
            where: {
                storeId,
                status: "ACTIVE",
            },
            select: {
                id: true,
            },
        });
        return activeImport?.id ?? null;
    } catch (error) {
        if (!isMissingInventoryImportStatusField(error)) throw error;
        const latestImport = await prisma.inventoryImport.findFirst({
            where: { storeId },
            orderBy: { importedAt: "desc" },
            select: { id: true },
        });
        return latestImport?.id ?? null;
    }
}

/**
 * Cria um novo snapshot de estoque com staging + swap atômico.
 * 
 * @param storeId - ID da loja
 * @param fileName - Nome do arquivo importado
 * @param products - Produtos parseados e validados
 * @param sourceType - DETAILED (CSV) ou AGGREGATED (XLSX)
 * @returns ID do novo import ativo
 */
export async function createInventorySnapshot(
    storeId: string,
    fileName: string,
    products: Array<{
        sku: string | null;
        description: string;
        brand?: string | null;
        groupName?: string | null;
        size?: string | null;
        quantity: number;
        price?: number | null;
    }>,
    sourceType: "DETAILED" | "AGGREGATED",
    invalidRows: Array<{ line: number; reason: string; raw?: string }> = [],
    totalRows: number = products.length
): Promise<{ success: boolean; importId: string; error?: string }> {
    const importId = crypto.randomUUID();

    // 1. Criar registro de importação com status PENDING
    try {
        await prisma.inventoryImport.create({
            data: {
                id: importId,
                storeId,
                fileName,
                totalRows,
                validRows: products.length,
                invalidRows: invalidRows.length,
                errors: invalidRows.length > 0 ? invalidRows as unknown as object[] : undefined,
                status: "PENDING",
            },
        });
    } catch (error) {
        console.error("[SNAPSHOT] Erro ao criar registro de importação:", error);
        return { success: false, importId, error: "Falha ao criar registro de importação" };
    }

    // 2. Inserir produtos em staging (com importId)
    try {
        for (const p of products) {
            await prisma.product.create({
                data: {
                    storeId,
                    sku: p.sku ?? null,
                    description: p.description,
                    brand: p.brand ?? null,
                    groupName: p.groupName ?? null,
                    size: p.size ?? null,
                    quantity: p.quantity,
                    price: p.price ?? null,
                    importId,
                },
            });
        }
    } catch (error) {
        console.error("[SNAPSHOT] Erro ao inserir produtos:", error);
        // Marcar como FAILED
        await prisma.inventoryImport.update({
            where: { id: importId },
            data: { status: "FAILED" },
        });
        return { success: false, importId, error: "Falha ao inserir produtos" };
    }

    // 3. Transação atômica: swap de snapshots
    try {
        await prisma.$transaction(async (tx) => {
            // 3a. Buscar import ativo anterior
            const previousActive = await tx.inventoryImport.findFirst({
                where: {
                    storeId,
                    status: "ACTIVE",
                },
                select: { id: true },
            });

            // 3b. Se existe anterior, marcar como SUPERSEDED
            if (previousActive) {
                await tx.inventoryImport.update({
                    where: { id: previousActive.id },
                    data: {
                        status: "SUPERSEDED",
                        supersededAt: new Date(),
                    },
                });

                // 3c. Deletar produtos do import anterior
                await tx.product.deleteMany({
                    where: {
                        storeId,
                        importId: previousActive.id,
                    },
                });
            }

            // 3d. Marcar novo import como ACTIVE
            await tx.inventoryImport.update({
                where: { id: importId },
                data: { status: "ACTIVE" },
            });
        });

        console.log(`[SNAPSHOT] ✅ Snapshot ${importId} criado com ${products.length} produtos`);
        return { success: true, importId };
    } catch (error) {
        console.error("[SNAPSHOT] Erro no swap atômico:", error);
        // Marcar como FAILED
        await prisma.inventoryImport.update({
            where: { id: importId },
            data: { status: "FAILED" },
        });
        return { success: false, importId, error: "Falha no swap de snapshots" };
    }
}

/**
 * Obtém histórico de importações para exibição no admin.
 */
export async function getImportHistory(
    storeId: string,
    limit: number = 10
): Promise<Array<{
    id: string;
    fileName: string;
    totalRows: number;
    validRows: number;
    status: ImportStatus;
    importedAt: Date;
    supersededAt: Date | null;
}>> {
    const imports = await prisma.inventoryImport.findMany({
        where: { storeId },
        orderBy: { importedAt: "desc" },
        take: limit,
        select: {
            id: true,
            fileName: true,
            totalRows: true,
            validRows: true,
            status: true,
            importedAt: true,
            supersededAt: true,
        },
    });

    return imports;
}

/**
 * Conta produtos por fonte (DETAILED vs AGGREGATED) do snapshot ativo.
 */
export async function getActiveProductsSourceCount(storeId: string): Promise<{
    detailed: number;
    aggregated: number;
    total: number;
}> {
    const activeImportId = await getActiveImportId(storeId);

    if (!activeImportId) {
        return { detailed: 0, aggregated: 0, total: 0 };
    }

    const result = await prisma.$queryRaw<{ detailed: bigint; aggregated: bigint; total: bigint }[]>`
        SELECT
            COUNT(*) FILTER (WHERE sku IS NOT NULL AND size IS NOT NULL) AS detailed,
            COUNT(*) FILTER (WHERE sku IS NULL OR size IS NULL) AS aggregated,
            COUNT(*) AS total
        FROM products
        WHERE store_id = ${storeId} AND import_id = ${activeImportId}
    `;

    return {
        detailed: Number(result[0]?.detailed ?? 0),
        aggregated: Number(result[0]?.aggregated ?? 0),
        total: Number(result[0]?.total ?? 0),
    };
}
