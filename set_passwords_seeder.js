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

// Definimos los usuarios del seeder y la contraseña que queremos asignarles
const usersToUpdate = [
  { email: 'admin@wisensor.cl', password: 'astidi2025' },
  { email: 'diego@wisensor.cl', password: 'astidi2025' }
];

async function run() {
  try {
    console.log('Iniciando la creación de credenciales...\n');

    for (const userData of usersToUpdate) {
      // 1. Encriptamos la contraseña dinámicamente
      const pass = await bcrypt.hash(userData.password, 10);
      
      // 2. Buscamos el ID real del usuario en la base de datos
      const userResult = await pool.query('SELECT id FROM users WHERE email = $1', [userData.email]);
      
      if (userResult.rows.length > 0) {
        const userId = userResult.rows[0].id;
        
        // 3. Borramos la cuenta existente (si la hay) para evitar conflictos de duplicidad
        await pool.query('DELETE FROM accounts WHERE user_id = $1', [userId]);
        
        // 4. Insertamos la nueva cuenta con el hash de contraseña usando el proveedor 'credential'
        // Nota: account_id puede ser el mismo email o un identificador único
        await pool.query(
          "INSERT INTO accounts (user_id, account_id, provider_id, password) VALUES ($1, $2, $3, $4)",
          [userId, userData.email, 'credential', pass]
        );
        
        console.log(`✅ Cuenta establecida exitosamente para: ${userData.email}`);
        console.log(`🔑 Credenciales -> Email: ${userData.email} | Pass: ${userData.password}\n`);
      } else {
        console.log(`❌ No se encontró el usuario ${userData.email} en la tabla 'users'. Asegúrate de correr el seeder SQL primero.\n`);
      }
    }
    
    console.log('Proceso finalizado.');
  } catch (err) {
    console.error('❌ Error de base de datos:', err.message);
  } finally {
    await pool.end();
  }
}

run();