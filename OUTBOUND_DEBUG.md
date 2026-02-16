# Debug: Mensagem Não Chega no WhatsApp (Status 200 mas sem entrega)

## Sintoma
- ✅ Webhook recebe mensagens inbound corretamente
- ✅ API retorna `HTTP 200 + wamid` (message ID)
- ✅ Mensagem aparece no dashboard local
- ❌ Mensagem **NÃO chega no celular do usuário**

## Root Cause (Hipóteses)

Este é um problema **de entrega assíncrona**, não de envio. A Meta aceita a mensagem (200 OK), mas depois a **entrega falha** de forma assíncrona.

### Teste 1: Verificar Logs de Status Webhook

Quando a entrega falha, a Meta envia um webhook de **status update** (não é mensagem, é notificação de falha).

**Seu código já está prepared para isso** (webhook.ts, linha 80-89):

```typescript
if (value?.statuses) {
    const statuses = value.statuses;
    console.log(`[WEBHOOK] 📶 Status Update: ${JSON.stringify(statuses)}`);
    if (statuses[0]?.status === 'failed') {
        console.log(`[WEBHOOK] ❌ Mensagem falhou! Erro: ${JSON.stringify(statuses[0].errors)}`);
    }
}
```

**Ação:**
1. Enviar mensagem de teste
2. **Observe o console** por logs como:
   ```
   [WEBHOOK] 📶 Status Update: [{"id":"wamid.ABC123","status":"failed",...}]
   [WEBHOOK] ❌ Mensagem falhou! Erro: {"code":131026,"title":"RESOURCE_NOT_AVAILABLE",...}
   ```

---

### Teste 2: Verificar Erros Específicos Meta

Os erros mais comuns de entrega:

| Código | Título | Causa | Solução |
|--------|--------|-------|---------|
| **131026** | `RESOURCE_NOT_AVAILABLE` | Número desativado / bloqueado | Re-verificar número no Meta |
| **131028** | `USER_UNSUBSCRIBED` | Usuário saiu da conversa | Usar templates |
| **131051** | `RATE_LIMIT_EXCEEDED` | Muitas mensagens rápido | Adicionar delay |
| **131003** | `UNDELIVERABLE` | Número não existe | Verificar formato E.164 |
| **131030** | `PHONE_NUMBER_FORMAT_ERROR` | Formato do número errado | Verificar Brasil 8/9 dígitos |

**Se o erro for 131026 ou 131028:** O número precisa ser re-adicionado na **Meta Dashboard > App > WhatsApp > Configuration > "To" Numbers**.

---

### Teste 3: Verificar Test Number Status na Meta

1. Vá para: **https://developers.facebook.com/apps/{APP_ID}/whatsapp-business/configuration**
2. Seção **"Recipient Test Numbers"** ou **"To Numbers"**
3. Seu número está lá? ✅
4. Status é "Active" ou "Verified"? ✅

Se o número não está ou está "inactive", isso explica tudo.

---

### Teste 4: Enviar Template vs Texto Livre

A Meta tem restrição: **Fora da janela 24h, só templates funcionam.**

Se você enviou uma mensagem do seu celular há + de 24h:
- ✅ Você pode responder com texto livre (está na janela)
- ❌ Mas se não responde rápido, a janela fecha
- ❌ Depois só funciona template (hello_world)

**Teste:**

```bash
# Atual (texto livre - pode falhar fora da janela 24h)
curl "http://localhost:3000/api/test-send?to=5585985963329&text=Olá%20teste"

# Teste com Template (sempre funciona)
curl -X POST http://localhost:3000/api/test-template
```

Para template, você precisaria de um endpoint como:

```typescript
// src/app/api/test-template/route.ts
export async function GET(request: NextRequest) {
    const token = process.env.WHATSAPP_API_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const to = "5585985963329";

    const body = {
        messaging_product: "whatsapp",
        to: to,
        type: "template",
        template: {
            name: "hello_world",
            language: { code: "en_US" }
        }
    };

    const response = await fetch(
        `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        }
    );

    const data = await response.json();
    return NextResponse.json({ status: response.ok ? "success" : "error", data });
}
```

---

### Teste 5: Número do Brasil - 8 vs 9 Dígitos

Meta aceita **ambos**, mas seu número pode estar registrado com 8 e você está enviando com 9 (ou vice-versa).

**Seu código já faz retry** (whatsapp.ts, linha 94-111), mas verifique logs:

```
[WHATSAPP] ⚠️ Falha ao enviar para 5585985963329. Tentando 5585985963329 (sem 9º dígito)...
[WHATSAPP] HTTP 200 OK
[WHATSAPP] ✅ Mensagem enviada com sucesso
```

Se vê isso, significa que a **tentativa com 9 dígitos falhou**, mas funcionou com 8.

---

## Fluxo de Debug Recomendado

### Passo 1: Habilitar Logging de Status

Seu webhook.ts já loga status, mas adicione um arquivo:

```bash
# No seu console ou arquivo de log, procure por:
[WEBHOOK] 📶 Status Update
```

### Passo 2: Enviar Teste e Observar Console

```bash
# Terminal 1: Rodar app
npm run dev

# Terminal 2: Observar logs
tail -f <seu-log-file>  # ou apenas observe o console do terminal 1

# Terminal 3: Enviar teste
curl "http://localhost:3000/api/test-send?to=5585985963329&text=teste"
```

Você deve ver:
```
[WHATSAPP] 📤 Enviando mensagem...
[WHATSAPP] HTTP 200 OK
[WHATSAPP] ✅ Mensagem enviada com sucesso
[WHATSAPP] - Message ID: wamid.ABC123XYZ
```

**Aguarde 5-10 segundos.** Você deve ver:
```
[WEBHOOK] 📥 POST recebido
[WEBHOOK] 📶 Status Update: [{"id":"wamid.ABC123XYZ","status":"sent|delivered|failed",...}]
```

### Passo 3: Interpretar Status

- `status: "sent"` → Enviada, aguardando celular ✅
- `status: "delivered"` → Celular recebeu ✅
- `status: "read"` → Celular leu ✅
- `status: "failed"` → Entrega falhou ❌ (veja `errors[0].code`)

Se vê `failed`:
```
[WEBHOOK] ❌ Mensagem falhou! Erro: {"code":131026,"title":"RESOURCE_NOT_AVAILABLE"}
```

Procure o código 131026 na tabela acima.

---

## Passo 4: Ação Corretiva

### Se erro 131026 (RESOURCE_NOT_AVAILABLE)

O número está desativado na Meta.

**Solução:**
1. https://developers.facebook.com/apps/{APP_ID}/whatsapp-business/configuration
2. **Remove o número** da lista "Recipient Test Numbers"
3. **Re-adiciona** o número
4. Meta pedirá um **SMS com código** → Digite na interface
5. Status fica "Active" novamente
6. Tente enviar de novo

### Se erro 131028 (USER_UNSUBSCRIBED)

O usuário saiu da conversa (ou a janela 24h fechou).

**Solução:**
- Use **templates** (não texto livre)
- Ou peça ao usuário para enviar uma mensagem primeiro (abre a janela)

### Se erro 131003 (UNDELIVERABLE)

Número inválido ou não existe.

**Solução:**
- Verificar formato: `55` + `85` (DDD) + `9` + `8596-3329` = `5585985963329`
- Sem espaços, sem `-`, sem `+`

### Se nenhum status webhook aparecer

Pode ser que o webhook de **status** não está inscrito.

**Solução:**
1. Meta Dashboard > App > Webhooks
2. **"Subscribe to webhook events"** ✅ `message_status`
3. Testar de novo

---

## Curl Commands para Debug

### Enviar com Logging Detalhado

```bash
# Enviar mensagem e guardar resposta
curl -v "http://localhost:3000/api/test-send?to=5585985963329&text=debug" \
  -o /tmp/response.json 2>&1 | tee /tmp/curl.log

# Ver arquivo
cat /tmp/response.json
```

### Testar Health Check

```bash
curl http://localhost:3000/api/health
```

Deve retornar:
```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "..."
}
```

---

## Checklist Final

- [ ] Número está em Meta Dashboard > Recipient Test Numbers com status **Active**
- [ ] Webhook verification GET está passando (`[WEBHOOK] ✅ Verificação bem-sucedida`)
- [ ] `sendTextMessage` retorna `HTTP 200 OK + wamid`
- [ ] Log de status webhook mostra `delivered` ou `sent` (não `failed`)
- [ ] Se `failed`, anotou o código de erro (e.g., 131026)
- [ ] Se fora da janela 24h, testou com template
- [ ] Número está em formato E.164 correto

---

## Próximos Passos

Se mesmo após esses testes a mensagem não chega:

1. **Conte-me o código de erro** que vê no log de status webhook
2. **Verifique a Meta Dashboard** se o número está ativo
3. **Teste um template** (`hello_world`) para descartar problema de janela 24h
4. **Considere contatar suporte Meta** com o message ID (wamid) e timestamp

---

## Logs Esperados (Sucesso)

```
[WHATSAPP] 📤 Enviando mensagem...
[WHATSAPP]   - Para: 5585985963329
[WHATSAPP]   - Texto: "Olá teste"
[WHATSAPP] HTTP 200 OK
[WHATSAPP] ✅ Mensagem enviada com sucesso
[WHATSAPP]   - Message ID: wamid.HBEUGoZFDdjO1234567890

[... (aguardar 5-10 segundos) ...]

[WEBHOOK] 📥 POST recebido
[WEBHOOK] 📦 Payload JSON: {"object":"whatsapp_business_account","entry":[{"changes":[{"value":{"messaging_product":"whatsapp","contacts":[{"wa_id":"5585985963329","profile":{"name":"..."}}],"statuses":[{"id":"wamid.HBEUGoZFDdjO1234567890","recipient_id":"5585985963329","status":"sent","timestamp":"1708034123"}]}}]}]}
[WEBHOOK] 📶 Status Update: [{"id":"wamid.HBEUGoZFDdjO1234567890","recipient_id":"5585985963329","status":"sent","timestamp":"1708034123"}]

[... (1-2 segundos depois) ...]

[WEBHOOK] 📥 POST recebido
[WEBHOOK] 📶 Status Update: [{"id":"wamid.HBEUGoZFDdjO1234567890","recipient_id":"5585985963329","status":"delivered","timestamp":"1708034124"}]

[... no seu celular, a mensagem aparece ...]

[WEBHOOK] 📥 POST recebido
[WEBHOOK] 📶 Status Update: [{"id":"wamid.HBEUGoZFDdjO1234567890","recipient_id":"5585985963329","status":"read","timestamp":"1708034145"}]
```

Se vê até "delivered" ou "read", **tudo está funcionando!** A mensagem chegou.

Se vê "failed", **siga o debugging acima** com o código de erro.
