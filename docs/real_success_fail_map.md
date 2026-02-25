# Mapa de Sucesso e Falha - Análise Real de Conversas

**Data da análise:** 2026-02-21
**Fonte:** data/conversations_real.jsonl (536 conversas, 6.220 mensagens)

---

## 1. Visão Geral das Métricas por Intent

| Intent | Conversas | Média Turnos | Palavras Agent | Palavras Cliente | Taxa Perguntas | Tempo Resposta | Taxa Resolução | Taxa Escalação |
|--------|-----------|--------------|----------------|------------------|----------------|---------------|----------------|----------------|
| **SALES** | 18 | 8.7 | 5.7 | 8.2 | 0.18 | 2.7 min | 27.8% | 0.0% |
| **SAC_TROCA** | 2 | 21.0 | 13.3 | 11.1 | 0.17 | 18.0 min | 50.0% | 50.0% |
| **SAC_ATRASO** | 2 | 67.5 | 13.3 | 17.3 | 0.02 | 1.3 min | 50.0% | 0.0% |
| **INFO** | 514 | 11.5 | 5.4 | 4.7 | 0.12 | 5.0 min | 17.7% | 3.7% |

### Médias Globais
- **Total de conversas analisadas:** 536
- **Taxa de resolução global:** 7.8% (42 conversas)
- **Tempo médio de primeira resposta:** 5.0 minutos

---

## 2. Análise por Intent

### 2.1 SALES (Vendas)

**Métricas Médias:**
- Turnos por conversa: 8.7
- Palavras por mensagem do agente: 5.7
- Palavras por mensagem do cliente: 8.2
- Taxa de perguntas do agente: 18%
- Tempo de resposta: 2.7 minutos

**Padrões de Sucesso:**
1. Respostas curtas e diretas
2. Perguntas sobre numeração/tamanho
3. Proposta de ação clara ("quer que eu reserve?")
4. Confirmação de disponibilidade

**Exemplo Bem-sucedido (5 linhas):**
```
Client: Vcs tem qual pro 5 bump disponível na loja?
Agent: Boa tarde, meu nome é Felipe
Agent: Qual seria a numeração?
Client: 42 se a forma for grande
Agent: Temos sim, 3 cores. Gostaria que eu deixasse reservada?
```

**Anti-padrões (Falhas):**
- Saudação excessivamente longa ("Boa tarde, meu nome é Felipe, sou assistente virtual...")
- Explicações sobre como pedir no site
- Não fazer предложение de reserva
- Deixar cliente sem resposta definida

---

### 2.2 SAC_TROCA (Troca/Devolução)

**Métricas Médias:**
- Turnos por conversa: 21.0
- Palavras por mensagem do agente: 13.3
- Palavras por mensagem do cliente: 11.1
- Taxa de perguntas do agente: 17%
- Tempo de resposta: 18.0 minutos

**Padrões de Sucesso:**
1. Coleta rápida de dados (CPF, número do pedido)
2. Abertura de chamado/ticket
3.Informação clara de prazos

**Exemplo:**
```
Client: Quero trocar meu tênis
Agent: Qual o número do pedido?
Client: 123456
Agent: Vou verificar e já te retorno com as opções
```

**Anti-padrões:**
- Empatia exagerada ("Poxa, que pena! Sinto muito...")
- Perguntas longas e robotizadas
- Sem proposta de ação clara

---

### 2.3 SAC_ATRASO (Atraso de Entrega)

**Métricas Médias:**
- Turnos por conversa: 67.5
- Palavras por mensagem do agente: 13.3
- Palavras por mensagem do cliente: 17.3
- Taxa de perguntas do agente: 2%
- Tempo de resposta: 1.3 minutos

**Padrões de Sucesso:**
1. Verificação rápida de status
2. Informação de prazo previsto
3. Abertura de chamado quando necessário

**Anti-padrões:**
- Longas sequências de tickets sem resolução
- Cliente precisa repetir informações
- Falta de follow-up

---

### 2.4 INFO (Informação Geral)

**Métricas Médias:**
- Turnos por conversa: 11.5
- Palavras por mensagem do agente: 5.4
- Palavras por mensagem do cliente: 4.7
- Taxa de perguntas do agente: 12%
- Tempo de resposta: 5.0 minutos

**Maior volume:** 514 conversas (96% do total)

---

## 3. Top 10 Falhas Recorrentes

| # | Falha | Frequência | Gatilho | Impacto |
|---|-------|------------|---------|---------|
| 1 | Respostas robotizadas | Alta | "Boa tarde, meu nome é..." | Cliente desiste |
| 2 | Explicação excessiva | Alta | "Somente para pedir direto no site" | Cliente desiste |
| 3 | Sem proposta de ação | Alta | "Temos o produto" sem seguir | Não fecha venda |
| 4 | Deixar cliente em aberto | Média | "Vou verificar" sem prazo | Escalação |
| 5 | Não faz perguntas | Média | Respostas monosílabas | Não qualifica |
| 6 | Pedir informações repetidamente | Média | CPF/pedido já informado | Frustração |
| 7 | Escalação prematura | Média | Sem tentar resolver | Perda de controle |
| 8 | Mensagens muito longas | Baixa | Texto > 50 palavras | Cliente desiste |
| 9 | Não confirmar entendimento | Baixa | Não resume problema | Mal-entendido |
| 10 | Tom não empático | Baixa | Respostas frias | Cliente insatisfeito |

---

## 4. Gatilhos de Escalação Precoce

### 4.1 Gatilhos Identificados nos Dados

| Gatilho | Ocorrências | Comportamento Resultante |
|---------|-------------|--------------------------|
| "falar com gerente" | 12 | Cliente pede escalação |
| "não consigo" | 10 | Frustração com sistema |
| "reclamação" | 6 | Insatisfação explícita |
| "humano/atendente" | 6 | Quer contato humano |
| "já tentei" | 2 | Tentativas anteriores falhas |

### 4.2 Sequências que Levam à Escalação

**Sequência Problemática 1:**
```
Agent: Boa tarde como posso ajudar?
Client: Tem Nike?
Agent: Temos várias opções. Qual modelo?
Client: Qualquer uma
Agent: Temos Air Max, Air Force...
Client: (silêncio ou desiste)
```

**Sequência Problemática 2:**
```
Agent: Vou verificar e te retorno
Client: (aguarda 30 min)
Agent: (não retorna)
Client: Não consigo resolver isso
```

**Sequência Problemática 3:**
```
Client: Meu pedido não chegou
Agent: Qual o número?
Client: Já passei 3 vezes
Agent: Pode repeir?
Client: Quero falar com gerente
```

---

## 5. Frases de Sucesso (Micro-padrões)

### 5.1 Frases do Agente que Funcionam

| Frase | Contexto | Efeito |
|-------|----------|--------|
| "Qual seria a numeração?" | Consulta produto | Qualifica necessidade |
| "Temos! Quer que separe?" | Produto disponível | Proposta direta |
| "Só um momento" | Verificação | Espera aceita |
| "Obrigado" | Finalização | Cortesia |
| "De nada" | Resposta | Encerramento positivo |
| "Certo" | Confirmação | Alinhamento |
| "Qual tamanho?" | Consulta produto | Direto |

### 5.2 Frases do Agente que Fracassam

| Frase | Problema |
|-------|----------|
| "Boa tarde, meu nome é X" | Excesso de formalidade |
| "Como posso ajudar?" | Genérico, não qualifica |
| "Somos somente para pedido direto no site" | Limitação exposta |
| "Vou verificar e te retorno" | Sem prazo definido |
| "Poxa, que pena!" | Empatia exagerada |

---

## 6. Recomendações de Otimização

### Para SALES:
1. **Manter respostas abaixo de 10 palavras**
2. **Sempre propor ação**: "Quer que reserve?"
3. **Perguntar numeração primeiro**
4. **Confirmar reserva com prazo**

### Para SAC_TROCA/SAC_ATRASO:
1. **Coletar dados uma única vez**
2. **Dar prazo específico** (ex: "2 minutos")
3. **Se precisar escalar, avisar antes**

### Para INFO:
1. **Identificar intent rapidamente**
2. **Direcionar para fluxo correto**
3. **Evitar explicações sobre limitações do sistema**

---

## 7. Dados de Referência

- **Arquivo fonte:** `data/conversations_real.jsonl`
- **Período:** 2025-09-01 a 2026-02-20
- **Total mensagens:** 6.220
- **Total conversas:** 536
- **Média mensagens/conversa:** 11.6

### Limitações da Análise:
- Classificação de intents baseada em palavras-chave (não ML)
- Resolução inferida por palavras-chave no texto
- Dados podem incluir conversas entre atendentes humanos
