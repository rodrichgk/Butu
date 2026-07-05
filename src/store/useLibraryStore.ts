import { create } from "zustand";
import type { WatchProgressEntry } from "../types";

const LS_PROGRESS_KEY = "butu:progress";
function loadWatchProgress(): Record<string, WatchProgressEntry> {
  try {
    const raw = localStorage.getItem(LS_PROGRESS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

interface LibraryStore {
  activeSection: string;
  setActiveSection: (section: string) => void;

  sidebarExpanded: boolean;
  setSidebarExpanded: (val: boolean) => void;

  focusedCardId: string | null;
  setFocusedCardId: (id: string | null) => void;

  wsConnected: boolean;
  setWsConnected: (val: boolean) => void;

  watchProgress: Record<string, WatchProgressEntry>;
  setWatchProgress: (id: string, data: WatchProgressEntry) => void;
  clearWatchProgress: () => void;
}

export const useLibraryStore = create<LibraryStore>((set) => ({
  activeSection: "home",
  setActiveSection: (section) => set({ activeSection: section }),

  sidebarExpanded: false,
  setSidebarExpanded: (val) => set({ sidebarExpanded: val }),

  focusedCardId: null,
  setFocusedCardId: (id) => set({ focusedCardId: id }),

  wsConnected: false,
  setWsConnected: (val) => set({ wsConnected: val }),

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
}));
