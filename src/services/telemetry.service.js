import pool from '../config/database.js';
import { PAGINATION, STATS } from '../config/constants.js';

const clampInt = (value, defaultVal, min, max) => {
  const parsed = parseInt(value);
  if (isNaN(parsed) || parsed < min) return defaultVal;
  return parsed > max ? max : parsed;
};

export const searchDevicesService = async ({ q, type, companyId, limit = PAGINATION.DEFAULT_LIMIT, offset = PAGINATION.DEFAULT_OFFSET }) => {
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

export const getDeviceTelemetryService = async (deviceId, { from, to, limit = PAGINATION.DEFAULT_LIMIT }) => {
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
  params.push(limitInt);

  const [telemetryResult, statsResult] = await Promise.all([
    pool.query(`
      SELECT id, device_id, ts, object, rxinfo
      FROM telemetry_data_all
      ${whereClause}
      ORDER BY ts DESC
      LIMIT $${params.length}
    `, params),
    pool.query(`
      SELECT COUNT(*) as total_records, MIN(ts) as first_record, MAX(ts) as last_record
      FROM telemetry_data_all WHERE device_id = $1
    `, [deviceId]),
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
export const getSensorSummaryService = async () => {
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
      WHERE is_active = true
      GROUP BY type_device
      ORDER BY type_device
    `),
    // Operating modes de dispositivos GPS (desde la tabla gps_device)
    pool.query(`
      SELECT COALESCE(g.operating_mode, 'sin datos') as mode, COUNT(*)::int as count
      FROM devices d
      LEFT JOIN gps_device g ON d.id = g.id
      WHERE d.type_device = 'Gps' AND d.is_active = true
      GROUP BY g.operating_mode
      ORDER BY count DESC
    `),
  ]);

  return {
    types: byType.rows,
    gpsModes: opModes.rows,
  };
};

// ─── Lista completa de dispositivos activos ────────────────
export const getDevicesListService = async () => {
  const result = await pool.query(`
    SELECT d.id, d.dev_eui, d.name, d.type_device, d.is_active, d.last_seen, d.company_id,
           c.name as company_name,
           g.battery
    FROM devices d
    LEFT JOIN companies c ON d.company_id = c.id
    LEFT JOIN gps_device g ON d.id = g.id
    WHERE d.is_active = true
    ORDER BY d.type_device, d.name
    LIMIT 1000
  `);
  return result.rows;
};

// ─── Revisión diaria GPS ───────────────────────────────────
export const getGpsDailyReviewService = async () => {
  const result = await pool.query(`
    WITH days AS (
      SELECT DISTINCT DATE(ts) as review_date 
      FROM telemetry_data_all t
      JOIN devices d ON t.device_id = d.id
      WHERE d.type_device = 'Gps'
    ),
    all_gps AS (
      SELECT COUNT(*)::int as cnt FROM devices WHERE type_device = 'Gps' AND is_active = true
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
      WHERE d.type_device = 'Gps'
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
  `);
  return result.rows;
};

// ─── Detalle por día: estado de cada sensor GPS ───────────
export const getGpsDailyDetailService = async (date) => {
  const result = await pool.query(`
    WITH device_voltage AS (
      SELECT DISTINCT ON (t.device_id)
        t.device_id,
        (t.object->>'voltage_mV')::numeric as voltage_mV
      FROM telemetry_data_all t
      WHERE DATE(t.ts) = $1 AND t.object IS NOT NULL
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
    WHERE d.type_device = 'Gps' AND d.is_active = true
    ORDER BY d.name
  `, [date]);
  return { date, devices: result.rows };
};