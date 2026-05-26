import * as configService from '../services/config.service.js';
import * as response from '../utils/response.js';

// ===== COMPANIES =====
export const getCompanies = async (req, res, next) => {
  try {
    const result = await configService.getAllCompaniesService();
    response.success(res, result.rows);
  } catch (error) {
    next(error);
  }
};

export const getCompany = async (req, res, next) => {
  try {
    const result = await configService.getCompanyByIdService(req.params.id);
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
    response.created(res, result.rows[0]);
  } catch (error) {
    next(error);
  }
};

export const updateCompany = async (req, res, next) => {
  try {
    const result = await configService.updateCompanyService(req.params.id, req.body);
    if (!result.rows || result.rows.length === 0) {
      return response.notFound(res, 'Company not found');
    }
    response.success(res, result.rows[0]);
  } catch (error) {
    next(error);
  }
};

export const deleteCompany = async (req, res, next) => {
  try {
    const result = await configService.deleteCompanyService(req.params.id);
    if (result.rowCount === 0) {
      return response.notFound(res, 'Company not found');
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

// ===== USERS =====
export const getUsers = async (req, res, next) => {
  try {
    const result = await configService.getAllUsersService();
    response.success(res, result.rows);
  } catch (error) {
    next(error);
  }
};

export const getUser = async (req, res, next) => {
  try {
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
    const result = await configService.createUserService(req.body);
    response.created(res, result.rows[0]);
  } catch (error) {
    next(error);
  }
};

export const updateUser = async (req, res, next) => {
  try {
    const result = await configService.updateUserService(req.params.id, req.body);
    if (!result.rows || result.rows.length === 0) {
      return response.notFound(res, 'User not found');
    }
    response.success(res, result.rows[0]);
  } catch (error) {
    next(error);
  }
};

export const deleteUser = async (req, res, next) => {
  try {
    const result = await configService.deleteUserService(req.params.id);
    if (result.rowCount === 0) {
      return response.notFound(res, 'User not found');
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

// ===== USER-COMPANY ASSIGNMENTS =====
export const assignUserToCompany = async (req, res, next) => {
  try {
    const result = await configService.assignUserToCompanyService(req.body);
    response.created(res, result.rows[0]);
  } catch (error) {
    next(error);
  }
};

export const removeUserFromCompany = async (req, res, next) => {
  try {
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
    const result = await configService.getAllDevicesService({ companyId, type, isActive });
    response.success(res, result.rows);
  } catch (error) {
    next(error);
  }
};

export const getDevice = async (req, res, next) => {
  try {
    const result = await configService.getDeviceByIdService(req.params.id);
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
    const result = await configService.createDeviceService(req.body);
    response.created(res, result.rows[0]);
  } catch (error) {
    next(error);
  }
};

export const updateDevice = async (req, res, next) => {
  try {
    const result = await configService.updateDeviceService(req.params.id, req.body);
    if (!result.rows || result.rows.length === 0) {
      return response.notFound(res, 'Device not found');
    }
    response.success(res, result.rows[0]);
  } catch (error) {
    next(error);
  }
};

export const deleteDevice = async (req, res, next) => {
  try {
    const result = await configService.deleteDeviceService(req.params.id);
    if (result.rowCount === 0) {
      return response.notFound(res, 'Device not found');
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};