
import { PrismaClient } from '@prisma/client';
import { acquireLock, releaseLock } from '../src/lib/concurrency';

const prisma = new PrismaClient();

async function main() {
    console.log("🔒 Iniciando Teste de Concorrência e Timezone...");

    // 1. Setup: Criar loja e conversa de teste
    const phoneNumberId = "TEST_LOCK_" + Date.now();
    const store = await prisma.store.create({
        data: {
            name: "Test Lock Store",
            phoneNumber: phoneNumberId,
            phoneNumberId: phoneNumberId,
            config: {},
        }
    });

    const customer = await prisma.customer.create({
        data: {
            storeId: store.id,
            phone: "5511999999999",
            name: "Tester"
        }
    });

    const conversation = await prisma.conversation.create({
        data: {
            storeId: store.id,
            customerId: customer.id,
            status: "open",
            currentState: "greeting"
        }
    });

    console.log(`✅ Conversa criada: ${conversation.id}`);

    // 2. Teste de Timezone
    console.log("\n--- Tester de Timezone ---");
    const nowApp = new Date();
    await prisma.conversation.update({
        where: { id: conversation.id },
        data: { processingUntil: nowApp }
    });
    const convCheck = await prisma.conversation.findUnique({ where: { id: conversation.id } });
    console.log(`App Time: ${nowApp.toISOString()}`);
    console.log(`DB Time : ${convCheck?.processingUntil?.toISOString()}`);

    // Pequena tolerância para delay de rede/execução
    const diff = Math.abs(convCheck!.processingUntil!.getTime() - nowApp.getTime());
    if (diff > 1000) {
        console.warn(`⚠️ ALERTA: Diferença de tempo > 1s detectada (${diff}ms). Possível Timezone Mismatch!`);
    } else {
        console.log("✅ Timezones parecem sincronizados (Diff < 1s).");
    }

    // 3. Teste de Aquisição Normal
    console.log("\n--- Teste 1: Aquisição Normal ---");
    // Limpar lock
    await prisma.conversation.update({ where: { id: conversation.id }, data: { processingUntil: null } });

    const locked1 = await acquireLock(conversation.id, 10);
    console.log(`Tentativa 1 (Esperado: true): ${locked1}`);
    if (!locked1) throw new Error("Falha ao adquirir lock livre!");

    // 4. Teste de Bloqueio (Lock Ativo)
    console.log("\n--- Teste 2: Bloqueio por Lock Ativo ---");
    const locked2 = await acquireLock(conversation.id, 10);
    console.log(`Tentativa 2 (Esperado: false): ${locked2}`);
    if (locked2) throw new Error("Adquiriu lock que deveria estar ocupado!");

    // 5. Teste de "Roubo" de Lock Expirado (Zombie Lock)
    console.log("\n--- Teste 3: Roubo de Lock Expirado (Zombie) ---");
    // Simular lock expirado (5 minutos atrás)
    const past = new Date(Date.now() - 5 * 60 * 1000);
    await prisma.conversation.update({
        where: { id: conversation.id },
        data: { processingUntil: past }
    });
    console.log(`Forçado lock expirado para: ${past.toISOString()}`);

    const locked3 = await acquireLock(conversation.id, 10);
    console.log(`Tentativa 3 (Esperado: true - Steal): ${locked3}`);

    if (!locked3) {
        console.error("❌ FALHA: Não conseguiu roubar o lock expirado!");
        // Diagnóstico
        const check = await prisma.conversation.findUnique({ where: { id: conversation.id } });
        console.log("Estado atual no banco:", check?.processingUntil);
        console.log("Agora:", new Date());
    } else {
        console.log("✅ Sucesso: Lock zumbi roubado corretamente.");
    }

    // Cleanup
    console.log("\n🧹 Limpeza...");
    await prisma.conversation.deleteMany({ where: { storeId: store.id } });
    await prisma.customer.deleteMany({ where: { storeId: store.id } });
    await prisma.store.delete({ where: { id: store.id } });
    console.log("✅ Limpeza concluída.");
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
