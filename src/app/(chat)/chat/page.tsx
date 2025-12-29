'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar, ChatInput, MobileHeader, MobileSidebar } from '@/components/layout';
import { LogoFull } from '@/components/icons';

const exampleQueries = [
  {
    id: 1,
    text: 'Можно ли расторгнуть договор купли-продажи автомобиля и вернуть деньги, если выявлены скрытые недостатки?',
  },
  {
    id: 2,
    text: 'Как взыскать неустойку и штраф за просрочку возврата денежных средств по онлайн-покупке?',
  },
  {
    id: 3,
    text: 'Возможно ли уменьшить алименты или изменить порядок их выплаты?',
  },
  {
    id: 4,
    text: 'Как обязать управляющую компанию устранить протечку и возместить ущерб от залива квартиры?',
  },
  {
    id: 5,
    text: 'Можно ли оспорить незаконное увольнение и восстановиться на работе с выплатой среднего заработка?',
  },
  {
    id: 6,
    text: 'Можно ли взыскать компенсацию морального вреда за некачественную медицинскую услугу?',
  },
  {
    id: 7,
    text: 'Как взыскать долг по расписке, если должник уклоняется от возврата?',
  },
  {
    id: 8,
    text: 'Как признать договор навязанным и вернуть уплаченные деньги (страхование, сервисные программы и т.п.)?',
  },
  {
    id: 9,
    text: 'Можно ли признать сделку недействительной, если она заключена под давлением или в состоянии заблуждения?',
  },
];

export default function ChatPage() {
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  const handleSubmit = (message: string) => {
    // Store query and redirect immediately
    sessionStorage.setItem('pendingQuery', message);
    router.push(`/chat/new?q=${encodeURIComponent(message)}`);
  };

  const handleExampleClick = (text: string) => {
    handleSubmit(text);
  };

  const handleNewChat = () => {
    // Nothing to reset now
  };

  return (
    <div className="flex h-screen bg-[#0E0E0E]">
      {/* Mobile Header */}
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
      
      {/* Main content */}
      <div className="flex-1 p-0 md:p-2 md:pl-0 pt-[56px] md:pt-2 overflow-hidden">
        <div className="h-full bg-background md:rounded-2xl relative flex flex-col items-center justify-center md:justify-center min-h-0 px-4 md:px-0 pb-[88px] md:pb-0">
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
                  {exampleQueries.filter((_, i) => i % 3 === 0).map((query) => (
                    <button
                      key={query.id}
                      onClick={() => handleExampleClick(query.text)}
                      className="bg-gray-100 px-4 py-3 rounded-xl text-left hover:bg-gray-200 transition-colors"
                    >
                      <p className="text-[16px] lg:text-[16px] font-normal text-foreground leading-[24px] lg:leading-[24px]">
                        {query.text}
                      </p>
                    </button>
                  ))}
                </div>
                
                {/* Column 2 */}
                <div className="flex flex-col gap-3 flex-1">
                  {exampleQueries.filter((_, i) => i % 3 === 1).map((query) => (
                    <button
                      key={query.id}
                      onClick={() => handleExampleClick(query.text)}
                      className="bg-gray-100 px-4 py-3 rounded-xl text-left hover:bg-gray-200 transition-colors"
                    >
                      <p className="text-[16px] lg:text-[16px] font-normal text-foreground leading-[24px] lg:leading-[24px]">
                        {query.text}
                      </p>
                    </button>
                  ))}
                </div>
                
                {/* Column 3 */}
                <div className="flex flex-col gap-3 flex-1">
                  {exampleQueries.filter((_, i) => i % 3 === 2).map((query) => (
                    <button
                      key={query.id}
                      onClick={() => handleExampleClick(query.text)}
                      className="bg-gray-100 px-4 py-3 rounded-xl text-left hover:bg-gray-200 transition-colors"
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
                {exampleQueries.slice(0, 3).map((query) => (
                  <button
                    key={query.id}
                    onClick={() => handleExampleClick(query.text)}
                    className="bg-gray-100 px-4 py-3 rounded-xl text-left hover:bg-gray-200 transition-colors w-full"
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

          {/* Input */}
          <ChatInput onSubmit={handleSubmit} />
        </div>
      </div>
    </div>
  );
}
