// CLEAN ROUTER V13: unregister old PWA caches.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()));
}
if (window.caches) caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
