#!/bin/bash
# Скрипт для анализа найденных дел

VPS_URL="${VPS_SCRAPER_URL:-http://193.227.240.206:3001}"
API_KEY="${SCRAPER_API_KEY:-verdia_scraper_2026_secret_xyz789}"

SEARCH_TERMS="защита прав потребителей"

echo "🔍 Анализ запроса: 'Что делать, если интернет-магазин не доставил оплаченный товар?'"
echo "📝 Поисковый запрос: '$SEARCH_TERMS'"
echo "=" | awk '{printf "%80s\n", ""}' | tr ' ' '='
echo ""

curl -X POST "$VPS_URL/scrape/sudact" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d "{\"searchTerms\": \"$SEARCH_TERMS\", \"maxResults\": 10}" \
  2>/dev/null | jq '.' || echo "Ошибка: Не удалось получить данные или VPS scraper недоступен"
