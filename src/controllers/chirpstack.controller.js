import { getGpsDevicesService, sendCommandService, COMMANDS } from '../services/chirpstack.service.js';
import { success } from '../utils/response.js';
import { log } from '../services/audit.service.js';

export const getCommands = async (req, res) => {
  success(res, Object.entries(COMMANDS).map(([key, cmd]) => ({
    key,
    label: cmd.label,
    hex: cmd.hex,
    fPort: cmd.fPort,
    group: cmd.group,
  })));
};

export const getGpsDevices = async (req, res, next) => {
  try {
    const data = await getGpsDevicesService(req.userCompanyIds);
    success(res, data);
  } catch (error) {
    next(error);
  }
};

export const sendCommand = async (req, res, next) => {
  try {
    const { devEuis, command } = req.body;
    if (!devEuis || !Array.isArray(devEuis) || devEuis.length === 0) {
      return res.status(400).json({ error: 'Se requiere un array de devEuis' });
    }
    if (!command || !COMMANDS[command]) {
      return res.status(400).json({ error: `Comando inválido. Válidos: ${Object.keys(COMMANDS).join(', ')}` });
    }
    const data = await sendCommandService(devEuis, command);
    log({
      userId: req.user?.id,
      userName: req.user?.name,
      action: 'chirpstack_send_command',
      details: { command, devEuis, resultados: data },
      ip: req.ip,
    });
    success(res, data);
  } catch (error) {
    next(error);
  }
};
