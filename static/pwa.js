(() => {
  const PWA_VERSION = 'fix136-label-text-master-hardlock';
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
      navigator.serviceWorker.register(`/sw.js?v=${PWA_VERSION}`,{scope:'/'}).then(reg=>{
        const key = `YX_SW_LAST_UPDATE_${PWA_VERSION}`;
        const now = Date.now();
        const last = Number(localStorage.getItem(key) || 0);
        // FIX110：不要每次開頁都 reg.update()，避免手機/Render 每頁都多一次網路檢查。
        if(!last || now - last > 6 * 60 * 60 * 1000){
          localStorage.setItem(key, String(now));
          reg.update().catch(()=>{});
        }
        const clearKey = `YX_CLEAR_CACHE_DONE_${PWA_VERSION}`;
        if(!localStorage.getItem(clearKey)){
          try { (reg.active || reg.waiting || reg.installing)?.postMessage({type:'CLEAR_YX_CACHES'}); } catch(_){}
          localStorage.setItem(clearKey, '1');
        }
        if(reg.waiting) reg.waiting.postMessage({type:'SKIP_WAITING'});
        reg.addEventListener('updatefound',()=>{
          const worker=reg.installing; if(!worker) return;
          worker.addEventListener('statechange',()=>{ if(worker.state==='installed'&&navigator.serviceWorker.controller) worker.postMessage({type:'SKIP_WAITING'}); });
        });
      }).catch(err=>console.warn('PWA service worker 註冊失敗',err));
    });
  }
  window.addEventListener('load',()=>{ if(/iphone|ipad|ipod/i.test(navigator.userAgent) && !isStandalone()){ const btn=ensureInstallButton(); btn.textContent='加入主畫面'; btn.classList.remove('hidden'); } });
})();
