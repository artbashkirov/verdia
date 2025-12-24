'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthLayout } from '@/components/layout';
import { Button, Input } from '@/components/ui';
import { LogoFull } from '@/components/icons';
import { createClient } from '@/lib/supabase/client';

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isValidToken, setIsValidToken] = useState<boolean | null>(null);

  useEffect(() => {
    // Проверяем, есть ли валидная сессия для сброса пароля
    const checkSession = async () => {
      const supabase = createClient();
      const { data: { session }, error } = await supabase.auth.getSession();
      
      // Для сброса пароля нужна сессия (recovery сессия создается после перехода по ссылке)
      if (session && !error) {
        setIsValidToken(true);
      } else {
        setIsValidToken(false);
        setError('Ссылка для сброса пароля недействительна или истекла. Пожалуйста, запросите новую ссылку.');
      }
    };

    checkSession();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    if (password !== confirmPassword) {
      setError('Пароли не совпадают');
      setIsLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('Пароль должен содержать минимум 6 символов');
      setIsLoading(false);
      return;
    }

    try {
      const supabase = createClient();
      
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) {
        setError(error.message || 'Произошла ошибка при обновлении пароля');
        setIsLoading(false);
        return;
      }

      setSuccess(true);
      setIsLoading(false);

      // Перенаправляем на страницу входа через 2 секунды
      setTimeout(() => {
        router.push('/login?password_reset=success');
      }, 2000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Произошла ошибка';
      setError(errorMessage);
      setIsLoading(false);
    }
  };

  if (isValidToken === null) {
    return (
      <AuthLayout
        title="Юридический AI-ассистент"
        description="Иски, ходатайства и анализ судебной практики — за минуты"
      >
        <div className="flex flex-col md:gap-[100px] max-w-[554px] w-full">
          <div className="flex flex-col gap-2.5 items-center md:items-start text-center md:text-left">
            <h2 className="text-[20px] md:text-[32px] font-medium md:font-bold text-foreground leading-[28px] md:leading-normal tracking-[-0.2px]">
              Проверка...
            </h2>
          </div>
        </div>
      </AuthLayout>
    );
  }

  if (isValidToken === false) {
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
              Ошибка
            </h2>
            <p className="text-[13px] md:text-base text-foreground">
              {error || 'Ссылка для сброса пароля недействительна или истекла'}
            </p>
          </div>

          <div className="flex flex-col gap-4 mt-8 md:mt-0">
            <Link href="/forgot-password" className="text-[#312ecb] text-[13px] hover:underline text-center md:text-left">
              Запросить новую ссылку
            </Link>
            <Link href="/login" className="text-[#312ecb] text-[13px] hover:underline text-center md:text-left">
              Вернуться к входу
            </Link>
          </div>
        </div>
      </AuthLayout>
    );
  }

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
            {success ? 'Пароль успешно изменен' : 'Новый пароль'}
          </h2>
          <p className="text-[13px] md:text-base text-foreground">
            {success 
              ? 'Вы будете перенаправлены на страницу входа...'
              : 'Введите новый пароль для вашего аккаунта'}
          </p>
        </div>

        {/* Form */}
        {success ? (
          <div className="flex flex-col gap-6 mt-8 md:mt-0">
            <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-green-600 text-sm">
              Пароль успешно изменен. Вы будете перенаправлены на страницу входа.
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-[30px] md:gap-[30px] mt-8 md:mt-0">
            <div className="flex flex-col gap-3 md:gap-5">
              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                  {error}
                </div>
              )}
              <Input
                type="password"
                placeholder="Новый пароль"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
              <Input
                type="password"
                placeholder="Подтвердите пароль"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>

            <div className="flex flex-col gap-4">
              <Button type="submit" fullWidth disabled={isLoading}>
                {isLoading ? 'Сохранение...' : 'Сохранить пароль'}
              </Button>
              <Link
                href="/login"
                className="text-[#312ecb] text-[13px] hover:underline text-center md:text-left"
              >
                Вернуться к входу
              </Link>
            </div>
          </form>
        )}
      </div>
    </AuthLayout>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <AuthLayout
        title="Юридический AI-ассистент"
        description="Иски, ходатайства и анализ судебной практики — за минуты"
      >
        <div className="flex flex-col md:gap-[100px] max-w-[554px] w-full">
          <div className="flex flex-col gap-2.5">
            <h2 className="text-[32px] font-bold text-foreground">
              Загрузка...
            </h2>
          </div>
        </div>
      </AuthLayout>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}

