const CACHE_NAME = 'lisa-invaders-v9';
const APP_SHELL = [
  '/',
  '/index.html',
  '/game.js',
  '/meta.js',
  '/manifest.json',
  '/icon.svg',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/assets/lisa.png',
  '/assets/boss.png',
  '/assets/lustweiser.png',
  '/assets/necks.png',
  '/assets/borona.png',
  '/assets/bennets.png',
  '/assets/rsu-cgil-flai.png'
];

const NETWORK_FIRST = new Set([
  '/game.js',
  '/meta.js',
  '/index.html',
  '/assets/lustweiser.png',
  '/assets/necks.png',
  '/assets/borona.png',
  '/assets/bennets.png',
]);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function networkFirst(request) {
  return fetch(request)
    .then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      }
      return response;
    })
    .catch(() => caches.match(request));
}

function cacheFirst(request) {
  return caches.match(request).then(cached => {
    const network = fetch(request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => cached);
    return cached || network;
  });
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(
    NETWORK_FIRST.has(url.pathname) ? networkFirst(event.request) : cacheFirst(event.request)
  );
});
