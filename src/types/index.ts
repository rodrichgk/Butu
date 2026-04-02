export type MediaType = "movie" | "music" | "tv" | "web" | "anime" | "manga";

export interface Episode {
  season: number;
  episode: number;
  title: string;
  duration: number;
  description?: string;
  thumbnail?: string;
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
  url?: string;
  streamUrl?: string;
  jellyfinId?: string;
  ambientColor?: string;
  episodes?: Episode[];
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
