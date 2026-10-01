// Service worker (ТЗ §1.5, §13.3): полностью офлайн, cache-first, версионируемое имя кэша.
// При обновлении версии — поднять CACHE и старые кэши удалятся в activate.
const CACHE = 'morse-v25';

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
  './js/keytext.js',
  './js/trace.js',
  './js/icons.js',
  './js/glyph.js',
  './js/callsign.js',
  './js/radiogram.js',
  './js/support.js',
  './js/metrics.js',
  './js/version.js',
  './js/puzzle.js',
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
    // cache: 'reload' — мимо HTTP-кэша браузера (Pages отдаёт файлы с max-age до 10 минут).
    // Иначе новый кэш мог собраться из смеси: новый app.js и старый state.js.
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
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
