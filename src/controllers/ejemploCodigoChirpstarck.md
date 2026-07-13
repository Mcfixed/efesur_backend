// ==========================================
// CONFIGURACIÓN DEL BACKEND CHIRPSTACK
// ==========================================
//estos comandos se envian a los sensores gps por chirpstarck
// PRODUCCION -> HEX: C0EC040000000000000000 -> Fport : 2
// TRANSPORTE -> HEX: C0EC000000000000000001 -> Fport: 2
// MANTENIMIENTO -> HEX: 80E4000000000000000002 -> Fport: 2
// VALIDACION -> HEX: 8020000000000000000003 -> FPort: 2



const CHIRPSTACK_URL = "http://TU_IP_O_DOMINIO:8080"; // Cambia por la URL de tu servidor
const API_KEY = "TU_API_KEY_AQUI"; // Pega aquí tu API Key de ChirpStack

const HEADERS = {
    "Authorization": `Bearer ${API_KEY}`,
    "Content-Type": "application/json"
};

// Función auxiliar para pausas (evita saturar la API)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ==========================================
// FUNCIÓN PARA ENVIAR COMANDOS MASIVOS
// ==========================================
async function enqueueDownlinkBulk(devEuis, fPort, payloadBuffer, confirmed = false) {
    // 1. Convertir el Buffer de bytes a Base64
    const payloadB64 = payloadBuffer.toString('base64');
    
    console.log("Iniciando envío masivo...");
    console.log(`FPort: ${fPort} | Payload (Base64): ${payloadB64} | Confirmado: ${confirmed}\n`);
    
    let resultados = { exito: 0, fallo: 0 };

    // 2. Iterar sobre cada sensor
    for (const devEui of devEuis) {
        const apiUrl = `${CHIRPSTACK_URL}/api/devices/${devEui}/queue`;
        
        const bodyData = {
            queueItem: {
                confirmed: confirmed,
                data: payloadB64,
                fPort: fPort
            }
        };

        try {
            // 3. Hacer la petición POST a ChirpStack
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: HEADERS,
                body: JSON.stringify(bodyData)
            });

            if (response.ok) {
                console.log(`[OK] Comando encolado para el sensor: ${devEui}`);
                resultados.exito++;
            } else {
                const errorText = await response.text();
                console.log(`[ERROR] Falló envío a ${devEui}. Status: ${response.status}. Detalle: ${errorText}`);
                resultados.fallo++;
            }
        } catch (error) {
            console.log(`[ERROR CRÍTICO] No se pudo conectar a ChirpStack para ${devEui}. Detalle: ${error.message}`);
            resultados.fallo++;
        }

        // Pequeña pausa de 100ms para ser amigables con el servidor
        await sleep(100);
    }

    console.log(`\nResumen de la operación: ${resultados.exito} enviados, ${resultados.fallo} fallidos.`);
}

// ==========================================
// EJEMPLO DE USO
// ==========================================
async function main() {
    // 1. Definimos la lista de sensores (DevEUIs)
    const misSensores = [
        "0000000000111111",
        "0000000000222222",
        "0000000000333333"
    ];
    
    // 2. Generamos el payload. 
    // Equivalente a bytearray(11) en Python. Inicializa 11 bytes en cero.
    const payloadGenerado = Buffer.alloc(11); 
    
    // Asignamos el valor al primer byte (Ej: 0xFF para abortar emergencia)
    payloadGenerado[0] = 0xFF; 
    
    // 3. Ejecutamos el envío (Ej: por el puerto 2)
    await enqueueDownlinkBulk(misSensores, 2, payloadGenerado, false);
}

// Iniciar el script
main();