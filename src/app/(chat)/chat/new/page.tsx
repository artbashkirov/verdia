'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Sidebar, ChatInput } from '@/components/layout';
import { DownloadIcon } from '@/components/icons';
import { generateDocx, downloadBlob } from '@/lib/docx-generator';

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
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState<GenerationResponse | null>(null);
  const [isGenerating, setIsGenerating] = useState(true);
  const [error, setError] = useState('');
  const [chatId, setChatId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
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

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Ошибка генерации');
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
      setError(err instanceof Error ? err.message : 'Произошла ошибка');
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
    <div className="flex h-screen bg-[#212121]">
      <Sidebar currentChatId={chatId || undefined} onNewChat={handleNewChat} />
      
      <div className="flex-1 p-2 pl-0">
        <div className="h-full bg-white rounded-2xl relative overflow-hidden flex flex-col">
          {/* Scrollable content */}
          <div ref={contentRef} className="flex-1 overflow-y-auto pt-14 pb-36 px-0">
            <div className="max-w-[660px] mx-auto flex flex-col gap-8">
              {/* Query */}
              <h1 className="text-[20px] md:text-[24px] font-medium text-[#040308] leading-[28px] md:leading-[30px] tracking-tight">
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
                  <span className="text-sm text-[#808080]">Анализирую запрос и готовлю ответ...</span>
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
                    <div className="flex flex-col gap-4">
                      <p className="text-[12px] font-medium text-[#808080] uppercase tracking-tight leading-[18px]">
                        Судебные решения
                      </p>
                      <div className="flex gap-2">
                        {response.courtCases.slice(0, 3).map((c) => (
                          <a
                            key={c.id}
                            href={c.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 bg-[#f3f3f3] p-3 rounded-2xl hover:bg-[#e8e8e8] transition-colors flex flex-col gap-3"
                          >
                            <p className="text-[14px] font-medium text-[#040308] leading-[18px] line-clamp-3 h-12">
                              {c.title}
                            </p>
                            <p className="text-[12px] font-medium text-[#808080] leading-[14px]">
                              {c.url?.includes('sudact.ru') ? 'sudact.ru' : 
                               c.url?.includes('help.mos-gorsud.ru') ? 'help.mos-gorsud.ru' : 'mos-gorsud.ru'}
                            </p>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="h-px bg-[#d9d9d9]" />

                  {/* Short answer */}
                  {response.shortAnswer && (
                    <div className="flex flex-col gap-4">
                      <p className="text-[12px] font-medium text-[#808080] uppercase tracking-tight leading-[18px]">
                        Краткий ответ
                      </p>
                      <div className="text-base text-[#040308] leading-[24px]">
                        <p className="mb-3 text-[18px] md:text-[20px] leading-[24px] md:leading-[28px] font-semibold">{response.shortAnswer.title}</p>
                        <p>{response.shortAnswer.content}</p>
                      </div>
                    </div>
                  )}

                  <div className="h-px bg-[#d9d9d9]" />

                  {/* Legal analysis */}
                  {response.legalAnalysis && (
                    <div className="flex flex-col gap-4">
                      <p className="text-[12px] font-medium text-[#808080] uppercase tracking-tight leading-[18px]">
                        Правовой анализ
                      </p>
                      <div className="text-base text-[#040308] leading-[24px]">
                        <p className="text-[18px] md:text-[20px] leading-[24px] md:leading-[28px] font-semibold mb-3">{response.legalAnalysis.title}</p>
                        <p className="mb-3">{response.legalAnalysis.intro}</p>
                        {response.legalAnalysis.points && (
                          <ul className="list-disc ml-5 mb-3">
                            {response.legalAnalysis.points.map((point, i) => (
                              <li key={i} className="mb-2 last:mb-0">{point}</li>
                            ))}
                          </ul>
                        )}
                        {response.legalAnalysis.bases && (
                          <>
                            <p className="text-[18px] md:text-[20px] leading-[24px] md:leading-[28px] font-semibold mb-3">Основания:</p>
                            <ul className="list-disc ml-5">
                              {response.legalAnalysis.bases.map((base, i) => (
                                <li key={i} className="mb-2 last:mb-0">{base}</li>
                              ))}
                            </ul>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="h-px bg-[#d9d9d9]" />

                  {/* Practice analysis */}
                  {response.practiceAnalysis && (
                    <div className="flex flex-col gap-4">
                      <p className="text-[12px] font-medium text-[#808080] uppercase tracking-tight leading-[18px]">
                        Анализ судебной практики
                      </p>
                      <div className="text-base text-[#040308] leading-[24px]">
                        <p className="mb-3">{response.practiceAnalysis.intro}</p>
                        
                        {response.practiceAnalysis.satisfied && (
                          <>
                            <p className="text-[18px] md:text-[20px] leading-[24px] md:leading-[28px] font-semibold mb-3">{response.practiceAnalysis.satisfied.title}</p>
                            <ul className="list-disc ml-5 mb-3">
                              {response.practiceAnalysis.satisfied.points.map((point, i) => (
                                <li key={i} className="mb-2 last:mb-0">{point}</li>
                              ))}
                            </ul>
                          </>
                        )}
                        
                        {response.practiceAnalysis.rejected && (
                          <>
                            <p className="text-[18px] md:text-[20px] leading-[24px] md:leading-[28px] font-semibold mb-3">{response.practiceAnalysis.rejected.title}</p>
                            <ul className="list-disc ml-5">
                              {response.practiceAnalysis.rejected.points.map((point, i) => (
                                <li key={i} className="mb-2 last:mb-0">{point}</li>
                              ))}
                            </ul>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="h-px bg-[#d9d9d9]" />

                  {/* Probability */}
                  {response.probability && (
                    <div className="flex flex-col gap-4">
                      <p className="text-[12px] font-medium text-[#808080] uppercase tracking-tight leading-[18px]">
                        Оценка вероятности
                      </p>
                      <div className="text-base text-[#040308] leading-[24px]">
                        <p className="mb-3">Вероятность удовлетворения требований: <strong>{response.probability.level}</strong>.</p>
                        {response.probability.factors && (
                          <>
                            <p className="text-[18px] md:text-[20px] leading-[24px] md:leading-[28px] font-semibold mb-3">Повышается, если есть:</p>
                            <ul className="list-disc ml-5">
                              {response.probability.factors.map((factor, i) => (
                                <li key={i} className="mb-2 last:mb-0">{factor}</li>
                              ))}
                            </ul>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="h-px bg-[#d9d9d9]" />

                  {/* Recommendations */}
                  {response.recommendations && (
                    <div className="flex flex-col gap-4">
                      <p className="text-[12px] font-medium text-[#808080] uppercase tracking-tight leading-[18px]">
                        Рекомендованные действия
                      </p>
                      <ol className="list-decimal ml-5 text-base text-[#040308] leading-[24px]">
                        {response.recommendations.map((rec, i) => (
                          <li key={i} className="mb-2 last:mb-0">{rec}</li>
                        ))}
                      </ol>
                    </div>
                  )}

                  <div className="h-px bg-[#d9d9d9]" />

                  {/* Documents */}
                  {response.documents && response.documents.length > 0 && (
                    <div className="flex flex-col gap-4">
                      <p className="text-[12px] font-medium text-[#808080] uppercase tracking-tight leading-[18px]">
                        Подготовленные документы
                      </p>
                      
                      <div className="text-base text-[#040308] leading-[24px] flex flex-col gap-5">
                        {response.documents.map((doc, i) => (
                          <div key={doc.id}>
                            <p className="mb-3">{i + 1}. {doc.title}</p>
                            <p>{doc.description}</p>
                          </div>
                        ))}
                      </div>
                      
                      <div className="flex flex-col gap-1 mt-2">
                        {response.documents.map((doc) => (
                          <button
                            key={doc.id}
                            onClick={() => handleDownload(doc)}
                            disabled={downloadingId === doc.id}
                            className="w-full flex items-center justify-between px-4 py-3 border border-[#d9d9d9] rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
                          >
                            <div className="flex flex-col items-start min-w-0 flex-1 mr-4">
                              <p className="text-sm font-medium text-[#040308] truncate w-full text-left">
                                {doc.title}
                              </p>
                              <p className="text-xs text-[#808080] uppercase">
                                {downloadingId === doc.id ? 'Генерация...' : 'docx'}
                              </p>
                            </div>
                            {downloadingId === doc.id ? (
                              <div className="w-[18px] h-[18px] border-2 border-black border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <DownloadIcon className="w-5 h-5 text-[#040308] shrink-0" strokeWidth="1.75" />
                            )}
                          </button>
                        ))}
                      </div>
                      
                      <button 
                        onClick={handleDownloadAll}
                        disabled={downloadingId !== null}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-[#3a3a3a] transition-colors self-start disabled:opacity-50"
                      >
                        <DownloadIcon className="w-4 h-4" strokeWidth="1.5" />
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
            placeholder={isGenerating ? "Дождитесь завершения анализа..." : "Задайте уточняющий вопрос..."}
          />
        </div>
      </div>
    </div>
  );
}

