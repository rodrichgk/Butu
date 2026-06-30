import { create } from "zustand";
import type { MediaItem, PlayerState, CursorState, JellyfinConfig, PlexConfig, ServerType, WatchProgressEntry } from "../types";
import { type OrganizeConfig, DEFAULT_ORGANIZE_CONFIG } from "../types/organize";

const LS_JELLYFIN_KEY = "butu:jellyfin";

function loadJellyfinConfig(): JellyfinConfig | null {
  try {
    // @ts-ignore
    const envUrl    = import.meta.env.VITE_JELLYFIN_SERVER_URL;
    // @ts-ignore
    const envUser   = import.meta.env.VITE_JELLYFIN_USER_NAME;
    // @ts-ignore
    const envUserId = import.meta.env.VITE_JELLYFIN_USER_ID;
    // @ts-ignore
    const envToken  = import.meta.env.VITE_JELLYFIN_TOKEN;
    // Dev-only auto-login. Never in a production/web build — otherwise every visitor would be
    // signed into the dev's server and the token would ship in the bundle.
    // @ts-ignore
    if (import.meta.env.DEV && envUrl && envUser && envUserId && envToken) {
      return { serverUrl: envUrl, userName: envUser, userId: envUserId, token: envToken };
    }
    const raw = localStorage.getItem(LS_JELLYFIN_KEY);
    return raw ? (JSON.parse(raw) as JellyfinConfig) : null;
  } catch { return null; }
}

const LS_PLEX_KEY = "butu:plex";
function loadPlexConfig(): PlexConfig | null {
  try {
    // @ts-ignore
    const envUrl   = import.meta.env.VITE_PLEX_SERVER_URL;
    // @ts-ignore
    const envToken = import.meta.env.VITE_PLEX_TOKEN;
    // @ts-ignore
    const envUser  = import.meta.env.VITE_PLEX_USER_NAME;
    // Dev-only auto-login (see loadJellyfinConfig).
    // @ts-ignore
    if (import.meta.env.DEV && envUrl && envToken) {
      return { serverUrl: envUrl, token: envToken, userName: envUser };
    }
    const raw = localStorage.getItem(LS_PLEX_KEY);
    return raw ? (JSON.parse(raw) as PlexConfig) : null;
  } catch { return null; }
}

const LS_SERVER_TYPE_KEY = "butu:serverType";
const loadServerType = (): "jellyfin" | "plex" | null => {
  // Dev-only: prioritize .env config over the saved choice. Skipped in production/web builds.
  // @ts-ignore
  if (import.meta.env.DEV && import.meta.env.VITE_PLEX_SERVER_URL && import.meta.env.VITE_PLEX_TOKEN) return "plex";
  // @ts-ignore
  if (import.meta.env.DEV && import.meta.env.VITE_JELLYFIN_SERVER_URL) return "jellyfin";
  
  const saved = localStorage.getItem(LS_SERVER_TYPE_KEY) as "jellyfin" | "plex" | null;
  if (saved) return saved;

  return null;
};

const LS_PROGRESS_KEY = "butu:progress";
function loadWatchProgress(): Record<string, WatchProgressEntry> {
  try {
    const raw = localStorage.getItem(LS_PROGRESS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export interface AppSettings {
  autoSkipIntro: boolean;
  autoSkipCredits: boolean;
  autoPlayNext: boolean;
  showHero: boolean;
  showContinueWatching: boolean;
  /** Downmix surround to stereo and lift the dialogue (centre) channel. */
  boostVoices: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  autoSkipIntro: false,
  autoSkipCredits: false,
  autoPlayNext: true,
  showHero: true,
  showContinueWatching: true,
  boostVoices: true,
};

const LS_SETTINGS_KEY = "butu:settings";
function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(LS_SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

const LS_ORGANIZE_KEY = "butu:organize";
function loadOrganizeConfig(): OrganizeConfig {
  try {
    const raw = localStorage.getItem(LS_ORGANIZE_KEY);
    return raw ? { ...DEFAULT_ORGANIZE_CONFIG, ...JSON.parse(raw) } : DEFAULT_ORGANIZE_CONFIG;
  } catch {
    return DEFAULT_ORGANIZE_CONFIG;
  }
}

interface ButuStore {
  cursor: CursorState;
  setCursor: (state: Partial<CursorState>) => void;

  player: PlayerState;
  setPlayer: (state: Partial<PlayerState>) => void;

  activeSection: string;
  setActiveSection: (section: string) => void;

  sidebarExpanded: boolean;
  setSidebarExpanded: (val: boolean) => void;

  focusedCardId: string | null;
  setFocusedCardId: (id: string | null) => void;

  wsConnected: boolean;
  setWsConnected: (val: boolean) => void;

  library: MediaItem[];
  setLibrary: (items: MediaItem[]) => void;

  watchProgress: Record<string, WatchProgressEntry>;
  setWatchProgress: (id: string, data: WatchProgressEntry) => void;
  clearWatchProgress: () => void;

  settings: AppSettings;
  updateSettings: (partial: Partial<AppSettings>) => void;

  /** Desktop "Organize downloads" config (destinations + rules), persisted locally. */
  organizeConfig: OrganizeConfig;
  setOrganizeConfig: (cfg: OrganizeConfig) => void;

  /** Bumping this re-triggers the library load effect (used by "Reload library"). */
  libraryRefreshKey: number;
  refreshLibrary: () => void;

  jellyfinConfig: JellyfinConfig | null;
  setJellyfinConfig: (cfg: JellyfinConfig | null) => void;

  plexConfig: PlexConfig | null;
  setPlexConfig: (cfg: PlexConfig | null) => void;

  serverType: ServerType | null;
  setServerType: (type: ServerType | null) => void;

  jellyfinLoading: boolean;
  setJellyfinLoading: (val: boolean) => void;

  jellyfinError: string | null;
  setJellyfinError: (msg: string | null) => void;
}

export const useButuStore = create<ButuStore>((set) => ({
  cursor: {
    x: 0,
    y: 0,
    snapped: false,
    targetId: null,
    velocity: { x: 0, y: 0 },
  },
  setCursor: (state) =>
    set((s) => ({ cursor: { ...s.cursor, ...state } })),

  player: {
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    isMuted: false,
    isFullscreen: false,
    buffered: 0,
    currentMedia: null,
    ambientColor: "#99f7ff",
  },
  setPlayer: (state) =>
    set((s) => ({ player: { ...s.player, ...state } })),

  activeSection: "home",
  setActiveSection: (section) => set({ activeSection: section }),

  sidebarExpanded: false,
  setSidebarExpanded: (val) => set({ sidebarExpanded: val }),

  focusedCardId: null,
  setFocusedCardId: (id) => set({ focusedCardId: id }),

  wsConnected: false,
  setWsConnected: (val) => set({ wsConnected: val }),

  library: [],
  setLibrary: (items) => set({ library: items }),

  watchProgress: loadWatchProgress(),
  setWatchProgress: (id, data) =>
    set((s) => {
      const newProgress = { ...s.watchProgress, [id]: data };
      localStorage.setItem(LS_PROGRESS_KEY, JSON.stringify(newProgress));
      return { watchProgress: newProgress };
    }),
  clearWatchProgress: () => {
    localStorage.removeItem(LS_PROGRESS_KEY);
    set({ watchProgress: {} });
  },

  settings: loadSettings(),
  updateSettings: (partial) =>
    set((s) => {
      const next = { ...s.settings, ...partial };
      localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify(next));
      return { settings: next };
    }),

  organizeConfig: loadOrganizeConfig(),
  setOrganizeConfig: (cfg) => {
    localStorage.setItem(LS_ORGANIZE_KEY, JSON.stringify(cfg));
    set({ organizeConfig: cfg });
  },

  libraryRefreshKey: 0,
  refreshLibrary: () => set((s) => ({ libraryRefreshKey: s.libraryRefreshKey + 1 })),

  jellyfinConfig: loadJellyfinConfig(),
  setJellyfinConfig: (cfg) => {
    if (cfg) localStorage.setItem(LS_JELLYFIN_KEY, JSON.stringify(cfg));
    else localStorage.removeItem(LS_JELLYFIN_KEY);
    set({ jellyfinConfig: cfg });
  },

  plexConfig: loadPlexConfig(),
  setPlexConfig: (cfg) => {
    if (cfg) localStorage.setItem(LS_PLEX_KEY, JSON.stringify(cfg));
    else localStorage.removeItem(LS_PLEX_KEY);
    set({ plexConfig: cfg });
  },

  serverType: loadServerType(),
  setServerType: (type) => {
    if (type) localStorage.setItem(LS_SERVER_TYPE_KEY, type);
    else localStorage.removeItem(LS_SERVER_TYPE_KEY);
    set({ serverType: type });
  },

  jellyfinLoading: false,
  setJellyfinLoading: (val) => set({ jellyfinLoading: val }),

  jellyfinError: null,
  setJellyfinError: (msg) => set({ jellyfinError: msg }),
}));
