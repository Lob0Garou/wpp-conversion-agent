# Resumo das Mudanças de Simulação

## Visão Geral

Este documento descreve as atualizações realizadas no sistema de simulação do cliente virtual (Cadu) para torná-lo mais realista e preciso na avaliação do agente.

## Arquivos Atualizados

### 1. tests_harness/scenarios_v4.json

**Propósito:** Novo arquivo de cenários de teste com 18 cenários baseados em dados reais.

**Distribuição dos Cenários:**

| Tipo | Quantidade | Descrição |
|------|------------|-----------|
| SALES | 8 | Baseados nos 24 openers reais de vendas |
| SAC_TROCA | 2 | Troca por numeração, falar com atendente |
| SAC_ATRASO | 2 | Atraso com rastreamento, status pedido |
| SAC_REEMBOLSO | 3 | Reembolso dinheiro, código erro, ratificação |
| INFO | 3 | Loja Petrolina, informações, loja física |

**Campos Incluídos em Cada Cenário:**

- `id`: Identificador único
- `name`: Nome descritivo
- `intent`: Tipo de intenção (SALES, SAC_TROCA, etc.)
- `description`: Descrição do cenário
- `opener`: Mensagem inicial real (do dataset real_openers.md)
- `topic_lock`: true (impede mudança de assunto)
- `frustration_curve`: Array de progressão emocional [1,1,2,2,3...]
- `resistance_pattern`: Padrão de resistência do cliente
- `resistance_triggers`: Gatilhos que aumentam resistência
- `success_path`: Caminho ideal de resolução
- `fail_path`: Caminho de falha
- `goal`: Objetivo do cliente
- `success_criteria`: Critérios de sucesso
- `must_ask`: Dados que o agente deve perguntar
- `must_include`: Elementos que a resposta deve conter
- `must_not`: Elementos proibidos
- `max_turns`: Máximo de turnos permitidos
- `profile`: Perfil do cliente (persona, nome, tom, comportamento, frustração, conhecimento)

---

### 2. tests_harness/virtual_customer.ts

**Atualizações Implementadas:**

#### A) Openers Reais (getRealOpener)

- Novo dataset baseado em `docs/real_openers.md`
- 24+ openers reais organizados por intent
- 8 SALES, 2 SAC_TROCA, 2 SAC_ATRASO, 3 SAC_REEMBOLSO, 3 INFO

#### B) Limite de Palavras

- Média de **8 palavras** conforme dados reais
- Limites configurados por intent:

| Intent | Mín | Máx | Ideal |
|--------|-----|-----|-------|
| SALES | 3 | 15 | 8 |
| SAC_TROCA | 5 | 25 | 12 |
| SAC_ATRASO | 5 | 25 | 10 |
| SAC_REEMBOLSO | 5 | 30 | 15 |
| INFO | 2 | 10 | 6 |

#### C) Topic Lock

- Implementação de `checkTopicLock(currentTopic, newMessage, intent)`
- Impede mudança de assunto durante a conversa
- Palavras-chave por intent para detectar off-topic
- Indicadores de mudança: "outro", "na verdade", "e também", etc.

#### D) Frustration Curve

- Progressão emocional baseada em ações do agente
- Gatilhos que DIMINUEM frustração:
  - "quer que separe/reserve" (-1)
  - "temos disponível" (-1)
  - "perfeito/ok" (-1)
  - "qual numeração" (0)

- Gatilhos que AUMENTAM frustração:
  - "boa tarde... nome é" (+1)
  - "somente site" (+1)
  - "vou verificar" (+1)
  - "não posso" (+1)
  - "tem que ir na loja" (+1)

---

### 3. Novas Funções Adicionadas

#### truncateMessage(text, maxWords)

```typescript
/**
 * Trunca mensagem para respeitar limite de palavras
 * @param text - Texto original
 * @param maxWords - Número máximo de palavras (padrão: 8)
 * @returns Texto truncado
 */
export function truncateMessage(text: string, maxWords: number = 8): string
```

#### checkTopicLock(currentTopic, newMessage, intent)

```typescript
/**
 * Detecta mudança de assunto na mensagem do cliente
 * @param currentTopic - Tópico atual da conversa
 * @param newMessage - Nova mensagem do cliente
 * @param intent - Intenção do cenário
 * @returns Objeto com locked (boolean) e detected (string|null)
 */
export function checkTopicLock(
    currentTopic: string,
    newMessage: string,
    intent: string
): { locked: boolean; detected: string | null }
```

#### getFrustrationFromCurve(frustrationCurve, currentTurn)

```typescript
/**
 * Calcula frustração baseada na curva de frustração do cenário
 * @param frustrationCurve - Array de progressão emocional
 * @param currentTurn - Turno atual da conversa
 * @returns Nível de frustração (1-5)
 */
export function getFrustrationFromCurve(
    frustrationCurve: number[],
    currentTurn: number
): number
```

---

## Metodologia TDD Aplicada

### Passo 1: Definição dos Cenários (scenarios_v4.json)

- Baseado em dados reais de `docs/real_openers.md`
- 18 cenários cobrindo diferentes intents
- Cada cenário com frustração curva específica
- Topic lock ativado para SALES e SAC

### Passo 2: Implementação do Código

- openers reais integrados
- limite de palavras configurável
- topic lock implementado
- frustação dinâmica baseada em ações

---

## Fonte dos Dados

- **Openers Reais:** `docs/real_openers.md`
  - 105 openers totais
  - Média de 8 palavras por opener

- **Regras do Agente:** `docs/policy_ground_truth.md`
  - 3 Regras de Ouro
  - Flow de Vendas e SAC
  - Critérios de avaliação

---

## Próximos Passos Sugeridos

1. Testar os cenários com o avaliador
2. Ajustar curvas de frustração conforme resultados
3. Adicionar mais cenários adversos
4. Implementar validação automática de respostas
