'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Sidebar, ChatInput } from '@/components/layout';
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
    level: string;
    factors: string[];
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

  const handleSubmit = async (message: string) => {
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

  if (!response) {
    return (
      <div className="flex h-screen bg-[#0E0E0E]">
        <Sidebar onNewChat={handleNewChat} />
        <div className="flex-1 p-2 pl-0">
          <div className="h-full bg-background rounded-2xl flex items-center justify-center">
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
    <div className="flex h-screen bg-[#0E0E0E]">
      <Sidebar onNewChat={handleNewChat} />
      
      <div className="flex-1 p-2 pl-0">
        <div className="h-full bg-background rounded-2xl relative flex flex-col" style={{ clipPath: 'inset(0 round 1rem)' }}>
          <div className="flex-1 overflow-y-auto pt-14 pb-36 px-0">
            <div className="max-w-[660px] mx-auto flex flex-col gap-8 break-words overflow-x-hidden px-4">
              <h1 className="text-[20px] md:text-[24px] font-medium text-foreground leading-[28px] md:leading-[30px] tracking-tight break-words">
                {query}
              </h1>

              {response.courtCases && response.courtCases.length > 0 && (
                <div className="flex flex-col gap-4">
                  <p className="text-[12px] font-medium text-gray-400 uppercase tracking-tight leading-[18px]">
                    Судебные решения
                  </p>
                  <div className="flex gap-2">
                    {response.courtCases.slice(0, 3).map((c) => (
                      <a
                        key={c.id}
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 p-3 rounded-2xl hover:bg-gray-200 dark:hover:bg-[#4a4a4a] transition-colors flex flex-col gap-3"
                        style={{ 
                          backgroundColor: resolvedTheme === 'light' ? '#F3F3F3' : '#1E1E1F'
                        }}
                      >
                        <p className="text-[14px] font-medium text-foreground leading-[18px] line-clamp-3 h-12">
                          {c.title}
                        </p>
                        <p className="text-[12px] font-medium text-gray-400 leading-[14px]">
                          {c.url?.includes('sudact.ru') ? 'sudact.ru' : 
                           c.url?.includes('help.mos-gorsud.ru') ? 'help.mos-gorsud.ru' : 'mos-gorsud.ru'}
                        </p>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <div className="h-px bg-gray-200" />

              {response.shortAnswer && (
                <div className="flex flex-col gap-4">
                  <p className="text-[12px] font-medium text-gray-400 uppercase tracking-tight leading-[18px]">
                    Краткий ответ
                  </p>
                  <div className="text-base text-foreground leading-[24px] break-words">
                    <p className="mb-3 text-[18px] md:text-[20px] leading-[24px] md:leading-[28px] font-semibold break-words">{response.shortAnswer.title}</p>
                    <p className="break-words">{response.shortAnswer.content}</p>
                  </div>
                </div>
              )}

              <div className="h-px bg-gray-200" />

              {response.legalAnalysis && (
                <div className="flex flex-col gap-4">
                  <p className="text-[12px] font-medium text-gray-400 uppercase tracking-tight leading-[18px]">
                    Правовой анализ
                  </p>
                  <div className="text-base text-foreground leading-[24px] break-words">
                    <p className="text-[18px] md:text-[20px] leading-[24px] md:leading-[28px] font-semibold mb-3 break-words">{response.legalAnalysis.title}</p>
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
                        <p className="text-[18px] md:text-[20px] leading-[24px] md:leading-[28px] font-semibold mb-3 break-words">Основания:</p>
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
                  <p className="text-[12px] font-medium text-gray-400 uppercase tracking-tight leading-[18px]">
                    Анализ судебной практики
                  </p>
                  <div className="text-base text-foreground leading-[24px] break-words">
                    <p className="mb-3 break-words">{response.practiceAnalysis.intro}</p>
                    
                    {response.practiceAnalysis.satisfied && (
                      <>
                        <p className="text-[18px] md:text-[20px] leading-[24px] md:leading-[28px] font-semibold mb-3 break-words">{response.practiceAnalysis.satisfied.title}</p>
                        <ul className="list-disc ml-5 mb-3 break-words">
                          {response.practiceAnalysis.satisfied.points.map((point, i) => (
                            <li key={i} className="mb-2 last:mb-0 break-words">{point}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    
                    {response.practiceAnalysis.rejected && (
                      <>
                        <p className="text-[18px] md:text-[20px] leading-[24px] md:leading-[28px] font-semibold mb-3 break-words">{response.practiceAnalysis.rejected.title}</p>
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

              {response.probability && (
                <div className="flex flex-col gap-4">
                  <p className="text-[12px] font-medium text-gray-400 uppercase tracking-tight leading-[18px]">
                    Оценка вероятности
                  </p>
                  <div className="text-base text-foreground leading-[24px] break-words">
                    <p className="mb-3 break-words">Вероятность удовлетворения требований: <strong>{response.probability.level}</strong>.</p>
                    {response.probability.factors && (
                      <>
                        <p className="text-[18px] md:text-[20px] leading-[24px] md:leading-[28px] font-semibold mb-3 break-words">Повышается, если есть:</p>
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

              {response.recommendations && (
                <div className="flex flex-col gap-4">
                  <p className="text-[12px] font-medium text-gray-400 uppercase tracking-tight leading-[18px]">
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

              {response.documents && response.documents.length > 0 && (
                <div className="flex flex-col gap-4">
                  <p className="text-[12px] font-medium text-gray-400 uppercase tracking-tight leading-[18px]">
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
                      style={{ color: resolvedTheme === 'light' ? '#ffffff' : '#000000' }}
                    />
                    <span className="text-sm font-medium">Скачать все</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          <ChatInput onSubmit={handleSubmit} />
        </div>
      </div>
    </div>
  );
}

export default function ResultPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen bg-[#0E0E0E] items-center justify-center">
        <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ResultContent />
    </Suspense>
  );
}
