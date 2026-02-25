import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET() {
    return NextResponse.json({
        DATABASE_URL: process.env.DATABASE_URL,
        NODE_ENV: process.env.NODE_ENV,
        ENV: process.env.ENV,
        cwd: process.cwd(),
    });
}
