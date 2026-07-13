import { Router } from 'express';
import { getSummary, getActiveSensors, getAlertsPerDay, getCalendar, getAlertsByDate, getDevices, getDeviceTelemetry, getDeviceAlerts, getGatewayPositions, getAlertTracking, getLatestTelemetry } from '../controllers/monitor.controller.js';

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

export default router;
