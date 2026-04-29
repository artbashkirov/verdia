# nginx — production-конфиг

Папка содержит nginx-конфиг под VPS `ai-verdia.ru`.

## Файлы

- **`verdia.conf`** — production-конфиг для `/etc/nginx/sites-available/verdia`.
  Содержит upstream blue+green с failover, кастомную страницу 502, отдельный
  `/api/health` без `proxy_intercept_errors`. Подробное описание архитектуры
  — комментарии в начале самого файла и в `docs/nginx-config.md`.

## Применение на VPS

См. `docs/migration-blue-green.md`, шаг 8. Кратко:

```bash
# На VPS, в /opt/verdia-app/
cd /opt/verdia-app
git pull origin main

# Бэкап текущего (если ещё не сделан)
sudo cp /etc/nginx/sites-available/verdia /etc/nginx/sites-available/verdia.bak

# Применить новый конфиг
sudo cp /opt/verdia-app/deploy/nginx/verdia.conf /etc/nginx/sites-available/verdia

# Проверить и применить
sudo nginx -t
sudo systemctl reload nginx
```

## Откат

```bash
sudo cp /etc/nginx/sites-available/verdia.bak /etc/nginx/sites-available/verdia
sudo nginx -t && sudo systemctl reload nginx
```

## Почему файл лежит в репо

1. **Версионирование.** Можно посмотреть `git log deploy/nginx/verdia.conf`
   и понять, что и когда менялось.
2. **Безопасный деплой.** Передача через `git pull + cp` устраняет проблемы
   с copy-paste больших heredoc-блоков в SSH (которые ломаются на длинных
   многострочных файлах).
3. **Воспроизводимость.** Если поднимется второй сервер — конфиг применяется
   тем же скриптом, не из памяти.

## Что НЕ лежит в репо (и не должно)

- Сертификаты (`/etc/letsencrypt/live/ai-verdia.ru/*.pem`) — они на VPS,
  Certbot обновляет автоматически.
- Реальные ключи и пароли — нет их в этом файле, только пути и ссылки.
- `nginx.conf` (главный) — он стандартный из пакета nginx, мы его не меняем.
