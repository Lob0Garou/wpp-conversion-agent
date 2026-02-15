# WPP Conversion Agent

Sistema de Conversão via WhatsApp para Lojas Físicas.

> "O sistema não tenta adivinhar. Ele resolve."

## Stack

- **Next.js 14** (TypeScript, App Router)
- **Prisma** (ORM / PostgreSQL)
- **Docker Compose** (Postgres + App)

## Quick Start

### 1. Clonar e configurar

```bash
git clone <repo-url>
cd wpp-conversion-agent
cp .env.example .env
# editar .env com seus tokens
```

### 2. Rodar com Docker

```bash
docker-compose up -d
```

Isso sobe:

- **Postgres 16** na porta 5432
- **App Next.js** na porta 3000

### 3. Rodar sem Docker (local)

```bash
npm install
npx prisma migrate dev
npm run dev
```

### 4. Criar migration inicial

```bash
npx prisma migrate dev --name init
```

## Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/health` | Health check + status do banco |
| GET | `/api/webhook` | Verificação do webhook (Meta) |
| POST | `/api/webhook` | Receber mensagens (stub) |

## Configuração WhatsApp Cloud API

Para integração completa com WhatsApp, incluindo recebimento de mensagens e auto-reply:

1. **Documentação detalhada:** Veja [`WEBHOOK_SETUP.md`](./WEBHOOK_SETUP.md)
   - Passo a passo para registrar webhook na Meta
   - Como rodar ngrok
   - Troubleshooting de erros comuns

2. **Variáveis obrigatórias** (ver `.env.example`):
   ```env
   WHATSAPP_API_TOKEN="seu_token_graph_api"
   WHATSAPP_PHONE_NUMBER_ID="seu_phone_number_id"
   WHATSAPP_VERIFY_TOKEN="seu_webhook_verify_token"
   ```

3. **Teste outbound rápido:**
   ```bash
   # Testar envio via GET /api/test-send
   curl "http://localhost:3000/api/test-send?to=5585985963329&text=Olá%20teste"
   ```

## Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/health` | Health check + status do banco |
| GET | `/api/webhook` | Verificação do webhook (Meta) |
| POST | `/api/webhook` | Receber mensagens inbound |
| GET | `/api/test-send` | Testar envio de mensagens |

## Teste Completo

```bash
# 1. Rodar app
npm run dev

# 2. Em outro terminal, expor com ngrok
ngrok http 3000

# 3. Registrar webhook na Meta com a URL do ngrok

# 4. Testar envio outbound
curl "http://localhost:3000/api/test-send?to=5585985963329&text=teste"

# 5. Enviar mensagem do celular - auto-reply deve chegar automaticamente
```

## Troubleshooting

### Webhook não valida na Meta
- Verificar se `WHATSAPP_VERIFY_TOKEN` em `.env` é idêntico ao registrado no dashboard Meta
- Verificar se a URL do ngrok está correta (ex: `https://xxx.ngrok-free.app/api/webhook`)
- Testar localmente: `curl "http://localhost:3000/api/webhook?hub.mode=subscribe&hub.verify_token=TEST_TOKEN&hub.challenge=abc123"`

### Mensagem não chega ao celular (GET /api/test-send retorna erro 400/401)
- **401**: Token `WHATSAPP_API_TOKEN` inválido. Gerar novo no dashboard Meta.
- **400**: Número de telefone inválido. Usar formato E.164: `5585985963329` (sem símbolos)
- Verificar se o número está na lista de contatos de teste do Meta

### Mensagem recebida mas não responde
- Verificar logs: `[WEBHOOK] ❌ Store não encontrada`. Criar Store no banco com `phoneNumberId` correto.
- Verificar se PostgreSQL está rodando: `curl http://localhost:3000/api/health`

### Logs não aparecem
- Executar com `npm run dev` (não `npm start`)
- Verificar porta: app deve estar em `http://localhost:3000`

Mais detalhes em [`WEBHOOK_SETUP.md`](./WEBHOOK_SETUP.md).

## Princípios

1. **Isolamento Absoluto** — Nenhuma query sem filtro de `store_id`
2. **Stateless Engine** — Código decide fluxo; IA só escreve mensagem final
3. **Logging de Auditoria** — Cada decisão da Engine é logada

## Estrutura

```
wpp-conversion-agent/
├── prisma/
│   └── schema.prisma        # Schema do banco (multitenancy)
├── src/
│   ├── app/
│   │   └── api/
│   │       ├── health/
│   │       │   └── route.ts  # Health check
│   │       └── webhook/
│   │           └── route.ts  # Webhook (GET/POST)
│   └── lib/
│       └── prisma.ts         # Prisma singleton
├── docker-compose.yml
├── Dockerfile
└── .env.example
```
