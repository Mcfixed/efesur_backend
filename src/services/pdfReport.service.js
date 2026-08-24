/**
 * Genera el PDF del informe de alerta crítica resuelta.
 * El render (puppeteer/Edge) corre en un WORKER THREAD (pdfWorker.js) para que
 * un fallo de puppeteer/Edge NUNCA derribe el proceso principal del backend.
 */
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import pool from '../config/database.js';

/** Cache en memoria: alertId -> Buffer (PDF). */
const pdfCache = new Map();

const WORKER_PATH = fileURLToPath(new URL('./pdfWorker.js', import.meta.url));

/** Ejecuta el render del PDF en un worker aislado (timeout 90s). */
function renderInWorker(data) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_PATH);
    const timer = setTimeout(() => {
      worker.terminate().catch(() => {});
      reject(new Error('PDF: tiempo de generación agotado'));
    }, 90000);
    worker.once('message', (msg) => {
      clearTimeout(timer);
      worker.terminate().catch(() => {});
      if (msg && msg.ok) resolve(Buffer.from(msg.buffer));
      else reject(new Error((msg && msg.error) || 'PDF: error en el worker'));
    });
    worker.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    worker.postMessage({ data });
  });
}

// ─── Datos para el informe ──────────────────────────────────────────────────
// Rango geográfico del sistema (Chile): descarta puntos basura (0,0, Brasil…)
const MIN_LAT = -57, MAX_LAT = -17, MIN_LNG = -77, MAX_LNG = -63;
function validPoint(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng)
    && lat !== 0 && lng !== 0
    && lat >= MIN_LAT && lat <= MAX_LAT
    && lng >= MIN_LNG && lng <= MAX_LNG;
}

function formatDuration(from, to) {
  const ms = new Date(to).getTime() - new Date(from).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const totalMin = Math.floor(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

function commandsSummary(metadata = {}) {
  const list = Array.isArray(metadata.commands)
    ? metadata.commands.map((c) => c.command)
    : metadata.command ? [metadata.command] : [];
  if (!list.length) return 'Ninguno';
  const labels = { persecucion: 'persecución', abortar: 'abortar' };
  return list.map((c) => labels[c] || c).join(' → ');
}

async function getAlertDetail(alertId) {
  const r = await pool.query(`
    SELECT a.id, a.type, a.metadata, a.created_at, a.resolved_at, a.user_reason,
      d.name AS device_name, d.dev_eui, u.name AS resolved_by_name
    FROM alerts a
    JOIN devices d ON a.device_id = d.id
    LEFT JOIN users u ON a.user_id = u.id
    WHERE a.id = $1
  `, [alertId]);
  return r.rows[0] || null;
}

async function getTrack(alertId) {
  const r = await pool.query(`
    SELECT timestamp, latitude, longitude
    FROM tracking_alerts
    WHERE alert_id = $1
    ORDER BY timestamp ASC
  `, [alertId]);
  return r.rows;
}

/** Destinatarios de este informe (misma lógica que report.service). */
async function getRecipients(alertId) {
  const r = await pool.query(`
    SELECT u.name, u.phone_whatsapp, u.notify_whatsapp, u.notify_email,
      COALESCE(NULLIF(u.notify_email_address, ''), u.email) AS email
    FROM alerts a
    JOIN devices d ON a.device_id = d.id
    JOIN companies_users cu ON cu.company_id = d.company_id AND cu.is_active = true
    JOIN users u ON u.id = cu.user_id
    WHERE a.id = $1 AND u.is_active = true AND (u.notify_whatsapp = true OR u.notify_email = true)
  `, [alertId]);
  return r.rows;
}

/** Quiénes fueron notificados al inicio de la alerta (lo guarda Node-RED en metadata). */
function parseNotified(metadata = {}) {
  const n = metadata.notificados;
  if (!n || typeof n !== 'object') return null;
  return {
    whatsapp: Array.isArray(n.whatsapp) ? n.whatsapp : [],
    correo: Array.isArray(n.correo) ? n.correo : [],
    llamadas: Array.isArray(n.llamadas) ? n.llamadas : [],
  };
}

async function buildReportData(alertId) {
  const [alert, track, recipients] = await Promise.all([
    getAlertDetail(alertId),
    getTrack(alertId),
    getRecipients(alertId),
  ]);
  if (!alert) return null;
  const pts = track
    .map((p) => ({ lat: Number(p.latitude), lng: Number(p.longitude), ts: p.timestamp }))
    .filter((p) => validPoint(p.lat, p.lng));
  return {
    id: alert.id,
    type: alert.type,
    device_name: alert.device_name || '—',
    dev_eui: alert.dev_eui || '—',
    created_at: alert.created_at,
    resolved_at: alert.resolved_at,
    duration: formatDuration(alert.created_at, alert.resolved_at),
    resolved_by: alert.resolved_by_name || '—',
    reason: alert.user_reason || '—',
    commands: commandsSummary(alert.metadata),
    commandsRaw: Array.isArray(alert.metadata?.commands) ? alert.metadata.commands : [],
    notified: parseNotified(alert.metadata),
    recipients,
    track: pts,
    track_raw: track.length,
  };
}

/**
 * Devuelve (generando y cacheando) el Buffer del PDF del informe de una alerta.
 * @param {number} alertId
 * @returns {Promise<Buffer|null>}
 */
export async function getPdfReport(alertId) {
  if (pdfCache.has(alertId)) return pdfCache.get(alertId);
  const data = await buildReportData(alertId);
  if (!data) return null;
  const buffer = await renderInWorker(data);
  pdfCache.set(alertId, buffer);
  return buffer;
}

/** Limpia el cache (útil en pruebas). */
export function clearPdfCache() { pdfCache.clear(); }
