import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: "file:./sandbox.db"
        }
    }
});

async function main() {
    console.log("Checking recent conversations for LangGraph state sizes using Prisma...");
    const convs = await prisma.conversation.findMany({
        orderBy: { startedAt: 'desc' },
        take: 5
    });

    for (const c of convs) {
        const s = c as any;
        const stateSize = s.langgraphState ? JSON.stringify(s.langgraphState).length : 0;
        console.log(`Conv ${c.id} | Status: ${c.status} | msgCount: ${c.messageCount} | State Size: ${stateSize} bytes`);
    }
    await prisma.$disconnect();
}

main().catch(console.error);
