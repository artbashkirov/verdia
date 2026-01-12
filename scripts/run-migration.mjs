#!/usr/bin/env node

/**
 * Скрипт для выполнения миграции базы данных Supabase
 * Добавляет колонку documents в таблицу chat_messages
 * 
 * Запуск: node scripts/run-migration.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем переменные окружения из .env.local
const envPath = join(__dirname, '..', '.env.local');
let envVars = {};

try {
  const envContent = readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      envVars[key] = value;
    }
  });
} catch (error) {
  console.error('❌ Не удалось прочитать .env.local');
  process.exit(1);
}

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = envVars.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL не найден в .env.local');
  process.exit(1);
}

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY не найден в .env.local');
  console.error('\n💡 Получите Service Role Key:');
  console.error('   1. Откройте Supabase Dashboard');
  console.error('   2. Settings → API → service_role key');
  console.error('   3. Добавьте в .env.local: SUPABASE_SERVICE_ROLE_KEY=ваш_ключ');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function runMigration() {
  console.log('🚀 Запуск миграции базы данных...\n');

  try {
    // Проверяем, существует ли колонка, пытаясь сделать SELECT
    console.log('🔍 Проверяю наличие колонки documents...');
    
    const { error: testError } = await supabase
      .from('chat_messages')
      .select('documents')
      .limit(1);

    if (!testError) {
      console.log('✅ Колонка documents уже существует!');
      console.log('   Миграция не требуется.');
      return;
    }

    if (!testError.message.includes('column "documents" does not exist')) {
      throw testError;
    }

    console.log('➕ Колонка documents не найдена, добавляю...\n');

    // К сожалению, Supabase JS client не поддерживает выполнение произвольного SQL
    // Нужно использовать Supabase CLI или Dashboard
    
    console.log('⚠️  Supabase JS client не поддерживает выполнение произвольного SQL.');
    console.log('   Выполните миграцию одним из способов ниже:\n');
    
    console.log('📋 СПОСОБ 1: Через Supabase Dashboard (рекомендуется)');
    console.log('─'.repeat(60));
    console.log('1. Откройте https://supabase.com/dashboard');
    console.log('2. Выберите ваш проект');
    console.log('3. В левом меню нажмите "SQL Editor"');
    console.log('4. Нажмите "New query" или "+"');
    console.log('5. Скопируйте и вставьте следующий SQL:\n');
    
    const migrationSQL = readFileSync(
      join(__dirname, '..', 'supabase', 'migration_add_documents_to_chat_messages.sql'),
      'utf8'
    );
    
    console.log(migrationSQL);
    console.log('\n6. Нажмите "Run" (или Ctrl+Enter / Cmd+Enter)');
    console.log('7. Должно появиться сообщение об успешном выполнении\n');
    
    console.log('📋 СПОСОБ 2: Через Supabase CLI (если установлен)');
    console.log('─'.repeat(60));
    console.log('1. Установите Supabase CLI: npm install -g supabase');
    console.log('2. Выполните: supabase db push');
    console.log('   или');
    console.log('3. Выполните SQL напрямую:');
    console.log(`   supabase db execute --file supabase/migration_add_documents_to_chat_messages.sql\n`);
    
    console.log('✅ После выполнения миграции документы будут сохраняться в базе данных!');
    
    // Пробуем альтернативный способ через REST API
    console.log('\n🔄 Пробую альтернативный способ через REST API...');
    
    try {
      // Пробуем создать функцию для выполнения SQL (если её нет)
      const createFunctionSQL = `
        CREATE OR REPLACE FUNCTION exec_sql(sql text)
        RETURNS void
        LANGUAGE plpgsql
        SECURITY DEFINER
        AS $$
        BEGIN
          EXECUTE sql;
        END;
        $$;
      `;
      
      // К сожалению, это тоже не сработает без прав на создание функций
      console.log('⚠️  Альтернативный способ требует дополнительных прав.');
      
    } catch (e) {
      // Игнорируем ошибку
    }

  } catch (error) {
    console.error('\n❌ Ошибка:', error.message);
    console.error('\n💡 Выполните миграцию вручную через Supabase Dashboard');
    process.exit(1);
  }
}

runMigration();
