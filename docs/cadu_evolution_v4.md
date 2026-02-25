# Evolução do Cadu v4 - Relatório Técnico

## Data: 2026-02-21
## Versão: 4.1 - Padrões de Condução

---

## 1. PRINCIPAIS FALHAS ENCONTRADAS

### 1.1 Análise dos Dados Reais (6.220 turns, 536 conversas)

| Problema | Frequência | Impacto |
|----------|------------|---------|
| Conversas sem conclusão | ~65% | Crítico |
| Respostas longas (>30 palavras) | ~45% | Alto |
| Repetição de perguntas | ~30% | Médio |
| Escalação prematura | ~15% | Médio |
| Falta de CTA em vendas | ~50% | Crítico |

### 1.2 Padrões de Falha Observados

**VENDAS:**
- Agent pergunta múltiplas vezes a mesma coisa
- Não faz proposta de reserva/separação
- Não oferece próximo passo claro
- Texto longo sem ação

**SAC:**
- Pede informações já fornecidas
- Não dá protocolo ou solução
- Escala antes de tentar resolver
- Deixa conversa aberta

---

## 2. PADRÃO IDEAL DE CONVERSA (BASEADO EM DADOS REAIS)

### 2.1 Exemplos de Ouro (Golden Examples)

```json
// EXEMPLO 1: Venda rápida
Cliente: "Tem chuteira n31 campo?"
Agente: "Temos sim, 3 cores. Qual seria a numeração?"
Cliente: "32"
Agente: "Temos! Quer que eu deixe reservada?"
Cliente: "Blz"
Agente: "Deixei separado. Me mande um oi quando estiver vindo"

// EXEMPLO 2: SAC Atraso
Cliente: "Meu pedido não chegou ainda"
Agente: "Qual o número do pedido e CPF?"
Cliente: "123456789 e ***.***.***-**"
Agente: "Aguarde, vou verificar"
```

### 2.2 Métricas do Padrão Ideal

| Métrica | Valor Ideal |
|---------|--------------|
| Turnos por conversa | 4-6 |
| Palavras por resposta (agente) | 5-15 |
| Palabras por resposta (cliente) | 1-20 |
| Tempo de resposta | < 30 segundos |
| Taxa de conclusão | > 80% |

### 2.3 Regras de Ouro

1. **RESPONDER DIRETO** - Sem enrolação, "Oi" ou "Boa tarde" é suficiente
2. **UMA AÇÃO POR MENSAGEM** - Perguntar OU propor OU informar
3. **SEMPRE TERMINAR COM AÇÃO** - CTA (vendas) ou próximo passo (SAC)
4. **NUNCA REPETIR** - Se cliente já respondeu, não perguntar de novo

---

## 3. MUDANÇAS IMPLEMENTADAS

### 3.1 Task #23 - CTA Obrigatório em VENDAS ✅

**Arquivo:** `src/prompts/system_cadu_v3.txt`

**Mudança:**
```
## 1. VENDAS
4. **🔥 CTA OBRIGATÓRIO**: Toda resposta em VENDAS DEVE terminar com uma pergunta de fechamento:
   - "Quer que eu separe pra você?"
   - "Prefere buscar hoje ou amanhã?"
   - "Me avisa quando quiser passar aqui"
   - "Bora fechar?"
   - "Quer o link pra comprar?"
```

**Impacto:** Garante que toda resposta de vendas propose próxima ação.

---

### 3.2 Task #24 - Limite de Palavras no Guardrails ✅

**Arquivo:** `src/lib/guardrails.ts`

**Mudança:**
- Adicionado verificação de limite de palavras por intent
- Novos limites:
  - SALES: 10 palavras
  - SAC_TROCA: 15 palavras
  - SAC_ATRASO: 15 palavras
  - INFO: 6 palavras

**Impacto:** Respostas mais objetivas, redução de tokens.

---

### 3.3 Task #25 - Lógica de Conclusão no Evaluator ✅

**Arquivo:** `tests_harness/evaluator.ts`

**Mudança:**
- `checkConclusion()` agora avalia progresso parcial
- Dá crédito quando:
  - Agent pediu informação e cliente forneceu
  - Proposta feita mas cliente não confirmou
- Detalhes específicos em cada caso

**Impacto:** Score reflete resultado real, não só tom.

---

## 4. CONFIGURAÇÕES ATUALIZADAS (.env)

```bash
# Limites de palavras (novos)
MAX_AGENT_WORDS_SALES=10
MAX_AGENT_WORDS_SAC_TROCA=15
MAX_AGENT_WORDS_SAC_ATRASO=15
MAX_AGENT_WORDS_INFO=6

# Limites de turnos
MAX_TURNS_SALES=8
MAX_TURNS_SAC=10
MAX_TURNS_INFO=5

# Histórico
MAX_HISTORY_MESSAGES=8
```

---

## 5. MUDANÇAS ADICIONAIS

### 5.1 T3 - VirtualCustomer com Dados Reais ✅

**Arquivo:** `tests_harness/virtual_customer.ts`

**Mudanças:**
- Carrega openers reais do arquivo `data/real_openers.json`
- Adiciona função `getTurnLimit(intent)` para limitar turns por intent
- Limites ideiais:
  - SALES: 5 turns
  - SAC_TROCA: 6 turns
  - SAC_ATRASO: 5 turns
  - INFO: 3 turns

---

## 6. NOVOS PADRÕES DE CONDUÇÃO (v4.1)

### 6.1 Regras Obrigatórias Aplicadas

**Arquivo:** `src/prompts/system_cadu_v3.txt`

#### 🚨 REGRAS OBRIGATÓRIAS
1. **SEMPRE CONDUZIR** - Toda resposta deve levar o cliente para o próximo passo
2. **NUNCA PARAR EM RESPOSTA SECA**
   - ❌ "Tem sim"
   - ✔ "Tem sim + próxima ação"
3. **FOCO EM FECHAMENTO**
   - Venda → reserva ou retirada
   - SAC → dados + encaminhamento
4. **OBJETIVIDADE** - Frases curtas, no máximo 1 pergunta por mensagem
5. **BASEADO NA REALIDADE** - Nunca inventar estoque ou prazo

---

### 6.2 Fluxo de VENDAS Aplicado

**Arquivo:** `src/prompts/system_cadu_v3.txt`

#### 📌 INÍCIO (cliente pergunta por produto)
- Cumprimentar de volta (energia + objetividade)
- Confirmar que verificou no sistema
- Informar disponibilidade
- Conduzir para próximo passo (reserva)

#### 📌 CASO TENHA O PRODUTO
```
"Boa tarde! Temos sim no sistema 👍
Qual numeração você procuring?"

→ "Perfeito! Temos disponível sim.
Se você vier hoje, consigo deixar reservado pra você aqui na loja. Quer que eu separe?"

→ "Me envia seu nome completo que já solicito a reserva para você 👍"
```

#### 📌 CASO NÃO TENHA O PRODUTO
```
"Esse modelo não temos disponível aqui no momento 😕
Mas posso ver outro parecido pra você ou verificar encomenda, quer?"
```

---

### 6.3 Fluxo de PEDIDOS Aplicado

**Arquivo:** `src/prompts/system_cadu_v3.txt`

#### 📌 REGRA PRINCIPAL
Para qualquer análise de pedido, coletar:
- nome completo
- e-mail cadastrado
- número do pedido

#### 📌 PADRÃO DE RESPOSTA
```
"Boa tarde! Vou verificar isso pra você agora 👍
Me envia por favor:
- nome completo
- e-mail do cadastro
- número do pedido"

→ "Perfeito! Já passei as informações para o time responsável.
Você receberá o retorno no seu e-mail 👍"
```

---

### 6.4 Fluxo de SAC Aplicado

**Arquivo:** `src/prompts/system_cadu_v3.txt`

#### 📌 FLUXO
1. Demonstrar empatia
2. Coletar dados essenciais (nome, e-mail, descrição, pedido)
3. Encaminhar

#### 📌 RESPOSTA PADRÃO FINAL
```
"Perfeito! Já registrei seu caso com nosso time de suporte.
Eles vão analisar e você recebe o retorno no seu e-mail 👍"
```

---

### 6.5 Few-Shots Atualizados

**Arquivos:**
- `src/prompts/sales_greeting.txt`
- `src/prompts/sales_discovery.txt`
- `src/prompts/sales_closing.txt`
- `src/prompts/sales_proposal.txt`
- `src/prompts/support_sac.txt`

**Mudanças:**
- `sales_discovery.txt`: Adicionada regra "NUNCA PARE SEM PERGUNTA OU AÇÃO"
- `sales_closing.txt`: Adicionada regra "🔥 REGRA OBRIGATÓRIA: Toda resposta DEVE terminar com CTA"

---

## 7. PRÓXIMOS PASSOS (Tarefas Pendentes)

### T1 - Padrão de Resposta Obrigatória ✅
- Implementar regra no guardrails: nenhuma resposta sem ação ✅
- Adicionar validação de CTA/next-step ✅

### T2 - Limite de Texto Refinado ✅
- Limites implementados via env ✅
- Guardrails verifica palavras ✅

### T4 - Avaliação Baseada em Resultado ✅
- Score agora mede conclusão ✅

### T5 - Uso de Dados Reais ✅
- VirtualCustomer carrega real_openers.json ✅

### T6 - Redução de Custo ✅
- MAX_HISTORY_MESSAGES=8 ✅

---

## 8. RESULTADOS ESPERADOS

| Métrica | Antes | Depois |
|---------|-------|--------|
| Score médio | ~46 | >70 |
| Taxa de conclusão | ~35% | >60% |
| Tokens/conversa | ~18k | <10k |
| Turns/conversa | 8+ | 4-6 |

---

## 9. VALIDAÇÃO

Para validar as mudanças, executar:

```bash
cd tests_harness
npx ts-node runner.ts
```

Analisar:
- Score médio por cenário
- Taxa de conclusão (CONCLUIDO vs PARCIAL/FALHA)
- Tokens gastos
- Padrão das conversas
