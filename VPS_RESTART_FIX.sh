#!/bin/bash
# Исправление PM2 конфигурации для verdia
# Выполните на VPS: bash VPS_RESTART_FIX.sh

cd /opt/verdia-app

echo "🔧 Исправление конфигурации PM2 для verdia"
echo ""

echo "1️⃣ Останавливаем процесс verdia..."
pm2 delete verdia 2>/dev/null || true

echo "2️⃣ Проверяем, что start.sh существует и исполняемый..."
if [ -f start.sh ]; then
    chmod +x start.sh
    echo "   ✅ start.sh найден и сделан исполняемым"
else
    echo "   ❌ start.sh не найден!"
    exit 1
fi

echo ""
echo "3️⃣ Запускаем verdia через start.sh с правильной директорией..."
pm2 start start.sh \
  --name verdia \
  --cwd /opt/verdia-app \
  --interpreter bash \
  --update-env

echo ""
echo "4️⃣ Сохраняем конфигурацию PM2..."
pm2 save

echo ""
echo "5️⃣ Проверяем статус..."
pm2 list

echo ""
echo "6️⃣ Проверяем переменные окружения в PM2..."
echo "   (переменные должны быть видны, так как start.sh их экспортирует)"
pm2 describe verdia | grep -A 30 "env:"

echo ""
echo "✅ Готово! Проверьте логи:"
echo "   pm2 logs verdia --lines 30"
