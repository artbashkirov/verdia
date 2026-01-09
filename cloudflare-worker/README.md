# Cloudflare Worker - Прокси для Replicate API

Этот Worker позволяет обходить географические блокировки Replicate API, проксируя запросы через серверы Cloudflare.

## Как это работает

```
VPS (Россия) → Cloudflare Worker (США/Европа) → Replicate API
```

## Шаги по настройке

### 1. Создайте аккаунт Cloudflare

Перейдите на [cloudflare.com](https://cloudflare.com) и создайте бесплатный аккаунт.

### 2. Установите Wrangler CLI

```bash
npm install -g wrangler
```

### 3. Авторизуйтесь в Cloudflare

```bash
wrangler login
```

Откроется браузер для авторизации.

### 4. Задеплойте Worker

Перейдите в папку `cloudflare-worker`:

```bash
cd cloudflare-worker
wrangler deploy
```

После деплоя вы получите URL вида:
```
https://verdia-replicate-proxy.YOUR_SUBDOMAIN.workers.dev
```

### 5. Добавьте секреты

```bash
# Добавьте ваш Replicate API токен
wrangler secret put REPLICATE_API_TOKEN
# Введите токен когда попросят

# Добавьте секретный ключ для авторизации запросов
wrangler secret put WORKER_SECRET
# Придумайте и введите случайную строку (например: verdia_worker_secret_xyz123)
```

### 6. Настройте переменные на VPS

Добавьте в `.env.local` на вашем VPS:

```bash
CLOUDFLARE_WORKER_URL=https://verdia-replicate-proxy.YOUR_SUBDOMAIN.workers.dev
CLOUDFLARE_WORKER_SECRET=тот_же_секрет_что_и_в_worker
```

### 7. Перезапустите приложение

```bash
pm2 restart verdia
# или
systemctl restart verdia
```

## Проверка работы

Вы можете проверить Worker напрямую:

```bash
curl -X POST https://verdia-replicate-proxy.YOUR_SUBDOMAIN.workers.dev \
  -H "Content-Type: application/json" \
  -H "X-Worker-Secret: ваш_секрет" \
  -d '{"model": "google/gemini-2.0-flash-001", "input": {"prompt": "Hello!", "max_tokens": 100}}'
```

## Лимиты

Бесплатный план Cloudflare Workers включает:
- 100,000 запросов в день
- 10ms CPU time на запрос (достаточно для прокси)

## Безопасность

- Worker защищён секретным ключом `X-Worker-Secret`
- Replicate API токен хранится как секрет в Cloudflare (не в коде)
- CORS настроен для всех origins (можно ограничить при необходимости)
