# Judge Rubric V2 - Sistema de Avaliação Refinado

**Data:** 2026-02-21
**Versão:** 2.0
**Baseado em:** `docs/real_success_fail_map.md` + `docs/policy_ground_truth.md`

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

## 2. Pesos por Intent

A avaliação deve ser **contextualizada por intent**, pois os dados reais mostram comportamentos bem diferentes:

| Intent | Policy | Outcome | Quality | Justificativa (dados reais) |
|--------|--------|---------|---------|----------------------------|
| **SALES** | 25% | 40% | 35% | Foco em fechar venda; resolução mede sucesso (27.8% taxa) |
| **SAC_TROCA** | 30% | 40% | 30% | Regras mais complexas (VT obrigatório); alto risco |
| **SAC_ATRASO** | 25% | 45% | 30% | Outcome é crítico; 67.5 turnos média indica ineficiência |
| **INFO** | 20% | 35% | 45% | Foco em eficiência; menor impacto se errado |

### 2.1 Breakdown por Componente

#### SALES (Vendas)
```
Policy (25 pts):
  ├── ZERO descontos não autorizados: 10 pts
  ├── ZERO alucinações (estoque/datas): 10 pts
  └── ZERO reembolso dinheiro: 5 pts

Outcome (40 pts):
  ├── Identifica produto: 10 pts
  ├── Pergunta numeração/tamanho: 10 pts
  ├── Verifica disponibilidade: 10 pts
  └── Propõe ação (separar/reservar): 10 pts

Quality (35 pts):
  ├── Tom caloroso/esportivo: 10 pts
  ├── Concisão (<10 palavras): 15 pts
  └── Direto ao ponto: 10 pts
```

#### SAC_TROCA (Troca/Devolução)
```
Policy (30 pts):
  ├── Oferece Vale Troca primeiro: 15 pts
  ├── Coleta dados mínimos (CPF): 8 pts
  └── NÃO promete sem sistema: 7 pts

Outcome (40 pts):
  ├── Reconhece problema: 10 pts
  ├── Coleta CPF/pedido: 10 pts
  ├── Abre chamado/oferece VT: 10 pts
  └── Informa prazo: 10 pts

Quality (30 pts):
  ├── Empatia breve: 10 pts
  ├── Sem enrolação: 10 pts
  └── Segue fluxo: 10 pts
```

#### SAC_ATRASO (Atraso)
```
Policy (25 pts):
  ├── NÃO promete data exata: 10 pts
  ├── Verifica status sistema: 10 pts
  └── Segue fluxo Marcha 2: 5 pts

Outcome (45 pts):
  ├── Identifica pedido: 15 pts
  ├── Fornece status/info: 15 pts
  └── Abre chamado se necessário: 15 pts

Quality (30 pts):
  ├── Resposta rápida: 10 pts
  ├── Sem repetição dados: 10 pts
  └── Eficiente: 10 pts
```

#### INFO (Informação)
```
Policy (20 pts):
  ├── Não inventa informação: 10 pts
  └── Dirige para fluxo correto: 10 pts

Outcome (35 pts):
  ├── Entende intent: 15 pts
  └── Responde pergunta: 20 pts

Quality (45 pts):
  ├── Super conciso (<6 palavras): 20 pts
  ├── Sem explicação desnecessária: 15 pts
  └── Direto: 10 pts
```

---

## 3. Definição Objetiva de "Conclusão"

### 3.1 Critérios por Intent

| Intent | Conclusão Alcançada Quando |
|--------|---------------------------|
| **SALES** | Agente propôs reserva/separação E cliente confirmou OU agente fechou com "algo mais?" |
| **SAC_TROCA** | Agente abriu chamado E forneceu protocolo OU ofereceu Vale Troca E aguarda resposta |
| **SAC_ATRASO** | Agente forneceu status de entrega OU abriu chamado E deu protocolo |
| **INFO** | Cliente recebeu resposta que endereça sua pergunta |

### 3.2 Estados de Outcome

```
OUTCOME STATES:
├── CONCLUIDO: 100% - Meta atingida
├── PARCIAL: 50% - Avanzou mas não fechou
├── ESTAGNADO: 25% - 3+ turnos sem avanço
└── FALHA: 0% - Erro crítico (regra violada)
```

### 3.3 Medição Técnica

```typescript
// Em evaluator.ts - medir conclusão por:
const CONCLUSION_KEYWORDS = {
  SALES: ['reserva', 'reservado', 'separo', 'separado', 'reservei'],
  SAC_TROCA: ['protocolo', 'vale troca', 'aberto', 'chamado'],
  SAC_ATRASO: ['status', 'rastreio', 'protocolo', 'prazo'],
  INFO: ['resposta', 'informação', 'aqui está']
};
```

---

## 4. Penalidades por Excesso de Texto

### 4.1 Limites por Intent (Baseado nos dados reais)

| Intent | Máximo Palavras | Penalidade por Excesso |
|--------|-----------------|----------------------|
| **SALES** | 10 | -2 pts por palavra acima |
| **SAC_TROCA** | 15 | -1.5 pts por palavra acima |
| **SAC_ATRASO** | 15 | -1.5 pts por palavra acima |
| **INFO** | 6 | -3 pts por palavra acima |

### 4.2 Exemplos de Penalização

```
SALES - Resposta ideal:
"Qual numeração?" → 5 palavras → 0% penalidade

SALES - Resposta longa:
"Boa tarde! Para te ajudar melhor com sua busca de tênis, qual seria a numeração que você gostaria de consultar?" → 18 palavras
→ 8 palavras acima do limite → 8 × 2 = 16 pontos de penalidade
```

### 4.3 Implementação

```typescript
// Contagem de palavras
function countWords(text: string): number {
  return text.trim().split(/\s+/).length;
}

// Penalidade
function textPenalty(wordCount: number, intent: string): number {
  const limits = { SALES: 10, SAC_TROCA: 15, SAC_ATRASO: 15, INFO: 6 };
  const penalties = { SALES: 2, SAC_TROCA: 1.5, SAC_ATRASO: 1.5, INFO: 3 };
  const limit = limits[intent] || 10;
  const penalty = penalties[intent] || 2;
  const excess = Math.max(0, wordCount - limit);
  return excess * penalty;
}
```

---

## 5. Diferenciação: Pedido Legítimo vs. Repetição Problemática

### 5.1 Definições

| Tipo | Descrição | Tratamiento |
|------|-----------|-------------|
| **Pedido Legítimo** | Agent pede dado uma vez; cliente não forneceu OU forneceu incompleto | Sem penalidade |
| **Repetição Problemática** | Agent pede mesmo dado 2+ vezes após cliente já ter fornecido | -15 pontos por ocorrência |

### 5.2 Lógica de Detecção

```typescript
function detectRepetition(conversation: Turn[]): number {
  const DATA_KEYWORDS = ['cpf', 'pedido', 'e-mail', 'email', 'tamanho', 'número'];
  const agentMsgs = conversation.filter(t => t.role === 'agent').map(t => t.content.toLowerCase());
  const customerMsgs = conversation.filter(t => t.role === 'customer').map(t => t.content.toLowerCase());

  let penalty = 0;
  for (const kw of DATA_KEYWORDS) {
    // Encontra posições onde agente pediu o dado
    const askPositions = agentMsgs
      .map((msg, idx) => msg.includes(kw) ? idx : -1)
      .filter(idx => idx >= 0);

    // Para cada pedido, verifica se cliente já forneceu depois do último pedido
    for (let i = 0; i < askPositions.length; i++) {
      const lastAskPos = askPositions[i];
      const customerResponseAfter = customerMsgs.slice(lastAskPos).some(msg =>
        msg.includes(kw) || /\d{11}/.test(msg) // CPF como números
      );

      // Se agente pediu novamente E cliente já tinha fornecido
      if (i > 0 && customerResponseAfter) {
        penalty += 15;
      }
    }
  }
  return penalty;
}
```

### 5.3 Exemplos

```
LEGÍTIMO (sem penalidade):
Agent: Qual o número do pedido?
Client: (silêncio)
Agent: Pode me passar o número do pedido?

PROBLEMÁTICO (penalidade):
Agent: Qual o número do pedido?
Client: 123456
Agent: Qual o número do CPF?
Client: 123.456.789-00
Agent: Pode me passar o número do pedido de novo?
→ 15 pontos de penalidade (repetição após resposta)
```

---

## 6. Penalidade por Escalação Precoce

### 6.1 Definição

**Escalação Precoce** = Agent escala para humano sem ter tentado resolver o problema básico.

### 6.2 Critérios de Detecção

| Cenário | Escalação Precoce? | Penalidade |
|---------|-------------------|------------|
| Cliente pede "quero falar com gerente" | NÃO (sempre aceita) | 0 pts |
| Cliente xinga/ameaça | NÃO (obrigatório) | 0 pts |
| Dúvida de produto simples | SIM | -25 pts |
| Pedido de informação | SIM | -20 pts |
| Troca simples (tamanho) | SIM | -20 pts |
| 3+ turnos sem resolver | NÃO (correto) | 0 pts |

### 6.3 Implementação

```typescript
function earlyEscalationPenalty(
  conversation: Turn[],
  scenario: Scenario
): number {
  const agentMsgs = conversation.filter(t => t.role === 'agent');
  const hasEscalation = agentMsgs.some(t =>
    t.content.toLowerCase().includes('gerente') ||
    t.content.toLowerCase().includes('escal') ||
    t.content.toLowerCase().includes('specialist')
  );

  if (!hasEscalation) return 0;

  // Verifica se tentou resolver antes
  const attemptCount = agentMsgs.filter(t =>
    t.content.toLowerCase().includes('vou verificar') ||
    t.content.toLowerCase().includes('qual') ||
    t.content.toLowerCase().includes('posso')
  ).length;

  // Se cenário NÃO deve escalar E tentou menos de 2x
  if (!scenario.should_escalate && attemptCount < 2) {
    return -25;
  }

  return 0;
}
```

---

## 7. Normalização 0-100 e Confidence

### 7.1 Estrutura de Retorno

```typescript
interface JudgeResult {
  // Score principal normalizado 0-100
  score: number;

  // Confidence da avaliação (0-100)
  // Indica quão certo o judge está da avaliação
  confidence: number;

  // Breakdown detalhado
  breakdown: {
    policy: number;    // 0-30 (normalizado para 100)
    outcome: number;   // 0-40 (normalizado para 100)
    quality: number;   // 0-30 (normalizado para 100)
  };

  // Scores brutos (antes da normalização)
  raw: {
    policy: number;
    outcome: number;
    quality: number;
  };

  // Flags e métricas
  flags: {
    concluded: boolean;
    excessive_text: boolean;
    repetition: boolean;
    early_escalation: boolean;
  };

  // Feedback
  feedback: string;
}
```

### 7.2 Cálculo de Confidence

```typescript
function calculateConfidence(
  rawScore: number,
  conversationLength: number,
  flags: Flags
): number {
  // Fatores que aumentam confiança
  let confidence = 70; // Base

  // Mais turns = mais contexto = maior confiança
  if (conversationLength >= 10) confidence += 10;
  else if (conversationLength >= 5) confidence += 5;

  // Scores extremos têm maior confiança
  if (rawScore >= 90) confidence += 10;
  else if (rawScore <= 30) confidence += 10;
  else if (rawScore >= 70 || rawScore <= 50) confidence += 5;

  // Flags claras aumentam confiança
  if (flags.concluded) confidence += 5;
  if (flags.excessive_text) confidence += 5;

  // Fatores que diminuem confiança
  if (flags.early_escalation) confidence -= 10;
  if (conversationLength < 3) confidence -= 15; // Pouco contexto
  if (rawScore > 40 && rawScore < 60) confidence -= 10; // Zona cinzenta

  return Math.min(100, Math.max(0, confidence));
}
```

### 7.3 Normalização Final

```typescript
function normalizeScore(raw: RawScores, intent: string): number {
  // Pesos por intent (da tabela na seção 2)
  const weights = {
    SALES: { policy: 0.25, outcome: 0.40, quality: 0.35 },
    SAC_TROCA: { policy: 0.30, outcome: 0.40, quality: 0.30 },
    SAC_ATRASO: { policy: 0.25, outcome: 0.45, quality: 0.30 },
    INFO: { policy: 0.20, outcome: 0.35, quality: 0.45 },
  };

  const w = weights[intent] || weights.INFO;

  // Normaliza cada componente para 0-100
  // policy max=30, outcome max=40, quality max=30
  const normalizedPolicy = (raw.policy / 30) * 100;
  const normalizedOutcome = (raw.outcome / 40) * 100;
  const normalizedQuality = (raw.quality / 30) * 100;

  // Aplica pesos
  const score =
    normalizedPolicy * w.policy +
    normalizedOutcome * w.outcome +
    normalizedQuality * w.quality;

  return Math.round(score);
}
```

---

## 8. Score Mínimo para Aprovação

| Intent | Score Mínimo | Justificativa |
|--------|--------------|---------------|
| **SALES** | 80 | Maior volume (18 conversas), menor resolução (27.8%) |
| **SAC_TROCA** | 85 | Alto risco, regras complexas |
| **SAC_ATRASO** | 80 | Outcome crítico |
| **INFO** | 75 | Menor impacto, maior volume (514 conversas) |

---

## 9. Resumo das Mudanças vs V1

| Aspecto | V1 | V2 |
|---------|----|----|
| Pesos | Iguais para todas intents | Específicos por intent |
| Conclusão | Implícita | Objetiva por intent |
| Texto | Não medido | Penalidade por excesso |
| Repetição | Não diferencia | Legítima vs problemático |
| Escalação | Não mede | Detecta precoce |
| Confidence | Não existia | Calculado |

---

## 10. Arquivos de Referência

- `docs/real_success_fail_map.md` - Dados operacionais (536 conversas)
- `docs/policy_ground_truth.md` - Políticas e regras
- `src/lib/evaluator.ts` - Implementação principal
- `tests_harness/evaluator.ts` - Avaliação de testes
