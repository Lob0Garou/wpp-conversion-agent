import { PrismaClient } from '@prisma/client';
import * as path from 'path';

const dbPath = path.resolve(process.cwd(), 'tests_harness', 'test_harness.db');
const p = new PrismaClient({ datasources: { db: { url: 'file:' + dbPath } } });

async function main() {
    const stores = await p.store.findMany();
    console.log('Stores:', JSON.stringify(stores, null, 2));
    const convCount = await p.conversation.count();
    console.log('Conv count:', convCount);
}

main().catch(console.error).finally(() => p.$disconnect());
