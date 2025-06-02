
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { usePathname } from 'next/navigation';

type Theme = 'theme-98' | 'theme-7';

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
  attribute?: string; 
  enableSystem?: boolean; 
}

interface ThemeProviderContextState {
  currentTheme: Theme; 
  selectedTheme: Theme; 
  setTheme: (theme: Theme) => void;
}

const ThemeProviderContext = createContext<ThemeProviderContextState | undefined>(undefined);

const STYLESHEET_98_ID = 'theme-98-css';
const STYLESHEET_7_ID = 'theme-7-css';
const URL_98 = 'https://unpkg.com/98.css';
const URL_7 = 'https://unpkg.com/7.css';

export function ThemeProvider({
  children,
  defaultTheme = 'theme-98',
  storageKey = 'vite-ui-theme',
}: ThemeProviderProps) {
  const pathname = usePathname();

  const [userSelectedTheme, setUserSelectedTheme] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
        try {
          const storedTheme = window.localStorage.getItem(storageKey) as Theme | null;
          if (storedTheme && (storedTheme === 'theme-98' || storedTheme === 'theme-7')) {
            return storedTheme;
          }
        } catch (e) {
          console.error("ThemeProvider: Error reading localStorage:", e);
        }
    }
    return defaultTheme;
  });

  // REMOVED: useEffect that called setUserSelectedTheme('theme-98') when pathname === '/'
  // useEffect(() => {
  //   if (pathname === '/' && userSelectedTheme !== 'theme-98') {
  //     setUserSelectedTheme('theme-98');
  //   }
  // }, [pathname, userSelectedTheme]);

  const currentAppliedTheme = useMemo(() => {
    return pathname === '/' ? 'theme-98' : userSelectedTheme;
  }, [pathname, userSelectedTheme]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const root = window.document.documentElement;
    
    root.classList.add('theme-transitioning');
    
    root.classList.remove('theme-98', 'theme-7');
    
    root.classList.add(currentAppliedTheme);

    const theme98Link = document.getElementById(STYLESHEET_98_ID) as HTMLLinkElement | null;
    const theme7Link = document.getElementById(STYLESHEET_7_ID) as HTMLLinkElement | null;

    if (currentAppliedTheme === 'theme-98') {
        if (!theme98Link) {
            const link = document.createElement('link');
            link.id = STYLESHEET_98_ID;
            link.rel = 'stylesheet';
            link.href = URL_98;
            document.head.appendChild(link);
        }
        if (theme7Link) {
            theme7Link.remove();
        }
    } else if (currentAppliedTheme === 'theme-7') {
        if (!theme7Link) {
            const link = document.createElement('link');
            link.id = STYLESHEET_7_ID;
            link.rel = 'stylesheet';
            link.href = URL_7;
            document.head.appendChild(link);
        }
        if (theme98Link) {
            theme98Link.remove();
        }
    }
    
    try {
      localStorage.setItem(storageKey, userSelectedTheme);
    } catch (e) {
      console.error("ThemeProvider: Error setting localStorage:", e);
    }

    const timer = setTimeout(() => {
      root.classList.remove('theme-transitioning');
    }, 150); 

    return () => clearTimeout(timer);
  }, [currentAppliedTheme, userSelectedTheme, storageKey]);


  const setThemeCallback = useCallback((newTheme: Theme) => {
    if (newTheme === 'theme-98' || newTheme === 'theme-7') {
      setUserSelectedTheme(newTheme);
    }
  }, []);

  const value = useMemo(() => ({
    currentTheme: currentAppliedTheme,
    selectedTheme: userSelectedTheme,
    setTheme: setThemeCallback,
  }), [currentAppliedTheme, userSelectedTheme, setThemeCallback]);

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = (): ThemeProviderContextState => {
  const context = useContext(ThemeProviderContext);
  if (context === undefined)
    throw new Error('useTheme must be used within a ThemeProvider');
  return context;
};

export type { Theme };
