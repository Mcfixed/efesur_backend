/**
 * Diagnóstico del mapa del informe de alertas.
 *
 * Responde, en una sola corrida y sin adivinar:
 *   1. ¿Está instalado Leaflet en el backend?  (si falta, el informe dibuja solo el trazado SVG)
 *   2. ¿Se encuentra el navegador (Chrome/Edge/Chromium) para generar el PDF?
 *   3. ¿El servidor resuelve por DNS los hosts del mapa?
 *   4. ¿El proveedor de tiles responde 200 con una imagen, o está bloqueado (x-blocked)?
 *   5. Render real del último informe: cuántos tiles se pintan y si cae al SVG.
 *
 * Uso:
 *   cd efesur_backend
 *   node scripts/diag-informe.mjs
 *
 * Deja una captura del mapa en scripts/diag-mapa.png para revisarla.
 */
import 'dotenv/config';
import { existsSync, writeFileSync } from 'node:fs';
import dns from 'node:dns/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const req = createRequire(import.meta.url);
const linea = (t) => console.log(`\n=== ${t} ===`);

linea('1. Entorno');
console.log('node       :', process.version);
console.log('plataforma :', process.platform, process.arch);
console.log('cwd        :', process.cwd());

linea('2. Librerías del backend');
for (const paquete of ['leaflet', 'exceljs', 'puppeteer-core']) {
  try {
    console.log(`  ${paquete.padEnd(15)} OK → ${req.resolve(paquete)}`);
  } catch {
    console.log(`  ${paquete.padEnd(15)} FALTA → ejecutar "npm install" en efesur_backend`);
  }
}
let leafletOk = true;
try { req.resolve('leaflet/dist/leaflet.js'); } catch { leafletOk = false; }

linea('3. Navegador para el PDF');
const CANDIDATOS = process.platform === 'win32'
  ? ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe']
  : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium', '/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable'];
const env = (process.env.PUPPETEER_EXECUTABLE_PATH || '').trim();
const navegador = (env && existsSync(env)) ? env : CANDIDATOS.find((p) => existsSync(p));
console.log(navegador ? `  OK → ${navegador}` : `  NO ENCONTRADO. Probados: ${CANDIDATOS.join(' | ')}\n  Instala uno (apt install chromium / chromium-browser) o define PUPPETEER_EXECUTABLE_PATH en el .env`);

linea('4. DNS y HTTP de los hosts del mapa');
const TILES_URL = (process.env.TILES_URL || '').trim()
  || 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
console.log('TILES_URL  :', TILES_URL);

const hosts = ['server.arcgisonline.com', 'tile.openstreetmap.org', 'unpkg.com'];
for (const host of hosts) {
  try {
    const r = await dns.lookup(host, { all: true });
    console.log(`  DNS ${host.padEnd(26)} OK → ${r.map((x) => x.address).join(', ')}`);
  } catch (e) {
    console.log(`  DNS ${host.padEnd(26)} FALLA → ${e.code || e.message}`);
  }
}
try {
  const servers = await dns.getServers();
  console.log('  resolvers en uso:', servers.join(', ') || '(ninguno declarado)');
} catch { /* no soportado */ }

const tilePrueba = TILES_URL.replace('{z}', '18').replace('{y}', '164307').replace('{x}', '77924').replace('{s}', 'a');
for (const url of [tilePrueba, 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js']) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'EFESUR-Monitoring/1.0' } });
    const tipo = r.headers.get('content-type') || '';
    const blocked = r.headers.get('x-blocked') || 'no';
    const bytes = (await r.arrayBuffer()).byteLength;
    console.log(`  HTTP ${url.slice(0, 60)}… → ${r.status} · ${tipo} · ${bytes} bytes · ${Date.now() - t0}ms · x-blocked=${blocked}`);
  } catch (e) {
    console.log(`  HTTP ${url.slice(0, 60)}… → FALLA (${e.cause?.code || e.message})`);
  }
}

if (process.env.HTTP_PROXY || process.env.HTTPS_PROXY || process.env.https_proxy) {
  console.log('  OJO: hay proxy en el entorno. El navegador headless puede NO usarlo; revisa si hace falta --proxy-server.');
} else {
  console.log('  Sin variables de proxy en el entorno.');
}

linea('5. Render real del informe');
if (!navegador) {
  console.log('  Se omite: no hay navegador.');
  process.exit(0);
}
const puppeteer = (await import('puppeteer-core')).default;
const pool = (await import('../src/config/database.js')).default;
const { buildCriticalReport } = await import('../src/services/report.service.js');
const { buildHtml } = await import('../src/services/pdfRender.js');

const a = await pool.query(`
  SELECT a.id FROM alerts a
  WHERE a.type = 'critica' AND a.resolved_at IS NOT NULL
    AND EXISTS (SELECT 1 FROM tracking_alerts t WHERE t.alert_id = a.id AND t.latitude IS NOT NULL)
  ORDER BY a.resolved_at DESC LIMIT 1`);
if (!a.rows.length) {
  console.log('  No hay alertas críticas resueltas con track para probar.');
  process.exit(0);
}
const id = a.rows[0].id;
const rep = await buildCriticalReport(id);
const t = await pool.query(
  `SELECT timestamp, latitude::float8 AS lat, longitude::float8 AS lng
   FROM tracking_alerts WHERE alert_id = $1 ORDER BY timestamp ASC`, [id]);
const track = t.rows.map((r) => ({ lat: Number(r.lat), lng: Number(r.lng), ts: r.timestamp }));
console.log(`  alerta #${id} · ${rep.device_name} · ${track.length} puntos · leaflet ${leafletOk ? 'instalado' : 'FALTA'}`);

const html = buildHtml({
  id, type: 'critica', device_name: rep.device_name, dev_eui: 'x',
  created_at: rep.created_at, resolved_at: rep.resolved_at, duration: rep.duration,
  resolved_by: rep.resolved_by, reason: rep.reason, commands: rep.commands,
  commandsRaw: [], notified: null, recipients: rep.recipients, track, track_raw: track.length,
});

const browser = await puppeteer.launch({ executablePath: navegador, headless: true, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setViewport({ width: 800, height: 1100 });
const fallos = [];
page.on('requestfailed', (r) => { if (fallos.length < 8) fallos.push(`${r.url().slice(0, 90)} → ${r.failure()?.errorText}`); });
await page.setContent(html, { waitUntil: 'domcontentloaded' });
let est = {};
for (let i = 0; i < 30; i++) {
  est = await page.evaluate(() => ({
    ready: window.__PDF_READY__, svg: window.__PDF_SVG__,
    tiles: document.querySelectorAll('.leaflet-tile-loaded').length,
    leaflet: typeof window.L,
  }));
  if (est.ready || est.svg) { console.log(`  decisión a los ${i * 500} ms:`, JSON.stringify(est)); break; }
  await new Promise((r) => setTimeout(r, 500));
}
const el = await page.$('#track-map');
if (el) { try { writeFileSync(fileURLToPath(new URL('./diag-mapa.png', import.meta.url)), await el.screenshot({ type: 'png' })); } catch { /* ignore */ } }
await browser.close();

console.log(`\nRESULTADO: ${est.ready ? '✅ mapa real (tiles cargados: ' + est.tiles + ')' : '⚠️  sin mapa base → se usa el trazado SVG'}`);
if (fallos.length) console.log('Fallos de red del navegador:\n  ' + fallos.join('\n  '));
console.log('Captura del mapa: scripts/diag-mapa.png');
if (!leafletOk) console.log('→ Falta Leaflet: ejecuta "npm install" en efesur_backend y reinicia.');
else if (!est.ready) console.log('→ Leaflet está, pero no se pintó ningún tile: revisa DNS/proxy/bloqueo del proveedor con el paso 4.');
process.exit(0);
