import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

// Load env from .env.local
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    envVars[match[1].trim()] = match[2].trim();
  }
});

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = envVars.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Отсутствуют переменные окружения');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createTable() {
  console.log('📝 Создаём таблицу user_profiles...');
  
  const { error } = await supabase.rpc('exec_sql', {
    sql: `
      -- User profiles table (extended plaintiff data)
      CREATE TABLE IF NOT EXISTS public.user_profiles (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
        person_type TEXT NOT NULL DEFAULT 'individual' CHECK (person_type IN ('individual', 'entrepreneur', 'legal_entity')),
        full_name TEXT,
        passport_series TEXT,
        passport_number TEXT,
        passport_issued_by TEXT,
        passport_issue_date DATE,
        birth_date DATE,
        ogrnip TEXT,
        inn_individual TEXT,
        company_name TEXT,
        company_form TEXT,
        ogrn TEXT,
        inn_legal TEXT,
        kpp TEXT,
        registration_address TEXT,
        registration_city TEXT,
        registration_region TEXT,
        actual_address TEXT,
        phone TEXT,
        email_contact TEXT,
        bank_name TEXT,
        bank_bik TEXT,
        bank_account TEXT,
        bank_corr_account TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON public.user_profiles(user_id);
      ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
      
      DROP POLICY IF EXISTS "Users can view own profile data" ON public.user_profiles;
      CREATE POLICY "Users can view own profile data" ON public.user_profiles FOR SELECT USING (auth.uid() = user_id);
      
      DROP POLICY IF EXISTS "Users can create own profile data" ON public.user_profiles;
      CREATE POLICY "Users can create own profile data" ON public.user_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
      
      DROP POLICY IF EXISTS "Users can update own profile data" ON public.user_profiles;
      CREATE POLICY "Users can update own profile data" ON public.user_profiles FOR UPDATE USING (auth.uid() = user_id);
      
      DROP POLICY IF EXISTS "Users can delete own profile data" ON public.user_profiles;
      CREATE POLICY "Users can delete own profile data" ON public.user_profiles FOR DELETE USING (auth.uid() = user_id);
    `
  });

  if (error) {
    console.log('⚠️ RPC не доступен, пробуем через REST API...');
    console.log('❌ Ошибка:', error.message);
    console.log('\n📋 Пожалуйста, выполните следующий SQL в Supabase Dashboard:');
    console.log('   https://supabase.com/dashboard/project/YOUR_PROJECT/sql\n');
    console.log(`
-- User profiles table
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  person_type TEXT NOT NULL DEFAULT 'individual' CHECK (person_type IN ('individual', 'entrepreneur', 'legal_entity')),
  full_name TEXT,
  passport_series TEXT,
  passport_number TEXT,
  passport_issued_by TEXT,
  passport_issue_date DATE,
  birth_date DATE,
  ogrnip TEXT,
  inn_individual TEXT,
  company_name TEXT,
  company_form TEXT,
  ogrn TEXT,
  inn_legal TEXT,
  kpp TEXT,
  registration_address TEXT,
  registration_city TEXT,
  registration_region TEXT,
  actual_address TEXT,
  phone TEXT,
  email_contact TEXT,
  bank_name TEXT,
  bank_bik TEXT,
  bank_account TEXT,
  bank_corr_account TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile data" ON public.user_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own profile data" ON public.user_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile data" ON public.user_profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own profile data" ON public.user_profiles FOR DELETE USING (auth.uid() = user_id);
    `);
    return;
  }

  console.log('✅ Таблица создана!');
}

createTable().catch(console.error);

