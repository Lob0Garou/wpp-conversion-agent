/**
 * Testes para leadHot.ts
 * Execute com: npx tsx src/services/leadHot.test.ts
 */

import { isLeadHot, hasAnyReservationSignal, hasImmediateBuySignal } from './leadHot';

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

// ─── TESTES: isLeadHot ───

test('isLeadHot: detecta "reservar"', () => {
    const result = isLeadHot({}, 'Quero reservar o tênis');
    assert(result === true, `Expected true, got ${result}`);
});

test('isLeadHot: detecta "separa"', () => {
    const result = isLeadHot({}, 'Pode separa o tamanho 42?');
    assert(result === true, `Expected true, got ${result}`);
});

test('isLeadHot: detecta "quero comprar"', () => {
    const result = isLeadHot({}, 'Quero comprar agora');
    assert(result === true, `Expected true, got ${result}`);
});

test('isLeadHot: detecta "vou buscar hoje"', () => {
    const result = isLeadHot({}, 'Vou buscar hoje no loja');
    assert(result === true, `Expected true, got ${result}`);
});

test('isLeadHot: detecta "pode reservar"', () => {
    const result = isLeadHot({}, 'Pode reservar pra mim?');
    assert(result === true, `Expected true, got ${result}`);
});

test('isLeadHot: rejeita mensagem sem sinal de reserva', () => {
    const result = isLeadHot({}, 'Quanto tá o tênis?');
    assert(result === false, `Expected false, got ${result}`);
});

test('isLeadHot: rejeita mensagem genérica', () => {
    const result = isLeadHot({}, 'Oi, tudo bem?');
    assert(result === false, `Expected false, got ${result}`);
});

test('isLeadHot: com flag wantsReservation=true', () => {
    const result = isLeadHot({ flags: { wantsReservation: true } }, 'Qual o preço?');
    assert(result === true, `Expected true, got ${result}`);
});

// ─── TESTES: hasAnyReservationSignal ───

test('hasAnyReservationSignal: positivo', () => {
    assert(hasAnyReservationSignal('quero fazer uma reserva') === true, 'should detect reservation');
    assert(hasAnyReservationSignal('pode separar pra mim?') === true, 'should detect separar');
    assert(hasAnyReservationSignal('guarda esse tamanho') === true, 'should detect guardar');
});

test('hasAnyReservationSignal: negativo', () => {
    assert(hasAnyReservationSignal('quanto custa?') === false, 'should not detect');
    assert(hasAnyReservationSignal('tem tamanho 40?') === false, 'should not detect');
});

// ─── TESTES: hasImmediateBuySignal ───

test('hasImmediateBuySignal: positivo', () => {
    assert(hasImmediateBuySignal('vou buscar agora') === true, 'should detect agora');
    assert(hasImmediateBuySignal('passo hoje à tarde') === true, 'should detect hoje');
    assert(hasImmediateBuySignal('vou levar') === true, 'should detect levar');
});

test('hasImmediateBuySignal: negativo', () => {
    assert(hasImmediateBuySignal('quanto tá?') === false, 'should not detect');
    assert(hasImmediateBuySignal('quando abre a loja?') === false, 'should not detect');
});

console.log('\n🎉 Todos os testes passaram!');
