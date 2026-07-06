import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useLibraryStore } from "../../store/useLibraryStore";
import { useLibraryQuery } from "../../hooks/useLibraryQuery";
import { CATEGORY_ITEMS } from "../NavigationSidebar";

// Maps a Browse category id to the MediaItem.type it groups.
const BROWSE_TYPE: Record<string, string> = {
  movies: "movie", tv: "tv", anime: "anime", manga: "manga", music: "music",
};

// Browse is a real destination (Apple Music "Library" pattern): a grid of the
// content categories you drill into — never a tab that opens a sheet.
export default function BrowseView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setActiveSection = (val: string) => navigate(val === "home" ? "/my-media" : `/${val}`);
  const { data: library = [] } = useLibraryQuery();

  const countFor = (id: string) => library.filter((i) => i.type === BROWSE_TYPE[id]).length;
  // Don't surface empty categories as dead-ends — but if nothing has loaded yet,
  // fall back to showing all so the page is never blank.
  const nonEmpty = CATEGORY_ITEMS.filter((c) => countFor(c.id) > 0);
  const shown = nonEmpty.length ? nonEmpty : CATEGORY_ITEMS;

  return (
    <div className="px-4 sm:px-8 lg:px-20 pt-10">
      <h1 className="font-display font-black text-on_surface mb-8" style={{ fontSize: "clamp(2rem, 3.5vw, 3rem)" }}>
        {t("nav.browse")}
      </h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4" style={{ maxWidth: 900 }}>
        {shown.map((item) => {
          const count = countFor(item.id);
          const Icon  = item.icon;
          return (
            <motion.button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className="focusable text-left rounded-2xl p-5 flex flex-col gap-4"
              data-magnetic
              data-magnetic-id={`browse-${item.id}`}
              style={{ background: "rgba(22,26,38,0.7)", border: "1px solid rgba(46,52,71,0.3)", cursor: "none" }}
              whileHover={{ background: "rgba(30,35,48,0.9)", borderColor: "rgba(153,247,255,0.18)", scale: 1.02 }}
              whileFocus={{ background: "rgba(30,35,48,0.9)", borderColor: "rgba(153,247,255,0.18)", scale: 1.03 }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.2 }}
            >
              <span style={{
                width: 48, height: 48, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center",
                color: "#99f7ff", background: "rgba(153,247,255,0.08)", border: "1px solid rgba(153,247,255,0.16)",
              }}>
                <Icon />
              </span>
              <div>
                <p className="font-display font-bold text-on_surface" style={{ fontSize: "1.05rem" }}>{t(item.i18nKey)}</p>
                <p className="font-mono-tech text-on_surface_variant text-xs mt-0.5">
                  {count} {count === 1 ? "TITLE" : "TITLES"}
                </p>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
