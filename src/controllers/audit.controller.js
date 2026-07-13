import { getLogs } from '../services/audit.service.js';
import { success } from '../utils/response.js';

export const getAuditLogs = async (req, res, next) => {
  try {
    const { limit, offset, userId, action, from, to } = req.query;
    const data = await getLogs({
      limit: parseInt(limit) || 50,
      offset: parseInt(offset) || 0,
      userId,
      action,
      from,
      to,
    });
    success(res, data);
  } catch (error) {
    next(error);
  }
};
