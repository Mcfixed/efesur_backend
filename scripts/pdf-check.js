/**
 * Diagnóstico del PDF del informe de alerta crítica.
 *
 * Uso:  node scripts/pdf-check.js [alertId]
 *       (sin id, toma la última alerta crítica resuelta)
 *
 * Solo lee la base y genera el PDF en memoria (no envía nada, no escribe nada).
 * Sirve para responder: "¿por qué el correo llega sin adjunto?"
 */
import os from 'node:os';
import { existsSync } from 'node:fs';
import pool from '../src/config/database.js';

// Rutas que busca el código actual (solo Windows)
const RUTAS_CODIGO = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];
// Rutas habituales en Linux/macOS (el código actual NO las busca)
const RUTAS_SERVIDOR = [
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium',
  '/usr/bin/microsoft-edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

const sep = () => console.log('─'.repeat(70));

console.log('\n=== ENTORNO ===');
console.log('SO:            ', os.platform(), os.release());
console.log('Node:          ', process.version);
console.log('Zona horaria:  ', Intl.DateTimeFormat().resolvedOptions().timeZone);
console.log('PUPPETEER_EXECUTABLE_PATH:', process.env.PUPPETEER_EXECUTABLE_PATH || '(no definida)');

sep();
console.log('=== NAVEGADORES ===');
console.log('Rutas que busca el código (solo Windows):');
for (const p of RUTAS_CODIGO) console.log(`  ${existsSync(p) ? '✔ EXISTE ' : '✘ falta  '} ${p}`);
console.log('Rutas típicas de Linux/macOS (el código NO las busca todavía):');
for (const p of RUTAS_SERVIDOR) console.log(`  ${existsSync(p) ? '✔ EXISTE ' : '✘ falta  '} ${p}`);

// Alerta a revisar
let alertId = Number(process.argv[2]);
if (!Number.isInteger(alertId) || alertId <= 0) {
  const r = await pool.query(`
    SELECT id FROM alerts
    WHERE type = 'critica' AND resolved_at IS NOT NULL
    ORDER BY resolved_at DESC LIMIT 1`);
  alertId = r.rows[0]?.id;
  if (!alertId) {
    console.error('\nNo hay alertas críticas resueltas para probar.');
    await pool.end();
    process.exit(1);
  }
  console.log(`\n(sin id en el comando: uso la última crítica resuelta #${alertId})`);
}

sep();
console.log(`=== ALERTA #${alertId} ===`);
const alerta = await pool.query(`
  SELECT a.id, a.type, a.created_at::text AS creada, a.resolved_at::text AS resuelta,
         d.name AS dispositivo, d.company_id,
         (SELECT COUNT(*) FROM tracking_alerts t WHERE t.alert_id = a.id) AS puntos_crudos,
         (SELECT COUNT(*) FROM tracking_alerts t WHERE t.alert_id = a.id
            AND t.latitude IS NOT NULL AND t.longitude IS NOT NULL
            AND t.latitude <> 0 AND t.longitude <> 0
            AND t.latitude BETWEEN -57 AND -17 AND t.longitude BETWEEN -77 AND -63) AS puntos_validos
  FROM alerts a JOIN devices d ON a.device_id = d.id
  WHERE a.id = $1`, [alertId]);
if (alerta.rowCount === 0) {
  console.error(`La alerta #${alertId} no existe.`);
  await pool.end();
  process.exit(1);
}
const a = alerta.rows[0];
console.log('Dispositivo:      ', a.dispositivo, `(empresa ${a.company_id})`);
console.log('Creada / resuelta:', a.creada, '→', a.resuelta);
console.log('Puntos de track:  ', `${a.puntos_validos} válidos de ${a.puntos_crudos} crudos`,
  Number(a.puntos_validos) >= 2 ? '(va con mapa)' : '(SIN mapa: menos de 2 puntos válidos)');

const dest = await pool.query(`
  SELECT u.name, u.phone_whatsapp, u.notify_whatsapp, u.notify_email,
         COALESCE(NULLIF(u.notify_email_address, ''), u.email) AS email
  FROM alerts a
  JOIN devices d ON a.device_id = d.id
  JOIN companies_users cu ON cu.company_id = d.company_id AND cu.is_active = true
  JOIN users u ON u.id = cu.user_id
  WHERE a.id = $1 AND u.is_active_notification = true AND (u.notify_whatsapp = true OR u.notify_email = true)`,
  [alertId]);
console.log(`Destinatarios:    ${dest.rowCount}`);
for (const u of dest.rows) {
  const canales = [];
  if (u.notify_whatsapp && u.phone_whatsapp) canales.push(`WhatsApp ${u.phone_whatsapp}`);
  if (u.notify_email && u.email) canales.push(`Correo ${u.email}`);
  console.log(`  - ${u.name}: ${canales.join(' · ') || 'sin canal activo'}`);
}

sep();
console.log('=== GENERANDO PDF (igual que en el informe) ===');
const { getPdfReport } = await import('../src/services/pdfReport.service.js');
const t0 = Date.now();
let ok = false;
try {
  const pdf = await getPdfReport(alertId);
  const segundos = ((Date.now() - t0) / 1000).toFixed(1);
  if (pdf) {
    ok = true;
    console.log(`✔ PDF generado: ${(pdf.length / 1024).toFixed(0)} KB en ${segundos}s`);
  } else {
    console.log(`✘ getPdfReport devolvió null (no se encontró la alerta o sus datos) — ${segundos}s`);
  }
} catch (e) {
  console.log(`✘ FALLÓ a los ${((Date.now() - t0) / 1000).toFixed(1)}s: ${e.message}`);
  console.log(e.stack);
}

sep();
if (ok) {
  console.log('VEREDICTO: el PDF se genera correctamente en este equipo.');
  console.log('Si en producción el correo llega sin adjunto, revisa los logs del backend:');
  console.log('  pm2 logs efesur-backend --lines 300 | grep -iE "informe|pdf"');
} else {
  console.log('VEREDICTO: el PDF NO se genera acá → este es el motivo del correo sin adjunto.');
  console.log('Causas típicas: no hay Edge/Chrome en las rutas que busca el código,');
  console.log('el navegador no arranca (sandbox/permisos) o el render se pasó de los 90s.');
}

await pool.end();
process.exit(ok ? 0 : 1);
