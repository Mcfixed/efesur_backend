import express from 'express';
import { getDashboardData, resolveAlert, getDevicesLocations } from '../controllers/dashboard.controller.js';
import { alertValidation, validate } from '../middleware/validation.js';

const router = express.Router();

router.get('/', getDashboardData);
router.get('/devices-locations', getDevicesLocations);
router.post('/alerts/:id/resolve', alertValidation.resolve, validate, resolveAlert);

export default router;