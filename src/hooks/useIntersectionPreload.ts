// Intersection Observer-based intelligent preloading
import { useEffect, useRef, useCallback } from "react";
import type { MediaItem } from "../types";

interface PreloadOptions {
  rootMargin?: string;
  threshold?: number;
  preloadDistance?: number; // How many items ahead to preload
}

export function useIntersectionPreload(
  items: MediaItem[],
  onPreload: (items: MediaItem[]) => void,
  options: PreloadOptions = {}
) {
  const {
    rootMargin = "200px", // Start preloading 200px before visible
    threshold = 0.1,
    preloadDistance = 3, // Preload 3 items ahead
  } = options;

  const observerRef = useRef<IntersectionObserver | null>(null);
  const preloadedSet = useRef(new Set<string>());
  const visibleIndices = useRef(new Set<number>());

  const handleIntersection = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      entries.forEach((entry) => {
        const index = parseInt(entry.target.getAttribute("data-index") || "-1");
        if (index === -1) return;

        if (entry.isIntersecting) {
          visibleIndices.current.add(index);

          // Preload items ahead based on scroll direction
          const maxVisible = Math.max(...Array.from(visibleIndices.current));
          const itemsToPreload: MediaItem[] = [];

          for (let i = maxVisible + 1; i <= maxVisible + preloadDistance; i++) {
            if (i < items.length && !preloadedSet.current.has(items[i].id)) {
              itemsToPreload.push(items[i]);
              preloadedSet.current.add(items[i].id);
            }
          }

          if (itemsToPreload.length > 0) {
            onPreload(itemsToPreload);
          }
        } else {
          visibleIndices.current.delete(index);
        }
      });
    },
    [items, onPreload, preloadDistance]
  );

  useEffect(() => {
    observerRef.current = new IntersectionObserver(handleIntersection, {
      rootMargin,
      threshold,
    });

    return () => {
      observerRef.current?.disconnect();
    };
  }, [handleIntersection, rootMargin, threshold]);

  const observe = useCallback((element: HTMLElement | null, index: number) => {
    if (!element || !observerRef.current) return;
    element.setAttribute("data-index", index.toString());
    observerRef.current.observe(element);
  }, []);

  const unobserve = useCallback((element: HTMLElement | null) => {
    if (!element || !observerRef.current) return;
    observerRef.current.unobserve(element);
  }, []);

  return { observe, unobserve };
}
