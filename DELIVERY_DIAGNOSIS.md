# 🔍 Diagnóstico: Resposta no Admin mas Não Chega no WhatsApp

## Seu Situação Exata

```
✅ Você envia: "Olá teste" do WhatsApp
✅ Sistema recebe: Inbound webhook
✅ Sistema gera: Resposta automática "Sou o assistente..."
✅ Sistema envia: POST para Meta API (HTTP 200 OK)
✅ Sistema salva: Mensagem no banco + aparece no admin
❌ Mas: Resposta NÃO aparece no seu WhatsApp

Conclusão: Problema de **entrega assíncrona** (não é erro da API)
```

---

## 🎯 A Meta Trabalha em 2 Etapas

### Etapa 1: Aceitação (Síncrona) ✅
```
Seu app → POST /messages → Meta
Meta retorna: 200 OK + wamid
(Tudo OK aqui)
```

### Etapa 2: Entrega (Assíncrona) ❌
```
Meta → Webhook POST (status update)
Seu app recebe: {"status":"sent"} ou {"status":"failed"}
(Aqui está o problema)
```

**Você está vendo o Etapa 1 como sucesso, mas o Etapa 2 está falhando.**

---

## 🔧 Como Diagnosticar (3 Passos)

### Passo 1: Observar Webhook de Status

Abra o **console do navegador (F12)** enquanto testa:

```bash
# Terminal: npm run dev
# Observar logs que começam com [WEBHOOK] 📶 Status Update
```

**Procure por:**
```
[WEBHOOK] 📶 Status Update: [{"id":"wamid.ABC123","status":"sent",...}]
```

ou

```
[WEBHOOK] 📶 Status Update: [{"id":"wamid.ABC123","status":"failed","errors":[{"code":131026,...}]}]
```

### Passo 2: Identificar o Código de Erro

Se vê `"status":"failed"`, anote o `"code"`:

| Código | Significado | Solução |
|--------|-------------|---------|
| **131026** | RESOURCE_NOT_AVAILABLE (número desativado) | Re-adicionar número na Meta |
| **131028** | USER_UNSUBSCRIBED (fora da janela 24h) | Usar template ou usuário enviar |
| **131003** | UNDELIVERABLE (número inválido) | Verificar E.164 |
| **131051** | RATE_LIMIT (muitas mensagens) | Adicionar delay |

### Passo 3: Confirmar Webhook está Inscrito

Se **NÃO vê nenhum log de status**:

1. Vá para: https://developers.facebook.com/apps/{APP_ID}/webhooks
2. Procure por: "Subscribe to webhook events"
3. Verificar: ☑ `message_status` está marcado?

Se não está, **marque agora** e re-teste.

---

## 🚨 Cenários Mais Prováveis

### Cenário A: Código 131026 (Número Desativado)

**Log que você verá:**
```
[WEBHOOK] 📶 Status Update: [...,"code":131026,"title":"RESOURCE_NOT_AVAILABLE"...]
```

**Causa:** Seu número foi desativado/expirou na Meta

**Solução:**
1. https://developers.facebook.com/apps/{APP_ID}/whatsapp-business/configuration
2. Procure: **"Recipient Test Numbers"** ou **"To Numbers"**
3. Se número está lá: **Delete** e **Re-adicione**
4. Meta envia SMS com código → **Digita na interface**
5. Status fica **"Active"** novamente
6. **Re-teste**

### Cenário B: Código 131028 (Janela 24h Fechada)

**Log que você verá:**
```
[WEBHOOK] 📶 Status Update: [...,"code":131028,"title":"USER_UNSUBSCRIBED"...]
```

**Causa:** Você não respondeu em 24h, a janela fechou

**Solução:**
- **Template funciona?** Teste com `/api/test-template`
  - Se sim: problema é 100% janela 24h (normal)
  - Se não: problema é token/número (grave)

**Para abrir a janela:**
1. Você envia nova mensagem do WhatsApp
2. Sistema responde automaticamente
3. Janela abre por 24h

### Cenário C: Nenhum Log de Status

**Significa:** Webhook de status **não está inscrito** na Meta

**Solução:**
1. Meta Dashboard → Webhooks
2. "Subscribe to webhook events" → Marque `message_status`
3. Salve
4. Re-teste

---

## 🎯 Teste Completo (Passo a Passo)

### Setup

```bash
# Terminal 1: Rodar app
npm run dev

# Terminal 2 (opcional): Observar logs em tempo real
# (você verá [WHATSAPP] e [WEBHOOK] no Terminal 1)
```

### No Navegador

1. **Abra F12 (Console)**
   - Não fecha durante o teste!
   - Você vai procurar por [WEBHOOK] logs

2. **Abra admin** (http://localhost:3001/admin)

3. **Clique 🔧 Debug** (sidebar)

4. **Tipo: Texto**
   - Número: `5585985963329`
   - Mensagem: `Teste diagnóstico`

5. **Clique ▶ Enviar Teste**
   - Veja: "messageId: wamid.ABC123XYZ"

6. **Volte ao Console (F12)**
   - Procure: `[WHATSAPP] ✅ Mensagem enviada com sucesso`
   - Procure: `[WEBHOOK] 📶 Status Update`

7. **Anote o status:**
   - `"sent"` → Em progresso, aguarde mais 10s
   - `"delivered"` → ✅ Chegou! (verificar WhatsApp)
   - `"failed"` → ❌ Falhou (procure código de erro)
   - Nada → Webhook status não inscrito

### Interpretação

**Se vê "delivered":**
```
[WEBHOOK] 📶 Status Update: [...,"status":"delivered"...]
```
- ✅ Mensagem chegou no servidor Meta
- ✅ Celular recebeu
- **Verificar:** Pode estar em spam/silenciado
- **Solução:** Reiniciar WhatsApp ou procurar em "Mensagens ignoradas"

**Se vé "sent":**
```
[WEBHOOK] 📶 Status Update: [...,"status":"sent"...]
```
- ⏳ Enviada, aguardando confirmação do celular
- Aguardar 10-30 segundos
- Deve mudar para "delivered"

**Se vé "failed":**
```
[WEBHOOK] 📶 Status Update: [...,"status":"failed","errors":[{"code":131026,...}]...]
```
- ❌ Falha na entrega
- **Código de erro** → procure na tabela acima
- Procure a solução específica

**Se NÃO vé nada:**
```
(silêncio total - nenhum [WEBHOOK] 📶)
```
- ❌ Webhook status não está inscrito
- Marque `message_status` no Meta Dashboard > Webhooks
- Re-teste

---

## 📝 Checklist de Debug

Faça em ordem:

- [ ] **Verificar webhook inscrito** → Meta Dashboard > message_status ☑
- [ ] **Enviar teste** → Admin 🔧 Debug > ▶ Enviar
- [ ] **Observar console (F12)** → Procurar `[WEBHOOK] 📶 Status Update`
- [ ] **Anotar status** → sent/delivered/failed/nada
- [ ] **Se failed** → Anotar código (131026, 131028, etc)
- [ ] **Se 131026** → Re-adicionar número na Meta
- [ ] **Se 131028** → Testar template
- [ ] **Se nada** → Webhook não inscrito, marcar message_status

---

## 💡 Diferença: Texto vs Template

### Texto Livre (sua resposta automática)

```
Janela 24h: ✅ Funciona
Fora da janela: ❌ Falha (código 131028)
```

### Template (hello_world)

```
Janela 24h: ✅ Funciona
Fora da janela: ✅ Funciona!
```

**Se template funciona mas texto não → problema é janela 24h (NORMAL)**

---

## 🎬 Exemplo Real

### Seu Número: 5585985963329

### Teste 1: Enviar Texto

```
Admin: 🔧 Debug
Tipo: Texto
Número: 5585985963329
Mensagem: Teste 1
Enviar ▶

Console (F12):
[WHATSAPP] ✅ Mensagem enviada com sucesso
[WHATSAPP] - Message ID: wamid.HBEUGoZFDdjO12345

[aguardar 5-10 segundos]

[WEBHOOK] 📶 Status Update: [{"id":"wamid.HBEUGoZFDdjO12345","status":"failed","errors":[{"code":131028,"title":"USER_UNSUBSCRIBED"}]}]

Diagnóstico:
- Código 131028 = Janela 24h fechada
- Solução: Você envia mensagem do WhatsApp para abrir janela
```

### Teste 2: Enviar Template (se texto falhou com 131028)

```
Admin: 🔧 Debug
Tipo: Template
Número: 5585985963329
Enviar ▶

Console (F12):
[WHATSAPP] ✅ Mensagem enviada com sucesso

[aguardar 5-10 segundos]

[WEBHOOK] 📶 Status Update: [{"id":"wamid.HBEUGoZFDdjO54321","status":"delivered"}]

Diagnóstico:
- Template funcionou!
- Significa: Problema é 100% janela 24h
- Solução: Normal. Você envia primeira, aí resposta automática funciona
```

---

## ❓ O Que Você Deve Me Contar

Se ainda não funcionar, envie-me:

```
1. Log exato do console (F12):
   [WEBHOOK] 📶 Status Update: [...]

2. Ou se não vê nada:
   "Não vejo nenhum [WEBHOOK] 📶 Status Update"

3. Seu número de teste:
   5585985963329
```

Com esses 3 dados, resolve rapidinho! 🚀

---

## 📚 Próximas Leituras

- Se não entendeu janela 24h: Pesquise "WhatsApp 24 hour message window"
- Se quer enviar fora da janela: Aprenda sobre templates
- Se quer log de tudo: Ativarem `message_status` webhook no Meta Dashboard
