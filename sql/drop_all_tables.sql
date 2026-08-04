-- =====================================================
-- EFESUR - LIMPIEZA TOTAL DE TABLAS (sin DROP DATABASE)
-- =====================================================
-- Para cuando NO se puede hacer DROP DATABASE (sin permisos
-- de superusuario) pero hay que re-correr install_all.sql
-- desde cero.
--
-- Cómo usar:
--   1) Conectarse a la base efe_db con las credenciales
--      otorgadas (las mismas que usas para correr el script).
--   2) Ejecutar ESTE archivo completo (o copiar/pegar).
--   3) Luego ejecutar install_all.sql de nuevo.
--
-- NOTA: esto borra TODAS las tablas del esquema 'public'
--       de la base conectada, incluida cualquier tabla vieja
--       de esquemas anteriores. Si hay tablas de OTRA app en
--       la misma base, primero avisá / revisá.
-- =====================================================

-- =====================================================
-- OPCIÓN A (RECOMENDADA): borrar automáticamente TODAS
-- las tablas del esquema 'public' (no importa el nombre).
-- =====================================================
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', r.tablename);
    END LOOP;
END $$;

-- =====================================================
-- OPCIÓN B (alternativa): lista explícita de las tablas
-- del proyecto, en orden seguro (hijas primero, CASCADE
-- por si acaso). Descomentá si preferís esto en vez de A.
-- =====================================================
-- DROP TABLE IF EXISTS tracking_alerts CASCADE;
-- DROP TABLE IF EXISTS alerts CASCADE;
-- DROP TABLE IF EXISTS telemetry_data_all CASCADE;
-- DROP TABLE IF EXISTS audit_log CASCADE;
-- DROP TABLE IF EXISTS lector_device CASCADE;
-- DROP TABLE IF EXISTS sub_estacion_device CASCADE;
-- DROP TABLE IF EXISTS gateway_device CASCADE;
-- DROP TABLE IF EXISTS gps_device CASCADE;
-- DROP TABLE IF EXISTS devices CASCADE;
-- DROP TABLE IF EXISTS company_config CASCADE;
-- DROP TABLE IF EXISTS companies_users CASCADE;
-- DROP TABLE IF EXISTS companies CASCADE;
-- DROP TABLE IF EXISTS verifications CASCADE;
-- DROP TABLE IF EXISTS accounts CASCADE;
-- DROP TABLE IF EXISTS sessions CASCADE;
-- DROP TABLE IF EXISTS users CASCADE;

-- =====================================================
-- VERIFICACIÓN: debe devolver 0 filas (o listar vacío)
-- =====================================================
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public';
