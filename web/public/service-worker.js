// ClawChain Dashboard Service Worker
// Provides offline support via cache-first for static assets
// and network-first for API requests.

const CACHE_VERSION = "clawchain-v1";

const APP_SHELL_URLS = [
  "/",
  "/index.html",
  "/claw.svg",
  "/manifest.json",
];

// ---- Install: pre-cache app shell ----
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.addAll(APP_SHELL_URLS);
    })
  );
  // Activate immediately after install
  self.skipWaiting();
});

// ---- Activate: clean up old caches ----
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      );
    })
  );
  // Claim all open clients so the new SW controls them immediately
  self.clients.claim();
});

// ---- Fetch strategies ----

function isApiRequest(url) {
  const path = new URL(url).pathname;
  return (
    path.startsWith("/api/") ||
    path.startsWith("/rpc/") ||
    path.startsWith("/faucet/") ||
    path.startsWith("/ws/") ||
    path.startsWith("/notifications/")
  );
}

// Network-first: try network, fall back to cache
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    // Cache a clone for offline fallback (only cache successful GET requests)
    if (request.method === "GET" && networkResponse.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (_err) {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    // Nothing cached — return a simple offline JSON response for API calls
    return new Response(
      JSON.stringify({ error: "offline", message: "Network unavailable" }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

// Cache-first: serve from cache, fall back to network
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }
  try {
    const networkResponse = await fetch(request);
    if (request.method === "GET" && networkResponse.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (_err) {
    // For navigation requests, return cached index.html (SPA fallback)
    if (request.mode === "navigate") {
      const fallback = await caches.match("/index.html");
      if (fallback) {
        return fallback;
      }
    }
    return new Response("Offline", { status: 503 });
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Skip non-GET for caching (POST, PUT, etc. always go to network)
  if (request.method !== "GET") {
    return;
  }

  // Skip cross-origin requests
  if (!request.url.startsWith(self.location.origin)) {
    return;
  }

  if (isApiRequest(request.url)) {
    event.respondWith(networkFirst(request));
  } else {
    event.respondWith(cacheFirst(request));
  }
});
