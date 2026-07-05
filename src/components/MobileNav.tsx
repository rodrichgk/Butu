import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { useLibraryStore } from "../store/useLibraryStore";
import { CATEGORY_IDS, NAV_ITEMS } from "./NavigationSidebar";
import { getActiveSection, getLocalizedPath } from "../utils/routeHelpers";

// ─── Bottom tab bar (touch / phone + tablet layout) ───────────────────────────
// A tab bar works best with ≤5 destinations (Apple HIG / Material), and each tab
// must lead to a DISTINCT VIEW — not an action or a sheet. So the phone gets three
// real destinations — Home · Browse · Search — and the five content categories
// live inside the Browse destination (like Apple Music's Library tab). Settings
// sits in the top bar. The thumb zone stays uncluttered.
export const MOBILE_NAV_HEIGHT = 60;

const homeItem   = NAV_ITEMS.find((i) => i.id === "home")!;
const searchItem = NAV_ITEMS.find((i) => i.id === "search")!;

function BrowseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.8" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.8" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.8" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.8" />
    </svg>
  );
}

const PRIMARY = [
  { id: "home",   i18nKey: homeItem.i18nKey,   icon: homeItem.icon   },
  { id: "browse", i18nKey: "nav.browse",        icon: BrowseIcon      },
  { id: "search", i18nKey: searchItem.i18nKey,  icon: searchItem.icon },
];

export function MobileNav() {
  const { t } = useTranslation();
  const location = useLocation();
  const activeSection = getActiveSection(location.pathname);
  const navigate = useNavigate();
  const setActiveSection = (val: string) => navigate(getLocalizedPath(val === "home" ? "/" : `/${val}`, location.pathname.split("/").filter(Boolean)[0] === "fr" ? "fr" : "en"));

  // Browse stays selected while the user is inside one of its categories,
  // exactly like Apple Music keeps "Library" lit while you're in Albums.
  const browseSelected = activeSection === "browse" || CATEGORY_IDS.includes(activeSection);

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
        height: MOBILE_NAV_HEIGHT,
        paddingBottom: "env(safe-area-inset-bottom)",
        background: "rgba(8,10,15,0.94)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        borderTop: "1px solid rgba(153,247,255,0.08)",
      }}
    >
      {PRIMARY.map((item) => {
        const isActive = item.id === "browse" ? browseSelected : activeSection === item.id;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            onClick={() => setActiveSection(item.id)}
            aria-label={t(item.i18nKey)}
            className="mobile-nav-item no-tap-highlight"
            style={{
              position: "relative",
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              padding: 0,
              border: "none",
              background: "transparent",
              color: isActive ? "#99f7ff" : "rgba(224,230,240,0.45)",
              transition: "color 0.18s ease",
            }}
          >
            {/* active top indicator — the only selection cue we want */}
            {isActive && (
              <motion.span
                layoutId="mobile-nav-pill"
                style={{
                  position: "absolute",
                  top: 0,
                  width: 24,
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
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: "0.01em",
                whiteSpace: "nowrap",
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
