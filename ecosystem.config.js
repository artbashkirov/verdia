/**
 * PM2 ecosystem — blue-green topology для zero-downtime деплоя.
 *
 * Архитектура:
 * - `verdia-blue`  — порт 3000
 * - `verdia-green` — порт 3002 (3001 занят скрейпером!)
 * - оба процесса запускаются через `npm start` (= `next start`).
 * - оба читают одинаковый билд из `/opt/verdia-app/.next` и переменные
 *   из `.env.production` (это делает сам Next.js при NODE_ENV=production).
 *
 * Балансировка между ними — на стороне nginx (upstream c
 * `proxy_next_upstream`), см. `docs/nginx-config.md`.
 *
 * Деплой (rolling reload, см. `.github/workflows/deploy.yml`):
 * 1. git pull → npm install → npm run build
 * 2. pm2 reload verdia-blue + healthcheck :3000/api/health
 * 3. pm2 reload verdia-green + healthcheck :3002/api/health
 *
 * Между шагами 2 и 3 второй процесс продолжает обслуживать трафик —
 * пользователь не видит даже короткого простоя.
 *
 * Почему НЕ через `./start.sh`:
 * Раньше pm2 запускал процесс командой `pm2 start npm --name verdia -- start`,
 * никакого start.sh не существовало (это был артефакт старой версии конфига).
 * Прямой запуск через `npm start` проще и не зависит от наличия скрипта-обёртки.
 *
 * Важно про graceful shutdown:
 * - `kill_timeout: 10000` (10s) — у Next 16 могут быть открытые SSE/streams
 *   (мы их используем для генерации). Стандартные 1.6s pm2-таймаута их
 *   обрывают на середине. 10 секунд — компромисс: достаточно, чтобы
 *   завершить текущие реквесты, и не слишком много, чтобы держать в памяти
 *   зомби-процесс при настоящем зависании.
 * - `min_uptime: 10s` — если процесс падает быстрее 10 секунд после старта,
 *   pm2 считает его «не поднявшимся» и не перезапускает бесконечно
 *   (защита от crash loop при битой конфигурации).
 *
 * Важно про память (`NODE_OPTIONS=--max-old-space-size=512`):
 * - Лимит 512 МБ на heap каждого процесса. На 1-ГБ VPS это страховка от
 *   OOM: два инстанса × 512 МБ = 1 ГБ максимум для Node-heap (плюс RSS
 *   overhead ~50–100 МБ на каждый). Со swap'ом 2 ГБ это безопасно.
 * - Если процесс упирается в лимит и начинает GC-thrashing — это
 *   индикатор «пора апгрейдить тариф VPS».
 */

const commonAppDefaults = {
  script: 'npm',
  args: 'start',
  cwd: '/opt/verdia-app',
  instances: 1,
  exec_mode: 'fork',
  log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
  merge_logs: true,
  autorestart: true,
  max_restarts: 10,
  min_uptime: '10s',
  kill_timeout: 10000,
};

module.exports = {
  apps: [
    {
      ...commonAppDefaults,
      name: 'verdia-blue',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
        NODE_OPTIONS: '--max-old-space-size=512',
      },
      error_file: '/root/.pm2/logs/verdia-blue-error.log',
      out_file: '/root/.pm2/logs/verdia-blue-out.log',
    },
    {
      ...commonAppDefaults,
      name: 'verdia-green',
      env: {
        NODE_ENV: 'production',
        PORT: '3002',
        NODE_OPTIONS: '--max-old-space-size=512',
      },
      error_file: '/root/.pm2/logs/verdia-green-error.log',
      out_file: '/root/.pm2/logs/verdia-green-out.log',
    },
    {
      name: 'verdia-scraper',
      script: 'server.js',
      cwd: '/opt/verdia-scraper',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        SCRAPER_API_KEY: 'verdia_scraper_2026_secret_xyz789',
      },
      error_file: '/root/.pm2/logs/verdia-scraper-error.log',
      out_file: '/root/.pm2/logs/verdia-scraper-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
    },
  ],
};
