/**
 * Cliente HTTP de WhatsApp (WhatsApp Manager / Wassenger).
 * Configuración en .env: WHATSAPP_API_URL, WHATSAPP_API_KEY, WHATSAPP_SESSION_ID.
 */
const API_URL = process.env.WHATSAPP_API_URL || '';
const API_KEY = process.env.WHATSAPP_API_KEY || '';
const SESSION_ID = process.env.WHATSAPP_SESSION_ID || '';

/**
 * @param {string} phone teléfono destino (ej. +56912345678)
 * @param {string} text  texto del mensaje
 * @param {string} [mediaUrl] URL de un medio a adjuntar (imagen o PDF del informe)
 * @param {{mediaType?: string, fileName?: string}} [opts] tipo de medio y nombre de archivo
 */
export async function sendWhatsApp(phone, text, mediaUrl, opts = {}) {
  if (!API_URL || !API_KEY || !SESSION_ID) {
    throw new Error('WhatsApp no configurado (WHATSAPP_API_URL/KEY/SESSION_ID)');
  }
  const url = `${API_URL}api/v1/messages/${SESSION_ID}/send`;
  const payload = { to: phone, text };
  if (mediaUrl) {
    payload.mediaUrl = mediaUrl;
    if (opts.mediaType) payload.mediaType = opts.mediaType;
    if (opts.fileName) payload.fileName = opts.fileName;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`WhatsApp ${res.status}: ${await res.text()}`);
  return res.json();
}
