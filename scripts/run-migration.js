#!/usr/bin/env node

/**
 * Скрипт для выполнения миграции базы данных Supabase
 * Добавляет колонку documents в таблицу chat_messages
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем переменные окружения
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.error('❌ Ошибка: NEXT_PUBLIC_SUPABASE_URL не установлен в .env.local');
  process.exit(1);
}

if (!supabaseServiceKey) {
  console.error('❌ Ошибка: SUPABASE_SERVICE_ROLE_KEY не установлен в .env.local');
  console.error('   Нужен Service Role Key для выполнения миграции');
  console.error('   Получите его в Supabase Dashboard → Settings → API → service_role key');
  process.exit(1);
}

// Создаем клиент с service role key (имеет полные права)
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function runMigration() {
  console.log('🚀 Запуск миграции...\n');

  try {
    // Читаем SQL из файла миграции
    const migrationPath = join(__dirname, '..', 'supabase', 'migration_add_documents_to_chat_messages.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    console.log('📄 Выполняю SQL миграцию...');
    console.log('─'.repeat(50));

    // Выполняем SQL через Supabase RPC или напрямую
    // Используем rpc для выполнения DO блока
    const { data, error } = await supabase.rpc('exec_sql', { sql: migrationSQL });

    if (error) {
      // Если RPC не работает, пробуем через прямой SQL запрос
      console.log('⚠️  RPC метод не доступен, пробуем альтернативный способ...');
      
      // Альтернативный способ: проверяем наличие колонки и добавляем если нужно
      const { data: columns, error: checkError } = await supabase
        .from('information_schema.columns')
        .select('column_name')
        .eq('table_schema', 'public')
        .eq('table_name', 'chat_messages')
        .eq('column_name', 'documents');

      if (checkError) {
        // Если и это не работает, используем прямой SQL через REST API
        console.log('📝 Выполняю миграцию через REST API...');
        
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseServiceKey,
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({ sql: migrationSQL }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
      } else {
        // Колонка уже существует или нужно добавить
        if (columns && columns.length > 0) {
          console.log('✅ Колонка documents уже существует');
        } else {
          console.log('➕ Добавляю колонку documents...');
          
          // Добавляем колонку напрямую
          const { error: alterError } = await supabase.rpc('exec_sql', {
            sql: `ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS documents JSONB DEFAULT '[]'::jsonb;`
          });

          if (alterError) {
            throw alterError;
          }

          // Обновляем существующие записи
          const { error: updateError } = await supabase
            .from('chat_messages')
            .update({ documents: [] })
            .is('documents', null);

          if (updateError) {
            console.warn('⚠️  Предупреждение при обновлении существующих записей:', updateError.message);
          }
        }
      }
    }

    // Проверяем результат
    const { data: verifyData, error: verifyError } = await supabase
      .from('chat_messages')
      .select('documents')
      .limit(1);

    if (verifyError) {
      // Если не можем проверить через таблицу, проверяем через information_schema
      const { data: columnCheck } = await supabase
        .from('information_schema.columns')
        .select('column_name, data_type')
        .eq('table_schema', 'public')
        .eq('table_name', 'chat_messages')
        .eq('column_name', 'documents')
        .single();

      if (columnCheck) {
        console.log('✅ Миграция выполнена успешно!');
        console.log(`   Колонка: ${columnCheck.column_name}, Тип: ${columnCheck.data_type}`);
      } else {
        throw new Error('Колонка documents не найдена после миграции');
      }
    } else {
      console.log('✅ Миграция выполнена успешно!');
      console.log('   Колонка documents добавлена в таблицу chat_messages');
    }

    console.log('─'.repeat(50));
    console.log('✨ Готово! Документы теперь будут сохраняться в базе данных.');
    console.log('   Перезагрузите страницу и проверьте, что документы не теряются.');

  } catch (error) {
    console.error('\n❌ Ошибка при выполнении миграции:');
    console.error(error.message);
    console.error('\n💡 Попробуйте выполнить миграцию вручную через Supabase Dashboard:');
    console.error('   1. Откройте Supabase Dashboard → SQL Editor');
    console.error('   2. Выполните содержимое файла supabase/migration_add_documents_to_chat_messages.sql');
    process.exit(1);
  }
}

// Запускаем миграцию
runMigration();
