'use client';

import { useEffect } from 'react';

/**
 * Компонент для определения реальной высоты viewport на мобильных устройствах.
 * Устанавливает CSS переменную --vh, которая представляет 1% от реальной высоты viewport.
 * Это решает проблему с адресной строкой браузера на мобильных устройствах.
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
      setTimeout(setVH, 100);
    });

    return () => {
      window.removeEventListener('resize', setVH);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', setVH);
        window.visualViewport.removeEventListener('scroll', setVH);
      }
    };
  }, []);

  return null;
}
