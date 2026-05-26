import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function test() {
  console.log('Intentando conectar con:', {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
  });
  
  try {
    const client = await pool.connect();
    console.log('✅ Conexión exitosa a la base de datos');
    const res = await client.query('SELECT current_database(), current_user');
    console.log('Info:', res.rows[0]);
    client.release();
  } catch (err) {
    console.error('❌ Error de conexión:', err.message);
    if (err.code === '3D000') {
      console.error('El nombre de la base de datos "efe_db" no existe.');
    } else if (err.code === '28P01') {
      console.error('La contraseña es incorrecta.');
    } else if (err.code === 'ECONNREFUSED') {
      console.error('PostgreSQL no está corriendo o el puerto es incorrecto.');
    }
  } finally {
    await pool.end();
  }
}

test();
