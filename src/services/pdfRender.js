/**
 * Render del informe → PDF (puppeteer-core + Edge/Chrome del sistema).
 * Se ejecuta DENTRO de un worker thread (pdfWorker.js) para que un fallo de
 * puppeteer/Edge NUNCA derribe el proceso principal del backend.
 */
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const EDGE_X86 = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const EDGE_X64 = 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

let _browser = null;

function findBrowser() {
  for (const p of [EDGE_X86, EDGE_X64, CHROME]) {
    if (existsSync(p)) return p;
  }
  return null;
}

async function getBrowser() {
  if (_browser) return _browser;
  const executablePath = findBrowser();
  if (!executablePath) {
    throw new Error('No se encontró Edge/Chrome instalado para generar el PDF del informe');
  }
  _browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  _browser.on('disconnected', () => { _browser = null; });
  return _browser;
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
}

function buildHtml(d) {
  const hasTrack = d.track && d.track.length >= 2;
  const mapDiv = hasTrack
    ? `<div style="margin-top:8px">
        <div id="track-map" style="width:690px;max-width:100%;height:340px;border:1px solid #e2e8f0;border-radius:6px;background:#e8e8e8;overflow:hidden"></div>
        <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:9px;color:#888">
          <span>Inicio: ${fmtDate(d.track[0].ts)}</span>
          <span>${d.track.length} puntos</span>
          <span>Fin: ${fmtDate(d.track[d.track.length - 1].ts)}</span>
        </div>
      </div>`
    : `<p style="color:#9ca3af;font-size:11px;margin:6px 0 0">Sin recorrido registrado (${d.track_raw} puntos crudos)</p>`;

  // Comandos enviados (detalle)
  const commandsHtml = d.commandsRaw.length
    ? d.commandsRaw.map((c) => `<li style="font-size:11px;color:#333;margin:2px 0"><b>${esc(c.command)}</b> — ${esc(c.detail || c.status || 'enviado')} · ${fmtDate(c.sent_at || c.timestamp)}</li>`).join('')
    : `<p style="font-size:11px;color:#9ca3af;margin:0">${d.commands}</p>`;

  // Destinatarios de este informe
  const recRows = d.recipients.length
    ? d.recipients.map((u) => {
        const ch = [];
        if (u.notify_whatsapp && u.phone_whatsapp) ch.push(`WhatsApp ${u.phone_whatsapp}`);
        if (u.notify_email && u.email) ch.push(`Correo ${u.email}`);
        return `<tr><td style="padding:5px 8px;border:1px solid #e5e7eb;font-size:11px;font-weight:600">${esc(u.name)}</td>
          <td style="padding:5px 8px;border:1px solid #e5e7eb;font-size:11px">${esc(ch.join(' · ') || '—')}</td></tr>`;
      }).join('')
    : `<tr><td colspan="2" style="padding:5px 8px;border:1px solid #e5e7eb;font-size:11px;color:#9ca3af">Sin destinatarios activos</td></tr>`;

  // Notificados al inicio (lo registró Node-RED)
  const n = d.notified;
  const notifiedHtml = n
    ? `<table style="width:100%;border-collapse:collapse;margin-top:6px">
        ${[['WhatsApp', n.whatsapp], ['Correo', n.correo], ['Llamadas', n.llamadas]].map(([ch, list]) => `
          <tr><td style="padding:4px 8px;border:1px solid #e5e7eb;font-size:11px;font-weight:600;width:110px;background:#fafafa">${ch}</td>
          <td style="padding:4px 8px;border:1px solid #e5e7eb;font-size:11px">${list.length ? esc(list.join(' · ')) : '<span style="color:#9ca3af">—</span>'}</td></tr>`).join('')}
      </table>`
    : `<p style="font-size:11px;color:#9ca3af;margin:6px 0 0">Sin registro de notificación inicial</p>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Informe Alerta ${d.id}</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <style>
      @page { margin: 14mm 12mm; }
      body { font-family: Arial, Helvetica, sans-serif; color: #1f2937; background: #fff; margin: 0; padding: 0; font-size: 12px; line-height: 1.45; }
      .leaflet-container { background: #dfe6ea; }
      .leaflet-control-attribution { font-size: 8px !important; }
      .track-map { page-break-inside: avoid; }
      .section-title { font-size: 12px; font-weight: 700; color: #111; text-transform: uppercase; letter-spacing: 0.6px; margin: 18px 0 8px; padding-bottom: 5px; border-bottom: 1px solid #e5e7eb; }
      table.data { width: 100%; border-collapse: collapse; }
      table.data th, table.data td { padding: 5px 9px; border: 1px solid #e5e7eb; font-size: 11px; }
      table.data th { background: #f3f4f6; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; }
    </style>
  </head><body>
    <div style="padding:2px">
      <div style="text-align:center;padding:4px 10px 14px;border-bottom:3px solid #dc2626">
        <p style="font-size:10px;color:#dc2626;font-weight:700;text-transform:uppercase;letter-spacing:2px;margin:0 0 4px">Informe de alerta crítica</p>
        <h1 style="font-size:22px;color:#111;margin:0 0 4px">Alerta #${d.id}</h1>
        <p style="font-size:11px;color:#6b7280;margin:0">${esc(d.device_name)} · ${esc(d.dev_eui)} · Finalizada el ${fmtDate(d.resolved_at)}</p>
      </div>

      <h2 class="section-title">Detalle de la alerta</h2>
      <table class="data">
        ${[['Dispositivo', d.device_name], ['EUI', d.dev_eui], ['Tipo', d.type || 'crítica'], ['Inicio', fmtDate(d.created_at)],
            ['Fin', fmtDate(d.resolved_at)], ['Duración', d.duration], ['Resuelta por', d.resolved_by],
            ['Motivo', d.reason]].map(([k, v]) => `
          <tr><td style="width:150px;font-weight:600;background:#fafafa">${k}</td>
              <td>${esc(v)}</td></tr>`).join('')}
      </table>

      <h2 class="section-title">Comandos enviados</h2>
      <ul style="margin:0;padding-left:18px">${commandsHtml}</ul>

      <h2 class="section-title">Notificación de la alerta</h2>
      <p style="font-size:11px;color:#555;margin:0 0 4px"><b>Destinatarios de este informe:</b></p>
      <table class="data">
        <tr><th>Nombre</th><th>Canales</th></tr>
        ${recRows}
      </table>
      <p style="font-size:11px;color:#555;margin:10px 0 4px"><b>Notificados al inicio de la alerta:</b></p>
      ${notifiedHtml}

      <div class="track-map" style="margin-top:18px">
        <h2 class="section-title">Recorrido de la alerta</h2>
        ${mapDiv}
      </div>
      <p style="color:#9ca3af;font-size:9px;margin-top:16px;border-top:1px solid #f0f0f0;padding-top:8px">Sistema de monitoreo EFE SUR — Wisensor · Generado ${fmtDate(new Date().toISOString())}</p>
    </div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
    <script>
      window.__PDF_READY__ = ${hasTrack ? 'false' : 'true'};
      ${hasTrack ? `
      var pts = ${JSON.stringify(d.track.map((p) => [p.lat, p.lng]))};
      var map = L.map('track-map', { zoomControl: false, attributionControl: true, scrollWheelZoom: false });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
      L.polyline(pts, { color: '#ef4444', weight: 3, opacity: 0.85 }).addTo(map);
      pts.forEach(function(pos, i) {
        var isFirst = i === 0, isLast = i === pts.length - 1;
        var color = isFirst ? '#22c55e' : isLast ? '#ef4444' : '#3b82f6';
        L.circleMarker(pos, { radius: isFirst || isLast ? 8 : 4, color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.9 }).addTo(map);
      });
      map.fitBounds(L.latLngBounds(pts), { padding: [30, 30] });
      map.whenReady(function(){ setTimeout(function(){ map.invalidateSize(); }, 150); });
      map.on('load', function(){ window.__PDF_READY__ = true; });
      setTimeout(function(){ window.__PDF_READY__ = true; }, 12000);
      ` : ''}
    <\/script>
  </body></html>`;
}

/** Renderiza el informe a PDF. Devuelve un Buffer. */
export async function renderPdfFromData(data) {
  const html = buildHtml(data);
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 800, height: 1100 });
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // Esperar a que los mapas terminen de cargar tiles (máx ~25s)
    for (let i = 0; i < 50; i++) {
      const ready = await page.evaluate(() => window.__PDF_READY__).catch(() => true);
      if (ready) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => {});
  }
}
