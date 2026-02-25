import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.sandbox' });

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.SANDBOX_DATABASE_URL
        }
    }
});

async function main() {
    console.log("Checking recent conversations for LangGraph state sizes...");
    const convs = await prisma.conversation.findMany({
        orderBy: { updatedAt: 'desc' },
        take: 10
    });

    for (const c of convs) {
        const s = c as any;
        const stateSize = s.langgraphState ? JSON.stringify(s.langgraphState).length : 0;
        console.log(`Conv ${c.id} | Phone: ${c.customerPhone} | msgCount: ${c.messageCount} | State Size: ${stateSize} bytes`);
    }
    await prisma.$disconnect();
}

main().catch(console.error);
