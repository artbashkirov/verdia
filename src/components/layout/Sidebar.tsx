'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { PlusIcon, TrashIcon, HelpCircleIcon, ChevronDownIcon } from '@/components/icons';
import { MessageCircleMore, PanelLeftClose, User as UserIcon } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

interface ChatHistory {
  id: string;
  title: string;
}

interface SidebarProps {
  chatHistory?: ChatHistory[];
  currentChatId?: string;
  onNewChat?: () => void;
  onClearHistory?: () => void;
  className?: string;
}

export function Sidebar({
  chatHistory: propChatHistory,
  currentChatId,
  onNewChat,
  onClearHistory,
  className = '',
}: SidebarProps) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatHistory[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);
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
  }, [chatHistory, isCollapsed]);

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
    }
  };

  const handleDeleteChat = async (e: React.MouseEvent, chatId: string) => {
    e.preventDefault(); // Prevent navigation
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
    }
  };

  // Use prop history if provided, otherwise use loaded history
  const displayHistory = propChatHistory && propChatHistory.length > 0 ? propChatHistory : chatHistory;

  const userName = user?.user_metadata?.first_name 
    ? `${user.user_metadata.first_name} ${user.user_metadata.last_name?.charAt(0) || ''}.`
    : user?.email?.split('@')[0] || 'Пользователь';

  const userPlan = 'FREE'; // TODO: Get from database

  // Get user initials for collapsed profile
  const getUserInitials = () => {
    if (user?.user_metadata?.first_name && user?.user_metadata?.last_name) {
      return `${user.user_metadata.first_name.charAt(0)}${user.user_metadata.last_name.charAt(0)}`.toUpperCase();
    }
    if (user?.email) {
      return user.email.charAt(0).toUpperCase();
    }
    return 'П';
  };

  // Handle click on empty space in collapsed sidebar to expand
  const handleSidebarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isCollapsed) {
      const target = e.target as HTMLElement;
      // Check if click is on a button, link, or other interactive element
      const isInteractiveElement = target.closest('button, a, input, select, textarea');
      // If click is not on an interactive element, expand the sidebar
      if (!isInteractiveElement) {
        setIsCollapsed(false);
      }
    }
  };

  return (
    <div 
      ref={sidebarRef}
      onClick={handleSidebarClick}
      className={`h-screen bg-[#17181A] flex flex-col shrink-0 transition-all duration-300 ease-in-out ${
        isCollapsed ? 'w-[52px]' : 'w-[282px]'
      } ${className}`}
    >
      {/* Top section */}
      <div 
        className={`flex flex-col flex-1 min-h-0 sidebar-content ${isCollapsed ? 'items-center pt-4' : 'pt-4'}`}
        style={{ paddingLeft: '16px', paddingRight: '16px', width: '100%', boxSizing: 'border-box' }}
      >
        {/* Logo and collapse button */}
        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`} style={{ marginLeft: '0', marginRight: '0' }}>
          {isCollapsed ? (
            <Link href="/chat" className="flex items-center justify-center w-6 h-6">
              <img
                src="/iconV.svg"
                alt="Verdia"
                width={24}
                height={24}
                style={{ width: '24px', height: '24px', display: 'block' }}
              />
            </Link>
          ) : (
            <>
              <Link href="/chat" className="flex items-center justify-center" style={{ lineHeight: 0 }}>
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
              <button
                onClick={() => setIsCollapsed(true)}
                className="text-white hover:text-white/80 transition-colors"
                title="Свернуть панель"
              >
                <PanelLeftClose className="w-5 h-5" strokeWidth="1.5" />
              </button>
            </>
          )}
        </div>

        {/* New request button */}
        {isCollapsed ? (
          <button
            onClick={onNewChat || (() => router.push('/chat'))}
            className="w-[28px] h-[28px] flex items-center justify-center bg-white text-black rounded-[8px] hover:bg-gray-100 transition-colors"
            title="Новый запрос"
            style={{ marginTop: '12px' }}
          >
            <PlusIcon className="w-5 h-5" />
          </button>
        ) : (
          <button
            onClick={onNewChat || (() => router.push('/chat'))}
            className="h-10 flex items-center justify-center gap-2 px-4 bg-white text-black rounded-xl hover:bg-gray-100 transition-colors"
            style={{ marginTop: '16px' }}
          >
            <PlusIcon className="w-4 h-4" />
            <span className="text-sm font-medium">Новый запрос</span>
          </button>
        )}

        {/* Chat history */}
        {!isCollapsed && (
          <div ref={historyRef} className="flex flex-col gap-2 flex-1 overflow-y-auto" style={{ marginTop: '12px', width: '100%' }}>
            {isLoadingHistory ? (
              <div className="p-3 text-sm text-gray-500">Загрузка...</div>
            ) : displayHistory.length === 0 ? (
              null
            ) : (
              displayHistory.map((chat) => (
                <div
                  key={chat.id}
                  className={`
                    group relative h-10 rounded-xl transition-colors
                    ${currentChatId === chat.id ? 'bg-[#3a3a3a] dark:bg-[#1E1E1F]' : 'hover:bg-[#3a3a3a] dark:hover:bg-[#1E1E1F]'}
                  `}
                >
                  <Link
                    href={`/chat/${chat.id}`}
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
        )}
      </div>

      {/* Bottom section */}
      <div 
        className={`sidebar-content shrink-0 ${isCollapsed ? 'flex items-center justify-center pb-4' : 'pb-4'}`}
        style={{ paddingLeft: '16px', paddingRight: '16px', width: '100%', boxSizing: 'border-box' }}
      >
        {/* Divider - only show when chat history overflows */}
        {!isCollapsed && hasOverflow && <div className="h-px bg-white/10 mt-0 mb-3" />}
        {/* User profile */}
        <div className="relative" ref={dropdownRef}>
          {isCollapsed ? (
            <button 
              onClick={() => setShowDropdown(!showDropdown)}
              className="w-[28px] h-[28px] flex items-center justify-center bg-white rounded-full hover:bg-gray-100 transition-colors"
              title={userName}
            >
              <span className="text-xs font-medium text-black">{getUserInitials()}</span>
            </button>
          ) : (
            <button 
              onClick={() => setShowDropdown(!showDropdown)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-[#3a3a3a] dark:bg-[#1E1E1F] rounded-xl hover:bg-[#4a4a4a] dark:hover:bg-[#2a2a2a] transition-colors"
            >
              <div className="flex flex-col items-start">
                <span className="text-sm font-semibold text-white">{userName}</span>
                <span className="text-xs font-medium text-gray-500">{userPlan}</span>
              </div>
              <ChevronDownIcon className={`w-[18px] h-[18px] text-white transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
            </button>
          )}

          {/* Dropdown menu */}
          {showDropdown && (
            <div className={`absolute ${isCollapsed ? 'bottom-full mb-2 left-0 right-auto w-[200px]' : 'bottom-full mb-2 left-0 right-0'} bg-[#5a5a5a] dark:bg-[#3a3a3a] rounded-xl overflow-hidden shadow-lg z-50`}>
              <Link
                href="/profile"
                onClick={() => setShowDropdown(false)}
                className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm text-white hover:bg-[#6a6a6a] dark:hover:bg-[#4a4a4a] transition-colors"
              >
                <UserIcon className="w-[18px] h-[18px]" />
                <span>Профиль истца</span>
              </Link>
              <button
                onClick={handleClearHistory}
                className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm text-white hover:bg-[#6a6a6a] dark:hover:bg-[#4a4a4a] transition-colors"
              >
                <TrashIcon className="w-[18px] h-[18px]" />
                <span>Очистить историю</span>
              </button>
              <Link
                href="/faq"
                onClick={() => setShowDropdown(false)}
                className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm text-white hover:bg-[#6a6a6a] dark:hover:bg-[#4a4a4a] transition-colors"
              >
                <HelpCircleIcon className="w-[18px] h-[18px]" />
                <span>Вопросы и ответы</span>
              </Link>
              
              <div className="border-t border-white/10 my-1"></div>
              <button
                onClick={handleSignOut}
                className="w-full px-4 py-3 text-left text-sm text-white hover:bg-[#6a6a6a] dark:hover:bg-[#4a4a4a] transition-colors"
              >
                Выйти из аккаунта
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
