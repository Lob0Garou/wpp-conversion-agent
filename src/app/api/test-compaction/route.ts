import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma'; // Uses the app's global prisma instance

export async function GET() {
    try {
        const convs = await prisma.conversation.findMany({
            orderBy: { startedAt: 'desc' },
            take: 10
        });

        const results = convs.map(c => {
            const s = c as any;
            const size = s.langgraphState ? JSON.stringify(s.langgraphState).length : 0;
            return {
                id: c.id,
                messageCount: c.messageCount,
                stateSize: size
            };
        });

        return NextResponse.json({ results });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
