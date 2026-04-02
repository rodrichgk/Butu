import { useEffect, useRef } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";
import { useButuStore } from "../store/useButuStore";

export function LiquidCursor() {
  const cursor = useButuStore((s) => s.cursor);
  const wsConnected = useButuStore((s) => s.wsConnected);

  const cursorX = useMotionValue(cursor.x);
  const cursorY = useMotionValue(cursor.y);

  const springConfig = { damping: 28, stiffness: 600, mass: 0.5 };
  const springX = useSpring(cursorX, springConfig);
  const springY = useSpring(cursorY, springConfig);

  const prevX = useRef(cursor.x);
  const prevY = useRef(cursor.y);

  useEffect(() => {
    cursorX.set(cursor.x);
    cursorY.set(cursor.y);
    prevX.current = cursor.x;
    prevY.current = cursor.y;
  }, [cursor.x, cursor.y, cursorX, cursorY]);

  const speed = Math.hypot(cursor.velocity.x, cursor.velocity.y);
  const stretchX = cursor.snapped ? 1 : Math.min(1 + speed * 0.04, 1.4);
  const stretchY = cursor.snapped ? 1 : Math.max(1 - speed * 0.015, 0.7);

  const dotSize = cursor.snapped ? 48 : 20;

  return (
    <>
      <motion.div
        className="liquid-cursor"
        style={{
          x: springX,
          y: springY,
          translateX: "-50%",
          translateY: "-50%",
          width: dotSize,
          height: dotSize,
          scaleX: stretchX,
          scaleY: stretchY,
          borderRadius: "50%",
          background: cursor.snapped
            ? "radial-gradient(circle, rgba(153,247,255,0.95) 0%, rgba(0,241,254,0.6) 50%, transparent 100%)"
            : "radial-gradient(circle, rgba(153,247,255,0.9) 0%, rgba(153,247,255,0.4) 60%, transparent 100%)",
          boxShadow: cursor.snapped
            ? "0 0 60px 20px rgba(153,247,255,0.35), 0 0 120px 40px rgba(153,247,255,0.12)"
            : "0 0 20px 6px rgba(153,247,255,0.2)",
        }}
        animate={{
          width: dotSize,
          height: dotSize,
        }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      />

      <motion.div
        className="liquid-cursor"
        style={{
          x: springX,
          y: springY,
          translateX: "-50%",
          translateY: "-50%",
          width: cursor.snapped ? 80 : 40,
          height: cursor.snapped ? 80 : 40,
          borderRadius: "50%",
          border: `1px solid rgba(153,247,255,${cursor.snapped ? 0.3 : 0.12})`,
          background: "transparent",
          pointerEvents: "none",
        }}
        animate={{
          width: cursor.snapped ? 80 : 40,
          height: cursor.snapped ? 80 : 40,
          opacity: cursor.snapped ? 1 : 0.5,
        }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      />

      {wsConnected && (
        <div className="fixed bottom-8 right-8 z-50 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="font-mono-tech text-primary text-[10px] opacity-60">
            AIR MOUSE
          </span>
        </div>
      )}
    </>
  );
}
