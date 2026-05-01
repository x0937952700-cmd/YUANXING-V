self.addEventListener('install',event=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const k of await caches.keys()) await caches.delete(k); await self.clients.claim();})()));
self.addEventListener('fetch',event=>{});
