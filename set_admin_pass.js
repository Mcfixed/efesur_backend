import bcrypt from 'bcryptjs';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function run() {
  try {
    const pass = await bcrypt.hash('admin1234', 10);
    const userResult = await pool.query('SELECT id FROM users WHERE email = $1', ['admin@efe.cl']);
    
    if (userResult.rows.length > 0) {
      const userId = userResult.rows[0].id;
      
      // Borramos cuenta existente si la hay para evitar conflictos
      await pool.query('DELETE FROM accounts WHERE user_id = $1', [userId]);
      
      // Insertamos la nueva cuenta con el hash de contraseña usando 'credential'
      await pool.query(
        "INSERT INTO accounts (user_id, account_id, provider_id, password) VALUES ($1, $2, $3, $4)",
        [userId, 'admin@efe.cl', 'credential', pass]
      );
      console.log('✅ Contraseña establecida exitosamente para admin@efe.cl');
      console.log('Credenciales: admin@efe.cl / admin1234');
    } else {
      console.log('❌ No se encontró el usuario admin@efe.cl en la tabla users.');
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await pool.end();
  }
}

run();
