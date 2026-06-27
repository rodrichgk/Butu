import type { ServerType } from "../types";

/**
 * Turns a raw fetch / Plex / Jellyfin error into a short, human, actionable
 * sentence we can show in the UI — so users never have to open the console.
 * Keep messages specific about the likely cause (offline, relay, expired
 * session) and what to do about it.
 */
export function describeServerError(err: unknown, serverType?: ServerType | null): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const server = serverType === "jellyfin" ? "Jellyfin" : serverType === "plex" ? "Plex" : "media";
  const m = raw.toLowerCase();

  // Network-level: the request never reached a server (offline, DNS, TLS, CORS/
  // private-network block). Browsers report this as "Failed to fetch" / TypeError.
  if (
    m.includes("failed to fetch") ||
    m.includes("load failed") ||
    m.includes("networkerror") ||
    m.includes("err_failed") ||
    m.includes("err_connection") ||
    raw === "TypeError"
  ) {
    return `Can't reach your ${server} server. Check that it's online and that you're on the same network — if you're away from home, the server needs remote access turned on.`;
  }

  const status = raw.match(/HTTP\s+(\d{3})/i)?.[1] ?? raw.match(/\b([45]\d{2})\b/)?.[1];
  switch (status) {
    case "401":
    case "403":
      return `Your ${server} session was rejected or expired. Reconnect to sign in again.`;
    case "404":
      return `Your ${server} server responded but couldn't find that content (404). It may still be scanning its library — or the connection is going through Plex's slow relay. Reconnect on the same network for a direct connection.`;
    case "500":
    case "502":
    case "503":
      return `Your ${server} server is reachable but isn't responding properly (${status}) — this is often Plex's plex.tv relay. Reconnect while on the same network as the server for a direct connection.`;
    case "429":
      return `Your ${server} server is rate-limiting requests (429). Wait a few seconds and retry.`;
  }

  if (m.includes("timeout") || m.includes("timed out") || m.includes("aborted")) {
    return `Your ${server} server didn't respond in time. It may be offline or unreachable from this network.`;
  }

  return raw
    ? `Couldn't load your ${server} library: ${raw}`
    : `Couldn't load your ${server} library.`;
}
