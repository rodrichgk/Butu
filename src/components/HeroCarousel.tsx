import { useState, useEffect, useCallback, useRef, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useButuStore } from "../store/useButuStore";
import type { MediaItem } from "../types";

interface HeroCarouselProps {
  items: MediaItem[];
  onSelect: (item: MediaItem) => void;
}

// ─── Upfront image pre-warm ───────────────────────────────────────────────────
// Fire all hero image loads immediately at module init time so the browser
// has maximum lead time before the first slide swap.
function preloadImages(urls: string[]) {
  urls.forEach((url) => {
    if (!url) return;
    const img = new Image();
    img.decoding = "async";
    img.src = url;
  });
}

// ─── Helpers (stable, never re-created) ──────────────────────────────────────
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// memo: StarRating never changes unless `rating` changes
const StarRating = memo(function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="#99f7ff">
        <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
      </svg>
      <span className="font-mono-tech text-primary text-sm">{rating.toFixed(1)}</span>
    </div>
  );
});

// ─── Animation variants ───────────────────────────────────────────────────────
// NO scale — scaling a 100vw element forces expensive texture re-uploads on TV.
// NO x translate on background — pure opacity crossfade is cheapest on GPU.
// Metadata gets a subtle y-lift for cinematic feel at negligible cost.
const bgVariants = {
  enter:  { opacity: 0 },
  center: { opacity: 1 },
  exit:   { opacity: 0 },
} as const;

const metaVariants = {
  enter:  { opacity: 0, y: 24 },
  center: { opacity: 1, y: 0 },
  exit:   { opacity: 0, y: -12 },
} as const;

// ─── Component ────────────────────────────────────────────────────────────────
export function HeroCarousel({ items, onSelect }: HeroCarouselProps) {
  const [activeIdx, setActiveIdx] = useState(0);
  const setPlayer    = useButuStore((s) => s.setPlayer);
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const preloadedRef = useRef(false);

  // Pre-warm all slide images on first mount — fires once, fills browser cache
  useEffect(() => {
    if (preloadedRef.current) return;
    preloadedRef.current = true;
    preloadImages(items.map((i) => i.backdropUrl ?? i.thumbnail));
  }, [items]);

  // Stable timer — does not re-create on every activeIdx change
  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % items.length);
    }, 8000);
  }, [items.length]);

  useEffect(() => {
    startTimer();
    // Pause when tab/app is hidden — no wasted renders on a dark TV screen
    const onVisibility = () => {
      if (document.hidden) {
        if (timerRef.current) clearInterval(timerRef.current);
      } else {
        startTimer();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [startTimer]);

  const goTo = useCallback((idx: number) => {
    setActiveIdx(idx);
    startTimer(); // reset timer on manual navigation
  }, [startTimer]);

  const current = items[activeIdx];

  return (
    // contain: layout style paint — tells the browser this subtree cannot
    // affect anything outside, enabling aggressive paint scope reduction
    <div
      className="relative w-full h-full overflow-hidden"
      style={{ contain: "layout style paint" }}
    >

      {/* ── Background layer ─────────────────────────────────────────────── */}
      {/* mode="wait": only ONE slide rendered at a time — halves GPU memory  */}
      {/* usage vs mode="sync" during transitions.                            */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`bg-${current.id}`}
          variants={bgVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.45, ease: "easeInOut" }}
          className="absolute inset-0"
          style={{ willChange: "opacity" }}
        >
          {/* <img> instead of background-image: benefits from the browser's     */}
          {/* dedicated image decode thread + fetchpriority hint.               */}
          {/* transform:translateZ(0) promotes to its own GPU compositor layer  */}
          {/* so the browser never has to software-rasterize this element.      */}
          <img
            src={current.backdropUrl ?? current.thumbnail}
            alt=""
            decoding="async"
            fetchPriority="high"
            className="absolute inset-0 w-full h-full"
            style={{
              objectFit: "cover",
              objectPosition: "center top",
              transform: "translateZ(0)",
            }}
          />

          {/* Dark veil — a plain rgba div is GPU-composited at zero CPU cost.  */}
          {/* Replaces filter:brightness(0.65) which triggers a software        */}
          {/* rasterization pass on most TV browser implementations.            */}
          <div
            className="absolute inset-0"
            style={{ background: "rgba(0,0,0,0.40)" }}
          />

          {/* Single combined gradient div — 3 separate painted layers merged   */}
          {/* into one CSS multi-stop background. Reduces paint calls by 2/3.   */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(to top,  rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 22%, rgba(0,0,0,0.3) 52%, transparent 80%), " +
                "linear-gradient(to right, rgba(12,14,19,1) 0%, rgba(12,14,19,0.88) 28%, rgba(12,14,19,0.48) 50%, transparent 80%)",
            }}
          />

          {/* Per-slide ambient glow — kept separate because it changes per slide */}
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(ellipse at 18% 82%, ${current.ambientColor ?? "#99f7ff"}1c 0%, transparent 52%)`,
            }}
          />
        </motion.div>
      </AnimatePresence>

      {/* ── Metadata layer ────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`meta-${current.id}`}
          variants={metaVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
          className="absolute bottom-0 left-0 pb-16 pl-20 pr-12 max-w-3xl"
          style={{ willChange: "transform, opacity" }}
        >
          <div className="flex items-center gap-3 mb-4">
            {current.genre?.slice(0, 2).map((g) => (
              <span
                key={g}
                className="font-mono-tech text-[11px] px-3 py-1 rounded-full"
                style={{
                  background: "rgba(153,247,255,0.10)",
                  color: "#99f7ff",
                  border: "1px solid rgba(153,247,255,0.15)",
                }}
              >
                {g.toUpperCase()}
              </span>
            ))}
          </div>

          <h1
            className="font-display font-black leading-none mb-4"
            style={{ fontSize: "clamp(2.5rem, 5vw, 4.5rem)", color: "#ffffff" }}
          >
            {current.title}
          </h1>

          <div className="flex items-center gap-5 mb-5">
            {current.rating   && <StarRating rating={current.rating} />}
            {current.year     && (
              <span className="font-mono-tech text-on_surface_variant text-sm">
                {current.year}
              </span>
            )}
            {current.duration && (
              <span className="font-mono-tech text-on_surface_variant text-sm">
                {formatDuration(current.duration)}
              </span>
            )}
            {current.resolution && (
              <span
                className="font-mono-tech text-xs px-2 py-0.5 rounded"
                style={{ background: "rgba(153,247,255,0.08)", color: "#99f7ff" }}
              >
                {current.resolution}
              </span>
            )}
          </div>

          <p className="font-body text-on_surface_variant text-lg leading-relaxed mb-8 max-w-xl line-clamp-2">
            {current.description}
          </p>

          <div className="flex items-center gap-4">
            <motion.button
              data-magnetic
              data-magnetic-id={`hero-play-${current.id}`}
              onClick={() => {
                setPlayer({ currentMedia: current, isPlaying: true });
                onSelect(current);
              }}
              className="focusable flex items-center gap-3 px-8 py-4 rounded-full font-display font-bold text-base focus:outline-none focus:ring-4 focus:ring-primary/40 focus:scale-[1.04]"
              style={{
                background: "linear-gradient(135deg, #99f7ff 0%, #00f1fe 100%)",
                color: "#001f24",
              }}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.15 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5,3 19,12 5,21" />
              </svg>
              Play Now
            </motion.button>

            {/* backdropFilter removed — each blur filter is a separate GPU     */}
            {/* texture sample. Replaced with a slightly opaque solid fill.     */}
            <motion.button
              data-magnetic
              data-magnetic-id={`hero-info-${current.id}`}
              className="focusable flex items-center gap-3 px-8 py-4 rounded-full font-display font-bold text-base focus:outline-none focus:ring-4 focus:ring-white/20 focus:scale-[1.04]"
              style={{
                background: "rgba(224,230,240,0.11)",
                color: "#e0e6f0",
                border: "1px solid rgba(224,230,240,0.14)",
              }}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.15 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              More Info
            </motion.button>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* ── Slide indicators ──────────────────────────────────────────────── */}
      <div className="absolute bottom-8 right-20 flex items-center gap-2">
        {items.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            style={{
              width: i === activeIdx ? 24 : 6,
              height: 6,
              borderRadius: 3,
              background: i === activeIdx ? "#99f7ff" : "rgba(224,230,240,0.25)",
              border: "none",
              padding: 0,
              cursor: "none",
              transition: "width 0.3s cubic-bezier(0.16,1,0.3,1), background 0.3s ease",
            }}
          />
        ))}
      </div>
    </div>
  );
}
