-- ═══════════════════════════════════════════════════════════════
-- QUERIES BI — Demanda e Ruptura de Estoque
-- Parâmetros: $1 = storeId (obrigatório), $2/$3 = filtros opcionais
--
-- Requer índice GIN: docs/migrations/telemetry_gin.sql
-- ═══════════════════════════════════════════════════════════════

-- ─── A) Top buscas do dia (por marca/categoria/uso) ──────────────
-- Útil para: entender o que os clientes mais buscam
SELECT
    payload->>'marca'       AS marca,
    payload->>'categoria'   AS categoria,
    payload->>'uso'         AS uso,
    COUNT(*)                AS total_buscas,
    COUNT(DISTINCT conversation_id) AS conversas_unicas
FROM telemetry_events
WHERE event_type  = 'product_interest'
  AND created_at >= NOW() - INTERVAL '24 hours'
  AND store_id    = $1   -- :storeId
GROUP BY 1, 2, 3
ORDER BY total_buscas DESC
LIMIT 20;

-- ─── B) Oportunidades perdidas por ruptura de estoque ─────────────
-- Correlação por requestId: produto buscado mas não encontrado
-- Útil para: decisões de compra/reposição de estoque
SELECT
    pi.payload->>'marca'        AS marca,
    pi.payload->>'categoria'    AS categoria,
    pi.payload->>'tamanho'      AS tamanho,
    COUNT(*)                    AS rupturas,
    COUNT(DISTINCT pi.conversation_id) AS clientes_afetados
FROM telemetry_events pi
JOIN telemetry_events sr
    ON  pi.request_id = sr.request_id
    AND pi.store_id   = sr.store_id
WHERE pi.event_type           = 'product_interest'
  AND sr.event_type           = 'stock_result'
  AND sr.payload->>'status'   IN ('not_found', 'out_of_stock')
  AND pi.created_at          >= NOW() - INTERVAL '7 days'
  AND pi.store_id             = $1   -- :storeId
GROUP BY 1, 2, 3
ORDER BY rupturas DESC;

-- ─── C) Retargeting — clientes que não acharam produto ────────────
-- customer_id é SHA-256 do telefone (LGPD-safe)
-- Útil para: campanhas de reativação quando produto chegar
SELECT DISTINCT
    pi.customer_id              AS customer_id_hash,
    pi.payload->>'marca'        AS marca,
    pi.payload->>'categoria'    AS categoria,
    pi.payload->>'tamanho'      AS tamanho,
    MAX(pi.created_at)          AS ultima_busca
FROM telemetry_events pi
JOIN telemetry_events sr
    ON  pi.request_id = sr.request_id
    AND pi.store_id   = sr.store_id
WHERE pi.event_type             = 'product_interest'
  AND sr.event_type             = 'stock_result'
  AND sr.payload->>'status'     = 'not_found'
  AND pi.store_id               = $1             -- :storeId
  AND ($2 IS NULL OR pi.payload->>'marca'    = $2)  -- filtro opcional: marca
  AND ($3 IS NULL OR pi.payload->>'tamanho'  = $3)  -- filtro opcional: tamanho
GROUP BY 1, 2, 3, 4
ORDER BY ultima_busca DESC;
