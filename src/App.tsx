import { useState, useCallback, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LiquidCursor } from "./components/LiquidCursor";
import { NavigationSidebar } from "./components/NavigationSidebar";
import { HeroCarousel } from "./components/HeroCarousel";
import { MediaStage } from "./components/MediaStage";
import { ButuPlayer } from "./components/ButuPlayer";
import { ContentDetailPage } from "./components/ContentDetailPage";
import { JellyfinSetup } from "./components/JellyfinSetup";
import { useSpatialCursor } from "./hooks/useSpatialCursor";
import { useWebSocketBridge } from "./hooks/useWebSocketBridge";
import { useButuStore } from "./store/useButuStore";
import { mockLibrary, heroSlides } from "./data/mockLibrary";
import {
  fetchLibrary,
  fetchEpisodes,
  rawToMediaItem,
  rawToEpisode,
} from "./services/jellyfinApi";
import type { MediaItem } from "./types";

function useFilteredLibrary() {
  const activeSection  = useButuStore((s) => s.activeSection);
  const storeLibrary   = useButuStore((s) => s.library);
  const jellyfinConfig = useButuStore((s) => s.jellyfinConfig);

  const source = jellyfinConfig && storeLibrary.length > 0 ? storeLibrary : mockLibrary;

  const movies = source.filter((i) => i.type === "movie");
  const music  = source.filter((i) => i.type === "music");
  const tv     = source.filter((i) => i.type === "tv");
  const anime  = source.filter((i) => i.type === "anime");
  const manga  = source.filter((i) => i.type === "manga");

  if (activeSection === "movies") return { movies, music: [], tv: [], anime: [], manga: [], source };
  if (activeSection === "music")  return { movies: [], music, tv: [], anime: [], manga: [], source };
  if (activeSection === "tv")     return { movies: [], music: [], tv, anime: [], manga: [], source };
  if (activeSection === "anime")  return { movies: [], music: [], tv: [], anime, manga: [], source };
  if (activeSection === "manga")  return { movies: [], music: [], tv: [], anime: [], manga, source };
  return { movies, music, tv, anime, manga, source };
}

export default function App() {
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [playerMedia,   setPlayerMedia]   = useState<MediaItem | null>(null);
  const [playerInitialTime, setPlayerInitialTime] = useState<number>(0);
  const activeSection    = useButuStore((s) => s.activeSection);
  const setWatchProgress = useButuStore((s) => s.setWatchProgress);
  const jellyfinConfig   = useButuStore((s) => s.jellyfinConfig);
  const setLibrary       = useButuStore((s) => s.setLibrary);
  const setJellyfinLoading = useButuStore((s) => s.setJellyfinLoading);
  const setJellyfinError   = useButuStore((s) => s.setJellyfinError);

  useEffect(() => {
    if (!jellyfinConfig) return;
    let cancelled = false;
    async function load() {
      setJellyfinLoading(true);
      setJellyfinError(null);
      try {
        const [movies, series] = await Promise.all([
          fetchLibrary(jellyfinConfig!, ["Movie"]),
          fetchLibrary(jellyfinConfig!, ["Series"]),
        ]);
        if (cancelled) return;
        const movieItems = movies.map((r) => rawToMediaItem(r, jellyfinConfig!));
        const tvItems = await Promise.all(
          series.map(async (r) => {
            const item = rawToMediaItem(r, jellyfinConfig!);
            try {
              const eps = await fetchEpisodes(jellyfinConfig!, r.Id);
              item.episodes = eps.map(rawToEpisode);
            } catch { /* no episodes */ }
            return item;
          })
        );
        if (!cancelled) setLibrary([...movieItems, ...tvItems]);
      } catch (e) {
        if (!cancelled) setJellyfinError(e instanceof Error ? e.message : "Failed to load library");
      } finally {
        if (!cancelled) setJellyfinLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [jellyfinConfig, setLibrary, setJellyfinLoading, setJellyfinError]);

  const { updateFromIMU } = useSpatialCursor();

  const handleIMUCoords = useCallback(
    (x: number, y: number) => updateFromIMU(x, y),
    [updateFromIMU]
  );

  const handlePhysicalClick = useCallback(() => {
    const focused = document.querySelector<HTMLElement>("[data-magnetic]:hover");
    focused?.click();
  }, []);

  useWebSocketBridge(handleIMUCoords, handlePhysicalClick);

  const { movies, music, tv, anime, manga, source } = useFilteredLibrary();

  const handleSelect = useCallback((item: MediaItem) => {
    setSelectedMedia(item);
  }, []);

  const handlePlay = useCallback((item: MediaItem, initialTime?: number) => {
    setPlayerInitialTime(initialTime ?? 0);
    setPlayerMedia(item);
    setSelectedMedia(null);
  }, []);

  const handleClosePlayer = useCallback(
    (progress?: { time: number; season?: number; episode?: number }) => {
      if (progress && playerMedia && progress.time > 5) {
        setWatchProgress(playerMedia.id, {
          time: progress.time,
          season: progress.season,
          episode: progress.episode,
        });
      }
      setPlayerMedia(null);
    },
    [playerMedia, setWatchProgress]
  );

  if (!jellyfinConfig) {
    return <JellyfinSetup />;
  }

  return (
    <div
      className="w-screen h-screen overflow-hidden relative"
      style={{ background: "#000000" }}
    >
      <LiquidCursor />
      <NavigationSidebar />

      <main
        className="h-full overflow-y-auto scrollbar-hide"
        style={{ paddingLeft: 92 }}
      >
        {activeSection === "home" && (
          <div className="relative h-[55vh] min-h-[480px] mb-12 flex-shrink-0">
            <HeroCarousel items={heroSlides} onSelect={handleSelect} />
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
              {movies.length > 0 && (
                <MediaStage
                  title="Cinema"
                  items={movies}
                  onSelect={handleSelect}
                  metaLabel="MOVIES · FILM LIBRARY"
                />
              )}
              {tv.length > 0 && (
                <MediaStage
                  title="Prestige Television"
                  items={tv}
                  onSelect={handleSelect}
                  metaLabel="TV SERIES · EPISODES"
                />
              )}
              {anime.length > 0 && (
                <MediaStage
                  title="Anime"
                  items={anime}
                  onSelect={handleSelect}
                  metaLabel="ANIME · SEASONS"
                />
              )}
              {manga.length > 0 && (
                <MediaStage
                  title="Manga"
                  items={manga}
                  onSelect={handleSelect}
                  metaLabel="MANGA · VOLUMES"
                />
              )}
              {music.length > 0 && (
                <MediaStage
                  title="Sound Stage"
                  items={music}
                  onSelect={handleSelect}
                  metaLabel="MUSIC · ALBUMS"
                />
              )}
            </>
          )}

          {activeSection === "movies" && movies.length > 0 && (
            <div className="pt-8">
              <div className="px-20 mb-8">
                <h1 className="font-display font-black text-on_surface" style={{ fontSize: "clamp(2rem, 3.5vw, 3rem)" }}>
                  Cinema
                </h1>
                <p className="font-mono-tech text-on_surface_variant text-sm mt-1">
                  {movies.length} TITLES · FILM LIBRARY
                </p>
              </div>
              <MediaStage title="All Movies" items={movies} onSelect={handleSelect} />
            </div>
          )}

          {activeSection === "anime" && anime.length > 0 && (
            <div className="pt-8">
              <div className="px-20 mb-8">
                <h1 className="font-display font-black text-on_surface" style={{ fontSize: "clamp(2rem, 3.5vw, 3rem)" }}>
                  Anime
                </h1>
                <p className="font-mono-tech text-on_surface_variant text-sm mt-1">
                  {anime.length} SERIES · SEASONS & EPISODES
                </p>
              </div>
              <MediaStage title="All Anime" items={anime} onSelect={handleSelect} />
            </div>
          )}

          {activeSection === "manga" && manga.length > 0 && (
            <div className="pt-8">
              <div className="px-20 mb-8">
                <h1 className="font-display font-black text-on_surface" style={{ fontSize: "clamp(2rem, 3.5vw, 3rem)" }}>
                  Manga
                </h1>
                <p className="font-mono-tech text-on_surface_variant text-sm mt-1">
                  {manga.length} TITLES · VOLUMES
                </p>
              </div>
              <MediaStage title="All Manga" items={manga} onSelect={handleSelect} />
            </div>
          )}

          {activeSection === "music" && music.length > 0 && (
            <div className="pt-8">
              <div className="px-20 mb-8">
                <h1 className="font-display font-black text-on_surface" style={{ fontSize: "clamp(2rem, 3.5vw, 3rem)" }}>
                  Sound Stage
                </h1>
                <p className="font-mono-tech text-on_surface_variant text-sm mt-1">
                  {music.length} ALBUMS · HI-FI AUDIO
                </p>
              </div>
              <MediaStage title="Albums" items={music} onSelect={handleSelect} />
            </div>
          )}

          {activeSection === "tv" && tv.length > 0 && (
            <div className="pt-8">
              <div className="px-20 mb-8">
                <h1 className="font-display font-black text-on_surface" style={{ fontSize: "clamp(2rem, 3.5vw, 3rem)" }}>
                  Prestige Television
                </h1>
                <p className="font-mono-tech text-on_surface_variant text-sm mt-1">
                  {tv.length} SERIES · STREAMING QUALITY
                </p>
              </div>
              <MediaStage title="Series" items={tv} onSelect={handleSelect} />
            </div>
          )}

          {activeSection === "search" && (
            <SearchView onSelect={handleSelect} />
          )}

          {activeSection === "settings" && (
            <SettingsView />
          )}

          {activeSection === "home" && movies.length === 0 && tv.length === 0 && anime.length === 0 && (
            <JellyfinLoadingBanner />
          )}
        </motion.div>
      </main>

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
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function JellyfinLoadingBanner() {
  const loading = useButuStore((s) => s.jellyfinLoading);
  const error   = useButuStore((s) => s.jellyfinError);
  if (!loading && !error) return null;
  return (
    <div className="px-20 py-6">
      {loading && (
        <p className="font-mono-tech text-on_surface_variant text-sm animate-pulse">
          Loading library from Jellyfin…
        </p>
      )}
      {error && (
        <p className="font-mono-tech text-sm" style={{ color: "#ff6b6b" }}>
          ⚠ {error}
        </p>
      )}
    </div>
  );
}

function SearchView({ onSelect }: { onSelect: (item: MediaItem) => void }) {
  const [query, setQuery]    = useState("");
  const storeLibrary         = useButuStore((s) => s.library);
  const jellyfinConfig       = useButuStore((s) => s.jellyfinConfig);
  const source = jellyfinConfig && storeLibrary.length > 0 ? storeLibrary : mockLibrary;
  const results = query.length > 1
    ? source.filter((i) =>
        i.title.toLowerCase().includes(query.toLowerCase()) ||
        i.artist?.toLowerCase().includes(query.toLowerCase()) ||
        i.genre?.some((g) => g.toLowerCase().includes(query.toLowerCase()))
      )
    : [];

  return (
    <div className="px-20 pt-10">
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
            backdropFilter: "blur(20px)",
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

function SettingsView() {
  const jellyfinConfig    = useButuStore((s) => s.jellyfinConfig);
  const setJellyfinConfig = useButuStore((s) => s.setJellyfinConfig);
  const storeLibrary      = useButuStore((s) => s.library);

  return (
    <div className="px-20 pt-10 pb-20">
      <h1 className="font-display font-black text-on_surface mb-8" style={{ fontSize: "clamp(2rem, 3.5vw, 3rem)" }}>
        Settings
      </h1>

      {jellyfinConfig && (
        <div className="mb-8 p-6 rounded-2xl max-w-2xl"
          style={{ background: "rgba(22,26,38,0.7)", border: "1px solid rgba(153,247,255,0.1)" }}
        >
          <p className="font-mono-tech text-xs text-on_surface_variant mb-1">JELLYFIN SERVER</p>
          <p className="font-display font-semibold text-on_surface">{jellyfinConfig.serverUrl}</p>
          <p className="font-body text-on_surface_variant text-sm mt-0.5">
            Signed in as <span style={{ color: "#99f7ff" }}>{jellyfinConfig.userName}</span>
            {storeLibrary.length > 0 && ` · ${storeLibrary.length} items`}
          </p>
          <motion.button
            onClick={() => setJellyfinConfig(null)}
            className="mt-4 px-5 py-2 rounded-xl font-body text-sm"
            style={{
              background: "rgba(255,80,80,0.1)",
              color: "#ff6b6b",
              border: "1px solid rgba(255,80,80,0.2)",
              cursor: "none",
            }}
            whileHover={{ background: "rgba(255,80,80,0.18)" }}
            whileTap={{ scale: 0.97 }}
          >
            Disconnect
          </motion.button>
        </div>
      )}

      <div className="grid gap-4 max-w-2xl">
        {[
          { label: "Display", meta: "4K · HDR · Dolby Vision", sub: "Output resolution and color space" },
          { label: "Audio", meta: "FLAC · Dolby Atmos", sub: "Audio output and format preferences" },
          { label: "Air Mouse", meta: "WebSocket · Port 9001", sub: "Gyroscope spatial controller connection" },
          { label: "Library", meta: jellyfinConfig ? `${storeLibrary.length} ITEMS` : "MOCK DATA", sub: "Media scanning and indexing" },
          { label: "Appearance", meta: "BUTU DARK", sub: "Theme and interface customization" },
        ].map((s) => (
          <motion.div
            key={s.label}
            data-magnetic
            data-magnetic-id={`settings-${s.label}`}
            className="flex items-center justify-between p-6 rounded-xl"
            style={{
              background: "rgba(22,26,38,0.7)",
              border: "1px solid rgba(46,52,71,0.3)",
              backdropFilter: "blur(20px)",
              cursor: "none",
            }}
            whileHover={{
              background: "rgba(30,35,48,0.9)",
              borderColor: "rgba(153,247,255,0.15)",
            }}
            transition={{ duration: 0.2 }}
          >
            <div>
              <p className="font-display font-semibold text-on_surface text-base">{s.label}</p>
              <p className="font-body text-on_surface_variant text-sm mt-0.5">{s.sub}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono-tech text-primary text-xs">{s.meta}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9aa3b4" strokeWidth="2">
                <polyline points="9,18 15,12 9,6" />
              </svg>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-16">
        <p className="font-mono-tech text-on_surface_variant text-xs mb-2">BUTU v0.1.0</p>
        <p className="font-mono-tech text-on_surface_variant text-xs opacity-50">
          Tauri · Rust · React · TypeScript
        </p>
      </div>
    </div>
  );
}
