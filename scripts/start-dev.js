#!/usr/bin/env node
// Скрипт для запуска Next.js dev сервера с обходом проблем Turbopack в iCloud
const { spawn } = require('child_process');
const path = require('path');

// Устанавливаем переменную окружения для отключения Turbopack (если поддерживается)
process.env.TURBOPACK = '0';

// Запускаем next dev
const nextDev = spawn('npx', ['next', 'dev', '-H', 'localhost', '-p', '3000'], {
  stdio: 'inherit',
  shell: true,
  cwd: path.resolve(__dirname, '..'),
});

nextDev.on('error', (err) => {
  console.error('Failed to start Next.js:', err);
  process.exit(1);
});

nextDev.on('exit', (code) => {
  process.exit(code);
});
