-- Migration: Cases system for "Возражение на иск" workflow
-- Run this in Supabase SQL Editor

-- ============================================================
-- 1. Cases table (core entity)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Новое дело',
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft',        -- черновик, только создано
    'analyzing',    -- AI анализирует документы
    'needs_info',   -- не хватает данных, ждем от пользователя
    'ready',        -- все данные собраны, можно генерировать
    'completed'     -- возражение сгенерировано
  )),
  case_type TEXT NOT NULL DEFAULT 'objection' CHECK (case_type IN (
    'objection',    -- возражение на иск
    'claim'         -- подготовка иска (будущее)
  )),
  stage TEXT CHECK (stage IN (
    'pre_court',       -- до суда
    'after_filing',    -- после подачи иска
    'after_acceptance', -- после принятия к производству
    'appeal',          -- апелляция
    'cassation'        -- кассация
  )),
  strategy TEXT CHECK (strategy IN (
    'facts',        -- возражения по фактам
    'law',          -- возражения по праву
    'procedural',   -- процессуальные возражения
    'combined'      -- комбинированная стратегия
  )),
  analysis JSONB DEFAULT '{}',
  entities JSONB DEFAULT '{}',
  missing_info JSONB DEFAULT '[]',
  similar_cases JSONB DEFAULT '[]',
  probability JSONB DEFAULT '{}',
  source_chat_id UUID REFERENCES public.chat_history(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cases_user_id ON public.cases(user_id);
CREATE INDEX IF NOT EXISTS idx_cases_status ON public.cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_created_at ON public.cases(created_at DESC);

ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own cases" ON public.cases
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own cases" ON public.cases
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own cases" ON public.cases
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own cases" ON public.cases
  FOR DELETE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_cases_updated_at ON public.cases;
CREATE TRIGGER update_cases_updated_at
  BEFORE UPDATE ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- 2. Case documents table (uploaded files)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.case_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'docx', 'image', 'text')),
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  mime_type TEXT,
  extracted_text TEXT,
  analysis JSONB DEFAULT '{}',
  is_relevant BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_documents_case_id ON public.case_documents(case_id);
CREATE INDEX IF NOT EXISTS idx_case_documents_user_id ON public.case_documents(user_id);

ALTER TABLE public.case_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own case documents" ON public.case_documents
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own case documents" ON public.case_documents
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own case documents" ON public.case_documents
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own case documents" ON public.case_documents
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- 3. Case messages table (chat within a case)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.case_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'message' CHECK (message_type IN (
    'message',          -- обычное сообщение
    'clarification',    -- уточняющий вопрос от AI
    'analysis',         -- результат анализа
    'document_upload',  -- уведомление о загрузке документа
    'document_generated', -- уведомление о генерации документа
    'quality_gate'      -- предупреждение quality gate
  )),
  attached_documents JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_messages_case_id ON public.case_messages(case_id);
CREATE INDEX IF NOT EXISTS idx_case_messages_created_at ON public.case_messages(created_at ASC);

ALTER TABLE public.case_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own case messages" ON public.case_messages
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own case messages" ON public.case_messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own case messages" ON public.case_messages
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- 4. Case generated documents table (objections, claims, etc.)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.case_generated_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN (
    'objection_facts',      -- возражение по фактам
    'objection_law',        -- возражение по праву
    'objection_procedural', -- процессуальное возражение
    'objection_combined'    -- комбинированное возражение
  )),
  version INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_generated_docs_case_id ON public.case_generated_documents(case_id);
CREATE INDEX IF NOT EXISTS idx_case_generated_docs_type ON public.case_generated_documents(document_type);

ALTER TABLE public.case_generated_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own generated docs" ON public.case_generated_documents
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own generated docs" ON public.case_generated_documents
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own generated docs" ON public.case_generated_documents
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- 5. Storage bucket for case documents
-- ============================================================
-- NOTE: Run this separately in Supabase Dashboard > Storage
-- or via Supabase CLI:
--   INSERT INTO storage.buckets (id, name, public)
--   VALUES ('case-documents', 'case-documents', false);
--
-- Storage RLS policies (run in SQL editor):

-- Allow users to upload files to their own folder
-- CREATE POLICY "Users can upload case documents"
--   ON storage.objects FOR INSERT
--   WITH CHECK (
--     bucket_id = 'case-documents'
--     AND auth.uid()::text = (storage.foldername(name))[1]
--   );

-- Allow users to read their own files
-- CREATE POLICY "Users can read own case documents"
--   ON storage.objects FOR SELECT
--   USING (
--     bucket_id = 'case-documents'
--     AND auth.uid()::text = (storage.foldername(name))[1]
--   );

-- Allow users to delete their own files
-- CREATE POLICY "Users can delete own case documents"
--   ON storage.objects FOR DELETE
--   USING (
--     bucket_id = 'case-documents'
--     AND auth.uid()::text = (storage.foldername(name))[1]
--   );
