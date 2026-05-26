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