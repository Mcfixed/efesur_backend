-- ============================================================================
--  EFESUR · Migración: unificar TODAS las fechas en UTC
--  Base: efe_db          Ejecutar UNA sola vez.
-- ============================================================================
--
--  CONTEXTO
--  --------
--  Todas las columnas de fecha son `timestamp without time zone`. El sistema
--  mezclaba dos marcos horarios en la MISMA base:
--
--    UTC    (correcto)   <- Node-RED: payload.time y NOW() AT TIME ZONE 'UTC'
--                           audit_log.created_at
--    CHILE  (incorrecto) <- backend: NOW() / CURRENT_TIMESTAMP con la sesión en
--                           America/Santiago, y los nodos "Update Alert" de
--                           Node-RED (resolved_at = NOW())
--
--  Consecuencia medida: 166 de 513 cierres con duración NEGATIVA (-3 h / -4 h).
--
--  Este script:
--    1) Convierte los valores históricos en hora de Chile a UTC.
--    2) Deja los DEFAULT en UTC para que no vuelvan a entrar valores locales.
--
--  ---------------------------------------------------------------------------
--  VALIDACIÓN PREVIA (ejecutar antes; DEBE devolver 0):
--
--    SELECT COUNT(*) FROM alerts
--    WHERE resolved_at IS NOT NULL AND type <> 'desconexionGW'
--      AND resolved_at >= TIMESTAMP '2026-09-25 00:00:00';
--
--  ⚠️  El corte (2026-09-25) corresponde al momento en que se corrigió Node-RED:
--      los cierres POSTERIORES ya se guardan en UTC y NO deben convertirse.
--      Si vuelves a ejecutar este script, NO cambies el corte.
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) alerts.resolved_at
--    Escrito por los nodos "Update Alert" de Node-RED (apertura, presencia,
--    critica, desconexion220) y por resolveAlertById() del backend. Ambos con
--    NOW() -> hora de Chile.
--    NO se toca 'desconexionGW': ese lo cierra fn_sql_monitor, siempre en UTC.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE alerts
SET resolved_at = (resolved_at AT TIME ZONE 'America/Santiago') AT TIME ZONE 'UTC'
WHERE resolved_at IS NOT NULL
  AND type <> 'desconexionGW'
  AND resolved_at < TIMESTAMP '2026-09-25 00:00:00'
  AND (
       -- (a) Imposible: resuelta antes de ser creada -> sigue en hora local
       resolved_at < created_at
       -- (b) El desfase contra durationMs revela entre +1h y +6h -> sigue en hora local
       --     (con los valores ya en UTC el desfase es de segundos negativos, así que
       --      esta regla hace el script IDEMPOTENTE: re-ejecutarlo no vuelve a desplazar)
    OR (metadata->>'durationMs' IS NOT NULL
        AND (created_at + ((metadata->>'durationMs')::numeric * INTERVAL '1 millisecond')) - resolved_at
            BETWEEN INTERVAL '1 hour' AND INTERVAL '6 hours')
      );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) devices.created_at / updated_at
--    Escritos por el backend con NOW()/DEFAULT -> hora de Chile.
--    Se convierten SOLO las filas demostrables: se compara contra audit_log
--    (que siempre fue UTC). Si el registro de auditoría está entre 2 y 6 horas
--    por delante de la columna, esa columna estaba en hora local.
--    Regla auto-validada y re-ejecutable sin daño.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE devices d
SET created_at = (d.created_at AT TIME ZONE 'America/Santiago') AT TIME ZONE 'UTC'
WHERE EXISTS (
  SELECT 1 FROM audit_log a
  WHERE a.action = 'create_device'
    AND a.details->>'dev_eui' = d.dev_eui
    AND a.created_at - d.created_at BETWEEN INTERVAL '2 hours' AND INTERVAL '6 hours'
);

--  devices.updated_at -> la auditoría de 'update_device' guarda el id en
--  details->>'id' (no en 'dev_eui'). Se combinan dos reglas para no dejar filas atrás:
--    (1) demostrable contra audit_log (desfase de 2 a 6 horas)
--    (2) imposible: "actualizado antes de creado" -> sigue en hora local
--  Ambas dejan el script IDEMPOTENTE.
UPDATE devices d
SET updated_at = (d.updated_at AT TIME ZONE 'America/Santiago') AT TIME ZONE 'UTC'
WHERE EXISTS (
  SELECT 1 FROM audit_log a
  WHERE a.action = 'update_device'
    AND a.details->>'id' = d.id::text
    AND a.created_at - d.updated_at BETWEEN INTERVAL '2 hours' AND INTERVAL '6 hours'
)
   OR d.updated_at < d.created_at;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Resto de tablas escritas por el backend / better-auth
--    Mismo código y misma sesión (America/Santiago). Verificado con los
--    anclajes de audit_log: users.created_at -> +4h exacto (pre-DST) y
--    +3h exacto (post-DST); accounts.created_at == users.created_at.
--    Todo lo existente es anterior al despliegue -> hora de Chile.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE users
SET created_at = (created_at AT TIME ZONE 'America/Santiago') AT TIME ZONE 'UTC',
    updated_at = (updated_at AT TIME ZONE 'America/Santiago') AT TIME ZONE 'UTC';

UPDATE companies
SET created_at = (created_at AT TIME ZONE 'America/Santiago') AT TIME ZONE 'UTC',
    updated_at = (updated_at AT TIME ZONE 'America/Santiago') AT TIME ZONE 'UTC';

UPDATE companies_users
SET created_at = (created_at AT TIME ZONE 'America/Santiago') AT TIME ZONE 'UTC';

UPDATE accounts
SET created_at = (created_at AT TIME ZONE 'America/Santiago') AT TIME ZONE 'UTC',
    updated_at = (updated_at AT TIME ZONE 'America/Santiago') AT TIME ZONE 'UTC';

-- ─────────────────────────────────────────────────────────────────────────────
-- NO se tocan (ya estaban correctamente en UTC):
--   alerts.created_at            (payload.time de ChirpStack)
--   telemetry_data_all.ts        (payload.time)
--   tracking_alerts.timestamp    (payload.time)
--   devices.last_seen            (NOW() AT TIME ZONE 'UTC')
--   audit_log.created_at         (default ya en UTC)
--   sessions.*                   (sin anclaje verificable y con created_at /
--                                 expires_at coherentes entre sí -> NO convertir)
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) DEFAULTs -> UTC
--    Así no vuelve a entrar hora local por omisión, sin depender del TimeZone
--    de la sesión que haga el INSERT.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE accounts           ALTER COLUMN created_at SET DEFAULT (now() AT TIME ZONE 'UTC');
ALTER TABLE accounts           ALTER COLUMN updated_at SET DEFAULT (now() AT TIME ZONE 'UTC');
ALTER TABLE alerts             ALTER COLUMN created_at SET DEFAULT (now() AT TIME ZONE 'UTC');
ALTER TABLE companies          ALTER COLUMN created_at SET DEFAULT (now() AT TIME ZONE 'UTC');
ALTER TABLE companies          ALTER COLUMN updated_at SET DEFAULT (now() AT TIME ZONE 'UTC');
ALTER TABLE companies_users    ALTER COLUMN created_at SET DEFAULT (now() AT TIME ZONE 'UTC');
ALTER TABLE devices            ALTER COLUMN created_at SET DEFAULT (now() AT TIME ZONE 'UTC');
ALTER TABLE devices            ALTER COLUMN updated_at SET DEFAULT (now() AT TIME ZONE 'UTC');
ALTER TABLE sessions           ALTER COLUMN created_at SET DEFAULT (now() AT TIME ZONE 'UTC');
ALTER TABLE sessions           ALTER COLUMN updated_at SET DEFAULT (now() AT TIME ZONE 'UTC');
ALTER TABLE telemetry_data_all ALTER COLUMN ts         SET DEFAULT (now() AT TIME ZONE 'UTC');
ALTER TABLE tracking_alerts    ALTER COLUMN timestamp  SET DEFAULT (now() AT TIME ZONE 'UTC');
ALTER TABLE users              ALTER COLUMN created_at SET DEFAULT (now() AT TIME ZONE 'UTC');
ALTER TABLE users              ALTER COLUMN updated_at SET DEFAULT (now() AT TIME ZONE 'UTC');
ALTER TABLE verifications      ALTER COLUMN created_at SET DEFAULT (now() AT TIME ZONE 'UTC');

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Red de seguridad opcional: dejar el SERVIDOR PostgreSQL en UTC.
--    Requiere superusuario. Si falla no es crítico: las sesiones ya se fijan
--    explícitamente desde src/config/database.js y desde este script.
-- ─────────────────────────────────────────────────────────────────────────────
-- ALTER DATABASE efe_db SET timezone TO 'UTC';

COMMIT;

-- ============================================================================
--  VERIFICACIÓN POSTERIOR
-- ============================================================================
-- a) No debe quedar ninguna duración negativa:
--      SELECT COUNT(*) FROM alerts
--      WHERE resolved_at IS NOT NULL AND resolved_at < created_at;
--
-- b) Los cierres deben tener duraciones coherentes:
--      SELECT id, type, created_at, resolved_at, resolved_at - created_at
--      FROM alerts WHERE resolved_at IS NOT NULL AND type <> 'desconexionGW'
--      ORDER BY id DESC LIMIT 10;
--
-- c) devices.updated_at debe alinearse con audit_log (delta ~0, no ~3h):
--      SELECT to_char(d.updated_at,'MM-DD HH24:MI:SS') AS devices,
--             to_char(a.created_at,'MM-DD HH24:MI:SS') AS audit
--      FROM devices d
--      JOIN audit_log a ON a.action = 'update_device'
--        AND a.details->>'dev_eui' = d.dev_eui
--      ORDER BY d.updated_at DESC LIMIT 5;
--
-- d) DEFAULTs en UTC:
--      SELECT table_name, column_name, column_default
--      FROM information_schema.columns
--      WHERE table_schema = 'public'
--        AND data_type = 'timestamp without time zone'
--        AND column_default IS NOT NULL
--      ORDER BY 1, 2;
-- ============================================================================
