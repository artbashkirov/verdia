#!/usr/bin/env node

/**
 * Скрипт для настройки .env.local файла
 * Запустите: node scripts/setup-env.js
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function setupEnv() {
  console.log('🔧 Настройка .env.local файла\n');
  console.log('Для получения Supabase credentials:');
  console.log('1. Перейдите на https://supabase.com/dashboard');
  console.log('2. Выберите ваш проект');
  console.log('3. Settings → API');
  console.log('4. Скопируйте Project URL и anon/public key\n');

  const envPath = path.join(process.cwd(), '.env.local');
  let envContent = '';

  // Проверяем существующий файл
  if (fs.existsSync(envPath)) {
    const existing = fs.readFileSync(envPath, 'utf8');
    console.log('📄 Найден существующий .env.local файл\n');
    
    // Пытаемся извлечь существующие значения
    const urlMatch = existing.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/);
    const keyMatch = existing.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/);
    
    if (urlMatch && !urlMatch[1].includes('placeholder')) {
      console.log(`Текущий URL: ${urlMatch[1]}`);
      const useExisting = await question('Использовать существующий URL? (y/n): ');
      if (useExisting.toLowerCase() === 'y') {
        envContent += `NEXT_PUBLIC_SUPABASE_URL=${urlMatch[1]}\n`;
      }
    }
  }

  // Запрашиваем Supabase URL
  if (!envContent.includes('NEXT_PUBLIC_SUPABASE_URL')) {
    const supabaseUrl = await question('Введите NEXT_PUBLIC_SUPABASE_URL (https://xxxxx.supabase.co): ');
    if (supabaseUrl.trim()) {
      envContent += `NEXT_PUBLIC_SUPABASE_URL=${supabaseUrl.trim()}\n`;
    }
  }

  // Запрашиваем Supabase Anon Key
  const supabaseKey = await question('Введите NEXT_PUBLIC_SUPABASE_ANON_KEY: ');
  if (supabaseKey.trim()) {
    envContent += `NEXT_PUBLIC_SUPABASE_ANON_KEY=${supabaseKey.trim()}\n`;
  }

  // Запрашиваем OpenAI Key (опционально)
  const openaiKey = await question('Введите OPENAI_API_KEY (опционально, нажмите Enter чтобы пропустить): ');
  if (openaiKey.trim()) {
    envContent += `OPENAI_API_KEY=${openaiKey.trim()}\n`;
  }

  // Записываем файл
  const fullContent = `# Supabase Configuration
# Generated automatically by setup script
${envContent}
`;

  fs.writeFileSync(envPath, fullContent);
  console.log('\n✅ Файл .env.local успешно создан!');
  console.log('\n⚠️  Важно:');
  console.log('1. Перезапустите dev сервер (Ctrl+C и затем npm run dev)');
  console.log('2. Убедитесь, что в Supabase Dashboard добавлен redirect URL:');
  console.log('   http://localhost:3000/auth/callback');
  console.log('   Путь: Authentication → URL Configuration → Redirect URLs\n');

  rl.close();
}

setupEnv().catch(err => {
  console.error('Ошибка:', err);
  rl.close();
  process.exit(1);
});

