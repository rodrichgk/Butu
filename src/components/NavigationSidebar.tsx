import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useButuStore } from "../store/useButuStore";

// ─── Layout constants — single source of truth ────────────────────────────────
const CW        = 64;   // collapsed sidebar width
const EW        = 212;  // expanded sidebar width
const ITEM_H    = 48;   // spacing-12 — rhythmic D-pad cadence, every icon center 48px apart
const CIRCLE_D  = 40;   // glass backdrop circle diameter
const PILL_W    = 3;    // active indicator width
const PILL_H    = 24;   // active indicator height
const PILL_GAP  = 4;    // gap from sidebar outer-left edge

// ─── Icons (20 × 20) — uniform stroke weight 1.6 ─────────────────────────────
function HomeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9,22 9,12 15,12 15,22" />
    </svg>
  );
}

function FilmIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="2.18" />
      <line x1="7" y1="2" x2="7" y2="22" />
      <line x1="17" y1="2" x2="17" y2="22" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <line x1="2" y1="7" x2="7" y2="7" />
      <line x1="2" y1="17" x2="7" y2="17" />
      <line x1="17" y1="17" x2="22" y2="17" />
      <line x1="17" y1="7" x2="22" y2="7" />
    </svg>
  );
}

function MusicIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}

function TvIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="15" rx="2" />
      <polyline points="17,2 12,7 7,2" />
    </svg>
  );
}

function AnimeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13,2 3,14 12,14 11,22 21,10 12,10 13,2" />
    </svg>
  );
}

function MangaIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

const NAV_ITEMS = [
  { id: "home",     label: "Home",     icon: HomeIcon },
  { id: "movies",   label: "Movies",   icon: FilmIcon },
  { id: "music",    label: "Music",    icon: MusicIcon },
  { id: "tv",       label: "TV Shows", icon: TvIcon },
  { id: "anime",    label: "Anime",    icon: AnimeIcon },
  { id: "manga",    label: "Manga",    icon: MangaIcon },
  { id: "search",   label: "Search",   icon: SearchIcon },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

// ─── Hairline divider ─────────────────────────────────────────────────────────
function Hairline() {
  return (
    <div style={{
      marginLeft: 16,
      marginRight: 16,
      height: 1,
      background: "rgba(153,247,255,0.07)",
      flexShrink: 0,
    }} />
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export function NavigationSidebar() {
  const activeSection    = useButuStore((s) => s.activeSection);
  const setActiveSection = useButuStore((s) => s.setActiveSection);
  const [expanded,  setExpanded]  = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div style={{
      position: "fixed",
      left: 16,
      top: "50%",
      transform: "translateY(-50%)",
      zIndex: 40,
    }}>
      <motion.aside
        animate={{ width: expanded ? EW : CW }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        onHoverStart={() => setExpanded(true)}
        onHoverEnd={() => { setExpanded(false); setHoveredId(null); }}
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          background: "rgba(12,14,19,0.72)",
          backdropFilter: "blur(48px)",
          WebkitBackdropFilter: "blur(48px)",
          // Ghost border — single 1px declaration guarantees perfectly uniform thickness on all sides
          border: "1px solid rgba(153,247,255,0.08)",
          borderRadius: 28,
          // Outer drop shadow + inner 0.5px highlight ring
          boxShadow: "0 12px 56px rgba(0,0,0,0.60), inset 0 0 0 0.5px rgba(255,255,255,0.04)",
          overflow: "hidden",
          paddingTop: 20,
          paddingBottom: 16,
        }}
      >

        {/* ── Logo row ──────────────────────────────────────────────────────── */}
        {/* Uses the same CW-wide icon column as nav items for perfect x-alignment */}
        <div style={{ display: "flex", alignItems: "center", height: ITEM_H, flexShrink: 0 }}>
          <div style={{
            width: CW,
            height: ITEM_H,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              background: "linear-gradient(135deg, #99f7ff 0%, #00f1fe 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}>
              <span style={{
                color: "#001f24",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontWeight: 900,
                fontSize: 14,
                lineHeight: 1,
              }}>B</span>
            </div>
          </div>

          <AnimatePresence>
            {expanded && (
              <motion.span
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                style={{
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontWeight: 800,
                  fontSize: 17,
                  color: "#e0e6f0",
                  letterSpacing: "-0.02em",
                  whiteSpace: "nowrap",
                  userSelect: "none",
                }}
              >
                Butu
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {/* ── Editorial break — clear hierarchy gap below logo ──────────── */}
        <div style={{ height: 16, flexShrink: 0 }} />
        <Hairline />
        <div style={{ height: 8, flexShrink: 0 }} />

        {/* ── Nav items — strict ITEM_H rows, icon centers exactly 48px apart ─ */}
        {NAV_ITEMS.map((item) => {
          const isActive  = activeSection === item.id;
          const isHovered = hoveredId === item.id && !isActive;
          const Icon      = item.icon;

          return (
            <motion.button
              key={item.id}
              className="focusable focus:outline-none"
              data-magnetic
              data-magnetic-id={`nav-${item.id}`}
              onClick={() => setActiveSection(item.id)}
              onHoverStart={() => setHoveredId(item.id)}
              onHoverEnd={() => setHoveredId(null)}
              onFocus={() => { setHoveredId(item.id); setExpanded(true); }}
              onBlur={() => { setHoveredId(null); setExpanded(false); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  setActiveSection(item.id);
                }
              }}
              whileTap={{ scale: 0.95 }}
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                width: "100%",
                height: ITEM_H,
                padding: 0,
                margin: 0,
                border: "none",
                background: "transparent",
                cursor: "none",
                flexShrink: 0,
                outline: "none",
              }}
            >
              {/* ── Active pill ─────────────────────────────────────────────── */}
              {/* Anchored at left=PILL_GAP from the sidebar's outer left edge.   */}
              {/* top/bottom centering via top:50% + marginTop:-PILL_H/2          */}
              <AnimatePresence>
                {isActive && (
                  <motion.div
                    layoutId="nav-pill"
                    initial={{ opacity: 0, scaleY: 0.5 }}
                    animate={{ opacity: 1, scaleY: 1 }}
                    exit={{ opacity: 0, scaleY: 0.5 }}
                    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    style={{
                      position: "absolute",
                      left: PILL_GAP,
                      top: "50%",
                      marginTop: -(PILL_H / 2),
                      width: PILL_W,
                      height: PILL_H,
                      borderRadius: 99,
                      background: "#99f7ff",
                      boxShadow: "0 0 10px 3px rgba(153,247,255,0.45)",
                      zIndex: 2,
                      transformOrigin: "center",
                    }}
                  />
                )}
              </AnimatePresence>

              {/* ── Icon column — always CW wide ─────────────────────────────── */}
              {/* Fixed width means icon center stays at x = CW/2 = 32px from     */}
              {/* the sidebar left edge, regardless of expanded width.             */}
              <div style={{
                position: "relative",
                width: CW,
                height: ITEM_H,
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>
                {/* Glass circle backdrop — centered via inset:0 + margin:auto.    */}
                {/* This approach never uses transform, so Framer Motion scale      */}
                {/* animations on the circle do not cause translate conflicts.      */}
                <AnimatePresence>
                  {(isActive || isHovered) && (
                    <motion.div
                      layoutId={isActive ? "nav-circle-active" : undefined}
                      initial={{ opacity: 0, scale: 0.72 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.72 }}
                      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                      style={{
                        position: "absolute",
                        top: 0, left: 0, right: 0, bottom: 0,
                        margin: "auto",
                        width: CIRCLE_D,
                        height: CIRCLE_D,
                        borderRadius: "50%",
                        // Uniform 1px ghost border — single property, no shorthand split
                        border: `1px solid ${
                          isActive
                            ? "rgba(153,247,255,0.22)"
                            : "rgba(255,255,255,0.08)"
                        }`,
                        background: isActive
                          ? "rgba(153,247,255,0.09)"
                          : "rgba(255,255,255,0.04)",
                        boxShadow: isActive
                          ? "0 0 0 4px rgba(153,247,255,0.05), 0 0 18px 4px rgba(153,247,255,0.10)"
                          : "none",
                      }}
                    />
                  )}
                </AnimatePresence>

                {/* Icon — z-index above circle, color transition via CSS */}
                <span style={{
                  position: "relative",
                  zIndex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: isActive
                    ? "#99f7ff"
                    : isHovered
                      ? "rgba(224,230,240,0.80)"
                      : "rgba(224,230,240,0.38)",
                  transition: "color 0.18s ease",
                  lineHeight: 0,
                }}>
                  <Icon />
                </span>
              </div>

              {/* ── Label — fades in on expand ──────────────────────────────── */}
              <AnimatePresence>
                {expanded && (
                  <motion.span
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -6 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    style={{
                      fontFamily: "'Manrope', sans-serif",
                      fontSize: 13,
                      fontWeight: 500,
                      letterSpacing: "0.008em",
                      color: isActive
                        ? "#99f7ff"
                        : "rgba(224,230,240,0.50)",
                      whiteSpace: "nowrap",
                      userSelect: "none",
                    }}
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          );
        })}

        {/* ── Bottom section ───────────────────────────────────────────────── */}
        <div style={{ height: 8, flexShrink: 0 }} />
        <Hairline />

        {/* Status dot — centered in CW column, matches logo x-position */}
        <div style={{
          width: CW,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}>
          <motion.div
            style={{ width: 6, height: 6, borderRadius: "50%", background: "#99f7ff" }}
            animate={{ opacity: [0.2, 0.85, 0.2] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>

      </motion.aside>
    </div>
  );
}
