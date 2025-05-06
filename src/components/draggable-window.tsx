
'use client';

import React, { useState, useEffect, useRef, useCallback, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { useTheme } from './theme-provider'; // Assuming useTheme is in the same directory or adjust path

interface DraggableWindowProps {
  children: React.ReactNode;
  title: string;
  initialPosition?: { x: number; y: number };
  initialSize?: { width: number; height: number };
  minSize?: { width: number; height: number };
  boundaryRef: React.RefObject<HTMLDivElement>; // Parent boundary
  theme: 'theme-98' | 'theme-7'; // Explicitly pass theme
  windowClassName?: string;
  titleBarClassName?: string;
  bodyClassName?: string;
  style?: CSSProperties;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onResizeStart?: () => void;
  onResizeEnd?: () => void;
}

const MIN_WIDTH = 150;
const MIN_HEIGHT = 100;
const TITLE_BAR_HEIGHT = 20; // Approximate height of the title bar for collision adjustments

export function DraggableWindow({
  children,
  title,
  initialPosition = { x: 0, y: 0 },
  initialSize = { width: 300, height: 200 },
  minSize = { width: MIN_WIDTH, height: MIN_HEIGHT },
  boundaryRef,
  theme,
  windowClassName,
  titleBarClassName,
  bodyClassName,
  style,
  onDragStart,
  onDragEnd,
  onResizeStart,
  onResizeEnd,
}: DraggableWindowProps) {
  const [position, setPosition] = useState(initialPosition);
  const [dimensions, setDimensions] = useState(initialSize);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [operationStart, setOperationStart] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  const windowRef = useRef<HTMLDivElement>(null);
  const moveTimerRef = useRef<NodeJS.Timeout | null>(null); // Initialize moveTimerRef

  // Simple debounce function
  const debounce = useCallback((func: (...args: any[]) => void, delay: number) => {
    return (...args: any[]) => {
      if (moveTimerRef.current) {
        clearTimeout(moveTimerRef.current);
      }
      moveTimerRef.current = setTimeout(() => {
        func(...args);
      }, delay);
    };
  }, []);

  // Debounced version of handleMove
  const clampPosition = useCallback(
    (x: number, y: number, width: number, height: number) => {
      if (!boundaryRef.current) return { x, y };
      const boundaryRect = boundaryRef.current.getBoundingClientRect();
      const newX = Math.max(0, Math.min(x, boundaryRect.width - width));
      const newY = Math.max(0, Math.min(y, boundaryRect.height - height));
      return { x: newX, y: newY };
    },
    [boundaryRef]
  );

  const clampDimensions = useCallback(
    (newWidth: number, newHeight: number, currentX: number, currentY: number) => {
      let clampedWidth = Math.max(minSize.width, newWidth);
      let clampedHeight = Math.max(minSize.height, newHeight);

      if (boundaryRef.current) {
        const boundaryRect = boundaryRef.current.getBoundingClientRect();
        if (currentX + clampedWidth > boundaryRect.width) {
          clampedWidth = boundaryRect.width - currentX;
        }
        if (currentY + clampedHeight > boundaryRect.height) {
          clampedHeight = boundaryRect.height - currentY;
        }
      }
      return { width: Math.max(minSize.width, clampedWidth), height: Math.max(minSize.height, clampedHeight) };
    },
    [minSize, boundaryRef]
  );


  // Drag Handlers
  const onDragMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    onDragStart?.();
    setOperationStart({
      x: position.x,
      y: position.y,
      width: dimensions.width,
      height: dimensions.height,
      offsetX: e.clientX - position.x,
      offsetY: e.clientY - position.y,
    });
  };

  const onDragTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation(); // Prevent page scroll
    const touch = e.touches[0];
    setIsDragging(true);
    onDragStart?.();
    setOperationStart({
      x: position.x,
      y: position.y,
      width: dimensions.width,
      height: dimensions.height,
      offsetX: touch.clientX - position.x,
      offsetY: touch.clientY - position.y,
    });
  };

  // Resize Handlers
  const onResizeHandleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    onResizeStart?.();
    setOperationStart({
      x: position.x,
      y: position.y,
      width: dimensions.width,
      height: dimensions.height,
      offsetX: e.clientX, // Store initial mouse X for calculating delta
      offsetY: e.clientY, // Store initial mouse Y for calculating delta
    });
  };

    const onResizeHandleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation(); // Prevent page scroll
    const touch = e.touches[0];
    setIsResizing(true);
    onResizeStart?.();
    setOperationStart({
      x: position.x,
      y: position.y,
      width: dimensions.width,
      height: dimensions.height,
      offsetX: touch.clientX,
      offsetY: touch.clientY,
    });
  };


  // Mouse/Touch Move Handler
  const handleMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!operationStart) return;

      if (isDragging) {
        const newX = clientX - operationStart.offsetX;
        const newY = clientY - operationStart.offsetY;
        const clamped = clampPosition(newX, newY, dimensions.width, dimensions.height);
        setPosition(clamped);
      } else if (isResizing) {
        const deltaX = clientX - operationStart.offsetX;
        const deltaY = clientY - operationStart.offsetY;
        const newWidth = operationStart.width + deltaX;
        const newHeight = operationStart.height + deltaY;

        const clamped = clampDimensions(newWidth, newHeight, operationStart.x, operationStart.y);
        setDimensions(clamped);
      }
    },
    [isDragging, isResizing, operationStart, dimensions, clampPosition, clampDimensions]
  );

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (isDragging || isResizing) {
        handleMove(e.clientX, e.clientY);
      }
    },
    [isDragging, isResizing, handleMove]
  );

  const onTouchMove = useCallback(
    (e: TouchEvent) => { // Added e: TouchEvent parameter
      if (isDragging || isResizing) {
        const touch = e.touches[0];
        handleMove(touch.clientX, touch.clientY);
        e.preventDefault(); // Prevent default scroll behavior
      }
    },
    [isDragging, isResizing, handleMove]
  );


  // Mouse/Touch Up Handler
  const handleOperationEnd = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      onDragEnd?.();
    }
    if (isResizing) {
      setIsResizing(false);
      onResizeEnd?.();
    }
    setOperationStart(null);
  }, [isDragging, isResizing, onDragEnd, onResizeEnd]);


  useEffect(() => {
    if (isDragging || isResizing) {
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', handleOperationEnd);
      document.addEventListener('touchmove', onTouchMove, { passive: false }); // passive: false to allow preventDefault
      document.addEventListener('touchend', handleOperationEnd);
    }
    return () => {
      if (moveTimerRef.current) {
        clearTimeout(moveTimerRef.current);
      }
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', handleOperationEnd);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', handleOperationEnd);
    };
  }, [isDragging, isResizing, onMouseMove, handleOperationEnd, onTouchMove]);


  // Style for the window
  const windowStyle: CSSProperties = {
    position: 'absolute',
    left: `${position.x}px`,
    top: `${position.y}px`,
    width: `${dimensions.width}px`,
    height: `${dimensions.height}px`,
    touchAction: 'none', // Prevents default touch behaviors like scrolling when interacting with the window
 ...style,
  };

  const isGlassTheme = theme === 'theme-7' && windowClassName?.includes('glass');

  return (
    <div
      ref={windowRef}
      className={cn(
        'window',
        theme === 'theme-7' && 'active', // 7.css needs 'active' for proper styling
        (isDragging || isResizing) && 'dragging-outline',
        windowClassName
      )}
      style={windowStyle}
      data-testid="draggable-window"
    >
      <div
        className={cn('title-bar', titleBarClassName)}
        onMouseDown={onDragMouseDown}
        onTouchStart={onDragTouchStart}
        data-testid="draggable-window-title-bar"
      >
        <div className="title-bar-text">{title}</div>
        {/* No controls for minimize, maximize, close as per previous request */}
      </div>
      <div
        className={cn(
            'window-body',
            {'has-space': theme === 'theme-7' && !isGlassTheme && !bodyClassName?.includes('p-0')}, // Add padding for 7.css non-glass if not overridden
            {'has-space glass-body-padding': isGlassTheme && !bodyClassName?.includes('p-0')}, // Special padding for glass
            bodyClassName,
            'flex flex-col overflow-hidden' // Ensure body allows flex content and hides overflow
        )}
        style={{ height: `calc(100% - ${TITLE_BAR_HEIGHT}px)`}} // Ensure body fills remaining space
        data-testid="draggable-window-body"
      >
        {children}
      </div>
      <div // Resize Handle
        className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize z-10"
        onMouseDown={onResizeHandleMouseDown}
        onTouchStart={onResizeHandleTouchStart}
        data-testid="draggable-window-resize-handle"
      />
    </div>
  );
}

// Helper class in globals.css for glass body padding if needed:
// .theme-7 .window.glass .window-body.glass-body-padding {
//   padding: 8px; /* Example padding */
//
