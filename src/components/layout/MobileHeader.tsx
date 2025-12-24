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
    <header 
      className="md:hidden fixed top-0 left-0 right-0 z-50 bg-[#0E0E0E] flex items-center justify-between"
      style={{ 
        height: '56px',
        paddingLeft: '16px',
        paddingRight: '16px'
      }}
    >
      {/* Menu button */}
      <button
        onClick={onMenuClick}
        className="flex items-center justify-center text-white hover:text-white/80 transition-colors"
        style={{ width: '36px', height: '36px' }}
        aria-label="Открыть меню"
      >
        {isMenuOpen ? (
          <X style={{ width: '20px', height: '20px' }} strokeWidth="1.5" />
        ) : (
          <Menu style={{ width: '20px', height: '20px' }} strokeWidth="1.5" />
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
        className="flex items-center justify-center bg-white text-black hover:bg-gray-100 transition-colors"
        style={{ 
          width: '36px', 
          height: '36px',
          borderRadius: '12px'
        }}
        aria-label="Новый чат"
      >
        <PlusIcon style={{ width: '20px', height: '20px' }} />
      </button>
    </header>
  );
}


