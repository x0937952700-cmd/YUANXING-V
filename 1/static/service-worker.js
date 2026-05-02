/* 沅興木業 PWA Service Worker - html-lock-products-warehouse-v8 */
const YX_PWA_VERSION='html-lock-products-warehouse-v8';
const STATIC_CACHE=`yuanxing-pwa-static-${YX_PWA_VERSION}`;
const PRECACHE_ASSETS=[
  '/static/manifest.webmanifest','/static/favicon.png',
  '/static/style.css?v=html-lock-products-warehouse-v8',
  '/static/yx_modules/final_mother_lock.css?v=html-lock-products-warehouse-v8',
  '/static/yx_modules/ornate_label_hardlock.css?v=html-lock-products-warehouse-v8',
  '/static/yx_modules/home_background_hardlock.css?v=html-lock-products-warehouse-v8',
  '/static/yx_assets/home_cloud_background.jpg?v=html-lock-products-warehouse-v8',
  '/static/pwa.js?v=html-lock-products-warehouse-v8',
  '/static/yx_modules/core_hardlock.js?v=html-lock-products-warehouse-v8',
  '/static/yx_modules/ornate_label_hardlock.js?v=html-lock-products-warehouse-v8',
  '/static/yx_modules/quantity_rule_hardlock.js?v=html-lock-products-warehouse-v8',
  '/static/yx_modules/product_sort_hardlock.js?v=html-lock-products-warehouse-v8',
  '/static/yx_modules/product_actions_hardlock.js?v=html-lock-products-warehouse-v8',
  '/static/yx_modules/customer_regions_hardlock.js?v=html-lock-products-warehouse-v8',
  '/static/yx_modules/warehouse_hardlock.js?v=html-lock-products-warehouse-v8',
  '/static/yx_modules/today_changes_hardlock.js?v=html-lock-products-warehouse-v8',
  '/static/yx_modules/settings_manual.js?v=html-lock-products-warehouse-v8',
  '/static/yx_modules/ship_single_lock.js?v=html-lock-products-warehouse-v8',
  '/static/yx_modules/html_direct_master_lock.js?v=html-lock-products-warehouse-v8',
  '/static/icons/icon-192x192.png','/static/icons/icon-512x512.png','/static/icons/icon-maskable-192x192.png','/static/icons/icon-maskable-512x512.png'
];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(STATIC_CACHE).then(cache=>cache.addAll(PRECACHE_ASSETS).catch(()=>{})).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('yuanxing-pwa-')&&key!==STATIC_CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('message',event=>{
  if(event.data&&event.data.type==='SKIP_WAITING') self.skipWaiting();
  if(event.data&&event.data.type==='CLEAR_YX_CACHES') event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('yuanxing-pwa-')).map(k=>caches.delete(k)))));
});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin) return;
  if(url.pathname.startsWith('/api/') || url.pathname==='/api/sync/stream'){
    event.respondWith(fetch(req,{cache:'no-store'}));
    return;
  }
  if(url.pathname.startsWith('/static/')){
    event.respondWith(caches.match(req).then(cached=>cached || fetch(req).then(res=>{
      if(res && res.ok){ const copy=res.clone(); caches.open(STATIC_CACHE).then(cache=>cache.put(req,copy)); }
      return res;
    })));
    return;
  }
  if(url.pathname==='/'||url.pathname.endsWith('.html')||url.pathname.startsWith('/customers')||url.pathname.startsWith('/orders')||url.pathname.startsWith('/master')||url.pathname.startsWith('/inventory')||url.pathname.startsWith('/ship')||url.pathname.startsWith('/warehouse')||url.pathname.startsWith('/settings')||url.pathname.startsWith('/today-changes')||url.pathname.startsWith('/shipping-query')||url.pathname.startsWith('/todos')||url.pathname.startsWith('/login')){
    event.respondWith(fetch(req,{cache:'no-store'}).catch(()=>caches.match(req)));
    return;
  }
  event.respondWith(fetch(req).catch(()=>caches.match(req)));
});
