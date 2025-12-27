'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthLayout } from '@/components/layout';
import { Button, Input, Checkbox } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';

export default function RegisterPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    acceptTerms: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.acceptTerms) {
      setError('Необходимо принять условия использования');
      return;
    }
    
    setIsLoading(true);
    setError('');
    
    try {
      const supabase = createClient();
      
      // Используем localhost вместо 127.0.0.1 для лучшей совместимости
      const redirectUrl = typeof window !== 'undefined' 
        ? `${window.location.protocol}//${window.location.host}/auth/callback`
        : 'http://localhost:3000/auth/callback';
      
      const { data, error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            first_name: formData.firstName,
            last_name: formData.lastName,
          },
          emailRedirectTo: redirectUrl,
        },
      });

      if (error) {
        console.error('Supabase signup error:', error);
        console.error('Error details:', {
          message: error.message,
          status: error.status,
          name: error.name,
        });
        
        if (error.message.includes('already registered') || error.message.includes('already been registered')) {
          setError('Пользователь с таким email уже зарегистрирован');
        } else if (error.message.includes('Invalid login credentials')) {
          setError('Неверный email или пароль');
        } else if (error.message.includes('fetch') || error.message.includes('Load failed') || error.message.includes('hostname')) {
          setError('Не удалось подключиться к серверу. Проверьте правильность URL и ключа Supabase в .env.local файле, а также убедитесь, что проект Supabase активен.');
        } else if (error.message.includes('Missing Supabase') || error.message.includes('Отсутствуют переменные')) {
          setError('Ошибка конфигурации. Проверьте файл .env.local и убедитесь, что установлены NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY.');
        } else {
          setError(error.message || 'Произошла ошибка при регистрации');
        }
        setIsLoading(false);
        return;
      }

      console.log('Signup successful:', data);
      console.log('User data:', {
        user: data.user,
        session: data.session,
        needsEmailConfirmation: !data.session && data.user,
      });
      
      // Если пользователь создан, но сессия не создана - требуется подтверждение email
      if (data.user && !data.session) {
        console.log('Email confirmation required. Check your email inbox and spam folder.');
      }
    } catch (err) {
      console.error('Registration error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Произошла ошибка при регистрации';
      
      if (errorMessage.includes('Missing Supabase') || errorMessage.includes('Отсутствуют переменные')) {
        setError('Ошибка конфигурации. Проверьте файл .env.local и убедитесь, что установлены NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY.');
      } else if (errorMessage.includes('fetch') || errorMessage.includes('hostname')) {
        setError('Не удалось подключиться к серверу Supabase. Проверьте правильность URL в .env.local файле.');
      } else {
        setError(errorMessage);
      }
      setIsLoading(false);
      return;
    }
    
    // Redirect to verify page with email
    router.push(`/verify?email=${encodeURIComponent(formData.email)}`);
  };

  return (
    <AuthLayout>
      {/* Header */}
      <div className="flex flex-col gap-[4px] lg:gap-[10px] items-center text-center w-full">
        <h2 className="auth-text text-[20px] lg:text-[32px] font-normal leading-[28px] lg:leading-[normal] text-white">
          Регистрация
        </h2>
        <p className="auth-text text-[16px] lg:text-[24px] font-normal leading-[20px] lg:leading-[30px] text-[#808080] lg:tracking-[-0.24px]">
          Создайте аккаунт в Verdia
        </p>
      </div>

      {/* Form */}
      <div className="flex flex-col gap-[28px] items-start w-full">
        <form id="register-form" onSubmit={handleSubmit} className="flex flex-col gap-[12px] lg:gap-[16px] w-full">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
              {error}
            </div>
          )}
          {/* Name fields - stacked on mobile, side by side on desktop */}
          <div className="flex flex-col lg:flex-row gap-[16px]">
            <Input
              placeholder="Имя"
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              required
            />
            <Input
              placeholder="Фамилия"
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              required
            />
          </div>
          
          <Input
            type="email"
            placeholder="Email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            required
          />
          
          <Input
            type="password"
            placeholder="Пароль"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            required
            minLength={6}
          />
          
          <Checkbox
            id="acceptTerms"
            checked={formData.acceptTerms}
            onChange={(e) => setFormData({ ...formData, acceptTerms: e.target.checked })}
            label={
              <span className="text-white">
                Я согласен с{' '}
                <Link href="/terms" className="text-[#5d89d5] hover:underline">
                  Правилами сервиса
                </Link>
                {' '}и{' '}
                <Link href="/privacy" className="text-[#5d89d5] hover:underline">
                  Политикой конфиденциальности
                </Link>
              </span>
            }
          />
        </form>

        <div className="flex flex-col gap-[16px] items-center w-full">
          <Button type="submit" form="register-form" fullWidth disabled={isLoading}>
            {isLoading ? 'Создание...' : 'Создать аккаунт'}
          </Button>
          <p className="text-[13px] lg:text-[14px] font-medium leading-[16px] lg:leading-[18px] text-white">
            <span>Уже зарегистрированы?</span>{' '}
            <Link href="/login" className="text-[#5d89d5] hover:underline">
              Войти
            </Link>
          </p>
        </div>
      </div>
    </AuthLayout>
  );
}
