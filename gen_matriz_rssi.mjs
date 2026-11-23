/**
 * Genera la matriz de cobertura RSSI/SNR de EFE SUR.
 *
 * Base del dato: el ÚLTIMO registro de telemetry_data_all de cada sensor; de ese paquete se
 * leen los gateways que lo recibieron con su rssi/snr.
 *   filas    = sensores GPS (con su PK)
 *   columnas = gateways en el orden de la ruta, cada uno con RSSI y SNR
 *   color    = verde si RSSI > -110 dBm · rojo si RSSI < -120 dBm
 *
 * Uso:  node gen_matriz_rssi.mjs
 * Salida: ../Matriz_RSSI_SNR_EFE_SUR.xlsx
 */
import 'dotenv/config';
import ExcelJS from 'exceljs';
import { fileURLToPath } from 'node:url';
import pool from './src/config/database.js';

const EMPRESA = 'EFE SUR';
const SALIDA = fileURLToPath(new URL('../Matriz_RSSI_SNR_EFE_SUR.xlsx', import.meta.url));

// Orden geográfico de los gateways, partiendo del PK0: Concepción → Túnel Chepe → Juan Pablo 2
// → Diagonal Bío Bío → Alborada → El parque → Galvarino AUT → Galvarino-11 → Los Canelos
// → Cristo Redentor → Laguna Quillenco → Estación Coronel (último PK).
// Se compara por palabra clave (normalizada) para no depender del nombre exacto.
const ORDEN_GATEWAYS = [
  'concepcion', 'chepe', 'juan pablo', 'diagonal', 'alborada', 'parque',
  'aut', 'galvarino', 'canelos', 'cristo', 'laguna', 'coronel',
];

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const t0 = Date.now();

// ─── Datos ──────────────────────────────────────────────────────────────────
const emp = await pool.query(`SELECT id, name FROM companies WHERE name = $1`, [EMPRESA]);
if (!emp.rows.length) { console.error('No existe la empresa', EMPRESA); process.exit(1); }
const companyId = emp.rows[0].id;

const [gws, sens] = await Promise.all([
  pool.query(`
    SELECT id, name, lower(dev_eui) AS eui
    FROM devices
    WHERE company_id = $1 AND type_device = 'Gateway' AND is_active
    ORDER BY name`, [companyId]),
  pool.query(`
    SELECT id, name, dev_eui
    FROM devices
    WHERE company_id = $1 AND type_device = 'Gps' AND is_active
    ORDER BY name`, [companyId]),
]);

// Gateways ordenados según la ruta (los que no estén en la lista van al final, alfabéticos)
const restantes = [...gws.rows];
const gateways = [];
for (const clave of ORDEN_GATEWAYS) {
  const i = restantes.findIndex((g) => norm(g.name).includes(clave));
  if (i >= 0) gateways.push(restantes.splice(i, 1)[0]);
}
restantes.sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'));
gateways.push(...restantes);

const sensores = sens.rows;
console.log(`Empresa ${EMPRESA} (id ${companyId}) · ${gateways.length} gateways · ${sensores.length} sensores`);
console.log('orden gateways:', gateways.map((g) => g.name).join(' → '));

// Último registro de telemetry_data_all de cada sensor, con los gateways que lo recibieron
const pares = await pool.query(`
  WITH ult AS (
    SELECT DISTINCT ON (t.device_id) t.device_id, t.ts, t.rxinfo
    FROM telemetry_data_all t
    WHERE t.device_id IN (
      SELECT id FROM devices WHERE company_id = $1 AND type_device = 'Gps' AND is_active
    )
    ORDER BY t.device_id, t.ts DESC
  )
  SELECT u.device_id, g.id AS gw_id,
         (rx->>'rssi')::float8 AS rssi,
         (rx->>'snr')::float8  AS snr,
         u.ts
  FROM ult u
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(u.rxinfo) = 'array'  THEN u.rxinfo
         WHEN jsonb_typeof(u.rxinfo) = 'object' THEN jsonb_build_array(u.rxinfo)
         ELSE '[]'::jsonb END
  ) rx
  JOIN devices g ON g.company_id = $1 AND g.type_device = 'Gateway' AND g.is_active
   AND (lower(rx->>'gatewayId') = lower(g.dev_eui)
        OR right(lower(rx->>'gatewayId'), 6) = right(lower(g.dev_eui), 6))
  WHERE (rx->>'crcStatus' IS NULL OR rx->>'crcStatus' = 'CRC_OK')
`, [companyId]);

// Matriz: sensorId -> gatewayId -> { rssi, snr, ts }  ·  y la fecha del último registro
const matriz = new Map();
const ultimoDato = new Map();
for (const r of pares.rows) {
  if (!matriz.has(r.device_id)) matriz.set(r.device_id, new Map());
  matriz.get(r.device_id).set(r.gw_id, r);
  ultimoDato.set(r.device_id, r.ts);
}
console.log(`Pares sensor-gateway leídos: ${pares.rows.length} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

// ─── Excel ──────────────────────────────────────────────────────────────────
const PK_RX = /^\s*V\s*(\d+)\s*PK\s*(\d+)\s*\/\s*(\d+)/i;
const pkDe = (nombre) => {
  const m = PK_RX.exec(String(nombre || ''));
  return m ? { via: Number(m[1]), pk: Number(m[2]), postes: m[3] } : null;
};

const wb = new ExcelJS.Workbook();
wb.creator = 'EFE SUR · Monitoreo';
wb.created = new Date();
const ws = wb.addWorksheet('Matriz RSSI-SNR', {
  views: [{ state: 'frozen', xSplit: 3, ySplit: 5 }],
});

const TOTAL_COLS = 1 + 1 + gateways.length * 2 + 1; // Sensor + PK + (RSSI, SNR) por gateway + Último dato

// Título
ws.mergeCells(1, 1, 1, TOTAL_COLS);
const titulo = ws.getCell(1, 1);
titulo.value = 'EFE SUR · Matriz de cobertura RSSI / SNR por gateway';
titulo.font = { bold: true, size: 14, color: { argb: 'FF111111' } };
titulo.alignment = { vertical: 'middle', horizontal: 'left' };
ws.getRow(1).height = 24;

// Leyenda
ws.mergeCells(2, 1, 2, TOTAL_COLS);
const leyenda = ws.getCell(2, 1);
leyenda.value = 'RSSI (dBm):  verde > -110   ·   ámbar entre -110 y -120   ·   rojo < -120   —   SNR en dB. Fuente: último registro de telemetry_data_all de cada sensor (los gateways que recibieron ese paquete).';
leyenda.font = { size: 10, color: { argb: 'FF555555' } };

// Fila de gateways (agrupando sus dos columnas)
const filaGw = ws.getRow(4);
const filaSub = ws.getRow(5);
for (const [i, gw] of gateways.entries()) {
  const c1 = 3 + i * 2;
  ws.mergeCells(4, c1, 4, c1 + 1);
  const celda = ws.getCell(4, c1);
  celda.value = gw.name;
  celda.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
  celda.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true, textRotation: 90 };
  celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
  celda.border = borde();

  const rssiCol = ws.getCell(5, c1);
  rssiCol.value = 'RSSI';
  const snrCol = ws.getCell(5, c1 + 1);
  snrCol.value = 'SNR';
  for (const c of [rssiCol, snrCol]) {
    c.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F5597' } };
    c.border = borde();
  }
}
filaGw.height = 110;
filaSub.height = 16;

function borde() {
  const lado = { style: 'thin', color: { argb: 'FFBFBFBF' } };
  return { top: lado, left: lado, bottom: lado, right: lado };
}

for (const [col, texto] of [[1, 'Sensor'], [2, 'PK'], [TOTAL_COLS, 'Último dato']]) {
  ws.mergeCells(4, col, 5, col);
  const c = ws.getCell(4, col);
  c.value = texto;
  c.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
  c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
  c.border = borde();
}

// Filas de sensores (ordenadas por PK)
const filas = sensores
  .map((s) => ({ ...s, info: pkDe(s.name) }))
  .sort((a, b) => {
    const pa = a.info, pb = b.info;
    if (pa && pb) return pa.pk - pb.pk || pa.via - pb.via;
    if (pa) return -1;
    if (pb) return 1;
    return String(a.name).localeCompare(String(b.name), 'es');
  });

const ESTILO = {
  verde: { bg: 'FFC6EFCE', fg: 'FF006100' },
  ambar: { bg: 'FFFFEB9C', fg: 'FF9C6500' },
  rojo: { bg: 'FFFFC7CE', fg: 'FF9C0006' },
};
const colorRssi = (v) => (v > -110 ? ESTILO.verde : v < -120 ? ESTILO.rojo : ESTILO.ambar);
const cuenta = { verde: 0, ambar: 0, rojo: 0, vacio: 0 };

let fila = 6;
for (const s of filas) {
  const row = ws.getRow(fila);
  row.getCell(1).value = s.name;
  row.getCell(1).alignment = { vertical: 'middle' };
  row.getCell(1).font = { size: 10 };

  const celdaPk = row.getCell(2);
  if (s.info) {
    celdaPk.value = `PK ${s.info.pk}`;
    celdaPk.alignment = { horizontal: 'center', vertical: 'middle' };
    celdaPk.font = { size: 10, bold: true, color: { argb: 'FF1F3864' } };
  } else {
    celdaPk.value = '—';
    celdaPk.alignment = { horizontal: 'center', vertical: 'middle' };
    celdaPk.font = { size: 10, color: { argb: 'FF999999' } };
  }

  const porGw = matriz.get(s.id);
  for (const [i, gw] of gateways.entries()) {
    const cRssi = row.getCell(3 + i * 2);
    const cSnr = row.getCell(4 + i * 2);
    const dato = porGw?.get(gw.id);
    const rssi = dato && dato.rssi != null ? Number(dato.rssi) : null;
    const snr = dato && dato.snr != null ? Number(dato.snr) : null;
    if (rssi != null) cuenta[rssi > -110 ? 'verde' : rssi < -120 ? 'rojo' : 'ambar'] += 1;
    else cuenta.vacio += 1;

    if (rssi == null && snr == null) {
      cRssi.value = '—';
      cSnr.value = '—';
      cRssi.font = { size: 9, color: { argb: 'FFC0C0C0' } };
      cSnr.font = { size: 9, color: { argb: 'FFC0C0C0' } };
    } else {
      cRssi.value = rssi;
      cRssi.numFmt = '0';
      const col = colorRssi(rssi ?? -115);
      cRssi.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: col.bg } };
      cRssi.font = { size: 9, bold: true, color: { argb: col.fg } };

      cSnr.value = snr;
      cSnr.numFmt = '0.0';
      cSnr.font = { size: 9, color: { argb: 'FF444444' } };
    }
    cRssi.alignment = { horizontal: 'center', vertical: 'middle' };
    cSnr.alignment = { horizontal: 'center', vertical: 'middle' };
    if (fila % 2 === 0) {
      if (!cRssi.fill || !cRssi.fill.fgColor) cRssi.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
      if (!cSnr.fill || !cSnr.fill.fgColor) cSnr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
    }
    cRssi.border = borde();
    cSnr.border = borde();
  }
  row.getCell(1).border = borde();
  row.getCell(2).border = borde();

  // Fecha del último registro del sensor (base de toda la fila)
  const celdaFecha = row.getCell(TOTAL_COLS);
  const ts = ultimoDato.get(s.id);
  if (ts) {
    celdaFecha.value = new Date(ts);
    celdaFecha.numFmt = 'dd-mm-yy hh:mm';
    celdaFecha.font = { size: 9, color: { argb: 'FF444444' } };
  } else {
    celdaFecha.value = 'sin datos';
    celdaFecha.font = { size: 9, color: { argb: 'FFC0C0C0' } };
  }
  celdaFecha.alignment = { horizontal: 'center', vertical: 'middle' };
  celdaFecha.border = borde();

  fila += 1;
}

ws.getColumn(1).width = 30;
ws.getColumn(2).width = 9;
for (let i = 0; i < gateways.length; i++) {
  ws.getColumn(3 + i * 2).width = 8;
  ws.getColumn(4 + i * 2).width = 7;
}
ws.getColumn(TOTAL_COLS).width = 15;

await wb.xlsx.writeFile(SALIDA);

const conDatos = filas.filter((s) => matriz.has(s.id)).length;
const sinDatos = filas.filter((s) => !ultimoDato.has(s.id)).length;
console.log(`✔ ${SALIDA}`);
console.log(`  ${filas.length} sensores (${conDatos} con al menos un gateway, ${sinDatos} sin ningún registro) × ${gateways.length} gateways · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`  RSSI: ${cuenta.verde} verde (> -110) · ${cuenta.ambar} ámbar (-110 a -120) · ${cuenta.rojo} rojo (< -120) · ${cuenta.vacio} sin gateway`);
process.exit(0);
