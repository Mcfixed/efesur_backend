import {
  getMonitorSummaryService, getMonitorActiveSensorsService, getMonitorAlertsPerDayService,
  getMonitorCalendarService, getMonitorAlertsByDateService, getMonitorDevicesService,
  getMonitorDeviceTelemetryService, getMonitorDeviceAlertsService, getMonitorGatewayPositionsService,
  getMonitorAlertTrackingService, getMonitorLatestTelemetryService, getMonitorReportService,
  getMonitorReportBatteryService, getMonitorReportConnectivityService,
  getMonitorReportExecutiveService, getMonitorReportAlertsService,
  getMonitorReportTemperatureService, getMonitorReportGpsService,
  getMonitorReportGatewayService, getMonitorReportComparativeService,
  getMonitorReportGatewayStatsService,
} from '../services/monitor.service.js';
import { success } from '../utils/response.js';

export const getSummary = async (req, res, next) => {
  try { const data = await getMonitorSummaryService(req.userCompanyIds); success(res, data); }
  catch (e) { next(e); }
};

export const getActiveSensors = async (req, res, next) => {
  try { const data = await getMonitorActiveSensorsService(req.userCompanyIds); success(res, data); }
  catch (e) { next(e); }
};

export const getAlertsPerDay = async (req, res, next) => {
  try { const data = await getMonitorAlertsPerDayService(req.userCompanyIds); success(res, data); }
  catch (e) { next(e); }
};

export const getCalendar = async (req, res, next) => {
  try { const { year, month } = req.query; const data = await getMonitorCalendarService(req.userCompanyIds, parseInt(year), parseInt(month)); success(res, data); }
  catch (e) { next(e); }
};

export const getAlertsByDate = async (req, res, next) => {
  try { const { date } = req.query; const data = await getMonitorAlertsByDateService(req.userCompanyIds, date); success(res, data); }
  catch (e) { next(e); }
};

export const getDevices = async (req, res, next) => {
  try { const data = await getMonitorDevicesService(req.userCompanyIds); success(res, data); }
  catch (e) { next(e); }
};

export const getDeviceTelemetry = async (req, res, next) => {
  try { const { id } = req.params; const { from, limit, offset } = req.query; const data = await getMonitorDeviceTelemetryService(parseInt(id), { from, limit: parseInt(limit) || 200, offset: parseInt(offset) || 0 }); success(res, data); }
  catch (e) { next(e); }
};

export const getDeviceAlerts = async (req, res, next) => {
  try { const { id } = req.params; const data = await getMonitorDeviceAlertsService(parseInt(id), req.userCompanyIds); success(res, data); }
  catch (e) { next(e); }
};

export const getGatewayPositions = async (req, res, next) => {
  try { const data = await getMonitorGatewayPositionsService(); success(res, data); }
  catch (e) { next(e); }
};
export const getAlertTracking = async (req, res, next) => {
  try { const { id } = req.params; const data = await getMonitorAlertTrackingService(parseInt(id)); success(res, data); }
  catch (e) { next(e); }
};

export const getLatestTelemetry = async (req, res, next) => {
  try { const { limit } = req.query; const data = await getMonitorLatestTelemetryService(parseInt(limit) || 30, req.userCompanyIds); success(res, data); }
  catch (e) { next(e); }
};

export const getReport = async (req, res, next) => {
  try { const { deviceIds, from, to } = req.body; const data = await getMonitorReportService(deviceIds, from, to); success(res, data); }
  catch (e) { next(e); }
};

export const getReportGatewayStats = async (req, res, next) => {
  try { const { deviceIds, from, to } = req.body; const data = await getMonitorReportGatewayStatsService(deviceIds, from, to); success(res, data); }
  catch (e) { next(e); }
};

export const getReportBattery = async (req, res, next) => {
  try { const { deviceIds, from, to } = req.body; const data = await getMonitorReportBatteryService(deviceIds, from, to); success(res, data); }
  catch (e) { next(e); }
};

export const getReportConnectivity = async (req, res, next) => {
  try { const { deviceIds, from, to } = req.body; const data = await getMonitorReportConnectivityService(deviceIds, from, to); success(res, data); }
  catch (e) { next(e); }
};

export const getReportExecutive = async (req, res, next) => {
  try { const data = await getMonitorReportExecutiveService(req.userCompanyIds); success(res, data); }
  catch (e) { next(e); }
};

export const getReportAlerts = async (req, res, next) => {
  try { const { deviceIds, from, to } = req.body; const data = await getMonitorReportAlertsService(deviceIds, from, to); success(res, data); }
  catch (e) { next(e); }
};

export const getReportTemperature = async (req, res, next) => {
  try { const { deviceIds, from, to } = req.body; const data = await getMonitorReportTemperatureService(deviceIds, from, to); success(res, data); }
  catch (e) { next(e); }
};

export const getReportGps = async (req, res, next) => {
  try { const { deviceIds, from, to } = req.body; const data = await getMonitorReportGpsService(deviceIds, from, to); success(res, data); }
  catch (e) { next(e); }
};

export const getReportGateway = async (req, res, next) => {
  try { const data = await getMonitorReportGatewayService(req.userCompanyIds); success(res, data); }
  catch (e) { next(e); }
};

export const getReportComparative = async (req, res, next) => {
  try { const { deviceIds, period1Start, period1End, period2Start, period2End } = req.body; const data = await getMonitorReportComparativeService(deviceIds, period1Start, period1End, period2Start, period2End); success(res, data); }
  catch (e) { next(e); }
};