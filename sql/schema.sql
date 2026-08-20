-- =====================================================
-- EFE Project Database Schema
-- PostgreSQL
-- Based on: Eddiagrama_db_project.txt
-- =====================================================

-- ─────────────────────────────────────────────
-- 1. BETTER AUTH (Capa de Autenticación)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE,
    email_verified BOOLEAN DEFAULT false,
    name VARCHAR(255),
    image TEXT,
    role VARCHAR(20) DEFAULT 'visualizador',
    phone_call VARCHAR(45),
    phone_whatsapp VARCHAR(45),
    is_active BOOLEAN NOT NULL DEFAULT true,
    notify_calls BOOLEAN NOT NULL DEFAULT false,
    notify_whatsapp BOOLEAN NOT NULL DEFAULT false,
    notify_email BOOLEAN NOT NULL DEFAULT false,
    notify_email_address VARCHAR(255),
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

-- ─────────────────────────────────────────────
-- 2. LÓGICA DE NEGOCIO Y ROLES (Multi-tenant)
-- ─────────────────────────────────────────────

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

-- ─────────────────────────────────────────────
-- 3. ECOSISTEMA IoT (Dispositivos)
-- ─────────────────────────────────────────────

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

-- ─────────────────────────────────────────────
-- 4. SISTEMA DE ALERTAS Y TRACKING
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS alerts (
    id SERIAL PRIMARY KEY,
    device_id INTEGER REFERENCES devices(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('atencion', 'critica', 'desconexionGW', 'desconexionGPS', 'desconexion220', 'desconexionbatGW', 'movimientos_anomalos', 'apertura', 'presencia')),
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

-- ─────────────────────────────────────────────
-- 5. ÍNDICES ADICIONALES PARA RENDIMIENTO
--    (Optimización multi-tenant y dashboard)
-- ─────────────────────────────────────────────

-- Acelera la consulta del middleware auth.js (companies del usuario)
CREATE INDEX IF NOT EXISTS idx_companies_users_user_active
  ON companies_users(user_id, is_active);

-- Acelera el filtro por compañía en todas las queries del dashboard/telemetry
CREATE INDEX IF NOT EXISTS idx_devices_company_active
  ON devices(company_id, is_active);

-- Acelera getAllGpsDevices() y getGatewayStatus() (filtran por type_device + company)
CREATE INDEX IF NOT EXISTS idx_devices_type_company_active
  ON devices(type_device, company_id, is_active);

-- Acelera getDevicesLocations() (filtra por coordenadas no nulas)
CREATE INDEX IF NOT EXISTS idx_devices_coords_active
  ON devices(latitude_current, longitude_current)
  WHERE is_active = true AND latitude_current IS NOT NULL;

-- Acelera getCriticalAlerts() (filtra por type + status_system = 'active')
CREATE INDEX IF NOT EXISTS idx_alerts_type_status_system
  ON alerts(type, status_system)
  WHERE status_system = 'active';

-- Acelera getAtencionAlerts() y getDisconexionGWAlerts() (status = 'active')
CREATE INDEX IF NOT EXISTS idx_alerts_type_status_active
  ON alerts(type, status)
  WHERE status = 'active';

-- Acelera la subquery LATERAL dentro de getCriticalAlerts() (tracking por alert_id)
CREATE INDEX IF NOT EXISTS idx_tracking_alert_timestamp
  ON tracking_alerts(alert_id, timestamp DESC);

-- ═════════════════════════════════════════
-- ═════════════════════════════════════════
-- 6. AUDITORÍA DEL SISTEMA
-- ═════════════════════════════════════════
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