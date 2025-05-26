
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

// Updated state for the provider
interface ThemeProviderContextState {
  currentTheme: Theme; // The theme actually applied to the DOM
  selectedTheme: Theme; // The theme user picked, stored in state/localStorage
  setTheme: (theme: Theme) => void;
}

const ThemeProviderContext = createContext<ThemeProviderContextState | undefined>(undefined);

export function ThemeProvider({
  children,
  defaultTheme = 'theme-98',
  storageKey = 'vite-ui-theme',
  attribute = 'class',
  enableSystem = false,
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
          console.error("Error reading localStorage:", e);
        }
    }
    return defaultTheme;
  });

  // Determine the theme to actually apply to the DOM
  // Home page always gets 'theme-98'
  const currentAppliedTheme = pathname === '/' ? 'theme-98' : userSelectedTheme;

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const preloadLink98 = document.createElement('link');
      preloadLink98.rel = 'preload';
      preloadLink98.as = 'style';
      preloadLink98.href = 'https://unpkg.com/98.css';
      document.head.appendChild(preloadLink98);

      const preloadLink7 = document.createElement('link');
      preloadLink7.rel = 'preload';
      preloadLink7.as = 'style';
      preloadLink7.href = 'https://unpkg.com/7.css';
      document.head.appendChild(preloadLink7);

      return () => {
        preloadLink98.remove();
        preloadLink7.remove();
      };
    }
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('theme-98', 'theme-7');

    if (currentAppliedTheme) {
        root.classList.add(currentAppliedTheme);
    }

    try {
        localStorage.setItem(storageKey, userSelectedTheme); // Save user's actual selection
      } catch (e) {
        console.error("Error setting localStorage:", e);
      }

    const loadThemeCss = (themeToLoad: Theme) => {
      const existingLink = document.getElementById(`theme-${themeToLoad}-css`);
      if (existingLink) return;

      const link = document.createElement('link');
      link.id = `theme-${themeToLoad}-css`;
      link.rel = 'stylesheet';
      link.href = themeToLoad === 'theme-98'
        ? 'https://unpkg.com/98.css'
        : 'https://unpkg.com/7.css';
      document.head.appendChild(link);
    };

    const unloadThemeCss = (themeToUnload: Theme) => {
      const link = document.getElementById(`theme-${themeToUnload}-css`);
      if (link) {
        link.remove();
      }
    };

    loadThemeCss(currentAppliedTheme);
    unloadThemeCss(currentAppliedTheme === 'theme-98' ? 'theme-7' : 'theme-98');

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
