import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(
    request: NextRequest,
    props: { params: Promise<{ id: string }> }
) {
    try {
        const params = await props.params;
        const body = await request.json();
        const { status } = body;

        if (!status) {
            return NextResponse.json({ error: "Missing status field" }, { status: 400 });
        }

        const updated = await prisma.conversation.update({
            where: { id: params.id },
            data: { status },
        });

        return NextResponse.json(updated);
    } catch (error) {
        console.error("[API] Error updating conversation:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
