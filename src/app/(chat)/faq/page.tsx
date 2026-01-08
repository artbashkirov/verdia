'use client';

import { useState } from 'react';
import { Sidebar } from '@/components/layout';
import { MobileHeader } from '@/components/layout/MobileHeader';
import { MobileSidebar } from '@/components/layout/MobileSidebar';
import { useTheme } from '@/lib/theme-context';
import { ChevronDown } from 'lucide-react';

interface FAQItem {
  question: string;
  answer: string | React.ReactNode;
}

const faqData: FAQItem[] = [
  {
    question: 'Где и как ищутся судебные дела?',
    answer: (
      <div className="space-y-3">
        <p>Verdia использует несколько источников для поиска судебных решений:</p>
        <ul className="list-disc ml-5 space-y-2">
          <li><strong>SudAct.ru</strong> — крупнейшая база судебных актов России, содержащая более 100 млн решений судов всех инстанций</li>
          <li><strong>Московский городской суд</strong> — официальный портал судов Москвы с актуальными решениями</li>
        </ul>
        <p>Поиск осуществляется по ключевым словам из вашего запроса, категории спора и применимым статьям законов. Система автоматически определяет тип дела и подбирает релевантную практику.</p>
      </div>
    ),
  },
  {
    question: 'Как рассчитывается вероятность успеха?',
    answer: (
      <div className="space-y-3">
        <p>Вероятность успеха рассчитывается на основе анализа нескольких факторов:</p>
        <ul className="list-disc ml-5 space-y-2">
          <li><strong>Судебная практика</strong> — анализируем соотношение удовлетворённых и отклонённых исков по аналогичным делам</li>
          <li><strong>Правовые основания</strong> — оцениваем наличие и силу правовых оснований для иска</li>
          <li><strong>История ответчика</strong> — если известен ответчик, учитываем его историю проигранных дел</li>
          <li><strong>Доказательная база</strong> — учитываем типичные требования судов к доказательствам</li>
        </ul>
        <p className="text-secondary-text text-sm">⚠️ Важно: расчёт вероятности носит ориентировочный характер и не является гарантией результата. Итоговое решение зависит от множества факторов, включая качество доказательств и позицию конкретного судьи.</p>
      </div>
    ),
  },
  {
    question: 'Какие данные использует ИИ для анализа?',
    answer: (
      <div className="space-y-3">
        <p>Для анализа вашей ситуации Verdia использует:</p>
        <ul className="list-disc ml-5 space-y-2">
          <li>Текст вашего запроса с описанием ситуации</li>
          <li>Актуальное законодательство РФ (Гражданский кодекс, Закон о защите прав потребителей и др.)</li>
          <li>Базу судебных решений по аналогичным делам</li>
          <li>Данные из вашего профиля (если заполнен) для определения подсудности</li>
        </ul>
        <p>Все данные обрабатываются конфиденциально и не передаются третьим лицам.</p>
      </div>
    ),
  },
  {
    question: 'Как определяется подсудность дела?',
    answer: (
      <div className="space-y-3">
        <p>Подсудность определяется автоматически на основе:</p>
        <ul className="list-disc ml-5 space-y-2">
          <li><strong>Тип спора</strong> — гражданские дела до 100 000 ₽ рассматриваются мировыми судьями, свыше — районными судами</li>
          <li><strong>Место жительства ответчика</strong> — общее правило подсудности</li>
          <li><strong>Место жительства истца</strong> — для споров о защите прав потребителей можно выбрать суд по месту жительства истца</li>
          <li><strong>Место исполнения договора</strong> — альтернативная подсудность</li>
        </ul>
        <p>Для точного определения суда заполните данные в профиле — это позволит автоматически подставлять правильный суд в документы.</p>
      </div>
    ),
  },
  {
    question: 'Можно ли доверять сгенерированным документам?',
    answer: (
      <div className="space-y-3">
        <p>Документы, созданные Verdia, соответствуют требованиям процессуального законодательства и могут использоваться как основа для подачи в суд. Однако рекомендуем:</p>
        <ul className="list-disc ml-5 space-y-2">
          <li>Внимательно проверить все даты, суммы и реквизиты</li>
          <li>Убедиться, что описание обстоятельств соответствует вашей ситуации</li>
          <li>При сложных делах проконсультироваться с юристом</li>
          <li>Проверить актуальность ссылок на законодательство</li>
        </ul>
        <p className="text-secondary-text text-sm">Verdia — это инструмент для подготовки документов, а не замена профессиональной юридической помощи в сложных случаях.</p>
      </div>
    ),
  },
  {
    question: 'Как часто обновляется база судебных решений?',
    answer: 'База судебных решений обновляется в режиме реального времени при каждом запросе. Мы не храним копии решений, а ищем актуальную информацию непосредственно в источниках. Это гарантирует, что вы получаете самую свежую судебную практику.',
  },
  {
    question: 'Что делать, если найдено мало судебных дел?',
    answer: (
      <div className="space-y-3">
        <p>Если по вашему запросу найдено мало релевантных дел, это может означать:</p>
        <ul className="list-disc ml-5 space-y-2">
          <li>Ситуация редкая или специфичная — попробуйте переформулировать запрос более общими терминами</li>
          <li>Дела по такой категории редко доходят до суда — возможно, споры чаще решаются в досудебном порядке</li>
          <li>Практика ещё не сформирована — для новых видов споров может не быть достаточно решений</li>
        </ul>
        <p>В любом случае система предоставит правовой анализ на основе действующего законодательства.</p>
      </div>
    ),
  },
  {
    question: 'Какие типы споров поддерживает Verdia?',
    answer: (
      <div className="space-y-3">
        <p>Verdia специализируется на гражданских спорах физических лиц:</p>
        <ul className="list-disc ml-5 space-y-2">
          <li>Защита прав потребителей (возврат товаров, некачественные услуги)</li>
          <li>Кредитные споры (навязанные услуги, страховки, незаконные комиссии)</li>
          <li>Жилищные споры (залив, ЖКХ, управляющие компании)</li>
          <li>Трудовые споры (увольнение, невыплата зарплаты)</li>
          <li>Договорные споры (неисполнение обязательств)</li>
          <li>Страховые споры (ОСАГО, КАСКО, отказ в выплате)</li>
        </ul>
        <p className="text-secondary-text text-sm">Для арбитражных, уголовных и административных дел рекомендуем обратиться к специализированным юристам.</p>
      </div>
    ),
  },
];

export default function FAQPage() {
  const { resolvedTheme } = useTheme();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [openItems, setOpenItems] = useState<number[]>([0]); // First item open by default

  const toggleItem = (index: number) => {
    setOpenItems(prev => 
      prev.includes(index) 
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>
      
      {/* Mobile Header */}
      <MobileHeader onMenuClick={() => setMobileSidebarOpen(true)} isMenuOpen={mobileSidebarOpen} />
      <MobileSidebar 
        isOpen={mobileSidebarOpen} 
        onClose={() => setMobileSidebarOpen(false)} 
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden pt-[60px] lg:p-2 lg:pl-0 lg:pb-2 bg-[#17181A]">
        <div className="flex-1 overflow-y-auto bg-background lg:rounded-2xl">
          <div className="max-w-3xl mx-auto px-4 py-8">
            {/* Header */}
            <div className="mb-8">
              <h1 className="text-2xl font-semibold text-foreground">Вопросы и ответы</h1>
              <p className="text-secondary-text mt-2">
                Узнайте, как работает Verdia и как получить максимум от сервиса
              </p>
            </div>

            {/* FAQ Items */}
            <div className="space-y-3">
              {faqData.map((item, index) => (
                <div 
                  key={index}
                  className="rounded-xl overflow-hidden"
                  style={{ backgroundColor: resolvedTheme === 'light' ? '#F3F3F3' : '#1E1E1F' }}
                >
                  <button
                    onClick={() => toggleItem(index)}
                    className="w-full flex items-center justify-between px-5 py-4 text-left hover:opacity-80 transition-opacity"
                  >
                    <span className="text-base font-medium text-foreground pr-4">
                      {item.question}
                    </span>
                    <ChevronDown 
                      className={`w-5 h-5 text-secondary-text shrink-0 transition-transform duration-200 ${
                        openItems.includes(index) ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  
                  {openItems.includes(index) && (
                    <div className="px-5 pb-5">
                      <div className="text-[15px] text-foreground leading-relaxed">
                        {item.answer}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Contact section */}
            <div 
              className="mt-8 p-5 rounded-xl"
              style={{ backgroundColor: resolvedTheme === 'light' ? '#F3F3F3' : '#1E1E1F' }}
            >
              <h3 className="text-base font-semibold text-foreground mb-2">
                Не нашли ответ на свой вопрос?
              </h3>
              <p className="text-[15px] text-secondary-text">
                Напишите нам на <a href="mailto:support@verdia.ru" className="text-foreground underline">support@verdia.ru</a> — мы обязательно поможем разобраться.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
