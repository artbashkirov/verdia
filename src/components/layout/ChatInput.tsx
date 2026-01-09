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

  // Обновляем позицию при изменении viewport (клавиатура, адресная строка)
  useEffect(() => {
    function updatePosition() {
      if (!containerRef.current) return;
      
      const isMobile = window.innerWidth < 768;
      
      if (isMobile) {
        // Используем CSS переменные, установленные ViewportHandler
        // Эти переменные динамически вычисляются на основе реального viewport
        const browserBarHeight = parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue('--browser-bottom-bar-height')
        ) || 0;
        
        const safeAreaBottom = parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue('--safe-area-bottom')
        ) || 0;
        
        // Если переменная не установлена, вычисляем динамически
        let totalBottom = browserBarHeight + safeAreaBottom;
        
        if (totalBottom === 0 && window.visualViewport) {
          // Fallback: вычисляем напрямую через visualViewport
          const viewportHeight = window.visualViewport.height;
          const windowHeight = window.innerHeight;
          const offsetTop = window.visualViewport.offsetTop || 0;
          const totalBrowserUI = windowHeight - viewportHeight;
          const bottomBarHeight = Math.max(totalBrowserUI - offsetTop, 0);
          
          totalBottom = bottomBarHeight + safeAreaBottom;
        }
        
        // Минимальный отступ для надёжности
        const minBottom = 50;
        totalBottom = Math.max(totalBottom, minBottom);
        
        containerRef.current.style.bottom = `${totalBottom}px`;
        containerRef.current.style.top = 'auto';
      } else {
        containerRef.current.style.bottom = '0';
        containerRef.current.style.top = 'auto';
      }
    }

    // Устанавливаем позицию сразу
    updatePosition();

    // Слушаем изменения viewport
    const handleResize = () => {
      requestAnimationFrame(updatePosition);
    };
    
    window.addEventListener('resize', handleResize);
    
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updatePosition);
      window.visualViewport.addEventListener('scroll', updatePosition);
    }

    window.addEventListener('orientationchange', () => {
      setTimeout(updatePosition, 200);
    });

    // Также слушаем изменения CSS переменных (когда ViewportHandler обновляет их)
    const observer = new MutationObserver(() => {
      updatePosition();
    });
    
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style']
    });

    return () => {
      window.removeEventListener('resize', handleResize);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updatePosition);
        window.visualViewport.removeEventListener('scroll', updatePosition);
      }
      observer.disconnect();
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
      className="fixed md:absolute left-0 right-0 z-50"
      style={{ 
        bottom: '0', // fallback, будет переопределено через JS на мобильных
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
