/** True when running inside Android WebView (TV or phone) */
export const isAndroid = /android/i.test(navigator.userAgent);

/** Reduce motion — skip heavy animations on Android */
export const reducedMotion = isAndroid;

/**
 * Coarse pointer / no real hover — i.e. a touchscreen (phone, tablet). Drives
 * the touch interaction model: native cursor instead of the liquid cursor, and
 * always-visible card info instead of hover-to-reveal.
 */
export const isTouch =
  typeof window !== "undefined" &&
  (window.matchMedia?.("(pointer: coarse)").matches ?? false);

export enum PlatformContext {
  DesktopTauri = 'desktop_tauri',
  AndroidTauri = 'android_tauri',
  WebOS = 'webos',
  Tizen = 'tizen',
  Browser = 'browser',
}

export function getPlatform(): PlatformContext {
  if (typeof window === "undefined") return PlatformContext.Browser;
  
  if ((window as any).__TAURI__) {
    const isAndroid = navigator.userAgent.toLowerCase().includes('android');
    return isAndroid ? PlatformContext.AndroidTauri : PlatformContext.DesktopTauri;
  } else if ((window as any).webOS) {
    return PlatformContext.WebOS;
  } else if ((window as any).tizen) {
    return PlatformContext.Tizen;
  }
  return PlatformContext.Browser;
}
