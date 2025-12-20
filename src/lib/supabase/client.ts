import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database';

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    const missing = [];
    if (!supabaseUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL');
    if (!supabaseAnonKey) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    
    console.error(`Missing Supabase environment variables: ${missing.join(', ')}`);
    throw new Error(
      `Отсутствуют переменные окружения: ${missing.join(', ')}. Проверьте файл .env.local и убедитесь, что все переменные установлены.`
    );
  }

  // Валидация формата URL
  try {
    new URL(supabaseUrl);
  } catch {
    console.error('Invalid Supabase URL format:', supabaseUrl);
    throw new Error(
      'Неверный формат URL Supabase. Проверьте значение NEXT_PUBLIC_SUPABASE_URL в .env.local'
    );
  }

  return createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
}

