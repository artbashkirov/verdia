# Инструкция по миграции базы данных

## Проблема
Документы формируются, но теряются после перезагрузки страницы, потому что они не сохраняются в базе данных.

## Решение
Нужно добавить колонку `documents` в таблицу `chat_messages`.

## Как выполнить миграцию

### Вариант 1: Через Supabase Dashboard (рекомендуется)

1. Откройте [Supabase Dashboard](https://supabase.com/dashboard)
2. Выберите ваш проект
3. В левом меню нажмите **"SQL Editor"**
4. Нажмите **"New query"** или **"+"**
5. Скопируйте и вставьте следующий SQL-код:

```sql
-- Migration: Add documents column to chat_messages table
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
    
    -- Update existing rows to have empty array
    UPDATE public.chat_messages 
    SET documents = '[]'::jsonb 
    WHERE documents IS NULL;
  END IF;
END $$;
```

6. Нажмите **"Run"** (или `Ctrl+Enter` / `Cmd+Enter`)
7. Должно появиться сообщение об успешном выполнении

### Вариант 2: Через файл миграции

Или выполните содержимое файла `supabase/migration_add_documents_to_chat_messages.sql` в SQL Editor.

## Проверка

После выполнения миграции проверьте:

1. В Supabase Dashboard откройте **"Table Editor"**
2. Выберите таблицу `chat_messages`
3. Убедитесь, что появилась колонка `documents` типа `jsonb`

Или выполните в SQL Editor:

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'chat_messages' 
AND column_name = 'documents';
```

Если колонка есть, вы увидите одну строку с данными о колонке.

## Что изменилось в коде

1. ✅ Документы теперь сохраняются в базе данных при создании
2. ✅ Документы загружаются из базы данных при перезагрузке страницы
3. ✅ Добавлена нормализация документов для корректной обработки
4. ✅ Добавлено логирование для отладки

## Важно

- Миграция безопасна: она проверяет наличие колонки перед добавлением
- Если колонка уже есть, ничего не изменится
- Существующие записи получат пустой массив `[]` в поле `documents`
- После миграции документы будут сохраняться и не будут теряться при перезагрузке
