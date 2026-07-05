import { create } from "zustand";
import type { PlayerState } from "../types";

interface PlayerStore {
  player: PlayerState;
  setPlayer: (state: Partial<PlayerState>) => void;
}

export const usePlayerStore = create<PlayerStore>((set) => ({
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
}));
