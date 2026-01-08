'use client';

import { createContext, useContext, useEffect, ReactNode } from 'react';

type Theme = 'light';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: 'light';
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Только светлая тема - темная тема временно отключена
  const theme: Theme = 'light';
  const resolvedTheme: 'light' = 'light';

  useEffect(() => {
    const root = document.documentElement;
    // Устанавливаем только светлую тему
    root.classList.remove('dark');
    root.classList.add('light');
  }, []);

  const setTheme = () => {
    // Временно отключено - всегда светлая тема
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

