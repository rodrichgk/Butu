import { useEffect, useState } from "react";

// Phone-width breakpoint. Matches Tailwind's `md` (768px) so the JS layout
// switch and the CSS `md:` utilities flip at the same width.
const QUERY = "(max-width: 767px)";

/** Reactive: true on phone-width viewports (and updates on resize / rotate). */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia(QUERY).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener("change", onChange);
    onChange();
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
