import pool from '../config/database.js';
import { DEVICE_TYPES, ALERT_TYPES, ALERT_STATUSES } from '../config/constants.js';

export const getAllGpsDevices = (companyIds) => {
  const params = [DEVICE_TYPES.GPS];
  let companyFilter = '';
  if (companyIds && companyIds.length) {
    params.push(companyIds);
    companyFilter = ` AND d.company_id = ANY($${params.length}::int[])`;
  }
  return pool.query(`
    SELECT 
      d.id, d.dev_eui, d.name, d.type_device,
      d.latitude_current, d.longitude_current, d.last_seen, d.is_active,
      g.battery, g.accelerometers_status, g.operating_mode,
      c.name as company_name,
      g.catenaria_linea, g.catenaria_orden,
      snr.best_snr
    FROM devices d
    LEFT JOIN gps_device g ON d.id = g.id
    LEFT JOIN companies c ON d.company_id = c.id
    LEFT JOIN LATERAL (
      SELECT MAX((gw->>'snr')::numeric) as best_snr
      FROM (
        SELECT t.rxinfo FROM telemetry_data_all t
        WHERE t.device_id = d.id AND t.rxinfo IS NOT NULL AND jsonb_typeof(t.rxinfo) = 'array'
        ORDER BY t.ts DESC LIMIT 1
      ) lat,
      jsonb_array_elements(lat.rxinfo) gw
    ) snr ON true
    WHERE d.type_device = $1 AND d.is_active = true ${companyFilter}
    ORDER BY d.last_seen DESC
    LIMIT 1000
  `, params);
};

export const getCriticalAlerts = (companyIds) => {
  const params = [ALERT_TYPES.CRITICA];
  let companyFilter = '';
  if (companyIds && companyIds.length) {
    params.push(companyIds);
    companyFilter = ` AND d.company_id = ANY($${params.length}::int[])`;
  }
  return pool.query(`
    SELECT 
      a.id, a.device_id, a.type, a.status, a.metadata, a.created_at,
      d.name as device_name, d.latitude_current, d.longitude_current,
      u.name as resolved_by_name,
      COALESCE(
        (SELECT json_agg(json_build_object(
          'timestamp', ta.timestamp,
          'battery', ta.battery,
          'latitude', ta.latitude,
          'longitude', ta.longitude,
          'metadata', ta.metadata
        ))
        FROM (
          SELECT * FROM tracking_alerts ta2 
          WHERE ta2.alert_id = a.id 
          ORDER BY ta2.timestamp DESC 
        ) ta
      ), '[]') as tracking_data
    FROM alerts a
    JOIN devices d ON a.device_id = d.id
    LEFT JOIN users u ON a.user_id = u.id
    WHERE a.type = $1 AND a.status_system = 'active'${companyFilter}
    ORDER BY a.created_at DESC
    LIMIT 500
  `, params);
};

export const getAtencionAlerts = (companyIds) => {
  const params = [ALERT_TYPES.ATENCION, ALERT_STATUSES.ACTIVE];
  let companyFilter = '';
  if (companyIds && companyIds.length) {
    params.push(companyIds);
    companyFilter = ` AND d.company_id = ANY($${params.length}::int[])`;
  }
  return pool.query(`
    SELECT 
      a.id, a.device_id, a.type, a.status, a.metadata, a.created_at,
      d.name as device_name, d.latitude_current, d.longitude_current
    FROM alerts a
    JOIN devices d ON a.device_id = d.id
    WHERE a.type = $1 AND a.status = $2
      AND (a.status_system IS NULL OR a.status_system = 'active')
    AND (a.created_at AT TIME ZONE 'UTC') >= NOW() - INTERVAL '5 minutes'${companyFilter}
    ORDER BY a.created_at DESC
    LIMIT 500
  `, params);
};

export const getDisconexionGWAlerts = (companyIds) => {
  const params = ['desconexionGW'];
  let companyFilter = '';
  if (companyIds && companyIds.length) {
    params.push(companyIds);
    companyFilter = ` AND d.company_id = ANY($${params.length}::int[])`;
  }
  return pool.query(`
    SELECT 
      a.id, a.device_id, a.type, a.status, a.metadata, a.created_at,
      d.name as device_name
    FROM alerts a
    JOIN devices d ON a.device_id = d.id
    WHERE a.type = $1 AND a.status = 'active'${companyFilter}
    ORDER BY a.created_at DESC
    LIMIT 50
  `, params);
};

// Alertas de desconexión de lectores (CA 220V / batería gateway)
export const getLectorDisconexionAlerts = (companyIds, type) => {
  const params = [type];
  let companyFilter = '';
  if (companyIds && companyIds.length) {
    params.push(companyIds);
    companyFilter = ` AND d.company_id = ANY($${params.length}::int[])`;
  }
  return pool.query(`
    SELECT 
      a.id, a.device_id, a.type, a.status, a.metadata, a.created_at,
      d.name as device_name
    FROM alerts a
    JOIN devices d ON a.device_id = d.id
    WHERE a.type = $1 AND a.status = 'active'${companyFilter}
    ORDER BY a.created_at DESC
    LIMIT 50
  `, params);
};

export const getMovimientosAnomalosAlerts = (companyIds) => {
  const params = ['movimientos_anomalos'];
  let companyFilter = '';
  if (companyIds && companyIds.length) {
    params.push(companyIds);
    companyFilter = ` AND d.company_id = ANY($${params.length}::int[])`;
  }
  return pool.query(`
    SELECT 
      a.id, a.device_id, a.type, a.status, a.metadata, a.created_at,
      d.name as device_name, d.latitude_current, d.longitude_current
    FROM alerts a
    JOIN devices d ON a.device_id = d.id
    WHERE a.type = $1 AND a.status = 'active'
      AND (a.status_system IS NULL OR a.status_system = 'active')
      AND (a.created_at AT TIME ZONE 'UTC') >= NOW() - INTERVAL '15 minutes'${companyFilter}
    ORDER BY a.created_at DESC
    LIMIT 500
  `, params);
};

export const getAperturaAlerts = (companyIds) => {
  const params = ['apertura'];
  let companyFilter = '';
  if (companyIds && companyIds.length) {
    params.push(companyIds);
    companyFilter = ` AND d.company_id = ANY($${params.length}::int[])`;
  }
  return pool.query(`
    SELECT 
      a.id, a.device_id, a.type, a.status, a.metadata, a.created_at,
      d.name as device_name, d.latitude_current, d.longitude_current,
      (SELECT d2.id FROM devices d2 WHERE d2.id_device_father = d.id AND d2.type_device = 'Gateway' LIMIT 1) as gateway_id
    FROM alerts a
    JOIN devices d ON a.device_id = d.id
    WHERE a.type = $1
      AND (a.created_at AT TIME ZONE 'UTC') >= NOW() - INTERVAL '30 minutes'${companyFilter}
    ORDER BY a.created_at DESC
    LIMIT 500
  `, params);
};

export const getPresenciaAlerts = (companyIds) => {
  const params = ['presencia'];
  let companyFilter = '';
  if (companyIds && companyIds.length) {
    params.push(companyIds);
    companyFilter = ` AND d.company_id = ANY($${params.length}::int[])`;
  }
  return pool.query(`
    SELECT 
      a.id, a.device_id, a.type, a.status, a.metadata, a.created_at,
      d.name as device_name, d.latitude_current, d.longitude_current,
      (SELECT d2.id FROM devices d2 WHERE d2.id_device_father = d.id AND d2.type_device = 'Gateway' LIMIT 1) as gateway_id
    FROM alerts a
    JOIN devices d ON a.device_id = d.id
    WHERE a.type = $1
      AND (a.created_at AT TIME ZONE 'UTC') >= NOW() - INTERVAL '30 minutes'${companyFilter}
    ORDER BY a.created_at DESC
    LIMIT 500
  `, params);
};

export const resolveAlertById = (id, userId, reason) => pool.query(`
  UPDATE alerts 
  SET status_system = $1, user_id = $2, user_reason = $3, resolved_at = NOW()
  WHERE id = $4 AND type = $5
  RETURNING *
`, [ALERT_STATUSES.RESOLVED, userId, reason, id, ALERT_TYPES.CRITICA]);

export const getDevicesLocations = (companyIds) => {
  const params = [DEVICE_TYPES.GPS, ALERT_STATUSES.ACTIVE];
  let companyFilter = '';
  if (companyIds && companyIds.length) {
    params.push(companyIds);
    companyFilter = ` AND d.company_id = ANY($${params.length}::int[])`;
  }
  return pool.query(`
    SELECT 
      d.id, d.name, d.dev_eui, d.type_device,
      d.latitude_current, d.longitude_current, d.last_seen,
      g.battery, g.accelerometers_status,
      CASE WHEN a.id IS NOT NULL THEN true ELSE false END as has_alert,
      a.type as alert_type
    FROM devices d
    LEFT JOIN gps_device g ON d.id = g.id
    LEFT JOIN (
      SELECT DISTINCT ON (device_id) device_id, id, type, status 
      FROM alerts 
      WHERE (type = 'atencion' AND status = $2)
         OR (type = 'critica' AND status_system = 'active')
         OR (type = 'apertura' AND status = 'active')
         OR (type = 'presencia' AND status = 'active')
         OR (type = 'movimientos_anomalos' AND status = 'active')
      ORDER BY device_id, created_at DESC
    ) a ON d.id = a.device_id
    WHERE d.type_device = $1 AND d.is_active = true
      AND d.latitude_current IS NOT NULL AND d.longitude_current IS NOT NULL${companyFilter}
    ORDER BY d.last_seen DESC
    LIMIT 5000
  `, params);
};

/**
 * Obtiene el estado online/offline de todos los Gateways
 * Online: is_active = true y last_seen < 5 minutos
 * Offline: is_active = false o last_seen >= 5 minutos
 */
export const getGatewayStatus = (companyIds) => {
  const params = [DEVICE_TYPES.GATEWAY];
  let companyFilter = '';
  if (companyIds && companyIds.length) {
    params.push(companyIds);
    companyFilter = ` AND d.company_id = ANY($${params.length}::int[])`;
  }
  return pool.query(`
  SELECT 
    d.id,
    d.dev_eui,
    d.name,
    d.company_id,
    c.name as company_name,
    d.latitude_current,
    d.longitude_current,
    d.last_seen,
    d.is_active,
    gw.ip_internal,
    gw.firmware_version,
    CASE 
      WHEN d.is_active = true AND (
        d.last_seen IS NULL OR 
        (d.last_seen AT TIME ZONE 'UTC') >= NOW() - INTERVAL '5 minutes'
      ) THEN true 
      ELSE false 
    END as is_online
  FROM devices d
  LEFT JOIN gateway_device gw ON d.id = gw.id
  LEFT JOIN companies c ON d.company_id = c.id
  WHERE d.type_device = $1 ${companyFilter}
  ORDER BY d.name ASC
  LIMIT 50
`, params);
};

/**
 * Obtiene historial de alertas filtrado por tipo y rango de tiempo.
 * Independiente de las alertas activas en pantalla.
 * @param {string} type - 'critica' | 'atencion' | 'gateways'
 * @param {string} range - '1h' | '24h' | '7d' | '30d' | 'total'
 */
export const getAlertHistory = (type, range, companyIds) => {
  const intervals = { '1h': '1 hour', '24h': '24 hours', '7d': '7 days', '30d': '30 days' };
  const interval = intervals[range];
  const timeFilter = interval ? `AND (a.created_at AT TIME ZONE 'UTC') >= NOW() - INTERVAL '${interval}'` : '';

  if (type === 'gateways') {
    // Placeholder: cuando se implementen alertas de desconexión en la tabla 'alerts'
    return Promise.resolve({ rows: [] });
  }

  const params = [type];
  let companyFilter = '';
  if (companyIds && companyIds.length) {
    params.push(companyIds);
    companyFilter = ` AND d.company_id = ANY($${params.length}::int[])`;
  }

  return pool.query(`
    SELECT 
      a.id, a.device_id, a.type, a.status, a.metadata, a.created_at, a.resolved_at,
      d.name as device_name, d.dev_eui
    FROM alerts a
    JOIN devices d ON a.device_id = d.id
    WHERE a.type = $1 ${timeFilter}${companyFilter}
    ORDER BY a.created_at DESC
    LIMIT 1000
  `, params);
};

/**
 * Obtiene línea de tiempo unificada de todas las alertas para el panel derecho.
 * Todo desde la tabla alerts, sin inventar datos.
 * Orden: críticas activas → atención activa → resueltas (por fecha DESC)
 * @param {string} range - '1h' | '24h' | '7d' | '30d' | 'total'
 */
export const getAlertTimeline = async (range, companyIds) => {
  const intervals = { '1h': '1 hour', '24h': '24 hours', '7d': '7 days', '30d': '30 days' };
  const interval = intervals[range];
  const timeFilter = interval ? `AND (a.created_at AT TIME ZONE 'UTC') >= NOW() - INTERVAL '${interval}'` : '';

  const params = [];
  let companyFilter = '';
  if (companyIds && companyIds.length) {
    params.push(companyIds);
    companyFilter = ` AND d.company_id = ANY($${params.length}::int[])`;
  }

  const result = await pool.query(`
    SELECT 
      a.id, a.device_id, a.type, a.status, a.status_system, a.metadata, a.created_at, a.resolved_at, a.user_reason,
      d.name as device_name, d.dev_eui,
      CASE 
        WHEN a.type = 'critica' AND (a.status_system = 'active' OR a.status_system IS NULL) THEN 0
        ELSE 1
      END as priority,
      a.status as alert_status
    FROM alerts a
    JOIN devices d ON a.device_id = d.id
    WHERE (a.type IN ('critica','apertura','presencia','atencion','movimientos_anomalos','desconexionGW','desconexionGPS','desconexion220','desconexionbatGW'))
      ${timeFilter}${companyFilter}
    ORDER BY priority ASC, a.created_at DESC
    LIMIT 500
  `, params);

  return { rows: result.rows };
};