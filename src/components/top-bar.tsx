
'use client';

import React, { useEffect, useState } from 'react';
import { useTheme, type Theme } from '@/components/theme-provider';
import { Label } from '@/components/ui/label-themed';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select-themed';

export function TopBar() {
  const { currentTheme, selectedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleThemeChange = (newThemeString: string) => {
    if (newThemeString === 'theme-98' || newThemeString === 'theme-7') {
      setTheme(newThemeString as Theme);
    }
  };

  if (!mounted) {
    // This block runs on SSR and initial client render before useEffect.
    // It MUST match the structure of the mounted block for the DEFAULT THEME ('theme-98')
    return (
      <div className="flex justify-end items-center p-2"> {/* Simplified container */}
        {/* Theme selector elements directly inside */}
        <Label htmlFor="theme-select-native" className="mr-2">Theme:</Label>
        <select
          id="theme-select-native"
          value="theme-98" // Default theme value for SSR consistency
          disabled // Disable during SSR/pre-hydration
          readOnly // Indicate it's not interactive yet
          className="w-[120px] field-row" // Ensure class matches theme-98 version
          style={{ height: '21px' }} // Ensure style matches theme-98 version
          onChange={() => {}} // Dummy onChange to satisfy React, will be replaced client-side
        >
          <option value="theme-98">Windows 98</option>
          <option value="theme-7">Windows 7</option>
        </select>
      </div>
    );
  }

  // This block runs after client-side mounting
  return (
    <div className="flex justify-end items-center p-2"> {/* Outer container positions its direct children */}
      {/* Theme selector elements directly inside */}
      {currentTheme === 'theme-98' ? (
        <>
          <Label htmlFor="theme-select-native" className="mr-2">Theme:</Label>
          <select
            id="theme-select-native"
            value={selectedTheme} // Reflects user's actual choice
            onChange={(e) => handleThemeChange(e.target.value)}
            className="w-[120px] field-row"
            style={{ height: '21px' }}
          >
            <option value="theme-98">Windows 98</option>
            <option value="theme-7">Windows 7</option>
          </select>
        </>
      ) : ( // currentTheme === 'theme-7'
        <>
          <Label htmlFor="theme-select-custom" className="mr-2">Theme:</Label>
          <Select
            value={selectedTheme} // Reflects user's actual choice
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
        </>
      )}
    </div>
  );
}
