'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AuthLayout } from '@/components/layout';
import { Button } from '@/components/ui';
import { LogoFull } from '@/components/icons';

function SuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || '';

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

        {/* Success Message */}
        <div className="flex flex-col gap-[30px] md:gap-[30px] mt-8 md:mt-0">
          <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-green-600 text-sm">
            Письмо с инструкциями по восстановлению пароля отправлено на <strong>{email}</strong>. Проверьте почту.
          </div>
          <Button 
            fullWidth 
            onClick={() => router.push('/login')}
          >
            Войти
          </Button>
        </div>
      </div>
    </AuthLayout>
  );
}

export default function ForgotPasswordSuccessPage() {
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
      <SuccessContent />
    </Suspense>
  );
}


