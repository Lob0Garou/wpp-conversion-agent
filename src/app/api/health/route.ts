import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
    let database: "connected" | "error" = "error";

    try {
        await prisma.$queryRaw`SELECT 1`;
        database = "connected";
    } catch {
        database = "error";
    }

    const status = database === "connected" ? "ok" : "degraded";

    return NextResponse.json(
        {
            status,
            timestamp: new Date().toISOString(),
            database,
        },
        { status: status === "ok" ? 200 : 503 }
    );
}
