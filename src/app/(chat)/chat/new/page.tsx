'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Sidebar, ChatInput, MobileHeader, MobileSidebar } from '@/components/layout';
import { DownloadIcon } from '@/components/icons';
import { generateDocx, downloadBlob } from '@/lib/docx-generator';
import { useTheme } from '@/lib/theme-context';

interface GenerationResponse {
  courtCases?: Array<{
    id: number;
    title: string;
    url: string;
  }>;
  shortAnswer?: {
    title: string;
    content: string;
  };
  legalAnalysis?: {
    title: string;
    intro: string;
    points: string[];
    bases: string[];
  };
  practiceAnalysis?: {
    intro: string;
    satisfied?: {
      title: string;
      points: string[];
    };
    rejected?: {
      title: string;
      points: string[];
    };
  };
  probability?: {
    level: string;
    factors: string[];
  };
  recommendations?: string[];
  documents?: Array<{
    id: number;
    title: string;
    description: string;
    format: string;
    content?: string;
  }>;
}

export default function NewChatPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { resolvedTheme } = useTheme();
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState<GenerationResponse | null>(null);
  const [isGenerating, setIsGenerating] = useState(true);
  const [error, setError] = useState('');
  const [chatId, setChatId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const hasStartedGeneration = useRef(false);

  useEffect(() => {
    // Only run once - if generation already started, don't do anything
    if (hasStartedGeneration.current) {
      return;
    }

    // Get query from URL params or sessionStorage
    const urlQuery = searchParams.get('q');
    const storedQuery = sessionStorage.getItem('pendingQuery');
    
    const queryToUse = urlQuery || storedQuery;
    
    if (!queryToUse) {
      router.push('/chat');
      return;
    }

    // Mark as started immediately to prevent re-runs
    hasStartedGeneration.current = true;
    
    setQuery(queryToUse);
    sessionStorage.removeItem('pendingQuery');

    // Generate response
    generateResponse(queryToUse);
  }, []); // Empty deps - only run on mount

  const generateResponse = async (queryText: string) => {
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: queryText }),
      });

      let data;
      try {
        data = await res.json();
      } catch (jsonError) {
        console.error('Failed to parse JSON response:', jsonError);
        throw new Error('Ошибка при обработке ответа сервера');
      }

      if (!res.ok) {
        const errorMessage = data?.error || `Ошибка ${res.status}: ${res.statusText}`;
        console.error('API error:', errorMessage, data);
        throw new Error(errorMessage);
      }

      if (!data || !data.response) {
        console.error('Invalid response data:', data);
        throw new Error('Некорректный ответ от сервера');
      }

      setResponse(data.response);
      setChatId(data.id);
      
      // Update URL without reload
      if (data.id) {
        window.history.replaceState({}, '', `/chat/${data.id}`);
      }

      // Store in sessionStorage for page reload
      sessionStorage.setItem('lastResponse', JSON.stringify(data));

    } catch (err) {
      console.error('Generation error:', err);
      const errorMessage = err instanceof Error 
        ? err.message 
        : 'Произошла ошибка при генерации ответа. Попробуйте еще раз.';
      setError(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleNewChat = () => {
    router.push('/chat');
  };

  const handleDownload = async (doc: { id: number; title: string; content?: string; format: string }) => {
    if (!doc.content) {
      alert('Содержимое документа недоступно');
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
      const blob = new Blob([doc.content], { type: 'text/plain;charset=utf-8' });
      downloadBlob(blob, `${doc.title}.txt`);
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

  return (
    <div className="flex h-screen bg-[#0E0E0E]">
      <MobileHeader 
        onMenuClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        isMenuOpen={isMobileMenuOpen}
        onNewChat={handleNewChat}
      />
      <MobileSidebar
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        currentChatId={chatId || undefined}
        onNewChat={handleNewChat}
      />
      <Sidebar currentChatId={chatId || undefined} onNewChat={handleNewChat} className="hidden md:flex" />
      
      <div className="flex-1 p-0 md:p-2 md:pl-0 pt-[56px] md:pt-2">
        <div className="h-full bg-background md:rounded-2xl relative flex flex-col">
          {/* Scrollable content */}
          <div 
            ref={contentRef} 
            className="flex-1 overflow-y-auto pt-6 md:pt-14 pb-36 px-0 relative"
            style={{
              maskImage: 'linear-gradient(to bottom, black 0%, black calc(100% - 120px), rgba(0, 0, 0, 0.9) calc(100% - 112px), rgba(0, 0, 0, 0.6) calc(100% - 96px), rgba(0, 0, 0, 0.3) calc(100% - 80px), transparent calc(100% - 72px))',
              WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black calc(100% - 120px), rgba(0, 0, 0, 0.9) calc(100% - 112px), rgba(0, 0, 0, 0.6) calc(100% - 96px), rgba(0, 0, 0, 0.3) calc(100% - 80px), transparent calc(100% - 72px))'
            }}
          >
            <div className="w-full md:max-w-[660px] md:mx-auto flex flex-col gap-8 break-words" style={{ paddingLeft: '16px', paddingRight: '16px', position: 'relative' }}>
              {/* Query */}
              <h1 className="text-[20px] lg:text-[32px] font-medium text-foreground leading-[28px] lg:leading-[40px] tracking-tight break-words md:mt-0">
                {query}
              </h1>

              {/* Loading state */}
              {isGenerating && (
                <div className="flex items-center gap-3 py-4">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-sm text-gray-400">Анализирую запрос и готовлю ответ...</span>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                  {error}
                  <button 
                    onClick={() => router.push('/chat')}
                    className="ml-4 underline"
                  >
                    Попробовать снова
                  </button>
                </div>
              )}

              {/* Response content */}
              {response && (
                <>
                  {/* Court cases */}
                  {response.courtCases && response.courtCases.length > 0 && (
                    <div className="flex flex-col gap-4" style={{ marginLeft: '-16px', marginRight: '-16px' }}>
                      <p className="text-[11px] lg:text-[12px] font-medium text-gray-400 uppercase tracking-tight leading-[14px] lg:leading-[14px]" style={{ paddingLeft: '16px', paddingRight: '16px' }}>
                        Судебные решения
                      </p>
                      <div 
                        className="flex gap-2 overflow-x-auto hide-horizontal-scrollbar"
                        style={{ 
                          paddingLeft: '16px',
                          paddingRight: '16px',
                          WebkitOverflowScrolling: 'touch',
                          msOverflowStyle: 'none',
                          scrollbarWidth: 'none'
                        }}
                      >
                        {response.courtCases.slice(0, 3).map((c) => (
                          <a
                            key={c.id}
                            href={c.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-shrink-0 p-3 rounded-2xl hover:bg-gray-200 dark:hover:bg-[#4a4a4a] transition-colors flex flex-col gap-3"
                            style={{ 
                              backgroundColor: resolvedTheme === 'light' ? '#F3F3F3' : '#1E1E1F',
                              width: '200px',
                              minWidth: '200px'
                            }}
                          >
                            <p className="text-[16px] lg:text-[16px] font-medium text-foreground leading-[24px] lg:leading-[24px] line-clamp-3 h-12">
                              {c.title}
                            </p>
                            <p className="text-[11px] lg:text-[12px] font-medium text-gray-400 leading-[14px] lg:leading-[14px]">
                              {c.url?.includes('sudact.ru') ? 'sudact.ru' : 
                               c.url?.includes('help.mos-gorsud.ru') ? 'help.mos-gorsud.ru' : 'mos-gorsud.ru'}
                            </p>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="h-px bg-gray-200" />

                  {/* Short answer */}
                  {response.shortAnswer && (
                    <div className="flex flex-col gap-4">
                      <p className="text-[11px] lg:text-[12px] font-medium text-gray-400 uppercase tracking-tight leading-[14px] lg:leading-[14px]">
                        Краткий ответ
                      </p>
                      <div className="text-base text-foreground leading-[24px] break-words">
                        <p className="mb-3 text-[18px] lg:text-[24px] leading-[24px] lg:leading-[30px] font-semibold break-words">{response.shortAnswer.title}</p>
                        <p className="break-words">{response.shortAnswer.content}</p>
                      </div>
                    </div>
                  )}

                  <div className="h-px bg-gray-200" />

                  {/* Legal analysis */}
                  {response.legalAnalysis && (
                    <div className="flex flex-col gap-4">
                      <p className="text-[11px] lg:text-[12px] font-medium text-gray-400 uppercase tracking-tight leading-[14px] lg:leading-[14px]">
                        Правовой анализ
                      </p>
                      <div className="text-base text-foreground leading-[24px] break-words">
                        <p className="text-[18px] lg:text-[24px] leading-[24px] lg:leading-[30px] font-semibold mb-3 break-words">{response.legalAnalysis.title}</p>
                        <p className="mb-3 break-words">{response.legalAnalysis.intro}</p>
                        {response.legalAnalysis.points && (
                          <ul className="list-disc ml-5 mb-3 break-words">
                            {response.legalAnalysis.points.map((point, i) => (
                              <li key={i} className="mb-2 last:mb-0 break-words">{point}</li>
                            ))}
                          </ul>
                        )}
                        {response.legalAnalysis.bases && (
                          <>
                            <p className="text-[18px] lg:text-[24px] leading-[24px] lg:leading-[30px] font-semibold mb-3 break-words">Основания:</p>
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

                  {/* Practice analysis */}
                  {response.practiceAnalysis && (
                    <div className="flex flex-col gap-4">
                      <p className="text-[11px] lg:text-[12px] font-medium text-gray-400 uppercase tracking-tight leading-[14px] lg:leading-[14px]">
                        Анализ судебной практики
                      </p>
                      <div className="text-base text-foreground leading-[24px] break-words">
                        <p className="mb-3 break-words">{response.practiceAnalysis.intro}</p>
                        
                        {response.practiceAnalysis.satisfied && (
                          <>
                            <p className="text-[18px] lg:text-[24px] leading-[24px] lg:leading-[30px] font-semibold mb-3 break-words">{response.practiceAnalysis.satisfied.title}</p>
                            <ul className="list-disc ml-5 mb-3 break-words">
                              {response.practiceAnalysis.satisfied.points.map((point, i) => (
                                <li key={i} className="mb-2 last:mb-0 break-words">{point}</li>
                              ))}
                            </ul>
                          </>
                        )}
                        
                        {response.practiceAnalysis.rejected && (
                          <>
                            <p className="text-[18px] lg:text-[24px] leading-[24px] lg:leading-[30px] font-semibold mb-3 break-words">{response.practiceAnalysis.rejected.title}</p>
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

                  {/* Probability */}
                  {response.probability && (
                    <div className="flex flex-col gap-4">
                      <p className="text-[11px] lg:text-[12px] font-medium text-gray-400 uppercase tracking-tight leading-[14px] lg:leading-[14px]">
                        Оценка вероятности
                      </p>
                      <div className="text-base text-foreground leading-[24px] break-words">
                        <p className="mb-3 break-words">Вероятность удовлетворения требований: <strong>{response.probability.level}</strong>.</p>
                        {response.probability.factors && (
                          <>
                            <p className="text-[18px] lg:text-[24px] leading-[24px] lg:leading-[30px] font-semibold mb-3 break-words">Повышается, если есть:</p>
                            <ul className="list-disc ml-5 break-words">
                              {response.probability.factors.map((factor, i) => (
                                <li key={i} className="mb-2 last:mb-0 break-words">{factor}</li>
                              ))}
                            </ul>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="h-px bg-gray-200" />

                  {/* Recommendations */}
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

                  {/* Documents */}
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
                            className="w-full flex items-center justify-between px-4 py-3 border border-gray-200 rounded-xl hover:bg-gray-100 dark:hover:bg-[#3a3a3a] transition-colors disabled:opacity-50"
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
                </>
              )}
            </div>
          </div>

          {/* Input - disabled while generating */}
          <ChatInput 
            onSubmit={() => {}} 
            disabled={isGenerating}
            placeholder={isGenerating ? "Дождитесь завершения анализа..." : "Задайте вопрос"}
          />
        </div>
      </div>
    </div>
  );
}

