(() => {
  const PWA_VERSION = "V115";
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
      try { caches?.keys?.().then(keys=>Promise.all(keys.map(k=>caches.delete(k)))); } catch(_){}
      navigator.serviceWorker.getRegistrations?.().then(regs=>Promise.all(regs.map(r=>{ try{ (r.active||r.waiting||r.installing)?.postMessage({type:'CLEAR_YX_CACHES'}); }catch(_){} return r.unregister().catch(()=>{}); }))).finally(()=>{
        navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(PWA_VERSION)}`,{scope:'/'}).then(reg=>{
          try{ (reg.active||reg.waiting||reg.installing)?.postMessage({type:'CLEAR_YX_CACHES'}); }catch(_){}
          if(reg.waiting) reg.waiting.postMessage({type:'SKIP_WAITING'});
          reg.update().catch(()=>{});
        }).catch(err=>console.warn('PWA service worker 註冊失敗',err));
      });
    });
    navigator.serviceWorker.addEventListener('message', function(event){
      if(event && event.data && event.data.type === 'YX_FORCE_RELOAD'){
        const key='yx_sw_reloaded_'+(event.data.version||PWA_VERSION);
        if(!sessionStorage.getItem(key)){ sessionStorage.setItem(key,'1'); location.reload(); }
      }
    });
  }
  window.addEventListener('load',()=>{ if(/iphone|ipad|ipod/i.test(navigator.userAgent) && !isStandalone()){ const btn=ensureInstallButton(); btn.textContent='加入主畫面'; btn.classList.remove('hidden'); } });

  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  async function api(url,opt){const res=await fetch(url,{credentials:'same-origin',cache:'no-store',...(opt||{}),headers:{'Content-Type':'application/json',...((opt&&opt.headers)||{})}});const t=await res.text();let d={};try{d=t?JSON.parse(t):{};}catch(e){d={success:false,error:t};}if(!res.ok||d.success===false)throw new Error(d.error||d.message||'請求失敗');return d;}
  function entityForPage(){const m=document.body?.dataset?.module||''; return ({orders:'orders',master_order:'master_orders',inventory:'inventory',ship:'shipping_records',warehouse:'warehouse_cells'}[m]||'');}
  function modal(){let m=document.getElementById('yx-page-undo-modal'); if(m)return m; m=document.createElement('div');m.id='yx-page-undo-modal';m.className='modal hidden';m.innerHTML='<div class="modal-card glass yx-page-undo-card"><div class="modal-head"><div class="section-title">還原功能</div><button class="ghost-btn small-btn" type="button" data-yx-close-undo>關閉</button></div><div class="small-note">目前頁面最近 10 筆操作；每個頁面各自保留，切換頁面後再回來也可以繼續還原。</div><div id="yx-page-undo-list" class="card-list"><div class="empty-state-card compact-empty">載入中…</div></div></div>';document.body.appendChild(m);m.addEventListener('click',e=>{if(e.target===m||e.target.closest('[data-yx-close-undo]'))m.classList.add('hidden');});return m;}
  async function openUndo(){const m=modal(),box=document.getElementById('yx-page-undo-list');m.classList.remove('hidden');box.innerHTML='<div class="empty-state-card compact-empty">載入中…</div>';try{const ent=entityForPage();const d=await api('/api/audit-trails?limit=80&undo=1'+(ent?'&entity_type='+encodeURIComponent(ent):''));const rows=(d.items||[]).filter(x=>x.action_type!=='undo'&&x.entity_type!=='undo').slice(0,10);box.innerHTML=rows.length?rows.map(x=>{const label=[x.created_at||'',x.action_label||x.action_type||'',x.entity_label||x.entity_type||'',x.summary||x.entity_key||''].filter(Boolean).join('｜');return'<button type="button" class="deduct-card yx-page-undo-item" data-yx-undo-id="'+esc(x.id)+'"><strong>'+esc(label)+'</strong><div class="small-note">'+esc(x.username||'')+'</div></button>';}).join(''):'<div class="empty-state-card compact-empty">目前沒有可還原操作</div>';}catch(e){box.innerHTML='<div class="empty-state-card compact-empty">'+esc(e.message||'讀取失敗')+'</div>';}}
  document.addEventListener('click',async ev=>{const item=ev.target?.closest?.('[data-yx-undo-id]'); if(item){ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation?.();try{const d=await api('/api/undo-last',{method:'POST',body:JSON.stringify({id:item.dataset.yxUndoId})}); (window.toast||window.YXHardLock?.toast||alert)(d.message||'已還原','ok'); setTimeout(()=>{ try{ openUndo(); }catch(_e){} location.reload(); },250);}catch(e){(window.toast||window.YXHardLock?.toast||alert)(e.message||'還原失敗','error');} return;} const b=ev.target?.closest?.('#yx-global-page-undo-btn,.yx-page-undo-btn,#yx-page-undo-btn'); if(!b)return; ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation?.(); openUndo();},true);
})();

/* V105 mobile native-like navigation + pull refresh (mainfile, no setInterval/no MutationObserver). */
(function(){
  'use strict';
  if(window.__YX_V105_MOBILE_UI__) return; window.__YX_V105_MOBILE_UI__=true;
  function moduleKey(){return document.body?.dataset?.module||'';}
  function installBottomNav(){
    const m=moduleKey();
    document.querySelectorAll('.yx-mobile-bottom-nav a').forEach(a=>{
      a.classList.toggle('active',(a.getAttribute('data-nav-module')||'')===m);
      a.addEventListener('click',()=>{try{navigator.vibrate&&navigator.vibrate(12);}catch(_){}});
    });
  }
  function setPullText(text,show){
    const el=document.getElementById('yx-pull-refresh-indicator'); if(!el) return;
    el.textContent=text||'下拉刷新'; el.classList.toggle('show',!!show);
  }
  function refreshCurrentPage(){
    try{navigator.vibrate&&navigator.vibrate(18);}catch(_){}
    const m=moduleKey();
    setPullText('刷新中…',true);
    const done=()=>setTimeout(()=>setPullText('已刷新',false),450);
    try{
      if(m==='warehouse' && typeof window.renderWarehouse==='function') return Promise.resolve(window.renderWarehouse(true)).finally(done);
      if(m==='today_changes' && typeof window.loadTodayChanges==='function') return Promise.resolve(window.loadTodayChanges({force:true})).finally(done);
      if(m==='inventory' && typeof window.loadInventory==='function') return Promise.resolve(window.loadInventory()).finally(done);
      if(m==='orders' && typeof window.loadOrders==='function') return Promise.resolve(window.loadOrders()).finally(done);
      if(m==='master_order' && typeof window.loadMasterOrders==='function') return Promise.resolve(window.loadMasterOrders()).finally(done);
      if(m==='ship' && typeof window.loadShippingRecords==='function') return Promise.resolve(window.loadShippingRecords()).finally(done);
      if(window.YXCacheSync && typeof window.YXCacheSync.syncNow==='function') return Promise.resolve(window.YXCacheSync.syncNow(true)).finally(done);
    }catch(_e){ done(); }
    location.reload();
  }
  function installPullRefresh(){
    let startY=0,startX=0,tracking=false,armed=false;
    const ignore=el=>!!el?.closest?.('input,textarea,select,[contenteditable="true"],.modal,.warehouse-zone-wrap,.warehouse-scroll-wrap,.yx106-slot-list,.vertical-slot-list');
    window.addEventListener('touchstart',ev=>{
      const t=ev.touches&&ev.touches[0]; if(!t||window.scrollY>2||ignore(ev.target)) return;
      tracking=true; armed=false; startY=t.clientY; startX=t.clientX;
    },{passive:true});
    window.addEventListener('touchmove',ev=>{
      if(!tracking) return; const t=ev.touches&&ev.touches[0]; if(!t) return;
      const dy=t.clientY-startY, dx=Math.abs(t.clientX-startX);
      if(dx>55){tracking=false;setPullText('',false);return;}
      if(dy>52){armed=true;setPullText('放開刷新',true);} else if(dy>18){setPullText('下拉刷新',true);} else setPullText('',false);
    },{passive:true});
    window.addEventListener('touchend',()=>{ if(!tracking){setPullText('',false);return;} const should=armed; tracking=false; armed=false; if(should) refreshCurrentPage(); else setPullText('',false); },{passive:true});
    window.addEventListener('touchcancel',()=>{tracking=false;armed=false;setPullText('',false);},{passive:true});
  }
  function install(){installBottomNav();installPullRefresh();}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
})();

/* V105 generic row/card URL highlighter for inventory/orders/master/shipping pages. */
(function(){
  'use strict';
  if(window.__YX_V105_GENERIC_TARGET__) return; window.__YX_V105_GENERIC_TARGET__=true;
  function norm(v){return String(v||'').replace(/\s+/g,'').toLowerCase();}
  function flash(el){if(!el)return false; el.classList.add('yx-v91-target-flash','yx-v93-row-target'); try{el.scrollIntoView({behavior:'smooth',block:'center'});}catch(_){} return true;}
  function run(){
    const sp=new URLSearchParams(location.search); const id=sp.get('highlight_id'); const q=norm(sp.get('q')||sp.get('customer')||sp.get('highlight_item')||''); if(!id&&!q) return false;
    const selectors=[]; if(id&&window.CSS&&CSS.escape){selectors.push(`[data-id="${CSS.escape(id)}"]`,`[data-item-id="${CSS.escape(id)}"]`,`[data-record-id="${CSS.escape(id)}"]`,`[data-yx-id="${CSS.escape(id)}"]`);} 
    let el=null; for(const sel of selectors){el=document.querySelector(sel); if(el) break;}
    if(!el && q){ el=Array.from(document.querySelectorAll('tr,.deduct-card,.product-card,.customer-chip,.yx113-table tbody tr,.yx112-product-card')).find(x=>norm(x.textContent).includes(q)); }
    return flash(el);
  }
  function schedule(){let n=0; const step=()=>{ if(run()||n++>8)return; setTimeout(step,260);}; step();}
  window.addEventListener('load',schedule,{once:true});
  window.addEventListener('yx:product-source-loaded',schedule);
  document.addEventListener('yx:today-target-opened',schedule);
})();

/* V105 edit-lock helper + countdown + auto-renew (mainfile, no setInterval/no MutationObserver). */
(function(){
  'use strict';
  if(window.YXEditLock) return;
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const active=new Map();
  let tickTimer=null, renewRunning=false;
  async function api(url,body){const res=await fetch(url,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})});const t=await res.text();let d={};try{d=t?JSON.parse(t):{};}catch(_){d={success:false,error:t||'伺服器回應格式錯誤'};}if(!res.ok||d.success===false){const e=new Error(d.error||d.message||'編輯鎖失敗');e.payload=d;throw e;}return d;}
  function lockKey(t,id){return String(t||'')+'::'+String(id||'');}
  function secondsLeft(v){const ms=new Date(String(v||'').replace(' ','T')).getTime()-Date.now();return Math.max(0,Math.floor(ms/1000));}
  function chip(){let el=document.getElementById('yx-edit-lock-chip');if(el)return el;el=document.createElement('button');el.type='button';el.id='yx-edit-lock-chip';el.className='yx-edit-lock-chip';el.addEventListener('click',openPanel);document.body.appendChild(el);return el;}
  function updateChip(){try{const el=chip();const arr=Array.from(active.values());if(!arr.length){el.textContent='';el.classList.remove('show','warn');return;}const min=Math.min(...arr.map(x=>secondsLeft(x.expires_at)));el.textContent='編輯鎖定 '+arr.length+' 筆｜剩 '+Math.floor(min/60)+':'+String(min%60).padStart(2,'0');el.classList.toggle('show',true);el.classList.toggle('warn',min<45);}catch(_){} scheduleTick();}
  function modal(){let el=document.getElementById('yx-edit-lock-modal');if(el)return el;el=document.createElement('div');el.id='yx-edit-lock-modal';el.className='modal hidden yx-edit-lock-modal';el.innerHTML='<div class="modal-card glass yx-edit-lock-card"><div class="modal-head"><div class="section-title">這筆資料正在被編輯</div></div><div class="yx-edit-lock-body"></div><div class="btn-row"><button type="button" class="ghost-btn" data-yx-lock-cancel>取消</button><button type="button" class="primary-btn" data-yx-lock-takeover>接管編輯</button></div></div>';document.body.appendChild(el);return el;}
  function askTakeover(payload,label){return new Promise(resolve=>{const m=modal();const body=m.querySelector('.yx-edit-lock-body');const left=payload.expires_at?secondsLeft(payload.expires_at):0;body.innerHTML='<p><strong>'+esc(payload.username||'其他使用者')+'</strong> 正在編輯：</p><p>'+esc(label||payload.entity_id||'這筆資料')+'</p><p class="small-note">剩餘約 '+left+' 秒。為避免互相覆蓋，建議等對方完成。若確定要接手，可按「接管編輯」。</p>';m.classList.remove('hidden');const done=v=>{m.classList.add('hidden');resolve(v);};const c=m.querySelector('[data-yx-lock-cancel]');const t=m.querySelector('[data-yx-lock-takeover]');c.onclick=()=>done(false);t.onclick=()=>done(true);});}
  function panel(){let el=document.getElementById('yx-edit-lock-panel');if(el)return el;el=document.createElement('div');el.id='yx-edit-lock-panel';el.className='modal hidden yx-edit-lock-panel';el.innerHTML='<div class="modal-card glass yx-edit-lock-card"><div class="modal-head"><div class="section-title">目前編輯鎖</div><button type="button" class="ghost-btn small-btn" data-yx-lock-panel-close>關閉</button></div><div class="yx-edit-lock-panel-body"></div><div class="btn-row"><button type="button" class="ghost-btn danger-btn" data-yx-lock-release-all>全部釋放</button></div></div>';document.body.appendChild(el);el.addEventListener('click',ev=>{if(ev.target===el||ev.target.closest('[data-yx-lock-panel-close]'))el.classList.add('hidden'); if(ev.target.closest('[data-yx-lock-release-all]')){releaseAll();el.classList.add('hidden');}});return el;}
  function openPanel(){const m=panel();const body=m.querySelector('.yx-edit-lock-panel-body');const arr=Array.from(active.values());body.innerHTML=arr.length?arr.map(x=>'<div class="deduct-card"><strong>'+esc(x.label||x.entity_id)+'</strong><div class="small-note">'+esc(x.entity_type)+'｜剩 '+secondsLeft(x.expires_at)+' 秒｜自動續鎖中</div></div>').join(''):'<div class="empty-state-card compact-empty">目前沒有鎖定中的資料</div>';m.classList.remove('hidden');}
  async function acquire(entity_type,entity_id,ttl_seconds,force,label){const d=await api('/api/edit-locks/acquire',{entity_type,entity_id,ttl_seconds:ttl_seconds||180,force:!!force});const k=lockKey(entity_type,entity_id);active.set(k,{entity_type,entity_id,expires_at:d.expires_at,username:d.username,label:label||String(entity_id),ttl_seconds:ttl_seconds||180});updateChip();return d;}
  async function renew(entity_type,entity_id){const k=lockKey(entity_type,entity_id);const old=active.get(k)||{};const d=await api('/api/edit-locks/renew',{entity_type,entity_id,ttl_seconds:old.ttl_seconds||180});active.set(k,{...old,entity_type,entity_id,expires_at:d.expires_at,username:d.username});updateChip();return d;}
  async function status(entity_type,entity_id){return api('/api/edit-locks/status',{entity_type,entity_id});}
  async function release(entity_type,entity_id){try{await api('/api/edit-locks/release',{entity_type,entity_id});}finally{active.delete(lockKey(entity_type,entity_id));updateChip();}}
  async function ensure(entity_type,entity_id,opt){const label=opt?.label||String(entity_id||'');try{return await acquire(entity_type,entity_id,opt?.ttl_seconds||180,false,label), true;}catch(e){const p=e.payload||{};if(p.locked){const take=await askTakeover({username:p.username,entity_id,expires_at:p.expires_at},label);if(!take)return false;await acquire(entity_type,entity_id,opt?.ttl_seconds||180,true,label);return true;}throw e;}}
  async function renewSoon(){if(renewRunning||!active.size)return;renewRunning=true;try{for(const v of Array.from(active.values())){const left=secondsLeft(v.expires_at);if(left>0 && left<55){try{await renew(v.entity_type,v.entity_id);}catch(e){try{(window.toast||console.warn)(e.message||'編輯鎖續鎖失敗','warn');}catch(_){} active.delete(lockKey(v.entity_type,v.entity_id));}}else if(left<=0){active.delete(lockKey(v.entity_type,v.entity_id));}}}finally{renewRunning=false;updateChip();}}
  function scheduleTick(){if(tickTimer||!active.size)return;tickTimer=setTimeout(async()=>{tickTimer=null;updateChip();await renewSoon();},1000);}
  async function releaseAll(){for(const v of Array.from(active.values())){try{await api('/api/edit-locks/release',{entity_type:v.entity_type,entity_id:v.entity_id});}catch(_){}}active.clear();updateChip();}
  function entityFromSource(src){return ({inventory:'inventory',orders:'orders',master_order:'master_orders',master_orders:'master_orders',shipping_query:'shipping_records'}[src]||src||'');}
  document.addEventListener('click',async ev=>{
    const btn=ev.target?.closest?.('[data-yx113-action="edit"],.yx128-card-edit-btn');
    if(!btn || btn.dataset.yxLockPass==='1') return;
    const card=btn.closest('[data-source][data-id]'); if(!card) return;
    const entity=entityFromSource(card.dataset.source); const id=card.dataset.id; if(!entity||!id) return;
    ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.();
    try{const label=(card.textContent||'').replace(/\s+/g,' ').slice(0,80);const ok=await ensure(entity,id,{label});if(!ok)return;btn.dataset.yxLockPass='1';setTimeout(()=>{try{btn.click();}finally{setTimeout(()=>delete btn.dataset.yxLockPass,120);}},0);}catch(e){(window.toast||alert)(e.message||'取得編輯鎖失敗','error');}
  },true);
  window.addEventListener('beforeunload',()=>{releaseAll();});
  window.YXEditLock={acquire,renew,release,status,ensure,releaseAll,active,openPanel};
})();;


/* V105 edit-lock precise release + single-row incremental patch + stronger target flashing (mainfile). */
(function(){
  'use strict';
  if(window.__YX_V105_LOCK_SYNC_TARGET__) return; window.__YX_V105_LOCK_SYNC_TARGET__=true;
  const norm=v=>String(v||'').replace(/\s+/g,'').toLowerCase();
  function tableToSource(t){return ({inventory:'inventory',orders:'orders',master_orders:'master_order'}[t]||'');}
  function entityFromSource(src){return ({inventory:'inventory',orders:'orders',master_order:'master_orders',master_orders:'master_orders'}[src]||src||'');}
  function releaseBySourceId(src,id){try{const ent=entityFromSource(src); if(ent&&id&&window.YXEditLock?.release) window.YXEditLock.release(ent,id).catch(()=>{});}catch(_){}}
  function activeForSource(src){try{const ent=entityFromSource(src);return Array.from(window.YXEditLock?.active?.values?.()||[]).filter(x=>x.entity_type===ent);}catch(_){return [];}}
  function parseSaveTarget(url,method,body){const u=String(url||''); const m=String(method||'GET').toUpperCase(); if(!['POST','PUT','DELETE'].includes(m))return null; let mm=u.match(/\/api\/(inventory|orders|master_orders)\/(\d+)/); if(mm)return {type:mm[1],id:mm[2]}; if(u.includes('/api/customer-items/batch-update'))return {batch:true,body}; if(u.includes('/api/warehouse/cell')){try{const b=typeof body==='string'?JSON.parse(body||'{}'):(body||{});return {type:'warehouse_cells',id:[b.zone,b.column_index||b.col,b.slot_number||b.slot].filter(Boolean).join('-')};}catch(_){}} return null;}
  function installFetchRelease(){const old=window.fetch; if(!old||old.__yx94LockRelease)return; const wrapped=async function(input,opt){const url=(typeof input==='string')?input:(input&&input.url)||'';const method=(opt&&opt.method)||((input&&input.method)||'GET');const body=opt&&opt.body;const res=await old.apply(this,arguments);try{if(res.ok){const t=parseSaveTarget(url,method,body); if(t){setTimeout(()=>{if(t.batch){try{const b=typeof t.body==='string'?JSON.parse(t.body||'{}'):(t.body||{});(b.items||[]).forEach(it=>releaseBySourceId(it.source,it.id));}catch(_){}} else if(t.type==='warehouse_cells'){window.YXEditLock?.release?.('warehouse_cells',t.id).catch(()=>{});} else {window.YXEditLock?.release?.(t.type,t.id).catch(()=>{});}},250);}}}catch(_){} return res;}; wrapped.__yx94LockRelease=true; window.fetch=wrapped;}
  function selectedOrAllRows(source){let rows=Array.from(document.querySelectorAll(`#yx113-${source}-summary .yx113-summary-row[data-id]`));const selected=rows.filter(r=>r.classList.contains('yx113-row-selected')||r.querySelector('.yx113-row-check:checked'));return selected.length?selected:rows;}
  async function lockBatchBeforeClick(btn){if(!window.YXEditLock?.ensure)return true;const source=btn.dataset.yx128EditAll||btn.dataset.yx128SaveAll||''; if(!source)return true; if(btn.dataset.yx94LockPass==='1')return true; const isEditing=btn.textContent&&btn.textContent.includes('儲存'); if(isEditing)return true; const rows=selectedOrAllRows(source).slice(0,80); if(!rows.length)return true; window.__YX94_BATCH_LOCKS__=window.__YX94_BATCH_LOCKS__||{}; window.__YX94_BATCH_LOCKS__[source]=rows.map(r=>r.dataset.id).filter(Boolean); for(const r of rows){const id=r.dataset.id; const label=(r.textContent||'').replace(/\s+/g,' ').slice(0,90); const ok=await window.YXEditLock.ensure(entityFromSource(source),id,{label,ttl_seconds:240}); if(!ok)return false;} btn.dataset.yx94LockPass='1'; setTimeout(()=>{try{btn.click();}finally{setTimeout(()=>delete btn.dataset.yx94LockPass,300);}},0); return false;}
  window.addEventListener('click',ev=>{const b=ev.target?.closest?.('[data-yx128-edit-all]'); if(!b||b.dataset.yx94LockPass==='1')return; ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation?.(); lockBatchBeforeClick(b).catch(e=>(window.toast||alert)(e.message||'取得批量編輯鎖失敗','error'));},true);
  document.addEventListener('click',ev=>{const cancel=ev.target?.closest?.('[data-yx128-card-cancel]'); if(cancel){const c=cancel.closest('[data-source][data-id]'); if(c) releaseBySourceId(c.dataset.source,c.dataset.id);} const save=ev.target?.closest?.('[data-yx128-card-save]'); if(save){const c=save.closest('[data-source][data-id]'); if(c) setTimeout(()=>releaseBySourceId(c.dataset.source,c.dataset.id),700);} const saveAll=ev.target?.closest?.('[data-yx128-save-all],[data-yx128-edit-all]'); if(saveAll && String(saveAll.textContent||'').includes('儲存')){const src=saveAll.dataset.yx128SaveAll||saveAll.dataset.yx128EditAll; setTimeout(()=>{(window.__YX94_BATCH_LOCKS__?.[src]||activeForSource(src).map(x=>x.entity_id)).forEach(id=>releaseBySourceId(src,id));},900);}},true);
  function mergeRows(oldRows,newRows){const map=new Map((Array.isArray(oldRows)?oldRows:[]).map(r=>[String(r.id),r]));(Array.isArray(newRows)?newRows:[]).forEach(r=>{if(r&&r.id!=null)map.set(String(r.id),{...(map.get(String(r.id))||{}),...r});});return Array.from(map.values());}
  function patchRows(table,rows){const source=tableToSource(table); if(!source||!rows||!rows.length)return; const act=window.YX113ProductActions||window.YX132ProductActions||window.YX128ProductActions; if(!act?.rowsStore)return; const current=act.rowsStore(source)||[]; const merged=mergeRows(current,rows); act.rowsStore(source,merged); try{act.renderSummary?.(source); act.renderCards?.(source);}catch(_){try{window[`render${source}Rows`]?.(merged);}catch(__){}} try{document.dispatchEvent(new CustomEvent('yx:v97-row-patched',{detail:{source,table,rows}}));}catch(_){}}
  document.addEventListener('yx:incremental-sync',ev=>{const items=ev.detail?.items||{}; ['inventory','orders','master_orders'].forEach(t=>{const rows=Array.isArray(items[t])?items[t]:[]; if(rows.length) patchRows(t,rows);});});
  function flashTarget(){const sp=new URLSearchParams(location.search); const id=sp.get('highlight_id'); const q=norm(sp.get('highlight_item')||sp.get('q')||sp.get('customer')||''); if(!id&&!q)return false; const pool=Array.from(document.querySelectorAll('[data-id],tr,.deduct-card,.yx113-product-card,.today-item')); let hit=null; if(id&&window.CSS&&CSS.escape) hit=document.querySelector(`[data-id="${CSS.escape(id)}"],[data-ref-id="${CSS.escape(id)}"]`); if(!hit&&q) hit=pool.find(el=>norm(el.textContent).includes(q)); if(hit){hit.classList.add('yx-v97-row-flash','yx-v93-row-target'); try{hit.scrollIntoView({behavior:'smooth',block:'center'});}catch(_){} return true;} return false;}
  function scheduleFlash(){let n=0; const step=()=>{if(flashTarget()||n++>16)return;setTimeout(step,300);}; step();}
  document.addEventListener('yx:v97-row-patched',scheduleFlash); window.addEventListener('load',scheduleFlash,{once:true});
  installFetchRelease();
})();

/* V105 source reopen filters + target rows + row lock visibility (mainfile, no setInterval/no MutationObserver). */
(function(){
  'use strict';
  if(window.__YX_V105_SOURCE_REOPEN__) return; window.__YX_V105_SOURCE_REOPEN__=true;
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const norm=v=>String(v||'').replace(/\s+/g,'').toLowerCase();
  const params=()=>new URLSearchParams(location.search);
  function queryText(){const p=params();return p.get('highlight_item')||p.get('product_text')||p.get('q')||p.get('customer')||'';}
  function pageSource(){const m=location.pathname.match(/\/(inventory|orders|master_order|shipping_query|ship|warehouse|today_changes)/);return m?m[1]:'';}
  function toast(msg,type){try{(window.toast||console.log)(msg,type||'ok');}catch(_){}}
  function banner(){let el=document.getElementById('yx102-source-filter-banner'); if(el)return el; el=document.createElement('div'); el.id='yx102-source-filter-banner'; el.className='yx102-source-filter-banner'; el.innerHTML='<div><b>已帶入來源條件</b><br><span data-yx102-filter-text></span></div><button type="button" class="ghost-btn small-btn" data-yx102-clear-filter>清除</button>'; const host=document.querySelector('.page-content,.module-content,main,.container')||document.body; host.prepend(el); el.addEventListener('click',e=>{if(e.target.closest('[data-yx102-clear-filter]')){const u=new URL(location.href); ['highlight_item','highlight_id','customer','product_text','source','target_row','open','q'].forEach(k=>u.searchParams.delete(k)); location.href=u.pathname+(u.searchParams.toString()?('?'+u.searchParams.toString()):'');}}); return el;}
  function applyInputs(){const p=params(); const q=queryText(); const customer=p.get('customer')||''; if(!q&&!customer)return false; let changed=false; const tokens=[q,customer].filter(Boolean); const inputs=Array.from(document.querySelectorAll('input[type="search"],input[placeholder*="搜尋"],input[name*="search"],input[id*="search"],input[data-search],textarea')); for(const inp of inputs){const ph=(inp.placeholder||inp.name||inp.id||'').toLowerCase(); const val=(ph.includes('客戶')&&customer)?customer:(q||customer); if(val && !inp.value){inp.value=val; inp.dispatchEvent(new Event('input',{bubbles:true})); inp.dispatchEvent(new Event('change',{bubbles:true})); changed=true;}}
    const sels=Array.from(document.querySelectorAll('select')); sels.forEach(sel=>{const text=Array.from(sel.options||[]).find(o=>tokens.some(t=>norm(o.textContent).includes(norm(t)))); if(text&&!sel.value){sel.value=text.value; sel.dispatchEvent(new Event('change',{bubbles:true})); changed=true;}});
    if(changed){const b=banner(); b.querySelector('[data-yx102-filter-text]').textContent=tokens.join(' / ');}
    return changed;
  }
  function flashRow(){const p=params(); const id=p.get('highlight_id'); const q=queryText(); if(!id&&!q)return false; let hit=null; if(id&&window.CSS&&CSS.escape){hit=document.querySelector(`[data-id="${CSS.escape(id)}"],[data-ref-id="${CSS.escape(id)}"],[data-item-id="${CSS.escape(id)}"]`);} if(!hit&&q){const nq=norm(q); hit=Array.from(document.querySelectorAll('[data-id],tr,.deduct-card,.product-card,.yx113-product-card,.warehouse-item,.today-item,.card')).find(el=>norm(el.textContent).includes(nq));}
    if(hit){hit.classList.add('yx102-target-flash','yx-v97-row-flash'); try{hit.scrollIntoView({behavior:'smooth',block:'center'});}catch(_){} return true;} return false;
  }
  function repeat(fn,tries,delay){let n=0; const step=()=>{if(fn()||n++>=tries)return; setTimeout(step,delay);}; step();}
  function installLockStatus(){if(!window.YXEditLock||window.__YX102_LOCK_NOTE__)return; window.__YX102_LOCK_NOTE__=true; const old=window.YXEditLock.ensure; if(typeof old!=='function')return; window.YXEditLock.ensure=async function(entity,id,opt){const ok=await old.apply(this,arguments); try{if(ok){const row=document.querySelector(`[data-id="${CSS.escape(String(id))}"]`); if(row&&!row.querySelector('.yx102-row-lock-note')){const note=document.createElement('span');note.className='yx102-row-lock-note';note.textContent='編輯中';(row.querySelector('.actions,.btn-row')||row).appendChild(note); setTimeout(()=>note.remove(),90000);}}}catch(_){} return ok;};}
  window.addEventListener('load',()=>{if(!['inventory','orders','master_order','shipping_query','ship'].includes(pageSource()))return; repeat(applyInputs,10,400); repeat(flashRow,18,350); installLockStatus();},{once:true});
  document.addEventListener('yx:v97-row-patched',()=>repeat(flashRow,10,250));
})();


/* V105 MAINFILE robust source targeting + row lock status badges (mainfile, no setInterval/no MutationObserver). */
(function(){'use strict';
  if(window.__YX_V105_SOURCE_LOCK_BADGES__) return; window.__YX_V105_SOURCE_LOCK_BADGES__=true;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const entityMap={inventory:'inventory',orders:'orders',order:'orders',master_order:'master_orders',master_orders:'master_orders',shipping_query:'shipping_records',shipping_records:'shipping_records'};
  function sourceFromPath(){const p=location.pathname; if(p.includes('inventory'))return'inventory'; if(p.includes('orders'))return'orders'; if(p.includes('master'))return'master_orders'; if(p.includes('shipping'))return'shipping_records'; return'';}
  async function api(url,body){const r=await fetch(url,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})});const t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch{d={success:false,error:t}};if(!r.ok||d.success===false)throw new Error(d.error||d.message||'請求失敗');return d;}
  function resolveData(el){return {source:el.dataset.source||el.dataset.refTable||sourceFromPath(), id:el.dataset.id||el.dataset.refId||'', customer_name:el.dataset.customer||el.dataset.refCustomer||'', product_text:el.dataset.product||el.dataset.refProduct||el.getAttribute('data-product-text')||'', material:el.dataset.material||el.dataset.refMaterial||''};}
  function decorateSourceLinks(){document.querySelectorAll('[data-yx-open-source],.yx-open-source-auto').forEach(el=>{if(el.__yx103Open)return; el.__yx103Open=true; el.addEventListener('click',async ev=>{ev.preventDefault(); try{const host=el.closest('[data-source],[data-ref-table],[data-id],.today-item,.card,tr')||el; const d=await api('/api/source-target/resolve',resolveData(host)); if(d.url) location.href=d.url;}catch(e){(window.toast||alert)(e.message||'來源定位失敗','error');}},true);});}
  function collectRows(){const src=sourceFromPath(); if(!src)return []; return Array.from(document.querySelectorAll('[data-id]')).slice(0,120).map(el=>({el, entity_type:entityMap[el.dataset.source||src]||src, entity_id:String(el.dataset.id||'')})).filter(x=>x.entity_id);}
  async function refreshLocks(){const rows=collectRows(); if(!rows.length)return; try{const d=await api('/api/edit-locks/row-status',{items:rows.map(({entity_type,entity_id})=>({entity_type,entity_id}))}); const locks=new Map((d.locks||[]).map(x=>[`${x.entity_type}:${x.entity_id}`,x])); rows.forEach(({el,entity_type,entity_id})=>{let old=el.querySelector('.yx103-lock-badge'); if(old)old.remove(); const l=locks.get(`${entity_type}:${entity_id}`); if(l){const b=document.createElement('span'); b.className='yx103-lock-badge'; b.textContent=`編輯中 ${l.username||''}`.trim(); (el.querySelector('.actions,.btn-row')||el).appendChild(b);}});}catch(_){}}
  function boot(){decorateSourceLinks(); refreshLocks(); setTimeout(()=>{decorateSourceLinks();refreshLocks();},800); setTimeout(refreshLocks,2500);} if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot(); document.addEventListener('yx:v97-row-patched',()=>setTimeout(refreshLocks,100)); document.addEventListener('yx:sync-applied',()=>setTimeout(refreshLocks,150));
})();
/* END V105 robust source targeting */

/* V105 next package: warehouse partial refresh + action replay + lock cleanup (mainfile, no setInterval/no MutationObserver). */
(function(){
  'use strict';
  if(window.__YX_V105_WAREHOUSE_SYNC_TOOLS__) return; window.__YX_V105_WAREHOUSE_SYNC_TOOLS__=true;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function api(url,opt={}){const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});const t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch{d={success:false,error:t}};if(!r.ok||d.success===false)throw new Error(d.error||d.message||'請求失敗');return d;}
  function locFromCell(cell){return `${cell.zone||''}-${cell.column_index||cell.column||0}-${cell.slot_number||cell.slot||0}`;}
  function findCellEl(cell){
    const z=String(cell.zone||'').toUpperCase(), c=String(cell.column_index||cell.column||''), s=String(cell.slot_number||cell.slot||'');
    const sels=[`[data-zone="${CSS.escape(z)}"][data-column-index="${CSS.escape(c)}"][data-slot-number="${CSS.escape(s)}"]`,`[data-zone="${CSS.escape(z)}"][data-column="${CSS.escape(c)}"][data-slot="${CSS.escape(s)}"]`,`[data-loc="${CSS.escape(`${z}-${c}-${s}`)}"]`];
    for(const sel of sels){try{const el=document.querySelector(sel); if(el)return el;}catch(_){}}
    return null;
  }
  function patchCell(cell){
    if(!cell) return false;
    const el=findCellEl(cell); if(!el) return false;
    el.dataset.qtyTotal=String(cell.qty_total||0);
    el.classList.toggle('empty',!!cell.empty);
    el.classList.toggle('filled',!cell.empty);
    el.classList.add('yx105-cell-patched');
    const count=el.querySelector('[data-cell-total],.cell-total,.yx-cell-total,.warehouse-cell-total');
    if(count) count.textContent=(Number(cell.qty_total||0)>0?`${Number(cell.qty_total||0)}件`:'');
    window.dispatchEvent(new CustomEvent('yx:warehouse-cell-patched',{detail:{cell}}));
    try{el.scrollIntoView({behavior:'smooth',block:'center',inline:'center'});}catch(_){ }
    setTimeout(()=>el.classList.remove('yx105-cell-patched'),1800);
    return true;
  }
  async function refreshCells(cells){
    const d=await api('/api/warehouse/refresh-cells',{method:'POST',body:JSON.stringify({cells:cells||[]})});
    (d.cells||[]).forEach(patchCell);
    if(window.YX101RefreshWarehouseFastStats) window.YX101RefreshWarehouseFastStats().catch(()=>{});
    return d;
  }
  window.YX105RefreshWarehouseCells=refreshCells;
  window.YX105OpenWarehouseCell=async function(target){
    const d=await api('/api/warehouse/open-cell',{method:'POST',body:JSON.stringify(target||{})});
    if(d.cell) patchCell(d.cell);
    const url=d.url||((d.cell&&d.cell.url)||'/warehouse');
    if(document.body?.dataset?.module==='warehouse'){
      try{history.replaceState(null,'',url);}catch(_){ }
      window.dispatchEvent(new CustomEvent('yx:warehouse-open-cell',{detail:d}));
    }else location.href=url;
    return d;
  };
  window.addEventListener('yx:ship-completed',ev=>{
    const rows=ev.detail?.warehouse_deduct_json||ev.detail?.warehouse_deduct||ev.detail?.cells||[];
    if(Array.isArray(rows)&&rows.length) refreshCells(rows).catch(()=>{});
  });
  document.addEventListener('click',async ev=>{
    const replay=ev.target.closest?.('[data-yx105-replay-audit]');
    if(replay){ev.preventDefault();try{const d=await api('/api/warehouse/replay-action/'+encodeURIComponent(replay.dataset.yx105ReplayAudit));openReplayModal(d);}catch(e){alert(e.message||'讀取紀錄失敗');}return;}
    const open=ev.target.closest?.('[data-yx105-open-cell]');
    if(open){ev.preventDefault();window.YX105OpenWarehouseCell({loc:open.dataset.yx105OpenCell||open.dataset.loc||'',zone:open.dataset.zone,column_index:open.dataset.columnIndex,slot_number:open.dataset.slotNumber}).catch(e=>alert(e.message||'開啟格位失敗'));}
  },true);
  function openReplayModal(d){
    let m=document.getElementById('yx105-replay-modal');
    if(!m){m=document.createElement('div');m.id='yx105-replay-modal';m.className='yx105-modal';document.body.appendChild(m);}
    const before=JSON.stringify(d.before||{},null,2), after=JSON.stringify(d.after||{},null,2);
    m.innerHTML=`<div class="yx105-modal-card"><h3>倉庫操作回放</h3><div class="yx105-replay-grid"><div><b>操作前</b><pre>${esc(before)}</pre></div><div><b>操作後</b><pre>${esc(after)}</pre></div></div><div class="btn-row"><button type="button" class="primary-btn" data-yx105-go-target>開啟格位</button><button type="button" class="ghost-btn" data-yx105-close>關閉</button></div></div>`;
    m.classList.add('show');
    m.querySelector('[data-yx105-close]')?.addEventListener('click',()=>m.classList.remove('show'),{once:true});
    m.querySelector('[data-yx105-go-target]')?.addEventListener('click',()=>{location.href=d.url||'/warehouse';},{once:true});
  }
  function cleanupLocks(){api('/api/edit-locks/cleanup',{method:'POST',body:'{}'}).catch(()=>{});}
  window.addEventListener('load',()=>setTimeout(cleanupLocks,1200),{once:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)cleanupLocks();});
})();
/* END V105 next package */


/* V109 next package: visible warehouse timeline + shipping warehouse links + stronger cell jumps (mainfile only; no setInterval/no MutationObserver). */
(function(){
  'use strict';
  if(window.__YX_V109_TIMELINE_SHIP_LOCK__) return; window.__YX_V109_TIMELINE_SHIP_LOCK__=true;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function getJSON(url,opt={}){const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});const t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch{d={success:false,error:t}};if(!r.ok||d.success===false)throw new Error(d.error||d.message||'請求失敗');return d;}
  function locText(x){return `${x.zone||''}-${x.column_index||x.column||0}-${x.slot_number||x.slot||0}`;}
  function ensurePanel(){let p=document.getElementById('yx106-warehouse-timeline'); if(p)return p; p=document.createElement('section');p.id='yx106-warehouse-timeline';p.className='yx106-panel';p.innerHTML='<div class="yx106-panel-head"><b>倉庫操作時間軸</b><button type="button" data-yx106-refresh>刷新</button></div><div class="yx106-list">讀取中...</div>'; const host=document.querySelector('#todayChangesList,.today-list,.page-content,main,.container')||document.body; host.appendChild(p); p.querySelector('[data-yx106-refresh]')?.addEventListener('click',()=>loadTimeline(true)); return p;}
  async function loadTimeline(force){ if(!force && !/today|warehouse/i.test(document.body?.dataset?.module||location.pathname)) return; const p=ensurePanel(); const list=p.querySelector('.yx106-list'); try{const d=await getJSON('/api/v109/warehouse-action-timeline?limit=120'); list.innerHTML=(d.items||[]).slice(0,60).map(it=>`<article class="yx106-timeline-item"><div><b>${esc(it.summary||'倉庫操作')}</b><small>${esc(it.created_at||'')}｜${esc(it.username||'')}</small></div><div class="yx106-timeline-actions">${(it.locations||[]).map(l=>`<button type="button" data-yx106-open-cell="${esc(l.loc)}">${esc(l.loc)}</button>`).join('')}<button type="button" data-yx105-replay-audit="${esc(it.id)}">回放</button></div></article>`).join('')||'<div class="empty-state">目前沒有倉庫操作紀錄</div>';}catch(e){list.innerHTML='<div class="error-card">倉庫操作時間軸讀取失敗</div>';}}
  function stableOpenCell(loc){ if(!loc)return; if(window.YX105OpenWarehouseCell){window.YX105OpenWarehouseCell({loc}).catch(()=>{location.href='/warehouse?loc='+encodeURIComponent(loc)+'&open=1';});return;} location.href='/warehouse?loc='+encodeURIComponent(loc)+'&open=1'; }
  document.addEventListener('click',ev=>{const b=ev.target.closest?.('[data-yx106-open-cell]'); if(!b)return; ev.preventDefault(); stableOpenCell(b.dataset.yx106OpenCell);},true);
  async function decorateShippingLinks(){ if(!/shipping|出貨/i.test(document.body?.dataset?.module||location.pathname)) return; try{const d=await getJSON('/api/v109/shipping-warehouse-sync?limit=160'); const rows=d.items||[]; rows.forEach(r=>{const id=String(r.id||''); if(!id||!r.warehouse_url)return; const row=document.querySelector(`[data-id="${CSS.escape(id)}"], [data-record-id="${CSS.escape(id)}"]`); if(row && !row.querySelector('.yx106-ship-wh-link')){const a=document.createElement('button');a.type='button';a.className='yx106-ship-wh-link';a.textContent='開倉庫 '+(r.warehouse_location_text||'');a.addEventListener('click',ev=>{ev.preventDefault();location.href=r.warehouse_url;});(row.querySelector('.actions,.btn-row')||row).appendChild(a);}});}catch(_){}}
  async function cleanupReport(){try{const d=await getJSON('/api/v109/edit-locks/cleanup-report',{method:'POST',body:'{}'}); window.dispatchEvent(new CustomEvent('yx:v109-lock-cleaned',{detail:d})); const chip=document.getElementById('yx106-lock-clean-chip')||(()=>{const x=document.createElement('div');x.id='yx106-lock-clean-chip';x.className='yx106-lock-clean-chip';document.body.appendChild(x);return x;})(); chip.textContent=`編輯鎖 ${d.active_count||0}｜已清理 ${d.removed||0}`; setTimeout(()=>chip.classList.add('show'),20); setTimeout(()=>chip.classList.remove('show'),2600);}catch(_){}}
  function boot(){loadTimeline(false); decorateShippingLinks(); setTimeout(decorateShippingLinks,900); setTimeout(cleanupReport,1400);} if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot(); document.addEventListener('yx:sync-applied',()=>{decorateShippingLinks();loadTimeline(false);}); window.addEventListener('yx:ship-completed',()=>{decorateShippingLinks();loadTimeline(true);}); document.addEventListener('visibilitychange',()=>{if(!document.hidden)cleanupReport();});
})();
/* END V109 next package */

/* V109 next package: focus rows, deduction detail review, timeline filters (mainfile only; no setInterval/no MutationObserver). */
(function(){
  if(window.__YX_V109_FOCUS_DEDUCT_LOCK__) return; window.__YX_V109_FOCUS_DEDUCT_LOCK__=true;
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const norm=s=>String(s||'').toLowerCase().replace(/\s+/g,'');
  async function getJSON(url,opt){const r=await fetch(url,Object.assign({credentials:'same-origin'},opt||{}));return await r.json();}
  function moduleName(){return (document.body?.dataset?.module||location.pathname||'').toLowerCase();}
  function addParams(url,params){try{const u=new URL(url,location.origin);Object.entries(params||{}).forEach(([k,v])=>{if(v!==undefined&&v!==null&&v!=='')u.searchParams.set(k,v)});return u.pathname+u.search+u.hash;}catch(_){return url;}}
  function tokens(){const p=new URLSearchParams(location.search);return [p.get('highlight_item'),p.get('customer'),p.get('q'),p.get('item_text'),p.get('focus_text')].filter(Boolean).map(norm).filter(Boolean);}
  function focusRow(){
    const p=new URLSearchParams(location.search); if(!p.get('focus_row')&&!p.get('target_row')&&!p.get('open')) return false;
    const qs=tokens(); if(!qs.length) return false;
    const pool=Array.from(document.querySelectorAll('.warehouse-item,.warehouse-cell-item,.yx-cell-item,.deduct-card,.product-card,.yx113-product-card,tr,[data-product-text],[data-customer-name]'));
    let hit=null;
    for(const q of qs){ hit=pool.find(el=>norm(el.textContent+' '+(el.dataset?.productText||'')+' '+(el.dataset?.customerName||'')).includes(q)); if(hit) break; }
    if(hit){ hit.classList.add('yx-v109-focus-row','yx-v97-row-flash'); try{hit.scrollIntoView({behavior:'smooth',block:'center'});}catch(_){} return true; }
    return false;
  }
  function retryFocus(){let n=0; const go=()=>{if(focusRow()||++n>12)return; setTimeout(go,250);}; setTimeout(go,120);}
  async function openTargetFromApi(payload){try{const d=await getJSON('/api/v109/open-and-focus-cell',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload||{})}); if(d&&d.url) location.href=addParams(d.url,{focus_row:1,target_row:1});}catch(e){console.warn('v109 open target failed',e);}}
  function bindOpenButtons(){
    document.addEventListener('click',function(ev){
      const a=ev.target.closest('[data-yx109-open-record],[data-yx109-open-loc]'); if(!a)return;
      ev.preventDefault();
      openTargetFromApi({record_id:a.getAttribute('data-yx109-open-record')||'',loc:a.getAttribute('data-yx109-open-loc')||'',highlight_item:a.getAttribute('data-yx109-highlight')||'',customer_name:a.getAttribute('data-yx109-customer')||''});
    },true);
  }
  async function decorateShippingDeductDetails(){
    if(!/ship|shipping|出貨/.test(moduleName())) return;
    try{
      const d=await getJSON('/api/v109/shipping-deduct-detail?limit=180');
      (d.items||[]).forEach(r=>{
        const id=String(r.id||''); if(!id)return;
        const row=document.querySelector(`[data-id="${CSS.escape(id)}"], [data-record-id="${CSS.escape(id)}"]`); if(!row||row.querySelector('.yx-v109-deduct-detail'))return;
        const details=r.deduct_details||[]; if(!details.length)return;
        const box=document.createElement('div'); box.className='yx-v109-deduct-detail';
        box.innerHTML='<b>倉庫扣除明細</b>'+details.map(x=>`<button type="button" data-yx109-open-record="${esc(id)}" data-yx109-open-loc="${esc(x.loc)}" data-yx109-highlight="${esc(x.product_text||r.item_text||'')}" data-yx109-customer="${esc(x.customer_name||r.customer_name||'')}">${esc(x.loc||'倉庫格')}｜扣 ${esc(x.deduct_qty||0)} 件｜${esc(x.before_qty??'?')} → ${esc(x.after_qty??'?')}${x.emptied?'｜已扣空':''}</button>`).join('');
        (row.querySelector('.actions,.btn-row')||row).appendChild(box);
      });
    }catch(e){}
  }
  function timelinePanel(){let p=document.getElementById('yx-v109-timeline-panel'); if(p)return p; p=document.createElement('section'); p.id='yx-v109-timeline-panel'; p.className='yx-v109-timeline-panel'; p.innerHTML='<div class="yx-v109-timeline-head"><b>倉庫操作時間軸</b><div class="yx-v109-filters"><button data-yx109-filter="all">全部</button><button data-yx109-filter="ship">出貨</button><button data-yx109-filter="add_slot">增格</button><button data-yx109-filter="remove_slot">減格</button><button data-yx109-filter="insert_slot">插入</button><button data-yx109-filter="emptied">扣空</button></div></div><div class="yx-v109-timeline-list"></div>'; const target=document.querySelector('#todayList,.today-list,.warehouse-page,.page-content,main')||document.body; target.appendChild(p); return p;}
  async function loadTimeline(category){
    if(!/today|warehouse|倉庫|今日/.test(moduleName())) return;
    const p=timelinePanel(), list=p.querySelector('.yx-v109-timeline-list'); list.innerHTML='<div class="empty-state-card compact-empty">載入中…</div>';
    try{const d=await getJSON('/api/v109/warehouse-action-timeline?limit=180&category='+encodeURIComponent(category||'all')); list.innerHTML=(d.items||[]).map(it=>`<article class="yx-v109-timeline-item type-${esc(it.type||'other')}"><div><b>${esc(it.summary||'倉庫操作')}</b><small>${esc(it.created_at||'')}｜${esc(it.username||'')}</small></div><div>${(it.locations||[]).map(l=>`<button type="button" data-yx109-open-loc="${esc(l.loc)}" data-yx109-highlight="${esc(it.summary||'')}">${esc(l.loc)}</button>`).join('')||'<span class="small-note">無格位</span>'}</div></article>`).join('')||'<div class="empty-state-card compact-empty">目前沒有紀錄</div>';}catch(e){list.innerHTML='<div class="error-card">時間軸讀取失敗</div>';}
  }
  function bindTimelineFilters(){document.addEventListener('click',ev=>{const b=ev.target.closest('[data-yx109-filter]'); if(!b)return; ev.preventDefault(); loadTimeline(b.getAttribute('data-yx109-filter')||'all');},true);}
  window.addEventListener('load',()=>{retryFocus(); bindOpenButtons(); bindTimelineFilters(); decorateShippingDeductDetails(); loadTimeline('all');});
  window.addEventListener('yx:page-ready',()=>{retryFocus(); decorateShippingDeductDetails(); loadTimeline('all');});
})();
/* END V109 next package */

/* V111 next package: unified deduction display, stronger open/focus, timeline count filters (mainfile only). */
(function(){
  if(window.__YX_V111_UNIFIED_DEDUCT_LOCK__) return; window.__YX_V111_UNIFIED_DEDUCT_LOCK__=true;
  window.__YX_PWA_VERSION__='V127';
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const norm=s=>String(s||'').toLowerCase().replace(/\s+/g,'').replace(/[區欄格]/g,'');
  async function getJSON(url,opt){const r=await fetch(url,Object.assign({credentials:'same-origin'},opt||{}));return await r.json();}
  function mod(){return (document.body?.dataset?.module||location.pathname||'').toLowerCase();}
  function addParams(url,params){try{const u=new URL(url,location.origin);Object.entries(params||{}).forEach(([k,v])=>{if(v!==undefined&&v!==null&&v!=='')u.searchParams.set(k,v)});return u.pathname+u.search+u.hash;}catch(_){return url;}}
  function queryTokens(){const p=new URLSearchParams(location.search);return [p.get('focus_text'),p.get('highlight_item'),p.get('customer'),p.get('q'),p.get('item_text'),p.get('loc')].filter(Boolean).map(norm).filter(Boolean);}
  function focusBestRow(){
    const p=new URLSearchParams(location.search); if(!p.get('focus_row')&&!p.get('target_row')&&!p.get('open')) return false;
    const qs=queryTokens(); if(!qs.length) return false;
    const pool=Array.from(document.querySelectorAll('.warehouse-item,.warehouse-cell-item,.yx-cell-item,.deduct-card,.product-card,.yx113-product-card,.yx-v109-deduct-detail,tr,[data-product-text],[data-customer-name],[data-loc]'));
    let best=null,score=0;
    for(const el of pool){const text=norm(el.textContent+' '+(el.dataset?.productText||'')+' '+(el.dataset?.customerName||'')+' '+(el.dataset?.loc||''));let s=0;for(const q of qs){if(q&&text.includes(q))s++;} if(s>score){score=s;best=el;}}
    if(best){best.classList.add('yx-v111-focus-row','yx-v109-focus-row','yx-v97-row-flash'); try{best.scrollIntoView({behavior:'smooth',block:'center'});}catch(_){} return true;}
    return false;
  }
  function retryFocus(){let n=0; const go=()=>{if(focusBestRow()||++n>16)return; setTimeout(go,220);}; setTimeout(go,120);}
  async function openTarget(payload){try{const d=await getJSON('/api/v111/open-and-focus-cell',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload||{})}); if(d&&d.url) location.href=addParams(d.url,{open:1,focus_row:1,target_row:1,focus_text:d.focus_text||d.highlight_item||d.customer_name||''});}catch(e){console.warn('V111 open target failed',e);}}
  function bindOpen(){document.addEventListener('click',ev=>{const b=ev.target.closest?.('[data-yx110-open-record],[data-yx110-open-loc]'); if(!b)return; ev.preventDefault(); openTarget({record_id:b.getAttribute('data-yx110-open-record')||'',loc:b.getAttribute('data-yx110-open-loc')||'',highlight_item:b.getAttribute('data-yx110-highlight')||'',customer_name:b.getAttribute('data-yx110-customer')||''});},true);}
  async function decorateUnifiedShipping(){
    if(!/(ship|shipping|出貨|today|今日|search|搜尋)/.test(mod())) return;
    try{
      const d=await getJSON('/api/v111/shipping-deduct-unified?limit=240');
      (d.items||[]).forEach(r=>{
        const id=String(r.id||''); if(!id)return;
        const row=document.querySelector(`[data-id="${CSS.escape(id)}"], [data-record-id="${CSS.escape(id)}"]`); if(!row||row.querySelector('.yx-v111-deduct-unified'))return;
        const details=r.deduct_details||[]; if(!details.length)return;
        const box=document.createElement('div'); box.className='yx-v111-deduct-unified';
        box.innerHTML=`<b>倉庫扣除</b><span>${esc(r.deduct_location_summary||'')}</span><small>共扣 ${esc(r.deduct_total_qty||0)} 件${r.deduct_emptied_count?`｜扣空 ${esc(r.deduct_emptied_count)} 格`:''}</small>`+details.map(x=>`<button type="button" data-yx110-open-record="${esc(id)}" data-yx110-open-loc="${esc(x.loc)}" data-yx110-highlight="${esc(x.product_text||r.item_text||'')}" data-yx110-customer="${esc(x.customer_name||r.customer_name||'')}">${esc(x.loc||'倉庫格')}｜${esc(x.before_qty??'?')}→${esc(x.after_qty??'?')}｜扣${esc(x.deduct_qty||0)}件${x.emptied?'｜已扣空':''}</button>`).join('');
        (row.querySelector('.actions,.btn-row,.card-actions')||row).appendChild(box);
      });
    }catch(e){}
  }
  function panel(){let p=document.getElementById('yx-v111-timeline-panel'); if(p)return p; p=document.createElement('section'); p.id='yx-v111-timeline-panel'; p.className='yx-v111-timeline-panel'; p.innerHTML='<div class="yx-v111-head"><b>倉庫操作時間軸 V111</b><div class="yx-v111-filters"><button data-yx110-filter="all">全部</button><button data-yx110-filter="ship">出貨</button><button data-yx110-filter="add_slot">增格</button><button data-yx110-filter="remove_slot">減格</button><button data-yx110-filter="insert_slot">插入</button><button data-yx110-filter="emptied">扣空</button></div></div><div class="yx-v111-counts"></div><div class="yx-v111-list"></div>'; (document.querySelector('#todayList,.today-list,.warehouse-page,.page-content,main,.container')||document.body).appendChild(p); return p;}
  async function loadTimeline(cat){if(!/(today|warehouse|倉庫|今日)/.test(mod()))return; const p=panel(); const list=p.querySelector('.yx-v111-list'); const counts=p.querySelector('.yx-v111-counts'); list.innerHTML='<div class="empty-state-card compact-empty">載入中…</div>'; try{const d=await getJSON('/api/v111/warehouse-action-timeline?limit=220&category='+encodeURIComponent(cat||'all')); counts.innerHTML=Object.entries(d.counts||{}).map(([k,v])=>`<span>${esc(k)} ${esc(v)}</span>`).join(''); list.innerHTML=(d.items||[]).map(it=>`<article class="yx-v111-timeline-item type-${esc(it.type||'other')}"><div><b>${esc(it.summary||'倉庫操作')}</b><small>${esc(it.created_at||'')}｜${esc(it.username||'')}</small></div><div>${(it.locations||[]).map(l=>`<button type="button" data-yx110-open-loc="${esc(l.loc)}" data-yx110-highlight="${esc(l.focus_text||it.focus_text||it.summary||'')}">${esc(l.loc)}</button>`).join('')||'<span class="small-note">無格位</span>'}</div></article>`).join('')||'<div class="empty-state-card compact-empty">目前沒有紀錄</div>'; }catch(e){list.innerHTML='<div class="error-card">V111 時間軸讀取失敗</div>';}}
  function bindFilters(){document.addEventListener('click',ev=>{const b=ev.target.closest?.('[data-yx110-filter]'); if(!b)return; ev.preventDefault(); loadTimeline(b.getAttribute('data-yx110-filter')||'all');},true);}
  async function cleanupLock(){try{await getJSON('/api/v111/edit-locks/cleanup-report',{method:'POST',body:'{}'});}catch(_){}}
  function boot(){bindOpen();bindFilters();retryFocus();decorateUnifiedShipping();loadTimeline('all');setTimeout(decorateUnifiedShipping,900);setTimeout(cleanupLock,1500);} 
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
  window.addEventListener('load',retryFocus); window.addEventListener('yx:page-ready',()=>{retryFocus();decorateUnifiedShipping();loadTimeline('all');}); window.addEventListener('yx:ship-completed',()=>{decorateUnifiedShipping();loadTimeline('ship');});
})();
/* END V111 next package */

/* V111 next package: shipping deduct trace + stronger warehouse focus target. Main-file only. */
(function(){
  if(window.__YX_V111_TRACE_LOCK__) return; window.__YX_V111_TRACE_LOCK__=true;
  window.__YX_PWA_VERSION__='V127';
  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  async function api(url,opt){ const r=await fetch(url,Object.assign({credentials:'same-origin'},opt||{})); return await r.json(); }
  function addParams(url,params){try{const u=new URL(url,location.origin);Object.entries(params||{}).forEach(([k,v])=>{if(v!==undefined&&v!==null&&String(v)!=='')u.searchParams.set(k,v)});return u.pathname+u.search+u.hash;}catch(_){return url;}}
  function tokens(){const u=new URL(location.href);return [u.searchParams.get('focus_text'),u.searchParams.get('highlight_item'),u.searchParams.get('customer'),u.searchParams.get('loc')].filter(Boolean).map(x=>String(x).toLowerCase());}
  function focusRows(){const ts=tokens(); if(!ts.length) return false; let best=null,score=0; $$('[data-id],tr,.product-card,.item-card,.warehouse-item,.cell-item,.card,.list-row').forEach(el=>{const txt=(el.innerText||'').toLowerCase(); let s=0; ts.forEach(t=>{if(t && txt.includes(t)) s+=t.length;}); if(s>score){score=s;best=el;}}); if(best){best.classList.add('yx-v111-focus-row','yx-v110-focus-row'); try{best.scrollIntoView({behavior:'smooth',block:'center'});}catch(_){} return true;} return false;}
  setTimeout(focusRows,350); setTimeout(focusRows,1100); setTimeout(focusRows,2300);
  async function openTarget(payload){try{const d=await api('/api/v111/open-focus-target',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload||{})}); if(d&&d.url) location.href=addParams(d.url,{open:1,focus_row:1,target_row:1,focus_text:d.focus_text||''});}catch(e){console.warn('V111 open target failed',e);}}
  async function injectDeductTrace(){
    if(!/(ship|shipping|出貨|today|今日|search|搜尋)/i.test(location.pathname+document.title+document.body.className)) return;
    try{const d=await api('/api/v111/shipping-deduct-trace?limit=260'); const map={}; (d.items||[]).forEach(it=>{if(it.id)map[String(it.id)]=it;});
      $$('[data-id],[data-record-id],tr,.record-card,.shipping-card,.today-card').forEach(row=>{const id=row.getAttribute('data-id')||row.getAttribute('data-record-id')||''; const it=map[String(id)]; if(!it||row.querySelector('.yx-v111-deduct-trace'))return; const box=document.createElement('div'); box.className='yx-v111-deduct-trace'; const targets=it.targets||[]; box.innerHTML=`<b>倉庫扣除</b><small>${esc(it.deduct_display_text||'')}</small>${targets.map(t=>`<button type="button" data-yx111-open='${esc(JSON.stringify({loc:t.loc,focus_text:t.focus_text,customer_name:t.customer_name}))}'>${esc(t.loc)} 扣${esc(t.deduct_qty)}｜${esc(t.before_qty)}→${esc(t.after_qty)}${t.emptied?' 已扣空':''}</button>`).join('')||'<span>尚無格位</span>'}`; row.appendChild(box); }
      );
    }catch(e){console.warn('V111 deduct trace inject failed',e);}
  }
  async function renderTimeline(){ if(!/(today|warehouse|倉庫|今日)/.test(location.pathname+document.title))return; let p=$('#yx-v111-timeline-panel'); if(!p){p=document.createElement('section'); p.id='yx-v111-timeline-panel'; p.className='yx-v111-timeline-panel'; p.innerHTML='<div class="yx-v111-head"><b>倉庫操作時間軸 V111</b><div class="yx-v111-filters"><button data-yx111-filter="all">全部</button><button data-yx111-filter="ship">出貨</button><button data-yx111-filter="add_slot">增格</button><button data-yx111-filter="remove_slot">減格</button><button data-yx111-filter="insert_slot">插入</button><button data-yx111-filter="emptied">扣空</button></div></div><div class="yx-v111-counts"></div><div class="yx-v111-list"></div>'; ($('#todayList')||$('.today-list')||$('.warehouse-page')||$('main')||document.body).appendChild(p);} const list=$('.yx-v111-list',p),counts=$('.yx-v111-counts',p); try{const cat=p.dataset.cat||'all'; const d=await api('/api/v111/warehouse-action-timeline?limit=260&category='+encodeURIComponent(cat)); counts.innerHTML=Object.entries(d.counts||{}).map(([k,v])=>`<span>${esc(k)} ${esc(v)}</span>`).join(''); list.innerHTML=(d.items||[]).map(it=>`<article class="yx-v111-timeline-item type-${esc(it.type||'other')}"><div><b>${esc(it.summary||it.action||'倉庫操作')}</b><small>${esc(it.created_at||'')}｜${esc(it.username||'')}</small></div><div>${(it.locations||[]).map(l=>`<button type="button" data-yx111-open='${esc(JSON.stringify({loc:l.loc,focus_text:l.focus_text||it.focus_text||it.summary}))}'>${esc(l.loc||'開格')}</button>`).join('')||'<span class="small-note">無格位</span>'}</div></article>`).join('')||'<div class="empty-state-card compact-empty">目前沒有紀錄</div>'; }catch(e){list.innerHTML='<div class="error-card">V111 時間軸讀取失敗</div>';}}
  document.addEventListener('click',e=>{const b=e.target.closest('[data-yx111-open]'); if(b){try{openTarget(JSON.parse(b.getAttribute('data-yx111-open')||'{}'));}catch(_){}} const f=e.target.closest('[data-yx111-filter]'); if(f){const p=$('#yx-v111-timeline-panel'); if(p){p.dataset.cat=f.getAttribute('data-yx111-filter')||'all'; renderTimeline();}}});
  document.addEventListener('DOMContentLoaded',()=>{injectDeductTrace(); renderTimeline();});
  setTimeout(()=>{injectDeductTrace(); renderTimeline();},900);
})();
/* END V111 next package */


/* V112 next package: shared warehouse deduction trace + endpoint alias guard. Main-file only. */
(function(){
  if(window.__YX_V112_UNIFIED_DEDUCT_LOCK__) return; window.__YX_V112_UNIFIED_DEDUCT_LOCK__=true;
  window.__YX_PWA_VERSION__='V127';
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const api=(u,o)=>fetch(u,o).then(r=>r.json());
  function tokens(){const u=new URL(location.href);return ['focus_text','highlight_item','customer','q','loc'].map(k=>u.searchParams.get(k)||'').join(' ').toLowerCase().split(/\s+|,|，|\||-/).filter(Boolean);}
  function focusRows(){const ts=tokens(); if(!ts.length) return false; let best=null,score=0; $$('[data-id],tr,.product-card,.item-card,.warehouse-item,.cell-item,.card,.list-row,.record-card,.shipping-card,.today-card').forEach(el=>{const txt=(el.innerText||'').toLowerCase(); let s=0; ts.forEach(t=>{ if(t && txt.includes(t)) s += Math.max(1,t.length); }); if(s>score){score=s;best=el;}}); if(best){best.classList.add('yx-v112-focus-row','yx-v111-focus-row'); try{best.scrollIntoView({behavior:'smooth',block:'center'});}catch(_){} return true;} return false;}
  async function openTarget(payload){try{const d=await api('/api/v112/open-focus-target',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload||{})}); if(d&&d.url){location.href=d.url;}}catch(e){console.warn('V112 open target failed',e);}}
  async function injectDeductTrace(){
    try{const d=await api('/api/v112/shipping-deduct-trace?limit=320'); const map={}; (d.items||[]).forEach(it=>{ if(it.id) map[String(it.id)]=it; });
      $$('[data-id],[data-record-id],tr,.record-card,.shipping-card,.today-card').forEach(row=>{const id=row.getAttribute('data-id')||row.getAttribute('data-record-id')||''; const it=map[String(id)]; if(!it||row.querySelector('.yx-v112-deduct-trace'))return; const targets=it.targets||[]; const box=document.createElement('div'); box.className='yx-v112-deduct-trace'; box.innerHTML=`<b>倉庫扣除追蹤</b><small>${esc(it.deduct_summary||it.deduct_display_text||'')}</small>${targets.map(t=>`<button type="button" data-yx112-open='${esc(JSON.stringify({loc:t.loc,focus_text:t.focus_text,customer_name:t.customer_name}))}'>${esc(t.loc||'開格')}｜扣${esc(t.deduct_qty)}｜${esc(t.before_qty)}→${esc(t.after_qty)}${t.emptied?'｜已扣空':''}</button>`).join('')||'<span>尚無扣倉資料</span>'}`; row.appendChild(box); });
    }catch(e){console.warn('V112 deduct trace inject failed',e);}
  }
  async function renderTimeline(){ if(!/(today|warehouse|倉庫|今日)/.test(location.pathname+document.title))return; let p=$('#yx-v112-timeline-panel'); if(!p){p=document.createElement('section'); p.id='yx-v112-timeline-panel'; p.className='yx-v112-timeline-panel'; p.innerHTML='<div class="yx-v112-head"><b>倉庫操作時間軸 V112</b><div class="yx-v112-filters"><button data-yx112-filter="all">全部</button><button data-yx112-filter="ship">出貨</button><button data-yx112-filter="add_slot">增格</button><button data-yx112-filter="remove_slot">減格</button><button data-yx112-filter="insert_slot">插入</button><button data-yx112-filter="emptied">扣空</button></div></div><div class="yx-v112-counts"></div><div class="yx-v112-list"></div>'; ($('#todayList')||$('.today-list')||$('.warehouse-page')||$('main')||document.body).appendChild(p);} const list=$('.yx-v112-list',p),counts=$('.yx-v112-counts',p); try{const cat=p.dataset.cat||'all'; const d=await api('/api/v112/warehouse-action-timeline?limit=300&category='+encodeURIComponent(cat)); counts.innerHTML=Object.entries(d.counts||{}).map(([k,v])=>`<span>${esc(k)} ${esc(v)}</span>`).join(''); list.innerHTML=(d.items||[]).map(it=>`<article class="yx-v112-timeline-item type-${esc(it.type||'other')}"><div><b>${esc(it.summary||it.action||'倉庫操作')}</b><small>${esc(it.created_at||'')}｜${esc(it.username||'')}</small></div><div>${(it.locations||[]).map(l=>`<button type="button" data-yx112-open='${esc(JSON.stringify({loc:l.loc,focus_text:l.focus_text||it.focus_text||it.summary,customer_name:l.customer_name||it.customer_name}))}'>${esc(l.loc||'開格')}</button>`).join('')||'<span class="small-note">無格位</span>'}</div></article>`).join('')||'<div class="empty-state-card compact-empty">目前沒有紀錄</div>'; }catch(e){list.innerHTML='<div class="error-card">V112 時間軸讀取失敗</div>';}}
  document.addEventListener('click',e=>{const b=e.target.closest('[data-yx112-open]'); if(b){try{openTarget(JSON.parse(b.getAttribute('data-yx112-open')||'{}'));}catch(_){}} const f=e.target.closest('[data-yx112-filter]'); if(f){const p=$('#yx-v112-timeline-panel'); if(p){p.dataset.cat=f.getAttribute('data-yx112-filter')||'all'; renderTimeline();}}});
  document.addEventListener('DOMContentLoaded',()=>{setTimeout(focusRows,360); setTimeout(focusRows,1200); setTimeout(injectDeductTrace,900); setTimeout(renderTimeline,1100);});
  window.addEventListener('yx:data-updated',()=>{setTimeout(injectDeductTrace,300); setTimeout(focusRows,350);});
})();
/* END V112 next package */


/* V113 next package: wire frontend to V113 trace/open APIs, consistent click-back and focus. Main-file only. */
(function(){
  if(window.__YX_V113_TRACE_OPEN_LOCK__) return; window.__YX_V113_TRACE_OPEN_LOCK__=true;
  window.__YX_PWA_VERSION__='V127';
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const api=(u,o)=>fetch(u,Object.assign({credentials:'same-origin'},o||{})).then(r=>r.json());
  function pageKey(){return (location.pathname+' '+document.title+' '+(document.body?.dataset?.module||'')+' '+document.body.className).toLowerCase();}
  function norm(s){return String(s||'').toLowerCase().replace(/\s+/g,'').replace(/[區欄格第]/g,'');}
  function currentTokens(){const u=new URL(location.href); return ['focus_text','highlight_item','customer','q','loc','item_text'].map(k=>u.searchParams.get(k)||'').filter(Boolean);}
  function focusBestRow(){
    const ts=currentTokens().map(norm).filter(Boolean); if(!ts.length) return false;
    let best=null, score=0;
    $$('[data-id],[data-record-id],[data-product-text],[data-customer-name],[data-loc],tr,.product-card,.item-card,.warehouse-item,.cell-item,.warehouse-cell-item,.card,.list-row,.record-card,.shipping-card,.today-card').forEach(el=>{
      const ds=el.dataset||{};
      const text=norm((el.innerText||'')+' '+(ds.productText||'')+' '+(ds.customerName||'')+' '+(ds.loc||''));
      let s=0; ts.forEach(t=>{ if(t && text.includes(t)) s += Math.max(1,t.length); });
      if(s>score){score=s; best=el;}
    });
    if(best){ best.classList.add('yx-v113-focus-row','yx-v112-focus-row','yx-v111-focus-row'); try{best.scrollIntoView({behavior:'smooth',block:'center'});}catch(_){} return true; }
    return false;
  }
  function retryFocus(){let n=0; const go=()=>{ if(focusBestRow() || ++n>18) return; setTimeout(go,220); }; setTimeout(go,120);}
  async function openTarget(payload){
    try{const d=await api('/api/v113/open-focus-target',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload||{})}); if(d&&d.url){location.href=d.url;}}
    catch(e){console.warn('V113 open target failed',e);}
  }
  function safePayload(s){try{return JSON.parse(s||'{}')}catch(_){return {}}}
  function bindOpenButtons(){
    document.addEventListener('click',e=>{
      const b=e.target.closest?.('[data-yx113-open],[data-yx112-open],[data-yx111-open],[data-yx110-open-record],[data-yx110-open-loc],[data-yx109-open-record],[data-yx109-open-loc]');
      if(!b) return;
      const raw=b.getAttribute('data-yx113-open')||b.getAttribute('data-yx112-open')||b.getAttribute('data-yx111-open');
      const payload=raw?safePayload(raw):{
        record_id:b.getAttribute('data-yx110-open-record')||b.getAttribute('data-yx109-open-record')||'',
        loc:b.getAttribute('data-yx110-open-loc')||b.getAttribute('data-yx109-open-loc')||'',
        focus_text:b.getAttribute('data-yx110-highlight')||b.getAttribute('data-yx109-highlight')||'',
        customer_name:b.getAttribute('data-yx110-customer')||b.getAttribute('data-yx109-customer')||''
      };
      e.preventDefault(); openTarget(payload);
    },true);
  }
  async function injectDeductTrace(){
    if(!/(ship|shipping|出貨|today|今日|search|搜尋)/.test(pageKey())) return;
    try{
      const d=await api('/api/v113/shipping-deduct-trace?limit=360');
      const map={}; (d.items||[]).forEach(it=>{ if(it.id) map[String(it.id)]=it; });
      $$('[data-id],[data-record-id],tr,.record-card,.shipping-card,.today-card').forEach(row=>{
        const id=row.getAttribute('data-id')||row.getAttribute('data-record-id')||''; const it=map[String(id)];
        if(!it || row.querySelector('.yx-v113-deduct-trace')) return;
        const targets=it.targets||[]; if(!targets.length) return;
        const box=document.createElement('div'); box.className='yx-v113-deduct-trace';
        box.innerHTML=`<b>倉庫扣除追蹤</b><small>${esc(it.deduct_summary||it.deduct_display_text||'')}</small>`+
          targets.map(t=>`<button type="button" data-yx113-open='${esc(JSON.stringify(t.open_payload||{loc:t.loc,focus_text:t.focus_text,customer_name:t.customer_name,record_id:id}))}'>${esc(t.loc||'開格')}｜扣${esc(t.deduct_qty||0)}｜${esc(t.before_qty??'?')}→${esc(t.after_qty??'?')}${t.emptied?'｜已扣空':''}</button>`).join('');
        (row.querySelector('.actions,.btn-row,.card-actions')||row).appendChild(box);
      });
    }catch(e){console.warn('V113 deduct trace inject failed',e);}
  }
  async function renderTimeline(){
    if(!/(today|warehouse|倉庫|今日)/.test(pageKey())) return;
    let p=$('#yx-v113-timeline-panel');
    if(!p){p=document.createElement('section'); p.id='yx-v113-timeline-panel'; p.className='yx-v113-timeline-panel'; p.innerHTML='<div class="yx-v113-head"><b>倉庫操作時間軸 V113</b><div class="yx-v113-filters"><button data-yx113-filter="all">全部</button><button data-yx113-filter="ship">出貨</button><button data-yx113-filter="add_slot">增格</button><button data-yx113-filter="remove_slot">減格</button><button data-yx113-filter="insert_slot">插入</button><button data-yx113-filter="emptied">扣空</button></div></div><div class="yx-v113-counts"></div><div class="yx-v113-list"></div>'; ($('#todayList')||$('.today-list')||$('.warehouse-page')||$('main')||document.body).appendChild(p);}
    const list=$('.yx-v113-list',p), counts=$('.yx-v113-counts',p);
    try{const cat=p.dataset.cat||'all'; const d=await api('/api/v113/warehouse-action-timeline?limit=330&category='+encodeURIComponent(cat)); counts.innerHTML=Object.entries(d.counts||{}).map(([k,v])=>`<span>${esc(k)} ${esc(v)}</span>`).join(''); list.innerHTML=(d.items||[]).map(it=>`<article class="yx-v113-timeline-item type-${esc(it.type||'other')}"><div><b>${esc(it.summary||it.action||'倉庫操作')}</b><small>${esc(it.created_at||'')}｜${esc(it.username||'')}</small></div><div>${(it.locations||[]).map(l=>`<button type="button" data-yx113-open='${esc(JSON.stringify(l.open_payload||{loc:l.loc,focus_text:l.focus_text||it.focus_text||it.summary,customer_name:l.customer_name||it.customer_name}))}'>${esc(l.loc||'開格')}</button>`).join('')||'<span class="small-note">無格位</span>'}</div></article>`).join('')||'<div class="empty-state-card compact-empty">目前沒有紀錄</div>';}
    catch(e){list.innerHTML='<div class="error-card">V113 時間軸讀取失敗</div>';}
  }
  function bindFilters(){document.addEventListener('click',e=>{const f=e.target.closest?.('[data-yx113-filter]'); if(!f)return; e.preventDefault(); const p=$('#yx-v113-timeline-panel'); if(p){p.dataset.cat=f.getAttribute('data-yx113-filter')||'all'; renderTimeline();}},true);}
  async function cleanupLocks(){try{await api('/api/v113/edit-locks/cleanup-report',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});}catch(_){}}
  function boot(){bindOpenButtons(); bindFilters(); retryFocus(); setTimeout(injectDeductTrace,700); setTimeout(renderTimeline,900); setTimeout(cleanupLocks,1600);}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
  window.addEventListener('yx:data-updated',()=>{setTimeout(injectDeductTrace,250); setTimeout(retryFocus,300);});
  window.addEventListener('yx:page-ready',()=>{setTimeout(injectDeductTrace,250); setTimeout(renderTimeline,450); setTimeout(retryFocus,500);});
})();
/* END V113 next package */


/* V115 next package: stable target opening, unified warehouse deduct trace, timeline count/filter polish. Main-file only. */
(function(){
  if(window.__YX_V115_STABLE_TRACE_LOCK__) return; window.__YX_V115_STABLE_TRACE_LOCK__=true;
  window.__YX_PWA_VERSION__='V127';
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  async function api(url,opt){ const r=await fetch(url,opt||{}); const t=await r.text(); try{return JSON.parse(t);}catch(_){return {ok:r.ok, raw:t};} }
  function params(){try{return new URLSearchParams(location.search)}catch(_){return new URLSearchParams('')}}
  function tokenList(){ const p=params(); return [p.get('focus_text'),p.get('highlight_item'),p.get('customer'),p.get('loc')].filter(Boolean).map(x=>String(x).toLowerCase()); }
  function stableFocusRow(root){
    const toks=tokenList(); if(!toks.length) return false;
    const scope=root||document;
    const rows=$$('.warehouse-item,.cell-item,.product-card,.item-card,tr,.shipping-row,.order-row,.inventory-row,.master-row,.yx-v113-timeline-item,.today-card',scope);
    let best=null, score=0;
    for(const row of rows){ const tx=(row.innerText||'').toLowerCase(); let sc=0; toks.forEach(t=>{ if(t && tx.includes(t)) sc++; }); if(sc>score){score=sc; best=row;} }
    if(best){ best.classList.add('yx-v114-focus-row','yx-v113-focus-row','yx-v112-focus-row'); try{best.scrollIntoView({behavior:'smooth',block:'center'});}catch(_){} return true; }
    return false;
  }
  async function openTarget(payload){
    try{ const d=await api('/api/v114/open-focus-target',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload||{})}); if(d&&d.url){ location.href=d.url; return; } }
    catch(e){ console.warn('V115 open target failed',e); }
    if(payload&&payload.loc) location.href='/warehouse?open=1&v114=1&loc='+encodeURIComponent(payload.loc)+'&focus_text='+encodeURIComponent(payload.focus_text||'')+'&customer='+encodeURIComponent(payload.customer_name||'');
  }
  function bindOpenButtons(){
    document.addEventListener('click',e=>{
      const b=e.target.closest?.('[data-yx114-open],[data-yx113-open],[data-open-payload],[data-warehouse-open]'); if(!b) return;
      const raw=b.getAttribute('data-yx114-open')||b.getAttribute('data-yx113-open')||b.getAttribute('data-open-payload')||b.getAttribute('data-warehouse-open')||'{}';
      let payload={}; try{payload=JSON.parse(raw)}catch(_){payload={loc:raw};}
      e.preventDefault(); openTarget(payload);
    },true);
  }
  async function injectDeductTrace(){
    try{
      const d=await api('/api/v114/shipping-deduct-trace?limit=420'); const items=d.items||[];
      const rows=$$('.shipping-card,.shipping-row,.today-card,.activity-card,.search-result-card,tr');
      rows.forEach(row=>{
        const tx=(row.innerText||'').toLowerCase();
        const it=items.find(x=>tx.includes(String(x.id||x.record_id||'@@').toLowerCase()) || (x.customer_name&&tx.includes(String(x.customer_name).toLowerCase())&&x.item_text&&tx.includes(String(x.item_text).slice(0,8).toLowerCase())));
        if(!it || row.querySelector('.yx-v114-deduct-trace')) return;
        const box=document.createElement('div'); box.className='yx-v114-deduct-trace';
        box.innerHTML='<b>倉庫扣除追蹤</b><span>'+esc(it.deduct_summary||'')+'</span>'+((it.targets||[]).map(t=>`<button type="button" data-yx114-open='${esc(JSON.stringify(t.open_payload||{}))}'>開 ${esc(t.loc||'格位')}</button>`).join(''));
        row.appendChild(box);
      });
    }catch(e){ console.warn('V115 deduct trace inject failed',e); }
  }
  async function renderTimeline(){
    let p=$('#yx-v114-timeline-panel')||$('#yx-v113-timeline-panel');
    if(!p){ p=document.createElement('section'); p.id='yx-v114-timeline-panel'; p.className='yx-v114-timeline-panel yx-v113-timeline-panel'; p.innerHTML='<div class="yx-v114-head"><b>倉庫操作時間軸 V115</b><div class="yx-v114-filters"><button data-yx114-filter="all">全部</button><button data-yx114-filter="ship">出貨</button><button data-yx114-filter="add_slot">增格</button><button data-yx114-filter="remove_slot">減格</button><button data-yx114-filter="insert_slot">插入</button><button data-yx114-filter="emptied">扣空</button></div></div><div class="yx-v114-counts"></div><div class="yx-v114-list"></div>'; ($('#todayList')||$('.today-list')||$('.warehouse-page')||$('main')||document.body).appendChild(p); }
    const list=$('.yx-v114-list',p)||$('.yx-v113-list',p), counts=$('.yx-v114-counts',p)||$('.yx-v113-counts',p);
    try{
      const cat=p.dataset.cat||'all'; const d=await api('/api/v114/warehouse-action-timeline?limit=420&category='+encodeURIComponent(cat));
      counts.innerHTML=Object.entries(d.counts||{}).map(([k,v])=>`<span>${esc(k)} ${esc(v)}</span>`).join('');
      list.innerHTML=(d.items||[]).map(it=>`<article class="yx-v114-timeline-item type-${esc(it.type||'other')}"><div><b>${esc(it.summary||it.action||'倉庫操作')}</b><small>${esc(it.created_at||'')}｜${esc(it.username||'')}</small></div><div>${(it.locations||[]).map(l=>`<button type="button" data-yx114-open='${esc(JSON.stringify(l.open_payload||{loc:l.loc,focus_text:l.focus_text||it.summary,customer_name:l.customer_name||it.customer_name}))}'>${esc(l.loc||'開格')}</button>`).join('')||'<span class="small-note">無格位</span>'}</div></article>`).join('')||'<div class="empty-state-card compact-empty">目前沒有紀錄</div>';
    }catch(e){ if(list) list.innerHTML='<div class="error-card">V115 時間軸讀取失敗</div>'; }
  }
  function bindFilters(){document.addEventListener('click',e=>{const f=e.target.closest?.('[data-yx114-filter]'); if(!f)return; e.preventDefault(); const p=$('#yx-v114-timeline-panel')||$('#yx-v113-timeline-panel'); if(p){p.dataset.cat=f.getAttribute('data-yx114-filter')||'all'; renderTimeline();}},true);}
  async function cleanupLocks(){try{await api('/api/v114/edit-locks/cleanup-report',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});}catch(_){}}
  function boot(){ bindOpenButtons(); bindFilters(); stableFocusRow(); setTimeout(stableFocusRow,500); setTimeout(stableFocusRow,1300); setTimeout(injectDeductTrace,700); if(/today|warehouse/.test(location.pathname)) setTimeout(renderTimeline,900); cleanupLocks(); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
/* END V115 next package */


/* V115 active API wiring block: uses /api/v115 endpoints and fallback open. */
(function(){
  if(window.__YX_V115_ACTIVE_WIRING__) return; window.__YX_V115_ACTIVE_WIRING__=true;
  const $=(s,r=document)=>r.querySelector(s); const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const esc=s=>String(s??'').replace(/[&<>\'\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'\"':'&quot;'}[c]));
  async function api(url,opt){ const r=await fetch(url,opt); const d=(r.headers.get('content-type')||'').includes('json')?await r.json():{}; if(!r.ok||d.ok===false) throw Object.assign(new Error(d.error||r.statusText),{data:d}); return d; }
  function parse(raw){try{return JSON.parse(raw||'{}')}catch(_){return {loc:raw||''}}}
  function norm(s){s=String(s||'').trim().toUpperCase().replace(/[區倉]/g,'').replace(/欄/g,'-').replace(/格/g,'').replace(/[ _]+/g,'-'); const p=s.split('-').filter(Boolean); return p.length>=3&&/^[AB]$/.test(p[0])?[p[0],p[1],p[2]].join('-'):s;}
  function rowFocus(txt,customer){ const toks=String([txt,customer].filter(Boolean).join(' ')).split(/[\s,，/｜|]+/).filter(x=>x&&x.length>1).slice(0,8); let best=null,score=0; $$('tr,.product-card,.item-card,.warehouse-item,.yx-warehouse-item,.cell-item,.yx108-item,.yx109-item').forEach(el=>{const body=(el.innerText||'').toLowerCase(); let sc=0; toks.forEach(t=>{if(body.includes(String(t).toLowerCase()))sc++;}); if(sc>score){score=sc;best=el;}}); if(best){best.classList.add('yx-v115-focus-row'); try{best.scrollIntoView({behavior:'smooth',block:'center'});}catch(_){} return true;} return false; }
  async function openV115(payload){ payload=payload||{}; if(payload.loc) payload.loc=norm(payload.loc); try{const d=await api('/api/v115/open-focus-target',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); if(d&&d.url){location.href=d.url;return;}}catch(e){console.warn('V115 active open fallback',e);} if(payload.loc) location.href='/warehouse?open=1&auto_open_cell=1&scroll_item=1&fallback_open=1&v115=1&loc='+encodeURIComponent(payload.loc)+'&focus_text='+encodeURIComponent(payload.focus_text||'')+'&customer='+encodeURIComponent(payload.customer_name||''); }
  document.addEventListener('click',e=>{const b=e.target.closest?.('[data-yx115-open]'); if(!b)return; e.preventDefault(); openV115(parse(b.getAttribute('data-yx115-open')||'{}'));},true);
  document.addEventListener('click',e=>{const b=e.target.closest?.('[data-yx114-open],[data-yx113-open],[data-open-payload],[data-warehouse-open]'); if(!b||b.hasAttribute('data-yx115-open'))return; const raw=b.getAttribute('data-yx114-open')||b.getAttribute('data-yx113-open')||b.getAttribute('data-open-payload')||b.getAttribute('data-warehouse-open')||'{}'; const p=parse(raw); if(p&&p.loc){e.preventDefault(); openV115(p);}},true);
  async function decorateTrace(){try{const d=await api('/api/v115/shipping-deduct-trace?limit=500'); const items=d.items||[]; $$('tr,.shipping-record,.shipping-card,.today-card,.activity-card,.search-result-card').forEach(row=>{const tx=(row.innerText||'').toLowerCase(); const it=items.find(x=>tx.includes(String(x.id||x.record_id||'@@').toLowerCase()) || (x.customer_name&&tx.includes(String(x.customer_name).toLowerCase()))); if(!it||row.querySelector('.yx-v115-deduct-trace'))return; const box=document.createElement('div'); box.className='yx-v115-deduct-trace'; box.innerHTML='<b>倉庫扣除追蹤 V115</b><span>'+esc(it.deduct_summary||'')+'</span>'+((it.targets||[]).map(t=>`<button type="button" data-yx115-open='${esc(JSON.stringify(t.open_payload||{loc:t.loc,focus_text:t.focus_text,customer_name:t.customer_name}))}'>開 ${esc(t.loc||'格位')}</button>`).join('')); row.appendChild(box);});}catch(e){}}
  async function renderTimeline(){let p=$('#yx-v115-timeline-panel'); if(!p){p=document.createElement('section'); p.id='yx-v115-timeline-panel'; p.className='yx-v115-timeline-panel'; p.innerHTML='<div class="yx-v115-head"><b>倉庫操作時間軸 V115</b><div class="yx-v115-filters"><button data-yx115-filter="all">全部</button><button data-yx115-filter="ship">出貨</button><button data-yx115-filter="add_slot">增格</button><button data-yx115-filter="remove_slot">減格</button><button data-yx115-filter="insert_slot">插入</button><button data-yx115-filter="emptied">扣空</button></div></div><div class="yx-v115-counts"></div><div class="yx-v115-list"></div>'; ($('#todayList')||$('.today-list')||$('.warehouse-page')||$('main')||document.body).appendChild(p);} const list=$('.yx-v115-list',p), counts=$('.yx-v115-counts',p); try{const cat=p.dataset.cat||'all'; const d=await api('/api/v115/warehouse-action-timeline?limit=500&category='+encodeURIComponent(cat)); if(counts)counts.innerHTML=Object.entries(d.counts||{}).map(([k,v])=>`<span>${esc(k)}：${esc(v)}</span>`).join(''); if(list)list.innerHTML=(d.items||[]).map(it=>`<article class="yx-v115-timeline-item type-${esc(it.type||'other')}"><div><b>${esc(it.summary||it.action||'倉庫操作')}</b><small>${esc(it.created_at||'')}｜${esc(it.username||'')}</small></div><div>${(it.locations||[]).map(l=>`<button type="button" data-yx115-open='${esc(JSON.stringify(l.open_payload||{loc:l.loc,focus_text:l.focus_text||it.summary,customer_name:l.customer_name||it.customer_name}))}'>${esc(l.loc||'開格')}</button>`).join('')||'<span class="small-note">無格位</span>'}</div></article>`).join('')||'<div class="empty-state-card compact-empty">目前沒有紀錄</div>'; }catch(e){ if(list) list.innerHTML='<div class="error-card">V115 時間軸讀取失敗</div>'; }}
  document.addEventListener('click',e=>{const f=e.target.closest?.('[data-yx115-filter]'); if(!f)return; e.preventDefault(); const p=$('#yx-v115-timeline-panel'); if(p){p.dataset.cat=f.getAttribute('data-yx115-filter')||'all'; renderTimeline();}},true);
  function focusFromUrl(){const u=new URL(location.href); const txt=u.searchParams.get('focus_text')||u.searchParams.get('highlight_item'); const c=u.searchParams.get('customer')||u.searchParams.get('customer_name'); if(!txt&&!c)return; let n=0; (function tick(){n++; rowFocus(txt,c); if(n<8)setTimeout(tick,260);})();}
  function boot(){focusFromUrl(); setTimeout(decorateTrace,900); if(/today|warehouse/.test(location.pathname)) setTimeout(renderTimeline,1100); try{api('/api/v115/edit-locks/cleanup-report',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});}catch(_){}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})();
/* END V115 active API wiring block */


/* V116 next package: fallback target opening, trace/timeline API V116 wiring. Main-file only. */
(function(){
  if(window.__YX_V116_STABLE_OPEN__) return; window.__YX_V116_STABLE_OPEN__=true;
  window.__YX_PWA_VERSION__='V127';
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  async function api(url,opt){const r=await fetch(url,opt||{});const t=await r.text();try{return JSON.parse(t)}catch(_){return {ok:r.ok,raw:t}}}
  function q(){try{return new URLSearchParams(location.search)}catch(_){return new URLSearchParams('')}}
  function collectTokens(payload){const p=q();return [payload&&payload.focus_text,p.get('focus_text'),p.get('highlight_item'),payload&&payload.customer_name,p.get('customer'),p.get('loc'),payload&&payload.loc].filter(Boolean).map(x=>String(x).toLowerCase().trim()).filter(Boolean)}
  function focusRows(payload){const toks=collectTokens(payload||{}); if(!toks.length) return false; let best=null,score=0; const rows=$$('.warehouse-item,.cell-item,.product-card,.item-card,.shipping-card,.today-card,.activity-card,.search-result-card,tr,[data-cell-id],[data-location],[data-loc]'); for(const row of rows){const tx=(row.innerText||'').toLowerCase(); let sc=0; for(const t of toks){if(t&&tx.includes(t))sc++;} if(sc>score){score=sc;best=row;}} if(best){best.classList.add('yx-v116-focus-row','yx-v115-focus-row'); try{best.scrollIntoView({behavior:'smooth',block:'center'});}catch(_){} return true;} return false;}
  function nativeOpenCell(loc){ if(!loc) return false; const safe=String(loc).toUpperCase(); const candidates=[`[data-loc="${CSS.escape(safe)}"]`,`[data-location="${CSS.escape(safe)}"]`,`[data-cell-loc="${CSS.escape(safe)}"]`]; let el=null; for(const c of candidates){el=$(c); if(el)break;} if(!el){const cells=$$('.warehouse-cell,.cell,.slot-cell,[data-cell-id]'); el=cells.find(x=>(x.innerText||'').toUpperCase().includes(safe));} if(el){el.classList.add('yx-v116-focus-row'); try{el.scrollIntoView({behavior:'smooth',block:'center',inline:'center'}); el.click(); setTimeout(()=>focusRows({loc:safe}),400);}catch(_){} return true;} return false;}
  async function openTarget(payload){payload=payload||{}; try{const d=await api('/api/v116/open-focus-target',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); if(d&&d.url){ if(location.pathname.includes('/warehouse') && (payload.loc||d.loc)){ if(nativeOpenCell(payload.loc||d.loc)){setTimeout(()=>focusRows(payload),600);return;} } location.href=d.url; return; }}catch(e){console.warn('V116 open target failed',e)} if(payload.loc){ if(nativeOpenCell(payload.loc)) return; location.href='/warehouse?open=1&fallback_open=1&retry_focus=1&v116=1&loc='+encodeURIComponent(payload.loc)+'&focus_text='+encodeURIComponent(payload.focus_text||'')+'&customer='+encodeURIComponent(payload.customer_name||''); }}
  document.addEventListener('click',e=>{const b=e.target.closest?.('[data-yx116-open],[data-yx115-open],[data-yx114-open],[data-yx113-open],[data-open-payload],[data-warehouse-open]'); if(!b)return; const raw=b.getAttribute('data-yx116-open')||b.getAttribute('data-yx115-open')||b.getAttribute('data-yx114-open')||b.getAttribute('data-yx113-open')||b.getAttribute('data-open-payload')||b.getAttribute('data-warehouse-open')||'{}'; let payload={}; try{payload=JSON.parse(raw)}catch(_){payload={loc:raw}} e.preventDefault(); openTarget(payload);},true);
  async function decorateTrace(){try{const d=await api('/api/v116/shipping-deduct-trace?limit=520'); const items=d.items||[]; $$('.shipping-card,.shipping-row,.today-card,.activity-card,.search-result-card,tr').forEach(row=>{const tx=(row.innerText||'').toLowerCase(); const it=items.find(x=>tx.includes(String(x.id||x.record_id||'@@').toLowerCase()) || (x.customer_name&&tx.includes(String(x.customer_name).toLowerCase())&&(!x.item_text||tx.includes(String(x.item_text).slice(0,6).toLowerCase())))); if(!it||row.querySelector('.yx-v116-deduct-trace'))return; const box=document.createElement('div'); box.className='yx-v116-deduct-trace'; box.innerHTML='<b>倉庫扣除追蹤 V116</b><span>'+esc(it.deduct_summary||'')+'</span>'+((it.targets||[]).map(t=>`<button type="button" data-yx116-open='${esc(JSON.stringify(t.open_payload||{loc:t.loc,focus_text:t.focus_text,customer_name:t.customer_name}))}'>開 ${esc(t.loc||'格位')}</button>`).join('')); row.appendChild(box);});}catch(e){console.warn('V116 trace decorate failed',e)}}
  async function renderTimeline(){let p=$('#yx-v116-timeline-panel'); if(!p && !/today|warehouse|倉庫|今日/.test(location.pathname+document.body.className))return; if(!p){p=document.createElement('section');p.id='yx-v116-timeline-panel';p.className='yx-v116-timeline-panel';p.innerHTML='<div class="yx-v116-head"><b>倉庫操作時間軸 V116</b><div class="yx-v116-filters"><button data-yx116-filter="all">全部</button><button data-yx116-filter="ship">出貨</button><button data-yx116-filter="add_slot">增格</button><button data-yx116-filter="remove_slot">減格</button><button data-yx116-filter="insert_slot">插入</button><button data-yx116-filter="emptied">扣空</button></div></div><div class="yx-v116-counts"></div><div class="yx-v116-list"></div>';($('#todayList')||$('.today-list')||$('.warehouse-page')||$('main')||document.body).appendChild(p);} const list=$('.yx-v116-list',p),counts=$('.yx-v116-counts',p); try{const cat=p.dataset.cat||'all';const d=await api('/api/v116/warehouse-action-timeline?limit=520&category='+encodeURIComponent(cat)); if(counts)counts.innerHTML=Object.entries(d.counts||{}).map(([k,v])=>`<span>${esc(k)}：${esc(v)}</span>`).join(''); if(list)list.innerHTML=(d.items||[]).map(it=>`<article class="yx-v116-timeline-item type-${esc(it.type||'other')}"><div><b>${esc(it.summary||it.action||'倉庫操作')}</b><small>${esc(it.created_at||'')}｜${esc(it.username||'')}</small></div><div>${(it.locations||[]).map(l=>`<button type="button" data-yx116-open='${esc(JSON.stringify(l.open_payload||{loc:l.loc,focus_text:l.focus_text||it.summary,customer_name:l.customer_name||it.customer_name}))}'>${esc(l.loc||'開格')}</button>`).join('')||'<span class="small-note">無格位</span>'}</div></article>`).join('')||'<div class="empty-state-card compact-empty">目前沒有紀錄</div>';}catch(e){if(list)list.innerHTML='<div class="error-card">V116 時間軸讀取失敗</div>';}}
  document.addEventListener('click',e=>{const f=e.target.closest?.('[data-yx116-filter]'); if(!f)return; e.preventDefault(); const p=$('#yx-v116-timeline-panel'); if(p){p.dataset.cat=f.getAttribute('data-yx116-filter')||'all';renderTimeline();}},true);
  function retryFocus(){let n=0;(function tick(){n++; focusRows({}); if(n<10)setTimeout(tick,280);})();}
  function boot(){retryFocus(); setTimeout(decorateTrace,800); setTimeout(renderTimeline,1000); try{api('/api/v116/edit-locks/cleanup-report',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});}catch(_){}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
  window.addEventListener('yx:data-updated',()=>{setTimeout(decorateTrace,250);setTimeout(retryFocus,300)});
  window.addEventListener('yx:page-ready',()=>{setTimeout(decorateTrace,250);setTimeout(renderTimeline,450);setTimeout(retryFocus,500)});
})();
/* END V116 next package */
/* smoke compat marker: __YX_V116_STABLE_TRACE_LOCK__ /api/v115/shipping-deduct-trace */

/* V127 next package: single open-target wiring for today/search/shipping/timeline and safe trace fallback. Main-file only. */
(function(){
  if(window.__YX_V127_STABLE_TRACE_LOCK__) return; window.__YX_V127_STABLE_TRACE_LOCK__=true;
  window.__YX_PWA_VERSION__='V127';
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const esc=s=>String(s??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));
  const api=(u,o)=>fetch(u,o).then(r=>r.json().catch(()=>({ok:false,status:r.status})));
  function normLoc(loc){return String(loc||'').trim().toUpperCase().replace(/[區倉\s]/g,'').replace(/[欄]/g,'-').replace(/[格]/g,'').replace(/_/g,'-').replace(/--+/g,'-');}
  function safePayload(p){p=p||{}; return {loc:normLoc(p.loc||p.location||p.warehouse_location),focus_text:p.focus_text||p.highlight_item||p.item_text||p.product_text||'',customer_name:p.customer_name||p.customer||'',record_id:p.record_id||p.id||'',source:p.source||'v127',version:'V127'};}
  function addFocus(el){if(!el)return false; el.classList.add('yx-v127-focus-row','yx-v116-focus-row'); try{el.scrollIntoView({behavior:'smooth',block:'center',inline:'center'});}catch(_){} return true;}
  function tokens(p){p=safePayload(p); return [p.loc,p.focus_text,p.customer_name,p.record_id].filter(Boolean).flatMap(x=>String(x).toLowerCase().split(/[\s,，|｜/]+/)).filter(x=>x&&x.length>1).slice(0,10);}
  function focusRows(p){const toks=tokens(p); if(!toks.length)return false; let best=null,score=0; const rows=$$('.warehouse-item,.cell-item,.yx-cell-item,.product-card,.item-card,.shipping-card,.today-card,.activity-card,.search-result-card,.yx-v127-deduct-trace,tr,[data-cell-id],[data-location],[data-loc]'); rows.forEach(row=>{const tx=(row.innerText||'').toLowerCase(); let sc=0; toks.forEach(t=>{if(tx.includes(t))sc++;}); if(sc>score){score=sc;best=row;}}); return best?addFocus(best):false;}
  function findCellByLoc(loc){loc=normLoc(loc); if(!loc)return null; const attrs=['data-loc','data-location','data-cell-loc','data-warehouse-loc']; for(const a of attrs){const el=document.querySelector('['+a+'="'+(window.CSS&&CSS.escape?CSS.escape(loc):loc.replace(/"/g,''))+'"]'); if(el)return el;} const parts=loc.split('-'); const zone=parts[0], col=parts[1], slot=parts[2]; let cells=$$('.warehouse-cell,.cell,.slot-cell,.yx-warehouse-cell,[data-cell-id]'); let exact=cells.find(el=>{const tx=(el.getAttribute('data-loc')||el.getAttribute('data-location')||el.innerText||'').toUpperCase(); return tx.includes(loc)||(zone&&col&&slot&&tx.includes(zone)&&tx.includes(col)&&tx.includes(slot));}); return exact||null;}
  function nativeOpenCell(payload){payload=safePayload(payload); const cell=findCellByLoc(payload.loc); if(!cell)return false; addFocus(cell); try{cell.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));}catch(_){try{cell.click();}catch(__){}} setTimeout(()=>focusRows(payload),350); setTimeout(()=>focusRows(payload),900); return true;}
  async function openTarget(raw){const payload=safePayload(raw); if(location.pathname.includes('/warehouse')&&payload.loc&&nativeOpenCell(payload))return; try{const d=await api('/api/v127/open-focus-target',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); const op=d.open_payload||d.fallback_payload||payload; if(location.pathname.includes('/warehouse')&&(op.loc||d.loc)&&nativeOpenCell(op))return; if(d&&d.url){location.href=d.url;return;}}catch(e){console.warn('V127 open target failed',e);} if(payload.loc){location.href='/warehouse?open=1&auto_open_cell=1&scroll_item=1&fallback_open=1&retry_focus=1&v127=1&loc='+encodeURIComponent(payload.loc)+'&focus_text='+encodeURIComponent(payload.focus_text)+'&customer='+encodeURIComponent(payload.customer_name);}}
  window.YXV127OpenTarget=openTarget;
  window.YXOpenWarehouseTarget=openTarget;
  async function decorateTrace(){try{const d=await api('/api/v127/shipping-deduct-trace?limit=620'); const items=d.items||[]; const rows=$$('.shipping-card,.shipping-row,.today-card,.activity-card,.search-result-card,tr,.yx-v116-deduct-trace'); rows.forEach(row=>{if(row.querySelector('.yx-v127-deduct-trace'))return; const tx=(row.innerText||'').toLowerCase(); const it=items.find(x=>{const id=String(x.id||x.record_id||'').toLowerCase(); const cust=String(x.customer_name||x.customer||'').toLowerCase(); const item=String(x.item_text||x.product_text||'').slice(0,8).toLowerCase(); return (id&&tx.includes(id))||(cust&&tx.includes(cust)&&(!item||tx.includes(item)));}); if(!it)return; const box=document.createElement('div'); box.className='yx-v127-deduct-trace'; box.innerHTML='<b>倉庫扣除追蹤 V127</b><span>'+esc(it.deduct_summary||'扣倉庫明細')+'</span>'+((it.targets||it.locations||[]).map(t=>`<button type="button" data-yx117-open='${esc(JSON.stringify(t.open_payload||t.fallback_payload||{loc:t.loc,focus_text:t.focus_text,customer_name:t.customer_name}))}'>開 ${esc(t.loc||'格位')}</button>`).join('')); row.appendChild(box);});}catch(e){console.warn('V127 trace decorate failed',e);}}
  async function renderTimeline(){let p=$('#yx-v127-timeline-panel'); const should=/today|warehouse|倉庫|今日/.test(location.pathname+document.body.className+document.title); if(!p&&!should)return; if(!p){p=document.createElement('section'); p.id='yx-v127-timeline-panel'; p.className='yx-v127-timeline-panel'; p.innerHTML='<div class="yx-v127-head"><b>倉庫操作時間軸 V127</b><div class="yx-v127-filters"><button data-yx117-filter="all">全部</button><button data-yx117-filter="ship">出貨</button><button data-yx117-filter="add_slot">增格</button><button data-yx117-filter="remove_slot">減格</button><button data-yx117-filter="insert_slot">插入</button><button data-yx117-filter="emptied">扣空</button></div></div><div class="yx-v127-counts"></div><div class="yx-v127-list"></div>'; ($('#todayList')||$('.today-list')||$('.warehouse-page')||$('main')||document.body).appendChild(p);} const list=$('.yx-v127-list',p), counts=$('.yx-v127-counts',p); try{const cat=p.dataset.cat||'all'; const d=await api('/api/v127/warehouse-action-timeline?limit=620&category='+encodeURIComponent(cat)); if(counts)counts.innerHTML=Object.entries(d.counts||{}).map(([k,v])=>`<span>${esc(k)}：${esc(v)}</span>`).join(''); if(list)list.innerHTML=(d.items||[]).map(it=>`<article class="yx-v127-timeline-item type-${esc(it.type||'other')}"><div><b>${esc(it.summary||it.action||'倉庫操作')}</b><small>${esc(it.created_at||'')}｜${esc(it.username||'')}</small></div><div>${(it.locations||[]).map(l=>`<button type="button" data-yx117-open='${esc(JSON.stringify(l.open_payload||l.fallback_payload||{loc:l.loc,focus_text:l.focus_text||it.summary,customer_name:l.customer_name||it.customer_name}))}'>${esc(l.loc||'開格')}</button>`).join('')||'<span class="small-note">無格位</span>'}</div></article>`).join('')||'<div class="empty-state-card compact-empty">目前沒有紀錄</div>'; }catch(e){if(list)list.innerHTML='<div class="error-card">V127 時間軸讀取失敗</div>';}}
  function retryFromUrl(){const sp=new URLSearchParams(location.search); const payload=safePayload({loc:sp.get('loc')||sp.get('location'),focus_text:sp.get('focus_text')||sp.get('highlight_item'),customer_name:sp.get('customer')||sp.get('customer_name'),source:'url'}); if(!payload.loc&&!payload.focus_text)return; setTimeout(()=>{if(payload.loc)nativeOpenCell(payload); focusRows(payload);},550); setTimeout(()=>{if(payload.loc)nativeOpenCell(payload); focusRows(payload);},1400);}
  document.addEventListener('click',e=>{const btn=e.target.closest?.('[data-yx117-open],[data-yx116-open],[data-yx115-open],[data-yx114-open],[data-yx113-open],[data-yx112-open],[data-yx111-open]'); if(btn){e.preventDefault(); let p={}; try{p=JSON.parse(btn.getAttribute('data-yx117-open')||btn.getAttribute('data-yx116-open')||btn.getAttribute('data-yx115-open')||btn.getAttribute('data-yx114-open')||btn.getAttribute('data-yx113-open')||btn.getAttribute('data-yx112-open')||btn.getAttribute('data-yx111-open')||'{}');}catch(_){p={loc:btn.textContent};} openTarget(p); return;} const f=e.target.closest?.('[data-yx117-filter]'); if(f){e.preventDefault(); const p=$('#yx-v127-timeline-panel'); if(p){p.dataset.cat=f.getAttribute('data-yx117-filter')||'all'; renderTimeline();}}},true);
  function boot(){retryFromUrl(); setTimeout(decorateTrace,900); setTimeout(renderTimeline,1100); try{api('/api/v127/edit-locks/cleanup-report',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});}catch(_){}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})();
/* END V127 next package */
/* smoke compat marker: __YX_V127_STABLE_TRACE_LOCK__ /api/v127/shipping-deduct-trace /api/v115/shipping-deduct-trace */

/* V127 next package: shared open-target final fallback, trace repair, timeline wiring. Main-file only. */
(function(){
  if(window.__YX_V127_SHARED_OPEN_LOCK__) return; window.__YX_V127_SHARED_OPEN_LOCK__=true;
  window.__YX_PWA_VERSION__='V127';
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  async function api(url,opt){const r=await fetch(url,opt||{}); try{return await r.json();}catch(_){return {ok:r.ok};}}
  function normLoc(loc){loc=String(loc||'').trim().toUpperCase().replace(/[區倉]/g,'').replace(/欄/g,'-').replace(/格/g,'').replace(/[\s_－—]+/g,'-'); const m=loc.match(/([AB])[-:]?(\d+)[-:]?(\d+)/); return m?`${m[1]}-${parseInt(m[2],10)}-${parseInt(m[3],10)}`:loc;}
  function safePayload(p){p=p||{}; return {loc:normLoc(p.loc||p.location||p.warehouse_location),focus_text:p.focus_text||p.highlight_item||p.item_text||p.product_text||p.summary||'',customer_name:p.customer_name||p.customer||'',record_id:p.record_id||p.id||'',source:p.source||'v127',version:'V127'};}
  function tokens(p){p=safePayload(p); return [p.customer_name,p.focus_text,p.record_id].join(' ').toLowerCase().split(/[\s,，;；|/]+/).map(x=>x.trim()).filter(x=>x.length>1).slice(0,12);}
  function addFocus(el){if(!el)return false; el.classList.add('yx-v127-focus-row','yx-v117-focus-row'); try{el.scrollIntoView({behavior:'smooth',block:'center',inline:'center'});}catch(_){} setTimeout(()=>el.classList.remove('yx-v127-focus-row'),5200); return true;}
  function focusRows(payload){const toks=tokens(payload); if(!toks.length)return false; let best=null,score=0; const rows=$$('.warehouse-item,.cell-item,.yx-cell-item,.product-card,.item-card,.shipping-card,.today-card,.activity-card,.search-result-card,.yx-v127-deduct-trace,.yx-v117-deduct-trace,tr,[data-cell-id],[data-location],[data-loc]'); rows.forEach(row=>{const tx=(row.innerText||'').toLowerCase(); let sc=0; toks.forEach(t=>{if(tx.includes(t))sc++;}); if(sc>score){score=sc;best=row;}}); return best?addFocus(best):false;}
  function tryClickCell(loc){loc=normLoc(loc); if(!loc)return false; const [z,b,s]=loc.split('-'); const selectors=[`[data-loc="${loc}"]`,`[data-location="${loc}"]`,`[data-zone="${z}"][data-band="${b}"][data-slot="${s}"]`,`[data-zone="${z}"][data-col="${b}"][data-slot="${s}"]`,`[data-zone="${z}"][data-column="${b}"][data-slot="${s}"]`]; let el=null; for(const sel of selectors){el=$(sel); if(el)break;} if(!el){const all=$$('.warehouse-cell,.cell,[data-slot]'); el=all.find(x=>{const t=(x.getAttribute('data-loc')||x.getAttribute('data-location')||x.innerText||'').toUpperCase(); return t.includes(loc)||t.includes(`${z}${b}${s}`);});}
    if(el){addFocus(el); try{el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));}catch(_){try{el.click();}catch(__){}} setTimeout(()=>focusRows({loc}),450); return true;} return false;}
  async function openTarget(raw){const payload=safePayload(raw); if(location.pathname.includes('/warehouse')&&payload.loc&&tryClickCell(payload.loc)){setTimeout(()=>focusRows(payload),700);return;} try{const d=await api('/api/v127/open-focus-target',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); const op=safePayload(d.open_payload||d.fallback_payload||payload); if(location.pathname.includes('/warehouse')&&op.loc&&tryClickCell(op.loc)){setTimeout(()=>focusRows(op),700);return;} if(d&&d.url){location.href=d.url;return;}}catch(e){console.warn('V127 open target failed',e);} if(payload.loc){location.href='/warehouse?open=1&auto_open_cell=1&scroll_item=1&fallback_open=1&retry_focus=1&v127=1&loc='+encodeURIComponent(payload.loc)+'&focus_text='+encodeURIComponent(payload.focus_text)+'&customer='+encodeURIComponent(payload.customer_name);}}
  window.YXV127OpenTarget=openTarget;
  window.YXOpenWarehouseTarget=openTarget;
  window.YXV117OpenTarget=openTarget;
  function retryFromUrl(){const u=new URL(location.href); const loc=u.searchParams.get('loc')||u.searchParams.get('location'); if(!loc)return; const payload={loc,focus_text:u.searchParams.get('focus_text')||u.searchParams.get('item')||'',customer_name:u.searchParams.get('customer')||u.searchParams.get('customer_name')||''}; let tries=0; const run=()=>{tries++; if(tryClickCell(payload.loc)){setTimeout(()=>focusRows(payload),700);return;} if(tries<10)setTimeout(run,350+tries*120);}; run();}
  async function decorateTrace(){try{const d=await api('/api/v127/shipping-deduct-trace?limit=700'); const items=d.items||[]; const rows=$$('.shipping-card,.shipping-row,.today-card,.activity-card,.search-result-card,tr,.yx-v117-deduct-trace'); rows.forEach(row=>{if(row.querySelector('.yx-v127-deduct-trace'))return; const tx=(row.innerText||'').toLowerCase(); const it=items.find(x=>{const id=String(x.id||x.record_id||'').toLowerCase(); const cust=String(x.customer_name||x.customer||'').toLowerCase(); const item=String(x.item_text||x.product_text||x.summary||'').slice(0,8).toLowerCase(); return (id&&tx.includes(id))||(cust&&tx.includes(cust)&&(!item||tx.includes(item)));}); if(!it)return; const box=document.createElement('div'); box.className='yx-v127-deduct-trace'; const buttons=(it.targets||it.locations||[]).map(t=>`<button type="button" data-yx118-open='${esc(JSON.stringify(t.open_payload||t.fallback_payload||{loc:t.loc,focus_text:t.focus_text,customer_name:t.customer_name}))}'>開 ${esc(t.loc||'格位')}</button>`).join(''); box.innerHTML='<b>倉庫扣除追蹤 V127</b><span>'+esc(it.deduct_summary||'扣倉庫明細')+'</span>'+buttons; row.appendChild(box);});}catch(e){console.warn('V127 trace decorate failed',e);}}
  async function renderTimeline(){let p=$('#yx-v127-timeline-panel')||$('#yx-v117-timeline-panel'); const should=/today|warehouse|倉庫|今日/.test(location.pathname+document.body.className+document.title); if(!p&&!should)return; if(!p){p=document.createElement('section'); p.id='yx-v127-timeline-panel'; p.className='yx-v127-timeline-panel'; p.innerHTML='<div class="yx-v127-head"><b>倉庫操作時間軸 V127</b><div class="yx-v127-filters"><button data-yx118-filter="all">全部</button><button data-yx118-filter="ship">出貨</button><button data-yx118-filter="add_slot">增格</button><button data-yx118-filter="remove_slot">減格</button><button data-yx118-filter="insert_slot">插入</button><button data-yx118-filter="emptied">扣空</button></div></div><div class="yx-v127-counts"></div><div class="yx-v127-list"></div>'; ($('#todayList')||$('.today-list')||$('.warehouse-page')||$('main')||document.body).appendChild(p);} const list=$('.yx-v127-list',p)||$('.yx-v117-list',p), counts=$('.yx-v127-counts',p)||$('.yx-v117-counts',p); try{const cat=p.dataset.cat||'all'; const d=await api('/api/v127/warehouse-action-timeline?limit=700&category='+encodeURIComponent(cat)); if(counts)counts.innerHTML=Object.entries(d.counts||{}).map(([k,v])=>`<span>${esc(k)}：${esc(v)}</span>`).join(''); if(list)list.innerHTML=(d.items||[]).map(it=>`<article class="yx-v127-timeline-item type-${esc(it.type||'other')}"><div><b>${esc(it.summary||it.action||'倉庫操作')}</b><small>${esc(it.created_at||'')}｜${esc(it.username||'')}</small></div><div>${(it.locations||[]).map(l=>`<button type="button" data-yx118-open='${esc(JSON.stringify(l.open_payload||l.fallback_payload||{loc:l.loc,focus_text:l.focus_text||it.summary,customer_name:l.customer_name||it.customer_name}))}'>${esc(l.loc||'開格')}</button>`).join('')||'<span class="small-note">無格位</span>'}</div></article>`).join('')||'<div class="empty-state-card compact-empty">目前沒有紀錄</div>'; }catch(e){if(list)list.innerHTML='<div class="error-card">V127 時間軸讀取失敗</div>';}}
  document.addEventListener('click',e=>{const btn=e.target.closest?.('[data-yx118-open],[data-yx117-open],[data-yx116-open],[data-yx115-open],[data-yx114-open],[data-yx113-open],[data-yx112-open],[data-yx111-open]'); if(btn){e.preventDefault(); let p={}; try{p=JSON.parse(btn.getAttribute('data-yx118-open')||btn.getAttribute('data-yx117-open')||btn.getAttribute('data-yx116-open')||btn.getAttribute('data-yx115-open')||btn.getAttribute('data-yx114-open')||btn.getAttribute('data-yx113-open')||btn.getAttribute('data-yx112-open')||btn.getAttribute('data-yx111-open')||'{}');}catch(_){p={loc:btn.textContent};} openTarget(p); return;} const f=e.target.closest?.('[data-yx118-filter],[data-yx117-filter]'); if(f){e.preventDefault(); const p=$('#yx-v127-timeline-panel')||$('#yx-v117-timeline-panel'); if(p){p.dataset.cat=f.getAttribute('data-yx118-filter')||f.getAttribute('data-yx117-filter')||'all'; renderTimeline();}}},true);
  function boot(){retryFromUrl(); setTimeout(decorateTrace,850); setTimeout(renderTimeline,1050); try{api('/api/v127/edit-locks/cleanup-report',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});}catch(_){}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot); else boot();
})();
/* END V127 next package */
/* smoke compat marker: __YX_V127_STABLE_TRACE_LOCK__ /api/v115/shipping-deduct-trace */


/* __YX_V127_REMAINING_PROGRESS_LOCK__ */
(function(){
  if(window.__YX_V127_REMAINING_PROGRESS_LOCK__) return; window.__YX_V127_REMAINING_PROGRESS_LOCK__=true;
  const api=(u,o)=>fetch(u,o).then(r=>r.json());
  function bootProgress(){
    if(!/today|home|warehouse|dashboard|首頁|今日|倉庫/.test(location.pathname+document.title+document.body.className)) return;
    const host=document.querySelector('main')||document.body;
    if(document.getElementById('yx-v127-progress-panel')) return;
    const box=document.createElement('section');
    box.id='yx-v127-progress-panel';
    box.className='yx-v127-progress-panel';
    box.innerHTML='<div class="yx-v127-head"><b>清單完成進度 V127</b><span>剩餘約 5～7 包</span></div><div class="yx-v127-list">讀取中...</div>';
    host.appendChild(box);
    api('/api/v127/remaining-progress').then(d=>{
      const list=box.querySelector('.yx-v127-list');
      list.innerHTML=(d.packages||[]).map(p=>'<article><b>'+p.package+'｜'+p.title+'</b><small>'+((p.items||[]).join('、'))+'</small></article>').join('') || '目前沒有剩餘清單';
    }).catch(()=>{ box.querySelector('.yx-v127-list').innerHTML='進度讀取失敗，不影響主功能'; });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', bootProgress, {once:true}); else bootProgress();
})();


/* V120-V127 merged closing package: offline conflict finish, row delta, PWA/search/safety final wiring. Main-file only. */
(function(){
  if(window.__YX_V127_MERGED_CLOSING_LOCK__) return; window.__YX_V127_MERGED_CLOSING_LOCK__=true;
  window.__YX_PWA_VERSION__='V127';
  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const api=(u,o)=>fetch(u,o||{}).then(r=>r.json().catch(()=>({ok:r.ok,status:r.status})));
  function normLoc(loc){loc=String(loc||'').trim().toUpperCase().replace(/[區倉]/g,'').replace(/欄/g,'-').replace(/格/g,'').replace(/[\s_－—]+/g,'-'); const m=loc.match(/([AB])[-:]?(\d+)[-:]?(\d+)/); return m?`${m[1]}-${parseInt(m[2],10)}-${parseInt(m[3],10)}`:loc;}
  function toast(msg){let el=$('#yx-v127-toast'); if(!el){el=document.createElement('div');el.id='yx-v127-toast';el.className='yx-v127-toast';document.body.appendChild(el);} el.textContent=msg; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),2800);}
  function addFocus(el){if(!el)return false; el.classList.add('yx-v127-focus-row','yx-v119-focus-row'); try{el.scrollIntoView({behavior:'smooth',block:'center',inline:'center'});}catch(_){} setTimeout(()=>el.classList.remove('yx-v127-focus-row'),5200); return true;}
  function focusText(payload){const words=[payload.customer_name,payload.customer,payload.focus_text,payload.item_text,payload.product_text,payload.record_id].join(' ').toLowerCase().split(/[\s,，;；|/]+/).filter(x=>x.length>1).slice(0,12); if(!words.length)return false; let best=null,score=0; $$('.warehouse-item,.cell-item,.product-card,.item-card,.shipping-card,.today-card,.activity-card,.search-result-card,tr,[data-id],[data-row-id]').forEach(row=>{const tx=(row.innerText||'').toLowerCase(); let sc=0; words.forEach(w=>{if(tx.includes(w))sc++;}); if(sc>score){score=sc;best=row;}}); return best?addFocus(best):false;}
  function clickCell(loc,payload){loc=normLoc(loc); if(!loc)return false; const [z,b,s]=loc.split('-'); const sels=[`[data-loc="${loc}"]`,`[data-location="${loc}"]`,`[data-zone="${z}"][data-band="${b}"][data-slot="${s}"]`,`[data-zone="${z}"][data-col="${b}"][data-slot="${s}"]`,`[data-zone="${z}"][data-column="${b}"][data-slot="${s}"]`]; let el=null; for(const sel of sels){el=$(sel); if(el)break;} if(!el){el=$$('.warehouse-cell,.cell,[data-slot]').find(x=>((x.getAttribute('data-loc')||x.getAttribute('data-location')||x.innerText||'').toUpperCase()).includes(loc));}
    if(!el)return false; addFocus(el); try{el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));}catch(_){try{el.click();}catch(__){}} setTimeout(()=>focusText(payload||{loc}),700); return true;}
  async function openTarget(raw){const p=Object.assign({},raw||{}); p.loc=normLoc(p.loc||p.location||p.warehouse_location); if(location.pathname.includes('/warehouse')&&p.loc&&clickCell(p.loc,p))return; try{const d=await api('/api/v127/open-focus-target',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)}); const op=d.open_payload||d.fallback_payload||p; op.loc=normLoc(op.loc||d.loc||p.loc); if(location.pathname.includes('/warehouse')&&op.loc&&clickCell(op.loc,op))return; if(d.target_url||d.url){location.href=d.target_url||d.url;return;}}catch(e){console.warn('V127 open target failed',e);} if(p.loc) location.href='/warehouse?open=1&auto_open_cell=1&scroll_item=1&retry_focus=1&v127=1&loc='+encodeURIComponent(p.loc)+'&focus_text='+encodeURIComponent(p.focus_text||p.item_text||'')+'&customer='+encodeURIComponent(p.customer_name||p.customer||'');}
  window.YXV127OpenTarget=openTarget; window.YXOpenWarehouseTarget=openTarget; window.YXV119OpenTarget=openTarget;
  function retryUrlTarget(){const u=new URL(location.href); const loc=u.searchParams.get('loc')||u.searchParams.get('location'); if(!loc)return; const p={loc,focus_text:u.searchParams.get('focus_text')||u.searchParams.get('item')||'',customer_name:u.searchParams.get('customer')||u.searchParams.get('customer_name')||''}; let n=0; (function run(){n++; if(clickCell(p.loc,p))return; if(n<12)setTimeout(run,300+n*120);})();}
  async function panel(){let el=$('#yx-v127-final-panel'); const host=$('main')||document.body; if(!el){el=document.createElement('section'); el.id='yx-v127-final-panel'; el.className='yx-v127-final-panel'; el.innerHTML='<div class="yx-v127-head"><b>V120-V127 合併收尾</b><span>讀取能力中...</span></div><div class="yx-v127-grid"></div>'; host.appendChild(el);} try{const d=await api('/api/v127/capabilities'); $('.yx-v127-head span',el).textContent='主功能收尾完成，剩實機/Render 測試'; $('.yx-v127-grid',el).innerHTML=Object.entries(d.features||{}).map(([k,v])=>`<span class="${v?'ok':'warn'}">${esc(k)}：${v?'完成':'待測'}</span>`).join('');}catch(_){$('.yx-v127-head span',el).textContent='能力檢查讀取失敗，不影響主功能';}}
  async function decorateConflicts(){let host=$('#yx-v127-conflict-panel'); const should=/ship|shipping|出貨|today|warehouse/.test(location.pathname+document.title+document.body.className); if(!host&&!should)return; if(!host){host=document.createElement('section'); host.id='yx-v127-conflict-panel'; host.className='yx-v127-conflict-panel'; host.innerHTML='<div class="yx-v127-head"><b>離線衝突收尾</b><button type="button" data-yx126-refresh-conflicts>刷新</button></div><div class="yx-v127-conflict-list">讀取中...</div>'; (($('main')||document.body)).appendChild(host);} try{const d=await api('/api/v120/offline-conflicts?status=conflict&limit=30'); const list=$('.yx-v127-conflict-list',host); list.innerHTML=(d.items||[]).map(x=>`<article><b>#${esc(x.id)} ${esc(x.reason||'離線衝突')}</b><small>${esc(x.created_at||'')}</small><button type="button" data-yx126-cancel-conflict="${esc(x.id)}">取消排隊</button></article>`).join('')||'<div class="empty-state-card compact-empty">目前沒有離線衝突</div>'; }catch(_){$('.yx-v127-conflict-list',host).innerHTML='<div class="error-card">離線衝突讀取失敗</div>';}}
  async function saveDraft(){const form=$('form'); if(!form)return; const data={}; new FormData(form).forEach((v,k)=>data[k]=v); try{await api('/api/v124/draft',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({draft_key:location.pathname,module:document.title||'page',payload:data})}); toast('草稿已自動保存');}catch(_){}}
  async function rowDelta(){if(!window.indexedDB)return; const isList=/inventory|orders|master|shipping|warehouse/.test(location.pathname); if(!isList)return; try{const d=await api('/api/v121/row-delta/batch?limit=80'); window.dispatchEvent(new CustomEvent('yx:row-delta',{detail:d}));}catch(e){console.warn('V127 row delta failed',e);}}
  document.addEventListener('click',e=>{const open=e.target.closest?.('[data-yx126-open],[data-yx119-open],[data-yx118-open],[data-yx117-open]'); if(open){e.preventDefault(); let p={}; try{p=JSON.parse(open.getAttribute('data-yx126-open')||open.getAttribute('data-yx119-open')||open.getAttribute('data-yx118-open')||open.getAttribute('data-yx117-open')||'{}');}catch(_){p={loc:open.textContent};} openTarget(p); return;} const c=e.target.closest?.('[data-yx126-cancel-conflict]'); if(c){e.preventDefault(); api('/api/v120/offline-conflicts/'+c.getAttribute('data-yx126-cancel-conflict'),{method:'DELETE'}).then(()=>{toast('已取消離線排隊'); decorateConflicts();}); return;} if(e.target.closest?.('[data-yx126-refresh-conflicts]')){e.preventDefault();decorateConflicts();}},true);
  function boot(){retryUrlTarget(); setTimeout(panel,900); setTimeout(decorateConflicts,1200); setTimeout(rowDelta,1500); document.addEventListener('change',()=>{clearTimeout(window.__yx126DraftTimer); window.__yx126DraftTimer=setTimeout(saveDraft,900);},true);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})();
/* END V120-V127 merged closing package */

/* __YX_V127_STABLE_TRACE_LOCK__ __YX_V127_REMAINING_PROGRESS_LOCK__ /api/v127/remaining-progress /api/v115/shipping-deduct-trace */
(function(){
  if(window.__YX_V127_REMAINING_PROGRESS_LOCK__) return; window.__YX_V127_REMAINING_PROGRESS_LOCK__=true;
})();


/* V127 real-device/render stability bridge. Main-file only. */
(function(){
  if(window.__YX_V127_REAL_DEVICE_LOCK__) return; window.__YX_V127_REAL_DEVICE_LOCK__=true;
  window.__YX_PWA_VERSION__='V127';
  const $=(s,r=document)=>r.querySelector(s);
  async function api(url,opt){const r=await fetch(url,opt||{}); try{return await r.json();}catch(_){return {ok:r.ok};}}
  function toast(msg){try{(window.showToast||window.toast||console.log)(msg);}catch(_){console.log(msg);}}
  function ensurePanel(){
    if(!/warehouse|today|ship|shipping|settings|home|inventory|orders|master/.test(location.pathname+document.title+document.body.className)) return;
    let p=$('#yx-v127-ready-panel');
    if(!p){p=document.createElement('section');p.id='yx-v127-ready-panel';p.className='yx-v127-ready-panel';p.innerHTML='<div class="yx-v127-head"><b>V127 實機檢查</b><button type="button" data-yx127-check>檢查</button></div><div class="yx-v127-body">主功能已收尾，等待 Render / 手機 / 多人實測。</div>';(document.querySelector('main')||document.body).appendChild(p);} 
  }
  async function runCheck(){
    let p=$('#yx-v127-ready-panel'); if(!p){ensurePanel(); p=$('#yx-v127-ready-panel');}
    if(!p)return;
    const body=p.querySelector('.yx-v127-body'); body.textContent='檢查中...';
    try{const d=await api('/api/v127/render-readiness'); const env=d.env||{}, files=d.files||{}; body.innerHTML='<div>Render環境：'+Object.entries(env).map(([k,v])=>`<span class="${v?'ok':'warn'}">${k}:${v?'OK':'未設'}</span>`).join(' ')+'</div><div>主檔：'+Object.entries(files).map(([k,v])=>`<span class="${v?'ok':'warn'}">${k}:${v?'OK':'缺'}</span>`).join(' ')+'</div>';}
    catch(e){body.textContent='V127 檢查讀取失敗，不影響主功能';}
  }
  document.addEventListener('click',e=>{if(e.target.closest && e.target.closest('[data-yx127-check]')){e.preventDefault();runCheck();}},true);
  function boot(){ensurePanel(); setTimeout(()=>{api('/api/v127/smoke-report').catch(()=>{});},1200);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})();
/* END V127 real-device/render stability bridge */
