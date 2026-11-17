/**
 * Límite de consultas simultáneas por usuario.
 *
 * Evita que una sola sesión (o una vista que dispara varias consultas caras a la vez) acapare
 * el pool de conexiones y deje sin respuesta al resto.
 *
 * Importante: NO rechaza. Si el usuario ya tiene `max` consultas en curso, la nueva **espera
 * turno** (cola FIFO) y arranca en cuanto se libera una. Así la única diferencia perceptible es
 * algo de latencia en un pico, nunca un error en pantalla. Sólo si la cola crece de forma
 * absurda (> maxCola) o la espera supera esperaMaximaMs se responde 429 como último recurso.
 */
export default function limitarConcurrencia(max = 12, { maxCola = 40, esperaMaximaMs = 20000 } = {}) {
  const enCurso = new Map(); // userId|ip -> cantidad en ejecución
  const colas = new Map();   // userId|ip -> [{ iniciar }]

  const liberar = (id) => {
    const n = (enCurso.get(id) || 1) - 1;
    if (n <= 0) enCurso.delete(id);
    else enCurso.set(id, n);

    const cola = colas.get(id);
    if (!cola || cola.length === 0) return;
    const siguiente = cola.shift();
    if (cola.length === 0) colas.delete(id);
    if (siguiente) siguiente.iniciar();
  };

  return (req, res, next) => {
    if (req.method !== 'GET') return next();

    const id = req.user?.id || req.ip || 'anon';
    const actuales = enCurso.get(id) || 0;

    // Arranca ya: se registra la salida y se cede el paso
    const entrar = () => {
      enCurso.set(id, (enCurso.get(id) || 0) + 1);
      let liberado = false;
      const cerrar = () => {
        if (liberado) return;
        liberado = true;
        liberar(id);
      };
      res.on('finish', cerrar);
      res.on('close', cerrar);
      next();
    };

    if (actuales < max) return entrar();

    const cola = colas.get(id) || [];
    if (cola.length >= maxCola) {
      res.set('Retry-After', '3');
      return res.status(429).json({ error: 'Demasiadas consultas simultáneas, intenta en un momento' });
    }

    // En cola: si el cliente se va antes de turno, se descarta sin gastar nada
    let resuelto = false;
    const entrada = {
      iniciar: () => {
        if (resuelto) return;
        resuelto = true;
        clearTimeout(temporizador);
        entrar();
      },
    };
    const salirDeCola = () => {
      if (resuelto) return;
      resuelto = true;
      clearTimeout(temporizador);
      const c = colas.get(id);
      if (!c) return;
      const i = c.indexOf(entrada);
      if (i >= 0) c.splice(i, 1);
      if (c.length === 0) colas.delete(id);
    };
    const temporizador = setTimeout(() => {
      // Esperó demasiado: se responde 429 (el front no reintenta GET ante 429, así que se
      // prefiere un error explícito antes que dejar la petición colgada para siempre).
      salirDeCola();
      if (!res.headersSent) {
        res.set('Retry-After', '3');
        res.status(429).json({ error: 'El servidor está ocupado, intenta en un momento' });
      }
    }, esperaMaximaMs);

    res.on('close', salirDeCola);
    cola.push(entrada);
    colas.set(id, cola);
  };
}
