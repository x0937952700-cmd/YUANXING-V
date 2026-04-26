(function(){
  'use strict';
  const PWA_VERSION = 'fix113-consolidated-latest-master';
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function(){
      navigator.serviceWorker.register('/static/service-worker.js?v=' + PWA_VERSION).then(function(reg){
        try { reg.update(); } catch(_e) {}
      }).catch(function(){});
      try {
        caches.keys().then(keys => Promise.all(keys.filter(k => !k.includes(PWA_VERSION)).map(k => caches.delete(k))));
      } catch(_e) {}
    }, {once:true});
  }
})();
