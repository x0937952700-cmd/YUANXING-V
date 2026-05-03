const CACHE_VERSION='full-master-v47_real_rewrite_no_append';
self.addEventListener('install', event => { self.skipWaiting(); });
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    const clientsList = await self.clients.matchAll({type:'window', includeUncontrolled:true});
    for (const client of clientsList) client.postMessage({type:'YX_FORCE_RELOAD', version:CACHE_VERSION});
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request, {cache:'no-store'}).catch(() => fetch(event.request)));
});
