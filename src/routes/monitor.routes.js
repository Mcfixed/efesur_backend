import { Router } from 'express';
import { getSummary, getActiveSensors, getAlertsPerDay, getCalendar, getAlertsByDate, getDevices, getDeviceTelemetry, getDeviceAlerts, getGatewayPositions, getAlertTracking, getLatestTelemetry, getReport, getReportBattery, getReportConnectivity, getReportExecutive, getReportAlerts, getReportTemperature, getReportGps, getReportGateway, getReportComparative, getReportGatewayStats } from '../controllers/monitor.controller.js';

const router = Router();

router.get('/summary', getSummary);
router.get('/active-sensors', getActiveSensors);
router.get('/alerts-per-day', getAlertsPerDay);
router.get('/calendar', getCalendar);
router.get('/alerts-by-date', getAlertsByDate);
router.get('/devices', getDevices);
router.get('/devices/:id/telemetry', getDeviceTelemetry);
router.get('/devices/:id/alerts', getDeviceAlerts);
router.get('/gateways/positions', getGatewayPositions);
router.get('/tracking/:id', getAlertTracking);
router.get('/devices/latest', getLatestTelemetry);
router.post('/report', getReport);
router.post('/report/battery', getReportBattery);
router.post('/report/connectivity', getReportConnectivity);
router.get('/report/executive', getReportExecutive);
router.post('/report/alerts', getReportAlerts);
router.post('/report/temperature', getReportTemperature);
router.post('/report/gps', getReportGps);
router.get('/report/gateway', getReportGateway);
router.post('/report/gateway-stats', getReportGatewayStats);
router.post('/report/comparative', getReportComparative);

export default router;
