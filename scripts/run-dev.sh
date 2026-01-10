#!/bin/bash
# Скрипт для запуска dev-сервера без Turbopack
export TURBOPACK=0
exec next dev -H localhost -p 3000 "$@"
