import { log } from '../services/audit.service.js';
import { success } from '../utils/response.js';

const CHIRPSTACK_ADMIN_PASSWORD = process.env.CHIRPSTACK_ADMIN_PASSWORD || 'admin-AstIdi2025';

export const chirpstackAuth = async (req, res) => {
  const { password } = req.body;
  
  if (!password || password !== CHIRPSTACK_ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Contraseña incorrecta' });
  }

  // Registrar acceso
  log({
    userId: req.user?.id,
    userName: req.user?.name,
    action: 'chirpstack_access',
    details: { granted: true },
    ip: req.ip,
  });

  success(res, { token: 'chirpstack-authorized', expiresAt: Date.now() + 3600000 });
};
