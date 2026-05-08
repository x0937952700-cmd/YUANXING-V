/* 沅興木業 V124: safe PWA cache registration.
   Only static CSS/icons are cached by service-worker.js. API/data requests are never cached. */
(function(){
  'use strict';
  const root = window.YXPWA || {};
  root.version = '124-longpress-cache';
  root.enabled = true;
  root.policy = 'static-css-icons-only-no-api-cache';
  async function register(){
    try{
      if(!('serviceWorker' in navigator)) return false;
      const reg = await navigator.serviceWorker.register('/static/service-worker.js?v=124', {scope:'/'});
      root.registration = reg;
      return true;
    }catch(e){ root.error = e && e.message; return false; }
  }
  root.register = register;
  window.YXPWA = root;
  window.addEventListener('load', function(){ setTimeout(register, 1200); }, {once:true});
})();
