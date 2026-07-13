import { log } from '../services/audit.service.js';

/**
 * Middleware que audita automáticamente requests a rutas protegidas.
 * Se usa en rutas CRUD de configuración.
 */
export const auditMiddleware = (action) => {
  return (req, res, next) => {
    // Capturar el método original send/json para auditar después de la respuesta
    const originalJson = res.json.bind(res);
    res.json = function (body) {
      log({
        userId: req.user?.id,
        userName: req.user?.name,
        action,
        details: {
          method: req.method,
          path: req.originalUrl,
          body: sanitizeBody(req.body),
          statusCode: res.statusCode,
        },
        ip: req.ip,
        path: req.originalUrl,
        method: req.method,
      });
      return originalJson(body);
    };
    next();
  };
};

/** Limpia campos sensibles antes de auditar */
function sanitizeBody(body) {
  if (!body || typeof body !== 'object') return body;
  const sanitized = { ...body };
  delete sanitized.password;
  delete sanitized.confirmPassword;
  delete sanitized.currentPassword;
  return sanitized;
}
