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

interface ButuPlayerProps {
  item: MediaItem;
  initialTime?: number;
  onClose: (progress?: { time: number; season?: number; episode?: number }) => void;
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

  const setPlayer       = useButuStore((s) => s.setPlayer);
  const jellyfinConfig   = useButuStore((s) => s.jellyfinConfig);
  const progressTimer    = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const handleSeekClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!seekBarRef.current || !videoRef.current) return;
      const rect = seekBarRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const newTime = ratio * duration;
      videoRef.current.currentTime = newTime;
      setCurrentTime(newTime);
      resetControlsTimer();
    },
    [duration, resetControlsTimer]
  );

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
      if (initialTime && initialTime > 0) {
        // Only seek once
        if (vid.currentTime < initialTime - 2 || vid.currentTime > initialTime + 2) {
          vid.currentTime = initialTime;
        }
      }
    };

    vid.addEventListener("timeupdate", onTimeUpdate);
    vid.addEventListener("loadedmetadata", onDuration);
    vid.addEventListener("canplay", onCanPlay);
    vid.addEventListener("play", onPlay);
    vid.addEventListener("pause", onPause);
    vid.addEventListener("progress", onProgress);

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
      onClick={togglePlay}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at center, ${ambientColor}12 0%, transparent 70%)`,
        }}
      />

      <video
        ref={videoRef}
        src={item.streamUrl ?? item.url}
        className="w-full h-full object-contain"
        playsInline
        onClick={(e) => e.stopPropagation()}
        style={{ zIndex: 1 }}
      />

      <AnimatePresence>
        {showControls && (
          <motion.div
            className="absolute inset-0 z-10 flex flex-col"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 20%, transparent 70%, rgba(0,0,0,0.85) 100%)",
              }}
            />

            <div className="relative flex items-center justify-between px-16 pt-10">
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
                  <h2 className="font-display font-bold text-white text-xl leading-tight">
                    {item.title}
                  </h2>
                  {item.artist && (
                    <p className="font-body text-on_surface_variant text-sm">{item.artist}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                {item.resolution && (
                  <span
                    className="font-mono-tech text-xs px-3 py-1 rounded-full"
                    style={{
                      background: "rgba(153,247,255,0.08)",
                      color: "#99f7ff",
                      border: "1px solid rgba(153,247,255,0.15)",
                    }}
                  >
                    {item.resolution}
                  </span>
                )}
                {item.codec && (
                  <span
                    className="font-mono-tech text-xs px-3 py-1 rounded-full"
                    style={{
                      background: "rgba(30,35,48,0.8)",
                      color: "#9aa3b4",
                      border: "1px solid rgba(46,52,71,0.3)",
                    }}
                  >
                    {item.codec}
                  </span>
                )}
              </div>
            </div>

            <div className="mt-auto relative px-16 pb-12">
              <div className="mb-6">
                <div
                  ref={seekBarRef}
                  className="seek-bar-glass w-full h-1.5 rounded-full cursor-none relative overflow-visible"
                  onClick={handleSeekClick}
                  onMouseDown={() => setIsDraggingSeek(true)}
                  onMouseUp={() => setIsDraggingSeek(false)}
                  style={{ cursor: "none" }}
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
                    className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full"
                    style={{
                      left: `calc(${progress * 100}% - 8px)`,
                      background: "#99f7ff",
                      boxShadow: `0 0 16px 4px ${ambientColor}80`,
                      opacity: isDraggingSeek || showControls ? 1 : 0,
                      transition: "opacity 0.2s",
                    }}
                  />
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

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
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
                </div>

                <div className="flex items-center gap-4">
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
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
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

                <div className="flex items-center gap-3">
                  {item.bitrate && (
                    <span className="font-mono-tech text-on_surface_variant text-xs">
                      {item.bitrate}
                    </span>
                  )}
                  <motion.button
                    data-magnetic
                    data-magnetic-id="player-fullscreen"
                    onClick={() => {
                      if (document.fullscreenElement) {
                        document.exitFullscreen();
                      } else {
                        document.documentElement.requestFullscreen();
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
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
