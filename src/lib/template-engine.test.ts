/**
 * Testes para template-engine.ts
 * Execute com: npx tsx src/lib/template-engine.test.ts
 */

import { TemplateEngine, type Template, type TemplateMatch } from "./template-engine";

// ─── HELPERS ───

const testTemplates: Template[] = [
    {
        id: "sales_ask_product",
        action: "ASK_PRODUCT",
        intent: "SALES",
        state: "greeting",
        requiredSlots: [],
        template: "Qual tênis você está procurando?",
        maxChars: 50,
        maxQuestions: 1,
    },
    {
        id: "sales_ask_usage",
        action: "ASK_USAGE",
        intent: "SALES",
        state: "discovery",
        requiredSlots: ["product"],
        template: "Pra qual uso? Corrida, academia ou dia a dia?",
        maxChars: 60,
        maxQuestions: 1,
    },
    {
        id: "sales_ask_size",
        action: "ASK_SIZE",
        intent: "SALES",
        state: "discovery",
        requiredSlots: ["product", "usage"],
        template: "Qual sua numeração?",
        maxChars: 25,
        maxQuestions: 1,
    },
    {
        id: "sales_offer_reservation",
        action: "OFFER_RESERVATION",
        intent: "SALES",
        state: "proposal",
        requiredSlots: ["product", "size"],
        template: "Temos o {product} no número {size}. Quer que eu separe?",
        maxChars: 70,
        maxQuestions: 1,
    },
    {
        id: "sac_delay_request_data",
        action: "REQUEST_ORDER_DATA",
        intent: "SAC_ATRASO",
        state: "support_sac",
        requiredSlots: [],
        template: "Me passa o número do pedido e CPF pra eu verificar?",
        maxChars: 60,
        maxQuestions: 1,
    },
    {
        id: "sac_refund_policy",
        action: "PROVIDE_POLICY",
        intent: "SAC_REEMBOLSO",
        state: "support_sac",
        requiredSlots: [],
        template: "O estorno é processado em até 10 dias úteis após o cancelamento.",
        maxChars: 80,
        maxQuestions: 0,
    },
];

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

function expect<T>(actual: T): {
    toBe: (expected: T) => void;
    toBeTruthy: () => void;
    toBeNull: () => void;
    toContain: (item: string) => void;
} {
    return {
        toBe(expected: T) {
            if (actual !== expected) {
                throw new Error(`Expected ${expected}, got ${actual}`);
            }
        },
        toBeTruthy() {
            if (!actual) {
                throw new Error(`Expected truthy value, got ${actual}`);
            }
        },
        toBeNull() {
            if (actual !== null) {
                throw new Error(`Expected null, got ${actual}`);
            }
        },
        toContain(item: string) {
            if (Array.isArray(actual)) {
                if (!actual.includes(item)) {
                    throw new Error(`Expected array to contain ${item}, got ${JSON.stringify(actual)}`);
                }
            } else {
                throw new Error(`Expected array but got ${typeof actual}`);
            }
        },
    };
}

// ─── TESTS ───

test("TemplateEngine should be instantiable", () => {
    const engine = new TemplateEngine();
    expect(engine.getMode()).toBe("passive");
});

test("Should match ASK_PRODUCT template in greeting", () => {
    const engine = new TemplateEngine(testTemplates);
    const match = engine.match("ASK_PRODUCT", "SALES", "greeting", {});
    expect(match).toBeTruthy();
    expect(match?.template.id).toBe("sales_ask_product");
});

test("Should match ASK_USAGE template in discovery with product slot", () => {
    const engine = new TemplateEngine(testTemplates);
    const match = engine.match("ASK_USAGE", "SALES", "discovery", { product: "Nike Air Max" });
    expect(match).toBeTruthy();
    expect(match?.template.id).toBe("sales_ask_usage");
});

test("Should fill template placeholders with slots", () => {
    const engine = new TemplateEngine(testTemplates);
    const match = engine.match("OFFER_RESERVATION", "SALES", "proposal", {
        product: "Nike Air Max",
        size: "42",
    });
    expect(match).toBeTruthy();
    expect(match?.filledText).toBe("Temos o Nike Air Max no número 42. Quer que eu separe?");
});

test("Should return null when no template matches", () => {
    const engine = new TemplateEngine(testTemplates);
    const match = engine.match("ESCALATE", "SALES", "greeting", {});
    expect(match).toBeNull();
});

test("Should return null when state doesn't match", () => {
    const engine = new TemplateEngine(testTemplates);
    const match = engine.match("ASK_USAGE", "SALES", "greeting", { product: "Nike" });
    expect(match).toBeNull();
});

test("Should return null when intent doesn't match", () => {
    const engine = new TemplateEngine(testTemplates);
    const match = engine.match("ASK_USAGE", "SUPPORT", "discovery", { product: "Nike" });
    expect(match).toBeNull();
});

test("hasTemplate should return true for existing template", () => {
    const engine = new TemplateEngine(testTemplates);
    const hasTemplate = engine.hasTemplate("ASK_PRODUCT", "SALES", "greeting");
    expect(hasTemplate).toBe(true);
});

test("hasTemplate should return false for non-existing template", () => {
    const engine = new TemplateEngine(testTemplates);
    const hasTemplate = engine.hasTemplate("ESCALATE", "SALES", "greeting");
    expect(hasTemplate).toBe(false);
});

test("Should track slots missing", () => {
    const engine = new TemplateEngine(testTemplates);
    const match = engine.match("ASK_SIZE", "SALES", "discovery", { product: "Nike" });
    expect(match).toBeTruthy();
    expect(match?.slotsMissing).toContain("usage");
});

test("setMode should change engine mode", () => {
    const engine = new TemplateEngine(testTemplates);
    expect(engine.getMode()).toBe("passive");
    engine.setMode("active");
    expect(engine.getMode()).toBe("active");
});

test("addTemplates should add new templates", () => {
    const engine = new TemplateEngine();
    engine.addTemplates(testTemplates);
    const stats = engine.getStats();
    expect(stats.totalTemplates).toBe(testTemplates.length);
});

// ─── SUMMARY ───

console.log("\n✅ Todos os testes passaram!");
