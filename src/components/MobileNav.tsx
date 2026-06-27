import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { useButuStore } from "../store/useButuStore";
import { NAV_ITEMS } from "./NavigationSidebar";

// ─── Bottom tab bar (touch / phone layout) ───────────────────────────────────
// Replaces the hover-to-expand sidebar, which can't expand under a finger.
// Thumb-reachable, icon-only (matches the minimalist sidebar), label on active.
export const MOBILE_NAV_HEIGHT = 58;

export function MobileNav() {
  const { t } = useTranslation();
  const activeSection = useButuStore((s) => s.activeSection);
  const setActiveSection = useButuStore((s) => s.setActiveSection);

  return (
    <nav
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 45,
        display: "flex",
        alignItems: "stretch",
        // Grow by the bottom inset so the home-indicator area doesn't squish the icons.
        height: `calc(${MOBILE_NAV_HEIGHT}px + env(safe-area-inset-bottom))`,
        paddingBottom: "env(safe-area-inset-bottom)",
        background: "rgba(8,10,15,0.94)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        borderTop: "1px solid rgba(153,247,255,0.08)",
      }}
    >
      {NAV_ITEMS.map((item) => {
        const isActive = activeSection === item.id;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            onClick={() => setActiveSection(item.id)}
            aria-label={t(item.i18nKey)}
            className="no-tap-highlight"
            style={{
              position: "relative",
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              padding: 0,
              border: "none",
              background: "transparent",
              color: isActive ? "#99f7ff" : "rgba(224,230,240,0.45)",
              transition: "color 0.18s ease",
            }}
          >
            {/* active top indicator */}
            {isActive && (
              <motion.span
                layoutId="mobile-nav-pill"
                style={{
                  position: "absolute",
                  top: 0,
                  width: 22,
                  height: 2.5,
                  borderRadius: 99,
                  background: "#99f7ff",
                  boxShadow: "0 0 8px 1px rgba(153,247,255,0.5)",
                }}
              />
            )}
            <span style={{ lineHeight: 0, transform: isActive ? "scale(1.04)" : "none", transition: "transform 0.18s ease" }}>
              <Icon />
            </span>
            <span
              style={{
                fontFamily: "'Manrope', sans-serif",
                fontSize: 9.5,
                fontWeight: 600,
                letterSpacing: "0.01em",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: "100%",
              }}
            >
              {t(item.i18nKey)}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
