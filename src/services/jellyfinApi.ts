import type { JellyfinConfig, MediaItem, Episode } from "../types";

const DEVICE_ID = "butu-desktop-v1";
const CLIENT_INFO = `Client="Butu", Device="Desktop", DeviceId="${DEVICE_ID}", Version="0.1.0"`;

function authHeader(token?: string): Record<string, string> {
  const base = `MediaBrowser ${CLIENT_INFO}`;
  return {
    "X-Emby-Authorization": token ? `${base}, Token="${token}"` : base,
    "Content-Type": "application/json",
  };
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function authenticateUser(
  serverUrl: string,
  username: string,
  password: string
): Promise<{ token: string; userId: string; userName: string }> {
  const url = `${serverUrl.replace(/\/$/, "")}/Users/AuthenticateByName`;
  const res = await fetch(url, {
    method: "POST",
    headers: authHeader(),
    body: JSON.stringify({ Username: username, Pw: password }),
  });
  if (!res.ok) throw new Error(`Login failed (${res.status}): ${res.statusText}`);
  const data = await res.json();
  return {
    token: data.AccessToken as string,
    userId: data.User.Id as string,
    userName: data.User.Name as string,
  };
}

// ─── Raw Jellyfin item type ────────────────────────────────────────────────────

interface JellyfinRawItem {
  Id: string;
  Name: string;
  Type: string;
  ProductionYear?: number;
  Overview?: string;
  CommunityRating?: number;
  RunTimeTicks?: number;
  IndexNumber?: number;
  ParentIndexNumber?: number;
  SeriesId?: string;
  SeriesName?: string;
  SeasonId?: string;
  BackdropImageTags?: string[];
  ImageTags?: { Primary?: string; Backdrop?: string };
  GenreItems?: Array<{ Id: string; Name: string }>;
  MediaSources?: Array<{
    Id: string;
    Path?: string;
    Container?: string;
    Bitrate?: number;
    VideoStreams?: Array<{
      DisplayTitle?: string;
      Codec?: string;
      Width?: number;
      Height?: number;
    }>;
  }>;
  UserData?: {
    PlaybackPositionTicks: number;
    Played: boolean;
    PlayCount: number;
    IsFavorite: boolean;
    LastPlayedDate?: string;
  };
}

// ─── Library ──────────────────────────────────────────────────────────────────

export async function fetchLibrary(
  cfg: JellyfinConfig,
  types: string[] = ["Movie", "Series"]
): Promise<JellyfinRawItem[]> {
  const base = cfg.serverUrl.replace(/\/$/, "");
  const params = new URLSearchParams({
    IncludeItemTypes: types.join(","),
    Recursive: "true",
    Fields:
      "Overview,Genres,GenreItems,MediaSources,BackdropImageTags,UserData,RunTimeTicks,ImageTags",
    SortBy: "SortName",
    SortOrder: "Ascending",
    Limit: "500",
  });
  const res = await fetch(
    `${base}/Users/${cfg.userId}/Items?${params}`,
    { headers: authHeader(cfg.token) }
  );
  if (!res.ok) throw new Error(`Library fetch failed (${res.status})`);
  const data = await res.json();
  return data.Items as JellyfinRawItem[];
}

export async function fetchEpisodes(
  cfg: JellyfinConfig,
  seriesId: string
): Promise<JellyfinRawItem[]> {
  const base = cfg.serverUrl.replace(/\/$/, "");
  const params = new URLSearchParams({
    UserId: cfg.userId,
    Fields: "Overview,MediaSources,UserData,RunTimeTicks",
    SortBy: "ParentIndexNumber,IndexNumber",
    Limit: "500",
  });
  const res = await fetch(
    `${base}/Shows/${seriesId}/Episodes?${params}`,
    { headers: authHeader(cfg.token) }
  );
  if (!res.ok) throw new Error(`Episodes fetch failed (${res.status})`);
  const data = await res.json();
  return data.Items as JellyfinRawItem[];
}

// ─── URL helpers ──────────────────────────────────────────────────────────────

export function imageUrl(
  cfg: JellyfinConfig,
  itemId: string,
  type: "Primary" | "Backdrop" = "Primary",
  maxWidth = 400
): string {
  const base = cfg.serverUrl.replace(/\/$/, "");
  return `${base}/Items/${itemId}/Images/${type}?maxWidth=${maxWidth}&api_key=${cfg.token}`;
}

export function streamUrl(cfg: JellyfinConfig, itemId: string): string {
  const base = cfg.serverUrl.replace(/\/$/, "");
  return `${base}/Videos/${itemId}/stream?static=true&api_key=${cfg.token}`;
}

// ─── Playback reporting ───────────────────────────────────────────────────────

export function secondsToTicks(s: number): number {
  return Math.round(s * 10_000_000);
}
export function ticksToSeconds(t: number): number {
  return t / 10_000_000;
}

export async function reportStart(
  cfg: JellyfinConfig,
  itemId: string,
  positionTicks: number
): Promise<void> {
  const base = cfg.serverUrl.replace(/\/$/, "");
  await fetch(`${base}/Sessions/Playing`, {
    method: "POST",
    headers: authHeader(cfg.token),
    body: JSON.stringify({ ItemId: itemId, PositionTicks: positionTicks, CanSeek: true }),
  });
}

export async function reportProgress(
  cfg: JellyfinConfig,
  itemId: string,
  positionTicks: number,
  isPaused: boolean
): Promise<void> {
  const base = cfg.serverUrl.replace(/\/$/, "");
  await fetch(`${base}/Sessions/Playing/Progress`, {
    method: "POST",
    headers: authHeader(cfg.token),
    body: JSON.stringify({
      ItemId: itemId,
      PositionTicks: positionTicks,
      IsPaused: isPaused,
    }),
  });
}

export async function reportStopped(
  cfg: JellyfinConfig,
  itemId: string,
  positionTicks: number
): Promise<void> {
  const base = cfg.serverUrl.replace(/\/$/, "");
  await fetch(`${base}/Sessions/Playing/Stopped`, {
    method: "POST",
    headers: authHeader(cfg.token),
    body: JSON.stringify({ ItemId: itemId, PositionTicks: positionTicks }),
  });
}

// ─── Mapping ──────────────────────────────────────────────────────────────────

function resolutionLabel(height?: number): string | undefined {
  if (!height) return undefined;
  if (height >= 2160) return "4K HDR";
  if (height >= 1080) return "1080p";
  if (height >= 720) return "720p";
  return `${height}p`;
}

export function rawToMediaItem(
  raw: JellyfinRawItem,
  cfg: JellyfinConfig
): MediaItem {
  const type =
    raw.Type === "Movie"
      ? "movie"
      : raw.Type === "Series"
      ? "tv"
      : "movie";

  const ms = raw.MediaSources?.[0];
  const vs = ms?.VideoStreams?.[0];

  return {
    id: raw.Id,
    jellyfinId: raw.Id,
    title: raw.Name,
    type,
    thumbnail: imageUrl(cfg, raw.Id, "Primary", 400),
    backdropUrl: raw.BackdropImageTags?.length
      ? imageUrl(cfg, raw.Id, "Backdrop", 1920)
      : undefined,
    year: raw.ProductionYear,
    rating: raw.CommunityRating,
    duration: raw.RunTimeTicks ? ticksToSeconds(raw.RunTimeTicks) : undefined,
    genre: raw.GenreItems?.map((g) => g.Name),
    description: raw.Overview,
    resolution: resolutionLabel(vs?.Height),
    codec: vs?.Codec?.toUpperCase(),
    bitrate: ms?.Bitrate
      ? `${(ms.Bitrate / 1_000_000).toFixed(0)} Mbps`
      : undefined,
    streamUrl: streamUrl(cfg, raw.Id),
  };
}

export function rawToEpisode(raw: JellyfinRawItem): Episode {
  return {
    season: raw.ParentIndexNumber ?? 1,
    episode: raw.IndexNumber ?? 1,
    title: raw.Name,
    duration: raw.RunTimeTicks ? ticksToSeconds(raw.RunTimeTicks) : 45 * 60,
    description: raw.Overview,
  };
}
