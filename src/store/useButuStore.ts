import { create } from "zustand";
import type { MediaItem, PlayerState, CursorState, JellyfinConfig } from "../types";

const LS_JELLYFIN_KEY = "butu:jellyfin";
function loadJellyfinConfig(): JellyfinConfig | null {
  try {
    // @ts-ignore
    const envUrl = import.meta.env.VITE_JELLYFIN_SERVER_URL;
    // @ts-ignore
    const envUser = import.meta.env.VITE_JELLYFIN_USER_NAME;
    // @ts-ignore
    const envUserId = import.meta.env.VITE_JELLYFIN_USER_ID;
    // @ts-ignore
    const envToken = import.meta.env.VITE_JELLYFIN_TOKEN;

    if (envUrl && envUser && envUserId && envToken) {
      return {
        serverUrl: envUrl,
        userName: envUser,
        userId: envUserId,
        token: envToken,
      };
    }

    const raw = localStorage.getItem(LS_JELLYFIN_KEY);
    return raw ? (JSON.parse(raw) as JellyfinConfig) : null;
  } catch {
    return null;
  }
}

const LS_PROGRESS_KEY = "butu:progress";
function loadWatchProgress(): Record<string, { time: number; season?: number; episode?: number }> {
  try {
    const raw = localStorage.getItem(LS_PROGRESS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
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

  watchProgress: Record<string, { time: number; season?: number; episode?: number }>;
  setWatchProgress: (id: string, data: { time: number; season?: number; episode?: number }) => void;

  jellyfinConfig: JellyfinConfig | null;
  setJellyfinConfig: (cfg: JellyfinConfig | null) => void;

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

  jellyfinConfig: loadJellyfinConfig(),
  setJellyfinConfig: (cfg) => {
    if (cfg) localStorage.setItem(LS_JELLYFIN_KEY, JSON.stringify(cfg));
    else localStorage.removeItem(LS_JELLYFIN_KEY);
    set({ jellyfinConfig: cfg });
  },

  jellyfinLoading: false,
  setJellyfinLoading: (val) => set({ jellyfinLoading: val }),

  jellyfinError: null,
  setJellyfinError: (msg) => set({ jellyfinError: msg }),
}));
