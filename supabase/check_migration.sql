-- Проверка: убедитесь, что колонка documents добавлена
SELECT 
  column_name, 
  data_type, 
  column_default,
  is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'chat_messages' 
  AND column_name = 'documents';
