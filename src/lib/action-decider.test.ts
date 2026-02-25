/**
 * Testes para action-decider.ts
 * Execute com: npx tsx src/lib/action-decider.test.ts
 */

import { decideAction, type AgentAction, type ActionDecisionContext } from "./action-decider";

// ─── HELPERS ───

function createContext(overrides: Partial<ActionDecisionContext> = {}): ActionDecisionContext {
    return {
        intent: "SALES",
        state: "greeting",
        slots: {},
        frustrationLevel: 0,
        lastQuestionType: null,
        hasClosingSignal: false,
        ...overrides,
    };
}

function test(name: string, fn: () => void) {
    try {
        fn();
        console.log(`✅ ${name}`);
    } catch (error) {
        console.error(`❌ ${name}`);
        console.error(error);
        process.exit(1);
    }
}

function expect(actual: AgentAction): {
    toBe: (expected: AgentAction) => void;
} {
    return {
        toBe(expected: AgentAction) {
            if (actual !== expected) {
                throw new Error(`Expected ${expected}, got ${actual}`);
            }
        },
    };
}

// ─── TESTS: FRUSTRATION ───

test("High frustration (>=3) should ESCALATE", () => {
    const ctx = createContext({ frustrationLevel: 3 });
    const action = decideAction(ctx);
    expect(action).toBe("ESCALATE");
});

test("Frustration level 2 should NOT escalate", () => {
    const ctx = createContext({ frustrationLevel: 2 });
    const action = decideAction(ctx);
    expect(action).toBe("ASK_PRODUCT"); // default for greeting
});

// ─── TESTS: HANDOFF ───

test("HANDOFF intent should ESCALATE", () => {
    const ctx = createContext({ intent: "HANDOFF" });
    const action = decideAction(ctx);
    expect(action).toBe("ESCALATE");
});

// ─── TESTS: SALES FLOW ───

test("SALES + greeting + no slots → ASK_PRODUCT", () => {
    const ctx = createContext({ intent: "SALES", state: "greeting", slots: {} });
    const action = decideAction(ctx);
    expect(action).toBe("ASK_PRODUCT");
});

test("SALES + discovery + no product → ASK_PRODUCT", () => {
    const ctx = createContext({ intent: "SALES", state: "discovery", slots: {} });
    const action = decideAction(ctx);
    expect(action).toBe("ASK_PRODUCT");
});

test("SALES + discovery + product but no usage → ASK_USAGE", () => {
    const ctx = createContext({
        intent: "SALES",
        state: "discovery",
        slots: { product: "Nike Air Max" },
    });
    const action = decideAction(ctx);
    expect(action).toBe("ASK_USAGE");
});

test("SALES + discovery + product + usage but no size → ASK_SIZE", () => {
    const ctx = createContext({
        intent: "SALES",
        state: "discovery",
        slots: { product: "Nike Air Max", usage: "running" },
    });
    const action = decideAction(ctx);
    expect(action).toBe("ASK_SIZE");
});

test("SALES + discovery + product + usage + size → SHOW_PRODUCT", () => {
    const ctx = createContext({
        intent: "SALES",
        state: "discovery",
        slots: { product: "Nike Air Max", usage: "running", size: "42" },
    });
    const action = decideAction(ctx);
    expect(action).toBe("SHOW_PRODUCT");
});

test("SALES + proposal + product + size → OFFER_RESERVATION", () => {
    const ctx = createContext({
        intent: "SALES",
        state: "proposal",
        slots: { product: "Nike Air Max", size: "42" },
    });
    const action = decideAction(ctx);
    expect(action).toBe("OFFER_RESERVATION");
});

test("SALES + closing + hasClosingSignal → OFFER_RESERVATION", () => {
    const ctx = createContext({
        intent: "SALES",
        state: "closing",
        slots: { product: "Nike Air Max", size: "42" },
        hasClosingSignal: true,
    });
    const action = decideAction(ctx);
    expect(action).toBe("OFFER_RESERVATION");
});

// ─── TESTS: OBJECTION ───

test("OBJECTION + product + size → OFFER_RESERVATION", () => {
    const ctx = createContext({
        intent: "OBJECTION",
        state: "proposal",
        slots: { product: "Nike Air Max", size: "42" },
    });
    const action = decideAction(ctx);
    expect(action).toBe("OFFER_RESERVATION");
});

test("OBJECTION + product but no size → ASK_SIZE", () => {
    const ctx = createContext({
        intent: "OBJECTION",
        state: "proposal",
        slots: { product: "Nike Air Max" },
    });
    const action = decideAction(ctx);
    expect(action).toBe("ASK_SIZE");
});

// ─── TESTS: SAC FLOWS ───

test("SAC_TROCA + no orderId/cpf → REQUEST_ORDER_DATA", () => {
    const ctx = createContext({ intent: "SAC_TROCA", slots: {} });
    const action = decideAction(ctx);
    expect(action).toBe("REQUEST_ORDER_DATA");
});

test("SAC_TROCA + has orderId + cpf → PROVIDE_POLICY", () => {
    const ctx = createContext({
        intent: "SAC_TROCA",
        slots: { orderId: "PED12345", cpf: "12345678900" },
    });
    const action = decideAction(ctx);
    expect(action).toBe("PROVIDE_POLICY");
});

test("SAC_ATRASO + no orderId/cpf → REQUEST_ORDER_DATA", () => {
    const ctx = createContext({ intent: "SAC_ATRASO", slots: {} });
    const action = decideAction(ctx);
    expect(action).toBe("REQUEST_ORDER_DATA");
});

test("SAC_ATRASO + has orderId + cpf → PROVIDE_POLICY", () => {
    const ctx = createContext({
        intent: "SAC_ATRASO",
        slots: { orderId: "PED12345", cpf: "12345678900" },
    });
    const action = decideAction(ctx);
    expect(action).toBe("PROVIDE_POLICY");
});

test("SAC_RETIRADA + no orderId/cpf → REQUEST_ORDER_DATA", () => {
    const ctx = createContext({ intent: "SAC_RETIRADA", slots: {} });
    const action = decideAction(ctx);
    expect(action).toBe("REQUEST_ORDER_DATA");
});

test("SAC_REEMBOLSO + no orderId/cpf → REQUEST_ORDER_DATA", () => {
    const ctx = createContext({ intent: "SAC_REEMBOLSO", slots: {} });
    const action = decideAction(ctx);
    expect(action).toBe("REQUEST_ORDER_DATA");
});

// ─── TESTS: SUPPORT ───

test("SUPPORT intent → LLM_FALLBACK", () => {
    const ctx = createContext({ intent: "SUPPORT" });
    const action = decideAction(ctx);
    expect(action).toBe("LLM_FALLBACK");
});

test("CLARIFICATION intent → LLM_FALLBACK", () => {
    const ctx = createContext({ intent: "CLARIFICATION" });
    const action = decideAction(ctx);
    expect(action).toBe("LLM_FALLBACK");
});

// ─── TESTS: BRAND-ONLY PRODUCT (nova regra) ───
// Marca sozinha (ex: "adidas") não deve acionar OFFER_RESERVATION nem SHOW_PRODUCT
// sem antes perguntar categoria/uso

test("SALES + discovery + brand-only product (no categoria) → ASK_USAGE", () => {
    // "Adidas tamanho 40" — slots.product === slots.marca → brand-only
    const ctx = createContext({
        intent: "SALES",
        state: "discovery",
        slots: { product: "adidas", marca: "adidas", size: "40" },
    });
    const action = decideAction(ctx);
    expect(action).toBe("ASK_USAGE");
});

test("SALES + hasClosingSignal + brand-only product → ASK_USAGE", () => {
    // "Quero Adidas tamanho 40" — tem closing signal mas só a marca
    const ctx = createContext({
        intent: "SALES",
        state: "discovery",
        slots: { product: "adidas", marca: "adidas", size: "40" },
        hasClosingSignal: true,
    });
    const action = decideAction(ctx);
    expect(action).toBe("ASK_USAGE");
});

test("SALES + discovery + brand + categoria + size → SHOW_PRODUCT", () => {
    // "Tênis Adidas tamanho 40" — tem categoria, agora sim pode mostrar produto
    const ctx = createContext({
        intent: "SALES",
        state: "discovery",
        slots: { product: "adidas", marca: "adidas", categoria: "tenis", size: "40", usage: "casual" },
    });
    const action = decideAction(ctx);
    expect(action).toBe("SHOW_PRODUCT");
});

test("SALES + hasClosingSignal + brand + categoria + size → OFFER_RESERVATION", () => {
    // "Quero tênis Adidas tamanho 40" — suficiente para oferecer reserva
    const ctx = createContext({
        intent: "SALES",
        state: "closing",
        slots: { product: "adidas", marca: "adidas", categoria: "tenis", size: "40" },
        hasClosingSignal: true,
    });
    const action = decideAction(ctx);
    expect(action).toBe("OFFER_RESERVATION");
});

// ─── SUMMARY ───

console.log("\n✅ Todos os testes passaram!");
