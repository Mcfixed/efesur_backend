import pool from '../config/database.js';

// ─── Estado general: totales, cobertura, alertas ──
export const getStatusSummaryService = async (companyIds) => {
  let companyFilter = '';
  const params = [];
  if (companyIds && companyIds.length) {
    params.push(companyIds);
    companyFilter = ` AND d.company_id = ANY($${params.length}::int[])`;
  }

  // Total de dispositivos
  const totalResult = await pool.query(`
    SELECT COUNT(*) as total FROM devices d WHERE d.is_active = true${companyFilter}
  `, params);
  const totalSensores = parseInt(totalResult.rows[0].total);

  // Cobertura: sensores que enviaron datos hoy
  const coberturaResult = await pool.query(`
    SELECT COUNT(DISTINCT t.device_id) as activos FROM telemetry_data_all t
    JOIN devices d ON t.device_id = d.id
    WHERE d.is_active = true AND t.ts >= CURRENT_DATE${companyFilter.replace('d.company_id', 'd.company_id')}
  `, params);
  const activosHoy = parseInt(coberturaResult.rows[0].activos);

  // Alertas: criticas/atencion/movimientos solo de hoy, desconexion todas las activas
  const alertasResult = await pool.query(`
    SELECT 
      COUNT(*) FILTER (WHERE type = 'critica' AND status = 'active' AND DATE(a.created_at) = CURRENT_DATE) as criticas,
      COUNT(*) FILTER (WHERE type = 'atencion' AND status = 'active' AND DATE(a.created_at) = CURRENT_DATE) as atencion,
      COUNT(*) FILTER (WHERE type = 'movimientos_anomalos' AND status = 'active' AND DATE(a.created_at) = CURRENT_DATE) as movimientos,
      COUNT(*) FILTER (WHERE type IN ('desconexionGW', 'desconexionGPS') AND status = 'active') as desconexion
    FROM alerts a
    JOIN devices d ON a.device_id = d.id
    WHERE 1=1${companyFilter}
  `, params);
  const alertas = alertasResult.rows[0];

  return {
    totalSensores,
    cobertura: totalSensores > 0 ? Math.round((activosHoy / totalSensores) * 100) : 0,
    activosHoy,
    criticas: parseInt(alertas.criticas),
    atencion: parseInt(alertas.atencion),
    movimientos: parseInt(alertas.movimientos),
    desconexion: parseInt(alertas.desconexion),
  };
};

// ─── Sensores activos por día (últimos 30 días) ──
export const getActiveSensorsPerDayService = async (companyIds) => {
  let companyFilter = '';
  const params = [];
  if (companyIds && companyIds.length) {
    params.push(companyIds);
    companyFilter = ` AND d.company_id = ANY($${params.length}::int[])`;
  }

  const result = await pool.query(`
    SELECT 
      DATE(t.ts) as dia,
      COUNT(DISTINCT t.device_id) as activos
    FROM telemetry_data_all t
    JOIN devices d ON t.device_id = d.id
    WHERE d.is_active = true AND t.ts >= CURRENT_DATE - INTERVAL '30 days'${companyFilter}
    GROUP BY DATE(t.ts)
    ORDER BY dia ASC
  `, params);
  return result.rows;
};

// ─── Alertas por día (últimos 30 días) ──
export const getAlertsPerDayService = async (companyIds) => {
  let companyFilter = '';
  const params = [];
  if (companyIds && companyIds.length) {
    params.push(companyIds);
    companyFilter = ` AND d.company_id = ANY($${params.length}::int[])`;
  }

  const result = await pool.query(`
    SELECT 
      DATE(a.created_at) as dia,
      COUNT(*) FILTER (WHERE a.type = 'critica') as criticas,
      COUNT(*) FILTER (WHERE a.type = 'atencion') as atencion,
      COUNT(*) FILTER (WHERE a.type = 'movimientos_anomalos') as movimientos
    FROM alerts a
    JOIN devices d ON a.device_id = d.id
    WHERE a.created_at >= CURRENT_DATE - INTERVAL '30 days'${companyFilter}
    GROUP BY DATE(a.created_at)
    ORDER BY dia ASC
  `, params);
  return result.rows;
};

// ─── Calendario de eventos: alertas por día en un mes ──
export const getAlertsCalendarService = async (companyIds, year, month) => {
  let companyFilter = '';
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const params = [startDate];
  if (companyIds && companyIds.length) {
    params.push(companyIds);
    companyFilter = ` AND d.company_id = ANY($${params.length}::int[])`;
  }

  const result = await pool.query(`
    SELECT 
      EXTRACT(DAY FROM a.created_at) as dia,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE a.type = 'critica') as criticas,
      COUNT(*) FILTER (WHERE a.type = 'atencion') as atencion,
      COUNT(*) FILTER (WHERE a.type = 'movimientos_anomalos') as movimientos,
      COUNT(*) FILTER (WHERE a.type IN ('desconexionGW', 'desconexionGPS')) as desconexion
    FROM alerts a
    JOIN devices d ON a.device_id = d.id
    WHERE a.created_at >= $1::date
      AND a.created_at < $1::date + INTERVAL '1 month'
      ${companyFilter}
    GROUP BY EXTRACT(DAY FROM a.created_at)
    ORDER BY dia ASC
  `, params);
  return result.rows;
};

// ─── Alertas detalladas de un día específico ──
export const getAlertsByDateService = async (companyIds, date) => {
  let companyFilter = '';
  const params = [date];
  if (companyIds && companyIds.length) {
    params.push(companyIds);
    companyFilter = ` AND d.company_id = ANY($${params.length}::int[])`;
  }

  const result = await pool.query(`
    SELECT 
      a.id,
      a.type,
      a.status,
      a.metadata,
      a.created_at,
      d.name as device_name,
      d.dev_eui,
      d.type_device
    FROM alerts a
    JOIN devices d ON a.device_id = d.id
    WHERE DATE(a.created_at) = $1
      ${companyFilter}
    ORDER BY a.created_at DESC
  `, params);
  return result.rows;
};

// ─── Tracking de una alerta específica ──
export const getAlertTrackingService = async (alertId) => {
  const result = await pool.query(`
    SELECT 
      ta.timestamp,
      ta.battery,
      ta.latitude,
      ta.longitude,
      ta.metadata
    FROM tracking_alerts ta
    WHERE ta.alert_id = $1
    ORDER BY ta.timestamp ASC
  `, [alertId]);
  return result.rows;
};
