import express from 'express';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { appendFileSync, mkdirSync } from 'node:fs';
import rateLimit from 'express-rate-limit';
import { toNodeHandler } from 'better-auth/node';
import config from './config/index.js';
import { auth } from './config/auth.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler, notFoundHandler, jsonErrorHandler } from './middleware/errorHandler.js';
import pool from './config/database.js';
import dashboardRouter from './routes/dashboard.routes.js';
import configRouter from './routes/config.routes.js';
import chirpstackRouter from './routes/chirpstack.routes.js';
import auditRouter from './routes/audit.routes.js';
import monitorRouter from './routes/monitor.routes.js';

// ─── Global error handlers: NUNCA dejan morir el proceso; errores a consola + logs/crash.log ───
try { mkdirSync('logs', { recursive: true }); } catch { /* ignore */ }

function logCrash(tag, err) {
  const detail = err instanceof Error ? (err.stack || err.message) : String(err);
  console.error(`❌ ${tag}:`, detail);
  try { appendFileSync('logs/crash.log', `[${new Date().toISOString()}] ${tag}: ${detail}\n`); } catch { /* ignore */ }
}
process.on('unhandledRejection', (reason) => { logCrash('unhandledRejection', reason); });
process.on('uncaughtException', (err) => { logCrash('uncaughtException', err); });
// Monitor: se dispara antes que uncaughtException (diagnóstico extra)
process.on('uncaughtExceptionMonitor', (err, origin) => { logCrash(`uncaughtExceptionMonitor (${origin})`, err); });
// Registrar cualquier salida del proceso (para diagnosticar reinicios)
process.on('exit', (code) => {
  try { appendFileSync('logs/crash.log', `[${new Date().toISOString()}] process exit code=${code}\n`); } catch { /* ignore */ }
});
// Hook a process.exit para saber quién lo llama (evita reinicios "misteriosos")
const __originalExit = process.exit.bind(process);
process.exit = ((code) => {
  const stack = new Error('process.exit() fue llamado').stack;
  try { appendFileSync('logs/crash.log', `[${new Date().toISOString()}] process.exit(${code})\n${stack}\n`); } catch { /* ignore */ }
  __originalExit(code);
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
  max: 99999,
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

// Auth routes first — NO pasan por el limitador general (evita 429 en sesión)
app.use('/api/auth', authLimiter);
app.all('/api/auth/*', toNodeHandler(auth));

// Limitador general para el resto de /api (telemetry, dashboard, config)
app.use('/api', limiter);


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

// PDF del informe de alerta crítica (público: lo descarga el WhatsApp Manager por URL)
app.get('/report/:id.pdf', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'id de alerta inválido' });
  }
  try {
    const { getPdfReport } = await import('./services/pdfReport.service.js');
    const pdf = await getPdfReport(id);
    if (!pdf) return res.status(404).json({ error: 'informe no encontrado' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Informe_Alerta_${id}.pdf"`);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(pdf);
  } catch (e) {
    console.error('[report][PDF]', e.message);
    res.status(500).json({ error: 'error generando el PDF' });
  }
});

// JSON parsing — DESPUÉS del handler de better-auth
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(jsonErrorHandler); // Atrapa errores de JSON mal formado

// Rutas protegidas (todas requieren autenticación)
app.use('/api/dashboard', requireAuth, dashboardRouter);
app.use('/api/config', requireAuth, configRouter);
app.use('/api/chirpstack', requireAuth, chirpstackRouter);
app.use('/api/audit', requireAuth, auditRouter);
app.use('/api/monitor', requireAuth, monitorRouter);

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
 
 
