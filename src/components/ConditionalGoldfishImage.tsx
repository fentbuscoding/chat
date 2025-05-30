
'use client';

import React from 'react';
import { useTheme } from '@/components/theme-provider';

export function ConditionalGoldfishImage() {
  const { currentTheme } = useTheme();

  if (currentTheme !== 'theme-7') {
    return null;
  }

  return (
    <img
      src="https://github.com/ekansh28/files/blob/main/goldfish.png?raw=true"
      alt="Decorative Goldfish"
      className="absolute top-[-60px] right-[-34px] w-[150px] h-[150px] object-contain pointer-events-none select-none z-50"
      data-ai-hint="goldfish decoration"
    />
  );
}
