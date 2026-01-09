'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { LogoFull } from '@/components/icons';

interface AuthLayoutProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
}

// Тёмные CSS переменные для auth страниц
const darkThemeStyles: React.CSSProperties = {
  // @ts-expect-error CSS custom properties
  '--background': '#131314',
  '--foreground': '#ffffff',
  '--secondary-text': '#9a9a9a',
  '--gray-100': '#3a3a3a',
  '--gray-200': '#4a4a4a',
  '--gray-400': '#9a9a9a',
  '--border-color': 'rgba(255, 255, 255, 0.1)',
  '--input-bg': '#1E1E1F',
  paddingBottom: 'env(safe-area-inset-bottom)',
};

export function AuthLayout({ children, title = "Заголовок", description = "Краткое описание сервиса" }: AuthLayoutProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Триггерим анимацию после монтирования
    setIsLoaded(true);
  }, []);

  return (
    <div 
      className="w-full bg-[#131314] flex items-center justify-center lg:p-0"
      style={{
        ...darkThemeStyles,
        height: '100dvh',
        overflow: 'hidden',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%'
      }}
    >
      <div className="w-full h-full bg-[#131314] flex flex-col lg:flex-row" style={{ 
        height: '100%',
        overflow: 'hidden'
      }}>
        {/* Left panel with form - full width on mobile, 50% on desktop */}
        <div className="w-full lg:w-1/2 flex flex-col relative h-full">
          {/* Logo for mobile - centered at top, 63px from top */}
          <div className={`lg:hidden absolute top-[63px] left-1/2 -translate-x-1/2 z-10 transition-opacity duration-500 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}>
            <LogoFull variant="dark" size="small" />
          </div>
          
          {/* Form content - mobile: centered with padding, desktop: centered with 70px padding */}
          <div className="flex-1 flex items-center justify-center px-[24px] py-8 lg:px-[70px] lg:py-0 relative overflow-hidden">
            {/* Logo positioned at top center, 80px from top of screen, centered with form - visible on desktop, 32px height */}
            <div className={`hidden lg:block absolute top-[80px] left-1/2 -translate-x-1/2 z-10 transition-opacity duration-500 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}>
              <LogoFull variant="dark" size="default" />
            </div>
            
            {/* Form container - max-width 460px, full width on mobile up to 460px */}
            <div className={`flex flex-col gap-[40px] lg:gap-[56px] items-center w-full max-w-[460px] my-auto transition-all duration-700 ease-out ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
              {children}
            </div>
          </div>
        </div>

        {/* Right panel with image - 50% width on desktop, hidden on mobile */}
        <div className="hidden lg:flex w-1/2 h-full items-center p-[8px]">
          <div className={`relative w-full h-full bg-black rounded-[48px] overflow-hidden transition-opacity duration-700 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}>
            <Image
              src="/auth-bg.webp"
              alt="Verdia"
              fill
              className="object-cover"
              priority
              sizes="50vw"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

