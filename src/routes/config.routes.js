import express from 'express';
import { companyValidation, userValidation, deviceValidation, validate } from '../middleware/validation.js';
import { requireRole } from '../utils/accessControl.js';
import {
  getCompanies, getCompany, createCompany, updateCompany, deleteCompany,
  getUsers, getUser, createUser, updateUser, deleteUser, getNotificationUsers,
  assignUserToCompany, removeUserFromCompany, getRoles,
  getCompanyConfig, updateCompanyConfig,
  getDevices, getDevice, createDevice, updateDevice, deleteDevice
} from '../controllers/config.controller.js';

const router = express.Router();

// Las operaciones de escritura (crear/editar/borrar) requieren rol administrativo.
// Las lecturas quedan abiertas a cualquier usuario autenticado, pero SIEMPRE
// filtradas por empresa (req.userCompanyIds) dentro de los services/controllers.

// Companies
router.get('/companies', getCompanies);
router.get('/companies/:id', getCompany);
router.post('/companies', requireRole('superadmin', 'admin_efe'), companyValidation.create, validate, createCompany);
router.put('/companies/:id', requireRole('superadmin', 'admin_efe'), companyValidation.update, validate, updateCompany);
router.delete('/companies/:id', requireRole('superadmin', 'admin_efe'), deleteCompany);

// Users
router.get('/users', getUsers);
router.get('/users/notifications', getNotificationUsers);
router.get('/users/:id', getUser);
router.post('/users', requireRole('superadmin', 'admin_efe'), userValidation.create, validate, createUser);
router.put('/users/:id', requireRole('superadmin', 'admin_efe'), userValidation.update, validate, updateUser);
router.delete('/users/:id', requireRole('superadmin', 'admin_efe'), deleteUser);
router.post('/users/assign-company', requireRole('superadmin', 'admin_efe'), userValidation.assignCompany, validate, assignUserToCompany);
router.delete('/users/:userId/companies/:companyId', requireRole('superadmin', 'admin_efe'), removeUserFromCompany);
router.get('/roles', getRoles);

// Company Config
router.get('/companies/:companyId/config', getCompanyConfig);
router.put('/companies/:companyId/config', requireRole('superadmin', 'admin_efe'), updateCompanyConfig);

// Devices
router.get('/devices', getDevices);
router.get('/devices/:id', getDevice);
router.post('/devices', requireRole('superadmin', 'admin_efe'), deviceValidation.create, validate, createDevice);
router.put('/devices/:id', requireRole('superadmin', 'admin_efe'), deviceValidation.update, validate, updateDevice);
router.delete('/devices/:id', requireRole('superadmin', 'admin_efe'), deleteDevice);

export default router;