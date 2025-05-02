'use client';

import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '@/lib/utils';

const LabelThemed = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn('themed-label', className)} // Basic class, relies on global theme
    {...props}
  />
));
LabelThemed.displayName = LabelPrimitive.Root.displayName;

export { LabelThemed as Label };
