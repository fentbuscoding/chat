
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
  currentTheme: Theme; // The theme currently applied to the DOM
  selectedTheme: Theme; // The theme the user has explicitly selected
  setTheme: (theme: Theme) => void;
}

const ThemeProviderContext = createContext<ThemeProviderContextState | undefined>(undefined);

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

  // If on the homepage, and the user's selected theme isn't 'theme-98', update their selection.
  useEffect(() => {
    if (pathname === '/' && userSelectedTheme !== 'theme-98') {
      setUserSelectedTheme('theme-98');
    }
  }, [pathname, userSelectedTheme]); // Removed setUserSelectedTheme from deps as it's stable

  // Determine the theme to actually apply to the DOM
  // Home page always gets 'theme-98' due to the effect above and this line for current rendering
  const currentAppliedTheme = pathname === '/' ? 'theme-98' : userSelectedTheme;

  // Effect to load stylesheets ONCE and keep them
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const loadStylesheet = (id: string, href: string) => {
        if (!document.getElementById(id)) {
          const link = document.createElement('link');
          link.id = id;
          link.rel = 'stylesheet';
          link.href = href;
          document.head.appendChild(link);
          // console.log(`ThemeProvider: Stylesheet ${id} loaded.`);
        }
      };

      loadStylesheet('theme-98-css', 'https://unpkg.com/98.css');
      loadStylesheet('theme-7-css', 'https://unpkg.com/7.css');
    }
  }, []); // Empty dependency array: runs once on mount

  // Effect to apply theme class to <html> and manage localStorage for user's selection
  useEffect(() => {
    const root = window.document.documentElement;
    
    // Add a transition class to smooth theme changes
    root.classList.add('theme-transitioning');
    
    // Remove previous theme classes
    root.classList.remove('theme-98', 'theme-7');
    
    // Add current theme class
    if (currentAppliedTheme) {
      root.classList.add(currentAppliedTheme);
      // console.log(`ThemeProvider: Applied class ${currentAppliedTheme} to html root (pathname: ${pathname}, userSelected: ${userSelectedTheme}).`);
    }

    // Save user's actual selection to localStorage
    try {
      localStorage.setItem(storageKey, userSelectedTheme);
    } catch (e) {
      console.error("ThemeProvider: Error setting localStorage:", e);
    }

    // Remove the transition class after a short delay
    const timer = setTimeout(() => {
      root.classList.remove('theme-transitioning');
    }, 150); // Duration of the transition helper class

    return () => clearTimeout(timer);
  }, [currentAppliedTheme, userSelectedTheme, storageKey, pathname]);

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
