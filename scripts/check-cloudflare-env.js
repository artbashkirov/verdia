#!/usr/bin/env node

/**
 * Скрипт для проверки переменных окружения Cloudflare Worker
 * Запуск: node scripts/check-cloudflare-env.js
 */

const path = require('path');
const fs = require('fs');

console.log('🔍 Проверка переменных окружения Cloudflare Worker\n');

// Проверка переменных в runtime
const workerUrl = process.env.CLOUDFLARE_WORKER_URL;
const workerSecret = process.env.CLOUDFLARE_WORKER_SECRET;

console.log('📋 Переменные окружения в runtime:');
console.log(`   CLOUDFLARE_WORKER_URL: ${workerUrl ? '✅ установлен' : '❌ не установлен'}`);
if (workerUrl) {
  console.log(`      Значение: ${workerUrl.substring(0, 50)}...`);
}
console.log(`   CLOUDFLARE_WORKER_SECRET: ${workerSecret ? '✅ установлен' : '❌ не установлен'}`);
if (workerSecret) {
  console.log(`      Длина: ${workerSecret.length} символов`);
}

console.log('\n📁 Проверка .env файлов:');

const envFiles = ['.env.local', '.env.production', '.env'];
envFiles.forEach(envFile => {
  const envPath = path.join(process.cwd(), envFile);
  if (fs.existsSync(envPath)) {
    console.log(`   ${envFile}: ✅ существует`);
    const content = fs.readFileSync(envPath, 'utf8');
    
    // Более гибкая проверка - ищем с пробелами, в разных регистрах, закомментированные
    const lines = content.split('\n');
    let workerUrlLine = null;
    let workerSecretLine = null;
    
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      // Проверяем разные варианты формата
      if (/^#?\s*CLOUDFLARE_WORKER_URL\s*[=:]/.test(trimmed)) {
        workerUrlLine = { line: index + 1, content: trimmed.substring(0, 60) + '...' };
      }
      if (/^#?\s*CLOUDFLARE_WORKER_SECRET\s*[=:]/.test(trimmed)) {
        workerSecretLine = { line: index + 1, content: trimmed.substring(0, 30) + '...' };
      }
    });
    
    if (workerUrlLine) {
      const isCommented = workerUrlLine.content.trim().startsWith('#');
      console.log(`      CLOUDFLARE_WORKER_URL: ${isCommented ? '⚠️ закомментирован' : '✅'} (строка ${workerUrlLine.line})`);
      if (isCommented) {
        console.log(`         ${workerUrlLine.content}`);
      }
    } else {
      console.log(`      CLOUDFLARE_WORKER_URL: ❌ не найден`);
    }
    
    if (workerSecretLine) {
      const isCommented = workerSecretLine.content.trim().startsWith('#');
      console.log(`      CLOUDFLARE_WORKER_SECRET: ${isCommented ? '⚠️ закомментирован' : '✅'} (строка ${workerSecretLine.line})`);
      if (isCommented) {
        console.log(`         ${workerSecretLine.content}`);
      }
    } else {
      console.log(`      CLOUDFLARE_WORKER_SECRET: ❌ не найден`);
      // Показываем все строки с CLOUDFLARE для отладки
      const cloudflareLines = lines
        .map((line, index) => ({ line: index + 1, content: line }))
        .filter(item => /CLOUDFLARE/i.test(item.content));
      if (cloudflareLines.length > 0) {
        console.log(`         Найдены строки с CLOUDFLARE:`);
        cloudflareLines.forEach(item => {
          console.log(`            Строка ${item.line}: ${item.content.trim().substring(0, 70)}`);
        });
      }
    }
  } else {
    console.log(`   ${envFile}: ❌ не найден`);
  }
});

console.log('\n🌐 Окружение:');
console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'не установлен'}`);
console.log(`   VERCEL: ${process.env.VERCEL ? '✅' : '❌'}`);

// Итоговый результат
console.log('\n' + '='.repeat(60));
if (workerUrl && workerSecret) {
  console.log('✅ Все переменные окружения установлены правильно!');
  console.log('   Приложение должно работать.');
} else {
  console.log('❌ Проблема: переменные окружения не установлены!');
  console.log('\n📝 Что делать:');
  console.log('   1. Для локальной разработки:');
  console.log('      - Добавьте переменные в .env.local');
  console.log('      - Перезапустите dev-сервер: npm run dev');
  console.log('\n   2. Для production на VPS:');
  console.log('      - Если используете pm2: добавьте в ecosystem.config.js');
  console.log('      - Если используете systemd: добавьте в .service файл');
  console.log('      - Или создайте .env.production файл');
  console.log('      - Перезапустите приложение после изменений');
}
console.log('='.repeat(60) + '\n');
