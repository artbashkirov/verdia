'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthLayout } from '@/components/layout';
import { Button, Input } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Проверяем наличие переменных окружения при монтировании
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      
      if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('placeholder')) {
        console.warn('Supabase environment variables are missing or using placeholders');
      }
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    
    if (!email || !email.includes('@')) {
      setError('Пожалуйста, введите корректный email адрес');
      setIsLoading(false);
      return;
    }
    
    try {
      // Проверяем переменные окружения перед созданием клиента
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      
      if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('placeholder') || supabaseKey.includes('placeholder')) {
        setError('Supabase не настроен. Пожалуйста, настройте переменные окружения NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY в файле .env.local');
        setIsLoading(false);
        return;
      }
      
      const supabase = createClient();
      
      // Проверяем, что Supabase клиент создан корректно
      if (!supabase) {
        setError('Ошибка подключения к серверу. Проверьте настройки подключения.');
        setIsLoading(false);
        return;
      }
      
      const redirectUrl = typeof window !== 'undefined' 
        ? `${window.location.protocol}//${window.location.host}/auth/callback?next=/reset-password&type=recovery`
        : 'http://localhost:3000/auth/callback?next=/reset-password&type=recovery';
      
      const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });

      if (error) {
        console.error('Password reset error:', error);
        let errorMessage = 'Произошла ошибка при отправке письма';
        
        if (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('Load failed') || error.message.includes('Failed to fetch')) {
          errorMessage = 'Не удалось подключиться к серверу Supabase. Проверьте подключение к интернету и правильность настроек NEXT_PUBLIC_SUPABASE_URL в файле .env.local';
        } else if (error.message.includes('Invalid email') || error.message.includes('email')) {
          errorMessage = 'Неверный формат email адреса или пользователь с таким email не найден';
        } else if (error.message.includes('rate limit') || error.message.includes('too many')) {
          errorMessage = 'Слишком много запросов. Пожалуйста, попробуйте позже.';
        } else if (error.message.includes('For security purposes')) {
          errorMessage = 'Для безопасности, пожалуйста, подождите несколько минут перед повторной попыткой.';
        } else {
          errorMessage = error.message || errorMessage;
        }
        
        setError(errorMessage);
        setIsLoading(false);
        return;
      }

      // Успешно отправлено
      router.push(`/forgot-password/success?email=${encodeURIComponent(email)}`);
    } catch (err) {
      console.error('Password reset exception:', err);
      let errorMessage = 'Произошла ошибка при отправке письма';
      
      if (err instanceof Error) {
        if (err.message.includes('fetch') || err.message.includes('network') || err.message.includes('Load failed') || err.message.includes('Failed to fetch')) {
          errorMessage = 'Не удалось подключиться к серверу Supabase. Проверьте подключение к интернету и настройки NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY в файле .env.local';
        } else if (err.message.includes('Missing Supabase') || err.message.includes('Отсутствуют переменные')) {
          errorMessage = err.message;
        } else {
          errorMessage = err.message;
        }
      }
      
      setError(errorMessage);
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout>
      {/* Header */}
      <div className="flex flex-col gap-[4px] lg:gap-[10px] items-center text-center w-full">
        <h1 className="auth-text text-[20px] lg:text-[32px] font-normal leading-[28px] lg:leading-[40px] text-white">
          Восстановление пароля
        </h1>
        <h2 className="auth-text text-[18px] lg:text-[24px] font-normal leading-[24px] lg:leading-[30px] text-[#808080] lg:tracking-[-0.24px]">
          Введите ваш email для восстановления пароля
        </h2>
      </div>

      {/* Form */}
      <div className="flex flex-col gap-[28px] items-start w-full">
        <form id="forgot-password-form" onSubmit={handleSubmit} className="flex flex-col gap-[12px] lg:gap-[16px] w-full">
          {error && (
            <div className="p-4 bg-red-900/20 border border-red-700/50 rounded-xl text-red-400 text-sm slide-in-from-top-2">
              {error}
            </div>
          )}
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isLoading}
          />
        </form>

        <div className="flex flex-col gap-[16px] items-center w-full">
          <Button type="submit" form="forgot-password-form" fullWidth disabled={isLoading}>
            {isLoading ? 'Отправка...' : 'Отправить'}
          </Button>
          <Link
            href="/login"
            className="text-[#5d89d5] text-[13px] lg:text-[14px] leading-[16px] lg:leading-[16px] hover:underline"
          >
            Вернуться к входу
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
}

