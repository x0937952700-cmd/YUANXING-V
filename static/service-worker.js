const CACHE='yuanxing-clean-v1';
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/','/static/css/app.css','/static/js/core.js','/static/manifest.webmanifest'])));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',e=>{ if(e.request.method!=='GET'||e.request.url.includes('/api/')) return; e.respondWith(fetch(e.request).catch(()=>caches.match(e.request))); });
