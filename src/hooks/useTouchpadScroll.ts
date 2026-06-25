// Enhanced touchpad and wheel scroll support for TV remote airmouse mode
import { useEffect } from 'react';

export function useTouchpadScroll() {
  useEffect(() => {
    let isScrolling = false;
    let scrollTimeout: ReturnType<typeof setTimeout>;

    const handleWheel = (e: WheelEvent) => {
      // Find the nearest scrollable parent
      let target = e.target as HTMLElement | null;
      
      while (target && target !== document.body) {
        const style = window.getComputedStyle(target);
        const isScrollableY = 
          (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
          target.scrollHeight > target.clientHeight;
        
        const isScrollableX = 
          (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
          target.scrollWidth > target.clientWidth;

        // Check for Tailwind overflow classes
        const hasOverflowClass = 
          target.classList.contains('overflow-y-auto') ||
          target.classList.contains('overflow-x-auto') ||
          target.classList.contains('overflow-auto');

        if ((isScrollableY || isScrollableX || hasOverflowClass)) {
          // Let the browser handle the scroll naturally
          isScrolling = true;
          
          // Clear existing timeout
          clearTimeout(scrollTimeout);
          
          // Reset scrolling flag after scroll ends
          scrollTimeout = setTimeout(() => {
            isScrolling = false;
          }, 150);
          
          return; // Don't prevent default, allow natural scroll
        }
        
        target = target.parentElement;
      }

      // If we reach here and there's vertical scroll, try scrolling the main container
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        const mainContainer = document.querySelector('main.overflow-y-auto') as HTMLElement;
        if (mainContainer) {
          mainContainer.scrollBy({
            top: e.deltaY,
            behavior: 'auto', // Use 'auto' for immediate response to touchpad
          });
          e.preventDefault();
        }
      }
    };

    // Use passive: false to allow preventDefault
    window.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      window.removeEventListener('wheel', handleWheel);
      clearTimeout(scrollTimeout);
    };
  }, []);
}
