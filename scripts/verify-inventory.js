const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("Verificando produtos no banco...");
    const count = await prisma.product.count();
    console.log(`Total de produtos: ${count}`);

    const sample = await prisma.product.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' }
    });

    console.log("Amostra de 5 produtos:");
    sample.forEach(p => {
        console.log(`- [${p.sku}] ${p.description} (Qtd: ${p.quantity})`);
    });
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
