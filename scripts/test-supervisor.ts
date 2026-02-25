import { HumanMessage } from "@langchain/core/messages";
import { supervisorNode } from "../src/lib/agent/graph/nodes";

async function main() {
    console.log("Testing Supervisor Route Classification");

    const tests = [
        { message: "Oi, quero comprar um tênis Nike", expected: "vendas" },
        { message: "Meu pedido está atrasado, onde ele está?", expected: "sac" },
        { message: "Tem tamanho 42 daquela bota amarela?", expected: "vendas" },
        { message: "Quero devolver o produto que comprei", expected: "sac" },
        { message: "Qual o preço dessa camiseta?", expected: "vendas" },
        { message: "A sola descolou, como funciona a garantia?", expected: "sac" },
    ];

    for (const t of tests) {
        console.log(`\nInput: "${t.message}" -> Expected: ${t.expected}`);
        const state: any = {
            messages: [new HumanMessage(t.message)],
            summary: "",
            storeId: "test-store",
            conversationId: "123",
            customerId: "456",
            customerPhone: "5511999999999",
            activeAgent: "supervisor"
        };

        const result = await supervisorNode(state);
        console.log(`Result: -> ${result.activeAgent}`);
        if (result.activeAgent !== t.expected) {
            console.error(`FAILED! Expected ${t.expected} but got ${result.activeAgent}`);
        } else {
            console.log(`PASS!`);
        }
    }
}

main().catch(console.error);
