import pg from 'pg';
import config from './index.js';

const { Pool } = pg;

// Forzar TIMESTAMP (sin timezone) a interpretarse siempre como UTC
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
  // Detecta sockets muertos en ~10 s (el keepalive de Postgres es de 2 h)
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  application_name: 'efesur-backend',
});

// Todas las conexiones trabajan en UTC.
pool.on('connect', (client) => {
  client.query("SET timezone = 'UTC'").catch(err => {
    console.error('Error setting timezone on client:', err.message);
  });
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  // No matamos el proceso — el pool reconecta automáticamente
});

// Un corte de red con la base no es un error de negocio: se reintenta o se responde 503.
const CODIGOS_DE_RED = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'EHOSTUNREACH', 'ENETUNREACH'];
const RX_CONEXION = /connection terminated|connection error|timeout exceeded when trying to connect|client has encountered a connection error|server closed the connection|not queryable|socket hang up/i;

export const esErrorDeConexion = (err) => {
  if (!err) return false;
  if (CODIGOS_DE_RED.includes(err.code)) return true;
  return RX_CONEXION.test(String(err.message || ''));
};

// Saca del pool las conexiones que murieron (si no, quedan contadas y lo llenan de fantasmas).
export const podarClientesMuertos = () => {
  const clientes = pool._clients || [];
  const muertos = clientes.filter((c) => c._ending || c._ended || c._queryable === false);
  if (muertos.length === 0) return 0;

  pool._clients = clientes.filter((c) => !muertos.includes(c));
  if (Array.isArray(pool._idle)) {
    pool._idle = pool._idle.filter((item) => !muertos.includes(item.client));
  }
  for (const c of muertos) {
    try { c.end(() => {}); } catch { /* ya estaba cerrada */ }
  }
  return muertos.length;
};

export default pool;