const { findRelevantProducts } = require('../src/lib/products');
const { prisma } = require('../src/lib/prisma');

// Mock context slots
const mockSlots = {};

async function test(query) {
    console.log(`\n--- Testando: "${query}" ---`);
    const store = await prisma.store.findFirst();
    if (!store) return console.log("Loja não encontrada.");

    const results = await findRelevantProducts(query, store.id, mockSlots);
    if (results.length === 0) {
        console.log("Nenhum produto encontrado.");
    } else {
        results.forEach(p => console.log(`- ${p.description} (Qtd: ${p.quantity})`));
    }
}

async function main() {
    await test("tem meia nike?");
    await test("chuteira society");
    await test("camisa do brasil");
    await test("tenis de corrida");
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
