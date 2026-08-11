const pg = require('pg');
const { Pool } = pg;
const p = new Pool({ host: '10.10.7.67', database: 'efe_db', user: 'efesur_admin', password: 'astidi2025', port: 5432 });

async function main() {
  // Todos los usuarios (email + rol + fechas)
  const users = await p.query('SELECT id, email, name, role, email_verified, created_at, updated_at FROM users ORDER BY created_at');
  console.log('=== TODOS LOS USERS ===');
  console.log(JSON.stringify(users.rows, null, 2));

  // Accounts de cada usuario (ver si tienen password)
  console.log('\n=== ACCOUNTS (credenciales) ===');
  for (const u of users.rows) {
    const acc = await p.query("SELECT user_id, account_id, provider_id, (password IS NOT NULL) AS has_password, created_at FROM accounts WHERE user_id = $1", [u.id]);
    console.log(JSON.stringify(acc.rows, null, 2));
  }

  // Empresas asignadas
  console.log('\n=== COMPANIES_USERS ===');
  const cu = await p.query('SELECT user_id, company_id, role, is_active FROM companies_users');
  console.log(JSON.stringify(cu.rows, null, 2));

  // Buscar ast@wisensor.cl en auditoría o sesiones
  console.log('\n=== AUDIT LOG (email ast) ===');
  const audit = await p.query("SELECT user_id, user_name, action, created_at FROM audit_log WHERE user_name ILIKE '%ast%' OR details::text ILIKE '%ast@%' ORDER BY created_at DESC LIMIT 20");
  console.log(JSON.stringify(audit.rows, null, 2));

  console.log('\n=== SESSIONS (email ast) ===');
  const sess = await p.query("SELECT s.id, s.user_id, u.email, s.expires_at FROM sessions s JOIN users u ON s.user_id = u.id WHERE u.email ILIKE '%ast%'");
  console.log(JSON.stringify(sess.rows, null, 2));

  await p.end();
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
