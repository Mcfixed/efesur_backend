import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../config/auth.js';

/**
 * Middleware de autenticación.
 * Verifica la sesión del usuario via better-auth.
 * Añade req.user y req.session si es válida.
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
    next();
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
};
