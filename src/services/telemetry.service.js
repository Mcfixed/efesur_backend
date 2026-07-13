import pool from '../config/database.js';
import { PAGINATION, STATS } from '../config/constants.js';

const clampInt = (value, defaultVal, min, max) => {
  const parsed = parseInt(value);
  if (isNaN(parsed) || parsed < min) return defaultVal;
  return parsed > max ? max : parsed;
};

export const searchDevicesService = async ({ q, type, companyId, companyIds, limit = PAGINATION.DEFAULT_LIMIT, offset = PAGINATION.DEFAULT_OFFSET }) => {
  let whereClause = 'WHERE d.is_active = true';
  const params = [];
  let paramIndex = 1;

  if (q) {
    whereClause += ` AND (d.name ILIKE $${paramIndex} OR d.dev_eui ILIKE $${paramIndex})`;
    params.push(`%${q}%`);
    paramIndex++;
  }
  if (type) {
    whereClause += ` AND d.type_device = $${paramIndex}`;
    params.push(type);
    paramIndex++;
  }
  // companyIds from middleware (user's allowed companies)
  if (companyIds && companyIds.length) {
    whereClause += ` AND d.company_id = ANY($${paramIndex}::int[])`;
    params.push(companyIds);
    paramIndex++;
  }
  // Optional filter from query param — must be within user's companies
  if (companyId) {
    whereClause += ` AND d.company_id = $${paramIndex}`;
    params.push(companyId);
    paramIndex++;
  }

  const limitInt = clampInt(limit, PAGINATION.DEFAULT_LIMIT, PAGINATION.MIN_LIMIT, PAGINATION.MAX_LIMIT);
  const offsetInt = Math.max(0, parseInt(offset) || 0);

  const [dataResult, countResult] = await Promise.all([
    pool.query(`
      SELECT 
        d.id, d.dev_eui, d.name, d.type_device,
        d.is_active, d.last_seen, d.company_id,
        c.name as company_name
      FROM devices d
      LEFT JOIN companies c ON d.company_id = c.id
      ${whereClause}
      ORDER BY d.last_seen DESC NULLS LAST
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, limitInt, offsetInt]),
    pool.query(`SELECT COUNT(*) as count FROM devices d ${whereClause}`, params),
  ]);

  return {
    devices: dataResult.rows,
    total: parseInt(countResult.rows[0].count),
    limit: limitInt,
    offset: offsetInt,
  };
};

export const getDeviceTelemetryService = async (deviceId, { from, to, limit = PAGINATION.DEFAULT_LIMIT, offset }) => {
  let whereClause = 'WHERE device_id = $1';
  const params = [deviceId];

  if (from) {
    whereClause += ' AND ts >= $2';
    params.push(from);
  }
  if (to) {
    const nextIdx = params.length + 1;
    whereClause += ` AND ts <= $${nextIdx}`;
    params.push(to);
  }

  const limitInt = clampInt(limit, PAGINATION.DEFAULT_LIMIT, PAGINATION.MIN_LIMIT, PAGINATION.MAX_TELEMETRY_LIMIT);
  const offsetInt = Math.max(0, parseInt(offset) || 0);
  const limitIdx = params.length + 1;
  params.push(limitInt);
  let telemetryQuery, statsQuery;
  if (offsetInt > 0) {
    const offsetIdx = params.length + 1;
    params.push(offsetInt);
    telemetryQuery = `
      SELECT id, device_id, ts, object, rxinfo
      FROM telemetry_data_all
      ${whereClause}
      ORDER BY ts DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;
  } else {
    telemetryQuery = `
      SELECT id, device_id, ts, object, rxinfo
      FROM telemetry_data_all
      ${whereClause}
      ORDER BY ts DESC
      LIMIT $${limitIdx}
    `;
  }

  statsQuery = `
    SELECT COUNT(*) as total_records, MIN(ts) as first_record, MAX(ts) as last_record
    FROM telemetry_data_all WHERE device_id = $1
  `;

  const [telemetryResult, statsResult] = await Promise.all([
    pool.query(telemetryQuery, params),
    pool.query(statsQuery, [deviceId]),
  ]);

  return {
    telemetry: telemetryResult.rows,
    stats: statsResult.rows[0],
    limit: limitInt,
  };
};

export const getTelemetryStatsService = async (deviceId, hours = STATS.DEFAULT_HOURS) => {
  const hoursInt = clampInt(hours, STATS.DEFAULT_HOURS, STATS.MIN_HOURS, STATS.MAX_HOURS);
  
  return pool.query(`
    SELECT 
      date_trunc('hour', ts) as hour,
      COUNT(*) as record_count,
      ROUND(AVG((object->>'temperature')::numeric)::numeric, 2) as avg_temperature,
      ROUND(MAX((object->>'temperature')::numeric)::numeric, 2) as max_temperature,
      ROUND(MIN((object->>'temperature')::numeric)::numeric, 2) as min_temperature,
      ROUND(AVG((object->>'speed')::numeric)::numeric, 2) as avg_speed,
      ROUND(MAX((object->>'speed')::numeric)::numeric, 2) as max_speed,
      ROUND(AVG((object->>'fuel')::numeric)::numeric, 2) as avg_fuel,
      ROUND(MIN((object->>'fuel')::numeric)::numeric, 2) as min_fuel,
      ROUND(MAX((object->>'fuel')::numeric)::numeric, 2) as max_fuel
    FROM telemetry_data_all
    WHERE device_id = $1 AND ts >= NOW() - ($2 || ' hours')::interval
    GROUP BY date_trunc('hour', ts)
    ORDER BY hour DESC
    LIMIT $3
  `, [deviceId, hoursInt, STATS.MAX_RECORDS_RETURN]);
};

export const getAllDeviceTypesService = () => pool.query(
  'SELECT DISTINCT type_device FROM devices WHERE is_active = true ORDER BY type_device'
);

// ─── Resumen de sensores por tipo ──────────────────────────
export const getSensorSummaryService = async (companyIds) => {
  let companyFilter = '';
  const params = [];
  if (companyIds && companyIds.length) {
    params.push(companyIds);
    companyFilter = ` AND d.company_id = ANY($${params.length}::int[])`;
  }

  const [byType, opModes] = await Promise.all([
    pool.query(`
      SELECT 
        type_device,
        COUNT(*)::int as total,
        COUNT(*) FILTER (
          WHERE last_seen IS NULL
             OR (type_device = 'Gateway' AND last_seen < NOW() - INTERVAL '5 minutes')
             OR (type_device != 'Gateway' AND last_seen < NOW() - INTERVAL '12 hours')
        )::int as disconnected
      FROM devices 
      WHERE is_active = true ${companyFilter}
      GROUP BY type_device
      ORDER BY type_device
    `, params),
    // Operating modes de dispositivos GPS
    pool.query(`
      SELECT COALESCE(g.operating_mode, 'sin datos') as mode, COUNT(*)::int as count
      FROM devices d
      LEFT JOIN gps_device g ON d.id = g.id
      WHERE d.type_device = 'Gps' AND d.is_active = true ${companyFilter}
      GROUP BY g.operating_mode
      ORDER BY count DESC
    `, params),
  ]);

  return {
    types: byType.rows,
    gpsModes: opModes.rows,
  };
};

// ─── Lista completa de dispositivos activos ────────────────
export const getDevicesListService = async (companyIds) => {
  const params = [];
  let companyFilter = '';
  if (companyIds && companyIds.length) {
    params.push(companyIds);
    companyFilter = ` AND d.company_id = ANY($${params.length}::int[])`;
  }
  const result = await pool.query(`
    SELECT d.id, d.dev_eui, d.name, d.type_device, d.is_active, d.last_seen, d.company_id,
           d.latitude_current, d.longitude_current,
           c.name as company_name,
           last_rx.voltage_mV,
           g.battery as battery_pct
    FROM devices d
    LEFT JOIN companies c ON d.company_id = c.id
    LEFT JOIN gps_device g ON d.id = g.id
    LEFT JOIN LATERAL (
      SELECT (t.object->>'voltage_mV')::numeric as voltage_mV
      FROM telemetry_data_all t
      WHERE t.device_id = d.id AND t.object IS NOT NULL
      ORDER BY t.ts DESC LIMIT 1
    ) last_rx ON true
    WHERE 1=1 ${companyFilter}
    ORDER BY d.type_device, d.name
    LIMIT 1000
  `, params);
  return result.rows;
};

// ─── Revisión diaria GPS ───────────────────────────────────
export const getGpsDailyReviewService = async (companyIds) => {
  let companyFilter = '';
  const params = [];
  if (companyIds && companyIds.length) {
    params.push(companyIds);
    companyFilter = ` AND d.company_id = ANY($${params.length}::int[])`;
  }

  const result = await pool.query(`
    WITH days AS (
      SELECT DISTINCT DATE(ts) as review_date 
      FROM telemetry_data_all t
      JOIN devices d ON t.device_id = d.id
      WHERE d.type_device = 'Gps'${companyFilter}
    ),
    all_gps AS (
      SELECT COUNT(*)::int as cnt FROM devices WHERE type_device = 'Gps' AND is_active = true${companyFilter.replaceAll('d.company_id', 'company_id')}
    ),
    daily_stats AS (
      SELECT 
        DATE(t.ts) as review_date,
        COUNT(DISTINCT t.device_id)::int as activos,
        COUNT(DISTINCT t.device_id) FILTER (
          WHERE (t.object->>'voltage_mV')::numeric >= 3700 
            AND (t.object->>'voltage_mV')::numeric <= 4100
        )::int as buena,
        COUNT(DISTINCT t.device_id) FILTER (
          WHERE (t.object->>'voltage_mV')::numeric IS NULL
            OR (t.object->>'voltage_mV')::numeric < 3700 
            OR (t.object->>'voltage_mV')::numeric > 4100
        )::int as mala
      FROM telemetry_data_all t
      JOIN devices d ON t.device_id = d.id
      WHERE d.type_device = 'Gps'${companyFilter}
      GROUP BY DATE(t.ts)
    )
    SELECT 
      d.review_date,
      g.cnt as total,
      COALESCE(s.activos, 0) as activos,
      COALESCE(s.buena, 0) as bateria_buena,
      COALESCE(s.mala, 0) as bateria_mala
    FROM days d
    CROSS JOIN all_gps g
    LEFT JOIN daily_stats s ON d.review_date = s.review_date
    ORDER BY d.review_date DESC
    LIMIT 30
  `, params);
  return result.rows;
};

// ─── Detalle por día: estado de cada sensor GPS ───────────
export const getGpsDailyDetailService = async (date, companyIds) => {
  let companyFilter = '';
  let companyFilterTelemetry = '';
  const params = [date];
  if (companyIds && companyIds.length) {
    params.push(companyIds);
    companyFilter = ` AND d.company_id = ANY($${params.length}::int[])`;
    companyFilterTelemetry = ` AND d2.company_id = ANY($${params.length}::int[])`;
  }
  const result = await pool.query(`
    WITH device_voltage AS (
      SELECT DISTINCT ON (t.device_id)
        t.device_id,
        (t.object->>'voltage_mV')::numeric as voltage_mV
      FROM telemetry_data_all t
      JOIN devices d2 ON t.device_id = d2.id
      WHERE DATE(t.ts) = $1 AND t.object IS NOT NULL AND d2.type_device = 'Gps'${companyFilterTelemetry}
    )
    SELECT 
      d.id, d.name, d.dev_eui, d.last_seen,
      dv.voltage_mV,
      CASE WHEN dv.device_id IS NOT NULL THEN true ELSE false END as tuvo_datos,
      CASE 
        WHEN dv.voltage_mV IS NULL THEN 'sin dato'
        WHEN dv.voltage_mV >= 3700 AND dv.voltage_mV <= 4100 THEN 'buena'
        ELSE 'mala'
      END as estado_bateria
    FROM devices d
    LEFT JOIN device_voltage dv ON d.id = dv.device_id
    WHERE d.type_device = 'Gps' AND d.is_active = true${companyFilter}
    ORDER BY d.name
  `, params);
  return { date, devices: result.rows };
};

// ─── Todos los dispositivos con su último dato completo ──
export const getAllDevicesLastTelemetryService = async (companyIds) => {
  let companyFilter = '';
  const params = [];
  if (companyIds && companyIds.length) {
    params.push(companyIds);
    companyFilter = ` AND d.company_id = ANY($${params.length}::int[])`;
  }
  const result = await pool.query(`
    WITH latest AS (
      SELECT DISTINCT ON (t.device_id)
        t.device_id, t.ts, t.object, t.rxinfo
      FROM telemetry_data_all t
      ORDER BY t.device_id, t.ts DESC
    )
    SELECT 
      d.id, d.dev_eui, d.name, d.type_device, d.is_active, d.last_seen,
      c.name as company_name,
      g.operating_mode, g.battery as battery_pct,
      gw.firmware_version, gw.ip_internal,
      l.ts as last_telemetry_ts,
      l.object,
      l.rxinfo
    FROM devices d
    LEFT JOIN companies c ON d.company_id = c.id
    LEFT JOIN gps_device g ON d.id = g.id
    LEFT JOIN gateway_device gw ON d.id = gw.id
    LEFT JOIN latest l ON d.id = l.device_id
    WHERE 1=1 ${companyFilter}
    ORDER BY d.type_device, d.name
    LIMIT 1000
  `, params);
  return result.rows;
};

// ─── Gateways con posición para mapa ──────────────────
export const getGatewayPositionsService = async (companyIds) => {
  const params = ['Gateway'];
  let companyFilter = '';
  if (companyIds && companyIds.length) {
    params.push(companyIds);
    companyFilter = ` AND d.company_id = ANY($${params.length}::int[])`;
  }
  const result = await pool.query(`
    SELECT d.id, d.dev_eui, d.name, d.latitude_current, d.longitude_current
    FROM devices d
    WHERE d.type_device = $1 AND d.is_active = true
      AND d.latitude_current IS NOT NULL AND d.longitude_current IS NOT NULL
      ${companyFilter}
    ORDER BY d.name
  `, params);
  return result.rows;
};

// ─── Alertas por dispositivo ───────────────────────────
export const getDeviceAlertsService = async (deviceId, companyIds) => {
  const params = [deviceId];
  let companyFilter = '';
  if (companyIds && companyIds.length) {
    params.push(companyIds);
    companyFilter = ` AND d.company_id = ANY($${params.length}::int[])`;
  }
  const result = await pool.query(`
    SELECT 
      a.id, a.device_id, a.type, a.status, a.status_system, a.metadata, 
      a.created_at, a.resolved_at, a.user_reason,
      u.name as resolved_by_name
    FROM alerts a
    JOIN devices d ON a.device_id = d.id
    LEFT JOIN users u ON a.user_id = u.id
    WHERE a.device_id = $1${companyFilter}
    ORDER BY a.created_at DESC
    LIMIT 200
  `, params);
  return result.rows;
};

// ─── Últimos datos entrantes (todos los dispositivos) ──
export const getLatestTelemetryService = async (limit = 50, companyIds) => {
  const params = [];
  let companyFilter = '';
  if (companyIds && companyIds.length) {
    params.push(companyIds);
    companyFilter = ` AND d.company_id = ANY($${params.length}::int[])`;
  }
  const limitInt = Math.min(Math.max(1, parseInt(limit)), 100);
  params.push(limitInt);
  const result = await pool.query(`
    SELECT 
      t.id, t.device_id, t.ts, t.object, t.rxinfo,
      d.name as device_name, d.dev_eui, d.type_device
    FROM telemetry_data_all t
    JOIN devices d ON t.device_id = d.id
    WHERE 1=1${companyFilter}
    ORDER BY t.ts DESC
    LIMIT $${params.length}
  `, params);
  return result.rows;
};