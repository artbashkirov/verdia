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

  // Определение высоты браузерной панели для всех браузеров
  useEffect(() => {
    function getBrowserBarHeight(): number {
      // Метод 1: visualViewport API (Safari, Chrome)
      if (window.visualViewport) {
        const viewportHeight = window.visualViewport.height;
        const windowHeight = window.innerHeight;
        const offsetTop = window.visualViewport.offsetTop || 0;
        
        const totalBrowserUI = windowHeight - viewportHeight;
        const bottomBarHeight = Math.max(totalBrowserUI - offsetTop, 0);
        return bottomBarHeight;
      }
      
      // Метод 2: Разница между innerHeight и clientHeight (для Яндекс.Браузера и других)
      // innerHeight - это высота окна браузера (включая панели)
      // clientHeight - это высота видимой области документа (без панелей)
      const innerHeight = window.innerHeight;
      const clientHeight = document.documentElement.clientHeight;
      
      // Разница даёт нам высоту браузерных панелей
      // Но нужно учесть, что может быть панель сверху и снизу
      const browserUIHeight = innerHeight - clientHeight;
      
      // Для мобильных обычно есть только нижняя панель
      // Если разница небольшая (до 100px), считаем что это только нижняя панель
      if (browserUIHeight > 0 && browserUIHeight < 100) {
        return browserUIHeight;
      }
      
      // Метод 3: Измерение через временный элемент
      // Создаём элемент внизу экрана и измеряем его позицию
      const testEl = document.createElement('div');
      testEl.style.position = 'fixed';
      testEl.style.bottom = '0';
      testEl.style.height = '1px';
      testEl.style.width = '1px';
      testEl.style.visibility = 'hidden';
      testEl.style.pointerEvents = 'none';
      document.body.appendChild(testEl);
      
      const rect = testEl.getBoundingClientRect();
      const screenBottom = window.innerHeight;
      const elementBottom = rect.bottom;
      const bottomBarHeight = Math.max(screenBottom - elementBottom, 0);
      
      document.body.removeChild(testEl);
      
      // Используем результат измерения, если он разумен
      if (bottomBarHeight > 0 && bottomBarHeight < 150) {
        return bottomBarHeight;
      }
      
      // Fallback: если ничего не сработало, используем типичное значение
      return 52; // Типичная высота браузерной панели на мобильных
    }

    function updatePosition() {
      if (!containerRef.current) return;
      
      const isMobile = window.innerWidth < 768;
      
      if (isMobile) {
        // Определяем реальную высоту видимой области
        let viewportHeight: number;
        let browserBottomBarHeight: number = 0;
        
        if (window.visualViewport) {
          // Используем visualViewport - это реальная видимая область без браузерных панелей
          viewportHeight = window.visualViewport.height;
          const windowHeight = window.innerHeight;
          const offsetTop = window.visualViewport.offsetTop || 0;
          const totalBrowserUI = windowHeight - viewportHeight;
          browserBottomBarHeight = Math.max(totalBrowserUI - offsetTop, 0);
        } else {
          // Fallback для браузеров без visualViewport (Яндекс браузер)
          viewportHeight = window.innerHeight;
          browserBottomBarHeight = getBrowserBarHeight();
        }
        
        // Учитываем safe-area-inset-bottom для устройств с вырезом
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
        
        // Позиционируем инпут на 8px от низа видимой области
        // Если есть браузерная панель снизу, она уже учтена в visualViewport
        // Но для Яндекс браузера нужно добавить высоту панели
        const bottomOffset = 8; // 8px отступ от низа
        let finalBottom: number;
        
        if (window.visualViewport) {
          // Для браузеров с visualViewport - просто 8px + safe-area
          finalBottom = bottomOffset + safeAreaBottom;
        } else {
          // Для Яндекс браузера - добавляем высоту браузерной панели
          finalBottom = browserBottomBarHeight + bottomOffset + safeAreaBottom;
        }
        
        containerRef.current.style.bottom = `${finalBottom}px`;
        containerRef.current.style.top = 'auto';
      } else {
        containerRef.current.style.bottom = '0';
        containerRef.current.style.top = 'auto';
      }
    }

    updatePosition();

    // Обновляем при изменениях
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
      className="fixed md:absolute left-0 right-0 z-50"
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
