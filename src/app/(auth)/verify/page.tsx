'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AuthLayout } from '@/components/layout';
import { Button } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';

function VerifyContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || '';
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  // Mask email
  const maskEmail = (email: string) => {
    if (!email) return '';
    const [local, domain] = email.split('@');
    if (!domain) return email;
    const maskedLocal = local[0] + '****' + local[local.length - 1];
    const [domainName, domainExt] = domain.split('.');
    const maskedDomain = domainName[0] + '***' + domainName[domainName.length - 1];
    return `${maskedLocal}@${maskedDomain}.${domainExt}`;
  };

  const handleResend = async () => {
    if (!email) {
      setError('Email не указан');
      return;
    }
    
    setIsLoading(true);
    setError('');
    
    const supabase = createClient();
    
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setError(error.message);
      setIsLoading(false);
      return;
    }
    
    setSent(true);
    setIsLoading(false);
    
    // Reset sent state after 30 seconds
    setTimeout(() => setSent(false), 30000);
  };

  return (
    <AuthLayout
      title="Юридический AI-ассистент"
      description="Иски, ходатайства и анализ судебной практики — за минуты"
    >
      <div className="flex flex-col gap-[100px] max-w-[554px]">
        {/* Header */}
        <div className="flex flex-col gap-2.5">
          <h2 className="text-[32px] font-bold text-[#040308]">
            Подтвердите регистрацию
          </h2>
          <p className="text-base text-[#040308]">
            Мы отправили письмо на email {maskEmail(email)}.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-[30px]">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
              {error}
            </div>
          )}
          
          <p className="text-base text-[#040308]">
            Не получили письмо? Проверьте папку Спам
          </p>

          <Button
            onClick={handleResend}
            fullWidth
            disabled={isLoading || sent}
          >
            {isLoading ? 'Отправка...' : sent ? 'Отправлено! Подождите 30 сек' : 'Отправить еще раз'}
          </Button>
        </div>
      </div>
    </AuthLayout>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={
      <AuthLayout
        title="Юридический AI-ассистент"
        description="Иски, ходатайства и анализ судебной практики — за минуты"
      >
        <div className="flex flex-col gap-[100px] max-w-[554px]">
          <div className="flex flex-col gap-2.5">
            <h2 className="text-[32px] font-bold text-[#040308]">
              Загрузка...
            </h2>
          </div>
        </div>
      </AuthLayout>
    }>
      <VerifyContent />
    </Suspense>
  );
}
