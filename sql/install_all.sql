-- =====================================================
-- EFE PROJECT - INSTALACIÓN COMPLETA DE BASE DE DATOS
-- =====================================================
-- Ejecutar DIRECTAMENTE en la máquina donde está PostgreSQL.
--
-- IMPORTANTE:
--  1) Antes, crear la base (una sola vez, como superusuario):
--     CREATE DATABASE efe_db;
--  2) Luego conectarse a efe_db y ejecutar ESTE archivo completo.
--  3) Si la BD ya existía con tablas viejas, este script igual
--     es idempotente (IF NOT EXISTS + fixes) y la corrige.
--
-- Comando desde la máquina de la DB:
--   psql -U postgres -d efe_db -f install_all.sql
--   (te pedirá la contraseña de postgres)
-- =====================================================

-- Extensión para gen_random_uuid() (postgres 13+ ya la incluye nativo)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- NOTA: este script NO usa BEGIN/COMMIT. Cada sentencia se
-- ejecuta de forma independiente (autocommit) para que un
-- error puntual NO aborte todo el resto (evita el error
-- "current transaction is aborted"). Si algo falla, verás el
-- error real en la sentencia exacta; lo demás ya quedó hecho.
-- El script es idempotente, así que puedes re-ejecutarlo.

-- ════════════════════════════════════════════════════════
-- 1. BETTER AUTH (Capa de Autenticación)
-- ════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    email_verified BOOLEAN DEFAULT false,
    name VARCHAR(255),
    image TEXT,
    role VARCHAR(20) DEFAULT 'visualizador',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
    id VARCHAR(255) PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    account_id VARCHAR(255) NOT NULL,
    provider_id VARCHAR(255) NOT NULL,
    password VARCHAR(255),
    access_token TEXT,
    refresh_token TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier VARCHAR(255) NOT NULL,
    value VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ════════════════════════════════════════════════════════
-- 2. LÓGICA DE NEGOCIO Y ROLES (Multi-tenant)
-- ════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS companies (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    rut VARCHAR(50) UNIQUE NOT NULL,
    sector VARCHAR(100),
    color_theme VARCHAR(50) DEFAULT '#007bff',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS companies_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'viewer',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(company_id, user_id)
);

CREATE TABLE IF NOT EXISTS company_config (
    id SERIAL PRIMARY KEY,
    company_id INTEGER UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
    url VARCHAR(255),
    color VARCHAR(50)
);

-- ════════════════════════════════════════════════════════
-- 3. ECOSISTEMA IoT (Dispositivos)
-- ════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS devices (
    id SERIAL PRIMARY KEY,
    dev_eui VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
    id_device_father INTEGER REFERENCES devices(id) ON DELETE SET NULL,
    type_device VARCHAR(50) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    last_seen TIMESTAMP,
    latitude_current DECIMAL(9,6),
    longitude_current DECIMAL(9,6),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gps_device (
    id INTEGER PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
    accelerometers_status VARCHAR(50),
    battery INTEGER DEFAULT 100,
    operating_mode VARCHAR(50) DEFAULT 'normal',
    catenaria_linea VARCHAR(50),
    catenaria_orden INTEGER
);

CREATE TABLE IF NOT EXISTS sub_estacion_device (
    id INTEGER PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
    input_1_status VARCHAR(50),
    alert BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS gateway_device (
    id INTEGER PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
    ip_internal VARCHAR(45),
    battery INTEGER DEFAULT 100,
    firmware_version VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS lector_device (
    id INTEGER PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
    last_date_reader VARCHAR(100),
    battery_reader INTEGER DEFAULT 100,
    tipo VARCHAR(50)
);

-- Raw Telemetry Data
CREATE TABLE IF NOT EXISTS telemetry_data_all (
    id BIGSERIAL PRIMARY KEY,
    device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    object JSONB,
    rxinfo JSONB
);

CREATE INDEX IF NOT EXISTS idx_telemetry_device_ts ON telemetry_data_all(device_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_ts ON telemetry_data_all(ts DESC);

-- ════════════════════════════════════════════════════════
-- 4. SISTEMA DE ALERTAS Y TRACKING
--    (CHECK ampliado para incluir apertura y presencia)
-- ════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS alerts (
    id SERIAL PRIMARY KEY,
    device_id INTEGER REFERENCES devices(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('atencion', 'critica', 'desconexionGW', 'desconexionGPS', 'movimientos_anomalos', 'apertura', 'presencia')),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
    status_system VARCHAR(20) DEFAULT 'active' CHECK (status_system IN ('active', 'resolved')),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    user_reason TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_alerts_device ON alerts(device_id);
CREATE INDEX IF NOT EXISTS idx_alerts_type_status ON alerts(type, status);
CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at DESC);

CREATE TABLE IF NOT EXISTS tracking_alerts (
    id SERIAL PRIMARY KEY,
    alert_id INTEGER REFERENCES alerts(id) ON DELETE CASCADE,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    battery INTEGER,
    latitude DECIMAL(9,6),
    longitude DECIMAL(9,6),
    metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_tracking_alert ON tracking_alerts(alert_id);

-- ════════════════════════════════════════════════════════
-- 5. ÍNDICES ADICIONALES PARA RENDIMIENTO
-- ════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_companies_users_user_active
  ON companies_users(user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_devices_company_active
  ON devices(company_id, is_active);

CREATE INDEX IF NOT EXISTS idx_devices_type_company_active
  ON devices(type_device, company_id, is_active);

CREATE INDEX IF NOT EXISTS idx_devices_coords_active
  ON devices(latitude_current, longitude_current)
  WHERE is_active = true AND latitude_current IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_alerts_type_status_system
  ON alerts(type, status_system)
  WHERE status_system = 'active';

CREATE INDEX IF NOT EXISTS idx_alerts_type_status_active
  ON alerts(type, status)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_tracking_alert_timestamp
  ON tracking_alerts(alert_id, timestamp DESC);

-- ════════════════════════════════════════════════════════
-- 6. AUDITORÍA DEL SISTEMA
-- ════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    user_name VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    details JSONB,
    ip VARCHAR(45),
    path VARCHAR(255),
    method VARCHAR(10),
    created_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);

-- ════════════════════════════════════════════════════════
-- FIXES para bases existentes (idempotente)
-- ════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'role'
  ) THEN
    ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'visualizador';
  END IF;
END $$;

ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_type_check;
ALTER TABLE alerts DROP CONSTRAINT IF EXISTS type_check;
ALTER TABLE alerts
  ADD CONSTRAINT alerts_type_check
  CHECK (type IN ('atencion', 'critica', 'desconexionGW', 'desconexionGPS', 'movimientos_anomalos', 'apertura', 'presencia'));

-- ════════════════════════════════════════════════════════
-- SEED - Datos de ejemplo
-- ════════════════════════════════════════════════════════

-- 1. Companies
INSERT INTO companies (name, rut, sector, color_theme, is_active) VALUES
('AST.', '76.123.456-7', 'Logística', '#007bff', true),
('AST2', '76.987.654-3', 'Minería', '#28a745', true),
('AST3', '76.555.444-1', 'Energía Renovable', '#ffc107', true)
ON CONFLICT (rut) DO NOTHING;

-- 2. Users (role: superadmin | admin_efe | visualizador)
INSERT INTO users (email, email_verified, name, role) VALUES
('admin@wisensor.cl', true, 'Administrador Sistema', 'superadmin'),
('diego@wisensor.cl', true, 'Diego García', 'admin_efe')
ON CONFLICT (email) DO NOTHING;

-- 3. Company-User assignments
INSERT INTO companies_users (company_id, user_id, role) VALUES
((SELECT id FROM companies WHERE rut = '76.123.456-7'), (SELECT id FROM users WHERE email = 'admin@wisensor.cl'), 'admin'),
((SELECT id FROM companies WHERE rut = '76.123.456-7'), (SELECT id FROM users WHERE email = 'diego@wisensor.cl'), 'operator')
ON CONFLICT (company_id, user_id) DO NOTHING;

-- 4. Company Config
INSERT INTO company_config (company_id, url, color) VALUES
((SELECT id FROM companies WHERE rut = '76.123.456-7'), 'https://ast.cl', '#007bff'),
((SELECT id FROM companies WHERE rut = '76.987.654-3'), 'https://test2empresa2.cl', '#28a745'),
((SELECT id FROM companies WHERE rut = '76.555.444-1'), 'https://test3empresa3.cl', '#ffc107')
ON CONFLICT (company_id) DO NOTHING;

-- 5. Devices (GPS trackers)
INSERT INTO devices (dev_eui, name, company_id, type_device, is_active, latitude_current, longitude_current, last_seen) VALUES
('GPS-001-AAAA-1111', 'V1test1', (SELECT id FROM companies WHERE rut = '76.123.456-7'), 'Gps', true, -33.4489, -70.6693, NOW()),
('GPS-002-BBBB-2222', 'V1test2', (SELECT id FROM companies WHERE rut = '76.123.456-7'), 'Gps', true, -33.4589, -70.6593, NOW()),
('GPS-003-CCCC-3333', 'V1test3', (SELECT id FROM companies WHERE rut = '76.123.456-7'), 'Gps', true, -33.4389, -70.6793, NOW()),
('GPS-004-DDDD-4444', 'V1test4', (SELECT id FROM companies WHERE rut = '76.987.654-3'), 'Gps', true, -37.1234, -72.5678, NOW()),
('GPS-005-EEEE-5555', 'V1test5', (SELECT id FROM companies WHERE rut = '76.987.654-3'), 'Gps', true, -37.1334, -72.5778, NOW()),
('GPS-006-FFFF-6666', 'V1test6', (SELECT id FROM companies WHERE rut = '76.123.456-7'), 'Gps', true, -33.4500, -70.6650, NOW()),
('GPS-007-GGGG-7777', 'V1test7', (SELECT id FROM companies WHERE rut = '76.987.654-3'), 'Gps', true, -37.1500, -72.5900, NOW()),
('GPS-008-HHHH-8888', 'V1test8', (SELECT id FROM companies WHERE rut = '76.555.444-1'), 'Gps', true, -33.4600, -70.6800, NOW())
ON CONFLICT (dev_eui) DO NOTHING;

-- 6. GPS Device specific data
INSERT INTO gps_device (id, accelerometers_status, battery, operating_mode) VALUES
((SELECT id FROM devices WHERE dev_eui = 'GPS-001-AAAA-1111'), 'normal', 85, 'normal'),
((SELECT id FROM devices WHERE dev_eui = 'GPS-002-BBBB-2222'), 'normal', 92, 'normal'),
((SELECT id FROM devices WHERE dev_eui = 'GPS-003-CCCC-3333'), 'alert', 45, 'normal'),
((SELECT id FROM devices WHERE dev_eui = 'GPS-004-DDDD-4444'), 'normal', 78, 'normal'),
((SELECT id FROM devices WHERE dev_eui = 'GPS-005-EEEE-5555'), 'critical', 15, 'normal'),
((SELECT id FROM devices WHERE dev_eui = 'GPS-006-FFFF-6666'), 'normal', 100, 'normal'),
((SELECT id FROM devices WHERE dev_eui = 'GPS-007-GGGG-7777'), 'alert', 35, 'normal'),
((SELECT id FROM devices WHERE dev_eui = 'GPS-008-HHHH-8888'), 'normal', 95, 'normal')
ON CONFLICT (id) DO NOTHING;

-- 7. Gateway devices (12 gateways)
INSERT INTO devices (dev_eui, name, company_id, type_device, is_active, latitude_current, longitude_current, last_seen) VALUES
('GW-001-AAAA-1111', 'Gateway Central1', (SELECT id FROM companies WHERE rut = '76.123.456-7'), 'Gateway', true, -33.4490, -70.6695, NOW() - INTERVAL '1 minute'),
('GW-002-BBBB-2222', 'Gateway Central2', (SELECT id FROM companies WHERE rut = '76.987.654-3'), 'Gateway', true, -37.1240, -72.5680, NOW() - INTERVAL '30 seconds'),
('GW-003-CCCC-3333', 'Gateway Central3', (SELECT id FROM companies WHERE rut = '76.123.456-7'), 'Gateway', true, -32.9500, -71.3000, NOW() - INTERVAL '2 minutes'),
('GW-004-DDDD-4444', 'Gateway Central4', (SELECT id FROM companies WHERE rut = '76.123.456-7'), 'Gateway', true, -35.5000, -71.6000, NOW() - INTERVAL '3 minutes'),
('GW-005-EEEE-5555', 'Gateway Central5', (SELECT id FROM companies WHERE rut = '76.987.654-3'), 'Gateway', true, -36.8000, -73.0500, NOW() - INTERVAL '1 minute'),
('GW-006-FFFF-6666', 'Gateway Central6', (SELECT id FROM companies WHERE rut = '76.123.456-7'), 'Gateway', true, -33.0000, -71.5500, NOW() - INTERVAL '4 minutes'),
('GW-007-GGGG-7777', 'Gateway Central7', (SELECT id FROM companies WHERE rut = '76.555.444-1'), 'Gateway', true, -34.5000, -70.8000, NOW() - INTERVAL '30 seconds'),
('GW-008-HHHH-8888', 'Gateway Central8', (SELECT id FROM companies WHERE rut = '76.987.654-3'), 'Gateway', true, -39.8000, -73.2500, NOW() - INTERVAL '5 minutes'),
('GW-009-IIII-9999', 'Gateway Central9', (SELECT id FROM companies WHERE rut = '76.123.456-7'), 'Gateway', true, -32.7500, -71.4000, NOW() - INTERVAL '1 minute'),
('GW-010-JJJJ-0000', 'Gateway Central10', (SELECT id FROM companies WHERE rut = '76.987.654-3'), 'Gateway', true, -38.7000, -72.5000, NOW() - INTERVAL '2 minutes'),
('GW-011-KKKK-1111', 'Gateway Central11', (SELECT id FROM companies WHERE rut = '76.123.456-7'), 'Gateway', false, -40.5000, -72.8000, NOW() - INTERVAL '2 hours'),
('GW-012-LLLL-2222', 'Gateway Central12', (SELECT id FROM companies WHERE rut = '76.555.444-1'), 'Gateway', false, -18.5000, -69.8000, NOW() - INTERVAL '1 day')
ON CONFLICT (dev_eui) DO NOTHING;

INSERT INTO gateway_device (id, ip_internal, battery, firmware_version) VALUES
((SELECT id FROM devices WHERE dev_eui = 'GW-001-AAAA-1111'), '192.168.1.101', 100, 'v2.3.1'),
((SELECT id FROM devices WHERE dev_eui = 'GW-002-BBBB-2222'), '192.168.2.101', 95, 'v2.3.0'),
((SELECT id FROM devices WHERE dev_eui = 'GW-003-CCCC-3333'), '192.168.3.101', 90, 'v2.4.0'),
((SELECT id FROM devices WHERE dev_eui = 'GW-004-DDDD-4444'), '192.168.4.101', 85, 'v2.4.0'),
((SELECT id FROM devices WHERE dev_eui = 'GW-005-EEEE-5555'), '192.168.5.101', 80, 'v2.3.2'),
((SELECT id FROM devices WHERE dev_eui = 'GW-006-FFFF-6666'), '192.168.6.101', 75, 'v2.4.1'),
((SELECT id FROM devices WHERE dev_eui = 'GW-007-GGGG-7777'), '192.168.7.101', 90, 'v2.3.1'),
((SELECT id FROM devices WHERE dev_eui = 'GW-008-HHHH-8888'), '192.168.8.101', 85, 'v2.4.0'),
((SELECT id FROM devices WHERE dev_eui = 'GW-009-IIII-9999'), '192.168.9.101', 95, 'v2.4.1'),
((SELECT id FROM devices WHERE dev_eui = 'GW-010-JJJJ-0000'), '192.168.10.101', 80, 'v2.3.2'),
((SELECT id FROM devices WHERE dev_eui = 'GW-011-KKKK-1111'), '192.168.11.101', 90, 'v2.3.0'),
((SELECT id FROM devices WHERE dev_eui = 'GW-012-LLLL-2222'), '192.168.12.101', 85, 'v2.4.0')
ON CONFLICT (id) DO NOTHING;

-- 8. Sub Estacion devices
INSERT INTO devices (dev_eui, name, company_id, type_device, is_active, latitude_current, longitude_current) VALUES
('SE-001-AAAA-1111', 'SubEstación Norte-01', (SELECT id FROM companies WHERE rut = '76.123.456-7'), 'SubEstacion', true, -33.4500, -70.6700),
('SE-002-BBBB-2222', 'SubEstación Sur-01', (SELECT id FROM companies WHERE rut = '76.987.654-3'), 'SubEstacion', true, -37.1300, -72.5750)
ON CONFLICT (dev_eui) DO NOTHING;

INSERT INTO sub_estacion_device (id, input_1_status, alert) VALUES
((SELECT id FROM devices WHERE dev_eui = 'SE-001-AAAA-1111'), 'closed', false),
((SELECT id FROM devices WHERE dev_eui = 'SE-002-BBBB-2222'), 'open', true)
ON CONFLICT (id) DO NOTHING;

-- 9. Lector devices
INSERT INTO devices (dev_eui, name, company_id, type_device, is_active) VALUES
('LEC-001-AAAA-1111', 'Lector Norte-01', (SELECT id FROM companies WHERE rut = '76.123.456-7'), 'Lector', true),
('LEC-002-BBBB-2222', 'Lector Sur-01', (SELECT id FROM companies WHERE rut = '76.987.654-3'), 'Lector', true)
ON CONFLICT (dev_eui) DO NOTHING;

INSERT INTO lector_device (id, last_date_reader, battery_reader, tipo) VALUES
((SELECT id FROM devices WHERE dev_eui = 'LEC-001-AAAA-1111'), '2026-04-30 21:00:00', 80, 'apertura_puerta'),
((SELECT id FROM devices WHERE dev_eui = 'LEC-002-BBBB-2222'), '2026-04-30 22:30:00', 95, 'conexion_220v')
ON CONFLICT (id) DO NOTHING;

-- 10. Telemetry data samples
-- (borra filas previas del seed para que sea idempotente)
DELETE FROM tracking_alerts;
DELETE FROM alerts;
DELETE FROM telemetry_data_all;

INSERT INTO telemetry_data_all (device_id, ts, object, rxinfo) VALUES
((SELECT id FROM devices WHERE dev_eui = 'GPS-001-AAAA-1111'), NOW() - INTERVAL '5 minutes', '{"temperature": 25, "speed": 65, "fuel": 75}', '{"gw": "GW-001", "rssi": -45}'),
((SELECT id FROM devices WHERE dev_eui = 'GPS-001-AAAA-1111'), NOW() - INTERVAL '10 minutes', '{"temperature": 26, "speed": 60, "fuel": 74}', '{"gw": "GW-001", "rssi": -48}'),
((SELECT id FROM devices WHERE dev_eui = 'GPS-002-BBBB-2222'), NOW() - INTERVAL '5 minutes', '{"temperature": 23, "speed": 80, "fuel": 60}', '{"gw": "GW-001", "rssi": -50}'),
((SELECT id FROM devices WHERE dev_eui = 'GPS-003-CCCC-3333'), NOW() - INTERVAL '3 minutes', '{"temperature": 35, "speed": 0, "fuel": 20}', '{"gw": "GW-001", "rssi": -55}'),
((SELECT id FROM devices WHERE dev_eui = 'GPS-004-DDDD-4444'), NOW() - INTERVAL '5 minutes', '{"temperature": 28, "speed": 45, "fuel": 55}', '{"gw": "GW-002", "rssi": -42}'),
((SELECT id FROM devices WHERE dev_eui = 'GPS-005-EEEE-5555'), NOW() - INTERVAL '1 minute', '{"temperature": 38, "speed": 0, "fuel": 5}', '{"gw": "GW-002", "rssi": -60}'),
((SELECT id FROM devices WHERE dev_eui = 'GPS-006-FFFF-6666'), NOW() - INTERVAL '2 minutes', '{"temperature": 22, "speed": 55, "fuel": 90}', '{"gw": "GW-001", "rssi": -47}'),
((SELECT id FROM devices WHERE dev_eui = 'GPS-007-GGGG-7777'), NOW() - INTERVAL '4 minutes', '{"temperature": 32, "speed": 30, "fuel": 25}', '{"gw": "GW-002", "rssi": -52}'),
((SELECT id FROM devices WHERE dev_eui = 'GPS-008-HHHH-8888'), NOW() - INTERVAL '1 minute', '{"solar_output": 450, "battery_voltage": 48, "efficiency": 92}', '{"gw": "GW-002", "rssi": -40}'),
((SELECT id FROM devices WHERE dev_eui = 'GPS-004-DDDD-4444'), NOW() - INTERVAL '10 minutes', '{"temperature": 27, "speed": 50, "fuel": 54}', '{"gw": "GW-002", "rssi": -44}'),
((SELECT id FROM devices WHERE dev_eui = 'GPS-007-GGGG-7777'), NOW() - INTERVAL '8 minutes', '{"temperature": 30, "speed": 35, "fuel": 23}', '{"gw": "GW-002", "rssi": -51}'),
((SELECT id FROM devices WHERE dev_eui = 'GPS-001-AAAA-1111'), NOW() - INTERVAL '15 minutes', '{"temperature": 24, "speed": 70, "fuel": 73}', '{"gw": "GW-001", "rssi": -46}');

-- 11. Alerts (activas)
INSERT INTO alerts (device_id, type, status, metadata, created_at) VALUES
((SELECT id FROM devices WHERE dev_eui = 'GPS-003-CCCC-3333'), 'critica', 'active', '{"reason": "Batería baja crítica", "threshold": 20}', NOW() - INTERVAL '10 minutes'),
((SELECT id FROM devices WHERE dev_eui = 'GPS-005-EEEE-5555'), 'critica', 'active', '{"reason": "Combustible crítico", "threshold": 10}', NOW() - INTERVAL '5 minutes'),
((SELECT id FROM devices WHERE dev_eui = 'GPS-007-GGGG-7777'), 'atencion', 'active', '{"reason": "Temperatura elevada", "threshold": 30}', NOW() - INTERVAL '20 minutes'),
((SELECT id FROM devices WHERE dev_eui = 'GPS-008-HHHH-8888'), 'atencion', 'active', '{"reason": "Eficiencia reducida", "threshold": 90}', NOW() - INTERVAL '15 minutes'),
((SELECT id FROM devices WHERE dev_eui = 'GPS-002-BBBB-2222'), 'atencion', 'active', '{"reason": "Revisión pendiente", "threshold": 0}', NOW() - INTERVAL '45 minutes'),
((SELECT id FROM devices WHERE dev_eui = 'LEC-001-AAAA-1111'), 'apertura', 'active', '{"reason": "Puerta abierta en lector", "threshold": 0}', NOW() - INTERVAL '25 minutes'),
((SELECT id FROM devices WHERE dev_eui = 'LEC-002-BBBB-2222'), 'presencia', 'active', '{"reason": "Presencia detectada", "threshold": 0}', NOW() - INTERVAL '12 minutes');

-- 11b. Alerta resuelta (con user_id, user_reason y resolved_at)
INSERT INTO alerts (device_id, type, status, user_id, user_reason, metadata, created_at, resolved_at) VALUES
((SELECT id FROM devices WHERE dev_eui = 'GPS-001-AAAA-1111'), 'critica', 'resolved', (SELECT id FROM users WHERE email = 'admin@wisensor.cl'), 'Vehículo en mantenimiento', '{"reason": "Batería baja", "threshold": 20}', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour');

-- 12. Tracking data for critical alerts
INSERT INTO tracking_alerts (alert_id, timestamp, battery, latitude, longitude, metadata) VALUES
((SELECT a.id FROM alerts a JOIN devices d ON a.device_id = d.id WHERE d.dev_eui = 'GPS-003-CCCC-3333' AND a.status = 'active' LIMIT 1), NOW() - INTERVAL '10 minutes', 45, -33.4389, -70.6793, '{"speed": 0, "event": "stopped"}'),
((SELECT a.id FROM alerts a JOIN devices d ON a.device_id = d.id WHERE d.dev_eui = 'GPS-003-CCCC-3333' AND a.status = 'active' LIMIT 1), NOW() - INTERVAL '8 minutes', 43, -33.4390, -70.6792, '{"speed": 0, "event": "stopped"}'),
((SELECT a.id FROM alerts a JOIN devices d ON a.device_id = d.id WHERE d.dev_eui = 'GPS-003-CCCC-3333' AND a.status = 'active' LIMIT 1), NOW() - INTERVAL '5 minutes', 40, -33.4391, -70.6791, '{"speed": 0, "event": "alarm_triggered"}'),
((SELECT a.id FROM alerts a JOIN devices d ON a.device_id = d.id WHERE d.dev_eui = 'GPS-005-EEEE-5555' AND a.status = 'active' LIMIT 1), NOW() - INTERVAL '5 minutes', 15, -37.1334, -72.5778, '{"speed": 0, "event": "fuel_empty"}'),
((SELECT a.id FROM alerts a JOIN devices d ON a.device_id = d.id WHERE d.dev_eui = 'GPS-005-EEEE-5555' AND a.status = 'active' LIMIT 1), NOW() - INTERVAL '3 minutes', 14, -37.1335, -72.5779, '{"speed": 0, "event": "engine_off"}'),
((SELECT a.id FROM alerts a JOIN devices d ON a.device_id = d.id WHERE d.dev_eui = 'GPS-005-EEEE-5555' AND a.status = 'active' LIMIT 1), NOW() - INTERVAL '1 minute', 12, -37.1336, -72.5780, '{"speed": 0, "event": "critical_alert"}');

-- ════════════════════════════════════════════════════════
-- VERIFICACIÓN (opcional)
-- ════════════════════════════════════════════════════════
-- SELECT 'users' as tabla, COUNT(*) FROM users
-- UNION ALL SELECT 'companies', COUNT(*) FROM companies
-- UNION ALL SELECT 'devices', COUNT(*) FROM devices
-- UNION ALL SELECT 'alerts', COUNT(*) FROM alerts;
--
-- Nota sobre contraseñas:
-- Este script crea los usuarios SIN contraseña en `accounts`.
-- Para asignarles password (login), correr en la máquina del
-- BACKEND (que tiene Node):
--     cd efesur_backend && node set_passwords_seeder.js
-- O ejecutar en la máquina de la DB:
--     INSERT INTO accounts (user_id, account_id, provider_id, password)
--     SELECT id, email, 'credential',
--            '$2b$10$...hash_bcrypt...'  -- hash generado con bcrypt
--     FROM users WHERE email = 'admin@wisensor.cl';
