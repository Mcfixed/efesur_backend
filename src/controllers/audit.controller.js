import { getLogs } from '../services/audit.service.js';
import { success } from '../utils/response.js';
import { isSuperAdmin } from '../utils/accessControl.js';
import pool from '../config/database.js';

export const getAuditLogs = async (req, res, next) => {
  try {
    const { limit, offset, userId, action, from, to } = req.query;
    const filters = {
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0,
      userId,
      action,
      from,
      to,
    };

    // Superadmin ve todos los logs. Los demás solo ven logs de usuarios de
    // sus propias empresas (o de sí mismos si no están asignados a ninguna).
    if (!isSuperAdmin(req)) {
      const companyIds = req.userCompanyIds && req.userCompanyIds[0] !== -1
        ? req.userCompanyIds
        : [];
      if (companyIds.length) {
        const r = await pool.query(
          'SELECT DISTINCT user_id FROM companies_users WHERE company_id = ANY($1::int[])',
          [companyIds]
        );
        filters.userIds = r.rows.map((row) => row.user_id);
      } else {
        // Sin empresas asignadas: solo sus propios logs
        filters.userIds = [req.user.id];
      }
    }

    const data = await getLogs(filters);
    success(res, data);
  } catch (error) {
    next(error);
  }
};
