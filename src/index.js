import express from 'express';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { toNodeHandler } from 'better-auth/node';
import config from './config/index.js';
import { auth } from './config/auth.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler, notFoundHandler, jsonErrorHandler } from './middleware/errorHandler.js';
import pool from './config/database.js';
import dashboardRouter from './routes/dashboard.routes.js';
import telemetryRouter from './routes/telemetry.routes.js';
import configRouter from './routes/config.routes.js';

// ─── Global error handlers (evitan que el proceso muera) ───
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  // Loggear pero no matar — el proceso sigue funcionando
});

const app = express();

// Security & Compression
app.use(helmet());
app.use(compression());

// CORS
app.use(cors({
  origin: config.allowedOrigins,
  credentials: true,
  optionsSuccessStatus: 200,
}));

// Logging
app.use(morgan('dev'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/api/health',
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many authentication attempts',
});

// Límite más restrictivo para búsquedas (evita abuso sin afectar otras rutas)
const searchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Demasiadas búsquedas. Intenta de nuevo en 15 minutos.',
});

app.use('/api', limiter);
app.use('/api/auth', authLimiter);
app.use('/api/telemetry/devices/search', searchLimiter);

// Health check (público, sin auth, sin json parsing)
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as timestamp');
    res.json({
      status: 'healthy',
      timestamp: result.rows[0].timestamp,
      environment: config.nodeEnv,
    });
  } catch {
    res.status(503).json({
      status: 'unhealthy',
      error: 'Database connection failed',
    });
  }
});

// Better Auth handler — ANTES de express.json()
app.all('/api/auth/*', toNodeHandler(auth));

// JSON parsing — DESPUÉS del handler de better-auth
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(jsonErrorHandler); // Atrapa errores de JSON mal formado

// Rutas protegidas (todas requieren autenticación)
app.use('/api/dashboard', requireAuth, dashboardRouter);
app.use('/api/telemetry', requireAuth, telemetryRouter);
app.use('/api/config', requireAuth, configRouter);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
const server = app.listen(config.port, () => {
  console.log(`✓ Server running on port ${config.port} (${config.nodeEnv})`);
});

const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);

  const forceExit = setTimeout(() => {
    console.error('Forced shutdown after 30s');
    process.exit(1);
  }, 30000);
  forceExit.unref(); // No mantiene el proceso vivo

  server.close(async (err) => {
    if (err) {
      console.error('Error closing HTTP server:', err);
    } else {
      console.log('HTTP server closed');
    }
    clearTimeout(forceExit);
    try {
      await pool.end();
      console.log('Database pool closed');
    } catch (err) {
      console.error('Error closing database pool:', err);
    }
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT')); 
 
 
