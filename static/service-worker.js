/* 沅興木業 PWA Service Worker - version 12395
   設計原則：可安裝、圖示可快取，但 HTML / JS / CSS / API 永遠優先抓最新，避免舊畫面卡住。 */
const YX_PWA_VERSION = '12395';
const STATIC_CACHE = `yuanxing-pwa-icons-${YX_PWA_VERSION}`;
const ICON_ASSETS = [
  '/static/manifest.webmanifest',
  '/static/favicon.png',
  '/static/icons/icon-192x192.png',
  '/static/icons/icon-512x512.png',
  '/static/icons/icon-maskable-192x192.png',
  '/static/icons/icon-maskable-512x512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(ICON_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key.startsWith('yuanxing-pwa-') && key !== STATIC_CACHE)
        .map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/static/icons/') || url.pathname === '/static/favicon.png' || url.pathname.endsWith('manifest.webmanifest')) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req, { cache: 'reload' }).then((res) => {
        const copy = res.clone();
        caches.open(STATIC_CACHE).then((cache) => cache.put(req, copy));
        return res;
      }))
    );
    return;
  }

  event.respondWith(fetch(req, { cache: 'no-store' }).catch(() => caches.match(req)));
});


function calcVolume(expr){
    let total = 0;
    expr.split('+').forEach(p=>{
        p = p.trim();
        let m = p.match(/(\d+)x(\d+)/);
        if(m){
            total += parseInt(m[1]) * parseInt(m[2]);
        }
    });
    return total;
}


function highlightWarehouse(cellId){
    const el = document.getElementById(cellId);
    if(!el) return;
    el.style.transition = "0.3s";
    el.style.background = "#ffeb3b";
    setTimeout(()=>{ el.style.background = ""; }, 1500);
}
