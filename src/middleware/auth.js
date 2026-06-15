import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../config/auth.js';
import pool from '../config/database.js';

/**
 * Middleware de autenticación.
 * Verifica la sesión del usuario via better-auth.
 * Añade req.user, req.session y req.userCompanyIds si es válida.
 */
export const requireAuth = async (req, res, next) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    req.user = session.user;
    req.session = session.session;

    // Obtener empresas del usuario (solo si no es superadmin)
    if (session.user.role !== 'superadmin') {
      const result = await pool.query(
        'SELECT company_id FROM companies_users WHERE user_id = $1 AND is_active = true',
        [session.user.id]
      );
      req.userCompanyIds = result.rows.map(r => r.company_id);
      // Si el usuario no tiene empresas asignadas, usar un ID imposible
      // para que el filtro SQL (ANY) no retorne ningún resultado
      if (!req.userCompanyIds.length) {
        req.userCompanyIds = [-1];
      }
    }

    next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
};
