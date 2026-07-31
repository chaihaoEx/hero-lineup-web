/*
 * Replaces the former root-scoped Workbox worker at /sw.js.
 * It must stay available until old clients have upgraded and unregistered.
 */
const RETIREMENT_MARKER = "hero-lineup-root-worker-retired-v1";

self.addEventListener("install", () => {
  void self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(async (cacheName) => {
      const cache = await caches.open(cacheName);
      const requests = await cache.keys();
      const paths = requests.map((request) => new URL(request.url).pathname);
      const containsLegacyRoot = paths.includes("/index.html")
        || paths.includes("/manifest.webmanifest")
        || paths.some((path) => path.startsWith("/content/"));
      const containsCurrentSubpath = paths.some((path) => path.startsWith("/hero-lineup/"));
      if (containsLegacyRoot && !containsCurrentSubpath) await caches.delete(cacheName);
    }));

    await self.registration.unregister();
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    await Promise.allSettled(windows.map((client) => client.navigate(client.url)));
  })());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});

void RETIREMENT_MARKER;
