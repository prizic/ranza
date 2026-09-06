const CACHE_NAME = "ranza-public-assets-v1";
const PUBLIC_ASSET_PATHS = new Set([
  "/manifest.webmanifest",
  "/pwa/192",
  "/pwa/512",
]);

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  const cacheable =
    request.method === "GET" &&
    url.origin === self.location.origin &&
    PUBLIC_ASSET_PATHS.has(url.pathname) &&
    !request.headers.has("authorization");

  if (!cacheable) return;
  event.respondWith(
    fetch(request).then(async (response) => {
      if (
        response.ok &&
        !response.headers.get("cache-control")?.includes("no-store")
      ) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    }),
  );
});
