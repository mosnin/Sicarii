// Scalar service worker — conservative PWA caching.
// Precaches the offline page; caches immutable static assets
// (stale-while-revalidate); never caches API or auth responses; navigations are
// network-first with an offline fallback.
const CACHE = "scalar-v1";
const STATIC = /\/_next\/static\/|\/icon|\.svg$|\.woff2?$|\.png$/;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add("/offline.html"))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never touch API or auth routes — always live.
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/sign-")) return;

  // Immutable static assets: stale-while-revalidate.
  if (STATIC.test(url.pathname)) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((res) => {
            if (res && res.ok) cache.put(request, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Page navigations: network-first, fall back to the offline page when offline.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
  }
});
