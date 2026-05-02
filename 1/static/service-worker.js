const CACHE_VERSION = 'full-master-v19-clean-real-fix';
self.addEventListener('install', event => { self.skipWaiting(); event.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => { event.respondWith(fetch(event.request, {cache:'no-store'}).catch(() => fetch(event.request))); });
