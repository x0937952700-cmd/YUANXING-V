/* 沅興木業 PWA Service Worker - stability-v6 */
const YX_PWA_VERSION = 'stability-v6';
const STATIC_CACHE = `yuanxing-pwa-static-${YX_PWA_VERSION}`;
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('yuanxing-pwa-static-') && k !== STATIC_CACHE).map(k => caches.delete(k)))));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('yuanxing-pwa-static-') && k !== STATIC_CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.pathname.startsWith('/api/') || url.pathname.includes('/sync/stream')) {
    event.respondWith(fetch(req, {cache:'no-store'}));
    return;
  }
  event.respondWith((async () => {
    try {
      const fresh = await fetch(req, {cache:'no-store'});
      const cache = await caches.open(STATIC_CACHE);
      if (fresh.ok && (url.pathname.startsWith('/static/') || url.pathname === '/' || url.pathname.endsWith('.webmanifest'))) {
        cache.put(req, fresh.clone()).catch(()=>{});
      }
      return fresh;
    } catch (_e) {
      const cached = await caches.match(req);
      return cached || new Response('離線狀態，請重新整理。', {status:503, headers:{'Content-Type':'text/plain; charset=utf-8'}});
    }
  })());
});
