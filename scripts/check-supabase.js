/**
 * Скрипт для проверки подключения к Supabase
 * Запустите: node scripts/check-supabase.js
 */

const https = require('https');

// Читаем переменные окружения из .env.local
const fs = require('fs');
const path = require('path');

const envPath = path.join(process.cwd(), '.env.local');

if (!fs.existsSync(envPath)) {
  console.error('❌ Файл .env.local не найден!');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};

envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=:#]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    const value = match[2].trim().replace(/^["']|["']$/g, '');
    envVars[key] = value;
  }
});

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log('🔍 Проверка конфигурации Supabase...\n');

if (!supabaseUrl) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL не найден в .env.local');
  process.exit(1);
}

if (!supabaseKey) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_ANON_KEY не найден в .env.local');
  process.exit(1);
}

console.log('📋 URL:', supabaseUrl);
console.log('🔑 Anon Key:', supabaseKey.substring(0, 20) + '...');
console.log('\n🔌 Проверка доступности сервера...\n');

const url = new URL(supabaseUrl);
const options = {
  hostname: url.hostname,
  port: 443,
  path: '/rest/v1/',
  method: 'GET',
  headers: {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`
  },
  timeout: 5000
};

const req = https.request(options, (res) => {
  console.log(`✅ Статус ответа: ${res.statusCode}`);
  
  if (res.statusCode === 200 || res.statusCode === 404) {
    console.log('✅ Сервер Supabase доступен!');
    console.log('\n💡 Убедитесь, что в настройках Supabase добавлен redirect URL:');
    console.log('   http://127.0.0.1:3000/auth/callback');
    console.log('\n   Путь: Authentication → URL Configuration → Redirect URLs');
  } else {
    console.log(`⚠️  Неожиданный статус: ${res.statusCode}`);
  }
  
  process.exit(0);
});

req.on('error', (error) => {
  console.error('❌ Ошибка подключения:', error.message);
  
  if (error.code === 'ENOTFOUND') {
    console.error('\n💡 URL Supabase неверный или проект был удален.');
    console.error('   Проверьте правильность URL в панели Supabase:');
    console.error('   https://supabase.com/dashboard → Settings → API');
  } else if (error.code === 'ECONNREFUSED') {
    console.error('\n💡 Не удалось подключиться к серверу.');
  }
  
  process.exit(1);
});

req.on('timeout', () => {
  console.error('❌ Таймаут подключения');
  req.destroy();
  process.exit(1);
});

req.end();









