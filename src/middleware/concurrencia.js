/**
 * Límite de consultas simultáneas por usuario.
 *
 * Evita que una sola sesión (o una vista que dispara varias consultas caras a la vez) acapare
 * el pool de conexiones y deje sin respuesta al resto. Devuelve 429 con Retry-After para que el
 * cliente reintente; el front ya reintenta GET ante 503 y muestra "reconectando" en 429.
 */
export default function limitarConcurrencia(max = 12) {
  const enCurso = new Map(); // userId|ip -> cantidad

  return (req, res, next) => {
    if (req.method !== 'GET') return next();

    const id = req.user?.id || req.ip || 'anon';
    const actuales = enCurso.get(id) || 0;

    if (actuales >= max) {
      res.set('Retry-After', '2');
      return res.status(429).json({ error: 'Demasiadas consultas simultáneas, intenta en un momento' });
    }

    enCurso.set(id, actuales + 1);

    let liberado = false;
    const liberar = () => {
      if (liberado) return;
      liberado = true;
      const n = (enCurso.get(id) || 1) - 1;
      if (n <= 0) enCurso.delete(id);
      else enCurso.set(id, n);
    };

    res.on('finish', liberar);
    res.on('close', liberar);
    next();
  };
}
