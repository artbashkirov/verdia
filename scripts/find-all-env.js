#!/usr/bin/env node

/**
 * Скрипт для поиска всех .env файлов в проекте
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Поиск всех .env файлов в проекте\n');

const projectRoot = process.cwd();
console.log(`📁 Корень проекта: ${projectRoot}\n`);

// Проверяем различные возможные местоположения
const possibleLocations = [
  projectRoot,
  path.join(projectRoot, '..'),
  path.join(projectRoot, '../..'),
  path.join(require('os').homedir(), '.env.local'),
];

const envFiles = ['.env.local', '.env.development', '.env.production', '.env'];

possibleLocations.forEach(location => {
  console.log(`\n📂 Проверяю: ${location}`);
  
  envFiles.forEach(envFile => {
    const filePath = path.join(location, envFile);
    if (fs.existsSync(filePath)) {
      console.log(`   ✅ ${envFile} существует`);
      
      // Читаем содержимое
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      
      // Ищем CLOUDFLARE переменные
      const cloudflareLines = lines
        .map((line, index) => ({ line: index + 1, content: line }))
        .filter(item => /CLOUDFLARE/i.test(item.content));
      
      if (cloudflareLines.length > 0) {
        console.log(`      Найдены строки с CLOUDFLARE:`);
        cloudflareLines.forEach(item => {
          const isCommented = item.content.trim().startsWith('#');
          const marker = isCommented ? '⚠️ (закомментировано)' : '✅';
          console.log(`         ${marker} Строка ${item.line}: ${item.content.trim().substring(0, 80)}`);
        });
      } else {
        console.log(`      ❌ CLOUDFLARE переменные не найдены`);
      }
      
      // Размер файла
      const stats = fs.statSync(filePath);
      console.log(`      Размер: ${stats.size} байт`);
    }
  });
});

// Проверяем, какой файл будет использоваться Next.js
console.log('\n\n🎯 Какой файл будет использоваться Next.js?');
console.log(`   process.cwd(): ${process.cwd()}`);
console.log(`   __dirname: ${__dirname}`);
console.log(`   projectRoot: ${projectRoot}`);

const nextEnvLocal = path.join(projectRoot, '.env.local');
if (fs.existsSync(nextEnvLocal)) {
  console.log(`   ✅ Next.js будет использовать: ${nextEnvLocal}`);
  
  const content = fs.readFileSync(nextEnvLocal, 'utf8');
  console.log(`\n📄 Содержимое .env.local (первые 500 символов):`);
  console.log(content.substring(0, 500));
  console.log(`\n... (всего ${content.length} символов)`);
  
  // Показываем все строки с CLOUDFLARE
  const lines = content.split('\n');
  console.log(`\n🔍 Все строки с CLOUDFLARE:`);
  lines.forEach((line, index) => {
    if (/CLOUDFLARE/i.test(line)) {
      console.log(`   Строка ${index + 1}: ${line}`);
    }
  });
} else {
  console.log(`   ❌ .env.local не найден в корне проекта!`);
}
