# Проверка деплоя на VPS

GitHub Actions выполнился успешно, но изменения не видны. Нужно проверить, что произошло на VPS.

## Шаги для проверки

### 1. Проверка на VPS (через SSH)

Подключитесь к VPS и проверьте:

```bash
ssh root@193.227.240.206
cd /opt/verdia-app

# Проверьте, какой коммит сейчас на VPS
git log -1

# Должен быть коммит 526ce7e или новее
# Если нет - выполните вручную:
git pull origin main

# Проверьте, что сборка прошла
ls -la .next

# Перезапустите приложение
pm2 restart verdia --update-env
pm2 save

# Проверьте логи
pm2 logs verdia --lines 50
```

### 2. Проверка статуса PM2

```bash
pm2 list
pm2 info verdia
```

Должен быть процесс `verdia` в статусе "online".

### 3. Проверка изменений в коде

Проверьте, что изменения действительно есть на VPS:

```bash
cd /opt/verdia-app

# Проверьте, есть ли кнопка "Подробнее" в коде
grep -r "Подробнее" src/app/(chat)/chat/new/page.tsx

# Проверьте, что изменения есть в коде
git diff HEAD~5 HEAD --name-only
```

### 4. Проверка логов GitHub Actions

Проверьте логи последнего деплоя:
1. Откройте https://github.com/artbashkirov/verdia/actions
2. Найдите последний успешный run (#52)
3. Откройте его и проверьте логи шага "Deploy to VPS"
4. Убедитесь, что команды выполнились:
   - `git pull origin main` - успешно
   - `npm install` - успешно
   - `npm run build` - успешно
   - `pm2 restart verdia` - успешно

### 5. Возможные проблемы

#### Проблема: Старый код на VPS
**Решение:** Выполните вручную на VPS:
```bash
cd /opt/verdia-app
git pull origin main
npm install --production=false
npm run build
pm2 restart verdia --update-env
pm2 save
```

#### Проблема: PM2 не перезапустился
**Решение:** 
```bash
pm2 restart verdia --update-env
pm2 save
```

#### Проблема: Кэш браузера
**Решение:** 
- Откройте сайт в режиме инкогнито
- Нажмите Ctrl+Shift+R (жесткая перезагрузка)
- Откройте DevTools → Network → включите "Disable cache"

#### Проблема: Кэш Next.js
**Решение:** На VPS:
```bash
cd /opt/verdia-app
rm -rf .next
npm run build
pm2 restart verdia
```

### 6. Принудительный редеплой

Если ничего не помогло, выполните принудительный редеплой:

```bash
ssh root@193.227.240.206
cd /opt/verdia-app
git fetch origin
git reset --hard origin/main
npm install --production=false
rm -rf .next node_modules/.cache
npm run build
pm2 restart verdia --update-env
pm2 save
```

### 7. Проверка результата

После деплоя проверьте:
1. Откройте сайт в режиме инкогнито
2. Нажмите Ctrl+Shift+R (жесткая перезагрузка)
3. Проверьте, что видите:
   - Кнопку "Подробнее" рядом с вероятностью
   - Новые изменения в интерфейсе
