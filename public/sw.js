// Service Worker for offline-first architecture and intelligent caching
const CACHE_VERSION = 'butu-v2';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;
const VIDEO_CACHE = `${CACHE_VERSION}-video`;

// Static assets to cache immediately
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('butu-') && name !== STATIC_CACHE && name !== DYNAMIC_CACHE && name !== IMAGE_CACHE && name !== VIDEO_CACHE)
          .map((name) => caches.delete(name))
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Fetch event - intelligent caching strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension and other protocols
  if (!url.protocol.startsWith('http')) return;

  // App-shell HTML / SPA navigations → ALWAYS network-first, so a new deploy is live on the
  // next load. Serving index.html cache-first is what served an old shell that pointed at
  // deleted hashed asset filenames — the stale white-screen / "no export named X" bug.
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(networkFirstDocument(request));
    return;
  }

  // Different strategies for different resource types
  if (request.destination === 'image') {
    event.respondWith(imageStrategy(request));
  } else if (
    request.destination === 'video' ||
    url.pathname.includes('.m3u8') ||
    url.pathname.includes('.ts') ||
    url.pathname.includes('.m4s')   // fMP4 segments used by Plex directStream
  ) {
    event.respondWith(videoStrategy(request));
  } else if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstStrategy(request));
  } else {
    event.respondWith(cacheFirstStrategy(request));
  }
});

// HTML shell — try the network first so the newest build (and its hashed asset references)
// is always used; fall back to the cached shell only when offline. Vite asset filenames are
// content-hashed, so the JS/CSS below can stay cache-first safely (immutable once deployed).
async function networkFirstDocument(request) {
  const cache = await caches.open(STATIC_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put('/index.html', response.clone());
    return response;
  } catch (error) {
    return (await cache.match('/index.html'))
      || (await cache.match(request))
      || new Response('Offline', { status: 503 });
  }
}

// Cache-first strategy for static assets
async function cacheFirstStrategy(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  
  if (cached) {
    // Return cached version and update in background
    updateCache(request, STATIC_CACHE);
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    // Return offline fallback if available
    return new Response('Offline', { status: 503 });
  }
}

// Network-first strategy for API calls
async function networkFirstStrategy(request) {
  const cache = await caches.open(DYNAMIC_CACHE);

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

// Optimized image caching
async function imageStrategy(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);

  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      // Only cache successful image responses
      cache.put(request, response.clone());
      
      // Limit image cache size
      limitCacheSize(IMAGE_CACHE, 100);
    }
    return response;
  } catch (error) {
    // Return placeholder image
    return new Response('', { status: 404 });
  }
}

// Video streaming strategy
async function videoStrategy(request) {
  const url = request.url;

  // Cache individual HLS segments (.ts and .m4s) — these are immutable once
  // written by the server, so a cache hit is always safe.
  if (url.includes('.ts') || url.includes('.m4s')) {
    const cache = await caches.open(VIDEO_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;

    try {
      const response = await fetch(request);
      if (response.ok) {
        cache.put(request, response.clone());
        limitCacheSize(VIDEO_CACHE, 80); // ~80 segments ≈ several minutes of buffer
      }
      return response;
    } catch (error) {
      throw error;
    }
  }

  // Manifests (.m3u8) and full video files — always fetch fresh so HLS.js
  // gets the latest segment list. No caching here.
  return fetch(request);
}

// Background cache update
async function updateCache(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response);
    }
  } catch (error) {
    // Silently fail background updates
  }
}

// Limit cache size by removing oldest entries
async function limitCacheSize(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  
  if (keys.length > maxItems) {
    // Remove oldest entries (FIFO)
    const toDelete = keys.slice(0, keys.length - maxItems);
    await Promise.all(toDelete.map(key => cache.delete(key)));
  }
}

// Message handler for cache control from main thread
self.addEventListener('message', (event) => {
  if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((name) => caches.delete(name))
        );
      })
    );
  }

  if (event.data.type === 'PREFETCH') {
    const { urls } = event.data;
    event.waitUntil(
      caches.open(IMAGE_CACHE).then((cache) => {
        return cache.addAll(urls);
      })
    );
  }

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
