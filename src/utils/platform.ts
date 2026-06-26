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
  ((window.matchMedia?.("(pointer: coarse)").matches ?? false) ||
    (navigator.maxTouchPoints ?? 0) > 0);
