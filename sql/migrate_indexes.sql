-- =====================================================
-- EFE Project - Migración de Índices para Rendimiento
-- =====================================================
-- Ejecutar contra la base de datos EXISTENTE.
-- Todos usan "IF NOT EXISTS" así que es seguro
-- ejecutarlo múltiples veces.
-- =====================================================
-- Fecha: 2026-06-12
-- =====================================================

BEGIN;

-- ─── 1. Auth Middleware ──────────────────────────────
-- Acelera: SELECT company_id FROM companies_users WHERE user_id = $1 AND is_active = true
CREATE INDEX IF NOT EXISTS idx_companies_users_user_active
  ON companies_users(user_id, is_active);

-- ─── 2. Filtro Multi-tenant (Dashboard / Telemetry) ──
-- Acelera: Queries con WHERE d.company_id = ANY($1) AND d.is_active = true
CREATE INDEX IF NOT EXISTS idx_devices_company_active
  ON devices(company_id, is_active);

-- ─── 3. Listados por tipo de dispositivo ─────────────
-- Acelera: getAllGpsDevices() y getGatewayStatus()
--   WHERE d.type_device = 'Gps' AND d.is_active = true AND d.company_id = ANY(...)
CREATE INDEX IF NOT EXISTS idx_devices_type_company_active
  ON devices(type_device, company_id, is_active);

-- ─── 4. Ubicaciones en el mapa ──────────────────────
-- Acelera: getDevicesLocations()
--   WHERE d.type_device = 'Gps' AND d.is_active = true
--     AND d.latitude_current IS NOT NULL AND d.longitude_current IS NOT NULL
CREATE INDEX IF NOT EXISTS idx_devices_coords_active
  ON devices(latitude_current, longitude_current)
  WHERE is_active = true AND latitude_current IS NOT NULL;

-- ─── 5. Alertas Críticas Activas ─────────────────────
-- Acelera: getCriticalAlerts()
--   WHERE a.type = 'critica' AND a.status_system = 'active'
CREATE INDEX IF NOT EXISTS idx_alerts_type_status_system
  ON alerts(type, status_system)
  WHERE status_system = 'active';

-- ─── 6. Alertas de Atención / Desconexión Activas ───
-- Acelera: getAtencionAlerts() y getDisconexionGWAlerts()
--   WHERE a.type = 'atencion' AND a.status = 'active'
CREATE INDEX IF NOT EXISTS idx_alerts_type_status_active
  ON alerts(type, status)
  WHERE status = 'active';

-- ─── 7. Tracking de Alertas (subquery LATERAL) ──────
-- Acelera: Subquery dentro de getCriticalAlerts()
--   SELECT ... FROM tracking_alerts ta2 WHERE ta2.alert_id = a.id ORDER BY ta2.timestamp DESC LIMIT 10
CREATE INDEX IF NOT EXISTS idx_tracking_alert_timestamp
  ON tracking_alerts(alert_id, timestamp DESC);

COMMIT;

-- =====================================================
-- VERIFICACIÓN: lista los índices creados
-- =====================================================
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename IN ('devices', 'alerts', 'tracking_alerts', 'companies_users')
ORDER BY tablename, indexname;
