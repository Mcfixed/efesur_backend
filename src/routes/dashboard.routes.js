import express from 'express';
import { getDashboardData, resolveAlert, getDevicesLocations, getGatewayStatus, getAlertHistory, getAlertTimeline } from '../controllers/dashboard.controller.js';
import { alertValidation, validate } from '../middleware/validation.js';

const router = express.Router();

router.get('/', getDashboardData);
router.get('/devices-locations', getDevicesLocations);
router.get('/gateways', getGatewayStatus);
router.get('/alerts/history', getAlertHistory);
router.get('/alerts/timeline', getAlertTimeline);
router.post('/alerts/:id/resolve', alertValidation.resolve, validate, resolveAlert);

export default router;