import { useEffect, useRef, useCallback } from "react";
import { useButuStore } from "../store/useButuStore";
import { isAndroid, isAndroidTV } from "../utils/tvOptimizations";

const SNAP_RADIUS    = 120;
const SMOOTHING      = 0.12;
const SNAP_SMOOTHING = 0.18;
const MOVE_THRESHOLD = 0.5; // skip store update if cursor moved less than this

// TV-specific optimizations
const TV_SMOOTHING = 0.08; // Faster response for TV remote
const TV_CACHE_DURATION = 300; // Longer cache for TV

export function useSpatialCursor() {
  const setCursor        = useButuStore((s) => s.setCursor);
  const setFocusedCardId = useButuStore((s) => s.setFocusedCardId);

  const rawPos    = useRef({ x: window.innerWidth / 2,  y: window.innerHeight / 2 });
  const smoothPos = useRef({ x: window.innerWidth / 2,  y: window.innerHeight / 2 });
  const velocity  = useRef({ x: 0, y: 0 });
  const rafId     = useRef<number>(0);
  const snappedTarget = useRef<HTMLElement | null>(null);

  // Cache snap targets — re-query at most once per 200ms, not every frame
  const snapCache     = useRef<HTMLElement[]>([]);
  const snapCacheTime = useRef(0);

  const getSnapTargets = useCallback((): HTMLElement[] => {
    const now = Date.now();
    const cacheDuration = isAndroidTV ? TV_CACHE_DURATION : 200;
    if (now - snapCacheTime.current < cacheDuration) return snapCache.current;
    snapCache.current = Array.from(document.querySelectorAll<HTMLElement>("[data-magnetic]"));
    snapCacheTime.current = now;
    return snapCache.current;
  }, []);

  const findNearestTarget = useCallback(
    (x: number, y: number) => {
      const targets = getSnapTargets();
      let nearest: { el: HTMLElement; cx: number; cy: number; dist: number } | null = null;
      for (const el of targets) {
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width  / 2;
        const cy = rect.top  + rect.height / 2;
        const dist = Math.hypot(x - cx, y - cy);
        if (dist < SNAP_RADIUS && (!nearest || dist < nearest.dist)) {
          nearest = { el, cx, cy, dist };
        }
      }
      return nearest;
    },
    [getSnapTargets]
  );

  const animate = useCallback(() => {
    const nearest = findNearestTarget(rawPos.current.x, rawPos.current.y);
    const factor = nearest ? SNAP_SMOOTHING : (isAndroidTV ? TV_SMOOTHING : SMOOTHING);

    const prevX = smoothPos.current.x;
    const prevY = smoothPos.current.y;

    let targetX = rawPos.current.x;
    let targetY = rawPos.current.y;

    if (nearest) {
      const blend = 1 - nearest.dist / SNAP_RADIUS;
      targetX = rawPos.current.x + (nearest.cx - rawPos.current.x) * blend * 0.6;
      targetY = rawPos.current.y + (nearest.cy - rawPos.current.y) * blend * 0.6;
    }

    smoothPos.current.x += (targetX - smoothPos.current.x) * factor;
    smoothPos.current.y += (targetY - smoothPos.current.y) * factor;

    const dx = smoothPos.current.x - prevX;
    const dy = smoothPos.current.y - prevY;
    velocity.current.x = dx;
    velocity.current.y = dy;

    // Only push to Zustand if cursor actually moved — avoids 60fps re-renders when idle
    if (Math.abs(dx) > MOVE_THRESHOLD || Math.abs(dy) > MOVE_THRESHOLD) {
      const isSnapped = !!nearest && nearest.dist < SNAP_RADIUS * 0.5;

      if (nearest && isSnapped) {
        if (snappedTarget.current !== nearest.el) {
          snappedTarget.current = nearest.el;
          setFocusedCardId(nearest.el.dataset.magneticId ?? null);
        }
      } else if (snappedTarget.current) {
        snappedTarget.current = null;
        setFocusedCardId(null);
      }

      setCursor({
        x: smoothPos.current.x,
        y: smoothPos.current.y,
        snapped: !!nearest && nearest.dist < SNAP_RADIUS * 0.5,
        targetId: nearest?.el.dataset.magneticId ?? null,
        velocity: { x: dx, y: dy },
      });
    }

    rafId.current = requestAnimationFrame(animate);
  }, [findNearestTarget, setCursor, setFocusedCardId]);

  useEffect(() => {
    if (isAndroid) return; // No cursor on TV

    const onMouseMove = (e: MouseEvent) => {
      rawPos.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", onMouseMove, { passive: true });
    rafId.current = requestAnimationFrame(animate);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      cancelAnimationFrame(rafId.current);
    };
  }, [animate]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { x, y } = (e as CustomEvent<{ x: number; y: number }>).detail ?? {};
      if (x != null) rawPos.current = { x, y };
    };
    window.addEventListener("spatial-coords", handler);
    return () => window.removeEventListener("spatial-coords", handler);
  }, []);

  // SELECT = focus + Enter + click
  useEffect(() => {
    const handleClick = () => {
      const el = snappedTarget.current
        ?? document.elementFromPoint(smoothPos.current.x, smoothPos.current.y);
      if (!el) return;
      const target = (el as HTMLElement).closest<HTMLElement>(
        "button, a, [tabindex], .focusable, [data-magnetic]"
      ) ?? (el as HTMLElement);
      target.focus();
      target.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      target.click();
    };
    window.addEventListener("spatial-click", handleClick);
    return () => window.removeEventListener("spatial-click", handleClick);
  }, []);

  const updateFromIMU = useCallback((x: number, y: number) => {
    rawPos.current = {
      x: Math.max(0, Math.min(window.innerWidth,  x)),
      y: Math.max(0, Math.min(window.innerHeight, y)),
    };
  }, []);

  return { updateFromIMU };
}
