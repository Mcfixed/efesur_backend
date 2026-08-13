import pool from '../config/database.js';

// Timeout global por check (ms)
const CHECK_TIMEOUT = 4000;

// Helper: promesa con timeout
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

// ─── Base de Datos ───
async function checkDatabase() {
  const t0 = Date.now();
  try {
    const r = await withTimeout(pool.query('SELECT NOW() as now, version() as version'), CHECK_TIMEOUT);
    return {
      key: 'database', label: 'Base de Datos', online: true,
      latencyMs: Date.now() - t0,
      detail: r.rows[0]?.now ?? null,
    };
  } catch (e) {
    return { key: 'database', label: 'Base de Datos', online: false, latencyMs: Date.now() - t0, error: e.message };
  }
}

// ─── LoRaWAN / ChirpStack (health HTTP) ───
async function checkChirpstack() {
  const t0 = Date.now();
  // CHIRPSTACK_HEALTH_URL se usa SOLO para el health check (HTTP).
  // CHIRPSTACK_URL queda intacta para sendCommand (gRPC).
  const server = process.env.CHIRPSTACK_HEALTH_URL || process.env.CHIRPSTACK_URL;
  if (!server) {
    return { key: 'lorawan', label: 'LoRaWAN', online: false, latencyMs: Date.now() - t0, error: 'CHIRPSTACK_URL no configurada' };
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT);
    const res = await fetch(server, { signal: controller.signal, redirect: 'follow' });
    clearTimeout(timer);
    return {
      key: 'lorawan', label: 'LoRaWAN', online: res.ok || res.status < 500,
      latencyMs: Date.now() - t0, detail: `HTTP ${res.status}`,
    };
  } catch (e) {
    return { key: 'lorawan', label: 'LoRaWAN', online: false, latencyMs: Date.now() - t0, error: e.name === 'AbortError' ? 'timeout' : e.message };
  }
}

// ─── Node-RED (HTTP health) ───
async function checkNodeRed() {
  const t0 = Date.now();
  const url = process.env.NODERED_URL;
  if (!url) {
    return { key: 'nodered', label: 'Node-RED', online: false, latencyMs: Date.now() - t0, error: 'NODERED_URL no configurada' };
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT);
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    clearTimeout(timer);
    return {
      key: 'nodered', label: 'Node-RED', online: res.ok || res.status < 500,
      latencyMs: Date.now() - t0, detail: `HTTP ${res.status}`,
    };
  } catch (e) {
    return { key: 'nodered', label: 'Node-RED', online: false, latencyMs: Date.now() - t0, error: e.name === 'AbortError' ? 'timeout' : e.message };
  }
}

// ─── WhatsApp / Wassenger (HTTP API) ───
async function checkWhatsapp() {
  const t0 = Date.now();
  const base = process.env.WHATSAPP_API_URL;
  const apiKey = process.env.WHATSAPP_API_KEY;
  if (!base || !apiKey) {
    return { key: 'whatsapp', label: 'WhatsApp', online: false, latencyMs: Date.now() - t0, error: 'WHATSAPP_API_URL / API_KEY no configuradas' };
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT);
    const res = await fetch(`${base.replace(/\/+$/, '')}/api/v1/messages/connected`, {
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    clearTimeout(timer);
    let detail = `HTTP ${res.status}`;
    if (res.ok) {
      try {
        const body = await res.json();
        if (Array.isArray(body) && body.length > 0) detail = `Sesión: ${body[0].name ?? body[0].id ?? 'conectada'}`;
        else if (Array.isArray(body)) detail = 'Sin sesiones conectadas';
      } catch { /* mantener detail por defecto */ }
    }
    return { key: 'whatsapp', label: 'WhatsApp', online: res.ok, latencyMs: Date.now() - t0, detail };
  } catch (e) {
    return { key: 'whatsapp', label: 'WhatsApp', online: false, latencyMs: Date.now() - t0, error: e.name === 'AbortError' ? 'timeout' : e.message };
  }
}

// ─── Estado de todos los servicios ───
export const getSystemServicesService = async () => {
  const [database, lorawan, nodered, whatsapp] = await Promise.all([
    checkDatabase(), checkChirpstack(), checkNodeRed(), checkWhatsapp(),
  ]);
  const services = [database, lorawan, nodered, whatsapp];
  return {
    checkedAt: new Date().toISOString(),
    total: services.length,
    online: services.filter(s => s.online).length,
    offline: services.filter(s => !s.online).length,
    services,
  };
};
