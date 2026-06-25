// Resource prioritization and adaptive loading
import { isAndroidTV } from "./tvOptimizations";

export type ResourcePriority = "critical" | "high" | "medium" | "low" | "idle";

interface ResourceRequest {
  url: string;
  priority: ResourcePriority;
  type: "image" | "video" | "data" | "font";
  callback?: (result: any) => void;
}

class ResourcePrioritizer {
  private queue: Map<ResourcePriority, ResourceRequest[]> = new Map([
    ["critical", []],
    ["high", []],
    ["medium", []],
    ["low", []],
    ["idle", []],
  ]);

  private active = new Set<string>();
  private completed = new Set<string>();
  private maxConcurrent: number;
  private networkSpeed: "slow" | "medium" | "fast" = "medium";

  constructor() {
    this.maxConcurrent = this.detectOptimalConcurrency();
    this.detectNetworkSpeed();
  }

  private detectOptimalConcurrency(): number {
    // Android TV typically has good network but limited processing
    if (isAndroidTV) return 4;
    
    // Desktop/mobile
    const cores = navigator.hardwareConcurrency || 4;
    return Math.min(cores * 2, 8);
  }

  private async detectNetworkSpeed() {
    if (!("connection" in navigator)) return;

    const conn = (navigator as any).connection;
    if (!conn) return;

    const effectiveType = conn.effectiveType;
    if (effectiveType === "4g") {
      this.networkSpeed = "fast";
      this.maxConcurrent = 8;
    } else if (effectiveType === "3g") {
      this.networkSpeed = "medium";
      this.maxConcurrent = 4;
    } else {
      this.networkSpeed = "slow";
      this.maxConcurrent = 2;
    }

    // Listen for changes
    conn.addEventListener("change", () => {
      this.detectNetworkSpeed();
    });
  }

  enqueue(request: ResourceRequest) {
    // Skip if already completed
    if (this.completed.has(request.url)) {
      request.callback?.(null);
      return;
    }

    // Skip if already in queue or active
    if (this.active.has(request.url)) return;
    
    const priorityQueue = this.queue.get(request.priority);
    if (priorityQueue) {
      // Avoid duplicates
      const exists = priorityQueue.some(r => r.url === request.url);
      if (!exists) {
        priorityQueue.push(request);
      }
    }

    this.process();
  }

  private async process() {
    // Process requests by priority
    const priorities: ResourcePriority[] = ["critical", "high", "medium", "low", "idle"];

    for (const priority of priorities) {
      const queue = this.queue.get(priority);
      if (!queue || queue.length === 0) continue;

      while (this.active.size < this.maxConcurrent && queue.length > 0) {
        const request = queue.shift()!;
        this.active.add(request.url);
        this.loadResource(request);
      }

      // Don't process lower priorities if we're busy with higher ones
      if (this.active.size >= this.maxConcurrent) break;
    }
  }

  private async loadResource(request: ResourceRequest) {
    try {
      let result: any;

      switch (request.type) {
        case "image":
          result = await this.loadImage(request.url);
          break;
        case "video":
          result = await this.loadVideoSegment(request.url);
          break;
        case "data":
          result = await this.loadData(request.url);
          break;
        case "font":
          result = await this.loadFont(request.url);
          break;
      }

      this.completed.add(request.url);
      request.callback?.(result);
    } catch (error) {
      console.warn(`Failed to load ${request.type}:`, request.url, error);
      request.callback?.(null);
    } finally {
      this.active.delete(request.url);
      this.process(); // Continue processing queue
    }
  }

  private loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      
      // Use native lazy loading when possible
      img.loading = "eager";
      img.decoding = "async";
      img.src = url;
    });
  }

  private async loadVideoSegment(url: string, bytes: number = 1024 * 1024): Promise<Blob | null> {
    try {
      const response = await fetch(url, {
        headers: { Range: `bytes=0-${bytes}` },
      });
      return await response.blob();
    } catch {
      return null;
    }
  }

  private async loadData(url: string): Promise<any> {
    const response = await fetch(url);
    return await response.json();
  }

  private async loadFont(url: string): Promise<FontFace | null> {
    try {
      const font = new FontFace("CustomFont", `url(${url})`);
      await font.load();
      document.fonts.add(font);
      return font;
    } catch {
      return null;
    }
  }

  // Preload images in viewport with Intersection Observer
  observeImages(container: HTMLElement) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const img = entry.target as HTMLImageElement;
            const src = img.dataset.src;
            if (src && !img.src) {
              this.enqueue({
                url: src,
                priority: "high",
                type: "image",
                callback: (result) => {
                  if (result) img.src = src;
                },
              });
            }
            observer.unobserve(img);
          }
        });
      },
      { rootMargin: "50px" }
    );

    container.querySelectorAll("img[data-src]").forEach((img) => {
      observer.observe(img);
    });

    return observer;
  }

  // Adaptive quality based on network speed
  getOptimalImageQuality(): "low" | "medium" | "high" {
    switch (this.networkSpeed) {
      case "slow": return "low";
      case "medium": return "medium";
      case "fast": return "high";
    }
  }

  // Get optimal video quality
  getOptimalVideoQuality(): number {
    switch (this.networkSpeed) {
      case "slow": return 480;
      case "medium": return 720;
      case "fast": return 1080;
    }
  }

  getStats() {
    return {
      active: this.active.size,
      completed: this.completed.size,
      queued: Array.from(this.queue.values()).reduce((sum, q) => sum + q.length, 0),
      maxConcurrent: this.maxConcurrent,
      networkSpeed: this.networkSpeed,
    };
  }

  clear() {
    this.queue.forEach(q => q.length = 0);
    this.active.clear();
  }
}

export const resourcePrioritizer = new ResourcePrioritizer();
