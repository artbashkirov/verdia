import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database';

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Проверяем на placeholder значения (но только если они явно содержат placeholder)
  // Если переменные undefined, это значит они не загружены - выбросим ошибку
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Supabase environment variables are not set:', {
      url: supabaseUrl ? 'set' : 'missing',
      key: supabaseAnonKey ? 'set' : 'missing'
    });
    throw new Error(
      'Переменные окружения Supabase не настроены. Убедитесь, что NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY установлены в .env.local и перезапустите dev-сервер.'
    );
  }

  // Проверяем на placeholder значения
  const isPlaceholder = supabaseUrl.includes('placeholder') || 
                        supabaseUrl.includes('your_supabase') ||
                        supabaseAnonKey.includes('placeholder') ||
                        supabaseAnonKey.includes('your_supabase');

  if (isPlaceholder) {
    console.warn('Supabase environment variables are using placeholder values. Using placeholder client.');
    // Используем заглушки для запуска приложения
    const placeholderUrl = 'https://placeholder.supabase.co';
    const placeholderKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDUxOTIwMDAsImV4cCI6MTk2MDc2ODAwMH0.placeholder';
    return createBrowserClient<Database>(placeholderUrl, placeholderKey);
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

