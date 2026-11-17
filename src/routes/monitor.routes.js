import { Router } from 'express';
import { getSummary, getActiveSensors, getAlertsPerDay, getCalendar, getAlertsByDate, getDevices, getDeviceTelemetry, getDeviceAlerts, getDeviceTrack, getGatewayPositions, getGatewaySensores, getAlertTracking, getLatestTelemetry, getReport, getReportBattery, getReportConnectivity, getReportExecutive, getReportAlerts, getReportTemperature, getReportGps, getReportGateway, getReportComparative, getReportGatewayStats, getSystemServices, getDayReport, getSatData, getGatewayUptime } from '../controllers/monitor.controller.js';
import { requireRole } from '../utils/accessControl.js';

const router = Router();

router.get('/summary', getSummary);
router.get('/active-sensors', getActiveSensors);
router.get('/alerts-per-day', getAlertsPerDay);
router.get('/day-report', getDayReport);
// Anexo SAT (verificación de funcionamiento): entregable interno, solo superadmin.
router.get('/sat-data', requireRole('superadmin'), getSatData);
router.get('/calendar', getCalendar);
router.get('/alerts-by-date', getAlertsByDate);
router.get('/devices', getDevices);
router.get('/devices/:id/telemetry', getDeviceTelemetry);
router.get('/devices/:id/alerts', getDeviceAlerts);
// Recorrido del tracker (LillieGo): puntos con fix GPS + gateways que recibieron cada punto
router.get('/devices/:id/track', getDeviceTrack);
router.get('/gateways/positions', getGatewayPositions);
router.get('/gateways/uptime', getGatewayUptime);
// Sensores que escuchó un gateway (últimas 24 h por defecto): evita bajar 5000 uplinks al navegador.
router.get('/gateways/:id/sensores', getGatewaySensores);
router.get('/tracking/:id', getAlertTracking);
router.get('/devices/latest', getLatestTelemetry);
router.get('/system/services', getSystemServices);
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
