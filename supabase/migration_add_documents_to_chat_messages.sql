-- Migration: Add documents column to chat_messages table
-- Run this in Supabase SQL Editor if the column doesn't exist

-- Add documents column if it doesn't exist
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
