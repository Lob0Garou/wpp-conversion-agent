# Exemplos de Curl para Testes

Comandos prontos para testar os endpoints da aplicação.

## Health Check

```bash
curl http://localhost:3000/api/health
```

Resposta:
```json
{
  "status": "ok",
  "database": "connected"
}
```

## Webhook - Verificação (GET)

```bash
curl "http://localhost:3000/api/webhook?hub.mode=subscribe&hub.verify_token=seu_token&hub.challenge=abc123"
```

Resposta esperada: `abc123` (o valor do hub.challenge retornado em texto plano)

## Webhook - Receber Mensagem (POST)

```bash
curl -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "changes": [{
        "value": {
          "messaging_product": "whatsapp",
          "metadata": {
            "phone_number_id": "983563674841785"
          },
          "messages": [{
            "id": "wamid.test123",
            "from": "5585985963329",
            "timestamp": "1234567890",
            "text": {
              "body": "Olá, qual o tamanho disponível?"
            }
          }]
        }
      }]
    }]
  }'
```

Resposta: `{"status":"received","status":200}`

## Testar Envio de Mensagem (GET /api/test-send)

### Mensagem simples

```bash
curl "http://localhost:3000/api/test-send?to=5585985963329&text=Olá%20teste"
```

### Mensagem com espaços e caracteres especiais

```bash
curl "http://localhost:3000/api/test-send?to=5585985963329&text=Qual%20o%20preco%20da%20camiseta%3F"
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

## Script Shell para Testes Rápidos

Salvar como `test.sh`:

```bash
#!/bin/bash

# Cores para output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

API="http://localhost:3000"
TO="5585985963329"
VERIFY_TOKEN="seu_token_aqui"

echo "🧪 Iniciando testes..."
echo ""

# 1. Health Check
echo "1️⃣  Health Check"
curl -s "$API/api/health" | jq . && echo "✅ OK" || echo "❌ Falhou"
echo ""

# 2. Verificação Webhook
echo "2️⃣  Verificação Webhook (GET)"
CHALLENGE=$(curl -s "$API/api/webhook?hub.mode=subscribe&hub.verify_token=$VERIFY_TOKEN&hub.challenge=test_123" | head -1)
if [ "$CHALLENGE" = "test_123" ]; then
  echo "✅ Webhook validado"
else
  echo "❌ Webhook falhou"
fi
echo ""

# 3. Teste de Envio
echo "3️⃣  Teste de Envio (GET /api/test-send)"
curl -s "$API/api/test-send?to=$TO&text=Teste%20de%20envio" | jq .
echo ""

echo "✅ Testes concluídos!"
```

Executar:
```bash
chmod +x test.sh
./test.sh
```

## Teste com Payload Real do Meta (POST)

Copiar payload real recebido do Meta e testar localmente:

```bash
curl -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=..." \
  -d @payload.json
```

Onde `payload.json` contém o payload real do Meta.

## PowerShell (Windows)

```powershell
# Health Check
Invoke-WebRequest -Uri "http://localhost:3000/api/health" -Method Get | ConvertTo-Json

# Teste de Envio
$to = "5585985963329"
$text = "Teste"
Invoke-WebRequest -Uri "http://localhost:3000/api/test-send?to=$to&text=$text" -Method Get
```

## URLs Rápidas (Copiar e Colar)

```
Health:
http://localhost:3000/api/health

Webhook Verify:
http://localhost:3000/api/webhook?hub.mode=subscribe&hub.verify_token=TEST_TOKEN&hub.challenge=abc123

Send Test (substituir número):
http://localhost:3000/api/test-send?to=5585985963329&text=Olá%20teste
```

## Variáveis de Teste

Ajuste conforme sua configuração:

```bash
API="http://localhost:3000"
TO="5585985963329"           # seu número em E.164
VERIFY_TOKEN="TEST_TOKEN"    # WHATSAPP_VERIFY_TOKEN do .env
PHONE_NUMBER_ID="983563674841785"  # WHATSAPP_PHONE_NUMBER_ID
```
