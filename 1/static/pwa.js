/* 沅興木業 V403: safe PWA cache registration.
   Only static CSS/icons are cached by service-worker.js. API/data requests are never cached. */
(function(){
  'use strict';
  const root = window.YXPWA || {};
  root.version = window.__YX_STATIC_VERSION__ || '119-v403-status-cleanup-sync';
  root.enabled = true;
  root.policy = 'static-css-icons-only-no-api-cache';
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
  root.register = register;
  window.YXPWA = root;
  // V403: base.html injects this file after window load. If load already fired, register immediately.
  if(document.readyState === 'complete' || document.readyState === 'interactive') scheduleRegister();
  else window.addEventListener('load', scheduleRegister, {once:true});
})();
