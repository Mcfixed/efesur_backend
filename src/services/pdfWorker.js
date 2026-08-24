/**
 * Worker thread: renderiza el informe → PDF de forma AISLADA.
 * Si puppeteer/Edge falla o se cuelga, solo muere este worker; el proceso
 * principal del backend NO se reinicia.
 */
import { parentPort } from 'node:worker_threads';
import { renderPdfFromData } from './pdfRender.js';

process.on('uncaughtException', (e) => {
  console.error('[pdfWorker] uncaughtException:', (e && e.stack) || e);
  try { parentPort.postMessage({ ok: false, error: String((e && e.message) || e) }); } catch { /* ignore */ }
  process.exit(1);
});

parentPort.on('message', async (msg) => {
  try {
    const buffer = await renderPdfFromData(msg.data);
    parentPort.postMessage({ ok: true, buffer });
  } catch (e) {
    console.error('[pdfWorker] error:', (e && e.stack) || e);
    parentPort.postMessage({ ok: false, error: String((e && e.message) || e) });
  }
});
