import { useTranslation } from "react-i18next";
import { useButuStore } from "../store/useButuStore";
import { NAV_ITEMS } from "./NavigationSidebar";

// ─── Top app bar (touch / phone + tablet layout) ─────────────────────────────
// The hover sidebar is gone on touch, so this gives back the two things it
// provided: brand presence + "where am I". A search shortcut lives on the right
// since search is otherwise buried in the bottom nav.
export const MOBILE_TOPBAR_HEIGHT = 56;

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export function MobileTopBar() {
  const { t } = useTranslation();
  const activeSection = useButuStore((s) => s.activeSection);
  const setActiveSection = useButuStore((s) => s.setActiveSection);

  const current = NAV_ITEMS.find((i) => i.id === activeSection);
  const title = current ? t(current.i18nKey) : "Butu";
  const isSearch = activeSection === "search";

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 30,
        display: "flex",
        alignItems: "center",
        gap: 12,
        // Grow by the top inset so notched phones (standalone PWA) don't squish the bar.
        height: `calc(${MOBILE_TOPBAR_HEIGHT}px + env(safe-area-inset-top))`,
        paddingTop: "env(safe-area-inset-top)",
        paddingLeft: "max(16px, env(safe-area-inset-left))",
        paddingRight: "max(12px, env(safe-area-inset-right))",
        background: "rgba(6,8,13,0.82)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        borderBottom: "1px solid rgba(153,247,255,0.06)",
      }}
    >
      {/* Brand mark — matches the sidebar's gradient "B" */}
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: 9,
          flexShrink: 0,
          background: "linear-gradient(135deg, #99f7ff 0%, #00f1fe 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ color: "#001f24", fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 900, fontSize: 14, lineHeight: 1 }}>
          B
        </span>
      </div>

      {/* Current section title */}
      <h1
        style={{
          flex: 1,
          minWidth: 0,
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontWeight: 800,
          fontSize: 19,
          letterSpacing: "-0.02em",
          color: "#e0e6f0",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {title}
      </h1>

      {/* Search shortcut */}
      <button
        onClick={() => setActiveSection("search")}
        aria-label={t("nav.search")}
        className="no-tap-highlight"
        style={{
          flexShrink: 0,
          width: 40,
          height: 40,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid " + (isSearch ? "rgba(153,247,255,0.3)" : "rgba(255,255,255,0.08)"),
          background: isSearch ? "rgba(153,247,255,0.1)" : "rgba(255,255,255,0.04)",
          color: isSearch ? "#99f7ff" : "rgba(224,230,240,0.7)",
          transition: "color 0.18s ease, background 0.18s ease",
        }}
      >
        <SearchIcon />
      </button>
    </header>
  );
}
