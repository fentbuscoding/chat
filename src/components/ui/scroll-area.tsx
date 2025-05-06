import * as React from 'react';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';

import { cn } from '@/lib/utils';
import { useTheme } from '@/components/theme-provider';

const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className, children, ...props }, ref) => (
  <ScrollAreaPrimitive.Root
    ref={ref}
    className={cn('overflow-hidden rounded-md', className)}
    {...props}
  >
    <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-md">
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollBar />
    <ScrollAreaPrimitive.Corner className="h-2 w-2 bg-transparent" />
  </ScrollAreaPrimitive.Root>
));
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Scrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Scrollbar>
>(({ className, orientation = 'vertical', ...props }, ref) => {
  const { currentTheme } = useTheme();
  return (
    <ScrollAreaPrimitive.Scrollbar
      ref={ref}
      orientation={orientation}
      className={cn(
        'flex touch-none select-none transition-colors',
        orientation === 'vertical' &&
          'h-full w-2.5 p-[1px] rounded-full bg-neutral-100 dark:bg-neutral-800',
        orientation === 'horizontal' &&
          'h-2.5 flex-col p-[1px] rounded-full bg-neutral-100 dark:bg-neutral-800',
        currentTheme === 'theme-98' && 'themed-scrollbar-98',
        currentTheme === 'theme-7' && 'themed-scrollbar-7',
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        className={cn(
          'relative flex-1 rounded-full',
          currentTheme === 'theme-98' ? 'bg-gray-400 button' : 'bg-neutral-400 dark:bg-neutral-700' // Fallback for 7 or if theme not applied
        )}
      />
    </ScrollAreaPrimitive.Scrollbar>
  );
});
ScrollBar.displayName = ScrollAreaPrimitive.Scrollbar.displayName;

export { ScrollArea, ScrollBar };

// Add these styles to your globals.css or a theme-specific CSS file:
/*
.themed-scrollbar-98 {
  background-color: #c0c0c0; // silver
}
.themed-scrollbar-98 > [data-radix-scroll-area-thumb] {
  background-color: #808080; // gray, with button styles from 98.css it will look raised
  border-top: 1px solid #dfdfdf;
  border-left: 1px solid #dfdfdf;
  border-right: 1px solid #000000;
  border-bottom: 1px solid #000000;
  box-shadow: inset 1px 1px 0px #ffffff, inset -1px -1px 0px #808080;
}

.themed-scrollbar-7 {
  // 7.css usually relies on browser default scrollbars or styles them subtly
  // For a more explicit 7.css look, you might need to customize more
  background: rgba(200, 200, 200, 0.5); // Light gray, slightly transparent
}
.themed-scrollbar-7 > [data-radix-scroll-area-thumb] {
  background-color: #a0a0a0; // Darker gray for the thumb
  border-radius: 3px;
}
.themed-scrollbar-7:hover {
    background: rgba(180,180,180,0.7);
}
.themed-scrollbar-7 > [data-radix-scroll-area-thumb]:hover {
    background-color: #808080;
}
*/
