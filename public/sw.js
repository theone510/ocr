
// ── v3: broader passthrough + safe fallback Response ─────────────────────
const CACHE_NAME = 'manuscript-archive-v3';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Pass ALL cross-origin requests straight through — never intercept them.
  // This covers: Firebase, Gemini, Google Auth, Google tracking pixels,
  // CDN assets, fonts, PDF.js worker, and any other external resource.
  if (url.origin !== self.location.origin) {
    return; // Do NOT call event.respondWith — browser handles natively
  }

  // Same-origin app assets: network-first, then cache, then empty 404.
  // Always return a valid Response so the browser never crashes.
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cache successful responses (only GET requests with OK status)
        if (event.request.method === 'GET' && response.ok) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then(
          (cached) => cached || new Response('', { status: 404, statusText: 'Not Found' })
        )
      )
  );
});

self.addEventListener('activate', (event) => {
  // clients.claim: take control of existing open pages immediately
  event.waitUntil(
    Promise.all([
      clients.claim(),
      // Delete all old caches
      caches.keys().then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      ),
    ])
  );
});
