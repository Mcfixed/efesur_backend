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
    const { reason, userId } = req.body;

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