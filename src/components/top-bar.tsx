
'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useTheme, type Theme } from '@/components/theme-provider';
import { Label } from '@/components/ui/label-themed';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select-themed';
import { cn } from '@/lib/utils';

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

  const handleThemeChange = (newThemeString: string) => {
    if (newThemeString === 'theme-98' || newThemeString === 'theme-7') {
      setTheme(newThemeString as Theme);
    }
    setIsCustomizerOpen(false); // Close customizer if theme changes
  };

  const toggleCustomizer = useCallback(() => {
    if (!themeIconRef.current) return;

    if (!isCustomizerOpen) {
      const iconRect = themeIconRef.current.getBoundingClientRect();
      const windowWidth = 300; // Desired width of the customizer window
      let leftPosition = iconRect.left + window.scrollX;
      
      // Adjust if it overflows right edge of viewport
      if (leftPosition + windowWidth > window.innerWidth) {
        leftPosition = window.innerWidth - windowWidth - 10; // 10px padding from edge
      }
      // Ensure it doesn't go off the left edge either
      if (leftPosition < 10) {
        leftPosition = 10;
      }

      setCustomizerPosition({
        top: iconRect.bottom + window.scrollY + 5, // 5px below the icon
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
      <div className="flex justify-end items-center p-2 space-x-2">
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
        {/* Placeholder for theme icon to maintain layout consistency before mount */}
        <div style={{ width: '20px', height: '20px' }} />
      </div>
    );
  }

  return (
    <div className="flex justify-end items-center p-2 space-x-2">
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
            maxWidth: '90vw', // Ensure it doesn't exceed viewport width too much
            top: `${customizerPosition.top}px`,
            left: `${customizerPosition.left}px`,
            maxHeight: `calc(100vh - ${customizerPosition.top}px - 20px)`, // Prevent vertical overflow
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
          <div className="window-body" style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 80px)' /* Approximate height for title bar + padding */}}>
            <p className="p-2">Theme customization options will go here!</p>
            {/* Future content for theme customization */}
          </div>
        </div>
      )}
    </div>
  );
}
