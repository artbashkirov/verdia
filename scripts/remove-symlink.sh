#!/bin/bash
# Скрипт для удаления символической ссылки .next
cd "$(dirname "$0")/.."

if [ -L ".next" ]; then
  echo "Удаляю символическую ссылку .next..."
  rm .next
  echo "Создаю обычную директорию .next..."
  mkdir -p .next
  echo "Готово! .next теперь в проекте"
else
  echo ".next не является символической ссылкой, ничего не делаю"
fi
