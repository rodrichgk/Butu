// Service Worker registration and management
export class ServiceWorkerManager {
  private registration: ServiceWorkerRegistration | null = null;

  async register() {
    if (!('serviceWorker' in navigator)) {
      console.warn('Service Workers not supported');
      return false;
    }

    // In dev the SW caches JS modules cache-first, so it keeps serving stale
    // bundles after every edit (ESM export mismatches → white screen, broken
    // HMR). Never register in dev; actively tear down any worker + caches a
    // previous prod build (or earlier dev run) may have left behind.
    if ((import.meta as any).env?.DEV) {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
        if (typeof caches !== 'undefined') {
          const names = await caches.keys();
          await Promise.all(names.map((n) => caches.delete(n)));
        }
        if (regs.length) {
          console.info('[sw] dev: unregistered stale service worker(s); reloading');
          window.location.reload();
        }
      } catch (e) {
        console.warn('[sw] dev teardown failed', e);
      }
      return false;
    }

    try {
      this.registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });

      console.log('Service Worker registered:', this.registration);

      // Handle updates
      this.registration.addEventListener('updatefound', () => {
        const newWorker = this.registration?.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New version available
              this.notifyUpdate();
            }
          });
        }
      });

      return true;
    } catch (error) {
      console.error('Service Worker registration failed:', error);
      return false;
    }
  }

  private notifyUpdate() {
    // Notify user about update
    if (confirm('New version available! Reload to update?')) {
      this.skipWaiting();
    }
  }

  skipWaiting() {
    this.registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
    window.location.reload();
  }

  async clearCache() {
    if (this.registration?.active) {
      this.registration.active.postMessage({ type: 'CLEAR_CACHE' });
    }
  }

  async prefetchUrls(urls: string[]) {
    if (this.registration?.active) {
      this.registration.active.postMessage({
        type: 'PREFETCH',
        urls,
      });
    }
  }

  async unregister() {
    if (this.registration) {
      await this.registration.unregister();
      this.registration = null;
    }
  }
}

export const swManager = new ServiceWorkerManager();
