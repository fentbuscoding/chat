'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

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
  const [theme, setTheme] = useState<Theme>(() => {
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

  useEffect(() => {
    const root = window.document.documentElement;

    // Remove previous theme classes
    root.classList.remove('theme-98', 'theme-7');

    // Add current theme class
    root.classList.add(theme);

    // Save theme to localStorage
     try {
        localStorage.setItem(storageKey, theme);
      } catch (e) {
        console.error("Error setting localStorage:", e);
      }

    // Dynamically load/unload CSS files
    const loadThemeCss = (themeToLoad: Theme) => {
      const existingLink = document.getElementById(`theme-${themeToLoad}-css`);
      if (existingLink) return; // Already loaded

      const link = document.createElement('link');
      link.id = `theme-${themeToLoad}-css`;
      link.rel = 'stylesheet';
      link.href = themeToLoad === 'theme-98' ? '/98.css' : '/7.css'; // Adjusted paths
      document.head.appendChild(link);
    };

    const unloadThemeCss = (themeToUnload: Theme) => {
      const link = document.getElementById(`theme-${themeToUnload}-css`);
      if (link) {
        link.remove();
      }
    };

    if (theme === 'theme-98') {
      loadThemeCss('theme-98');
      unloadThemeCss('theme-7');
    } else if (theme === 'theme-7') {
      loadThemeCss('theme-7');
      unloadThemeCss('theme-98');
    }
     // Initial load based on state
     loadThemeCss(theme);
     unloadThemeCss(theme === 'theme-98' ? 'theme-7' : 'theme-98');


  }, [theme, storageKey]);

  const value = {
    theme,
    setTheme: (newTheme: Theme) => {
      if (newTheme === 'theme-98' || newTheme === 'theme-7') {
        setTheme(newTheme);
      }
    },
  };

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
