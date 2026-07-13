import pool from '../config/database.js';

// ─── Resumen: totales, cobertura, alertas ──
export const getMonitorSummaryService = async (companyIds) => {
  let filter = '';
  const p = [];
  if (companyIds?.length) { p.push(companyIds); filter = ` AND d.company_id = ANY($${p.length}::int[])`; }

  const total = await pool.query(`SELECT COUNT(*) as total FROM devices d WHERE d.is_active = true${filter}`, p);
  const totalSensores = parseInt(total.rows[0].total);

  const cobertura = await pool.query(`
    SELECT COUNT(DISTINCT t.device_id) as activos FROM telemetry_data_all t
    JOIN devices d ON t.device_id = d.id
    WHERE d.is_active = true AND t.ts >= CURRENT_DATE${filter}
  `, p);
  const activosHoy = parseInt(cobertura.rows[0].activos);

  const alertas = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE a.type = 'critica' AND a.status = 'active' AND DATE(a.created_at) = CURRENT_DATE) as criticas,
      COUNT(*) FILTER (WHERE a.type = 'atencion' AND a.status = 'active' AND DATE(a.created_at) = CURRENT_DATE) as atencion,
      COUNT(*) FILTER (WHERE a.type = 'movimientos_anomalos' AND a.status = 'active' AND DATE(a.created_at) = CURRENT_DATE) as movimientos,
      COUNT(*) FILTER (WHERE a.type IN ('desconexionGW','desconexionGPS') AND a.status = 'active') as desconexion
    FROM alerts a JOIN devices d ON a.device_id = d.id WHERE 1=1${filter}
  `, p);
  const r = alertas.rows[0];

  return {
    totalSensores,
    cobertura: totalSensores > 0 ? Math.round((activosHoy / totalSensores) * 100) : 0,
    activosHoy,
    criticas: parseInt(r.criticas), atencion: parseInt(r.atencion),
    movimientos: parseInt(r.movimientos), desconexion: parseInt(r.desconexion),
  };
};

// ─── Sensores activos por día (30 días) ──
export const getMonitorActiveSensorsService = async (companyIds) => {
  let filter = ''; const p = [];
  if (companyIds?.length) { p.push(companyIds); filter = ` AND d.company_id = ANY($${p.length}::int[])`; }
  const r = await pool.query(`
    SELECT DATE(t.ts) as dia, COUNT(DISTINCT t.device_id) as activos
    FROM telemetry_data_all t JOIN devices d ON t.device_id = d.id
    WHERE d.is_active = true AND t.ts >= CURRENT_DATE - INTERVAL '30 days'${filter}
    GROUP BY DATE(t.ts) ORDER BY dia ASC
  `, p);
  return r.rows;
};

// ─── Alertas por día (30 días) ──
export const getMonitorAlertsPerDayService = async (companyIds) => {
  let filter = ''; const p = [];
  if (companyIds?.length) { p.push(companyIds); filter = ` AND d.company_id = ANY($${p.length}::int[])`; }
  const r = await pool.query(`
    SELECT DATE(a.created_at) as dia,
      COUNT(*) FILTER (WHERE a.type = 'critica') as criticas,
      COUNT(*) FILTER (WHERE a.type = 'atencion') as atencion,
      COUNT(*) FILTER (WHERE a.type = 'movimientos_anomalos') as movimientos
    FROM alerts a JOIN devices d ON a.device_id = d.id
    WHERE a.created_at >= CURRENT_DATE - INTERVAL '30 days'${filter}
    GROUP BY DATE(a.created_at) ORDER BY dia ASC
  `, p);
  return r.rows;
};

// ─── Calendario de eventos ──
export const getMonitorCalendarService = async (companyIds, year, month) => {
  let filter = ''; const p = [`${year}-${String(month).padStart(2, '0')}-01`];
  if (companyIds?.length) { p.push(companyIds); filter = ` AND d.company_id = ANY($${p.length}::int[])`; }
  const r = await pool.query(`
    SELECT EXTRACT(DAY FROM a.created_at) as dia, COUNT(*) as total,
      COUNT(*) FILTER (WHERE a.type = 'critica') as criticas,
      COUNT(*) FILTER (WHERE a.type = 'atencion') as atencion,
      COUNT(*) FILTER (WHERE a.type = 'movimientos_anomalos') as movimientos,
      COUNT(*) FILTER (WHERE a.type IN ('desconexionGW','desconexionGPS')) as desconexion
    FROM alerts a JOIN devices d ON a.device_id = d.id
    WHERE a.created_at >= $1::date AND a.created_at < $1::date + INTERVAL '1 month'${filter}
    GROUP BY EXTRACT(DAY FROM a.created_at) ORDER BY dia ASC
  `, p);
  return r.rows;
};

// ─── Alertas por fecha ──
export const getMonitorAlertsByDateService = async (companyIds, date) => {
  let filter = ''; const p = [date];
  if (companyIds?.length) { p.push(companyIds); filter = ` AND d.company_id = ANY($${p.length}::int[])`; }
  const r = await pool.query(`
    SELECT a.id, a.type, a.status, a.metadata, a.created_at, d.name as device_name, d.type_device
    FROM alerts a JOIN devices d ON a.device_id = d.id
    WHERE DATE(a.created_at) = $1${filter} ORDER BY a.created_at DESC
  `, p);
  return r.rows;
};

// ─── Trackeo de alerta ──
export const getMonitorAlertTrackingService = async (alertId) => {
  const r = await pool.query(`
    SELECT timestamp, battery, latitude, longitude, metadata
    FROM tracking_alerts WHERE alert_id = $1 ORDER BY timestamp ASC
  `, [alertId]);
  return r.rows;
};

// ─── Últimos datos entrantes ──
export const getMonitorLatestTelemetryService = async (limit = 30, companyIds) => {
  let filter = ''; const p = [limit];
  if (companyIds?.length) { p.push(companyIds); filter = ` AND d.company_id = ANY($${p.length}::int[])`; }
  const r = await pool.query(`
    SELECT t.id, t.ts, t.object, t.rxinfo, t.device_id,
      d.name as device_name, d.type_device, d.dev_eui
    FROM telemetry_data_all t
    JOIN devices d ON t.device_id = d.id
    WHERE d.is_active = true${filter}
    ORDER BY t.ts DESC LIMIT $1
  `, p);
  return r.rows;
};

// ─── Dispositivos GPS activos ──
export const getMonitorDevicesService = async (companyIds) => {
  let filter = ''; const p = [];
  if (companyIds?.length) { p.push(companyIds); filter = ` AND company_id = ANY($${p.length}::int[])`; }
  const r = await pool.query(`
    SELECT d.id, d.dev_eui, d.name, d.type_device, d.is_active, d.last_seen,
      d.latitude_current, d.longitude_current,
      (SELECT COALESCE(t.object->>'voltage_mV', t.object->'systemStatus'->>'operatingMode')::text
       FROM telemetry_data_all t WHERE t.device_id = d.id AND t.object IS NOT NULL
       ORDER BY t.ts DESC LIMIT 1) as last_value
    FROM devices d WHERE d.is_active = true${filter} ORDER BY d.name ASC
  `, p);
  return r.rows;
};

// ─── Telemetría de un dispositivo ──
export const getMonitorDeviceTelemetryService = async (deviceId, { from, limit = 200, offset = 0 }) => {
  const params = [deviceId, limit, offset];
  let fromFilter = '';
  let countParams = [deviceId];
  if (from) { fromFilter = ` AND ts >= $4`; params.push(from); countParams.push(from); }

  const telemetry = await pool.query(`
    SELECT id, ts, object, rxinfo
    FROM telemetry_data_all
    WHERE device_id = $1${fromFilter}
    ORDER BY ts DESC LIMIT $2 OFFSET $3
  `, params);

  const count = await pool.query(`
    SELECT COUNT(*) as total FROM telemetry_data_all WHERE device_id = $1${from ? ' AND ts >= $2' : ''}
  `, countParams);

  return { telemetry: telemetry.rows, total: parseInt(count.rows[0].total) };
};

// ─── Alertas de un dispositivo ──
export const getMonitorDeviceAlertsService = async (deviceId) => {
  const r = await pool.query(`
    SELECT a.id, a.type, a.status, a.metadata, a.created_at,
           d.name as device_name
    FROM alerts a JOIN devices d ON a.device_id = d.id
    WHERE a.device_id = $1 AND a.status = 'active'
    ORDER BY a.created_at DESC
  `, [deviceId]);
  return r.rows;
};

// ─── Posiciones de gateways ──
export const getMonitorGatewayPositionsService = async () => {
  const r = await pool.query(`
    SELECT d.id, d.dev_eui, d.name, d.latitude_current, d.longitude_current
    FROM devices d WHERE d.type_device = 'Gateway' AND d.is_active = true
      AND d.latitude_current IS NOT NULL AND d.longitude_current IS NOT NULL
  `);
  return r.rows;
};
