# Quick Start - 5 Minutos

## Pré-requisitos
- Node.js + npm
- PostgreSQL rodando
- ngrok instalado
- Celular com WhatsApp
- Conta Meta com App criado

## 1. Setup (30 seg)

```bash
npm install
npx prisma migrate deploy
cp .env.example .env

# Editar .env:
# WHATSAPP_API_TOKEN=seu_token_aqui
# WHATSAPP_PHONE_NUMBER_ID=seu_id_aqui
# WHATSAPP_VERIFY_TOKEN=qualquer_string
```

## 2. Rodar App (10 seg)

```bash
npm run dev
```

Deve ver:
```
- Local: http://localhost:3000
```

## 3. ngrok (10 seg)

Em **novo terminal**:
```bash
ngrok http 3000
```

Copie a URL: `https://xxx.ngrok-free.app`

## 4. Registrar na Meta (1 min)

1. https://developers.facebook.com/apps/{app-id}/whatsapp-business/webhooks
2. Clique "Edit Webhook Configuration"
3. Cole:
   - **Webhook URL**: `https://xxx.ngrok-free.app/api/webhook`
   - **Verify Token**: cole o `WHATSAPP_VERIFY_TOKEN` do seu `.env`
4. Clique "Verify and Save"

Você deve ver no console:
```
[WEBHOOK] ✅ Verificação bem-sucedida
```

## 5. Teste Outbound (20 seg)

```bash
curl "http://localhost:3000/api/test-send?to=5585985963329&text=Olá%20teste"
```

Resposta:
```json
{
  "status": "success",
  "messageId": "wamid.HBEUGoZFDdjO...",
  ...
}
```

## 6. Teste Inbound (3 min)

1. Abra WhatsApp no celular
2. Envie mensagem para o número de teste
3. **Observe console** - você deve ver:

```
[WEBHOOK] 📩 Payload recebido
[WEBHOOK] ✅ Mensagem salva | store=... | from=... | text="..."
[ENGINE] 🧠 Análise completa:
[ENGINE]   - Intent: unknown
[ENGINE]   - Risk: low
[ENGINE]   - Action: auto_reply
[WHATSAPP] 📤 Enviando mensagem...
[WHATSAPP] HTTP 200 OK
[WEBHOOK] ✅ Ciclo completo:
[WEBHOOK]   - RECEBIDO: "..."
[WEBHOOK]   - RESPONDIDO: "Sou o assistente..."
[WEBHOOK]   - SALVO: intent=unknown | risk=low
```

4. **No celular** - auto-reply deve chegar em segundos

## ✅ Pronto!

Você agora tem:
- ✅ Recebimento de mensagens (webhook)
- ✅ Auto-reply automático (engine)
- ✅ Logs estruturados (console)
- ✅ Banco de dados (PostgreSQL)

## Próximos Passos

Ver documentação completa:
- `WEBHOOK_SETUP.md` — Guia detalhado com troubleshooting
- `ARCHITECTURE.md` — Arquitetura técnica
- `CURL_EXAMPLES.md` — Mais exemplos de teste
- `MANIFEST.md` — Resumo executivo

## Curl Command Único

```bash
# Teste outbound em uma linha
curl "http://localhost:3000/api/test-send?to=5585985963329&text=Testando%20integration"
```

---

**Status:** ✅ WhatsApp Cloud API ponta a ponta funcionando!
