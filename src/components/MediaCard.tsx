import { useState } from "react";
import { motion } from "framer-motion";
import type { MediaItem } from "../types";
import { useButuStore } from "../store/useButuStore";

interface MediaCardProps {
  item: MediaItem;
  size?: "standard" | "double-wide" | "featured";
  onSelect: (item: MediaItem) => void;
}

function getCardClass(type: MediaItem["type"]): string {
  switch (type) {
    case "movie":
    case "anime":
    case "manga":
      return "card-poster";
    case "music":
      return "card-album";
    case "tv":
    case "web":
      return "card-wide";
    default:
      return "card-poster";
  }
}

function getCardWidth(type: MediaItem["type"]): string {
  switch (type) {
    case "movie":
    case "anime":
    case "manga":
      return "w-52";
    case "music":
      return "w-52";
    case "tv":
    case "web":
      return "w-80";
    default:
      return "w-52";
  }
}

function CodecBadge({ codec }: { codec: string }) {
  return (
    <span
      className="font-mono-tech text-[10px] px-2 py-0.5 rounded"
      style={{
        background: "rgba(153,247,255,0.08)",
        color: "#99f7ff",
        border: "1px solid rgba(153,247,255,0.12)",
      }}
    >
      {codec}
    </span>
  );
}

export function MediaCard({ item, size = "standard", onSelect }: MediaCardProps) {
  const [hovered, setHovered] = useState(false);
  const focusedCardId = useButuStore((s) => s.focusedCardId);
  const isMagneticFocused = focusedCardId === item.id;
  const isFocused = hovered || isMagneticFocused;

  const cardClass = getCardClass(item.type);
  const widthClass = getCardWidth(item.type);

  return (
    <motion.div
      className={`relative flex-shrink-0 ${widthClass} ${cardClass} group`}
      data-magnetic
      data-magnetic-id={item.id}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      onClick={() => onSelect(item)}
      animate={{
        scale: isFocused ? 1.02 : 1,
      }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      style={{
        cursor: "none",
        boxShadow: isFocused
          ? `0 0 0 1px rgba(153,247,255,0.25), 0 0 60px 12px rgba(153,247,255,0.15), 0 30px 60px rgba(0,0,0,0.6)`
          : "0 8px 32px rgba(0,0,0,0.4)",
        transition: "box-shadow 0.3s ease",
      }}
    >
      <div className="absolute inset-0 overflow-hidden rounded-lg">
        <motion.img
          src={item.thumbnail}
          alt={item.title}
          className="w-full h-full object-cover"
          animate={{ scale: isFocused ? 1.08 : 1 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          loading="lazy"
          onError={(e) => {
            (e.target as HTMLImageElement).src =
              `https://picsum.photos/seed/${item.id}/400/600`;
          }}
        />

        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 50%, transparent 100%)",
            opacity: isFocused ? 1 : 0.4,
            transition: "opacity 0.3s ease",
          }}
        />

        {item.ambientColor && isFocused && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `radial-gradient(ellipse at center bottom, ${item.ambientColor}30 0%, transparent 70%)`,
            }}
          />
        )}
      </div>

      <motion.div
        className="absolute bottom-0 left-0 right-0 p-4"
        animate={{ opacity: isFocused ? 1 : 0, y: isFocused ? 0 : 8 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
      >
        <p
          className="font-display font-bold text-white leading-tight mb-1 line-clamp-2"
          style={{ fontSize: "0.9rem" }}
        >
          {item.title}
        </p>

        <div className="flex items-center gap-2 flex-wrap mt-1">
          {item.year && (
            <span className="font-mono-tech text-on_surface_variant text-[10px]">
              {item.year}
            </span>
          )}
          {item.codec && <CodecBadge codec={item.codec} />}
          {item.artist && (
            <span className="font-body text-on_surface_variant text-[11px] truncate">
              {item.artist}
            </span>
          )}
          {item.season && item.episode && (
            <span className="font-mono-tech text-on_surface_variant text-[10px]">
              S{item.season}·E{item.episode}
            </span>
          )}
        </div>

        <motion.button
          className="mt-3 flex items-center justify-center w-10 h-10 rounded-full"
          style={{
            background: "rgba(153,247,255,0.15)",
            border: "1px solid rgba(153,247,255,0.2)",
            backdropFilter: "blur(10px)",
          }}
          whileHover={{ scale: 1.1, background: "rgba(153,247,255,0.25)" }}
          whileTap={{ scale: 0.93 }}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(item);
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="#99f7ff"
          >
            <polygon points="5,3 19,12 5,21" />
          </svg>
        </motion.button>
      </motion.div>

      {isFocused && (
        <div
          className="absolute inset-0 rounded-lg pointer-events-none"
          style={{
            border: "1px solid rgba(153,247,255,0.25)",
            borderRadius: "2rem",
          }}
        />
      )}
    </motion.div>
  );
}
