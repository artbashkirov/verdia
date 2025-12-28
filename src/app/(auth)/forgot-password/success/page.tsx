'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthLayout } from '@/components/layout';
import { Button } from '@/components/ui';

function SuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || '';

  return (
    <AuthLayout>
      {/* Header */}
      <div className="flex flex-col gap-[4px] lg:gap-[10px] items-center text-center w-full">
        <h1 className="text-[20px] lg:text-[32px] font-normal leading-[28px] lg:leading-[40px] text-white">
          Восстановление пароля
        </h1>
        <h2 className="text-[18px] lg:text-[24px] font-normal leading-[24px] lg:leading-[30px] text-[#808080] lg:tracking-[-0.24px]">
          Письмо отправлено
        </h2>
      </div>

      {/* Success Message */}
      <div className="flex flex-col gap-[28px] items-start w-full">
        <div className="p-4 bg-green-900/20 border border-green-700/50 rounded-xl text-green-400 text-sm w-full slide-in-from-top-2">
          Письмо с инструкциями по восстановлению пароля отправлено на <strong>{email}</strong>. Проверьте почту.
        </div>
        <div className="flex flex-col gap-[16px] items-center w-full">
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
      <AuthLayout>
        <div className="flex flex-col gap-[10px] items-center text-center">
          <h1 className="text-[20px] lg:text-[32px] font-normal leading-[28px] lg:leading-[40px] text-white">
            Загрузка...
          </h1>
        </div>
      </AuthLayout>
    }>
      <SuccessContent />
    </Suspense>
  );
}


