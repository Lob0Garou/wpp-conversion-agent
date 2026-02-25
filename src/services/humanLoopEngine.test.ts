/**
 * Testes para humanLoopEngine.ts - evaluateHandoff
 * Execute com: npx tsx src/services/humanLoopEngine.test.ts
 */

import { evaluateHandoff, shouldHandoffOnReservation } from './humanLoopEngine';
import type { StockResult } from '../lib/stock-agent';
import type { Slots } from '../lib/state-manager';
import type { Intent } from '../lib/intent-classifier';

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

function assert(condition: boolean, message: string) {
    if (!condition) {
        throw new Error(message);
    }
}

// ─── HELPERS ───

function createSession(slots: Partial<Slots> = {}, intent: Intent = 'SALES') {
    return {
        intent,
        slots: slots as Slots,
        botStatus: 'BOT' as const,
        alertSent: null,
    };
}

function createStockResult(status: string, confidence: string): StockResult {
    return {
        status: status as StockResult['status'],
        confidence: confidence as StockResult['confidence'],
        candidates: [],
        alternatives: [],
        missingSlots: [],
        requiresPhysicalCheck: false,
        promptHint: '',
        reasonCode: 'FOUND_DETAILED_QTY_ZERO',
    };
}

// ─── TESTES ───

// Cenário 1: Lead quente (quer reserva) - PRIORIDADE 1
test('evaluateHandoff: Lead quente com estoque disponível -> handoff RESERVA_CONFIRMADA', () => {
    const session = createSession({ product: 'tênis nike', size: '42' }, 'SALES');
    const stock = createStockResult('AVAILABLE', 'ALTA');

    const result = evaluateHandoff(session, stock, 'Quero reservar o tamanho 42');

    assert(result.shouldHandoff === true, `Expected true, got ${result.shouldHandoff}`);
    assert(result.reason === 'RESERVA_CONFIRMADA', `Expected RESERVA_CONFIRMADA, got ${result.reason}`);
});

test('evaluateHandoff: Lead quente com "separa" -> handoff RESERVA_CONFIRMADA', () => {
    const session = createSession({ product: 'chuteira', size: '40' }, 'SALES');
    const stock = createStockResult('AVAILABLE', 'ALTA');

    const result = evaluateHandoff(session, stock, 'Pode separa pra mim?');

    assert(result.shouldHandoff === true, `Expected true, got ${result.shouldHandoff}`);
    assert(result.reason === 'RESERVA_CONFIRMADA', `Expected RESERVA_CONFIRMADA, got ${result.reason}`);
});

test('evaluateHandoff: Lead quente com "vou buscar agora" -> handoff RESERVA_CONFIRMADA', () => {
    const session = createSession({ product: 'tênis', size: '43' }, 'SALES');
    const stock = createStockResult('AVAILABLE', 'ALTA');

    const result = evaluateHandoff(session, stock, 'Vou buscar agora');

    assert(result.shouldHandoff === true, `Expected true, got ${result.shouldHandoff}`);
    assert(result.reason === 'RESERVA_CONFIRMADA', `Expected RESERVA_CONFIRMADA, got ${result.reason}`);
});

// Cenário 2: Estoque indisponível + alta intenção - PRIORIDADE 2
test('evaluateHandoff: Estoque indisponível + alta intenção -> handoff SEM_ESTOQUE_CONVERTER', () => {
    const session = createSession({ product: 'tênis nike', size: '42' }, 'SALES');
    const stock = createStockResult('UNAVAILABLE', 'ALTA');

    const result = evaluateHandoff(session, stock, 'Quanto tá?');

    // Precisa de alta intenção também
    assert(result.shouldHandoff === false, `Expected false without high intent, got ${result.shouldHandoff}`);
});

test('evaluateHandoff: Estoque indisponível + alta intenção -> handoff SEM_ESTOQUE_CONVERTER (com intent)', () => {
    const session = createSession({ product: 'tênis nike', size: '42' }, 'SALES');
    const stock = createStockResult('UNAVAILABLE', 'ALTA');

    // Mensagem SEM sinal de lead quente, mas com intentScore alto
    const result = evaluateHandoff(session, stock, 'Quanto tá o modelo?', 0.9);

    assert(result.shouldHandoff === true, `Expected true, got ${result.shouldHandoff}`);
    assert(result.reason === 'SEM_ESTOQUE_CONVERTER', `Expected SEM_ESTOQUE_CONVERTER, got ${result.reason}`);
});

// Cenário 3: Estoque disponível + SEM lead quente -> NÃO faz handoff
test('evaluateHandoff: Estoque disponível sem lead quente -> continua bot', () => {
    const session = createSession({ product: 'tênis', size: '42' }, 'SALES');
    const stock = createStockResult('AVAILABLE', 'ALTA');

    const result = evaluateHandoff(session, stock, 'Quanto tá o tênis?');

    assert(result.shouldHandoff === false, `Expected false, got ${result.shouldHandoff}`);
    assert(result.reason === null, `Expected null, got ${result.reason}`);
});

test('evaluateHandoff: Produto sem info suficiente -> continua bot', () => {
    const session = createSession({ product: 'tênis' }, 'SALES'); // sem size
    const stock = createStockResult('AVAILABLE', 'ALTA');

    const result = evaluateHandoff(session, stock, 'Quero reservar');

    // Sem info suficiente de produto, não faz handoff
    assert(result.shouldHandoff === false, `Expected false, got ${result.shouldHandoff}`);
});

// Cenário 4: Intent não é SALES
test('evaluateHandoff: Intent SAC -> não faz handoff', () => {
    const session = createSession({ orderId: '12345' }, 'SAC_TROCA');
    const stock = createStockResult('AVAILABLE', 'ALTA');

    const result = evaluateHandoff(session, stock, 'Quero trocar meu pedido');

    assert(result.shouldHandoff === false, `Expected false for SAC, got ${result.shouldHandoff}`);
});

// Cenário 5: Bot já está em modo HUMAN
test('evaluateHandoff: Já está em modo HUMAN -> não faz handoff', () => {
    const session = {
        intent: 'SALES' as const,
        slots: { product: 'tênis', size: '42' } as Slots,
        botStatus: 'HUMAN' as const,
        alertSent: null,
    };
    const stock = createStockResult('AVAILABLE', 'ALTA');

    const result = evaluateHandoff(session, stock, 'Quero reservar');

    assert(result.shouldHandoff === false, `Expected false when already HUMAN, got ${result.shouldHandoff}`);
});

// ─── TESTES: BRAND-ONLY (nova regra) ───
// Marca sozinha não é produto suficiente para acionar handoff

test('evaluateHandoff: Só marca + tamanho (sem modelo/categoria) → NÃO faz handoff', () => {
    // "Separa o Adidas tamanho 40" — slots.product === slots.marca → brand-only
    const session = createSession({ product: 'adidas', marca: 'adidas', size: '40' });
    const stock = createStockResult('AVAILABLE', 'ALTA');

    const result = evaluateHandoff(session, stock, 'Separa o Adidas tamanho 40');

    assert(result.shouldHandoff === false, `Expected false para brand-only, got ${result.shouldHandoff}`);
});

test('evaluateHandoff: Marca + categoria + tamanho + lead quente → handoff RESERVA_CONFIRMADA', () => {
    // "Separa o tênis Adidas tamanho 40" — tem categoria, agora sim suficiente
    const session = createSession({ product: 'adidas', marca: 'adidas', categoria: 'tenis', size: '40' });
    const stock = createStockResult('AVAILABLE', 'ALTA');

    const result = evaluateHandoff(session, stock, 'Separa o tênis Adidas tamanho 40');

    assert(result.shouldHandoff === true, `Expected true com marca+categoria+size, got ${result.shouldHandoff}`);
    assert(result.reason === 'RESERVA_CONFIRMADA', `Expected RESERVA_CONFIRMADA, got ${result.reason}`);
});

test('evaluateHandoff: Só marca + tamanho + estoque indisponível → NÃO faz handoff (info insuficiente)', () => {
    // Sem modelo/categoria, mesmo com estoque indisponível não deve fazer handoff
    const session = createSession({ product: 'nike', marca: 'nike', size: '42' });
    const stock = createStockResult('UNAVAILABLE', 'ALTA');

    const result = evaluateHandoff(session, stock, 'Quero tênis Nike 42');

    assert(result.shouldHandoff === false, `Expected false para brand-only sem categoria, got ${result.shouldHandoff}`);
});

console.log('\n🎉 Todos os testes de evaluateHandoff passaram!');
