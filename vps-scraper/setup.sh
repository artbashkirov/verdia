#!/bin/bash

# ===========================================
# Verdia Scraper VPS Setup Script
# Run as root on fresh Ubuntu 22.04
# ===========================================

echo "🚀 Starting Verdia Scraper setup..."

# Update system
apt update && apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install Puppeteer dependencies
apt install -y \
  libnss3 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  libgbm1 \
  libasound2 \
  libpangocairo-1.0-0 \
  libgtk-3-0 \
  fonts-liberation

# Create app directory
mkdir -p /opt/verdia-scraper
cd /opt/verdia-scraper

# Copy files (you need to upload them first)
echo "📁 Please upload package.json and server.js to /opt/verdia-scraper/"
echo "Then run: npm install && npm start"

# Create systemd service
cat > /etc/systemd/system/verdia-scraper.service << 'EOF'
[Unit]
Description=Verdia Court Scraper API
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/verdia-scraper
Environment=PORT=3001
Environment=SCRAPER_API_KEY=CHANGE_THIS_TO_RANDOM_STRING
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Setup firewall
ufw allow 22
ufw allow 3001
ufw --force enable

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Upload package.json and server.js to /opt/verdia-scraper/"
echo "2. cd /opt/verdia-scraper && npm install"
echo "3. Edit /etc/systemd/system/verdia-scraper.service and set SCRAPER_API_KEY"
echo "4. systemctl daemon-reload"
echo "5. systemctl enable verdia-scraper"
echo "6. systemctl start verdia-scraper"
echo ""
echo "Check status: systemctl status verdia-scraper"
echo "View logs: journalctl -u verdia-scraper -f"
