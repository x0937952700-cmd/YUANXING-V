// 沅興木業 Service Worker：520 速度版靜態資產快取；不快取 API / HTML / 出貨資料。
const CACHE_VERSION = 'yuanxing-static-v520-action-cache-ship-warehouse-fix-20260516h';
const PRECACHE = [
  '/static/css/base.css','/static/css/home.css','/static/css/mobile.css','/static/css/product.css','/static/css/warehouse.css','/static/yx_modules/yx_520_ui_alignment.css','/static/yx_modules/yx_520_refined_merge.css','/static/yx_modules/yx_premium_ui_100.css','/static/yx_modules/yx_final_520_alignment_repairs.css','/static/yx_modules/yx_ship_safe_ui_520.css',
  '/static/style.css','/static/yx_cache.js','/static/yx_core.js','/static/yx_data_store.js','/static/yx_device_sync.js','/static/yx_route_warm_cache.js','/static/yx_regression_guard.js',
  '/static/yx_pages/home_page.js','/static/yx_pages/inventory_page.js','/static/yx_pages/orders_page.js','/static/yx_pages/master_order_page.js','/static/yx_pages/product_page_core.js','/static/yx_pages/warehouse_page.js','/static/yx_pages/today_changes_page.js',
  '/static/yx_assets/yx_dream_starry_background.png','/static/yx_assets/yx_dream_pill_button.png','/static/yx_assets/home_cloud_background.jpg'
];
const STATIC_ALLOW = [
  /^\/static\/.*\.(?:css|js|png|jpg|jpeg|webp|svg|ico|webmanifest)(?:\?.*)?$/,
  /^\/favicon\.ico(?:\?.*)?$/
];
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_VERSION).then(cache => Promise.allSettled(PRECACHE.map(u => cache.add(u).catch(()=>null)))).catch(()=>null));
});
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
  if (data.type === 'CLEAR_YX_CACHES') {
    event.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).then(() => caches.open(CACHE_VERSION).then(cache => Promise.allSettled(PRECACHE.map(u => cache.add(u).catch(()=>null))))).catch(()=>null));
  }
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
      }).catch(() => hit))
    )
  );
});
