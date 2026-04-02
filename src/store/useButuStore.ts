import { create } from "zustand";
import type { MediaItem, PlayerState, CursorState, JellyfinConfig } from "../types";

const LS_JELLYFIN_KEY = "butu:jellyfin";
function loadJellyfinConfig(): JellyfinConfig | null {
  try {
    const raw = localStorage.getItem(LS_JELLYFIN_KEY);
    return raw ? (JSON.parse(raw) as JellyfinConfig) : null;
  } catch {
    return null;
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

  watchProgress: {},
  setWatchProgress: (id, data) =>
    set((s) => ({ watchProgress: { ...s.watchProgress, [id]: data } })),

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
