import { useEffect, useState } from "react";

// Phone-width breakpoint. Matches Tailwind's `md` (768px) so the JS layout
// switch and the CSS `md:` utilities flip at the same width.
const PHONE_QUERY = "(max-width: 767px)";

// Touch/compact layout: any coarse-pointer device (phone, tablet, touch laptop)
// OR a viewport narrower than Tailwind's `lg` (1024px). Drives the bottom-nav +
// mobile top bar layout. A wider desktop window with a mouse keeps the sidebar.
const TOUCH_QUERY = "(max-width: 1023px), (pointer: coarse)";

/** Reactive boolean for an arbitrary media query (updates on resize / rotate). */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener("change", onChange);
    onChange();
    return () => mq.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** Reactive: true on phone-width viewports (≤767px). Phone-only tweaks. */
export function useIsMobile(): boolean {
  return useMediaQuery(PHONE_QUERY);
}

/**
 * Reactive: true when the app should use the touch-first layout — bottom nav +
 * mobile top bar instead of the hover sidebar. Covers phones AND tablets (and
 * any coarse-pointer device), so a finger never has to drive the hover sidebar.
 */
export function useTouchLayout(): boolean {
  return useMediaQuery(TOUCH_QUERY);
}
