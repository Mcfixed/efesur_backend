import pool from '../config/database.js';
import bcrypt from 'bcryptjs';

// ===== COMPANIES =====

export const getAllCompaniesService = () => pool.query(`
  SELECT c.*, 
    (SELECT COUNT(*) FROM devices WHERE company_id = c.id) as device_count,
    (SELECT COUNT(*) FROM companies_users WHERE company_id = c.id) as user_count
  FROM companies c ORDER BY c.name
`);

export const getCompanyByIdService = (id) => pool.query('SELECT * FROM companies WHERE id = $1', [id]);

export const createCompanyService = ({ name, rut, sector, color_theme }) => pool.query(`
  INSERT INTO companies (name, rut, sector, color_theme) VALUES ($1, $2, $3, $4) RETURNING *
`, [name, rut, sector, color_theme || '#007bff']);

export const updateCompanyService = (id, data) => {
  const fields = [];
  const values = [];
  let idx = 1;

  if (data.name !== undefined) { fields.push(`name = $${idx++}`); values.push(data.name); }
  if (data.rut !== undefined) { fields.push(`rut = $${idx++}`); values.push(data.rut); }
  if (data.sector !== undefined) { fields.push(`sector = $${idx++}`); values.push(data.sector); }
  if (data.color_theme !== undefined) { fields.push(`color_theme = $${idx++}`); values.push(data.color_theme); }
  if (data.is_active !== undefined) { fields.push(`is_active = $${idx++}`); values.push(data.is_active); }

  if (fields.length === 0) return pool.query('SELECT * FROM companies WHERE id = $1', [id]);

  fields.push('updated_at = NOW()');
  values.push(id);

  return pool.query(
    `UPDATE companies SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
};

export const deleteCompanyService = (id) => pool.query('DELETE FROM companies WHERE id = $1', [id]);

// ===== USERS =====

export const getAllUsersService = () => pool.query(`
  SELECT u.id, u.email, u.name, u.image, u.is_superuser, u.created_at,
    COALESCE(json_agg(json_build_object(
      'company_id', cu.company_id, 'company_name', c.name, 'role', cu.role, 'is_active', cu.is_active
    )) FILTER (WHERE cu.company_id IS NOT NULL), '[]') as company_assignments
  FROM users u
  LEFT JOIN companies_users cu ON u.id = cu.user_id
  LEFT JOIN companies c ON cu.company_id = c.id
  GROUP BY u.id ORDER BY u.name
`);

export const getUserByIdService = (id) => pool.query('SELECT * FROM users WHERE id = $1', [id]);

export const createUserService = async ({ email, name, is_superuser, password }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const userRes = await client.query(`
      INSERT INTO users (email, name, is_superuser) VALUES ($1, $2, $3) 
      RETURNING id, email, name, is_superuser, created_at
    `, [email, name, is_superuser || false]);
    
    const user = userRes.rows[0];

    if (password) {
      const pass = await bcrypt.hash(password, 10);
      await client.query(
        "INSERT INTO accounts (user_id, account_id, provider_id, password) VALUES ($1, $2, $3, $4)",
        [user.id, email, 'credential', pass]
      );
    }

    await client.query('COMMIT');
    return { rows: [user] };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const updateUserService = (id, data) => {
  const fields = [];
  const values = [];
  let idx = 1;

  if (data.name !== undefined) { fields.push(`name = $${idx++}`); values.push(data.name); }
  if (data.image !== undefined) { fields.push(`image = $${idx++}`); values.push(data.image); }
  if (data.is_superuser !== undefined) { fields.push(`is_superuser = $${idx++}`); values.push(data.is_superuser); }

  if (fields.length === 0) return pool.query('SELECT * FROM users WHERE id = $1', [id]);

  fields.push('updated_at = NOW()');
  values.push(id);

  return pool.query(
    `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
};

export const deleteUserService = (id) => pool.query('DELETE FROM users WHERE id = $1', [id]);

// ===== USER-COMPANY =====

export const assignUserToCompanyService = ({ userId, companyId, role }) => pool.query(`
  INSERT INTO companies_users (user_id, company_id, role)
  VALUES ($1, $2, $3)
  ON CONFLICT (company_id, user_id) DO UPDATE SET role = $3
  RETURNING *
`, [userId, companyId, role || 'viewer']);

export const removeUserFromCompanyService = (userId, companyId) => pool.query(
  'DELETE FROM companies_users WHERE user_id = $1 AND company_id = $2', [userId, companyId]
);

export const getRolesService = () => pool.query(`
  SELECT role, COUNT(*) as count FROM companies_users GROUP BY role ORDER BY role
`);

// ===== COMPANY CONFIG =====

export const getCompanyConfigService = (companyId) => pool.query(
  'SELECT * FROM company_config WHERE company_id = $1', [companyId]
);

export const updateCompanyConfigService = (companyId, { url, color }) => pool.query(`
  INSERT INTO company_config (company_id, url, color)
  VALUES ($1, $2, $3)
  ON CONFLICT (company_id) DO UPDATE SET url = $2, color = $3
  RETURNING *
`, [companyId, url, color]);

// ===== DEVICES =====

const DEVICE_JOINS = `
  FROM devices d
  LEFT JOIN companies c ON d.company_id = c.id
  LEFT JOIN gps_device g ON d.id = g.id
  LEFT JOIN sub_estacion_device se ON d.id = se.id
  LEFT JOIN gateway_device gw ON d.id = gw.id
  LEFT JOIN lector_device l ON d.id = l.id
`;

const DEVICE_SPECIFIC_DATA = `
  CASE 
    WHEN g.id IS NOT NULL THEN json_build_object('battery', g.battery, 'accelerometers_status', g.accelerometers_status, 'operating_mode', g.operating_mode)
    WHEN se.id IS NOT NULL THEN json_build_object('input_1_status', se.input_1_status, 'alert', se.alert)
    WHEN gw.id IS NOT NULL THEN json_build_object('ip_internal', gw.ip_internal, 'firmware_version', gw.firmware_version)
    WHEN l.id IS NOT NULL THEN json_build_object('last_date_reader', l.last_date_reader, 'battery_reader', l.battery_reader)
    ELSE null
  END as specific_data
`;

export const getAllDevicesService = ({ companyId, type, isActive }) => {
  let whereClause = 'WHERE 1=1';
  const params = [];

  if (companyId) {
    params.push(companyId);
    whereClause += ` AND d.company_id = $${params.length}`;
  }
  if (type) {
    params.push(type);
    whereClause += ` AND d.type_device = $${params.length}`;
  }
  if (isActive !== undefined) {
    params.push(isActive === 'true');
    whereClause += ` AND d.is_active = $${params.length}`;
  }

  return pool.query(`
    SELECT d.*, c.name as company_name, ${DEVICE_SPECIFIC_DATA}
    ${DEVICE_JOINS}
    ${whereClause} ORDER BY d.name
  `, params);
};

export const getDeviceByIdService = (id) => pool.query(`
  SELECT d.*, c.name as company_name, ${DEVICE_SPECIFIC_DATA}
  ${DEVICE_JOINS}
  WHERE d.id = $1
`, [id]);

export const createDeviceService = async ({ dev_eui, name, company_id, id_device_father, type_device, latitude_current, longitude_current, specific_data }) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const deviceResult = await client.query(`
      INSERT INTO devices (dev_eui, name, company_id, id_device_father, type_device, latitude_current, longitude_current)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
    `, [dev_eui, name, company_id, id_device_father, type_device, latitude_current, longitude_current]);

    const deviceId = deviceResult.rows[0].id;

    if (specific_data) {
      await upsertSpecificData(client, deviceId, type_device, specific_data);
    }

    await client.query('COMMIT');
    return { rows: [deviceResult.rows[0]] };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const updateDeviceService = async (id, data) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Build dynamic update
    const fields = [];
    const values = [];
    let idx = 1;

    if (data.name !== undefined) { fields.push(`name = $${idx++}`); values.push(data.name); }
    if (data.company_id !== undefined) { fields.push(`company_id = $${idx++}`); values.push(data.company_id); }
    if (data.id_device_father !== undefined) { fields.push(`id_device_father = $${idx++}`); values.push(data.id_device_father); }
    if (data.type_device !== undefined) { fields.push(`type_device = $${idx++}`); values.push(data.type_device); }
    if (data.is_active !== undefined) { fields.push(`is_active = $${idx++}`); values.push(data.is_active); }
    if (data.latitude_current !== undefined) { fields.push(`latitude_current = $${idx++}`); values.push(data.latitude_current); }
    if (data.longitude_current !== undefined) { fields.push(`longitude_current = $${idx++}`); values.push(data.longitude_current); }

    let result;
    if (fields.length > 0) {
      fields.push('updated_at = NOW()');
      values.push(id);
      result = await client.query(
        `UPDATE devices SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
        values
      );
    } else {
      result = await client.query('SELECT * FROM devices WHERE id = $1', [id]);
    }

    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return result;
    }

    // Update specific device data
    if (data.specific_data) {
      const deviceType = data.type_device || result.rows[0].type_device;
      await upsertSpecificData(client, id, deviceType, data.specific_data);
    }

    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const deleteDeviceService = (id) => pool.query('DELETE FROM devices WHERE id = $1', [id]);

// Helper para insertar/actualizar data específica de dispositivo
async function upsertSpecificData(client, deviceId, typeDevice, data) {
  switch (typeDevice) {
    case 'Gps':
      await client.query(`
        INSERT INTO gps_device (id, accelerometers_status, battery, operating_mode)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO UPDATE SET accelerometers_status = $2, battery = $3, operating_mode = $4
      `, [deviceId, data.accelerometers_status || 'normal', data.battery || 100, data.operating_mode || 'normal']);
      break;
    case 'SubEstacion':
      await client.query(`
        INSERT INTO sub_estacion_device (id, input_1_status, alert)
        VALUES ($1, $2, $3)
        ON CONFLICT (id) DO UPDATE SET input_1_status = $2, alert = $3
      `, [deviceId, data.input_1_status || 'closed', data.alert || false]);
      break;
    case 'Gateway':
      await client.query(`
        INSERT INTO gateway_device (id, ip_internal, firmware_version)
        VALUES ($1, $2, $3)
        ON CONFLICT (id) DO UPDATE SET ip_internal = $2, firmware_version = $3
      `, [deviceId, data.ip_internal, data.firmware_version]);
      break;
    case 'Lector':
      await client.query(`
        INSERT INTO lector_device (id, last_date_reader, battery_reader)
        VALUES ($1, $2, $3)
        ON CONFLICT (id) DO UPDATE SET last_date_reader = $2, battery_reader = $3
      `, [deviceId, data.last_date_reader, data.battery_reader || 100]);
      break;
  }
}