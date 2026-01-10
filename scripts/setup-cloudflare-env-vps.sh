#!/bin/bash

# Скрипт для настройки переменных окружения Cloudflare Worker на VPS
# Запуск на VPS: bash scripts/setup-cloudflare-env-vps.sh

set -e

echo "🔧 Настройка переменных окружения Cloudflare Worker на VPS"
echo ""

# Определяем директорию проекта
PROJECT_DIR="/opt/verdia-app"

if [ ! -d "$PROJECT_DIR" ]; then
    echo "❌ Директория $PROJECT_DIR не найдена!"
    echo "Используйте: PROJECT_DIR=/путь/к/проекту bash $0"
    exit 1
fi

cd "$PROJECT_DIR"
echo "📁 Рабочая директория: $(pwd)"
echo ""

# Проверяем существующие переменные
echo "📋 Проверка существующих переменных:"
if grep -q "CLOUDFLARE_WORKER_URL" .env 2>/dev/null || grep -q "CLOUDFLARE_WORKER_URL" .env.local 2>/dev/null; then
    echo "   ✅ Переменные найдены в .env или .env.local"
    CLOUDFLARE_WORKER_URL=$(grep "^CLOUDFLARE_WORKER_URL=" .env .env.local 2>/dev/null | head -1 | cut -d '=' -f2- | tr -d '"' | tr -d "'")
    CLOUDFLARE_WORKER_SECRET=$(grep "^CLOUDFLARE_WORKER_SECRET=" .env .env.local 2>/dev/null | head -1 | cut -d '=' -f2- | tr -d '"' | tr -d "'")
else
    echo "   ⚠️  Переменные не найдены в .env файлах"
    read -p "   Введите CLOUDFLARE_WORKER_URL: " CLOUDFLARE_WORKER_URL
    read -sp "   Введите CLOUDFLARE_WORKER_SECRET: " CLOUDFLARE_WORKER_SECRET
    echo ""
fi

# Создаем .env.production
echo ""
echo "📝 Создание .env.production файла..."
cat > .env.production << EOF
# Cloudflare Worker Proxy (for Replicate API access from blocked regions)
CLOUDFLARE_WORKER_URL=${CLOUDFLARE_WORKER_URL}
CLOUDFLARE_WORKER_SECRET=${CLOUDFLARE_WORKER_SECRET}
EOF

echo "   ✅ Файл .env.production создан"
echo ""

# Проверяем содержимое
echo "📄 Содержимое .env.production:"
cat .env.production | grep CLOUDFLARE
echo ""

# Проверяем PM2
if command -v pm2 &> /dev/null; then
    echo "🔄 Обновление PM2 процесса..."
    
    # Проверяем, запущен ли процесс verdia
    if pm2 list | grep -q "verdia"; then
        echo "   ✅ Процесс verdia найден в PM2"
        
        # Обновляем переменные окружения в PM2
        pm2 delete verdia 2>/dev/null || true
        
        echo "   ⚠️  Процесс verdia остановлен. Необходимо перезапустить вручную:"
        echo "      cd $PROJECT_DIR"
        echo "      pm2 start start.sh --name verdia"
        echo "      pm2 save"
    else
        echo "   ⚠️  Процесс verdia не найден в PM2"
    fi
else
    echo "   ⚠️  PM2 не установлен"
fi

echo ""
echo "✅ Настройка завершена!"
echo ""
echo "📝 Следующие шаги:"
echo "   1. Перезапустите приложение:"
echo "      pm2 restart verdia"
echo "      # или"
echo "      pm2 start start.sh --name verdia"
echo ""
echo "   2. Проверьте логи:"
echo "      pm2 logs verdia --lines 50"
echo ""
echo "   3. Проверьте переменные окружения:"
echo "      pm2 env verdia | grep CLOUDFLARE"
echo ""
