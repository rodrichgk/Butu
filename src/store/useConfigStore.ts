import { create } from "zustand";
import type { JellyfinConfig, PlexConfig, ServerType } from "../types";
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
  // @ts-ignore
  if (import.meta.env.DEV && import.meta.env.VITE_PLEX_SERVER_URL && import.meta.env.VITE_PLEX_TOKEN) return "plex";
  // @ts-ignore
  if (import.meta.env.DEV && import.meta.env.VITE_JELLYFIN_SERVER_URL) return "jellyfin";
  const saved = localStorage.getItem(LS_SERVER_TYPE_KEY) as "jellyfin" | "plex" | null;
  if (saved) return saved;
  return null;
};

export interface AppSettings {
  autoSkipIntro: boolean;
  autoSkipCredits: boolean;
  autoPlayNext: boolean;
  showHero: boolean;
  showContinueWatching: boolean;
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

interface ConfigStore {
  settings: AppSettings;
  updateSettings: (partial: Partial<AppSettings>) => void;

  organizeConfig: OrganizeConfig;
  setOrganizeConfig: (cfg: OrganizeConfig) => void;

  jellyfinConfig: JellyfinConfig | null;
  setJellyfinConfig: (cfg: JellyfinConfig | null) => void;

  plexConfig: PlexConfig | null;
  setPlexConfig: (cfg: PlexConfig | null) => void;

  serverType: ServerType | null;
  setServerType: (type: ServerType | null) => void;
}

export const useConfigStore = create<ConfigStore>((set) => ({
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
}));
