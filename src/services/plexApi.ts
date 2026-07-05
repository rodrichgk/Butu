import type { PlexConfig, MediaItem, Episode } from "../types";

// Per-install Plex client identifier. Plex uses X-Plex-Client-Identifier to tell
// devices apart, so each install must report a UNIQUE, stable value — otherwise two
// Butu clients on the same account collide (one device entry, clashing sessions).
// Generated once and persisted; falls back to a constant if storage is unavailable.
export const CLIENT_ID: string = (() => {
  const KEY = "butu:plex-client-id";
  try {
    const existing = localStorage.getItem(KEY);
    if (existing) return existing;
    const rand = (crypto as any)?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const id = `butu-${rand}`;
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    return "butu-tv-v1";
  }
})();

/**
 * Headers Plex expects on every authenticated request. Token + identifier are
 * the must-haves; the rest help Plex pick a client profile for transcoding.
 */
export function plexRequestHeaders(token: string): Record<string, string> {
  return {
    "X-Plex-Token": token,
    "X-Plex-Client-Identifier": CLIENT_ID,
    "X-Plex-Product": "Butu",
    "X-Plex-Version": __APP_VERSION__,
    "X-Plex-Platform": "Chrome",
    "X-Plex-Device": "Linux",
    "X-Plex-Device-Name": "Butu (Chrome)",
    Accept: "application/vnd.apple.mpegurl, */*",
  };
}

// Use Tauri's Rust backend for HTTP requests to bypass CORS on desktop.
// Falls back to native fetch (e.g. browser / dev server).
async function plexFetch(url: string, token?: string): Promise<any> {
  const headers = plexHeaders(token);
  // @ts-ignore
  const tauri = window.__TAURI__?.core ?? window.__TAURI_INTERNALS__;
  if (tauri?.invoke) {
    const text = await tauri.invoke("fetch_plex", { url, headers }) as string;
    return JSON.parse(text);
  }
  // Browser path: send the X-Plex params in the QUERY STRING and use only the
  // CORS-safelisted Accept header, so this stays a "simple" request with NO
  // preflight. Custom X-Plex-* request headers trigger an OPTIONS preflight that
  // direct PMS connections reject — which made local/remote servers look
  // unreachable and forced the flaky plex.tv relay. (Plex Web does it this way;
  // see plexTranscodeDecision below, which already drops headers for this reason.)
  // The Tauri/Rust path above has no CORS, so it keeps using headers.
  const res = await fetch(withPlexParams(url, token), { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Appends the X-Plex auth/client params to the query string (no-op if already set). */
function withPlexParams(url: string, token?: string): string {
  try {
    const u = new URL(url);
    const set = (k: string, v: string) => { if (!u.searchParams.has(k)) u.searchParams.set(k, v); };
    set("X-Plex-Client-Identifier", CLIENT_ID);
    set("X-Plex-Product", "Butu");
    set("X-Plex-Version", __APP_VERSION__);
    if (token) set("X-Plex-Token", token);
    return u.toString();
  } catch {
    return url;
  }
}

function plexHeaders(token?: string): Record<string, string> {
  return {
    "X-Plex-Client-Identifier": CLIENT_ID,
    "X-Plex-Product": "Butu",
    "X-Plex-Version": __APP_VERSION__,
    "X-Plex-Platform": "Android TV",
    "Accept": "application/json",
    ...(token ? { "X-Plex-Token": token } : {}),
  };
}

// ─── Raw types ────────────────────────────────────────────────────────────────

export interface PlexSection {
  key: string;
  title: string;
  type: "movie" | "show" | "artist" | "photo";
}

export interface PlexRawItem {
  ratingKey: string;
  key: string;
  title: string;
  type: "movie" | "show" | "episode" | "track" | "album" | "artist";
  thumb?: string;
  art?: string;
  year?: number;
  duration?: number;            // milliseconds
  summary?: string;
  rating?: number;
  audienceRating?: number;
  parentIndex?: number;         // season number (on episode)
  index?: number;               // episode number
  Genre?: Array<{ tag: string }>;
  /** External provider GUIDs (`tmdb://1399`, `imdb://tt0903747`). Only returned
   *  when the request includes `includeGuids=1`. */
  Guid?: Array<{ id: string }>;
  Media?: Array<{
    bitrate?: number;
    width?: number;
    height?: number;
    videoCodec?: string;
    audioCodec?: string;
    Part?: Array<{ key: string; duration?: number }>;
  }>;
}

/** Loads the show's metadata with provider GUIDs attached. Used by the marker
 *  auto-detect pipeline to figure out which row to write under in Supabase. */
export async function fetchPlexShowGuids(
  cfg: PlexConfig,
  showKey: string,    // "/library/metadata/1234"
): Promise<string[]> {
  const base = cfg.serverUrl.replace(/\/$/, "");
  const url = `${base}${showKey}?includeGuids=1`;
  const data = await plexFetch(url, cfg.token).catch(() => ({}));
  const meta = (data.MediaContainer?.Metadata ?? [])[0] as PlexRawItem | undefined;
  return (meta?.Guid ?? []).map((g) => g.id).filter(Boolean);
}

export interface PlexTrack {
  id: string;        // Stream id → subtitleStreamID / audioStreamID
  type: "Audio" | "Subtitle";
  label: string;
  language?: string;
}

/** Subtitle/Audio streams for an item. The webview can't toggle burned-in tracks itself,
 *  so we burn/mux the chosen one server-side (see applyPlexTracks). */
export async function fetchPlexTracks(cfg: PlexConfig, ratingKey: string): Promise<PlexTrack[]> {
  const base = cfg.serverUrl.replace(/\/$/, "");
  const data = await plexFetch(`${base}/library/metadata/${ratingKey}`, cfg.token).catch(() => ({}));
  const meta = (data.MediaContainer?.Metadata ?? [])[0];
  const streams: any[] = meta?.Media?.[0]?.Part?.[0]?.Stream ?? [];
  return streams
    .filter((s) => s.streamType === 2 || s.streamType === 3) // 2 = audio, 3 = subtitle
    .map((s) => ({
      id: String(s.id),
      type: s.streamType === 2 ? "Audio" : "Subtitle",
      label: s.extendedDisplayTitle || s.displayTitle || s.title || s.language || `${s.streamType === 2 ? "Audio" : "Subtitle"} ${s.id}`,
      language: s.language,
    }));
}

/**
 * Rebuilds a Plex transcode URL to burn in [subtitleStreamId] and/or select [audioStreamId].
 * A fresh session + a primed `/decision` call are required for PMS to honour the change on start.m3u8.
 */
export async function applyPlexTracks(
  currentUrl: string,
  cfg: PlexConfig,
  subtitleStreamId: string | null,
  audioStreamId: string | null,
): Promise<string> {
  if (!currentUrl.includes("/transcode/universal/")) return currentUrl;
  let u: URL;
  try { u = new URL(currentUrl); } catch { return currentUrl; }

  if (subtitleStreamId) {
    u.searchParams.set("subtitleStreamID", subtitleStreamId);
    u.searchParams.set("subtitles", "burn");
    u.searchParams.set("subtitleSize", "100");
  } else {
    u.searchParams.delete("subtitleStreamID");
    u.searchParams.delete("subtitles");
    u.searchParams.delete("subtitleSize");
  }

  if (audioStreamId) {
    u.searchParams.set("audioStreamID", audioStreamId);
  } else {
    u.searchParams.delete("audioStreamID");
  }

  // Fresh session so PMS starts a new transcode honouring the change.
  const session = `butu-trk-${Date.now()}`;
  u.searchParams.set("session", session);
  u.searchParams.set("X-Plex-Session-Identifier", session);

  const decisionUrl = u.toString().replace("/start.m3u8", "/decision");
  await plexFetch(decisionUrl, cfg.token).catch(() => {});
  return u.toString();
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

/** Sign in via plex.tv and return an auth token. */
export async function plexSignIn(
  username: string,
  password: string
): Promise<{ token: string; userName: string }> {
  // @ts-ignore
  const tauri = window.__TAURI__?.core ?? window.__TAURI_INTERNALS__;
  const headers: Record<string, string> = {
    ...plexHeaders(),
    "Content-Type": "application/json",
    Authorization: "Basic " + btoa(`${username}:${password}`),
  };

  let data: any;
  if (tauri?.invoke) {
    // POST via Rust to bypass CORS on plex.tv
    const text = await tauri.invoke("fetch_plex_post", {
      url: "https://plex.tv/users/sign_in.json",
      headers,
      body: JSON.stringify({ login: username, password }),
    }) as string;
    data = JSON.parse(text);
  } else {
    const res = await fetch("https://plex.tv/users/sign_in.json", {
      method: "POST",
      headers,
      body: JSON.stringify({ login: username, password }),
    });
    if (!res.ok) throw new Error(`Plex login failed (${res.status}): wrong username or password`);
    data = await res.json();
  }
  return { token: data.user.authToken as string, userName: data.user.username as string };
}

/** Check server reachability (no token) or verify a token, via `/identity`. */
export async function verifyPlexServer(serverUrl: string, token?: string): Promise<void> {
  const base = serverUrl.replace(/\/$/, "");
  await plexFetch(`${base}/identity`, token);
}

// ─── plex.tv PIN / link flow (QR sign-in) ──────────────────────────────────────
// Mirrors the Kotlin PlexRepository: POST a PIN, show the 4-char code (+ QR to
// plex.tv/link), then poll until the user links and `authToken` is filled in.
// This is the modern, password-free sign-in — works with 2FA/SSO too.

export interface PlexPin {
  id: number;
  code: string;
  authToken?: string | null;
}

async function plexPostJson(url: string): Promise<any> {
  const headers = { ...plexHeaders(), "Content-Type": "application/json" };
  // @ts-ignore
  const tauri = window.__TAURI__?.core ?? window.__TAURI_INTERNALS__;
  if (tauri?.invoke) {
    const text = (await tauri.invoke("fetch_plex_post", { url, headers, body: "" })) as string;
    return JSON.parse(text);
  }
  const res = await fetch(url, { method: "POST", headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Creates a fresh plex.tv linking PIN. The default (no `strong`) gives the
 * 4-character code that the plex.tv/link page accepts — `strong=true` returns a
 * 25-char code that won't link, so don't use it.
 */
export async function createPlexPin(): Promise<PlexPin> {
  const data = await plexPostJson("https://plex.tv/api/v2/pins");
  return { id: data.id, code: data.code, authToken: data.authToken };
}

/** One-shot poll. Returns the auth token once the user has linked, else null. */
export async function pollPlexPin(id: number): Promise<string | null> {
  const data = await plexFetch(`https://plex.tv/api/v2/pins/${id}`).catch(() => null);
  const token = data?.authToken;
  return token && String(token).length > 0 ? (token as string) : null;
}

/** URL the QR encodes — opening it auto-fills the code on plex.tv/link. */
export function plexPinAuthUrl(code: string): string {
  return `https://plex.tv/link?code=${code}`;
}

// ─── Server discovery (plex.tv resources) ──────────────────────────────────────
// One call after sign-in returns every server the account can reach — owned AND
// shared — each with local / remote / relay connection URIs. This is what makes
// setup IP-less, remote access work off-network, and shared libraries appear.

export interface PlexConnection {
  uri: string;        // signed *.plex.direct URI (valid cert for local & remote)
  address: string;
  port: number;
  local: boolean;     // reachable on the same LAN
  relay: boolean;     // proxied through plex.tv (works anywhere, slower)
}

export interface PlexServer {
  name: string;
  clientIdentifier: string;
  owned: boolean;       // false ⇒ a server shared with you
  accessToken: string;  // per-server token to use for THIS server
  connections: PlexConnection[];
}

/** Lists all Plex servers the token can reach (owned + shared). */
export async function fetchPlexResources(token: string): Promise<PlexServer[]> {
  const url = "https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1";
  const data = await plexFetch(url, token).catch(() => []);
  const devices: any[] = Array.isArray(data) ? data : [];
  return devices
    .filter((d) => typeof d.provides === "string" && d.provides.split(",").includes("server"))
    .map((d) => ({
      name: d.name ?? "Plex Server",
      clientIdentifier: d.clientIdentifier,
      owned: !!d.owned,
      accessToken: d.accessToken ?? token,
      connections: (d.connections ?? []).map((c: any) => ({
        uri: String(c.uri ?? "").replace(/\/$/, ""),
        address: c.address,
        port: c.port,
        local: !!c.local,
        relay: !!c.relay,
      })) as PlexConnection[],
    }))
    // Owned servers first, then shared.
    .sort((a, b) => Number(b.owned) - Number(a.owned));
}

async function pingPlex(uri: string, token: string, timeoutMs: number): Promise<boolean> {
  const ping = verifyPlexServer(uri, token).then(() => true).catch(() => false);
  const timeout = new Promise<boolean>((r) => setTimeout(() => r(false), timeoutMs));
  return Promise.race([ping, timeout]);
}

/** Resolves to the first reachable uri in `conns`, or null if none answer. */
function raceReachable(conns: PlexConnection[], token: string, timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    let pending = conns.length;
    if (pending === 0) return resolve(null);
    conns.forEach(async (c) => {
      const ok = await pingPlex(c.uri, token, timeoutMs);
      if (ok) resolve(c.uri);
      else if (--pending === 0) resolve(null);
    });
  });
}

/**
 * Picks the best working connection for a server: local first (fast LAN), then
 * remote (direct/port-forwarded), then relay (plex.tv-proxied — works anywhere).
 * Returns the reachable uri, or null if the server can't be reached at all.
 */
export async function pickPlexConnection(server: PlexServer, timeoutMs = 4000): Promise<string | null> {
  const local  = server.connections.filter((c) => c.local && !c.relay);
  const remote = server.connections.filter((c) => !c.local && !c.relay);
  const relay  = server.connections.filter((c) => c.relay);
  return (
    (await raceReachable(local, server.accessToken, timeoutMs)) ??
    (await raceReachable(remote, server.accessToken, timeoutMs)) ??
    (await raceReachable(relay, server.accessToken, timeoutMs))
  );
}

// ─── Library sections ─────────────────────────────────────────────────────────

export async function fetchPlexSections(cfg: PlexConfig): Promise<PlexSection[]> {
  const base = cfg.serverUrl.replace(/\/$/, "");
  const data = await plexFetch(`${base}/library/sections`, cfg.token);
  return (data.MediaContainer?.Directory ?? []) as PlexSection[];
}

// ─── Library items ────────────────────────────────────────────────────────────

export async function fetchPlexSection(
  cfg: PlexConfig,
  sectionKey: string
): Promise<PlexRawItem[]> {
  const base = cfg.serverUrl.replace(/\/$/, "");
  const data = await plexFetch(`${base}/library/sections/${sectionKey}/all?includeGuids=1`, cfg.token);
  return (data.MediaContainer?.Metadata ?? []) as PlexRawItem[];
}

// ─── Episodes ─────────────────────────────────────────────────────────────────

/** Lists a show's seasons (number + title), excluding the "All episodes" pseudo
 *  entry. Used by the marker modal's per-show season picker. */
export async function fetchPlexSeasons(
  cfg: PlexConfig,
  showRatingKey: string,
): Promise<{ number: number; title: string }[]> {
  const base = cfg.serverUrl.replace(/\/$/, "");
  const data = await plexFetch(`${base}/library/metadata/${showRatingKey}/children`, cfg.token).catch(() => ({}));
  const seasons = (data.MediaContainer?.Metadata ?? []) as PlexRawItem[];
  return seasons
    .filter((s) => typeof s.index === "number")
    .map((s) => ({ number: s.index as number, title: s.title }));
}

export async function fetchPlexEpisodes(
  cfg: PlexConfig,
  showKey: string       // e.g. "/library/metadata/1234"
): Promise<PlexRawItem[]> {
  const base = cfg.serverUrl.replace(/\/$/, "");

  // Get seasons
  const seasonsData = await plexFetch(`${base}${showKey}/children?includeGuids=1`, cfg.token).catch(() => ({}));
  const seasons = (seasonsData.MediaContainer?.Metadata ?? []) as PlexRawItem[];

  // Get episodes from each season in parallel
  const episodeLists = await Promise.all(
    seasons.map(async (season) => {
      const epData = await plexFetch(`${base}${season.key}?includeGuids=1`, cfg.token).catch(() => ({}));
      return (epData.MediaContainer?.Metadata ?? []) as PlexRawItem[];
    })
  );
  return episodeLists.flat();
}

// ─── URL helpers ──────────────────────────────────────────────────────────────

export function plexThumbUrl(cfg: PlexConfig, thumb: string): string {
  if (!thumb) return "";
  const base = cfg.serverUrl.replace(/\/$/, "");
  return `${base}${thumb}?X-Plex-Token=${cfg.token}`;
}

export function plexStreamUrl(cfg: PlexConfig, partKey: string): string {
  const base = cfg.serverUrl.replace(/\/$/, "");
  return `${base}${partKey}?X-Plex-Token=${cfg.token}&download=0`;
}

/**
 * HLS stream URL via Plex universal transcoder.
 * directPlay=0, directStream=1 → Plex remuxes the original video into HLS
 * segments without re-encoding. Near-zero CPU on the server, no encode lag,
 * and the video codec stays whatever the file already is (usually H.264).
 * Only falls back to full transcode if the container/codec can't be remuxed.
 */
export function plexTranscodeUrl(cfg: PlexConfig, ratingKey: string): string {
  const base = cfg.serverUrl.replace(/\/$/, "");
  const params = new URLSearchParams({
    "X-Plex-Token": cfg.token,
    "X-Plex-Client-Identifier": CLIENT_ID,
    "X-Plex-Platform": "Chrome",
    "X-Plex-Product": "Butu",
    "X-Plex-Version": __APP_VERSION__,
    "path": `/library/metadata/${ratingKey}`,
    "protocol": "hls",
    "mediaIndex": "0",
    "partIndex": "0",
    "fastSeek": "1",
    "directPlay": "0",
    "directStream": "1",   // remux only — no re-encode, no CPU lag
    "copyts": "1",
    "audioCodec": "aac",
    "audioBoost": "100",
    "X-Plex-Session-Identifier": `butu-${ratingKey}`,
    // Serve HLS segments while still transcoding so a fresh transcode (e.g. the audio downmix
    // "Boost voices" forces) doesn't leave the player buffering on first play.
    "X-Plex-Incomplete-Segments": "1",
  });
  return `${base}/video/:/transcode/universal/start.m3u8?${params.toString()}`;
}

function tvTranscodeParams(cfg: PlexConfig, ratingKey: string, session: string): string {
  const params = new URLSearchParams({
    "path": `/library/metadata/${ratingKey}`,
    "protocol": "hls",
    "offset": "0",
    "session": session,
    "mediaIndex": "0",
    "partIndex": "0",
    "directPlay": "0",
    "directStream": "0", // CRITICAL: Force transcode! Remuxing high-bitrate kills TV decoders
    "videoResolution": "1280x720", // Force 720p for fast TV decode
    "fastSeek": "1",
    "copyts": "1",
    "hasMDE": "1",
    "location": "lan",
    "subtitleSize": "100",
    "audioBoost": "100",
    "addDebugOverlay": "0",
    "autoAdjustQuality": "0",
    "directStreamAudio": "1",
    "mediaBufferSize": "102400",
    "subtitles": "burn",
    "Accept-Language": "en",
    "X-Plex-Session-Identifier": session,
    "X-Plex-Incomplete-Segments": "1",
    "X-Plex-Product": "Butu",
    "X-Plex-Version": __APP_VERSION__,
    "X-Plex-Client-Identifier": CLIENT_ID,
    "X-Plex-Platform": "Android TV",
    "X-Plex-Platform-Version": "12.0",
    "X-Plex-Features": "external-media,indirect-media",
    "X-Plex-Model": "hosted",
    "X-Plex-Device": "Android",
    "X-Plex-Device-Name": "Butu TV",
    "X-Plex-Device-Screen-Resolution": "1920x1080",
    "X-Plex-Token": cfg.token,
    "X-Plex-Language": "en",
    "maxVideoBitrate": "3000",
    "X-Plex-Client-Profile-Extra": "add-transcode-target(type=videoProfile&context=streaming&protocol=hls&container=mpegts&videoCodec=h264&audioCodec=aac)"
  });
  return params.toString();
}

/** Generate a pseudo-random session ID for transcode requests. */
function makeSession(ratingKey: string): string {
  const r = Math.random().toString(36).slice(2, 10);
  return `butu-${ratingKey}-${r}`;
}

/**
 * Android TV HLS URL — minimal parameter set.
 * Plex returns 400 if certain X-Plex-* headers are missing from the query,
 * since the transcoder uses them to pick a client profile. The path must
 * NOT be URL-encoded — Plex expects literal slashes in the value.
 */
export function plexTranscodeUrlTV(cfg: PlexConfig, ratingKey: string, session?: string): string {
  const base = cfg.serverUrl.replace(/\/$/, "");
  const sid = session ?? makeSession(ratingKey);
  return `${base}/video/:/transcode/universal/start.m3u8?${tvTranscodeParams(cfg, ratingKey, sid)}`;
}

/**
 * Call the Plex `/decision` endpoint to initialise a transcode session.
 * Many PMS versions require this step before `start.m3u8` will return 200.
 * Returns the session ID that must be reused in the `start.m3u8` URL.
 */
export async function plexTranscodeDecision(
  cfg: PlexConfig,
  ratingKey: string
): Promise<{ session: string; hlsUrl: string }> {
  const base = cfg.serverUrl.replace(/\/$/, "");
  const session = makeSession(ratingKey);
  const params = tvTranscodeParams(cfg, ratingKey, session);
  const url = `${base}/video/:/transcode/universal/decision?${params}`;

  // Do NOT add custom HTTP headers — they trigger a CORS preflight (OPTIONS)
  // that Plex rejects with 400. All auth params are already in the URL.
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "no body");
    // Plex often returns XML like <Response code="400" status="Detailed error message">
    // Let's try to extract the status message if it exists, otherwise return the whole body.
    const match = body.match(/status="([^"]+)"/);
    const msg = match ? match[1] : body.slice(0, 100);
    throw new Error(`Plex 400: ${msg}`);
  }
  const hlsUrl = `${base}/video/:/transcode/universal/start.m3u8?${tvTranscodeParams(cfg, ratingKey, session)}`;
  return { session, hlsUrl };
}

// ─── Mapping ──────────────────────────────────────────────────────────────────

function resolutionLabel(height?: number): string | undefined {
  if (!height) return undefined;
  if (height >= 2160) return "4K HDR";
  if (height >= 1080) return "1080p";
  if (height >= 720) return "720p";
  return `${height}p`;
}

export function plexRawToMediaItem(raw: PlexRawItem, cfg: PlexConfig): MediaItem {
  const type: MediaItem["type"] =
    raw.type === "movie" ? "movie"
    : raw.type === "show" ? "tv"
    : raw.type === "artist" ? "music"
    : "movie";

  const media = raw.Media?.[0];
  const part  = media?.Part?.[0];

  return {
    id: raw.ratingKey,
    plexKey: raw.key,
    plexPartKey: part?.key,
    title: raw.title,
    type,
    thumbnail: raw.thumb  ? plexThumbUrl(cfg, raw.thumb) : "",
    backdropUrl: raw.art  ? plexThumbUrl(cfg, raw.art)   : undefined,
    year:        raw.year,
    rating:      raw.audienceRating ?? raw.rating,
    duration:    raw.duration ? raw.duration / 1000 : undefined,
    genre:       raw.Genre?.map((g) => g.tag),
    description: raw.summary,
    resolution:  resolutionLabel(media?.height),
    codec:       media?.videoCodec?.toUpperCase(),
    bitrate:     media?.bitrate ? `${(media.bitrate / 1000).toFixed(0)} Mbps` : undefined,
    url:         part?.key ? plexStreamUrl(cfg, part.key) : undefined,
    streamUrl:   plexTranscodeUrl(cfg, raw.ratingKey),
    // Provider GUIDs (imdb/tmdb/tvdb) arrive in the `Guid[]` array when the
    // listing is fetched with `includeGuids=1`. Without mapping them here the
    // marker pipeline can't key a show/movie and skips it entirely.
    externalIds: (raw.Guid ?? []).map((g) => g.id).filter(Boolean),
  };
}

export function plexRawToEpisode(raw: PlexRawItem, cfg: PlexConfig): Episode {
  const media = raw.Media?.[0];
  const part  = media?.Part?.[0];
  return {
    id:          raw.ratingKey,
    season:      raw.parentIndex ?? 1,
    episode:     raw.index       ?? 1,
    title:       raw.title,
    duration:    raw.duration ? raw.duration / 1000 : 45 * 60,
    description: raw.summary,
    thumbnail:   raw.thumb ? plexThumbUrl(cfg, raw.thumb) : undefined,
    url:         part?.key ? plexStreamUrl(cfg, part.key) : undefined,
    streamUrl:   plexTranscodeUrl(cfg, raw.ratingKey),
  };
}
