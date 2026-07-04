/**
 * Typed access to the Tauri bridge injected into the webview, so callers don't
 * reach into `window as any`. Falls back gracefully in a plain browser.
 */

interface TauriCore {
  invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T>;
}
interface TauriEventApi {
  listen<T = unknown>(
    event: string,
    handler: (event: { payload: T }) => void,
  ): Promise<() => void>;
}

interface TauriWindow {
  __TAURI__?: { core?: TauriCore; event?: TauriEventApi };
  __TAURI_INTERNALS__?: TauriCore;
}

function coreApi(): TauriCore | null {
  const w = window as unknown as TauriWindow;
  return w.__TAURI__?.core ?? w.__TAURI_INTERNALS__ ?? null;
}

function eventApi(): TauriEventApi | null {
  return (window as unknown as TauriWindow).__TAURI__?.event ?? null;
}

/** True when running inside the Tauri desktop shell. */
export function isTauri(): boolean {
  return coreApi() != null && eventApi() != null;
}

/** Invoke a Tauri command. Throws if not running inside Tauri. */
export async function invoke<T = unknown>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const core = coreApi();
  if (!core) throw new Error("Not running inside the Tauri app");
  return core.invoke<T>(cmd, args);
}

/** Subscribe to a Tauri event; returns an unsubscribe fn (no-op in a browser). */
export async function tauriListen<T = unknown>(
  event: string,
  handler: (payload: T) => void,
): Promise<() => void> {
  const ev = eventApi();
  if (!ev) return () => {};
  const unlisten = await ev.listen<T>(event, (e) => handler(e.payload));
  return () => {
    try {
      unlisten();
    } catch {
      /* ignore */
    }
  };
}

/**
 * GET a URL as JSON through the `fetch_plex` Tauri proxy (dodges CORS, carries the
 * desktop's network), falling back to plain `fetch` in a browser. Returns `null`
 * on any non-2xx / parse error.
 */
export async function proxyGetJson<T = unknown>(url: string): Promise<T | null> {
  try {
    const core = coreApi();
    if (core) {
      const text = await core.invoke<string>("fetch_plex", { url, headers: {} });
      return JSON.parse(text) as T;
    }
    const res = await fetch(url);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}
