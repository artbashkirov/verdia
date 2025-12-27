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
        <h2 className="text-[20px] lg:text-[32px] font-normal leading-[28px] lg:leading-[normal] text-white">
          Восстановление пароля
        </h2>
        <p className="text-[16px] lg:text-[24px] font-normal leading-[20px] lg:leading-[30px] text-[#808080] lg:tracking-[-0.24px]">
          Письмо отправлено
        </p>
      </div>

      {/* Success Message */}
      <div className="flex flex-col gap-[28px] items-start w-full">
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-green-600 text-sm w-full">
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
          <h2 className="text-[20px] lg:text-[32px] font-normal leading-[28px] lg:leading-[normal] text-white">
            Загрузка...
          </h2>
        </div>
      </AuthLayout>
    }>
      <SuccessContent />
    </Suspense>
  );
}


