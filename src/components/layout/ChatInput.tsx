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

  // Расчет высоты браузерной панели для позиционирования на 8px от видимой нижней границы
  useEffect(() => {
    function calculateBottomBarHeight(): number {
      if (window.visualViewport) {
        // Safari, Chrome - используем visualViewport
        const viewportHeight = window.visualViewport.height;
        const windowHeight = window.innerHeight;
        const offsetTop = window.visualViewport.offsetTop || 0;
        const totalBrowserUI = windowHeight - viewportHeight;
        return Math.max(totalBrowserUI - offsetTop, 0);
      }
      
      // Яндекс браузер и другие - используем разницу innerHeight и clientHeight
      const innerHeight = window.innerHeight;
      const clientHeight = document.documentElement.clientHeight;
      const heightDiff = innerHeight - clientHeight;
      
      if (heightDiff > 0 && heightDiff < 100) {
        return heightDiff;
      }
      
      // Fallback
      return 0;
    }

    function updatePosition() {
      if (!containerRef.current) return;
      
      const isMobile = window.innerWidth < 768;
      
      if (isMobile) {
        const bottomBarHeight = calculateBottomBarHeight();
        
        // Получаем safe-area-inset-bottom
        let safeAreaBottom = 0;
        try {
          const testEl = document.createElement('div');
          testEl.style.position = 'fixed';
          testEl.style.bottom = '0';
          testEl.style.paddingBottom = 'env(safe-area-inset-bottom)';
          testEl.style.visibility = 'hidden';
          testEl.style.pointerEvents = 'none';
          document.body.appendChild(testEl);
          const computed = window.getComputedStyle(testEl);
          const paddingBottom = computed.paddingBottom;
          if (paddingBottom && paddingBottom !== '0px' && paddingBottom !== 'auto') {
            safeAreaBottom = parseFloat(paddingBottom) || 0;
          }
          document.body.removeChild(testEl);
        } catch (e) {
          // Игнорируем ошибки
        }
        
        // Инпут на 8px от видимой нижней границы = bottomBarHeight + 8px + safeAreaBottom
        const finalBottom = bottomBarHeight + 8 + safeAreaBottom;
        
        containerRef.current.style.position = 'fixed';
        containerRef.current.style.bottom = `${finalBottom}px`;
        containerRef.current.style.left = '0';
        containerRef.current.style.right = '0';
        containerRef.current.style.width = '100%';
      } else {
        // Desktop
        containerRef.current.style.position = 'absolute';
        containerRef.current.style.bottom = '0';
      }
    }

    updatePosition();

    window.addEventListener('resize', updatePosition);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updatePosition);
    }
    window.addEventListener('orientationchange', () => {
      setTimeout(updatePosition, 200);
    });

    return () => {
      window.removeEventListener('resize', updatePosition);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updatePosition);
      }
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
