/** Análisis: distribución de RSSI por gateway y por tipo de equipo. Solo lectura. */
import pool from './src/config/database.js';

const porGw = await pool.query(`
  WITH arr AS (
    SELECT t.device_id, CASE WHEN jsonb_typeof(t.rxinfo) = 'array' THEN t.rxinfo
                WHEN jsonb_typeof(t.rxinfo) = 'object' THEN jsonb_build_array(t.rxinfo)
                ELSE '[]'::jsonb END AS r
    FROM telemetry_data_all t
    WHERE t.ts > (now() AT TIME ZONE 'UTC') - INTERVAL '24 hours'
  )
  SELECT COALESCE(gw.name, g->>'gatewayId') AS gw,
         count(*)::int AS n,
         round(percentile_cont(0.5) WITHIN GROUP (ORDER BY (g->>'rssi')::float8)::numeric, 1) AS mediana,
         count(*) FILTER (WHERE (g->>'rssi')::float8 > -70)::int AS sobre_70
  FROM arr a
  CROSS JOIN LATERAL jsonb_array_elements(a.r) g
  LEFT JOIN devices gw ON lower(gw.dev_eui) = lower(g->>'gatewayId')
  WHERE g ? 'gatewayId'
  GROUP BY 1
  ORDER BY n DESC
`);
console.log('=== por gateway (24 h) ===');
porGw.rows.forEach(r => console.log(`  ${String(r.gw).padEnd(26)} n=${String(r.n).padStart(5)} mediana=${String(r.mediana).padStart(7)}  >-70: ${r.sobre_70}`));

const porTipo = await pool.query(`
  WITH arr AS (
    SELECT t.device_id, CASE WHEN jsonb_typeof(t.rxinfo) = 'array' THEN t.rxinfo
                WHEN jsonb_typeof(t.rxinfo) = 'object' THEN jsonb_build_array(t.rxinfo)
                ELSE '[]'::jsonb END AS r
    FROM telemetry_data_all t
    WHERE t.ts > (now() AT TIME ZONE 'UTC') - INTERVAL '24 hours'
  )
  SELECT d.type_device,
         count(*)::int AS n,
         round(percentile_cont(0.5) WITHIN GROUP (ORDER BY (g->>'rssi')::float8)::numeric, 1) AS mediana,
         count(*) FILTER (WHERE (g->>'rssi')::float8 > -70)::int AS sobre_70
  FROM arr a JOIN devices d ON d.id = a.device_id
  CROSS JOIN LATERAL jsonb_array_elements(a.r) g
  WHERE g ? 'gatewayId'
  GROUP BY 1 ORDER BY n DESC
`);
console.log('=== por tipo de equipo (24 h) ===');
porTipo.rows.forEach(r => console.log(`  ${String(r.type_device).padEnd(14)} n=${String(r.n).padStart(5)} mediana=${String(r.mediana).padStart(7)}  >-70: ${r.sobre_70}`));

const caso = await pool.query(`
  WITH arr AS (
    SELECT t.device_id, t.ts, CASE WHEN jsonb_typeof(t.rxinfo) = 'array' THEN t.rxinfo
                WHEN jsonb_typeof(t.rxinfo) = 'object' THEN jsonb_build_array(t.rxinfo)
                ELSE '[]'::jsonb END AS r
    FROM telemetry_data_all t
    WHERE t.ts > (now() AT TIME ZONE 'UTC') - INTERVAL '7 days'
  )
  SELECT d.name, d.type_device, a.ts, jsonb_pretty(a.r) AS rx
  FROM arr a JOIN devices d ON d.id = a.device_id
  CROSS JOIN LATERAL jsonb_array_elements(a.r) g
  WHERE (g->>'rssi')::float8 > -20
  ORDER BY a.ts DESC LIMIT 2
`);
caso.rows.forEach(r => {
  console.log(`=== ${r.name} (${r.type_device}) ${r.ts.toISOString()} ===`);
  console.log(r.rx.slice(0, 1200));
});

await pool.end();
