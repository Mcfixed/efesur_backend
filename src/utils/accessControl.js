import pool from '../config/database.js';

// Control de acceso multi-tenant. req.userCompanyIds (middleware/auth.js):
// superadmin → undefined (ve todo), con empresas → [ids], sin empresas → [-1].

export const isSuperAdmin = (req) => req.user?.role === 'superadmin';

const forbidden = (msg = 'No tiene acceso a este recurso') => {
  const err = new Error(msg);
  err.status = 403;
  return err;
};

export const assertCompanyAccess = (req, companyId) => {
  if (isSuperAdmin(req)) return;
  const ids = req.userCompanyIds || [];
  if (!ids.includes(Number(companyId))) {
    throw forbidden('No tiene acceso a esta empresa');
  }
};

export const assertDeviceAccess = async (companyIds, deviceId) => {
  if (!companyIds || companyIds.length === 0) return; // superadmin
  const r = await pool.query(
    'SELECT 1 FROM devices WHERE id = $1 AND company_id = ANY($2::int[])',
    [deviceId, companyIds]
  );
  if (r.rows.length === 0) {
    throw forbidden('No tiene acceso a este dispositivo');
  }
};

export const assertDevicesAccess = async (companyIds, deviceIds) => {
  if (!companyIds || companyIds.length === 0) return deviceIds; // superadmin
  if (!Array.isArray(deviceIds) || deviceIds.length === 0) return deviceIds;
  const numericIds = deviceIds.map((id) => Number(id)).filter((id) => Number.isInteger(id));
  const r = await pool.query(
    'SELECT id FROM devices WHERE id = ANY($1::int[]) AND company_id = ANY($2::int[])',
    [numericIds, companyIds]
  );
  const validIds = r.rows.map((row) => row.id);
  const invalid = numericIds.filter((id) => !validIds.includes(id));
  if (invalid.length > 0) {
    throw forbidden('No tiene acceso a algunos de los dispositivos seleccionados');
  }
  return numericIds;
};

export const assertAlertAccess = async (companyIds, alertId) => {
  if (!companyIds || companyIds.length === 0) return; // superadmin
  const r = await pool.query(
    `SELECT 1 FROM alerts a
     JOIN devices d ON a.device_id = d.id
     WHERE a.id = $1 AND d.company_id = ANY($2::int[])`,
    [alertId, companyIds]
  );
  if (r.rows.length === 0) {
    throw forbidden('No tiene acceso a esta alerta');
  }
};

export const assertUserCompanyAccess = async (companyIds, userId) => {
  if (!companyIds || companyIds.length === 0) return; // superadmin
  const r = await pool.query(
    'SELECT 1 FROM companies_users WHERE user_id = $1 AND company_id = ANY($2::int[])',
    [userId, companyIds]
  );
  if (r.rows.length === 0) {
    throw forbidden('No tiene acceso a este usuario');
  }
};

export const assertDevEuisAccess = async (companyIds, devEuis) => {
  if (!companyIds || companyIds.length === 0) return; // superadmin
  if (!Array.isArray(devEuis) || devEuis.length === 0) return;
  const r = await pool.query(
    'SELECT dev_eui FROM devices WHERE dev_eui = ANY($1::text[]) AND company_id = ANY($2::int[])',
    [devEuis, companyIds]
  );
  const valid = r.rows.map((row) => row.dev_eui);
  const invalid = devEuis.filter((eui) => !valid.includes(eui));
  if (invalid.length > 0) {
    throw forbidden('No tiene acceso a algunos de los dispositivos seleccionados');
  }
};

// Uso: router.get('/x', requireRole('superadmin', 'admin_efe'), handler)
export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'No tiene permisos para esta acción' });
  }
  next();
};
