import { useTranslation } from "react-i18next";
import { useButuStore } from "../store/useButuStore";
import { NAV_ITEMS, CATEGORY_IDS } from "./NavigationSidebar";

// ─── Top app bar (touch / phone + tablet layout) ─────────────────────────────
// The hover sidebar is gone on touch, so this gives back the two things it
// provided: brand presence + "where am I". A search shortcut lives on the right
// since search is otherwise buried in the bottom nav.
export const MOBILE_TOPBAR_HEIGHT = 56;

function BackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export function MobileTopBar() {
  const { t } = useTranslation();
  const activeSection = useButuStore((s) => s.activeSection);
  const setActiveSection = useButuStore((s) => s.setActiveSection);

  const current = NAV_ITEMS.find((i) => i.id === activeSection);
  // Inside a Browse category we're one level deep — show a back chevron (← Browse).
  const isCategory = CATEGORY_IDS.includes(activeSection);
  const title =
    activeSection === "browse" ? t("nav.browse") : current ? t(current.i18nKey) : "Butu";
  const isSettings = activeSection === "settings";

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
      {/* Left slot: back chevron when drilled into a category, else the brand mark */}
      {isCategory ? (
        <button
          onClick={() => setActiveSection("browse")}
          aria-label={t("detail.back")}
          className="mobile-nav-item no-tap-highlight"
          style={{
            flexShrink: 0,
            width: 40,
            height: 40,
            marginLeft: -8,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "none",
            background: "transparent",
            color: "#99f7ff",
          }}
        >
          <BackIcon />
        </button>
      ) : (
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
      )}

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

      {/* Settings shortcut (search lives in the bottom nav) */}
      <button
        onClick={() => setActiveSection("settings")}
        aria-label={t("nav.settings")}
        className="mobile-nav-item no-tap-highlight"
        style={{
          flexShrink: 0,
          width: 40,
          height: 40,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid " + (isSettings ? "rgba(153,247,255,0.3)" : "rgba(255,255,255,0.08)"),
          background: isSettings ? "rgba(153,247,255,0.1)" : "rgba(255,255,255,0.04)",
          color: isSettings ? "#99f7ff" : "rgba(224,230,240,0.7)",
          transition: "color 0.18s ease, background 0.18s ease",
        }}
      >
        <SettingsIcon />
      </button>
    </header>
  );
}
