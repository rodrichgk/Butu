import { memo, useState } from "react";
import { motion } from "framer-motion";
import type { MediaItem } from "../types";
import { reducedMotion } from "../utils/platform";

interface MediaCardProps {
  item: MediaItem;
  size?: "standard" | "double-wide" | "featured";
  onSelect: (item: MediaItem) => void;
}

function getCardClass(type: MediaItem["type"]): string {
  switch (type) {
    case "movie": case "anime": case "manga": return "card-poster";
    case "music":                             return "card-album";
    case "tv":    case "web":                 return "card-wide";
    default:                                  return "card-poster";
  }
}

// Responsive widths so phones show ~2.3 cards, tablets more, desktop/TV unchanged.
function getCardWidth(type: MediaItem["type"]): string {
  switch (type) {
    case "movie": case "anime": case "manga": case "music":
      return "w-32 sm:w-40 md:w-44 lg:w-52";   // 128 → 208px
    case "tv":    case "web":
      return "w-56 sm:w-64 md:w-72 lg:w-80";    // 224 → 320px
    default:
      return "w-32 sm:w-40 md:w-44 lg:w-52";
  }
}

function CodecBadge({ codec }: { codec: string }) {
  return (
    <span className="font-mono-tech text-[10px] px-2 py-0.5 rounded"
      style={{ background: "rgba(153,247,255,0.08)", color: "#99f7ff", border: "1px solid rgba(153,247,255,0.12)" }}>
      {codec}
    </span>
  );
}

// memo — card only re-renders if its own item or onSelect reference changes.
// No Zustand subscription — focus state is handled purely via CSS :focus / :hover.
export const MediaCard = memo(function MediaCard({ item, onSelect }: MediaCardProps) {
  const cardClass  = getCardClass(item.type);
  const widthClass = getCardWidth(item.type);
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <motion.button
      className={`relative flex-shrink-0 ${widthClass} ${cardClass} group focusable`}
      data-magnetic
      data-magnetic-id={item.id}
      tabIndex={0}
      onClick={() => onSelect(item)}
      onKeyDown={(e) => { 
        if (e.key === "Enter" || e.key === " ") { 
          e.preventDefault(); 
          onSelect(item); 
        } 
      }}
      whileFocus={reducedMotion ? undefined : { scale: 1.05 }}
      whileHover={reducedMotion ? undefined : { scale: 1.02 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      style={{ 
        cursor: "none", 
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)", 
        border: "none",
        background: "transparent",
        padding: 0,
      }}
    >
      <div className="absolute inset-0 overflow-hidden rounded-[14px] sm:rounded-[18px] lg:rounded-[2rem]">
        {item.thumbnail && !imgFailed ? (
          <img
            src={item.thumbnail}
            alt={item.title}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
            // On a failed load (common on mobile/flaky networks) show a neutral branded
            // placeholder — NOT a random stock photo, which made cards look like the wrong title.
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center px-3 text-center"
            style={{ background: "linear-gradient(160deg, #161a26 0%, #0c0e13 100%)" }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="rgba(153,247,255,0.4)" strokeWidth="1.4">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M3 9h18M8 4v5M16 4v5" />
            </svg>
            <span className="font-display font-semibold mt-2 line-clamp-3" style={{ fontSize: "0.8rem", color: "rgba(224,230,240,0.7)" }}>
              {item.title}
            </span>
          </div>
        )}
        <div className="card-scrim absolute inset-0 transition-opacity duration-300 opacity-40 group-hover:opacity-100 group-focus:opacity-100"
          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 50%, transparent 100%)" }} />
      </div>

      <div className="card-info absolute bottom-0 left-0 right-0 p-2.5 sm:p-3 lg:p-4 opacity-0 translate-y-2 transition-all duration-200 group-hover:opacity-100 group-hover:translate-y-0 group-focus:opacity-100 group-focus:translate-y-0">
        <p className="font-display font-bold text-white leading-tight mb-1 line-clamp-2" style={{ fontSize: "0.9rem" }}>
          {item.title}
        </p>
        <div className="flex items-center gap-2 flex-wrap mt-1">
          {item.year   && <span className="font-mono-tech text-on_surface_variant text-[10px]">{item.year}</span>}
          {item.codec  && <CodecBadge codec={item.codec} />}
          {item.artist && <span className="font-body text-on_surface_variant text-[11px] truncate">{item.artist}</span>}
          {item.season && item.episode && (
            <span className="font-mono-tech text-on_surface_variant text-[10px]">S{item.season}·E{item.episode}</span>
          )}
        </div>
      </div>

      <div className="absolute inset-0 rounded-[14px] sm:rounded-[18px] lg:rounded-[2rem] pointer-events-none opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity duration-200"
        style={{ border: "1px solid rgba(153,247,255,0.25)" }} />
    </motion.button>
  );
});
