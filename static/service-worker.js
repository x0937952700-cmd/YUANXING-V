const CACHE='yuanxing-commercial-v10-render-safe-text-full-alignment-locked';
const OFFLINE='/static/offline.html';
const STATIC_ASSETS=[
  OFFLINE,
  '/static/css/app.css',
  '/static/js/core.js',
  '/static/js/home.js',
  '/static/js/inventory.js',
  '/static/js/orders.js',
  '/static/js/master.js',
  '/static/js/inbound.js',
  '/static/js/shipping.js',
  '/static/js/warehouse.js',
  '/static/js/customers.js',
  '/static/js/activity.js',
  '/static/js/settings.js',
  '/static/js/records.js',
  '/static/manifest.webmanifest',
  '/static/favicon.png',
  '/static/icons/icon-192x192.png',
  '/static/icons/icon-512x512.png',
  '/static/icons/icon-180x180.png',
  '/static/icons/icon-152x152.png',
  '/static/icons/icon-maskable-192x192.png',
  '/static/icons/icon-maskable-512x512.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(STATIC_ASSETS)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || event.request.url.includes('/api/')) return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        if (response.ok && new URL(event.request.url).origin === self.location.origin) {
          caches.open(CACHE).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === 'navigate') return caches.match(OFFLINE);
        return new Response('', {status: 503, statusText: 'Offline'});
      })
  );
});
