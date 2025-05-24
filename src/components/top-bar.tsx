
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
    // This block runs on SSR and initial client render before useEffect
    // It MUST match the structure of the mounted block for the DEFAULT THEME ('theme-98')
    return (
      <div className="flex justify-end p-2"> {/* Simplified container */}
        {/* Title bar removed */}
        <div className="flex items-center space-x-2 bg-inherit"> {/* Simplified inner div, kept bg-inherit for potential theme effects */}
          {/* Match the theme-98 path from the mounted state for SSR consistency */}
          <Label htmlFor="theme-select-native">Theme:</Label>
          <select
            id="theme-select-native"
            value="theme-98" // Default theme value
            disabled // Disable during SSR/pre-hydration
            readOnly // Indicate it's not interactive yet
            className="w-[120px] field-row"
            style={{ height: '21px' }}
            onChange={() => {}} // Dummy onChange to satisfy React, will be replaced client-side
          >
            <option value="theme-98">Windows 98</option>
            <option value="theme-7">Windows 7</option>
          </select>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-end p-2"> {/* Simplified container */}
      {/* Title bar removed */}
       <div className="flex items-center space-x-2 bg-inherit"> {/* Simplified inner div, kept bg-inherit */}

        {theme === 'theme-98' ? (
          <>
            <Label htmlFor="theme-select-native">Theme:</Label>
            <select
              id="theme-select-native"
              value={theme}
              onChange={(e) => handleThemeChange(e.target.value)}
              className="w-[120px] field-row"
              style={{ height: '21px' }}
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
