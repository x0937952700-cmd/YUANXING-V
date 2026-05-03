(() => {
  const PWA_VERSION = 'full-master-v45_real_mainfile_repaired';
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
      window.__YX_PWA_VERSION__='full-master-v45_real_mainfile_repaired';
      try { caches?.keys?.().then(keys=>Promise.all(keys.filter(k=>String(k).startsWith('yuanxing-')).map(k=>caches.delete(k)))); } catch(_){}
      navigator.serviceWorker.getRegistrations?.().then(regs=>{
        regs.forEach(r=>{ try{ (r.active||r.waiting||r.installing)?.postMessage({type:'CLEAR_YX_CACHES'}); }catch(_){} });
      }).finally(()=>{
        navigator.serviceWorker.register(`/sw.js?v=${PWA_VERSION}`,{scope:'/'}).then(reg=>{
          try{ (reg.active||reg.waiting||reg.installing)?.postMessage({type:'CLEAR_YX_CACHES'}); }catch(_){}
          if(reg.waiting) reg.waiting.postMessage({type:'SKIP_WAITING'});
          reg.update().catch(()=>{});
        }).catch(err=>console.warn('PWA service worker 註冊失敗',err));
      });
    });
  }
  window.addEventListener('load',()=>{ if(/iphone|ipad|ipod/i.test(navigator.userAgent) && !isStandalone()){ const btn=ensureInstallButton(); btn.textContent='加入主畫面'; btn.classList.remove('hidden'); } });
})();


/* ===== V45 global page undo: every page can pick one of latest 10 actions ===== */
(function(){
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];});}
  async function api(url,opt){const res=await fetch(url,{credentials:'same-origin',cache:'no-store',...(opt||{}),headers:{'Content-Type':'application/json',...((opt&&opt.headers)||{})}});const t=await res.text();let d={};try{d=t?JSON.parse(t):{};}catch(e){d={success:false,error:t};}if(!res.ok||d.success===false)throw new Error(d.error||d.message||'請求失敗');return d;}
  function moduleEntity(){var m=(document.body&&document.body.dataset&&document.body.dataset.module)||''; if(m==='orders')return'orders'; if(m==='master_order')return'master_orders'; if(m==='inventory')return'inventory'; if(m==='ship')return'shipping_records'; if(m==='warehouse')return'warehouse_cells'; return'';}
  function modal(){var m=document.getElementById('yx-v45-undo-modal'); if(m)return m; m=document.createElement('div');m.id='yx-v45-undo-modal';m.className='modal hidden';m.innerHTML='<div class="modal-card glass yx-v44-undo-card"><div class="modal-head"><div class="section-title">復原前一步操作</div><button class="ghost-btn small-btn" type="button" data-yx45-close-undo>關閉</button></div><div class="small-note">目前頁面最近 10 筆操作，點哪一筆就還原哪一筆。</div><div id="yx-v45-undo-list" class="card-list"><div class="empty-state-card compact-empty">載入中…</div></div></div>';document.body.appendChild(m);m.addEventListener('click',function(e){if(e.target===m||e.target.closest('[data-yx45-close-undo]'))m.classList.add('hidden');});return m;}
  async function openUndo(){var m=modal(),box=document.getElementById('yx-v45-undo-list');m.classList.remove('hidden');box.innerHTML='<div class="empty-state-card compact-empty">載入中…</div>';try{var ent=moduleEntity();var url='/api/audit-trails?limit=80&undo=1'+(ent?'&entity_type='+encodeURIComponent(ent):'');var d=await api(url);var rows=(d.items||[]).filter(function(x){return x.action_type!=='undo'&&x.entity_type!=='undo';}).slice(0,10);box.innerHTML=rows.length?rows.map(function(x){var label=[x.created_at||'',x.action_label||x.action_type||'',x.entity_label||x.entity_type||'',x.summary||x.entity_key||''].filter(Boolean).join('｜');return'<button type="button" class="deduct-card yx-v44-undo-item" data-yx45-undo-id="'+esc(x.id)+'"><strong>'+esc(label)+'</strong><div class="small-note">'+esc(x.username||'')+'</div></button>';}).join(''):'<div class="empty-state-card compact-empty">目前沒有可還原操作</div>';}catch(e){box.innerHTML='<div class="empty-state-card compact-empty">'+esc(e.message||'讀取失敗')+'</div>';}}
  document.addEventListener('click',async function(ev){var item=ev.target&&ev.target.closest&&ev.target.closest('[data-yx45-undo-id]'); if(item){ev.preventDefault();ev.stopPropagation(); if(ev.stopImmediatePropagation)ev.stopImmediatePropagation();try{var d=await api('/api/undo-last',{method:'POST',body:JSON.stringify({id:item.dataset.yx45UndoId})}); if(window.toast)window.toast(d.message||'已還原','ok'); else alert(d.message||'已還原'); setTimeout(function(){location.reload();},250);}catch(e){if(window.toast)window.toast(e.message||'還原失敗','error'); else alert(e.message||'還原失敗');}return;} var b=ev.target&&ev.target.closest&&ev.target.closest('#yx-global-page-undo-btn,.yx-page-undo-btn,#yx-page-undo-btn'); if(!b)return; ev.preventDefault();ev.stopPropagation(); if(ev.stopImmediatePropagation)ev.stopImmediatePropagation(); openUndo();},true);
})();
/* ===== END V45 global page undo ===== */
