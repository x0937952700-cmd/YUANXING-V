const CACHE_NAME = 'yx-mainline-speed-repair-20260516k';
const SAFE_ASSETS = [
  '/static/style.css',
  '/static/css/base.css',
  '/static/css/home.css',
  '/static/css/product.css',
  '/static/css/warehouse.css',
  '/static/css/mobile.css',
  '/static/yx_modules/yx_final_520_alignment_repairs.css',
  '/static/yx_modules/yx_520_ui_alignment.css',
  '/static/yx_modules/final_mother_lock.css',
  '/static/yx_modules/ornate_label_hardlock.css',
  '/static/yx_modules/home_background_hardlock.css',
  '/static/favicon.png',
  '/static/manifest.webmanifest'
];
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
    .then(() => caches.open(CACHE_NAME))
    .then(cache => cache.addAll(SAFE_ASSETS.map(u => new Request(u, {cache:'reload'}))))
    .catch(()=>{}));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => k === CACHE_NAME ? null : caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
  if (data.type === 'CLEAR_YX_CACHES') event.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // HTML/API/JS 永遠網路優先，不讓舊快取影響訂單、總單、出貨、倉庫。
  if (req.mode === 'navigate' || url.pathname.startsWith('/api/') || url.pathname.endsWith('.js') || url.pathname === '/sw.js') {
    event.respondWith(fetch(req, {cache:'no-store'}).catch(() => caches.match(req)));
    return;
  }
  if (url.pathname.startsWith('/static/')) {
    event.respondWith(fetch(req).then(resp => {
      const copy = resp.clone();
      if (!url.pathname.endsWith('.js')) caches.open(CACHE_NAME).then(cache => cache.put(req, copy)).catch(()=>{});
      return resp;
    }).catch(() => caches.match(req)));
  }
});
