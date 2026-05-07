/* 沅興木業 V111 inert service worker: no cache, no fetch handler, no reload message. */
self.addEventListener('install', event => { self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });
