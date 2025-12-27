'use client';

import Link from 'next/link';
import { AuthLayout } from '@/components/layout';

export default function TermsPage() {
  return (
    <AuthLayout>
      <div className="flex flex-col gap-[28px] items-start w-full max-w-[800px]">
        <div className="flex flex-col gap-[4px] lg:gap-[10px] items-start w-full">
          <h1 className="text-[20px] lg:text-[32px] font-normal leading-[28px] lg:leading-[normal] text-white">
            Правила сервиса
          </h1>
          <p className="text-[16px] lg:text-[24px] font-normal leading-[20px] lg:leading-[30px] text-[#808080] lg:tracking-[-0.24px]">
            Условия использования платформы Verdia
          </p>
        </div>

        <div className="flex flex-col gap-6 text-white">
          <section className="flex flex-col gap-4">
            <h2 className="text-[24px] font-semibold">1. Общие положения</h2>
            <p className="text-[16px] leading-[24px] text-[#808080]">
              Настоящие Правила сервиса (далее — «Правила») определяют условия использования 
              платформы Verdia (далее — «Сервис»). Используя Сервис, вы соглашаетесь с данными Правилами.
            </p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-[24px] font-semibold">2. Использование сервиса</h2>
            <p className="text-[16px] leading-[24px] text-[#808080]">
              Сервис предоставляет инструменты для работы с юридическими документами и анализа 
              судебной практики. Вы обязуетесь использовать Сервис только в законных целях.
            </p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-[24px] font-semibold">3. Интеллектуальная собственность</h2>
            <p className="text-[16px] leading-[24px] text-[#808080]">
              Все материалы Сервиса, включая программное обеспечение, дизайн, тексты и графику, 
              являются интеллектуальной собственностью Verdia и защищены законом.
            </p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-[24px] font-semibold">4. Ограничение ответственности</h2>
            <p className="text-[16px] leading-[24px] text-[#808080]">
              Сервис предоставляется «как есть». Мы не гарантируем абсолютную точность результатов 
              и не несем ответственности за решения, принятые на основе информации, полученной через Сервис.
            </p>
          </section>
        </div>

        <div className="flex flex-col gap-4 w-full mt-8">
          <Link 
            href="/register" 
            className="text-[#5d89d5] text-[13px] lg:text-[14px] leading-[16px] lg:leading-[18px] hover:underline"
          >
            ← Вернуться к регистрации
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
}

