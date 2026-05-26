import express from 'express';
import { searchDevices, getDeviceTelemetry, getDeviceTelemetryStats, getAllDeviceTypes } from '../controllers/telemetry.controller.js';
import { telemetryValidation, validate } from '../middleware/validation.js';

const router = express.Router();

router.get('/devices/types', getAllDeviceTypes);
router.get('/devices/search', telemetryValidation.search, validate, searchDevices);
router.get('/devices/:deviceId/telemetry', telemetryValidation.telemetry, validate, getDeviceTelemetry);
router.get('/devices/:deviceId/stats', telemetryValidation.stats, validate, getDeviceTelemetryStats);

export default router;