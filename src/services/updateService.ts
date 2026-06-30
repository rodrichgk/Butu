// Lightweight GitHub-release update check. $0, no signing key: the app notices when
// a newer release is published and links straight to the installer, so you don't
// have to watch the repo. (A fully-silent installer can layer the Tauri updater
// plugin on top of this later — that needs a one-time signing key + CI step.)

const REPO = "rodrichgk/Butu";

export interface UpdateInfo {
  /** Latest published version, e.g. "0.1.2". */
  version: string;
  /** Human-readable release notes (markdown). */
  notes: string;
  /** The release page on GitHub. */
  url: string;
  /** Direct download for the platform installer, when present. */
  asset?: string;
}

/** Semver-ish compare: is `latest` strictly newer than `current`? */
function isNewer(latest: string, current: string): boolean {
  const a = latest.split(".").map((n) => parseInt(n, 10) || 0);
  const b = current.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

const isWindowsDesktop = typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);

/** Returns update info if a newer release exists, else null (and never throws). */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const version = String(data.tag_name ?? "").replace(/^v/, "").trim();
    if (!version || !isNewer(version, __APP_VERSION__)) return null;

    const assets: Array<{ name: string; browser_download_url: string }> = data.assets ?? [];
    // Desktop installer (NSIS .exe / MSI) on Windows, APK on Android.
    const wantExt = isWindowsDesktop ? /\.(exe|msi)$/i : /\.apk$/i;
    const asset = assets.find((a) => wantExt.test(a.name))?.browser_download_url;

    return { version, notes: String(data.body ?? ""), url: data.html_url, asset };
  } catch {
    return null;
  }
}
