import { useLocation, useNavigate } from "react-router-dom";
import { type CSSProperties } from "react";
import { useLibraryStore } from "../store/useLibraryStore";

export const errorBtnPrimary: CSSProperties = {
  padding: "8px 18px", borderRadius: 12, fontSize: 13, fontWeight: 600,
  background: "rgba(153,247,255,0.14)", color: "#99f7ff",
  border: "1px solid rgba(153,247,255,0.32)",
};

export const errorBtnGhost: CSSProperties = {
  padding: "8px 16px", borderRadius: 12, fontSize: 13, fontWeight: 600,
  background: "rgba(255,255,255,0.04)", color: "rgba(224,230,240,0.7)",
  border: "1px solid rgba(255,255,255,0.10)",
};

import { useLibraryQuery } from "../hooks/useLibraryQuery";

export function HomeStatus() {
  const { isLoading: loading, error, refetch: refresh } = useLibraryQuery();
  const navigate = useNavigate();
  const setActiveSection = (val: string) => navigate(val === "home" ? "/my-media" : `/${val}`);

  return (
    <div className="px-4 sm:px-8 lg:px-20 py-24 flex flex-col items-center text-center gap-3">
      {loading ? (
        <p className="font-mono-tech text-on_surface_variant text-sm animate-pulse">
          Loading your library…
        </p>
      ) : error ? (
        <>
          <div style={{ fontSize: 30, lineHeight: 1 }}>⚠️</div>
          <p className="font-display font-semibold" style={{ fontSize: 17, color: "#ff8c8c" }}>
            Couldn't load your library
          </p>
          <p className="font-body text-on_surface_variant text-sm" style={{ maxWidth: 440, lineHeight: 1.55 }}>
            {error.message}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <button onClick={() => refresh()} className="focusable" style={errorBtnPrimary}>Retry</button>
            <button onClick={() => setActiveSection("settings")} className="focusable" style={errorBtnGhost}>Settings</button>
          </div>
        </>
      ) : (
        <>
          <p className="font-display font-semibold text-on_surface" style={{ fontSize: 18 }}>
            No media found
          </p>
          <p className="font-body text-on_surface_variant text-sm">
            Your server's libraries look empty, or are still scanning.
          </p>
        </>
      )}
    </div>
  );
}
