#!/bin/bash
# Скрипт для настройки Nginx на VPS
# ВАЖНО: Замените YOUR_DOMAIN.com на ваш реальный домен перед выполнением!
# Выполните: bash scripts/setup-nginx.sh

set -e

DOMAIN="${1:-YOUR_DOMAIN.com}"
APP_PORT=3000

if [ "$DOMAIN" = "YOUR_DOMAIN.com" ]; then
    echo "❌ ОШИБКА: Не указан домен!"
    echo ""
    echo "Использование: bash scripts/setup-nginx.sh your-domain.com"
    echo "Пример: bash scripts/setup-nginx.sh verdia.ru"
    exit 1
fi

echo "=========================================="
echo "🔧 НАСТРОЙКА NGINX ДЛЯ $DOMAIN"
echo "=========================================="
echo ""

# 1. Установка Nginx
if ! command -v nginx &> /dev/null; then
    echo "1️⃣ Установка Nginx..."
    sudo apt update
    sudo apt install nginx -y
    echo "   ✅ Nginx установлен"
else
    echo "1️⃣ Nginx уже установлен"
    nginx -v
fi
echo ""

# 2. Создание конфигурации Nginx
echo "2️⃣ Создание конфигурации Nginx..."
NGINX_CONFIG="/etc/nginx/sites-available/$DOMAIN"

sudo tee "$NGINX_CONFIG" > /dev/null <<EOF
# HTTP сервер - перенаправляет на HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN www.$DOMAIN;

    # Для Let's Encrypt
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Перенаправление на HTTPS (после установки SSL)
    location / {
        return 301 https://\$host\$request_uri;
    }
}

# HTTPS сервер
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $DOMAIN www.$DOMAIN;

    # SSL сертификаты (будут установлены через Certbot)
    # ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    # ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;

    # Временный самоподписанный сертификат (для теста)
    # ssl_certificate /etc/nginx/ssl/self-signed.crt;
    # ssl_certificate_key /etc/nginx/ssl/self-signed.key;

    # Безопасность
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Gzip сжатие
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/javascript application/json;

    # Проксирование на Next.js приложение
    location / {
        proxy_pass http://localhost:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Таймауты для длительных запросов
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Статические файлы (если нужны)
    location /_next/static {
        proxy_pass http://localhost:$APP_PORT;
        proxy_cache_valid 200 60m;
        add_header Cache-Control "public, immutable";
    }
}
EOF

echo "   ✅ Конфигурация создана: $NGINX_CONFIG"
echo ""

# 3. Активация конфигурации
echo "3️⃣ Активация конфигурации..."
if [ ! -L "/etc/nginx/sites-enabled/$DOMAIN" ]; then
    sudo ln -s "$NGINX_CONFIG" "/etc/nginx/sites-enabled/$DOMAIN"
    echo "   ✅ Симлинк создан"
else
    echo "   ✅ Симлинк уже существует"
fi

# Удаление дефолтной конфигурации, если есть
if [ -L "/etc/nginx/sites-enabled/default" ]; then
    sudo rm /etc/nginx/sites-enabled/default
    echo "   ✅ Дефолтная конфигурация удалена"
fi
echo ""

# 4. Проверка конфигурации
echo "4️⃣ Проверка конфигурации Nginx..."
if sudo nginx -t; then
    echo "   ✅ Конфигурация валидна"
else
    echo "   ❌ Ошибки в конфигурации! Исправьте и повторите."
    exit 1
fi
echo ""

# 5. Настройка Firewall
echo "5️⃣ Настройка Firewall..."
if command -v ufw &> /dev/null; then
    echo "   Проверка UFW..."
    if sudo ufw status | grep -q "Status: active"; then
        echo "   ✅ UFW активен"
        sudo ufw allow 'Nginx Full'
        echo "   ✅ Правила для Nginx добавлены"
    else
        echo "   ⚠️  UFW неактивен, правила не изменены"
    fi
elif command -v iptables &> /dev/null; then
    echo "   Используется iptables, проверьте правила вручную"
    echo "   Убедитесь, что порты 80 и 443 открыты"
fi
echo ""

# 6. Запуск/перезапуск Nginx
echo "6️⃣ Запуск Nginx..."
sudo systemctl enable nginx
if sudo systemctl is-active --quiet nginx; then
    echo "   Nginx уже запущен, перезапускаем..."
    sudo systemctl reload nginx
else
    echo "   Запускаем Nginx..."
    sudo systemctl start nginx
fi

if sudo systemctl is-active --quiet nginx; then
    echo "   ✅ Nginx запущен и работает"
else
    echo "   ❌ Ошибка при запуске Nginx!"
    sudo systemctl status nginx
    exit 1
fi
echo ""

# 7. Инструкции по SSL
echo "=========================================="
echo "📋 СЛЕДУЮЩИЕ ШАГИ"
echo "=========================================="
echo ""
echo "✅ Nginx настроен и работает"
echo ""
echo "⚠️  ВАЖНО: Сейчас настроен только HTTP (порт 80)"
echo "   Для включения HTTPS выполните следующие шаги:"
echo ""
echo "1. Установите Certbot:"
echo "   sudo apt install certbot python3-certbot-nginx -y"
echo ""
echo "2. Получите SSL сертификат:"
echo "   sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN"
echo ""
echo "3. Certbot автоматически:"
echo "   - Получит сертификат Let's Encrypt"
echo "   - Настроит HTTPS"
echo "   - Включит автоматическое обновление сертификата"
echo ""
echo "4. Проверьте работу сайта:"
echo "   curl -I http://$DOMAIN"
echo "   curl -I https://$DOMAIN  # после установки SSL"
echo ""
echo "=========================================="
echo "✅ Настройка Nginx завершена"
echo "=========================================="
