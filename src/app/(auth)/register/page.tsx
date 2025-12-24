'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthLayout } from '@/components/layout';
import { Button, Input, Checkbox } from '@/components/ui';
import { LogoFull } from '@/components/icons';
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
    <AuthLayout
      title="Юридический AI-ассистент"
      description="Иски, ходатайства и анализ судебной практики — за минуты"
    >
      <div className="flex flex-col md:gap-[100px] max-w-[554px] w-full">
        {/* Mobile Logo - only visible on mobile */}
        <div className="md:hidden flex justify-center mb-8">
          <LogoFull variant="dark" size="small" />
        </div>

        {/* Header */}
        <div className="flex flex-col gap-2.5 items-center md:items-start text-center md:text-left">
          <h2 className="text-[20px] md:text-[32px] font-medium md:font-bold text-foreground leading-[28px] md:leading-normal tracking-[-0.2px]">
            Регистрация
          </h2>
          <p className="text-[13px] md:text-base text-foreground">
            Уже зарегистрированы?{' '}
            <Link href="/login" className="text-[#312ecb] hover:underline">
              Войти
            </Link>
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-[30px] md:gap-[30px] mt-8 md:mt-0">
          <div className="flex flex-col gap-3 md:gap-5">
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                {error}
              </div>
            )}
            {/* Name fields - stacked on mobile, side by side on desktop */}
            <div className="flex flex-col md:flex-row gap-3 md:gap-[30px]">
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
                <span>
                  Я согласен с{' '}
                  <Link href="/terms" className="text-[#312ecb] hover:underline">
                    Правилами сервиса
                  </Link>
                  {' '}и{' '}
                  <Link href="/privacy" className="text-[#312ecb] hover:underline">
                    Политикой конфиденциальности
                  </Link>
                </span>
              }
            />
          </div>

          <Button type="submit" fullWidth disabled={isLoading}>
            {isLoading ? 'Создание...' : 'Создать аккаунт'}
          </Button>
        </form>
      </div>
    </AuthLayout>
  );
}
