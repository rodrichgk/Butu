// Predictive preloading based on user behavior patterns
import type { MediaItem } from "../types";

interface ViewPattern {
  itemId: string;
  timestamp: number;
  duration: number;
  completed: boolean;
  nextItemId?: string;
}

interface PreloadCandidate {
  item: MediaItem;
  score: number;
  reason: string;
}

const STORAGE_KEY = "butu:view_patterns";
const MAX_PATTERNS = 100;
const PRELOAD_THRESHOLD = 0.6; // Preload if confidence > 60%

class PredictivePreloader {
  private patterns: ViewPattern[] = [];
  private preloadQueue = new Set<string>();
  private imageCache = new Map<string, HTMLImageElement>();
  private videoCache = new Map<string, string>(); // URL -> blob URL

  constructor() {
    this.loadPatterns();
  }

  private loadPatterns() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.patterns = JSON.parse(stored);
      }
    } catch (e) {
      console.warn("Failed to load view patterns:", e);
    }
  }

  private savePatterns() {
    try {
      // Keep only recent patterns
      const recent = this.patterns
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, MAX_PATTERNS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(recent));
    } catch (e) {
      console.warn("Failed to save view patterns:", e);
    }
  }

  // Track user viewing behavior
  trackView(itemId: string, duration: number, completed: boolean, nextItemId?: string) {
    this.patterns.push({
      itemId,
      timestamp: Date.now(),
      duration,
      completed,
      nextItemId,
    });
    this.savePatterns();
  }

  // Predict next items user is likely to view
  predictNext(currentItemId: string, allItems: MediaItem[]): PreloadCandidate[] {
    const candidates: PreloadCandidate[] = [];
    const itemMap = new Map(allItems.map(item => [item.id, item]));

    // 1. Sequential viewing pattern (e.g., TV series episodes)
    const sequentialScore = this.analyzeSequentialPattern(currentItemId, allItems);
    if (sequentialScore.nextItem) {
      candidates.push({
        item: sequentialScore.nextItem,
        score: sequentialScore.confidence,
        reason: "sequential_viewing",
      });
    }

    // 2. Historical next-item patterns
    const historicalNext = this.patterns
      .filter(p => p.itemId === currentItemId && p.nextItemId)
      .map(p => p.nextItemId!);
    
    const nextItemCounts = new Map<string, number>();
    historicalNext.forEach(id => {
      nextItemCounts.set(id, (nextItemCounts.get(id) || 0) + 1);
    });

    nextItemCounts.forEach((count, itemId) => {
      const item = itemMap.get(itemId);
      if (item) {
        const confidence = count / historicalNext.length;
        candidates.push({
          item,
          score: confidence,
          reason: "historical_pattern",
        });
      }
    });

    // 3. Same genre/artist preference
    const currentItem = itemMap.get(currentItemId);
    if (currentItem) {
      const sameGenreItems = this.findSimilarItems(currentItem, allItems);
      sameGenreItems.forEach(item => {
        candidates.push({
          item,
          score: 0.4, // Lower confidence for genre-based
          reason: "similar_content",
        });
      });
    }

    // 4. Time-of-day patterns
    const timeBasedItems = this.analyzeTimePatterns(allItems);
    timeBasedItems.forEach(item => {
      candidates.push({
        item,
        score: 0.3,
        reason: "time_pattern",
      });
    });

    // Deduplicate and sort by score
    const uniqueCandidates = new Map<string, PreloadCandidate>();
    candidates.forEach(c => {
      const existing = uniqueCandidates.get(c.item.id);
      if (!existing || c.score > existing.score) {
        uniqueCandidates.set(c.item.id, c);
      }
    });

    return Array.from(uniqueCandidates.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 5); // Top 5 candidates
  }

  private analyzeSequentialPattern(currentId: string, items: MediaItem[]): {
    nextItem: MediaItem | null;
    confidence: number;
  } {
    const current = items.find(i => i.id === currentId);
    if (!current || current.type !== "tv" || !current.episode) {
      return { nextItem: null, confidence: 0 };
    }

    // Find next episode in same season
    const nextEpisode = items.find(
      i =>
        i.type === "tv" &&
        i.season === current.season &&
        i.episode === (current.episode || 0) + 1 &&
        i.seriesId === current.seriesId
    );

    if (nextEpisode) {
      return { nextItem: nextEpisode, confidence: 0.9 };
    }

    // Find first episode of next season
    const nextSeasonEpisode = items.find(
      i =>
        i.type === "tv" &&
        i.season === (current.season || 0) + 1 &&
        i.episode === 1 &&
        i.seriesId === current.seriesId
    );

    if (nextSeasonEpisode) {
      return { nextItem: nextSeasonEpisode, confidence: 0.7 };
    }

    return { nextItem: null, confidence: 0 };
  }

  private findSimilarItems(current: MediaItem, allItems: MediaItem[]): MediaItem[] {
    return allItems
      .filter(item => {
        if (item.id === current.id) return false;
        
        // Same artist for music
        if (current.type === "music" && item.type === "music") {
          return item.artist === current.artist;
        }
        
        // Same genre
        if (current.genre && item.genre) {
          return current.genre.some(g => item.genre?.includes(g));
        }
        
        return false;
      })
      .slice(0, 3);
  }

  private analyzeTimePatterns(allItems: MediaItem[]): MediaItem[] {
    const hour = new Date().getHours();
    
    // Find items viewed at similar time in the past
    const similarTimeViews = this.patterns.filter(p => {
      const viewHour = new Date(p.timestamp).getHours();
      return Math.abs(viewHour - hour) <= 2;
    });

    const itemCounts = new Map<string, number>();
    similarTimeViews.forEach(p => {
      itemCounts.set(p.itemId, (itemCounts.get(p.itemId) || 0) + 1);
    });

    const topItems = Array.from(itemCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id]) => id);

    return allItems.filter(item => topItems.includes(item.id));
  }

  // Preload images for predicted items
  async preloadImages(items: MediaItem[]) {
    const toPreload = items.filter(item => !this.imageCache.has(item.id));
    
    const promises = toPreload.map(item => {
      return new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          this.imageCache.set(item.id, img);
          resolve();
        };
        img.onerror = () => resolve(); // Fail silently
        img.src = item.thumbnail;
      });
    });

    await Promise.allSettled(promises);
  }

  // Preload video segments for seamless playback
  async preloadVideoSegment(url: string, durationSeconds: number = 10) {
    if (this.videoCache.has(url)) return this.videoCache.get(url);

    try {
      // Fetch first N seconds of video
      const response = await fetch(url, {
        headers: {
          Range: `bytes=0-${durationSeconds * 125000}`, // ~1Mbps estimate
        },
      });

      if (!response.ok) return null;

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      this.videoCache.set(url, blobUrl);
      
      return blobUrl;
    } catch (e) {
      console.warn("Failed to preload video segment:", e);
      return null;
    }
  }

  // Preload based on scroll position and viewport
  preloadVisibleItems(items: MediaItem[], scrollDirection: "up" | "down" | "none") {
    const candidates = this.predictNext("", items);
    const highConfidence = candidates.filter(c => c.score > PRELOAD_THRESHOLD);
    
    // Preload images for high-confidence items
    this.preloadImages(highConfidence.map(c => c.item));

    // If scrolling down, preload items below
    if (scrollDirection === "down" && highConfidence.length > 0) {
      const topCandidate = highConfidence[0];
      if (topCandidate.item.streamUrl) {
        this.preloadVideoSegment(topCandidate.item.streamUrl, 5);
      }
    }
  }

  // Clean up old cache entries
  cleanup() {
    // Remove old images (keep last 50)
    if (this.imageCache.size > 50) {
      const entries = Array.from(this.imageCache.entries());
      entries.slice(0, entries.length - 50).forEach(([key]) => {
        this.imageCache.delete(key);
      });
    }

    // Revoke old blob URLs
    if (this.videoCache.size > 10) {
      const entries = Array.from(this.videoCache.entries());
      entries.slice(0, entries.length - 10).forEach(([key, blobUrl]) => {
        URL.revokeObjectURL(blobUrl);
        this.videoCache.delete(key);
      });
    }
  }

  // Get preload statistics
  getStats() {
    return {
      patterns: this.patterns.length,
      cachedImages: this.imageCache.size,
      cachedVideos: this.videoCache.size,
      queueSize: this.preloadQueue.size,
    };
  }
}

export const preloader = new PredictivePreloader();
