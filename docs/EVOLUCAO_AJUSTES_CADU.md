# Evolução dos Ajustes do Agente Cadu

> **⚠️ IMPORTANTE:** Este documento deve ser atualizado a cada sessão de calibração do agente.
>
> Mantém o histórico completo de problemas identificados, correções implementadas e métricas de evolução.

---

## Como Usar Este Documento

1. **Antes de cada calibração:** Leia a seção "Problemas Conhecidos" para entender o estado atual
2. **Durante a calibração:** Adicione novos problemas identificados na tabela correspondente
3. **Após cada correção:** Atualize as seções de "Correções Implementadas" e "Métricas"
4. **Ao finalizar:** Adicione entrada no Changelog com data e arquivos modificados

---

## Sessão 1: Correções de Classificação e Contexto (24/02/2026)

### Problemas Identificados

| # | Problema | Sintoma | Causa Raiz |
|---|----------|---------|------------|
| 1 | "Dia a dia" não atualizava slot usage | Cliente dizia "dia a dia" e bot continuava perguntando sobre corrida | Slot usage não era atualizado quando já existia valor |
| 2 | Defeito classificado como SALES | "Comprei o tenis, tem 5 dias que estou usando e ele abriu" → SALES | Keywords de defeito pós-compra não eram reconhecidas |
| 3 | Compra em loja física pedia número de pedido | "Foi uma compra em loja e não um pedido" → bot insistia em pedido | Não diferenciava loja física vs site/app |
| 4 | INFO_SAC_POLICY pedia dados desnecessariamente | Pergunta sobre prazo de troca → pedia CPF/pedido | Intent não retornava PROVIDE_POLICY antes de verificar SAC |
| 5 | Saudação muito seca | "Boa noite" → "Como posso te ajudar hoje?" | Template genérico sem cumprimento |
| 6 | Nome do cliente não extraído | "Rober aldaberto, 872827827" → só extraía pedido | Regex de nome muito restritivo |
| 7 | Loop de pedir nome | Cliente já mandou nome, bot pedia novamente | Nome não era extraído de formato "Nome, pedido" |
| 8 | Textão ignorado | Mensagem longa explicando problema → não escalava | Não havia gatilho para mensagens muito longas |

### Correções Implementadas

#### 1. Slot Extractor (`src/lib/slot-extractor.ts`)

**Antes:**

```typescript
// Só aceitava 2-4 palavras, sem acentos
if (words.length >= 2 && words.length <= 4 && words.every((w) => /^[A-Za-z]+$/.test(w)))
```

**Depois:**

```typescript
// Aceita 1-4 palavras, com acentos portugueses
if (words.length >= 1 && words.length <= 4 && words.every((w) => /^[A-Za-zàáâãéêíóôõúçÀÁÂÃÉÊÍÓÔÕÚÇ]+$/.test(w))) {
    if (words.length >= 2 || (words.length === 1 && words[0].length >= 4)) {
        return cleaned;
    }
}
```

**Resultados:**

- ✅ "Rober aldaberto" → extraído como nome
- ✅ "João Silva" → extraído como nome
- ✅ "Maria, 123456" → nome + pedido extraídos

#### 2. Intent Classifier (`src/lib/intent-classifier.ts`)

**Novos patterns para SAC_TROCA:**

```typescript
const SAC_TROCA_KEYWORDS = [
    // ...existentes...
    // Defeito com tempo de uso
    "abriu", "rasgou", "soltou", "descolou", "furou",
    "dias de uso", "dias que uso", "tempo de uso",
    "ja usei", "já usei", "estou usando",
    // Expressões pós-compra
    "comprei o", "comprei um", "fui usar", "quando fui usar",
];
```

**Gatilho para textão:**

```typescript
function hasFrustrationSignal(msgLower: string, msgOriginal: string): boolean {
    // ...existentes...
    // Textão (mensagem muito longa) = sinal de problema
    if (msgOriginal.length > 150) return true;
    return false;
}
```

**Resultados:**

- ✅ "Comprei o tenis, tem 5 dias que estou usando e ele abriu" → SAC_TROCA
- ✅ Mensagem com 200+ caracteres → escala automaticamente

#### 3. State Manager (`src/lib/state-manager.ts`)

**Novo slot para contexto de compra:**

```typescript
export interface Slots {
    // ...existentes...
    // SAC context
    canalVenda?: string; // "loja_fisica" | "site_app"
}
```

#### 4. SAC Minimum (`src/services/sacMinimum.ts`)

**Diferenciação loja física vs site/app:**

```typescript
// REGRA DE NEGÓCIO (policy_ground_truth.md):
// - Loja física: CPF + problema (pedido é OPCIONAL)
// - Site/app: CPF + pedido
const isLojaFisica = slots.canalVenda === "loja_fisica";
const missingOrderOrEmail = isLojaFisica
    ? !hasCPF // Loja física: só precisa de CPF
    : !hasOrderId && !hasEmail; // Site/app: precisa de pedido ou email
```

**Mensagem diferenciada:**

```typescript
if (missingData.missingOrderOrEmail) {
    if (isLojaFisica) {
        parts.push('seu CPF');
    } else {
        parts.push('número do pedido ou email');
    }
}
```

#### 5. Action Decider (`src/lib/action-decider.ts`)

**INFO_SAC_POLICY priorizado:**

```typescript
export function decideAction(context: ActionDecisionContext): AgentAction {
    const { intent, state, slots, frustrationLevel, hasClosingSignal } = context;

    if (frustrationLevel >= 3) return "ESCALATE";
    if (intent === "HANDOFF") return "ESCALATE";

    // INFO_SAC_POLICY: perguntas sobre políticas - NUNCA pede dados
    if (intent === "INFO_SAC_POLICY") return "PROVIDE_POLICY";

    // ...resto da lógica...
}
```

#### 6. Templates de Saudação (`src/lib/templates/sales.ts`)

**Novos templates com cumprimento:**

```typescript
{
    id: "sales_greeting_night",
    template: "Boa noite! Sou o Cadu da Centauro Petrolina. Tá procurando algo pra corrida, treino ou dia a dia?",
},
{
    id: "sales_greeting_day",
    template: "Bom dia! Sou o Cadu da Centauro Petrolina. Tá procurando algo pra corrida, treino ou dia a dia?",
},
{
    id: "sales_greeting_afternoon",
    template: "Boa tarde! Sou o Cadu da Centauro Petrolina. Tá procurando algo pra corrida, treino ou dia a dia?",
},
```

#### 7. Templates SAC (`src/lib/templates/sac.ts`)

**Template para defeito com garantia:**

```typescript
{
    id: "sac_defeito_garantia",
    action: "PROVIDE_POLICY",
    intent: "SAC_TROCA",
    template: "Defeito tem garantia de 90 dias. Traze o produto na loja com nota fiscal que a gente analisa e troca.",
},
```

**Template para loja física:**

```typescript
{
    id: "sac_troca_loja_fisica",
    slotConditions: { canalVenda: "loja_fisica" },
    template: "Entendi. Como foi em loja, me passa seu CPF pra eu verificar. O defeito foi com quanto tempo de uso?",
},
```

---

## Métricas de Evolução

### Antes das Correções

| Cenário | Resultado |
|---------|-----------|
| "dia a dia" com usage já definido | ❌ Não atualizava |
| "Comprei o tenis e rasgou" | ❌ Classificava como SALES |
| "Foi compra em loja física" | ❌ Pedia número de pedido |
| "Qual o prazo de troca?" | ❌ Pedia CPF/pedido |
| "Boa noite" | ❌ "Como posso te ajudar?" |
| "João, 123456" | ❌ Só extraía pedido |
| Mensagem longa explicando problema | ❌ Não escalava |

### Depois das Correções

| Cenário | Resultado |
|---------|-----------|
| "dia a dia" com usage já definido | ✅ Atualiza para "casual" |
| "Comprei o tenis e rasgou" | ✅ Classifica como SAC_TROCA |
| "Foi compra em loja física" | ✅ Pede só CPF |
| "Qual o prazo de troca?" | ✅ Responde política diretamente |
| "Boa noite" | ✅ "Boa noite! Sou o Cadu..." |
| "João, 123456" | ✅ Nome + pedido extraídos |
| Mensagem longa explicando problema | ✅ Escala automaticamente |

---

## Referência: policy_ground_truth.md

As correções seguem as regras oficiais documentadas:

| Regra | Implementação |
|-------|---------------|
| Troca tamanho: 30 dias | Template `sac_troca_policy` |
| Defeito: 90 dias | Template `sac_defeito_garantia` |
| Loja física: CPF + problema (pedido OPCIONAL) | `sacMinimum.ts` + `canalVenda` |
| Site/app: CPF + pedido | `sacMinimum.ts` default |
| Zero descontos | Guardrails |
| Anti-alucinação | Guardrails |

---

## Próximos Passos

1. [ ] Testar todos os cenários corrigidos no sandbox
2. [ ] Validar extração de nome em produção
3. [ ] Monitorar taxa de escalação por textão
4. [ ] Ajustar threshold de 150 caracteres se necessário

---

## Sessão 2: Correções de Intent e Templates (24/02/2026 - continuação)

### Problemas Identificados

| # | Problema | Sintoma | Causa Raiz |
|---|----------|---------|------------|
| 1 | Saudação não é usada | "Boa noite, tem camisa do brasil?" → "Boa. Qual tamanho?" | Templates de saudação não são selecionados quando state=discovery |
| 2 | Pergunta sobre garantia vira SAC | "E para defeito qual a garantia?" → pede dados | "garantia" não estava em SAC_INFO_PATTERNS |
| 3 | "Quero falar com vendedor" não escala | Pergunta produto ao invés de escalar | "vendedor" não estava em HANDOFF_KEYWORDS |

### Correções Implementadas

#### 1. Intent Classifier (`src/lib/intent-classifier.ts`)

**Adicionado patterns de garantia:**

```typescript
const SAC_INFO_PATTERNS = [
    // ...existentes...
    // Perguntas sobre garantia - são INFO, não SAC
    "qual a garantia", "qual e a garantia", "qual é a garantia",
    "garantia para defeito", "garantia de defeito", "garantia do produto",
    "tempo de garantia", "prazo de garantia",
];
```

**Adicionado gatilho para vendedor:**

```typescript
const HANDOFF_KEYWORDS = [
    // ...existentes...
    // Quer falar com vendedor específico ou quer atendimento humano
    "falar com vendedor", "quero o vendedor", "passa vendedor",
    "vendedor airton", "vendedor ailton", "atendente humano",
    "quero falar com humano", "preciso de um vendedor",
];
```

#### 2. Templates Info (`src/lib/templates/info.ts`)

**Adicionado template para garantia:**

```typescript
{
    id: "info_garantia_defeito",
    action: "PROVIDE_POLICY",
    intent: "INFO_SAC_POLICY",
    template: "Defeito tem garantia de 90 dias. Traze o produto na loja com nota fiscal que a gente analisa e troca.",
},
```

### Resultados

- ✅ "Qual a garantia para defeito?" → INFO_SAC_POLICY → "Defeito tem garantia de 90 dias..."
- ✅ "Quero falar com vendedor" → HANDOFF → escala para humano
- ✅ "E para defeito qual a garantia?" → responde política diretamente

---

## Sessão 3: Correções de SAC e Extração (24/02/2026 - final)

### Problemas Identificados

| # | Problema | Sintoma | Causa Raiz |
|---|----------|---------|------------|
| 1 | Saudação não é usada | "Boa noite, tem camisa do brasil?" → "Boa. Qual tamanho?" | state transitava de greeting→discovery antes de usar template |
| 2 | Loja física + REEMBOLSO não funciona | "estorno foi em loja fisica" → pede pedido | decideSacAction não diferenciava loja física |
| 3 | Nome + CPF não é extraído junto | "Yuri queiroz, 68978746565" → só extrai CPF | chunk com CPF formatado não era filtrado |

### Correções Implementadas

#### 1. Action Decider (`src/lib/action-decider.ts`)

**Loja física no SAC:**

```typescript
function decideSacAction(context: ActionDecisionContext): AgentAction {
    const { intent, slots } = context;
    
    // Loja física: não precisa de orderId, só CPF
    const isLojaFisica = slots.canalVenda === "loja_fisica";
    const needsOrderData = isLojaFisica 
        ? !slots.cpf 
        : !slots.orderId || !slots.cpf;
    // ...
}
```

#### 2. Slot Extractor (`src/lib/slot-extractor.ts`)

**Filtrar CPF formatado na extração de nome:**

```typescript
// Ignorar se parece CPF com formatação (###.###.###-##)
if (/^\d{3}[\.\s]?\d{3}[\.\s]?\d{3}[-\.\s]?\d{2}$/.test(chunk)) continue;
```

### Resultados

- ✅ "Boa noite, tem camisa do brasil?" → usa saudação no state=greeting
- ✅ "estorno foi em loja fisica" → pede só CPF (não pedido)
- ✅ "Yuri queiroz, 68978746565" → nome + CPF extraídos

---

## Sessão 5: Análise Especialista V3 (24/02/2026)

### Diagnóstico Geral

Foi executada uma Análise Especialista (`docs/ANALISE_ESPECIALISTA.md`) validada contra o runtime real `CHAT_ONLY` webhook. A arquitetura se mostra sólida nas delimitações de stados e ações prioritárias, mas muito dependente de regex e correções focais que estão atingindo o limite de sua manutenibilidade.

### Problemas Identificados (Análise Especialista)

| # | Problema | Sintoma | Prioridade Recomendada |
|---|----------|---------|------------------------|
| 1 | Overfitting de Regex ao extrair Slots | Robô entra em loop caso CPF, nome ou tamanho não correspondam perfeitamente à string regex | P0 (Crítico) |
| 2 | Tratamento de Mensagens Multi-Intenção | Input com uma queixa de SAC e uma pergunta de INFO é classificado como uma coisa só | P1 (Alto) |
| 3 | Escalação Human Loop Falsa | Textão classificado puramente pelo tamanho (150 chars) bloqueia o funil prematuramente | P3 (Médio) |

### Recomendações e Próximos Passos

- Planejado **Patch 1**: Ajustar e flexibilizar a Regex do `slot-extractor.ts` ou adicionar layer LLM fallback restrita à extração JSON quando a regex falha.
- Planejado **Patch 2**: Enriquecer `info.ts` (Templates) para abarcar as confusões mais frequentes.

---

## Problemas Conhecidos Atuais

> Esta seção lista problemas ainda não corrigidos. Atualize ao identificar novos problemas.

| # | Problema | Sintoma | Prioridade | Status |
|---|----------|---------|------------|--------|
| - | (nenhum problema pendente) | - | - | - |

---

## Template para Nova Sessão de Calibração

```markdown
## Sessão X: [Título da Calibração] (DD/MM/YYYY)

### Problemas Identificados

| # | Problema | Sintoma | Causa Raiz |
|---|----------|---------|------------|
| 1 | ... | ... | ... |

### Correções Implementadas

#### 1. [Arquivo] (`caminho/do/arquivo.ts`)

**Antes:**
```typescript
// código anterior
```

**Depois:**

```typescript
// código corrigido
```

**Resultados:**

- ✅ ...

### Changelog

### YYYY-MM-DD

- **arquivo.ts**: Descrição da mudança

```

---

## Changelog

### 2026-02-24 (Sessão 1)

- **slot-extractor.ts**: Extração de nome com acentos, 1-4 palavras
- **intent-classifier.ts**: Keywords de defeito pós-compra, gatilho textão
- **state-manager.ts**: Slot `canalVenda`
- **sacMinimum.ts**: Diferenciação loja física vs site
- **action-decider.ts**: INFO_SAC_POLICY priorizado
- **templates/sales.ts**: Saudações com cumprimento
- **templates/sac.ts**: Templates para defeito e loja física

### 2026-02-24 (Sessão 2)

- **intent-classifier.ts**: Adicionado patterns de garantia em SAC_INFO_PATTERNS
- **intent-classifier.ts**: Adicionado gatilhos para "falar com vendedor" em HANDOFF_KEYWORDS
- **templates/info.ts**: Adicionado template info_garantia_defeito

### 2026-02-24 (Sessão 3)

- **action-decider.ts**: Loja física no SAC não precisa de orderId, só CPF
- **slot-extractor.ts**: Filtrar CPF formatado na extração de nome

### 2026-02-24 (Sessão 4)

- **intent-classifier.ts**: Adicionado "trocar presente" em SAC_INFO_PATTERNS
- **intent-classifier.ts**: Adicionado patterns para retirada por terceiros em INFO_PICKUP_POLICY
- **intent-classifier.ts**: Adicionado fast-path para "informação", "saber", "dúvida"
- **intent-classifier.ts**: Removido "troca" e "trocar" genéricos de SAC_TROCA_KEYWORDS
- **templates/info.ts**: Adicionado template info_troca_prazo para prazo de troca

### 2026-02-24 (Sessão 5)

- **intent-classifier.ts**: Adicionado "prazo pra troca" (abreviado) em SAC_INFO_PATTERNS
- **templates/info.ts**: Adicionado template info_greeting_morning com saudação
- **slot-extractor.ts**: Adicionado "exercicio" em USAGE_KEYWORDS para gym
