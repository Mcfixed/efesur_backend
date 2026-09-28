import pg from 'pg';
import config from './src/config/index.js';

const client = new pg.Client({
  host: config.db.host, port: config.db.port, database: config.db.database,
  user: config.db.user, password: config.db.password,
});
await client.connect();
await client.query("SET timezone = 'UTC'");

const cols = await client.query(`
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name = 'telemetry_data_all' ORDER BY ordinal_position`);
console.log('COLUMNAS telemetry_data_all:');
for (const c of cols.rows) console.log(`  ${c.column_name} (${c.data_type})`);

console.log('\nAHORA:', (await client.query(`SELECT now()::text AS utc, (now() AT TIME ZONE 'America/Santiago')::text AS chile`)).rows[0]);

// Muestras por día, para detectar un cambio de convención de fecha
const r = await client.query(`
  SELECT date_trunc('day', ts)::date::text AS dia,
         COUNT(*) AS filas,
         MIN(ts)::text AS primera,
         MAX(ts)::text AS ultima
  FROM telemetry_data_all
  WHERE device_id = 279 AND ts >= '2026-09-20'
  GROUP BY 1 ORDER BY 1`);
console.log('\nLECTOR 279 por día (ts crudo):');
for (const x of r.rows) console.log(`  ${x.dia} · ${x.filas} filas · ${x.primera} → ${x.ultima}`);

await client.end();
