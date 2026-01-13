#!/bin/bash
# Полная диагностика VPS для выявления проблем с доступностью
# Выполните на VPS: bash scripts/vps-full-diagnostics.sh

echo "=========================================="
echo "🔍 ПОЛНАЯ ДИАГНОСТИКА VPS"
echo "=========================================="
echo ""

# 1. Проверка статуса PM2 приложений
echo "1️⃣ Статус PM2 процессов:"
pm2 list
echo ""

# 2. Проверка портов
echo "2️⃣ Проверка открытых портов:"
echo "   Порты, которые слушает Node.js:"
ss -tlnp | grep node || echo "   ⚠️  Node.js процессы не слушают порты"
echo ""
echo "   Проверка портов 80, 443, 3000, 3001:"
for port in 80 443 3000 3001; do
    if ss -tlnp | grep -q ":$port "; then
        echo "   ✅ Порт $port открыт и слушается"
        ss -tlnp | grep ":$port "
    else
        echo "   ❌ Порт $port НЕ открыт или не слушается"
    fi
done
echo ""

# 3. Проверка Nginx
echo "3️⃣ Проверка Nginx:"
if command -v nginx &> /dev/null; then
    echo "   ✅ Nginx установлен"
    nginx -v
    echo ""
    echo "   Статус сервиса:"
    systemctl status nginx --no-pager -l | head -10
    echo ""
    echo "   Проверка конфигурации:"
    if nginx -t 2>&1; then
        echo "   ✅ Конфигурация Nginx валидна"
    else
        echo "   ❌ Ошибки в конфигурации Nginx"
    fi
    echo ""
    if [ -d /etc/nginx/sites-enabled ]; then
        echo "   Найденные конфиги сайтов:"
        ls -la /etc/nginx/sites-enabled/
    fi
else
    echo "   ❌ Nginx НЕ установлен"
fi
echo ""

# 4. Проверка Firewall
echo "4️⃣ Проверка Firewall (iptables/ufw):"
if command -v ufw &> /dev/null; then
    echo "   UFW статус:"
    ufw status
elif command -v iptables &> /dev/null; then
    echo "   Iptables правила:"
    iptables -L -n | head -20
else
    echo "   ⚠️  Firewall не найден (может быть отключен)"
fi
echo ""

# 5. Проверка приложения
echo "5️⃣ Проверка приложения verdia:"
if pm2 list | grep -q verdia; then
    echo "   ✅ Процесс verdia запущен"
    echo ""
    echo "   Последние логи (последние 30 строк):"
    pm2 logs verdia --lines 30 --nostream | tail -30
    echo ""
    echo "   Проверка переменных окружения:"
    pm2 describe verdia | grep -A 30 "env:" | head -35
else
    echo "   ❌ Процесс verdia НЕ запущен"
fi
echo ""

# 6. Проверка доступности локально
echo "6️⃣ Проверка доступности приложения локально:"
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 > /dev/null 2>&1; then
    echo "   ✅ Приложение отвечает на localhost:3000"
    echo "   HTTP статус: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000)"
else
    echo "   ❌ Приложение НЕ отвечает на localhost:3000"
fi
echo ""

# 7. Проверка внешнего IP
echo "7️⃣ Внешний IP сервера:"
EXTERNAL_IP=$(curl -s ifconfig.me || curl -s icanhazip.com || echo "не удалось определить")
echo "   IP: $EXTERNAL_IP"
echo "   Ожидаемый IP: 193.227.240.206"
if [ "$EXTERNAL_IP" = "193.227.240.206" ]; then
    echo "   ✅ IP совпадает"
else
    echo "   ⚠️  IP не совпадает (возможно, используется NAT)"
fi
echo ""

# 8. Проверка SSL сертификатов
echo "8️⃣ Проверка SSL сертификатов:"
if [ -d /etc/letsencrypt/live ]; then
    echo "   ✅ Найдены сертификаты Let's Encrypt:"
    ls -la /etc/letsencrypt/live/
else
    echo "   ❌ SSL сертификаты не найдены"
fi
echo ""

# 9. Проверка директории приложения
echo "9️⃣ Проверка директории приложения:"
if [ -d /opt/verdia-app ]; then
    echo "   ✅ Директория /opt/verdia-app существует"
    echo "   Содержимое:"
    ls -la /opt/verdia-app | head -15
    echo ""
    if [ -f /opt/verdia-app/package.json ]; then
        echo "   ✅ package.json найден"
    else
        echo "   ❌ package.json не найден"
    fi
    if [ -f /opt/verdia-app/.env.production ]; then
        echo "   ✅ .env.production найден"
    else
        echo "   ⚠️  .env.production не найден"
    fi
else
    echo "   ❌ Директория /opt/verdia-app не существует"
fi
echo ""

# 10. Рекомендации
echo "=========================================="
echo "📋 РЕКОМЕНДАЦИИ"
echo "=========================================="
echo ""

if ! command -v nginx &> /dev/null; then
    echo "❌ НУЖНО: Установить и настроить Nginx"
    echo "   Выполните: sudo apt update && sudo apt install nginx -y"
    echo ""
fi

if ! pm2 list | grep -q verdia; then
    echo "❌ НУЖНО: Запустить приложение verdia через PM2"
    echo "   Выполните: cd /opt/verdia-app && pm2 start ecosystem.config.js"
    echo ""
fi

if ! ss -tlnp | grep -q ":80 "; then
    echo "⚠️  Порт 80 не слушается — Nginx не работает или не запущен"
    echo ""
fi

if ! ss -tlnp | grep -q ":443 "; then
    echo "⚠️  Порт 443 не слушается — HTTPS не настроен"
    echo ""
fi

if [ ! -d /etc/letsencrypt/live ]; then
    echo "⚠️  SSL сертификаты не установлены"
    echo "   После настройки Nginx выполните: sudo certbot --nginx"
    echo ""
fi

echo "=========================================="
echo "✅ Диагностика завершена"
echo "=========================================="
