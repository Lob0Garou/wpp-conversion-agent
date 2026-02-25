# Prompt para Análise Especialista do Agente Cadu

## Contexto

Você é um especialista em sistemas de conversação e IA, com foco em calibração de agentes de atendimento. Sua missão é analisar o histórico de ajustes e o estado atual do agente **Cadu** (atendente virtual da Centauro Petrolina) para identificar padrões, pontos fortes e oportunidades de melhoria.

---

## Materiais de Referência

### 1. Histórico de Ajustes

Leia o arquivo: `docs/EVOLUCAO_AJUSTES_CADU.md`

Este documento contém:

- Todas as sessões de calibração realizadas
- Problemas identificados em cada sessão
- Correções implementadas com código antes/depois
- Resultados esperados
- Changelog completo

### 2. Políticas do Agente

Leia o arquivo: `plans/policy_ground_truth.md`

Este documento define as regras oficiais que o agente deve seguir:

- Políticas de troca (30 dias)
- Garantia para defeito (90 dias)
- Diferenciação entre loja física e site/app
- Regras de desconto
- Anti-alucinação

### 3. Arquitetura do Sistema

Arquivos principais para entender o fluxo:

| Arquivo | Função |
|---------|--------|
| `src/lib/intent-classifier.ts` | Classificação de intenção (INFO, SALES, SAC, etc.) |
| `src/lib/action-decider.ts` | Decisão de ação baseada em contexto |
| `src/lib/slot-extractor.ts` | Extração de dados (nome, CPF, produto, etc.) |
| `src/lib/state-manager.ts` | Gerenciamento de estado da conversa |
| `src/lib/templates/*.ts` | Templates de resposta por intenção |
| `src/services/sacMinimum.ts` | Lógica específica de SAC |

### 4. Logs de Teste Recentes

Execute o sandbox e analise logs de conversas reais:

```bash
npm run dev:sandbox:chat
```

---

## Análise Solicitada

### Parte 1: Diagnóstico de Padrões

Analise as 4 sessões de calibração e responda:

1. **Padrões Recorrentes**
   - Quais tipos de problema aparecem com mais frequência?
   - Há problemas que foram "resolvidos" mas reapareceram?
   - Quais arquivos são mais modificados? Por quê?

2. **Classificação de Problemas**
   Categorize os problemas encontrados:
   - **Críticos**: Quebram o fluxo principal
   - **Moderados**: Confundem o cliente mas não impedem atendimento
   - **Menores**: Afetam a experiência mas não o resultado

### Parte 2: O Que Está Funcionando

Identifique os pontos fortes do sistema atual:

1. **Fluxos bem calibrados**
   - Quais cenários o agente resolve bem?
   - Quais intents são classificadas corretamente?

2. **Decisões acertadas**
   - Quais correções tiveram mais impacto positivo?
   - Quais padrões de código mostraram-se eficazes?

### Parte 3: O Que Precisa Ajustar

Identifique oportunidades de melhoria:

1. **Problemas Estruturais**
   - Há problemas na arquitetura do classificador?
   - A ordem de verificação de intents está correta?
   - Os templates cobrem todos os cenários?

2. **Edge Cases Não Tratados**
   - Quais cenários o agente ainda não consegue lidar?
   - Quais inputs do usuário geram comportamento inesperado?

3. **Experiência do Usuário**
   - A saudação está adequada?
   - O tom de voz está consistente?
   - As perguntas são claras?

### Parte 4: Recomendações Prioritárias

Crie uma lista de ações priorizadas:

| Prioridade | Problema | Solução Proposta | Esforço | Impacto |
|------------|----------|------------------|---------|---------|
| P0 | (crítico) | (como resolver) | (baixo/médio/alto) | (alto/médio/baixo) |
| P1 | ... | ... | ... | ... |

### Parte 5: Métricas de Sucesso

Defina KPIs para medir a evolução:

1. **Taxa de classificação correta** - Como medir?
2. **Taxa de escalação desnecessária** - Como reduzir?
3. **Satisfação do cliente** - Como coletar?

---

## Formato da Resposta

Sua análise deve seguir esta estrutura:

```markdown
# Análise Especialista - Agente Cadu

## Resumo Executivo
(2-3 parágrafos com visão geral)

## 1. Diagnóstico de Padrões
(análise detalhada)

## 2. O Que Está Funcionando
(lista com exemplos)

## 3. O Que Precisa Ajustar
(lista com exemplos)

## 4. Recomendações Prioritárias
(tabela ordenada)

## 5. Métricas de Sucesso
(KPIs e como medir)

## 6. Próximos Passos Imediatos
(3-5 ações para implementar agora)
```

---

## Dicas para Análise

1. **Considere o contexto brasileiro**: O agente atende clientes em português, com expressões regionais e erros de digitação comuns.

2. **Foco no atendimento comercial**: O agente é de uma loja de esportes, não um assistente genérico. Priorize cenários de venda e SAC.

3. **Equilíbrio entre regras e flexibilidade**: O agente usa templates para respostas rápidas, mas precisa saber quando usar LLM para casos complexos.

4. **Evite overfitting**: Cuidado para não criar regras muito específicas que quebram com variações de input.

5. **Pense em manutenibilidade**: Soluções simples são melhores que lógicas complexas com múltiplas condições.

---

## Execução

Para realizar esta análise:

1. Leia todos os materiais de referência
2. Execute o sandbox e faça testes interativos
3. Analise os logs de classificação e decisão
4. Preencha o formato de resposta
5. Apresente findings e recomendações

---

## ADENDO OBRIGATORIO (CHAT_ONLY / Runtime Real)

> Este adendo atualiza o prompt acima para garantir que a analise seja util para calibracao real do Cadu no projeto atual.

### 1. Validacao obrigatoria no runtime real (CHAT_ONLY)

A analise NAO deve se basear apenas em docs/historico.
Ela deve ser validada contra o fluxo real de calibracao:

`chat-interactive -> /api/webhook -> worker -> outbox -> /api/test/last-reply`

Rode:

```bash
npm run dev:sandbox:chat
node scripts/chat-interactive.js
```

Use como evidencia principal os logs com tags:

- `[INBOUND]`
- `[CLASSIFY]`
- `[STATE]`
- `[ACTION]`
- `[RESPONSE]`
- `[OUTBOX]`
- `[OUTBOUND]`

### 2. Classificacao por camada (obrigatoria)

Toda recomendacao/findings relevante deve indicar a camada principal:

- `infra/runtime`
- `intent-classifier`
- `slot-extractor`
- `state-transition`
- `action-decider`
- `template`
- `LLM/guardrail`
- `human-loop`

### 3. Filtro de recomendacao (obrigatorio)

Para cada recomendacao, responder explicitamente:

1. Tem evidencia no log atual do `CHAT_ONLY`?
2. Qual a camada principal?
3. Ja foi resolvido/parcialmente resolvido?
4. Impacta diretamente o loop terminal-first?

Se nao houver evidencia no log atual, marcar como:
- `Hipotese / Backlog`

### 4. Formato adicional obrigatorio na resposta

Adicionar apos a secao de recomendacoes uma secao chamada:

```markdown
## Validacao Contra CHAT_ONLY

| Recomendacao | Evidencia no log atual? | Camada | Status (ja corrigido/parcial/pendente) | Acao sugerida |
|---|---|---|---|---|
```

### 5. Plano executavel (patches)

Adicionar uma secao final chamada:

```markdown
## Plano de Execucao em Patches
- Patch 1 (deterministico) + teste de aceite
- Patch 2 (templates) + teste de aceite
- Patch 3 (LLM/guardrail, se necessario) + teste de aceite
```

### 6. Regra de ouro

Quando houver conflito entre recomendacao generica e evidencia do log atual do `CHAT_ONLY`, priorize a evidencia do runtime real.
