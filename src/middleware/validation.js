import { body, param, query, validationResult } from 'express-validator';
import { DEVICE_TYPES_ARRAY, USER_ROLES_ARRAY, PAGINATION, STATS } from '../config/constants.js';

export const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      error: 'Validation failed',
      details: errors.array(),
    });
  }
  next();
};

export const companyValidation = {
  create: [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('rut').trim().notEmpty().withMessage('RUT is required'),
    body('sector').optional().trim(),
    body('color_theme').optional().trim().matches(/^#[0-9A-F]{6}$/i).withMessage('Invalid color format'),
  ],
  update: [
    param('id').isInt().withMessage('Invalid company ID'),
    body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
    body('rut').optional().trim().notEmpty().withMessage('RUT cannot be empty'),
    body('sector').optional().trim(),
    body('color_theme').optional().trim().matches(/^#[0-9A-F]{6}$/i).withMessage('Invalid color format'),
    body('is_active').optional().isBoolean(),
  ],
};

export const userValidation = {
  create: [
    body('email').isEmail().withMessage('Valid email required'),
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('is_superuser').optional().isBoolean(),
  ],
  update: [
    param('id').isUUID().withMessage('Invalid user ID'),
    body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
    body('image').optional().isURL().withMessage('Image must be a valid URL'),
    body('is_superuser').optional().isBoolean(),
  ],
  assignCompany: [
    body('userId').isUUID().withMessage('Valid user ID required'),
    body('companyId').isInt().withMessage('Valid company ID required'),
    body('role').optional().isIn(USER_ROLES_ARRAY).withMessage(`Role must be one of: ${USER_ROLES_ARRAY.join(', ')}`),
  ],
};

export const deviceValidation = {
  create: [
    body('dev_eui').trim().notEmpty().withMessage('Device EUI required'),
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('type_device').isIn(DEVICE_TYPES_ARRAY).withMessage(`Device type must be one of: ${DEVICE_TYPES_ARRAY.join(', ')}`),
    body('company_id').optional().isInt(),
    body('id_device_father').optional().isInt(),
    body('latitude_current').optional().isDecimal({ min: -90, max: 90 }).withMessage('Latitude must be between -90 and 90'),
    body('longitude_current').optional().isDecimal({ min: -180, max: 180 }).withMessage('Longitude must be between -180 and 180'),
  ],
  update: [
    param('id').isInt().withMessage('Invalid device ID'),
    body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
    body('type_device').optional().isIn(DEVICE_TYPES_ARRAY).withMessage(`Device type must be one of: ${DEVICE_TYPES_ARRAY.join(', ')}`),
    body('is_active').optional().isBoolean(),
    body('latitude_current').optional().isDecimal({ min: -90, max: 90 }).withMessage('Latitude must be between -90 and 90'),
    body('longitude_current').optional().isDecimal({ min: -180, max: 180 }).withMessage('Longitude must be between -180 and 180'),
  ],
};

export const alertValidation = {
  resolve: [
    param('id').isInt().withMessage('Invalid alert ID'),
    body('reason').trim().notEmpty().withMessage('Resolution reason required'),
    body('userId').isUUID().withMessage('Valid user ID required'),
  ],
};

export const telemetryValidation = {
  search: [
    query('q').optional().trim().isLength({ max: 255 }).withMessage('Search query too long'),
    query('type').optional().isIn(DEVICE_TYPES_ARRAY).withMessage(`Type must be one of: ${DEVICE_TYPES_ARRAY.join(', ')}`),
    query('companyId').optional().isInt(),
    query('limit')
      .optional()
      .isInt({ min: PAGINATION.MIN_LIMIT, max: PAGINATION.MAX_LIMIT })
      .withMessage(`Limit must be between ${PAGINATION.MIN_LIMIT} and ${PAGINATION.MAX_LIMIT}`),
    query('offset')
      .optional()
      .isInt({ min: PAGINATION.DEFAULT_OFFSET })
      .withMessage('Offset must be non-negative'),
  ],
  telemetry: [
    param('deviceId').isInt().withMessage('Invalid device ID'),
    query('from').optional().isISO8601().withMessage('from must be valid ISO8601 datetime'),
    query('to').optional().isISO8601().withMessage('to must be valid ISO8601 datetime'),
    query('limit')
      .optional()
      .isInt({ min: PAGINATION.MIN_LIMIT, max: PAGINATION.MAX_TELEMETRY_LIMIT })
      .withMessage(`Limit must be between ${PAGINATION.MIN_LIMIT} and ${PAGINATION.MAX_TELEMETRY_LIMIT}`),
  ],
  stats: [
    param('deviceId').isInt().withMessage('Invalid device ID'),
    query('hours')
      .optional()
      .isInt({ min: STATS.MIN_HOURS, max: STATS.MAX_HOURS })
      .withMessage(`Hours must be between ${STATS.MIN_HOURS} and ${STATS.MAX_HOURS}`),
  ],
};