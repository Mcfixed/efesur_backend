import pool from './src/config/database.js';

const run = async () => {
  try {
    console.log('NOW (UTC):', (await pool.query('SELECT NOW() AS n')).rows[0].n);

    // 1) Query EXACTA de getAperturaAlerts (como en dashboard.service.js)
    const exact = await pool.query(`
      SELECT a.id, a.device_id, a.type, a.status, a.created_at,
             (SELECT d2.id FROM devices d2 WHERE d2.id_device_father = d.id AND d2.type_device = 'Gateway' LIMIT 1) as gateway_id
      FROM alerts a
      JOIN devices d ON a.device_id = d.id
      WHERE a.type = 'apertura'
        AND (a.created_at AT TIME ZONE 'UTC') >= NOW() - INTERVAL '30 minutes'
      ORDER BY a.created_at DESC LIMIT 500
    `);
    console.log('\n== LO QUE DEVUELVE getAperturaAlerts (30 min) ==');
    console.table(exact.rows);

    // 2) TODAS las activas (apertura/presencia) con edad en minutos
    const actives = await pool.query(`
      SELECT id, type, device_id, status, created_at,
             ROUND(EXTRACT(EPOCH FROM (NOW() - created_at))/60) AS edad_min
      FROM alerts
      WHERE type IN ('apertura','presencia') AND status = 'active'
      ORDER BY created_at DESC NULLS LAST
    `);
    console.log('\n== ACTIVAS apertura/presencia (edad en min) ==');
    console.table(actives.rows);

    // 3) Activas con created_at NULL
    const nulls = await pool.query(`
      SELECT id, type, device_id, status, created_at
      FROM alerts WHERE type IN ('apertura','presencia') AND created_at IS NULL
    `);
    console.log('\n== con created_at NULL ==');
    console.table(nulls.rows);

    // 4) Mapeo lector -> gateway
    const gw = await pool.query(`
      SELECT g.id AS gateway_id, g.name AS gateway_name, g.is_active,
             g.id_device_father AS lector_id, l.name AS lector_name
      FROM devices g
      LEFT JOIN devices l ON g.id_device_father = l.id
      WHERE g.type_device = 'Gateway'
        AND (g.id_device_father IN (SELECT DISTINCT device_id FROM alerts WHERE type IN ('apertura','presencia')))
    `);
    console.log('\n== Gateways asociados a esos lectores ==');
    console.table(gw.rows);

    // 5) Dispositivos cuyo padre es 279 (TEST)
    const testGw = await pool.query(`
      SELECT id, name, type_device, id_device_father FROM devices WHERE id_device_father = 279
    `);
    console.log('\n== Dispositivos cuyo padre es 279 (TEST) ==');
    console.table(testGw.rows);
  } catch (e) {
    console.error('ERROR:', e.message);
  } finally {
    await pool.end();
  }
};

run();
