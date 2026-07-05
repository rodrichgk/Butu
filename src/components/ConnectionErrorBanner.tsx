import { useState, useEffect } from "react";
import { useLibraryStore } from "../store/useLibraryStore";
import { useLibraryQuery } from "../hooks/useLibraryQuery";
import { errorBtnPrimary, errorBtnGhost } from "./HomeStatus";

/**
 * Top-of-content banner shown when a library refresh fails *while content is
 * already on screen* (stale data) — the empty-library case is covered by
 * HomeStatus. Either way the user sees the problem without opening the console.
 */
export function ConnectionErrorBanner() {
  const { error: error } = useLibraryQuery();
  const { isLoading: loading } = useLibraryQuery();
  const { data: library = [] } = useLibraryQuery();
  const hasData = library.length > 0;
  const { refetch: refresh } = useLibraryQuery();
  const [dismissed, setDismissed] = useState(false);
  
  // A new/changed error re-shows the banner even if previously dismissed.
  useEffect(() => { setDismissed(false); }, [error]);

  if (!error || loading || dismissed || !hasData) return null;
  
  return (
    <div
      role="alert"
      className="mx-4 sm:mx-8 lg:mx-20 mt-4 mb-2 flex items-start gap-3 rounded-2xl p-4"
      style={{ background: "rgba(255,90,90,0.10)", border: "1px solid rgba(255,90,90,0.30)" }}
    >
      <span style={{ fontSize: 18, lineHeight: 1.2 }}>⚠️</span>
      <div className="flex-1 min-w-0">
        <p className="font-display font-semibold" style={{ color: "#ff8c8c", fontSize: 14 }}>
          Connection problem — showing what loaded earlier
        </p>
        <p className="font-body text-on_surface_variant" style={{ fontSize: 13, lineHeight: 1.5, marginTop: 2 }}>
          {error.message}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button onClick={() => refresh()} className="focusable" style={errorBtnPrimary}>Retry</button>
        <button onClick={() => setDismissed(true)} className="focusable" aria-label="Dismiss"
          style={{ ...errorBtnGhost, padding: "8px 12px" }}>✕</button>
      </div>
    </div>
  );
}
