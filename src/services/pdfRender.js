/**
 * Render del informe → PDF (puppeteer-core + Edge/Chrome del sistema).
 * Se ejecuta DENTRO de un worker thread (pdfWorker.js) para que un fallo de
 * puppeteer/Edge NUNCA derribe el proceso principal del backend.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import puppeteer from 'puppeteer-core';

// Leaflet se incrusta desde node_modules: el servidor puede no tener salida a internet
// (el CDN de unpkg se bloquea), y sin la librería el mapa del informe salía en blanco.
const LEAFLET = (() => {
  try {
    const req = createRequire(import.meta.url);
    const css = readFileSync(req.resolve('leaflet/dist/leaflet.css'), 'utf8');
    const js = readFileSync(req.resolve('leaflet/dist/leaflet.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
    return { css, js };
  } catch (e) {
    console.error('[pdfRender] Leaflet local no disponible (se usará solo el trazado SVG):', e.message);
    return { css: '', js: '' };
  }
})();

// Rutas típicas del navegador según el SO (el servidor no tiene por qué ser Windows)
const CANDIDATOS = process.platform === 'win32'
  ? [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ]
  : process.platform === 'darwin'
    ? [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
      ]
    : [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/snap/bin/chromium',
        '/usr/bin/microsoft-edge',
      ];

let _browser = null;

function findBrowser() {
  // 1) Ruta explícita por .env (útil en servidores con rutas no estándar)
  const env = (process.env.PUPPETEER_EXECUTABLE_PATH || '').trim();
  if (env && existsSync(env)) return env;
  // 2) Rutas típicas del SO
  for (const p of CANDIDATOS) {
    if (existsSync(p)) return p;
  }
  return null;
}

async function getBrowser() {
  if (_browser) return _browser;
  const executablePath = findBrowser();
  if (!executablePath) {
    throw new Error(
      `No se encontró Edge/Chrome para generar el PDF del informe (SO: ${process.platform}). ` +
      `Rutas probadas: ${CANDIDATOS.join(' | ')}. ` +
      `Instala un navegador o define PUPPETEER_EXECUTABLE_PATH en el .env`
    );
  }
  _browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  console.log('[pdfWorker] navegador:', executablePath);
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

/**
 * Trazado del recorrido como SVG, sin tiles ni internet.
 * Es el respaldo cuando el mapa real no puede cargarse (servidor sin salida a la red):
 * dibuja el camino, el inicio y el fin, con la referencia geográfica en los bordes.
 */
function buildTrackSvg(track, { width = 690, height = 340 } = {}) {
  // Mismo rango que valida el backend (Chile): descarta puntos basura (0,0, Brasil…),
  // que si no estiran el dibujo y la ruta queda como una diagonal sin sentido.
  const puntosValidos = (track || []).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)
    && p.lat !== 0 && p.lng !== 0
    && p.lat >= -57 && p.lat <= -17 && p.lng >= -77 && p.lng <= -63);
  if (!puntosValidos.length) {
    return '<p style="color:#9ca3af;font-size:11px;margin:6px 0 0">Sin coordenadas válidas para dibujar el recorrido</p>';
  }
  track = puntosValidos;
  const lats = track.map((p) => p.lat);
  const lngs = track.map((p) => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const spanLat = Math.max(maxLat - minLat, 0);
  const spanLng = Math.max(maxLng - minLng, 0);
  const pad = 30;
  const availW = width - pad * 2;
  const availH = height - pad * 2;
  // Un sensor detenido tiene todos los puntos en el mismo lugar: se usa un mínimo (~40 m)
  // para que el punto quede centrado en un marco con escala, en vez de pegado a una esquina.
  const MIN_SPAN = 0.0004;
  const sinDesplazamiento = spanLat < MIN_SPAN && spanLng < MIN_SPAN;
  const spanLatEff = Math.max(spanLat, MIN_SPAN);
  const spanLngEff = Math.max(spanLng, MIN_SPAN);
  const midLat = (minLat + maxLat) / 2;
  const midLng = (minLng + maxLng) / 2;
  const scale = Math.min(availW / spanLngEff, availH / spanLatEff);
  const X = (lng) => width / 2 + (lng - midLng) * scale;
  const Y = (lat) => height / 2 - (lat - midLat) * scale;

  const puntos = track.map((p) => `${X(p.lng).toFixed(1)},${Y(p.lat).toFixed(1)}`);
  const camino = puntos.join(' ');
  const grid = [];
  for (let i = 0; i <= 4; i++) {
    const x = pad + (availW / 4) * i;
    grid.push(`<line x1="${x.toFixed(0)}" y1="${pad}" x2="${x.toFixed(0)}" y2="${height - pad}" stroke="#e5e7eb" stroke-width="1" />`);
  }
  for (let i = 0; i <= 3; i++) {
    const y = pad + (availH / 3) * i;
    grid.push(`<line x1="${pad}" y1="${y.toFixed(0)}" x2="${width - pad}" y2="${y.toFixed(0)}" stroke="#e5e7eb" stroke-width="1" />`);
  }
  // Referencia de escala: cruz en el centro cuando el sensor no se movió
  if (sinDesplazamiento) {
    grid.push(`<line x1="${width / 2}" y1="${height / 2 - 26}" x2="${width / 2}" y2="${height / 2 + 26}" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="3 3" />`);
    grid.push(`<line x1="${width / 2 - 26}" y1="${height / 2}" x2="${width / 2 + 26}" y2="${height / 2}" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="3 3" />`);
  }
  const intermedios = track.slice(1, -1)
    .map((p) => `<circle cx="${X(p.lng).toFixed(1)}" cy="${Y(p.lat).toFixed(1)}" r="3.2" fill="#3b82f6" stroke="#fff" stroke-width="1.2" />`)
    .join('');  const ini = track[0];
  const fin = track[track.length - 1];

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" />
    ${grid.join('')}
    <polyline points="${camino}" fill="none" stroke="#ef4444" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" />
    ${intermedios}
    <circle cx="${X(ini.lng).toFixed(1)}" cy="${Y(ini.lat).toFixed(1)}" r="7" fill="#22c55e" stroke="#fff" stroke-width="2" />
    <circle cx="${X(fin.lng).toFixed(1)}" cy="${Y(fin.lat).toFixed(1)}" r="7" fill="#ef4444" stroke="#fff" stroke-width="2" />
    <text x="${pad}" y="${pad - 12}" font-family="Arial,Helvetica,sans-serif" font-size="9" fill="#6b7280">Lat ${maxLat.toFixed(5)}</text>
    <text x="${pad}" y="${height - 12}" font-family="Arial,Helvetica,sans-serif" font-size="9" fill="#6b7280">Lat ${minLat.toFixed(5)}</text>
    <text x="${pad}" y="${height - 24}" font-family="Arial,Helvetica,sans-serif" font-size="9" fill="#9ca3af">Lng ${minLng.toFixed(5)} → ${maxLng.toFixed(5)} · ${track.length} puntos · trazado georreferenciado (sin mapa base)${sinDesplazamiento ? ' · sin desplazamiento' : ''}</text>
    <text x="${width - pad}" y="${pad - 12}" text-anchor="end" font-family="Arial,Helvetica,sans-serif" font-size="9" fill="#6b7280">Inicio ${fmtDate(ini.ts)} · Fin ${fmtDate(fin.ts)}</text>
  </svg>`;
}

// Exportado también para poder probar el HTML del informe sin generar el PDF completo.
export function buildHtml(d) {
  const hasTrack = d.track && d.track.length >= 2;
  const mapDiv = hasTrack
    ? `<div style="margin-top:8px">
        <div id="track-map" style="width:690px;max-width:100%;height:340px;border:1px solid #e2e8f0;border-radius:6px;background:#e8e8e8;overflow:hidden"></div>
        <div id="track-svg" style="display:none;width:690px;max-width:100%;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden">${buildTrackSvg(d.track)}</div>
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
    <style>${LEAFLET.css}</style>
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
        <p style="font-size:11px;color:#6b7280;margin:0">${esc(d.device_name)} · Finalizada el ${fmtDate(d.resolved_at)}</p>
      </div>

      <h2 class="section-title">Detalle de la alerta</h2>
      <table class="data">
        ${[['Dispositivo', d.device_name], ['Tipo', d.type || 'crítica'], ['Inicio', fmtDate(d.created_at)],
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
    <script>${LEAFLET.js}<\/script>
    <script>
      window.__PDF_READY__ = ${hasTrack ? 'false' : 'true'};
      window.__PDF_SVG__ = false;
      // Respaldo sin red: si los tiles no llegaron (servidor sin internet) o Leaflet no
      // existe, se muestra el trazado SVG y el informe nunca queda con un mapa en blanco.
      window.__USAR_SVG__ = function () {
        if (window.__PDF_READY__ || window.__PDF_SVG__) return;
        window.__PDF_SVG__ = true;
        var m = document.getElementById('track-map'), s = document.getElementById('track-svg');
        if (m) m.style.display = 'none';
        if (s) s.style.display = 'block';
      };
      ${hasTrack ? `
      if (typeof L === 'undefined') { window.__PDF_SVG__ = false; window.__USAR_SVG__(); }
      else { setTimeout(function(){ window.__USAR_SVG__(); }, 8000); }
      try {
        var pts = ${JSON.stringify(d.track.map((p) => [p.lat, p.lng]))};
        var map = L.map('track-map', { zoomControl: false, attributionControl: true, scrollWheelZoom: false });
        var tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
        // OJO: 'load' de la capa también se dispara cuando TODOS los tiles fallaron (Leaflet cuenta
        // los errores como "terminados"). Por eso se cuentan los tiles realmente pintados: si al
        // terminar no hay ninguno, el servidor no tiene salida a internet y se usa el SVG.
        var cargados = 0;
        tiles.on('tileload', function(){ cargados += 1; });
        tiles.on('load', function(){
          if (cargados > 0) window.__PDF_READY__ = true;
          else { window.__PDF_SVG__ = false; window.__USAR_SVG__(); }
        });
        L.polyline(pts, { color: '#ef4444', weight: 3, opacity: 0.85 }).addTo(map);
        pts.forEach(function(pos, i) {
          var isFirst = i === 0, isLast = i === pts.length - 1;
          var color = isFirst ? '#22c55e' : isLast ? '#ef4444' : '#3b82f6';
          L.circleMarker(pos, { radius: isFirst || isLast ? 8 : 4, color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.9 }).addTo(map);
        });
        map.fitBounds(L.latLngBounds(pts), { padding: [30, 30] });
        map.whenReady(function(){ setTimeout(function(){ map.invalidateSize(); }, 150); });
      } catch (e) { window.__USAR_SVG__(); }
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
    // Esperar a que los tiles terminen de cargar (máx 25 s). Si el servidor no tiene salida
    // a internet, a los 8 s se muestra el trazado SVG y la espera termina igual.
    let mapaOk = false;
    for (let i = 0; i < 50; i++) {
      const estado = await page.evaluate(() => ({ ready: window.__PDF_READY__, svg: window.__PDF_SVG__ })).catch(() => ({ ready: true, svg: false }));
      if (estado.ready) { mapaOk = true; break; }
      if (estado.svg) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!mapaOk) {
      // Sin mapa real: queda el SVG (vector, se imprime nítido) y no se toca nada más.
      await page.evaluate(() => { if (window.__USAR_SVG__) window.__USAR_SVG__(); }).catch(() => {});
    }
    // El PDF de Chrome descarta con frecuencia capas con transformaciones (los paneles de
    // Leaflet: tiles y marcadores), y salía el mapa en blanco. Se captura el mapa ya pintado y
    // se reemplaza por un <img>: lo que se ve en pantalla es lo que queda en el PDF.
    const mapEl = mapaOk ? await page.$('#track-map') : null;
    if (mapEl) {
      try {
        const png = await mapEl.screenshot({ type: 'png' });
        await page.evaluate((b64) => {
          const el = document.querySelector('#track-map');
          if (!el) return;
          const img = document.createElement('img');
          img.src = 'data:image/png;base64,' + b64;
          img.setAttribute('width', '690');
          img.style.width = '690px';
          img.style.maxWidth = '100%';
          img.style.height = 'auto';
          img.style.border = '1px solid #e2e8f0';
          img.style.borderRadius = '6px';
          el.replaceWith(img);
        }, png.toString('base64'));
      } catch (e) {
        console.error('[pdfRender] no se pudo capturar el mapa:', e.message);
      }
    }
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => {});
  }
}
