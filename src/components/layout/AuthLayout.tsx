'use client';

import { LogoFull } from '@/components/icons';

interface AuthLayoutProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
}

export function AuthLayout({ children, title = "Заголовок", description = "Краткое описание сервиса" }: AuthLayoutProps) {
  return (
    <div className="min-h-screen w-full bg-[#131314] flex items-center justify-center p-4 lg:p-0">
      <div className="w-full h-screen lg:h-screen bg-[#131314] flex overflow-hidden">
        {/* Left panel with form - 50% width on desktop */}
        <div className="w-full lg:w-1/2 flex flex-col relative">
          {/* Logo for mobile - centered at top */}
          <div className="lg:hidden mb-8 pt-8 flex justify-center">
            <LogoFull variant="light" size="small" />
          </div>
          
          {/* Form content centered horizontally and vertically with 70px padding from edges */}
          <div className="flex-1 flex items-center justify-center p-8 lg:px-[70px] lg:py-0 relative">
            {/* Logo positioned at top center, 80px from top of screen, centered with form - visible on desktop, 36px height */}
            <div className="hidden lg:block absolute top-[80px] left-1/2 -translate-x-1/2 z-10">
              <LogoFull variant="light" size="default" />
            </div>
            
            <div className="flex flex-col gap-8 lg:gap-[56px] items-center w-full max-w-[460px]">
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

