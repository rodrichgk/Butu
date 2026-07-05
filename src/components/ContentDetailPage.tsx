import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { MediaItem, Episode } from "../types";
import { useConfigStore } from "../store/useConfigStore";
import { useLibraryStore } from "../store/useLibraryStore";
import { useEpisodesQuery } from "../hooks/useEpisodesQuery";
import { useTranslation } from "react-i18next";

function fmt(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function fmtDur(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

interface Props {
  item: MediaItem;
  // playlist: the ordered list of playable items for this title, so the player
  // can auto-advance to the next episode when one finishes.
  onPlay: (item: MediaItem, initialTime?: number, playlist?: MediaItem[]) => void;
  onClose: () => void;
}

export function ContentDetailPage({ item, onPlay, onClose }: Props) {
  const watchProgress = useLibraryStore((s) => s.watchProgress);
  const plexConfig    = useConfigStore((s) => s.plexConfig);
  // Movie / non-episodic resume point (keyed by the title's own id).
  const prog = watchProgress[item.id];

  const { data: loadedEpisodes = [], isLoading: episodesLoading } = useEpisodesQuery(item);
  const playBtnRef = useRef<HTMLButtonElement>(null);
  const { t } = useTranslation();

  // Auto-focus Play button when page opens so remote works immediately
  useEffect(() => {
    const t = setTimeout(() => playBtnRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [item.id]);

  // Pre-warm the Plex/Jellyfin session: fetch the stream manifest now so the
  // server starts generating HLS segments. By the time the user presses play,
  // several seconds of segments are already buffered on the server side.
  useEffect(() => {
    const src = item.streamUrl ?? (item as any).url;
    if (!src) return;
    const controller = new AbortController();
    fetch(src, { signal: controller.signal })
      .then((res) => {
        // Read and discard the manifest body — just need the server to start
        res.text().catch(() => {});
      })
      .catch(() => {}); // AbortError and network errors are both fine here
    return () => controller.abort();
  }, [item.id, item.streamUrl]);

  // Episodes in a stable play order (season, then episode number) — used for
  // the season grid, the resume lookup, and the auto-next playlist.
  const sortedEps = useMemo(
    () => [...loadedEpisodes].sort((a, b) => a.season - b.season || a.episode - b.episode),
    [loadedEpisodes]
  );
  const episodes = sortedEps;

  const isEpisodic =
    (item.type === "tv" || item.type === "anime") &&
    (!!episodes.length || episodesLoading);

  const seasons = episodes.length
    ? [...new Set(episodes.map((e) => e.season))].sort((a, b) => a - b)
    : [];

  // The show's most-recently-watched, not-yet-finished episode. Progress is
  // stored per episode (keyed by episode id), so we scan this show's episodes
  // and pick the one with the newest updatedAt. Drives the "Continue · SxEy"
  // button and the "Watching" badge.
  const lastWatched = useMemo(() => {
    let best: { ep: Episode; time: number } | null = null;
    let bestAt = -1;
    for (const ep of episodes) {
      const p = watchProgress[ep.id];
      if (!p || p.time <= 5) continue;
      if (ep.duration && p.time > ep.duration * 0.95) continue; // finished
      const at = p.updatedAt ?? 0;
      if (at > bestAt) { bestAt = at; best = { ep, time: p.time }; }
    }
    return best;
  }, [episodes, watchProgress]);

  const [activeSeason, setActiveSeason] = useState(
    lastWatched?.ep.season ?? seasons[0] ?? 1
  );

  const seasonEps = episodes.filter((e) => e.season === activeSeason);

  // Merge a show with one of its episodes into a directly-playable MediaItem.
  // Keeps the show id around as seriesId so progress can be attributed back to
  // this show in Continue Watching.
  const toPlayable = useCallback(
    (ep: Episode): MediaItem => ({
      ...item,
      id: ep.id, // stream the episode, not the show
      seriesId: item.id,
      season: ep.season,
      episode: ep.episode,
      duration: ep.duration,
      streamUrl: ep.streamUrl,
      plexPartKey: ep.url,
    }),
    [item]
  );

  const handlePlayEpisode = useCallback(
    (ep: Episode, opts?: { restart?: boolean }) => {
      const p = watchProgress[ep.id];
      const resume =
        !opts?.restart && p && p.time > 5 && (!ep.duration || p.time < ep.duration * 0.95)
          ? p.time
          : undefined;
      onPlay(toPlayable(ep), resume, episodes.map(toPlayable));
    },
    [episodes, watchProgress, toPlayable, onPlay]
  );

  const handleMainPlay = useCallback(() => {
    if (isEpisodic) {
      if (lastWatched) { handlePlayEpisode(lastWatched.ep); return; }
      if (episodes[0]) { handlePlayEpisode(episodes[0]); return; }
      return;
    }
    onPlay(item, prog?.time);
  }, [isEpisodic, lastWatched, episodes, handlePlayEpisode, item, prog, onPlay]);

  const accent = item.ambientColor ?? "#99f7ff";

  const canResume = isEpisodic ? !!lastWatched : !!prog;

  const resumeLabel = isEpisodic
    ? lastWatched
      ? t('detail.continue_s_e_time', { season: lastWatched.ep.season, episode: lastWatched.ep.episode, time: fmt(lastWatched.time) })
      : t('detail.play_from_s1_e1')
    : prog
    ? t('detail.resume_time', { time: fmt(prog.time) })
    : t('detail.play');

  return (
    <motion.div
      className="fixed inset-0 z-40 overflow-y-auto scrollbar-hide"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      style={{ background: "#000" }}
    >
      {/* ── Backdrop ─────────────────────────────────── */}
      <div className="fixed inset-0" style={{ zIndex: 0 }}>
        <img
          src={item.backdropUrl ?? item.thumbnail}
          className="w-full h-full object-cover"
          style={{
            opacity: item.backdropUrl ? 0.22 : 0.08,
            filter: item.backdropUrl ? "none" : "blur(24px)",
            transform: item.backdropUrl ? "none" : "scale(1.1)",
          }}
          decoding="async"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.38) 0%, rgba(0,0,0,0.72) 38%, rgba(0,0,0,0.97) 100%)",
          }}
        />
      </div>

      {/* ── Content ──────────────────────────────────── */}
      <div className="relative" style={{ zIndex: 1 }}>
        {/* Back bar */}
        <div className="px-4 sm:px-8 lg:px-20 pt-8 pb-2">
          <motion.button
            onClick={onClose}
            className="focusable flex items-center gap-2"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClose();
              }
            }}
            data-magnetic
            data-magnetic-id="detail-back"
            style={{ color: "rgba(224,230,240,0.55)", cursor: "none" }}
            whileHover={{ color: "#e0e6f0" }}
            whileFocus={{ color: "#e0e6f0", scale: 1.05 }}
            whileTap={{ scale: 0.97 }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="15,18 9,12 15,6" />
            </svg>
            <span className="font-body text-sm">{t('detail.back')}</span>
          </motion.button>
        </div>

        {/* Hero */}
        <div className="px-4 sm:px-8 lg:px-20 pt-6 pb-12 flex flex-col md:flex-row gap-6 md:gap-10 items-start">
          {/* Poster */}
          <motion.div
            className="flex-shrink-0 overflow-hidden rounded-[18px] md:rounded-2xl w-36 sm:w-44 md:w-[200px] mx-auto sm:mx-0"
            style={{
              boxShadow: `0 0 48px 8px ${accent}22, 0 24px 64px rgba(0,0,0,0.8)`,
            }}
            initial={{ opacity: 0, scale: 0.93 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          >
            <img
              src={item.thumbnail}
              alt={item.title}
              style={{
                width: "100%",
                aspectRatio: "2/3",
                objectFit: "cover",
                display: "block",
              }}
              onError={(e) => {
                const img = e.target as HTMLImageElement;
                img.onerror = null; // avoid a loop
                // Neutral dark poster — not a random stock photo (which looked like the wrong title).
                img.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 600'%3E%3Crect width='400' height='600' fill='%23121521'/%3E%3C/svg%3E";
              }}
            />
          </motion.div>

          {/* Info */}
          <div className="flex-1 pt-2">
            <motion.h1
              className="font-display font-black text-white mb-3"
              style={{ fontSize: "clamp(2rem, 3vw, 3.25rem)", lineHeight: 1.08 }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            >
              {item.title}
            </motion.h1>

            {/* Meta row */}
            <motion.div
              className="flex flex-wrap items-center gap-3 mb-5"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.13 }}
            >
              {item.year && (
                <span className="font-mono-tech text-on_surface_variant text-sm">
                  {item.year}
                </span>
              )}
              {item.rating && (
                <span
                  className="font-mono-tech text-sm font-bold"
                  style={{ color: accent }}
                >
                  ★ {item.rating.toFixed(1)}
                </span>
              )}
              {item.duration && !isEpisodic && (
                <span className="font-mono-tech text-on_surface_variant text-sm">
                  {fmtDur(item.duration)}
                </span>
              )}
              {isEpisodic && (
                <span className="font-mono-tech text-on_surface_variant text-sm">
                  {episodesLoading
                    ? t('detail.loading_episodes')
                    : `${t(seasons.length > 1 ? 'detail.season_count_other' : 'detail.season_count_one', { count: seasons.length })} · ${t('detail.episodes_count', { count: episodes.length })}`}
                </span>
              )}
              {item.genre?.slice(0, 3).map((g) => (
                <span
                  key={g}
                  className="font-body text-xs px-2.5 py-1 rounded-full"
                  style={{
                    background: "rgba(153,247,255,0.06)",
                    color: "rgba(224,230,240,0.6)",
                    border: "1px solid rgba(153,247,255,0.1)",
                  }}
                >
                  {g}
                </span>
              ))}
            </motion.div>

            {/* Description */}
            {item.description && (
              <motion.p
                className="font-body text-on_surface_variant leading-relaxed mb-6"
                style={{ maxWidth: 560, fontSize: "0.95rem", lineHeight: 1.65 }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.18 }}
              >
                {item.description}
              </motion.p>
            )}

            {/* Tech specs */}
            {(item.resolution || item.codec || item.bitrate) && (
              <motion.div
                className="flex flex-wrap items-center gap-2 mb-8"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.22 }}
              >
                {item.resolution && (
                  <span
                    className="font-mono-tech text-xs px-2.5 py-1 rounded"
                    style={{
                      background: "rgba(153,247,255,0.07)",
                      color: "#99f7ff",
                      border: "1px solid rgba(153,247,255,0.14)",
                    }}
                  >
                    {item.resolution}
                  </span>
                )}
                {item.codec && (
                  <span
                    className="font-mono-tech text-xs px-2.5 py-1 rounded"
                    style={{
                      background: "rgba(22,26,38,0.7)",
                      color: "#9aa3b4",
                      border: "1px solid rgba(46,52,71,0.3)",
                    }}
                  >
                    {item.codec}
                  </span>
                )}
                {item.bitrate && (
                  <span className="font-mono-tech text-on_surface_variant text-xs">
                    {item.bitrate}
                  </span>
                )}
              </motion.div>
            )}

            {/* Action buttons */}
            {item.type !== "manga" && (
              <motion.div
                className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.27 }}
              >
                <motion.button
                  ref={playBtnRef}
                  className="focusable w-full sm:w-auto justify-center flex items-center gap-3 px-8 py-4 rounded-2xl font-display font-bold text-base"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleMainPlay();
                    }
                  }}
                  data-magnetic
                  data-magnetic-id="detail-play"
                  onClick={handleMainPlay}
                  style={{
                    background: `linear-gradient(135deg, ${accent} 0%, #99f7ff 100%)`,
                    color: "#001f24",
                    boxShadow: `0 0 28px 6px ${accent}32`,
                    cursor: "none",
                  }}
                  whileHover={{ scale: 1.03 }}
                  whileFocus={{ scale: 1.05 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <polygon points="5,3 19,12 5,21" />
                  </svg>
                  {resumeLabel}
                </motion.button>

                {canResume && (
                  <motion.button
                    className="focusable w-full sm:w-auto justify-center flex items-center gap-2 px-6 py-4 rounded-2xl font-body text-sm"
                    tabIndex={0}
                    data-magnetic
                    data-magnetic-id="detail-restart"
                    onClick={() => {
                      if (isEpisodic && episodes[0])
                        handlePlayEpisode(episodes[0], { restart: true });
                      else onPlay(item, 0);
                    }}
                    style={{
                      background: "rgba(22,26,38,0.7)",
                      color: "rgba(224,230,240,0.7)",
                      border: "1px solid rgba(46,52,71,0.4)",
                      cursor: "none",
                    }}
                    whileHover={{
                      background: "rgba(30,35,48,0.9)",
                      color: "#e0e6f0",
                      borderColor: "rgba(153,247,255,0.2)",
                    }}
                    whileFocus={{
                      background: "rgba(30,35,48,0.9)",
                      color: "#e0e6f0",
                      borderColor: "rgba(153,247,255,0.2)",
                      scale: 1.05,
                    }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <polyline points="1,4 1,10 7,10" />
                      <path d="M3.51,15a9,9,0,1,0,.49-3.34" />
                    </svg>
                    {t('detail.start_over')}
                  </motion.button>
                )}
              </motion.div>
            )}

            {/* Progress bar (non-episodic) */}
            {prog && !isEpisodic && item.duration && (
              <div className="mt-5" style={{ maxWidth: 300 }}>
                <div
                  className="h-0.5 rounded-full mb-1"
                  style={{ background: "rgba(255,255,255,0.08)" }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, (prog.time / item.duration) * 100)}%`,
                      background: accent,
                    }}
                  />
                </div>
                <span
                  className="font-mono-tech text-xs"
                  style={{ color: accent }}
                >
                  {fmt(prog.time)} / {fmtDur(item.duration)} {t('detail.watched')}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── Episodes ──────────────────────────────── */}
        {episodesLoading && (
          <div className="px-4 sm:px-8 lg:px-20 pb-8">
            <div className="h-px mb-8" style={{ background: "rgba(153,247,255,0.06)" }} />
            <p className="font-mono-tech text-on_surface_variant text-xs animate-pulse">
              {t('detail.loading_episodes_caps')}
            </p>
          </div>
        )}
        {isEpisodic && !episodesLoading && (
          <div className="px-4 sm:px-8 lg:px-20 pb-24">
            <div
              className="h-px mb-8"
              style={{ background: "rgba(153,247,255,0.06)" }}
            />

            {/* Season tabs */}
            <div className="flex flex-wrap items-center gap-2 mb-7">
              <span className="font-mono-tech text-on_surface_variant text-xs mr-3">
                {t('detail.season_caps')}
              </span>
              {seasons.map((s) => (
                <motion.button
                  key={s}
                  className="focusable w-12 h-12 rounded-xl font-display font-bold text-sm"
                  tabIndex={0}
                  data-magnetic
                  data-magnetic-id={`season-${s}`}
                  onClick={() => setActiveSeason(s)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setActiveSeason(s);
                    }
                  }}
                  style={{
                    background:
                      activeSeason === s
                        ? `linear-gradient(135deg, ${accent}22, rgba(153,247,255,0.1))`
                        : "rgba(22,26,38,0.5)",
                    color:
                      activeSeason === s ? accent : "rgba(224,230,240,0.4)",
                    border: `1px solid ${
                      activeSeason === s
                        ? `${accent}30`
                        : "rgba(46,52,71,0.3)"
                    }`,
                    cursor: "none",
                  }}
                  whileHover={{ scale: 1.04 }}
                  whileFocus={{ scale: 1.06 }}
                  whileTap={{ scale: 0.94 }}
                >
                  {s}
                </motion.button>
              ))}
            </div>

            {/* Episode grid */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSeason}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22 }}
                className="grid gap-3"
                style={{
                  gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))",
                }}
              >
                {seasonEps.map((ep, i) => {
                  const epProg = watchProgress[ep.id];
                  const isCurrentEp = lastWatched?.ep.id === ep.id;
                  const epProgress =
                    epProg && epProg.time > 5 && ep.duration
                      ? Math.min(1, epProg.time / ep.duration)
                      : null;

                  return (
                    <motion.button
                      key={`s${ep.season}e${ep.episode}`}
                      className="focusable w-full text-left rounded-xl p-4 flex gap-4 items-start"
                      tabIndex={0}
                      data-magnetic
                      data-magnetic-id={`ep-${ep.season}-${ep.episode}`}
                      onClick={() => handlePlayEpisode(ep)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handlePlayEpisode(ep);
                        }
                      }}
                      onFocus={(e) => e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest' })}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.28, delay: i * 0.03 }}
                      style={{
                        background: isCurrentEp
                          ? `${accent}08`
                          : "rgba(22,26,38,0.45)",
                        border: `1px solid ${
                          isCurrentEp
                            ? `${accent}20`
                            : "rgba(46,52,71,0.22)"
                        }`,
                        cursor: "none",
                      }}
                      whileHover={{
                        background: "rgba(30,35,48,0.75)",
                        borderColor: "rgba(153,247,255,0.14)",
                      }}
                      whileFocus={{
                        background: "rgba(30,35,48,0.75)",
                        borderColor: "rgba(153,247,255,0.14)",
                        scale: 1.02,
                      }}
                      whileTap={{ scale: 0.99 }}
                    >
                      {/* Number badge */}
                      <div
                        className="flex-shrink-0 w-11 h-11 rounded-lg flex items-center justify-center font-mono-tech font-bold text-sm"
                        style={{
                          background: isCurrentEp
                            ? `${accent}18`
                            : "rgba(46,52,71,0.5)",
                          color: isCurrentEp
                            ? accent
                            : "rgba(224,230,240,0.38)",
                          border: `1px solid ${
                            isCurrentEp
                              ? `${accent}25`
                              : "rgba(46,52,71,0.3)"
                          }`,
                        }}
                      >
                        {ep.episode}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="font-display font-semibold text-on_surface text-sm truncate">
                            {ep.title}
                          </p>
                          {isCurrentEp && (
                            <span
                              className="flex-shrink-0 font-mono-tech text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wide"
                              style={{
                                background: `${accent}18`,
                                color: accent,
                              }}
                            >
                              {t('detail.watching')}
                            </span>
                          )}
                        </div>
                        <p className="font-mono-tech text-on_surface_variant text-xs mb-1">
                          {fmtDur(ep.duration)}
                        </p>
                        {ep.description && (
                          <p
                            className="font-body text-xs line-clamp-1"
                            style={{ color: "rgba(224,230,240,0.42)" }}
                          >
                            {ep.description}
                          </p>
                        )}
                        {epProgress !== null && (
                          <div className="mt-2">
                            <div
                              className="h-0.5 rounded-full"
                              style={{ background: "rgba(255,255,255,0.08)" }}
                            >
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${Math.min(100, epProgress * 100)}%`,
                                  background: accent,
                                }}
                              />
                            </div>
                            <p
                              className="font-mono-tech text-[10px] mt-0.5"
                              style={{ color: accent }}
                            >
                              {fmt(epProg!.time)} / {fmtDur(ep.duration)}
                            </p>
                          </div>
                        )}
                      </div>

                      <div
                        className="flex-shrink-0 self-center"
                        style={{ color: "rgba(224,230,240,0.28)" }}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <polygon points="5,3 19,12 5,21" />
                        </svg>
                      </div>
                    </motion.button>
                  );
                })}
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  );
}
