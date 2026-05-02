/* 沅興木業 PWA Service Worker - full-master-v9-actions-ship-select
   V5：不再快取 JS/CSS/HTML，避免舊版覆蓋與跳版。 */
const YX_PWA_VERSION='full-master-v9-actions-ship-select';
self.addEventListener('install', event => { event.waitUntil(self.skipWaiting()); });
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('yuanxing-')).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data && event.data.type === 'CLEAR_YX_CACHES') {
    event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('yuanxing-')).map(k => caches.delete(k)))));
  }
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(fetch(req, {cache:'no-store'}));
});
