'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Sidebar, ChatInput, ProbabilityBlock } from '@/components/layout';
import { DownloadIcon } from '@/components/icons';
import { generateDocx, downloadBlob } from '@/lib/docx-generator';
import { useTheme } from '@/lib/theme-context';

interface GenerationResponse {
  courtCases: Array<{
    id: number;
    title: string;
    url: string;
  }>;
  shortAnswer: {
    title: string;
    content: string;
    probability?: {
      percentage: number;
      level: string;
      casesWithResult?: number;
      totalCases?: number;
      satisfied?: number;
      partial?: number;
      rejected?: number;
      unknown?: number;
    };
  };
  legalAnalysis: {
    title: string;
    intro: string;
    points: string[];
    bases: string[];
  };
  practiceAnalysis: {
    intro: string;
    satisfied: {
      title: string;
      points: string[];
    };
    rejected: {
      title: string;
      points: string[];
    };
  };
  probability: {
    percentage?: number;
    level: string;
    factors?: string[];
    positiveFactors?: string[];
    negativeFactors?: string[];
    casesWithResult?: number;
    totalCases?: number;
    satisfied?: number;
    partial?: number;
    rejected?: number;
    unknown?: number;
  };
  recommendations: string[];
  documents: Array<{
    id: number;
    title: string;
    description: string;
    format: string;
    content?: string;
  }>;
}

function ResultContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const query = searchParams.get('q') || '';
  const [response, setResponse] = useState<GenerationResponse | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [visitedUrls, setVisitedUrls] = useState<Set<string>>(new Set());

  // Load visited URLs from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('visitedCourtCases');
    if (stored) {
      try {
        setVisitedUrls(new Set(JSON.parse(stored)));
      } catch (e) {
        console.error('Error loading visited URLs:', e);
      }
    }
  }, []);

  const markAsVisited = (url: string) => {
    setVisitedUrls(prev => {
      const updated = new Set(prev);
      updated.add(url);
      localStorage.setItem('visitedCourtCases', JSON.stringify([...updated]));
      return updated;
    });
  };

  // Close probability tooltip on click outside (mobile)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.probability-tooltip-container')) {
        document.querySelectorAll('.probability-tooltip').forEach(el => {
          el.classList.add('hidden');
          el.classList.remove('block');
        });
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    const stored = sessionStorage.getItem('lastResponse');
    if (stored) {
      try {
        const data = JSON.parse(stored);
        setResponse(data.response);
      } catch (e) {
        console.error('Error parsing stored response:', e);
      }
    }
  }, []);

  const handleNewChat = () => {
    router.push('/chat');
  };

  const handleSubmit = async () => {
    router.push('/chat');
  };

  const handleDownload = async (doc: { id: number; title: string; content?: string; format: string }) => {
    if (!doc.content) {
      alert('Содержимое документа недоступно. Пожалуйста, попробуйте обновить страницу или обратитесь в поддержку.');
      console.error('Document missing content:', doc);
      return;
    }
    
    setDownloadingId(doc.id);
    
    try {
      const blob = await generateDocx({
        title: doc.title,
        content: doc.content,
      });
      
      const filename = doc.title
        .replace(/[^\w\sа-яА-ЯёЁ]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 50) + '.docx';
      
      downloadBlob(blob, filename);
    } catch (err) {
      console.error('Error generating DOCX:', err);
      try {
        const blob = new Blob([doc.content], { type: 'text/plain;charset=utf-8' });
        downloadBlob(blob, `${doc.title}.txt`);
      } catch (fallbackErr) {
        console.error('Error creating fallback text file:', fallbackErr);
        alert('Не удалось создать файл. Пожалуйста, попробуйте еще раз.');
      }
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDownloadAll = async () => {
    if (!response?.documents) return;
    
    for (const doc of response.documents) {
      await handleDownload(doc);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  };

  if (!response) {
    return (
      <div className="flex bg-background" style={{ height: 'var(--viewport-height, 100vh)' }}>
        <Sidebar onNewChat={handleNewChat} />
        <div className="flex-1 p-0 md:p-2 md:pl-0 md:pb-2 bg-[#17181A]">
          <div className="h-full bg-background md:rounded-2xl overflow-hidden flex items-center justify-center">
            <div className="text-center">
              <p className="text-lg text-gray-400 mb-4">Результат не найден</p>
              <button
                onClick={handleNewChat}
                className="px-6 py-2 bg-[#212121] text-white rounded-xl hover:bg-[#3a3a3a] transition-colors"
              >
                Новый запрос
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex bg-background" style={{ 
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: '100%',
      height: '100dvh',
      overflow: 'hidden'
    }}>
      <Sidebar onNewChat={handleNewChat} />
      
        <div className="flex-1 flex flex-col p-0 md:p-2 md:pl-0 md:pb-2 bg-[#17181A] overflow-hidden" style={{
          minHeight: 0,
          height: 'calc(100dvh - 0px)' // нет шапки на result странице
        }}>
          <div className="flex-1 bg-background md:rounded-2xl overflow-hidden relative flex flex-col" style={{
            minHeight: 0
          }}>
          <div className="flex-1 overflow-y-auto overflow-x-hidden pt-6 md:pt-14 px-0 relative pb-[calc(56px+48px)] md:pb-[calc(56px+64px)]" style={{
            minHeight: 0,
            WebkitOverflowScrolling: 'touch'
          }}>
            <div className="w-full md:max-w-[660px] md:mx-auto flex flex-col gap-8 break-words" style={{ paddingLeft: '16px', paddingRight: '16px' }}>
              <h1 className="text-[20px] lg:text-[32px] font-medium text-foreground leading-[28px] lg:leading-[40px] tracking-tight break-words md:mt-0">
                {query}
              </h1>

              {response.courtCases && response.courtCases.length > 0 && (
                <div className="flex flex-col gap-4 -mx-4 md:mx-0">
                  <p className="text-[11px] lg:text-[12px] font-medium text-gray-400 uppercase tracking-tight leading-[14px] lg:leading-[14px] px-4 md:px-0">
                    Судебные дела
                  </p>
                  <div 
                    className="hide-horizontal-scrollbar overflow-x-auto overflow-y-hidden pl-4 pr-4 md:pl-0 md:pr-0"
                    style={{ 
                      display: 'flex',
                      gap: '8px',
                      paddingBottom: '4px',
                      WebkitOverflowScrolling: 'touch',
                      msOverflowStyle: 'none',
                      scrollbarWidth: 'none'
                    }}
                  >
                    {response.courtCases.map((c) => (
                      <a
                        key={c.id}
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                            onClick={() => markAsVisited(c.url)}
                        style={{ 
                          opacity: visitedUrls.has(c.url) ? 0.5 : 1,
                              backgroundColor: resolvedTheme === 'light' ? '#F3F3F3' : '#1E1E1F',
                          width: '240px',
                          minWidth: '240px',
                          flexShrink: 0,
                          padding: '12px',
                          borderRadius: '16px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px',
                          textDecoration: 'none',
                          transition: 'background-color 0.2s, opacity 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = resolvedTheme === 'light' ? '#E5E5E5' : '#4a4a4a'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = resolvedTheme === 'light' ? '#F3F3F3' : '#1E1E1F'}
                      >
                        <p className="text-[13px] lg:text-[14px] font-medium text-foreground leading-[18px] lg:leading-[20px] line-clamp-3" style={{ margin: 0 }}>
                          {c.title}
                        </p>
                        <p className="text-[11px] md:text-[12px] font-medium text-gray-400 leading-[14px]" style={{ margin: 0 }}>
                          {c.url?.includes('sudact.ru') ? 'sudact.ru' : 
                           c.url?.includes('help.mos-gorsud.ru') ? 'help.mos-gorsud.ru' : 'mos-gorsud.ru'}
                        </p>
                      </a>
                    ))}
                    {/* Spacer для последней карточки */}
                    <div style={{ minWidth: '8px', flexShrink: 0 }} />
                  </div>
                </div>
              )}

              <div className="h-px bg-gray-200" />

              {response.shortAnswer && (
                <div className="flex flex-col gap-4">
                  <p className="text-[11px] lg:text-[12px] font-medium text-gray-400 uppercase tracking-tight leading-[14px] lg:leading-[14px]">
                    Краткий ответ
                  </p>
                  <div className="text-base text-foreground leading-[24px] break-words">
                    <p className="mb-3 text-[18px] lg:text-[24px] leading-[24px] lg:leading-[30px] font-semibold break-words">{response.shortAnswer.title}</p>
                    <p className="break-words">{response.shortAnswer.content}</p>
                    {(response.shortAnswer.probability || response.probability) && (
                      <ProbabilityBlock 
                        probData={response.shortAnswer.probability || response.probability} 
                        resolvedTheme={resolvedTheme} 
                      />
                    )}
                  </div>
                </div>
              )}

              <div className="h-px bg-gray-200" />

              {response.legalAnalysis && (
                <div className="flex flex-col gap-4">
                  <p className="text-[11px] lg:text-[12px] font-medium text-gray-400 uppercase tracking-tight leading-[14px] lg:leading-[14px]">
                    Правовой анализ
                  </p>
                  <div className="text-base text-foreground leading-[24px] break-words">
                    {response.legalAnalysis.title && (
                      <p className="text-[18px] lg:text-[24px] leading-[24px] lg:leading-[30px] font-semibold mb-3 break-words">{response.legalAnalysis.title}</p>
                    )}
                    {response.legalAnalysis.intro && (
                      <p className="mb-3 break-words">{response.legalAnalysis.intro}</p>
                    )}
                    {response.legalAnalysis.points && response.legalAnalysis.points.length > 0 && (
                      <ul className="list-disc ml-5 mb-3 break-words">
                        {response.legalAnalysis.points.map((point, i) => (
                          <li key={i} className="mb-2 last:mb-0 break-words">{point}</li>
                        ))}
                      </ul>
                    )}
                    {response.legalAnalysis.bases && response.legalAnalysis.bases.length > 0 && (
                      <>
                        <p className="text-[18px] lg:text-[24px] leading-[24px] lg:leading-[30px] font-semibold mb-3 mt-3 lg:mt-4 break-words">Основания:</p>
                        <ul className="list-disc ml-5 break-words">
                          {response.legalAnalysis.bases.map((base, i) => (
                            <li key={i} className="mb-2 last:mb-0 break-words">{base}</li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                </div>
              )}

              <div className="h-px bg-gray-200" />

              {response.practiceAnalysis && (
                <div className="flex flex-col gap-4">
                  <p className="text-[11px] lg:text-[12px] font-medium text-gray-400 uppercase tracking-tight leading-[14px] lg:leading-[14px]">
                    Анализ судебной практики
                  </p>
                  <div className="text-base text-foreground leading-[24px] break-words">
                    <p className="mb-3 break-words">{response.practiceAnalysis.intro}</p>
                    
                    {response.practiceAnalysis.satisfied && (
                      <>
                        <p className="text-[18px] lg:text-[24px] leading-[24px] lg:leading-[30px] font-semibold mb-3 mt-3 lg:mt-4 break-words">{response.practiceAnalysis.satisfied.title}</p>
                        <ul className="list-disc ml-5 mb-3 break-words">
                          {response.practiceAnalysis.satisfied.points.map((point, i) => (
                            <li key={i} className="mb-2 last:mb-0 break-words">{point}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    
                    {response.practiceAnalysis.rejected && (
                      <>
                        <p className="text-[18px] lg:text-[24px] leading-[24px] lg:leading-[30px] font-semibold mb-3 mt-3 lg:mt-4 break-words">{response.practiceAnalysis.rejected.title}</p>
                        <ul className="list-disc ml-5 break-words">
                          {response.practiceAnalysis.rejected.points.map((point, i) => (
                            <li key={i} className="mb-2 last:mb-0 break-words">{point}</li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                </div>
              )}

              <div className="h-px bg-gray-200" />

              {response.recommendations && (
                <div className="flex flex-col gap-4">
                  <p className="text-[11px] lg:text-[12px] font-medium text-gray-400 uppercase tracking-tight leading-[14px] lg:leading-[14px]">
                    Рекомендованные действия
                  </p>
                  <ol className="list-decimal ml-5 text-base text-foreground leading-[24px] break-words" style={{ fontFamily: 'var(--font-inter), Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                    {response.recommendations.map((rec, i) => (
                      <li key={i} className="mb-2 last:mb-0 break-words">{rec}</li>
                    ))}
                  </ol>
                </div>
              )}

              <div className="h-px bg-gray-200" />

              {/* Next Steps - Document Offer */}
              <div className="flex flex-col gap-4">
                <p className="text-[11px] lg:text-[12px] font-medium text-gray-400 uppercase tracking-tight leading-[14px] lg:leading-[14px]">
                  Что дальше?
                </p>
                <div className="p-4 rounded-xl bg-[#F3F3F3]">
                  <p className="text-base text-foreground mb-4">
                    <strong>Хотите, чтобы я подготовил документы?</strong>
                  </p>
                  <p className="text-sm text-gray-500 mb-4">
                    Могу составить для вас:
                  </p>
                  <ul className="text-sm text-foreground space-y-2 mb-4">
                    <li>📄 <strong>Исковое заявление</strong> — для подачи в суд</li>
                    <li>📝 <strong>Претензию</strong> — для досудебного урегулирования</li>
                    <li>📋 <strong>Ходатайство</strong> — для заявления в процессе</li>
                    <li>⚖️ <strong>Возражения на иск</strong> — для защиты от требований</li>
                  </ul>
                  <p className="text-sm text-gray-500">
                    Напишите в чат какой документ вам нужен
                  </p>
                </div>
              </div>

              {/* Divider - only show if documents follow */}
              {response.documents && response.documents.length > 0 && (
                <div className="h-px bg-gray-200" />
              )}

              {response.documents && response.documents.length > 0 && (
                <div className="flex flex-col gap-4">
                  <p className="text-[11px] lg:text-[12px] font-medium text-gray-400 uppercase tracking-tight leading-[14px] lg:leading-[14px]">
                    Подготовленные документы
                  </p>
                  
                  <div className="text-base text-foreground leading-[24px] flex flex-col gap-5 break-words">
                    {response.documents.map((doc, i) => (
                      <div key={doc.id}>
                        <p className="mb-3 break-words">{i + 1}. {doc.title}</p>
                        <p className="break-words">{doc.description}</p>
                      </div>
                    ))}
                  </div>
                  
                  <div className="flex flex-col gap-3 mt-2">
                    {response.documents.map((doc) => (
                      <button
                        key={doc.id}
                        onClick={() => handleDownload(doc)}
                        disabled={downloadingId === doc.id}
                        className="w-full flex items-center justify-between px-4 py-3 border border-gray-200 rounded-xl bg-white hover:bg-gray-100 transition-colors disabled:opacity-50"
                      >
                        <div className="flex flex-col items-start min-w-0 flex-1 mr-4">
                          <p className="text-sm font-medium text-foreground truncate w-full text-left">
                            {doc.title}
                          </p>
                          <p className="text-xs text-gray-400 uppercase">
                            {downloadingId === doc.id ? 'Генерация...' : 'docx'}
                          </p>
                        </div>
                        {downloadingId === doc.id ? (
                          <div className="w-[18px] h-[18px] border-2 border-foreground border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <DownloadIcon className="w-5 h-5 text-foreground shrink-0" strokeWidth="1.75" />
                        )}
                      </button>
                    ))}
                  </div>
                  
                  <button 
                    onClick={handleDownloadAll}
                    disabled={downloadingId !== null}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-[#3a3a3a] dark:hover:bg-gray-200 transition-colors self-start disabled:opacity-50"
                    style={{ 
                      backgroundColor: resolvedTheme === 'light' ? '#212121' : '#ffffff',
                      color: resolvedTheme === 'light' ? '#ffffff' : '#000000'
                    }}
                  >
                    <DownloadIcon 
                      className="w-4 h-4" 
                      strokeWidth="1.5"
                    />
                    <span className="text-sm font-medium">Скачать все</span>
                  </button>
                </div>
              )}
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

export default function ResultPage() {
  return (
    <Suspense fallback={
      <div className="flex bg-background items-center justify-center" style={{ height: 'var(--viewport-height, 100vh)' }}>
        <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ResultContent />
    </Suspense>
  );
}
