import * as configService from '../services/config.service.js';
import * as response from '../utils/response.js';
import { log } from '../services/audit.service.js';
import { assertCompanyAccess, assertDeviceAccess, assertUserCompanyAccess, isSuperAdmin } from '../utils/accessControl.js';

// ===== COMPANIES =====
export const getCompanies = async (req, res, next) => {
  try {
    const result = await configService.getAllCompaniesService(req.userCompanyIds);
    response.success(res, result.rows);
  } catch (error) {
    next(error);
  }
};

export const getCompany = async (req, res, next) => {
  try {
    assertCompanyAccess(req, req.params.id);
    const result = await configService.getCompanyByIdService(req.params.id, req.userCompanyIds);
    if (!result.rows || result.rows.length === 0) {
      return response.notFound(res, 'Company not found');
    }
    response.success(res, result.rows[0]);
  } catch (error) {
    next(error);
  }
};

export const createCompany = async (req, res, next) => {
  try {
    const result = await configService.createCompanyService(req.body);
    log({ userId: req.user?.id, userName: req.user?.name, action: 'create_company', details: { name: req.body.name }, ip: req.ip });
    response.created(res, result.rows[0]);
  } catch (error) {
    next(error);
  }
};

export const updateCompany = async (req, res, next) => {
  try {
    assertCompanyAccess(req, req.params.id);
    const result = await configService.updateCompanyService(req.params.id, req.body);
    if (!result.rows || result.rows.length === 0) {
      return response.notFound(res, 'Company not found');
    }
    log({ userId: req.user?.id, userName: req.user?.name, action: 'update_company', details: { id: req.params.id, changes: req.body }, ip: req.ip });
    response.success(res, result.rows[0]);
  } catch (error) {
    next(error);
  }
};

export const deleteCompany = async (req, res, next) => {
  try {
    assertCompanyAccess(req, req.params.id);
    const result = await configService.deleteCompanyService(req.params.id);
    if (result.rowCount === 0) {
      return response.notFound(res, 'Company not found');
    }
    log({ userId: req.user?.id, userName: req.user?.name, action: 'delete_company', details: { id: req.params.id }, ip: req.ip });
    response.success(res, { message: 'Company deleted' });
  } catch (error) {
    next(error);
  }
};

// ===== USERS =====
export const getUsers = async (req, res, next) => {
  try {
    const result = await configService.getAllUsersService(req.userCompanyIds);
    response.success(res, result.rows);
  } catch (error) {
    next(error);
  }
};

export const getNotificationUsers = async (req, res, next) => {
  try {
    const result = await configService.getNotificationUsersService(req.userCompanyIds);
    response.success(res, result.rows);
  } catch (error) {
    next(error);
  }
};

export const getUser = async (req, res, next) => {
  try {
    await assertUserCompanyAccess(req.userCompanyIds, req.params.id);
    const result = await configService.getUserByIdService(req.params.id);
    if (!result.rows || result.rows.length === 0) {
      return response.notFound(res, 'User not found');
    }
    response.success(res, result.rows[0]);
  } catch (error) {
    next(error);
  }
};

export const createUser = async (req, res, next) => {
  try {
    // Un admin_efe solo puede crear CONTACTOS de notificación (sin acceso al sistema).
    // Solo un superadmin puede crear cuentas reales (con password, rol e is_active).
    if (!isSuperAdmin(req)) {
      req.body.role = 'contacto';
      req.body.is_active = false;
      delete req.body.password;
    }
    const result = await configService.createUserService(req.body);
    log({ userId: req.user?.id, userName: req.user?.name, action: 'create_user', details: { email: req.body.email, name: req.body.name }, ip: req.ip });
    response.created(res, result.rows[0]);
  } catch (error) {
    next(error);
  }
};

export const updateUser = async (req, res, next) => {
  try {
    await assertUserCompanyAccess(req.userCompanyIds, req.params.id);
    // Un admin_efe solo puede editar CONTACTOS de notificación y sus canales.
    // NUNCA puede activar acceso (is_active=true), asignar roles de acceso ni cambiar contraseña.
    if (!isSuperAdmin(req)) {
      if (req.body.is_active === true) {
        return res.status(403).json({ error: 'Solo un superadmin puede activar el acceso de un usuario' });
      }
      if (req.body.role && req.body.role !== 'contacto') {
        return res.status(403).json({ error: 'Solo un superadmin puede asignar roles de acceso' });
      }
      delete req.body.password;
    }
    const result = await configService.updateUserService(req.params.id, req.body);
    if (!result.rows || result.rows.length === 0) {
      return response.notFound(res, 'User not found');
    }
    log({ userId: req.user?.id, userName: req.user?.name, action: 'update_user', details: { id: req.params.id, changes: { email: req.body.email, name: req.body.name } }, ip: req.ip });
    response.success(res, result.rows[0]);
  } catch (error) {
    next(error);
  }
};

export const deleteUser = async (req, res, next) => {
  try {
    await assertUserCompanyAccess(req.userCompanyIds, req.params.id);
    const result = await configService.deleteUserService(req.params.id);
    if (result.rowCount === 0) {
      return response.notFound(res, 'User not found');
    }
    log({ userId: req.user?.id, userName: req.user?.name, action: 'delete_user', details: { id: req.params.id }, ip: req.ip });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

// ===== USER-COMPANY ASSIGNMENTS =====
export const assignUserToCompany = async (req, res, next) => {
  try {
    // Un admin_efe solo puede asignar usuarios a empresas a las que pertenece
    assertCompanyAccess(req, req.body.companyId);
    const result = await configService.assignUserToCompanyService(req.body);
    response.created(res, result.rows[0]);
  } catch (error) {
    next(error);
  }
};

export const removeUserFromCompany = async (req, res, next) => {
  try {
    assertCompanyAccess(req, req.params.companyId);
    const result = await configService.removeUserFromCompanyService(
      req.params.userId,
      req.params.companyId
    );
    if (result.rowCount === 0) {
      return response.notFound(res, 'Assignment not found');
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const getRoles = async (req, res, next) => {
  try {
    const result = await configService.getRolesService();
    response.success(res, result.rows);
  } catch (error) {
    next(error);
  }
};

// ===== COMPANY CONFIG =====
export const getCompanyConfig = async (req, res, next) => {
  try {
    assertCompanyAccess(req, req.params.companyId);
    const result = await configService.getCompanyConfigService(req.params.companyId);
    if (!result.rows || result.rows.length === 0) {
      return response.notFound(res, 'Company config not found');
    }
    response.success(res, result.rows[0]);
  } catch (error) {
    next(error);
  }
};

export const updateCompanyConfig = async (req, res, next) => {
  try {
    assertCompanyAccess(req, req.params.companyId);
    const result = await configService.updateCompanyConfigService(
      req.params.companyId,
      req.body
    );
    response.success(res, result.rows[0]);
  } catch (error) {
    next(error);
  }
};

// ===== DEVICES =====
export const getDevices = async (req, res, next) => {
  try {
    const { companyId, type, isActive } = req.query;
    const result = await configService.getAllDevicesService({ companyId, type, isActive, companyIds: req.userCompanyIds });
    response.success(res, result.rows);
  } catch (error) {
    next(error);
  }
};

export const getDevice = async (req, res, next) => {
  try {
    await assertDeviceAccess(req.userCompanyIds, parseInt(req.params.id));
    const result = await configService.getDeviceByIdService(req.params.id, req.userCompanyIds);
    if (!result.rows || result.rows.length === 0) {
      return response.notFound(res, 'Device not found');
    }
    response.success(res, result.rows[0]);
  } catch (error) {
    next(error);
  }
};

export const createDevice = async (req, res, next) => {
  try {
    // Un usuario no-superadmin solo puede crear dispositivos en sus empresas
    if (!isSuperAdmin(req)) {
      const allowed = req.userCompanyIds || [];
      if (!allowed.includes(Number(req.body.company_id))) {
        return res.status(403).json({ error: 'No tiene acceso a esta empresa' });
      }
    }
    const result = await configService.createDeviceService(req.body);
    log({ userId: req.user?.id, userName: req.user?.name, action: 'create_device', details: { name: req.body.name, dev_eui: req.body.dev_eui }, ip: req.ip });
    response.created(res, result.rows[0]);
  } catch (error) {
    next(error);
  }
};

export const updateDevice = async (req, res, next) => {
  try {
    await assertDeviceAccess(req.userCompanyIds, parseInt(req.params.id));
    // Si se intenta cambiar de empresa, validar que sea una empresa permitida
    if (!isSuperAdmin(req) && req.body.company_id !== undefined) {
      const allowed = req.userCompanyIds || [];
      if (!allowed.includes(Number(req.body.company_id))) {
        return res.status(403).json({ error: 'No tiene acceso a esta empresa' });
      }
    }
    const result = await configService.updateDeviceService(req.params.id, req.body);
    if (!result.rows || result.rows.length === 0) {
      return response.notFound(res, 'Device not found');
    }
    log({ userId: req.user?.id, userName: req.user?.name, action: 'update_device', details: { id: req.params.id, changes: { name: req.body.name } }, ip: req.ip });
    response.success(res, result.rows[0]);
  } catch (error) {
    next(error);
  }
};

export const deleteDevice = async (req, res, next) => {
  try {
    await assertDeviceAccess(req.userCompanyIds, parseInt(req.params.id));
    const result = await configService.deleteDeviceService(req.params.id);
    if (result.rowCount === 0) {
      return response.notFound(res, 'Device not found');
    }
    log({ userId: req.user?.id, userName: req.user?.name, action: 'delete_device', details: { id: req.params.id }, ip: req.ip });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};