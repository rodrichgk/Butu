import { useEffect, useState } from 'react';

import { PlatformContext, getPlatform } from '../utils/platform';

export { PlatformContext };

export function usePlatformBridge() {
  const [platform, setPlatform] = useState<PlatformContext>(PlatformContext.Browser);

  useEffect(() => {
    setPlatform(getPlatform());
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
