/**
 * Companion-app marker auto-detect service.
 *
 * Bridges the React UI to the Rust analysis pipeline (src-tauri/src/analysis/).
 * Builds the show-tree the Rust side expects from the current library, calls
 * the Tauri `analyze_library` command, streams progress events back to the
 * caller, then triggers `submit_markers` to ship results to the Supabase
 * Edge Function.
 */

import { fetchPlexEpisodes, fetchPlexSeasons, fetchPlexShowGuids, plexStreamUrl } from "./plexApi";
import { fetchJellyfinEpisodes, fetchJellyfinSeasons, streamUrl as jellyfinStreamUrl } from "./jellyfinApi";
import type { PlexConfig, JellyfinConfig, MediaItem } from "../types";
import { invoke, tauriListen, proxyGetJson } from "./tauri";

// ─── Public types ────────────────────────────────────────────────────────────

export interface EpisodeInput {
  id: string;
  stream_url: string;
  duration_ms: number;
  season: number;
  episode: number;
  headers?: Record<string, string>;
}

export interface SeasonInput {
  season_number: number;
  episodes: EpisodeInput[];
}

export interface ShowInput {
  title: string;
  external_ids: string[];   // ["tmdb://1399", ...]
  /** "tv" → cross-episode fingerprinting; "movie" → black-frame/chapter path.
   *  Defaults to "tv" on the Rust side when omitted. */
  kind?: "tv" | "movie";
  seasons: SeasonInput[];
}

export type ProgressEvent =
  | { kind: "started"; total_shows: number; total_episodes: number }
  | { kind: "show"; index: number; title: string; season_count: number }
  | { kind: "season"; show_title: string; season_number: number; episode_count: number }
  | {
      kind: "episode";
      show_title: string;
      season_number: number;
      episode_number: number;
      stage: "decoding" | "fingerprinting" | "done" | "failed";
    }
  | {
      kind: "episode_markers";
      show_title: string;
      season_number: number;
      episode_number: number;
      intro_ms: [number, number] | null;
      credits_ms: [number, number] | null;
    }
  | { kind: "show_finished"; title: string; episode_results: number }
  | { kind: "finished"; total_episodes_marked: number }
  | { kind: "failed"; message: string };

export interface AnalyzeResponse { episode_count: number; }
export interface SubmitResponse { inserted: number; episode_count: number; }

// Tauri bridge helpers live in ./tauri; re-exported here for existing importers.
export { isTauri } from "./tauri";

// ─── Library → ShowInput ────────────────────────────────────────────────────

/**
 * Walks the library, fetches per-show GUIDs + episodes (Plex), and returns the
 * tree the Rust pipeline consumes.
 *
 * onShowReady fires every time a show finishes preparing — used to surface
 * "Preparing 5 of 12 shows" in the UI before fingerprinting even starts.
 */
/** Season numbers available for a show, for the modal's per-show season picker. */
export async function fetchShowSeasons(
  serverType: "plex" | "jellyfin" | null,
  plexCfg: PlexConfig | null,
  jellyCfg: JellyfinConfig | null,
  item: MediaItem,
): Promise<number[]> {
  if (serverType === "plex" && plexCfg && item.plexKey) {
    const seasons = await fetchPlexSeasons(plexCfg, item.id).catch(() => []);
    return seasons.map((s) => s.number).sort((a, b) => a - b);
  }
  if (serverType === "jellyfin" && jellyCfg && item.jellyfinId) {
    return (await fetchJellyfinSeasons(jellyCfg, item.jellyfinId).catch(() => [])).sort((a, b) => a - b);
  }
  return [];
}

export async function buildShowInputs(
  serverType: "plex" | "jellyfin" | null,
  plexCfg: PlexConfig | null,
  jellyCfg: JellyfinConfig | null,
  library: MediaItem[],
  onShowReady?: (index: number, total: number, title: string) => void,
  signal?: AbortSignal,
  /** Per-show (keyed by item.id) allow-list of season numbers. Omit a show to
   *  include all its seasons; an empty array excludes the show entirely. */
  seasonFilter?: Record<string, number[]>,
): Promise<ShowInput[]> {
  const shows = library.filter(
    (it) => it.type === "tv" || it.type === "anime",
  );
  const movies = library.filter((it) => it.type === "movie");
  const totalPrep = shows.length + movies.length;
  const out: ShowInput[] = [];
  const debugLog: string[] = [];

  const typeCounts: Record<string, number> = {};
  for (const it of library) typeCounts[it.type] = (typeCounts[it.type] ?? 0) + 1;
  debugLog.push(
    `[input] server=${serverType} library=${library.length} types=${JSON.stringify(typeCounts)} ` +
    `→ tvShows=${shows.length} movies=${movies.length} hasPlexCfg=${!!plexCfg} hasJellyCfg=${!!jellyCfg}`,
  );

  for (let i = 0; i < shows.length; i++) {
    if (signal?.aborted) break;
    const item = shows[i];
    onShowReady?.(i, totalPrep, item.title);

    let externalIds: string[] = item.externalIds ?? [];
    if (externalIds.length === 0 && item.plexKey && plexCfg) {
      const showKey = `/library/metadata/${item.id}`;
      try {
        externalIds = await fetchPlexShowGuids(plexCfg, showKey);
        debugLog.push(`[${item.title}] fetchPlexShowGuids OK: ${externalIds.join(",")}`);
      } catch (e: any) {
        debugLog.push(`[${item.title}] fetchPlexShowGuids ERR: ${e.message}`);
      }
    }

    // Fallback: If no provider IDs from server (or Jellyfin, which doesn't return them here),
    // we fetch them directly using the public TVMaze API by show title.
    if (externalIds.length === 0) {
      try {
        await new Promise((r) => setTimeout(r, 600)); // Respect TVMaze rate limit (20 req / 10s)
        const url = `https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(item.title)}`;

        const data = await proxyGetJson<{ externals?: { thetvdb?: number; imdb?: string } }>(url);

        if (data && data.externals) {
          if (data.externals.thetvdb) externalIds.push(`tvdb://${data.externals.thetvdb}`);
          if (data.externals.imdb) externalIds.push(`imdb://${data.externals.imdb}`);
        }
      } catch (e) {
        console.warn("TVMaze fallback failed for", item.title, e);
      }
    }

    // Skip shows we can't index. Without an external id the submission would
    // be unkeyable and the TV side couldn't find it.
    if (externalIds.length === 0) {
      debugLog.push(`[${item.title}] SKIPPED: externalIds.length === 0`);
      continue;
    }

    const bySeason = new Map<number, EpisodeInput[]>();

    if (item.plexKey && plexCfg) {
      const showKey = `/library/metadata/${item.id}`;
      let raw: any[] = [];
      try {
        raw = await fetchPlexEpisodes(plexCfg, showKey);
        debugLog.push(`[${item.title}] fetchPlexEpisodes OK: ${raw.length} eps`);
      } catch (e: any) {
        debugLog.push(`[${item.title}] fetchPlexEpisodes ERR: ${e.message}`);
      }
      for (const rep of raw) {
        const season = rep.parentIndex ?? 1;
        const episode = rep.index ?? 1;
        const duration_ms = rep.duration ?? 0;
        if (duration_ms < 5 * 60 * 1000) continue;  // too short to bother fingerprinting
        // Fingerprint the ORIGINAL file part, not the universal transcoder.
        // The transcode URL re-encodes audio to AAC, which shifts chromaprint
        // hashes between episodes/requests and kills cross-episode matching.
        // The direct part is the untouched audio ffmpeg can range-seek into.
        const partKey = rep.Media?.[0]?.Part?.[0]?.key;
        if (!partKey) {
          debugLog.push(`[${item.title}] S${season}E${episode} SKIPPED: no part key for direct stream`);
          continue;
        }
        const stream_url = plexStreamUrl(plexCfg, partKey);
        const arr = bySeason.get(season) ?? [];
        arr.push({ id: rep.ratingKey, stream_url, duration_ms, season, episode });
        bySeason.set(season, arr);
      }
    } else if (item.jellyfinId && jellyCfg) {
      const raw = await fetchJellyfinEpisodes(jellyCfg, item.jellyfinId).catch(() => []);
      for (const rep of raw) {
        const season = rep.ParentIndexNumber ?? 1;
        const episode = rep.IndexNumber ?? 1;
        // RunTimeTicks is in ticks (10,000,000 ticks = 1 second) -> ms = ticks / 10,000
        const duration_ms = rep.RunTimeTicks ? rep.RunTimeTicks / 10000 : 0;
        if (duration_ms < 5 * 60 * 1000) continue;
        const stream_url = jellyfinStreamUrl(jellyCfg, rep.Id);
        const arr = bySeason.get(season) ?? [];
        arr.push({ id: rep.Id, stream_url, duration_ms, season, episode });
        bySeason.set(season, arr);
      }
    }

    const allowedSeasons = seasonFilter?.[item.id];
    const seasons: SeasonInput[] = Array.from(bySeason.entries())
      .filter(([season_number]) => allowedSeasons === undefined || allowedSeasons.includes(season_number))
      .map(([season_number, episodes]) => ({
        season_number,
        episodes: episodes.sort((a, b) => a.episode - b.episode),
      }))
      .sort((a, b) => a.season_number - b.season_number);

    if (seasons.length === 0) {
      debugLog.push(`[${item.title}] SKIPPED: seasons.length === 0 (filtered out, or no episodes had a part key / duration ≥ 5min)`);
      continue;
    }
    const epCount = seasons.reduce((n, s) => n + s.episodes.length, 0);
    debugLog.push(`[${item.title}] OK tv: ids=[${externalIds.join(",")}] seasons=${seasons.length} eps=${epCount}`);
    out.push({ title: item.title, external_ids: externalIds, kind: "tv", seasons });
  }

  // ─── Movies ────────────────────────────────────────────────────────────────
  // No siblings to fingerprint, so each movie ships as a one-season/one-episode
  // ShowInput the Rust side routes through the black-frame/chapter detector.
  for (let i = 0; i < movies.length; i++) {
    if (signal?.aborted) break;
    const item = movies[i];
    onShowReady?.(shows.length + i, totalPrep, item.title);

    let externalIds: string[] = item.externalIds ?? [];
    if (externalIds.length === 0 && item.plexKey && plexCfg) {
      // Movie metadata exposes its provider GUIDs the same way a show does.
      const movieKey = `/library/metadata/${item.id}`;
      externalIds = await fetchPlexShowGuids(plexCfg, movieKey).catch(() => []);
    }
    if (externalIds.length === 0) {
      debugLog.push(`[${item.title}] MOVIE SKIPPED: no external id (item.externalIds empty, plexKey=${!!item.plexKey})`);
      continue;
    }

    let stream_url: string | null = null;
    if (plexCfg && item.plexPartKey) {
      stream_url = plexStreamUrl(plexCfg, item.plexPartKey);
    } else if (jellyCfg && item.jellyfinId) {
      stream_url = jellyfinStreamUrl(jellyCfg, item.jellyfinId);
    }
    if (!stream_url) {
      debugLog.push(`[${item.title}] MOVIE SKIPPED: no direct stream url (plexPartKey=${!!item.plexPartKey}, jellyfinId=${!!item.jellyfinId})`);
      continue;
    }

    const duration_ms = item.duration ? Math.round(item.duration * 1000) : 0;
    if (duration_ms < 20 * 60 * 1000) {
      debugLog.push(`[${item.title}] MOVIE SKIPPED: duration ${duration_ms}ms too short/unknown`);
      continue;
    }

    debugLog.push(`[${item.title}] OK movie: ids=[${externalIds.join(",")}] dur=${duration_ms}ms`);
    out.push({
      title: item.title,
      external_ids: externalIds,
      kind: "movie",
      seasons: [
        { season_number: 1, episodes: [{ id: item.id, stream_url, duration_ms, season: 1, episode: 1 }] },
      ],
    });
  }

  debugLog.push(`[result] resolved ${out.length} of ${totalPrep} items`);
  if (out.length === 0) {
    // The per-item breakdown rides along on the error so the caller can log it.
    throw new Error(debugLog.join("\n"));
  }
  return out;
}

// ─── Tauri commands ──────────────────────────────────────────────────────────

/** Which Rust detection pipeline to run. `"legacy"` is the original algorithm;
 *  `"fast"` is the concurrent, remote-stream-optimized variant kept alongside it
 *  for A/B comparison. */
export type Analyzer = "legacy" | "fast";

export async function runAnalysis(
  shows: ShowInput[],
  algorithm: Analyzer = "fast",
  concurrency?: number,
): Promise<AnalyzeResponse> {
  return await invoke<AnalyzeResponse>("analyze_library", {
    args: { shows, algorithm, concurrency },
  });
}

export async function cancelAnalysis(): Promise<void> {
  try {
    await invoke("cancel_analysis");
  } catch {
    /* not in Tauri, or nothing running */
  }
}

export interface SubmitArgs {
  endpoint: string;
  anon_key: string;
  submitted_by?: string;
  source?: string;
}

export async function submitDetectedMarkers(args: SubmitArgs): Promise<SubmitResponse> {
  return await invoke<SubmitResponse>("submit_markers", { args });
}

/** Subscribes to `analysis-progress`. Returns the unsubscribe fn. */
export async function subscribeProgress(
  cb: (ev: ProgressEvent) => void,
): Promise<() => void> {
  return tauriListen<ProgressEvent>("analysis-progress", cb);
}
