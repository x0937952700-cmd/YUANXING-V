/* 沅興木業 PWA Service Worker - fix121-order-master-customer-items-hard-connect - network only cache reset */
const YX_PWA_VERSION = 'fix121-order-master-customer-items-hard-connect';
self.addEventListener('install', event => {
  event.waitUntil((async()=>{
    try { const keys = await caches.keys(); await Promise.all(keys.map(k => caches.delete(k))); } catch(_) {}
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async()=>{
    try { const keys = await caches.keys(); await Promise.all(keys.map(k => caches.delete(k))); } catch(_) {}
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data && event.data.type === 'CLEAR_CACHES') {
    event.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))));
  }
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(fetch(req, {cache:'no-store'}).catch(() => new Response('', {status:504, statusText:'Offline'})));
});
