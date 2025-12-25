'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthLayout } from '@/components/layout';
import { Button, Input } from '@/components/ui';
import { LogoFull } from '@/components/icons';
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
            Восстановление пароля
          </h2>
          <p className="text-[13px] md:text-base text-foreground">
            Введите ваш email для восстановления пароля
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
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>

          <div className="flex flex-col gap-4">
            <Button type="submit" fullWidth disabled={isLoading}>
              {isLoading ? 'Отправка...' : 'Отправить'}
            </Button>
            <Link
              href="/login"
              className="text-link text-[13px] hover:underline text-center md:text-left"
            >
              Вернуться к входу
            </Link>
          </div>
        </form>
      </div>
    </AuthLayout>
  );
}

