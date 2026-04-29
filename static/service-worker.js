/* 沅興木業 PWA Service Worker - fix149-safe-guard */
const YX_PWA_VERSION='fix149-safe-guard';
const STATIC_CACHE=`yuanxing-pwa-static-${YX_PWA_VERSION}`;
const PRECACHE_ASSETS=[
  '/static/manifest.webmanifest',
  '/static/favicon.png',
  '/static/style.css?v=fix149-safe-guard',
  '/static/yx_modules/ornate_label_hardlock.css?v=fix149-safe-guard',
  '/static/yx_modules/home_background_hardlock.css?v=fix149-safe-guard',
  '/static/yx_modules/fix148_final_safe_speed.css?v=fix149-safe-guard',
  '/static/yx_modules/fix149_safe_guard.css?v=fix149-safe-guard',
  '/static/yx_modules/core_hardlock.js?v=fix149-safe-guard',
  '/static/yx_modules/ornate_label_hardlock.js?v=fix149-safe-guard',
  '/static/yx_modules/fix149_safe_guard.js?v=fix149-safe-guard',
  '/static/yx_modules/fix148_final_safe_speed.js?v=fix149-safe-guard',
  '/static/pwa.js?v=fix149-safe-guard',
  '/static/icons/icon-192x192.png',
  '/static/icons/icon-512x512.png',
  '/static/icons/icon-maskable-192x192.png',
  '/static/icons/icon-maskable-512x512.png'
];
self.addEventListener('install', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('yuanxing-pwa-')).map(k => caches.delete(k))))
      .then(() => caches.open(STATIC_CACHE))
      .then(cache => cache.addAll(PRECACHE_ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('yuanxing-pwa-') && k !== STATIC_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('message', event => {
  if(event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if(event.data && event.data.type === 'CLEAR_YX_CACHES') {
    event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('yuanxing-pwa-')).map(k => caches.delete(k)))));
  }
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  if(url.origin !== self.location.origin) return;
  if(url.pathname.startsWith('/api/') || url.pathname === '/api/sync/stream') {
    event.respondWith(fetch(req, {cache:'no-store'}));
    return;
  }
  if(
    url.pathname === '/' ||
    url.pathname.endsWith('.html') ||
    url.pathname.startsWith('/customers') ||
    url.pathname.startsWith('/orders') ||
    url.pathname.startsWith('/master') ||
    url.pathname.startsWith('/inventory') ||
    url.pathname.startsWith('/ship') ||
    url.pathname.startsWith('/warehouse') ||
    url.pathname.startsWith('/settings') ||
    url.pathname.startsWith('/today-changes') ||
    url.pathname.startsWith('/shipping-query') ||
    url.pathname.startsWith('/todos') ||
    url.pathname.startsWith('/login')
  ) {
    event.respondWith(fetch(req, {cache:'no-store'}));
    return;
  }
  if(url.pathname.startsWith('/static/')) {
    // FIX149：靜態檔網路優先；舊母版不再全部 precache，避免手機吃舊版。
    event.respondWith(fetch(req, {cache:'no-store'}).then(res => {
      if(res && res.ok) {
        const copy = res.clone();
        caches.open(STATIC_CACHE).then(cache => cache.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req)));
    return;
  }
  event.respondWith(fetch(req).catch(() => caches.match(req)));
});
