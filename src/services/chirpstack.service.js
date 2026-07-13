import grpc from '@grpc/grpc-js';
import pkgDeviceGrpc from '@chirpstack/chirpstack-api/api/device_grpc_pb.js';
import pkgDevicePb from '@chirpstack/chirpstack-api/api/device_pb.js';
import pool from '../config/database.js';

const { DeviceServiceClient } = pkgDeviceGrpc;
const { DeviceQueueItem, EnqueueDeviceQueueItemRequest } = pkgDevicePb;

// ─── Comandos predefinidos ──
export const COMMANDS = {
  PRODUCCION:    { hex: "C0EC040000000000000000", fPort: 2, label: "Producción", group: "modo" },
  TRANSPORTE:    { hex: "C0EC000000000000000001", fPort: 2, label: "Transporte", group: "modo" },
  MANTENIMIENTO: { hex: "80E4000000000000000002", fPort: 2, label: "Mantenimiento", group: "modo" },
  VALIDACION:    { hex: "8020000000000000000003", fPort: 2, label: "Validación (QA)", group: "modo" },
  EMERGENCIA:    { hex: "8020000000000000000004", fPort: 2, label: "Emergencia", group: "modo" },
  LEER_CONFIG:   { hex: "0000000000000000000000", fPort: 2, label: "Solicitar Config", group: "util" },
  ABORTAR:       { hex: "FF00000000000000000000", fPort: 3, label: "Abortar Emergencia", group: "emergencia" },
  PERSEGUICION:  { hex: "FE00000000000000000000", fPort: 3, label: "Modo Persecución", group: "emergencia" },
  DFU:           { hex: "FD00000000000000000000", fPort: 3, label: "Salto a DFU (Bluetooth)", group: "mantenimiento" },
};

// ─── Obtener dispositivos GPS ──
export const getGpsDevicesService = async (companyIds) => {
  let companyFilter = '';
  const params = [];
  if (companyIds && companyIds.length) {
    params.push(companyIds);
    companyFilter = ` AND company_id = ANY($${params.length}::int[])`;
  }

  const result = await pool.query(`
    SELECT d.id, d.dev_eui, d.name, d.type_device, d.is_active, d.last_seen,
           COALESCE(
             (SELECT COALESCE(
                t.object->>'operatingMode',
                t.object->'systemStatus'->>'operatingMode'
              )
              FROM telemetry_data_all t
              WHERE t.device_id = d.id
                AND t.object IS NOT NULL
                AND (t.object->>'operatingMode' IS NOT NULL
                  OR t.object->'systemStatus'->>'operatingMode' IS NOT NULL)
              ORDER BY t.ts DESC LIMIT 1),
             g.operating_mode,
             'sin datos'
           ) as operating_mode
    FROM devices d
    LEFT JOIN gps_device g ON d.id = g.id
    WHERE d.type_device = 'Gps' AND d.is_active = true${companyFilter}
    ORDER BY d.name ASC
  `, params);
  return result.rows;
};

// ─── Enviar comando a uno o múltiples dispositivos por gRPC ──
export const sendCommandService = async (devEuis, commandKey) => {
  const command = COMMANDS[commandKey];
  if (!command) throw new Error(`Comando desconocido: ${commandKey}`);

  const server = process.env.CHIRPSTACK_URL;
  const apiToken = process.env.CHIRPSTACK_API_KEY;

  if (!server || !apiToken) {
    throw new Error('CHIRPSTACK_URL y CHIRPSTACK_API_KEY deben estar configuradas en .env');
  }

  // Limpiar trailing slash y prefix http://
  let grpcAddr = server.replace(/\/+$/, '').replace(/^https?:\/\//, '');

  // Convertir hex a bytes (Uint8Array)
  const bytes = new Uint8Array(Buffer.from(command.hex, 'hex'));

  const results = [];

  for (const devEui of devEuis) {
    try {
      const client = new DeviceServiceClient(grpcAddr, grpc.credentials.createInsecure());

      const metadata = new grpc.Metadata();
      metadata.set('authorization', `Bearer ${apiToken}`);

      const item = new DeviceQueueItem();
      item.setDevEui(devEui);
      item.setFPort(command.fPort);
      item.setConfirmed(false);
      item.setData(bytes);

      const req = new EnqueueDeviceQueueItemRequest();
      req.setQueueItem(item);

      await new Promise((resolve, reject) => {
        client.enqueue(req, metadata, (err, resp) => {
          if (err) {
            console.error(`[ChirpStack] Error gRPC ${devEui}:`, err.message);
            reject(err);
          } else {
            console.log(`[ChirpStack] OK ${devEui} -> id: ${resp.getId()}`);
            resolve(resp);
          }
        });
      });

      results.push({ devEui, status: 'ok' });
    } catch (error) {
      results.push({ devEui, status: 'error', error: error.message });
    }
  }

  return {
    command: commandKey,
    commandLabel: command.label,
    total: devEuis.length,
    exito: results.filter(r => r.status === 'ok').length,
    fallo: results.filter(r => r.status === 'error').length,
    detalles: results,
  };
};
