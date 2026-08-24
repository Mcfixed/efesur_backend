import * as dashboardService from '../services/dashboard.service.js';
import * as response from '../utils/response.js';
import { assertAlertAccess } from '../utils/accessControl.js';

export const getDashboardData = async (req, res, next) => {
  try {
    const [gpsDevices, criticalAlerts, atencionAlerts, desconexionAlerts, movimientosAnomalos, aperturaAlerts, presenciaAlerts, desconexion220Alerts, desconexionbatGWAlerts] = await Promise.all([
      dashboardService.getAllGpsDevices(req.userCompanyIds),
      dashboardService.getCriticalAlerts(req.userCompanyIds),
      dashboardService.getAtencionAlerts(req.userCompanyIds),
      dashboardService.getDisconexionGWAlerts(req.userCompanyIds),
      dashboardService.getMovimientosAnomalosAlerts(req.userCompanyIds),
      dashboardService.getAperturaAlerts(req.userCompanyIds),
      dashboardService.getPresenciaAlerts(req.userCompanyIds),
      dashboardService.getLectorDisconexionAlerts(req.userCompanyIds, 'desconexion220'),
      dashboardService.getLectorDisconexionAlerts(req.userCompanyIds, 'desconexionbatGW'),
    ]);

    response.success(res, {
      summary: {
        totalGpsDevices: gpsDevices.rows.length,
        criticalAlertsCount: criticalAlerts.rows.length,
        atencionAlertsCount: atencionAlerts.rows.length,
        desconexionGWCount: desconexionAlerts.rows.length + desconexion220Alerts.rows.length + desconexionbatGWAlerts.rows.length,
        movimientosAnomalosCount: movimientosAnomalos.rows.length,
      },
      devices: gpsDevices.rows,
      alerts: {
        critical: criticalAlerts.rows,
        atencion: atencionAlerts.rows,
        desconexionGW: desconexionAlerts.rows,
        desconexion220: desconexion220Alerts.rows,
        desconexionbatGW: desconexionbatGWAlerts.rows,
        movimientos_anomalos: movimientosAnomalos.rows,
        apertura: aperturaAlerts.rows,
        presencia: presenciaAlerts.rows,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const resolveAlert = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason, action } = req.body;
    const userId = req.user.id;

    // Validar que la alerta pertenezca a una empresa del usuario
    await assertAlertAccess(req.userCompanyIds, parseInt(id));

    // Obtener dev_eui del dispositivo asociado a la alerta
    const pool = (await import('../config/database.js')).default;
    const deviceResult = await pool.query(
      'SELECT d.dev_eui FROM alerts a JOIN devices d ON a.device_id = d.id WHERE a.id = $1',
      [id]
    );
    const devEui = deviceResult?.rows?.[0]?.dev_eui;

    let commandSent = null;
    let result = null;

    if (action === 'abortar' || action === 'persecucion') {
      // Regla de estados: si la alerta ya fue ABORTADA es terminal (el sensor volvió a normal),
      // no se aceptan más comandos. En persecución SÍ se puede abortar después.
      const stateRes = await pool.query(
        `SELECT metadata->>'command' AS cmd FROM alerts WHERE id = $1`,
        [id]
      );
      if (stateRes.rows[0]?.cmd === 'abortar') {
        return res.status(409).json({ error: 'La alerta ya fue abortada; no se pueden enviar más comandos' });
      }
      // Solo enviar comando, NO resolver la alerta
      if (devEui) {
        const commandKey = action === 'abortar' ? 'ABORTAR' : 'PERSEGUICION';
        const chirpstackService = await import('../services/chirpstack.service.js');
        await chirpstackService.sendCommandService([devEui], commandKey);
        commandSent = commandKey;
      }
      // Persistir el comando: estado actual (command/command_at) + historial (commands[])
      await pool.query(
        `UPDATE alerts SET metadata = metadata || jsonb_build_object(
           'command', $1::text,
           'command_at', NOW(),
           'commands', COALESCE(metadata->'commands', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('command', $1::text, 'at', NOW()))
         ) WHERE id = $2`,
        [action, id]
      );
      result = { rows: [{ id, action, commandSent, resolved: false }] };
    } else {
      // Resolver la alerta en BD
      result = await dashboardService.resolveAlertById(id, userId, reason);
      if (result.rowCount === 0) {
        return response.notFound(res, 'Alert not found or not critical');
      }
      // Enviar informe de la alerta resuelta (WhatsApp + correo) en segundo plano, sin bloquear la respuesta
      try {
        const reportService = await import('../services/report.service.js');
        reportService.sendCriticalReport(parseInt(id, 10))
          .catch((err) => console.error('[informe] error al generar/enviar:', err));
      } catch (e) {
        console.error('[informe] error al invocar el envío:', e);
      }
    }

    // Auditoría
    const auditLog = (await import('../services/audit.service.js')).log;
    auditLog({
      userId: req.user?.id,
      userName: req.user?.name,
      action: action === 'resolver' ? 'alert_resolve' : `alert_${action}`,
      details: { alertId: id, reason, action: action || 'resolver', commandSent, devEui },
      ip: req.ip,
    });

    response.success(res, {
      message: action === 'resolver' ? 'Alerta resuelta' : `Comando ${commandSent} enviado al sensor`,
      alert: { ...result.rows[0], action: action || 'resolver', commandSent },
    });
  } catch (error) {
    next(error);
  }
};

export const getDevicesLocations = async (req, res, next) => {
  try {
    const result = await dashboardService.getDevicesLocations(req.userCompanyIds);
    response.success(res, {
      count: result.rows.length,
      locations: result.rows
    });
  } catch (error) {
    next(error);
  }
};

export const getGatewayStatus = async (req, res, next) => {
  try {
    const result = await dashboardService.getGatewayStatus(req.userCompanyIds);
    response.success(res, {
      count: result.rows.length,
      gateways: result.rows
    });
  } catch (error) {
    next(error);
  }
};

export const getAlertHistory = async (req, res, next) => {
  try {
    const { type, range } = req.query;
    const validTypes = ['critica', 'atencion', 'gateways', 'movimientos_anomalos', 'apertura', 'presencia', 'desconexion220', 'desconexionbatGW'];
    const validRanges = ['1h', '24h', '7d', '30d', 'total'];

    if (!validTypes.includes(type)) {
      return response.badRequest(res, 'Invalid alert type');
    }
    if (!validRanges.includes(range)) {
      return response.badRequest(res, 'Invalid range');
    }

    const result = await dashboardService.getAlertHistory(type, range, req.userCompanyIds);
    response.success(res, {
      count: result.rows.length,
      alerts: result.rows
    });
  } catch (error) {
    next(error);
  }
};

export const getAlertTimeline = async (req, res, next) => {
  try {
    const { range } = req.query;
    const validRanges = ['1h', '24h', '7d', '30d', 'total'];
    if (!validRanges.includes(range)) {
      return response.badRequest(res, 'Invalid range');
    }

    const result = await dashboardService.getAlertTimeline(range, req.userCompanyIds);

    const criticalActive = result.rows.filter(r => r.priority === 0).length;
    const movimientosActive = result.rows.filter(r => r.priority === 1).length;
    const atencionActive = result.rows.filter(r => r.priority === 2).length;
    const resolvedCount = result.rows.filter(r => r.priority === 3).length;

    response.success(res, {
      total: result.rows.length,
      summary: { criticalActive, movimientosActive, atencionActive, resolved: resolvedCount },
      alerts: result.rows,
    });
  } catch (error) {
    next(error);
  }
};