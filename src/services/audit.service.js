import pool from '../config/database.js';

/**
 * Registra un evento de auditoría en la base de datos.
 * @param {Object} opts
 * @param {string} [opts.userId] - UUID del usuario
 * @param {string} [opts.userName] - Nombre del usuario
 * @param {string} opts.action - Código de la acción (ej: 'create_device', 'chirpstack_login')
 * @param {Object} [opts.details] - JSON con detalles adicionales
 * @param {string} [opts.ip] - Dirección IP
 * @param {string} [opts.path] - Ruta de la API
 * @param {string} [opts.method] - Método HTTP
 */
export const log = async ({ userId, userName, action, details, ip, path, method }) => {
  try {
    await pool.query(`
      INSERT INTO audit_log (user_id, user_name, action, details, ip, path, method)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [userId || null, userName || null, action, details ? JSON.stringify(details) : null, ip || null, path || null, method || null]);
  } catch (error) {
    console.error('[Audit] Error al registrar:', error.message);
  }
};

/**
 * Obtiene logs de auditoría con paginación y filtros.
 */
export const getLogs = async ({ limit = 50, offset = 0, userId, action, from, to } = {}) => {
  const conditions = [];
  const params = [];
  let idx = 0;

  if (userId) { idx++; params.push(userId); conditions.push(`user_id = $${idx}`); }
  if (action) { idx++; params.push(action); conditions.push(`action = $${idx}`); }
  if (from) { idx++; params.push(from); conditions.push(`created_at >= $${idx}`); }
  if (to) { idx++; params.push(to); conditions.push(`created_at <= $${idx}`); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await pool.query(`SELECT COUNT(*) as total FROM audit_log ${where}`, params);
  const total = parseInt(countResult.rows[0].total);

  idx++; params.push(limit);
  idx++; params.push(offset);

  const result = await pool.query(`
    SELECT id, user_id, user_name, action, details, ip, path, method, created_at
    FROM audit_log ${where}
    ORDER BY created_at DESC
    LIMIT $${idx - 1} OFFSET $${idx}
  `, params);

  return { logs: result.rows, total };
};
