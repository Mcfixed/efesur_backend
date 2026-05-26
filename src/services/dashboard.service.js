import pool from '../config/database.js';
import { DEVICE_TYPES, ALERT_TYPES, ALERT_STATUSES } from '../config/constants.js';

export const getAllGpsDevices = () => pool.query(`
  SELECT 
    d.id, d.dev_eui, d.name, d.type_device,
    d.latitude_current, d.longitude_current, d.last_seen, d.is_active,
    g.battery, g.accelerometers_status, g.operating_mode,
    c.name as company_name
  FROM devices d
  LEFT JOIN gps_device g ON d.id = g.id
  LEFT JOIN companies c ON d.company_id = c.id
  WHERE d.type_device = $1 AND d.is_active = true
  ORDER BY d.last_seen DESC
  LIMIT 1000
`, [DEVICE_TYPES.GPS]);

export const getCriticalAlerts = () => pool.query(`
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
        LIMIT 10
      ) ta
    ), '[]') as tracking_data
  FROM alerts a
  JOIN devices d ON a.device_id = d.id
  LEFT JOIN users u ON a.user_id = u.id
  WHERE a.type = $1 AND a.status = $2
  ORDER BY a.created_at DESC
  LIMIT 500
`, [ALERT_TYPES.CRITICA, ALERT_STATUSES.ACTIVE]);

export const getAtencionAlerts = () => pool.query(`
  SELECT 
    a.id, a.device_id, a.type, a.status, a.metadata, a.created_at,
    d.name as device_name, d.latitude_current, d.longitude_current
  FROM alerts a
  JOIN devices d ON a.device_id = d.id
  WHERE a.type = $1 AND a.status = $2
  AND a.created_at >= NOW() - INTERVAL '30 minutes'
  ORDER BY a.created_at DESC
  LIMIT 500
`, [ALERT_TYPES.ATENCION, ALERT_STATUSES.ACTIVE]);

export const resolveAlertById = (id, userId, reason) => pool.query(`
  UPDATE alerts 
  SET status = $1, user_id = $2, user_reason = $3, resolved_at = NOW()
  WHERE id = $4 AND type = $5
  RETURNING *
`, [ALERT_STATUSES.RESOLVED, userId, reason, id, ALERT_TYPES.CRITICA]);

export const getDevicesLocations = () => pool.query(`
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
    WHERE status = $2
    ORDER BY device_id, created_at DESC
  ) a ON d.id = a.device_id
  WHERE d.type_device = $1 AND d.is_active = true
    AND d.latitude_current IS NOT NULL AND d.longitude_current IS NOT NULL
  ORDER BY d.last_seen DESC
  LIMIT 5000
`, [DEVICE_TYPES.GPS, ALERT_STATUSES.ACTIVE]);