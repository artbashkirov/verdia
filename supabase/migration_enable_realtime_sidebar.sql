-- Migration: Enable realtime for sidebar updates
-- Run this in Supabase SQL Editor

-- 1. Allow NULL response in generations table (for immediate insert before AI completion)
ALTER TABLE public.generations ALTER COLUMN response DROP NOT NULL;

-- 2. Add UPDATE policy for generations table (needed to update response after AI completion)
DROP POLICY IF EXISTS "Users can update own generations" ON public.generations;
CREATE POLICY "Users can update own generations" ON public.generations
  FOR UPDATE USING (auth.uid() = user_id);

-- 3. Enable Realtime for generations table
-- This allows the sidebar to update immediately when a new chat is created
ALTER PUBLICATION supabase_realtime ADD TABLE public.generations;

-- Verify the publication includes generations
-- SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
