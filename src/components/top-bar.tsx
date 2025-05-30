
'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useTheme, type Theme } from '@/components/theme-provider';
import { Label } from '@/components/ui/label-themed';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select-themed';
import { cn } from '@/lib/utils';

const DYNAMIC_THEME_STYLE_ID = 'dynamic-win98-theme-style';

interface ThemeStamp {
  name: string;
  imageUrl: string;
  cssFile: string | null; // null for reset/default
  dataAiHint: string;
}

const availableStamps: ThemeStamp[] = [
  { name: 'Pink Windows', imageUrl: '/theme_stamps/starpattern.png', cssFile: 'pink-theme.css', dataAiHint: 'pink theme stamp' },
  { name: 'Default 98', imageUrl: 'https://placehold.co/100x75/c0c0c0/000000.png?text=Default', cssFile: null, dataAiHint: 'default theme stamp' },
];

export function TopBar() {
  const { currentTheme, selectedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isCustomizerOpen, setIsCustomizerOpen] = useState(false);
  const [customizerPosition, setCustomizerPosition] = useState({ top: 0, left: 0 });

  const themeIconRef = useRef<HTMLImageElement>(null);
  const customizerWindowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const applyWin98SubTheme = useCallback((cssFile: string | null) => {
    if (typeof window === 'undefined') return;

    const htmlElement = document.documentElement;
    htmlElement.classList.add('theme-transitioning');

    let link = document.getElementById(DYNAMIC_THEME_STYLE_ID) as HTMLLinkElement | null;

    if (cssFile) {
      const newHref = `/win98themes/${cssFile}`;
      if (link) {
        link.href = newHref;
      } else {
        link = document.createElement('link');
        link.id = DYNAMIC_THEME_STYLE_ID;
        link.rel = 'stylesheet';
        link.href = newHref;
        document.head.appendChild(link);
      }
    } else {
      // Reset: remove the dynamic stylesheet if it exists
      if (link) {
        link.remove();
      }
    }

    // Remove the transition class after the transition duration
    setTimeout(() => {
      htmlElement.classList.remove('theme-transitioning');
    }, 500); // Corresponds to 0.5s transition in globals.css
  }, []);


  const handleThemeChange = (newThemeString: string) => {
    if (newThemeString === 'theme-98' || newThemeString === 'theme-7') {
      setTheme(newThemeString as Theme);
      // If switching main theme, remove sub-theme stylesheet
      const dynamicLink = document.getElementById(DYNAMIC_THEME_STYLE_ID) as HTMLLinkElement | null;
      if (dynamicLink) {
          dynamicLink.remove();
      }
    }
    setIsCustomizerOpen(false);
  };

  const toggleCustomizer = useCallback(() => {
    if (!themeIconRef.current) return;

    if (!isCustomizerOpen) {
      const iconRect = themeIconRef.current.getBoundingClientRect();
      const windowWidth = 300;
      let leftPosition = iconRect.left + window.scrollX;
      
      if (leftPosition + windowWidth > window.innerWidth) {
        leftPosition = window.innerWidth - windowWidth - 10; 
      }
      if (leftPosition < 10) {
        leftPosition = 10;
      }

      setCustomizerPosition({
        top: iconRect.bottom + window.scrollY + 5,
        left: leftPosition,
      });
    }
    setIsCustomizerOpen(prev => !prev);
  }, [isCustomizerOpen]);

  useEffect(() => {
    if (!isCustomizerOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        customizerWindowRef.current &&
        !customizerWindowRef.current.contains(event.target as Node) &&
        themeIconRef.current &&
        !themeIconRef.current.contains(event.target as Node)
      ) {
        setIsCustomizerOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isCustomizerOpen]);


  if (!mounted) {
    return (
      <div className="flex justify-end items-center p-2 space-x-2 top-bar-main-body">
        <Label htmlFor="theme-select-native" className="mr-2">Theme:</Label>
        <select
          id="theme-select-native"
          value="theme-98"
          disabled
          readOnly
          className="w-[120px] field-row"
          style={{ height: '21px' }}
          onChange={() => {}}
        >
          <option value="theme-98">Windows 98</option>
          <option value="theme-7">Windows 7</option>
        </select>
        <div style={{ width: '20px', height: '20px' }} />
      </div>
    );
  }

  return (
    <div className={cn("flex justify-end items-center p-2 space-x-2", currentTheme === 'theme-7' ? 'top-bar-main-body' : '')}>
      <Label htmlFor={currentTheme === 'theme-98' ? "theme-select-native" : "theme-select-custom"} className="mr-2">Theme:</Label>
      {currentTheme === 'theme-98' ? (
        <select
          id="theme-select-native"
          value={selectedTheme}
          onChange={(e) => handleThemeChange(e.target.value)}
          className="w-[120px] field-row"
          style={{ height: '21px' }}
        >
          <option value="theme-98">Windows 98</option>
          <option value="theme-7">Windows 7</option>
        </select>
      ) : (
        <Select
          value={selectedTheme}
          onValueChange={(value: Theme) => handleThemeChange(value)}
        >
          <SelectTrigger id="theme-select-custom" className="w-[120px]">
            <SelectValue placeholder="Select theme" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="theme-98">Windows 98</SelectItem>
            <SelectItem value="theme-7">Windows 7</SelectItem>
          </SelectContent>
        </Select>
      )}

      {currentTheme === 'theme-98' && (
        <img
          ref={themeIconRef}
          src="/icons/theme.png"
          alt="Customize Theme"
          className="w-5 h-5 cursor-pointer"
          onClick={toggleCustomizer}
          data-ai-hint="theme settings icon"
        />
      )}

      {isCustomizerOpen && currentTheme === 'theme-98' && (
        <div
          ref={customizerWindowRef}
          className="window fixed z-50"
          style={{
            width: '300px',
            maxWidth: '90vw',
            top: `${customizerPosition.top}px`,
            left: `${customizerPosition.left}px`,
            maxHeight: `calc(100vh - ${customizerPosition.top}px - 20px)`,
          }}
        >
          <div className="title-bar">
            <div className="title-bar-text">Customize Theme</div>
            <div className="title-bar-controls">
              <button aria-label="Minimize" disabled></button>
              <button aria-label="Maximize" disabled></button>
              <button aria-label="Close" onClick={() => setIsCustomizerOpen(false)}></button>
            </div>
          </div>
          <div className="window-body p-2" style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 80px)' }}>
            <p className="text-xs mb-2">Select a theme stamp:</p>
            <ul className="list-none p-0 m-0">
              {availableStamps.map((stamp) => (
                <li key={stamp.name} className="mb-2 p-1 hover:bg-gray-300 cursor-pointer flex items-center" onClick={() => applyWin98SubTheme(stamp.cssFile)}>
                  <img 
                    src={stamp.imageUrl}
                    alt={stamp.name}
                    className="w-16 h-auto mr-2 border border-gray-400" // approx 65% of a 100px box width, adjust if needed
                    style={{ imageRendering: 'pixelated' }} // Good for pixel art stamps
                    data-ai-hint={stamp.dataAiHint}
                  />
                  <span className="text-sm">{stamp.name}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
