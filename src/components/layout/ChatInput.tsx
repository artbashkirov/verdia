'use client';

import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { SendHorizontal } from 'lucide-react';

interface ChatInputProps {
  onSubmit: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ onSubmit, disabled = false, placeholder = 'Начните писать запрос...' }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ПРОСТОЕ РЕШЕНИЕ: инпут на 8px от видимой нижней границы браузера
  useEffect(() => {
    function updatePosition() {
      if (!containerRef.current) return;
      
      const isMobile = window.innerWidth < 768;
      
      if (isMobile) {
        // Рассчитываем высоту нижней браузерной панели
        let bottomBarHeight = 0;
        
        if (window.visualViewport) {
          // Safari, Chrome - visualViewport API
          const viewportHeight = window.visualViewport.height;
          const windowHeight = window.innerHeight;
          const offsetTop = window.visualViewport.offsetTop || 0;
          bottomBarHeight = Math.max(windowHeight - viewportHeight - offsetTop, 0);
        } else {
          // Яндекс и другие - разница innerHeight и clientHeight
          const heightDiff = window.innerHeight - document.documentElement.clientHeight;
          if (heightDiff > 0 && heightDiff < 100) {
            bottomBarHeight = heightDiff;
          }
        }
        
        // Safe area для iPhone
        let safeArea = 0;
        try {
          const test = document.createElement('div');
          test.style.paddingBottom = 'env(safe-area-inset-bottom)';
          test.style.position = 'fixed';
          test.style.visibility = 'hidden';
          document.body.appendChild(test);
          const padding = window.getComputedStyle(test).paddingBottom;
          if (padding && padding !== '0px') safeArea = parseFloat(padding) || 0;
          document.body.removeChild(test);
        } catch {}
        
        // Инпут на 8px от видимой нижней границы
        containerRef.current.style.position = 'fixed';
        containerRef.current.style.bottom = `${bottomBarHeight + 8 + safeArea}px`;
        containerRef.current.style.left = '0';
        containerRef.current.style.right = '0';
        containerRef.current.style.width = '100%';
      } else {
        containerRef.current.style.position = 'absolute';
        containerRef.current.style.bottom = '0';
      }
    }

    updatePosition();
    window.addEventListener('resize', updatePosition);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', updatePosition);
    window.addEventListener('orientationchange', () => setTimeout(updatePosition, 200));

    return () => {
      window.removeEventListener('resize', updatePosition);
      if (window.visualViewport) window.visualViewport.removeEventListener('resize', updatePosition);
    };
  }, []);

  const handleSubmit = () => {
    if (message.trim() && !disabled) {
      onSubmit(message.trim());
      setMessage('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div 
      ref={containerRef}
      className="left-0 right-0 z-50 md:absolute md:bottom-0"
      style={{ 
        paddingTop: '16px',
        paddingBottom: '16px',
        backgroundColor: 'var(--background)'
      }}
    >
      <div className="flex justify-center relative z-10" style={{ paddingLeft: '16px', paddingRight: '16px' }}>
        <div 
          className="w-full md:w-[660px] flex items-center overflow-hidden"
          style={{ 
            height: '56px',
            borderRadius: '20px',
            paddingLeft: '20px',
            paddingRight: '20px',
            gap: '8px',
            backgroundColor: 'var(--input-bg)',
            border: '1px solid #CCCCCC',
            boxSizing: 'border-box'
          }}
        >
          <input
            ref={inputRef}
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder === 'Начните писать запрос...' ? 'Задайте вопрос' : placeholder}
            disabled={disabled}
            className="flex-1 bg-transparent outline-none text-base font-normal text-foreground placeholder:text-[#808080]"
          />
          
          {/* Send button */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!message.trim() || disabled}
            className={`flex items-center justify-center transition-colors disabled:cursor-not-allowed ${
              message.trim() ? 'text-foreground' : 'text-gray-400'
            }`}
            style={{ width: '28px', height: '28px' }}
            title="Отправить"
          >
            <SendHorizontal style={{ width: '20px', height: '20px' }} strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
}
