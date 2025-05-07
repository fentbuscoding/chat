'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';

type Theme = 'theme-98' | 'theme-7';

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
  attribute?: string; // Keep attribute prop for potential future use or compatibility
  enableSystem?: boolean; // Keep enableSystem prop
}

interface ThemeProviderState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const initialState: ThemeProviderState = {
  theme: 'theme-98', // Default theme
  setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({
  children,
  defaultTheme = 'theme-98',
  storageKey = 'vite-ui-theme', // Changed storage key slightly
  attribute = 'class', // Keep attribute for potential future use
  enableSystem = false, // Keep enableSystem
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => { // Renamed to avoid conflict with prop
    if (typeof window !== 'undefined') {
        try {
          const storedTheme = window.localStorage.getItem(storageKey) as Theme | null;
          if (storedTheme && (storedTheme === 'theme-98' || storedTheme === 'theme-7')) {
            return storedTheme;
          }
          // System preference logic removed as enableSystem is false
        } catch (e) {
          console.error("Error reading localStorage:", e);
        }
    }
    return defaultTheme;
  });

  // Preload theme CSS files on mount
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
        // Clean up preload links if the component unmounts
        preloadLink98.remove();
        preloadLink7.remove();
      };
    }
  }, []); // Empty dependency array means this effect runs only once on mount

  useEffect(() => {
    const root = window.document.documentElement; // Target the HTML element

    // Remove previous theme classes from HTML element
    root.classList.remove('theme-98', 'theme-7');

    // Add current theme class to HTML element
    if (theme) { // Ensure theme is not null/undefined
        root.classList.add(theme);
    }


    // Save theme to localStorage
     try {
        localStorage.setItem(storageKey, theme);
      } catch (e) {
        console.error("Error setting localStorage:", e);
      }

    // Dynamically load/unload CSS files from CDN
    const loadThemeCss = (themeToLoad: Theme) => {
      const existingLink = document.getElementById(`theme-${themeToLoad}-css`);
      if (existingLink) return; // Already loaded

      const link = document.createElement('link');
      link.id = `theme-${themeToLoad}-css`;
      link.rel = 'stylesheet';
      // Load from unpkg CDN
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

    // Initial load based on state
    loadThemeCss(theme);
    unloadThemeCss(theme === 'theme-98' ? 'theme-7' : 'theme-98');

  }, [theme, storageKey]);

  const setThemeCallback = useCallback((newTheme: Theme) => {
    if (newTheme === 'theme-98' || newTheme === 'theme-7') {
      setThemeState(newTheme);
    }
  }, []);


  const value = useMemo(() => ({
    theme,
    setTheme: setThemeCallback,
  }), [theme, setThemeCallback]);

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error('useTheme must be used within a ThemeProvider');

  return context;
};
