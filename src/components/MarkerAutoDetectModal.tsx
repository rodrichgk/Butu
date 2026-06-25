/**
 * Settings → Marker Auto-Detect modal.
 *
 * Drives the companion app's analysis pipeline end-to-end:
 *   1. Walk the library (Plex), build the show tree.
 *   2. Invoke the Tauri `analyze_library` command.
 *   3. Render streaming progress (events from the Rust side).
 *   4. On completion, surface a preview + Submit button.
 *   5. Post results to the Supabase Edge Function via `submit_markers`.
 *
 * Lives behind a `isTauri()` check on the parent — the TV build never reaches
 * this component because Tauri commands aren't available there.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  buildShowInputs,
  cancelAnalysis,
  fetchShowSeasons,
  isTauri,
  runAnalysis,
  submitDetectedMarkers,
  subscribeProgress,
  type ProgressEvent,
  type ShowInput,
} from "../services/markerDetect";
import { useButuStore } from "../store/useButuStore";

interface Props { onClose: () => void; }

type Phase = "idle" | "preparing" | "analyzing" | "finished" | "submitting" | "submitted" | "error";

interface EpisodeRow {
  show_title: string;
  season_number: number;
  episode_number: number;
  intro_ms: [number, number] | null;
  credits_ms: [number, number] | null;
}

const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string | undefined;

export function MarkerAutoDetectModal({ onClose }: Props) {
  const plexConfig = useButuStore((s) => s.plexConfig);
  const jellyfinConfig = useButuStore((s) => s.jellyfinConfig);
  const serverType = useButuStore((s) => s.serverType);
  const library    = useButuStore((s) => s.library);

  const analyzable = useMemo(
    () => library.filter((i) => i.type === "tv" || i.type === "anime" || i.type === "movie"),
    [library],
  );
  const [selectedShows, setSelectedShows] = useState<Set<string>>(new Set());
  // The library loads asynchronously, so a selection captured once at mount goes
  // stale — it holds ids no longer in the (re)loaded library, so buildShowInputs
  // gets an empty slice and reports "nothing to analyze" even though items exist.
  // Re-seed the selection whenever the analyzable set changes.
  useEffect(() => {
    setSelectedShows(new Set(analyzable.map((s) => s.id)));
  }, [analyzable]);

  // Per-show season picker state. `seasonSel[id]` present ⇒ only those seasons.
  const [expandedShow, setExpandedShow] = useState<string | null>(null);
  const [seasonsCache, setSeasonsCache] = useState<Record<string, number[]>>({});
  const [seasonSel, setSeasonSel] = useState<Record<string, Set<number>>>({});
  const [loadingSeasons, setLoadingSeasons] = useState<string | null>(null);

  const toggleExpand = useCallback(async (item: { id: string; type: string }) => {
    if (expandedShow === item.id) { setExpandedShow(null); return; }
    setExpandedShow(item.id);
    if (item.type === "movie" || seasonsCache[item.id]) return;
    setLoadingSeasons(item.id);
    const full = analyzable.find((m) => m.id === item.id)!;
    const ns = await fetchShowSeasons(serverType, plexConfig, jellyfinConfig, full);
    setSeasonsCache((c) => ({ ...c, [item.id]: ns }));
    setSeasonSel((s) => (s[item.id] ? s : { ...s, [item.id]: new Set(ns) }));
    setLoadingSeasons(null);
  }, [expandedShow, seasonsCache, analyzable, serverType, plexConfig, jellyfinConfig]);

  const toggleSeason = useCallback((showId: string, n: number) => {
    setSeasonSel((s) => {
      const cur = new Set(s[showId] ?? seasonsCache[showId] ?? []);
      if (cur.has(n)) cur.delete(n); else cur.add(n);
      return { ...s, [showId]: cur };
    });
  }, [seasonsCache]);

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  const [prepareProgress, setPrepareProgress] = useState({ idx: 0, total: 0, title: "" });
  const [showProgress, setShowProgress] = useState({ idx: 0, total: 0, title: "" });
  const [episodeProgress, setEpisodeProgress] = useState({ current: 0, total: 0 });
  const [currentEpisode, setCurrentEpisode] = useState<string>("");
  const [episodeResults, setEpisodeResults] = useState<EpisodeRow[]>([]);
  const [finalCount, setFinalCount] = useState<number | null>(null);
  const [submitResult, setSubmitResult] = useState<{ inserted: number; episodes: number } | null>(null);

  const unsubscribeRef = useRef<(() => void) | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const showsRef = useRef<ShowInput[]>([]);

  const supabaseConfigured = !!SUPABASE_URL && !!SUPABASE_ANON_KEY;

  // Subscribe to progress events once. The Rust side fires them while
  // analyze_library is in flight.
  useEffect(() => {
    let cancelled = false;
    subscribeProgress((ev) => {
      if (cancelled) return;
      handleProgress(ev);
    }).then((unlisten) => {
      if (cancelled) { try { unlisten(); } catch {} return; }
      unsubscribeRef.current = unlisten;
    });
    return () => {
      cancelled = true;
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    };
  }, []);

  const handleProgress = useCallback((ev: ProgressEvent) => {
    switch (ev.kind) {
      case "started":
        setShowProgress({ idx: 0, total: ev.total_shows, title: "" });
        setEpisodeProgress({ current: 0, total: ev.total_episodes });
        setPhase("analyzing");
        break;
      case "show":
        setShowProgress({ idx: ev.index, total: showProgressTotal.current, title: ev.title });
        break;
      case "episode":
        setCurrentEpisode(`${ev.show_title} · S${ev.season_number} E${ev.episode_number} · ${ev.stage}`);
        if (ev.stage === "done" || ev.stage === "failed") {
          setEpisodeProgress((p) => ({ ...p, current: p.current + 1 }));
        }
        break;
      case "episode_markers":
        setEpisodeResults((prev) => [
          ...prev,
          {
            show_title: ev.show_title,
            season_number: ev.season_number,
            episode_number: ev.episode_number,
            intro_ms: ev.intro_ms,
            credits_ms: ev.credits_ms,
          },
        ]);
        break;
      case "finished":
        setFinalCount(ev.total_episodes_marked);
        setPhase("finished");
        break;
      case "failed":
        setError(ev.message);
        setPhase("error");
        break;
      default:
        break;
    }
  }, []);

  // Keep total-shows in a ref so the `show` event handler always sees the most
  // recent total even though `handleProgress` is memoized.
  const showProgressTotal = useRef(0);
  useEffect(() => { showProgressTotal.current = showProgress.total; }, [showProgress.total]);

  const start = useCallback(async () => {
    if (!serverType || (serverType === "plex" && !plexConfig) || (serverType === "jellyfin" && !jellyfinConfig)) {
      setError("Server config not loaded — connect to a server first.");
      setPhase("error");
      return;
    }
    // The library loads asynchronously after the app mounts; if you open this
    // modal and hit Start before it finishes, there's nothing to analyze yet.
    if (analyzable.length === 0) {
      setError("Library is still loading — give it a second, then press Start again.");
      setPhase("error");
      return;
    }
    setPhase("preparing");
    setError(null);
    setEpisodeResults([]);
    setFinalCount(null);
    setSubmitResult(null);
    setPrepareProgress({ idx: 0, total: 0, title: "" });

    // Fall back to the full analyzable set if the selection is somehow empty
    // (e.g. it was seeded before the library finished loading) so we never
    // silently send nothing to the analyzer.
    const selectedSlice = library.filter((i) => selectedShows.has(i.id));
    const slice = selectedSlice.length > 0 ? selectedSlice : analyzable;

    // Only constrain a show's seasons when a strict subset (or none) is picked.
    const seasonFilter: Record<string, number[]> = {};
    for (const [id, set] of Object.entries(seasonSel)) {
      const all = seasonsCache[id];
      if (all && set.size < all.length) seasonFilter[id] = [...set];
    }

    const abort = new AbortController();
    abortRef.current = abort;
    try {
      const shows = await buildShowInputs(
        serverType,
        plexConfig,
        jellyfinConfig,
        slice,
        (idx, total, title) => setPrepareProgress({ idx, total, title }),
        abort.signal,
        seasonFilter,
      );
      if (abort.signal.aborted) return;
      if (shows.length === 0) {
        setError(
          "Nothing resolved to analyze — none of the selected shows/movies could be matched to a TMDB / TVDB / IMDB id (or nothing was selected).",
        );
        setPhase("error");
        return;
      }
      showsRef.current = shows;
      showProgressTotal.current = shows.length;
      await runAnalysis(shows);  // long-running; events drive the UI
    } catch (e: any) {
      if (abort.signal.aborted) return;
      // Keep the technical breakdown in the console for debugging; show a
      // friendly message in the UI.
      console.warn("[marker] couldn't prepare the library:\n" + String(e?.message ?? e));
      setError("Couldn't prepare the library — make sure your shows have TMDB / TVDB / IMDB ids and try again.");
      setPhase("error");
    }
  }, [serverType, plexConfig, jellyfinConfig, library, selectedShows, analyzable, seasonSel, seasonsCache]);

  const cancel = useCallback(async () => {
    abortRef.current?.abort();
    await cancelAnalysis();
    setPhase("idle");
  }, []);

  const submit = useCallback(async () => {
    if (!supabaseConfigured) {
      setError("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set — can't submit.");
      setPhase("error");
      return;
    }
    setPhase("submitting");
    try {
      const resp = await submitDetectedMarkers({
        endpoint: `${SUPABASE_URL!.replace(/\/$/, "")}/functions/v1/submit-markers`,
        anon_key: SUPABASE_ANON_KEY!,
        submitted_by: "auto",
        source: "butu-companion/0.1.0",
      });
      setSubmitResult({ inserted: resp.inserted, episodes: resp.episode_count });
      setPhase("submitted");
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setPhase("error");
    }
  }, [supabaseConfigured]);

  const fmtMs = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return `${m}:${(s % 60).toString().padStart(2, "0")}`;
  };

  const episodesWithMarkers = useMemo(
    () => episodeResults.filter((r) => r.intro_ms || r.credits_ms),
    [episodeResults],
  );

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        position: "fixed", inset: 0, zIndex: 9000,
        background: "rgba(2, 4, 8, 0.85)",
        backdropFilter: "blur(12px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "5vh 5vw",
      }}
    >
      <motion.div
        initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        style={{
          width: "100%", maxWidth: 880, maxHeight: "90vh",
          background: "rgba(12, 14, 22, 0.96)",
          border: "1px solid rgba(153, 247, 255, 0.18)",
          borderRadius: 20, padding: 32,
          display: "flex", flexDirection: "column", gap: 20,
          color: "#e0e6f0", overflow: "hidden",
        }}
      >
        <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <p style={{ fontFamily: "ui-monospace, monospace", color: "#99f7ff", fontSize: 11, letterSpacing: "0.15em" }}>
              COMPANION · MARKER AUTO-DETECT
            </p>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>
              Detect intros &amp; credits across your library
            </h2>
            <p style={{ color: "#9aa3b4", fontSize: 13, marginTop: 4, maxWidth: 580 }}>
              Audio-fingerprints the first 15&nbsp;min + last 10&nbsp;min of every TV episode, finds the
              segment most episodes agree on, and submits the results to the Butu cloud DB so every
              Butu TV user benefits.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
              color: "#9aa3b4", borderRadius: 12, padding: "6px 14px", fontSize: 12, cursor: "pointer",
            }}
          >
            Close
          </button>
        </header>

        {!isTauri() && (
          <Banner kind="warn">
            This page only works in the Butu companion (Tauri) desktop app — Tauri commands aren't
            available in a plain browser tab.
          </Banner>
        )}
        {!serverType && (
          <Banner kind="warn">Media server isn't connected. Set up Plex or Jellyfin in the main settings first.</Banner>
        )}
        {!supabaseConfigured && (
          <Banner kind="warn">
            <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> aren't set —
            analysis will still run, but Submit is disabled.
          </Banner>
        )}
        {error && <Banner kind="error">{error}</Banner>}

        <section style={{ minHeight: 200, flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
          {phase === "idle" && (
            <div style={{ padding: "16px 8px", color: "#9aa3b4", display: "flex", flexDirection: "column", gap: 16 }}>
              <p style={{ fontSize: 14 }}>
                Select the shows and movies you want to analyze.
              </p>

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setSelectedShows(new Set(analyzable.map(s => s.id)))}
                  style={{ ...btnGhost, padding: "6px 12px", fontSize: 12 }}
                >
                  Select All
                </button>
                <button
                  onClick={() => setSelectedShows(new Set())}
                  style={{ ...btnGhost, padding: "6px 12px", fontSize: 12 }}
                >
                  Deselect All
                </button>
              </div>

              <div style={{ 
                maxHeight: "40vh", overflowY: "auto", border: "1px solid rgba(255,255,255,0.08)", 
                borderRadius: 12, padding: 8, display: "flex", flexDirection: "column", gap: 4 
              }}>
                {analyzable.length === 0 ? (
                  <div style={{ padding: 12, textAlign: "center", color: "#5a6473" }}>No shows or movies found in library</div>
                ) : (
                  analyzable.map((show) => {
                    const checked = selectedShows.has(show.id);
                    const isExpanded = expandedShow === show.id;
                    const seasons = seasonsCache[show.id];
                    const sel = seasonSel[show.id];
                    const canExpand = show.type !== "movie";
                    const subset = seasons && sel && sel.size < seasons.length;
                    return (
                      <div key={show.id} style={{ display: "flex", flexDirection: "column" }}>
                        <div style={{
                          display: "flex", alignItems: "center", gap: 12, padding: "8px 12px",
                          background: "rgba(255,255,255,0.02)", borderRadius: 8,
                        }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const next = new Set(selectedShows);
                              if (e.target.checked) next.add(show.id); else next.delete(show.id);
                              setSelectedShows(next);
                            }}
                            style={{ width: 16, height: 16, accentColor: "#99f7ff", cursor: "pointer" }}
                          />
                          <span style={{ fontSize: 14, flex: 1, color: checked ? "#e0e6f0" : "#9aa3b4" }}>
                            {show.title}
                            {subset && <span style={{ color: "#99f7ff", fontSize: 11, marginLeft: 8 }}>· {sel!.size}/{seasons!.length} seasons</span>}
                          </span>
                          {canExpand && (
                            <button
                              onClick={() => toggleExpand(show)}
                              style={{ ...btnGhost, padding: "3px 8px", fontSize: 11 }}
                            >
                              {isExpanded ? "▾ seasons" : "▸ seasons"}
                            </button>
                          )}
                        </div>
                        {isExpanded && canExpand && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "6px 12px 8px 40px" }}>
                            {loadingSeasons === show.id ? (
                              <span style={{ fontSize: 12, color: "#5a6473" }}>loading seasons…</span>
                            ) : !seasons || seasons.length === 0 ? (
                              <span style={{ fontSize: 12, color: "#5a6473" }}>no seasons found</span>
                            ) : (
                              seasons.map((n) => {
                                const on = (sel ?? new Set(seasons)).has(n);
                                return (
                                  <button
                                    key={n}
                                    onClick={() => toggleSeason(show.id, n)}
                                    style={{
                                      padding: "3px 10px", fontSize: 12, borderRadius: 999, cursor: "pointer",
                                      border: "1px solid " + (on ? "#99f7ff" : "rgba(255,255,255,0.12)"),
                                      background: on ? "rgba(153,247,255,0.12)" : "transparent",
                                      color: on ? "#cdeff5" : "#6b7585",
                                    }}
                                  >
                                    S{n}
                                  </button>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <ul style={{ fontSize: 13, lineHeight: 1.7, listStyle: "none", padding: 0, marginTop: 8 }}>
                <li>· Audio decode is the slow part — expect ~30 s per episode over a fast LAN connection.</li>
                <li>· Shows without a TMDB / TVDB / IMDB id are skipped (we can't write them to the keyed DB).</li>
                <li>· Pre-existing Plex Pass markers aren't affected; this is for users on free Plex / Jellyfin.</li>
              </ul>
            </div>
          )}

          {phase === "preparing" && (
            <Progress
              title="Preparing library"
              subtitle={`Fetching show metadata — ${prepareProgress.idx} / ${prepareProgress.total}`}
              detail={prepareProgress.title}
              ratio={prepareProgress.total > 0 ? prepareProgress.idx / prepareProgress.total : 0}
            />
          )}

          {(phase === "analyzing" || phase === "finished") && (
            <>
              <Progress
                title={phase === "finished" ? "Analysis complete" : "Analyzing"}
                subtitle={`Show ${showProgress.idx + 1} / ${showProgress.total} · ${showProgress.title || "—"} (${Math.round((episodeProgress.current / Math.max(1, episodeProgress.total)) * 100)}%)`}
                detail={currentEpisode}
                ratio={episodeProgress.total > 0 ? episodeProgress.current / episodeProgress.total : 0}
              />

              {episodesWithMarkers.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <p style={{ fontFamily: "ui-monospace, monospace", color: "#99f7ff", fontSize: 11, letterSpacing: "0.15em", marginBottom: 8 }}>
                    DETECTED · {episodesWithMarkers.length} EPISODES
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 100px 100px", gap: "6px 14px", fontSize: 12 }}>
                    <span style={cellHeader}>Show</span>
                    <span style={cellHeader}>Episode</span>
                    <span style={cellHeader}>Intro</span>
                    <span style={cellHeader}>Credits</span>
                    {episodesWithMarkers.slice(-200).map((r, i) => (
                      <div key={i} style={{ display: "contents" }}>
                        <span style={cell}>{r.show_title}</span>
                        <span style={cell}>S{r.season_number}E{r.episode_number}</span>
                        <span style={cell}>{r.intro_ms ? `${fmtMs(r.intro_ms[0])}–${fmtMs(r.intro_ms[1])}` : "—"}</span>
                        <span style={cell}>{r.credits_ms ? `${fmtMs(r.credits_ms[0])}–${fmtMs(r.credits_ms[1])}` : "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {phase === "submitted" && submitResult && (
            <Banner kind="success">
              Submitted {submitResult.episodes} episode-marker batches → {submitResult.inserted} rows accepted
              in the cloud DB. Already-submitted detections are returned as "duplicate" by the function;
              that's fine.
            </Banner>
          )}
        </section>

        <footer style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
          {phase === "error" && finalCount !== null ? (
            <>
              <button onClick={onClose} style={btnGhost}>Close</button>
              <button
                onClick={submit}
                disabled={!supabaseConfigured}
                style={supabaseConfigured ? btnPrimary : btnDisabled}
              >
                Retry Submission
              </button>
              <button
                onClick={start}
                disabled={!isTauri() || !serverType || selectedShows.size === 0}
                style={isTauri() && serverType && selectedShows.size > 0 ? btnGhost : btnDisabled}
              >
                Start new analysis
              </button>
            </>
          ) : phase === "idle" || phase === "error" || phase === "submitted" ? (
            <>
              <button onClick={onClose} style={btnGhost}>Close</button>
              <button
                onClick={start}
                disabled={!isTauri() || !serverType || selectedShows.size === 0}
                style={isTauri() && serverType && selectedShows.size > 0 ? btnPrimary : btnDisabled}
              >
                {phase === "submitted" ? "Run again" : `Start analysis (${selectedShows.size})`}
              </button>
            </>
          ) : (phase === "preparing" || phase === "analyzing") ? (
            <button onClick={cancel} style={btnGhost}>Cancel</button>
          ) : phase === "finished" && finalCount !== null ? (
            <>
              <button onClick={onClose} style={btnGhost}>Close without submitting</button>
              <button
                onClick={submit}
                disabled={!supabaseConfigured || finalCount === 0}
                style={supabaseConfigured && finalCount > 0 ? btnPrimary : btnDisabled}
              >
                Submit {finalCount} episode{finalCount === 1 ? "" : "s"} to cloud
              </button>
            </>
          ) : (
            <button disabled style={btnDisabled}>Working…</button>
          )}
        </footer>
      </motion.div>
    </motion.div>
  );
}

// ─── Small subcomponents ─────────────────────────────────────────────────────

function Banner({ kind, children }: { kind: "warn" | "error" | "success"; children: React.ReactNode }) {
  const palette = kind === "error"
    ? { bg: "rgba(255, 70, 70, 0.10)", border: "rgba(255, 70, 70, 0.35)", fg: "#ff8a8a" }
    : kind === "warn"
    ? { bg: "rgba(255, 200, 70, 0.10)", border: "rgba(255, 200, 70, 0.30)", fg: "#ffd28a" }
    : { bg: "rgba(70, 220, 140, 0.10)", border: "rgba(70, 220, 140, 0.35)", fg: "#9ff4c4" };
  return (
    <div style={{
      background: palette.bg, border: `1px solid ${palette.border}`,
      color: palette.fg, padding: "10px 14px", borderRadius: 12, fontSize: 13,
    }}>
      {children}
    </div>
  );
}



function Progress({
  title, subtitle, detail, ratio,
}: { title: string; subtitle: string; detail?: string; ratio: number }) {
  return (
    <div style={{ padding: "10px 0" }}>
      <p style={{ fontSize: 16, fontWeight: 700, color: "#e0e6f0" }}>{title}</p>
      <p style={{ fontSize: 12, color: "#9aa3b4", marginTop: 4 }}>{subtitle}</p>
      {detail && (
        <p style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: "#99f7ff", opacity: 0.7, marginTop: 4 }}>
          {detail}
        </p>
      )}
      <div style={{
        marginTop: 12, height: 6, borderRadius: 999,
        background: "rgba(153, 247, 255, 0.08)", overflow: "hidden",
      }}>
        <motion.div
          animate={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          style={{ height: "100%", background: "linear-gradient(90deg, #99f7ff, #b388ff)" }}
        />
      </div>
    </div>
  );
}

// ─── Inline styles ───────────────────────────────────────────────────────────

const btnBase: React.CSSProperties = {
  padding: "10px 18px", borderRadius: 12, fontSize: 13, fontWeight: 600,
  cursor: "pointer", border: "1px solid transparent",
};
const btnPrimary: React.CSSProperties = {
  ...btnBase,
  background: "rgba(153, 247, 255, 0.18)", color: "#99f7ff",
  borderColor: "rgba(153, 247, 255, 0.35)",
};
const btnGhost: React.CSSProperties = {
  ...btnBase,
  background: "rgba(255, 255, 255, 0.05)", color: "#cfd5e1",
  borderColor: "rgba(255, 255, 255, 0.10)",
};
const btnDisabled: React.CSSProperties = {
  ...btnBase, background: "rgba(255, 255, 255, 0.03)", color: "#5a6473",
  borderColor: "rgba(255, 255, 255, 0.05)", cursor: "not-allowed",
};
const cellHeader: React.CSSProperties = {
  fontFamily: "ui-monospace, monospace", color: "#99f7ff",
  fontSize: 10, letterSpacing: "0.15em", paddingBottom: 4,
  borderBottom: "1px solid rgba(153, 247, 255, 0.10)",
};
const cell: React.CSSProperties = { color: "#cfd5e1", padding: "3px 0" };
