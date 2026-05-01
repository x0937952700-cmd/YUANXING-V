const CACHE_NAME='yuanxing-pack3-final-v1';
const CORE_ASSETS=[
 '/',
 '/static/style.css',
 '/static/clean_override.css',
 '/static/yx_commercial_ui_lock.css',
 '/static/yx_pack3_final.css',
 '/static/yx_commercial_ui_lock.js',
 '/static/yx_pack3_final.js',
 '/static/manifest.webmanifest'
];
self.addEventListener('install', event=>{self.skipWaiting();event.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(CORE_ASSETS).catch(()=>null)));});
self.addEventListener('activate', event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch', event=>{const req=event.request;if(req.method!=='GET'||new URL(req.url).pathname.startsWith('/api/')) return;event.respondWith(fetch(req).then(res=>{const copy=res.clone();caches.open(CACHE_NAME).then(c=>c.put(req,copy)).catch(()=>null);return res;}).catch(()=>caches.match(req).then(r=>r||caches.match('/'))));});
