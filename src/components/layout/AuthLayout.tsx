'use client';

import { LogoFull } from '@/components/icons';

interface AuthLayoutProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
}

export function AuthLayout({ children, title = "Заголовок", description = "Краткое описание сервиса" }: AuthLayoutProps) {
  return (
    <div className="min-h-screen w-full flex">
      {/* Left dark panel - hidden on mobile */}
      <div className="hidden md:block w-[686px] min-h-screen bg-[#212121] p-[100px] flex flex-col justify-between shrink-0">
        <LogoFull variant="light" />
        <div className="flex flex-col gap-5 text-white">
          <h1 className="text-[40px] font-bold leading-tight max-w-[519px]">
            {title}
          </h1>
          <p className="text-2xl font-normal max-w-[519px]">
            {description}
          </p>
        </div>
      </div>

      {/* Right white panel */}
      <div className="flex-1 min-h-screen bg-background px-4 py-8 md:p-[100px] flex flex-col md:justify-between justify-center md:justify-between">
        {children}
      </div>
    </div>
  );
}

