import express from 'express';
import { searchDevices, getDeviceTelemetry, getDeviceTelemetryStats, getAllDeviceTypes, getSensorSummary, getDevicesList, getGpsDailyReview, getGpsDailyDetail, getAllDevicesReport, getLatestTelemetry, getDeviceAlerts, getGatewayPositions } from '../controllers/telemetry.controller.js';
import { telemetryValidation, validate } from '../middleware/validation.js';

const router = express.Router();

router.get('/summary', getSensorSummary);
router.get('/devices', getDevicesList);
router.get('/devices/report', getAllDevicesReport);
router.get('/devices/latest', getLatestTelemetry);
router.get('/devices/gps-review', getGpsDailyReview);
router.get('/devices/gps-review/:date', getGpsDailyDetail);
router.get('/devices/types', getAllDeviceTypes);
router.get('/devices/search', telemetryValidation.search, validate, searchDevices);
router.get('/devices/:deviceId/telemetry', telemetryValidation.telemetry, validate, getDeviceTelemetry);
router.get('/devices/:deviceId/stats', telemetryValidation.stats, validate, getDeviceTelemetryStats);
router.get('/devices/:deviceId/alerts', getDeviceAlerts);
router.get('/gateways/positions', getGatewayPositions);

export default router;