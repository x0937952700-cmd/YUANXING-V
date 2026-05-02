/* v26-one-table-no-legacy-action no-jump kill-switch service worker: unregister old caches and never serve stale UI */
const YX_PWA_VERSION='v26-one-table-no-legacy-action';
self.addEventListener('install',event=>{ event.waitUntil(self.skipWaiting()); });
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('yuanxing-')).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{ event.respondWith(fetch(event.request,{cache:'no-store'})); });
