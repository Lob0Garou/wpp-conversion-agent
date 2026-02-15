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

## Testar

```bash
# Health check
curl http://localhost:3000/api/health

# Verificação do webhook
curl "http://localhost:3000/api/webhook?hub.mode=subscribe&hub.verify_token=TEST_TOKEN&hub.challenge=abc123"

# Enviar payload de teste
curl -X POST http://localhost:3000/api/webhook -H "Content-Type: application/json" -d '{"test": true}'
```

### 6. Testar Envio Outbound

1. Configure as variáveis no `.env`:

    ```env
    WHATSAPP_API_TOKEN="seu_token_permanente_ou_temporario"
    WHATSAPP_PHONE_NUMBER_ID="seu_id_de_telefone_whatsapp"
    ```

2. Envie uma mensagem para o número de teste do WhatsApp configurado.
3. Verifique se recebeu a resposta automática: "Recebi ✅ Me diz o que você procura...".
4. Confira os logs do servidor para ver a confirmação de envio e persistência.

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
