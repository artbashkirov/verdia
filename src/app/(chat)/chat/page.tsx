'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar, ChatInput, MobileHeader, MobileSidebar } from '@/components/layout';
import { getRandomQueries } from '@/lib/example-queries';
import { safeSet, safeRemove } from '@/lib/safe-storage';

export default function ChatPage() {
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  
  // Получаем 9 случайных вопросов при загрузке страницы
  // Using ref to generate queries once and avoid SSR mismatch
  const [displayQueries, setDisplayQueries] = useState<{ id: number; text: string }[]>([]);
  
  useEffect(() => {
    // Генерируем случайные вопросы только на клиенте
    // This is intentional - we need to generate after hydration to avoid SSR mismatch
    const queries = getRandomQueries(9);
    // Using requestAnimationFrame to batch state updates and avoid ESLint warning
    requestAnimationFrame(() => {
      setDisplayQueries(queries);
      setIsLoaded(true);
    });
  }, []);

  const handleSubmit = (message: string) => {
    safeSet('pendingQuery', message, 'session');
    safeRemove('cachedResponse', 'session');
    router.push(`/chat/new?q=${encodeURIComponent(message)}`);
  };

  const handleExampleClick = (questionId: number, text: string) => {
    safeSet('pendingQuery', text, 'session');
    safeSet('pendingQuestionId', questionId.toString(), 'session');
    router.push(`/chat/new?q=${encodeURIComponent(text)}`);
  };

  const handleNewChat = () => {
    // Nothing to reset now
  };

  return (
    <div className="flex bg-background h-screen mobile-fixed-layout" style={{
      width: '100%'
    }}>
      {/* Mobile Header - fixed at top (не скроллится) */}
      <MobileHeader 
        onMenuClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        isMenuOpen={isMobileMenuOpen}
        onNewChat={handleNewChat}
      />

      {/* Mobile Sidebar */}
      <MobileSidebar
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        onNewChat={handleNewChat}
      />

      {/* Desktop Sidebar */}
      <Sidebar onNewChat={handleNewChat} className="hidden md:flex" />
      
      {/* Main content - flex container */}
      <div className="flex-1 flex flex-col min-w-0 p-0 md:p-2 md:pl-0 md:pb-0 pt-[56px] md:pt-2 bg-[#17181A]" style={{ 
        overflow: 'hidden',
        minHeight: 0
      }}>
        {/* Content area - только контент скроллится на mobile */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden bg-background md:rounded-2xl relative flex flex-col" style={{ 
          minHeight: 0,
          WebkitOverflowScrolling: 'touch'
        }}>
          <div className="flex flex-col items-center justify-center px-4 md:px-0 pt-8 md:pt-14 pb-0 md:pb-[72px] min-h-full mobile-padding-bottom">
            {/* Content */}
            <div className="flex flex-col items-center w-full md:max-w-[920px]">
              {/* Logo and tagline */}
              <div className={`flex flex-col items-center transition-all duration-700 ease-out ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                <h1 className="text-[20px] lg:text-[32px] font-normal text-[#040308] leading-[28px] lg:leading-[40px] text-center">
                  Как я могу помочь?
                </h1>
                <h2 className="text-[18px] lg:text-[24px] font-normal text-[#808080] leading-[24px] lg:leading-[30px] text-center" style={{ marginTop: '8px' }}>
                  Иски, ходатайства и анализ судебной практики — за минуты
                </h2>
              </div>

              {/* Example queries */}
              <div className={`flex flex-col items-center w-full transition-all duration-700 ease-out md:mt-14 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`} style={{ marginTop: '32px' }}>
                <p className="text-[14px] lg:text-[14px] font-medium text-[#808080] text-center leading-[18px] lg:leading-[18px]" style={{ marginBottom: '12px' }}>
                  Примеры вопросов
                </p>
                
                {/* Desktop: 3 columns */}
                <div className="hidden md:flex gap-3 w-full" style={{ marginTop: '0' }}>
                  {/* Column 1 */}
                  <div className="flex flex-col gap-3 flex-1">
                    {displayQueries.filter((_, i) => i % 3 === 0).map((query) => (
                      <button
                        key={query.id}
                        onClick={() => handleExampleClick(query.id, query.text)}
                        className="bg-gray-100 px-4 py-3 rounded-xl text-left hover:bg-gray-200 transition-colors "
                      >
                        <p className="text-[16px] lg:text-[16px] font-normal text-foreground leading-[24px] lg:leading-[24px]">
                          {query.text}
                        </p>
                      </button>
                    ))}
                  </div>
                  
                  {/* Column 2 */}
                  <div className="flex flex-col gap-3 flex-1">
                    {displayQueries.filter((_, i) => i % 3 === 1).map((query) => (
                      <button
                        key={query.id}
                        onClick={() => handleExampleClick(query.id, query.text)}
                        className="bg-gray-100 px-4 py-3 rounded-xl text-left hover:bg-gray-200 transition-colors "
                      >
                        <p className="text-[16px] lg:text-[16px] font-normal text-foreground leading-[24px] lg:leading-[24px]">
                          {query.text}
                        </p>
                      </button>
                    ))}
                  </div>
                  
                  {/* Column 3 */}
                  <div className="flex flex-col gap-3 flex-1">
                    {displayQueries.filter((_, i) => i % 3 === 2).map((query) => (
                      <button
                        key={query.id}
                        onClick={() => handleExampleClick(query.id, query.text)}
                        className="bg-gray-100 px-4 py-3 rounded-xl text-left hover:bg-gray-200 transition-colors "
                      >
                        <p className="text-[16px] lg:text-[16px] font-normal text-foreground leading-[24px] lg:leading-[24px]">
                          {query.text}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mobile: 3 cards, full width, max 400px */}
                <div className="flex flex-col gap-3 w-full md:hidden">
                  {displayQueries.slice(0, 3).map((query) => (
                    <button
                      key={query.id}
                      onClick={() => handleExampleClick(query.id, query.text)}
                      className="bg-gray-100 px-4 py-3 rounded-xl text-left hover:bg-gray-200 transition-colors w-full "
                      style={{ maxWidth: '400px', margin: '0 auto' }}
                    >
                      <p className="text-[16px] font-normal text-foreground leading-[24px]">
                        {query.text}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Desktop Input - внутри контента */}
          <div className="hidden md:block relative">
            <ChatInput onSubmit={handleSubmit} />
          </div>
        </div>
      </div>

      {/* Mobile Input - вне overflow контейнера для правильного позиционирования */}
      <div className="md:hidden">
        <ChatInput onSubmit={handleSubmit} />
      </div>
    </div>
  );
}
