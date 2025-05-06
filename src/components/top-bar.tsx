
'use client';

import React from 'react';
import { useTheme } from '@/components/theme-provider';
import { Button } from '@/components/ui/button-themed'; // Use themed button
import { Label } from '@/components/ui/label-themed'; // Use themed label
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select-themed'; // Use themed select

export function TopBar() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="window-body" style={{margin:0}}> {/* Use window-body for theme consistency */}
      <div className="title-bar">
        <div className="title-bar-text">Ballscord</div>
          <div className="title-bar-controls">
            {/* Optional: Add window controls if needed by the theme */}
            {/* <button aria-label="Minimize"></button>
            <button aria-label="Maximize"></button>
            <button aria-label="Close"></button> */}
          </div>
      </div>
       <div className="flex items-center justify-end p-2 space-x-2 bg-inherit"> {/* Use bg-inherit to respect theme */}
        <Label htmlFor="theme-select">Theme:</Label>
        <Select
          value={theme}
          onValueChange={(value: 'theme-98' | 'theme-7') => setTheme(value)}
        >
          <SelectTrigger id="theme-select" className="w-[120px]">
            <SelectValue placeholder="Select theme" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="theme-98">Windows 98</SelectItem>
            <SelectItem value="theme-7">Windows 7</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

