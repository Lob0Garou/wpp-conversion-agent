# Judge Rubric V3 - Sistema de Avaliação Recalibrado

**Data:** 2026-02-21
**Versão:** 3.0
**Baseado em:** `docs/real_success_fail_map.md` + `docs/policy_ground_truth.md` + tarefas do judge_engineer

---

## 1. Princípios Fundamentais

O score deve refletir o que **Yuri considera ideal** (políticas) e o que o **histórico real mostra como eficaz** (dados operacionais).

### 1.1 Três Pilares da Avaliação

| Pilar | Definição | Peso Base |
|-------|-----------|-----------|
| **POLICY** | Cumprimento das regras inegociáveis | 30% |
| **OUTCOME** | Resolução/conclusão do objetivo | 35% |
| **QUALITY** | Tom, concisão, eficiência | 35% |

---

## 2. Definição Objetiva de "Conclusão" por Intent

### 2.1 Critérios por Intent

| Intent | Conclusão Alcançada Quando |
|--------|---------------------------|
| **SALES** | reserva.confirmada OU proposta.aceita OU proximo.passo |
| **SAC_TROCA** | protocolo OU vale.troca.oferecido |
| **SAC_ATRASO** | status.fornecido OU protocolo |
| **INFO** | resposta.fornecida |

### 2.2 Estados de Outcome

```
OUTCOME STATES:
├── CONCLUIDO: 100% - Meta atingida
├── PARCIAL: 50% - Avanzou mas não fechou
├── ESTAGNADO: 25% - 3+ turnos sem avanço
└── FALHA: 0% - Erro crítico (regra violada)
```

---

## 3. Penalidades Implementadas

### 3.1 Escalation Premature (Escalação Precoce)

**Definição:** Agent pediu para escalar antes de 2 tentativas de resolução.

| Condição | Penalidade |
|----------|-----------|
| Escalou antes de 2 tentativas (e cenário não esperava) | -20 pts |
| Escalou após 2+ tentativas | 0 pts |
| Cenário esperava escalação | 0 pts |

### 3.2 Agent Repetition (Repetição Problemática)

**Definição:** Agent perguntou a mesma coisa 2+ vezes após cliente já ter fornecido a informação.

| Condição | Penalidade |
|----------|-----------|
| Repetiu pergunta sobre dado já fornecido | -15 pts por ocorrência |

### 3.3 Text Excess (Texto Excessivo)

**Definição:** Mensagem do agent excede o limite de palavras configurável.

| Variável | Valor Padrão | Penalidade |
|----------|-------------|-----------|
| MAX_AGENT_WORDS | 35 | -2 pts por palavra acima |

### 3.4 No Proposal (Sem Proposta)

**Definição:** Agent não propôs próxima ação ao cliente.

| Condição | Penalidade |
|----------|-----------|
| Última mensagem não propõe ação | -10 pts |

---

## 4. Variáveis de Ambiente

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| MAX_AGENT_WORDS | 35 | Máximo de palavras por mensagem do agente |
| MAX_TURNS_SALES | 8 | Máximo de turnos para SALES |
| MAX_TURNS_SAC | 10 | Máximo de turnos para SAC (troca/atraso) |
| MAX_TURNS_INFO | 5 | Máximo de turnos para INFO |

---

## 5. Confidence Score

### 5.1 Fórmula

```
confidence = (policy_compliance + outcome + quality) / 3
```

**Normalização:** 0-100

### 5.2 Fatores de Ajuste

| Fator | Efeito |
|-------|--------|
| conversationLength >= 10 | +5 |
| conversationLength >= 5 | +2 |
| concluded = true | +3 |
| hasRepetition = true | -5 |
| hasExcessiveText = true | -3 |
| hasPrematureEscalation = true | -8 |
| conversationLength < 3 | -10 |

---

## 6. Pesos por Intent

| Intent | Policy | Outcome | Quality | Justificativa (dados reais) |
|--------|--------|---------|---------|----------------------------|
| **SALES** | 25% | 40% | 35% | Foco em fechar venda; resolução mede sucesso (27.8% taxa) |
| **SAC_TROCA** | 30% | 40% | 30% | Regras mais complexas (VT obrigatório); alto risco |
| **SAC_ATRASO** | 25% | 45% | 30% | Outcome é crítico; 67.5 turnos média indica ineficiência |
| **INFO** | 20% | 35% | 45% | Foco em eficiência; menor impacto se errado |

---

## 7. Score Mínimo para Aprovação

| Intent | Score Mínimo | Justificativa |
|--------|--------------|---------------|
| **SALES** | 80 | Maior volume (18 conversas), menor resolução (27.8%) |
| **SAC_TROCA** | 85 | Alto risco, regras complexas |
| **SAC_ATRASO** | 80 | Outcome crítico |
| **INFO** | 75 | Menor impacto, maior volume (514 conversas) |

---

## 8. Funções Exportadas (evaluator.ts)

### 8.1 checkConclusion()

```typescript
export function checkConclusion(
    scenario: TestScenario,
    conversation: ConversationTurn[]
): { concluded: boolean; state: 'CONCLUIDO' | 'PARCIAL' | 'ESTAGNADO' | 'FALHA'; details: string }
```

### 8.2 penalizeEscalationPremature()

```typescript
export function penalizeEscalationPremature(
    conversation: ConversationTurn[],
    scenario: TestScenario
): { penalty: number; reason: string }
```

### 8.3 penalizeRepetition()

```typescript
export function penalizeRepetition(
    conversation: ConversationTurn[]
): { penalty: number; reason: string; repeatedQuestions: string[] }
```

### 8.4 penalizeTextExcess()

```typescript
export function penalizeTextExcess(
    conversation: ConversationTurn[]
): { penalty: number; reason: string; excessiveMessages: Array<{ turn: number; wordCount: number; excess: number }> }
```

### 8.5 penalizeNoProposal()

```typescript
export function penalizeNoProposal(
    scenario: TestScenario,
    conversation: ConversationTurn[]
): { penalty: number; reason: string }
```

### 8.6 calculateConfidence()

```typescript
export function calculateConfidence(
    policyCompliance: number,
    outcome: number,
    quality: number,
    options?: {
        conversationLength?: number;
        concluded?: boolean;
        hasRepetition?: boolean;
        hasExcessiveText?: boolean;
        hasPrematureEscalation?: boolean;
    }
): number
```

---

## 9. Resumo das Mudanças vs V2

| Aspecto | V2 | V3 |
|---------|----|----|
| Escalation Premature | -25 pts (hardcoded) | -20 pts (variável) |
| Agent Repetition | -15 pts (hardcoded) | -15 pts (função exportada) |
| Text Excess | Limits por intent | MAX_AGENT_WORDS único (35) |
| No Proposal | Não existia | -10 pts (nova) |
| Confidence | Fórmula antiga | (policy + outcome + quality) / 3 |
| Variáveis de Ambiente | Não existiam | MAX_AGENT_WORDS, MAX_TURNS_* |

---

## 10. Arquivos de Referência

- `docs/real_success_fail_map.md` - Dados operacionais (536 conversas)
- `docs/policy_ground_truth.md` - Políticas e regras
- `tests_harness/evaluator.ts` - Implementação das funções de avaliação
- `tests_harness/config.ts` - Configurações do test harness
