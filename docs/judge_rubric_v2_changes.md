# Judge Rubric V2 - Mudanças nos Evaluators

Este documento indica as mudanças exatas necessárias em:
1. `src/lib/evaluator.ts`
2. `tests_harness/evaluator.ts`

---

## Mudanças em src/lib/evaluator.ts

### 1. Atualizar tipos existentes

**Local:** Linhas 17-27 (interface EvaluationResult)

**Antes:**
```typescript
export interface EvaluationResult {
    score: number;
    breakdown: {
        regras: number;    // 0-30
        tom: number;       // 0-25
        objetivo: number;  // 0-25
        concisao: number;  // 0-20
    };
    feedback: string;
    approved: boolean;
}
```

**Depois:**
```typescript
export interface EvaluationResult {
    score: number;
    confidence: number;           // NOVO: 0-100
    breakdown: {
        policy: number;    // 0-30 (anterior: regras)
        outcome: number;  // 0-40 (anterior: objetivo)
        quality: number;  // 0-30 (novo: inclui tom + concisão)
    };
    raw: {                      // NOVO: scores brutos
        policy: number;
        outcome: number;
        quality: number;
    };
    flags: {                     // NOVO: indicadores
        concluded: boolean;
        excessive_text: boolean;
        repetition: boolean;
        early_escalation: boolean;
    };
    feedback: string;
    approved: boolean;
}
```

---

### 2. Novo: Definição de conclusão por intent

**Adicionar nova seção após linha 28:**

```typescript
// ─── Definições de Conclusão por Intent ──────────────────────────────────────────

const CONCLUSION_KEYWORDS = {
    SALES: ['reserva', 'reservado', 'separo', 'separado', 'reservei', 'algo mais'],
    SAC_TROCA: ['protocolo', 'vale troca', 'vale-troca', 'aberto', 'chamado', 'vt-'],
    SAC_ATRASO: ['status', 'rastreio', 'protocolo', 'prazo', 'previsto'],
    INFO: ['resposta', 'informação', 'aqui está', 'aí está'],
};

export function checkConclusion(
    intent: string,
    conversation: Array<{role: string; content: string}>
): boolean {
    const keywords = CONCLUSION_KEYWORDS[intent] || CONCLUSION_KEYWORDS.INFO;
    const agentMsgs = conversation
        .filter(t => t.role === 'agent')
        .map(t => t.content.toLowerCase());

    return agentMsgs.some(msg =>
        keywords.some(kw => msg.includes(kw))
    );
}
```

---

### 3. Novo: Função para medir excesso de texto

**Adicionar nova seção:**

```typescript
// ─── Penalidade por Excesso de Texto ─────────────────────────────────────────────

const WORD_LIMITS = {
    SALES: 10,
    SAC_TROCA: 15,
    SAC_ATRASO: 15,
    INFO: 6,
};

const WORD_PENALTIES = {
    SALES: 2,
    SAC_TROCA: 1.5,
    SAC_ATRASO: 1.5,
    INFO: 3,
};

function countWords(text: string): number {
    return text.trim().split(/\s+/).length;
}

export function textExcessPenalty(
    conversation: Array<{role: string; content: string}>,
    intent: string
): number {
    const limit = WORD_LIMITS[intent] || 10;
    const penalty = WORD_PENALTIES[intent] || 2;

    const agentMsgs = conversation.filter(t => t.role === 'agent');
    let totalPenalty = 0;

    for (const msg of agentMsgs) {
        const wordCount = countWords(msg.content);
        const excess = Math.max(0, wordCount - limit);
        totalPenalty += excess * penalty;
    }

    return totalPenalty;
}
```

---

### 4. Novo: Função para detectar repetição problemática

**Adicionar nova seção:**

```typescript
// ─── Detecção de Repetição Problemática ─────────────────────────────────────────

const DATA_KEYWORDS = ['cpf', 'pedido', 'e-mail', 'email', 'tamanho', 'número'];

export function repetitionPenalty(
    conversation: Array<{role: string; content: string}>
): number {
    const turns = conversation;
    let penalty = 0;

    // Para cada dado, verifica se agente pede novamente após cliente fornecer
    for (const kw of DATA_KEYWORDS) {
        let lastAskIndex = -1;

        for (let i = 0; i < turns.length; i++) {
            const msg = turns[i].content.toLowerCase();

            if (turns[i].role === 'agent' && msg.includes(kw)) {
                // Encontrou um pedido do dado
                lastAskIndex = i;
            } else if (turns[i].role === 'customer' && msg.includes(kw)) {
                // Cliente forneceu o dado após o último pedido
                // Agora verifica se há outro pedido depois
                const hasSubsequentAsk = turns.slice(i + 1).some(
                    (t, idx) => t.role === 'agent' &&
                    t.content.toLowerCase().includes(kw)
                );
                if (hasSubsequentAsk && lastAskIndex >= 0) {
                    penalty += 15;
                }
            }
        }
    }

    return penalty;
}
```

---

### 5. Novo: Função para detectar escalação precoce

**Adicionar nova seção:**

```typescript
// ─── Detecção de Escalação Precoce ────────────────────────────────────────────────

export function earlyEscalationPenalty(
    conversation: Array<{role: string; content: string}>,
    shouldEscalate: boolean
): number {
    const agentMsgs = conversation.filter(t => t.role === 'agent');

    const hasEscalation = agentMsgs.some(t =>
        t.content.toLowerCase().includes('gerente') ||
        t.content.toLowerCase().includes('escal') ||
        t.content.toLowerCase().includes('specialist') ||
        t.content.toLowerCase().includes('supervisor')
    );

    if (!hasEscalation) return 0;

    // Conta tentativas de resolver antes de escalar
    const attemptCount = agentMsgs.filter(t => {
        const msg = t.content.toLowerCase();
        return msg.includes('vou verificar') ||
               msg.includes('qual ') ||
               msg.includes('posso') ||
               msg.includes('ajudar');
    }).length;

    // Se não deveria escalar E tentou menos de 2x = escalação precoce
    if (!shouldEscalate && attemptCount < 2) {
        return -25;
    }

    return 0;
}
```

---

### 6. Novo: Função de normalização e confidence

**Adicionar nova seção:**

```typescript
// ─── Normalização e Confidence ───────────────────────────────────────────────────

const INTENT_WEIGHTS = {
    SALES: { policy: 0.25, outcome: 0.40, quality: 0.35 },
    SAC_TROCA: { policy: 0.30, outcome: 0.40, quality: 0.30 },
    SAC_ATRASO: { policy: 0.25, outcome: 0.45, quality: 0.30 },
    INFO: { policy: 0.20, outcome: 0.35, quality: 0.45 },
};

const APPROVAL_THRESHOLDS = {
    SALES: 80,
    SAC_TROCA: 85,
    SAC_ATRASO: 80,
    INFO: 75,
};

function normalizeScore(raw: {policy: number; outcome: number; quality: number}, intent: string): number {
    const weights = INTENT_WEIGHTS[intent] || INTENT_WEIGHTS.INFO;

    const normalizedPolicy = (raw.policy / 30) * 100;
    const normalizedOutcome = (raw.outcome / 40) * 100;
    const normalizedQuality = (raw.quality / 30) * 100;

    const score =
        normalizedPolicy * weights.policy +
        normalizedOutcome * weights.outcome +
        normalizedQuality * weights.quality;

    return Math.round(Math.min(100, Math.max(0, score)));
}

function calculateConfidence(
    rawScore: number,
    conversationLength: number,
    flags: {concluded: boolean; excessive_text: boolean; early_escalation: boolean}
): number {
    let confidence = 70;

    // Mais turns = mais contexto
    if (conversationLength >= 10) confidence += 10;
    else if (conversationLength >= 5) confidence += 5;

    // Scores extremos
    if (rawScore >= 90 || rawScore <= 30) confidence += 10;
    else if (rawScore >= 70 || rawScore <= 50) confidence += 5;

    // Flags claras
    if (flags.concluded) confidence += 5;
    if (flags.excessive_text) confidence += 5;

    // Fatores negativos
    if (flags.early_escalation) confidence -= 10;
    if (conversationLength < 3) confidence -= 15;
    if (rawScore > 40 && rawScore < 60) confidence -= 10;

    return Math.min(100, Math.max(0, confidence));
}
```

---

### 7. Atualizar evaluateResponse()

**Local:** Linha 66-98 (função evaluateResponse)

**Modificações necessárias:**

1. Aceitar parâmetro adicional `conversation` (array de turns)
2. Usar os pesos por intent
3. Aplicar penalidades de texto, repetição, escalação
4. Calcular confidence
5. Detectar conclusão

**Depois de implementado (nova assinatura):**
```typescript
export async function evaluateResponse(
    userMsg: string,
    agentMsg: string,
    intent: string,
    conversation?: Array<{role: string; content: string}>
): Promise<EvaluationResult> {
    // ...existing code...

    // NOVO: Aplicar penalidades contextuais
    let penalties = {
        text: 0,
        repetition: 0,
        earlyEscalation: 0,
    };

    let raw = {
        policy: result.breakdown.regras,
        outcome: result.breakdown.objetivo,
        quality: result.breakdown.tom + result.breakdown.concisao,
    };

    if (conversation && conversation.length > 0) {
        // Penalidade por excesso de texto
        penalties.text = textExcessPenalty(conversation, intent);

        // Penalidade por repetição
        penalties.repetition = repetitionPenalty(conversation);

        // Penalidade por escalação precoce
        penalties.earlyEscalation = earlyEscalationPenalty(
            conversation,
            shouldEscalateBasedOnIntent(intent, conversation)
        );
    }

    // Aplicar penalidades aos scores brutos
    raw.policy = Math.max(0, raw.policy + penalties.earlyEscalation);
    raw.quality = Math.max(0, raw.quality - penalties.text - penalties.repetition);

    // Normalizar para 0-100
    const score = normalizeScore(raw, intent);

    // Calcular confidence
    const flags = {
        concluded: conversation ? checkConclusion(intent, conversation) : false,
        excessive_text: penalties.text > 0,
        repetition: penalties.repetition > 0,
        early_escalation: penalties.earlyEscalation < 0,
    };

    const confidence = calculateConfidence(score, conversation?.length || 0, flags);

    return {
        score,
        confidence,
        breakdown: {
            policy: (raw.policy / 30) * 100,
            outcome: (raw.outcome / 40) * 100,
            quality: (raw.quality / 30) * 100,
        },
        raw,
        flags,
        feedback: result.feedback,
        approved: score >= (APPROVAL_THRESHOLDS[intent] || 75),
    };
}
```

---

## Mudanças em tests_harness/evaluator.ts

### 1. Atualizar ScoreBreakdown

**Local:** Linha 14-18 (imports de config)

Verificar se o tipo ScoreBreakdown inclui os novos campos. Se necessário, atualizar para:

```typescript
interface ScoreBreakdown {
    base_score: number;
    must_ask_penalty: number;
    must_include_penalty: number;
    must_not_penalty: number;
    escalation_correct: number;
    escalation_incorrect: number;
    repetition_penalty: number;
    text_excess_penalty: number;     // NOVO
    plan_b_reward: number;
    final_score: number;
}
```

---

### 2. Atualizar calculateScore()

**Local:** Linha 141-214 (função calculateScore)

**Adicionar nova lógica:**

```typescript
function calculateScore(
    scenario: TestScenario,
    conversation: ConversationTurn[],
    agentEscalated: boolean
): ScoreBreakdown {
    const breakdown: ScoreBreakdown = {
        base_score: 100,
        must_ask_penalty: 0,
        must_include_penalty: 0,
        must_not_penalty: 0,
        escalation_correct: 0,
        escalation_incorrect: 0,
        repetition_penalty: 0,
        text_excess_penalty: 0,      // NOVO
        plan_b_reward: 0,
        final_score: 100,
    };

    // ...existing must_ask, must_include, must_not logic...

    // 1. Penalidade por Repetição (existing - linhas 171-178)
    // Já existe, manter

    // 2. NOVO: Penalidade por Excesso de Texto
    const agentMsgs = conversation.filter(t => t.role === 'agent');
    let totalTextPenalty = 0;
    const limits = { SALES: 10, SAC_TROCA: 15, SAC_ATRASO: 15, INFO: 6 };
    const limit = limits[scenario.intent] || 10;

    for (const msg of agentMsgs) {
        const wordCount = msg.content.trim().split(/\s+/).length;
        const excess = Math.max(0, wordCount - limit);
        totalTextPenalty += excess * 2; // 2 pts por palavra acima
    }
    breakdown.text_excess_penalty = totalTextPenalty;

    // 3. NOVO: Recompensa por Conclusão
    const hasConclusion = checkConclusion(scenario.intent, conversation);
    if (hasConclusion) {
        breakdown.plan_b_reward += 15; // Renomear ou criar novo campo
    }

    // ... rest of existing code ...

    // Calcular score final incluindo novas penalidades
    breakdown.final_score = Math.max(0,
        breakdown.base_score
        - breakdown.must_ask_penalty
        - breakdown.must_include_penalty
        - breakdown.must_not_penalty
        - breakdown.repetition_penalty
        - breakdown.text_excess_penalty         // NOVO
        + breakdown.plan_b_reward
        + breakdown.escalation_correct
        + breakdown.escalation_incorrect
    );

    return breakdown;
}
```

---

### 3. Atualizar determineOutcome()

**Local:** Linha 348-393 (função determineOutcome)

A função já detecta conclusão, mas pode ser aprimorada para usar a função `checkConclusion`:

```typescript
function determineOutcome(
    scenario: TestScenario,
    mustAskResult: MustAskResult,
    mustIncludeResult: MustIncludeResult,
    agentEscalated: boolean,
    conversation: ConversationTurn[]
): string {
    // ... existing escalation logic ...

    // Usar função centralizada de conclusão
    if (checkConclusion(scenario.intent, conversation)) {
        return 'proposta_enviada';
    }

    // Verificar se está estagnado (3+ turnos sem avanço)
    const recentTurns = conversation.slice(-6);
    const recentAgentTurns = recentTurns.filter(t => t.role === 'agent');
    if (recentAgentTurns.length >= 3) {
        return 'estagnado';
    }

    return 'conversa_incompleta';
}
```

---

### 4. Atualizar TestResult

Verificar se o tipo TestResult inclui campos para confidence e flags. Se não existir, adicionar:

```typescript
interface TestResult {
    // ...existing fields...

    // NOVOS
    confidence?: number;
    outcome_flags?: {
        concluded: boolean;
        excessive_text: boolean;
        repetition: boolean;
        early_escalation: boolean;
    };
}
```

---

### 5. Atualizar evaluateConversation()

**Local:** Linha 48-136 (função evaluateConversation)

Adicionar cálculo de confidence após calcular score:

```typescript
// Após linha 55 (calcular scoreBreakdown)
const hasConclusion = determineOutcome(scenario, mustAskResult, mustIncludeResult, agentEscalated, conversation) === 'proposta_enviada';
const hasExcessText = scoreBreakdown.text_excess_penalty > 0;
const hasRepetition = scoreBreakdown.repetition_penalty > 0;
const hasEarlyEscalation = !scenario.should_escalate && agentEscalated && scoreBreakdown.escalation_incorrect < 0;

const conversationLength = conversation.length;
const finalScore = scoreBreakdown.final_score;

// Calcular confidence
let confidence = 70;
if (conversationLength >= 10) confidence += 10;
else if (conversationLength >= 5) confidence += 5;

if (finalScore >= 90 || finalScore <= 30) confidence += 10;
else if (finalScore >= 70 || finalScore <= 50) confidence += 5;

if (hasConclusion) confidence += 5;
if (hasExcessText) confidence += 5;
if (hasEarlyEscalation) confidence -= 10;
if (conversationLength < 3) confidence -= 15;
if (finalScore > 40 && finalScore < 60) confidence -= 10;

confidence = Math.min(100, Math.max(0, confidence));

// Adicionar ao resultado
result.confidence = confidence;
result.outcome_flags = {
    concluded: hasConclusion,
    excessive_text: hasExcessText,
    repetition: hasRepetition,
    early_escalation: hasEarlyEscalation,
};
```

---

## Resumo das Alterações

| Arquivo | Alteração |complexidade |
|---------|-----------|-------------|
| `src/lib/evaluator.ts` | Novos tipos (confidence, flags, raw) | Média |
| `src/lib/evaluator.ts` | `checkConclusion()` | Baixa |
| `src/lib/evaluator.ts` | `textExcessPenalty()` | Baixa |
| `src/lib/evaluator.ts` | `repetitionPenalty()` | Média |
| `src/lib/evaluator.ts` | `earlyEscalationPenalty()` | Baixa |
| `src/lib/evaluator.ts` | `normalizeScore()` + `calculateConfidence()` | Média |
| `src/lib/evaluator.ts` | Atualizar `evaluateResponse()` | Alta |
| `tests_harness/evaluator.ts` | Novo campo `text_excess_penalty` | Baixa |
| `tests_harness/evaluator.ts` | Atualizar `calculateScore()` | Média |
| `tests_harness/evaluator.ts` | Adicionar confidence ao resultado | Baixa |
