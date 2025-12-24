'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Menu, X } from 'lucide-react';
import { PlusIcon } from '@/components/icons';
import { useRouter } from 'next/navigation';

interface MobileHeaderProps {
  onMenuClick: () => void;
  isMenuOpen: boolean;
  onNewChat?: () => void;
}

export function MobileHeader({ onMenuClick, isMenuOpen, onNewChat }: MobileHeaderProps) {
  const router = useRouter();

  const handleNewChat = () => {
    if (onNewChat) {
      onNewChat();
    } else {
      router.push('/chat');
    }
  };

  return (
    <header className="md:hidden fixed top-0 left-0 right-0 z-50 bg-[#0E0E0E] h-[56px] flex items-center justify-between px-4">
      {/* Menu button */}
      <button
        onClick={onMenuClick}
        className="text-white hover:text-white/80 transition-colors"
        aria-label="Открыть меню"
      >
        {isMenuOpen ? (
          <X className="w-6 h-6" strokeWidth="1.5" />
        ) : (
          <Menu className="w-6 h-6" strokeWidth="1.5" />
        )}
      </button>

      {/* Logo */}
      <Link href="/chat" className="flex items-center">
        <Image
          src="/verdiaLogo.svg"
          alt="Verdia"
          width={100}
          height={20}
          priority
          className="object-contain"
          style={{ height: '20px', width: 'auto' }}
        />
      </Link>

      {/* New chat button */}
      <button
        onClick={handleNewChat}
        className="w-9 h-9 flex items-center justify-center bg-white text-black rounded-lg hover:bg-gray-100 transition-colors"
        aria-label="Новый чат"
      >
        <PlusIcon className="w-5 h-5" />
      </button>
    </header>
  );
}

