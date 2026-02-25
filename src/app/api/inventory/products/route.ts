import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ─── GET /api/inventory/products?groupName=&brand= ───
// Retorna produtos individuais de um grupo, para expansão na EstoqueTab.
// Cada produto inclui source (DETAILED | AGGREGATED) inferido pelo stock-agent.

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const groupName = searchParams.get("groupName");
        const brand = searchParams.get("brand");

        const store = await prisma.store.findFirst({ where: { active: true } });
        if (!store) return NextResponse.json({ error: "Store não encontrada" }, { status: 404 });

        // Condições WHERE dinâmicas
        let whereClause = `store_id = '${store.id}'`;
        if (groupName && groupName !== "—") {
            whereClause += ` AND group_name = '${groupName.replace(/'/g, "''")}'`;
        }
        if (brand && brand !== "—") {
            whereClause += ` AND brand = '${brand.replace(/'/g, "''")}'`;
        }

        const rows = await prisma.$queryRawUnsafe<{
            id: string;
            sku: string | null;
            description: string;
            brand: string | null;
            size: string | null;
            quantity: number;
            price: string | null;
        }[]>(`
            SELECT id, sku, description, brand, size, quantity, price::text AS price
            FROM products
            WHERE ${whereClause}
            ORDER BY
                CASE WHEN size ~ '^[0-9]+$' THEN size::int ELSE 9999 END ASC,
                size ASC,
                description ASC
            LIMIT 100
        `);

        return NextResponse.json(rows.map(p => ({
            id: p.id,
            sku: p.sku,
            description: p.description,
            brand: p.brand,
            size: p.size,
            quantity: p.quantity,
            price: p.price ? parseFloat(p.price) : null,
            // Inferência de fonte: DETAILED se tem sku E size
            source: (p.sku && p.size) ? "DETAILED" : "AGGREGATED",
        })));
    } catch (error) {
        console.error("[API/inventory/products GET]", error);
        return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }
}
