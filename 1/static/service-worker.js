const CACHE_VERSION='V55';
self.addEventListener('install', event => { self.skipWaiting(); });
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    const clientsList = await self.clients.matchAll({type:'window', includeUncontrolled:true});
    for (const client of clientsList) client.postMessage({type:'YX_FORCE_RELOAD', version:CACHE_VERSION, clear:true});
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.includes('/static/') || url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.html')) {
    event.respondWith(fetch(event.request, {cache:'reload'}));
    return;
  }
  event.respondWith(fetch(event.request, {cache:'no-store'}).catch(() => fetch(event.request)));
});
