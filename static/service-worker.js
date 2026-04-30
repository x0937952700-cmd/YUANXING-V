const YX_PWA_VERSION = 'stable-v7-single-ui';
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))));
});
self.addEventListener('activate', event => {
  event.waitUntil((async()=>{const keys=await caches.keys(); await Promise.all(keys.map(k=>caches.delete(k))); await self.clients.claim();})());
});
self.addEventListener('message', event => { if(event.data && event.data.type==='SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch', event => {
  const req=event.request; if(req.method!=='GET') return;
  event.respondWith(fetch(req,{cache:'no-store'}).catch(()=>new Response('離線狀態，請重新整理。',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}})));
});
