import pg from 'pg';
import config from './index.js';

const { Pool } = pg;

// Forzar TIMESTAMP (sin timezone) a interpretarse siempre como UTC
// OID 1114 = timestamp, OID 1184 = timestamptz
pg.types.setTypeParser(1114, (str) => new Date(str + 'Z'));

const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Configurar zona horaria Chile para todas las conexiones
pool.on('connect', (client) => {
  client.query("SET timezone = 'America/Santiago'").catch(err => {
    console.error('Error setting timezone on client:', err.message);
  });
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  // No matamos el proceso — el pool reconecta automáticamente
});

export default pool;