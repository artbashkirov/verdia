# Nginx — конфиг для production (blue-green + надёжность)

Документ описывает **production-конфиг** nginx для Verdia. Покрывает:

1. **Балансировку blue-green** — два upstream-сервера (3000 + 3002), nginx
   автоматически распределяет трафик между ними и при сбое одного из них
   мгновенно (в пределах одного запроса) переходит на второй.
2. **Брендированную страницу 502** на случай, если **оба** инстанса разом
   недоступны (что в blue-green деплое практически невозможно, но мы
   защищены).
3. **Health-check без рекурсивных ловушек** — `/api/health` проксируется
   с `proxy_intercept_errors off`, чтобы JS на странице 502 не путался
   и не зашёл в петлю.

> Сначала прочитай и сделай шаги в `docs/migration-blue-green.md`,
> и только потом возвращайся сюда — для применения этого конфига нужно,
> чтобы оба процесса (`verdia-blue` на 3000 и `verdia-green` на 3002)
> уже работали.

---

## Шаг 1. Скопировать страницу 502 на VPS

`public/502.html` лежит в репо. nginx будет отдавать её **напрямую с диска**,
минуя proxy — иначе при крайне маловероятном падении обоих инстансов сразу
страница тоже окажется недоступна.

На VPS:

```bash
sudo mkdir -p /var/www/verdia
sudo cp /opt/verdia-app/public/502.html /var/www/verdia/502.html
sudo chown -R www-data:www-data /var/www/verdia
```

Если в будущем `502.html` обновится — повторить копирование.
(При желании можно автоматизировать в `deploy.yml` через дополнительный
`cp` после успешного rolling reload.)

---

## Шаг 2. Обновить server-блок nginx

Файл обычно лежит в `/etc/nginx/sites-available/ai-verdia.ru`.

Найти текущий конфиг и его расположение:

```bash
sudo nginx -T 2>/dev/null | grep -E "server_name ai-verdia" -A 30 | head -60
```

Затем заменить на (или дописать к) такому конфигу:

```nginx
# ─────────────────────────────────────────────────────────────────────
# Upstream: оба инстанса с равным весом, активным failover.
#
# - max_fails=2: после 2 ошибок подряд nginx помечает upstream как «down»
# - fail_timeout=10s: через 10 сек снова попробует вернуть его в ротацию
# - keepalive 32: пул keep-alive соединений (важно для производительности)
#
# Если оба upstream'а упали — отдадим страницу 502 (см. error_page ниже).
# ─────────────────────────────────────────────────────────────────────
upstream verdia_app {
    server 127.0.0.1:3000 max_fails=2 fail_timeout=10s;
    server 127.0.0.1:3002 max_fails=2 fail_timeout=10s;
    keepalive 32;
}

server {
    listen 443 ssl http2;
    server_name ai-verdia.ru;

    # ... ssl_certificate, ssl_certificate_key, прочие опции ...

    # ─────────────────────────────────────────────────────────────
    # Кастомные страницы для случая, когда ОБА upstream'а недоступны
    # (в blue-green это редкий кейс — например, упала вся VPS).
    # ─────────────────────────────────────────────────────────────
    error_page 502 503 504 /502.html;

    location = /502.html {
        root /var/www/verdia;
        internal;
        # no-store, чтобы браузер не закешировал страницу ошибки и при
        # следующем заходе сразу шёл к реальному сайту.
        add_header Cache-Control "no-store, no-cache, must-revalidate" always;
    }

    # ─────────────────────────────────────────────────────────────
    # Health-check — отдельный location.
    #
    # Принципиально:
    # - `proxy_intercept_errors off` — НЕ показываем 502.html, если health
    #   падает. JS на странице 502 опрашивает этот endpoint, и если он
    #   тоже отдаст HTML страницы 502 (с 502.html в ответе), JS подумает
    #   что сервис ожил и зальётся в петлю reload.
    # - `proxy_next_upstream off` — health не должен ретраиться: если
    #   blue:3000 не ответил, нам важно знать факт. nginx сам пройдёт по
    #   upstream'ам по правилам upstream-блока.
    # - короткие таймауты: health должен быть быстрым.
    # ─────────────────────────────────────────────────────────────
    location = /api/health {
        proxy_pass http://verdia_app;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 2s;
        proxy_read_timeout 5s;
        proxy_send_timeout 5s;

        proxy_intercept_errors off;
        access_log off;
    }

    # ─────────────────────────────────────────────────────────────
    # Основной proxy с автоматическим failover между blue и green.
    # ─────────────────────────────────────────────────────────────
    location / {
        proxy_pass http://verdia_app;
        proxy_http_version 1.1;

        # Поддержка WebSocket (Next.js dev / некоторые realtime-фичи)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # ── Таймауты ──
        # connect — быстро падаем, если порт закрыт (значит upstream down).
        # read/send — длиннее: SSR / стрим ответа AI могут занимать время.
        proxy_connect_timeout 3s;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;

        # ── Failover: ретраим запрос на следующий upstream ──
        # error/timeout/invalid_header — сетевые сбои.
        # http_502/503/504 — upstream вернул ошибку.
        # non_idempotent — разрешает ретраить POST/PUT/PATCH (по умолчанию
        # nginx их НЕ ретраит). Включаем сознательно: между blue и green
        # нет различий, безопаснее повторить, чем потерять.
        # tries=2 — у нас всего 2 upstream'а, больше попыток не имеет смысла.
        # timeout=10s — общий бюджет на failover.
        proxy_next_upstream error timeout invalid_header http_502 http_503 http_504 non_idempotent;
        proxy_next_upstream_tries 2;
        proxy_next_upstream_timeout 10s;

        # Если все попытки upstream провалились — отдадим страницу 502.
        proxy_intercept_errors on;
    }

    # Static-ассеты Next.js — агрессивный кеш на год (immutable hash в URL)
    location /_next/static/ {
        proxy_pass http://verdia_app;
        proxy_cache_valid 200 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
```

---

## Шаг 3. Применить и проверить

```bash
sudo nginx -t                  # проверка синтаксиса
sudo systemctl reload nginx    # без простоя
```

### Тест 1 — обычный трафик идёт на оба инстанса

```bash
# Прогоним 20 запросов и посмотрим, какие upstream'ы отвечают.
# В nginx логе обычно есть $upstream_addr; если у тебя его нет —
# временно добавь в log_format или просто убедись, что оба процесса
# нагружены через `pm2 monit`.

for i in $(seq 1 20); do curl -s -o /dev/null https://ai-verdia.ru/api/health; done
pm2 monit
```

Должно быть видно нагрузку у обоих процессов (`verdia-blue` и `verdia-green`).

### Тест 2 — failover при падении одного инстанса

```bash
pm2 stop verdia-blue
curl -I https://ai-verdia.ru/   # 200 OK — green подхватил
pm2 start verdia-blue
```

Сайт должен работать БЕЗ единого 502 — nginx прозрачно перешёл на green.

### Тест 3 — кастомная 502 при падении ОБОИХ

```bash
pm2 stop verdia-blue verdia-green
curl https://ai-verdia.ru/ | head -20    # видим наш 502.html
pm2 start verdia-blue verdia-green
```

В браузере открыть сайт пока оба остановлены — должна показаться
страница «Сервис обновляется», а не дефолтный nginx-овский 502.
После `pm2 start ...` — она автоматически перезагрузится за ~4–8 сек.

### Тест 4 — реальный деплой

Пушим коммит в `main`. На сайте в это время:

- Открытая страница не должна сломаться (graceful shutdown с
  `kill_timeout: 10s`).
- Refresh во время `pm2 reload verdia-blue` → green обслуживает.
- Refresh во время `pm2 reload verdia-green` → blue обслуживает.
- В сумме — ни одного 502 за весь цикл деплоя.

В Actions деплой должен закончиться сообщением `✅ Deploy complete (zero-downtime)`.

---

## Возможные проблемы и фолбэки

| Симптом                                    | Причина                                                                                | Решение                                                                                                                                  |
| ------------------------------------------ | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `nginx -t` ругается на `non_idempotent`    | nginx < 1.9.13                                                                         | Убрать слово `non_idempotent` — POST/PUT не будут ретраиться, GET продолжит работать                                                     |
| Nginx показывает дефолтный 502, не наш     | `error_page` или `proxy_intercept_errors` стоят не в том server-блоке                  | Убедиться, что директивы внутри **этого** server-блока (а не в другом, например для `www.ai-verdia.ru` или server без SSL)               |
| `/api/health` через nginx уходит в петлю   | `proxy_intercept_errors on` для `/api/health`                                          | Поставить `off` — это ключевая инверсия: для всех остальных `on`, для health — `off`                                                     |
| Один upstream постоянно `down` в логах     | На VPS не запустился `verdia-green` (3002)                                              | `pm2 status`, `pm2 logs verdia-green` — обычно `EADDRINUSE` или ошибки в `start.sh`. См. `docs/migration-blue-green.md`                  |
| Все запросы идут только на blue            | `verdia-green` мёртв или nginx не знает про upstream 3002                               | `curl -fsS http://127.0.0.1:3002/api/health` с VPS должен отдавать 200. Если нет — green не запущен                                       |
| После деплоя один из upstream'ов «застрял» на старой версии | `pm2 reload` не подхватил новый код                                | `pm2 reload <name> --update-env` (с флагом). Если не помогает — `pm2 restart <name>` (полный рестарт, без update-env флага)              |

---

## Что дальше

Этот конфиг даёт настоящий zero-downtime для обычных деплоев.
Что **не** покрывается и стоит держать в голове:

- **Падение всей VPS** (`disk full`, OOM, плановый ресет провайдера) —
  пользователь увидит `502.html`. Дальше — горизонтальный фейловер на
  второй сервер, это уже отдельная архитектурная задача.
- **Миграции БД с breaking changes** — между blue и green в момент
  rolling reload секунды две существуют обе версии кода. Если миграция
  ломает совместимость с предыдущей версией — нужен двухфазный деплой
  (миграция совместимая → деплой → миграция-чистка). См. backlog.
- **Кеши на стороне Next.js** — `revalidate`/`cache: 'force-cache'` могут
  отдавать старый контент. Проверять при использовании.
