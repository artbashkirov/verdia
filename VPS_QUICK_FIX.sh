#!/bin/bash
# Быстрое исправление переменных окружения на VPS
# Выполните на VPS: bash VPS_QUICK_FIX.sh

cd /opt/verdia-app

echo "🔧 Создание .env.production файла..."
cat > .env.production << 'EOF'
CLOUDFLARE_WORKER_URL=https://verdia-replicate-proxy.artbashkirov.workers.dev
CLOUDFLARE_WORKER_SECRET=b4MXM42!
EOF

echo "✅ Файл создан. Содержимое:"
cat .env.production

echo ""
echo "🔄 Перезапуск приложения..."
pm2 restart verdia
pm2 save

echo ""
echo "✅ Готово! Проверьте логи:"
echo "   pm2 logs verdia --lines 30"
