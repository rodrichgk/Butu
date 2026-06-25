// TV Remote Focus Management - Proper D-pad navigation
import { isAndroidTV } from "./tvOptimizations";

export class TVFocusManager {
  private static instance: TVFocusManager;
  private focusableElements: HTMLElement[] = [];
  private currentFocusIndex = -1;
  private observer: MutationObserver | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor() {
    this.init();
  }

  static getInstance(): TVFocusManager {
    if (!TVFocusManager.instance) {
      TVFocusManager.instance = new TVFocusManager();
    }
    return TVFocusManager.instance;
  }

  private init() {
    // Watch for DOM changes to update focusable elements — debounced to avoid
    // thrashing on rapid DOM mutations (e.g. AnimatePresence mounting 30 cards)
    this.observer = new MutationObserver(() => {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => this.updateFocusableElements(), 150);
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['tabindex', 'disabled', 'hidden'],
    });

    // Initial scan
    this.updateFocusableElements();

    // Add global styles for focus indicators
    this.addFocusStyles();
  }

  private addFocusStyles() {
    const styleId = 'tv-focus-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      /* TV Focus Indicators — lightweight for TV GPU */
      .focusable:focus,
      button:focus,
      [tabindex]:focus {
        outline: none !important;
        box-shadow: 0 0 0 2px #06080d,
                    0 0 0 4px rgba(153, 247, 255, 0.85) !important;
        transform: scale(1.02) !important;
        z-index: 100 !important;
        position: relative !important;
      }

      /* Focus transition — short and only on the ring properties */
      .focusable,
      button,
      [tabindex] {
        transition: box-shadow 0.12s ease !important;
      }

      /* Hide mouse cursor on TV */
      ${isAndroidTV ? 'body { cursor: none !important; }' : ''}
    `;
    document.head.appendChild(style);
  }

  private isInInertSubtree(el: HTMLElement): boolean {
    let node: HTMLElement | null = el;
    while (node) {
      if (node.hasAttribute('inert')) return true;
      node = node.parentElement;
    }
    return false;
  }

  updateFocusableElements() {
    const selector = [
      'button:not([disabled])',
      'a[href]',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
      '.focusable:not([disabled])',
    ].join(', ');

    this.focusableElements = Array.from(
      document.querySelectorAll<HTMLElement>(selector)
    ).filter((el) => {
      // Honor tabindex="-1" — the base selector matches `button`/`input`/etc.
      // unconditionally, so opt-out via tabindex is otherwise ignored.
      if (el.getAttribute('tabindex') === '-1') return false;

      // Skip elements inside an inert subtree (background behind modals)
      if (this.isInInertSubtree(el)) return false;

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return false;

      // Don't exclude off-screen elements — the direction scoring picks the
      // nearest candidate and scrollIntoView brings it into view after focus.
      // Excluding them caused "press multiple times" because the current element
      // was always the only in-viewport candidate in that direction.

      const style = window.getComputedStyle(el);
      if (
        style.visibility === 'hidden' ||
        style.display === 'none' ||
        parseFloat(style.opacity) === 0
      ) {
        return false;
      }

      return true;
    });

    // Sort by position (top to bottom, left to right)
    // Cache rects to avoid repeated getBoundingClientRect calls during sort
    const rectMap = new WeakMap<HTMLElement, DOMRect>();
    const getRect = (el: HTMLElement) => {
      let r = rectMap.get(el);
      if (!r) { r = el.getBoundingClientRect(); rectMap.set(el, r); }
      return r;
    };

    this.focusableElements.sort((a, b) => {
      const rectA = getRect(a);
      const rectB = getRect(b);

      // Sort by Y position first (top to bottom)
      if (Math.abs(rectA.top - rectB.top) > 10) {
        return rectA.top - rectB.top;
      }

      // Then by X position (left to right)
      return rectA.left - rectB.left;
    });
  }

  focusFirst() {
    this.updateFocusableElements();
    if (this.focusableElements.length > 0) {
      this.focusableElements[0].focus();
      this.currentFocusIndex = 0;
    }
  }

  focusNext() {
    this.updateFocusableElements();
    if (this.focusableElements.length === 0) return;

    const currentFocused = document.activeElement as HTMLElement;
    const currentIndex = this.focusableElements.indexOf(currentFocused);

    if (currentIndex === -1) {
      this.focusFirst();
      return;
    }

    const nextIndex = (currentIndex + 1) % this.focusableElements.length;
    this.focusableElements[nextIndex].focus();
    this.scrollIntoView(this.focusableElements[nextIndex]);
    this.currentFocusIndex = nextIndex;
  }

  focusPrevious() {
    this.updateFocusableElements();
    if (this.focusableElements.length === 0) return;

    const currentFocused = document.activeElement as HTMLElement;
    const currentIndex = this.focusableElements.indexOf(currentFocused);

    if (currentIndex === -1) {
      this.focusFirst();
      return;
    }

    const prevIndex =
      currentIndex === 0
        ? this.focusableElements.length - 1
        : currentIndex - 1;
    this.focusableElements[prevIndex].focus();
    this.scrollIntoView(this.focusableElements[prevIndex]);
    this.currentFocusIndex = prevIndex;
  }

  focusDirection(direction: 'up' | 'down' | 'left' | 'right') {
    this.updateFocusableElements();
    const currentFocused = document.activeElement as HTMLElement;
    
    if (!currentFocused || currentFocused === document.body) {
      this.focusFirst();
      return;
    }

    const currentRect = currentFocused.getBoundingClientRect();
    const currentCenter = {
      x: currentRect.left + currentRect.width / 2,
      y: currentRect.top + currentRect.height / 2,
    };

    let bestCandidate: HTMLElement | null = null;
    let bestScore = Infinity;

    for (const el of this.focusableElements) {
      if (el === currentFocused) continue;

      const rect = el.getBoundingClientRect();
      const center = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };

      const dx = center.x - currentCenter.x;
      const dy = center.y - currentCenter.y;

      // Check if element is in the correct direction
      let isInDirection = false;
      switch (direction) {
        case 'up':
          isInDirection = dy < -10;
          break;
        case 'down':
          isInDirection = dy > 10;
          break;
        case 'left':
          isInDirection = dx < -10;
          break;
        case 'right':
          isInDirection = dx > 10;
          break;
      }

      if (!isInDirection) continue;

      // Calculate score (distance with directional bias)
      const isHorizontal = direction === 'left' || direction === 'right';
      const primaryDist = isHorizontal ? Math.abs(dx) : Math.abs(dy);
      const secondaryDist = isHorizontal ? Math.abs(dy) : Math.abs(dx);
      
      // Heavily penalize perpendicular distance to stay in same row/column
      const score = primaryDist + secondaryDist * 5;

      if (score < bestScore) {
        bestScore = score;
        bestCandidate = el;
      }
    }

    if (bestCandidate) {
      bestCandidate.focus();
      this.scrollIntoView(bestCandidate);
      this.currentFocusIndex = this.focusableElements.indexOf(bestCandidate);
    }
  }

  private scrollIntoView(element: HTMLElement) {
    // Use 'instant' on TV — smooth scrolling eats CPU on every animation frame.
    // On desktop, keep smooth for polish.
    element.scrollIntoView({
      behavior: isAndroidTV ? 'instant' : 'smooth',
      block: 'center',
      inline: 'center',
    });
  }

  destroy() {
    this.observer?.disconnect();
    const style = document.getElementById('tv-focus-styles');
    style?.remove();
  }
}

// Export singleton instance
export const tvFocusManager = TVFocusManager.getInstance();
