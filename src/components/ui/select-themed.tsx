
'use client';

import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react'; // Keep icons for structure
import { useTheme } from '@/components/theme-provider'; // Import useTheme

import { cn } from '@/lib/utils';

const Select = SelectPrimitive.Root;

const SelectGroup = SelectPrimitive.Group;

const SelectValue = SelectPrimitive.Value;

// The trigger will likely be styled as a standard button in 98/7.css
const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => {
   const { theme } = useTheme(); // Get current theme
  return (
  <SelectPrimitive.Trigger
    ref={ref}
    // Apply button-like classes, rely on global theme
    className={cn(
      // Base structure
      'flex items-center justify-between w-full border',
      // Theme-specific button styles
      theme === 'theme-98' ? 'p-0.5 button' : '', // 98.css button style with padding adjustment
      theme === 'theme-7' ? 'px-2 py-1 button' : '', // 7.css button style
      'themed-select-trigger', // Keep a generic class
      className
    )}
    {...props}
  >
    {children}
    {/* Keep icon for visual cue, theme might hide/restyle it */}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 opacity-50 themed-select-icon" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
)});
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

// The content area needs careful styling to match 98/7 menus/dropdowns
const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', ...props }, ref) => {
   const { theme } = useTheme(); // Get current theme
  return (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      // Apply classes that might correspond to menu/list styles in 98/7.css
      className={cn(
        'select-content themed-select-content relative z-50 min-w-[8rem] overflow-hidden rounded-none border p-0 shadow-md', // Basic dropdown styles, themes will override border-radius, padding etc.
        // Theme-specific menu/window styles
        theme === 'theme-98' ? 'bg-silver border-raised menu' : '', // 98.css menu style
        theme === 'theme-7' ? 'bg-white border border-gray-400 window shadow-lg' : '', // 7.css window/menu style
        // Keep animations for now
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        position === 'popper' &&
          'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
        className
      )}
      position={position}
      {...props}
    >
      <SelectPrimitive.Viewport
        className={cn(
          // Remove default padding, apply theme specific padding/structure inside SelectItem
          position === 'popper' &&
            'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]'
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
)});
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => {
   const { theme } = useTheme(); // Get current theme
   return (
  <SelectPrimitive.Label
    ref={ref}
    // Rely on theme for styling, add basic padding/font
    className={cn(
        'py-1 px-2 text-sm font-semibold',
        theme === 'theme-98' ? 'text-black' : '', // 98.css default text
        theme === 'theme-7' ? 'text-gray-700' : '', // 7.css default text
        'themed-select-label',
        className)}
    {...props}
  />
)});
SelectLabel.displayName = SelectPrimitive.Label.displayName;

// Item styling needs to match menu item appearance in 98/7.css
const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => {
   const { theme } = useTheme(); // Get current theme
   return (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      // Base item structure
      'select-item themed-select-item relative flex w-full cursor-default select-none items-center rounded-none py-0.5 px-2 text-sm outline-none',
      // Theme specific hover/focus styles
      theme === 'theme-98' ? 'focus:bg-navy focus:text-white data-[highlighted]:bg-navy data-[highlighted]:text-white' : '', // 98.css menu highlight
      theme === 'theme-7' ? 'focus:bg-blue-500 focus:text-white data-[highlighted]:bg-blue-100 data-[highlighted]:text-black' : '', // 7.css menu highlight
      'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
         {/* Adjust check mark style if needed */}
        <Check className="h-4 w-4 themed-select-check" />
      </SelectPrimitive.ItemIndicator>
    </span>
    {/* Adjust padding for text based on theme */}
    <SelectPrimitive.ItemText className={cn(theme === 'theme-98' ? 'pl-6' : 'pl-6')}>
      {children}
    </SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
)});
SelectItem.displayName = SelectPrimitive.Item.displayName;

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => {
    const { theme } = useTheme(); // Get current theme
    return (
  <SelectPrimitive.Separator
    ref={ref}
    // Apply theme-specific separator styles
    className={cn(
        '-mx-1 my-1 h-px', // Basic separator sizing
        theme === 'theme-98' ? 'bg-silver border-b border-gray' : '', // 98.css separator (menu-style)
        theme === 'theme-7' ? 'bg-gray-200' : '', // 7.css separator
        'themed-select-separator',
        className)}
    {...props}
  />
)});
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

// Export themed versions
export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
};
