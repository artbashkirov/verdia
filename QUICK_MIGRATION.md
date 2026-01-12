# Быстрая миграция базы данных

## ⚡ Быстрый способ (1 минута)

1. Откройте: https://supabase.com/dashboard
2. Выберите ваш проект
3. Нажмите **"SQL Editor"** в левом меню
4. Нажмите **"New query"** или **"+"**
5. Скопируйте и вставьте этот SQL:

```sql
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
```

6. Нажмите **"Run"** (или `Ctrl+Enter` / `Cmd+Enter`)
7. Готово! ✅

## 🔍 Проверка

После выполнения проверьте:

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'chat_messages' 
AND column_name = 'documents';
```

Должна вернуться одна строка с данными о колонке.

## 📝 Что делает миграция

- Добавляет колонку `documents` типа `jsonb` в таблицу `chat_messages`
- Устанавливает значение по умолчанию `[]` (пустой массив)
- Обновляет существующие записи, устанавливая пустой массив
- Безопасна: проверяет наличие колонки перед добавлением

## ✅ После миграции

Документы будут:
- ✅ Сохраняться в базе данных
- ✅ Загружаться при перезагрузке страницы
- ✅ Не теряться между сессиями
