'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

const InputThemed = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => {
  // Apply minimal structure, rely on global theme styles
  return (
    <input
      type={type}
      className={cn('themed-input', className)} // Add a base class if needed, then allow overrides
      ref={ref}
      {...props}
    />
  );
});
InputThemed.displayName = 'InputThemed';

export { InputThemed as Input };
