'use client';

import { LogoFull } from '@/components/icons';

interface AuthLayoutProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
}

export function AuthLayout({ children, title = "Заголовок", description = "Краткое описание сервиса" }: AuthLayoutProps) {
  return (
    <div className="h-screen w-full bg-[#131314] flex items-center justify-center lg:p-0 overflow-hidden">
      <div className="w-full h-full bg-[#131314] flex flex-col lg:flex-row overflow-hidden">
        {/* Left panel with form - full width on mobile, 50% on desktop */}
        <div className="w-full lg:w-1/2 flex flex-col relative h-full">
          {/* Logo for mobile - centered at top, 63px from top */}
          <div className="lg:hidden absolute top-[63px] left-1/2 -translate-x-1/2 z-10">
            <LogoFull variant="light" size="small" />
          </div>
          
          {/* Form content - mobile: centered with padding, desktop: centered with 70px padding */}
          <div className="flex-1 flex items-center justify-center px-[24px] py-8 lg:px-[70px] lg:py-0 relative overflow-y-auto">
            {/* Logo positioned at top center, 80px from top of screen, centered with form - visible on desktop, 32px height */}
            <div className="hidden lg:block absolute top-[80px] left-1/2 -translate-x-1/2 z-10">
              <LogoFull variant="light" size="default" />
            </div>
            
            {/* Form container - max-width 460px, full width on mobile up to 460px */}
            <div className="flex flex-col gap-[40px] lg:gap-[56px] items-center w-full max-w-[460px] my-auto">
              {children}
            </div>
          </div>
        </div>

        {/* Right empty dark panel - 50% width on desktop, hidden on mobile */}
        <div className="hidden lg:flex w-1/2 h-full items-center p-[8px]">
          <div className="w-full h-full bg-[#1e1f20] rounded-[48px]" />
        </div>
      </div>
    </div>
  );
}

