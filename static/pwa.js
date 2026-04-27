(() => {
  const PWA_VERSION = 'fix142-readme-implementation-audit-actions';
  const VERSION_KEY = 'YX_PWA_VERSION';
  const RELOAD_KEY = 'YX_FIX137_RELOADED';
  let deferredInstallPrompt = null;

  async function clearAllCaches() {
    try {
      if (!window.caches) return;
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    } catch (_) {}
  }

  async function clearCachesOnlyWhenVersionChanged(){
    try {
      const last = localStorage.getItem(VERSION_KEY);
      if (last === PWA_VERSION) return false;
      await clearAllCaches();
      localStorage.setItem(VERSION_KEY, PWA_VERSION);
      sessionStorage.removeItem(RELOAD_KEY);
      return true;
    } catch (_) {
      await clearAllCaches();
      return true;
    }
  }

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

  window.addEventListener('load', async()=>{
    const versionChanged = await clearCachesOnlyWhenVersionChanged();
    if('serviceWorker' in navigator){
      try {
        const reg = await navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(PWA_VERSION)}`,{scope:'/'});
        if(reg.waiting) reg.waiting.postMessage({type:'SKIP_WAITING'});
        if(versionChanged && reg.active) reg.active.postMessage({type:'CLEAR_CACHES'});
        await reg.update().catch(()=>{});
      } catch(err) { console.warn('PWA service worker 更新失敗', err); }
      navigator.serviceWorker.addEventListener('controllerchange',()=>{
        if(!sessionStorage.getItem(RELOAD_KEY)){
          sessionStorage.setItem(RELOAD_KEY,'1');
          location.reload();
        }
      });
    }
    if(/iphone|ipad|ipod/i.test(navigator.userAgent) && !isStandalone()){ const btn=ensureInstallButton(); btn.textContent='加入主畫面'; btn.classList.remove('hidden'); }
  });
})();
