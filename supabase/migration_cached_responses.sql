-- Migration: Add cached_responses table for example queries caching
-- This implements lazy caching (Variant C) for the 100 example questions

-- Cached responses table
CREATE TABLE IF NOT EXISTS public.cached_responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Question identification
  question_id INTEGER NOT NULL UNIQUE, -- 1-100 index from example-queries.ts
  question_text TEXT NOT NULL, -- Full question text for debugging/verification
  
  -- Cached response data (same structure as generations.response)
  response JSONB NOT NULL,
  
  -- Court cases data (separate for potential updates)
  court_cases JSONB,
  
  -- TTL management
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days'), -- 14 days TTL
  
  -- Stats
  hit_count INTEGER NOT NULL DEFAULT 0, -- How many times this cache was used
  last_hit_at TIMESTAMPTZ
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_cached_responses_question_id ON public.cached_responses(question_id);
CREATE INDEX IF NOT EXISTS idx_cached_responses_expires_at ON public.cached_responses(expires_at);

-- Note: No RLS needed - this is a public cache table, readable by all authenticated users
-- The data doesn't contain user-specific information

-- Grant read access to authenticated users
ALTER TABLE public.cached_responses ENABLE ROW LEVEL SECURITY;

-- Anyone can read cached responses
CREATE POLICY "Anyone can read cached responses" ON public.cached_responses
  FOR SELECT USING (true);

-- Only service role (backend) can insert/update/delete
-- This is handled by using service role key in the API

-- Function to increment hit count
CREATE OR REPLACE FUNCTION public.increment_cache_hit(p_question_id INTEGER)
RETURNS void AS $$
BEGIN
  UPDATE public.cached_responses
  SET 
    hit_count = hit_count + 1,
    last_hit_at = NOW()
  WHERE question_id = p_question_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean expired cache entries (can be called by cron job)
CREATE OR REPLACE FUNCTION public.clean_expired_cache()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.cached_responses
  WHERE expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
