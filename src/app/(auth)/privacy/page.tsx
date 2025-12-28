'use client';

import Link from 'next/link';
import { AuthLayout } from '@/components/layout';

export default function PrivacyPage() {
  return (
    <AuthLayout>
      <div className="flex flex-col gap-[28px] items-start w-full max-w-[800px]">
        <div className="flex flex-col gap-[4px] lg:gap-[10px] items-start w-full">
          <h1 className="text-[20px] lg:text-[32px] font-normal leading-[28px] lg:leading-[40px] text-white">
            Политика конфиденциальности
          </h1>
          <p className="text-[16px] lg:text-[16px] font-normal leading-[24px] lg:leading-[24px] text-[#808080] lg:tracking-[-0.24px]">
            Как мы собираем, используем и защищаем ваши данные
          </p>
        </div>

        <div className="flex flex-col gap-6 text-white">
          <section className="flex flex-col gap-4">
            <h2 className="text-[18px] lg:text-[24px] font-semibold leading-[24px] lg:leading-[30px]">1. Сбор информации</h2>
            <p className="text-[16px] leading-[24px] text-[#808080]">
              Мы собираем информацию, которую вы предоставляете при регистрации и использовании Сервиса, 
              включая имя, email и данные, которые вы вводите при работе с документами.
            </p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-[24px] font-semibold">2. Использование информации</h2>
            <p className="text-[16px] leading-[24px] text-[#808080]">
              Собранная информация используется для предоставления и улучшения Сервиса, 
              обработки ваших запросов и обеспечения безопасности.
            </p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-[24px] font-semibold">3. Защита данных</h2>
            <p className="text-[16px] leading-[24px] text-[#808080]">
              Мы применяем современные методы шифрования и защиты данных для обеспечения 
              безопасности вашей персональной информации.
            </p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-[24px] font-semibold">4. Передача данных третьим лицам</h2>
            <p className="text-[16px] leading-[24px] text-[#808080]">
              Мы не передаем ваши персональные данные третьим лицам, за исключением случаев, 
              предусмотренных законодательством или с вашего явного согласия.
            </p>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="text-[24px] font-semibold">5. Ваши права</h2>
            <p className="text-[16px] leading-[24px] text-[#808080]">
              Вы имеете право запросить доступ к вашим данным, их исправление или удаление. 
              Для этого свяжитесь с нами через форму обратной связи.
            </p>
          </section>
        </div>

        <div className="flex flex-col gap-4 w-full mt-8">
          <Link 
            href="/register" 
            className="text-[#5d89d5] text-[13px] lg:text-[14px] leading-[16px] lg:leading-[16px] hover:underline"
          >
            ← Вернуться к регистрации
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
}

