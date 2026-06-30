import { useEffect, useState } from "react";
import { checkForUpdate, type UpdateInfo } from "../services/updateService";

function openExternal(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

const btnPrimary: React.CSSProperties = {
  padding: "8px 18px", borderRadius: 12, fontSize: 13, fontWeight: 600,
  background: "rgba(153,247,255,0.16)", color: "#99f7ff",
  border: "1px solid rgba(153,247,255,0.34)", whiteSpace: "nowrap",
};
const btnGhost: React.CSSProperties = {
  padding: "8px 12px", borderRadius: 12, fontSize: 13, fontWeight: 600,
  background: "rgba(255,255,255,0.04)", color: "rgba(224,230,240,0.7)",
  border: "1px solid rgba(255,255,255,0.10)",
};

/**
 * Top-of-content banner that appears once on launch when a newer GitHub release
 * exists, so the user never has to manually check the repo. "Download" links to
 * the platform installer (or the release page). Dismissable for the session.
 */
export function UpdateBanner() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    checkForUpdate().then((u) => { if (!cancelled) setInfo(u); });
    return () => { cancelled = true; };
  }, []);

  if (!info || dismissed) return null;

  return (
    <div
      role="alert"
      className="mx-4 sm:mx-8 lg:mx-20 mt-4 mb-2 flex items-center gap-3 rounded-2xl p-4"
      style={{ background: "rgba(153,247,255,0.07)", border: "1px solid rgba(153,247,255,0.22)" }}
    >
      <span style={{ fontSize: 18, lineHeight: 1.2 }}>✨</span>
      <div className="flex-1 min-w-0">
        <p className="font-display font-semibold" style={{ color: "#99f7ff", fontSize: 14 }}>
          Update available — v{info.version}
        </p>
        <p className="font-body text-on_surface_variant" style={{ fontSize: 13, marginTop: 2 }}>
          You're on v{__APP_VERSION__}. Grab the latest from GitHub.
        </p>
      </div>
      <button onClick={() => openExternal(info.asset ?? info.url)} className="focusable" style={btnPrimary}>
        Download
      </button>
      <button onClick={() => setDismissed(true)} className="focusable" aria-label="Dismiss" style={btnGhost}>
        ✕
      </button>
    </div>
  );
}
