import nodemailer from 'nodemailer';
import dns from 'node:dns';

// Forzar IPv4: algunos entornos resuelven primero el IPv6 de smtp.gmail.com y el envío
// se cuelga con ETIMEDOUT (2800:3f0:...). Con ipv4first se conecta por IPv4.
dns.setDefaultResultOrder('ipv4first');

/**
 * Envío de correo vía SMTP (Gmail por defecto).
 * Configuración en .env: GMAIL_USER, GMAIL_APP_PASSWORD y opcionalmente
 * SMTP_HOST / SMTP_PORT / SMTP_SECURE. Puerto 587 = STARTTLS (recomendado).
 */
const GMAIL_USER = (process.env.GMAIL_USER || '').trim();
const GMAIL_APP_PASSWORD = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = (process.env.SMTP_SECURE || 'false') === 'true';
// En redes corporativas con proxy de inspección TLS el certificado puede no validarse.
// Poner SMTP_REJECT_UNAUTHORIZED=true en una red de confianza para validarlo.
const SMTP_REJECT_UNAUTHORIZED = (process.env.SMTP_REJECT_UNAUTHORIZED || 'false') === 'true';

let transporter = null;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
      tls: { rejectUnauthorized: SMTP_REJECT_UNAUTHORIZED },
    });
  }
  return transporter;
}

/**
 * @param {string} to            destinatario
 * @param {string} subject       asunto
 * @param {string} html          cuerpo HTML del correo
 * @param {Array}  [attachments] adjuntos de nodemailer (p.ej. el PDF del informe)
 */
export async function sendEmail(to, subject, html, attachments = []) {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    throw new Error('Correo no configurado (GMAIL_USER / GMAIL_APP_PASSWORD)');
  }
  return getTransporter().sendMail({
    from: `"EFE SUR Alertas" <${GMAIL_USER}>`,
    to,
    subject,
    html,
    attachments,
  });
}
