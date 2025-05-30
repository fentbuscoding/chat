
'use client';

import React, { useEffect } from 'react';

// Ensure the Window interface is augmented for your custom cursor functions
// If not already globally declared, you might need this here or in a global .d.ts file
declare global {
  interface Window {
    startOriginalOneko?: () => void;
    stopOriginalOneko?: () => void;
    hideOriginalOneko?: () => void;
    showOriginalOneko?: () => void;
    startAnimatedGifCursor?: (gifUrl: string) => void;
    stopAnimatedGifCursor?: () => void;
    hideAnimatedGifCursor?: () => void;
    showAnimatedGifCursor?: () => void;
  }
}

export function ClientEffectManager() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Stop all cursors initially to prevent multiple active if preferences change
    window.stopOriginalOneko?.();
    window.stopAnimatedGifCursor?.();
    document.body.style.cursor = 'auto';

    const savedNekoActive = localStorage.getItem('nekoActive');
    const savedAnimatedCursorUrl = localStorage.getItem('animatedCursorUrl');
    const savedStaticCursorUrl = localStorage.getItem('selectedCursorUrl');

    if (savedNekoActive === 'true') {
      window.startOriginalOneko?.();
      document.body.style.cursor = 'auto';
    } else if (savedAnimatedCursorUrl) {
      window.startAnimatedGifCursor?.(savedAnimatedCursorUrl);
      document.body.style.cursor = 'none';
    } else if (savedStaticCursorUrl) {
      document.body.style.cursor = `url(${savedStaticCursorUrl}), auto`;
    } else {
      document.body.style.cursor = 'auto';
    }

    const handleMouseOver = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const isInteractive = target.closest('button, a, select, input, textarea, [role="button"], [role="tab"]');

      if (isInteractive) {
        const isNekoActive = localStorage.getItem('nekoActive') === 'true';
        const isAnimatedGifActive = !!localStorage.getItem('animatedCursorUrl');

        if (isAnimatedGifActive && !isNekoActive) { // Hide generic animated cursor if it's the active one
          window.hideAnimatedGifCursor?.();
        }
        if (isNekoActive) { // Always hide Neko if it's active
          window.hideOriginalOneko?.();
        }
        // CSS :hover rules in globals.css will take care of showing system pointer/text cursor
      }
    };

    const handleMouseOut = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      let isStillOverInteractive = false;
      if (event.relatedTarget) {
        isStillOverInteractive = !!(event.relatedTarget as HTMLElement).closest?.('button, a, select, input, textarea, [role="button"], [role="tab"]');
      }

      if (!isStillOverInteractive && target.closest('button, a, select, input, textarea, [role="button"], [role="tab"]')) {
        const isNekoActive = localStorage.getItem('nekoActive') === 'true';
        const isAnimatedGifActive = !!localStorage.getItem('animatedCursorUrl');

        if (isAnimatedGifActive && !isNekoActive) {
          window.showAnimatedGifCursor?.();
        }
        if (isNekoActive) {
          window.showOriginalOneko?.();
        }
      }
    };

    document.body.addEventListener('mouseover', handleMouseOver);
    document.body.addEventListener('mouseout', handleMouseOut);

    return () => {
      document.body.removeEventListener('mouseover', handleMouseOver);
      document.body.removeEventListener('mouseout', handleMouseOut);
    };
  }, []);

  return null; // This component doesn't render any UI itself, it's for side effects
}
