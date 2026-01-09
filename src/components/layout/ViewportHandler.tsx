'use client';

import { useEffect } from 'react';

/**
 * Компонент для определения реальной высоты viewport на мобильных устройствах.
 * Устанавливает CSS переменные для корректного позиционирования элементов.
 */
export function ViewportHandler() {
  useEffect(() => {
    function setVH() {
      // Используем visualViewport если доступен (более точный на мобильных)
      const vh = window.visualViewport 
        ? window.visualViewport.height * 0.01 
        : window.innerHeight * 0.01;
      
      document.documentElement.style.setProperty('--vh', `${vh}px`);
      
      // Также устанавливаем полную высоту для удобства
      const fullHeight = window.visualViewport 
        ? window.visualViewport.height 
        : window.innerHeight;
      document.documentElement.style.setProperty('--viewport-height', `${fullHeight}px`);
      
      // Вычисляем высоту браузерной панели (адресная строка + навигация)
      if (window.visualViewport) {
        const viewportHeight = window.visualViewport.height;
        const windowHeight = window.innerHeight;
        const offsetTop = window.visualViewport.offsetTop || 0;
        const offsetLeft = window.visualViewport.offsetLeft || 0;
        
        // Разница между window.innerHeight и visualViewport.height даёт высоту браузерных панелей
        const totalBrowserUI = windowHeight - viewportHeight;
        
        // Высота нижней панели (навигация браузера)
        // offsetTop - это высота верхней панели (адресная строка)
        // totalBrowserUI - это общая высота всех браузерных панелей
        // Нижняя панель = общая высота - верхняя панель
        const bottomBarHeight = Math.max(totalBrowserUI - offsetTop, 0);
        
        // Устанавливаем CSS переменную для высоты нижней браузерной панели
        document.documentElement.style.setProperty('--browser-bottom-bar-height', `${bottomBarHeight}px`);
        
        // Также устанавливаем общую высоту браузерных панелей
        document.documentElement.style.setProperty('--browser-ui-height', `${totalBrowserUI}px`);
        
        // Высота верхней панели (адресная строка)
        document.documentElement.style.setProperty('--browser-top-bar-height', `${offsetTop}px`);
      } else {
        // Fallback для браузеров без visualViewport
        // Типичная высота браузерной панели на мобильных: 50-60px
        document.documentElement.style.setProperty('--browser-bottom-bar-height', '55px');
        document.documentElement.style.setProperty('--browser-ui-height', '55px');
        document.documentElement.style.setProperty('--browser-top-bar-height', '0px');
      }
      
      // Также получаем safe-area-inset-bottom
      // Пытаемся получить через getComputedStyle
      let safeAreaBottom = 0;
      try {
        // Создаём временный элемент для получения env() значения
        const testEl = document.createElement('div');
        testEl.style.position = 'fixed';
        testEl.style.bottom = '0';
        testEl.style.paddingBottom = 'env(safe-area-inset-bottom)';
        testEl.style.visibility = 'hidden';
        document.body.appendChild(testEl);
        const computed = window.getComputedStyle(testEl);
        const paddingBottom = computed.paddingBottom;
        if (paddingBottom && paddingBottom !== '0px' && paddingBottom !== 'auto') {
          safeAreaBottom = parseFloat(paddingBottom) || 0;
        }
        document.body.removeChild(testEl);
      } catch (e) {
        // Если не получилось, оставляем 0
        safeAreaBottom = 0;
      }
      
      document.documentElement.style.setProperty('--safe-area-bottom', `${safeAreaBottom}px`);
    }

    // Устанавливаем сразу
    setVH();

    // Обновляем при изменении размера окна
    window.addEventListener('resize', setVH);
    
    // Слушаем visualViewport для более точного отслеживания на мобильных
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', setVH);
      window.visualViewport.addEventListener('scroll', setVH);
    }

    // Также обновляем при изменении ориентации
    window.addEventListener('orientationchange', () => {
      // Небольшая задержка для корректного определения после поворота
      setTimeout(setVH, 200);
    });

    // Обновляем при скролле (когда адресная строка скрывается/появляется)
    let scrollTimeout: NodeJS.Timeout;
    const handleScroll = () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(setVH, 100);
    };
    
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('resize', setVH);
      window.removeEventListener('scroll', handleScroll);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', setVH);
        window.visualViewport.removeEventListener('scroll', setVH);
      }
    };
  }, []);

  return null;
}
