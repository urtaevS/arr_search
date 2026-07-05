const CACHE = "torrent-search-v8";

const STATIC_ASSETS = [
  "/index.html",
  "/styles.css",
  "/app.js",
  "/manifest.json",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
  "/icons/icon.svg",
  "/icons/jackett.png",
  "/icons/prowlarr.png",
  "/icons/tSearch.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(STATIC_ASSETS);
      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))
      );
    })()
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Navigation requests — serve index.html from cache
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cached = await caches.match("/index.html");
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE);
          cache.put("/index.html", response.clone());
        }
        return response;
      })()
    );
    return;
  }

  // API requests — network first, fallback to cache
  if (request.url.includes("/api/")) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Lucide icons from CDN — cache first
  if (request.url.includes("jsdelivr.net") || request.url.includes("googleapis.com")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // All other static assets — cache first
  event.respondWith(cacheFirst(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("Offline", { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: "Offline" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}
