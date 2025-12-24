'use client';

import { useEffect } from 'react';

export function ScrollbarHandler() {
  useEffect(() => {
    let scrollTimeout: NodeJS.Timeout;

    const handleScroll = (event?: Event) => {
      const target = event?.target as HTMLElement || document.documentElement;
      
      // Add scrolling class to the scrolled element or its closest scrollable parent
      if (target === document.documentElement || target === document.body) {
        document.documentElement.classList.add('scrolling');
      } else {
        target.classList.add('scrolling');
      }

      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        if (target === document.documentElement || target === document.body) {
          document.documentElement.classList.remove('scrolling');
        } else {
          target.classList.remove('scrolling');
        }
      }, 500);
    };

    // Listen to window scroll
    window.addEventListener('scroll', handleScroll, { passive: true });
    
    // Use event delegation for all scroll events
    document.addEventListener('scroll', handleScroll, { passive: true, capture: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('scroll', handleScroll, { capture: true } as EventListenerOptions);
      clearTimeout(scrollTimeout);
    };
  }, []);

  return null;
}

