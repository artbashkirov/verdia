#!/bin/bash
# Скрипт для исправления зависимостей
cd "$(dirname "$0")/.."

echo "Проверяю установку @tailwindcss/postcss..."

if [ ! -d "node_modules/@tailwindcss/postcss" ]; then
  echo "Пакет @tailwindcss/postcss не найден. Устанавливаю зависимости..."
  npm install
else
  echo "Пакет найден. Проверяю версию..."
  ls -la node_modules/@tailwindcss/postcss | head -3
fi

echo "Готово!"
