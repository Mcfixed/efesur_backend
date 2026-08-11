-- =====================================================
-- EFE Project - Fixes de Schema para instalación nueva
-- Ejecutar DESPUÉS de schema.sql en una BD existente.
-- =====================================================
-- Este archivo corrige desajustes entre el schema.sql
-- y lo que el código realmente usa, para que un servidor
-- nuevo funcione sin errores.
-- =====================================================

BEGIN;

-- ─── 1. Asegurar columna `role` en users (en vez de is_superuser) ───
-- Si la tabla users no tiene `role`, la agrega.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'role'
  ) THEN
    ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'visualizador';
  END IF;
END $$;

-- ─── 2. Ampliar CHECK de alerts.type para aceptar apertura/presencia ───
ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_type_check;
ALTER TABLE alerts DROP CONSTRAINT IF EXISTS type_check;

ALTER TABLE alerts
  ADD CONSTRAINT alerts_type_check
  CHECK (type IN ('atencion', 'critica', 'desconexionGW', 'desconexionGPS', 'desconexion220', 'desconexionbatGW', 'movimientos_anomalos', 'apertura', 'presencia'));

COMMIT;
