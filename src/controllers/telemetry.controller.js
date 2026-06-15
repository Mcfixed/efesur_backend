import * as telemetryService from '../services/telemetry.service.js';
import * as response from '../utils/response.js';

export const searchDevices = async (req, res, next) => {
  try {
    const { q, type, companyId, limit = 50, offset = 0 } = req.query;
    const result = await telemetryService.searchDevicesService({ q, type, companyId, companyIds: req.userCompanyIds, limit, offset });
    response.paginatedSuccess(
      res,
      result.devices,
      result.total,
      result.limit,
      result.offset
    );
  } catch (error) {
    next(error);
  }
};

export const getDeviceTelemetry = async (req, res, next) => {
  try {
    const { deviceId } = req.params;
    const { from, to, limit = 100 } = req.query;
    const result = await telemetryService.getDeviceTelemetryService(deviceId, { from, to, limit });
    response.success(res, {
      telemetry: result.telemetry,
      stats: result.stats,
      limit: result.limit
    });
  } catch (error) {
    next(error);
  }
};

export const getDeviceTelemetryStats = async (req, res, next) => {
  try {
    const { deviceId } = req.params;
    const { hours = 24 } = req.query;
    const result = await telemetryService.getTelemetryStatsService(deviceId, hours);
    response.success(res, {
      deviceId,
      hours: parseInt(hours) || 24,
      stats: result.rows
    });
  } catch (error) {
    next(error);
  }
};

export const getAllDeviceTypes = async (req, res, next) => {
  try {
    const result = await telemetryService.getAllDeviceTypesService();
    response.success(res, result.rows.map(r => r.type_device));
  } catch (error) {
    next(error);
  }
};

export const getSensorSummary = async (req, res, next) => {
  try {
    const summary = await telemetryService.getSensorSummaryService(req.userCompanyIds);
    response.success(res, summary);
  } catch (error) {
    next(error);
  }
};

export const getDevicesList = async (req, res, next) => {
  try {
    const devices = await telemetryService.getDevicesListService(req.userCompanyIds);
    response.success(res, devices);
  } catch (error) {
    next(error);
  }
};

export const getGpsDailyReview = async (req, res, next) => {
  try {
    const data = await telemetryService.getGpsDailyReviewService(req.userCompanyIds);
    response.success(res, data);
  } catch (error) {
    next(error);
  }
};

export const getGpsDailyDetail = async (req, res, next) => {
  try {
    const { date } = req.params;
    const data = await telemetryService.getGpsDailyDetailService(date, req.userCompanyIds);
    response.success(res, data);
  } catch (error) {
    next(error);
  }
};

export const getAllDevicesReport = async (req, res, next) => {
  try {
    const data = await telemetryService.getAllDevicesLastTelemetryService(req.userCompanyIds);
    response.success(res, data);
  } catch (error) {
    next(error);
  }
};