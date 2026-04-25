-- Таблица образцов возражений для RAG
-- Источник: peoplleandlaw.ru (образцы перефразируются AI при генерации, не копируются)

CREATE TABLE IF NOT EXISTS public.objection_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Категория спора
  category TEXT NOT NULL,
  -- 'debt' | 'alimony' | 'divorce' | 'property' | 'eviction' | 'insurance_dtp' |
  -- 'insurance_other' | 'labor' | 'inheritance' | 'damage' | 'other'

  -- Тип суда
  court_type TEXT NOT NULL DEFAULT 'general',
  -- 'general' | 'arbitration' | 'magistrate'

  -- Стадия (апелляция, кассация — это тоже возражения)
  stage TEXT NOT NULL DEFAULT 'first_instance',
  -- 'first_instance' | 'appeal' | 'cassation' | 'supervisory'

  -- Краткое описание ситуации (о чём дело)
  title TEXT NOT NULL,

  -- Ключевые доводы ответчика (список через \n)
  key_arguments TEXT NOT NULL,

  -- Просительная часть
  prayer TEXT NOT NULL DEFAULT 'Прошу суд отказать в удовлетворении исковых требований в полном объёме.',

  -- Ссылки на нормы права, использованные в образце
  legal_references TEXT,

  -- Полный текст образца (используется только для embedding, не копируется в генерацию)
  full_text TEXT,

  -- Вектор (embedding ключевых доводов + категория + title)
  embedding vector(1536),

  -- Метаданные
  source_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_objection_templates_category ON public.objection_templates(category);
CREATE INDEX IF NOT EXISTS idx_objection_templates_court_type ON public.objection_templates(court_type);
CREATE INDEX IF NOT EXISTS idx_objection_templates_stage ON public.objection_templates(stage);

-- Векторный индекс
CREATE INDEX IF NOT EXISTS idx_objection_templates_embedding
  ON public.objection_templates
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);

-- RLS
ALTER TABLE public.objection_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Templates readable by authenticated"
  ON public.objection_templates FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Service role manages templates"
  ON public.objection_templates FOR ALL
  USING (auth.role() = 'service_role');

-- Функция семантического поиска по шаблонам
CREATE OR REPLACE FUNCTION match_objection_templates(
  query_embedding vector(1536),
  match_threshold FLOAT DEFAULT 0.3,
  match_count INT DEFAULT 3,
  filter_category TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  category TEXT,
  court_type TEXT,
  stage TEXT,
  title TEXT,
  key_arguments TEXT,
  prayer TEXT,
  legal_references TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.category,
    t.court_type,
    t.stage,
    t.title,
    t.key_arguments,
    t.prayer,
    t.legal_references,
    1 - (t.embedding <=> query_embedding) AS similarity
  FROM public.objection_templates t
  WHERE
    (filter_category IS NULL OR t.category = filter_category)
    AND 1 - (t.embedding <=> query_embedding) > match_threshold
  ORDER BY t.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
