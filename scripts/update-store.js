
const { PrismaClient } = require("@prisma/client");
require("dotenv").config({ path: ".env" });

const prisma = new PrismaClient();

async function main() {
    const realPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!realPhoneId) {
        console.error("❌ WHATSAPP_PHONE_NUMBER_ID not found in .env");
        process.exit(1);
    }

    console.log(`Updating store to use real Phone Number ID: ${realPhoneId}`);

    // Update the first active store
    const store = await prisma.store.findFirst({ where: { active: true } });

    if (!store) {
        console.error("❌ No active store found to update.");
        process.exit(1);
    }

    const updated = await prisma.store.update({
        where: { id: store.id },
        data: { phoneNumberId: realPhoneId },
    });

    console.log("✅ Store updated:", updated);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
