import express from 'express';
import { companyValidation, userValidation, deviceValidation, validate } from '../middleware/validation.js';
import {
  getCompanies, getCompany, createCompany, updateCompany, deleteCompany,
  getUsers, getUser, createUser, updateUser, deleteUser,
  assignUserToCompany, removeUserFromCompany, getRoles,
  getCompanyConfig, updateCompanyConfig,
  getDevices, getDevice, createDevice, updateDevice, deleteDevice
} from '../controllers/config.controller.js';

const router = express.Router();

// Companies
router.get('/companies', getCompanies);
router.get('/companies/:id', getCompany);
router.post('/companies', companyValidation.create, validate, createCompany);
router.put('/companies/:id', companyValidation.update, validate, updateCompany);
router.delete('/companies/:id', deleteCompany);

// Users
router.get('/users', getUsers);
router.get('/users/:id', getUser);
router.post('/users', userValidation.create, validate, createUser);
router.put('/users/:id', userValidation.update, validate, updateUser);
router.delete('/users/:id', deleteUser);
router.post('/users/assign-company', userValidation.assignCompany, validate, assignUserToCompany);
router.delete('/users/:userId/companies/:companyId', removeUserFromCompany);
router.get('/roles', getRoles);

// Company Config
router.get('/companies/:companyId/config', getCompanyConfig);
router.put('/companies/:companyId/config', updateCompanyConfig);

// Devices
router.get('/devices', getDevices);
router.get('/devices/:id', getDevice);
router.post('/devices', deviceValidation.create, validate, createDevice);
router.put('/devices/:id', deviceValidation.update, validate, updateDevice);
router.delete('/devices/:id', deleteDevice);

export default router;