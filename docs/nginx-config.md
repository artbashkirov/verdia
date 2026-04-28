# Nginx — конфиг для production-надёжности

Документ описывает, как настроить nginx на VPS (`ai-verdia.ru`), чтобы:

1. **Короткие сбои upstream были незаметны.** При временной недоступности
   Next.js (короткий рестарт, краш с авто-восстановлением) nginx ретраит
   запрос с разумным таймаутом, а не сразу выкидывает белый «502 Bad Gateway
   nginx/1.24.0».
2. **Если падение длится дольше нескольких секунд** — пользователь видит
   нашу брендированную страницу (`/var/www/verdia/502.html`), которая сама
   проверяет `/api/health` и перезагружается, как только сервис вернулся.
3. **Никаких внешних ресурсов** в момент падения — страница самодостаточная
   (inline SVG + inline CSS + inline JS).

> **Контекст.** Сейчас деплой использует `pm2 reload` в fork-mode. Это даёт
> graceful shutdown, но не zero-downtime — есть короткое окно (1–5 сек), в
> которое пользователь без этой настройки видит дефолтный nginx 502.
> Полный zero-downtime (cluster mode + blue-green) — отдельная задача в
> `docs/backlog.md`.

---

## Шаг 1. Скопировать страницу 502 на VPS

Эта страница уже лежит в репозитории по адресу `public/502.html`.
nginx будет отдавать её **напрямую**, минуя proxy — иначе при падении Next
она тоже окажется недоступна.

На VPS:

```bash
sudo mkdir -p /var/www/verdia
sudo cp /opt/verdia-app/public/502.html /var/www/verdia/502.html
sudo chown -R www-data:www-data /var/www/verdia
```

> Если в будущем `502.html` обновится — добавим копирование в `deploy.yml`
> отдельным шагом. Пока — раз вручную, потом редко меняется.

---

## Шаг 2. Обновить server-блок nginx

Файл обычно лежит в `/etc/nginx/sites-available/ai-verdia.ru` (или
`/etc/nginx/conf.d/...`). Найти текущий конфиг:

```bash
sudo nginx -T | grep -E "server_name|listen|proxy_pass" | head -50
```

Внутри основного `server { ... }` для `ai-verdia.ru` должно быть примерно так:

```nginx
upstream verdia_app {
    server 127.0.0.1:3000 max_fails=0 fail_timeout=0;
    keepalive 32;
}

server {
    listen 443 ssl http2;
    server_name ai-verdia.ru;

    # ... ssl_certificate, ssl_certificate_key, прочие опции ...

    # ───────────────────────────────────────────────────────────
    # Кастомные страницы ошибок upstream
    # ───────────────────────────────────────────────────────────
    error_page 502 503 504 /502.html;

    # Сама страница 502 — отдаётся напрямую с диска, не через proxy.
    # `internal` запрещает её прямой запрос пользователем по URL /502.html
    # (она показывается ТОЛЬКО как error_page).
    location = /502.html {
        root /var/www/verdia;
        internal;
        # Cache-Control no-store — чтобы браузер не закешировал страницу
        # ошибки и при следующем заходе сразу пытался реальный сайт.
        add_header Cache-Control "no-store, no-cache, must-revalidate" always;
    }

    # ───────────────────────────────────────────────────────────
    # Health-check — отдельный location без error_page, чтобы JS
    # на странице 502 мог корректно понять, что сервис снова жив.
    # ───────────────────────────────────────────────────────────
    location = /api/health {
        proxy_pass http://verdia_app;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 2s;
        proxy_read_timeout 5s;
        proxy_send_timeout 5s;

        # Health не должен показывать страницу 502 — иначе JS на /502.html
        # подумает, что сервис ожил, и зальёт пользователя обратно в петлю.
        proxy_intercept_errors off;

        access_log off;
    }

    # ───────────────────────────────────────────────────────────
    # Основной proxy
    # ───────────────────────────────────────────────────────────
    location / {
        proxy_pass http://verdia_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # ── Таймауты ──
        # connect — быстро падаем, если порт закрыт (значит process down).
        # read/send — длиннее: SSR / стрим ответа AI могут занимать время.
        proxy_connect_timeout 3s;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;

        # ── Ретраи на upstream ──
        # error/timeout/invalid_header — сетевые сбои.
        # http_502/503/504 — upstream вернул ошибку.
        # non_idempotent — разрешает ретраить POST/PUT/PATCH (по умолчанию nginx
        # их не ретраит). Включаем сознательно: безопаснее повторить, чем
        # потерять. Если в API появятся не-идемпотентные операции, для них
        # надо будет переопределить локацию без `non_idempotent`.
        proxy_next_upstream error timeout invalid_header http_502 http_503 http_504 non_idempotent;
        proxy_next_upstream_tries 3;
        proxy_next_upstream_timeout 10s;

        # Если все попытки upstream провалились — отдадим красивую 502-страницу.
        proxy_intercept_errors on;
    }

    # ── (опционально) static ассеты с агрессивным кешем ──
    location /_next/static/ {
        proxy_pass http://verdia_app;
        proxy_cache_valid 200 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
```

> **Где у нас сейчас разница с этим конфигом** — не знаю точно, на VPS я
> не имею доступа из этой сессии. Самое важное добавить:
> 1. блок `error_page 502 503 504 /502.html;`
> 2. `location = /502.html { root /var/www/verdia; internal; }`
> 3. `proxy_next_upstream` + `proxy_next_upstream_tries` + `proxy_intercept_errors on;`
> 4. **Отдельный** `location = /api/health` без `proxy_intercept_errors`.

---

## Шаг 3. Применить и проверить

```bash
# Проверить синтаксис
sudo nginx -t

# Перезагрузить (без простоя)
sudo systemctl reload nginx
```

### Тест 1 — кастомная 502 показывается

Останавливаем upstream, открываем сайт:

```bash
pm2 stop verdia
curl -I https://ai-verdia.ru/   # должно быть HTTP/2 502
curl https://ai-verdia.ru/ | head -20   # видим наш HTML, не дефолтный nginx
pm2 start verdia
```

Браузером открыть `https://ai-verdia.ru/` пока процесс остановлен — должна
показаться страница «Сервис обновляется» с пульсирующей точкой.
Запустить `pm2 start verdia` — страница автоматически перезагрузится в работающее
приложение в течение ~4–8 секунд.

### Тест 2 — health-check работает во время падения

Пока upstream остановлен:

```bash
curl https://ai-verdia.ru/api/health
# Должно: 502 (а не наша страница 502.html — потому что мы отключили
# proxy_intercept_errors для этого location).
```

После старта upstream:

```bash
pm2 start verdia
sleep 5
curl https://ai-verdia.ru/api/health
# {"status":"ok","uptime":...,"timestamp":"..."}
```

### Тест 3 — поведение во время реального деплоя

Пушим коммит в `main`, наблюдаем сайт в браузере:
- если открыта страница → не должна сломаться (graceful shutdown);
- если рефрешишь во время `pm2 reload` → либо ретрай через nginx сглаживает,
  либо (если простой длиннее 10 сек) показывается 502.html, потом сама
  обновится.

---

## Возможные проблемы и фолбэки

| Симптом                                    | Причина                                                                       | Решение                                                                                                                |
| ------------------------------------------ | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| После деплоя браузер показывает дефолтный nginx 502 | Не подгрузился `error_page` или `proxy_intercept_errors off` | Проверить, что блок `error_page 502 503 504 /502.html;` есть в **этом** server-блоке (а не в другом, например для www) |
| Страница 502.html никогда не обновляется   | `/api/health` сам уходит на 502.html                                           | Убедиться, что для `/api/health` стоит `proxy_intercept_errors off`                                                    |
| Petля: страница 502 → reload → опять 502   | Upstream реально не поднялся                                                  | `pm2 status`, `pm2 logs verdia` — смотреть, почему не стартует                                                          |
| `nginx -t` ругается на `non_idempotent`    | nginx < 1.9.13                                                                | Убрать слово `non_idempotent` из `proxy_next_upstream` — POST/PUT не будут ретраиться, но всё остальное продолжит работать |

---

## Что дальше

См. `docs/backlog.md` → **Zero-downtime deploy** — следующий шаг (cluster
mode, blue-green). Этот сниппет готовит инфраструктуру так, чтобы переход на
zero-downtime проходил без переписывания nginx-конфига.
