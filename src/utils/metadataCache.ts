// Intelligent metadata caching with background sync
import type { MediaItem } from "../types";

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  etag?: string;
  expiresAt: number;
}

interface CacheConfig {
  maxAge: number; // milliseconds
  maxSize: number; // number of entries
  backgroundSync: boolean;
}

const DEFAULT_CONFIG: CacheConfig = {
  maxAge: 1000 * 60 * 30, // 30 minutes
  maxSize: 500,
  backgroundSync: true,
};

class MetadataCache {
  private cache = new Map<string, CacheEntry<any>>();
  private pendingRequests = new Map<string, Promise<any>>();
  private config: CacheConfig;
  private syncInterval: number | null = null;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.loadFromStorage();
    
    if (this.config.backgroundSync) {
      this.startBackgroundSync();
    }
  }

  private loadFromStorage() {
    try {
      const stored = localStorage.getItem("butu:metadata_cache");
      if (stored) {
        const parsed = JSON.parse(stored);
        Object.entries(parsed).forEach(([key, value]) => {
          this.cache.set(key, value as CacheEntry<any>);
        });
      }
    } catch (e) {
      console.warn("Failed to load metadata cache:", e);
    }
  }

  private saveToStorage() {
    try {
      const obj = Object.fromEntries(this.cache.entries());
      localStorage.setItem("butu:metadata_cache", JSON.stringify(obj));
    } catch (e) {
      console.warn("Failed to save metadata cache:", e);
    }
  }

  private startBackgroundSync() {
    // Sync cache to localStorage every 30 seconds
    this.syncInterval = window.setInterval(() => {
      this.saveToStorage();
      this.cleanup();
    }, 30000);
  }

  private cleanup() {
    const now = Date.now();
    const entries = Array.from(this.cache.entries());

    // Remove expired entries
    entries.forEach(([key, entry]) => {
      if (entry.expiresAt < now) {
        this.cache.delete(key);
      }
    });

    // If still over size limit, remove oldest entries
    if (this.cache.size > this.config.maxSize) {
      const sorted = entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toRemove = sorted.slice(0, this.cache.size - this.config.maxSize);
      toRemove.forEach(([key]) => this.cache.delete(key));
    }
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (entry.expiresAt < now) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  set<T>(key: string, data: T, etag?: string) {
    const now = Date.now();
    this.cache.set(key, {
      data,
      timestamp: now,
      etag,
      expiresAt: now + this.config.maxAge,
    });
  }

  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: { forceRefresh?: boolean; etag?: string } = {}
  ): Promise<T> {
    // Check if there's already a pending request for this key
    const pending = this.pendingRequests.get(key);
    if (pending) {
      return pending as Promise<T>;
    }

    // Check cache if not forcing refresh
    if (!options.forceRefresh) {
      const cached = this.get<T>(key);
      if (cached) return cached;
    }

    // Fetch new data
    const promise = fetcher().then((data) => {
      this.set(key, data, options.etag);
      this.pendingRequests.delete(key);
      return data;
    }).catch((error) => {
      this.pendingRequests.delete(key);
      throw error;
    });

    this.pendingRequests.set(key, promise);
    return promise;
  }

  // Prefetch data in the background
  async prefetch<T>(key: string, fetcher: () => Promise<T>) {
    // Only prefetch if not already cached
    if (this.cache.has(key)) return;

    try {
      const data = await fetcher();
      this.set(key, data);
    } catch (e) {
      // Silently fail prefetch
      console.debug("Prefetch failed for", key);
    }
  }

  // Batch prefetch multiple items
  async batchPrefetch<T>(
    items: Array<{ key: string; fetcher: () => Promise<T> }>,
    concurrency: number = 3
  ) {
    const queue = [...items];
    const active: Promise<void>[] = [];

    while (queue.length > 0 || active.length > 0) {
      // Fill up to concurrency limit
      while (active.length < concurrency && queue.length > 0) {
        const item = queue.shift()!;
        const promise = this.prefetch(item.key, item.fetcher).then(() => {
          const index = active.indexOf(promise);
          if (index > -1) active.splice(index, 1);
        });
        active.push(promise);
      }

      // Wait for at least one to complete
      if (active.length > 0) {
        await Promise.race(active);
      }
    }
  }

  // Invalidate specific keys or patterns
  invalidate(keyOrPattern: string | RegExp) {
    if (typeof keyOrPattern === "string") {
      this.cache.delete(keyOrPattern);
    } else {
      const keys = Array.from(this.cache.keys());
      keys.forEach((key) => {
        if (keyOrPattern.test(key)) {
          this.cache.delete(key);
        }
      });
    }
  }

  // Clear all cache
  clear() {
    this.cache.clear();
    this.pendingRequests.clear();
    localStorage.removeItem("butu:metadata_cache");
  }

  // Get cache statistics
  getStats() {
    const now = Date.now();
    const entries = Array.from(this.cache.values());
    const expired = entries.filter((e) => e.expiresAt < now).length;

    return {
      size: this.cache.size,
      expired,
      pending: this.pendingRequests.size,
      maxSize: this.config.maxSize,
      hitRate: this.calculateHitRate(),
    };
  }

  private hitRate = { hits: 0, misses: 0 };

  private calculateHitRate(): number {
    const total = this.hitRate.hits + this.hitRate.misses;
    return total > 0 ? this.hitRate.hits / total : 0;
  }

  destroy() {
    if (this.syncInterval !== null) {
      clearInterval(this.syncInterval);
    }
    this.saveToStorage();
  }
}

export const metadataCache = new MetadataCache();

// Cleanup on page unload
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    metadataCache.destroy();
  });
}
