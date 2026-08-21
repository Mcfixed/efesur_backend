import pool from '../config/database.js';

// ─── Helpers de formato ──────────────────────────────────────────────────────
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

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
}

function commandsSummary(metadata = {}) {
  const list = Array.isArray(metadata.commands)
    ? metadata.commands.map((c) => c.command)
    : metadata.command ? [metadata.command] : [];
  if (!list.length) return 'Ninguno';
  const labels = { persecucion: 'persecución', abortar: 'abortar' };
  return list.map((c) => labels[c] || c).join(' → ');
}

// ─── Consultas ───────────────────────────────────────────────────────────────
async function getAlertDetail(alertId) {
  const r = await pool.query(`
    SELECT a.id, a.type, a.metadata, a.created_at, a.resolved_at, a.user_reason,
      d.name AS device_name, d.dev_eui, d.latitude_current, d.longitude_current,
      u.name AS resolved_by_name
    FROM alerts a
    JOIN devices d ON a.device_id = d.id
    LEFT JOIN users u ON a.user_id = u.id
    WHERE a.id = $1
  `, [alertId]);
  return r.rows[0] || null;
}

async function getTrack(alertId) {
  const r = await pool.query(`
    SELECT timestamp, battery, latitude, longitude
    FROM tracking_alerts
    WHERE alert_id = $1
    ORDER BY timestamp ASC
  `, [alertId]);
  return r.rows;
}

async function getRecipients(alertId) {
  const r = await pool.query(`
    SELECT u.name, u.phone_whatsapp,
      COALESCE(NULLIF(u.notify_email_address, ''), u.email) AS email,
      u.notify_whatsapp, u.notify_email
    FROM alerts a
    JOIN devices d ON a.device_id = d.id
    JOIN companies_users cu ON cu.company_id = d.company_id AND cu.is_active = true
    JOIN users u ON u.id = cu.user_id
    WHERE a.id = $1 AND u.is_active = true AND (u.notify_whatsapp = true OR u.notify_email = true)
  `, [alertId]);
  return r.rows;
}

// ─── Formato del informe ─────────────────────────────────────────────────────
function buildWhatsAppText(r) {
  let t = `🔴 *INFORME ALERTA CRÍTICA RESUELTA*\n\n`;
  t += `📍 *Dispositivo:* ${r.device_name}\n`;
  t += `🔢 *EUI:* ${r.dev_eui}\n`;
  t += `⏱️ *Inicio:* ${fmtDate(r.created_at)}\n`;
  t += `⏹️ *Fin:* ${fmtDate(r.resolved_at)}\n`;
  t += `🕐 *Duración:* ${r.duration}\n`;
  t += `👤 *Resuelta por:* ${r.resolved_by}\n`;
  t += `📝 *Motivo:* ${r.reason}\n`;
  t += `⚡ *Comandos:* ${r.commands}\n`;
  t += `🗺️ *Puntos de track:* ${r.track_points}`;
  return t;
}

function buildEmailHtml(r) {
  const rows = [
    ['Dispositivo', r.device_name],
    ['EUI', r.dev_eui],
    ['Inicio', fmtDate(r.created_at)],
    ['Fin', fmtDate(r.resolved_at)],
    ['Duración', r.duration],
    ['Resuelta por', r.resolved_by],
    ['Motivo', r.reason],
    ['Comandos', r.commands],
    ['Puntos de track', String(r.track_points)],
  ]
    .map(([k, v]) => `<tr><td style="padding:6px 10px;border:1px solid #e5e7eb;font-weight:600;width:150px">${k}</td><td style="padding:6px 10px;border:1px solid #e5e7eb">${v}</td></tr>`)
    .join('');
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#111;background:#fff;margin:0;padding:24px">
    <h2 style="color:#dc2626;margin:0 0 4px">Informe de alerta crítica</h2>
    <p style="color:#6b7280;margin:0 0 16px">Alerta #${r.id} finalizada el ${fmtDate(r.resolved_at)}</p>
    <table style="border-collapse:collapse;width:100%;max-width:640px;font-size:14px">${rows}</table>
    <p style="color:#6b7280;font-size:13px;margin-top:16px">Se adjunta el informe completo en PDF con el detalle, los destinatarios y el recorrido (track) de la alerta.</p>
    <p style="color:#9ca3af;font-size:12px;margin-top:20px">Sistema de monitoreo EFE SUR — Wisensor</p>
  </body></html>`;
}

// ─── Orquestación ────────────────────────────────────────────────────────────
/** Arma el informe de una alerta crítica resuelta (datos + texto WA + HTML + destinatarios). */
export async function buildCriticalReport(alertId) {
  const [alert, track, recipients] = await Promise.all([
    getAlertDetail(alertId),
    getTrack(alertId),
    getRecipients(alertId),
  ]);
  if (!alert) return null;

  const base = {
    id: alert.id,
    device_name: alert.device_name || '—',
    dev_eui: alert.dev_eui || '—',
    created_at: alert.created_at,
    resolved_at: alert.resolved_at,
    duration: formatDuration(alert.created_at, alert.resolved_at),
    resolved_by: alert.resolved_by_name || '—',
    reason: alert.user_reason || '—',
    commands: commandsSummary(alert.metadata),
    track_points: track.length,
  };

  return {
    ...base,
    waText: buildWhatsAppText(base),
    emailHtml: buildEmailHtml(base),
    recipients,
  };
}

/**
 * Envía el informe (WhatsApp + correo) a los usuarios notificables de la empresa
 * del dispositivo. Se ejecuta en segundo plano; los errores por canal se registran
 * sin cortar el flujo principal.
 */
export async function sendCriticalReport(alertId) {
  const report = await buildCriticalReport(alertId);
  if (!report) {
    console.error('[informe] alerta no encontrada:', alertId);
    return;
  }
  const { recipients, waText, emailHtml } = report;
  if (!recipients || recipients.length === 0) {
    console.warn('[informe] sin destinatarios para alerta', alertId);
    return;
  }
  console.log(`[informe] alerta ${alertId}: ${recipients.length} destinatario(s)`);

  // Generar el PDF del informe (adjunto del CORREO; WhatsApp se mantiene en texto)
  let pdf = null;
  try {
    const { getPdfReport } = await import('./pdfReport.service.js');
    pdf = await getPdfReport(alertId);
  } catch (e) {
    console.error('[informe][PDF]', e.message);
  }
  const fileName = `Informe_Alerta_${alertId}.pdf`;

  const whatsapp = await import('./whatsapp.service.js');
  const email = await import('./email.service.js');

  for (const user of recipients) {
    if (user.notify_whatsapp && user.phone_whatsapp) {
      whatsapp.sendWhatsApp(user.phone_whatsapp, waText)
        .then(() => console.log(`[informe][WhatsApp] OK → ${user.phone_whatsapp}`))
        .catch((e) => console.error('[informe][WhatsApp]', e.message));
    }
    if (user.notify_email && user.email) {
      const attachments = pdf
        ? [{ filename: fileName, content: pdf, contentType: 'application/pdf' }]
        : [];
      email.sendEmail(user.email, `Informe alerta crítica - ${report.device_name}`, emailHtml, attachments)
        .then(() => console.log(`[informe][Correo] OK → ${user.email}${pdf ? ' (con PDF)' : ''}`))
        .catch((e) => console.error('[informe][Correo]', user.email, e.message));
    }
  }
}
