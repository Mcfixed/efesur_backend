import dotenv from 'dotenv';
dotenv.config();

const requiredEnvVars = [
  'DB_HOST',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
  'BETTER_AUTH_SECRET'
];

const validateEnv = () => {
  const missing = requiredEnvVars.filter(v => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. \n` +
      'Please check your .env file.'
    );
  }
};

validateEnv();

const port = parseInt(process.env.PORT) || 3000;
const dbPort = parseInt(process.env.DB_PORT) || 5432;

export default {
  port,
  nodeEnv: process.env.NODE_ENV || 'development',
  db: {
    host: process.env.DB_HOST,
    port: dbPort,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  },
  betterAuth: {
    secret: process.env.BETTER_AUTH_SECRET,
    url: process.env.BETTER_AUTH_URL || `http://localhost:${port}`,
  },
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',').map(o => o.trim()),
};