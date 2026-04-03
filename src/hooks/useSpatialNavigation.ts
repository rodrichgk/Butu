import { useEffect } from 'react';

/**
 * A basic hook to enable directional D-Pad navigation for Smart TVs.
 * Focuses elements with the class 'focusable' or standard interactive elements.
 */
export function useSpatialNavigation() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Map common D-pad keys
      let direction = null;
      switch (e.key) {
        case 'ArrowUp':
        case 'Up':
          direction = 'up';
          break;
        case 'ArrowDown':
        case 'Down':
          direction = 'down';
          break;
        case 'ArrowLeft':
        case 'Left':
          direction = 'left';
          break;
        case 'ArrowRight':
        case 'Right':
          direction = 'right';
          break;
        case 'Enter':
          // Native click will usually handle this, but can be forced
          break;
        case 'Escape':
        case 'Backspace':
          // Handle back action (usually TV remote 'Back' button)
          const active = document.activeElement as HTMLElement;
          if (
            e.key === 'Backspace' &&
            (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)
          ) {
            return; // Let native text deletion overrule back-navigation
          }
          if (active && active !== document.body) {
            active.blur();
          } else {
             window.history.back();
          }
          break;
      }

      if (!direction) return;

      e.preventDefault();

      const focusableElements = Array.from(
        document.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"]), .focusable'
        )
      ).filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && 
               el.style.visibility !== 'hidden' && 
               el.style.display !== 'none';
      });

      const activeEl = document.activeElement as HTMLElement;

      // Allow native text cursor movement inside inputs/textareas
      if (
        (activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement) &&
        (direction === 'left' || direction === 'right')
      ) {
        return;
      }
      
      if (!focusableElements.includes(activeEl)) {
        // If nothing is focused, focus the first element
        focusableElements[0]?.focus();
        return;
      }

      // Basic nearest-neighbor logic
      const activeRect = activeEl.getBoundingClientRect();
      const activeCenter = {
        x: activeRect.left + activeRect.width / 2,
        y: activeRect.top + activeRect.height / 2
      };

      let bestCandidate: HTMLElement | null = null;
      let minDistance = Infinity;

      for (const el of focusableElements) {
        if (el === activeEl) continue;

        const rect = el.getBoundingClientRect();
        const center = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2
        };

        let isValidCandidate = false;

        if (direction === 'up' && center.y < activeCenter.y - 10) isValidCandidate = true;
        if (direction === 'down' && center.y > activeCenter.y + 10) isValidCandidate = true;
        if (direction === 'left' && center.x < activeCenter.x - 10) isValidCandidate = true;
        if (direction === 'right' && center.x > activeCenter.x + 10) isValidCandidate = true;

        if (isValidCandidate) {
          const dist = Math.hypot(center.x - activeCenter.x, center.y - activeCenter.y);
          // Prioritize alignment in the perpendicular axis
          const alignmentPenalty = 
            (direction === 'up' || direction === 'down') 
              ? Math.abs(center.x - activeCenter.x) * 2 
              : Math.abs(center.y - activeCenter.y) * 2;
          
          const totalDistance = dist + alignmentPenalty;

          if (totalDistance < minDistance) {
            minDistance = totalDistance;
            bestCandidate = el;
          }
        }
      }

      if (bestCandidate) {
        bestCandidate.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
