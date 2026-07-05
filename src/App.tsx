import { useState, useCallback, useEffect, useRef, useMemo, lazy, Suspense, type ReactNode, type CSSProperties } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { LiquidCursor } from "./components/LiquidCursor";
import { NavigationSidebar, CATEGORY_IDS, CATEGORY_ITEMS } from "./components/NavigationSidebar";
import { HeroCarousel } from "./components/HeroCarousel";
import { MediaStage } from "./components/MediaStage";
import { MobileNav, MOBILE_NAV_HEIGHT } from "./components/MobileNav";
import { UpdateBanner } from "./components/UpdateBanner";
import { MobileTopBar } from "./components/MobileTopBar";
import { useTouchLayout } from "./hooks/useIsMobile";
const ButuPlayer = lazy(() => import("./components/ButuPlayer").then(m => ({ default: m.ButuPlayer })));
const ContentDetailPage = lazy(() => import("./components/ContentDetailPage").then(m => ({ default: m.ContentDetailPage })));
const MediaSetup = lazy(() => import("./components/MediaSetup").then(m => ({ default: m.MediaSetup })));
const Landing = lazy(() => import("./components/Landing").then(m => ({ default: m.Landing })));
import { SplashScreen } from "./components/SplashScreen";

import { usePlatformBridge, PlatformContext } from "./hooks/usePlatformBridge";
import { QRCodeSVG } from "qrcode.react";
import { useSpatialCursor } from "./hooks/useSpatialCursor";
import { useSpatialNavigation } from "./hooks/useSpatialNavigation";
import { useTouchpadScroll } from "./hooks/useTouchpadScroll";
import { useConfigStore } from "./store/useConfigStore";
import { useLibraryStore } from "./store/useLibraryStore";
import { Routes, Route, useLocation, useNavigate, Navigate, useSearchParams } from "react-router-dom";
import { useLibraryQuery } from "./hooks/useLibraryQuery";
import { tauriListen, isTauri } from "./services/tauri";
import {
  fetchJellyfinLibrary,
  fetchJellyfinEpisodes,
  rawToMediaItem,
  rawToEpisode,
} from "./services/jellyfinApi";
import { 
  fetchPlexSections, 
  fetchPlexSection, 
  fetchPlexEpisodes,
  plexRawToMediaItem,
  plexRawToEpisode
} from "./services/plexApi";
import type { MediaItem, WatchProgressEntry } from "./types";
import { PlatformContext as _PlatformContext, getPlatform } from "./utils/platform";
import { getActiveSection, getLocalizedPath } from "./utils/routeHelpers";
import { describeServerError } from "./utils/errorMessages";
import { preloader } from "./utils/predictivePreloader";
import { swManager } from "./utils/serviceWorkerManager";
import { metadataCache } from "./utils/metadataCache";
import { resourcePrioritizer } from "./utils/resourcePrioritizer";
import { HomeStatus } from "./components/HomeStatus";
import { ConnectionErrorBanner } from "./components/ConnectionErrorBanner";

const BrowseView = lazy(() => import("./components/views/BrowseView"));
const SearchView = lazy(() => import("./components/views/SearchView"));
const SettingsView = lazy(() => import("./components/views/SettingsView"));

/**
 * Rewrites the audio params on a Plex universal-transcode URL according to the
 * "Boost voices" setting. When on, the server downmixes surround to stereo and lifts
 * the centre (dialogue) channel — otherwise dialogue gets buried under effects when the
 * device folds 5.1 down to TV speakers. No-op for non-Plex/direct URLs.
 */
function rewriteAudioParams(url: string | undefined, boostVoices: boolean): string | undefined {
  if (!url || !url.includes("/transcode/universal/")) return url;
  try {
    const u = new URL(url);
    if (boostVoices) {
      u.searchParams.set("audioChannels", "2");
      u.searchParams.set("audioBoost", "200");
    } else {
      u.searchParams.delete("audioChannels");
      u.searchParams.set("audioBoost", "100");
    }
    return u.toString();
  } catch {
    return url;
  }
}

function applyAudioPrefs(item: MediaItem, boostVoices: boolean): MediaItem {
  const streamUrl = rewriteAudioParams(item.streamUrl, boostVoices);
  const url = rewriteAudioParams(item.url, boostVoices);
  if (streamUrl === item.streamUrl && url === item.url) return item;
  return { ...item, streamUrl, url };
}



function useFilteredLibrary(activeSection: string, storeLibrary: MediaItem[]) {
    
  const plexConfig     = useConfigStore((s) => s.plexConfig);
  const jellyfinConfig = useConfigStore((s) => s.jellyfinConfig);
  const watchProgress  = useLibraryStore((s) => s.watchProgress);

  return useMemo(() => {
    const source = storeLibrary;

    const movies = source.filter((i) => i.type === "movie");
    const music  = source.filter((i) => i.type === "music");
    const tv     = source.filter((i) => i.type === "tv");
    const anime  = source.filter((i) => i.type === "anime");
    const manga  = source.filter((i) => i.type === "manga");

    // In progress = past the opening seconds but not effectively finished.
    const inProgress = (p: WatchProgressEntry | undefined, fallbackDur?: number) => {
      if (!p || p.time <= 5) return false;
      const dur = p.duration ?? fallbackDur;
      if (dur && p.time > dur * 0.95) return false;
      return true;
    };
    const continueWatching = source.filter((i) => {
      // Movies/direct titles carry their own progress entry…
      if (inProgress(watchProgress[i.id], i.duration)) return true;
      // …shows don't: their progress lives on episode entries tagged with seriesId.
      return Object.values(watchProgress).some(
        (p) => p.seriesId === i.id && inProgress(p)
      );
    });

    // Real items with artwork drive the home hero (never mock).
    const featured = source.filter((i) => i.backdropUrl).slice(0, 6);

    if (activeSection === "movies") return { movies, music: [], tv: [], anime: [], manga: [], source, continueWatching: [], featured: [] };
    if (activeSection === "music")  return { movies: [], music, tv: [], anime: [], manga: [], source, continueWatching: [], featured: [] };
    if (activeSection === "tv")     return { movies: [], music: [], tv, anime: [], manga: [], source, continueWatching: [], featured: [] };
    if (activeSection === "anime")  return { movies: [], music: [], tv: [], anime, manga: [], source, continueWatching: [], featured: [] };
    if (activeSection === "manga")  return { movies: [], music: [], tv: [], anime: [], manga, source, continueWatching: [], featured: [] };
    return { movies, music, tv, anime, manga, source, continueWatching, featured };
  }, [activeSection, storeLibrary, jellyfinConfig, plexConfig, watchProgress]);
}


export default function App() {
  const { t } = useTranslation();

  const location = useLocation();
  const navigate = useNavigate();
  const { platform } = usePlatformBridge();
  const activeSection = getActiveSection(location.pathname);
  const isTouchLayout = useTouchLayout();
  const [searchParams, setSearchParams] = useSearchParams();
  const detailId = searchParams.get("detail");
  const playId = searchParams.get("play");

  const { data: queryLibrary = [] } = useLibraryQuery();

  // Items handed to the player (episodes especially) are NOT in `queryLibrary`
  // (that holds shows/movies), so `?play=<id>` can't be resolved by a library
  // lookup alone — a TV episode would resolve to null and the player would never
  // mount (looking like "click to play → bounces back"). Keep the actual played
  // items (current + playlist) here; fall back to the library for deep-links.
  const playedItemsRef = useRef<Map<string, MediaItem>>(new Map());

  const selectedMedia = useMemo(() => {
    return detailId ? queryLibrary.find(m => m.id === detailId) || null : null;
  }, [detailId, queryLibrary]);

  const playerMediaRaw = useMemo(() => {
    if (!playId) return null;
    return playedItemsRef.current.get(playId) ?? queryLibrary.find(m => m.id === playId) ?? null;
  }, [playId, queryLibrary]);
  const boostVoices = useConfigStore((s) => s.settings.boostVoices);
  const playerMedia = useMemo(() => playerMediaRaw ? applyAudioPrefs(playerMediaRaw, boostVoices) : null, [playerMediaRaw, boostVoices]);

  const setSelectedMedia = useCallback((media: MediaItem | null) => {
    setSearchParams((prev) => {
      if (media) prev.set("detail", media.id);
      else prev.delete("detail");
      return prev;
    });
  }, [setSearchParams]);
  const [showSplash, setShowSplash] = useState(true);
  const plexConfig       = useConfigStore((s) => s.plexConfig);
  const jellyfinConfig   = useConfigStore((s) => s.jellyfinConfig);
  
  useEffect(() => {
    const hosts: string[] = [];
    if (plexConfig?.serverUrl) hosts.push(plexConfig.serverUrl);
    if (jellyfinConfig?.serverUrl) hosts.push(jellyfinConfig.serverUrl);
    if (hosts.length > 0 && isTauri()) {
      import("./services/tauri").then(({ invoke }) => {
        invoke("set_allowed_hosts", { hosts }).catch(console.error);
      });
    }
  }, [plexConfig, jellyfinConfig]);

  const [playerInitialTime, setPlayerInitialTime] = useState<number>(0);
  const [playerPlaylist, setPlayerPlaylist] = useState<MediaItem[]>([]);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const setWatchProgress = useLibraryStore((s) => s.setWatchProgress);
  const settings         = useConfigStore((s) => s.settings);
  

  const handlePlay = useCallback(
    (item: MediaItem, initialTime?: number, playlist?: MediaItem[]) => {
      setPlayerInitialTime(initialTime ?? 0);
      setPlayerPlaylist(playlist ?? []);
      // Register the item (+ playlist, for auto-next) so `playerMediaRaw` can
      // resolve `?play=<id>` even for episodes not in the library.
      playedItemsRef.current.set(item.id, item);
      (playlist ?? []).forEach((p) => playedItemsRef.current.set(p.id, p));
      setSearchParams((prev) => {
        prev.delete("detail");
        prev.set("play", item.id);
        return prev;
      });
    },
    [setSearchParams]
  );

  // Persist where we are in the current item. Keyed by the playing item's id
  // (episode id for episodes) and tagged with seriesId so the show can surface
  // it in Continue Watching.
  const saveProgress = useCallback(
    (media: MediaItem, time: number, duration?: number) => {
      if (time <= 5) return;
      setWatchProgress(media.id, {
        time,
        duration: duration ?? media.duration,
        season: media.season,
        episode: media.episode,
        seriesId: media.seriesId,
        updatedAt: Date.now(),
      });
    },
    [setWatchProgress]
  );

  // Called periodically while playing so progress survives even if the user
  // never presses Back (app reload, OS backgrounding, letting it run on).
  const handlePlayerProgress = useCallback(
    (p: { time: number; duration?: number }) => {
      if (playerMedia) saveProgress(playerMedia, p.time, p.duration);
    },
    [playerMedia, saveProgress]
  );

  const handleClosePlayer = useCallback(
    (progress?: { time: number; duration?: number; season?: number; episode?: number }) => {
      if (progress && playerMedia) saveProgress(playerMedia, progress.time, progress.duration);
      setPlayerPlaylist([]);
      // Native navigation pop restores the detail view automatically
      if (window.history.length > 1) {
        navigate(-1);
      } else {
        setSearchParams((prev) => {
          prev.delete("play");
          return prev;
        }, { replace: true });
      }
    },
    [playerMedia, saveProgress, navigate, setSearchParams]
  );

  // Episode finished playing → mark it watched, then auto-advance to the next
  // episode in the playlist if there is one; otherwise behave like a close.
  const handlePlayerEnded = useCallback(
    (progress?: { time: number; duration?: number }) => {
      if (playerMedia) {
        const dur = progress?.duration ?? playerMedia.duration;
        // Save at the very end so it counts as finished (drops out of resume).
        saveProgress(playerMedia, dur ?? progress?.time ?? 0, dur);

        const idx = playerPlaylist.findIndex((p) => p.id === playerMedia.id);
        const next = idx >= 0 ? playerPlaylist[idx + 1] : undefined;
        if (next && settings.autoPlayNext) {
          setPlayerInitialTime(0);
          setSearchParams((prev) => {
            prev.set("play", next.id);
            return prev;
          }, { replace: true });
          return;
        }
      }
      setPlayerPlaylist([]);
      if (window.history.length > 1) {
        navigate(-1);
      } else {
        setSearchParams((prev) => {
          prev.delete("play");
          return prev;
        }, { replace: true });
      }
    },
    [playerMedia, playerPlaylist, saveProgress, settings.autoPlayNext, navigate, setSearchParams]
  );
  const setActiveSection = useCallback((val: string) => navigate(getLocalizedPath(val === "home" ? "/" : `/${val}`, location.pathname.split("/").filter(Boolean)[0] === "fr" ? "fr" : "en")), [navigate, location.pathname]);
  const serverType       = useConfigStore((s) => s.serverType);
  
  // Landing → setup gate. Show the explainer first; once connected (or on a later disconnect)
  // it resets so a signed-out visitor always lands on the explainer, not straight on the form.
  const [showSetup, setShowSetup] = useState(false);
  useEffect(() => { if (serverType) setShowSetup(false); }, [serverType]);
  
  

  useSpatialNavigation();
  useTouchpadScroll();

  // Initialize service worker and optimizations
  useEffect(() => {
    swManager.register();
    
    // Cleanup on unmount
    return () => {
      preloader.cleanup();
      metadataCache.destroy();
    };
  }, []);

  // Auto-focus first nav item on mount so TV remote works without clicking first
  useEffect(() => {
    const t = setTimeout(() => {
      const first = document.querySelector<HTMLElement>('[data-magnetic-id="nav-home"]');
      first?.focus();
    }, 300);
    return () => clearTimeout(t);
  }, []);


  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "GoBack" || e.key === "BrowserBack") {
        if (e.key === "Escape") {
          e.preventDefault(); // Only prevent default for Escape. Let GoBack and BrowserBack do their native popstate!
        }
        
        // If Escape is pressed, we manually trigger the exact same actions as a back button
        if (e.key === "Escape") {
          if (playerMedia) { handleClosePlayer(); return; }
          if (selectedMedia) { 
             setSearchParams((prev) => { prev.delete("detail"); return prev; }); 
             return; 
          }
          if (activeSection !== "home") { setActiveSection(isTouchLayout && CATEGORY_IDS.includes(activeSection) ? "browse" : "home"); return; }
          setShowExitDialog(true);
          if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
          exitTimerRef.current = setTimeout(() => setShowExitDialog(false), 4000);
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [playerMedia, selectedMedia, activeSection, setActiveSection, handleClosePlayer, isTouchLayout]);

  

  const { updateFromIMU } = useSpatialCursor();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        if (e.key === " ") e.preventDefault();
        const active = document.activeElement;
        if (active instanceof HTMLElement && active !== document.body) {
          active.click();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const mainRef = useRef<HTMLElement>(null);
  const bgLayerRef = useRef<HTMLDivElement>(null);

  // When a modal (detail page or player) is open, mark the background layer
  // as inert so the focus manager can't accidentally target library cards behind it.
  useEffect(() => {
    const bg = bgLayerRef.current;
    if (!bg) return;
    if (selectedMedia || playerMedia) {
      bg.setAttribute('inert', '');
    } else {
      bg.removeAttribute('inert');
    }
  }, [selectedMedia, playerMedia]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    tauriListen<{ direction: number }>("spatial-scroll", (e) => {
      const dir = e.direction;
      mainRef.current?.scrollBy({ top: dir * 300, behavior: "smooth" });
    }).then((f) => { unlisten = f; });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const handleBack = () => {
      if (playerMedia) { handleClosePlayer(); return; }
      if (selectedMedia) { setSelectedMedia(null); return; }
      if (activeSection !== "home") { setActiveSection(isTouchLayout && CATEGORY_IDS.includes(activeSection) ? "browse" : "home"); return; }
    };
    tauriListen("spatial-back", handleBack).then((f) => { unlisten = f; });
    return () => unlisten?.();
  }, [playerMedia, selectedMedia, activeSection, setActiveSection, handleClosePlayer, isTouchLayout]);

  const { movies, music, tv, anime, manga, source, continueWatching, featured } = useFilteredLibrary(activeSection, queryLibrary);

  const handleItemSelect = useCallback(
    (item: MediaItem) => {
      setSelectedMedia(item);
      
      // Defer predictive preloading to idle time — don't block navigation
      const schedulePreload = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 200));
      schedulePreload(() => {
        const predictions = preloader.predictNext(item.id, source);
        const topPredictions = predictions.slice(0, 3);
        preloader.preloadImages(topPredictions.map(p => p.item));
        swManager.prefetchUrls(topPredictions.map(p => p.item.thumbnail));
      });
    },
    [source]
  );

  if (!serverType || (serverType === "jellyfin" && !jellyfinConfig) || (serverType === "plex" && !plexConfig)) {
    // First-time / signed-out visitors get the explainer landing; "Connect" opens the
    // Plex/Jellyfin login. Once a server is connected the app goes straight to the content.
    // Both are form/marketing screens — they use the real OS cursor (see index.css), so no
    // liquid cursor here (it depends on the magnetic-snap system these screens don't wire up).
    return (
      <Suspense fallback={null}>
        {showSetup ? <MediaSetup /> : <Landing onGetStarted={() => setShowSetup(true)} />}
      </Suspense>
    );
  }

  return (
    <div className="h-screen bg-[#06080d] text-white flex overflow-hidden selection:bg-purple-500/30">
      <LiquidCursor />

      {/* bg layer — marked inert when a detail page or player is open */}
      <div ref={bgLayerRef} className="contents">
        {isTouchLayout ? <MobileNav /> : <NavigationSidebar />}
        <main
          ref={mainRef}
          className="flex-1 min-w-0 h-full overflow-y-auto scrollbar-hide"
          style={{
            paddingLeft: isTouchLayout ? 0 : 80,
            paddingBottom: isTouchLayout
              ? `calc(${MOBILE_NAV_HEIGHT}px + env(safe-area-inset-bottom))`
              : 0,
          }}
        >
        {/* Sticky app bar (touch only) — sits in normal flow so content starts below it */}
        {isTouchLayout && <MobileTopBar />}
        <UpdateBanner />
        <ConnectionErrorBanner />
        {activeSection === "home" && settings.showHero && featured.length > 0 && (
          <div className="relative h-[42vh] min-h-[300px] lg:h-[55vh] lg:min-h-[480px] mb-6 lg:mb-12 flex-shrink-0">
            <HeroCarousel items={featured} onSelect={handleItemSelect} />
          </div>
        )}

        <motion.div
          key={activeSection}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="pb-20"
        >
          {activeSection === "home" && (
            <>
              {settings.showContinueWatching && continueWatching.length > 0 && (
                <MediaStage
                  title={t("categories.continue_watching")}
                  items={continueWatching}
                  onSelect={handleItemSelect}
                  metaLabel="RESUME PLAYBACK"
                />
              )}
              {movies.length > 0 && (
                <MediaStage
                  title={t("categories.cinema")}
                  items={movies}
                  onSelect={handleItemSelect}
                  metaLabel="MOVIES · FILM LIBRARY"
                />
              )}
              {tv.length > 0 && (
                <MediaStage
                  title={t("categories.prestige_tv")}
                  items={tv}
                  onSelect={handleItemSelect}
                  metaLabel="TV SERIES · EPISODES"
                />
              )}
              {anime.length > 0 && (
                <MediaStage
                  title={t("categories.anime")}
                  items={anime}
                  onSelect={handleItemSelect}
                  metaLabel="ANIME · SEASONS"
                />
              )}
              {manga.length > 0 && (
                <MediaStage
                  title={t("categories.manga")}
                  items={manga}
                  onSelect={handleItemSelect}
                  metaLabel="MANGA · VOLUMES"
                />
              )}
              {music.length > 0 && (
                <MediaStage
                  title={t("categories.sound_stage")}
                  items={music}
                  onSelect={handleItemSelect}
                  metaLabel="MUSIC · ALBUMS"
                />
              )}
            </>
          )}

          {activeSection === "movies" && movies.length > 0 && (
            <div className="pt-8">
              <div className="px-4 sm:px-8 lg:px-20 mb-8">
                <h1 className="font-display font-black text-on_surface" style={{ fontSize: "clamp(2rem, 3.5vw, 3rem)" }}>
                  {t("categories.cinema")}
                </h1>
                <p className="font-mono-tech text-on_surface_variant text-sm mt-1">
                  {movies.length} TITLES · FILM LIBRARY
                </p>
              </div>
              <MediaStage title={t("categories.all_movies")} items={movies} onSelect={handleItemSelect} />
            </div>
          )}

          {activeSection === "anime" && anime.length > 0 && (
            <div className="pt-8">
              <div className="px-4 sm:px-8 lg:px-20 mb-8">
                <h1 className="font-display font-black text-on_surface" style={{ fontSize: "clamp(2rem, 3.5vw, 3rem)" }}>
                  {t("categories.anime")}
                </h1>
                <p className="font-mono-tech text-on_surface_variant text-sm mt-1">
                  {anime.length} SERIES · SEASONS & EPISODES
                </p>
              </div>
              <MediaStage title={t("categories.all_anime")} items={anime} onSelect={handleItemSelect} />
            </div>
          )}

          {activeSection === "manga" && manga.length > 0 && (
            <div className="pt-8">
              <div className="px-4 sm:px-8 lg:px-20 mb-8">
                <h1 className="font-display font-black text-on_surface" style={{ fontSize: "clamp(2rem, 3.5vw, 3rem)" }}>
                  {t("categories.manga")}
                </h1>
                <p className="font-mono-tech text-on_surface_variant text-sm mt-1">
                  {manga.length} TITLES · VOLUMES
                </p>
              </div>
              <MediaStage title={t("categories.all_manga")} items={manga} onSelect={handleItemSelect} />
            </div>
          )}

          {activeSection === "music" && music.length > 0 && (
            <div className="pt-8">
              <div className="px-4 sm:px-8 lg:px-20 mb-8">
                <h1 className="font-display font-black text-on_surface" style={{ fontSize: "clamp(2rem, 3.5vw, 3rem)" }}>
                  {t("categories.sound_stage")}
                </h1>
                <p className="font-mono-tech text-on_surface_variant text-sm mt-1">
                  {music.length} ALBUMS · HI-FI AUDIO
                </p>
              </div>
              <MediaStage title={t("categories.albums")} items={music} onSelect={handleItemSelect} />
            </div>
          )}

          {activeSection === "tv" && tv.length > 0 && (
            <div className="pt-8">
              <div className="px-4 sm:px-8 lg:px-20 mb-8">
                <h1 className="font-display font-black text-on_surface" style={{ fontSize: "clamp(2rem, 3.5vw, 3rem)" }}>
                  {t("categories.prestige_tv")}
                </h1>
                <p className="font-mono-tech text-on_surface_variant text-sm mt-1">
                  {tv.length} SERIES · STREAMING QUALITY
                </p>
              </div>
              <MediaStage title={t("categories.series")} items={tv} onSelect={handleItemSelect} />
            </div>
          )}

          {activeSection === "browse" && (
            <Suspense fallback={null}>
              <BrowseView />
            </Suspense>
          )}

          {activeSection === "search" && (
            <Suspense fallback={null}>
              <SearchView onSelect={handleItemSelect} />
            </Suspense>
          )}

          {activeSection === "settings" && (
            <Suspense fallback={null}>
              <SettingsView />
            </Suspense>
          )}

          {activeSection === "home" && source.length === 0 && (
            <HomeStatus />
          )}
        </motion.div>
        </main>
      </div>{/* end bg layer */}

      <AnimatePresence>
        {selectedMedia && (
          <Suspense fallback={null} key={`detail-${selectedMedia.id}`}>
            <ContentDetailPage
              item={selectedMedia}
              onPlay={handlePlay}
              onClose={() => setSelectedMedia(null)}
            />
          </Suspense>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {playerMedia && (
          <Suspense fallback={null} key={playerMedia.id}>
            <ButuPlayer
              item={playerMedia}
              initialTime={playerInitialTime}
              onClose={handleClosePlayer}
              onProgress={handlePlayerProgress}
              onEnded={handlePlayerEnded}
            />
          </Suspense>
        )}
      </AnimatePresence>

      {/* Exit confirmation dialog */}
      <AnimatePresence>
        {showExitDialog && (
          <motion.div
            key="exit-dialog"
            initial={{ opacity: 0, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: "fixed",
              bottom: "2.5rem",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 9999,
              background: "rgba(12, 14, 20, 0.96)",
              border: "1px solid rgba(153, 247, 255, 0.2)",
              borderRadius: "1.25rem",
              padding: "1.5rem 2rem",
              
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "1rem",
              minWidth: 320,
              boxShadow: "0 8px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(153,247,255,0.08)",
            }}
          >
            <p style={{ fontFamily: "inherit", fontWeight: 700, fontSize: "1.05rem", color: "#e0e6f0", letterSpacing: "-0.01em" }}>
              Leave Butu?
            </p>
            <p style={{ fontSize: "0.75rem", color: "#9aa3b4", letterSpacing: "0.04em", textAlign: "center" }}>
              Press ← Back again to exit, or any other key to stay.
            </p>
            <div style={{ display: "flex", gap: "0.75rem", width: "100%" }}>
              <button
                onClick={() => setShowExitDialog(false)}
                style={{
                  flex: 1, padding: "0.6rem", borderRadius: "0.75rem",
                  background: "rgba(153, 247, 255, 0.08)",
                  border: "1px solid rgba(153, 247, 255, 0.18)",
                  color: "#99f7ff", fontWeight: 600, fontSize: "0.78rem",
                  letterSpacing: "0.08em", cursor: "pointer",
                }}
              >
                STAY
              </button>
              <button
                onClick={async () => {
                  if (platform === PlatformContext.DesktopTauri) {
                    try {
                      const { getCurrentWindow } = await import("@tauri-apps/api/window");
                      await getCurrentWindow().close();
                    } catch (e) {
                      window.close();
                    }
                  } else {
                    window.history.go(-100);
                  }
                }}
                style={{
                  flex: 1, padding: "0.6rem", borderRadius: "0.75rem",
                  background: "rgba(255, 80, 80, 0.1)",
                  border: "1px solid rgba(255, 80, 80, 0.25)",
                  color: "#ff6b6b", fontWeight: 600, fontSize: "0.78rem",
                  letterSpacing: "0.08em", cursor: "pointer",
                }}
              >
                EXIT
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSplash && (
          <SplashScreen onComplete={() => setShowSplash(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}


