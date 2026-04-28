/* 沅興木業 PWA Service Worker - fix135-master-final-hardlock */
const YX_PWA_VERSION='fix135-master-final-hardlock';
const STATIC_CACHE=`yuanxing-pwa-static-${YX_PWA_VERSION}`;
const PRECACHE_ASSETS=[
  '/static/manifest.webmanifest',
  '/static/favicon.png',
  '/static/style.css?v=fix135-master-final-hardlock',
  '/static/yx_modules/ornate_label_hardlock.css?v=fix135-master-final-hardlock',
  '/static/yx_modules/home_background_hardlock.css?v=fix135-master-final-hardlock',
  '/static/yx_modules/fix135_master_final_hardlock.css?v=fix135-master-final-hardlock',
  '/static/yx_assets/home_cloud_background.jpg?v=fix135-master-final-hardlock',
  '/static/app.js?v=fix135-master-final-hardlock',
  '/static/pwa.js?v=fix135-master-final-hardlock',
  '/static/yx_modules/core_hardlock.js?v=fix135-master-final-hardlock',
  '/static/yx_modules/ornate_label_hardlock.js?v=fix135-master-final-hardlock',
  '/static/yx_modules/quantity_rule_hardlock.js?v=fix135-master-final-hardlock',
  '/static/yx_modules/today_changes_hardlock.js?v=fix135-master-final-hardlock',
  '/static/yx_modules/warehouse_hardlock.js?v=fix135-master-final-hardlock',
  '/static/yx_modules/settings_audit_hardlock.js?v=fix135-master-final-hardlock',
  '/static/yx_modules/customer_regions_hardlock.js?v=fix135-master-final-hardlock',
  '/static/yx_modules/product_sort_hardlock.js?v=fix135-master-final-hardlock',
  '/static/yx_modules/product_actions_hardlock.js?v=fix135-master-final-hardlock',
  '/static/yx_modules/product_source_bridge_hardlock.js?v=fix135-master-final-hardlock',
  '/static/yx_modules/ship_picker_hardlock.js?v=fix135-master-final-hardlock',
  '/static/yx_modules/ship_text_validate_hardlock.js?v=fix135-master-final-hardlock',
  '/static/yx_modules/inline_edit_full_list_hardlock.js?v=fix135-master-final-hardlock',
  '/static/yx_modules/legacy_isolation_hardlock.js?v=fix135-master-final-hardlock',
  '/static/yx_modules/apple_ui_hardlock.js?v=fix135-master-final-hardlock',
  '/static/yx_modules/master_integrator.js?v=fix135-master-final-hardlock',
  '/static/yx_modules/fix135_master_final_hardlock.js?v=fix135-master-final-hardlock',
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
  const req=event.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin) return;
  if(url.pathname.startsWith('/api/') || url.pathname==='/api/sync/stream'){
    event.respondWith(fetch(req,{cache:'no-store'}));
    return;
  }
  if(url.pathname==='/'||url.pathname.endsWith('.html')||url.pathname.startsWith('/customers')||url.pathname.startsWith('/orders')||url.pathname.startsWith('/master')||url.pathname.startsWith('/inventory')||url.pathname.startsWith('/ship')||url.pathname.startsWith('/warehouse')||url.pathname.startsWith('/settings')||url.pathname.startsWith('/today-changes')||url.pathname.startsWith('/shipping-query')||url.pathname.startsWith('/todos')||url.pathname.startsWith('/login')){
    event.respondWith(fetch(req,{cache:'no-store'}));
    return;
  }
  if(url.pathname.startsWith('/static/')){
    // FIX135：有版本號的靜態檔先走網路，拿不到才回快取，避免舊母版覆蓋新版。
    event.respondWith(fetch(req,{cache:'no-store'}).then(res=>{
      if(res && res.ok){ const copy=res.clone(); caches.open(STATIC_CACHE).then(cache=>cache.put(req,copy)); }
      return res;
    }).catch(()=>caches.match(req)));
    return;
  }
  event.respondWith(fetch(req).catch(()=>caches.match(req)));
});
