# Simulation Upgrade - Plano de Melhorias para o Virtual Customer

**Data:** 2026-02-21
**Status:** PLANEJAMENTO (não implementado)
**Arquivos Referenciados:**
- `docs/real_success_fail_map.md` - Métricas reais de conversas
- `docs/policy_ground_truth.md` - Regras do agente Cadu
- `tests_harness/scenarios_v3.json` - Novos cenários

---

## 1. Visão Geral

Este documento detalha as propostas de melhoria para o `tests_harness/virtual_customer.ts`, baseadas em análise de conversas reais e padrões de sucesso/falha identificados nos dados.

### Objetivos das Mudanças:
1. **Opener real por intent no turno 1** - Usar mensagens de abertura baseadas em dados reais
2. **Topic Lock** - Manter cliente focado no tema inicial
3. **Limite de palavras** - Simular mensagens realistas (média 8.2 palavras para SALES)
4. **Progressão emocional** - Implementar curvas de frustração dinâmicas

---

## 2. Métricas de Referência (Dados Reais)

| Intent | Média Turnos | Palavras/Cliente | Palavras/Agente | Taxa Perguntas |
|--------|--------------|------------------|-----------------|----------------|
| **SALES** | 8.7 | 8.2 | 5.7 | 18% |
| **SAC_TROCA** | 21.0 | 11.1 | 13.3 | 17% |
| **SAC_ATRASO** | 67.5 | 17.3 | 13.3 | 2% |
| **INFO** | 11.5 | 4.7 | 5.4 | 12% |

**Fonte:** `docs/real_success_fail_map.md`

---

## 3. Proposta 1: Opener Real por Intent no Turno 1

### Problema Atual:
O agente inicial usa apenas `initial_message` do cenário, sem variação baseada no intent.

### Solução Proposta:
Criar um dicionário de openers reais por intent, selecionados aleatoriamente para maiorvariedade.

### Implementação Planejada:

```typescript
// Proposta de código (NÃO IMPLEMENTADO)

// Openers reais baseados em dados do real_success_fail_map.md
const REAL_OPENERS: Record<string, string[]> = {
  SALES: [
    "Vocês têm chuteira número 42 pra campo?",
    "Vcs tem nike air max tamanho 42?",
    "Tem camisa do Flamengo feminina?",
    "Tem tênis número 27 para menino?",
    "Preciso saber agora se vocês têm o tamanho 44, é urgente!",
    "Preciso de um tênis pra usar no dia a dia, qual indica?",
  ],
  SAC_TROCA: [
    "O tênis que comprei ficou pequeno, como faço pra trocar?",
    "Comprei um tênis mas não gostei, quero devolver. Como faz?",
    "Quero trocar meu tênis",
  ],
  SAC_ATRASO: [
    "Meu pedido ainda não chegou, quando vou receber?",
    "Faz 15 dias que pedi e não chegou nada. Minha encomenda foi perdida?",
    "Meu pedido não chegou",
  ],
  INFO: [
    "Qual o horário de funcionamento de vcs?",
    "Vocês têm quantos dias pra trocar?",
    "Tem Nike?",
  ],
};

export function getRealOpener(intent: string): string {
  const openers = REAL_OPENERS[intent] || REAL_OPENERS['INFO'];
  return openers[Math.floor(Math.random() * openers.length)];
}
```

### Exemplo de Uso:
```typescript
// No cenário scenarios_v3.json, o campo 'opener' é usado:
// Se não houver opener no cenário, usar getRealOpener(scenario.intent)
const opener = scenario.opener || getRealOpener(scenario.intent);
```

---

## 4. Proposta 2: Topic Lock

### Problema Atual:
Cliente pode mudar de assunto durante a conversa, o que não reflete o comportamento real.

### Solução Proposta:
Implementar mecanismo que detecta mudanças de assunto e força o cliente a voltar ao tema original.

### Implementação Planejada:

```typescript
// Proposta de código (NÃO IMPLEMENTADO)

interface TopicLockConfig {
  enabled: boolean;
  lock_phrases: string[];  // Frases que reforçam o lock
  resistance_on_unlock: number;  // 0-5, aumenta frustração se tentar mudar
}

const TOPIC_LOCK_CONFIG: Record<string, TopicLockConfig> = {
  SALES: { enabled: true, lock_phrases: ["sobre isso"], resistance_on_unlock: 1 },
  SAC_TROCA: { enabled: true, lock_phrases: ["sobre a troca"], resistance_on_unlock: 2 },
  SAC_ATRASO: { enabled: true, lock_phrases: ["sobre o pedido"], resistance_on_unlock: 2 },
  INFO: { enabled: false, lock_phrases: [], resistance_on_unlock: 0 },
};

function checkTopicLock(
  lastMessage: string,
  originalTopic: string,
  config: TopicLockConfig
): { locked: boolean; response: string } {
  // Detectar mudança de assunto
  const topicIndicators = ["outro", "mudando", "na verdade"];
  const changedTopic = topicIndicators.some(indicator =>
    lastMessage.toLowerCase().includes(indicator)
  );

  if (changedTopic && config.enabled) {
    return {
      locked: true,
      response: `Não, eu quero resolver sobre ${originalTopic} primeiro.`,
    };
  }

  return { locked: false, response: "" };
}
```

### Exemplos de Comportamento:

| Cenário | Tentativa do Cliente | Resposta com Topic Lock |
|---------|---------------------|------------------------|
| SALES | "Ah, e vocês têm luva?" | "Deixa isso, me ajuda com o tênis primeiro" |
| SAC_ATRASO | "Posso também perguntar sobre..." | "Sobre o pedido, pode me ajudar?" |

---

## 5. Proposta 3: Limite de Palavras por Mensagem

### Problema Atual:
Mensagens geradas podem ser muito longas, diferente do comportamento real (8.2 palavras para SALES).

### Solução Proposta:
Adicionar limite de palavras no prompt do LLM e implementar truncagem se necessário.

### Limites Baseados em Dados Reais:

| Intent | Limite Recomendado |
|--------|-------------------|
| SALES | 8-12 palavras |
| SAC_TROCA | 10-15 palavras |
| SAC_ATRASO | 15-20 palavras |
| INFO | 4-8 palavras |

### Implementação Planejada:

```typescript
// Proposta de código (NÃO IMPLEMENTADO)

const WORD_LIMITS: Record<string, { min: number; max: number }> = {
  SALES: { min: 5, max: 12 },
  SAC_TROCA: { min: 8, max: 15 },
  SAC_ATRASO: { min: 10, max: 20 },
  INFO: { min: 3, max: 8 },
};

function truncateToWordLimit(message: string, intent: string): string {
  const limits = WORD_LIMITS[intent] || { min: 5, max: 15 };
  const words = message.split(/\s+/);

  if (words.length > limits.max) {
    return words.slice(0, limits.max).join(" ") + "...";
  }

  return message;
}

function addWordLimitToPrompt(intent: string): string {
  const limits = WORD_LIMITS[intent] || { min: 5, max: 15 };
  return `LIMITE: Sua resposta deve ter entre ${limits.min} e ${limits.max} palavras.`;
}
```

### Exemplo no Prompt:
```
LIMITE: Sua resposta deve ter entre 8 e 12 palavras.
Estilo: WhatsApp brasileiro, conciso. Use 'vc', 'tá', 'pra'.
Exemplo: "Uso 42, tem?" (4 palavras)
```

---

## 6. Proposta 4: Progressão Emocional (Frustration Curve Dinâmica)

### Problema Atual:
O `frustration_curve` é estático, não responde ao comportamento do agente.

### Solução Proposta:
Implementar curva de frustração que se ajusta baseada nas ações do agente:

- **Bom comportamento do agente** → frustração diminui ou estabiliza
- **Mau comportamento** → frustração aumenta

### Regras de Progressão:

| Gatilho (ação do agente) | Efeito na Frustração |
|---------------------------|---------------------|
| Responde direto, propõe ação | -1 (até mínimo 1) |
| Pede dado já informado | +1 |
| Explica limitações do sistema | +1 |
| "Vou verificar" sem prazo | +1 |
| Responde robótico ("Boa tarde, meu nome é...") | +1 |
| Oferece solução clara | -1 |
| Mantém tom empático | -1 (até mínimo 1) |

### Implementação Planejada:

```typescript
// Proposta de código (NÃO IMPLEMENTADO)

interface EmotionalState {
  frustration: number;  // 1-5
  patience: number;     // 1-5 (inverso da frustração)
  resistance_level: number;  // 0-3
}

const FRUSTRATION_TRIGGERS = {
  GOOD: [
    { pattern: /quer que (separe|reserve)/i, delta: -1 },
    { pattern: /temos (sim|disponível)/i, delta: -1 },
    { pattern: /qual (numeração|tamanho)/i, delta: 0 },  // Pergunta qualifica
  ],
  BAD: [
    { pattern: /boa tarde.*nome é/i, delta: +1 },  // Saudação longa
    { pattern: /somente.*site/i, delta: +1 },  // Explicação sistema
    { pattern: /vou verificar/i, delta: +1 },  // Sem prazo
    { pattern: /ja (passou|informou)/i, delta: +1 },  // Dado repetido
  ],
};

function updateFrustration(
  agentMessage: string,
  currentFrustration: number
): number {
  let newFrustration = currentFrustration;

  // Aplicar gatilhos negativos (bom comportamento)
  for (const trigger of FRUSTRATION_TRIGGERS.GOOD) {
    if (trigger.pattern.test(agentMessage)) {
      newFrustration += trigger.delta;
      break;
    }
  }

  // Aplicar gatilhos positivos (mau comportamento)
  for (const trigger of FRUSTRATION_TRIGGERS.BAD) {
    if (trigger.pattern.test(agentMessage)) {
      newFrustration += trigger.delta;
      break;
    }
  }

  // Limitar entre 1 e 5
  return Math.max(1, Math.min(5, newFrustration));
}

function getFrustrationCurve(
  scenario: TestScenario,
  agentActions: string[]
): number[] {
  const baseCurve = scenario.frustration_curve || [1, 1, 2, 2, 3];
  const adjustedCurve: number[] = [];

  let currentFrustration = baseCurve[0] || 1;

  for (let i = 0; i < baseCurve.length; i++) {
    if (i > 0 && agentActions[i - 1]) {
      currentFrustration = updateFrustration(agentActions[i - 1], currentFrustration);
    }
    adjustedCurve.push(currentFrustration);
  }

  return adjustedCurve;
}
```

### Exemplo de Progressão:

```
Turno 1: Frustração 1
  Agent: "Boa tarde, meu nome é Felipe..."  → +1 (saudação longa)
Turno 2: Frustração 2

Turno 2:
  Agent: "Qual numeração?"  → 0 (pergunta qualificadora)
Turno 3: Frustração 2

Turno 3:
  Client: "42"
  Agent: "Vou verificar..."  → +1 (sem prazo)
Turno 4: Frustração 3
```

---

## 7. Integração dos Cenários v3

Os cenários em `tests_harness/scenarios_v3.json` já incluem os campos necessários:

| Campo | Descrição | Exemplo |
|-------|-----------|---------|
| `opener` | Mensagem inicial real | "Vocês têm chuteira número 42 pra campo?" |
| `topic_lock` | Se mantém no tema | true/false |
| `frustration_curve` | Curva de frustração | [1, 1, 2, 2, 3] |
| `resistance_pattern` | Tipo de resistência | "cliente_direto", "cliente_urgente" |
| `resistance_triggers` | O que ativa resistência | ["demora", "vou_verificar"] |
| `success_path` | Caminho para sucesso | Agent pergunta numero, verifica, propõe separar |
| `fail_path` | Caminho para falha | Agent com saudação longa |

### Cenários Incluídos (12 total):

| # | ID | Intent | Tipo |
|---|-----|--------|------|
| 1 | sales_tenis_corrida_42 | SALES | Vendas |
| 2 | sales_chuteira_campo | SALES | Vendas |
| 3 | sales_camisa_time | SALES | Vendas |
| 4 | sales_tenis_infantil | SALES | Vendas |
| 5 | sales_tenis_uso_diario | SALES | Vendas |
| 6 | sales_tenis_urgente | SALES | Vendas |
| 7 | sac_troca_tamanho | SAC_TROCA | SAC |
| 8 | sac_atraso_pedido | SAC_ATRASO | SAC |
| 9 | sac_pedido_extraviado | SAC_ATRASO | SAC |
| 10 | sac_devolucao | SAC_TROCA | SAC |
| 11 | info_horario_funcionamento | INFO | Info |
| 12 | info_politica_troca | INFO | Info |

---

## 8. Plano de Implementação

### Fase 1: Estrutura Base
- [ ] Adicionar função `getRealOpener()` para openers dinâmicos
- [ ] Criar constante `REAL_OPENERS` com openers por intent

### Fase 2: Topic Lock
- [ ] Implementar `checkTopicLock()`
- [ ] Adicionar lógica no prompt do LLM

### Fase 3: Limite de Palavras
- [ ] Adicionar `WORD_LIMITS` por intent
- [ ] Implementar `truncateToWordLimit()`
- [ ] Atualizar prompt com limite

### Fase 4: Progressão Emocional
- [ ] Implementar `updateFrustration()`
- [ ] Criar `FRUSTRATION_TRIGGERS`
- [ ] Integrar com `conversationHistory`

---

## 9. Exemplos Completos de Uso

### Exemplo 1: SALES (8.2 palavras média)

```
Turno 1:
  Customer: "Vocês têm chuteira número 42 pra campo?"
  (topic_lock: true, frustration: 1)

Turno 2:
  Agent: "Qual seria a numeração?"
  (pergunta qualificadora, frustração estável)

Turno 3:
  Customer: "42" (4 palavras - dentro do limite)
  frustration: 1

Turno 4:
  Agent: "Temos! Preta e branca. Quer que separe?"
  (proposta de ação, frustração -1)

Turno 5:
  Customer: "Separa a preta" (4 palavras)
  frustration: 1
```

### Exemplo 2: SAC_ATRASO (67.5 turnos!)

```
Turno 1:
  Customer: "Meu pedido ainda não chegou, quando vou receber?"
  frustration: 2

Turno 2:
  Agent: "Qual o número do pedido?"

Turno 3:
  Customer: "123456"
  frustration: 2

Turno 4:
  Agent: "Vou verificar..."
  (GATILHO RUIM: sem prazo definido, frustração +1)
  frustration: 3
```

---

## 10. Referências

- **Dados reais:** `docs/real_success_fail_map.md`
- **Regras do agente:** `docs/policy_ground_truth.md`
- **Cenários v3:** `tests_harness/scenarios_v3.json`
- **Código atual:** `tests_harness/virtual_customer.ts`

---

*Documento gerado em 2026-02-21. Próximos passos: Implementar as 4 propostas em phases conforme plano acima.*
