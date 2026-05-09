const CACHE_NAME = 'drizzl-weather-v65';
const STATIC_ASSETS = [
  '/drizzl/',
  '/drizzl/index.html',
  '/drizzl/manifest.json',
  '/drizzl/fonts/bricolage-grotesque-latin-400-normal.woff2',
  '/drizzl/fonts/bricolage-grotesque-latin-600-normal.woff2',
  '/drizzl/fonts/bricolage-grotesque-latin-700-normal.woff2',
  '/drizzl/fonts/dm-sans-latin-300-normal.woff2',
  '/drizzl/fonts/dm-sans-latin-400-normal.woff2',
  '/drizzl/fonts/dm-sans-latin-500-normal.woff2',
  '/drizzl/fonts/dm-sans-latin-600-normal.woff2',
  '/drizzl/icons/icon-192.png',
  '/drizzl/icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
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
        return (await caches.match('/drizzl/index.html')) || Response.error();
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
