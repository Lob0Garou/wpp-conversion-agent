# Arquitetura - WPP Conversion Agent

## Visão Geral

Sistema de atendimento automático para WhatsApp com análise de intenção, classificação de risco e encaminhamento inteligente.

```
┌─────────────────┐
│  Celular (API)  │
└────────┬────────┘
         │ Envia mensagem
         ▼
  ┌──────────────┐
  │ WhatsApp API │ (Meta Cloud API)
  └──────┬───────┘
         │ Webhook POST
         ▼
    ┌──────────────────┐
    │ /api/webhook     │
    └──────┬───────────┘
           │
    ┌──────▼──────────┐
    │ extractMessage() │ (validate signature)
    └──────┬──────────┘
           │
    ┌──────▼──────────┐
    │ upsert Customer │
    │ create Message  │ (inbound)
    └──────┬──────────┘
           │
    ┌──────▼────────────┐
    │ analyzeMessage()   │ (engine)
    │ (intent/risk)      │
    └──────┬─────────────┘
           │
    ┌──────▼──────────┐
    │ sendTextMessage │
    └──────┬──────────┘
           │
    ┌──────▼──────────┐
    │ save outbound    │
    │ + metadata       │
    └──────┬──────────┘
           │
         [END]
           │
           └──→ 200 OK (async)
```

## Stack

| Componente | Tecnologia |
|-----------|-----------|
| **Framework** | Next.js 16 (App Router, TypeScript) |
| **Database** | PostgreSQL + Prisma ORM |
| **API** | Fetch API (node-fetch via Next.js) |
| **Infrastructure** | Docker Compose, ngrok (testing) |

## Estrutura de Diretórios

```
src/
├── app/
│   ├── api/
│   │   ├── health/
│   │   │   └── route.ts       # GET: Status app + DB
│   │   ├── webhook/
│   │   │   └── route.ts       # GET/POST: Webhook Meta
│   │   └── test-send/
│   │       └── route.ts       # GET: Testar envio de mensagem
│   └── [pages]
└── lib/
    ├── prisma.ts              # Singleton Prisma
    ├── whatsapp.ts            # sendTextMessage() + validateCredentials()
    ├── engine.ts              # analyzeMessage() (NLP simples)
    └── webhook.ts             # extractMessage() + verifySignature()

prisma/
├── schema.prisma              # Multi-tenant schema
└── migrations/
```

## Database Schema (Multi-Tenant)

```sql
-- Lojas (multi-tenant)
stores
  id: UUID (PK)
  name: String
  phoneNumber: String (unique)
  phoneNumberId: String (unique) -- Meta phone_number_id
  config: JSON
  active: Boolean
  createdAt, updatedAt

-- Clientes da loja
customers
  id: UUID (PK)
  storeId: UUID (FK)
  phone: String
  name: String? (nullable)
  createdAt
  UNIQUE(storeId, phone) -- Um número por loja

-- Conversas
conversations
  id: UUID (PK)
  storeId: UUID (FK)
  customerId: UUID (FK)
  status: String (open | closed | escalated)
  startedAt, closedAt

-- Mensagens (both inbound e outbound)
messages
  id: UUID (PK)
  storeId: UUID (FK)
  conversationId: UUID (FK)
  direction: String (inbound | outbound)
  content: String
  waMessageId: String (unique per store) -- Meta message ID
  metadata: JSON (intent, risk, action, keywords)
  timestamp: DateTime
  UNIQUE(storeId, waMessageId) -- Idempotência

-- Tickets SAC
tickets
  id: UUID (PK)
  storeId: UUID (FK)
  customerId: UUID (FK)
  type: String (sac | troca | garantia | reclamacao)
  status: String (open | in_progress | closed)
  notes: String?
  createdAt, closedAt

-- Auditoria (cada decisão da engine)
auditLogs
  id: UUID (PK)
  storeId: UUID (FK)
  event: String (INTENT_CLASSIFIED, HANDOFF, SEND_ERROR, etc)
  intent: String? (sales | stock | sac | human)
  risk: String? (low | medium | high)
  action: String? (RESPOND, HANDOFF, etc)
  metadata: JSON (details)
  timestamp: DateTime
  INDEXES: storeId, event, timestamp
```

## Fluxo Inbound → Outbound

### 1. Receber Mensagem (POST /api/webhook)

**Input:**
```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "changes": [{
      "value": {
        "metadata": { "phone_number_id": "983563674841785" },
        "messages": [{
          "id": "wamid.ABC123",
          "from": "5585985963329",
          "timestamp": "1234567890",
          "text": { "body": "Qual tamanho tem?" }
        }]
      }
    }]
  }]
}
```

**Steps:**
1. Validar assinatura X-Hub-Signature-256 (opcional, se APP_SECRET configurado)
2. Extrair dados com `extractMessage(payload)` → `IncomingMessage`
3. Resolver Store via `phone_number_id`
4. Upsert Customer via `(storeId, phone)`
5. Encontrar Conversation aberta ou criar nova
6. Salvar inbound message (idempotência via waMessageId)

### 2. Analisar Mensagem (Engine)

**analyzeMessage(text: string) → AnalysisResult**

```
Input: "Qual tamanho tem?"

Step 1: Procurar keywords (case-insensitive)
  - "tamanho" ← match em KEYWORDS.stock

Step 2: Classificar
  - intent: "stock"
  - risk: "low"
  - action: "auto_reply"
  - replyText: "Verifico a disponibilidade pra você agora. Qual o modelo e o tamanho?"
  - matched: ["tamanho"]

Output: AnalysisResult
```

**Prioridade de Keywords:**
1. **highRisk** → intent: "human", risk: "high", action: "handoff"
2. **human** → intent: "human", risk: "low", action: "handoff"
3. **sac** → intent: "sac", risk: "medium", action: "handoff"
4. **stock** → intent: "stock", risk: "low", action: "auto_reply"
5. **sales** → intent: "sales", risk: "low", action: "auto_reply"
6. **fallback** → intent: "unknown", risk: "low", action: "auto_reply"

### 3. Enviar Resposta (sendTextMessage)

**sendTextMessage(to: string, text: string) → SendMessageResult**

```typescript
// Normalize number to E.164
to = "5585985963329"

// Graph API call
POST https://graph.facebook.com/v18.0/{phoneNumberId}/messages
Authorization: Bearer {WHATSAPP_API_TOKEN}
Content-Type: application/json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "5585985963329",
  "type": "text",
  "text": { "preview_url": false, "body": "..." }
}

Response: { "messages": [{ "id": "wamid.XYZ" }] }
```

### 4. Persistir Outbound + Metadata

```typescript
// Save outbound message
messages.create({
  storeId: store.id,
  conversationId: conversation.id,
  direction: "outbound",
  content: analysis.replyText,
  waMessageId: outWaMessageId,
  metadata: {
    engineIntent: "stock",
    engineRisk: "low",
    engineAction: "auto_reply",
    matched: ["tamanho"]
  }
})

// Log audit
auditLogs.create({
  storeId: store.id,
  event: "MESSAGE_SENT",
  intent: "stock",
  risk: "low",
  action: "auto_reply",
  metadata: { conversationId, to, keywords: ["tamanho"] }
})
```

## Fluxo Outbound (Teste)

**GET /api/test-send?to=5585985963329&text=Olá**

```
1. Validar credenciais (WHATSAPP_API_TOKEN, WHATSAPP_PHONE_NUMBER_ID)
2. Normalizar número: "5585985963329" (E.164, sem espaços)
3. Chamar sendTextMessage()
4. Retornar JSON: { status, to, text, messageId, httpStatus }
```

## Idempotência

**Problema:** Meta envia a mesma mensagem múltiplas vezes (retry).

**Solução:**
- Chave única: `UNIQUE(storeId, waMessageId)` na tabela messages
- Se `waMessageId` já existe, ignorar e retornar 200 OK

```typescript
const existing = await prisma.message.findUnique({
  where: { storeId_waMessageId: { storeId, waMessageId } }
});

if (existing) {
  return { status: "duplicate" }; // 200 OK, silent ignore
}
```

## Isolamento Multi-Tenant

**Princípio:** Nenhuma query sem `storeId`

```typescript
// ✅ CORRETO
await prisma.message.findMany({
  where: { storeId: "...", conversationId: "..." }
});

// ❌ ERRADO (vaza dados entre stores)
await prisma.message.findMany({
  where: { conversationId: "..." }
});
```

## Validação de Webhook

### GET (Meta verifica que a URL é nossa)

```
Meta: GET /api/webhook?hub.mode=subscribe&hub.verify_token=XXX&hub.challenge=YYY

App checks:
  1. hub.mode === "subscribe"
  2. hub.verify_token === WHATSAPP_VERIFY_TOKEN

Response: 200 + hub.challenge (plain text)

Meta: Verifica que recebeu o challenge
```

### POST (Meta envia mensagens)

```
Meta: POST /api/webhook + X-Hub-Signature-256 header

App:
  1. Read raw body (para validar assinatura)
  2. Validate HMAC-SHA256 signature (se APP_SECRET configurado)
  3. Parse JSON
  4. Process message
  5. Response: 200 OK (rápido, async de verdade)
```

## Logs Estruturados

### Categorias
```
[WHATSAPP]  - Envios de mensagem via Graph API
[WEBHOOK]   - Recebimento e validação
[ENGINE]    - Análise de intenção e risco
[PRISMA]    - Operações de database (se debug ativado)
```

### Exemplo de Log Completo

```
[WEBHOOK] 📩 Payload recebido
[WEBHOOK] ✅ Mensagem salva | store=Loja A | from=5585985963329 | text="Qual tamanho?"

[ENGINE] 🧠 Análise completa:
[ENGINE]   - Intent: stock
[ENGINE]   - Risk: low
[ENGINE]   - Action: auto_reply
[ENGINE]   - Reply: "Verifico..."
[ENGINE]   - Matched keywords: tamanho

[WHATSAPP] 📤 Enviando mensagem...
[WHATSAPP]   - Para: 5585985963329
[WHATSAPP]   - Texto: "Verifico..."
[WHATSAPP] HTTP 200 OK
[WHATSAPP] ✅ Mensagem enviada com sucesso

[WEBHOOK] ✅ Ciclo completo:
[WEBHOOK]   - RECEBIDO: "Qual tamanho?"
[WEBHOOK]   - RESPONDIDO: "Verifico..."
[WEBHOOK]   - SALVO: intent=stock | risk=low
```

## Env Vars

| Var | Type | Required | Example |
|-----|------|----------|---------|
| `DATABASE_URL` | PostgreSQL | ✅ | `postgresql://user:pass@localhost:5432/db` |
| `WHATSAPP_API_TOKEN` | string | ✅ | `EAATZBaURG4hMB...` |
| `WHATSAPP_PHONE_NUMBER_ID` | string | ✅ | `983563674841785` |
| `WHATSAPP_VERIFY_TOKEN` | string | ✅ | `my_webhook_token` |
| `WHATSAPP_APP_SECRET` | string | ❌ | `abc123def456` |
| `WHATSAPP_API_VERSION` | string | ❌ | `v18.0` (default) |
| `NODE_ENV` | string | ❌ | `development` |

## Error Handling

### HTTP Status Codes

| Code | Scenario | Action |
|------|----------|--------|
| 200 | Webhook OK (processed or ignored) | Continue |
| 400 | Invalid JSON payload | Log, return 200 (ignore) |
| 401 | Signature invalid | Log warning, return 401 |
| 403 | Token mismatch (verify) | Log, return 403 |
| 500 | Database/Fetch error | Log error, return 200 (idempotence) |

## Performance Considerations

1. **Webhook POST rápido** — Salvar message + send é async no background
   - Retorna 200 OK imediatamente
   - Processing continua (não espera resposta)

2. **Índices no Prisma**
   - `storeId` em todas as tabelas
   - `storeId_status` em conversations
   - `storeId_waMessageId` em messages (unique + fast lookup)

3. **Caching**
   - Store resolvido via `phone_number_id` (imutável por sessão)
   - Conversation reutilizada (open status) — apenas um by customer

## Próximos Passos (Roadmap)

- [ ] Persistência de intenção → Buscar histórico (context aware)
- [ ] Integração com CRM (sync customers, leads)
- [ ] Templates dinâmicos (replaceUser com variables)
- [ ] Message status tracking (delivered, read)
- [ ] Admin dashboard (conversations, analytics)
- [ ] Integração com humanos (agent handoff + notifications)
