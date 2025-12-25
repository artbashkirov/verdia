'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthLayout } from '@/components/layout';
import { Button, Input } from '@/components/ui';
import { LogoFull } from '@/components/icons';
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
    <AuthLayout
      title="Юридический AI-ассистент"
      description="Иски, ходатайства и анализ судебной практики — за минуты"
    >
      <div className="flex flex-col w-full md:my-auto">
        {/* Mobile Logo - only visible on mobile */}
        <div className="md:hidden flex justify-center mb-8">
          <LogoFull variant="dark" size="small" />
        </div>

        {/* Form container - centered on desktop */}
        <div className="flex flex-col gap-[100px] items-center w-full">
          {/* Header */}
          <div className="flex flex-col gap-[10px] justify-start items-center w-full max-w-[554px]">
            <h2 className="text-[20px] md:text-[32px] font-medium md:font-bold text-[#040308] leading-[28px] md:leading-[40px] text-center">
              Добро пожаловать
            </h2>
            <p className="text-[13px] md:text-[16px] text-[#040308] text-center">
              Еще не зарегистрированы?{' '}
              <Link href="/register" className="text-[#312ecb] hover:underline">
                Регистрация
              </Link>
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-[30px] w-full max-w-[554px] items-start">
            <div className="flex flex-col gap-[20px] w-full">
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
              <div className="flex justify-end">
                <Link
                  href="/forgot-password"
                  className="text-[#312ecb] text-[14px] hover:underline"
                >
                  Забыли пароль?
                </Link>
              </div>
            </div>

            <Button type="submit" fullWidth disabled={isLoading}>
              {isLoading ? 'Загрузка...' : 'Войти'}
            </Button>
          </form>
        </div>
      </div>
    </AuthLayout>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <AuthLayout
        title="Юридический AI-ассистент"
        description="Иски, ходатайства и анализ судебной практики — за минуты"
      >
        <div className="flex flex-col max-w-[554px] w-full md:mx-auto">
          <div className="flex flex-col gap-2.5">
            <h2 className="text-[32px] font-bold text-foreground">
              Загрузка...
            </h2>
          </div>
        </div>
      </AuthLayout>
    }>
      <LoginContent />
    </Suspense>
  );
}
