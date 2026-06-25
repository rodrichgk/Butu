/** True when running inside Android WebView (TV or phone) */
export const isAndroid = /android/i.test(navigator.userAgent);

/** Reduce motion — skip heavy animations on Android */
export const reducedMotion = isAndroid;
