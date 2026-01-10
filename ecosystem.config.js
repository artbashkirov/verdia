module.exports = {
  apps: [
    {
      name: 'verdia',
      script: './start.sh',
      cwd: '/opt/verdia-app',
      interpreter: '/bin/bash',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        // Переменные будут загружены из .env.production через start.sh
      },
      error_file: '/root/.pm2/logs/verdia-error.log',
      out_file: '/root/.pm2/logs/verdia-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
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
