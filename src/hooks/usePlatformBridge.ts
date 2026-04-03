import { useEffect, useState } from 'react';

// Enum defining the current running environment
export enum PlatformContext {
  DesktopTauri = 'desktop_tauri',
  AndroidTauri = 'android_tauri',
  WebOS = 'webos',
  Tizen = 'tizen',
  Browser = 'browser', // Standalone web fallback
}

export function usePlatformBridge() {
  const [platform, setPlatform] = useState<PlatformContext>(PlatformContext.Browser);

  useEffect(() => {
    // Basic heuristics to determine the platform environment
    if (window.__TAURI__) {
      // If we are in Tauri, check if it's Android or Desktop
      // We can refine this using Tauri OS APIs later if needed
      const isAndroid = navigator.userAgent.toLowerCase().includes('android');
      setPlatform(isAndroid ? PlatformContext.AndroidTauri : PlatformContext.DesktopTauri);
    } else if (window.webOS) {
      setPlatform(PlatformContext.WebOS);
    } else if (window.tizen) {
      setPlatform(PlatformContext.Tizen);
    } else {
      setPlatform(PlatformContext.Browser);
    }
  }, []);

  // Helper flags
  const isTauri = platform === PlatformContext.DesktopTauri || platform === PlatformContext.AndroidTauri;
  const isStandaloneTV = platform === PlatformContext.WebOS || platform === PlatformContext.Tizen;

  return {
    platform,
    isTauri,
    isStandaloneTV,
  };
}

// Ensure typescript knows about TV-specific window extensions
declare global {
  interface Window {
    __TAURI__?: boolean;
    webOS?: any;
    tizen?: any;
  }
}
