#!/bin/bash
# Диагностика переменных окружения на VPS
# Выполните на VPS: bash VPS_DIAGNOSTICS.sh

cd /opt/verdia-app

echo "=========================================="
echo "🔍 Диагностика переменных окружения"
echo "=========================================="
echo ""

echo "1️⃣ Проверка .env.production файла:"
if [ -f .env.production ]; then
    echo "   ✅ Файл .env.production существует"
    echo "   Содержимое:"
    cat .env.production | grep CLOUDFLARE
else
    echo "   ❌ Файл .env.production НЕ найден!"
fi
echo ""

echo "2️⃣ Проверка переменных в PM2:"
pm2 describe verdia | grep -A 20 "env:"
echo ""

echo "3️⃣ Проверка переменных в runtime через Node.js:"
node -e "console.log('CLOUDFLARE_WORKER_URL:', process.env.CLOUDFLARE_WORKER_URL || 'НЕ УСТАНОВЛЕН'); console.log('CLOUDFLARE_WORKER_SECRET:', process.env.CLOUDFLARE_WORKER_SECRET ? 'УСТАНОВЛЕН (' + process.env.CLOUDFLARE_WORKER_SECRET.length + ' символов)' : 'НЕ УСТАНОВЛЕН');"
echo ""

echo "4️⃣ Статус PM2 процессов:"
pm2 list
echo ""

echo "5️⃣ Последние ошибки verdia:"
pm2 logs verdia --err --lines 10 --nostream
echo ""

echo "6️⃣ Проверка логов на наличие ошибок про CLOUDFLARE:"
if pm2 logs verdia --lines 100 --nostream | grep -i "CLOUDFLARE_WORKER_URL\|CLOUDFLARE_WORKER_SECRET\|must be set"; then
    echo "   ⚠️  Найдены ошибки про CLOUDFLARE_WORKER"
else
    echo "   ✅ Ошибок про CLOUDFLARE_WORKER не найдено"
fi
echo ""

echo "7️⃣ Информация о приложении:"
if [ -f start.sh ]; then
    echo "   Файл start.sh существует"
    echo "   Первые строки start.sh:"
    head -5 start.sh
else
    echo "   ⚠️  Файл start.sh не найден"
fi
echo ""

echo "=========================================="
echo "✅ Диагностика завершена"
echo "=========================================="
