import { MediaItem, Episode } from "../types";

const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string | undefined;

export interface CloudMarker {
  type: "intro" | "credits";
  startMs: number;
  endMs: number;
}

export async function fetchCloudMarkers(item: MediaItem, ep?: Episode): Promise<CloudMarker[]> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return [];
  }
  
  // figure out provider and id
  const extIds = ep?.externalIds?.length ? ep.externalIds : item.externalIds || [];
  let provider = "";
  let providerId = "";

  for (const id of extIds) {
    if (id.startsWith("tmdb://")) {
      provider = "tmdb";
      providerId = id.replace("tmdb://", "");
      break;
    }
    if (id.startsWith("tvdb://")) {
      provider = "tvdb";
      providerId = id.replace("tvdb://", "");
      break;
    }
    if (id.startsWith("imdb://")) {
      provider = "imdb";
      providerId = id.replace("imdb://", "");
      break;
    }
  }

  if (!provider || !providerId) {
    return [];
  }

  const season = ep?.season ?? item.season ?? 1;
  const episode = ep?.episode ?? item.episode ?? 1;

  try {
    const url = new URL(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/markers`);
    url.searchParams.set("select", "marker_type,start_ms,end_ms,submitted_by");
    url.searchParams.set("provider", `eq.${provider}`);
    url.searchParams.set("provider_id", `eq.${providerId}`);
    url.searchParams.set("season", `eq.${season}`);
    url.searchParams.set("episode", `eq.${episode}`);

    const res = await fetch(url.toString(), {
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
      }
    });

    if (!res.ok) {
      console.error("fetchCloudMarkers failed", await res.text());
      return [];
    }

    const rows = await res.json();
    // The cloud DB carries bulk "seed" placeholder markers (flat, eyeballed times
    // duplicated across a season) alongside accurate per-episode markers. Once a
    // real marker exists for a type the seed is noise — e.g. a flat 50:00 credits
    // seed fires "Up Next" minutes early on a 58:53 episode. So for each type, drop
    // the seed rows when a non-seed of that type is present (seed-only stays).
    const typesWithReal = new Set(
      rows.filter((r: any) => r.submitted_by !== "seed").map((r: any) => r.marker_type)
    );
    return rows
      .filter((r: any) => !(r.submitted_by === "seed" && typesWithReal.has(r.marker_type)))
      .map((row: any) => ({
        type: row.marker_type,
        startMs: row.start_ms,
        endMs: row.end_ms
      }));
  } catch (err) {
    console.error("fetchCloudMarkers threw error", err);
    return [];
  }
}

// ─── IntroDB (primary source) ──────────────────────────────────────────────────
// introdb.app is a public crowd DB of hand-verified per-episode intro/outro
// timestamps keyed by IMDb id. We prefer it over the Butu cloud DB because its
// visual credit-roll starts are human-marked (audio fingerprinting can only find
// the recurring end-theme, which starts well after the credits visually begin).

const INTRODB_SEGMENTS = "https://api.introdb.app/segments";
const TVMAZE_SINGLE = "https://api.tvmaze.com/singlesearch/shows";

// Resolved IMDb ids by lowercased show title, so we hit TVMaze at most once/show.
const imdbCache = new Map<string, string | null>();

function tauriCore(): any {
  const w = window as any;
  return w.__TAURI__?.core ?? w.__TAURI_INTERNALS__;
}

// GET JSON through the Tauri proxy (dodges CORS, carries the desktop's network),
// falling back to plain fetch in a browser. Returns null on any non-2xx / error.
async function httpGetJson(url: string): Promise<any | null> {
  try {
    const core = tauriCore();
    if (core?.invoke) {
      const text = (await core.invoke("fetch_plex", { url, headers: {} })) as string;
      return JSON.parse(text);
    }
    const res = await fetch(url);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

function imdbFromExtIds(ids: string[]): string | null {
  for (const id of ids) if (id.startsWith("imdb://")) return id.slice("imdb://".length);
  return null;
}

async function resolveImdbId(item: MediaItem, ep?: Episode): Promise<string | null> {
  const ext = ep?.externalIds?.length ? ep.externalIds : item.externalIds || [];
  const direct = imdbFromExtIds(ext);
  if (direct) return direct;

  const title = item.title?.trim();
  if (!title) return null;
  const key = title.toLowerCase();
  if (imdbCache.has(key)) return imdbCache.get(key)!;

  const data = await httpGetJson(`${TVMAZE_SINGLE}?q=${encodeURIComponent(title)}`);
  const imdb = (data?.externals?.imdb as string | undefined) ?? null;
  imdbCache.set(key, imdb);
  return imdb;
}

export async function fetchIntroDbMarkers(item: MediaItem, ep?: Episode): Promise<CloudMarker[]> {
  const imdb = await resolveImdbId(item, ep);
  if (!imdb) return [];
  const season = ep?.season ?? item.season ?? 1;
  const episode = ep?.episode ?? item.episode ?? 1;

  const url = `${INTRODB_SEGMENTS}?imdb_id=${encodeURIComponent(imdb)}&season=${season}&episode=${episode}`;
  const d = await httpGetJson(url);
  if (!d) return [];

  const out: CloudMarker[] = [];
  if (d.intro?.start_ms != null) out.push({ type: "intro", startMs: d.intro.start_ms, endMs: d.intro.end_ms });
  if (d.outro?.start_ms != null) out.push({ type: "credits", startMs: d.outro.start_ms, endMs: d.outro.end_ms });
  return out;
}

/**
 * Marker lookup for playback. IntroDB is the primary (accurate, hand-verified)
 * source; the Butu cloud DB (fingerprint-detected + seed markers) fills in any
 * marker type IntroDB doesn't cover for this episode.
 */
export async function fetchMarkers(item: MediaItem, ep?: Episode): Promise<CloudMarker[]> {
  const [introdb, cloud] = await Promise.all([
    fetchIntroDbMarkers(item, ep).catch(() => [] as CloudMarker[]),
    fetchCloudMarkers(item, ep).catch(() => [] as CloudMarker[]),
  ]);
  const covered = new Set(introdb.map((m) => m.type));
  return [...introdb, ...cloud.filter((m) => !covered.has(m.type))];
}
