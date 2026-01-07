import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database';

export function createClient() {
  let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Очищаем значения от пробелов и переносов строк
  if (supabaseUrl) {
    supabaseUrl = supabaseUrl.trim();
  }
  if (supabaseAnonKey) {
    supabaseAnonKey = supabaseAnonKey.trim();
  }

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

  // Дополнительная проверка: если URL содержит ключ (случайно склеились), попробуем разделить
  if (supabaseUrl.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY') || supabaseUrl.includes('supabase_anon_key')) {
    console.error('Invalid Supabase URL: URL and key appear to be concatenated. Please check Vercel environment variables.');
    const parts = supabaseUrl.split(/[=&]/);
    if (parts.length > 1) {
      supabaseUrl = parts[0];
      console.warn('Attempting to extract URL from concatenated value:', supabaseUrl);
    }
  }
  
  // Проверяем, что URL не содержит ключ
  if (supabaseUrl.includes('eyJ') || supabaseUrl.length > 200) {
    console.error('Invalid Supabase URL: URL appears to contain the API key. URL:', supabaseUrl.substring(0, 100));
    throw new Error(
      'URL Supabase содержит ключ API. Проверьте переменные окружения в Vercel: NEXT_PUBLIC_SUPABASE_URL должен содержать только URL (https://xxx.supabase.co), без ключа.'
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

