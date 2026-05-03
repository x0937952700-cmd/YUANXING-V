(() => {
  const PWA_VERSION = 'full-master-v28-real-loaded-html-js-css-audit';
  let deferredInstallPrompt = null;
  function ensureInstallButton(){
    let btn=document.getElementById('pwa-install-btn');
    if(btn) return btn;
    btn=document.createElement('button');
    btn.id='pwa-install-btn'; btn.type='button'; btn.className='pwa-install-btn hidden'; btn.textContent='安裝 App';
    document.body.appendChild(btn);
    btn.addEventListener('click',async()=>{
      if(deferredInstallPrompt){ deferredInstallPrompt.prompt(); try{await deferredInstallPrompt.userChoice;}catch(_){} deferredInstallPrompt=null; btn.classList.add('hidden'); }
      else if(/iphone|ipad|ipod/i.test(navigator.userAgent)){ alert('iPhone 安裝方式：點 Safari 下方分享按鈕 → 加入主畫面。'); }
    });
    return btn;
  }
  function isStandalone(){ return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone===true; }
  window.addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); deferredInstallPrompt=e; if(!isStandalone()) ensureInstallButton().classList.remove('hidden'); });
  window.addEventListener('appinstalled',()=>{ const btn=document.getElementById('pwa-install-btn'); if(btn) btn.classList.add('hidden'); deferredInstallPrompt=null; });
  if('serviceWorker' in navigator){
    window.addEventListener('load',()=>{
      window.__YX_PWA_VERSION__=PWA_VERSION;
      const cacheKey='yx-pwa-cache-cleared-version';
      const shouldClear=localStorage.getItem(cacheKey)!==PWA_VERSION;
      const clearOnce=()=>{
        if(!shouldClear) return Promise.resolve();
        try {
          return caches?.keys?.().then(keys=>Promise.all(keys.filter(k=>String(k).startsWith('yuanxing-')).map(k=>caches.delete(k)))).then(()=>{localStorage.setItem(cacheKey,PWA_VERSION);});
        } catch(_){ return Promise.resolve(); }
      };
      clearOnce().finally(()=>{
        navigator.serviceWorker.register(`/sw.js?v=${PWA_VERSION}`,{scope:'/'}).then(reg=>{
          try{ if(shouldClear) (reg.active||reg.waiting||reg.installing)?.postMessage({type:'CLEAR_YX_CACHES'}); }catch(_){}
          if(reg.waiting) reg.waiting.postMessage({type:'SKIP_WAITING'});
          if (shouldClear) reg.update().catch(()=>{});
        }).catch(err=>console.warn('PWA service worker 註冊失敗',err));
      });
    });
  }
  window.addEventListener('load',()=>{ if(/iphone|ipad|ipod/i.test(navigator.userAgent) && !isStandalone()){ const btn=ensureInstallButton(); btn.textContent='加入主畫面'; btn.classList.remove('hidden'); } });
})();
