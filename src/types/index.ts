export type MediaType = "movie" | "music" | "tv" | "web" | "anime" | "manga";

export interface Episode {
  id: string; // Episode-specific ratingKey or ItemId
  url?: string; // Optional direct stream url / partKey
  season: number;
  episode: number;
  title: string;
  duration: number;
  description?: string;
  thumbnail?: string;
  streamUrl?: string;
  externalIds?: string[];
}

export interface MediaItem {
  id: string;
  title: string;
  type: MediaType;
  thumbnail: string;
  backdropUrl?: string;
  year?: number;
  duration?: number;
  genre?: string[];
  description?: string;
  rating?: number;
  resolution?: string;
  codec?: string;
  bitrate?: string;
  artist?: string;
  album?: string;
  trackNumber?: number;
  season?: number;
  episode?: number;
  seriesId?: string;  // For tracking TV series episodes
  url?: string;
  streamUrl?: string;
  jellyfinId?: string;
  plexKey?: string;        // ratingKey from Plex
  plexPartKey?: string;    // Part key for direct stream
  ambientColor?: string;
  episodes?: Episode[];
  externalIds?: string[];  // e.g. ["tmdb://1399", "tvdb://121361"]
}

export interface WatchProgressEntry {
  time: number;          // resume position, seconds
  duration?: number;     // total length, seconds — used for the "finished" cutoff
  season?: number;
  episode?: number;
  seriesId?: string;     // show id this episode belongs to (for Continue Watching)
  updatedAt?: number;    // epoch ms — picks the most-recently watched episode of a show
}

export interface CursorState {
  x: number;
  y: number;
  snapped: boolean;
  targetId: string | null;
  velocity: { x: number; y: number };
}

export interface IMUData {
  alpha: number;
  beta: number;
  gamma: number;
  timestamp: number;
}

export interface SpatialMessage {
  type: "imu" | "click" | "scroll" | "ping";
  data: IMUData | { direction: number } | null;
}

export interface PlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  isFullscreen: boolean;
  buffered: number;
  currentMedia: MediaItem | null;
  ambientColor: string;
}

export interface NavItem {
  id: string;
  label: string;
  icon: string;
  route: string;
}

export interface HeroSlide {
  id: string;
  media: MediaItem;
  accentColor: string;
}

export interface JellyfinConfig {
  serverUrl: string;
  userId: string;
  userName: string;
  token: string;
}

export interface PlexConfig {
  serverUrl: string;
  token: string;
  userName?: string;
}

// "demo" is guest mode: a static, freely-licensed library (see data/demoLibrary.ts)
// so a visitor can try Butu without a real Plex/Jellyfin server.
export type ServerType = "jellyfin" | "plex" | "demo";
