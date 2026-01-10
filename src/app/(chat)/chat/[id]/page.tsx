'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Sidebar, ChatInput, MobileHeader, MobileSidebar } from '@/components/layout';
import { DownloadIcon } from '@/components/icons';
import { MarkdownRenderer } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { generateDocx, downloadBlob } from '@/lib/docx-generator';
import { useTheme } from '@/lib/theme-context';

// Helper function to get probability label based on percentage
function getProbabilityLabel(percentage: number): string {
  if (percentage === 0) return 'недостаточно данных';
  if (percentage >= 95) return 'максимальная';
  if (percentage >= 80) return 'очень высокая';
  if (percentage >= 65) return 'высокая';
  if (percentage >= 51) return 'выше средней';
  if (percentage >= 35) return 'средняя';
  if (percentage >= 20) return 'ниже средней';
  return 'низкая';
}

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
    probability?: {
      percentage: number;
      level: string;
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
  const searchParams = useSearchParams();
  const { resolvedTheme } = useTheme();
  const [generation, setGeneration] = useState<Generation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const actionProcessed = useRef(false);

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

  // Handle action parameter for auto-generating documents
  useEffect(() => {
    if (actionProcessed.current || isLoading || !generation) return;
    
    const action = searchParams.get('action');
    if (!action) return;
    
    actionProcessed.current = true;
    
    const actionMessages: Record<string, string> = {
      lawsuit: 'Составь исковое заявление',
      claim: 'Составь претензию',
      motion: 'Составь ходатайство',
      objection: 'Составь возражения на иск',
    };
    
    const message = actionMessages[action];
    if (message) {
      // Clear URL parameter and send message
      router.replace(`/chat/${chatId}`);
      handleSubmit(message);
    }
  }, [searchParams, isLoading, generation, chatId]);

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
      <div className="flex bg-background" style={{ height: 'var(--viewport-height, 100vh)' }}>
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
        <div className="flex-1 min-w-0 overflow-x-hidden p-0 md:p-2 md:pl-0 md:pb-2 pt-[56px] md:pt-2 bg-[#17181A]">
          <div className="h-full bg-background md:rounded-2xl overflow-hidden flex items-center justify-center">
            <div className="w-12 h-12 border-4 border-foreground border-t-transparent rounded-full animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !generation) {
    return (
      <div className="flex bg-background" style={{ height: 'var(--viewport-height, 100vh)' }}>
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
        <div className="flex-1 min-w-0 overflow-x-hidden p-0 md:p-2 md:pl-0 md:pb-2 pt-[56px] md:pt-2 bg-[#17181A]">
          <div className="h-full bg-background md:rounded-2xl overflow-hidden flex items-center justify-center">
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
    <div className="flex bg-background h-screen max-w-[100vw] mobile-fixed-layout" style={{
      width: '100%'
    }}>
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
      <div className="flex-1 flex flex-col min-w-0 max-w-[100vw] overflow-x-hidden p-0 md:p-2 md:pl-0 md:pb-2 pt-[56px] md:pt-2 bg-[#17181A] overflow-hidden">
        <div className="flex-1 bg-background md:rounded-2xl overflow-hidden relative flex flex-col" style={{
          minHeight: 0
        }}>
          {/* Scrollable content */}
          <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden pt-6 md:pt-14 px-0 relative" style={{
            minHeight: 0,
            WebkitOverflowScrolling: 'touch',
            paddingBottom: 'calc(56px + 32px)' // Отступ снизу для инпута (56px высота + 32px padding)
          }}>
            <div className="w-full max-w-[660px] mx-auto flex flex-col gap-8 px-4" style={{ position: 'relative', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
              {/* Query */}
              <h1 className="text-[20px] lg:text-[32px] font-medium text-foreground leading-[28px] lg:leading-[40px] tracking-tight break-words md:mt-0">
                {query}
              </h1>

              {/* Court cases */}
              {response.courtCases && response.courtCases.length > 0 && (
                <div className="flex flex-col gap-4 -mx-4 md:mx-0">
                  <p className="text-[11px] lg:text-[12px] font-medium text-gray-400 uppercase tracking-tight leading-[14px] lg:leading-[14px] px-4 md:px-0">
                    Судебные решения
                  </p>
                  <div 
                    className="overflow-x-auto overflow-y-hidden hide-horizontal-scrollbar pl-4 pr-4 md:pl-0 md:pr-0"
                    style={{ 
                      display: 'flex',
                      gap: '8px',
                      paddingBottom: '4px',
                      WebkitOverflowScrolling: 'touch'
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
                        <p className="text-[11px] lg:text-[12px] font-medium text-gray-400 leading-[14px] lg:leading-[14px]" style={{ margin: 0 }}>
                          {c.url?.includes('sudact.ru') ? 'sudact.ru' : 
                           c.url?.includes('help.mos-gorsud.ru') ? 'help.mos-gorsud.ru' : 'mos-gorsud.ru'}
                        </p>
                      </a>
                    ))}
                    {/* Spacer для последней карточки */}
                    <div className="min-w-4 flex-shrink-0" />
                  </div>
                </div>
              )}

              {/* Divider */}
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
                    {(response.shortAnswer.probability || response.probability) && (() => {
                      // Get percentage from available sources
                      const percentage = response.shortAnswer.probability?.percentage 
                        || response.probability?.percentage
                        || (response.probability?.level === 'высокая' ? 75 
                          : response.probability?.level === 'выше средней' ? 65 
                          : response.probability?.level === 'средняя' ? 45 
                          : response.probability?.level === 'низкая' ? 25 
                          : 60);
                      const level = getProbabilityLabel(percentage);
                      
                      return (
                        <div className="mt-4 p-4 rounded-xl relative" style={{ backgroundColor: resolvedTheme === 'light' ? '#F3F3F3' : '#1E1E1F' }}>
                          <p className="text-[11px] lg:text-[12px] font-medium text-gray-400 uppercase tracking-tight leading-[14px] mb-2">
                            {percentage > 0 ? 'Вероятность выиграть дело' : 'Оценка вероятности'}
                          </p>
                          {percentage > 0 ? (
                            <p className="text-[24px] lg:text-[32px] font-bold text-foreground">
                              {percentage}%
                              <span className="text-[16px] lg:text-[18px] font-medium text-gray-500 ml-2">
                                ({level})
                              </span>
                            </p>
                          ) : (
                            <p className="text-[16px] lg:text-[18px] font-medium text-gray-500">
                              Недостаточно данных для расчёта вероятности
                            </p>
                          )}
                          {/* Info icon with tooltip */}
                          <div className="probability-tooltip-container absolute right-6 top-1/2 -translate-y-1/2 group">
                            <button
                              className="w-4 h-4 rounded-full border border-gray-400 text-gray-400 flex items-center justify-center text-[10px] font-medium hover:border-gray-500 hover:text-gray-500 transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                const tooltip = e.currentTarget.nextElementSibling;
                                if (tooltip) {
                                  tooltip.classList.toggle('hidden');
                                  tooltip.classList.toggle('block');
                                }
                              }}
                            >
                              i
                            </button>
                            <div className="probability-tooltip hidden lg:group-hover:block absolute right-0 bottom-full mb-2 w-72 p-3 bg-white rounded-lg shadow-lg border border-gray-200 text-sm text-gray-600 z-50">
                              <p className="font-medium text-gray-900 mb-1">Как рассчитывается вероятность?</p>
                              <p>Оценка основана на анализе похожих судебных дел: соотношении удовлетворённых и отклонённых исков, а также ключевых факторов вашей ситуации.</p>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Divider */}
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

              {/* Divider */}
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

              {/* Divider */}
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

              {/* Divider */}
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
                    Напишите в чат какой документ вам нужен:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => handleSubmit('Составь исковое заявление')}
                      disabled={isSending}
                      className="px-4 py-2 text-sm font-medium rounded-xl bg-[#212121] text-white hover:bg-[#3a3a3a] transition-colors disabled:opacity-50"
                    >
                      Исковое заявление
                    </button>
                    <button
                      onClick={() => handleSubmit('Составь претензию')}
                      disabled={isSending}
                      className="px-4 py-2 text-sm font-medium rounded-xl bg-[#212121] text-white hover:bg-[#3a3a3a] transition-colors disabled:opacity-50"
                    >
                      Претензия
                    </button>
                    <button
                      onClick={() => handleSubmit('Составь ходатайство')}
                      disabled={isSending}
                      className="px-4 py-2 text-sm font-medium rounded-xl bg-[#212121] text-white hover:bg-[#3a3a3a] transition-colors disabled:opacity-50"
                    >
                      Ходатайство
                    </button>
                    <button
                      onClick={() => handleSubmit('Составь возражения на иск')}
                      disabled={isSending}
                      className="px-4 py-2 text-sm font-medium rounded-xl bg-[#212121] text-white hover:bg-[#3a3a3a] transition-colors disabled:opacity-50"
                    >
                      Возражения на иск
                    </button>
                  </div>
                </div>
              </div>

              {/* Divider - only show if documents follow */}
              {response.documents && response.documents.length > 0 && (
                <div className="h-px bg-gray-200" />
              )}

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
                  
                  {/* Document download cards */}
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
                    <p className="text-[11px] lg:text-[12px] font-medium text-gray-400 uppercase tracking-tight leading-[14px] lg:leading-[14px]">
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
                                    className="w-full flex items-center justify-between px-4 py-3 border border-gray-200 rounded-xl bg-white hover:bg-gray-100 transition-colors"
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
          
          {/* Input - fixed at bottom for mobile, absolute for desktop */}
          <div className="md:hidden fixed left-0 right-0 z-40 bottom-0">
            <ChatInput 
              onSubmit={handleSubmit} 
              placeholder="Задайте вопрос"
              disabled={isSending}
            />
          </div>
          <div className="hidden md:block relative">
            <ChatInput 
              onSubmit={handleSubmit} 
              placeholder="Задайте вопрос"
              disabled={isSending}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
