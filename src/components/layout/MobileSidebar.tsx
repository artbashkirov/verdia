'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TrashIcon, HelpCircleIcon, ChevronDownIcon, UserIcon } from '@/components/icons';
import { createClient } from '@/lib/supabase/client';
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
  const touchCurrentX = useRef<number>(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  // Save chat history to localStorage whenever it changes
  useEffect(() => {
    if (chatHistory.length > 0) {
      localStorage.setItem('chatHistoryCache', JSON.stringify(chatHistory));
    }
  }, [chatHistory]);

  // Initialize from localStorage after mount
  useEffect(() => {
    setIsMounted(true);
    
    // Load cached chat history
    const cachedHistory = localStorage.getItem('chatHistoryCache');
    if (cachedHistory) {
      try {
        setChatHistory(JSON.parse(cachedHistory));
        setIsLoadingHistory(false);
      } catch (e) {
        console.error('Error loading cached history:', e);
      }
    }
    
    // Load read status
    const stored = localStorage.getItem('readChats');
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
        localStorage.setItem('readChats', JSON.stringify([...updated]));
        return updated;
      });
    }
  }, [currentChatId]);

  useEffect(() => {
    const supabase = createClient();
    let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
    
    // Get current user
    supabase.auth.getUser().then(({ data: { user } }) => {
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

    const pollInterval = setInterval(async () => {
      const supabase = createClient();
      const ids = generatingItems.map(c => c.id);
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.from('generations') as any)
        .select('id, response')
        .in('id', ids);
      
      if (data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updates = data.filter((item: any) => 
          item.response && item.response._status !== 'generating'
        );
        
        if (updates.length > 0) {
          setChatHistory(prev => prev.map(c => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const updated = updates.find((u: any) => u.id === c.id);
            if (updated) {
              return { ...c, isGenerating: false };
            }
            return c;
          }));
        }
      }
    }, 3000);

    return () => clearInterval(pollInterval);
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
    }
  }, [isOpen]);

  // Refresh history when trigger changes
  useEffect(() => {
    if (refreshTrigger > 0 && user) {
      loadChatHistory(user.id, true); // isRefresh = true, don't show loading
    }
  }, [refreshTrigger]);

  const loadChatHistory = async (userId: string, isRefresh: boolean = false) => {
    // Only show loading state if no cached data
    if (!isRefresh && chatHistory.length === 0) {
      setIsLoadingHistory(true);
    }
    const supabase = createClient();
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from('generations') as any)
      .select('id, query, response, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading chat history:', error);
      setChatHistory([]);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const historyItems = (data || []).map((item: { id: string; query: string; response: any }) => ({
        id: item.id,
        title: item.query.slice(0, 50) + (item.query.length > 50 ? '...' : ''),
        isGenerating: !item.response || item.response?._status === 'generating',
      }));
      setChatHistory(historyItems);
      
      // Mark all completed chats as "read" - only new background generations should show blue dot
      const completedIds = historyItems.filter((c: { isGenerating?: boolean }) => !c.isGenerating).map((c: { id: string }) => c.id);
      if (completedIds.length > 0) {
        setReadChats(prev => {
          const updated = new Set(prev);
          completedIds.forEach((id: string) => updated.add(id));
          localStorage.setItem('readChats', JSON.stringify([...updated]));
          return updated;
        });
      }
    }
    setIsLoadingHistory(false);
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
    
    const supabase = createClient();
    
    // Delete all generations for this user
    const { error } = await supabase
      .from('generations')
      .delete()
      .eq('user_id', user.id);

    if (error) {
      console.error('Error clearing history:', error);
      alert('Ошибка при удалении истории');
    } else {
      setChatHistory([]);
      if (onClearHistory) onClearHistory();
      router.push('/chat');
      onClose();
    }
  };

  const handleDeleteChat = async (e: React.MouseEvent, chatId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!user) return;
    
    const supabase = createClient();
    
    const { error } = await supabase
      .from('generations')
      .delete()
      .eq('id', chatId)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting chat:', error);
    } else {
      setChatHistory(prev => prev.filter(chat => chat.id !== chatId));
      // If deleting current chat, redirect to main chat page
      if (currentChatId === chatId) {
        router.push('/chat');
      }
      onClose();
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

  const userPlan = 'FREE'; // TODO: Get from database

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
        className={`fixed bottom-0 left-0 right-0 bg-[#17181A] flex flex-col transition-transform duration-300 ease-in-out z-[70] md:hidden rounded-t-[32px] ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ height: 'calc(var(--viewport-height, 90vh) * 0.9)' }}
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
                touchCurrentX.current = e.touches[0].clientX;
              };
              
              const handleTouchMove = (e: React.TouchEvent) => {
                if (!canDelete) return;
                touchCurrentX.current = e.touches[0].clientX;
              };
              
              const handleTouchEnd = () => {
                if (!canDelete) return;
                const diff = touchStartX.current - touchCurrentX.current;
                // Swipe left to show delete (threshold 50px)
                if (diff > 50) {
                  setSwipedChatId(chat.id);
                } 
                // Swipe right to hide delete
                else if (diff < -30) {
                  setSwipedChatId(null);
                }
              };
              
              return (
                <div
                  key={chat.id}
                  className={`group relative h-10 min-h-10 shrink-0 rounded-xl overflow-hidden ${isCurrentPage ? 'bg-white/10' : ''}`}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                >
                  {/* Chat content - slides when swiped */}
                  <div 
                    className={`absolute inset-0 flex items-center transition-transform duration-200 ${isSwiped ? '-translate-x-12' : 'translate-x-0'}`}
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

        {/* Bottom section - fixed at bottom */}
        <div className="px-4 shrink-0" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
          {/* User profile */}
          <div className="relative" ref={dropdownRef}>
            <button 
              onClick={() => setShowDropdown(!showDropdown)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-white/10 rounded-xl hover:bg-white/20 transition-colors"
            >
              <div className="flex flex-col items-start">
                <span className="text-sm font-semibold text-white">{userName}</span>
                <span className="text-xs font-medium text-gray-400">{userPlan}</span>
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

