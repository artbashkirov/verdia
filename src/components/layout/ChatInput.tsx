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
  const [isMobile, setIsMobile] = useState(false);
  const [containerBottom, setContainerBottom] = useState<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ПРОСТОЕ РЕШЕНИЕ: инпут на 8px от видимой нижней границы браузера
  useEffect(() => {
    function updatePosition() {
      if (!containerRef.current) return;
      
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      
      if (mobile) {
        // ChatGPT/DeepSeek/Perplexity подход: инпут на 8px от видимой нижней границы браузера
        // Видимая нижняя граница = верхний край браузерной панели навигации
        // position: fixed позиционируется относительно window.innerHeight
        // Видимая нижняя граница находится на visualViewport.height от верха экрана
        // Но position: fixed использует window.innerHeight, поэтому:
        // bottom = window.innerHeight - visualViewport.height - offsetTop + 8px
        
        let bottomBarHeight = 0;
        
        if (window.visualViewport) {
          // Safari, Chrome: используем visualViewport API
          // visualViewport.height - видимая высота БЕЗ браузерных панелей
          // window.innerHeight - полная высота окна ВКЛЮЧАЯ браузерные панели
          // offsetTop - высота верхней панели (адресная строка)
          const viewportHeight = window.visualViewport.height;
          const windowHeight = window.innerHeight;
          const offsetTop = window.visualViewport.offsetTop || 0;
          
          // Общая высота браузерных панелей (верхняя + нижняя)
          const totalBrowserUI = windowHeight - viewportHeight;
          
          // Высота нижней панели = общая высота UI - верхняя панель (offsetTop)
          bottomBarHeight = Math.max(totalBrowserUI - offsetTop, 0);
          
          // Если расчет дает нереальное значение, используем более консервативный подход
          if (bottomBarHeight > 150) {
            // Возможно ошибка расчета, используем типичное значение
            bottomBarHeight = 55; // Типичная высота нижней панели
          }
        } else {
          // Яндекс браузер и другие: используем разницу innerHeight и clientHeight
          const innerHeight = window.innerHeight;
          const clientHeight = document.documentElement.clientHeight;
          const heightDiff = innerHeight - clientHeight;
          
          // Если разница разумная (до 100px), это высота браузерной панели
          if (heightDiff > 0 && heightDiff < 100) {
            bottomBarHeight = heightDiff;
          } else {
            // Fallback: типичная высота нижней панели для мобильных
            bottomBarHeight = 55;
          }
        }
        
        // Safe area для iPhone (вырез внизу)
        let safeAreaBottomValue = 0;
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
            safeAreaBottomValue = parseFloat(paddingBottom) || 0;
          }
          document.body.removeChild(testEl);
        } catch (e) {
          // Игнорируем ошибки
        }
        
        // Инпут на 8px от видимой нижней границы браузера (верхний край браузерной панели)
        // Структура: [низ окна] -> [браузерная панель высотой bottomBarHeight] -> [8px отступ] -> [инпут]
        const bottomOffset = 8; // 8px отступ от видимой нижней границы
        const finalBottom = bottomBarHeight + bottomOffset + safeAreaBottomValue;
        
        setContainerBottom(finalBottom);
        
        containerRef.current.style.position = 'fixed';
        containerRef.current.style.bottom = `${finalBottom}px`;
        containerRef.current.style.left = '0';
        containerRef.current.style.right = '0';
        containerRef.current.style.width = '100%';
        containerRef.current.style.display = 'block';
        // Убеждаемся, что контейнер закрывает всю область до самого низа экрана
        containerRef.current.style.top = 'auto';
        // Минимальная высота: высота контента инпута
        containerRef.current.style.minHeight = '72px'; // 56px инпут + 16px padding
        
        // Отладка в development
        if (process.env.NODE_ENV === 'development') {
          console.log('ChatInput positioning (ChatGPT-style):', {
            hasVisualViewport: !!window.visualViewport,
            visualViewportHeight: window.visualViewport?.height,
            windowInnerHeight: window.innerHeight,
            clientHeight: document.documentElement.clientHeight,
            offsetTop: window.visualViewport?.offsetTop,
            bottomBarHeight,
            safeAreaBottom: safeAreaBottomValue,
            finalBottom: `${finalBottom}px`
          });
        }
      } else {
        // Desktop: absolute позиционирование
        containerRef.current.style.position = 'absolute';
        containerRef.current.style.bottom = '0';
        containerRef.current.style.left = '0';
        containerRef.current.style.right = '0';
        containerRef.current.style.width = '100%';
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
    <>
      {/* Подложка на мобильных - закрывает всю область от низа контейнера до самого низа экрана */}
      {isMobile && containerBottom > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: '0',
            left: '0',
            right: '0',
            height: `${containerBottom + 72}px`,
            backgroundColor: 'var(--background)',
            zIndex: 38,
            pointerEvents: 'none'
          }}
        />
      )}
      <div 
        ref={containerRef}
        className="left-0 right-0 z-40 md:z-50 chat-input-container"
        style={{ 
          paddingTop: '0',
          paddingBottom: isMobile ? 'max(16px, env(safe-area-inset-bottom, 0px))' : '16px',
          backgroundColor: 'var(--background)'
        }}
      >
        <div 
          className="flex justify-center relative z-10" 
          style={{ 
            paddingLeft: '16px', 
            paddingRight: '16px',
            paddingBottom: isMobile ? 'max(16px, env(safe-area-inset-bottom, 0px))' : '0',
            backgroundColor: 'var(--background)',
            position: 'relative'
          }}
        >
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
    </>
  );
}
