import { useEffect } from 'react';
import { tvFocusManager } from '../utils/tvFocusManager';

export function useSpatialNavigation() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;

      // Let inputs handle left/right themselves
      if (
        (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) &&
        (e.key === 'ArrowLeft' || e.key === 'ArrowRight')
      ) return;

      // Check if user is in a scrollable area - don't intercept if they can scroll
      // Uses classList checks instead of getComputedStyle to avoid layout thrashing
      const isInScrollable = (element: HTMLElement | null): boolean => {
        if (!element || element === document.body) return false;
        
        const isScrollable = 
          element.classList.contains('overflow-x-auto') ||
          element.classList.contains('overflow-y-auto') ||
          element.classList.contains('media-stage-scroll');
        
        if (isScrollable) {
          const hasVerticalScroll = element.scrollHeight > element.clientHeight;
          const hasHorizontalScroll = element.scrollWidth > element.clientWidth;
          
          if (e.key === 'ArrowDown' || e.key === 'Down') {
            if (hasVerticalScroll && element.scrollTop < element.scrollHeight - element.clientHeight - 5) {
              return true;
            }
          }
          if (e.key === 'ArrowUp' || e.key === 'Up') {
            if (hasVerticalScroll && element.scrollTop > 5) {
              return true;
            }
          }
          if (e.key === 'ArrowRight' || e.key === 'Right') {
            if (hasHorizontalScroll && element.scrollLeft < element.scrollWidth - element.clientWidth - 5) {
              return true;
            }
          }
          if (e.key === 'ArrowLeft' || e.key === 'Left') {
            if (hasHorizontalScroll && element.scrollLeft > 5) {
              return true;
            }
          }
        }
        
        return isInScrollable(element.parentElement);
      };

      // Don't intercept if we're in a scrollable area that can still scroll
      if (isInScrollable(active)) {
        return;
      }

      let handled = false;

      switch (e.key) {
        case 'ArrowUp':
        case 'Up':
          e.preventDefault();
          tvFocusManager.focusDirection('up');
          handled = true;
          break;

        case 'ArrowDown':
        case 'Down':
          e.preventDefault();
          tvFocusManager.focusDirection('down');
          handled = true;
          break;

        case 'ArrowLeft':
        case 'Left':
          e.preventDefault();
          tvFocusManager.focusDirection('left');
          handled = true;
          break;

        case 'ArrowRight':
        case 'Right':
          e.preventDefault();
          tvFocusManager.focusDirection('right');
          handled = true;
          break;

        case 'Enter':
          if (active && active !== document.body) {
            // Buttons and links already activate on Enter via the browser's
            // default action. Calling .click() here would double-fire and
            // toggle pause→play in the same tick, making pause feel broken.
            const tag = active.tagName;
            if (tag === 'BUTTON' || tag === 'A') {
              return;
            }
            // Sliders (e.g. the player seek bar) shouldn't activate on Enter
            // — a programmatic .click() with clientX=0 would seek to start.
            if (active.getAttribute('role') === 'slider') {
              return;
            }
            e.preventDefault();
            active.click();
            handled = true;
          }
          break;

        case 'Backspace':
        case 'Escape':
          if (
            e.key === 'Backspace' &&
            (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)
          ) return;
          e.preventDefault();
          window.history.back();
          handled = true;
          break;

        case 'Tab':
          e.preventDefault();
          if (e.shiftKey) {
            tvFocusManager.focusPrevious();
          } else {
            tvFocusManager.focusNext();
          }
          handled = true;
          break;
      }

      // Navigation feedback is handled by the debounced MutationObserver
    };

    window.addEventListener('keydown', onKey);
    
    // Initialize focus on first element
    setTimeout(() => {
      tvFocusManager.focusFirst();
    }, 500);

    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);
}
