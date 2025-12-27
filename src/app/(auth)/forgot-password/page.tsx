'use client';

import { useState } from 'react';
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    
    try {
      const supabase = createClient();
      
      const redirectUrl = typeof window !== 'undefined' 
        ? `${window.location.protocol}//${window.location.host}/auth/callback?next=/reset-password`
        : 'http://localhost:3000/auth/callback?next=/reset-password';
      
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });

      if (error) {
        setError(error.message || 'Произошла ошибка при отправке письма');
        setIsLoading(false);
        return;
      }

      router.push(`/forgot-password/success?email=${encodeURIComponent(email)}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Произошла ошибка';
      setError(errorMessage);
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout>
      {/* Header */}
      <div className="flex flex-col gap-[4px] lg:gap-[10px] items-center text-center w-full">
        <h2 className="auth-text text-[20px] lg:text-[32px] font-normal leading-[28px] lg:leading-[normal] text-white">
          Восстановление пароля
        </h2>
        <p className="auth-text text-[16px] lg:text-[24px] font-normal leading-[20px] lg:leading-[30px] text-[#808080] lg:tracking-[-0.24px]">
          Введите ваш email для восстановления пароля
        </p>
      </div>

      {/* Form */}
      <div className="flex flex-col gap-[28px] items-start w-full">
        <form id="forgot-password-form" onSubmit={handleSubmit} className="flex flex-col gap-[12px] lg:gap-[16px] w-full">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
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
            className="text-[#5d89d5] text-[13px] lg:text-[14px] leading-[16px] lg:leading-[18px] hover:underline"
          >
            Вернуться к входу
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
}

