/**
 * PM2 — arranque en clúster para aprovechar todos los núcleos.
 *
 * Con un solo proceso Node, TODO el backend (consultas, JSON.stringify, gzip) corre en un
 * único hilo: con varios usuarios simultáneos ese hilo se satura y la web "se pega".
 * Con `instances: 'max'` (o un número) cada núcleo atiende su propio hilo; el balanceo lo
 * hace PM2 (modo cluster, sin necesidad de Nginx).
 *
 * Uso:
 *   npm i -g pm2
 *   pm2 start ecosystem.config.cjs
 *   pm2 logs efe-backend
 *   pm2 save && pm2 startup      # arranque automático al reiniciar el servidor
 *
 * Nota sobre la base: cada instancia abre su propio pool (max 20 conexiones). Con 4
 * instancias son 80 conexiones: mantener ese número <= max_connections de PostgreSQL
 * (por defecto 100). Si se suben las instancias, usar `max` en config/database.js más bajo
 * o poner PgBouncer delante.
 */
module.exports = {
  apps: [
    {
      name: 'efe-backend',
      script: 'src/index.js',
      cwd: __dirname,
      exec_mode: 'cluster',
      // 2–4 es el punto dulce para este tamaño de base; 'max' usa todos los núcleos.
      instances: 2,
      max_memory_restart: '600M',
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
      kill_timeout: 8000,
      env: {
        NODE_ENV: 'production',
        // El caché de respuestas es por proceso: con varias instancias cada una tiene el suyo
        // (sigue evitando N consultas por ventana dentro de su instancia).
        NODE_OPTIONS: '--max-old-space-size=512',
      },
      error_file: 'logs/pm2-error.log',
      out_file: 'logs/pm2-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
