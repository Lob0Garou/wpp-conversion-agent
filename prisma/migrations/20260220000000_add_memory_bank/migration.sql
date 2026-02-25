-- FASE 2: Memory Bank — Few-shot dinâmico por intenção
-- Criado via db push em 2026-02-20 (pgvector não disponível no servidor,
-- portanto mantemos migrate dev desabilitado e usamos db push).

-- CreateTable
CREATE TABLE IF NOT EXISTS "memory_bank" (
    "id"          TEXT         NOT NULL,
    "store_id"    TEXT,
    "intent"      TEXT         NOT NULL,
    "user_msg"    TEXT         NOT NULL,
    "agent_msg"   TEXT         NOT NULL,
    "score"       DOUBLE PRECISION NOT NULL,
    "metadata"    JSONB,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memory_bank_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "memory_bank_intent_score_idx"   ON "memory_bank"("intent", "score" DESC);
CREATE INDEX IF NOT EXISTS "memory_bank_store_id_intent_idx" ON "memory_bank"("store_id", "intent");

-- AddForeignKey (nullable — store_id pode ser NULL para exemplos globais)
ALTER TABLE "memory_bank"
    ADD CONSTRAINT "memory_bank_store_id_fkey"
    FOREIGN KEY ("store_id") REFERENCES "stores"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
    NOT VALID; -- NOT VALID ignora linhas existentes com store_id=NULL
