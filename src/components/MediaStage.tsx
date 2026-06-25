import { useRef } from "react";
import { motion } from "framer-motion";
import { MediaCard } from "./MediaCard";
import type { MediaItem } from "../types";
import { reducedMotion } from "../utils/platform";

// On Android we avoid all framer-motion wrapper overhead per card
const CardWrapper = reducedMotion
  ? ({ children }: { children: React.ReactNode }) => <div>{children}</div>
  : ({ children, i }: { children: React.ReactNode; i: number }) => (
      <motion.div
        className="media-stage-item"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </motion.div>
    );

interface MediaStageProps {
  title: string;
  items: MediaItem[];
  onSelect: (item: MediaItem) => void;
  featured?: boolean;
  metaLabel?: string;
}

export function MediaStage({ title, items, onSelect, featured = false, metaLabel }: MediaStageProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const amount = scrollRef.current.clientWidth * 0.6;
    scrollRef.current.scrollBy({
      left: direction === "right" ? amount : -amount,
      behavior: "smooth",
    });
  };

  return (
    <motion.section
      className="mb-16"
      initial={reducedMotion ? false : { opacity: 0, y: 24 }}
      animate={reducedMotion ? false : { opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="flex items-end justify-between px-20 mb-0">
        <div>
          <h2
            className="font-display font-bold text-on_surface"
            style={{ fontSize: "clamp(1.25rem, 2vw, 1.75rem)" }}
          >
            {title}
          </h2>
          {metaLabel && (
            <span className="font-mono-tech text-on_surface_variant text-xs mt-1 block">
              {metaLabel}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <motion.button
            onClick={() => scroll("left")}
            className="focusable w-10 h-10 rounded-full flex items-center justify-center"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                scroll("left");
              }
            }}
            style={{
              background: "rgba(22,26,38,0.8)",
              border: "1px solid rgba(46,52,71,0.4)",
              cursor: "none",
              color: "#9aa3b4",
            }}
            whileHover={{ scale: 1.08, color: "#99f7ff", borderColor: "rgba(153,247,255,0.3)" }}
            whileFocus={{ scale: 1.08, color: "#99f7ff", borderColor: "rgba(153,247,255,0.3)" }}
            whileTap={{ scale: 0.95 }}
            transition={{ duration: 0.15 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15,18 9,12 15,6" />
            </svg>
          </motion.button>
          <motion.button
            onClick={() => scroll("right")}
            className="focusable w-10 h-10 rounded-full flex items-center justify-center"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                scroll("right");
              }
            }}
            style={{
              background: "rgba(22,26,38,0.8)",
              border: "1px solid rgba(46,52,71,0.4)",
              cursor: "none",
              color: "#9aa3b4",
            }}
            whileHover={{ scale: 1.08, color: "#99f7ff", borderColor: "rgba(153,247,255,0.3)" }}
            whileFocus={{ scale: 1.08, color: "#99f7ff", borderColor: "rgba(153,247,255,0.3)" }}
            whileTap={{ scale: 0.95 }}
            transition={{ duration: 0.15 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9,18 15,12 9,6" />
            </svg>
          </motion.button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-5 px-20 overflow-x-auto scrollbar-hide media-stage-scroll py-8"
        style={{ scrollPaddingLeft: "5rem" }}
      >
        {items.map((item, i) => (
          <CardWrapper key={item.id} i={i}>
            <MediaCard
              item={item}
              size="standard"
              onSelect={onSelect}
            />
          </CardWrapper>
        ))}
      </div>
    </motion.section>
  );
}
