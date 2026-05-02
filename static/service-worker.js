// CLEAN_EVENTS_V28_EVENT_COMPLETE: disable PWA cache and unregister old workers.
const YX_SW_VERSION = 'clean-events-v28-event-complete';
self.addEventListener('install', event => { self.skipWaiting(); });
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    if (self.registration && self.registration.unregister) await self.registration.unregister();
    const clientsList = await self.clients.matchAll({type:'window', includeUncontrolled:true});
    clientsList.forEach(c => c.navigate(c.url));
  })());
});
self.addEventListener('fetch', event => { event.respondWith(fetch(event.request)); });
