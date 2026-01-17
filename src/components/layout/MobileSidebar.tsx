'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { MessageCircleMore } from 'lucide-react';
import { PlusIcon, TrashIcon, HelpCircleIcon, ChevronDownIcon, UserIcon } from '@/components/icons';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

interface ChatHistory {
  id: string;
  title: string;
}

interface MobileSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  chatHistory?: ChatHistory[];
  currentChatId?: string;
  onNewChat?: () => void;
  onClearHistory?: () => void;
  refreshTrigger?: number;
}

export function MobileSidebar({
  isOpen,
  onClose,
  chatHistory: propChatHistory,
  currentChatId,
  onNewChat,
  onClearHistory,
  refreshTrigger = 0,
}: MobileSidebarProps) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatHistory[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [hasOverflow, setHasOverflow] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    
    // Get current user
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      if (user) {
        loadChatHistory(user.id);
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

    return () => subscription.unsubscribe();
  }, []);

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

  // Refresh history when trigger changes
  useEffect(() => {
    if (refreshTrigger > 0 && user) {
      loadChatHistory(user.id);
    }
  }, [refreshTrigger]);

  const loadChatHistory = async (userId: string) => {
    setIsLoadingHistory(true);
    const supabase = createClient();
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from('generations') as any)
      .select('id, query, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading chat history:', error);
      setChatHistory([]);
    } else {
      setChatHistory(
        (data || []).map((item: { id: string; query: string }) => ({
          id: item.id,
          title: item.query.slice(0, 50) + (item.query.length > 50 ? '...' : ''),
        }))
      );
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
  const displayHistory = propChatHistory && propChatHistory.length > 0 ? propChatHistory : chatHistory;

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

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 z-[60] md:hidden" onClick={onClose} />
      )}

      {/* Sidebar */}
      <div
        ref={sidebarRef}
        className={`fixed top-0 left-0 bg-[#17181A] flex flex-col shrink-0 transition-transform duration-300 ease-in-out z-[70] md:hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ 
          width: '60vw',
          height: '100dvh'
        }}
      >
        {/* Top section */}
        <div className="flex flex-col flex-1 min-h-0 pt-5 px-4">
          {/* Logo - full version */}
          <div className="flex items-center mb-5">
            <Link href="/chat" onClick={handleChatClick} className="flex items-center justify-center" style={{ lineHeight: 0 }}>
              <Image
                src="/verdiaLogo.svg"
                alt="Verdia"
                width={100}
                height={20}
                priority
                className="object-contain"
                style={{ height: '20px', width: 'auto', display: 'block' }}
              />
            </Link>
          </div>

          {/* New request button */}
          <button
            onClick={() => {
              if (onNewChat) {
                onNewChat();
              } else {
                router.push('/chat');
              }
              onClose();
            }}
            className="w-full h-10 flex items-center justify-center gap-2 bg-white text-black rounded-xl hover:bg-gray-100 transition-colors"
            style={{ marginTop: '0' }}
          >
            <PlusIcon className="w-4 h-4" />
            <span className="text-sm font-medium">Новый запрос</span>
          </button>

          {/* Chat history */}
          <div ref={historyRef} className="flex flex-col gap-2 flex-1 overflow-y-auto" style={{ marginTop: '12px' }}>
            {isLoadingHistory ? (
              <div className="p-3 text-sm text-gray-400">Загрузка...</div>
            ) : displayHistory.length === 0 ? (
              null
            ) : (
              displayHistory.map((chat) => (
                <div
                  key={chat.id}
                  className={`
                    group relative h-10 rounded-xl transition-colors
                    ${currentChatId === chat.id ? 'bg-white/10' : 'hover:bg-white/10'}
                  `}
                >
                  <Link
                    href={`/chat/${chat.id}`}
                    onClick={handleChatClick}
                    className="flex items-center gap-2 w-full h-full px-3 overflow-hidden"
                  >
                    <MessageCircleMore className="w-4 h-4 text-white shrink-0" strokeWidth="1.5" />
                    <span className="text-sm font-medium text-white truncate">
                      {chat.title}
                    </span>
                  </Link>
                  <div className="absolute right-0 top-0 h-full flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-12 h-full bg-gradient-to-r from-[#17181A]/0 to-[#17181A]" />
                    <div className="h-full flex items-center bg-[#17181A] pr-2">
                      <button
                        onClick={(e) => handleDeleteChat(e, chat.id)}
                        className="p-1 rounded-lg hover:bg-white/10"
                        title="Удалить"
                      >
                        <TrashIcon className="w-4 h-4 text-gray-400 hover:text-red-400" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Bottom section */}
        <div className="pb-5 px-4 shrink-0">
          {/* Divider - only show when chat history overflows */}
          {hasOverflow && <div className="h-px bg-white/10 mb-3" />}
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
                  <span>Профиль истца</span>
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
        </div>
      </div>
    </>
  );
}

