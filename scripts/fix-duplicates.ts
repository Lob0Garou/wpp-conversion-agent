
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function fixDuplicates() {
    console.log("🔍 Finding customers with multiple open conversations...");

    // 1. Fetch all customers with open conversations
    // 1. Fetch conversations without where clause on status to avoid validation error
    // We will filter in memory
    const validStatuses = ["open", "greeting", "discovery", "proposal", "closing", "post_sale", "support", "PENDING_HUMAN"];

    // 1. Force RAW query to bypass Prisma validation weirdness
    const rawConvs = await prisma.$queryRaw`
        SELECT c.*, cust.phone as "customer_phone" 
        FROM conversations c
        JOIN customers cust ON c.customer_id = cust.id
        WHERE c.status != 'closed'
        ORDER BY c.started_at DESC
    `;

    // Map to expected structure
    const openConversations = rawConvs.map((c: any) => ({
        id: c.id,
        customerId: c.customer_id,
        status: c.status,
        updatedAt: c.started_at, // Mapping started_at to updatedAt for script logic
        customer: {
            phone: c.customer_phone
        }
    }));

    // Group by customer
    const customerMap = new Map();
    for (const conv of openConversations) {
        if (!conv.customerId) continue;
        if (!customerMap.has(conv.customerId)) {
            customerMap.set(conv.customerId, []);
        }
        customerMap.get(conv.customerId).push(conv);
    }

    let mergedCount = 0;

    for (const [customerId, conversations] of customerMap.entries()) {
        // Filter only those with actual multiple open convs
        // We rely on the initial query filtering for 'open' status broadly, 
        // but let's strictly check against our 'closed' definition if needed.
        // Assuming the query above did the job.

        if (conversations.length <= 1) continue;

        const customerPhone = conversations[0].customer?.phone || "Unknown";
        console.log(`\nDuplicate found for Customer ${customerPhone} (ID: ${customerId}) - ${conversations.length} open conversations`);

        // Sort by updatedAt desc (index 0 is master)
        conversations.sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

        const master = conversations[0];
        const duplicates = conversations.slice(1);

        console.log(`   🌟 Master: ${master.id} (Updated: ${master.updatedAt})`);

        for (const dup of duplicates) {
            console.log(`   Start merging ${dup.id}...`);

            // 2. Move messages
            const updateResult = await prisma.message.updateMany({
                where: { conversationId: dup.id },
                data: { conversationId: master.id }
            });
            console.log(`       Moved ${updateResult.count} messages to master`);

            // 3. Close duplicate
            await prisma.conversation.update({
                where: { id: dup.id },
                data: {
                    status: "closed",
                    closedAt: new Date(),
                    // We can store a reason in metadata if we had a field, or just log it.
                    // Schema doesn't have 'closeReason' in the snapshot I saw, so skipping that field.
                }
            });
            console.log(`       Marked as closed.`);
            mergedCount++;
        }
    }

    console.log(`\n✅ Done! Merged ${mergedCount} duplicate conversations.`);
}

fixDuplicates()
    .catch((e) => {
        console.error("FULL ERROR DETAILS:", JSON.stringify(e, null, 2));
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
