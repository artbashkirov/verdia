'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { PlusIcon, TrashIcon, HelpCircleIcon, ChevronDownIcon, NewMessageIcon, SunIcon, MonitorIcon } from '@/components/icons';
import { MessageCircleMore, PanelLeftClose, Moon } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useTheme } from '@/lib/theme-context';
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
  const { theme, setTheme } = useTheme();
  const [user, setUser] = useState<User | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatHistory[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

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

  const loadChatHistory = async (userId: string) => {
    setIsLoadingHistory(true);
    const supabase = createClient();
    
    const { data, error } = await supabase
      .from('generations')
      .select('id, query, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Error loading chat history:', error);
      setChatHistory([]);
    } else {
      setChatHistory(
        (data || []).map(item => ({
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
      className={`h-screen bg-[#17181A] flex flex-col justify-between shrink-0 transition-all duration-300 ease-in-out ${
        isCollapsed ? 'w-[52px]' : 'w-[282px]'
      } ${className}`}
    >
      {/* Top section */}
      <div 
        className={`flex flex-col sidebar-content ${isCollapsed ? 'items-center pt-4' : 'pt-4'}`}
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
          <div className="flex flex-col gap-2" style={{ marginTop: '12px', width: '100%' }}>
            {isLoadingHistory ? (
              <div className="p-3 text-sm text-gray-500">Загрузка...</div>
            ) : displayHistory.length === 0 ? (
              <div className="p-3 text-sm text-gray-500">История пуста</div>
            ) : (
              displayHistory.map((chat) => (
                <div
                  key={chat.id}
                  className={`
                    group relative flex items-center gap-2 h-10 px-3 rounded-xl transition-colors
                    ${currentChatId === chat.id ? 'bg-[#3a3a3a] dark:bg-[#1E1E1F]' : 'hover:bg-[#3a3a3a] dark:hover:bg-[#1E1E1F]'}
                  `}
                >
                  <Link
                    href={`/chat/${chat.id}`}
                    className="flex items-center gap-2 flex-1 min-w-0"
                  >
                    <MessageCircleMore className="w-4 h-4 text-white shrink-0" strokeWidth="1.5" />
                    <span className="text-sm font-medium text-white truncate">
                      {chat.title}
                    </span>
                  </Link>
                  <button
                    onClick={(e) => handleDeleteChat(e, chat.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-white/10 transition-all shrink-0"
                    title="Удалить"
                  >
                    <TrashIcon className="w-4 h-4 text-gray-400 hover:text-red-400" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Bottom section */}
      <div 
        className={`sidebar-content ${isCollapsed ? 'flex items-center justify-center pb-4 pt-3' : 'pb-4 pt-3'}`}
        style={{ paddingLeft: '16px', paddingRight: '16px', width: '100%', boxSizing: 'border-box' }}
      >
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
            <div className={`absolute ${isCollapsed ? 'bottom-full mb-2 left-0 right-auto w-[200px]' : 'bottom-full mb-2 left-0 right-0'} bg-[#3a3a3a] dark:bg-[#1E1E1F] rounded-xl overflow-hidden shadow-lg z-50`}>
              <button
                onClick={handleClearHistory}
                className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm text-white hover:bg-[#4a4a4a] dark:hover:bg-[#2a2a2a] transition-colors"
              >
                <TrashIcon className="w-[18px] h-[18px]" />
                <span>Очистить историю</span>
              </button>
              <Link
                href="/faq"
                onClick={() => setShowDropdown(false)}
                className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm text-white hover:bg-[#4a4a4a] dark:hover:bg-[#2a2a2a] transition-colors"
              >
                <HelpCircleIcon className="w-[18px] h-[18px]" />
                <span>Вопросы и ответы</span>
              </Link>
              
              {/* Theme selector */}
              <div className="border-t border-white/10 my-1"></div>
              <div className="px-4 py-2">
                <div className="text-xs font-medium text-gray-400 mb-2">Тема интерфейса</div>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => {
                      setTheme('light');
                      setShowDropdown(false);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                      theme === 'light' 
                        ? 'bg-[#4a4a4a] dark:bg-[#2a2a2a] text-white' 
                        : 'text-gray-300 hover:bg-[#4a4a4a] dark:hover:bg-[#2a2a2a]'
                    }`}
                  >
                    <SunIcon className="w-[18px] h-[18px]" />
                    <span>Дневная</span>
                  </button>
                  <button
                    onClick={() => {
                      setTheme('dark');
                      setShowDropdown(false);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                      theme === 'dark' 
                        ? 'bg-[#4a4a4a] dark:bg-[#2a2a2a] text-white' 
                        : 'text-gray-300 hover:bg-[#4a4a4a] dark:hover:bg-[#2a2a2a]'
                    }`}
                  >
                    <Moon className="w-[18px] h-[18px]" />
                    <span>Ночная</span>
                  </button>
                  <button
                    onClick={() => {
                      setTheme('system');
                      setShowDropdown(false);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                      theme === 'system' 
                        ? 'bg-[#4a4a4a] dark:bg-[#2a2a2a] text-white' 
                        : 'text-gray-300 hover:bg-[#4a4a4a] dark:hover:bg-[#2a2a2a]'
                    }`}
                  >
                    <MonitorIcon className="w-[18px] h-[18px]" />
                    <span>Системная</span>
                  </button>
                </div>
              </div>
              
              <div className="border-t border-white/10 my-1"></div>
              <button
                onClick={handleSignOut}
                className="w-full px-4 py-3 text-left text-sm text-white hover:bg-[#4a4a4a] dark:hover:bg-[#2a2a2a] transition-colors"
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
