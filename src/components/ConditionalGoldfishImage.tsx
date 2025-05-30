
'use client';

import React from 'react';
import { useTheme } from '@/components/theme-provider';

export function ConditionalGoldfishImage() {
  const { currentTheme } = useTheme();

  if (currentTheme !== 'theme-7') {
    return null;
  }

  const imageStyles: React.CSSProperties = {
    top: '-60px',
    right: '-34px',
    width: '150px',
    height: '150px',
  };

  return (
    <img
      src="https://github.com/ekansh28/files/blob/main/goldfish.png?raw=true"
      alt="Decorative Goldfish"
      className="absolute object-contain pointer-events-none select-none z-50" // Standard Tailwind classes
      style={imageStyles} // Styles with arbitrary values moved here
      data-ai-hint="goldfish decoration"
    />
  );
}
