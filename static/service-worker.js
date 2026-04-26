/* 沅興木業 PWA Service Worker - fix108-speed-old-ui-hardlock - FIX108_SPEED_OLD_UI_HARD_LOCK */
const YX_PWA_VERSION='fix108-speed-old-ui-hardlock';
const STATIC_CACHE=`yuanxing-pwa-icons-${YX_PWA_VERSION}`;
const ICON_ASSETS=['/static/favicon.png','/static/icons/icon-192x192.png','/static/icons/icon-512x512.png','/static/icons/icon-maskable-192x192.png','/static/icons/icon-maskable-512x512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(STATIC_CACHE).then(cache=>cache.addAll(ICON_ASSETS)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('yuanxing-pwa-')&&key!==STATIC_CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener('message',event=>{if(event.data&&event.data.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;
  if(url.pathname.startsWith('/api/')){event.respondWith(fetch(req,{cache:'no-store'}));return;}
  if(url.pathname==='/'||url.pathname.endsWith('.html')||url.pathname.startsWith('/customers')||url.pathname.startsWith('/orders')||url.pathname.startsWith('/master')||url.pathname.startsWith('/inventory')||url.pathname.startsWith('/ship')||url.pathname.startsWith('/warehouse')||url.pathname.startsWith('/settings')||url.pathname.startsWith('/today-changes')||url.pathname.startsWith('/shipping-query')||url.pathname.startsWith('/todos')){event.respondWith(fetch(req,{cache:'no-store'}));return;}
  if(url.pathname==='/sw.js'||url.pathname==='/manifest.webmanifest'||url.pathname==='/static/manifest.webmanifest'||url.pathname==='/static/app.js'||url.pathname==='/static/style.css'||url.pathname==='/static/pwa.js'||url.pathname==='/static/service-worker.js'){
    event.respondWith(fetch(req,{cache:'reload'}).catch(()=>caches.match(req)));
    return;
  }
  if(url.pathname.startsWith('/static/icons/')||url.pathname==='/static/favicon.png'){
    event.respondWith(caches.match(req).then(cached=>cached||fetch(req,{cache:'reload'}).then(res=>{const copy=res.clone();caches.open(STATIC_CACHE).then(cache=>cache.put(req,copy));return res;})));
    return;
  }
  event.respondWith(fetch(req,{cache:'no-store'}).catch(()=>caches.match(req)));
});
