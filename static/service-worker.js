/* 沅興木業 PWA Service Worker - v17 pool/api dedupe */
const YX_PWA_VERSION='v17-pool-api-dedupe';
const STATIC_CACHE=`yuanxing-pwa-static-${YX_PWA_VERSION}`;
self.addEventListener('install',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('yuanxing-pwa-')).map(k=>caches.delete(k)))).then(()=>self.skipWaiting()));
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
  if(url.pathname==='/' || url.pathname.endsWith('.html') || ['/customers','/orders','/master','/inventory','/ship','/warehouse','/settings','/today-changes','/shipping-query','/todos','/login'].some(p=>url.pathname.startsWith(p))){
    event.respondWith(fetch(req,{cache:'no-store'}));
    return;
  }
  if(url.pathname.startsWith('/static/')){
    event.respondWith(fetch(req,{cache:'no-store'}).then(res=>{
      if(res && res.ok){ const copy=res.clone(); caches.open(STATIC_CACHE).then(cache=>cache.put(req,copy)); }
      return res;
    }).catch(()=>caches.match(req)));
    return;
  }
  event.respondWith(fetch(req).catch(()=>caches.match(req)));
});
