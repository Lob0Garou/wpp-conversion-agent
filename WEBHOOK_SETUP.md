# Configuração WhatsApp Cloud API + Webhook

Guia completo para configurar a integração com WhatsApp Cloud API (Meta) e validar em produção local.

## Pré-requisitos

- Node.js 18+
- npm
- PostgreSQL rodando (ou Docker Compose)
- ngrok (https://ngrok.com)
- Conta Meta com App criado
- Número de teste WhatsApp
- Telefone celular para receber mensagens

## 1. Preparação da Aplicação

### 1.1 Clonar e configurar

```bash
git clone <repo>
cd wpp-conversion-agent
npm install
```

### 1.2 Configurar banco de dados

**Com Docker:**
```bash
docker-compose up -d
npx prisma migrate deploy
```

**Sem Docker (PostgreSQL local):**
```bash
npx prisma migrate deploy
# ou criar nova migration:
npx prisma migrate dev --name init
```

### 1.3 Configurar variáveis de ambiente

Copiar `.env.example` para `.env`:
```bash
cp .env.example .env
```

Editar `.env` com suas credenciais:
```env
# Webhook verification token (escolha qualquer string)
WHATSAPP_VERIFY_TOKEN="seu_webhook_verify_token_seguro"

# Token da API Graph (obrigatório)
WHATSAPP_API_TOKEN="EAATZBaURG4hMB..."

# ID do número de telefone WhatsApp (obrigatório)
# Formato: sem sinais especiais, apenas números
WHATSAPP_PHONE_NUMBER_ID="983563674841785"

# App Secret (opcional, para validar assinatura do webhook)
WHATSAPP_APP_SECRET=""
```

**Onde encontrar as credenciais:**
- `WHATSAPP_API_TOKEN`: https://developers.facebook.com/apps/{app-id}/settings/basic
- `WHATSAPP_PHONE_NUMBER_ID`: https://developers.facebook.com/docs/whatsapp/cloud-api/get-started
- `WHATSAPP_VERIFY_TOKEN`: Você define (será usado no webhook setup)

## 2. Rodar a Aplicação Localmente

```bash
npm run dev
```

Você deve ver:
```
> next dev

  ▲ Next.js 16.1.6
  - Local:        http://localhost:3000
```

## 3. Expor com ngrok

Em um **novo terminal**, execute:

```bash
ngrok http 3000
```

Você verá algo como:
```
Forwarding                    https://1234-56-789-10-11.ngrok-free.app -> http://localhost:3000

Session Status                online
Session Expires               2 hours, 59 minutes
Version                       3.8.0
Region                        South America (sa)
Forwarding URL                https://1234-56-789-10-11.ngrok-free.app
```

**Copie a URL do ngrok** (ex: `https://1234-56-789-10-11.ngrok-free.app`)

## 4. Registrar Webhook na Meta

### 4.1 No Dashboard Meta

1. Vá para: https://developers.facebook.com/apps/{app-id}/whatsapp-business/webhooks
2. Clique em **"Edit Webhook Configuration"** (ou crie um novo)
3. Preencha:
   - **Webhook URL**: `https://1234-56-789-10-11.ngrok-free.app/api/webhook` (trocar URL do ngrok)
   - **Verify Token**: Cole exatamente o `WHATSAPP_VERIFY_TOKEN` do seu `.env`

4. Clique em **"Verify and Save"**

Meta fará uma requisição GET para validar. Você deve ver no console:
```
[WEBHOOK] ✅ Verificação bem-sucedida
```

### 4.2 Inscrever-se nos Eventos

Ainda no dashboard Meta, em "Subscribe to webhook events":
- ☑ messages
- ☑ message_status (opcional, para rastrear entrega)

## 5. Testar Envio Outbound (GET /api/test-send)

### 5.1 Via curl

```bash
curl "http://localhost:3000/api/test-send?to=5585985963329&text=Olá%20teste"
```

Resposta esperada:
```json
{
  "status": "success",
  "to": "5585985963329",
  "text": "Olá teste",
  "httpStatus": 200,
  "messageId": "wamid.HBEUGoZFDdjO...",
  "message": "Mensagem enviada com sucesso"
}
```

Console deve mostrar:
```
[WHATSAPP] 📤 Enviando mensagem...
[WHATSAPP]   - Para: 5585985963329
[WHATSAPP]   - Texto: "Olá teste"
[WHATSAPP]   - URL: https://graph.facebook.com/v18.0/983563674841785/messages
[WHATSAPP] HTTP 200 OK
[WHATSAPP] ✅ Mensagem enviada com sucesso
```

## 6. Teste Completo: Envio + Recebimento + Auto-Reply

### 6.1 Setup

- ✅ Next.js rodando em http://localhost:3000
- ✅ ngrok expondo porta 3000
- ✅ Webhook registrado na Meta (com URL e token corretos)
- ✅ Banco de dados PostgreSQL configurado
- ✅ Variáveis de ambiente preenchidas

### 6.2 Enviar Mensagem do Celular

Abra WhatsApp, comece conversa com o número de teste e envie qualquer mensagem.

### 6.3 Observar Logs

No console da app (npm run dev), você deve ver:

**Recebimento:**
```
[WEBHOOK] 📩 Payload recebido (reduzido):
[WEBHOOK] JSON: {"object":"whatsapp_business_account"...
[WEBHOOK] ✅ Mensagem salva | store=<loja> | from=558598596... | text="Olá"
```

**Análise:**
```
[ENGINE] 🧠 Análise completa:
[ENGINE]   - Intent: unknown
[ENGINE]   - Risk: low
[ENGINE]   - Action: auto_reply
[ENGINE]   - Reply: "Sou o assistente da loja. Você quer ver produto..."
```

**Resposta:**
```
[WHATSAPP] 📤 Enviando mensagem...
[WHATSAPP]   - Para: 5585985963329
[WHATSAPP] HTTP 200 OK
[WHATSAPP] ✅ Mensagem enviada com sucesso
[WEBHOOK] ✅ Ciclo completo:
[WEBHOOK]   - RECEBIDO: "Olá"
[WEBHOOK]   - RESPONDIDO: "Sou o assistente da loja..."
[WEBHOOK]   - SALVO: intent=unknown | risk=low
[WEBHOOK]   - Message ID: wamid.HBEUGoZFDdjO...
```

## 7. Curl Commands Rápidos

### Testar Envio
```bash
# Variáveis
TO="5585985963329"
TEXT="Olá%20teste"

curl "http://localhost:3000/api/test-send?to=${TO}&text=${TEXT}"
```

### Health Check
```bash
curl http://localhost:3000/api/health
```

### Verificar Webhook (GET)
```bash
curl "http://localhost:3000/api/webhook?hub.mode=subscribe&hub.verify_token=seu_token&hub.challenge=abc123"
```

## 8. Troubleshooting

### Webhook não valida (Verify and Save falha)

**Problema:** "Verify token doesn't match"
- Checar se `WHATSAPP_VERIFY_TOKEN` no `.env` é exatamente igual ao token registrado na Meta
- Checar se a URL do ngrok está correta: `https://xxx/api/webhook`
- ngrok pode ter expirado, gere uma nova URL

**Problema:** "Invalid request signature"
- Se `WHATSAPP_APP_SECRET` estiver vazio, a validação é saltada (OK para teste)
- Se preenchido, deve ser exatamente igual ao app secret da Meta

### Mensagem não chega ao celular

1. Verificar token `WHATSAPP_API_TOKEN`:
   ```bash
   # Deve retornar 200 + messageId
   curl "http://localhost:3000/api/test-send?to=5585985963329&text=teste"
   ```

2. Verificar logs:
   - Se `HTTP 401`, token inválido
   - Se `HTTP 400`, número de telefone inválido (deve ser E.164: país + número)
   - Se `HTTP 200` mas não chega, o número pode estar bloqueado ou não estar na lista de teste

3. Número deve estar em formato E.164:
   - ✅ Correto: `5585985963329` (país 55 + área 85 + número)
   - ❌ Errado: `+55 85 9 8596-3329` (com símbolos)

### Mensagem recebida mas não responde

1. Store não encontrada:
   ```
   [WEBHOOK] ❌ Store não encontrada para phone_number_id: 983563674841785
   ```
   - Criar uma Store manualmente no banco:
   ```sql
   INSERT INTO stores (id, name, phone_number, phone_number_id, active)
   VALUES (uuid_generate_v4(), 'Loja Teste', '5585985963329', '983563674841785', true);
   ```

2. Mensagem duplicada:
   ```
   [WEBHOOK] ⏭️ Mensagem duplicada ignorada
   ```
   - Normal (idempotência). Meta pode enviar a mesma mensagem 2x.

3. Erro ao salvar no banco:
   - Verificar se PostgreSQL está rodando
   - Verificar `DATABASE_URL` em `.env`

## 9. Referências

- [WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api/get-started)
- [Webhook Setup](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/setup-webhooks)
- [Send Message API](https://developers.facebook.com/docs/whatsapp/cloud-api/reference/message-sends)
- [ngrok Documentation](https://ngrok.com/docs)

---

**Status checklist:**
- [ ] Variáveis de ambiente preenchidas
- [ ] PostgreSQL rodando
- [ ] `npm run dev` rodando na porta 3000
- [ ] ngrok expondo a URL
- [ ] Webhook registrado e validado na Meta
- [ ] Teste outbound funcionando (curl /api/test-send)
- [ ] Mensagem recebida do celular mostra logs
- [ ] Auto-reply chega no celular
