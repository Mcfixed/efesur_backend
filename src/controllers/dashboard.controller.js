import * as dashboardService from '../services/dashboard.service.js';
import * as response from '../utils/response.js';

export const getDashboardData = async (req, res, next) => {
  try {
    const [gpsDevices, criticalAlerts, atencionAlerts] = await Promise.all([
      dashboardService.getAllGpsDevices(),
      dashboardService.getCriticalAlerts(),
      dashboardService.getAtencionAlerts()
    ]);

    response.success(res, {
      summary: {
        totalGpsDevices: gpsDevices.rows.length,
        criticalAlertsCount: criticalAlerts.rows.length,
        atencionAlertsCount: atencionAlerts.rows.length
      },
      devices: gpsDevices.rows,
      alerts: {
        critical: criticalAlerts.rows,
        atencion: atencionAlerts.rows
      },
    });
  } catch (error) {
    next(error);
  }
};

export const resolveAlert = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user.id; // Usuario autenticado desde la sesión

    const result = await dashboardService.resolveAlertById(id, userId, reason);

    if (result.rowCount === 0) {
      return response.notFound(res, 'Alert not found or not critical');
    }

    response.success(res, {
      message: 'Alert resolved successfully',
      alert: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
};

export const getDevicesLocations = async (req, res, next) => {
  try {
    const result = await dashboardService.getDevicesLocations();
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
    const result = await dashboardService.getGatewayStatus();
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
    const validTypes = ['critica', 'atencion', 'gateways'];
    const validRanges = ['1h', '24h', '7d', '30d', 'total'];

    if (!validTypes.includes(type)) {
      return response.badRequest(res, 'Invalid alert type');
    }
    if (!validRanges.includes(range)) {
      return response.badRequest(res, 'Invalid range');
    }

    const result = await dashboardService.getAlertHistory(type, range);
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

    const result = await dashboardService.getAlertTimeline(range);

    const criticalActive = result.rows.filter(r => r.priority === 0).length;
    const atencionActive = result.rows.filter(r => r.priority === 1).length;
    const resolvedCount = result.rows.filter(r => r.priority === 2).length;

    response.success(res, {
      total: result.rows.length,
      summary: { criticalActive, atencionActive, resolved: resolvedCount },
      alerts: result.rows,
    });
  } catch (error) {
    next(error);
  }
};