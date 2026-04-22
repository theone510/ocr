
// ── v2: fixes Firestore/Gemini passthrough ────────────────────────────────
const CACHE_NAME = 'manuscript-archive-v2';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  // skipWaiting: activate this SW immediately without waiting for old tabs to close
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never intercept external API calls — let them go directly to the network
  const passthroughHosts = [
    'firestore.googleapis.com',
    'generativelanguage.googleapis.com',
    'identitytoolkit.googleapis.com',
    'securetoken.googleapis.com',
    'firebase.googleapis.com',
    'firebaseapp.com',
    'googleapis.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'esm.sh',
    'cdnjs.cloudflare.com',
    'flaticon.com',
    'iquc.org',
  ];

  if (passthroughHosts.some(host => url.hostname.includes(host))) {
    return; // Do NOT call event.respondWith — browser handles it natively
  }

  // Local app assets: network first, cache fallback
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
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
