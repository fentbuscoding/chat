
'use client';

import React, { useEffect, useState } from 'react';
import { useTheme } from '@/components/theme-provider';
import { Label } from '@/components/ui/label-themed'; 
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select-themed'; 

export function TopBar() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleThemeChange = (newTheme: string) => {
    if (newTheme === 'theme-98' || newTheme === 'theme-7') {
      setTheme(newTheme as 'theme-98' | 'theme-7');
    }
  };

  if (!mounted) {
    // Render a placeholder or null during server-side rendering and initial client-side hydration
    // This ensures the initial render matches the server output before client-side logic takes over.
    return (
      <div className="window-body" style={{margin:0}}>
        <div className="title-bar"> 
          <div className="title-bar-text">Ballscord</div>
            <div className="title-bar-controls">
            </div>
        </div>
         <div className="flex items-center justify-end p-2 space-x-2 bg-inherit">
           <Label htmlFor="theme-select-placeholder">Theme:</Label>
           {/* Placeholder for the select element to match structure */}
           <div id="theme-select-placeholder" className="w-[120px] h-[21px] border field-row bg-gray-200" /> 
        </div>
      </div>
    );
  }

  return (
    <div className="window-body" style={{margin:0}}> {/* Use window-body for theme consistency */}
      <div className="title-bar">
        <div className="title-bar-text">Ballscord</div>
          <div className="title-bar-controls">
            {/* Optional: Add window controls if needed by the theme */}
          </div>
      </div>
       <div className="flex items-center justify-end p-2 space-x-2 bg-inherit"> {/* Use bg-inherit to respect theme */}
        
        {theme === 'theme-98' ? (
          <>
            <Label htmlFor="theme-select-native">Theme:</Label>
            <select
              id="theme-select-native"
              value={theme}
              onChange={(e) => handleThemeChange(e.target.value)}
              className="w-[120px] field-row" // 98.css styles select, field-row for potential layout consistency
              style={{ height: '21px' }} // Match typical 98.css select height
            >
              <option value="theme-98">Windows 98</option>
              <option value="theme-7">Windows 7</option>
            </select>
          </>
        ) : (
          <>
            <Label htmlFor="theme-select-custom">Theme:</Label>
            <Select
              value={theme}
              onValueChange={(value: 'theme-98' | 'theme-7') => handleThemeChange(value)}
            >
              <SelectTrigger id="theme-select-custom" className="w-[120px]">
                <SelectValue placeholder="Select theme" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="theme-98">Windows 98</SelectItem>
                <SelectItem value="theme-7">Windows 7</SelectItem>
              </SelectContent>
            </Select>
          </>
        )}
      </div>
    </div>
  );
}

