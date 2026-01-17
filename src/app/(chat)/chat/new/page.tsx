'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Sidebar, ChatInput, MobileHeader, MobileSidebar, ProbabilityBlock } from '@/components/layout';
import { DownloadIcon } from '@/components/icons';
import { MarkdownRenderer } from '@/components/ui';
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
  recommendations?: string[];
  documents?: Array<{
    id: number;
    title: string;
    description: string;
    format: string;
    content?: string;
  }>;
  clarificationRequest?: {
    type: string;
    message: string;
    fields: Array<{ key: string; label: string; placeholder: string }>;
    hint: string;
  };
  defendantHistory?: {
    name: string;
    totalCases: number;
    casesLost: number;
  };
  // Court prediction with judges
  courtPrediction?: {
    predictedCourt?: {
      name: string;
      address?: string;
      reason?: string;
    };
    judges?: Array<{
      name: string;
      satisfactionRate?: number;
      casesCount?: number;
    }>;
  };
  // Defendant analysis
  defendantAnalysis?: {
    hasHistory: boolean;
    summary?: string;
    riskFactors?: string[];
    opportunities?: string[];
  };
}

// Court cases stats from stream
interface CourtCasesData {
  cases: Array<{ id: number; title: string; url: string; court?: string; isSearchLink?: boolean }>;
  stats: { total: number; percentage: number };
  courtInfo?: string;
  defendantHistory?: { name: string; totalCases: number; casesLost: number };
}

interface ClarificationData {
  question: string;
  options: string[];
}

function NewChatPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { resolvedTheme } = useTheme();
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState<GenerationResponse>({});
  const [isGenerating, setIsGenerating] = useState(true);
  const [statusMessage, setStatusMessage] = useState('Ищу судебные дела...');
  const [error, setError] = useState('');
  const [chatId, setChatId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [clarification, setClarification] = useState<ClarificationData | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [clarificationRequest, setClarificationRequest] = useState<GenerationResponse['clarificationRequest'] | null>(null);
  const [defendantForm, setDefendantForm] = useState({ defendantName: '', defendantLocation: '' });
  const [isRefining, setIsRefining] = useState(false);
  const [refinedData, setRefinedData] = useState<any>(null);
  const [courtCasesData, setCourtCasesData] = useState<CourtCasesData | null>(null);
  const [visitedUrls, setVisitedUrls] = useState<Set<string>>(new Set());
  const contentRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasStartedGeneration = useRef(false);
  const [chatMessages, setChatMessages] = useState<Array<{ id: string; role: 'user' | 'assistant'; content: string; created_at: string; documents?: Array<{ title: string; content: string }> }>>([]);
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [lastUserMessage, setLastUserMessage] = useState<string>('');

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
    if (hasStartedGeneration.current) return;

    const urlQuery = searchParams.get('q');
    const storedQuery = sessionStorage.getItem('pendingQuery');
    const queryToUse = urlQuery || storedQuery;
    
    if (!queryToUse) {
      router.push('/chat');
      return;
    }

    hasStartedGeneration.current = true;
    setQuery(queryToUse);
    sessionStorage.removeItem('pendingQuery');
    generateResponseStream(queryToUse);
  }, []);

  // Load existing chat messages when generation is complete
  useEffect(() => {
    async function loadChatMessages() {
      if (!chatId || !isComplete) return;
      
      try {
        const messagesResponse = await fetch(`/api/chat?generationId=${chatId}`);
        if (messagesResponse.ok) {
          const messagesData = await messagesResponse.json();
          const messages = messagesData.messages || [];
          
          // Ensure documents are properly formatted
          const normalizedMessages = messages.map((msg: any) => ({
            ...msg,
            documents: Array.isArray(msg.documents) ? msg.documents : [],
          }));
          
          setChatMessages(normalizedMessages);
          console.log('📥 Loaded messages with documents:', normalizedMessages.filter((m: any) => m.documents?.length > 0).length);
        }
      } catch (err) {
        console.error('Error loading chat messages:', err);
      }
    }

    loadChatMessages();
  }, [chatId, isComplete]);

  // Scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    if (contentRef.current) {
      // Используем прямой контроль scrollTop для более точной прокрутки
      const container = contentRef.current;
      // Прокручиваем до самого низа - scrollHeight содержит полную высоту контента
      const scrollHeight = container.scrollHeight;
      
      // Плавная прокрутка до самого низа
      // Используем requestAnimationFrame для более плавной прокрутки после обновления DOM
      requestAnimationFrame(() => {
        container.scrollTo({
          top: scrollHeight, // Прокручиваем до самого низа
          behavior: 'smooth'
        });
        // Дополнительная прокрутка через небольшую задержку на случай, если DOM еще обновляется
        setTimeout(() => {
          const newScrollHeight = container.scrollHeight;
          if (newScrollHeight > scrollHeight) {
            container.scrollTo({
              top: newScrollHeight,
              behavior: 'smooth'
            });
          }
        }, 100);
      });
    }
  };

  useEffect(() => {
    // Прокручиваем вниз при добавлении новых сообщений
    if (chatMessages.length > 0) {
      // Увеличиваем задержку для того, чтобы DOM успел полностью обновиться
      setTimeout(() => {
        scrollToBottom();
      }, 200);
    }
  }, [chatMessages]);

  // Также прокручиваем при изменении состояния отправки (когда приходит ответ)
  useEffect(() => {
    if (!isSendingChat && chatMessages.length > 0) {
      // Когда отправка завершена и есть сообщения, прокручиваем вниз
      setTimeout(() => {
        scrollToBottom();
      }, 300);
    }
  }, [isSendingChat, chatMessages.length]);

  // Streaming generation - shows results as they arrive
  const generateResponseStream = async (queryText: string) => {
    try {
      const res = await fetch('/api/generate-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: queryText }),
      });

      if (!res.ok) {
        throw new Error('Ошибка запроса');
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error('Нет данных');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7);
          } else if (line.startsWith('data: ') && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              
              switch (currentEvent) {
                case 'status':
                  setStatusMessage(data.message);
                  break;
                case 'courtCases':
                  setResponse(prev => ({ ...prev, courtCases: data.cases }));
                  setCourtCasesData(data);
                  break;
                case 'shortAnswer':
                  setResponse(prev => ({ ...prev, shortAnswer: data }));
                  break;
                case 'legalAnalysis':
                  setResponse(prev => ({ ...prev, legalAnalysis: data }));
                  break;
                case 'practiceAnalysis':
                  setResponse(prev => ({ ...prev, practiceAnalysis: data }));
                  break;
                case 'probability':
                  setResponse(prev => ({ ...prev, probability: data }));
                  break;
                case 'courtPrediction':
                  setResponse(prev => ({ ...prev, courtPrediction: data }));
                  break;
                case 'defendantAnalysis':
                  setResponse(prev => ({ ...prev, defendantAnalysis: data }));
                  break;
                case 'recommendations':
                  setResponse(prev => ({ ...prev, recommendations: data }));
                  break;
                case 'clarificationRequest':
                  setClarificationRequest(data);
                  break;
                case 'complete':
                  setChatId(data.id);
                  setIsComplete(true);
                  // Don't redirect - stay on page and show full result
                  break;
                case 'error':
                  setError(data.message);
                  break;
              }
            } catch (e) {
              console.error('Parse error:', e);
            }
            currentEvent = '';
          }
        }
      }

    } catch (err) {
      console.error('Stream error:', err);
      setError(err instanceof Error ? err.message : 'Произошла ошибка');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleNewChat = () => {
    router.push('/chat');
  };

  // Определяем тип документа по сообщению
  // Лоадер показывается только при явном запросе на составление документа
  const getDocumentType = (message: string): string => {
    const lowerMessage = message.toLowerCase();
    
    // Проверяем явные запросы на составление документа
    const documentPatterns = [
      { pattern: /(?:составь|создай|подготовь|сформируй|сделай)\s+(?:ходатайств|ходатайство)/i, text: 'Составляю ходатайство' },
      { pattern: /(?:составь|создай|подготовь|сформируй|сделай)\s+(?:исков|иск|исковое\s+заявление)/i, text: 'Составляю исковое заявление' },
      { pattern: /(?:составь|создай|подготовь|сформируй|сделай)\s+(?:претензи|претензию)/i, text: 'Составляю претензию' },
      { pattern: /(?:составь|создай|подготовь|сформируй|сделай)\s+(?:возражени|возражения)/i, text: 'Составляю возражения на иск' },
      { pattern: /(?:составь|создай|подготовь|сформируй|сделай)\s+документ/i, text: 'Составляю документ' },
    ];
    
    for (const { pattern, text } of documentPatterns) {
      if (pattern.test(lowerMessage)) {
        return text;
      }
    }
    
    return 'Печатает...';
  };

  // Handle chat continuation after generation is complete
  const handleChatSubmit = async (message: string) => {
    if (!message.trim() || !chatId || isGenerating || isSendingChat) {
      return;
    }

    setIsSendingChat(true);
    setLastUserMessage(message);

    // Add user message optimistically
    const userMessage = {
      id: `temp-user-${Date.now()}`,
      role: 'user' as const,
      content: message,
      created_at: new Date().toISOString(),
    };
    setChatMessages(prev => [...prev, userMessage]);
    
    // Прокручиваем сразу после добавления сообщения пользователя
    setTimeout(() => {
      scrollToBottom();
    }, 100);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generationId: chatId,
          message,
        }),
      });

      if (!response.ok) {
        let errorMessage = 'Не удалось отправить сообщение';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          errorMessage = `Ошибка ${response.status}: ${response.statusText}`;
        }
        setChatMessages(prev => prev.filter(m => m.id !== userMessage.id));
        setError(errorMessage);
        alert(errorMessage);
        return;
      }

      const data = await response.json();

      if (!data.message) {
        throw new Error('Ответ сервера не содержит сообщения');
      }

      // Add assistant message
      const assistantMessage = {
        id: `temp-assistant-${Date.now()}`,
        role: 'assistant' as const,
        content: data.message,
        created_at: new Date().toISOString(),
        documents: data.documents || [],
      };
      setChatMessages(prev => [...prev, assistantMessage]);
      
      // Прокручиваем после добавления ответа ассистента
      setTimeout(() => {
        scrollToBottom();
      }, 150);

      // Reload messages from server
      try {
        const messagesResponse = await fetch(`/api/chat?generationId=${chatId}`);
        if (messagesResponse.ok) {
          const messagesData = await messagesResponse.json();
          setChatMessages(messagesData.messages || []);
        }
      } catch (reloadErr) {
        console.error('Error reloading messages:', reloadErr);
      }

    } catch (err) {
      console.error('Error sending chat message:', err);
      setChatMessages(prev => prev.filter(m => m.id !== userMessage.id));
      const errorMessage = err instanceof Error ? err.message : 'Произошла неизвестная ошибка';
      setError(errorMessage);
      alert(`Не удалось отправить сообщение: ${errorMessage}`);
    } finally {
      setIsSendingChat(false);
    }
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
      // Fallback to text file
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

  // Download chat-generated document
  const handleChatDocDownload = async (doc: { title: string; content: string }) => {
    if (!doc.content) {
      alert('Содержимое документа недоступно. Пожалуйста, попробуйте обновить страницу.');
      console.error('Chat document missing content:', doc);
      return;
    }
    
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
      try {
        const blob = new Blob([doc.content], { type: 'text/plain;charset=utf-8' });
        downloadBlob(blob, `${doc.title}.txt`);
      } catch (fallbackErr) {
        console.error('Error creating fallback text file:', fallbackErr);
        alert('Не удалось создать файл. Пожалуйста, попробуйте еще раз.');
      }
    }
  };

  const handleDownloadAll = async () => {
    if (!response?.documents) return;
    
    for (const doc of response.documents) {
      await handleDownload(doc);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  };

  // Handle defendant clarification form submission
  const handleDefendantSubmit = async () => {
    if (!chatId || !defendantForm.defendantName.trim()) return;
    
    setIsRefining(true);
    try {
      const res = await fetch('/api/refine-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generationId: chatId,
          defendantName: defendantForm.defendantName.trim(),
          defendantLocation: defendantForm.defendantLocation.trim() || 'Москва',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setRefinedData(data);
        setClarificationRequest(null);
      }
    } catch (err) {
      console.error('Refine error:', err);
    } finally {
      setIsRefining(false);
    }
  };

  // Check if we have any content to show
  const hasContent = response.courtCases || response.shortAnswer || response.legalAnalysis;

  return (
    <div className="flex bg-background h-screen mobile-fixed-layout" style={{
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
        currentChatId={chatId || undefined}
        onNewChat={handleNewChat}
      />
      <Sidebar currentChatId={chatId || undefined} onNewChat={handleNewChat} className="hidden md:flex" />
      
      <div className="flex-1 flex flex-col p-0 md:p-2 md:pl-0 md:pb-2 pt-[56px] md:pt-2 bg-[#17181A] overflow-hidden">
        <div className="flex-1 bg-background md:rounded-2xl relative flex flex-col overflow-hidden" style={{
          minHeight: 0
        }}>
          {/* Scrollable content */}
          <div 
            ref={contentRef} 
            className="flex-1 overflow-y-auto overflow-x-hidden pt-6 md:pt-14 px-0 relative pb-[calc(56px+48px)] md:pb-[calc(56px+64px)]"
            style={{
              minHeight: 0,
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <div className="w-full max-w-[660px] mx-auto flex flex-col gap-8 break-words px-4" style={{ position: 'relative' }}>
              {/* Query */}
              <h1 className="text-[20px] lg:text-[32px] font-medium text-foreground leading-[28px] lg:leading-[40px] tracking-tight break-words md:mt-0">
                {query}
              </h1>

              {/* Loading state - show skeleton cards immediately */}
              {isGenerating && !response.courtCases && (
                <div className="flex flex-col gap-4 animate-fadeIn -mx-4 md:mx-0">
                  <div className="flex items-center gap-3 px-4 md:px-0">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span className="text-sm text-gray-400">{statusMessage}</span>
                  </div>
                  <div 
                    className="overflow-x-auto overflow-y-hidden hide-horizontal-scrollbar pl-4 pr-4 md:pl-0 md:pr-0"
                    style={{ 
                      display: 'flex',
                      gap: '8px',
                      paddingBottom: '4px',
                      WebkitOverflowScrolling: 'touch'
                    }}
                  >
                    {/* Skeleton cards */}
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className="animate-pulse"
                        style={{ 
                          backgroundColor: resolvedTheme === 'light' ? '#F3F3F3' : '#1E1E1F',
                          width: '240px',
                          minWidth: '240px',
                          flexShrink: 0,
                          padding: '12px',
                          borderRadius: '16px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px',
                        }}
                      >
                        <div className="space-y-2">
                          <div className="h-4 rounded w-full" style={{ backgroundColor: resolvedTheme === 'light' ? '#E5E5E5' : '#2a2a2b' }} />
                          <div className="h-4 rounded w-4/5" style={{ backgroundColor: resolvedTheme === 'light' ? '#E5E5E5' : '#2a2a2b' }} />
                          <div className="h-4 rounded w-3/5" style={{ backgroundColor: resolvedTheme === 'light' ? '#E5E5E5' : '#2a2a2b' }} />
                        </div>
                        <div className="h-3 rounded w-1/3" style={{ backgroundColor: resolvedTheme === 'light' ? '#EBEBEB' : '#252526' }} />
                      </div>
                    ))}
                    <div className="min-w-4 flex-shrink-0" />
                  </div>
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

              {/* Clarification question */}
              {clarification && (
                <div className="flex flex-col gap-4 animate-fadeIn">
                  <p className="text-[11px] lg:text-[12px] font-medium text-gray-400 uppercase tracking-tight leading-[14px]">
                    Уточните вопрос
                  </p>
                  <div className="p-4 rounded-xl" style={{ backgroundColor: resolvedTheme === 'light' ? '#F3F3F3' : '#1E1E1F' }}>
                    <p className="text-base text-foreground mb-4">{clarification.question}</p>
                    <div className="flex flex-wrap gap-2">
                      {clarification.options.map((option, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            setClarification(null);
                            setIsGenerating(true);
                            setStatusMessage('Ищу судебные дела...');
                            setResponse({});
                            // Re-run with clarified query
                            const newQuery = `${query} (${option})`;
                            setQuery(newQuery);
                            sessionStorage.setItem('pendingQuery', newQuery);
                            hasStartedGeneration.current = false;
                            router.push(`/chat/new?q=${encodeURIComponent(newQuery)}`);
                          }}
                          className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-[#3a3a3a] transition-colors"
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Court cases - appears first (fast) */}
                  {response.courtCases && response.courtCases.length > 0 && (
                <div className="flex flex-col gap-4 animate-fadeIn -mx-4 md:mx-0">
                      <p className="text-[11px] lg:text-[12px] font-medium text-gray-400 uppercase tracking-tight leading-[14px] lg:leading-[14px] px-4 md:px-0">
                        Судебные дела
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
                  
                  {/* Defendant history if available */}
                  {courtCasesData?.defendantHistory && (
                    <div className="grid grid-cols-1 gap-3 px-4 mt-2">
                      <div 
                        className="p-3 rounded-xl"
                        style={{ backgroundColor: resolvedTheme === 'light' ? '#FEF3C7' : '#422006' }}
                      >
                        <p className="text-[11px] font-medium text-gray-400 uppercase mb-1">⚖️ История ответчика</p>
                        <p className="text-[13px] font-medium text-foreground leading-[18px]">
                          {courtCasesData.defendantHistory.name}
                        </p>
                        <p className="text-[12px] text-secondary-text">
                          {courtCasesData.defendantHistory.totalCases} дел, проиграно {courtCasesData.defendantHistory.casesLost}
                        </p>
                      </div>
                    </div>
                  )}
                    </div>
                  )}

              {response.courtCases && <div className="h-px bg-gray-200" />}

              {/* Short answer - appears second */}
                  {response.shortAnswer && (
                <div className="flex flex-col gap-4 animate-fadeIn">
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

              {response.shortAnswer && <div className="h-px bg-gray-200" />}

              {/* Legal analysis - appears third */}
                  {response.legalAnalysis && (
                <div className="flex flex-col gap-4 animate-fadeIn">
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

              {response.legalAnalysis && <div className="h-px bg-gray-200" />}

                  {/* Practice analysis */}
                  {response.practiceAnalysis && (
                <div className="flex flex-col gap-4 animate-fadeIn">
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

              {response.practiceAnalysis && <div className="h-px bg-gray-200" />}

              {/* Court Prediction with Judges */}
              {response.courtPrediction && (
                <div className="flex flex-col gap-4 animate-fadeIn">
                  <p className="text-[11px] lg:text-[12px] font-medium text-gray-400 uppercase tracking-tight leading-[14px] lg:leading-[14px]">
                    Подсудность и судьи
                  </p>
                  <div className="text-base text-foreground leading-[24px] break-words">
                    {response.courtPrediction.predictedCourt && (
                      <div className="mb-4 p-4 rounded-xl" style={{ backgroundColor: resolvedTheme === 'light' ? '#F3F3F3' : '#1E1E1F' }}>
                        <p className="font-semibold mb-1">📍 {response.courtPrediction.predictedCourt.name}</p>
                        {response.courtPrediction.predictedCourt.address && (
                          <p className="text-sm text-secondary-text mb-2">{response.courtPrediction.predictedCourt.address}</p>
                        )}
                        {response.courtPrediction.predictedCourt.reason && (
                          <p className="text-sm text-secondary-text italic">{response.courtPrediction.predictedCourt.reason}</p>
                        )}
                      </div>
                    )}
                    {response.courtPrediction.judges && response.courtPrediction.judges.length > 0 && (
                      <>
                        <p className="text-[16px] font-semibold mb-3">Судьи по аналогичным делам:</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {response.courtPrediction.judges.map((judge, i) => (
                            <div 
                              key={i}
                              className="p-3 rounded-lg"
                              style={{ backgroundColor: resolvedTheme === 'light' ? '#F3F3F3' : '#1E1E1F' }}
                            >
                              <p className="font-medium text-foreground">{judge.name}</p>
                              {judge.satisfactionRate !== undefined && (
                                <p className="text-sm text-secondary-text">
                                  Удовлетворено: {Math.round(judge.satisfactionRate * 100)}%
                                  {judge.casesCount && ` (${judge.casesCount} дел)`}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {response.courtPrediction && <div className="h-px bg-gray-200" />}

              {/* Defendant Analysis */}
              {response.defendantAnalysis && response.defendantAnalysis.hasHistory && (
                <div className="flex flex-col gap-4 animate-fadeIn">
                  <p className="text-[11px] lg:text-[12px] font-medium text-gray-400 uppercase tracking-tight leading-[14px] lg:leading-[14px]">
                    Анализ ответчика
                  </p>
                  <div className="text-base text-foreground leading-[24px] break-words">
                    {response.defendantAnalysis.summary && (
                      <p className="mb-3">{response.defendantAnalysis.summary}</p>
                    )}
                    {response.defendantAnalysis.opportunities && response.defendantAnalysis.opportunities.length > 0 && (
                      <div className="mb-3">
                        <p className="text-[16px] font-semibold mb-2 text-green-600 dark:text-green-400">✅ Возможности:</p>
                        <ul className="list-disc ml-5">
                          {response.defendantAnalysis.opportunities.map((opp, i) => (
                            <li key={i} className="mb-1">{opp}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {response.defendantAnalysis.riskFactors && response.defendantAnalysis.riskFactors.length > 0 && (
                      <div>
                        <p className="text-[16px] font-semibold mb-2 text-orange-600 dark:text-orange-400">⚠️ Риски:</p>
                        <ul className="list-disc ml-5">
                          {response.defendantAnalysis.riskFactors.map((risk, i) => (
                            <li key={i} className="mb-1">{risk}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {response.defendantAnalysis?.hasHistory && <div className="h-px bg-gray-200" />}

                  {/* Recommendations */}
                  {response.recommendations && (
                <div className="flex flex-col gap-4 animate-fadeIn">
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

              {response.recommendations && <div className="h-px bg-gray-200" />}

              {/* Clarification request - ask for defendant info */}
              {clarificationRequest && isComplete && !refinedData && (
                <div className="flex flex-col gap-4 animate-fadeIn">
                  <p className="text-[11px] lg:text-[12px] font-medium text-gray-400 uppercase tracking-tight leading-[14px] lg:leading-[14px]">
                    Уточнить поиск
                  </p>
                  <div className="p-4 rounded-xl bg-[#F3F3F3]">
                    <p className="text-base font-medium text-foreground mb-2">
                      {clarificationRequest.message}
                    </p>
                    <p className="text-sm text-secondary-text mb-4">
                      {clarificationRequest.hint}
                    </p>
                    <div className="flex flex-col gap-3">
                      {clarificationRequest.fields.map((field) => (
                        <div key={field.key}>
                          <label className="block text-sm font-medium text-foreground mb-1.5">
                            {field.label}
                          </label>
                          <input
                            type="text"
                            placeholder={field.placeholder}
                            value={defendantForm[field.key as keyof typeof defendantForm] || ''}
                            onChange={(e) => setDefendantForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                            className="w-full h-[48px] px-4 text-base text-foreground border-0 rounded-[16px] placeholder:text-secondary-text focus:outline-none focus:ring-2 focus:ring-accent transition-colors bg-white"
                          />
                        </div>
                      ))}
                      <button
                        onClick={handleDefendantSubmit}
                        disabled={isRefining || !defendantForm.defendantName.trim()}
                        className="mt-2 px-5 py-3 rounded-xl font-medium transition-colors disabled:opacity-50"
                        style={{ 
                          backgroundColor: resolvedTheme === 'light' ? '#212121' : '#ffffff',
                          color: resolvedTheme === 'light' ? '#ffffff' : '#000000'
                        }}
                      >
                        {isRefining ? 'Поиск...' : 'Найти дела с этим ответчиком'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {clarificationRequest && !refinedData && <div className="h-px bg-gray-200" />}

              {/* Refined search results */}
              {refinedData && (
                <div className="flex flex-col gap-4 animate-fadeIn">
                  <p className="text-[11px] lg:text-[12px] font-medium text-gray-400 uppercase tracking-tight leading-[14px] lg:leading-[14px]">
                    Анализ ответчика: {refinedData.defendantName}
                  </p>
                  
                  {/* Defendant history */}
                  {refinedData.defendantHistory && (
                    <div className="p-4 rounded-xl" style={{ backgroundColor: resolvedTheme === 'light' ? '#F3F3F3' : '#1E1E1F' }}>
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                          <p className="text-2xl font-bold text-foreground">{refinedData.defendantHistory.totalCases}</p>
                          <p className="text-xs text-secondary-text">дел всего</p>
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-foreground">{refinedData.defendantHistory.asDefendant}</p>
                          <p className="text-xs text-secondary-text">как ответчик</p>
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-red-500">{refinedData.defendantHistory.casesLost}</p>
                          <p className="text-xs text-secondary-text">проиграно</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Updated probability - only show when defendant has cases */}
                  {refinedData.updatedProbability && refinedData.defendantHistory?.totalCases > 0 && (
                    <div className="p-4 rounded-xl" style={{ backgroundColor: resolvedTheme === 'light' ? '#F3F3F3' : '#1E1E1F' }}>
                      <p className="text-[11px] lg:text-[12px] font-medium text-gray-400 uppercase tracking-tight leading-[14px] mb-2">
                        Вероятность выиграть дело (уточнённая)
                      </p>
                      <p className="text-[24px] lg:text-[32px] font-bold text-foreground">
                        {refinedData.updatedProbability.percentage}%
                        <span className="text-[16px] lg:text-[18px] font-medium text-gray-500 ml-2">
                          ({refinedData.updatedProbability.level})
                        </span>
                      </p>
                      <p className="text-sm text-secondary-text mt-2">
                        {refinedData.updatedProbability.adjustment}
                      </p>
                    </div>
                  )}

                  {/* Additional recommendations */}
                  {refinedData.recommendations && refinedData.recommendations.length > 0 && (
                    <div>
                      <p className="font-semibold mb-2">💡 Рекомендации с учётом ответчика</p>
                      <ul className="list-disc ml-5 text-base text-foreground">
                        {refinedData.recommendations.map((rec: string, i: number) => (
                          <li key={i} className="mb-2">{rec}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {refinedData && <div className="h-px bg-gray-200" />}

              {/* Next Steps - when complete */}
              {isComplete && chatId && (
                <div className="flex flex-col gap-4 animate-fadeIn">
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
                        onClick={() => router.push(`/chat/${chatId}?action=lawsuit`)}
                        className="px-4 py-2 text-sm font-medium rounded-xl bg-[#212121] text-white hover:bg-[#3a3a3a] transition-colors"
                      >
                        Исковое заявление
                      </button>
                      <button
                        onClick={() => router.push(`/chat/${chatId}?action=claim`)}
                        className="px-4 py-2 text-sm font-medium rounded-xl bg-[#212121] text-white hover:bg-[#3a3a3a] transition-colors"
                      >
                        Претензия
                      </button>
                      <button
                        onClick={() => router.push(`/chat/${chatId}?action=motion`)}
                        className="px-4 py-2 text-sm font-medium rounded-xl bg-[#212121] text-white hover:bg-[#3a3a3a] transition-colors"
                      >
                        Ходатайство
                      </button>
                      <button
                        onClick={() => router.push(`/chat/${chatId}?action=objection`)}
                        className="px-4 py-2 text-sm font-medium rounded-xl bg-[#212121] text-white hover:bg-[#3a3a3a] transition-colors"
                      >
                        Возражения на иск
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Divider - only show if documents follow */}
              {isComplete && chatId && response.documents && response.documents.length > 0 && (
                <div className="h-px bg-gray-200" />
              )}

                  {/* Documents */}
                  {response.documents && response.documents.length > 0 && (
                <div className="flex flex-col gap-4 animate-fadeIn">
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
              
              {/* Chat continuation messages */}
              {chatMessages.length > 0 && (
                <>
                  <div className="h-px bg-gray-200" />
                  <div className="flex flex-col gap-4">
                    <p className="text-[11px] lg:text-[12px] font-medium text-gray-400 uppercase tracking-tight leading-[14px] lg:leading-[14px]">
                      Продолжение диалога
                    </p>
                    
                    {error && (
                      <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm">
                        {error}
                        <button 
                          onClick={() => setError('')}
                          className="ml-4 underline"
                        >
                          Закрыть
                        </button>
                      </div>
                    )}
                    
                    {chatMessages.map((msg) => (
                      <div key={msg.id}>
                        {msg.role === 'user' ? (
                          <div className="flex justify-end">
                            <div className="max-w-[85%] px-4 py-3 bg-[#212121] text-white rounded-2xl">
                              <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-4">
                            {(() => {
                              // Разделяем сообщение: текст до "Нужна помощь представителя" и после
                              const representativeMatch = msg.content.match(/\*\*Нужна помощь представителя/);
                              let mainText = msg.content;
                              let representativeText = '';
                              
                              if (representativeMatch && representativeMatch.index !== undefined) {
                                mainText = msg.content.slice(0, representativeMatch.index).trim();
                                representativeText = msg.content.slice(representativeMatch.index).trim();
                              }
                              
                              return (
                                <>
                                  {/* Основной текст (например, "Документ готов для скачивания") */}
                                  <div className="text-base text-foreground leading-[24px] break-words">
                                    <MarkdownRenderer content={mainText} />
                                  </div>
                                  
                                  {/* Документы для скачивания - сразу после основного текста */}
                                  {msg.documents && msg.documents.length > 0 && (
                                    <div className="flex flex-col gap-2">
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
                                  
                                  {/* Текст про представителя - после документов */}
                                  {representativeText && (
                                    <div className="text-base text-foreground leading-[24px] break-words">
                                      <MarkdownRenderer content={representativeText} />
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    ))}
                    
                    {isSendingChat && (
                      <div className="flex items-center gap-2 text-gray-400">
                        <div className="flex gap-1">
                          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                        <span className="text-xs">{getDocumentType(lastUserMessage)}</span>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                </>
              )}

              {/* Loading indicator at the bottom when still generating */}
              {isGenerating && hasContent && !isComplete && (
                <div className="flex items-center gap-3 py-4">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-sm text-gray-400">{statusMessage}</span>
                </div>
              )}
            </div>
          </div>
          
          {/* Desktop Input - внутри контента */}
          <div className="hidden md:block relative">
            <ChatInput 
              onSubmit={isComplete && chatId ? handleChatSubmit : () => {}} 
              disabled={isGenerating || isSendingChat || !isComplete || !chatId}
              placeholder={isGenerating ? "Дождитесь завершения анализа..." : (isComplete && chatId ? "Задайте вопрос" : "Дождитесь завершения анализа...")}
            />
          </div>
        </div>
      </div>

      {/* Mobile Input - вне overflow контейнера для правильного позиционирования */}
      <div className="md:hidden">
        <ChatInput 
          onSubmit={isComplete && chatId ? handleChatSubmit : () => {}} 
          disabled={isGenerating || isSendingChat || !isComplete || !chatId}
          placeholder={isGenerating ? "Дождитесь завершения анализа..." : (isComplete && chatId ? "Задайте вопрос" : "Дождитесь завершения анализа...")}
        />
      </div>
    </div>
  );
}

export default function NewChatPage() {
  return (
    <Suspense fallback={
      <div className="flex bg-background items-center justify-center" style={{ height: 'var(--viewport-height, 100vh)' }}>
        <div className="animate-pulse text-gray-400">Загрузка...</div>
      </div>
    }>
      <NewChatPageContent />
    </Suspense>
  );
}