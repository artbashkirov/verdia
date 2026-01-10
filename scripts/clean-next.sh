#!/bin/bash
# Скрипт для полной очистки .next директории
cd "$(dirname "$0")/.."
rm -rf .next
rm -rf node_modules/.cache
echo "Кэш очищен"
