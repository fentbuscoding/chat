
'use client';

import * as React from 'react';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import { cn } from '@/lib/utils';
import { useTheme } from '@/components/theme-provider';
import type { Theme } from '@/components/theme-provider'; // Ensure Theme type is imported

const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> & { theme?: Theme }
>(({ className, children, theme: themeProp, ...props }, ref) => {
  const { theme: contextTheme } = useTheme();
  const [isClient, setIsClient] = React.useState(false);
  const themeToApply = themeProp || contextTheme;

  React.useEffect(() => {
    setIsClient(true);
  }, []);

  return (
    <ScrollAreaPrimitive.Root
      ref={ref}
      className={cn('relative overflow-hidden', className)} // Base class
      {...props}
    >
      <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit] scroll-area-viewport">
        {children}
      </ScrollAreaPrimitive.Viewport>
      {/* Conditionally render ScrollBar based on isClient to avoid hydration issues with theme */}
      {isClient ? (
        <>
          <ScrollBar orientation="vertical" theme={themeToApply} />
          <ScrollBar orientation="horizontal" theme={themeToApply} />
        </>
      ) : (
        <>
          {/* Render non-themed or placeholder scrollbars on SSR or before hydration if necessary */}
          {/* Or simply omit them until client-side rendering takes over */}
          <ScrollAreaPrimitive.Scrollbar
            orientation="vertical"
            className="h-full w-2.5 border-l border-l-transparent p-[1px]"
          >
            <ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-full bg-neutral-200 dark:bg-neutral-700" />
          </ScrollAreaPrimitive.Scrollbar>
          <ScrollAreaPrimitive.Scrollbar
            orientation="horizontal"
            className="h-2.5 flex-col border-t border-t-transparent p-[1px]"
          >
            <ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-full bg-neutral-200 dark:bg-neutral-700" />
          </ScrollAreaPrimitive.Scrollbar>
        </>
      )}
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
});
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Scrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Scrollbar> & { theme?: Theme }
>(({ className, orientation = 'vertical', theme: themeProp, ...props }, ref) => {
  // themeProp is directly used. If it's undefined, it means no specific theme override was passed.
  // contextTheme is not strictly needed here if theme is always passed from ScrollArea after isClient check.
  const currentTheme = themeProp; // Relies on ScrollArea to pass the correct theme

  return (
    <ScrollAreaPrimitive.Scrollbar
      ref={ref}
      orientation={orientation}
      className={cn(
        'flex touch-none select-none transition-colors',
        orientation === 'vertical' && 'h-full w-2.5 border-l border-l-transparent p-[1px]',
        orientation === 'horizontal' && 'h-2.5 flex-col border-t border-t-transparent p-[1px]',
        // Apply theme only if currentTheme is defined (meaning, on client with a resolved theme)
        currentTheme === 'theme-98' && 'themed-scrollbar-98',
        currentTheme === 'theme-7' && 'themed-scrollbar-7',
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        className={cn(
          'relative flex-1 rounded-full',
          // Ensure currentTheme is defined before using it for theming
          currentTheme === 'theme-98' ? 'bg-gray-400 button' : 
          currentTheme === 'theme-7' ? 'bg-neutral-400 dark:bg-neutral-700' :
          'bg-neutral-200 dark:bg-neutral-700' // Fallback if theme is somehow undefined
        )}
      />
    </ScrollAreaPrimitive.Scrollbar>
  );
});
ScrollBar.displayName = ScrollAreaPrimitive.Scrollbar.displayName;

export { ScrollArea, ScrollBar };
