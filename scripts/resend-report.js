/**
 * Reenvía el informe de una alerta crítica resuelta a un correo (mismo contenido
 * y mismo PDF que el envío automático). Útil para pruebas y para soporte.
 *
 * Uso:  node scripts/resend-report.js [alertId] [correo]
 *       (sin alertId, usa la última crítica resuelta; sin correo, solo genera el PDF)
 *
 * No envía WhatsApp ni modifica nada en la base.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pool from '../src/config/database.js';
import { buildCriticalReport } from '../src/services/report.service.js';
import { getPdfReport } from '../src/services/pdfReport.service.js';
import { sendEmail } from '../src/services/email.service.js';

const arg = Number(process.argv[2]);
let alertId = Number.isInteger(arg) && arg > 0 ? arg : null;
const destino = process.argv[3] || null;

if (!alertId) {
  const r = await pool.query(`
    SELECT id FROM alerts WHERE type = 'critica' AND resolved_at IS NOT NULL
    ORDER BY resolved_at DESC LIMIT 1`);
  alertId = r.rows[0]?.id;
  if (!alertId) {
    console.error('No hay alertas críticas resueltas.');
    await pool.end();
    process.exit(1);
  }
  console.log(`(sin id: uso la última crítica resuelta #${alertId})`);
}

console.log('\n=== MENSAJE DE WHATSAPP QUE SE ENVIARÍA ===');
const t0 = Date.now();
const report = await buildCriticalReport(alertId);
if (!report) {
  console.error(`La alerta #${alertId} no existe.`);
  await pool.end();
  process.exit(1);
}
console.log(report.waText);
console.log('\nDestinatarios reales del informe (según BD):');
for (const u of report.recipients) {
  const canales = [];
  if (u.notify_whatsapp && u.phone_whatsapp) canales.push(`WhatsApp ${u.phone_whatsapp}`);
  if (u.notify_email && u.email) canales.push(`Correo ${u.email}`);
  console.log(`  - ${u.name}: ${canales.join(' · ') || 'sin canal'}`);
}

console.log('\n=== PDF ===');
const t1 = Date.now();
let pdf = null;
try {
  pdf = await getPdfReport(alertId);
} catch (e) {
  console.error(`FALLÓ: ${e.message}`);
}
console.log(pdf
  ? `OK ${(pdf.length / 1024).toFixed(0)} KB en ${((Date.now() - t1) / 1000).toFixed(1)}s`
  : `NO DISPONIBLE en ${((Date.now() - t1) / 1000).toFixed(1)}s`);

if (pdf) {
  const file = path.join(os.tmpdir(), `Informe_Alerta_${alertId}.pdf`);
  fs.writeFileSync(file, pdf);
  console.log('Copia local:', file);
}

if (destino) {
  console.log(`\n=== CORREO a ${destino} ===`);
  const t2 = Date.now();
  const info = await sendEmail(
    destino,
    `Informe alerta crítica - ${report.device_name}`,
    report.emailHtml,
    pdf ? [{ filename: `Informe_Alerta_${alertId}.pdf`, content: pdf, contentType: 'application/pdf' }] : []
  );
  console.log(`Enviado en ${((Date.now() - t2) / 1000).toFixed(1)}s · messageId=${info.messageId}`);
  console.log(pdf ? 'Adjunto: SÍ (Informe_Alerta_' + alertId + '.pdf)' : 'Adjunto: NO (el PDF no se generó)');
}

console.log(`\nTotal: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await pool.end();
process.exit(0);
