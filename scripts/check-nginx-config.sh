#!/bin/bash
# Проверка конфигурации Nginx на VPS
# Выполните на VPS: bash scripts/check-nginx-config.sh

echo "=========================================="
echo "🔍 ПРОВЕРКА NGINX И ДОСТУПНОСТИ"
echo "=========================================="
echo ""

# 1. Проверка статуса Nginx
echo "1️⃣ Статус Nginx:"
systemctl status nginx --no-pager -l | head -15
echo ""

# 2. Проверка портов
echo "2️⃣ Проверка портов (80, 443, 3000):"
echo "   Порты, которые слушает Nginx:"
ss -tlnp | grep nginx
echo ""
echo "   Порт 3000 (Next.js app):"
ss -tlnp | grep ":3000"
echo ""

# 3. Конфигурация Nginx
echo "3️⃣ Конфигурация Nginx:"
echo "   Активные конфиги:"
ls -la /etc/nginx/sites-enabled/
echo ""

if [ -d /etc/nginx/sites-enabled ]; then
    echo "   Содержимое активных конфигов:"
    for config in /etc/nginx/sites-enabled/*; do
        if [ -f "$config" ]; then
            echo "   --- $(basename $config) ---"
            cat "$config"
            echo ""
        fi
    done
fi

# 4. Проверка теста конфигурации
echo "4️⃣ Проверка валидности конфигурации:"
nginx -t
echo ""

# 5. Проверка доступности локально
echo "5️⃣ Проверка доступности приложения локально:"
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 > /dev/null 2>&1; then
    echo "   ✅ localhost:3000 отвечает"
    echo "   HTTP статус: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000)"
else
    echo "   ❌ localhost:3000 НЕ отвечает"
fi
echo ""

# 6. Проверка доступности через Nginx
echo "6️⃣ Проверка доступности через Nginx (localhost:80):"
if curl -s -o /dev/null -w "%{http_code}" http://localhost:80 > /dev/null 2>&1; then
    echo "   ✅ localhost:80 отвечает"
    echo "   HTTP статус: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:80)"
else
    echo "   ❌ localhost:80 НЕ отвечает"
fi
echo ""

# 7. Проверка Firewall
echo "7️⃣ Проверка Firewall:"
if command -v ufw &> /dev/null; then
    echo "   UFW статус:"
    ufw status
elif command -v iptables &> /dev/null; then
    echo "   Iptables правила для портов 80, 443:"
    iptables -L -n | grep -E ":80|:443"
else
    echo "   ⚠️  Firewall не найден"
fi
echo ""

# 8. Проверка домена (если указан)
echo "8️⃣ Проверка внешнего доступа:"
EXTERNAL_IP=$(curl -s ifconfig.me || curl -s icanhazip.com || echo "не удалось определить")
echo "   Внешний IP сервера: $EXTERNAL_IP"
echo "   Ожидаемый IP: 193.227.240.206"
if [ "$EXTERNAL_IP" = "193.227.240.206" ]; then
    echo "   ✅ IP совпадает"
else
    echo "   ⚠️  IP не совпадает (возможно NAT)"
fi
echo ""

echo "=========================================="
echo "✅ Проверка завершена"
echo "=========================================="
echo ""
echo "💡 Что проверить дальше:"
echo "   1. Если порт 3000 не слушается - проверьте PM2: pm2 list"
echo "   2. Если Nginx не проксирует на 3000 - проверьте конфиг"
echo "   3. Если порты 80/443 закрыты - откройте в firewall"
echo "   4. Проверьте снаружи: curl -I http://ваш-домен.com"
