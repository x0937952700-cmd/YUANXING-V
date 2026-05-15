// 沅興木業 Service Worker：只快取版本化靜態檔，不快取 API / HTML / 資料頁。
const CACHE_VERSION = 'yuanxing-static-merge-complete-v20260515';
const STATIC_ALLOW = [
  /^\/static\/.*\.(?:css|js|png|jpg|jpeg|webp|svg|ico|webmanifest)(?:\?.*)?$/,
  /^\/favicon\.ico(?:\?.*)?$/
];
self.addEventListener('install', event => { self.skipWaiting(); });
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname === '/' || url.pathname.endsWith('.html')) return;
  if (!STATIC_ALLOW.some(re => re.test(url.pathname))) return;
  event.respondWith(
    caches.open(CACHE_VERSION).then(cache =>
      cache.match(req).then(hit => hit || fetch(req, { cache: 'no-store' }).then(res => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }))
    )
  );
});
