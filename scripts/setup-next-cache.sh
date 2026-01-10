#!/bin/bash
# Скрипт для создания символической ссылки .next вне iCloud
cd "$(dirname "$0")/.."

CACHE_DIR="$HOME/.verdia-next-cache/$(basename "$PWD")"

# Создаем директорию для кэша вне iCloud
mkdir -p "$CACHE_DIR"

# Удаляем старую .next если это не символическая ссылка
if [ -d ".next" ] && [ ! -L ".next" ]; then
  echo "Удаляем старую .next директорию..."
  rm -rf .next
fi

# Создаем символическую ссылку
if [ ! -L ".next" ]; then
  echo "Создаем символическую ссылку для .next в $CACHE_DIR"
  ln -s "$CACHE_DIR" .next
fi

echo "Готово! .next теперь находится вне iCloud"
