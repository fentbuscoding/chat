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

      if (startX === 'center' || startY === 'center') {
        const parentRect = windowRef.current.parentElement?.getBoundingClientRect();
        const windowRect = windowRef.current.getBoundingClientRect();
        if (parentRect) {
          if (startX === 'center') {
            startX = (parentRect.width - windowRect.width) / 2;
          }
          if (startY === 'center') {
            startY = (parentRect.height - windowRect.height) / 2;
          }
        } else {
            // Fallback if parentRect is not available (e.g., during initial render)
            startX = typeof startX === 'number' ? startX : window.innerWidth / 2 - windowRect.width / 2;
            startY = typeof startY === 'number' ? startY : window.innerHeight / 2 - windowRect.height / 2;
        }
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
      setIsDragging(true);
      setRel({
        x: e.pageX - pos.left,
        y: e.pageY - pos.top,
      });
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
      setIsDragging(true);
      setRel({
        x: touch.pageX - pos.left,
        y: touch.pageY - pos.top,
      });
      e.stopPropagation();
    }
  };


  const onMouseUp = useCallback((e: MouseEvent) => {
    setIsDragging(false);
    e.stopPropagation();
    e.preventDefault();
  }, []);
  
  const onTouchEnd = useCallback((e: globalThis.TouchEvent) => {
    setIsDragging(false);
    e.stopPropagation();
  }, []);

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !rel || !windowRef.current) return;
    
    let newX = e.pageX - rel.x;
    let newY = e.pageY - rel.y;

    // Boundary checks (optional, keeps window within viewport)
    const parent = windowRef.current.parentElement;
    if (parent) {
        const parentRect = parent.getBoundingClientRect();
        const windowRect = windowRef.current.getBoundingClientRect();
        newX = Math.max(0, Math.min(newX, parentRect.width - windowRect.width));
        newY = Math.max(0, Math.min(newY, parentRect.height - windowRect.height));
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
    }

    setPosition({
      x: newX,
      y: newY,
    });
    e.stopPropagation();
  }, [isDragging, rel]);


  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      document.addEventListener('touchmove', onTouchMove);
      document.addEventListener('touchend', onTouchEnd);
      document.body.style.cursor = 'grabbing';
    } else {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.body.style.cursor = 'default';
    }
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.body.style.cursor = 'default';
    };
  }, [isDragging, onMouseMove, onMouseUp, onTouchMove, onTouchEnd]);

  return (
    <div
      ref={windowRef}
      className={cn(
        'window absolute', // Ensure window class is applied for theme styles
        theme === 'theme-7' && 'glass active', // Apply glass effect for theme-7
        isDragging && 'dragging-outline', // Apply dragging outline
        className
      )}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        cursor: isDragging ? 'grabbing' : 'grab',
        touchAction: 'none', // Prevent default touch actions like scrolling
         ...(theme === 'theme-7' ? { '--window-background-color': 'rgba(128, 91, 165, 0.5)' } : {})
      }}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
    >
      <div className="title-bar">
        <div className="title-bar-text">{title}</div>
        <div className="title-bar-controls">
          {/* No controls for simplicity */}
        </div>
      </div>
      <div className={cn(
        "window-body",
        theme === 'theme-98' ? 'p-0' : 'p-0', // Ensure no padding from window-body itself for video
        theme === 'theme-7' && !isChatWindow && 'p-0', // theme-7 no padding for video
        theme === 'theme-7' && isChatWindow && 'has-space', // theme-7 padding for chat window
         // Special class for the content area if it's a chat window, to manage flex grow
        isChatWindow ? 'flex flex-col flex-1 overflow-hidden' : '' 
        )}
        style={isChatWindow && theme === 'theme-7' ? { backgroundColor: 'transparent' } : {}}
      >
        {/* 
          For chat window, children are now wrapped, so this div applies flex for internal layout.
          For non-chat (video) windows, children are directly rendered.
        */}
        {children}
      </div>
    </div>
  );
};

export default DraggableWindow;
