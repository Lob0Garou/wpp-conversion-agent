# Test Suite - Cadu V2

## Como Testar
1. `ngrok http 3000` para expor webhook
2. Registrar webhook URL no Meta Dashboard
3. Enviar mensagens pelo WhatsApp
4. Verificar logs no terminal + estado no banco

## Verificar no Banco
```sql
SELECT current_state, slots, message_count, stall_count, frustration_level
FROM conversations
WHERE id = '<conversation_id>';
```

---

## VENDAS (10 Cenários)

### Cenário 1: Happy Path Completo
**Fluxo:** greeting → discovery → proposal → closing
```
Cliente: "oi"
→ Estado: greeting. Cadu cumprimenta e pergunta o que procura.

Cliente: "quero tênis pra corrida"
→ Slot: usage=running. Estado: discovery.

Cliente: "42"
→ Slot: size=42. Estado: proposal (slots preenchidos).

Cliente: "quero o primeiro"
→ Estado: closing. Cadu confirma produto + tamanho.
```
**Verificar:** Slots populados, transições corretas, sem repetição de saudação.

### Cenário 2: Cliente Direto
**Fluxo:** greeting → discovery → proposal
```
Cliente: "tem Nike Air Max 42?"
→ Slots: product=nike, size=42. Estado: proposal direto.
```
**Verificar:** Pula discovery, vai direto pra recomendação.

### Cenário 3: Stall Recovery
```
Cliente: "oi"
Cliente: "sei lá"
Cliente: "tanto faz"
→ stallCount >= 2. Estado: proposal (forçado).
```
**Verificar:** Sistema empurra pra proposal quando conversa estagna.

### Cenário 4: Objeção de Preço
```
Cliente: "quero tênis pra corrida"
Cadu: [recomenda produto]
Cliente: "tá caro"
→ Intent: OBJECTION. Estado: objection.
```
**Verificar:** Cadu reenquadra com benefício, não pressiona.

### Cenário 5: Cross-sell
```
Cliente: [escolhe tênis de corrida]
Cadu: confirma + sugere meia de compressão
```
**Verificar:** Cross-sell aparece APÓS escolha, não antes.

### Cenário 6: Cliente Retornando
```
[Conversa existente com slots: usage=running]
Cliente: "oi"
→ NÃO repete saudação genérica. Usa contexto.
```
**Verificar:** Saudação personalizada com dados existentes.

### Cenário 7: Múltiplos Produtos
```
Cliente: "quero ver tênis e meia"
→ Cadu foca no principal primeiro (tênis), depois cross-sell (meia).
```
**Verificar:** Não sobrecarrega com tudo de uma vez.

### Cenário 8: Tamanho Indisponível
```
Cliente: "tem Nike Pegasus 48?"
→ Se não tem no inventário, Cadu é honesto e sugere alternativa.
```
**Verificar:** Não inventa disponibilidade.

### Cenário 9: "Só Olhando"
```
Cliente: "só tô olhando"
→ Cadu não pressiona. Faz soft discovery.
```
**Verificar:** Resposta leve, sem pressão.

### Cenário 10: Pergunta de Preço sem Contexto
```
Cliente: "quanto custa um tênis?"
→ Cadu faz sondagem primeiro (qual tipo? pra que uso?)
```
**Verificar:** Não chuta preço. Sonda primeiro.

---

## SUPORTE (5 Cenários)

### Cenário 11: Atraso de Pedido
```
Cliente: "meu pedido tá atrasado"
→ Intent: SUPPORT. Estado: support.
→ Cadu pede número do pedido. Escala para humano.
```
**Verificar:** Empático + escala.

### Cenário 12: Troca
```
Cliente: "quero trocar meu tênis"
→ Intent: SUPPORT. Escala imediatamente (troca requer aprovação).
```
**Verificar:** Não tenta resolver sozinho. Escala.

### Cenário 13: Defeito
```
Cliente: "meu tênis veio com defeito"
→ Cadu reconhece o problema + escala com contexto.
```
**Verificar:** Empatia primeiro, depois escala.

### Cenário 14: Pedir Atendente
```
Cliente: "quero falar com atendente"
→ Intent: HANDOFF. requires_human: true. Escala imediatamente.
```
**Verificar:** Não tenta convencer a ficar. Escala direto.

### Cenário 15: Menção a Procon
```
Cliente: "vou no Procon"
→ Intent: HANDOFF. frustrationLevel++. Escala imediatamente.
```
**Verificar:** Resposta empática + escala urgente.

---

## EDGE CASES (5 Cenários)

### Cenário 16: "Oi" Repetido
```
Cliente: "oi"
Cadu: [saudação]
Cliente: "oi"
→ NÃO repete saudação. Interpreta como "estou esperando".
```
**Verificar:** Sem repetição. Guardrails de similaridade.

### Cenário 17: Emoji Sozinho
```
Cliente: "👍"
→ Cadu responde naturalmente, sem quebrar.
```
**Verificar:** Não gera erro. Responde de forma genérica.

### Cenário 18: Mensagem Longa
```
Cliente: [parágrafo de 500 palavras sobre o que precisa]
→ Cadu extrai slots e responde de forma concisa.
```
**Verificar:** Extrai dados relevantes. Resposta curta.

### Cenário 19: Mensagens Rápidas
```
Cliente: "oi" (22:00)
Cliente: "tem tênis?" (22:00)
→ Processamento sequencial. Idempotência funciona.
```
**Verificar:** Não gera duplicatas. Cada mensagem processada uma vez.

### Cenário 20: LLM Timeout
```
[OpenRouter API fora do ar]
→ Fallback: "Desculpe, estou verificando essa informação. Um momento."
→ requires_human: true
```
**Verificar:** Não quebra. Fallback seguro.

---

## Métricas de Sucesso

| Métrica | Meta |
|---|---|
| Conversão (% chegando a closing) | 12%+ |
| Ticket médio (cross-sell aceito) | +25% |
| Sem repetição de saudação | 100% |
| Escalação correta (frustração) | 100% |
| Fallback seguro (LLM erro) | 100% |
