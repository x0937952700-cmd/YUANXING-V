(() => {
  const PWA_VERSION = 'stable-v9-fast-sql-cache';
  if('serviceWorker' in navigator){
    window.addEventListener('load',()=>{
      caches && caches.keys && caches.keys().then(keys=>Promise.all(keys.map(k=>caches.delete(k)))).catch(()=>{});
      navigator.serviceWorker.register(`/sw.js?v=${PWA_VERSION}`,{scope:'/'}).then(reg=>{reg.update().catch(()=>{}); if(reg.waiting)reg.waiting.postMessage({type:'SKIP_WAITING'});}).catch(()=>{});
    });
  }
})();
