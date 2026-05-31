self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open('keephub-v7').then((cache) => cache.addAll(['/index.html', '/manifest.json']))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== 'keephub-v4').map((k) => caches.delete(k)))
    )
  );
  return self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then((response) => response || fetch(e.request)));
});
