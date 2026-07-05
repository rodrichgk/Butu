import { create } from "zustand";
import type { CursorState } from "../types";

interface CursorStore {
  cursor: CursorState;
  setCursor: (state: Partial<CursorState>) => void;
}

export const useCursorStore = create<CursorStore>((set) => ({
  cursor: {
    x: 0,
    y: 0,
    snapped: false,
    targetId: null,
    velocity: { x: 0, y: 0 },
  },
  setCursor: (state) =>
    set((s) => ({ cursor: { ...s.cursor, ...state } })),
}));
