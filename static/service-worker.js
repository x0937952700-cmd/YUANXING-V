/* 沅興木業 PWA Service Worker - fix145-consolidated-master */
const YX_PWA_VERSION='fix145-consolidated-master';
const STATIC_CACHE=`yuanxing-pwa-static-${YX_PWA_VERSION}`;
const PRECACHE_ASSETS=[
  '/static/manifest.webmanifest',
  '/static/favicon.png',
  '/static/style.css?v=fix145-consolidated-master',
  '/static/yx_modules/fix144_modular_master.css?v=fix145-consolidated-master',
  '/static/yx_assets/home_cloud_background.jpg?v=fix145-consolidated-master',
  '/static/app.js?v=fix145-consolidated-master',
  '/static/pwa.js?v=fix145-consolidated-master',
  '/static/yx_modules/core_hardlock.js?v=fix145-consolidated-master',
  '/static/yx_modules/quantity_rule_hardlock.js?v=fix145-consolidated-master',
  '/static/yx_modules/fix144_master_bootstrap.js?v=fix145-consolidated-master',
  '/static/yx_modules/fix144_page_home_master.js?v=fix145-consolidated-master',
  '/static/yx_modules/fix144_page_products_master.js?v=fix145-consolidated-master',
  '/static/yx_modules/fix144_page_customers_master.js?v=fix145-consolidated-master',
  '/static/yx_modules/fix144_page_shipping_master.js?v=fix145-consolidated-master',
  '/static/yx_modules/fix144_page_warehouse_master.js?v=fix145-consolidated-master',
  '/static/yx_modules/fix145_consolidation_guard.js?v=fix145-consolidated-master',
  '/static/yx_modules/fix144_final_guard.js?v=fix145-consolidated-master',
  '/static/icons/icon-192x192.png','/static/icons/icon-512x512.png','/static/icons/icon-maskable-192x192.png','/static/icons/icon-maskable-512x512.png'
];
self.addEventListener('install',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('yuanxing-pwa-')).map(k=>caches.delete(k))))
    .then(()=>caches.open(STATIC_CACHE)).then(cache=>cache.addAll(PRECACHE_ASSETS).catch(()=>{})).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('yuanxing-pwa-')&&key!==STATIC_CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('message',event=>{
  if(event.data&&event.data.type==='SKIP_WAITING') self.skipWaiting();
  if(event.data&&event.data.type==='CLEAR_YX_CACHES') event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('yuanxing-pwa-')).map(k=>caches.delete(k)))));
});
self.addEventListener('fetch',event=>{
  const req=event.request; if(req.method!=='GET') return;
  const url=new URL(req.url); if(url.origin!==self.location.origin) return;
  if(url.pathname.startsWith('/api/') || url.pathname==='/api/sync/stream'){event.respondWith(fetch(req,{cache:'no-store'})); return;}
  if(url.pathname==='/'||url.pathname.endsWith('.html')||url.pathname.startsWith('/customers')||url.pathname.startsWith('/orders')||url.pathname.startsWith('/master')||url.pathname.startsWith('/inventory')||url.pathname.startsWith('/ship')||url.pathname.startsWith('/warehouse')||url.pathname.startsWith('/settings')||url.pathname.startsWith('/today-changes')||url.pathname.startsWith('/shipping-query')||url.pathname.startsWith('/todos')||url.pathname.startsWith('/login')){event.respondWith(fetch(req,{cache:'no-store'})); return;}
  if(url.pathname.startsWith('/static/')){event.respondWith(fetch(req,{cache:'no-store'}).then(res=>{if(res&&res.ok){const copy=res.clone(); caches.open(STATIC_CACHE).then(cache=>cache.put(req,copy));} return res;}).catch(()=>caches.match(req))); return;}
  event.respondWith(fetch(req).catch(()=>caches.match(req)));
});
