'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthLayout } from '@/components/layout';
import { Button, Input } from '@/components/ui';
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
      <AuthLayout>
        <div className="flex flex-col gap-[10px] items-center text-center w-full">
          <h2 className="text-[32px] font-normal leading-[normal] text-white">
            Проверка...
          </h2>
        </div>
      </AuthLayout>
    );
  }

  if (isValidToken === false) {
    return (
      <AuthLayout>
        {/* Header */}
        <div className="flex flex-col gap-[10px] items-center text-center w-full">
          <h2 className="text-[32px] font-normal leading-[normal] text-white">
            Ошибка
          </h2>
          <p className="text-[24px] font-normal leading-[30px] text-[#808080] tracking-[-0.24px]">
            {error || 'Ссылка для сброса пароля недействительна или истекла'}
          </p>
        </div>

        <div className="flex flex-col gap-[16px] items-center w-full">
          <Link href="/forgot-password" className="text-[#5d89d5] text-[14px] leading-[18px] hover:underline">
            Запросить новую ссылку
          </Link>
          <Link href="/login" className="text-[#5d89d5] text-[14px] leading-[18px] hover:underline">
            Вернуться к входу
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      {/* Header */}
      <div className="flex flex-col gap-[10px] items-center text-center w-full">
        <h2 className="text-[32px] font-normal leading-[normal] text-white">
          {success ? 'Пароль успешно изменен' : 'Новый пароль'}
        </h2>
        <p className="text-[24px] font-normal leading-[30px] text-[#808080] tracking-[-0.24px]">
          {success 
            ? 'Вы будете перенаправлены на страницу входа...'
            : 'Введите новый пароль для вашего аккаунта'}
        </p>
      </div>

      {/* Form */}
      {success ? (
        <div className="flex flex-col gap-[16px] items-center w-full">
          <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-green-600 text-sm w-full">
            Пароль успешно изменен. Вы будете перенаправлены на страницу входа.
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-[28px] items-start w-full">
          <form id="reset-password-form" onSubmit={handleSubmit} className="flex flex-col gap-[16px] w-full">
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
          </form>

          <div className="flex flex-col gap-[16px] items-center w-full">
            <Button type="submit" form="reset-password-form" fullWidth disabled={isLoading}>
              {isLoading ? 'Сохранение...' : 'Сохранить пароль'}
            </Button>
            <Link
              href="/login"
              className="text-[#5d89d5] text-[14px] leading-[18px] hover:underline"
            >
              Вернуться к входу
            </Link>
          </div>
        </div>
      )}
    </AuthLayout>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <AuthLayout>
        <div className="flex flex-col gap-[10px] items-center text-center">
          <h2 className="text-[32px] font-normal text-white">
            Загрузка...
          </h2>
        </div>
      </AuthLayout>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}

