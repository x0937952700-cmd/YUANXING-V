/* 沅興木業 PWA Service Worker - fix113-consolidated-latest-master */
const YX_PWA_VERSION = 'fix113-consolidated-latest-master';
self.addEventListener('install', event => { self.skipWaiting(); });
self.addEventListener('activate', event => {
  event.waitUntil((async()=>{
    try {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => !k.includes(YX_PWA_VERSION)).map(k => caches.delete(k)));
    } catch(_e) {}
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin && /\/(app\.js|style\.css|pwa\.js|manifest\.webmanifest)$/.test(url.pathname)) {
    event.respondWith(fetch(req, {cache:'no-store'}));
  }
});
