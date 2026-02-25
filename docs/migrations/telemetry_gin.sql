-- ═══════════════════════════════════════════════════════════════
-- MIGRATION MANUAL: Índice GIN no payload JSONB de telemetry_events
-- Executar uma vez após: npx prisma db push
--
-- Uso: psql $DATABASE_URL -f docs/migrations/telemetry_gin.sql
--      OU colar no DBeaver/pgAdmin
-- ═══════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_telemetry_payload_gin
    ON telemetry_events
    USING GIN (payload jsonb_path_ops);
