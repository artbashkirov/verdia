/**
 * PM2 ecosystem — blue-green topology для zero-downtime деплоя.
 *
 * Архитектура:
 * - `verdia-blue`  — порт 3000
 * - `verdia-green` — порт 3002 (3001 занят скрейпером!)
 * - оба процесса запускают тот же `start.sh`, но с разным `PORT` через env.
 * - оба читают одинаковый билд из `/opt/verdia-app/.next`.
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
 * Требования к `start.sh` (на VPS, в /opt/verdia-app/start.sh):
 * - подгружает переменные из `.env.production`;
 * - запускает Next.js на порту `$PORT` (по умолчанию 3000, но мы передаём
 *   явно 3000 / 3002 через env). Если start.sh жёстко прибит к 3000 —
 *   обновить его согласно `docs/migration-blue-green.md`.
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
 */

const commonAppDefaults = {
  script: './start.sh',
  cwd: '/opt/verdia-app',
  interpreter: '/bin/bash',
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
