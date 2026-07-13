import { getStatusSummaryService, getActiveSensorsPerDayService, getAlertsPerDayService, getAlertsCalendarService, getAlertsByDateService, getAlertTrackingService } from '../services/status.service.js';
import { success } from '../utils/response.js';

export const getStatusSummary = async (req, res, next) => {
  try {
    const data = await getStatusSummaryService(req.userCompanyIds);
    success(res, data);
  } catch (error) {
    next(error);
  }
};

export const getActiveSensorsPerDay = async (req, res, next) => {
  try {
    const data = await getActiveSensorsPerDayService(req.userCompanyIds);
    success(res, data);
  } catch (error) {
    next(error);
  }
};

export const getAlertsPerDay = async (req, res, next) => {
  try {
    const data = await getAlertsPerDayService(req.userCompanyIds);
    success(res, data);
  } catch (error) {
    next(error);
  }
};

export const getAlertsCalendar = async (req, res, next) => {
  try {
    const { year, month } = req.query;
    const data = await getAlertsCalendarService(req.userCompanyIds, parseInt(year), parseInt(month));
    success(res, data);
  } catch (error) {
    next(error);
  }
};

export const getAlertsByDate = async (req, res, next) => {
  try {
    const { date } = req.query;
    const data = await getAlertsByDateService(req.userCompanyIds, date);
    success(res, data);
  } catch (error) {
    next(error);
  }
};

export const getAlertTracking = async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = await getAlertTrackingService(id);
    success(res, data);
  } catch (error) {
    next(error);
  }
};
