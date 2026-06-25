// TV-specific utilities and optimizations

export const isAndroid = /android/i.test(navigator.userAgent);
export const isAndroidTV = isAndroid && /tv|stick|shield|fire|mi tv|nvidia|chromecast/i.test(navigator.userAgent);

export function detectHardwareAcceleration(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl') as WebGLRenderingContext;
    if (!gl) return false;
    
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return true; // Assume supported if can't detect
    
    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string;
    // Common hardware-accelerated renderers on Android TV
    return /nvidia|qualcomm|arm|mali|adreno|powervr/i.test(renderer);
  } catch {
    return false;
  }
}

export function getOptimalVideoSettings(): {
  preferH264: boolean;
  maxResolution: number;
  bufferConfig: {
    low: number;
    medium: number;
    high: number;
  };
} {
  const hasHardwareAcceleration = detectHardwareAcceleration();
  const isLowEnd = isAndroid && navigator.hardwareConcurrency <= 4;
  
  return {
    preferH264: isAndroidTV || isLowEnd, // H.264 better supported on TV
    maxResolution: isLowEnd ? 720 : (isAndroidTV ? 1080 : 1440),
    bufferConfig: {
      low: isLowEnd ? 10 : 15,
      medium: isLowEnd ? 20 : 30,
      high: isLowEnd ? 30 : 60
    }
  };
}

export function optimizeForTV() {
  if (!isAndroidTV) return;
  
  // Disable animations on low-end devices
  const isLowEnd = navigator.hardwareConcurrency <= 4;
  if (isLowEnd) {
    document.documentElement.style.setProperty('--transition-duration', '0.1s');
    document.documentElement.classList.add('reduced-motion');
  }
  
  // Enable hardware acceleration hints
  document.body.style.transform = 'translateZ(0)';
  document.body.style.willChange = 'transform';
  
  // Optimize for TV remote navigation
  document.body.setAttribute('data-tv-mode', 'true');
}
