const CACHE_NAME = 'drizzl-weather-v90';
// Paths are relative to this script, so the app works both under
// powejam.github.io/drizzl/ and at the root of its own origin (e.g. pages.dev).
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './fonts/bricolage-grotesque-latin-400-normal.woff2',
  './fonts/bricolage-grotesque-latin-600-normal.woff2',
  './fonts/bricolage-grotesque-latin-700-normal.woff2',
  './fonts/dm-sans-latin-300-normal.woff2',
  './fonts/dm-sans-latin-400-normal.woff2',
  './fonts/dm-sans-latin-500-normal.woff2',
  './fonts/dm-sans-latin-600-normal.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon.svg',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    // Cache Storage is per-origin, and every powejam.github.io/* app shares
    // the origin, so only delete Drizzl's own old caches, never other apps'.
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k.startsWith('drizzl-weather-') && k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. Navigation requests (HTML): network-first with a 2.5s timeout so deploys
  //    take effect on the next normal refresh. Falls back to cache if offline
  //    or the network is slow.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const networkPromise = fetch(req).then(response => {
          caches.open(CACHE_NAME).then(c => c.put(req, response.clone()));
          return response;
        });
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('navigation timeout')), 2500)
        );
        return await Promise.race([networkPromise, timeoutPromise]);
      } catch (e) {
        const cached = await caches.match(req);
        if (cached) return cached;
        return (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  // 2. Network-first for API calls, with cache as offline fallback.
  if (url.hostname.includes('open-meteo.com') || url.hostname.includes('nominatim.openstreetmap.org')) {
    event.respondWith(
      fetch(req)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
          return response;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // 3. Cache-first for static assets (fonts, icons, manifest).
  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req))
  );
});
