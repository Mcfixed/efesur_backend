-- ═══════════════════════════════════════════════════════════════════════════
-- Índices de rendimiento (opcional). Aplicar una vez:
--   psql "$DATABASE_URL" -f sql/perf_indexes.sql
--
-- Contexto: `telemetry_data_all` tiene ~500k filas. Las consultas del panel
-- preguntan "el último dato de cada equipo de un tipo concreto" filtrando por
-- una clave del jsonb `object` (Mppt, BlueSmartIP67, operatingMode). Sin índice
-- eso obliga a recorrer toda la historia del equipo; con estos índices
-- parciales sólo se recorre la parte relevante (y ya viene ordenada por ts DESC).
-- ═══════════════════════════════════════════════════════════════════════════

-- Batería / energía solar del lector (Mppt.batteryVoltage_V)
CREATE INDEX IF NOT EXISTS idx_telemetry_mppt
  ON telemetry_data_all (device_id, ts DESC)
  WHERE object ? 'Mppt';
ANALYZE telemetry_data_all;

-- Energía 220 V (BlueSmartIP67.voltaje_V)
CREATE INDEX IF NOT EXISTS idx_telemetry_blue
  ON telemetry_data_all (device_id, ts DESC)
  WHERE object ? 'BlueSmartIP67';
ANALYZE telemetry_data_all;

-- Modo de operación del GPS (operatingMode)
CREATE INDEX IF NOT EXISTS idx_telemetry_opmode
  ON telemetry_data_all (device_id, ts DESC)
  WHERE object ? 'operatingMode';
ANALYZE telemetry_data_all;

-- Rango temporal global (mapa de calor, reportes, "últimos N días").
-- BRIN es diminuto en disco y acelera los escaneos por rango de fechas.
CREATE INDEX IF NOT EXISTS idx_telemetry_ts_brin
  ON telemetry_data_all USING BRIN (ts) WITH (pages_per_range = 32);
ANALYZE telemetry_data_all;

-- ───────────────────────────────────────────────────────────────────────────
-- Diagnóstico: qué consultas consumen más tiempo.
-- Requiere reiniciar PostgreSQL (shared_preload_libraries = 'pg_stat_statements').
--   CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
--   SELECT calls, round(mean_exec_time::numeric, 1) AS ms_prom, round(total_exec_time::numeric) AS ms_total,
--          left(query, 90) AS consulta
--   FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 15;
-- ───────────────────────────────────────────────────────────────────────────
