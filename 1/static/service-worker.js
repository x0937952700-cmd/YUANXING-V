const CACHE_VERSION = 'yuanxing-v414-static-css-icons';
const STATIC_ALLOW = [/\/static\/css\//, /\/static\/icons\//, /\/static\/favicon\.png$/];
self.addEventListener('install', event => { self.skipWaiting(); });
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.method !== 'GET' || url.pathname.startsWith('/api/')) return;
  if (!STATIC_ALLOW.some(re => re.test(url.pathname))) return;
  event.respondWith(caches.open(CACHE_VERSION).then(cache => cache.match(req).then(hit => hit || fetch(req, {cache:'no-store'}).then(res => { cache.put(req, res.clone()); return res; }))));
});
