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
      <div className="hidden md:flex w-[686px] min-h-screen bg-[#212121] p-[100px] flex-col justify-between shrink-0">
        <LogoFull variant="light" />
        <div className="flex flex-col gap-[20px] text-white">
          <h1 className="text-[32px] font-bold leading-tight w-fit">
            {title}
          </h1>
          <p className="text-[24px] font-normal w-fit leading-[32px]">
            {description}
          </p>
        </div>
      </div>

      {/* Right white panel */}
      <div className="flex-1 min-h-screen bg-white px-4 py-8 md:w-[754px] md:px-[32px] md:py-[100px] flex flex-col md:items-center">
        <div className="flex flex-col md:my-auto w-full">
          {children}
        </div>
      </div>
    </div>
  );
}

