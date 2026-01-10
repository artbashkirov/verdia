# Команды для работы на VPS

## Подключение к VPS

```bash
ssh root@193.227.240.206
```

## Поиск директории приложения на VPS

После подключения к VPS, найдите где находится ваше Next.js приложение:

### Вариант 1: Поиск по названию проекта
```bash
find / -name "package.json" -type f 2>/dev/null | grep -i verdia
```

### Вариант 2: Поиск всех Next.js проектов
```bash
find / -name "next.config.ts" -o -name "next.config.js" 2>/dev/null
```

### Вариант 3: Проверка системных сервисов
```bash
# Если используется PM2
pm2 list
pm2 info verdia

# Если используется systemd
systemctl list-units | grep verdia
systemctl status verdia
```

### Вариант 4: Проверка запущенных процессов Node.js
```bash
ps aux | grep node
```

### Вариант 5: Типичные директории
```bash
# Проверьте типичные места
ls -la /opt/
ls -la /var/www/
ls -la /home/
ls -la ~/
```

## После нахождения директории

Перейдите в директорию проекта:
```bash
cd /path/to/verdia  # замените на найденный путь
```

Затем запустите проверку переменных:
```bash
npm run check-cloudflare
```

## Проверка переменных окружения для Next.js приложения

Если приложение запущено через PM2:
```bash
pm2 env verdia
pm2 describe verdia
```

Если приложение запущено через systemd:
```bash
systemctl show verdia | grep Environment
cat /etc/systemd/system/verdia.service | grep Environment
```

Если приложение запущено напрямую:
```bash
cd /path/to/verdia
cat .env.production
cat .env.local
cat .env
```

## Настройка переменных окружения

После нахождения директории и способа запуска, установите переменные:

### Способ 1: Создать .env.production
```bash
cd /path/to/verdia
nano .env.production
```

Добавьте:
```env
CLOUDFLARE_WORKER_URL=https://verdia-replicate-proxy.artbashkirov.workers.dev
CLOUDFLARE_WORKER_SECRET=b4MXM42!
```

### Способ 2: Через PM2 ecosystem
```bash
cd /path/to/verdia
nano ecosystem.config.js
```

Добавьте переменные в `env` секцию и перезапустите:
```bash
pm2 restart verdia --update-env
```

### Способ 3: Через systemd
```bash
nano /etc/systemd/system/verdia.service
```

Добавьте в секцию `[Service]`:
```ini
Environment="CLOUDFLARE_WORKER_URL=https://verdia-replicate-proxy.artbashkirov.workers.dev"
Environment="CLOUDFLARE_WORKER_SECRET=b4MXM42!"
```

Затем:
```bash
systemctl daemon-reload
systemctl restart verdia
```

## Перезапуск приложения

После изменения переменных:

**PM2:**
```bash
pm2 restart verdia
pm2 save
```

**Systemd:**
```bash
systemctl restart verdia
systemctl status verdia
```

**Прямой запуск:**
```bash
cd /path/to/verdia
npm run build
npm run start
```
