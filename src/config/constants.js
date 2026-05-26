/**
 * Constantes de la aplicación
 */

// Tipos de dispositivos permitidos
export const DEVICE_TYPES = {
  GPS: 'Gps',
  GATEWAY: 'Gateway',
  SUB_ESTACION: 'SubEstacion',
  LECTOR: 'Lector',
};

export const DEVICE_TYPES_ARRAY = Object.values(DEVICE_TYPES);

// Roles de usuarios
export const USER_ROLES = {
  ADMIN: 'admin',
  OPERATOR: 'operator',
  VIEWER: 'viewer',
};

export const USER_ROLES_ARRAY = Object.values(USER_ROLES);

// Estados de alertas
export const ALERT_TYPES = {
  CRITICA: 'critica',
  ATENCION: 'atencion',
};

export const ALERT_STATUSES = {
  ACTIVE: 'active',
  RESOLVED: 'resolved',
};

// Paginación
export const PAGINATION = {
  DEFAULT_LIMIT: 50,
  MIN_LIMIT: 1,
  MAX_LIMIT: 100,
  MAX_TELEMETRY_LIMIT: 1000,
  DEFAULT_OFFSET: 0,
};

// Estadísticas
export const STATS = {
  DEFAULT_HOURS: 24,
  MIN_HOURS: 1,
  MAX_HOURS: 720,
  MAX_RECORDS_RETURN: 100,
};
