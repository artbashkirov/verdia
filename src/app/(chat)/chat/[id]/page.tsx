'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Sidebar, ChatInput, MobileHeader, MobileSidebar, ProbabilityBlock } from '@/components/layout';
import { DownloadIcon } from '@/components/icons';
import { MarkdownRenderer } from '@/components/ui';
import { generateDocx, downloadBlob } from '@/lib/docx-generator';
import { CaseTransitionBanner } from '@/components/cases/CaseTransitionBanner';
import { useTheme } from '@/lib/theme-context';
import { safeGet, safeSet } from '@/lib/safe-storage';
import {
  stripAttachmentsSuffix,
  formatAttachmentSize,
  buildEffectiveMessageWithAttachments,
  toAttachmentMetaList,
  type ChatAttachment,
  type ChatAttachmentMeta,
} from '@/types/chat-attachment';

const CASES_ENABLED = process.env.NEXT_PUBLIC_FEATURE_CASES === 'true';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  documents?: Array<{ title: string; content: string }>;
  attachment?: { fileName: string; mimeType: string; size: number } | null;
  attachments?: ChatAttachmentMeta[];
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

interface Generation {
  id: string;
  query: string;
  response: GenerationResponse;
  created_at: string;
}

function ChatResultPageContent() {
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
  const [lastUserMessage, setLastUserMessage] = useState<string>('');
  const [visitedUrls, setVisitedUrls] = useState<Set<string>>(new Set());

  // Load visited URLs from localStorage
  useEffect(() => {
    const stored = safeGet('visitedCourtCases');
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
      safeSet('visitedCourtCases', JSON.stringify([...updated]));
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const actionProcessed = useRef(false);

  // Get chat ID safely
  const chatId = params.id ? (Array.isArray(params.id) ? params.id[0] : params.id) : '';

  // Scroll to bottom when new messages arrive
  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      // Используем прямой контроль scrollTop для более точной прокрутки
      const container = scrollContainerRef.current;
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
    if (!isSending && chatMessages.length > 0) {
      // Когда отправка завершена и есть сообщения, прокручиваем вниз
      setTimeout(() => {
        scrollToBottom();
      }, 300);
    }
  }, [isSending, chatMessages.length]);

  // Fetch chat messages
  useEffect(() => {
    const controller = new AbortController();

    async function fetchMessages() {
      if (!params.id) return;

      const id = Array.isArray(params.id) ? params.id[0] : params.id;

      try {
        const response = await fetch(`/api/chat?generationId=${id}`, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (response.ok) {
          const data = await response.json();
          const messages = data.messages || [];

          const normalizedMessages = messages.map((msg: ChatMessage) => {
            const attachments =
              Array.isArray(msg.attachments) && msg.attachments.length > 0
                ? msg.attachments
                : msg.attachment
                  ? [msg.attachment]
                  : [];
            return {
              ...msg,
              documents: Array.isArray(msg.documents) ? msg.documents : [],
              attachments,
              attachment: attachments[0] ?? null,
            };
          });

          if (!controller.signal.aborted) {
            setChatMessages(normalizedMessages);
            console.log('📥 Loaded messages with documents:', normalizedMessages.filter((m: ChatMessage) => (m.documents?.length ?? 0) > 0).length);
          }
        }
      } catch (err) {
        // Игнорируем отменённые запросы (нормальное поведение при unmount)
        if ((err as Error)?.name === 'AbortError') return;
        console.error('Error fetching messages:', err);
      }
    }

    fetchMessages();

    return () => {
      controller.abort();
    };
  }, [params.id]);

  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;
    const controller = new AbortController();

    async function fetchGeneration() {
      if (!params.id) {
        setIsLoading(false);
        setError('ID не найден');
        return;
      }

      const id = Array.isArray(params.id) ? params.id[0] : params.id;

      // First check sessionStorage
      const stored = safeGet('lastResponse', 'session');
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

      if (!id) {
        setError('ID не найден');
        setIsLoading(false);
        return;
      }

      try {
        // Fetch via server API route — avoids browser Supabase SDK
        // occasionally hanging on auth-token refresh.
        const response = await fetch(`/api/generations/${id}`, {
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        if (!response.ok) {
          let errorMessage = 'Не удалось загрузить результат';
          try {
            const errData = await response.json();
            if (errData?.error) errorMessage = errData.error;
          } catch {
            // ignore JSON parse errors
          }
          console.error('Error fetching generation:', response.status, errorMessage);
          setError(errorMessage);
          setIsLoading(false);
          return;
        }

        const json = await response.json();
        const generationData = json.generation as Generation;

        if (!generationData) {
          setError('Результат не найден');
          setIsLoading(false);
          return;
        }

        setGeneration(generationData);
        setIsLoading(false);

        // If response is null, poll every 2 seconds until it's ready
        if (!generationData.response) {
          pollInterval = setInterval(async () => {
            if (controller.signal.aborted) return;
            try {
              const pollResponse = await fetch(`/api/generations/${id}`, {
                signal: controller.signal,
              });
              if (controller.signal.aborted) return;
              if (!pollResponse.ok) return;
              const pollJson = await pollResponse.json();
              const updatedData = pollJson.generation as Generation;
              if (updatedData && updatedData.response && !controller.signal.aborted) {
                setGeneration(updatedData);
                if (pollInterval) {
                  clearInterval(pollInterval);
                  pollInterval = null;
                }
              }
            } catch (pollErr) {
              if ((pollErr as Error)?.name === 'AbortError') return;
              console.error('Polling error:', pollErr);
            }
          }, 2000);
        }
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        if (controller.signal.aborted) return;
        console.error('Unexpected fetchGeneration error:', err);
        setError('Не удалось загрузить результат. Проверьте подключение и обновите страницу.');
        setIsLoading(false);
      }
    }

    fetchGeneration();

    return () => {
      controller.abort();
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, isLoading, generation, chatId]);

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

  const handleSubmit = async (message: string, attachments?: ChatAttachment[]) => {
    const list = attachments ?? [];
    const effectiveMessage = buildEffectiveMessageWithAttachments(message, list);
    if (!effectiveMessage) {
      return;
    }

    if (isSending) {
      return;
    }

    if (!chatId || chatId.trim() === '') {
      setError('ID чата не найден. Пожалуйста, обновите страницу.');
      return;
    }

    setIsSending(true);
    setLastUserMessage(effectiveMessage);

    const attachmentMeta = toAttachmentMetaList(list);
    const userMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: effectiveMessage,
      created_at: new Date().toISOString(),
      attachments: attachmentMeta,
      attachment: attachmentMeta[0] ?? null,
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
          message: effectiveMessage,
          attachments: list,
        }),
      });

      if (!response.ok) {
        // Try to get error message from response
        let errorMessage = 'Не удалось отправить сообщение';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = `Ошибка ${response.status}: ${response.statusText}`;
        }
        
        // Remove optimistic message on error
        setChatMessages(prev => prev.filter(m => m.id !== userMessage.id));
        setError(errorMessage);
        toast.error(errorMessage);
        return;
      }

      const data = await response.json();

      if (!data.message) {
        throw new Error('Ответ сервера не содержит сообщения');
      }

      // Clear any previous errors
      setError('');
      
      // Reload messages from server to get actual data with proper IDs
      // This ensures we have the correct data from the database
      try {
        const messagesResponse = await fetch(`/api/chat?generationId=${chatId}`);
        if (messagesResponse.ok) {
          const messagesData = await messagesResponse.json();
          const messages = messagesData.messages || [];
          
          // Ensure documents are properly formatted
          const normalizedMessages = messages.map((msg: ChatMessage) => {
            const attachments =
              Array.isArray(msg.attachments) && msg.attachments.length > 0
                ? msg.attachments
                : msg.attachment
                  ? [msg.attachment]
                  : [];
            return {
              ...msg,
              documents: Array.isArray(msg.documents) ? msg.documents : [],
              attachments,
              attachment: attachments[0] ?? null,
            };
          });

          // Replace all messages with fresh data from server
          setChatMessages(normalizedMessages);
        } else {
          // If reload fails, add assistant message optimistically
          const assistantMessage: ChatMessage = {
            id: `temp-assistant-${Date.now()}`,
            role: 'assistant',
            content: data.message,
            created_at: new Date().toISOString(),
            documents: data.documents || [],
            attachments: [],
            attachment: null,
          };
          setChatMessages(prev => [...prev, assistantMessage]);
        }
      } catch (reloadErr) {
        console.error('Error reloading messages:', reloadErr);
        // If reload fails, add assistant message optimistically
        const assistantMessage: ChatMessage = {
          id: `temp-assistant-${Date.now()}`,
          role: 'assistant',
          content: data.message,
          created_at: new Date().toISOString(),
          documents: data.documents || [],
          attachment: null,
        };
        setChatMessages(prev => [...prev, assistantMessage]);
      }

    } catch (err) {
      console.error('Error sending message:', err);
      // Remove optimistic message on error
      setChatMessages(prev => prev.filter(m => m.id !== userMessage.id));
      const errorMessage = err instanceof Error ? err.message : 'Произошла неизвестная ошибка';
      setError(errorMessage);
      toast.error(`Не удалось отправить сообщение: ${errorMessage}`);
    } finally {
      setIsSending(false);
    }
  };

  // Download chat-generated document
  const handleChatDocDownload = async (doc: { title: string; content: string }) => {
    if (!doc.content) {
      toast.error('Содержимое документа недоступно. Попробуйте обновить страницу.');
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
        toast.error('Не удалось создать файл. Попробуйте ещё раз.');
      }
    }
  };

  const handleDownload = async (doc: { id: number; title: string; content?: string; format: string }) => {
    if (!doc.content) {
      toast.error('Содержимое документа недоступно. Попробуйте обновить страницу или обратиться в поддержку.');
      console.error('Document missing content:', doc);
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
      try {
        const blob = new Blob([doc.content], { type: 'text/plain;charset=utf-8' });
        downloadBlob(blob, `${doc.title}.txt`);
      } catch (fallbackErr) {
        console.error('Error creating fallback text file:', fallbackErr);
        toast.error('Не удалось создать файл. Попробуйте ещё раз.');
      }
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

  // Показываем полноэкранный лоадер только при первой загрузке, не при отправке сообщений
  if (isLoading && !generation && chatMessages.length === 0) {
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

  // Check if generation is in progress (no response OR response has _status: 'generating')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isGenerating = generation && (!generation.response || (generation.response as any)?._status === 'generating');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const partialCourtCases = (generation?.response as any)?.courtCases;
  
  if (isGenerating) {
    return (
      <div className="flex bg-background h-screen mobile-fixed-layout" style={{ width: '100%' }}>
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
        <div className="flex-1 flex flex-col min-w-0 p-0 md:p-2 md:pl-0 md:pb-2 pt-[56px] md:pt-2 bg-[#17181A] overflow-hidden">
          <div className="flex-1 bg-background md:rounded-2xl relative flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto overflow-x-hidden pt-6 md:pt-14 px-0 relative pb-[calc(56px+48px)] md:pb-[calc(56px+64px)]">
              <div className="w-full max-w-[660px] mx-auto flex flex-col gap-8 break-words px-4">
                {/* Query */}
                <h1 className="text-[20px] lg:text-[32px] font-medium text-foreground leading-[28px] lg:leading-[40px] tracking-tight break-words md:mt-0">
                  {generation?.query}
                </h1>

                {/* Loading state - show real court cases if available, otherwise skeleton */}
                <div className="flex flex-col gap-4 animate-fadeIn -mx-4 md:mx-0">
                  {/* Show searching status if no court cases yet */}
                  {!partialCourtCases && (
                    <div className="flex items-center gap-3 px-4 md:px-0">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      <span className="text-sm text-gray-400">Ищу судебные дела...</span>
                    </div>
                  )}
                  
                  {/* Show label for court cases if available */}
                  {partialCourtCases && partialCourtCases.length > 0 && (
                    <p className="text-[11px] lg:text-[12px] font-medium text-gray-400 uppercase tracking-tight leading-[14px] lg:leading-[14px] px-4 md:px-0">
                      Судебные дела
                    </p>
                  )}
                  
                  <div 
                    className="overflow-x-auto overflow-y-hidden hide-horizontal-scrollbar pl-4 pr-4 md:pl-0 md:pr-0"
                    style={{ 
                      display: 'flex',
                      gap: '8px',
                      paddingBottom: '4px',
                      WebkitOverflowScrolling: 'touch'
                    }}
                  >
                    {/* Show real court cases if available */}
                    {partialCourtCases && partialCourtCases.length > 0 ? (
                      <>
                        {partialCourtCases.map((c: { id: number; title: string; url: string }) => (
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
                        <div className="min-w-4 flex-shrink-0" />
                      </>
                    ) : (
                      /* Skeleton cards when court cases not yet found */
                      <>
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
                      </>
                    )}
                  </div>
                  
                  {/* Show "Preparing response" status AFTER court cases */}
                  {partialCourtCases && partialCourtCases.length > 0 && (
                    <div className="flex items-center gap-3 px-4 md:px-0 mt-4">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      <span className="text-sm text-gray-400">Готовлю ответ...</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isLoading && (error || !generation)) {
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

  if (!generation) {
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
          <div 
            ref={scrollContainerRef}
            className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden pt-6 md:pt-14 px-0 relative pb-[calc(56px+48px)] md:pb-[calc(56px+64px)]" 
            style={{
              minHeight: 0,
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <div className="w-full max-w-[660px] mx-auto flex flex-col gap-8 px-4" style={{ position: 'relative', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
              {/* Query */}
              <h1 className="text-[20px] lg:text-[32px] font-medium text-foreground leading-[28px] lg:leading-[40px] tracking-tight break-words md:mt-0">
                {query}
              </h1>

              {/* Court cases */}
              {response.courtCases && response.courtCases.length > 0 && (
                <div className="flex flex-col gap-4 -mx-4 md:mx-0">
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
                    {(response.shortAnswer.probability || response.probability) && (
                      <ProbabilityBlock 
                        probData={response.shortAnswer.probability || response.probability} 
                        resolvedTheme={resolvedTheme} 
                      />
                    )}
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

              {/* Case transition banner — gated behind NEXT_PUBLIC_FEATURE_CASES */}
              {CASES_ENABLED && generation && (
                <CaseTransitionBanner
                  generationId={chatId}
                  query={query}
                />
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

              {/* Chat continuation section - always show after initial generation is loaded */}
              {!isLoading && generation && (
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
                    
                    {chatMessages.length === 0 && !error && (
                      <div className="text-sm text-gray-400 italic">
                        Задайте вопрос для продолжения диалога
                      </div>
                    )}
                    
                    {chatMessages.map((msg) => (
                      <div key={msg.id}>
                        {msg.role === 'user' ? (
                          // User message - right aligned with dark background
                          <div className="flex flex-col items-end gap-2">
                            {(msg.attachments?.length
                              ? msg.attachments
                              : msg.attachment
                                ? [msg.attachment]
                                : []
                            ).map((att, attIdx) => (
                              <div
                                key={`${att.fileName}-${attIdx}`}
                                className="flex items-center max-w-[85%]"
                                style={{
                                  gap: '8px',
                                  padding: '8px 12px',
                                  borderRadius: '12px',
                                  backgroundColor: 'var(--input-bg)',
                                  border: '1px solid #CCCCCC',
                                }}
                              >
                                <span className="text-base" aria-hidden="true">📎</span>
                                <div className="flex flex-col min-w-0">
                                  <span
                                    className="text-foreground truncate"
                                    style={{ fontSize: '13px', lineHeight: '16px', fontWeight: 500 }}
                                    title={att.fileName}
                                  >
                                    {att.fileName}
                                  </span>
                                  <span
                                    className="text-[#808080]"
                                    style={{ fontSize: '11px', lineHeight: '14px' }}
                                  >
                                    {formatAttachmentSize(att.size)}
                                  </span>
                                </div>
                              </div>
                            ))}
                            {(() => {
                              const attachmentList =
                                msg.attachments?.length
                                  ? msg.attachments
                                  : msg.attachment
                                    ? [msg.attachment]
                                    : [];
                              const visible = stripAttachmentsSuffix(msg.content, attachmentList);
                              if (!visible) return null;
                              return (
                                <div className="max-w-[85%] px-4 py-3 bg-[#212121] text-white rounded-2xl">
                                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{visible}</p>
                                </div>
                              );
                            })()}
                          </div>
                        ) : (
                          // Assistant message - clean text without background
                          <div className="flex flex-col gap-4">
                            {(() => {
                              return (
                                <>
                                  {/* Основной текст (например, "Документ готов для скачивания") */}
                                  <div className="text-base text-foreground leading-[24px] break-words">
                                    <MarkdownRenderer content={msg.content} />
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
                                </>
                              );
                            })()}
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
                        <span className="text-xs">{getDocumentType(lastUserMessage)}</span>
                      </div>
                    )}
                    
                    <div ref={messagesEndRef} />
                  </div>
                </>
              )}
            </div>
          </div>
          
          {/* Desktop Input - внутри контента */}
          <div className="hidden md:block relative">
            <ChatInput 
              onSubmit={handleSubmit} 
              placeholder="Задайте вопрос"
              disabled={isSending}
            />
          </div>
        </div>
      </div>

      {/* Mobile Input - вне overflow контейнера для правильного позиционирования */}
      <div className="md:hidden">
        <ChatInput 
          onSubmit={handleSubmit} 
          placeholder="Задайте вопрос"
          disabled={isSending}
        />
      </div>
    </div>
  );
}

export default function ChatResultPage() {
  return (
    <Suspense fallback={
      <div className="flex bg-background items-center justify-center" style={{ height: 'var(--viewport-height, 100vh)' }}>
        <div className="w-12 h-12 border-4 border-foreground border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ChatResultPageContent />
    </Suspense>
  );
}
