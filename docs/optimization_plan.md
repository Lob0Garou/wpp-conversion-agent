# Plano de Otimização - Redução de Custo e Melhoria de Performance

> Fevereiro 2026 - Baseado em análise de arquitetura

---

## 📊 Status Atual

### Histórico de Mensagens
- **Configuração atual:** 8 mensagens (4 turnos)
- **Ambiente:** `MAX_HISTORY_MESSAGES=8`

### Pontos de Atenção
1. Histórico pode estar maior que necessário
2. Prompts podem ter redundância
3. Múltiplas chamadas LLM por conversa
4. Slot extraction em cada mensagem

---

## 🎯 Otimizações Propostas

### 1. REDUZIR HISTÓRICO (Alto Impacto)

**Problema:** 8 mensagens pode ser excessivo para casos simples

**Solução:**
- Reduzir para 6 mensagens (3 turnos)
- Usar adaptive context: 4 para vendas simples, 8 para SAC complexo

**Impacto estimado:** ~25% redução de tokens por chamada

**Implementação:**
```env
# Reduzir de 8 para 6
MAX_HISTORY_MESSAGES=6
```

---

### 2. SIMPLIFICAR PROMPTS (Alto Impacto)

**Problema:** Prompt atual (system_cadu_base.txt) tem ~1800 tokens

**Solução:**
- Usar system_cadu_v3.txt (~600 tokens)
- Prompts modulares sob demanda

**Impacto estimado:** ~67% redução no system prompt

**Arquivos:**
- `src/prompts/system_cadu_v3.txt` - NOVO (criado)
- `brain/spec_cadu_v3.md` - SPEC completo
- `brain/prompts/` - Módulos opcionais

---

### 3. CACHE DE INTENTS (Médio Impacto)

**Problema:** classifyIntent() roda a cada mensagem

**Solução:**
- Cachear intent por X mensagens
- Só re-classificar se mudança de estado

**Impacto estimado:** ~10% redução de processamento

---

### 4. OTIMIZAR SLOT EXTRACTION (Médio Impacto)

**Problema:** Extrai slots de todo o histórico a cada mensagem

**Solução:**
- Extrair só da última mensagem
- Manter slots do state

**Impacto estimado:** ~15% redução de tokens

---

### 5. REDUZIR CHAMADAS LLM (Alto Impacto)

**Problema:** Possíveis múltiplas chamadas

**Solução:**
- Unificar: intent + slot + resposta em uma chamada
- Usar cached products (não buscar a cada vez)

---

## 📈 Estimativas de Economia

| Otimização | Redução Tokens | Economia Mensal* |
|------------|----------------|------------------|
| Histórico 6 msgs | -25% | R$ 150 |
| Prompt V3 | -67% | R$ 400 |
| Slot Extraction | -15% | R$ 90 |
| Cache | -10% | R$ 60 |
| **TOTAL** | **~50%** | **~R$ 700/mês** |

*Estimativa baseada em 10k conversas/mês

---

## 🔧 Próximos Passos

### Imediatos (Hoje)
1. [x] Criar prompt V3 (~600 tokens)
2. [x] Criar spec brain/
3. [ ] Alterar MAX_HISTORY_MESSAGES=6

### Curto Prazo (1 semana)
1. [ ] Testar com cenários novos
2. [ ] Medir tokens por conversa
3. [ ] Validar qualidade de resposta

### Médio Prazo (1 mês)
1. [ ] Implementar cache de intent
2. [ ] Adaptive context
3. [ ] A/B test com vs sem otimizações

---

## ✅ Checklist de Validação

- [ ] Score não piora (< 5% de queda)
- [ ] Tempo de resposta estável
- [ ] Taxa de escalação similar
- [ ] Satisfação do cliente mantida

---

## 📁 Arquivos Criados

- `src/prompts/system_cadu_v3.txt` - Prompt otimizado
- `brain/spec_cadu_v3.md` - Especificação completa
- `brain/prompts/system_core.md`
- `brain/prompts/style_whatsapp.md`
- `brain/prompts/sac_rules.md`
- `brain/prompts/sales_rules.md`
- `brain/prompts/escalation_rules.md`

---

*Documento gerado automaticamente*
