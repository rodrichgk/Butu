import { useState, useCallback, useEffect, useRef, useMemo, type ReactNode, type CSSProperties } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { LiquidCursor } from "./components/LiquidCursor";
import { NavigationSidebar, CATEGORY_IDS, CATEGORY_ITEMS } from "./components/NavigationSidebar";
import { HeroCarousel } from "./components/HeroCarousel";
import { MediaStage } from "./components/MediaStage";
import { MobileNav, MOBILE_NAV_HEIGHT } from "./components/MobileNav";
import { MobileTopBar } from "./components/MobileTopBar";
import { useTouchLayout } from "./hooks/useIsMobile";
import { ButuPlayer } from "./components/ButuPlayer";
import { ContentDetailPage } from "./components/ContentDetailPage";
import { MediaSetup } from "./components/MediaSetup";
import { Landing } from "./components/Landing";
import { SplashScreen } from "./components/SplashScreen";
import { MarkerAutoDetectModal } from "./components/MarkerAutoDetectModal";
import { QRCodeSVG } from "qrcode.react";
import { useSpatialCursor } from "./hooks/useSpatialCursor";
import { useSpatialNavigation } from "./hooks/useSpatialNavigation";
import { useTouchpadScroll } from "./hooks/useTouchpadScroll";
import { useButuStore } from "./store/useButuStore";
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
import { isAndroid } from "./utils/platform";
import { describeServerError } from "./utils/errorMessages";
import { preloader } from "./utils/predictivePreloader";
import { swManager } from "./utils/serviceWorkerManager";
import { metadataCache } from "./utils/metadataCache";
import { resourcePrioritizer } from "./utils/resourcePrioritizer";

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

// Donation link (PayPal). The Support section + QR appear everywhere once this is a real URL;
// it auto-hides while it's the example.com placeholder so we can ship without one.
const DONATE_URL = "https://www.paypal.com/donate/?hosted_button_id=7YJ9V2CMFRRPW";
const DONATE_ENABLED = !DONATE_URL.includes("example.com");

function openExternal(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

function DonateModal({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(4,6,13,0.8)", backdropFilter: "blur(8px)" }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="rounded-3xl p-8 flex flex-col items-center"
        style={{ background: "rgba(16,20,30,0.98)", border: "1px solid rgba(153,247,255,0.15)", maxWidth: 360 }}
        initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display font-bold text-on_surface text-xl mb-1">Support Butu</h2>
        <p className="font-body text-on_surface_variant text-sm text-center mb-5">
          Butu is free. Scan with your phone — or open the page — to support development ❤
        </p>
        <div className="p-3 rounded-2xl" style={{ background: "#fff" }}>
          <QRCodeSVG value={DONATE_URL} size={200} bgColor="#ffffff" fgColor="#04060d" />
        </div>
        <motion.button
          onClick={() => openExternal(DONATE_URL)}
          className="mt-5 px-5 py-2.5 rounded-xl font-body text-sm font-semibold"
          style={{ background: "rgba(153,247,255,0.12)", color: "#99f7ff", border: "1px solid rgba(153,247,255,0.3)", cursor: "none" }}
          whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
        >
          Open donation page
        </motion.button>
        <button onClick={onClose} className="mt-3 font-body text-sm" style={{ color: "rgba(224,230,240,0.5)", cursor: "none" }}>
          Close
        </button>
      </motion.div>
    </motion.div>
  );
}

function useFilteredLibrary() {
  const activeSection  = useButuStore((s) => s.activeSection);
  const storeLibrary   = useButuStore((s) => s.library);
  const jellyfinConfig = useButuStore((s) => s.jellyfinConfig);
  const plexConfig     = useButuStore((s) => s.plexConfig);
  const watchProgress  = useButuStore((s) => s.watchProgress);

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
  const [showSplash, setShowSplash] = useState(true);
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [playerMedia,   setPlayerMedia]   = useState<MediaItem | null>(null);
  const [playerInitialTime, setPlayerInitialTime] = useState<number>(0);
  const [playerPlaylist, setPlayerPlaylist] = useState<MediaItem[]>([]);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevSelectedMedia = useRef<MediaItem | null>(null);
  const setWatchProgress = useButuStore((s) => s.setWatchProgress);
  const settings         = useButuStore((s) => s.settings);
  const libraryRefreshKey = useButuStore((s) => s.libraryRefreshKey);

  const handlePlay = useCallback(
    (item: MediaItem, initialTime?: number, playlist?: MediaItem[]) => {
      prevSelectedMedia.current = selectedMedia;
      const boostVoices = useButuStore.getState().settings.boostVoices;
      setPlayerInitialTime(initialTime ?? 0);
      setPlayerPlaylist(playlist ?? []);
      setPlayerMedia(applyAudioPrefs(item, boostVoices));
      setSelectedMedia(null);
    },
    [selectedMedia]
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
      setPlayerMedia(null);
      setPlayerPlaylist([]);
      if (prevSelectedMedia.current) {
        setSelectedMedia(prevSelectedMedia.current);
        prevSelectedMedia.current = null;
      }
    },
    [playerMedia, saveProgress]
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
          setPlayerMedia(next);
          return;
        }
      }
      setPlayerMedia(null);
      setPlayerPlaylist([]);
      if (prevSelectedMedia.current) {
        setSelectedMedia(prevSelectedMedia.current);
        prevSelectedMedia.current = null;
      }
    },
    [playerMedia, playerPlaylist, saveProgress, settings.autoPlayNext]
  );
  const activeSection    = useButuStore((s) => s.activeSection);
  const setActiveSection = useButuStore((s) => s.setActiveSection);
  const isTouchLayout    = useTouchLayout();
  const serverType       = useButuStore((s) => s.serverType);
  const jellyfinConfig   = useButuStore((s) => s.jellyfinConfig);
  const plexConfig       = useButuStore((s) => s.plexConfig);
  const setLibrary       = useButuStore((s) => s.setLibrary);
  // Landing → setup gate. Show the explainer first; once connected (or on a later disconnect)
  // it resets so a signed-out visitor always lands on the explainer, not straight on the form.
  const [showSetup, setShowSetup] = useState(false);
  useEffect(() => { if (serverType) setShowSetup(false); }, [serverType]);
  const setJellyfinLoading = useButuStore((s) => s.setJellyfinLoading);
  const setJellyfinError   = useButuStore((s) => s.setJellyfinError);

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
    history.pushState({ butu: true }, "");
  }, []);

  useEffect(() => {
    const handleBack = (e: PopStateEvent) => {
      history.pushState({ butu: true }, "");

      if (playerMedia) {
        // Use handleClosePlayer so we restore the previously-open detail page
        handleClosePlayer();
        return;
      }
      if (selectedMedia) {
        setSelectedMedia(null);
        return;
      }
      if (activeSection !== "home") {
        setActiveSection(isTouchLayout && CATEGORY_IDS.includes(activeSection) ? "browse" : "home");
        return;
      }
      setShowExitDialog(true);
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
      exitTimerRef.current = setTimeout(() => setShowExitDialog(false), 4000);
    };

    window.addEventListener("popstate", handleBack);
    return () => window.removeEventListener("popstate", handleBack);
  }, [playerMedia, selectedMedia, activeSection, setActiveSection, handleClosePlayer, isTouchLayout]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "GoBack" || e.key === "BrowserBack") {
        e.preventDefault();
        if (playerMedia) { handleClosePlayer(); return; }
        if (selectedMedia) { setSelectedMedia(null); return; }
        if (activeSection !== "home") { setActiveSection(isTouchLayout && CATEGORY_IDS.includes(activeSection) ? "browse" : "home"); return; }
        setShowExitDialog(true);
        if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
        exitTimerRef.current = setTimeout(() => setShowExitDialog(false), 4000);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [playerMedia, selectedMedia, activeSection, setActiveSection, handleClosePlayer, isTouchLayout]);

  useEffect(() => {
    if (!serverType) return;
    if (serverType === "jellyfin" && !jellyfinConfig) return;
    if (serverType === "plex" && !plexConfig) return;

    let cancelled = false;

    async function loadLibrary() {
      setJellyfinLoading(true);
      setJellyfinError(null);
      try {
        if (serverType === "jellyfin") {
          const rawItems = await fetchJellyfinLibrary(jellyfinConfig!);
          const mediaItems = rawItems.map((r) => rawToMediaItem(r, jellyfinConfig!));
          if (!cancelled) setLibrary(mediaItems);
        } else if (serverType === "plex") {
          const sections = await fetchPlexSections(plexConfig!);
          const allMedia: MediaItem[] = [];
          for (const s of sections) {
            if (s.type === "movie" || s.type === "show") {
              const rawItems = await fetchPlexSection(plexConfig!, s.key);
              for (const raw of rawItems) {
                allMedia.push(plexRawToMediaItem(raw, plexConfig!));
              }
            }
          }
          if (!cancelled) setLibrary(allMedia);
        }
      } catch (e) {
        if (!cancelled) setJellyfinError(describeServerError(e, serverType));
      } finally {
        if (!cancelled) setJellyfinLoading(false);
      }
    }
    loadLibrary();
    return () => { cancelled = true; };
  }, [serverType, jellyfinConfig, plexConfig, libraryRefreshKey, setLibrary, setJellyfinLoading, setJellyfinError]);

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
    const handleScroll = (e: Event) => {
      const dir = (e as CustomEvent<{ direction: number }>).detail?.direction ?? 0;
      mainRef.current?.scrollBy({ top: dir * 300, behavior: "smooth" });
    };
    window.addEventListener("spatial-scroll", handleScroll);
    return () => window.removeEventListener("spatial-scroll", handleScroll);
  }, []);

  useEffect(() => {
    const handleBack = () => {
      if (playerMedia) { handleClosePlayer(); return; }
      if (selectedMedia) { setSelectedMedia(null); return; }
      if (activeSection !== "home") { setActiveSection(isTouchLayout && CATEGORY_IDS.includes(activeSection) ? "browse" : "home"); return; }
    };
    window.addEventListener("spatial-back", handleBack);
    return () => window.removeEventListener("spatial-back", handleBack);
  }, [playerMedia, selectedMedia, activeSection, setActiveSection, handleClosePlayer, isTouchLayout]);

  const { movies, music, tv, anime, manga, source, continueWatching, featured } = useFilteredLibrary();

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
    return showSetup ? <MediaSetup /> : <Landing onGetStarted={() => setShowSetup(true)} />;
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
            <BrowseView />
          )}

          {activeSection === "search" && (
            <SearchView onSelect={handleItemSelect} />
          )}

          {activeSection === "settings" && (
            <SettingsView />
          )}

          {activeSection === "home" && source.length === 0 && (
            <HomeStatus />
          )}
        </motion.div>
        </main>
      </div>{/* end bg layer */}

      <AnimatePresence>
        {selectedMedia && (
          <ContentDetailPage
            key={`detail-${selectedMedia.id}`}
            item={selectedMedia}
            onPlay={handlePlay}
            onClose={() => setSelectedMedia(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {playerMedia && (
          <ButuPlayer
            key={playerMedia.id}
            item={playerMedia}
            initialTime={playerInitialTime}
            onClose={handleClosePlayer}
            onProgress={handlePlayerProgress}
            onEnded={handlePlayerEnded}
          />
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
                onClick={() => { window.history.go(-100); }}
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

function HomeStatus() {
  const loading = useButuStore((s) => s.jellyfinLoading);
  const error   = useButuStore((s) => s.jellyfinError);
  const refresh = useButuStore((s) => s.refreshLibrary);
  const setActiveSection = useButuStore((s) => s.setActiveSection);
  return (
    <div className="px-4 sm:px-8 lg:px-20 py-24 flex flex-col items-center text-center gap-3">
      {loading ? (
        <p className="font-mono-tech text-on_surface_variant text-sm animate-pulse">
          Loading your library…
        </p>
      ) : error ? (
        <>
          <div style={{ fontSize: 30, lineHeight: 1 }}>⚠️</div>
          <p className="font-display font-semibold" style={{ fontSize: 17, color: "#ff8c8c" }}>
            Couldn't load your library
          </p>
          <p className="font-body text-on_surface_variant text-sm" style={{ maxWidth: 440, lineHeight: 1.55 }}>
            {error}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <button onClick={() => refresh()} className="focusable" style={errorBtnPrimary}>Retry</button>
            <button onClick={() => setActiveSection("settings")} className="focusable" style={errorBtnGhost}>Settings</button>
          </div>
        </>
      ) : (
        <>
          <p className="font-display font-semibold text-on_surface" style={{ fontSize: 18 }}>
            No media found
          </p>
          <p className="font-body text-on_surface_variant text-sm">
            Your server's libraries look empty, or are still scanning.
          </p>
        </>
      )}
    </div>
  );
}

const errorBtnPrimary: CSSProperties = {
  padding: "8px 18px", borderRadius: 12, fontSize: 13, fontWeight: 600,
  background: "rgba(153,247,255,0.14)", color: "#99f7ff",
  border: "1px solid rgba(153,247,255,0.32)",
};
const errorBtnGhost: CSSProperties = {
  padding: "8px 16px", borderRadius: 12, fontSize: 13, fontWeight: 600,
  background: "rgba(255,255,255,0.04)", color: "rgba(224,230,240,0.7)",
  border: "1px solid rgba(255,255,255,0.10)",
};

/**
 * Top-of-content banner shown when a library refresh fails *while content is
 * already on screen* (stale data) — the empty-library case is covered by
 * HomeStatus. Either way the user sees the problem without opening the console.
 */
function ConnectionErrorBanner() {
  const error   = useButuStore((s) => s.jellyfinError);
  const loading = useButuStore((s) => s.jellyfinLoading);
  const hasData = useButuStore((s) => s.library.length > 0);
  const refresh = useButuStore((s) => s.refreshLibrary);
  const [dismissed, setDismissed] = useState(false);
  // A new/changed error re-shows the banner even if previously dismissed.
  useEffect(() => { setDismissed(false); }, [error]);

  if (!error || loading || dismissed || !hasData) return null;
  return (
    <div
      role="alert"
      className="mx-4 sm:mx-8 lg:mx-20 mt-4 mb-2 flex items-start gap-3 rounded-2xl p-4"
      style={{ background: "rgba(255,90,90,0.10)", border: "1px solid rgba(255,90,90,0.30)" }}
    >
      <span style={{ fontSize: 18, lineHeight: 1.2 }}>⚠️</span>
      <div className="flex-1 min-w-0">
        <p className="font-display font-semibold" style={{ color: "#ff8c8c", fontSize: 14 }}>
          Connection problem — showing what loaded earlier
        </p>
        <p className="font-body text-on_surface_variant" style={{ fontSize: 13, lineHeight: 1.5, marginTop: 2 }}>
          {error}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button onClick={() => refresh()} className="focusable" style={errorBtnPrimary}>Retry</button>
        <button onClick={() => setDismissed(true)} className="focusable" aria-label="Dismiss"
          style={{ ...errorBtnGhost, padding: "8px 12px" }}>✕</button>
      </div>
    </div>
  );
}

// Maps a Browse category id to the MediaItem.type it groups.
const BROWSE_TYPE: Record<string, string> = {
  movies: "movie", tv: "tv", anime: "anime", manga: "manga", music: "music",
};

// Browse is a real destination (Apple Music "Library" pattern): a grid of the
// content categories you drill into — never a tab that opens a sheet.
function BrowseView() {
  const { t } = useTranslation();
  const setActiveSection = useButuStore((s) => s.setActiveSection);
  const library          = useButuStore((s) => s.library);

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

function SearchView({ onSelect }: { onSelect: (item: MediaItem) => void }) {
  const [query, setQuery]    = useState("");
  const source               = useButuStore((s) => s.library);
  const results = query.length > 1
    ? source.filter((i) =>
        i.title.toLowerCase().includes(query.toLowerCase()) ||
        i.artist?.toLowerCase().includes(query.toLowerCase()) ||
        i.genre?.some((g) => g.toLowerCase().includes(query.toLowerCase()))
      )
    : [];

  return (
    <div className="px-4 sm:px-8 lg:px-20 pt-10">
      <h1 className="font-display font-black text-on_surface mb-8" style={{ fontSize: "clamp(2rem, 3.5vw, 3rem)" }}>
        Search
      </h1>
      <div
        className="relative mb-10"
        style={{ maxWidth: 640 }}
      >
        <svg
          className="absolute left-5 top-1/2 -translate-y-1/2"
          width="20" height="20" viewBox="0 0 24 24"
          fill="none" stroke="#9aa3b4" strokeWidth="2"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search titles, artists, genres…"
          className="w-full pl-14 pr-6 py-4 rounded-xl font-body text-on_surface placeholder-on_surface_variant text-lg"
          style={{
            background: "rgba(22,26,38,0.8)",
            border: "1px solid rgba(46,52,71,0.4)",
            
            cursor: "none",
            caretColor: "#99f7ff",
          }}
          autoFocus
        />
      </div>

      {results.length > 0 && (
        <MediaStage title={`Results for "${query}"`} items={results} onSelect={onSelect} />
      )}

      {query.length > 1 && results.length === 0 && (
        <div className="text-center py-16">
          <p className="font-display font-bold text-on_surface_variant text-xl">No results found</p>
          <p className="font-body text-on_surface_variant text-sm mt-2">Try a different search term</p>
        </div>
      )}

      {query.length === 0 && (
        <div>
          <p className="font-mono-tech text-on_surface_variant text-xs mb-6">BROWSE BY GENRE</p>
          <div className="flex flex-wrap gap-3">
            {["Action", "Drama", "Sci-Fi", "Thriller", "Electronic", "R&B", "Hip-Hop", "Post-Apocalyptic"].map((genre) => (
              <button
                key={genre}
                data-magnetic
                data-magnetic-id={`genre-${genre}`}
                onClick={() => setQuery(genre)}
                className="px-5 py-2.5 rounded-full font-body text-sm"
                style={{
                  background: "rgba(28,52,55,0.6)",
                  color: "#b2ccd0",
                  border: "1px solid rgba(46,52,71,0.3)",
                  cursor: "none",
                }}
              >
                {genre}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SettingSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-7 max-w-2xl">
      <p className="font-mono-tech text-xs tracking-[0.22em] mb-3" style={{ color: "rgba(153,247,255,0.55)" }}>{title}</p>
      <div className="grid gap-3">{children}</div>
    </div>
  );
}

function ToggleRow({ label, sub, value, onChange }: { label: string; sub: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      data-magnetic
      data-magnetic-id={`toggle-${label}`}
      onClick={() => onChange(!value)}
      className="flex items-center justify-between p-5 rounded-xl"
      style={{ background: "rgba(22,26,38,0.7)", border: "1px solid rgba(46,52,71,0.3)", cursor: "pointer" }}
    >
      <div className="pr-4">
        <p className="font-display font-semibold text-on_surface text-base">{label}</p>
        <p className="font-body text-on_surface_variant text-sm mt-0.5">{sub}</p>
      </div>
      <div
        className="relative flex-shrink-0"
        style={{
          width: 46, height: 26, borderRadius: 999,
          background: value ? "linear-gradient(135deg,#99f7ff,#00f1fe)" : "rgba(255,255,255,0.08)",
          border: "1px solid " + (value ? "rgba(153,247,255,0.4)" : "rgba(255,255,255,0.1)"),
          transition: "background 0.2s",
        }}
      >
        <motion.span
          animate={{ x: value ? 22 : 2 }}
          transition={{ type: "spring", stiffness: 500, damping: 32 }}
          style={{ position: "absolute", top: 2, width: 20, height: 20, borderRadius: "50%", background: value ? "#001f24" : "#9aa3b4" }}
        />
      </div>
    </div>
  );
}

/**
 * Explicit "Reload library" action with a real button and visible state machine
 * (idle → syncing spinner → "Updated ✓"), rather than a row that looks like navigation.
 */
function ReloadLibraryRow({ count, isLoading, onReload }: { count: number; isLoading: boolean; onReload: () => void }) {
  const [phase, setPhase] = useState<"idle" | "syncing" | "done">("idle");
  const sawLoading = useRef(false);

  // Watch the global load flag: once a sync we started actually begins and then
  // finishes, flip to the "done" confirmation.
  useEffect(() => {
    if (phase !== "syncing") return;
    if (isLoading) { sawLoading.current = true; return; }
    if (sawLoading.current) { sawLoading.current = false; setPhase("done"); }
  }, [isLoading, phase]);

  // Auto-dismiss "done", and a safety net so "syncing" can never get stuck.
  useEffect(() => {
    if (phase === "done") {
      const t = setTimeout(() => setPhase("idle"), 1800);
      return () => clearTimeout(t);
    }
    if (phase === "syncing") {
      const t = setTimeout(() => { sawLoading.current = false; setPhase("idle"); }, 15000);
      return () => clearTimeout(t);
    }
  }, [phase]);

  const busy = phase === "syncing" || isLoading;
  const click = () => {
    if (busy) return;
    sawLoading.current = false;
    setPhase("syncing");
    onReload();
  };

  const btn =
    phase === "done"
      ? { text: "Updated", bg: "rgba(70,220,140,0.14)", fg: "#5ee0a0", bd: "rgba(70,220,140,0.35)" }
      : busy
      ? { text: "Syncing…", bg: "rgba(153,247,255,0.10)", fg: "#99f7ff", bd: "rgba(153,247,255,0.30)" }
      : { text: "Reload now", bg: "rgba(153,247,255,0.12)", fg: "#99f7ff", bd: "rgba(153,247,255,0.30)" };

  return (
    <div className="flex items-center justify-between p-6 rounded-xl"
      style={{ background: "rgba(22,26,38,0.7)", border: "1px solid rgba(46,52,71,0.3)" }}
    >
      <div>
        <p className="font-display font-semibold text-on_surface text-base">Reload library</p>
        <p className="font-body text-on_surface_variant text-sm mt-0.5">
          {count} items loaded · re-fetch everything from your server
        </p>
      </div>
      <motion.button
        data-magnetic
        data-magnetic-id="settings-reload"
        onClick={click}
        disabled={busy && phase !== "done"}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-body text-sm font-semibold"
        style={{ background: btn.bg, color: btn.fg, border: `1px solid ${btn.bd}`, cursor: "none" }}
        whileHover={busy ? {} : { scale: 1.03 }}
        whileTap={busy ? {} : { scale: 0.97 }}
      >
        {phase === "syncing" || isLoading ? (
          <motion.span
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, ease: "linear", duration: 0.8 }}
            style={{ display: "inline-block", width: 14, height: 14, borderRadius: "50%",
              border: "2px solid rgba(153,247,255,0.3)", borderTopColor: "#99f7ff" }}
          />
        ) : phase === "done" ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#5ee0a0" strokeWidth="3">
            <polyline points="20,6 9,17 4,12" />
          </svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#99f7ff" strokeWidth="2">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        )}
        {btn.text}
      </motion.button>
    </div>
  );
}

function SettingRow({ label, meta, sub, onClick }: { label: string; meta: string; sub: string; onClick?: () => void }) {
  return (
    <motion.div
      data-magnetic
      data-magnetic-id={`settings-${label}`}
      onClick={onClick}
      className="flex items-center justify-between p-6 rounded-xl"
      style={{
        background: "rgba(22,26,38,0.7)",
        border: "1px solid rgba(46,52,71,0.3)",
        cursor: onClick ? "pointer" : "none",
      }}
      whileHover={onClick ? { background: "rgba(30,35,48,0.9)", borderColor: "rgba(153,247,255,0.15)" } : {}}
      transition={{ duration: 0.2 }}
    >
      <div>
        <p className="font-display font-semibold text-on_surface text-base">{label}</p>
        <p className="font-body text-on_surface_variant text-sm mt-0.5">{sub}</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-mono-tech text-primary text-xs">{meta}</span>
        {onClick && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9aa3b4" strokeWidth="2">
            <polyline points="9,18 15,12 9,6" />
          </svg>
        )}
      </div>
    </motion.div>
  );
}

function SettingsView() {
  const { t, i18n } = useTranslation();
  const plexConfig        = useButuStore((s) => s.plexConfig);
  const jellyfinConfig    = useButuStore((s) => s.jellyfinConfig);
  const serverType        = useButuStore((s) => s.serverType);
  const setPlexConfig     = useButuStore((s) => s.setPlexConfig);
  const setJellyfinConfig = useButuStore((s) => s.setJellyfinConfig);
  const setServerType     = useButuStore((s) => s.setServerType);
  const setLibrary        = useButuStore((s) => s.setLibrary);
  const storeLibrary      = useButuStore((s) => s.library);
  const settings          = useButuStore((s) => s.settings);
  const updateSettings    = useButuStore((s) => s.updateSettings);
  const clearWatchProgress = useButuStore((s) => s.clearWatchProgress);
  const refreshLibrary    = useButuStore((s) => s.refreshLibrary);
  const isLoading         = useButuStore((s) => s.jellyfinLoading);
  const [showMarkerDetect, setShowMarkerDetect] = useState(false);
  const [showDonate, setShowDonate] = useState(false);
  const [cleared, setCleared] = useState(false);

  const active = serverType === "plex" ? plexConfig : serverType === "jellyfin" ? jellyfinConfig : null;
  const serverLabel = serverType === "plex" ? "PLEX" : "JELLYFIN";

  const disconnect = () => {
    setPlexConfig(null);
    setJellyfinConfig(null);
    setLibrary([]);
    setServerType(null); // → returns to the setup screen
  };

  return (
    <div className="px-4 sm:px-8 lg:px-20 pt-10 pb-20">
      <h1 className="font-display font-black text-on_surface mb-8" style={{ fontSize: "clamp(2rem, 3.5vw, 3rem)" }}>
        {t("settings.title")}
      </h1>

      {active && (
        <div className="mb-8 p-6 rounded-2xl max-w-2xl"
          style={{ background: "rgba(22,26,38,0.7)", border: "1px solid rgba(153,247,255,0.1)" }}
        >
          <p className="font-mono-tech text-xs text-on_surface_variant mb-1">{serverLabel} SERVER</p>
          <p className="font-display font-semibold text-on_surface" style={{ wordBreak: "break-all" }}>{active.serverUrl}</p>
          <p className="font-body text-on_surface_variant text-sm mt-0.5">
            {active.userName ? <>Signed in as <span style={{ color: "#99f7ff" }}>{active.userName}</span></> : "Connected"}
            {storeLibrary.length > 0 && ` · ${storeLibrary.length} items`}
          </p>
          <motion.button
            onClick={disconnect}
            className="mt-4 px-5 py-2 rounded-xl font-body text-sm"
            style={{ background: "rgba(255,80,80,0.1)", color: "#ff6b6b", border: "1px solid rgba(255,80,80,0.2)", cursor: "none" }}
            whileHover={{ background: "rgba(255,80,80,0.18)" }}
            whileTap={{ scale: 0.97 }}
          >
            Disconnect
          </motion.button>
        </div>
      )}

      <SettingSection title={t("settings.language", "LANGUAGE").toUpperCase()}>
        <SettingRow 
          label={t("settings.english")} 
          meta={i18n.language.startsWith('en') ? "ACTIVE" : ""} 
          sub="Switch language to English" 
          onClick={() => i18n.changeLanguage('en')} 
        />
        <SettingRow 
          label={t("settings.french")} 
          meta={i18n.language.startsWith('fr') ? "ACTIVE" : ""} 
          sub="Changer la langue en Français" 
          onClick={() => i18n.changeLanguage('fr')} 
        />
      </SettingSection>

      <SettingSection title="PLAYBACK">
        <ToggleRow label="Auto-skip intros" sub="Jump past detected intro markers automatically"
          value={settings.autoSkipIntro} onChange={(v) => updateSettings({ autoSkipIntro: v })} />
        <ToggleRow label="Auto-skip credits" sub="Jump past end-credits automatically"
          value={settings.autoSkipCredits} onChange={(v) => updateSettings({ autoSkipCredits: v })} />
        <ToggleRow label="Auto-play next episode" sub="Continue to the next episode when one ends"
          value={settings.autoPlayNext} onChange={(v) => updateSettings({ autoPlayNext: v })} />
        <ToggleRow label="Boost voices" sub="Downmix surround to stereo and lift dialogue so speech isn't drowned out by effects"
          value={settings.boostVoices} onChange={(v) => updateSettings({ boostVoices: v })} />
      </SettingSection>

      <SettingSection title="HOME SCREEN">
        <ToggleRow label="Featured hero" sub="Show the large rotating banner at the top of Home"
          value={settings.showHero} onChange={(v) => updateSettings({ showHero: v })} />
        <ToggleRow label="Continue Watching" sub="Show the resume rail on the Home screen"
          value={settings.showContinueWatching} onChange={(v) => updateSettings({ showContinueWatching: v })} />
      </SettingSection>

      <SettingSection title="LIBRARY">
        <ReloadLibraryRow count={storeLibrary.length} isLoading={isLoading} onReload={refreshLibrary} />
        <SettingRow label="Clear watch history" meta={cleared ? "CLEARED" : "RESET"}
          sub="Remove all saved playback positions and Continue Watching"
          onClick={() => { clearWatchProgress(); setCleared(true); }} />
      </SettingSection>

      <SettingSection title="COMPANION">
        <SettingRow label="Marker Auto-Detect" meta="INTROS + CREDITS"
          sub="Fingerprint your library and contribute markers to the Butu cloud DB"
          onClick={() => setShowMarkerDetect(true)} />
        <SettingRow label="Air Mouse" meta="COMING SOON"
          sub="Gyroscopic phone remote — coming soon" />
      </SettingSection>

      {DONATE_ENABLED && (
        <SettingSection title="SUPPORT">
          <SettingRow label="Support Butu" meta="DONATE"
            sub="Butu is free. If it's useful to you, you can support development ❤"
            onClick={() => setShowDonate(true)} />
        </SettingSection>
      )}

      <AnimatePresence>
        {showMarkerDetect && <MarkerAutoDetectModal onClose={() => setShowMarkerDetect(false)} />}
        {showDonate && <DonateModal onClose={() => setShowDonate(false)} />}
      </AnimatePresence>

      <div className="mt-10 max-w-2xl">
        <p className="font-mono-tech text-on_surface_variant text-xs mb-1">BUTU v0.1.0</p>
        <p className="font-mono-tech text-on_surface_variant text-xs opacity-50">
          Crowdsourced intro/credits markers · Tauri · React
        </p>
      </div>
    </div>
  );
}
