(() => {
  'use strict';
  const VERSION='mainfile-final-ui-buttons-warehouse-mainfile-20260516x';
  const KEY='YX_FORCE_CACHE_RESET_DONE_'+VERSION;
  async function run(){
    try { localStorage.removeItem('yx_diagnostics_events_v1'); } catch(_) {}
    if (localStorage.getItem(KEY)) return;
    try { if (window.caches) { const keys=await caches.keys(); await Promise.all(keys.map(k=>caches.delete(k))); } } catch(_) {}
    try {
      if (navigator.serviceWorker) {
        const regs=await navigator.serviceWorker.getRegistrations();
        regs.forEach(r=>{ try{(r.active||r.waiting||r.installing)?.postMessage({type:'CLEAR_YX_CACHES'});}catch(_){}});
      }
    } catch(_) {}
    try { localStorage.setItem(KEY,'1'); } catch(_) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, {once:true}); else run();
})();
