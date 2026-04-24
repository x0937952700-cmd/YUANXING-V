(() => {
  const PWA_VERSION = '12389';
  let deferredInstallPrompt = null;

  function ensureInstallButton() {
    let btn = document.getElementById('pwa-install-btn');
    if (btn) return btn;
    btn = document.createElement('button');
    btn.id = 'pwa-install-btn';
    btn.type = 'button';
    btn.className = 'pwa-install-btn hidden';
    btn.textContent = '安裝 App';
    btn.setAttribute('aria-label', '安裝沅興木業 App 到主畫面');
    document.body.appendChild(btn);
    btn.addEventListener('click', async () => {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        try { await deferredInstallPrompt.userChoice; } catch (err) {}
        deferredInstallPrompt = null;
        btn.classList.add('hidden');
      } else if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
        alert('iPhone 安裝方式：點 Safari 下方分享按鈕 → 加入主畫面。');
      }
    });
    return btn;
  }

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    if (!isStandalone()) ensureInstallButton().classList.remove('hidden');
  });

  window.addEventListener('appinstalled', () => {
    const btn = document.getElementById('pwa-install-btn');
    if (btn) btn.classList.add('hidden');
    deferredInstallPrompt = null;
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(`/sw.js?v=${PWA_VERSION}`, { scope: '/' })
        .then((registration) => {
          if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          registration.addEventListener('updatefound', () => {
            const worker = registration.installing;
            if (!worker) return;
            worker.addEventListener('statechange', () => {
              if (worker.state === 'installed' && navigator.serviceWorker.controller) worker.postMessage({ type: 'SKIP_WAITING' });
            });
          });
        })
        .catch((err) => console.warn('PWA service worker 註冊失敗', err));
    });
  }

  window.addEventListener('load', () => {
    const isiOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isiOS && !isStandalone()) {
      const btn = ensureInstallButton();
      btn.textContent = '加入主畫面';
      btn.classList.remove('hidden');
    }
  });
})();


function calcVolume(expr){
    let total = 0;
    expr.split('+').forEach(p=>{
        p = p.trim();
        let m = p.match(/(\d+)x(\d+)/);
        if(m){
            total += parseInt(m[1]) * parseInt(m[2]);
        }
    });
    return total;
}


function highlightWarehouse(cellId){
    const el = document.getElementById(cellId);
    if(!el) return;
    el.style.transition = "0.3s";
    el.style.background = "#ffeb3b";
    setTimeout(()=>{ el.style.background = ""; }, 1500);
}
