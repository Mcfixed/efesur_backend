import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../config/auth.js';
import pool, { esErrorDeConexion } from '../config/database.js';

let cacheBase = { hasta: 0, ok: true };

function respuesta503(res, contexto, err) {
  console.error(`[auth] base de datos no disponible al ${contexto}: ${err?.message || err}`);
  res.set('Retry-After', '3');
  return res.status(503).json({ error: 'Base de datos no disponible', code: 'DB_UNAVAILABLE' });
}

/** Fallo al validar sesión: 503 si la base no responde (no cerrar la sesión), 500 si es un bug. */
function responderFallo(res, err, contexto) {
  if (esErrorDeConexion(err)) return respuesta503(res, contexto, err);
  console.error(`[auth] error inesperado al ${contexto}: ${err?.message || err}`);
  return res.status(500).json({ error: 'Error interno' });
}

// El cliente creía tener sesión (cookie de better-auth o Bearer)
function traeSesion(req) {
  const cookie = String(req.headers.cookie || '');
  const auth = String(req.headers.authorization || '');
  return /session_token|auth_token/i.test(cookie) || /^Bearer\s+\S/i.test(auth);
}

// ¿La base responde? better-auth devuelve null (no lanza) cuando falla la consulta de sesión,
// así que sin este chequeo un corte de base se respondería como 401 y el front cerraría la sesión.
async function baseDisponible() {
  const ahora = Date.now();
  if (ahora < cacheBase.hasta) return cacheBase.ok;
  try {
    await pool.query('SELECT 1');
    cacheBase = { hasta: ahora + 3000, ok: true };
    return true;
  } catch (err) {
    const caida = esErrorDeConexion(err);
    // Si está caída se recuerda 15 s, para que el resto de los requests fallen rápido
    cacheBase = { hasta: ahora + (caida ? 15000 : 3000), ok: !caida };
    if (caida) console.error(`[auth] base de datos no disponible: ${err?.message || err}`);
    return !caida;
  }
}

/** Agrega req.user, req.session y req.userCompanyIds. */
export const requireAuth = async (req, res, next) => {
  let session;
  try {
    session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
  } catch (err) {
    return responderFallo(res, err, 'validar la sesión');
  }

  if (!session) {
    if (traeSesion(req) && !(await baseDisponible())) {
      return respuesta503(res, 'validar la sesión');
    }
    return res.status(401).json({ error: 'Unauthorized' });
  }

  req.user = session.user;
  req.session = session.session;

  if (session.user.role !== 'superadmin') {
    try {
      const result = await pool.query(
        'SELECT company_id FROM companies_users WHERE user_id = $1 AND is_active = true',
        [session.user.id]
      );
      req.userCompanyIds = result.rows.map(r => r.company_id);
      // Sin empresas se usa un ID imposible para que el filtro ANY no devuelva nada
      if (!req.userCompanyIds.length) {
        req.userCompanyIds = [-1];
      }
    } catch (err) {
      return responderFallo(res, err, 'obtener las empresas del usuario');
    }
  }

  next();
};
