'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Sidebar, ChatInput, MobileHeader, MobileSidebar } from '@/components/layout';
import { DownloadIcon } from '@/components/icons';
import { MarkdownRenderer } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { generateDocx, downloadBlob } from '@/lib/docx-generator';
import { useTheme } from '@/lib/theme-context';

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
  const { resolvedTheme } = useTheme();
  const [generation, setGeneration] = useState<Generation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Get chat ID safely
  const chatId = params.id ? (Array.isArray(params.id) ? params.id[0] : params.id) : '';

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
      
      const id = Array.isArray(params.id) ? params.id[0] : params.id;
      
      try {
        const response = await fetch(`/api/chat?generationId=${id}`);
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
      if (!params.id) {
        setIsLoading(false);
        setError('ID не найден');
        return;
      }

      const id = Array.isArray(params.id) ? params.id[0] : params.id;

      // First check sessionStorage
      const stored = sessionStorage.getItem('lastResponse');
      if (stored) {
        try {
          const data = JSON.parse(stored);
          if (data.id === id) {
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
      
      if (!id) {
        setError('ID не найден');
        setIsLoading(false);
        return;
      }
      
      const { data, error } = await supabase
        .from('generations')
        .select('*')
        .eq('id', id)
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

    fetchGeneration();
  }, [params.id]);

  const handleNewChat = () => {
    router.push('/chat');
  };

  const handleSubmit = async (message: string) => {
    if (!message.trim() || isSending || !params.id) return;

    const id = Array.isArray(params.id) ? params.id[0] : params.id;
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
          generationId: id,
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
      <div className="flex h-screen bg-[#0E0E0E]">
        <MobileHeader 
          onMenuClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          isMenuOpen={isMobileMenuOpen}
          onNewChat={handleNewChat}
        />
        <MobileSidebar
          isOpen={isMobileMenuOpen}
          onClose={() => setIsMobileMenuOpen(false)}
          currentChatId={chatId}
          onNewChat={handleNewChat}
        />
        <Sidebar currentChatId={chatId} onNewChat={handleNewChat} className="hidden md:flex" />
        <div className="flex-1 p-0 md:p-2 md:pl-0 pt-[56px] md:pt-2">
          <div className="h-full bg-background md:rounded-2xl flex items-center justify-center">
            <div className="w-12 h-12 border-4 border-foreground border-t-transparent rounded-full animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !generation) {
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
          currentChatId={chatId}
          onNewChat={handleNewChat}
        />
        <Sidebar currentChatId={chatId} onNewChat={handleNewChat} className="hidden md:flex" />
        <div className="flex-1 p-0 md:p-2 md:pl-0 pt-[56px] md:pt-2">
          <div className="h-full bg-background md:rounded-2xl flex items-center justify-center">
            <div className="text-center">
              <p className="text-lg text-gray-400 mb-4">{error || 'Результат не найден'}</p>
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
    <div className="flex h-screen bg-[#0E0E0E]">
      <MobileHeader 
        onMenuClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        isMenuOpen={isMobileMenuOpen}
        onNewChat={handleNewChat}
      />
      <MobileSidebar
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
          currentChatId={chatId}
          onNewChat={handleNewChat}
        />
        <Sidebar currentChatId={chatId} onNewChat={handleNewChat} className="hidden md:flex" />
      
      {/* Main content */}
      <div className="flex-1 p-0 md:p-2 md:pl-0 pt-[56px] md:pt-2">
        <div className="h-full bg-background md:rounded-2xl relative flex flex-col">
          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto pt-6 md:pt-14 pb-36 px-0 relative">
            <div className="w-full md:max-w-[660px] md:mx-auto flex flex-col gap-8 break-words" style={{ paddingLeft: '16px', paddingRight: '16px', position: 'relative' }}>
              {/* Query */}
              <h1 className="text-[24px] font-medium text-foreground leading-[30px] tracking-tight break-words md:mt-0">
                {query}
              </h1>

              {/* Court cases */}
              {response.courtCases && response.courtCases.length > 0 && (
                <div className="flex flex-col gap-4" style={{ marginLeft: '-16px', marginRight: '-16px' }}>
                  <p className="text-[12px] font-medium text-gray-400 uppercase tracking-tight leading-[18px]" style={{ paddingLeft: '16px', paddingRight: '16px' }}>
                    Судебные решения
                  </p>
                  <div 
                    className="flex gap-2 overflow-x-auto hide-horizontal-scrollbar"
                    style={{ 
                      paddingLeft: '16px',
                      paddingRight: '16px',
                      WebkitOverflowScrolling: 'touch',
                      msOverflowStyle: 'none',
                      scrollbarWidth: 'none',
                      minWidth: 'max-content'
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
                        <p className="text-[14px] font-medium text-foreground leading-[18px] line-clamp-3 h-12">
                          {c.title}
                        </p>
                        <p className="text-[12px] font-medium text-gray-400 leading-[14px]">
                          {c.url?.includes('sudact.ru') ? 'sudact.ru' : 
                           c.url?.includes('help.mos-gorsud.ru') ? 'help.mos-gorsud.ru' : 'mos-gorsud.ru'}
                        </p>
                      </a>
                    ))}
                    {/* Spacer to allow last card to scroll fully */}
                    <div style={{ minWidth: '16px', flexShrink: 0 }} />
                  </div>
                </div>
              )}

              {/* Divider */}
              <div className="h-px bg-gray-200" />

              {/* Short answer */}
              {response.shortAnswer && (
                <div className="flex flex-col gap-4">
                  <p className="text-[12px] font-medium text-gray-400 uppercase tracking-tight leading-[18px]">
                    Краткий ответ
                  </p>
                  <div className="text-base text-foreground leading-[24px] break-words">
                    <p className="mb-3 text-[20px] leading-[28px] font-semibold break-words">{response.shortAnswer.title}</p>
                    <p className="break-words">{response.shortAnswer.content}</p>
                  </div>
                </div>
              )}

              {/* Divider */}
              <div className="h-px bg-gray-200" />

              {/* Legal analysis */}
              {response.legalAnalysis && (
                <div className="flex flex-col gap-4">
                  <p className="text-[12px] font-medium text-gray-400 uppercase tracking-tight leading-[18px]">
                    Правовой анализ
                  </p>
                  <div className="text-base text-foreground leading-[24px] break-words">
                    <p className="text-[20px] leading-[28px] font-semibold mb-3 break-words">{response.legalAnalysis.title}</p>
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
                        <p className="text-[20px] leading-[28px] font-semibold mb-3 break-words">Основания:</p>
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

              {/* Divider */}
              <div className="h-px bg-gray-200" />

              {/* Practice analysis */}
              {response.practiceAnalysis && (
                <div className="flex flex-col gap-4">
                  <p className="text-[12px] font-medium text-gray-400 uppercase tracking-tight leading-[18px]">
                    Анализ судебной практики
                  </p>
                  <div className="text-base text-foreground leading-[24px] break-words">
                    <p className="mb-3 break-words">{response.practiceAnalysis.intro}</p>
                    
                    {response.practiceAnalysis.satisfied && (
                      <>
                            <p className="text-[20px] leading-[28px] font-semibold mb-3 break-words">{response.practiceAnalysis.satisfied.title}</p>
                        <ul className="list-disc ml-5 mb-3 break-words">
                          {response.practiceAnalysis.satisfied.points.map((point, i) => (
                            <li key={i} className="mb-2 last:mb-0 break-words">{point}</li>
                          ))}
                        </ul>
                      </>
                    )}
                    
                    {response.practiceAnalysis.rejected && (
                      <>
                            <p className="text-[20px] leading-[28px] font-semibold mb-3 break-words">{response.practiceAnalysis.rejected.title}</p>
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

              {/* Divider */}
              <div className="h-px bg-gray-200" />

              {/* Probability */}
              {response.probability && (
                <div className="flex flex-col gap-4">
                  <p className="text-[12px] font-medium text-gray-400 uppercase tracking-tight leading-[18px]">
                    Оценка вероятности
                  </p>
                  <div className="text-base text-foreground leading-[24px] break-words">
                    <p className="mb-3 break-words">Вероятность удовлетворения требований: <strong>{response.probability.level}</strong>.</p>
                    {response.probability.factors && (
                      <>
                        <p className="text-[20px] leading-[28px] font-semibold mb-3 break-words">Повышается, если есть:</p>
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

              {/* Divider */}
              <div className="h-px bg-gray-200" />

              {/* Recommendations */}
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

              {/* Divider */}
              <div className="h-px bg-gray-200" />

              {/* Documents */}
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
                  
                  {/* Document download cards */}
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
                  
                  {/* Download all button */}
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

              {/* Chat continuation section */}
              {chatMessages.length > 0 && (
                <>
                  <div className="h-px bg-gray-200" />
                  <div className="flex flex-col gap-4">
                    <p className="text-[12px] font-medium text-gray-400 uppercase tracking-tight leading-[18px]">
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
                            <div className="text-base text-foreground leading-[24px] break-words">
                              <MarkdownRenderer content={msg.content} />
                            </div>
                            
                            {/* Document download buttons */}
                            {msg.documents && msg.documents.length > 0 && (
                              <div className="flex flex-col gap-2 mt-2">
                                {msg.documents.map((doc, idx) => (
                                  <button
                                    key={idx}
                                    onClick={() => handleChatDocDownload(doc)}
                                    className="w-full flex items-center justify-between px-4 py-3 border border-gray-200 rounded-xl hover:bg-gray-100 dark:hover:bg-[#3a3a3a] transition-colors"
                                  >
                                    <div className="flex flex-col items-start min-w-0 flex-1 mr-4">
                                      <p className="text-sm font-medium text-foreground truncate w-full text-left">
                                        {doc.title}
                                      </p>
                                      <p className="text-xs text-gray-400 uppercase">docx</p>
                                    </div>
                                    <DownloadIcon className="w-5 h-5 text-foreground shrink-0" strokeWidth="1.75" />
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                    
                    {isSending && (
                      <div className="flex items-center gap-2 text-gray-400">
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
            placeholder="Задайте вопрос"
            disabled={isSending}
          />
        </div>
      </div>
    </div>
  );
}
