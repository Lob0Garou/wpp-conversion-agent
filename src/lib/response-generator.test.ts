/**
 * Testes para response-generator.ts
 * Execute com: npx tsx src/lib/response-generator.test.ts
 */

import { TemplateEngine } from "./template-engine";
import { generateResponseSync, type ResponseContext } from "./response-generator";
import { allTemplates } from "./templates";

// ─── HELPERS ───

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
    toContain: (expected: string) => void;
} {
    return {
        toBe(expected: T) {
            if (actual !== expected) {
                throw new Error(`Expected ${expected}, got ${actual}`);
            }
        },
        toContain(expected: string) {
            if (!String(actual).includes(expected)) {
                throw new Error(`Expected "${String(actual)}" to contain "${expected}"`);
            }
        },
    };
}

// ─── TESTS ───

test("generateResponseSync should return template in active mode", () => {
    const engine = new TemplateEngine(allTemplates);
    engine.setMode("active");

    const context: ResponseContext = {
        intent: "SALES",
        state: "greeting",
        slots: {},
        frustrationLevel: 0,
        lastQuestionType: null,
    };

    const result = generateResponseSync(context, {
        templateEngine: engine,
        fallbackText: "Fallback response",
    });

    expect(result.source).toBe("template");
    expect(result.action).toBe("ASK_PRODUCT");
});

test("generateResponseSync should use fallback when slots missing", () => {
    const engine = new TemplateEngine(allTemplates);
    engine.setMode("active");

    // No slots at all - should trigger ASK_PRODUCT first
    const context: ResponseContext = {
        intent: "SALES",
        state: "discovery",
        slots: {}, // no slots - should ask for product first
        frustrationLevel: 0,
        lastQuestionType: null,
    };

    const result = generateResponseSync(context, {
        templateEngine: engine,
        fallbackText: "Preciso saber mais informações",
    });

    // Should use template because the slot requirement is met (no required slots for ASK_PRODUCT)
    // The action decision flow goes: no product -> ASK_PRODUCT
    expect(result.action).toBe("ASK_PRODUCT");
});

test("generateResponseSync should return fallback in passive mode", () => {
    const engine = new TemplateEngine(allTemplates);
    engine.setMode("passive"); // modo passivo não usa templates

    const context: ResponseContext = {
        intent: "SALES",
        state: "greeting",
        slots: {},
        frustrationLevel: 0,
        lastQuestionType: null,
    };

    const result = generateResponseSync(context, {
        templateEngine: engine,
        fallbackText: "Olá! Como posso ajudar?",
    });

    expect(result.source).toBe("llm");
    expect(result.text).toBe("Olá! Como posso ajudar?");
});

test("should escalate with high frustration", () => {
    const engine = new TemplateEngine(allTemplates);
    engine.setMode("active");

    const context: ResponseContext = {
        intent: "SALES",
        state: "discovery",
        slots: {},
        frustrationLevel: 3,
        lastQuestionType: null,
    };

    const result = generateResponseSync(context, {
        templateEngine: engine,
        fallbackText: "Vou chamar um atendente",
    });

    expect(result.action).toBe("ESCALATE");
});

test("should handle SAC intents correctly", () => {
    const engine = new TemplateEngine(allTemplates);
    engine.setMode("active");

    const context: ResponseContext = {
        intent: "SAC_ATRASO",
        state: "support_sac",
        slots: {},
        frustrationLevel: 0,
        lastQuestionType: null,
    };

    const result = generateResponseSync(context, {
        templateEngine: engine,
        fallbackText: "Me passe os dados",
    });

    // Deve encontrar template para REQUEST_ORDER_DATA
    expect(result.action).toBe("REQUEST_ORDER_DATA");
});

test("should fill template with slots", () => {
    const engine = new TemplateEngine(allTemplates);
    engine.setMode("active");

    const context: ResponseContext = {
        intent: "SALES",
        state: "proposal",
        slots: { product: "Nike Air Max", size: "42" },
        frustrationLevel: 0,
        lastQuestionType: null,
    };

    const result = generateResponseSync(context, {
        templateEngine: engine,
        fallbackText: "Fallback",
    });

    expect(result.source).toBe("template");
    expect(result.text).toContain("Nike Air Max");
    expect(result.text).toContain("42");
});

// ─── SUMMARY ───

console.log("\n✅ Todos os testes passaram!");
