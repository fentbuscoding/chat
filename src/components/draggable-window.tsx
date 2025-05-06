
'use client';

import type { MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from 'react';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/components/theme-provider';

interface DraggableWindowProps {
  children: React.ReactNode;
  title: string;
  initialPosition?: { x: number | 'center'; y: number | 'center' };
  className?: string;
  theme: 'theme-98' | 'theme-7';
  isChatWindow?: boolean; // To help with initial centering for text chat
}

const DraggableWindow: React.FC<DraggableWindowProps> = ({
  children,
  title,
  initialPosition = { x: 0, y: 0 },
  className,
  theme,
  isChatWindow = false,
}) => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [rel, setRel] = useState<{ x: number; y: number } | null>(null); // Position of mouse relative to top-left of item
  const windowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (windowRef.current) {
      let startX = initialPosition.x;
      let startY = initialPosition.y;
      const windowRect = windowRef.current.getBoundingClientRect();
      const parentElement = windowRef.current.parentElement;

      if (parentElement) {
        const parentRect = parentElement.getBoundingClientRect();
        if (startX === 'center') {
          startX = (parentRect.width - windowRect.width) / 2;
        }
        if (startY === 'center') {
          startY = (parentRect.height - windowRect.height) / 2;
        }
        // Ensure initial position is within bounds
        startX = Math.max(0, Math.min(Number(startX), parentRect.width - windowRect.width));
        startY = Math.max(0, Math.min(Number(startY), parentRect.height - windowRect.height));

      } else {
          // Fallback if parentRect is not available (e.g., during initial render)
          startX = typeof startX === 'number' ? startX : window.innerWidth / 2 - windowRect.width / 2;
          startY = typeof startY === 'number' ? startY : window.innerHeight / 2 - windowRect.height / 2;
          // Ensure initial position is within viewport bounds as a fallback
          startX = Math.max(0, Math.min(Number(startX), window.innerWidth - windowRect.width));
          startY = Math.max(0, Math.min(Number(startY), window.innerHeight - windowRect.height));
      }
      setPosition({ x: Number(startX), y: Number(startY) });
    }
  }, [initialPosition, isChatWindow]);


  const onMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    // Only drag by title bar
    if ((e.target as HTMLElement).closest('.title-bar')) {
      if (e.button !== 0) return; // Only left mouse button
      const target = windowRef.current;
      if (!target) return;

      const pos = target.getBoundingClientRect();
      // Calculate relative position from page coordinates to element's top-left
      setRel({
        x: e.pageX - pos.left,
        y: e.pageY - pos.top,
      });
      setIsDragging(true);
      e.stopPropagation();
      e.preventDefault();
    }
  };
  
  const onTouchStart = (e: ReactTouchEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.title-bar')) {
      const target = windowRef.current;
      if (!target) return;
      const touch = e.touches[0];
      const pos = target.getBoundingClientRect();
      setRel({
        x: touch.pageX - pos.left,
        y: touch.pageY - pos.top,
      });
      setIsDragging(true);
      e.stopPropagation();
    }
  };


  const onMouseUp = useCallback((e: MouseEvent) => {
    setIsDragging(false);
    document.body.style.cursor = 'default';
    if (windowRef.current) windowRef.current.style.cursor = 'grab';
    e.stopPropagation();
    e.preventDefault();
  }, []);
  
  const onTouchEnd = useCallback((e: globalThis.TouchEvent) => {
    setIsDragging(false);
    document.body.style.cursor = 'default';
     if (windowRef.current) windowRef.current.style.cursor = 'grab';
    e.stopPropagation();
  }, []);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !rel || !windowRef.current) return;
    
    let newX = e.pageX - rel.x;
    let newY = e.pageY - rel.y;

    const parent = windowRef.current.parentElement;
    if (parent) {
        const parentRect = parent.getBoundingClientRect();
        const windowRect = windowRef.current.getBoundingClientRect();
        
        // Constrain X within parent boundaries
        newX = Math.max(0, Math.min(newX, parentRect.width - windowRect.width));
        // Constrain Y within parent boundaries
        newY = Math.max(0, Math.min(newY, parentRect.height - windowRect.height));
    } else {
        // Fallback: constrain within viewport if no parent or parent has no dimensions
        const windowRect = windowRef.current.getBoundingClientRect();
        newX = Math.max(0, Math.min(newX, window.innerWidth - windowRect.width));
        newY = Math.max(0, Math.min(newY, window.innerHeight - windowRect.height));
    }
    
    setPosition({
      x: newX,
      y: newY,
    });
    e.stopPropagation();
    e.preventDefault();
  }, [isDragging, rel]);

  const onTouchMove = useCallback((e: globalThis.TouchEvent) => {
    if (!isDragging || !rel || !windowRef.current) return;
    const touch = e.touches[0];
    let newX = touch.pageX - rel.x;
    let newY = touch.pageY - rel.y;

    const parent = windowRef.current.parentElement;
    if (parent) {
        const parentRect = parent.getBoundingClientRect();
        const windowRect = windowRef.current.getBoundingClientRect();
        newX = Math.max(0, Math.min(newX, parentRect.width - windowRect.width));
        newY = Math.max(0, Math.min(newY, parentRect.height - windowRect.height));
    } else {
        const windowRect = windowRef.current.getBoundingClientRect();
        newX = Math.max(0, Math.min(newX, window.innerWidth - windowRect.width));
        newY = Math.max(0, Math.min(newY, window.innerHeight - windowRect.height));
    }

    setPosition({
      x: newX,
      y: newY,
    });
    e.stopPropagation();
  }, [isDragging, rel]);


  useEffect(() => {
    const currentWindowRef = windowRef.current;
    if (isDragging) {
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      document.addEventListener('touchmove', onTouchMove, { passive: false }); // passive: false for preventDefault
      document.addEventListener('touchend', onTouchEnd);
      document.body.style.userSelect = 'none'; // Prevent text selection during drag
      document.body.style.cursor = 'grabbing';
      if (currentWindowRef) currentWindowRef.style.cursor = 'grabbing';

    } else {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.body.style.userSelect = '';
      document.body.style.cursor = 'default';
      if (currentWindowRef) currentWindowRef.style.cursor = 'grab';
    }
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.body.style.userSelect = '';
      document.body.style.cursor = 'default';
       if (currentWindowRef) currentWindowRef.style.cursor = 'grab';
    };
  }, [isDragging, onMouseMove, onMouseUp, onTouchMove, onTouchEnd]);

  return (
    <div
      ref={windowRef}
      className={cn(
        'window absolute', 
        theme === 'theme-7' && 'glass active', 
        isDragging && 'dragging-outline', 
        className
      )}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        // cursor is handled by useEffect for title-bar and body
        touchAction: 'none', 
         ...(theme === 'theme-7' ? { '--window-background-color': 'rgba(128, 91, 165, 0.5)' } : {})
      }}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
    >
      <div className="title-bar"> {/* Apply grab cursor specifically to title bar */}
        <div className="title-bar-text">{title}</div>
        <div className="title-bar-controls">
          {/* No controls for simplicity */}
        </div>
      </div>
      <div className={cn(
        "window-body",
        theme === 'theme-98' && !isChatWindow && 'p-0', 
        theme === 'theme-98' && isChatWindow && 'p-0.5', // specific padding for 98 chat
        theme === 'theme-7' && !isChatWindow && 'p-0', 
        theme === 'theme-7' && isChatWindow && 'has-space', 
        isChatWindow ? 'flex flex-col flex-1 overflow-hidden window-body-content' : 'window-body-content' // ensure window-body-content for flex/overflow
        )}
        style={isChatWindow && theme === 'theme-7' ? { backgroundColor: 'transparent' } : {}}
      >
        {children}
      </div>
    </div>
  );
};

export default DraggableWindow;

