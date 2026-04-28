'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TrashIcon, HelpCircleIcon, ChevronDownIcon, UserIcon } from '@/components/icons';
import { createClient } from '@/lib/supabase/client';
import { safeGet, safeSet, safeSetJson } from '@/lib/safe-storage';
import { getUserWithTimeout } from '@/lib/auth-timeout';
import { toast } from 'sonner';
import type { User } from '@supabase/supabase-js';

interface ChatHistory {
  id: string;
  title: string;
  isGenerating?: boolean; // true if response is null (still generating)
}

interface MobileSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  chatHistory?: ChatHistory[];
  currentChatId?: string;
  onNewChat?: () => void;
  onClearHistory?: () => void;
  refreshTrigger?: number;
  pendingChat?: { id: string; title: string }; // Show immediately when user sends query
}

export function MobileSidebar({
  isOpen,
  onClose,
  chatHistory: propChatHistory,
  currentChatId,
  onNewChat,
  onClearHistory,
  refreshTrigger = 0,
  pendingChat,
}: MobileSidebarProps) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatHistory[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [readChats, setReadChats] = useState<Set<string>>(new Set());
  const [isMounted, setIsMounted] = useState(false);
  const [swipedChatId, setSwipedChatId] = useState<string | null>(null);
  const touchStartX = useRef<number>(0);
  const swipeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const dropdownRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  // Save chat history to localStorage whenever it changes
  useEffect(() => {
    if (chatHistory.length > 0) {
      safeSetJson('chatHistoryCache', chatHistory);
    }
  }, [chatHistory]);

  // Initialize from localStorage after mount
  useEffect(() => {
    setIsMounted(true);
    
    // Load cached chat history
    const cachedHistory = safeGet('chatHistoryCache');
    if (cachedHistory) {
      try {
        setChatHistory(JSON.parse(cachedHistory));
        setIsLoadingHistory(false);
      } catch (e) {
        console.error('Error loading cached history:', e);
      }
    }
    
    // Load read status
    const stored = safeGet('readChats');
    if (stored) {
      try {
        setReadChats(new Set(JSON.parse(stored)));
      } catch (e) {
        console.error('Error loading read chats:', e);
      }
    }
  }, []);

  // Mark current chat as read
  useEffect(() => {
    if (currentChatId && !readChats.has(currentChatId)) {
      setReadChats(prev => {
        const updated = new Set(prev);
        updated.add(currentChatId);
        safeSet('readChats', JSON.stringify([...updated]));
        return updated;
      });
    }
  }, [currentChatId]);

  useEffect(() => {
    const supabase = createClient();
    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
    
    // Get current user with timeout — на мобильных getUser() иногда зависает
    // на refresh-токене, без таймаута пользователь видит вечный спиннер истории.
    getUserWithTimeout(supabase).then(({ user, error, timedOut }) => {
      if (timedOut || error) {
        if (timedOut) {
          console.warn('[MobileSidebar] auth getUser timed out — продолжаем с кэшем истории');
        } else {
          console.error('[MobileSidebar] auth getUser failed:', error);
        }
        setIsLoadingHistory(false);
        return;
      }
      setUser(user);
      if (user) {
        loadChatHistory(user.id);
        
        // Subscribe to realtime changes for this user's generations
        realtimeChannel = supabase
          .channel('mobile-generations-changes')
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'generations',
              filter: `user_id=eq.${user.id}`,
            },
            (payload) => {
              // Add new chat to the top of the list (if not already exists)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const newChat = payload.new as { id: string; query: string; response: any };
              const newTitle = newChat.query.slice(0, 50) + (newChat.query.length > 50 ? '...' : '');
              const isGenerating = !newChat.response || newChat.response?._status === 'generating';
              const titlePrefix = newTitle.slice(0, 30); // For fuzzy matching
              
              setChatHistory(prev => {
                // Check if already exists by ID
                if (prev.some(c => c.id === newChat.id)) {
                  return prev.map(c => c.id === newChat.id ? { ...c, isGenerating } : c);
                }
                
                // Check if there's a pending item with similar title - replace it
                const hasPendingDuplicate = prev.some(c => 
                  c.id.startsWith('pending-') && c.title.slice(0, 30) === titlePrefix
                );
                
                if (hasPendingDuplicate) {
                  // Replace the pending item with the real one
                  return prev.map(c => 
                    c.id.startsWith('pending-') && c.title.slice(0, 30) === titlePrefix
                      ? { id: newChat.id, title: newTitle, isGenerating }
                      : c
                  );
                }
                
                // Check if there's any item with exactly same title
                if (prev.some(c => c.title === newTitle)) {
                  return prev;
                }
                
                return [{ id: newChat.id, title: newTitle, isGenerating }, ...prev];
              });
            }
          )
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'generations',
              filter: `user_id=eq.${user.id}`,
            },
            (payload) => {
              // Update generating status when response is ready
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const updated = payload.new as { id: string; response: any };
              const isGenerating = !updated.response || updated.response?._status === 'generating';
              setChatHistory(prev => prev.map(c => 
                c.id === updated.id ? { ...c, isGenerating } : c
              ));
            }
          )
          .on(
            'postgres_changes',
            {
              event: 'DELETE',
              schema: 'public',
              table: 'generations',
              filter: `user_id=eq.${user.id}`,
            },
            (payload) => {
              // Remove deleted chat from the list
              const deletedId = payload.old.id;
              setChatHistory(prev => prev.filter(chat => chat.id !== deletedId));
            }
          )
          .subscribe();
      } else {
        setIsLoadingHistory(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadChatHistory(session.user.id);
      } else {
        setChatHistory([]);
        setIsLoadingHistory(false);
      }
    });

    return () => {
      subscription.unsubscribe();
      if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
      }
    };
  }, []);

  // Poll for generating items to check if they're complete (every 3 seconds)
  useEffect(() => {
    const generatingItems = chatHistory.filter(c => c.isGenerating);
    if (generatingItems.length === 0) return;

    const controller = new AbortController();

    const pollInterval = setInterval(async () => {
      try {
        const ids = generatingItems.map(c => c.id);
        if (ids.length === 0) return;
        if (controller.signal.aborted) return;

        const res = await fetch(
          `/api/generations?ids=${encodeURIComponent(ids.join(','))}`,
          { credentials: 'include', signal: controller.signal }
        );
        if (controller.signal.aborted) return;
        if (!res.ok) return;

        const json = await res.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = (json?.generations ?? []) as Array<{ id: string; response: any }>;

        const updates = data.filter(item =>
          item.response && item.response._status !== 'generating'
        );

        if (updates.length > 0 && !controller.signal.aborted) {
          setChatHistory(prev => prev.map(c => {
            const updated = updates.find(u => u.id === c.id);
            if (updated) {
              return { ...c, isGenerating: false };
            }
            return c;
          }));
        }
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        console.warn('MobileSidebar poll failed (will retry):', err);
      }
    }, 3000);

    return () => {
      controller.abort();
      clearInterval(pollInterval);
    };
  }, [chatHistory]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDropdown]);

  // Close sidebar when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isOpen && sidebarRef.current && !sidebarRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Check if chat history has overflow
  useEffect(() => {
    const checkOverflow = () => {
      if (historyRef.current) {
        setHasOverflow(historyRef.current.scrollHeight > historyRef.current.clientHeight);
      }
    };
    
    checkOverflow();
    window.addEventListener('resize', checkOverflow);
    return () => window.removeEventListener('resize', checkOverflow);
  }, [chatHistory, isOpen]);

  // Reset swiped state when menu closes
  useEffect(() => {
    if (!isOpen) {
      setSwipedChatId(null);
      // Reset all swipe transforms
      swipeRefs.current.forEach((el) => {
        el.style.transform = 'translateX(0)';
      });
    }
  }, [isOpen]);

  // Block body scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Refresh history when trigger changes
  useEffect(() => {
    if (refreshTrigger > 0 && user) {
      loadChatHistory(user.id, true); // isRefresh = true, don't show loading
    }
  }, [refreshTrigger]);

  const loadChatHistory = async (_userId: string, isRefresh: boolean = false) => {
    try {
      if (!isRefresh && chatHistory.length === 0) {
        setIsLoadingHistory(true);
      }

      // Серверный роут вместо браузерного Supabase: устраняет зависание
      // refresh-токена (особенно на Android Chrome / iOS PWA).
      const res = await fetch('/api/generations', { credentials: 'include' });

      if (!res.ok) {
        console.error('Error loading chat history:', res.status, res.statusText);
        setChatHistory([]);
        return;
      }

      const json = await res.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (json?.generations ?? []) as Array<{ id: string; query: string; response: any }>;

      const historyItems = data.map((item) => ({
        id: item.id,
        title: item.query.slice(0, 50) + (item.query.length > 50 ? '...' : ''),
        isGenerating: !item.response || item.response?._status === 'generating',
      }));
      setChatHistory(historyItems);

      const completedIds = historyItems.filter(c => !c.isGenerating).map(c => c.id);
      if (completedIds.length > 0) {
        setReadChats(prev => {
          const updated = new Set(prev);
          completedIds.forEach((id: string) => updated.add(id));
          safeSet('readChats', JSON.stringify([...updated]));
          return updated;
        });
      }
    } catch (error) {
      console.error('Error in loadChatHistory:', error);
      setChatHistory([]);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
    onClose();
  };

  const handleClearHistory = async () => {
    if (!user) return;

    if (!confirm('Вы уверены, что хотите удалить всю историю?')) return;

    setShowDropdown(false);

    try {
      const res = await fetch('/api/generations', {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!res.ok) {
        console.error('Error clearing history:', res.status, res.statusText);
        toast.error('Ошибка при удалении истории');
        return;
      }

      setChatHistory([]);
      if (onClearHistory) onClearHistory();
      router.push('/chat');
      onClose();
    } catch (err) {
      console.error('Error clearing history (network):', err);
      toast.error('Ошибка сети, попробуйте ещё раз');
    }
  };

  const handleDeleteChat = async (e: React.MouseEvent, chatId: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (!user) return;

    try {
      const res = await fetch(`/api/generations/${encodeURIComponent(chatId)}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!res.ok) {
        console.error('Error deleting chat:', res.status, res.statusText);
        return;
      }

      setChatHistory(prev => prev.filter(chat => chat.id !== chatId));
      if (currentChatId === chatId) {
        router.push('/chat');
      }
      onClose();
    } catch (err) {
      console.error('Error deleting chat (network):', err);
    }
  };

  const handleChatClick = () => {
    onClose();
  };

  // Use prop history if provided, otherwise use loaded history
  // Add pendingChat at the top if provided and not already in list (check by ID AND title)
  const baseHistory = propChatHistory && propChatHistory.length > 0 ? propChatHistory : chatHistory;
  const pendingAlreadyExists = pendingChat && baseHistory.some(c => 
    c.id === pendingChat.id || c.title === pendingChat.title
  );
  // pendingChat is always generating (that's why it's pending)
  const displayHistory = pendingChat && !pendingAlreadyExists
    ? [{ ...pendingChat, isGenerating: true }, ...baseHistory]
    : baseHistory;

  const userName = user?.user_metadata?.first_name 
    ? `${user.user_metadata.first_name} ${user.user_metadata.last_name?.charAt(0) || ''}.`
    : user?.email?.split('@')[0] || 'Пользователь';

  const userEmail = user?.email || '';

  // Get user initials for profile
  const getUserInitials = () => {
    if (user?.user_metadata?.first_name && user?.user_metadata?.last_name) {
      return `${user.user_metadata.first_name.charAt(0)}${user.user_metadata.last_name.charAt(0)}`.toUpperCase();
    }
    if (user?.email) {
      return user.email.charAt(0).toUpperCase();
    }
    return 'П';
  };

  // Don't render until mounted to avoid hydration mismatch
  if (!isMounted) {
    return null;
  }

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-[60] md:hidden" onClick={onClose} />
      )}

      {/* Bottom Sheet Menu */}
      <div
        ref={sidebarRef}
        className={`fixed bottom-0 left-0 right-0 bg-[#17181A] flex flex-col transition-transform duration-300 ease-in-out z-[70] md:hidden rounded-t-[32px] overflow-hidden ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ height: '95dvh' }}
      >
        {/* Drag indicator */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-9 h-1 bg-white/30 rounded-full" />
        </div>

        {/* Chat history - scrollable area */}
        <div ref={historyRef} className="flex flex-col gap-2 flex-1 overflow-y-auto px-4 pt-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {displayHistory.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <span className="text-sm text-gray-400">История запросов пуста</span>
            </div>
          ) : (
            displayHistory.map((chat) => {
              const isCurrentPage = currentChatId === chat.id;
              const isUnread = !isCurrentPage && !chat.isGenerating && !readChats.has(chat.id);
              const showSpinner = !isCurrentPage && chat.isGenerating;
              const isSwiped = swipedChatId === chat.id;
              const canDelete = !showSpinner && !isUnread;
              
              const handleTouchStart = (e: React.TouchEvent) => {
                if (!canDelete) return;
                touchStartX.current = e.touches[0].clientX;
              };
              
              const handleTouchMove = (e: React.TouchEvent) => {
                if (!canDelete) return;
                const diff = touchStartX.current - e.touches[0].clientX;
                const el = swipeRefs.current.get(chat.id);
                if (el) {
                  // Instant transform - no transition during drag
                  const translateX = Math.max(0, Math.min(48, diff));
                  el.style.transition = 'none';
                  el.style.transform = `translateX(-${translateX}px)`;
                }
              };
              
              const handleTouchEnd = (e: React.TouchEvent) => {
                if (!canDelete) return;
                const diff = touchStartX.current - e.changedTouches[0].clientX;
                const el = swipeRefs.current.get(chat.id);
                if (el) {
                  el.style.transition = 'transform 0.15s ease-out';
                  if (diff > 40) {
                    el.style.transform = 'translateX(-48px)';
                    setSwipedChatId(chat.id);
                  } else {
                    el.style.transform = 'translateX(0)';
                    setSwipedChatId(null);
                  }
                }
              };
              
              return (
                <div
                  key={chat.id}
                  className={`group relative h-10 min-h-10 shrink-0 rounded-xl overflow-hidden transition-colors ${isCurrentPage ? 'bg-white/10' : 'active:bg-white/10'}`}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                >
                  {/* Chat content - slides when swiped */}
                  <div 
                    ref={(el) => { if (el) swipeRefs.current.set(chat.id, el); }}
                    className="absolute inset-0 flex items-center"
                  >
                    <Link
                      href={`/chat/${chat.id}`}
                      onClick={handleChatClick}
                      className="flex items-center w-full h-full px-3"
                    >
                      <span 
                        className="text-sm font-medium text-white truncate"
                        title=""
                      >
                        {chat.title}
                      </span>
                    </Link>
                    
                    {/* Right side indicators */}
                    {showSpinner && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      </div>
                    )}
                    
                    {isUnread && !showSpinner && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="w-2 h-2 bg-blue-500 rounded-full" />
                      </div>
                    )}
                  </div>
                  
                  {/* Delete button - revealed on swipe */}
                  {canDelete && (
                    <button
                      onClick={(e) => {
                        handleDeleteChat(e, chat.id);
                        setSwipedChatId(null);
                      }}
                      className={`absolute right-0 top-0 h-full w-12 flex items-center justify-center bg-red-500 transition-opacity duration-200 ${isSwiped ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                    >
                      <TrashIcon className="w-4 h-4 text-white" />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Bottom section */}
        <div className="px-4 shrink-0" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
          {/* User profile */}
          <div className="relative" ref={dropdownRef}>
            <button 
              onClick={() => setShowDropdown(!showDropdown)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-white/10 rounded-xl hover:bg-white/20 transition-colors"
            >
              <div className="flex flex-col items-start min-w-0 flex-1">
                <span className="text-sm font-semibold text-white truncate w-full text-left">{userName}</span>
                <span className="text-xs font-medium text-gray-400 truncate w-full text-left">{userEmail}</span>
              </div>
              <ChevronDownIcon className={`w-[18px] h-[18px] text-white transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown menu */}
            {showDropdown && (
              <div className="absolute bottom-full mb-2 left-0 right-0 bg-white rounded-xl overflow-hidden shadow-lg border border-gray-200 z-50">
                <Link
                  href="/profile"
                  onClick={() => {
                    setShowDropdown(false);
                    onClose();
                  }}
                  className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm text-foreground hover:bg-gray-100 transition-colors"
                >
                  <UserIcon className="w-[18px] h-[18px]" />
                  <span>Профиль</span>
                </Link>
                <button
                  onClick={handleClearHistory}
                  className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm text-foreground hover:bg-gray-100 transition-colors"
                >
                  <TrashIcon className="w-[18px] h-[18px]" />
                  <span>Очистить историю</span>
                </button>
                <Link
                  href="/faq"
                  onClick={() => {
                    setShowDropdown(false);
                    onClose();
                  }}
                  className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm text-foreground hover:bg-gray-100 transition-colors"
                >
                  <HelpCircleIcon className="w-[18px] h-[18px]" />
                  <span>Вопросы и ответы</span>
                </Link>
                
                <div className="border-t border-gray-200 my-1"></div>
                <button
                  onClick={handleSignOut}
                  className="w-full px-4 py-3 text-left text-sm text-foreground hover:bg-gray-100 transition-colors"
                >
                  Выйти из аккаунта
                </button>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="h-px bg-white/10 my-4" />

          {/* Close button */}
          <button
            onClick={onClose}
            className="w-full h-12 flex items-center justify-center bg-white/10 text-white rounded-xl hover:bg-white/20 transition-colors"
          >
            <span className="text-sm font-medium">Закрыть</span>
          </button>
        </div>
      </div>
    </>
  );
}

