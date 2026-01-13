#!/usr/bin/env node

/**
 * Упрощенный скрипт для выполнения миграции через Supabase Management API
 * Использует прямой SQL запрос через REST API
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from 'dotenv';

// Загружаем .env.local
config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env.local') });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Ошибка: Необходимы переменные окружения:');
  console.error('   - NEXT_PUBLIC_SUPABASE_URL');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY');
  console.error('\n💡 Получите Service Role Key в Supabase Dashboard:');
  console.error('   Settings → API → service_role key');
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
    // Проверяем, существует ли колонка
    console.log('🔍 Проверяю наличие колонки documents...');
    
    const { data: existingColumn, error: checkError } = await supabase
      .rpc('exec_sql', {
        query: `
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = 'chat_messages' 
          AND column_name = 'documents';
        `
      });

    // Альтернативный способ: проверяем через прямой запрос к таблице
    try {
      const { error: testError } = await supabase
        .from('chat_messages')
        .select('documents')
        .limit(1);

      if (!testError) {
        console.log('✅ Колонка documents уже существует!');
        return;
      }
    } catch (e) {
      // Колонки нет, нужно добавить
    }

    console.log('➕ Добавляю колонку documents...');

    // Выполняем миграцию через прямой SQL
    // Используем Supabase REST API для выполнения SQL
    const migrationSQL = `
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = 'chat_messages' 
          AND column_name = 'documents'
        ) THEN
          ALTER TABLE public.chat_messages 
          ADD COLUMN documents JSONB DEFAULT '[]'::jsonb;
          
          UPDATE public.chat_messages 
          SET documents = '[]'::jsonb 
          WHERE documents IS NULL;
        END IF;
      END $$;
    `;

    // Пробуем выполнить через REST API
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ sql: migrationSQL }),
    });

    if (response.ok || response.status === 204) {
      console.log('✅ Миграция выполнена успешно!');
    } else {
      const errorText = await response.text();
      console.error('❌ Ошибка при выполнении миграции через REST API');
      console.error(`   Статус: ${response.status}`);
      console.error(`   Ответ: ${errorText}`);
      
      // Пробуем альтернативный способ - через Supabase client
      console.log('\n🔄 Пробую альтернативный способ...');
      
      // Просто добавляем колонку через ALTER TABLE (без DO блока)
      const simpleSQL = `ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS documents JSONB DEFAULT '[]'::jsonb;`;
      
      // К сожалению, Supabase JS client не поддерживает прямой SQL
      // Нужно использовать Supabase CLI или Dashboard
      console.log('\n💡 Автоматическое выполнение не удалось.');
      console.log('   Выполните миграцию вручную:');
      console.log('   1. Откройте Supabase Dashboard → SQL Editor');
      console.log('   2. Выполните SQL из файла: supabase/migration_add_documents_to_chat_messages.sql');
      process.exit(1);
    }

    // Проверяем результат
    const { error: verifyError } = await supabase
      .from('chat_messages')
      .select('documents')
      .limit(1);

    if (verifyError && verifyError.message.includes('column "documents" does not exist')) {
      console.error('❌ Колонка не была добавлена');
      process.exit(1);
    }

    console.log('✅ Проверка пройдена!');
    console.log('\n✨ Готово! Документы теперь будут сохраняться в базе данных.');

  } catch (error) {
    console.error('\n❌ Ошибка:', error.message);
    console.error('\n💡 Выполните миграцию вручную через Supabase Dashboard:');
    console.error('   1. Откройте Supabase Dashboard → SQL Editor');
    console.error('   2. Выполните SQL из файла: supabase/migration_add_documents_to_chat_messages.sql');
    process.exit(1);
  }
}

runMigration();
