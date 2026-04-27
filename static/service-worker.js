/* 沅興木業 PWA Service Worker - fix146-hard-lock-fix143-fix144-combo - FIX146_HARD_LOCK_FIX143_FIX144_COMBO */
const YX_PWA_VERSION = 'fix146-hard-lock-fix143-fix144-combo';
const YX_STATIC_CACHE = `yx-static-${YX_PWA_VERSION}`;

self.addEventListener('install', event => {
  event.waitUntil((async()=>{
    try {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k !== YX_STATIC_CACHE).map(k => caches.delete(k)));
    } catch(_) {}
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async()=>{
    try {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k !== YX_STATIC_CACHE).map(k => caches.delete(k)));
    } catch(_) {}
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

  // HTML / API 永遠走網路，資料不吃舊。
  if (url.pathname.startsWith('/api/') || url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(fetch(req, {cache:'no-store'}).catch(() => new Response('', {status:504, statusText:'Offline'})));
    return;
  }

  if (url.pathname.startsWith('/static/')) {
    const isVersionedStatic = url.searchParams.get('v') === YX_PWA_VERSION;
    event.respondWith((async()=>{
      const cache = await caches.open(YX_STATIC_CACHE);
      if (isVersionedStatic) {
        const cached = await cache.match(req);
        if (cached) return cached;
        const fresh = await fetch(req, {cache:'reload'});
        if (fresh && fresh.ok) cache.put(req, fresh.clone()).catch(()=>{});
        return fresh;
      }
      try {
        const fresh = await fetch(req, {cache:'no-store'});
        if (fresh && fresh.ok && /\/static\/icons\//.test(url.pathname)) cache.put(req, fresh.clone()).catch(()=>{});
        return fresh;
      } catch (_) {
        const cached = await cache.match(req);
        return cached || new Response('', {status:504, statusText:'Offline'});
      }
    })());
    return;
  }

  event.respondWith(fetch(req, {cache:'no-store'}).catch(() => new Response('', {status:504, statusText:'Offline'})));
});
