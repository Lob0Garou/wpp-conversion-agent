import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.sandbox' });
process.env.DATABASE_URL = process.env.SANDBOX_DATABASE_URL;

import { LangGraphRuntime } from '../src/lib/agent/runtime-langgraph';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.SANDBOX_DATABASE_URL
        }
    }
});

async function main() {
    console.log("Starting 20 turns compaction test...");

    const cust = await prisma.customer.create({
        data: {
            phone: `5511${Date.now()}`.substring(0, 13),
            name: "Test Compaction",
            store: {
                connect: { id: "cm78c59p60000aayzrmm3ryc4" }
            }
        }
    });

    const conv = await prisma.conversation.create({
        data: {
            storeId: "cm78c59p60000aayzrmm3ryc4", // Centauro sandbox
            customerId: cust.id,
            status: "active",
            messageCount: 0,
            slots: {}
        }
    });

    const runtime = new LangGraphRuntime();
    const context = {
        conversationId: conv.id,
        customerId: cust.id,
        customerPhone: cust.phone,
        storeId: conv.storeId
    };

    const messages = [
        "Oi, tudo bem?",
        "Meu nome é Yuri, qual o seu?",
        "Você vende tênis?",
        "Tem da Nike?",
        "Qual o preço?",
        "Tem tamanho 42?",
        "Quais as cores disponíveis para esse Nike 42?",
        "Aceitam PIX na loja?",
        "Legal. Qual o prazo de entrega se eu pedir agora?",
        "Eles têm garantia legal?",
        "Entendi. Como faço pra trocar se por acaso o 42 ficar apertado?",
        "Para acelerar as coisas, vocês têm loja física em SP?",
        "Maravilha. Por acaso vende meia também para combinar?",
        "Rolaria um descontinho se eu levar os dois (o tênis Nike e a meia)?",
        "Ah legal. Qual o material desse tênis?",
        "Certeza que é original né?",
        "Beleza, após o pagamento, como eu rastreio meu pedido?",
        "Ao invés de entregar, tem como eu simplesmente retirar na loja?",
        "Aliás, teremos promoção dele na Black Friday?",
        "Fechado, vou querer o Nike branco tamanho 42."
    ];

    try {
        for (let i = 0; i < messages.length; i++) {
            console.log(`\n\n--- Turno ${i + 1} ---`);
            console.log(`User: ${messages[i]}`);

            const result: any = await (runtime.generateReply as any)(messages[i], context);
            // LangGraph generateReply usually returns { messages: [AIMessage] } or similar based on AgentRuntime interface. 
            // In our `callModel` implementation we mapped response to what `Orchestrator` expects, but let's just log result stringified.
            console.log(`Agent:`, JSON.stringify(result));

            const c = await prisma.conversation.findUnique({ where: { id: conv.id } });
            const s = c as any;
            const size = s.langgraphState ? JSON.stringify(s.langgraphState).length : 0;
            console.log(`-> STATE SIZE: ${size} bytes`);
        }

        console.log(`\n=== TEST DONE ===`);
        const c = await prisma.conversation.findUnique({ where: { id: conv.id } });
        const s = c as any;
        console.log(`Final state size: ${s.langgraphState ? JSON.stringify(s.langgraphState).length : 0} bytes`);
    } finally {
        await prisma.conversation.delete({ where: { id: conv.id } });
        console.log("Cleanup done.");
    }
}

main().catch(err => {
    console.error("FATAL ERROR IN SCRIPT:");
    console.error(err);
    process.exit(1);
});
