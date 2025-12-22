'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Sidebar, ChatInput } from '@/components/layout';
import { DownloadIcon } from '@/components/icons';
import { MarkdownRenderer } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { generateDocx, downloadBlob } from '@/lib/docx-generator';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  documents?: Array<{ title: string; content: string }>;
}

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

interface Generation {
  id: string;
  query: string;
  response: GenerationResponse;
  created_at: string;
}

export default function ChatResultPage() {
  const params = useParams();
  const router = useRouter();
  const [generation, setGeneration] = useState<Generation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);

  // Fetch chat messages
  useEffect(() => {
    async function fetchMessages() {
      if (!params.id) return;
      
      try {
        const response = await fetch(`/api/chat?generationId=${params.id}`);
        if (response.ok) {
          const data = await response.json();
          setChatMessages(data.messages || []);
        }
      } catch (err) {
        console.error('Error fetching messages:', err);
      }
    }

    fetchMessages();
  }, [params.id]);

  useEffect(() => {
    async function fetchGeneration() {
      // First check sessionStorage
      const stored = sessionStorage.getItem('lastResponse');
      if (stored) {
        try {
          const data = JSON.parse(stored);
          if (data.id === params.id) {
            setGeneration({
              id: data.id,
              query: data.query,
              response: data.response,
              created_at: new Date().toISOString(),
            });
            setIsLoading(false);
            return;
          }
        } catch (e) {
          console.error('Error parsing stored response:', e);
        }
      }

      // Fetch from database
      const supabase = createClient();
      
      const { data, error } = await supabase
        .from('generations')
        .select('*')
        .eq('id', params.id)
        .single();

      if (error) {
        console.error('Error fetching generation:', error);
        setError('Не удалось загрузить результат');
        setIsLoading(false);
        return;
      }

      setGeneration(data as Generation);
      setIsLoading(false);
    }

    if (params.id) {
      fetchGeneration();
    }
  }, [params.id]);

  const handleNewChat = () => {
    router.push('/chat');
  };

  const handleSubmit = async (message: string) => {
    if (!message.trim() || isSending || !params.id) return;

    setIsSending(true);

    // Optimistically add user message
    const userMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: message,
      created_at: new Date().toISOString(),
    };
    setChatMessages(prev => [...prev, userMessage]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generationId: params.id,
          message,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      const data = await response.json();

      // Add assistant message with documents if any
      const assistantMessage: ChatMessage = {
        id: `temp-assistant-${Date.now()}`,
        role: 'assistant',
        content: data.message,
        created_at: new Date().toISOString(),
        documents: data.documents || [],
      };
      setChatMessages(prev => [...prev, assistantMessage]);

    } catch (err) {
      console.error('Error sending message:', err);
      // Remove optimistic message on error
      setChatMessages(prev => prev.filter(m => m.id !== userMessage.id));
      alert('Не удалось отправить сообщение. Попробуйте еще раз.');
    } finally {
      setIsSending(false);
    }
  };

  // Download chat-generated document
  const handleChatDocDownload = async (doc: { title: string; content: string }) => {
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
      // Fallback to text
      const blob = new Blob([doc.content], { type: 'text/plain;charset=utf-8' });
      downloadBlob(blob, `${doc.title}.txt`);
    }
  };

  const handleDownload = async (doc: { id: number; title: string; content?: string; format: string }) => {
    if (!doc.content) {
      alert('Содержимое документа недоступно');
      return;
    }
    
    setDownloadingId(doc.id);
    
    try {
      // Generate DOCX
      const blob = await generateDocx({
        title: doc.title,
        content: doc.content,
      });
      
      // Clean filename
      const filename = doc.title
        .replace(/[^\w\sа-яА-ЯёЁ]/g, '')
        .replace(/\s+/g, '_')
        .slice(0, 50) + '.docx';
      
      downloadBlob(blob, filename);
    } catch (err) {
      console.error('Error generating DOCX:', err);
      // Fallback to text download
      const blob = new Blob([doc.content], { type: 'text/plain;charset=utf-8' });
      downloadBlob(blob, `${doc.title}.txt`);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDownloadAll = async () => {
    if (!generation?.response.documents) return;
    
    for (const doc of generation.response.documents) {
      await handleDownload(doc);
      // Small delay between downloads
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen bg-[#212121]">
        <Sidebar onNewChat={handleNewChat} />
        <div className="flex-1 p-2 pl-0">
          <div className="h-full bg-white rounded-2xl flex items-center justify-center">
            <div className="w-12 h-12 border-4 border-[#212121] border-t-transparent rounded-full animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !generation) {
    return (
      <div className="flex h-screen bg-[#212121]">
        <Sidebar onNewChat={handleNewChat} />
        <div className="flex-1 p-2 pl-0">
          <div className="h-full bg-white rounded-2xl flex items-center justify-center">
            <div className="text-center">
              <p className="text-lg text-gray-600 mb-4">{error || 'Результат не найден'}</p>
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

  const { query, response } = generation;

  return (
    <div className="flex h-screen bg-[#212121]">
      <Sidebar currentChatId={params.id as string} onNewChat={handleNewChat} />
      
      {/* Main content */}
      <div className="flex-1 p-2 pl-0">
        <div className="h-full bg-white rounded-2xl relative overflow-hidden flex flex-col">
          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto pt-14 pb-36 px-0">
            <div className="max-w-[660px] mx-auto flex flex-col gap-8">
              {/* Query */}
              <h1 className="text-[20px] md:text-[24px] font-medium text-[#040308] leading-[28px] md:leading-[30px] tracking-tight">
                {query}
              </h1>

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

              {/* Divider */}
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

              {/* Divider */}
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

              {/* Divider */}
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

              {/* Divider */}
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

              {/* Divider */}
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

              {/* Divider */}
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
                  
                  {/* Document download cards */}
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
                  
                  {/* Download all button */}
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

              {/* Chat continuation section */}
              {chatMessages.length > 0 && (
                <>
                  <div className="h-px bg-[#d9d9d9]" />
                  <div className="flex flex-col gap-4">
                    <p className="text-[12px] font-medium text-[#808080] uppercase tracking-tight leading-[18px]">
                      Продолжение диалога
                    </p>
                    
                    {chatMessages.map((msg) => (
                      <div key={msg.id}>
                        {msg.role === 'user' ? (
                          // User message - right aligned with dark background
                          <div className="flex justify-end">
                            <div className="max-w-[85%] px-4 py-3 bg-[#212121] text-white rounded-2xl">
                              <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                            </div>
                          </div>
                        ) : (
                          // Assistant message - clean text without background
                          <div className="flex flex-col gap-4">
                            <div className="text-base text-[#040308] leading-[24px]">
                              <MarkdownRenderer content={msg.content} />
                            </div>
                            
                            {/* Document download buttons */}
                            {msg.documents && msg.documents.length > 0 && (
                              <div className="flex flex-col gap-2 mt-2">
                                {msg.documents.map((doc, idx) => (
                                  <button
                                    key={idx}
                                    onClick={() => handleChatDocDownload(doc)}
                                    className="w-full flex items-center justify-between px-4 py-3 border border-[#d9d9d9] rounded-xl hover:bg-gray-50 transition-colors"
                                  >
                                    <div className="flex flex-col items-start min-w-0 flex-1 mr-4">
                                      <p className="text-sm font-medium text-[#040308] truncate w-full text-left">
                                        {doc.title}
                                      </p>
                                      <p className="text-xs text-[#808080] uppercase">docx</p>
                                    </div>
                                    <DownloadIcon className="w-5 h-5 text-[#040308] shrink-0" strokeWidth="1.75" />
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                    
                    {isSending && (
                      <div className="flex items-center gap-2 text-[#808080]">
                        <div className="flex gap-1">
                          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                        <span className="text-xs">Печатает...</span>
                      </div>
                    )}
                    
                    <div ref={messagesEndRef} />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Input */}
          <ChatInput 
            onSubmit={handleSubmit} 
            placeholder="Задайте уточняющий вопрос..."
            disabled={isSending}
          />
        </div>
      </div>
    </div>
  );
}
