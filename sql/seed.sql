-- =====================================================
-- EFE Project - Seed Data
-- Run AFTER schema.sql
-- =====================================================

-- Companies
INSERT INTO companies (name, rut, sector, color_theme, is_active) VALUES
('Transporte Norte S.A.', '76.123.456-7', 'Logística', '#007bff', true),
('Minerales del Sur SpA', '76.987.654-3', 'Minería', '#28a745', true),
('Energía Verde Ltda.', '76.555.444-1', 'Energía Renovable', '#ffc107', true);

-- Users
INSERT INTO users (email, email_verified, name, is_superuser) VALUES
('admin@efe.cl', true, 'Administrador Sistema', true),
('juan.perez@transportenorte.cl', true, 'Juan Pérez', false),
('maria.lopez@mineralesdelsur.cl', true, 'María López', false),
('carlos.rodriguez@energiaverde.cl', true, 'Carlos Rodríguez', false),
('operador1@transportenorte.cl', true, 'Roberto Sánchez', false);

-- Company-User assignments (usando subqueries para obtener los UUIDs reales)
INSERT INTO companies_users (company_id, user_id, role) VALUES
(1, (SELECT id FROM users WHERE email = 'admin@efe.cl'), 'admin'),
(1, (SELECT id FROM users WHERE email = 'juan.perez@transportenorte.cl'), 'admin'),
(1, (SELECT id FROM users WHERE email = 'operador1@transportenorte.cl'), 'operator'),
(2, (SELECT id FROM users WHERE email = 'admin@efe.cl'), 'admin'),
(2, (SELECT id FROM users WHERE email = 'maria.lopez@mineralesdelsur.cl'), 'admin'),
(3, (SELECT id FROM users WHERE email = 'admin@efe.cl'), 'admin'),
(3, (SELECT id FROM users WHERE email = 'carlos.rodriguez@energiaverde.cl'), 'admin');

-- Company Config
INSERT INTO company_config (company_id, url, color) VALUES
(1, 'https://transportenorte.cl', '#007bff'),
(2, 'https://mineralesdelsur.cl', '#28a745'),
(3, 'https://energiaverde.cl', '#ffc107');

-- Devices (GPS trackers)
INSERT INTO devices (dev_eui, name, company_id, type_device, is_active, latitude_current, longitude_current, last_seen) VALUES
('GPS-001-AAAA-1111', 'Camión LA-1234', 1, 'Gps', true, -33.4489, -70.6693, NOW()),
('GPS-002-BBBB-2222', 'Camión LA-2345', 1, 'Gps', true, -33.4589, -70.6593, NOW()),
('GPS-003-CCCC-3333', 'Camión LA-3456', 1, 'Gps', true, -33.4389, -70.6793, NOW()),
('GPS-004-DDDD-4444', 'Camión LA-4567', 2, 'Gps', true, -37.1234, -72.5678, NOW()),
('GPS-005-EEEE-5555', 'Camión LA-5678', 2, 'Gps', true, -37.1334, -72.5778, NOW()),
('GPS-006-FFFF-6666', 'Bus LA-6789', 1, 'Gps', true, -33.4500, -70.6650, NOW()),
('GPS-007-GGGG-7777', 'CamiónMinerales-001', 2, 'Gps', true, -37.1500, -72.5900, NOW()),
('GPS-008-HHHH-8888', 'Panel Solar-001', 3, 'Gps', true, -33.4600, -70.6800, NOW());

-- GPS Device specific data
INSERT INTO gps_device (id, accelerometers_status, battery, operating_mode) VALUES
(1, 'normal', 85, 'normal'),
(2, 'normal', 92, 'normal'),
(3, 'alert', 45, 'normal'),
(4, 'normal', 78, 'normal'),
(5, 'critical', 15, 'normal'),
(6, 'normal', 100, 'normal'),
(7, 'alert', 35, 'normal'),
(8, 'normal', 95, 'normal');

-- Gateway devices (12 gateways - antenas que reciben datos de sensores)
INSERT INTO devices (dev_eui, name, company_id, type_device, is_active, latitude_current, longitude_current, last_seen) VALUES
('GW-001-AAAA-1111', 'Gateway Central Norte', 1, 'Gateway', true, -33.4490, -70.6695, NOW() - INTERVAL '1 minute'),
('GW-002-BBBB-2222', 'Gateway Mina Sur', 2, 'Gateway', true, -37.1240, -72.5680, NOW() - INTERVAL '30 seconds'),
('GW-003-CCCC-3333', 'Gateway Ruta 5 Norte', 1, 'Gateway', true, -32.9500, -71.3000, NOW() - INTERVAL '2 minutes'),
('GW-004-DDDD-4444', 'Gateway Ruta 5 Sur', 1, 'Gateway', true, -35.5000, -71.6000, NOW() - INTERVAL '3 minutes'),
('GW-005-EEEE-5555', 'Gateway Cordillera', 2, 'Gateway', true, -36.8000, -73.0500, NOW() - INTERVAL '1 minute'),
('GW-006-FFFF-6666', 'Gateway Costa Central', 1, 'Gateway', true, -33.0000, -71.5500, NOW() - INTERVAL '4 minutes'),
('GW-007-GGGG-7777', 'Gateway Valle Central', 3, 'Gateway', true, -34.5000, -70.8000, NOW() - INTERVAL '30 seconds'),
('GW-008-HHHH-8888', 'Gateway Zona Austral', 2, 'Gateway', true, -39.8000, -73.2500, NOW() - INTERVAL '5 minutes'),
('GW-009-IIII-9999', 'Gateway Puerto Norte', 1, 'Gateway', true, -32.7500, -71.4000, NOW() - INTERVAL '1 minute'),
('GW-010-JJJJ-0000', 'Gateway Desierto Sur', 2, 'Gateway', true, -38.7000, -72.5000, NOW() - INTERVAL '2 minutes'),
('GW-011-KKKK-1111', 'Gateway Lago Sur', 1, 'Gateway', false, -40.5000, -72.8000, NOW() - INTERVAL '2 hours'),
('GW-012-LLLL-2222', 'Gateway Frontera Norte', 3, 'Gateway', false, -18.5000, -69.8000, NOW() - INTERVAL '1 day');

INSERT INTO gateway_device (id, ip_internal, firmware_version) VALUES
(9, '192.168.1.101', 'v2.3.1'),
(10, '192.168.2.101', 'v2.3.0'),
(15, '192.168.3.101', 'v2.4.0'),
(16, '192.168.4.101', 'v2.4.0'),
(17, '192.168.5.101', 'v2.3.2'),
(18, '192.168.6.101', 'v2.4.1'),
(19, '192.168.7.101', 'v2.3.1'),
(20, '192.168.8.101', 'v2.4.0'),
(21, '192.168.9.101', 'v2.4.1'),
(22, '192.168.10.101', 'v2.3.2'),
(23, '192.168.11.101', 'v2.3.0'),
(24, '192.168.12.101', 'v2.4.0');

-- Sub Estacion devices
INSERT INTO devices (dev_eui, name, company_id, type_device, is_active, latitude_current, longitude_current) VALUES
('SE-001-AAAA-1111', 'SubEstación Norte-01', 1, 'SubEstacion', true, -33.4500, -70.6700),
('SE-002-BBBB-2222', 'SubEstación Sur-01', 2, 'SubEstacion', true, -37.1300, -72.5750);

INSERT INTO sub_estacion_device (id, input_1_status, alert) VALUES
(11, 'closed', false),
(12, 'open', true);

-- Lector devices
INSERT INTO devices (dev_eui, name, company_id, type_device, is_active) VALUES
('LEC-001-AAAA-1111', 'Lector Norte-01', 1, 'Lector', true),
('LEC-002-BBBB-2222', 'Lector Sur-01', 2, 'Lector', true);

INSERT INTO lector_device (id, last_date_reader, battery_reader) VALUES
(13, '2026-04-30 21:00:00', 80),
(14, '2026-04-30 22:30:00', 95);

-- Telemetry data samples
INSERT INTO telemetry_data_all (device_id, ts, object, rxinfo) VALUES
(1, NOW() - INTERVAL '5 minutes', '{"temperature": 25, "speed": 65, "fuel": 75}', '{"gw": "GW-001", "rssi": -45}'),
(1, NOW() - INTERVAL '10 minutes', '{"temperature": 26, "speed": 60, "fuel": 74}', '{"gw": "GW-001", "rssi": -48}'),
(2, NOW() - INTERVAL '5 minutes', '{"temperature": 23, "speed": 80, "fuel": 60}', '{"gw": "GW-001", "rssi": -50}'),
(3, NOW() - INTERVAL '3 minutes', '{"temperature": 35, "speed": 0, "fuel": 20}', '{"gw": "GW-001", "rssi": -55}'),
(4, NOW() - INTERVAL '5 minutes', '{"temperature": 28, "speed": 45, "fuel": 55}', '{"gw": "GW-002", "rssi": -42}'),
(5, NOW() - INTERVAL '1 minute', '{"temperature": 38, "speed": 0, "fuel": 5}', '{"gw": "GW-002", "rssi": -60}'),
(6, NOW() - INTERVAL '2 minutes', '{"temperature": 22, "speed": 55, "fuel": 90}', '{"gw": "GW-001", "rssi": -47}'),
(7, NOW() - INTERVAL '4 minutes', '{"temperature": 32, "speed": 30, "fuel": 25}', '{"gw": "GW-002", "rssi": -52}'),
(8, NOW() - INTERVAL '1 minute', '{"solar_output": 450, "battery_voltage": 48, "efficiency": 92}', '{"gw": "GW-002", "rssi": -40}'),
(4, NOW() - INTERVAL '10 minutes', '{"temperature": 27, "speed": 50, "fuel": 54}', '{"gw": "GW-002", "rssi": -44}'),
(7, NOW() - INTERVAL '8 minutes', '{"temperature": 30, "speed": 35, "fuel": 23}', '{"gw": "GW-002", "rssi": -51}'),
(1, NOW() - INTERVAL '15 minutes', '{"temperature": 24, "speed": 70, "fuel": 73}', '{"gw": "GW-001", "rssi": -46}');

-- Active Alerts (CRITICAL)
INSERT INTO alerts (device_id, type, status, metadata, created_at) VALUES
(3, 'critica', 'active', '{"reason": "Batería baja crítica", "threshold": 20}', NOW() - INTERVAL '10 minutes'),
(5, 'critica', 'active', '{"reason": "Combustible crítico", "threshold": 10}', NOW() - INTERVAL '5 minutes');

-- Active Alerts (ATENCION - within 30 minutes window)
INSERT INTO alerts (device_id, type, status, metadata, created_at) VALUES
(7, 'atencion', 'active', '{"reason": "Temperatura elevada", "threshold": 30}', NOW() - INTERVAL '20 minutes'),
(8, 'atencion', 'active', '{"reason": "Eficiencia reducida", "threshold": 90}', NOW() - INTERVAL '15 minutes');

-- Old atencion alert (outside 30 minute window - should not appear in dashboard)
INSERT INTO alerts (device_id, type, status, metadata, created_at) VALUES
(2, 'atencion', 'active', '{"reason": "Revisión pendiente", "threshold": 0}', NOW() - INTERVAL '45 minutes');

-- Tracking data for critical alerts
INSERT INTO tracking_alerts (alert_id, timestamp, battery, latitude, longitude, metadata) VALUES
(1, NOW() - INTERVAL '10 minutes', 45, -33.4389, -70.6793, '{"speed": 0, "event": "stopped"}'),
(1, NOW() - INTERVAL '8 minutes', 43, -33.4390, -70.6792, '{"speed": 0, "event": "stopped"}'),
(1, NOW() - INTERVAL '5 minutes', 40, -33.4391, -70.6791, '{"speed": 0, "event": "alarm_triggered"}'),
(2, NOW() - INTERVAL '5 minutes', 15, -37.1334, -72.5778, '{"speed": 0, "event": "fuel_empty"}'),
(2, NOW() - INTERVAL '3 minutes', 14, -37.1335, -72.5779, '{"speed": 0, "event": "engine_off"}'),
(2, NOW() - INTERVAL '1 minute', 12, -37.1336, -72.5780, '{"speed": 0, "event": "critical_alert"}');

-- Resolved alert example (referencing admin user by email)
INSERT INTO alerts (device_id, type, status, user_id, user_reason, metadata, created_at, resolved_at) VALUES
(1, 'critica', 'resolved', (SELECT id FROM users WHERE email = 'admin@efe.cl'), 'Vehículo en mantenimiento', '{"reason": "Batería baja", "threshold": 20}', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour');