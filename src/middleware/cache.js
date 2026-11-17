/**
 * Caché de respuestas GET en memoria con una sola consulta por ventana (single-flight).
 *
 * Problema que resuelve: el front hace polling cada 10-30 s en varias vistas. Con N usuarios
 * simultáneos, la base se consultaba N veces por ventana. Acá:
 *  - si la entrada está fresca (< ttl) se responde el body YA serializado (nada de DB ni
 *    JSON.stringify de nuevo),
 *  - si otra request idéntica está en curso, se espera su resultado en lugar de consultar otra vez,
 *  - la clave incluye las empresas del usuario para no mezclar datos entre clientes.
 *
 * Se aplica sólo a rutas de lectura (GET); cualquier error o status != 200 no se cachea.
 */

/** Rutas cacheables y su ventana de frescura (ms) */
const RUTAS = [
  { prefijo: '/api/monitor', ttl: 5000 },
  { prefijo: '/api/dashboard', ttl: 8000 },
];

/** Tope de entradas para no crecer sin control */
const MAX_ENTRADAS = 300;
/** Tope de tamaño por respuesta cacheada (2 MB): más grande que eso no se guarda */
const MAX_BYTES = 2 * 1024 * 1024;
/** Tope de memoria total ocupada por la caché (48 MB) */
const MAX_BYTES_TOTAL = 48 * 1024 * 1024;

const store = new Map();    // key -> { body, at, bytes }
const enVuelo = new Map();  // key -> Promise<{ body } | null>
let bytesTotales = 0;
let contador = 0;

function ttlDe(url) {
  return RUTAS.find(r => url.startsWith(r.prefijo))?.ttl ?? 0;
}

function claveDe(req) {
  const empresas = (req.userCompanyIds || []).slice().sort((a, b) => a - b).join(',');
  const rol = req.user?.role || '';
  return `${empresas}|${rol}|${req.originalUrl}`;
}

function borrar(key) {
  const prev = store.get(key);
  if (prev) { bytesTotales -= prev.bytes; store.delete(key); }
}

function guardar(key, body) {
  const bytes = body.length * 2; // los strings JS son UTF-16
  if (bytes > MAX_BYTES) return;
  borrar(key);
  // Evita crecer sin control: saca las entradas más antiguas hasta entrar en el presupuesto
  while (store.size >= MAX_ENTRADAS || bytesTotales + bytes > MAX_BYTES_TOTAL) {
    const primera = store.keys().next().value;
    if (primera === undefined) break;
    borrar(primera);
  }
  store.set(key, { body, at: Date.now(), bytes });
  bytesTotales += bytes;
}

function responder(res, body, etiqueta) {
  res.set('X-Cache', etiqueta);
  res.set('Cache-Control', 'private, max-age=0, must-revalidate');
  return res.type('application/json').send(body);
}

export default function cacheRespuestas(req, res, next) {
  if (req.method !== 'GET') return next();
  const ttl = ttlDe(req.originalUrl);
  if (!ttl) return next();

  // Cada 200 requests se barren las entradas vencidas (sin timers ni trabajo por request)
  if (++contador % 200 === 0) limpiarCacheVencida(120000);

  const key = claveDe(req);
  const ahora = Date.now();
  const hit = store.get(key);

  // 1) Fresco: respuesta inmediata sin tocar la base
  if (hit && ahora - hit.at < ttl) return responder(res, hit.body, 'HIT');

  // 2) Ya hay una consulta igual en curso: se comparte su resultado
  if (enVuelo.has(key)) {
    enVuelo.get(key)
      .then(entry => (entry ? responder(res, entry.body, 'WAIT') : next()))
      .catch(() => next());
    return;
  }

  // 3) Esta request consulta; se captura el body serializado para el caché
  let resolver;
  const promesa = new Promise((r) => { resolver = r; });
  enVuelo.set(key, promesa);

  const sendOriginal = res.send.bind(res);
  let resuelto = false;
  const finalizar = (entry) => {
    if (resuelto) return;
    resuelto = true;
    enVuelo.delete(key);
    resolver(entry);
  };

  res.send = (body) => {
    let entry = null;
    if (res.statusCode === 200 && typeof body === 'string') {
      entry = { body };
      guardar(key, body);
    }
    res.set('X-Cache', 'MISS');
    res.set('Cache-Control', 'private, max-age=0, must-revalidate');
    finalizar(entry);
    return sendOriginal(body);
  };

  // Si el request termina sin pasar por send (error, abort, 304...), se libera el lock
  res.on('close', () => finalizar(null));
  res.on('finish', () => finalizar(null));

  next();
}

/** Limpia entradas vencidas (se llama desde las propias requests, sin timers) */
export function limpiarCacheVencida(maxTtl = 60000) {
  const ahora = Date.now();
  for (const [k, v] of store) if (ahora - v.at > maxTtl) borrar(k);
}
