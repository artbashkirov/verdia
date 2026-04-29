# Миграция на blue-green deployment

Документ описывает **разовую миграцию** с текущего одно-инстансного pm2-стартапа
(`pm2 start verdia`) на blue-green архитектуру с двумя процессами
(`verdia-blue` + `verdia-green`).

После миграции деплой через `git push` станет **zero-downtime** — пользователи
не будут видеть ни 502, ни обрыва открытых сессий.

> Эта инструкция выполняется **один раз вручную** на VPS. После неё всё
> работает автоматически через GitHub Actions.

---

## Что делает миграция

1. Проверяем содержимое `start.sh` на VPS — он должен уважать `$PORT`.
   Если нет — обновляем.
2. Удаляем старый pm2-процесс `verdia` и запускаем два новых:
   `verdia-blue` (порт 3000) и `verdia-green` (порт 3002).
3. Обновляем nginx: с одного upstream на два + кастомные страницы 502.
4. Прогоняем тесты failover.

**Время:** ~20–30 минут с проверками. **Откат:** вернуть старый
`ecosystem.config.js` и `pm2 start verdia`, вернуть старый nginx-конфиг.

---

## Подготовка

### 0.1. Убедиться, что свежий код уже на VPS

В первую очередь нужно, чтобы текущий push в main уже задеплоился, и в репо
на VPS уже есть **новый** `ecosystem.config.js` (с blue/green) и
`src/app/api/health/route.ts`.

```bash
ssh root@<vps>
cd /opt/verdia-app
git log -1
# Должен быть последний коммит с blue-green изменениями
```

Если ещё не задеплоилось — подождать или сделать `git pull origin main`
вручную (но **не запускать** новый деплой на старом ecosystem.config — упадёт
healthcheck).

### 0.2. Проверить ресурсы VPS

```bash
free -h
df -h
nproc
```

Что нужно:
- **RAM**: blue-green удваивает потребление. Прикинуть текущее потребление
  через `pm2 monit` (RSS у процесса `verdia`); умножить на 2 + 200 МБ
  буфера. Если свободной RAM меньше — добавить swap или временно отключить
  green после миграции (но zero-downtime тогда работает только при первом
  деплое после старта green).
- **Disk**: ничего не меняется, оба процесса используют один билд.
- **CPU**: 2+ ядра — оптимально, оба процесса смогут работать параллельно.

---

## Шаг 1. (Пропускается — start.sh не используется)

> Ранее в этом документе был шаг по приведению `start.sh` к виду с `$PORT`.
> На практике на VPS текущий процесс `verdia` запущен напрямую через
> `pm2 start npm --name verdia -- start`, без скрипта-обёртки. Файла
> `start.sh` нет (`cat /opt/verdia-app/start.sh: No such file or directory`).
>
> Поэтому в новом `ecosystem.config.js` мы тоже стартуем через `npm start`
> с передачей `PORT` через env. Никакого `start.sh` создавать не нужно.
>
> Если на твоём VPS вдруг есть свой `start.sh` (например, сделанный руками
> ранее) — он может остаться, но новый pm2-конфиг его всё равно не использует.

---

## Шаг 2. Перейти на новые pm2-процессы

### 2.1. Убедиться, что новый ecosystem.config.js на месте

```bash
cd /opt/verdia-app
grep -E "verdia-blue|verdia-green" ecosystem.config.js
# Должны увидеть оба имени
```

Если нет — `git pull origin main`.

### 2.2. Удалить старый процесс `verdia`

```bash
pm2 stop verdia
pm2 delete verdia
pm2 save
```

⚠️ **В этот момент сайт упадёт на 502** — это ожидаемо, миграция занимает
~30 секунд. Если хочешь сделать без даунтайма — стартани blue ДО удаления
старого `verdia`, потом удали `verdia`. Но это лишние шаги, обычно проще
сделать миграцию в технологическое окно (например, ночью).

### 2.3. Запустить новые процессы

```bash
cd /opt/verdia-app
pm2 start ecosystem.config.js --only verdia-blue
pm2 start ecosystem.config.js --only verdia-green

# Проверить, что оба запустились и слушают свои порты
pm2 status
sleep 5
curl -fsS http://127.0.0.1:3000/api/health
echo
curl -fsS http://127.0.0.1:3002/api/health
echo
```

Оба `curl` должны отдать `{"status":"ok",...}`.

Если один из них не отвечает:

```bash
pm2 logs verdia-blue --lines 100 --nostream
pm2 logs verdia-green --lines 100 --nostream
```

Типичные ошибки:
- **`EADDRINUSE :::3002`** — что-то уже слушает 3002. Проверить:
  `sudo lsof -i :3002`. Если это `verdia-scraper` — убедиться, что в его
  ecosystem-секции порт 3001, не 3002.
- **`Cannot find module 'next'`** — `npm install` не прошёл, запустить вручную.
- **`.env.production: No such file`** — отсутствует, скопировать с резервной
  копии.

### 2.4. Сохранить pm2-стейт, чтобы он переживал ребут

```bash
pm2 save
pm2 startup   # (если ещё не настроено) — выдаст команду, которую надо выполнить
```

---

## Шаг 3. Скопировать страницу 502 на VPS

```bash
sudo mkdir -p /var/www/verdia
sudo cp /opt/verdia-app/public/502.html /var/www/verdia/502.html
sudo chown -R www-data:www-data /var/www/verdia
sudo ls -la /var/www/verdia/502.html
```

Должна быть права `-rw-r--r--` и владелец `www-data`.

---

## Шаг 4. Обновить nginx-конфиг

> **Имя файла на VPS — `verdia`** (не `ai-verdia.ru`). Если у тебя
> другое имя — используй найденное (`ls /etc/nginx/sites-enabled/`).

### 4.1. Сделать бэкап (если ещё не делал на этапе диагностики)

```bash
sudo cp /etc/nginx/sites-available/verdia /etc/nginx/sites-available/verdia.bak
```

### 4.2. Применить новый конфиг — **через git, а не heredoc**

Канонический файл лежит в репозитории `deploy/nginx/verdia.conf`.
**Не копируй большие блоки конфига вручную через heredoc** — длинные
многострочные блоки в SSH часто слипаются и режутся. Используй git:

```bash
cd /opt/verdia-app
git pull origin main

# Скопировать каноничный конфиг из репо в системный путь
sudo cp /opt/verdia-app/deploy/nginx/verdia.conf /etc/nginx/sites-available/verdia
```

Проверить, что файл записался корректно:

```bash
head -20 /etc/nginx/sites-available/verdia
```

Должны увидеть `upstream verdia_app { ... }` и список двух `server 127.0.0.1:...`.

### 4.3. Проверить и применить

```bash
sudo nginx -t
```

Ожидание:
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

⛔ Если показал `error` — **НЕ делай reload**. Откати:
```bash
sudo cp /etc/nginx/sites-available/verdia.bak /etc/nginx/sites-available/verdia
sudo nginx -t  # должно стать ОК
```

Если `nginx -t` зелёный:

```bash
sudo systemctl reload nginx
```

`reload` — без даунтайма, текущие соединения дорабатывают на старом конфиге,
новые идут уже с failover.

---

## Шаг 5. Тесты после миграции

Все четыре теста — обязательные.

### Тест 1: Сайт доступен

```bash
curl -I https://ai-verdia.ru/
# HTTP/2 200
```

В браузере — должен открыться без 502.

### Тест 2: Failover при падении blue

```bash
pm2 stop verdia-blue
curl -fsS https://ai-verdia.ru/api/health
# Должно: {"status":"ok",...}  (отвечает green:3002)

curl -I https://ai-verdia.ru/
# HTTP/2 200

pm2 start verdia-blue
sleep 5
curl -fsS http://127.0.0.1:3000/api/health
# Должно вернуться: {"status":"ok",...}
```

### Тест 3: Failover при падении green

```bash
pm2 stop verdia-green
curl -I https://ai-verdia.ru/   # 200 (blue)
pm2 start verdia-green
sleep 5
```

### Тест 4: Кастомная 502 при падении обоих

```bash
pm2 stop verdia-blue verdia-green
curl https://ai-verdia.ru/ | grep -i "сервис обновляется"
# Должна найтись строка из public/502.html

pm2 start verdia-blue verdia-green
```

В браузере (пока оба остановлены) — должна быть наша страница «Сервис
обновляется», и она должна сама перезагрузиться через ~4–8 сек после
старта процессов.

### Тест 5: Реальный деплой

Сделать пустой коммит в локальном репо и запушить:

```bash
# на локальной машине
git commit --allow-empty -m "test: rolling deploy"
git push origin main
```

В Actions смотрим логи деплоя — должны увидеть последовательность:

```
==========================================
  Step 1: reload verdia-blue (port 3000)
==========================================
[verdia-blue] healthcheck OK on attempt N
==========================================
  Step 2: reload verdia-green (port 3002)
==========================================
[verdia-green] healthcheck OK on attempt N
==========================================
  ✅ Deploy complete (zero-downtime)
==========================================
```

В это время сайт в браузере — без единого 502, без сброса формы.

---

## Откат

Если что-то пошло не так и нужно срочно вернуть как было:

### Откат pm2

```bash
cd /opt/verdia-app
pm2 stop verdia-blue verdia-green
pm2 delete verdia-blue verdia-green

# Временно вернуть старый ecosystem (или сразу запустить через npm)
pm2 start npm --name verdia -- start
pm2 save
```

### Откат nginx

```bash
sudo cp /etc/nginx/sites-available/ai-verdia.ru.bak /etc/nginx/sites-available/ai-verdia.ru
sudo nginx -t && sudo systemctl reload nginx
```

### Откат деплоя

В .github/workflows/deploy.yml вернуться к версии с `pm2 reload verdia` (через
`git revert` соответствующего коммита).

---

## После успешной миграции

1. Сделать пометку в `docs/backlog.md` пункт 4: **«Реализовано»**, дата.
2. Удалить с VPS бэкапы (`start.sh.bak`, `ai-verdia.ru.bak`) — но не сразу,
   подержать неделю на случай скрытых проблем.
3. Прогнать `docs/manual-regression.md` раздел 11 (поведение во время деплоя).
4. Поделиться победой ☕

---

## FAQ

**Q: А если RAM мало (< 1 ГБ свободной)?**
A: Запустить только `verdia-blue`, оставить `verdia-green` остановленным.
Это даст брендированную 502-страницу, но не zero-downtime. Потом, когда
обновят VPS — поднять green.

**Q: Между blue и green секунды есть рассогласование версий — это проблема?**
A: Для read-only фич — нет. Для миграций БД с breaking changes — да, нужен
двухфазный деплой (см. `docs/nginx-config.md` → «Что дальше»).

**Q: Что насчёт ChunkLoadError у уже открытых вкладок?**
A: Закрыто отдельной мерой в `deploy.yml`: после `npm run build` мерджим
архив старых чанков (`.next-static-archive/`) обратно в `.next/static/`,
не перезаписывая новые. Старые вкладки догружают свои файлы, новые — свои.
Архив чистится через 14 дней. Плюс клиентский safety-net
`ChunkErrorRecovery` авто-перезагружает страницу, если чанк всё-таки
не нашёлся. Подробнее — комментарии в `.github/workflows/deploy.yml` и
`src/components/layout/ChunkErrorRecovery.tsx`.

**Q: Что с диском? Архив `.next-static-archive` не разрастётся?**
A: 14 дней истории × средний размер `.next/static` (~50–150 МБ для
наших размеров) = до ~500 МБ в крайнем случае. На VPS обычно есть.
Если тесно — уменьшить срок в `find ... -mtime +14` (например, до 7).
Мониторить: `du -sh /opt/verdia-app/.next-static-archive/`. В логах
Actions размер архива печатается каждый деплой.

**Q: Можно ли запустить 3+ инстансов?**
A: Да, добавить `verdia-purple`, `verdia-orange` и т.д. в `ecosystem.config.js`
и в `upstream` блок nginx. Но обычно 2 достаточно — больше упирается в RAM
и не даёт пропорциональной выгоды.

**Q: Можно ли один из них держать на отдельной VPS?**
A: Можно, тогда это уже horizontal failover, и blue-green превращается в
полноценный multi-server deployment. Тут понадобится:
- общий PostgreSQL (Supabase у нас уже общий ✅);
- единая хеш-функция распределения (или просто round-robin, если сессии в БД);
- мониторинг обоих VPS.
Это отдельная задача.
