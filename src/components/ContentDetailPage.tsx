import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { MediaItem, Episode } from "../types";
import { useButuStore } from "../store/useButuStore";

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
  onPlay: (item: MediaItem, initialTime?: number) => void;
  onClose: () => void;
}

export function ContentDetailPage({ item, onPlay, onClose }: Props) {
  const watchProgress = useButuStore((s) => s.watchProgress);
  const prog = watchProgress[item.id];

  const isEpisodic =
    (item.type === "tv" || item.type === "anime") && !!item.episodes?.length;

  const seasons = isEpisodic
    ? [...new Set(item.episodes!.map((e) => e.season))].sort((a, b) => a - b)
    : [];

  const [activeSeason, setActiveSeason] = useState(
    prog?.season ?? seasons[0] ?? 1
  );

  const seasonEps = isEpisodic
    ? item.episodes!.filter((e) => e.season === activeSeason)
    : [];

  const handlePlayEpisode = useCallback(
    (ep: Episode) => {
      const isResume =
        prog?.season === ep.season && prog?.episode === ep.episode;
      onPlay(
        { ...item, season: ep.season, episode: ep.episode },
        isResume ? prog!.time : undefined
      );
    },
    [item, prog, onPlay]
  );

  const handleMainPlay = useCallback(() => {
    if (prog) {
      if (isEpisodic && prog.season != null && prog.episode != null) {
        const ep = item.episodes!.find(
          (e) => e.season === prog.season && e.episode === prog.episode
        );
        if (ep) { handlePlayEpisode(ep); return; }
      }
      onPlay(item, prog.time);
    } else if (isEpisodic && item.episodes![0]) {
      handlePlayEpisode(item.episodes![0]);
    } else {
      onPlay(item);
    }
  }, [item, prog, isEpisodic, onPlay, handlePlayEpisode]);

  const accent = item.ambientColor ?? "#99f7ff";

  const resumeLabel = prog
    ? isEpisodic && prog.season != null && prog.episode != null
      ? `Continue · S${prog.season} E${prog.episode}  ${fmt(prog.time)}`
      : `Resume · ${fmt(prog.time)}`
    : isEpisodic
    ? "Play from S1 E1"
    : "Play";

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
        <div className="px-20 pt-8 pb-2">
          <motion.button
            onClick={onClose}
            data-magnetic
            data-magnetic-id="detail-back"
            className="flex items-center gap-2"
            style={{ color: "rgba(224,230,240,0.55)", cursor: "none" }}
            whileHover={{ color: "#e0e6f0" }}
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
            <span className="font-body text-sm">Back</span>
          </motion.button>
        </div>

        {/* Hero */}
        <div className="px-20 pt-6 pb-12 flex gap-10 items-start">
          {/* Poster */}
          <motion.div
            className="flex-shrink-0 rounded-2xl overflow-hidden"
            style={{
              width: 200,
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
                (e.target as HTMLImageElement).src = `https://picsum.photos/seed/${item.id}/400/600`;
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
                  {seasons.length} Season{seasons.length > 1 ? "s" : ""} ·{" "}
                  {item.episodes!.length} Episodes
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
                className="flex items-center gap-4 flex-wrap"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.27 }}
              >
                <motion.button
                  data-magnetic
                  data-magnetic-id="detail-play"
                  onClick={handleMainPlay}
                  className="flex items-center gap-3 px-8 py-4 rounded-2xl font-display font-bold text-base"
                  style={{
                    background: `linear-gradient(135deg, ${accent} 0%, #99f7ff 100%)`,
                    color: "#001f24",
                    boxShadow: `0 0 28px 6px ${accent}32`,
                    cursor: "none",
                  }}
                  whileHover={{ scale: 1.03 }}
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

                {prog && (
                  <motion.button
                    data-magnetic
                    data-magnetic-id="detail-restart"
                    onClick={() => {
                      if (isEpisodic && item.episodes![0])
                        handlePlayEpisode(item.episodes![0]);
                      else onPlay(item, 0);
                    }}
                    className="flex items-center gap-2 px-6 py-4 rounded-2xl font-body text-sm"
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
                    Start Over
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
                  {fmt(prog.time)} / {fmtDur(item.duration)} watched
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── Episodes ──────────────────────────────── */}
        {isEpisodic && (
          <div className="px-20 pb-24">
            <div
              className="h-px mb-8"
              style={{ background: "rgba(153,247,255,0.06)" }}
            />

            {/* Season tabs */}
            <div className="flex items-center gap-2 mb-7">
              <span className="font-mono-tech text-on_surface_variant text-xs mr-3">
                SEASON
              </span>
              {seasons.map((s) => (
                <motion.button
                  key={s}
                  data-magnetic
                  data-magnetic-id={`season-${s}`}
                  onClick={() => setActiveSeason(s)}
                  className="w-12 h-12 rounded-xl font-display font-bold text-sm"
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
                  whileHover={{ scale: 1.06 }}
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
                  gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                }}
              >
                {seasonEps.map((ep, i) => {
                  const isCurrentEp =
                    prog?.season === ep.season &&
                    prog?.episode === ep.episode;
                  const epProgress = isCurrentEp
                    ? prog!.time / ep.duration
                    : null;

                  return (
                    <motion.button
                      key={`s${ep.season}e${ep.episode}`}
                      data-magnetic
                      data-magnetic-id={`ep-${ep.season}-${ep.episode}`}
                      onClick={() => handlePlayEpisode(ep)}
                      className="w-full text-left rounded-xl p-4 flex gap-4 items-start"
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
                              Watching
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
                              {fmt(prog!.time)} / {fmtDur(ep.duration)}
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
