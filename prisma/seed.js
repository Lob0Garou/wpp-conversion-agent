
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
    const store = await prisma.store.create({
        data: {
            name: "Loja Teste",
            phoneNumber: "5585985963329", // Use the number from the user details
            phoneNumberId: "123456789",    // Mock ID or real one if known
            active: true,
            config: {},
        },
    });
    console.log("Store created:", store);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
