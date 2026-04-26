(() => {
  const PWA_VERSION = 'fix112-old-function-speed-purge';
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
  if('serviceWorker' in navigator){ window.addEventListener('load',()=>{ navigator.serviceWorker.register(`/sw.js?v=${PWA_VERSION}`,{scope:'/'}).then(reg=>{ reg.update(); if(reg.waiting) reg.waiting.postMessage({type:'SKIP_WAITING'}); reg.addEventListener('updatefound',()=>{ const worker=reg.installing; if(!worker) return; worker.addEventListener('statechange',()=>{ if(worker.state==='installed'&&navigator.serviceWorker.controller) worker.postMessage({type:'SKIP_WAITING'}); }); }); }).catch(err=>console.warn('PWA service worker 註冊失敗',err)); }); }
  window.addEventListener('load',()=>{ if(/iphone|ipad|ipod/i.test(navigator.userAgent) && !isStandalone()){ const btn=ensureInstallButton(); btn.textContent='加入主畫面'; btn.classList.remove('hidden'); } });
})();

/* FIX112: remove stale UI caches left by older service workers */
(() => {
  const PWA_VERSION_FIX112 = 'fix112-old-function-speed-purge';
  try {
    if ('caches' in window) {
      caches.keys().then(keys => Promise.all(keys.filter(k => /yuanxing-pwa-|fix10|fix11|fix9/i.test(k) && !k.includes(PWA_VERSION_FIX112)).map(k => caches.delete(k)))).catch(()=>{});
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(reg => { try { reg.update(); } catch(_){} })).catch(()=>{});
    }
  } catch(_) {}
})();
