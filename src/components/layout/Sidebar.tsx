'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogoFull, PlusIcon, MessageIcon, TrashIcon, HelpCircleIcon, ChevronDownIcon, NewMessageIcon, SunIcon, MoonIcon, MonitorIcon } from '@/components/icons';
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
}

export function Sidebar({
  chatHistory: propChatHistory,
  currentChatId,
  onNewChat,
  onClearHistory,
}: SidebarProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [user, setUser] = useState<User | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatHistory[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="w-[282px] h-screen bg-[#212121] flex flex-col justify-between border-r border-white/10 shrink-0">
      {/* Top section */}
      <div className="p-5 flex flex-col gap-3">
        {/* Logo and new message */}
        <div className="flex items-center justify-between">
          <Link href="/chat">
            <LogoFull variant="light" size="small" />
          </Link>
          <button
            onClick={onNewChat || (() => router.push('/chat'))}
            className="text-white hover:text-white/80 transition-colors"
          >
            <NewMessageIcon className="w-6 h-6" />
          </button>
        </div>

        {/* New request button */}
        <button
          onClick={onNewChat || (() => router.push('/chat'))}
          className="w-full h-10 flex items-center justify-center gap-2 px-4 bg-white text-black rounded-xl hover:bg-gray-100 transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          <span className="text-sm font-medium">Новый запрос</span>
        </button>

        {/* Chat history */}
        <div className="flex flex-col gap-1">
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
                  ${currentChatId === chat.id ? 'bg-[#3a3a3a]' : 'hover:bg-[#3a3a3a]'}
                `}
              >
                <Link
                  href={`/chat/${chat.id}`}
                  className="flex items-center gap-2 flex-1 min-w-0"
                >
                  <MessageIcon className="w-4 h-4 text-white shrink-0" strokeWidth="1.5" />
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
      </div>

      {/* Bottom section */}
      <div className="px-5 pb-5 pt-3 border-t border-white/10">
        {/* User profile */}
        <div className="relative" ref={dropdownRef}>
          <button 
            onClick={() => setShowDropdown(!showDropdown)}
            className="w-full flex items-center justify-between px-4 py-2.5 bg-[#3a3a3a] rounded-xl hover:bg-[#4a4a4a] transition-colors"
          >
            <div className="flex flex-col items-start">
              <span className="text-sm font-semibold text-white">{userName}</span>
              <span className="text-xs font-medium text-gray-500">{userPlan}</span>
            </div>
            <ChevronDownIcon className={`w-[18px] h-[18px] text-white transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown menu */}
          {showDropdown && (
            <div className="absolute bottom-full left-0 right-0 mb-2 bg-[#3a3a3a] rounded-xl overflow-hidden shadow-lg">
              <button
                onClick={handleClearHistory}
                className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm text-white hover:bg-[#4a4a4a] transition-colors"
              >
                <TrashIcon className="w-[18px] h-[18px]" />
                <span>Очистить историю</span>
              </button>
              <Link
                href="/faq"
                onClick={() => setShowDropdown(false)}
                className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm text-white hover:bg-[#4a4a4a] transition-colors"
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
                        ? 'bg-[#4a4a4a] text-white' 
                        : 'text-gray-300 hover:bg-[#4a4a4a]'
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
                        ? 'bg-[#4a4a4a] text-white' 
                        : 'text-gray-300 hover:bg-[#4a4a4a]'
                    }`}
                  >
                    <MoonIcon className="w-[18px] h-[18px]" />
                    <span>Ночная</span>
                  </button>
                  <button
                    onClick={() => {
                      setTheme('system');
                      setShowDropdown(false);
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                      theme === 'system' 
                        ? 'bg-[#4a4a4a] text-white' 
                        : 'text-gray-300 hover:bg-[#4a4a4a]'
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
                className="w-full px-4 py-3 text-left text-sm text-white hover:bg-[#4a4a4a] transition-colors"
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
