-- RAG: Таблица статей законодательства с векторным поиском
-- Запустить в Supabase SQL Editor

-- Включаем расширение pgvector для векторного поиска
CREATE EXTENSION IF NOT EXISTS vector;

-- Таблица для хранения статей законодательства
CREATE TABLE IF NOT EXISTS public.law_articles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Идентификация документа
  code_slug TEXT NOT NULL,           -- 'gk-rf-chast1', 'gpk-rf', 'tk-rf'
  code_name TEXT NOT NULL,           -- 'Гражданский кодекс РФ (часть 1)'
  article_number TEXT NOT NULL,      -- '15', '8.1', '358.5'
  article_title TEXT NOT NULL,       -- 'Возмещение убытков'
  -- Структура
  section_path TEXT,                 -- 'Раздел I > Подраздел 1 > Глава 2'
  -- Содержимое
  content TEXT NOT NULL,             -- Полный текст статьи
  content_chunk TEXT NOT NULL,       -- Чанк текста (для длинных статей может быть несколько)
  chunk_index INTEGER NOT NULL DEFAULT 0, -- Индекс чанка (0 для первого/единственного)
  -- Вектор
  embedding vector(1536),           -- OpenAI text-embedding-3-small (1536 dimensions)
  -- Метаданные
  source_url TEXT,                   -- URL на sudact.ru
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Индексы для быстрого поиска
CREATE INDEX IF NOT EXISTS idx_law_articles_code_slug ON public.law_articles(code_slug);
CREATE INDEX IF NOT EXISTS idx_law_articles_article_number ON public.law_articles(article_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_law_articles_unique 
  ON public.law_articles(code_slug, article_number, chunk_index);

-- IVFFlat индекс для векторного поиска (быстрый approximate nearest neighbor)
-- lists = sqrt(количество_записей), начинаем с 100
CREATE INDEX IF NOT EXISTS idx_law_articles_embedding 
  ON public.law_articles 
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- RLS отключена — это публичные данные законодательства, доступные всем
ALTER TABLE public.law_articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Law articles are readable by all authenticated users" 
  ON public.law_articles
  FOR SELECT 
  USING (auth.role() = 'authenticated');

CREATE POLICY "Service role can manage law articles" 
  ON public.law_articles
  FOR ALL
  USING (auth.role() = 'service_role');

-- Функция семантического поиска по законодательству
CREATE OR REPLACE FUNCTION match_law_articles(
  query_embedding vector(1536),
  match_threshold FLOAT DEFAULT 0.3,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  code_slug TEXT,
  code_name TEXT,
  article_number TEXT,
  article_title TEXT,
  section_path TEXT,
  content_chunk TEXT,
  source_url TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    la.id,
    la.code_slug,
    la.code_name,
    la.article_number,
    la.article_title,
    la.section_path,
    la.content_chunk,
    la.source_url,
    1 - (la.embedding <=> query_embedding) AS similarity
  FROM public.law_articles la
  WHERE 1 - (la.embedding <=> query_embedding) > match_threshold
  ORDER BY la.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Функция для поиска по конкретному кодексу
CREATE OR REPLACE FUNCTION match_law_articles_by_code(
  query_embedding vector(1536),
  target_code_slug TEXT,
  match_threshold FLOAT DEFAULT 0.2,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  code_slug TEXT,
  code_name TEXT,
  article_number TEXT,
  article_title TEXT,
  section_path TEXT,
  content_chunk TEXT,
  source_url TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    la.id,
    la.code_slug,
    la.code_name,
    la.article_number,
    la.article_title,
    la.section_path,
    la.content_chunk,
    la.source_url,
    1 - (la.embedding <=> query_embedding) AS similarity
  FROM public.law_articles la
  WHERE la.code_slug = target_code_slug
    AND 1 - (la.embedding <=> query_embedding) > match_threshold
  ORDER BY la.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
