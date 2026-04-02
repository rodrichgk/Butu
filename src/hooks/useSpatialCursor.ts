import { useEffect, useRef, useCallback } from "react";
import { useButuStore } from "../store/useButuStore";

const SNAP_RADIUS = 120;
const SMOOTHING = 0.12;
const SNAP_SMOOTHING = 0.18;

export function useSpatialCursor() {
  const setCursor = useButuStore((s) => s.setCursor);
  const setFocusedCardId = useButuStore((s) => s.setFocusedCardId);

  const rawPos = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const smoothPos = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const velocity = useRef({ x: 0, y: 0 });
  const rafId = useRef<number>(0);
  const snappedTarget = useRef<HTMLElement | null>(null);

  const getSnapTargets = useCallback((): HTMLElement[] => {
    return Array.from(document.querySelectorAll<HTMLElement>("[data-magnetic]"));
  }, []);

  const findNearestTarget = useCallback(
    (x: number, y: number): { el: HTMLElement; cx: number; cy: number; dist: number } | null => {
      const targets = getSnapTargets();
      let nearest: { el: HTMLElement; cx: number; cy: number; dist: number } | null = null;

      for (const el of targets) {
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
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
    const factor = nearest ? SNAP_SMOOTHING : SMOOTHING;

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

    velocity.current.x = smoothPos.current.x - prevX;
    velocity.current.y = smoothPos.current.y - prevY;

    const isSnapped = !!nearest && nearest.dist < SNAP_RADIUS * 0.5;

    if (nearest && isSnapped) {
      if (snappedTarget.current !== nearest.el) {
        snappedTarget.current = nearest.el;
        setFocusedCardId(nearest.el.dataset.magneticId ?? null);
      }
    } else {
      if (snappedTarget.current) {
        snappedTarget.current = null;
        setFocusedCardId(null);
      }
    }

    setCursor({
      x: smoothPos.current.x,
      y: smoothPos.current.y,
      snapped: isSnapped,
      targetId: nearest?.el.dataset.magneticId ?? null,
      velocity: { ...velocity.current },
    });

    rafId.current = requestAnimationFrame(animate);
  }, [findNearestTarget, setCursor, setFocusedCardId]);

  useEffect(() => {
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

  const updateFromIMU = useCallback((x: number, y: number) => {
    rawPos.current = {
      x: Math.max(0, Math.min(window.innerWidth, x)),
      y: Math.max(0, Math.min(window.innerHeight, y)),
    };
  }, []);

  return { updateFromIMU };
}
