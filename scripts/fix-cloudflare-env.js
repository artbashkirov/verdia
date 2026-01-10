#!/usr/bin/env node

/**
 * Скрипт для исправления переменных Cloudflare Worker в .env.local
 * Запуск: node scripts/fix-cloudflare-env.js
 */

const fs = require('fs');
const path = require('path');

const envLocalPath = path.join(process.cwd(), '.env.local');

console.log('🔧 Исправление переменных Cloudflare Worker в .env.local\n');

if (!fs.existsSync(envLocalPath)) {
  console.error('❌ Файл .env.local не найден!');
  console.log('📝 Создаю новый файл...\n');
  fs.writeFileSync(envLocalPath, '');
}

// Читаем текущий файл
let content = fs.readFileSync(envLocalPath, 'utf8');
const lines = content.split('\n');

// Правильные значения
const correctUrl = 'https://verdia-replicate-proxy.artbashkirov.workers.dev';
const correctSecret = 'b4MXM42!';

let urlFound = false;
let secretFound = false;
let urlLineIndex = -1;
let secretLineIndex = -1;

// Ищем существующие строки
lines.forEach((line, index) => {
  const trimmed = line.trim();
  
  if (/^#?\s*CLOUDFLARE_WORKER_URL\s*[=:]/.test(trimmed)) {
    urlFound = true;
    urlLineIndex = index;
  }
  
  if (/^#?\s*CLOUDFLARE_WORKER_SECRET\s*[=:]/.test(trimmed)) {
    secretFound = true;
    secretLineIndex = index;
  }
});

// Исправляем или добавляем URL
if (urlFound && urlLineIndex >= 0) {
  const oldLine = lines[urlLineIndex];
  // Удаляем комментарии и пробелы, устанавливаем правильное значение
  lines[urlLineIndex] = `CLOUDFLARE_WORKER_URL=${correctUrl}`;
  console.log(`✅ Исправлен CLOUDFLARE_WORKER_URL`);
  console.log(`   Было: ${oldLine.trim()}`);
  console.log(`   Стало: CLOUDFLARE_WORKER_URL=${correctUrl}\n`);
} else {
  // Добавляем в конец файла
  lines.push(`CLOUDFLARE_WORKER_URL=${correctUrl}`);
  console.log(`✅ Добавлен CLOUDFLARE_WORKER_URL=${correctUrl}\n`);
}

// Исправляем или добавляем SECRET
if (secretFound && secretLineIndex >= 0) {
  const oldLine = lines[secretLineIndex];
  // Удаляем комментарии и пробелы, устанавливаем правильное значение
  lines[secretLineIndex] = `CLOUDFLARE_WORKER_SECRET=${correctSecret}`;
  console.log(`✅ Исправлен CLOUDFLARE_WORKER_SECRET`);
  console.log(`   Было: ${oldLine.trim()}`);
  console.log(`   Стало: CLOUDFLARE_WORKER_SECRET=${correctSecret.substring(0, 3)}***\n`);
} else {
  // Добавляем в конец файла
  lines.push(`CLOUDFLARE_WORKER_SECRET=${correctSecret}`);
  console.log(`✅ Добавлен CLOUDFLARE_WORKER_SECRET\n`);
}

// Сохраняем файл - объединяем все строки
const newContent = lines.join('\n') + (lines.length > 0 && !lines[lines.length - 1].endsWith('\n') ? '\n' : '');
fs.writeFileSync(envLocalPath, newContent);

console.log('✅ Файл .env.local обновлен!');
console.log('\n📝 Следующие шаги:');
console.log('   1. Убедитесь, что файл .env.local содержит правильные значения');
console.log('   2. Остановите dev-сервер (Ctrl+C)');
console.log('   3. Удалите кэш: rm -rf .next');
console.log('   4. Запустите dev-сервер заново: npm run dev');
console.log('   5. Проверьте: npm run check-cloudflare\n');
