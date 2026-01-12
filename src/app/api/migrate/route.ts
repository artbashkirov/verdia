import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * API endpoint для выполнения миграции базы данных
 * Добавляет колонку documents в таблицу chat_messages
 * 
 * Использование: POST /api/migrate
 * Требует: SUPABASE_SERVICE_ROLE_KEY в переменных окружения
 */

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Не настроены переменные окружения Supabase' },
        { status: 500 }
      );
    }

    // Создаем клиент с service role key
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Проверяем, существует ли колонка
    const { error: testError } = await supabase
      .from('chat_messages')
      .select('documents')
      .limit(1);

    if (!testError) {
      return NextResponse.json({
        success: true,
        message: 'Колонка documents уже существует',
      });
    }

    if (!testError.message.includes('column "documents" does not exist')) {
      return NextResponse.json(
        { error: `Ошибка проверки: ${testError.message}` },
        { status: 500 }
      );
    }

    // К сожалению, Supabase JS client не поддерживает выполнение произвольного SQL
    // Нужно использовать Supabase Management API или выполнить через Dashboard
    
    // Пробуем через REST API напрямую
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

    // Пробуем выполнить через PostgREST (не сработает для DO блоков)
    // Или через прямой SQL запрос к PostgreSQL
    
    // Альтернатива: используем простой ALTER TABLE (без DO блока)
    // Но это не безопасно, если колонка уже существует в некоторых версиях PostgreSQL
    
    return NextResponse.json({
      success: false,
      message: 'Автоматическое выполнение миграции через API не поддерживается',
      instructions: {
        method: 'Supabase Dashboard',
        steps: [
          '1. Откройте https://supabase.com/dashboard',
          '2. Выберите ваш проект',
          '3. Перейдите в SQL Editor',
          '4. Выполните SQL из файла supabase/migration_add_documents_to_chat_messages.sql',
        ],
        sql: migrationSQL.trim(),
      },
    });

  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Неизвестная ошибка' },
      { status: 500 }
    );
  }
}
