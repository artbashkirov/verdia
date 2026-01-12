#!/bin/bash

# Скрипт для принудительного деплоя на VPS
# Использование: ssh root@193.227.240.206 'bash -s' < scripts/force-deploy-vps.sh

echo "🚀 Начинаю принудительный деплой на VPS..."
echo ""

# Переходим в директорию приложения
cd /opt/verdia-app || {
    echo "❌ Ошибка: директория /opt/verdia-app не найдена"
    exit 1
}

echo "📂 Текущая директория: $(pwd)"
echo ""

# Проверяем текущий коммит
echo "📝 Текущий коммит на VPS:"
git log -1 --oneline
echo ""

# Обновляем код
echo "🔄 Обновляю код из GitHub..."
git fetch origin
git reset --hard origin/main
echo ""

# Проверяем новый коммит
echo "📝 Новый коммит после обновления:"
git log -1 --oneline
echo ""

# Устанавливаем зависимости
echo "📦 Устанавливаю зависимости..."
npm install --production=false
echo ""

# Очищаем кэш Next.js
echo "🧹 Очищаю кэш Next.js..."
rm -rf .next
rm -rf node_modules/.cache
echo ""

# Собираем приложение
echo "🔨 Собираю приложение..."
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Ошибка при сборке!"
    exit 1
fi
echo ""

# Проверяем, что сборка прошла успешно
if [ ! -d ".next" ]; then
    echo "❌ Ошибка: директория .next не создана после сборки!"
    exit 1
fi

echo "✅ Сборка прошла успешно"
echo ""

# Перезапускаем PM2
echo "🔄 Перезапускаю PM2..."
pm2 restart verdia --update-env
pm2 save
echo ""

# Проверяем статус PM2
echo "📊 Статус PM2:"
pm2 list
echo ""

# Проверяем логи
echo "📋 Последние логи (последние 20 строк):"
pm2 logs verdia --lines 20 --nostream
echo ""

echo "✅ Деплой завершен!"
echo ""
echo "🔍 Проверьте изменения:"
echo "   1. Откройте сайт в режиме инкогнито"
echo "   2. Нажмите Ctrl+Shift+R (жесткая перезагрузка)"
echo "   3. Проверьте, что видите новые изменения"
