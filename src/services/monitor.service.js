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
      COUNT(*) FILTER (WHERE a.type = 'critica' AND (a.status_system = 'active' OR a.status_system IS NULL) AND DATE(a.created_at) = CURRENT_DATE) as criticas,
      COUNT(*) FILTER (WHERE a.type = 'atencion' AND DATE(a.created_at) = CURRENT_DATE) as atencion,
      COUNT(*) FILTER (WHERE a.type = 'apertura' AND DATE(a.created_at) = CURRENT_DATE) as apertura,
      COUNT(*) FILTER (WHERE a.type = 'presencia' AND DATE(a.created_at) = CURRENT_DATE) as presencia,
      COUNT(*) FILTER (WHERE a.type = 'movimientos_anomalos' AND DATE(a.created_at) = CURRENT_DATE) as movimientos,
      COUNT(*) FILTER (WHERE a.type IN ('desconexionGW','desconexionGPS','desconexion220','desconexionbatGW') AND a.status = 'active') as desconexion
    FROM alerts a JOIN devices d ON a.device_id = d.id WHERE 1=1${filter}
  `, p);
  const r = alertas.rows[0];

  return {
    totalSensores,
    cobertura: totalSensores > 0 ? Math.round((activosHoy / totalSensores) * 100) : 0,
    activosHoy,
    criticas: parseInt(r.criticas), atencion: parseInt(r.atencion),
    apertura: parseInt(r.apertura), presencia: parseInt(r.presencia),
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
      COUNT(*) FILTER (WHERE a.type = 'apertura') as apertura,
      COUNT(*) FILTER (WHERE a.type = 'presencia') as presencia,
      COUNT(*) FILTER (WHERE a.type = 'movimientos_anomalos') as movimientos,
      COUNT(*) FILTER (WHERE a.type IN ('desconexionGW','desconexionGPS','desconexion220','desconexionbatGW')) as desconexion
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
      COUNT(*) FILTER (WHERE a.type = 'apertura') as apertura,
      COUNT(*) FILTER (WHERE a.type = 'presencia') as presencia,
      COUNT(*) FILTER (WHERE a.type = 'movimientos_anomalos') as movimientos,
      COUNT(*) FILTER (WHERE a.type IN ('desconexionGW','desconexionGPS','desconexion220','desconexionbatGW')) as desconexion
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
export const getMonitorAlertTrackingService = async (alertId, companyIds) => {
  const params = [alertId];
  let companyFilter = '';
  if (companyIds?.length) {
    params.push(companyIds);
    companyFilter = ` AND d.company_id = ANY($${params.length}::int[])`;
  }
  const r = await pool.query(`
    SELECT ta.timestamp, ta.battery, ta.latitude, ta.longitude, ta.metadata
    FROM tracking_alerts ta
    JOIN alerts a ON ta.alert_id = a.id
    JOIN devices d ON a.device_id = d.id
    WHERE ta.alert_id = $1${companyFilter}
    ORDER BY ta.timestamp ASC
  `, params);
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
      d.latitude_current, d.longitude_current, d.id_device_father,
      COALESCE(
        (SELECT COALESCE(
           t.object->>'operatingMode',
           t.object->'systemStatus'->>'operatingMode'
         )
         FROM telemetry_data_all t
         WHERE t.device_id = d.id
           AND t.object IS NOT NULL
           AND (t.object->>'operatingMode' IS NOT NULL
             OR t.object->'systemStatus'->>'operatingMode' IS NOT NULL)
         ORDER BY t.ts DESC LIMIT 1),
        gps.operating_mode,
        'sin datos'
      ) as operating_mode,
      (SELECT t.object->>'voltage_mV'::text
       FROM telemetry_data_all t WHERE t.device_id = d.id AND t.object IS NOT NULL
       ORDER BY t.ts DESC LIMIT 1) as last_value
    FROM devices d
    LEFT JOIN gps_device gps ON d.id = gps.id
    WHERE 1=1${filter} ORDER BY d.name ASC
  `, p);
  return r.rows;
};

// ─── Telemetría de un dispositivo ──
export const getMonitorDeviceTelemetryService = async (deviceId, { from, to, limit = 200, offset = 0 }) => {
  const params = [deviceId];
  const countParams = [deviceId];
  let filter = '';
  let idx = 2;
  if (from) { filter += ` AND ts >= $${idx}`; params.push(from); countParams.push(from); idx++; }
  if (to) { filter += ` AND ts <= $${idx}`; params.push(to); countParams.push(to); idx++; }
  params.push(limit, offset);

  const telemetry = await pool.query(`
    SELECT id, ts, object, rxinfo
    FROM telemetry_data_all
    WHERE device_id = $1${filter}
    ORDER BY ts DESC LIMIT $${idx} OFFSET $${idx + 1}
  `, params);

  const count = await pool.query(`
    SELECT COUNT(*) as total FROM telemetry_data_all WHERE device_id = $1${filter}
  `, countParams);

  return { telemetry: telemetry.rows, total: parseInt(count.rows[0].total) };
};

// ─── Alertas de un dispositivo ──
export const getMonitorDeviceAlertsService = async (deviceId, companyIds) => {
  const params = [deviceId];
  let companyFilter = '';
  if (companyIds?.length) { params.push(companyIds); companyFilter = ` AND d.company_id = ANY($${params.length}::int[])`; }
  const r = await pool.query(`
    SELECT a.id, a.type, a.status, a.metadata, a.created_at, a.resolved_at,
           d.name as device_name
    FROM alerts a JOIN devices d ON a.device_id = d.id
    WHERE a.device_id = $1${companyFilter}
    ORDER BY a.created_at DESC
  `, params);
  return r.rows;
};

// ─── Reporte detallado ──
export const getMonitorReportService = async (deviceIds, from, to) => {
  const params = [deviceIds];
  let filter = ` AND t.device_id = ANY($1::int[])`;
  let idx = 2;
  if (from) { filter += ` AND t.ts >= $${idx}`; params.push(from); idx++; }
  if (to) { filter += ` AND t.ts <= $${idx}`; params.push(to); idx++; }

  const telemetry = await pool.query(`
    SELECT t.id, t.ts, t.object, t.rxinfo, t.device_id,
           d.name as device_name, d.type_device, d.dev_eui
    FROM telemetry_data_all t
    JOIN devices d ON t.device_id = d.id
    WHERE 1=1${filter}
    ORDER BY t.device_id, t.ts ASC
  `, params);

  // Alertas del período para esos dispositivos
  const alerts = await pool.query(`
    SELECT a.id, a.type, a.status, a.metadata, a.created_at, a.resolved_at, a.device_id,
           d.name as device_name, d.type_device
    FROM alerts a JOIN devices d ON a.device_id = d.id
    WHERE a.device_id = ANY($1::int[])${from ? ` AND a.created_at >= $2` : ''}${to ? ` AND a.created_at <= $3` : ''}
    ORDER BY a.created_at DESC
  `, from && to ? [deviceIds, from, to] : from ? [deviceIds, from] : to ? [deviceIds, to] : [deviceIds]);

  return { telemetry: telemetry.rows, alerts: alerts.rows, total: telemetry.rows.length };
};

// ─── Posiciones de gateways ──
export const getMonitorGatewayPositionsService = async (companyIds) => {
  const params = [];
  let companyFilter = '';
  if (companyIds?.length) {
    params.push(companyIds);
    companyFilter = ` AND d.company_id = ANY($${params.length}::int[])`;
  }
  const r = await pool.query(`
    SELECT d.id, d.dev_eui, d.name, d.latitude_current, d.longitude_current
    FROM devices d WHERE d.type_device = 'Gateway' AND d.is_active = true
      AND d.latitude_current IS NOT NULL AND d.longitude_current IS NOT NULL${companyFilter}
  `, params);
  return r.rows;
};

// ─── Reporte Salud de Baterías ──
export const getMonitorReportBatteryService = async (deviceIds, from, to) => {
  const params = [deviceIds];
  let filter = ` AND t.device_id = ANY($1::int[])`;
  let idx = 2;
  if (from) { filter += ` AND t.ts >= $${idx}`; params.push(from); idx++; }
  if (to) { filter += ` AND t.ts <= $${idx}`; params.push(to); idx++; }

  const telemetry = await pool.query(`
    SELECT t.device_id, t.ts, t.object,
           d.name as device_name, d.type_device, d.dev_eui
    FROM telemetry_data_all t
    JOIN devices d ON t.device_id = d.id
    WHERE 1=1${filter} AND t.object->>'voltage_mV' IS NOT NULL
    ORDER BY t.device_id, t.ts ASC
  `, params);

  const devices = await pool.query(`
    SELECT d.id, d.name, d.type_device, d.dev_eui, d.last_seen,
           gps.battery as gps_battery, gw.battery as gw_battery, lc.battery_reader as lector_battery
    FROM devices d
    LEFT JOIN gps_device gps ON d.id = gps.id
    LEFT JOIN gateway_device gw ON d.id = gw.id
    LEFT JOIN lector_device lc ON d.id = lc.id
    WHERE d.id = ANY($1::int[])
  `, [deviceIds]);

  return { telemetry: telemetry.rows, devices: devices.rows, total: telemetry.rows.length };
};

// ─── Reporte Conectividad ──
export const getMonitorReportConnectivityService = async (deviceIds, from, to, companyIds) => {
  const params = [deviceIds];
  let filter = ` AND t.device_id = ANY($1::int[])`;
  let idx = 2;
  if (from) { filter += ` AND t.ts >= $${idx}`; params.push(from); idx++; }
  if (to) { filter += ` AND t.ts <= $${idx}`; params.push(to); idx++; }

  const telemetry = await pool.query(`
    SELECT t.device_id, t.ts, t.rxinfo,
           d.name as device_name, d.type_device, d.dev_eui
    FROM telemetry_data_all t
    JOIN devices d ON t.device_id = d.id
    WHERE 1=1${filter} AND t.rxinfo IS NOT NULL
    ORDER BY t.device_id, t.ts ASC
  `, params);

  const gwParams = [];
  let gwFilter = '';
  if (companyIds?.length) {
    gwParams.push(companyIds);
    gwFilter = ` AND d.company_id = ANY($${gwParams.length}::int[])`;
  }
  const gateways = await pool.query(`
    SELECT d.id, d.dev_eui, d.name, d.latitude_current, d.longitude_current,
           gw.ip_internal, gw.firmware_version
    FROM devices d
    LEFT JOIN gateway_device gw ON d.id = gw.id
    WHERE d.type_device = 'Gateway' AND d.is_active = true${gwFilter}
  `, gwParams);

  return { telemetry: telemetry.rows, gateways: gateways.rows, total: telemetry.rows.length };
};

// ─── Reporte Ejecutivo ──
export const getMonitorReportExecutiveService = async (companyIds) => {
  let filter = '';
  const p = [];
  if (companyIds?.length) { p.push(companyIds); filter = ` AND d.company_id = ANY($${p.length}::int[])`; }

  const [totalDev, activeToday, alertCounts, topAlertDevices, gwStatus] = await Promise.all([
    pool.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = true) as activos FROM devices d WHERE 1=1${filter}`, p),
    pool.query(`SELECT COUNT(DISTINCT t.device_id) as activos FROM telemetry_data_all t JOIN devices d ON t.device_id = d.id WHERE t.ts >= CURRENT_DATE${filter}`, p),
    pool.query(`SELECT a.type, COUNT(*) as total FROM alerts a JOIN devices d ON a.device_id = d.id WHERE a.created_at >= CURRENT_DATE - INTERVAL '30 days'${filter.replace('d.', 'd.')} GROUP BY a.type`, p),
    pool.query(`SELECT d.id, d.name, d.type_device, COUNT(a.id) as total FROM alerts a JOIN devices d ON a.device_id = d.id WHERE a.created_at >= CURRENT_DATE - INTERVAL '30 days'${filter.replace('d.', 'd.')} GROUP BY d.id, d.name, d.type_device ORDER BY total DESC LIMIT 5`, p),
    pool.query(`SELECT d.id, d.name, d.last_seen, gw.firmware_version FROM devices d LEFT JOIN gateway_device gw ON d.id = gw.id WHERE d.type_device = 'Gateway'${filter}`, p),
  ]);

  return {
    totalDevices: parseInt(totalDev.rows[0].total),
    activeDevices: parseInt(totalDev.rows[0].activos),
    activeToday: parseInt(activeToday.rows[0].activos),
    alertsByType: alertCounts.rows,
    topAlertDevices: topAlertDevices.rows,
    gateways: gwStatus.rows,
  };
};

// ─── Reporte Alertas Avanzado ──
export const getMonitorReportAlertsService = async (deviceIds, from, to) => {
  const params = [deviceIds];
  let filter = ` AND a.device_id = ANY($1::int[])`;
  let idx = 2;
  if (from) { filter += ` AND a.created_at >= $${idx}`; params.push(from); idx++; }
  if (to) { filter += ` AND a.created_at <= $${idx}`; params.push(to); idx++; }

  const alerts = await pool.query(`
    SELECT a.id, a.type, a.status, a.created_at, a.resolved_at, a.metadata,
           d.name as device_name, d.type_device, d.dev_eui,
           COALESCE((
             SELECT json_agg(json_build_object(
               'timestamp', ta.timestamp,
               'battery', ta.battery,
               'latitude', ta.latitude,
               'longitude', ta.longitude,
               'metadata', ta.metadata
             ) ORDER BY ta.timestamp ASC)
             FROM tracking_alerts ta WHERE ta.alert_id = a.id
           ), '[]'::json) as tracking_data
    FROM alerts a JOIN devices d ON a.device_id = d.id
    WHERE 1=1${filter}
    ORDER BY a.created_at DESC
  `, params);

  // Resolution time for resolved alerts
  const resolved = await pool.query(`
    SELECT a.type, AVG(EXTRACT(EPOCH FROM (a.resolved_at - a.created_at))/3600) as avg_hours
    FROM alerts a JOIN devices d ON a.device_id = d.id
    WHERE a.resolved_at IS NOT NULL${filter.replace('a.created_at', 'a.resolved_at')}
    GROUP BY a.type
  `, params);

  return { alerts: alerts.rows, resolutionTimes: resolved.rows, total: alerts.rows.length };
};

// ─── Stats reales de gateways: sensores únicos, registros, redundancia ──
// Cuenta, para cada gateway seleccionado, los sensores que realmente le reportaron
// en el período, buscando su gatewayId dentro del rxinfo de telemetry_data_all.
export const getMonitorReportGatewayStatsService = async (deviceIds, from, to) => {
  const gateways = await pool.query(`
    SELECT d.id, d.dev_eui, d.name
    FROM devices d
    WHERE d.type_device = 'Gateway' AND d.id = ANY($1::int[])
  `, [deviceIds]);

  if (!gateways.rows.length) return { gateways: [] };

  const gwStats = [];
  for (const gw of gateways.rows) {
    const params = [];
    const conds = [];
    const eui = gw.dev_eui;
    const short = eui && eui.length >= 6 ? eui.slice(-6) : null;
    // Coincidencia por gatewayId completo o por últimos 6 chars (insensible a mayúsculas)
    if (eui) { params.push(eui.toLowerCase()); conds.push(`EXISTS (SELECT 1 FROM jsonb_array_elements(t.rxinfo) r WHERE lower(r->>'gatewayId') = $${params.length})`); }
    if (short) { params.push(short.toLowerCase()); conds.push(`EXISTS (SELECT 1 FROM jsonb_array_elements(t.rxinfo) r WHERE lower(r->>'gatewayId') LIKE '%' || $${params.length} || '%')`); }
    let filter = '';
    if (conds.length) filter += ` AND (${conds.join(' OR ')})`;
    let timeFilter = '';
    if (from) { params.push(from); timeFilter += ` AND t.ts >= $${params.length}`; }
    if (to) { params.push(to); timeFilter += ` AND t.ts <= $${params.length}`; }

    const stats = await pool.query(`
      SELECT COUNT(DISTINCT t.device_id) as sensores,
             COUNT(*) as registros,
             COALESCE(AVG((SELECT COUNT(*) FROM jsonb_array_elements(t.rxinfo))), 0) as redundancia
      FROM telemetry_data_all t
      WHERE t.rxinfo IS NOT NULL AND t.rxinfo != '[]'::jsonb
        ${filter}${timeFilter}
    `, params);

    gwStats.push({
      id: gw.id,
      dev_eui: gw.dev_eui,
      name: gw.name,
      sensores: parseInt(stats.rows[0].sensores),
      registros: parseInt(stats.rows[0].registros),
      redundancia: parseFloat(stats.rows[0].redundancia || 0),
    });
  }

  return { gateways: gwStats };
};

// ─── Reporte Temperatura ──
export const getMonitorReportTemperatureService = async (deviceIds, from, to) => {
  const params = [deviceIds];
  let filter = ` AND t.device_id = ANY($1::int[])`;
  let idx = 2;
  if (from) { filter += ` AND t.ts >= $${idx}`; params.push(from); idx++; }
  if (to) { filter += ` AND t.ts <= $${idx}`; params.push(to); idx++; }

  const telemetry = await pool.query(`
    SELECT t.device_id, t.ts, t.object,
           d.name as device_name, d.type_device, d.dev_eui
    FROM telemetry_data_all t
    JOIN devices d ON t.device_id = d.id
    WHERE 1=1${filter} AND t.object->>'temperature_C' IS NOT NULL
    ORDER BY t.device_id, t.ts ASC
  `, params);

  return { telemetry: telemetry.rows, total: telemetry.rows.length };
};

// ─── Reporte GPS Tracking ──
export const getMonitorReportGpsService = async (deviceIds, from, to) => {
  const params = [deviceIds];
  let filter = ` AND t.device_id = ANY($1::int[])`;
  let idx = 2;
  if (from) { filter += ` AND t.ts >= $${idx}`; params.push(from); idx++; }
  if (to) { filter += ` AND t.ts <= $${idx}`; params.push(to); idx++; }

  const telemetry = await pool.query(`
    SELECT t.device_id, t.ts, t.object,
           d.name as device_name, d.type_device, d.dev_eui,
           gps.battery, gps.operating_mode
    FROM telemetry_data_all t
    JOIN devices d ON t.device_id = d.id
    LEFT JOIN gps_device gps ON d.id = gps.id
    WHERE 1=1${filter} AND d.type_device = 'Gps'
    ORDER BY t.device_id, t.ts ASC
  `, params);

  return { telemetry: telemetry.rows, total: telemetry.rows.length };
};

// ─── Reporte Gateway ──
export const getMonitorReportGatewayService = async (companyIds) => {
  let filter = '';
  const p = [];
  if (companyIds?.length) { p.push(companyIds); filter = ` AND d.company_id = ANY($${p.length}::int[])`; }

  const gateways = await pool.query(`
    SELECT d.id, d.dev_eui, d.name, d.last_seen, d.latitude_current, d.longitude_current,
           gw.ip_internal, gw.battery, gw.firmware_version,
           (SELECT COUNT(*) FROM devices child WHERE child.id_device_father = d.id) as device_count
    FROM devices d
    LEFT JOIN gateway_device gw ON d.id = gw.id
    WHERE d.type_device = 'Gateway'${filter}
  `, p);

  return { gateways: gateways.rows };
};

// ─── Reporte Comparativo ──
export const getMonitorReportComparativeService = async (deviceIds, period1Start, period1End, period2Start, period2End) => {
  const buildQuery = (start, end) => {
    const params = [deviceIds, start, end];
    return pool.query(`
      SELECT COUNT(*) as total_telemetry,
             AVG((t.object->>'voltage_mV')::numeric) as avg_voltage,
             AVG((t.object->>'temperature_C')::numeric) as avg_temperature
      FROM telemetry_data_all t
      WHERE t.device_id = ANY($1::int[]) AND t.ts >= $2 AND t.ts <= $3
    `, params);
  };

  const [p1, p2] = await Promise.all([
    buildQuery(period1Start, period1End),
    buildQuery(period2Start, period2End),
  ]);

  // Alerts comparison
  const alertsQuery = (start, end, params) => {
    return pool.query(`
      SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE type = 'critica') as criticas
      FROM alerts a
      WHERE a.device_id = ANY($1::int[]) AND a.created_at >= $2 AND a.created_at <= $3
    `, params);
  };

  const [a1, a2] = await Promise.all([
    alertsQuery(period1Start, period1End, [deviceIds, period1Start, period1End]),
    alertsQuery(period2Start, period2End, [deviceIds, period2Start, period2End]),
  ]);

  return {
    period1: { ...p1.rows[0], alerts: a1.rows[0] },
    period2: { ...p2.rows[0], alerts: a2.rows[0] },
  };
};
