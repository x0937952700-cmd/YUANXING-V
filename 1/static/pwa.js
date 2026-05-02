(() => {
  const PWA_VERSION = 'v26-one-table-no-legacy-action';
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
  async function purgeOldPwa(){
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister().catch(()=>{})));
      }
    } catch(_e) {}
    try {
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.filter(k => k.startsWith('yuanxing-') || k.includes('v26-one-table-no-legacy-action') || k.includes('v26-one-table-no-legacy-action')).map(k => caches.delete(k).catch(()=>{})));
      }
    } catch(_e) {}
    try { localStorage.setItem('YX_PWA_PURGED_VERSION', PWA_VERSION); } catch(_e) {}
  }
  window.addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); deferredInstallPrompt=e; if(!isStandalone()) ensureInstallButton().classList.remove('hidden'); });
  window.addEventListener('appinstalled',()=>{ const btn=document.getElementById('pwa-install-btn'); if(btn) btn.classList.add('hidden'); deferredInstallPrompt=null; });
  // v26-one-table-no-legacy-action：先完全停用舊 Service Worker，避免舊版 HTML/JS/CSS 從 PWA 快取跳回來。
  window.addEventListener('load',()=>{
    purgeOldPwa();
    if(/iphone|ipad|ipod/i.test(navigator.userAgent) && !isStandalone()){ const btn=ensureInstallButton(); btn.textContent='加入主畫面'; btn.classList.remove('hidden'); }
  });
})();
