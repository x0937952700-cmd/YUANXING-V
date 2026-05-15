/* 沅興木業 V406: safe PWA cache registration.
   Only static CSS/icons are cached by service-worker.js. API/data requests are never cached. */
(function(){
  'use strict';
  const root = window.YXPWA || {};
  root.version = window.__YX_STATIC_VERSION__ || '119-v520_final_ship_cache_align_pack30';
  root.enabled = true;
  root.policy = 'static-css-icons-only-no-api-cache';

  function cleanupStaleVersionCaches(){
    const current = String(window.__YX_STATIC_VERSION__ || root.version || '');
    try{
      const prev = localStorage.getItem('yx_app_static_version');
      if(prev && prev !== current){
        try{ if(window.caches && caches.keys) caches.keys().then(keys => keys.filter(k => /^yuanxing-v/.test(k) && k.indexOf('v520') < 0).forEach(k => caches.delete(k))); }catch(_e){}
        try{
          const removePrefixes = ['ship_customers_','ship_items_','customer_blocks_','yx_v406_cache_products_'];
          const removeKeys=[];
          for(let i=0;i<localStorage.length;i++){
            const k=localStorage.key(i)||'';
            if(removePrefixes.some(prefix => k.startsWith(prefix))) removeKeys.push(k);
          }
          removeKeys.forEach(k => { try{ localStorage.removeItem(k); }catch(_e){} });
        }catch(_e){}
        try{ sessionStorage.removeItem('yx_v149_cache_summary_at'); }catch(_e){}
      }
      localStorage.setItem('yx_app_static_version', current);
    }catch(_e){}
  }
  async function register(){
    try{
      if(!('serviceWorker' in navigator)) return false;
      const ver = encodeURIComponent(window.__YX_STATIC_VERSION__ || root.version || Date.now());
      const reg = await navigator.serviceWorker.register('/sw.js?v=' + ver, {scope:'/'});
      root.registration = reg;
      return true;
    }catch(e){ root.error = e && e.message; return false; }
  }
  function scheduleRegister(){
    try{ (window.requestIdleCallback || function(fn){ return window.requestAnimationFrame(fn); })(register); }catch(_e){ register(); }
  }
  cleanupStaleVersionCaches();
  root.register = register;
  window.YXPWA = root;
  // V406: base.html injects this file after window load. If load already fired, register immediately.
  if(document.readyState === 'complete' || document.readyState === 'interactive') scheduleRegister();
  else window.addEventListener('load', scheduleRegister, {once:true});
})();
