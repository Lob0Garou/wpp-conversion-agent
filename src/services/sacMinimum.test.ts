/**
 * Testes para sacMinimum.ts (otimizado)
 * Execute com: npx tsx src/services/sacMinimum.test.ts
 */

import { getMissingSacData, buildSacQuestion, hasAnyMissingSacData, isSacDataComplete, getMissingSacField } from './sacMinimum';
import type { Slots } from '../lib/state-manager';

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

// ─── TESTES: getMissingSacData ───

test('getMissingSacData: missing all 3', () => {
    const slots = {} as Slots;
    const result = getMissingSacData(null, slots);
    assert(result.missingName === true, `Expected missingName true`);
    assert(result.missingOrderOrEmail === true, `Expected missingOrderOrEmail true`);
    assert(result.missingProblem === true, `Expected missingProblem true`);
});

test('getMissingSacData: name present, missing others', () => {
    const slots = {} as Slots;
    const result = getMissingSacData('João Silva', slots);
    assert(result.missingName === false, `Expected missingName false`);
    assert(result.missingOrderOrEmail === true, `Expected missingOrderOrEmail true`);
    assert(result.missingProblem === true, `Expected missingProblem true`);
});

test('getMissingSacData: name + order present, missing problem', () => {
    const slots = { orderId: '12345' } as Slots;
    const result = getMissingSacData('João Silva', slots);
    assert(result.missingName === false, `Expected missingName false`);
    assert(result.missingOrderOrEmail === false, `Expected missingOrderOrEmail false`);
    assert(result.missingProblem === true, `Expected missingProblem true`);
});

test('getMissingSacData: all complete', () => {
    const slots = { orderId: '12345', motivoTroca: 'defeito' } as Slots;
    const result = getMissingSacData('João Silva', slots);
    assert(result.missingName === false, `Expected missingName false`);
    assert(result.missingOrderOrEmail === false, `Expected missingOrderOrEmail false`);
    assert(result.missingProblem === false, `Expected missingProblem false`);
});

// ─── TESTES: buildSacQuestion (pergunta única com todos os dados) ───

test('buildSacQuestion: missing all 3', () => {
    const missing = { missingName: true, missingOrderOrEmail: true, missingProblem: true };
    const result = buildSacQuestion(missing);
    assert(result.includes('nome completo'), `Got: ${result}`);
    assert(result.includes('número do pedido'), `Got: ${result}`);
    assert(result.includes('o que aconteceu'), `Got: ${result}`);
});

test('buildSacQuestion: missing name + problem', () => {
    const missing = { missingName: true, missingOrderOrEmail: false, missingProblem: true };
    const result = buildSacQuestion(missing);
    assert(result.includes('nome completo'), `Got: ${result}`);
    assert(result.includes('o que aconteceu'), `Got: ${result}`);
    assert(!result.includes('número do pedido'), `Got: ${result}`);
});

// ─── TESTES: hasAnyMissingSacData ───

test('hasAnyMissingSacData: incomplete -> true', () => {
    const slots = {} as Slots;
    const result = hasAnyMissingSacData(null, slots);
    assert(result === true, `Expected true`);
});

test('hasAnyMissingSacData: complete -> false', () => {
    const slots = { orderId: '12345', motivoTroca: 'defeito' } as Slots;
    const result = hasAnyMissingSacData('João Silva', slots);
    assert(result === false, `Expected false`);
});

// ─── TESTES: isSacDataComplete ───

test('isSacDataComplete: incomplete -> false', () => {
    const slots = {} as Slots;
    const result = isSacDataComplete(null, slots);
    assert(result === false, `Expected false`);
});

test('isSacDataComplete: complete -> true', () => {
    const slots = { orderId: '12345', motivoTroca: 'defeito' } as Slots;
    const result = isSacDataComplete('João Silva', slots);
    assert(result === true, `Expected true`);
});

console.log('\n🎉 Todos os testes de sacMinimum passaram!');
