const CACHE_VERSION = 'full-master-v52-products-ship-warehouse-real-loaded-html-js-css-app-writeback';
const STATIC_CACHE = `yuanxing-static-${CACHE_VERSION}`;

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith('yuanxing-') && key !== STATIC_CACHE)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'CLEAR_YX_CACHES') {
    event.waitUntil(
      caches.keys().then(keys => Promise.all(keys
        .filter(key => key.startsWith('yuanxing-') && key !== STATIC_CACHE)
        .map(key => caches.delete(key))))
    );
  }
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // V26: versioned static files are allowed to use cache. This preserves the app.py
  // long-cache headers instead of forcing every page switch to re-download CSS/JS/icons.
  if (url.pathname.startsWith('/static/')) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(cache =>
        cache.match(request).then(cached => {
          if (cached) return cached;
          return fetch(request).then(response => {
            if (response && response.ok) cache.put(request, response.clone());
            return response;
          });
        })
      )
    );
    return;
  }

  // HTML and API must stay fresh.
  if (url.pathname.startsWith('/api/') || request.mode === 'navigate' || url.pathname === '/sw.js') {
    event.respondWith(fetch(request, { cache: 'no-store' }));
  }
});
