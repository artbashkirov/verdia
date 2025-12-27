'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthLayout } from '@/components/layout';
import { Button, Input } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    const passwordReset = searchParams.get('password_reset');
    if (passwordReset === 'success') {
      setSuccessMessage('Пароль успешно изменен. Теперь вы можете войти с новым паролем.');
      // Очищаем URL от параметра
      router.replace('/login', { scroll: false });
    }
  }, [searchParams, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    
    const supabase = createClient();
    
    const { error } = await supabase.auth.signInWithPassword({
      email: formData.email,
      password: formData.password,
    });

    if (error) {
      setError(error.message === 'Invalid login credentials' 
        ? 'Неверный email или пароль' 
        : error.message);
      setIsLoading(false);
      return;
    }
    
    router.push('/chat');
    router.refresh();
  };

  return (
    <AuthLayout>
      {/* Header */}
      <div className="flex flex-col gap-[4px] lg:gap-[10px] items-center text-center w-full">
        <h2 className="auth-text text-[20px] lg:text-[32px] font-normal leading-[28px] lg:leading-[normal] text-white">
          Добро пожаловать в Verdia
        </h2>
        <p className="auth-text text-[16px] lg:text-[24px] font-normal leading-[20px] lg:leading-[30px] text-[#808080] lg:tracking-[-0.24px]">
          Ваш юридический AI-ассистент
        </p>
      </div>

      {/* Form */}
      <div className="flex flex-col gap-[28px] items-start w-full">
        <form id="login-form" onSubmit={handleSubmit} className="flex flex-col gap-[12px] lg:gap-[16px] w-full">
          {successMessage && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-green-600 text-sm">
              {successMessage}
            </div>
          )}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
              {error}
            </div>
          )}
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
          />
          <div className="flex items-center justify-center w-full">
            <Link
              href="/forgot-password"
              className="text-[#5d89d5] text-[13px] lg:text-[14px] leading-[16px] lg:leading-[18px] hover:underline"
            >
              Забыли пароль?
            </Link>
          </div>
        </form>

        <div className="flex flex-col gap-[16px] items-center w-full">
          <Button type="submit" form="login-form" fullWidth disabled={isLoading}>
            {isLoading ? 'Загрузка...' : 'Войти'}
          </Button>
          <p className="text-[13px] lg:text-[14px] font-medium leading-[16px] lg:leading-[18px] text-white">
            <span>Еще не зарегистрированы?</span>{' '}
            <Link href="/register" className="text-[#5d89d5] hover:underline">
              Регистрация
            </Link>
          </p>
        </div>
      </div>
    </AuthLayout>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <AuthLayout>
        <div className="flex flex-col items-center text-center">
          <h2 className="text-[32px] font-normal text-white">
            Загрузка...
          </h2>
        </div>
      </AuthLayout>
    }>
      <LoginContent />
    </Suspense>
  );
}
