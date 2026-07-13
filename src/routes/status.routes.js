import { Router } from 'express';
import { getStatusSummary, getActiveSensorsPerDay, getAlertsPerDay, getAlertsCalendar, getAlertsByDate, getAlertTracking } from '../controllers/status.controller.js';

const router = Router();

router.get('/', getStatusSummary);
router.get('/active-sensors', getActiveSensorsPerDay);
router.get('/alerts-per-day', getAlertsPerDay);
router.get('/alerts-calendar', getAlertsCalendar);
router.get('/alerts-by-date', getAlertsByDate);
router.get('/tracking/:id', getAlertTracking);

export default router;
