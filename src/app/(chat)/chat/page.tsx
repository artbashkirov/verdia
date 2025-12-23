'use client';

import { useRouter } from 'next/navigation';
import { Sidebar, ChatInput } from '@/components/layout';
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
      <Sidebar onNewChat={handleNewChat} />
      
      {/* Main content */}
      <div className="flex-1 p-2 pl-0">
        <div className="h-full bg-background rounded-2xl relative overflow-hidden flex flex-col items-center justify-center">
          {/* Content */}
          <div className="flex flex-col items-center gap-14 max-w-[920px] px-4">
            {/* Logo and tagline */}
            <div className="flex flex-col items-center gap-4">
              <LogoFull variant="dark" />
              <p className="text-base text-foreground text-center leading-6">
                Иски, ходатайства и анализ судебной практики — за минуты
              </p>
            </div>

            {/* Example queries */}
            <div className="flex flex-col items-center gap-4 w-full">
              <p className="text-base font-semibold text-foreground text-center">
                Примеры запросов
              </p>
              
              <div className="flex gap-3 w-full">
                {/* Column 1 */}
                <div className="flex flex-col gap-3 flex-1">
                  {exampleQueries.filter((_, i) => i % 3 === 0).map((query) => (
                    <button
                      key={query.id}
                      onClick={() => handleExampleClick(query.text)}
                      className="bg-gray-100 px-4 py-3 rounded-xl text-left hover:bg-gray-200 dark:hover:bg-[#4a4a4a] transition-colors"
                    >
                      <p className="text-sm font-medium text-foreground leading-[18px]">
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
                      className="bg-gray-100 px-4 py-3 rounded-xl text-left hover:bg-gray-200 dark:hover:bg-[#4a4a4a] transition-colors"
                    >
                      <p className="text-sm font-medium text-foreground leading-[18px]">
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
                      className="bg-gray-100 px-4 py-3 rounded-xl text-left hover:bg-gray-200 dark:hover:bg-[#4a4a4a] transition-colors"
                    >
                      <p className="text-sm font-medium text-foreground leading-[18px]">
                        {query.text}
                      </p>
                    </button>
                  ))}
                </div>
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
