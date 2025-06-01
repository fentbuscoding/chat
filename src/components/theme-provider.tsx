
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { usePathname } from 'next/navigation';

type Theme = 'theme-98' | 'theme-7';

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
  attribute?: string; // attribute is not directly used for class manipulation on <html> here, but kept for prop consistency
  enableSystem?: boolean; // enableSystem is not used, but kept for prop consistency
}

interface ThemeProviderContextState {
  currentTheme: Theme;
  selectedTheme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeProviderContext = createContext<ThemeProviderContextState | undefined>(undefined);

export function ThemeProvider({
  children,
  defaultTheme = 'theme-98',
  storageKey = 'vite-ui-theme',
  // attribute = 'class', // Not directly used for <html> class manipulation here as we target root explicitly
  // enableSystem = false, // Not implemented in this simplified version
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
          console.log(`Stylesheet ${id} loaded.`);
        }
      };

      loadStylesheet('theme-98-css', 'https://unpkg.com/98.css');
      loadStylesheet('theme-7-css', 'https://unpkg.com/7.css');

      // No cleanup needed here for these stylesheets, we want them to persist
    }
  }, []); // Empty dependency array: runs once on mount

  // Effect to apply theme class to <html> and manage localStorage
  useEffect(() => {
    const root = window.document.documentElement;
    
    // Remove previous theme classes
    root.classList.remove('theme-98', 'theme-7');
    
    // Add current theme class
    if (currentAppliedTheme) {
      root.classList.add(currentAppliedTheme);
      console.log(`Applied class ${currentAppliedTheme} to html root.`);
    }

    // Save user's actual selection to localStorage
    try {
      localStorage.setItem(storageKey, userSelectedTheme);
    } catch (e) {
      console.error("Error setting localStorage:", e);
    }
  }, [currentAppliedTheme, userSelectedTheme, storageKey]); // Re-run when these change

  const setThemeCallback = useCallback((newTheme: Theme) => {
    if (newTheme === 'theme-98' || newTheme === 'theme-7') {
      setUserSelectedTheme(newTheme);
    }
  }, []); // setUserSelectedTheme is stable, so empty array is fine.

  const value = useMemo(() => ({
    currentTheme: currentAppliedTheme, // The theme actually applied to the DOM
    selectedTheme: userSelectedTheme, // The theme user picked
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
