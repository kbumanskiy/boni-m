// Service worker (ТЗ §1.5, §13.3): полностью офлайн, cache-first, версионируемое имя кэша.
// При обновлении версии — поднять CACHE и старые кэши удалятся в activate.
const CACHE = 'morse-v1';

const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.webmanifest',
  './js/data.js',
  './js/timing.js',
  './js/state.js',
  './js/progress.js',
  './js/gamify.js',
  './js/audio.js',
  './assets/hero-zastavka.webp',
  './assets/hero-portret.webp',
  './assets/hero-radost.webp',
  './assets/hero-klyuch.webp',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-512-maskable.png',
  './assets/favicon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// cache-first: офлайн со второго запуска; на сети — подтягиваем и обновляем кэш.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request)
        .then((res) => {
          if (res && res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});
