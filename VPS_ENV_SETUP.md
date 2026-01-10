# Настройка переменных окружения на VPS

Если вы видите ошибку `CLOUDFLARE_WORKER_URL and CLOUDFLARE_WORKER_SECRET must be set`, это означает, что переменные окружения не установлены на production сервере.

## Быстрая проверка

Запустите на VPS:
```bash
npm run check-cloudflare
```

Или напрямую:
```bash
node scripts/check-cloudflare-env.js
```

## Способы настройки переменных на VPS

### Способ 1: Файл .env.production (Рекомендуется)

1. На VPS создайте файл `.env.production` в корне проекта:
```bash
nano .env.production
```

2. Добавьте переменные:
```env
CLOUDFLARE_WORKER_URL=https://verdia-replicate-proxy.artbashkirov.workers.dev
CLOUDFLARE_WORKER_SECRET=b4MXM42!
```

3. Убедитесь, что файл не попал в git:
```bash
# Проверьте .gitignore - там должна быть строка .env*
```

4. Перезапустите приложение (в зависимости от способа запуска):
```bash
# Если через pm2:
pm2 restart verdia

# Если через systemd:
sudo systemctl restart verdia

# Или если запускаете напрямую:
npm run build
npm run start
```

### Способ 2: PM2 Ecosystem файл

Если используете PM2, создайте `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'verdia',
    script: 'npm',
    args: 'start',
    env: {
      NODE_ENV: 'production',
      CLOUDFLARE_WORKER_URL: 'https://verdia-replicate-proxy.artbashkirov.workers.dev',
      CLOUDFLARE_WORKER_SECRET: 'b4MXM42!',
      // ... другие переменные
    }
  }]
};
```

Затем:
```bash
pm2 delete verdia
pm2 start ecosystem.config.js
pm2 save
```

### Способ 3: Systemd Service файл

Если используете systemd, отредактируйте `.service` файл:

```ini
[Service]
Environment="CLOUDFLARE_WORKER_URL=https://verdia-replicate-proxy.artbashkirov.workers.dev"
Environment="CLOUDFLARE_WORKER_SECRET=b4MXM42!"
```

Затем:
```bash
sudo systemctl daemon-reload
sudo systemctl restart verdia
```

### Способ 4: Экспорт переменных в shell

Если запускаете вручную, экспортируйте перед запуском:

```bash
export CLOUDFLARE_WORKER_URL=https://verdia-replicate-proxy.artbashkirov.workers.dev
export CLOUDFLARE_WORKER_SECRET=b4MXM42!
npm run build
npm run start
```

## Важно

- ⚠️ **Next.js не читает `.env.local` в production** - используйте `.env.production` или передачу через процесс-менеджер
- ⚠️ **После изменения переменных обязательно перезапустите приложение**
- ✅ **Проверьте, что переменные установлены**: `npm run check-cloudflare`
- 🔒 **Никогда не коммитьте `.env.production` в git** - он должен быть в `.gitignore`

## Проверка работы

После настройки проверьте логи приложения:
```bash
# PM2
pm2 logs verdia

# Systemd
sudo journalctl -u verdia -f
```

Ищите строки:
- ✅ `[callGemini] Environment check:` - должно показывать, что переменные установлены
- ❌ `Configuration error` - означает, что переменные не найдены
