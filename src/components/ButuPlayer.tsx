import { useRef, useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useButuStore } from "../store/useButuStore";
import type { MediaItem } from "../types";
import {
  reportStart,
  reportProgress,
  reportStopped,
  secondsToTicks,
} from "../services/jellyfinApi";
import { fetchCloudMarkers, CloudMarker } from "../services/markerService";
import { fetchPlexSubtitleTracks, applyPlexSubtitle, type PlexSubtitleTrack } from "../services/plexApi";
import { useTranslation } from "react-i18next";
import { isTouch } from "../utils/platform";

interface ButuPlayerProps {
  item: MediaItem;
  initialTime?: number;
  onClose: (progress?: { time: number; duration?: number; season?: number; episode?: number }) => void;
  onProgress?: (progress: { time: number; duration?: number; season?: number; episode?: number }) => void;
  onEnded?: (progress?: { time: number; duration?: number; season?: number; episode?: number }) => void;
}

function formatTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function ButuPlayer({ item, initialTime, onClose }: ButuPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const seekBarRef = useRef<HTMLDivElement>(null);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showControls, setShowControls] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [buffered, setBuffered] = useState(0);
  const [isDraggingSeek, setIsDraggingSeek] = useState(false);
  const [markers, setMarkers] = useState<CloudMarker[]>([]);
  const [activeMarker, setActiveMarker] = useState<CloudMarker | null>(null);

  // Subtitles (Plex desktop): the webview can't toggle a burned-in track, so picking one
  // rebuilds the stream with that subtitle burned in and reloads at the current position.
  const [subtitleTracks, setSubtitleTracks] = useState<PlexSubtitleTrack[]>([]);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [showSubMenu, setShowSubMenu] = useState(false);
  const [subUrl, setSubUrl] = useState<string | null>(null);
  const resumeAtRef = useRef<number | null>(null);

  const setPlayer       = useButuStore((s) => s.setPlayer);
  const jellyfinConfig   = useButuStore((s) => s.jellyfinConfig);
  const plexConfig       = useButuStore((s) => s.plexConfig);
  const serverType       = useButuStore((s) => s.serverType);
  const settings         = useButuStore((s) => s.settings);
  const progressTimer    = useRef<ReturnType<typeof setInterval> | null>(null);
  const { t } = useTranslation();

  // The native Android (ExoBridge) build plays through ExoPlayer, not this <video>, so the
  // burn-and-reload subtitle path only applies to the desktop/webview player.
  const hasExoBridge = typeof window !== "undefined" && !!(window as any).ExoBridge;

  const ambientColor = item.ambientColor ?? "#99f7ff";

  const resetControlsTimer = useCallback(() => {
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => setShowControls(false), 3500);
  }, []);

  useEffect(() => {
    resetControlsTimer();
    return () => {
      if (controlsTimer.current) clearTimeout(controlsTimer.current);
    };
  }, [resetControlsTimer]);

  useEffect(() => {
    let ep = item.episodes?.find((e) => e.season === item.season && e.episode === item.episode);
    fetchCloudMarkers(item, ep).then((fetched) => setMarkers(fetched));
  }, [item]);

  // Load the item's subtitle tracks (Plex desktop only) so the CC menu can list them.
  useEffect(() => {
    if (hasExoBridge || serverType !== "plex" || !plexConfig) { setSubtitleTracks([]); return; }
    let cancelled = false;
    fetchPlexSubtitleTracks(plexConfig, item.id)
      .then((t) => { if (!cancelled) setSubtitleTracks(t); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [item.id, serverType, plexConfig, hasExoBridge]);

  const selectSubtitle = useCallback(async (subId: string | null) => {
    setShowSubMenu(false);
    resetControlsTimer();
    if (serverType !== "plex" || !plexConfig) return;
    const baseUrl = subUrl ?? item.streamUrl ?? item.url;
    if (!baseUrl) return;
    const newUrl = await applyPlexSubtitle(baseUrl, plexConfig, subId);
    resumeAtRef.current = videoRef.current?.currentTime ?? 0;
    setSelectedSubId(subId);
    setSubUrl(newUrl);
  }, [serverType, plexConfig, subUrl, item.streamUrl, item.url, resetControlsTimer]);

  // Reload the <video> when the subtitle-rebuilt URL changes; onCanPlay restores the position.
  useEffect(() => {
    if (subUrl && videoRef.current) videoRef.current.load();
  }, [subUrl]);

  useEffect(() => {
    const currentMs = currentTime * 1000;
    const active = markers.find(
      (m) => m.endMs > m.startMs && currentMs >= m.startMs && currentMs <= m.endMs
    );
    // Auto-skip past the marker if the user enabled it for this type.
    if (active && videoRef.current) {
      const auto = active.type === "intro" ? settings.autoSkipIntro : settings.autoSkipCredits;
      if (auto) {
        videoRef.current.currentTime = active.endMs / 1000 + 0.1;
        setActiveMarker(null);
        return;
      }
    }
    setActiveMarker(active || null);
  }, [currentTime, markers, settings.autoSkipIntro, settings.autoSkipCredits]);

  const togglePlay = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.paused) {
      vid.play().catch(() => {});
      setIsPlaying(true);
    } else {
      vid.pause();
      setIsPlaying(false);
    }
    setPlayer({ isPlaying: !vid.paused });
    resetControlsTimer();
  }, [setPlayer, resetControlsTimer]);

  // Maps a pointer/touch X coordinate to a seek. Shared by mouse click and touch drag.
  const seekFromClientX = useCallback(
    (clientX: number) => {
      if (!seekBarRef.current || !videoRef.current || !duration) return;
      const rect = seekBarRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const newTime = ratio * duration;
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
      resetControlsTimer();
    },
    [duration, resetControlsTimer]
  );

  const handleSeekClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => seekFromClientX(e.clientX),
    [seekFromClientX]
  );

  // On touch, tapping the video surface toggles the controls (not play/pause).
  const handleSurfaceTap = useCallback(() => {
    if (showControls) {
      setShowControls(false);
      if (controlsTimer.current) clearTimeout(controlsTimer.current);
    } else {
      resetControlsTimer();
    }
  }, [showControls, resetControlsTimer]);

  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseFloat(e.target.value);
      setVolume(val);
      if (videoRef.current) videoRef.current.volume = val;
      setIsMuted(val === 0);
      resetControlsTimer();
    },
    [resetControlsTimer]
  );

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;

    const onTimeUpdate = () => setCurrentTime(vid.currentTime);
    const onDuration   = () => {
      setDuration(vid.duration || 0);
    };
    const onPlay       = () => setIsPlaying(true);
    const onPause      = () => setIsPlaying(false);
    const onProgress   = () => {
      if (vid.buffered.length > 0) {
        setBuffered(vid.buffered.end(vid.buffered.length - 1));
      }
    };
    const onCanPlay = () => {
      // After a subtitle change the stream was rebuilt and reloaded — jump back to where we were.
      if (resumeAtRef.current != null) {
        const t = resumeAtRef.current;
        resumeAtRef.current = null;
        if (t > 0) vid.currentTime = t;
        if (!(window as any).ExoBridge && vid.paused) vid.play().catch(() => {});
        return;
      }
      if (initialTime && initialTime > 0) {
        // Only seek once
        if (vid.currentTime < initialTime - 2 || vid.currentTime > initialTime + 2) {
          vid.currentTime = initialTime;
        }
      }
      // Auto-start on the desktop/webview <video> path. The native ExoBridge path starts
      // itself via exo.play(), so skip it there to avoid double playback. Opening the player
      // is a user gesture, so this is allowed; ignore any autoplay-policy rejection (falls
      // back to the manual play button — the previous behaviour).
      if (!(window as any).ExoBridge && vid.paused) {
        vid.play().catch(() => {});
      }
    };

    vid.addEventListener("timeupdate", onTimeUpdate);
    vid.addEventListener("loadedmetadata", onDuration);
    vid.addEventListener("canplay", onCanPlay);
    vid.addEventListener("play", onPlay);
    vid.addEventListener("pause", onPause);
    vid.addEventListener("progress", onProgress);

    // Native ExoPlayer path
    const exo = (window as any).ExoBridge;
    if (exo) {
      // Use item.url (direct play) if available to ensure all audio/sub tracks are preserved.
      const urlToPlay = item.url || item.streamUrl;
      if (urlToPlay) {
        const onExoEnded = (e: any) => {
          const posMs = e.detail?.position || 0;
          const sec = posMs / 1000;
          setCurrentTime(sec);
          if (onClose) onClose({ time: sec, season: item.season, episode: item.episode });
        };
        window.addEventListener("exo_ended", onExoEnded);
        exo.play(urlToPlay, initialTime || 0);
        return () => {
          window.removeEventListener("exo_ended", onExoEnded);
          exo.stop();
        };
      }
    }

    // Desktop autoplay: if the media is already buffered enough by the time this effect
    // attaches (canplay may have fired first), kick it off now. Otherwise onCanPlay handles it.
    if (vid.readyState >= 3 && vid.paused) {
      vid.play().catch(() => {});
    }

    return () => {
      vid.removeEventListener("timeupdate", onTimeUpdate);
      vid.removeEventListener("loadedmetadata", onDuration);
      vid.removeEventListener("canplay", onCanPlay);
      vid.removeEventListener("play", onPlay);
      vid.removeEventListener("pause", onPause);
      vid.removeEventListener("progress", onProgress);
    };
  }, [initialTime]);

  useEffect(() => {
    if (!jellyfinConfig || !item.jellyfinId) return;
    const jid = item.jellyfinId;
    reportStart(jellyfinConfig, jid, secondsToTicks(initialTime ?? 0)).catch(() => {});
    progressTimer.current = setInterval(() => {
      const vid = videoRef.current;
      if (!vid) return;
      reportProgress(
        jellyfinConfig,
        jid,
        secondsToTicks(vid.currentTime),
        vid.paused
      ).catch(() => {});
    }, 10_000);
    return () => {
      if (progressTimer.current) clearInterval(progressTimer.current);
    };
  }, [jellyfinConfig, item.jellyfinId, initialTime]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") { e.preventDefault(); togglePlay(); }
      if (e.code === "Escape") {
        if (jellyfinConfig && item.jellyfinId) {
          reportStopped(jellyfinConfig, item.jellyfinId, secondsToTicks(currentTime)).catch(() => {});
        }
        onClose({ time: currentTime, season: item.season, episode: item.episode });
      }
      if (e.code === "ArrowRight" && videoRef.current) {
        videoRef.current.currentTime = Math.min(duration, currentTime + 10);
        resetControlsTimer();
      }
      if (e.code === "ArrowLeft" && videoRef.current) {
        videoRef.current.currentTime = Math.max(0, currentTime - 10);
        resetControlsTimer();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, onClose, duration, currentTime, resetControlsTimer]);

  const progress = duration > 0 ? currentTime / duration : 0;
  const bufferedProgress = duration > 0 ? buffered / duration : 0;

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-black flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      onMouseMove={resetControlsTimer}
      onClick={isTouch ? handleSurfaceTap : togglePlay}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at center, ${ambientColor}12 0%, transparent 70%)`,
        }}
      />

      <video
        ref={videoRef}
        src={subUrl ?? item.streamUrl ?? item.url}
        className="w-full h-full object-contain"
        playsInline
        // Desktop: swallow the click so it doesn't reach the surface toggle. Touch:
        // let it bubble so a tap on the video reveals/hides the controls.
        onClick={(e) => { if (!isTouch) e.stopPropagation(); }}
        style={{ zIndex: 1 }}
      />

      <AnimatePresence>
        {activeMarker && (
          <motion.button
            className="absolute bottom-24 right-4 md:bottom-32 md:right-16 z-20 flex items-center justify-center px-5 py-2.5 md:px-6 md:py-3 rounded-full font-display font-bold text-base md:text-lg"
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            style={{
              background: "rgba(22,26,38,0.8)",
              backdropFilter: "blur(12px)",
              border: `1px solid ${ambientColor}60`,
              color: "#fff",
              boxShadow: `0 0 20px 4px ${ambientColor}30`,
            }}
            whileHover={{ scale: 1.05, borderColor: ambientColor }}
            whileTap={{ scale: 0.95 }}
            onClick={(e) => {
              e.stopPropagation();
              if (videoRef.current) {
                // Seek just past the marker
                videoRef.current.currentTime = activeMarker.endMs / 1000 + 0.1;
              }
              resetControlsTimer();
            }}
          >
            {activeMarker.type === "intro" ? t('player.skip_intro') : t('player.skip_credits')}
            <svg className="ml-2 w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="13,6 19,12 13,18" />
              <line x1="19" y1="12" x2="5" y2="12" />
            </svg>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showControls && (
          <motion.div
            className="absolute inset-0 z-10 flex flex-col"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => {
              e.stopPropagation();
              // Touch: a tap on the empty backdrop (not a control) hides the overlay.
              if (isTouch && e.target === e.currentTarget) {
                setShowControls(false);
                if (controlsTimer.current) clearTimeout(controlsTimer.current);
              }
            }}
          >
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 20%, transparent 70%, rgba(0,0,0,0.85) 100%)",
              }}
            />

            <div className="relative flex items-center justify-between px-4 md:px-16 pt-6 md:pt-10">
              <div className="flex items-center gap-4">
                <motion.button
                  data-magnetic
                  data-magnetic-id="player-close"
                  onClick={() => {
                    if (jellyfinConfig && item.jellyfinId) {
                      reportStopped(jellyfinConfig, item.jellyfinId, secondsToTicks(currentTime)).catch(() => {});
                    }
                    onClose({ time: currentTime, season: item.season, episode: item.episode });
                  }}
                  className="flex items-center justify-center w-12 h-12 rounded-full"
                  style={{
                    background: "rgba(22,26,38,0.7)",
                    backdropFilter: "blur(20px)",
                    border: "1px solid rgba(153,247,255,0.12)",
                    color: "#e0e6f0",
                  }}
                  whileHover={{ scale: 1.08, borderColor: "rgba(153,247,255,0.3)" }}
                  whileTap={{ scale: 0.95 }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15,18 9,12 15,6" />
                  </svg>
                </motion.button>

                <div>
                  <h2 className="font-display font-bold text-white text-base md:text-xl leading-tight">
                    {item.title}
                  </h2>
                  {item.artist && (
                    <p className="font-body text-on_surface_variant text-sm">{item.artist}</p>
                  )}
                </div>
              </div>


            </div>

            <div className="mt-auto relative px-4 md:px-16 pb-6 md:pb-12">
              <div className="mb-6">
                <div
                  className="relative"
                  onClick={handleSeekClick}
                  onMouseDown={() => setIsDraggingSeek(true)}
                  onMouseUp={() => setIsDraggingSeek(false)}
                  onTouchStart={(e) => { setIsDraggingSeek(true); seekFromClientX(e.touches[0].clientX); }}
                  onTouchMove={(e) => seekFromClientX(e.touches[0].clientX)}
                  onTouchEnd={() => setIsDraggingSeek(false)}
                  style={{
                    // Bigger finger target + no page-pan hijack while scrubbing on touch.
                    padding: isTouch ? "14px 0" : undefined,
                    touchAction: isTouch ? "none" : undefined,
                    cursor: isTouch ? "pointer" : "none",
                  }}
                >
                  <div
                    ref={seekBarRef}
                    className="seek-bar-glass w-full h-1.5 rounded-full relative overflow-visible"
                  >
                  <div
                    className="absolute left-0 top-0 h-full rounded-full"
                    style={{
                      width: `${bufferedProgress * 100}%`,
                      background: "rgba(153,247,255,0.15)",
                    }}
                  />
                  <motion.div
                    className="absolute left-0 top-0 h-full rounded-full"
                    style={{
                      width: `${progress * 100}%`,
                      background: `linear-gradient(to right, ${ambientColor}, #99f7ff)`,
                      boxShadow: `0 0 12px 2px ${ambientColor}60`,
                    }}
                  />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 rounded-full"
                    style={{
                      width: isTouch ? 18 : 16,
                      height: isTouch ? 18 : 16,
                      left: `calc(${progress * 100}% - ${isTouch ? 9 : 8}px)`,
                      background: "#99f7ff",
                      boxShadow: `0 0 16px 4px ${ambientColor}80`,
                      // Always show the thumb on touch — there's no hover to hint at scrubbing.
                      opacity: isDraggingSeek || showControls || isTouch ? 1 : 0,
                      transition: "opacity 0.2s",
                    }}
                  />
                  </div>
                </div>

                <div className="flex justify-between mt-2">
                  <span className="font-mono-tech text-on_surface_variant text-xs">
                    {formatTime(currentTime)}
                  </span>
                  <span className="font-mono-tech text-on_surface_variant text-xs">
                    {formatTime(duration)}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 items-center gap-2">
                <div className="flex items-center gap-3 justify-self-start">
                  {!isTouch && (<>
                  <motion.button
                    data-magnetic
                    data-magnetic-id="player-mute"
                    onClick={() => {
                      setIsMuted((m) => {
                        if (videoRef.current) videoRef.current.muted = !m;
                        return !m;
                      });
                      resetControlsTimer();
                    }}
                    className="flex items-center justify-center w-11 h-11 rounded-full"
                    style={{
                      background: "rgba(22,26,38,0.6)",
                      backdropFilter: "blur(20px)",
                      border: "1px solid rgba(46,52,71,0.3)",
                      color: "#9aa3b4",
                    }}
                    whileHover={{ scale: 1.08, color: "#99f7ff" }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {isMuted ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" />
                        <line x1="23" y1="9" x2="17" y2="15" />
                        <line x1="17" y1="9" x2="23" y2="15" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="11,5 6,9 2,9 2,15 6,15 11,19" />
                        <path d="M19.07,4.93a10,10,0,0,1,0,14.14" />
                        <path d="M15.54,8.46a5,5,0,0,1,0,7.07" />
                      </svg>
                    )}
                  </motion.button>

                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="w-24 accent-primary cursor-none"
                    style={{ accentColor: "#99f7ff" }}
                  />
                  </>)}
                </div>

                <div className="flex items-center gap-3 md:gap-4 justify-self-center">
                  <motion.button
                    data-magnetic
                    data-magnetic-id="player-rewind"
                    onClick={() => {
                      if (videoRef.current) videoRef.current.currentTime = Math.max(0, currentTime - 10);
                      resetControlsTimer();
                    }}
                    className="flex items-center justify-center w-12 h-12 rounded-full"
                    style={{
                      background: "rgba(22,26,38,0.6)",
                      backdropFilter: "blur(20px)",
                      border: "1px solid rgba(46,52,71,0.3)",
                      color: "#9aa3b4",
                    }}
                    whileHover={{ scale: 1.08, color: "#e0e6f0" }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="1,4 1,10 7,10" />
                      <path d="M3.51,15a9,9,0,1,0,.49-3.34" />
                    </svg>
                  </motion.button>

                  <motion.button
                    data-magnetic
                    data-magnetic-id="player-playpause"
                    onClick={togglePlay}
                    className="flex items-center justify-center w-16 h-16 rounded-full"
                    style={{
                      background: `linear-gradient(135deg, ${ambientColor} 0%, #99f7ff 100%)`,
                      color: "#001f24",
                      boxShadow: `0 0 32px 8px ${ambientColor}40`,
                    }}
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.93 }}
                  >
                    {isPlaying ? (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="6" y="4" width="4" height="16" />
                        <rect x="14" y="4" width="4" height="16" />
                      </svg>
                    ) : (
                      // A right-pointing triangle's visual mass sits left of its geometric
                      // centre, so nudge it right ~2px to look optically centred in the circle.
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" style={{ transform: "translateX(2px)" }}>
                        <polygon points="5,3 19,12 5,21" />
                      </svg>
                    )}
                  </motion.button>

                  <motion.button
                    data-magnetic
                    data-magnetic-id="player-forward"
                    onClick={() => {
                      if (videoRef.current) videoRef.current.currentTime = Math.min(duration, currentTime + 10);
                      resetControlsTimer();
                    }}
                    className="flex items-center justify-center w-12 h-12 rounded-full"
                    style={{
                      background: "rgba(22,26,38,0.6)",
                      backdropFilter: "blur(20px)",
                      border: "1px solid rgba(46,52,71,0.3)",
                      color: "#9aa3b4",
                    }}
                    whileHover={{ scale: 1.08, color: "#e0e6f0" }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="23,4 23,10 17,10" />
                      <path d="M20.49,15a9,9,0,1,1-.49-3.34" />
                    </svg>
                  </motion.button>
                </div>

                <div className="flex items-center gap-2 md:gap-3 justify-self-end">
                  {item.bitrate && !isTouch && (
                    <span className="font-mono-tech text-on_surface_variant text-xs">
                      {item.bitrate}
                    </span>
                  )}
                  {!hasExoBridge && subtitleTracks.length > 0 && (
                    <motion.button
                      data-magnetic
                      data-magnetic-id="player-cc"
                      onClick={() => { setShowSubMenu((v) => !v); resetControlsTimer(); }}
                      className="flex items-center justify-center w-11 h-11 rounded-full"
                      style={{
                        background: selectedSubId ? `${ambientColor}22` : "rgba(22,26,38,0.6)",
                        backdropFilter: "blur(20px)",
                        border: `1px solid ${selectedSubId ? ambientColor + "66" : "rgba(46,52,71,0.3)"}`,
                        color: selectedSubId ? "#fff" : "#9aa3b4",
                      }}
                      whileHover={{ scale: 1.08, color: "#e0e6f0" }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <rect x="3" y="6" width="18" height="12" rx="2.5" />
                        <line x1="7" y1="14" x2="11" y2="14" />
                        <line x1="14" y1="14" x2="17" y2="14" />
                      </svg>
                    </motion.button>
                  )}
                  <motion.button
                    data-magnetic
                    data-magnetic-id="player-fullscreen"
                    onClick={() => {
                      const vid = videoRef.current as any;
                      if (document.fullscreenElement) {
                        document.exitFullscreen();
                      } else if (document.fullscreenEnabled) {
                        document.documentElement.requestFullscreen?.();
                      } else if (vid?.webkitEnterFullscreen) {
                        // iOS Safari only allows the <video> element itself to go fullscreen.
                        vid.webkitEnterFullscreen();
                      }
                      resetControlsTimer();
                    }}
                    className="flex items-center justify-center w-11 h-11 rounded-full"
                    style={{
                      background: "rgba(22,26,38,0.6)",
                      backdropFilter: "blur(20px)",
                      border: "1px solid rgba(46,52,71,0.3)",
                      color: "#9aa3b4",
                    }}
                    whileHover={{ scale: 1.08, color: "#e0e6f0" }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="15,3 21,3 21,9" />
                      <polyline points="9,21 3,21 3,15" />
                      <line x1="21" y1="3" x2="14" y2="10" />
                      <line x1="3" y1="21" x2="10" y2="14" />
                    </svg>
                  </motion.button>
                </div>
              </div>
            </div>

            <AnimatePresence>
              {showSubMenu && (
                <motion.div
                  className="absolute z-30 rounded-2xl overflow-hidden py-1"
                  style={{
                    right: isTouch ? 12 : 64, bottom: isTouch ? 92 : 128, minWidth: 220, maxWidth: "calc(100vw - 24px)", maxHeight: 320, overflowY: "auto",
                    background: "rgba(8,10,18,0.96)",
                    border: "1px solid rgba(153,247,255,0.15)",
                    backdropFilter: "blur(16px)",
                    boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
                  }}
                  initial={{ opacity: 0, y: 12, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 12, scale: 0.97 }}
                  transition={{ duration: 0.18 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="px-4 pt-2 pb-2 font-mono-tech text-xs tracking-[0.18em]" style={{ color: "rgba(153,247,255,0.6)" }}>
                    {t('player.subtitles_caps')}
                  </p>
                  {([{ id: null, label: t('player.subtitles_off') }, ...subtitleTracks] as { id: string | null; label: string }[]).map((t) => {
                    const active = selectedSubId === t.id;
                    return (
                      <button
                        key={t.id ?? "off"}
                        data-magnetic
                        data-magnetic-id={`sub-${t.id ?? "off"}`}
                        onClick={() => selectSubtitle(t.id)}
                        className="w-full text-left px-4 py-2.5 font-body text-sm flex items-center gap-2"
                        style={{
                          background: active ? `${ambientColor}22` : "transparent",
                          color: active ? "#fff" : "#c3c9d6",
                          cursor: "none",
                        }}
                      >
                        <span style={{ width: 14, color: ambientColor }}>{active ? "✓" : ""}</span>
                        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.label}</span>
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
