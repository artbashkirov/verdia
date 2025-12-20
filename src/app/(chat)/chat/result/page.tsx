'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Sidebar, ChatInput } from '@/components/layout';
import { DownloadIcon } from '@/components/icons';
import { generateDocx, downloadBlob } from '@/lib/docx-generator';

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
      <div className="flex h-screen bg-[#212121]">
        <Sidebar onNewChat={handleNewChat} />
        <div className="flex-1 p-2 pl-0">
          <div className="h-full bg-white rounded-2xl flex items-center justify-center">
            <div className="text-center">
              <p className="text-lg text-gray-600 mb-4">Результат не найден</p>
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
    <div className="flex h-screen bg-[#212121]">
      <Sidebar onNewChat={handleNewChat} />
      
      <div className="flex-1 p-2 pl-0">
        <div className="h-full bg-white rounded-2xl relative overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto pt-14 pb-36 px-0">
            <div className="max-w-[660px] mx-auto flex flex-col gap-4">
              <h1 className="text-2xl font-medium text-black leading-7 tracking-tight">
                {query}
              </h1>

              {response.courtCases && response.courtCases.length > 0 && (
                <div className="flex flex-col gap-3">
                  <p className="text-[10px] font-medium text-gray-500 uppercase tracking-tight leading-[18px]">
                    Судебные решения
                  </p>
                  <div className="flex gap-2">
                    {response.courtCases.slice(0, 3).map((c) => (
                      <a
                        key={c.id}
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-[180px] bg-[#f3f3f3] p-3 rounded-2xl hover:bg-[#e8e8e8] transition-colors flex flex-col gap-3"
                      >
                        <p className="text-xs font-medium text-black leading-4 line-clamp-3 h-12">
                          {c.title}
                        </p>
                        <p className="text-[10px] font-medium text-[#727272] leading-[14px]">
                          {c.url?.includes('sudact.ru') ? 'sudact.ru' : 
                           c.url?.includes('help.mos-gorsud.ru') ? 'help.mos-gorsud.ru' : 'mos-gorsud.ru'}
                        </p>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <div className="h-px bg-[#d9d9d9]" />

              {response.shortAnswer && (
                <div className="flex flex-col gap-3">
                  <p className="text-[10px] font-medium text-gray-500 uppercase tracking-tight leading-[18px]">
                    Краткий ответ
                  </p>
                  <div className="text-sm text-black leading-[1.3]">
                    <p className="mb-3 font-semibold">{response.shortAnswer.title}</p>
                    <p>{response.shortAnswer.content}</p>
                  </div>
                </div>
              )}

              <div className="h-px bg-[#d9d9d9]" />

              {response.legalAnalysis && (
                <div className="flex flex-col gap-3">
                  <p className="text-[10px] font-medium text-gray-500 uppercase tracking-tight leading-[18px]">
                    Правовой анализ
                  </p>
                  <div className="text-sm text-black leading-[1.3]">
                    <p className="font-semibold mb-3">{response.legalAnalysis.title}</p>
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
                        <p className="font-semibold mb-3">Основания:</p>
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

              {response.practiceAnalysis && (
                <div className="flex flex-col gap-3">
                  <p className="text-[10px] font-medium text-gray-500 uppercase tracking-tight leading-[18px]">
                    Анализ судебной практики
                  </p>
                  <div className="text-sm text-black leading-[1.3]">
                    <p className="mb-3">{response.practiceAnalysis.intro}</p>
                    
                    {response.practiceAnalysis.satisfied && (
                      <>
                        <p className="font-semibold mb-3">{response.practiceAnalysis.satisfied.title}</p>
                        <ul className="list-disc ml-5 mb-3">
                          {response.practiceAnalysis.satisfied.points.map((point, i) => (
                            <li key={i} className="mb-2 last:mb-0">{point}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    
                    {response.practiceAnalysis.rejected && (
                      <>
                        <p className="font-semibold mb-3">{response.practiceAnalysis.rejected.title}</p>
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

              {response.probability && (
                <div className="flex flex-col gap-3">
                  <p className="text-[10px] font-medium text-gray-500 uppercase tracking-tight leading-[18px]">
                    Оценка вероятности
                  </p>
                  <div className="text-sm text-black leading-[1.3]">
                    <p className="mb-3">Вероятность удовлетворения требований: <strong>{response.probability.level}</strong>.</p>
                    {response.probability.factors && (
                      <>
                        <p className="font-semibold mb-3">Повышается, если есть:</p>
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

              {response.recommendations && (
                <div className="flex flex-col gap-3">
                  <p className="text-[10px] font-medium text-gray-500 uppercase tracking-tight leading-[18px]">
                    Рекомендованные действия
                  </p>
                  <ol className="list-decimal ml-5 text-sm text-black leading-[1.3]">
                    {response.recommendations.map((rec, i) => (
                      <li key={i} className="mb-2 last:mb-0">{rec}</li>
                    ))}
                  </ol>
                </div>
              )}

              <div className="h-px bg-[#d9d9d9]" />

              {response.documents && response.documents.length > 0 && (
                <div className="flex flex-col gap-3">
                  <p className="text-[10px] font-medium text-gray-500 uppercase tracking-tight leading-[18px]">
                    Подготовленные документы
                  </p>
                  
                  <div className="text-sm text-black leading-[1.3] flex flex-col gap-5">
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
                          <p className="text-sm font-medium text-black truncate w-full text-left">
                            {doc.title}
                          </p>
                          <p className="text-xs text-[#727272] uppercase">
                            {downloadingId === doc.id ? 'Генерация...' : 'docx'}
                          </p>
                        </div>
                        {downloadingId === doc.id ? (
                          <div className="w-[18px] h-[18px] border-2 border-black border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <DownloadIcon className="w-[18px] h-[18px] text-black shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                  
                  <button 
                    onClick={handleDownloadAll}
                    disabled={downloadingId !== null}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-[#3a3a3a] transition-colors self-start disabled:opacity-50"
                  >
                    <DownloadIcon className="w-[18px] h-[18px]" />
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
      <div className="flex h-screen bg-[#212121] items-center justify-center">
        <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ResultContent />
    </Suspense>
  );
}
