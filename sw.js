const CACHE_NAME = 'drizzl-weather-v37';
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
  const url = new URL(event.request.url);

  // Network-first for API calls, cache-first for static assets
  if (url.hostname.includes('open-meteo.com') || url.hostname.includes('nominatim.openstreetmap.org')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  } else {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request))
    );
  }
});
