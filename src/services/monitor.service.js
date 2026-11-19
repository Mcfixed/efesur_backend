import pool from '../config/database.js';

// ─── Zona horaria ────────────────────────────────────────────────────────────
const TZ = 'America/Santiago';

const NOW_CL = `(now() AT TIME ZONE '${TZ}')`;   // ahora, en hora de Chile
const TODAY_CL = `(${NOW_CL})::date`;             // fecha de hoy en Chile

// 00:00 de Chile expresado en UTC (naive): filtrable con índices sobre columnas naive-UTC.
const DAY_START_UTC = (chileDate) =>
  `((${chileDate})::timestamp AT TIME ZONE '${TZ}' AT TIME ZONE 'UTC')`;

// Columna naive-UTC -> naive Chile (para agrupar por día o extraer el mes)
const TO_CL = (column) => `((${column} AT TIME ZONE 'UTC') AT TIME ZONE '${TZ}')`;

// ¿La marca de tiempo cae dentro del día de HOY en Chile?
const IS_TODAY_CL = (column) =>
  `${column} >= ${DAY_START_UTC(TODAY_CL)} AND ${column} < ${DAY_START_UTC(`(${TODAY_CL}) + 1`)}`;

// ¿Cae dentro del día de Chile correspondiente a una fecha dada ($n)?
const IS_DAY_CL = (column, dateSql) =>
  `${column} >= ${DAY_START_UTC(dateSql)} AND ${column} < ${DAY_START_UTC(`(${dateSql})::date + 1`)}`;

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
    WHERE d.is_active = true AND t.ts >= ${DAY_START_UTC(TODAY_CL)}${filter}
  `, p);
  const activosHoy = parseInt(cobertura.rows[0].activos);

  const alertas = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE a.type = 'critica' AND (a.status_system = 'active' OR a.status_system IS NULL) AND ${IS_TODAY_CL('a.created_at')}) as criticas,
      COUNT(*) FILTER (WHERE a.type = 'atencion' AND ${IS_TODAY_CL('a.created_at')}) as atencion,
      COUNT(*) FILTER (WHERE a.type = 'apertura' AND ${IS_TODAY_CL('a.created_at')}) as apertura,
      COUNT(*) FILTER (WHERE a.type = 'presencia' AND ${IS_TODAY_CL('a.created_at')}) as presencia,
      COUNT(*) FILTER (WHERE a.type = 'movimientos_anomalos' AND ${IS_TODAY_CL('a.created_at')}) as movimientos,
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
    SELECT ${TO_CL('t.ts')}::date as dia, COUNT(DISTINCT t.device_id) as activos
    FROM telemetry_data_all t JOIN devices d ON t.device_id = d.id
    -- Solo sensores GPS: los lectores también escriben en telemetry_data_all y antes inflaban
    -- el conteo, así que la card no cuadraba con el total de GPS del resumen.
    WHERE d.is_active = true AND d.type_device = 'Gps'
      AND t.ts >= ${DAY_START_UTC(TODAY_CL)} - INTERVAL '30 days'${filter}
    GROUP BY ${TO_CL('t.ts')}::date ORDER BY dia ASC
  `, p);
  return r.rows;
};

// ─── Reporte por día: una fila por sensor activo ──
export const getMonitorDayReportService = async (dia, companyIds) => {
  const params = [dia];
  let filter = '';
  if (companyIds?.length) { params.push(companyIds); filter = ` AND d.company_id = ANY($2::int[])`; }

  // Nombre estándar del sensor: "V1PK6/11-13" = Vía 1 · PK 6 · postes 11-13.
  const PK_RX = '^\\s*V\\s*(\\d+)\\s*PK\\s*(\\d+)\\s*/\\s*(\\d+)';

  const r = await pool.query(`
    SELECT d.id, d.name, d.dev_eui, d.last_seen AS last_seen_global,
           last_t.ts AS ultimo_ts,
           (last_t.object->>'voltage_mV')::float8   AS bat_mv,
           (last_t.object->>'temperature_C')::float8 AS temp_c,
           gws.lista AS gateways,
           -- El primer elemento de la lista ya viene ordenado por mejor señal
           gws.lista->0->>'eui'            AS gw_eui,
           (gws.lista->0->>'snr')::float8  AS snr,
           (gws.lista->0->>'rssi')::float8 AS rssi,
           gws.lista->0->>'name'           AS gw_name
    FROM devices d
    LEFT JOIN LATERAL (
      SELECT t.ts, t.object, t.rxinfo
      FROM telemetry_data_all t
      WHERE t.device_id = d.id
        AND t.ts >= ${DAY_START_UTC('$1')} AND t.ts < ${DAY_START_UTC('($1::date + 1)')}
      ORDER BY t.ts DESC LIMIT 1
    ) last_t ON true
    LEFT JOIN LATERAL (
      -- Todos los gateways que recibieron el último dato del día (para el popup de cobertura).
      -- Se ordenan por calidad de señal, así el primero es el "mejor gateway" del reporte.
      SELECT jsonb_agg(
               jsonb_build_object(
                 'eui',  r->>'gatewayId',
                 'snr',  (r->>'snr')::float8,
                 'rssi', (r->>'rssi')::float8,
                 'name', COALESCE(
                   (SELECT gw.name FROM devices gw WHERE lower(gw.dev_eui) = lower(r->>'gatewayId') LIMIT 1),
                   (SELECT gw.name FROM devices gw
                     WHERE gw.type_device = 'Gateway'
                       AND lower(right(gw.dev_eui, 6)) = lower(right(r->>'gatewayId', 6)) LIMIT 1)
                 )
               )
               ORDER BY (r->>'snr')::float8 DESC NULLS LAST, (r->>'rssi')::float8 DESC NULLS LAST
             ) AS lista
      -- rxinfo llega como array normalmente, pero el ingest guarda un OBJETO cuando hay un
      -- solo gateway: jsonb_array_elements fallaba con "cannot extract elements from an object".
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(last_t.rxinfo) = 'array'  THEN last_t.rxinfo
          WHEN jsonb_typeof(last_t.rxinfo) = 'object' THEN jsonb_build_array(last_t.rxinfo)
          ELSE '[]'::jsonb
        END
      ) r
      WHERE r ? 'gatewayId'
    ) gws ON true
    WHERE d.is_active = true AND d.type_device = 'Gps'${filter}
    -- Orden por punto kilométrico: Vía, PK y poste. Los sensores con otro formato
    -- (o con la vía mal escrita, p. ej. "V2P2/56-58") quedan al final, ordenados por nombre.
    ORDER BY
      (regexp_match(d.name, '${PK_RX}', 'i'))[1]::int NULLS LAST,
      (regexp_match(d.name, '${PK_RX}', 'i'))[2]::int NULLS LAST,
      (regexp_match(d.name, '${PK_RX}', 'i'))[3]::int NULLS LAST,
      d.name
  `, params);

  const sensores = r.rows;
  const conDatos = sensores.filter(s => s.ultimo_ts).length;
  return { dia, total: sensores.length, conDatos, sinDatos: sensores.length - conDatos, sensores };
};

// ─── Anexo SAT: datos de verificación de funcionamiento ──
export const getMonitorSatDataService = async (dias, companyIds) => {
  const n = Math.min(Math.max(parseInt(dias) || 5, 1), 30);

  const rango = await pool.query(`
    SELECT ((now() AT TIME ZONE '${TZ}')::date - ($1::int - 1))::text AS desde,
            (now() AT TIME ZONE '${TZ}')::date::text                   AS hasta
  `, [n]);
  const { desde, hasta } = rango.rows[0];

  const params = [desde, hasta];
  let filter = '';
  if (companyIds?.length) { params.push(companyIds); filter = ` AND d.company_id = ANY($${params.length}::int[])`; }

  const PK_RX = '^\\s*V\\s*(\\d+)\\s*PK\\s*(\\d+)\\s*/\\s*(\\d+)';
  const ini = DAY_START_UTC('$1');
  const fin = DAY_START_UTC('($2::date + 1)');

  // 1) Sensores activos: agregados de la ventana, último registro y su mejor gateway
  const sensores = await pool.query(`
    SELECT d.id, d.name, d.dev_eui, d.last_seen, d.latitude_current, d.longitude_current,
           g.operating_mode,
           agg.registros, agg.dias, agg.primer_ts, hue.huecos AS huecos_interiores,
           last_t.ts AS ultimo_ts,
           CASE WHEN prev_t.ts IS NOT NULL THEN agg.primer_ts - ${ini} END                      AS hueco_inicial,
           CASE WHEN last_t.ts IS NOT NULL THEN LEAST(${fin}, (now() AT TIME ZONE 'UTC')) - last_t.ts END AS hueco_final,
           (last_t.object->>'voltage_mV')::float8    AS bat_mv,
           (last_t.object->>'temperature_C')::float8 AS temp_c,
           (last_t.object->>'satellites')::int       AS sats,
           gws.lista AS gateways,
           (gws.lista->0->>'eui')  AS gw_eui,
           (gws.lista->0->>'name') AS gw_name,
           (gws.lista->0->>'snr')::float8  AS snr,
           (gws.lista->0->>'rssi')::float8 AS rssi,
           ev.eventos, ev.ultimo_evento
    FROM devices d
    LEFT JOIN gps_device g ON g.id = d.id
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS registros,
             COUNT(DISTINCT ((t.ts AT TIME ZONE 'UTC') AT TIME ZONE '${TZ}')::date)::int AS dias,
             MIN(t.ts) AS primer_ts
      FROM telemetry_data_all t
      WHERE t.device_id = d.id AND t.ts >= ${ini} AND t.ts < ${fin}
    ) agg ON true
    LEFT JOIN LATERAL (
      -- Interrupciones internas: silencios de más de 4 h 15 min entre dos datos de la ventana.
      -- El keepalive está configurado cada 4 h; el margen de 15 min evita marcar como falla un
      -- keepalive que llegue algo atrasado.
      SELECT COUNT(*)::int AS huecos FROM (
        SELECT t.ts - LAG(t.ts) OVER (ORDER BY t.ts) AS gap
        FROM telemetry_data_all t
        WHERE t.device_id = d.id AND t.ts >= ${ini} AND t.ts < ${fin}
      ) x WHERE x.gap > INTERVAL '4 hours 15 minutes'
    ) hue ON true
    LEFT JOIN LATERAL (
      -- Último dato anterior a la ventana: permite medir el silencio del inicio del período.
      -- Solo se considera si el sensor ya venía reportando (no penaliza equipos recién instalados).
      SELECT t.ts FROM telemetry_data_all t
      WHERE t.device_id = d.id AND t.ts < ${ini}
      ORDER BY t.ts DESC LIMIT 1
    ) prev_t ON true
    LEFT JOIN LATERAL (
      SELECT t.ts, t.object, t.rxinfo
      FROM telemetry_data_all t
      WHERE t.device_id = d.id AND t.ts >= ${ini} AND t.ts < ${fin}
      ORDER BY t.ts DESC LIMIT 1
    ) last_t ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(
               jsonb_build_object(
                 'eui',  r->>'gatewayId',
                 'snr',  (r->>'snr')::float8,
                 'rssi', (r->>'rssi')::float8,
                 'name', COALESCE(
                   (SELECT gw.name FROM devices gw WHERE lower(gw.dev_eui) = lower(r->>'gatewayId') LIMIT 1),
                   (SELECT gw.name FROM devices gw
                     WHERE gw.type_device = 'Gateway'
                       AND lower(right(gw.dev_eui, 6)) = lower(right(r->>'gatewayId', 6)) LIMIT 1)
                 )
               )
               ORDER BY (r->>'snr')::float8 DESC NULLS LAST, (r->>'rssi')::float8 DESC NULLS LAST
             ) AS lista
      FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(last_t.rxinfo) = 'array'  THEN last_t.rxinfo
          WHEN jsonb_typeof(last_t.rxinfo) = 'object' THEN jsonb_build_array(last_t.rxinfo)
          ELSE '[]'::jsonb
        END
      ) r
      WHERE r ? 'gatewayId'
    ) gws ON true
    LEFT JOIN LATERAL (
      -- Eventos de movimiento / caída libre registrados en la ventana (prueba funcional)
      SELECT COUNT(*)::int AS eventos, MAX(a.created_at) AS ultimo_evento
      FROM alerts a
      WHERE a.device_id = d.id AND a.created_at >= ${ini} AND a.created_at < ${fin}
        AND a.type IN ('movimientos_anomalos', 'critica')
    ) ev ON true
    WHERE d.is_active = true AND d.type_device = 'Gps'${filter}
    ORDER BY
      (regexp_match(d.name, '${PK_RX}', 'i'))[1]::int NULLS LAST,
      (regexp_match(d.name, '${PK_RX}', 'i'))[2]::int NULLS LAST,
      (regexp_match(d.name, '${PK_RX}', 'i'))[3]::int NULLS LAST,
      d.name
  `, params);

  // Interrupciones: cada silencio de más de 4 h 15 min sin datos cuenta como una, incluyendo
  const KEEPALIVE_SEG = 4 * 3600 + 15 * 60;
  const aSegundos = (iv) => (iv == null ? null
    : (iv.days ?? 0) * 86400 + (iv.hours ?? 0) * 3600 + (iv.minutes ?? 0) * 60 + (iv.seconds ?? 0));
  for (const s of sensores.rows) {
    const inicial = aSegundos(s.hueco_inicial);
    const enCurso = aSegundos(s.hueco_final);
    s.huecos = (s.huecos_interiores ?? 0)
      + (inicial != null && inicial > KEEPALIVE_SEG ? 1 : 0)
      + (enCurso != null && enCurso > KEEPALIVE_SEG ? 1 : 0);
    s.hueco_en_curso = enCurso != null && enCurso > KEEPALIVE_SEG;
    delete s.huecos_interiores;
    delete s.hueco_inicial;
    delete s.hueco_final;
  }

  // 2) Gateways: uplinks retransmitidos y sensores servidos en la ventana
  const gateways = await pool.query(`
    SELECT d.id, d.name, d.dev_eui, d.is_active, d.last_seen, gw.firmware_version,
           up.uplinks, up.sensores
    FROM devices d
    LEFT JOIN gateway_device gw ON gw.id = d.id
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS uplinks, COUNT(DISTINCT t.device_id)::int AS sensores
      FROM telemetry_data_all t
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(t.rxinfo) = 'array'  THEN t.rxinfo
          WHEN jsonb_typeof(t.rxinfo) = 'object' THEN jsonb_build_array(t.rxinfo)
          ELSE '[]'::jsonb
        END
      ) r
      WHERE t.ts >= ${ini} AND t.ts < ${fin} AND r ? 'gatewayId'
        AND (lower(r->>'gatewayId') = lower(d.dev_eui)
          OR lower(right(r->>'gatewayId', 6)) = lower(right(d.dev_eui, 6)))
    ) up ON true
    WHERE d.type_device = 'Gateway'
    ORDER BY d.name
  `, [desde, hasta]);

  return { desde, hasta, dias: n, sensores: sensores.rows, gateways: gateways.rows };
};

// ─── Alertas por día (30 días) ──
export const getMonitorAlertsPerDayService = async (companyIds) => {
  let filter = ''; const p = [];
  if (companyIds?.length) { p.push(companyIds); filter = ` AND d.company_id = ANY($${p.length}::int[])`; }
  const r = await pool.query(`
    SELECT ${TO_CL('a.created_at')}::date as dia,
      COUNT(*) FILTER (WHERE a.type = 'critica') as criticas,
      COUNT(*) FILTER (WHERE a.type = 'atencion') as atencion,
      COUNT(*) FILTER (WHERE a.type = 'apertura') as apertura,
      COUNT(*) FILTER (WHERE a.type = 'presencia') as presencia,
      COUNT(*) FILTER (WHERE a.type = 'movimientos_anomalos') as movimientos,
      COUNT(*) FILTER (WHERE a.type IN ('desconexionGW','desconexionGPS','desconexion220','desconexionbatGW')) as desconexion
    FROM alerts a JOIN devices d ON a.device_id = d.id
    WHERE a.created_at >= ${DAY_START_UTC(TODAY_CL)} - INTERVAL '30 days'${filter}
    GROUP BY ${TO_CL('a.created_at')}::date ORDER BY dia ASC
  `, p);
  return r.rows;
};

// ─── Calendario de eventos ──
export const getMonitorCalendarService = async (companyIds, year, month) => {
  let filter = ''; const p = [`${year}-${String(month).padStart(2, '0')}-01`];
  if (companyIds?.length) { p.push(companyIds); filter = ` AND d.company_id = ANY($${p.length}::int[])`; }
  const r = await pool.query(`
    SELECT EXTRACT(DAY FROM ${TO_CL('a.created_at')}) as dia, COUNT(*) as total,
      COUNT(*) FILTER (WHERE a.type = 'critica') as criticas,
      COUNT(*) FILTER (WHERE a.type = 'atencion') as atencion,
      COUNT(*) FILTER (WHERE a.type = 'apertura') as apertura,
      COUNT(*) FILTER (WHERE a.type = 'presencia') as presencia,
      COUNT(*) FILTER (WHERE a.type = 'movimientos_anomalos') as movimientos,
      COUNT(*) FILTER (WHERE a.type IN ('desconexionGW','desconexionGPS','desconexion220','desconexionbatGW')) as desconexion
    FROM alerts a JOIN devices d ON a.device_id = d.id
    WHERE a.created_at >= ${DAY_START_UTC('$1')} AND a.created_at < ${DAY_START_UTC(`($1::date + INTERVAL '1 month')`)}${filter}
    GROUP BY EXTRACT(DAY FROM ${TO_CL('a.created_at')}) ORDER BY dia ASC
  `, p);
  return r.rows;
};

// ─── Alertas por fecha ──
export const getMonitorAlertsByDateService = async (companyIds, date) => {
  let filter = ''; const p = [date];
  if (companyIds?.length) { p.push(companyIds); filter = ` AND d.company_id = ANY($${p.length}::int[])`; }
  const r = await pool.query(`
    SELECT a.id, a.type, a.status, a.metadata, a.created_at, a.device_id, d.name as device_name, d.type_device
    FROM alerts a JOIN devices d ON a.device_id = d.id
    WHERE ${IS_DAY_CL('a.created_at', '$1')}${filter} ORDER BY a.created_at DESC
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

// ─── Recorrido de un tracker (puntos + gateways por punto) ──
export const getMonitorDeviceTrackService = async (deviceId, { from, to } = {}) => {
  const hasta = to || new Date().toISOString();
  const desde = from || new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const [dev, filas, gws] = await Promise.all([
    pool.query(`SELECT id, name, dev_eui, type_device FROM devices WHERE id = $1`, [deviceId]),
    pool.query(`
      WITH p AS (
        SELECT (($1::timestamptz) AT TIME ZONE 'UTC') AS desde,
               (($2::timestamptz) AT TIME ZONE 'UTC') AS hasta
      )
      SELECT t.ts,
             (t.object->>'latitude')::float8   AS lat,
             (t.object->>'longitude')::float8  AS lng,
             (t.object->>'altitude_m')::float8 AS alt,
             (t.object->>'battery_mv')::float8 AS bat_mv,
             (t.object->>'battery_v')::float8  AS bat_v,
             (t.object->>'gps_valid')::boolean AS gps_valid,
             (t.object->>'satellites')::int        AS sats,
             (t.object->>'temperature_C')::float8  AS temp_c,
             (t.object->>'voltage_mV')::float8     AS vbat_mv,
             t.object->>'packetType'              AS packet_type,
             COALESCE(t.object->>'operatingMode', t.object->'systemStatus'->>'operatingMode') AS modo,
             COALESCE((t.object->'systemStatus'->>'motionFlag')::boolean, false)   AS motion,
             COALESCE((t.object->'systemStatus'->>'freeFallFlag')::boolean, false) AS freefall,
             CASE WHEN jsonb_typeof(t.rxinfo) = 'array'  THEN t.rxinfo
                  WHEN jsonb_typeof(t.rxinfo) = 'object' THEN jsonb_build_array(t.rxinfo)
                  ELSE '[]'::jsonb END AS rx
      FROM telemetry_data_all t
      CROSS JOIN p
      WHERE t.device_id = $3 AND t.ts >= p.desde AND t.ts <= p.hasta
      ORDER BY t.ts ASC
    `, [desde, hasta, deviceId]),
    pool.query(`SELECT dev_eui, name, latitude_current, longitude_current FROM devices WHERE type_device = 'Gateway'`),
  ]);

  // Info de gateway (por EUI completo o por los últimos 6 caracteres, como el resto del panel).
  const porEui = new Map();
  const porCorto = new Map();
  for (const g of gws.rows) {
    if (!g.dev_eui) continue;
    const info = {
      name: g.name,
      lat: g.latitude_current != null ? Number(g.latitude_current) : null,
      lng: g.longitude_current != null ? Number(g.longitude_current) : null,
    };
    porEui.set(String(g.dev_eui).toLowerCase(), info);
    porCorto.set(String(g.dev_eui).toLowerCase().slice(-6), info);
  }
  const gwDe = (eui) => {
    const vacio = { name: null, lat: null, lng: null };
    if (!eui) return vacio;
    const e = String(eui).toLowerCase();
    return porEui.get(e) || porCorto.get(e.slice(-6)) || vacio;
  };

  // Paquete GPS sin coordenada usable (llega en 0 o sin fix)
  const esSinFix = (row) => {
    const lat = Number(row.lat), lng = Number(row.lng);
    return row.gps_valid === false
      || !Number.isFinite(lat) || !Number.isFinite(lng)
      || (lat === 0 && lng === 0);
  };

  const puntos = [];
  // Todos los paquetes GPS recibidos (con y sin fix): alimenta la tabla "Registros GPS"
  const gpsPaquetes = [];
  for (const row of filas.rows) {
    const lat = row.lat, lng = row.lng;
    // gps_valid solo lo manda LillieGo; los Gps mandan lat/lng sin la bandera.
    const ok = !esSinFix(row);

    const rx = Array.isArray(row.rx) ? row.rx : [];
    const validas = rx.filter(x => !x.crcStatus || x.crcStatus === 'CRC_OK');
    const gateways = validas.map(x => {
      const info = gwDe(x.gatewayId);
      return {
        eui: x.gatewayId || null,
        name: info.name,
        lat: info.lat,
        lng: info.lng,
        rssi: x.rssi ?? null,
        snr: x.snr ?? null,
      };
    });
    const conSenal = gateways.filter(g => g.snr != null).sort((a, b) => b.snr - a.snr);

    const paquete = {
      ts: row.ts,
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      alt: row.alt ?? null,
      bateria_mv: row.bat_mv ?? row.vbat_mv ?? (row.bat_v != null ? row.bat_v * 1000 : null),
      satelites: row.sats ?? null,
      temperatura_c: row.temp_c ?? null,
      packet_type: row.packet_type ?? null,
      modo: row.modo ?? null,
      motion: row.motion === true,
      freefall: row.freefall === true,
      n_gw: gateways.length,
      gateways,
      rssi: conSenal[0]?.rssi ?? null,
      snr: conSenal[0]?.snr ?? null,
      sin_fix: !ok,
    };

    // Solo los paquetes GPS (los únicos que traen lat/lon) alimentan la tabla \"Registros GPS\"
    if (row.lat != null || row.lng != null) gpsPaquetes.push(paquete);
    if (ok) puntos.push(paquete);
  }

  // Distancia recorrida (haversine) para mostrarla en el resumen
  let distanciaKm = 0;
  for (let i = 1; i < puntos.length; i++) {
    const a = puntos[i - 1], b = puntos[i];
    const R = 6371, rad = (d) => (d * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    distanciaKm += 2 * R * Math.asin(Math.sqrt(h));
  }

  // Resumen de paquetes GPS (son los únicos que traen lat/lon): los keepalive no cuentan.
  const filasGps = filas.rows.filter(r => r.lat != null || r.lng != null);
  const fechasSinFix = filasGps.filter(esSinFix).map(r => r.ts);
  const ultimaFila = filas.rows[filas.rows.length - 1] || null;
  // Un equipo de prueba puede tener miles de paquetes GPS; ni el mapa ni la tabla necesitan todos.
  const MAX_PUNTOS = 800;
  const MAX_GPS_TABLA = 500;
  const puntosTotal = puntos.length;
  const puntosMapa = puntosTotal > MAX_PUNTOS ? puntos.slice(-MAX_PUNTOS) : puntos;
  const gpsTabla = gpsPaquetes.length > MAX_GPS_TABLA ? gpsPaquetes.slice(-MAX_GPS_TABLA) : gpsPaquetes;

  return {
    device: dev.rows[0] || null,
    desde, hasta,
    total_registros: filas.rows.length,
    puntos: puntosMapa,
    gps_paquetes: gpsTabla,
    resumen: {
      puntos: puntosMapa.length,
      puntos_total: puntosTotal,
      sin_fix: fechasSinFix.length,
      gps_total: filasGps.length,
      // Solo las últimas 20 fechas: el resto se resume en el contador
      sin_fix_fechas: fechasSinFix.slice(-20),
      ultimo_dato: ultimaFila
        ? {
            ts: ultimaFila.ts,
            packet_type: ultimaFila.packet_type ?? null,
            bateria_mv: ultimaFila.vbat_mv ?? ultimaFila.bat_mv ?? null,
          }
        : null,
      ultimo_gps: puntosTotal ? puntos[puntosTotal - 1].ts : null,
      gw_promedio: puntosTotal ? Number((puntos.reduce((a, p) => a + p.n_gw, 0) / puntosTotal).toFixed(1)) : 0,
      distancia_km: Number(distanciaKm.toFixed(3)),
    },
  };
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

// ─── Sensores que escucha un gateway (para el mapa del panel) ──
// Reemplaza la descarga de 5000 filas de telemetría que hacía el front (9 MB cada 15 s):
// acá se resuelve con una sola consulta sobre las últimas 24 h y se devuelve un registro por sensor.
export const getMonitorGatewaySensoresService = async (gatewayId, { horas = 24 } = {}) => {
  const gw = await pool.query(`SELECT id, name, dev_eui, latitude_current, longitude_current FROM devices WHERE id = $1`, [gatewayId]);
  const g = gw.rows[0];
  if (!g) return { total: 0, sensores: [] };

  const eui = String(g.dev_eui || '').toLowerCase();
  const eui6 = eui.slice(-6);
  const nombre = String(g.name || '').toLowerCase();

  const r = await pool.query(`
    SELECT DISTINCT ON (t.device_id)
           t.device_id,
           t.ts,
           d.name, d.dev_eui, d.latitude_current, d.longitude_current,
           (x->>'snr')::float8  AS snr,
           (x->>'rssi')::float8 AS rssi
    FROM telemetry_data_all t
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(t.rxinfo) = 'array'  THEN t.rxinfo
        WHEN jsonb_typeof(t.rxinfo) = 'object' THEN jsonb_build_array(t.rxinfo)
        ELSE '[]'::jsonb
      END
    ) x
    JOIN devices d ON d.id = t.device_id
    WHERE t.ts >= (now() AT TIME ZONE 'UTC') - ($4::int * INTERVAL '1 hour')
      AND (x->>'gatewayId') IS NOT NULL
      AND (
        lower(x->>'gatewayId') = $1
        OR ($2 <> '' AND right(lower(x->>'gatewayId'), 6) = $2)
        OR ($3 <> '' AND lower(x->>'gatewayId') = $3)
      )
    ORDER BY t.device_id, t.ts DESC
  `, [eui, eui6, nombre, horas]);

  const sensores = r.rows.map(row => ({
    id: row.device_id,
    name: row.name,
    dev_eui: row.dev_eui,
    lat: row.latitude_current != null ? Number(row.latitude_current) : null,
    lng: row.longitude_current != null ? Number(row.longitude_current) : null,
    snr: row.snr ?? null,
    rssi: row.rssi ?? null,
    ts: row.ts,
  }));

  return { total: sensores.length, sensores };
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
           AND t.ts >= (now() AT TIME ZONE 'UTC') - INTERVAL '7 day'
           AND t.object IS NOT NULL
           AND (t.object->>'operatingMode' IS NOT NULL
             OR t.object->'systemStatus'->>'operatingMode' IS NOT NULL)
         ORDER BY t.ts DESC LIMIT 1),
        gps.operating_mode,
        'sin datos'
      ) as operating_mode,
      (SELECT t.object->>'voltage_mV'::text
       FROM telemetry_data_all t
       WHERE t.device_id = d.id AND t.object IS NOT NULL
         AND t.ts >= (now() AT TIME ZONE 'UTC') - INTERVAL '7 day'
       ORDER BY t.ts DESC LIMIT 1) as last_value,
      -- Batería de la estación (banco de 12 V que reporta el MPPT). Los gateways no tienen
      -- telemetría propia: para ellos se lee la del lector asignado (id_device_father).
      -- Solo los últimos 7 días: una lectura vieja no es la batería actual.
      (SELECT (t.object->'Mppt'->>'batteryVoltage_V')::float8
       FROM telemetry_data_all t
       WHERE t.device_id = CASE WHEN d.type_device = 'Gateway' THEN COALESCE(d.id_device_father, d.id) ELSE d.id END
         AND t.object->'Mppt'->>'batteryVoltage_V' IS NOT NULL
         AND t.ts >= (now() AT TIME ZONE 'UTC') - INTERVAL '7 day'
       ORDER BY t.ts DESC LIMIT 1) as battery_v,
      -- ¿Tiene CA 220? Se lee el cargador (BlueSmartIP67) del lector asignado al gateway:
      -- voltaje > 0 = conectado a la red; 0 o sin dato = va con panel solar.
      (SELECT (t.object->'BlueSmartIP67'->>'voltaje_V')::float8
       FROM telemetry_data_all t
       WHERE t.device_id = CASE WHEN d.type_device = 'Gateway' THEN COALESCE(d.id_device_father, d.id) ELSE d.id END
         AND t.object->'BlueSmartIP67'->>'voltaje_V' IS NOT NULL
         AND t.ts >= (now() AT TIME ZONE 'UTC') - INTERVAL '7 day'
       ORDER BY t.ts DESC LIMIT 1) as grid_v
    FROM devices d
    LEFT JOIN gps_device gps ON d.id = gps.id
    WHERE 1=1${filter} ORDER BY d.name ASC
  `, p);
  return r.rows;
};

// ─── Telemetría de un dispositivo ──
export const getMonitorDeviceTelemetryService = async (deviceId, { from, to, limit = 1000, offset = 0, sample = 0 }) => {
  const rangeParams = [deviceId];
  let filter = '';
  if (from) { rangeParams.push(from); filter += ` AND ts >= $${rangeParams.length}`; }
  if (to) { rangeParams.push(to); filter += ` AND ts <= $${rangeParams.length}`; }

  const count = await pool.query(`
    SELECT COUNT(*) as total FROM telemetry_data_all WHERE device_id = $1${filter}
  `, rangeParams);

  // Modo gráfico: reparte ~`sample` filas sobre TODO el rango (antes se traían solo
  if (sample > 0) {
    const telemetry = await pool.query(`
      WITH rango AS (
        SELECT id, ts, object, rxinfo,
               row_number() OVER (ORDER BY ts) AS rn,
               count(*) OVER () AS total
        FROM telemetry_data_all
        WHERE device_id = $1${filter}
      )
      SELECT id, ts, object, rxinfo
      FROM rango
      WHERE total <= $${rangeParams.length + 1}
         OR (rn - 1) % CEIL(total::numeric / $${rangeParams.length + 1}) = 0
      ORDER BY ts ASC
    `, [...rangeParams, sample]);
    return { telemetry: telemetry.rows, total: parseInt(count.rows[0].total) };
  }

  const telemetry = await pool.query(`
    SELECT id, ts, object, rxinfo
    FROM telemetry_data_all
    WHERE device_id = $1${filter}
    ORDER BY ts DESC LIMIT $${rangeParams.length + 1} OFFSET $${rangeParams.length + 2}
  `, [...rangeParams, limit, offset]);

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

// ─── Uptime de gateways (columna "Uptime 7 días" de la tabla del panel técnico) ──
export const getMonitorGatewaysUptimeService = async (dias, companyIds) => {
  const n = Math.min(Math.max(parseInt(dias) || 7, 1), 90);

  const params = [n];
  let filter = '';
  if (companyIds?.length) { params.push(companyIds); filter = ` AND d.company_id = ANY($${params.length}::int[])`; }

  const r = await pool.query(`
    WITH p AS (
      SELECT (now() AT TIME ZONE 'UTC')                             AS hasta,
             (now() AT TIME ZONE 'UTC') - ($1::int * INTERVAL '1 day') AS desde
    )
    SELECT d.id, d.name, d.dev_eui, d.is_active, d.last_seen, p.desde, p.hasta,
           a.id AS alerta_id,
           GREATEST(a.created_at, p.desde)                      AS caida_desde,
           LEAST(COALESCE(a.resolved_at, p.hasta), p.hasta)      AS caida_hasta
    FROM devices d
    CROSS JOIN p
    LEFT JOIN alerts a ON a.device_id = d.id
      AND a.type = 'desconexionGW'
      AND GREATEST(a.created_at, p.desde) < LEAST(COALESCE(a.resolved_at, p.hasta), p.hasta)
    WHERE d.type_device = 'Gateway'${filter}
    ORDER BY d.name, a.created_at
  `, params);

  const porGateway = new Map();
  for (const row of r.rows) {
    if (!porGateway.has(row.id)) {
      porGateway.set(row.id, {
        id: row.id,
        name: row.name,
        dev_eui: row.dev_eui,
        is_active: row.is_active,
        last_seen: row.last_seen,
        intervalos: [],
      });
    }
    if (row.alerta_id != null) {
      porGateway.get(row.id).intervalos.push({ start: row.caida_desde, end: row.caida_hasta });
    }
  }

  const primera = r.rows[0];
  return {
    dias: n,
    desde: primera?.desde ?? null,
    hasta: primera?.hasta ?? null,
    gateways: [...porGateway.values()],
  };
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
    pool.query(`SELECT COUNT(DISTINCT t.device_id) as activos FROM telemetry_data_all t JOIN devices d ON t.device_id = d.id WHERE t.ts >= ${DAY_START_UTC(TODAY_CL)}${filter}`, p),
    pool.query(`SELECT a.type, COUNT(*) as total FROM alerts a JOIN devices d ON a.device_id = d.id WHERE a.created_at >= ${DAY_START_UTC(TODAY_CL)} - INTERVAL '30 days'${filter.replace('d.', 'd.')} GROUP BY a.type`, p),
    pool.query(`SELECT d.id, d.name, d.type_device, COUNT(a.id) as total FROM alerts a JOIN devices d ON a.device_id = d.id WHERE a.created_at >= ${DAY_START_UTC(TODAY_CL)} - INTERVAL '30 days'${filter.replace('d.', 'd.')} GROUP BY d.id, d.name, d.type_device ORDER BY total DESC LIMIT 5`, p),
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
               -- tracking_alerts.timestamp es TIMESTAMP sin zona y guarda UTC. Dentro de un
               -- json_build_object el driver NO aplica el parser de fechas, así que se formatea
               -- como ISO con 'Z'; sin eso el navegador lo interpretaba como hora local.
               'timestamp', to_char(ta.timestamp, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
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
