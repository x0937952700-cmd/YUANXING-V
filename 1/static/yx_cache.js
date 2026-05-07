/* 沅興木業 IndexedDB cache + sync status (mainfile infra, no overlay/hardlock/timer/observer) */
(function(){
  const DB_NAME='yx_cache_v1'; const STORE='api_cache'; const QUEUE='mutation_queue'; const VERSION=2;
  const CACHEABLE=['/api/inventory','/api/orders','/api/master_orders','/api/warehouse','/api/today-changes','/api/shipping_records'];
  const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  function isGet(opt){ return !opt || !opt.method || String(opt.method).toUpperCase()==='GET'; }
  function normKey(url){ try{ const u=new URL(url,location.origin); u.searchParams.delete('ts'); u.searchParams.delete('_'); return u.pathname+u.search; }catch(_){ return String(url||''); } }
  function isCacheable(url,opt){ if(!isGet(opt)) return false; const k=normKey(url); return CACHEABLE.some(p=>k===p || k.startsWith(p+'?')); }
  function openDB(){ return new Promise((resolve,reject)=>{ if(!('indexedDB' in window)) return reject(new Error('IndexedDB unavailable')); const req=indexedDB.open(DB_NAME,VERSION); req.onupgradeneeded=()=>{ const db=req.result; if(!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE,{keyPath:'key'}); if(!db.objectStoreNames.contains(QUEUE)) db.createObjectStore(QUEUE,{keyPath:'id'}); }; req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error||new Error('IndexedDB open failed')); }); }
  async function idbGet(key){ const db=await openDB(); return new Promise((resolve,reject)=>{ const tx=db.transaction(STORE,'readonly'); const req=tx.objectStore(STORE).get(key); req.onsuccess=()=>resolve(req.result||null); req.onerror=()=>reject(req.error); }); }
  async function idbSet(key,data){ const db=await openDB(); return new Promise((resolve,reject)=>{ const tx=db.transaction(STORE,'readwrite'); const req=tx.objectStore(STORE).put({key,data,updated_at:new Date().toISOString()}); req.onsuccess=()=>resolve(true); req.onerror=()=>reject(req.error); }); }
  function statusEl(){ let el=document.getElementById('yx-sync-status'); if(el) return el; el=document.createElement('div'); el.id='yx-sync-status'; el.className='yx-sync-status'; el.textContent='同步中…'; document.addEventListener('DOMContentLoaded',()=>document.body.appendChild(el),{once:true}); if(document.body) document.body.appendChild(el); return el; }
  function setStatus(text,type){ try{ const el=statusEl(); el.textContent=text; el.dataset.type=type||'ok'; }catch(_){} }
  async function queuePut(item){ const db=await openDB(); return new Promise((resolve,reject)=>{ const tx=db.transaction(QUEUE,'readwrite'); const req=tx.objectStore(QUEUE).put(item); req.onsuccess=()=>resolve(true); req.onerror=()=>reject(req.error); }); }
  async function queueAll(){ const db=await openDB(); return new Promise((resolve,reject)=>{ const tx=db.transaction(QUEUE,'readonly'); const req=tx.objectStore(QUEUE).getAll(); req.onsuccess=()=>resolve(req.result||[]); req.onerror=()=>reject(req.error); }); }
  async function queueDelete(id){ const db=await openDB(); return new Promise((resolve,reject)=>{ const tx=db.transaction(QUEUE,'readwrite'); const req=tx.objectStore(QUEUE).delete(id); req.onsuccess=()=>resolve(true); req.onerror=()=>reject(req.error); }); }
  function conflictPanel(){ let el=document.getElementById('yx-offline-conflict-panel'); if(el) return el; el=document.createElement('div'); el.id='yx-offline-conflict-panel'; el.className='modal hidden yx-offline-conflict-panel'; el.innerHTML='<div class="modal-card glass yx-offline-conflict-card"><div class="modal-head"><div class="section-title">離線衝突清單</div><button type="button" class="ghost-btn small-btn" data-yx-conflict-close>關閉</button></div><div class="small-note">恢復網路後重新檢查 PostgreSQL 數量，以下排隊項目沒有直接執行，避免扣錯數量。</div><div id="yx-offline-conflict-list" class="card-list"></div><div class="btn-row"><button type="button" class="ghost-btn" data-yx-conflict-refresh>重新整理商品</button><button type="button" class="ghost-btn danger-btn" data-yx-conflict-clear-all>取消所有衝突排隊</button></div></div>'; document.body.appendChild(el); el.addEventListener('click', async ev=>{ if(ev.target===el||ev.target.closest('[data-yx-conflict-close]')) el.classList.add('hidden'); const one=ev.target.closest('[data-yx-conflict-cancel]'); if(one){ await queueDelete(one.dataset.yxConflictCancel); await openConflictPanel(); await refreshQueueChip(); } if(ev.target.closest('[data-yx-conflict-refresh]')){ try{ await window.YXCacheSync?.syncNow?.(true); setStatus('已重新整理商品資料','ok'); }catch(_){} } if(ev.target.closest('[data-yx-conflict-clear-all]')){ const rows=await queueAll(); for(const r of rows.filter(x=>x&&x.status==='conflict')) await queueDelete(r.id); await openConflictPanel(); await refreshQueueChip(); } }); return el; }
  async function openConflictPanel(){ const el=conflictPanel(); const box=document.getElementById('yx-offline-conflict-list'); const rows=(await queueAll()).filter(x=>x&&x.status==='conflict'); if(!rows.length){ box.innerHTML='<div class="empty-state-card compact-empty">目前沒有離線衝突</div>'; el.classList.remove('hidden'); return; } box.innerHTML=rows.map(item=>{ let body={}; try{ body=JSON.parse(item.body||'{}'); }catch(_){} const conflicts=Array.isArray(item.conflicts)?item.conflicts:[]; const detail=conflicts.length?conflicts.map(c=>'<li>'+esc(c.product_text||c.message||'商品數量不足')+(c.selected_available!=null?'｜可用 '+esc(c.selected_available):'')+'</li>').join(''):'<li>'+esc(item.conflict_message||'排隊操作未執行')+'</li>'; return '<div class="deduct-card yx-offline-conflict-item"><strong>'+esc(body.customer_name||item.url||'離線操作')+'</strong><div class="small-note">'+esc(item.conflict_message||'離線衝突')+'</div><ul>'+detail+'</ul><div class="btn-row compact-row"><button type="button" class="ghost-btn danger-btn" data-yx-conflict-cancel="'+esc(item.id)+'">取消這筆排隊</button></div></div>'; }).join(''); el.classList.remove('hidden'); }
  function queueChip(){ let el=document.getElementById('yx-offline-queue-chip'); if(el) return el; el=document.createElement('button'); el.type='button'; el.id='yx-offline-queue-chip'; el.className='yx-offline-queue-chip'; el.textContent='離線佇列 0 筆'; el.addEventListener('click',async()=>{ const rows=await queueAll(); if(rows.some(x=>x&&x.status==='conflict')) await openConflictPanel(); else await drainQueue(true); }); if(document.body) document.body.appendChild(el); else document.addEventListener('DOMContentLoaded',()=>document.body.appendChild(el),{once:true}); return el; }
  async function refreshQueueChip(){ try{ const rows=await queueAll(); const conflicts=rows.filter(x=>x&&x.status==='conflict').length; const el=queueChip(); el.textContent=conflicts?('離線衝突 '+conflicts+' 筆｜點開處理'):('離線佇列 '+rows.length+' 筆'); el.dataset.conflicts=String(conflicts); el.classList.toggle('show', rows.length>0); el.classList.toggle('conflict', conflicts>0); }catch(_e){} }
  function mutationCanQueue(url,opt){ const method=String(opt?.method||'GET').toUpperCase(); if(!['POST','PUT','DELETE'].includes(method)) return false; const k=normKey(url); return ['/api/ship','/api/inventory','/api/orders','/api/master_orders','/api/warehouse/cell','/api/warehouse/add-slot','/api/warehouse/remove-slot','/api/warehouse/bulk-add-slots','/api/warehouse/bulk-remove-slots','/api/warehouse/mark-cell','/api/customer-items/batch-material','/api/customer-items/batch-zone','/api/customer-items/batch-delete','/api/customer-items/batch-update'].some(p=>k===p||k.startsWith(p+'/')||k.startsWith(p+'?')); }
  async function enqueueMutation(url,opt,reason){ const item={id:'q_'+Date.now()+'_'+Math.random().toString(16).slice(2), url:normKey(url), method:String(opt?.method||'POST').toUpperCase(), body: typeof opt?.body==='string'?opt.body:JSON.stringify(opt?.body||{}), created_at:new Date().toISOString(), reason:String(reason||'offline')}; await queuePut(item); await refreshQueueChip(); setStatus('離線模式｜操作已排隊','offline'); return item; }
  async function validateQueuedMutation(item){
    if(!item || normKey(item.url)!=='/api/ship') return {success:true};
    try{
      const res=await rawFetch('/api/ship/offline-validate',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-YX-Offline-Validate':'1'},body:item.body});
      const data=await res.clone().json().catch(()=>({}));
      if(res.ok && data.success!==false) return {success:true,data};
      return {success:false, conflict:!!data.conflict, data, error:data.error||data.message||'離線出貨驗證失敗'};
    }catch(e){ return {success:false, retry:true, error:e.message||'離線出貨驗證失敗'}; }
  }
  async function drainQueue(manual){ if(!navigator.onLine && !manual){ await refreshQueueChip(); return {success:false, offline:true}; } const rows=await queueAll(); const pending=rows.filter(x=>x.status!=='conflict'); if(!pending.length){ await refreshQueueChip(); return {success:true, count:0}; } setStatus('同步離線佇列…','syncing'); let ok=0; for(const item of pending.sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)))){ try{ const check=await validateQueuedMutation(item); if(!check.success){ if(check.conflict){ item.status='conflict'; item.conflict_message=check.error||'離線出貨衝突，已停止扣除'; item.conflicts=check.data&&check.data.conflicts; item.updated_at=new Date().toISOString(); await queuePut(item); setStatus(item.conflict_message,'error'); continue; } break; } const res=await rawFetch(item.url,{method:item.method,credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-YX-Offline-Replay':'1'},body:item.body}); const data=await res.clone().json().catch(()=>({})); if(res.ok && data.success!==false){ await queueDelete(item.id); ok++; } else { item.status='conflict'; item.conflict_message=data.error||data.message||'離線佇列同步失敗'; item.updated_at=new Date().toISOString(); await queuePut(item); break; } }catch(_e){ break; } } await refreshQueueChip(); const left=(await queueAll()).length; setStatus(ok?'離線佇列已同步 '+ok+' 筆':(left?'離線佇列尚未同步':'離線佇列已處理'), ok?'ok':'offline'); return {success:true, count:ok}; }
  window.YXCache={get:idbGet,set:idbSet,key:normKey,setStatus,enqueueMutation,drainQueue,queueAll,queueDelete,openConflictPanel,refreshQueueChip,mergeRows:async function(table,rows){ const key='sync:table:'+table; const cached=await idbGet(key); const oldRows=(cached&&cached.data&&Array.isArray(cached.data.rows))?cached.data.rows:[]; const map=new Map(oldRows.map(r=>[String(r.id||r.key||JSON.stringify(r)),r])); (rows||[]).forEach(r=>map.set(String(r.id||r.key||JSON.stringify(r)),r)); const data={rows:Array.from(map.values()),server_time:new Date().toISOString()}; await idbSet(key,data); return data; }};
  const rawFetch=window.fetch.bind(window);
  window.fetch=async function(input,opt){
    const url=(typeof input==='string')?input:(input&&input.url)||'';
    if(!isCacheable(url,opt)) {
      try { return await rawFetch(input,opt); }
      catch(e){
        if(mutationCanQueue(url,opt)){
          await enqueueMutation(url,opt,e.message||'offline');
          return new Response(JSON.stringify({success:true, offline_queued:true, message:'目前離線，操作已排隊，恢復網路後會同步。'}),{status:202,headers:{'Content-Type':'application/json','X-YX-Offline-Queued':'1'}});
        }
        throw e;
      }
    }
    const key=normKey(url); setStatus('同步中…','syncing');
    try{
      const res=await rawFetch(input,{cache:'no-store',...(opt||{})});
      const clone=res.clone();
      clone.json().then(data=>{ if(res.ok && data && data.success!==false) idbSet(key,data).catch(()=>{}); }).catch(()=>{});
      setStatus('已同步 '+new Date().toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'}),'ok');
      return res;
    }catch(e){
      try{ const cached=await idbGet(key); if(cached){ setStatus('離線模式｜顯示快取資料','offline'); return new Response(JSON.stringify(cached.data),{status:200,headers:{'Content-Type':'application/json','X-YX-Cache':'1'}}); } }catch(_){}
      setStatus('同步失敗','error'); throw e;
    }
  };
  window.addEventListener('online',()=>drainQueue(false));
  window.addEventListener('focus',()=>drainQueue(false));
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>{refreshQueueChip(); if(navigator.onLine) drainQueue(false);},{once:true}); else {refreshQueueChip(); if(navigator.onLine) drainQueue(false);}
})();

/* V92 incremental IndexedDB sync: opening page syncs once, then a safe setTimeout loop (no setInterval / no MutationObserver). */
(function(){
  'use strict';
  if (window.__YX_V92_INCREMENTAL_SYNC__) return;
  window.__YX_V92_INCREMENTAL_SYNC__ = true;
  const TABLES = ['inventory','orders','master_orders','shipping_records','today_changes','warehouse_cells','audit_trails'];
  const META_KEY = 'sync:meta:last_server_time';
  const timerMs = 45000;
  let running = false;
  let stopped = false;
  async function sleepLoop(){
    if (stopped) return;
    setTimeout(async function(){
      try { await syncNow(false); } catch(_e) {}
      sleepLoop();
    }, timerMs);
  }
  async function syncNow(force){
    if (running || !window.YXCache || !window.fetch) return false;
    if (document.hidden && !force) return false;
    running = true;
    try{
      let meta = null;
      try { meta = await window.YXCache.get(META_KEY); } catch(_e) {}
      const last = force ? '' : ((meta && meta.data && meta.data.server_time) || '');
      const url = '/api/sync-changes?tables=' + encodeURIComponent(TABLES.join(',')) + '&changed_after=' + encodeURIComponent(last || '') + '&ts=' + Date.now();
      const rawFetch = window.fetch;
      const res = await rawFetch(url, {credentials:'same-origin', cache:'no-store', headers:{'X-YX-Internal-Sync':'1'}});
      const data = await res.json();
      if (!res.ok || data.success === false) throw new Error(data.error || '增量同步失敗');
      const items = data.items || {};
      for (const t of TABLES){
        const rows = Array.isArray(items[t]) ? items[t] : [];
        if (rows.length) {
          if (typeof window.YXCache.mergeRows === 'function') await window.YXCache.mergeRows(t, rows);
          else await window.YXCache.set('sync:table:' + t, {rows, server_time:data.server_time, changed_after:data.changed_after || last});
        }
      }
      try { document.dispatchEvent(new CustomEvent('yx:incremental-sync', {detail:{items, server_time:data.server_time, changed_after:data.changed_after || last}})); } catch(_e) {}
      await window.YXCache.set(META_KEY, {server_time:data.server_time || new Date().toISOString()});
      window.YXCache.setStatus && window.YXCache.setStatus('已同步 ' + new Date().toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'}), 'ok');
      return true;
    }catch(e){
      window.YXCache?.setStatus?.('同步失敗｜顯示快取資料','error');
      return false;
    }finally{ running = false; }
  }
  window.YXCacheSync = {syncNow, stop:function(){stopped=true;}};
  function install(){ syncNow(true); sleepLoop(); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true}); else install();
  window.addEventListener('online', () => syncNow(true));
  window.addEventListener('focus', () => syncNow(false));
  document.addEventListener('visibilitychange', () => { if(!document.hidden) syncNow(false); });
})();


/* V95 offline conflict panel: click each conflict back to its source page (mainfile, no overlay/no MutationObserver). */
(function(){
  'use strict';
  if(window.__YX_V95_OFFLINE_CONFLICT_SOURCE__) return; window.__YX_V95_OFFLINE_CONFLICT_SOURCE__=true;
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  async function rawJson(url,opt){const res=await fetch(url,{credentials:'same-origin',cache:'no-store',...(opt||{}),headers:{'Content-Type':'application/json',...((opt&&opt.headers)||{})}});const txt=await res.text();let data={};try{data=txt?JSON.parse(txt):{};}catch(_){data={success:false,error:txt||'伺服器回應格式錯誤'};}if(!res.ok||data.success===false)throw new Error(data.error||data.message||'請求失敗');return data;}
  function panel(){let el=document.getElementById('yx-offline-conflict-panel'); if(el) return el; el=document.createElement('div'); el.id='yx-offline-conflict-panel'; el.className='modal hidden yx-offline-conflict-panel'; el.innerHTML='<div class="modal-card glass yx-offline-conflict-card"><div class="modal-head"><div class="section-title">離線衝突清單</div><button type="button" class="ghost-btn small-btn" data-yx-conflict-close>關閉</button></div><div class="small-note">這些離線出貨已停止扣除。點「開啟來源」可回到商品頁重新確認數量。</div><div id="yx-offline-conflict-list" class="card-list"></div><div class="btn-row"><button type="button" class="ghost-btn" data-yx-conflict-refresh>重新整理商品</button><button type="button" class="ghost-btn danger-btn" data-yx-conflict-clear-all>取消所有衝突排隊</button></div></div>'; document.body.appendChild(el); return el; }
  function bodyOf(item){try{return JSON.parse(item.body||'{}');}catch(_){return {};}}
  function conflictHTML(item,idx,c){const label=esc(c.product_text||c.message||'商品數量不足');const avail=(c.selected_available!=null)?('｜可用 '+esc(c.selected_available)):(c.master_available!=null?'｜總單 '+esc(c.master_available):(c.order_available!=null?'｜訂單 '+esc(c.order_available):(c.inventory_available!=null?'｜庫存 '+esc(c.inventory_available):'')));return '<li><span>'+label+avail+'</span><button type="button" class="ghost-btn tiny-btn" data-yx94-conflict-open="'+esc(item.id)+'" data-yx94-conflict-index="'+idx+'">開啟來源</button></li>';}
  async function openPanel(){
    const el=panel(); const box=document.getElementById('yx-offline-conflict-list'); if(!box) return;
    const rows=(await window.YXCache?.queueAll?.()||[]).filter(x=>x&&x.status==='conflict');
    window.__YX94_CONFLICT_ROWS__=rows;
    if(!rows.length){box.innerHTML='<div class="empty-state-card compact-empty">目前沒有離線衝突</div>'; el.classList.remove('hidden'); return;}
    box.innerHTML=rows.map(item=>{const body=bodyOf(item);const conflicts=Array.isArray(item.conflicts)?item.conflicts:[];const lis=(conflicts.length?conflicts:[{message:item.conflict_message||'排隊操作未執行'}]).map((c,i)=>conflictHTML(item,i,c)).join('');return '<div class="deduct-card yx-offline-conflict-item"><strong>'+esc(body.customer_name||item.url||'離線操作')+'</strong><div class="small-note">'+esc(item.conflict_message||'離線衝突')+'</div><ul class="yx-v95-conflict-list">'+lis+'</ul><div class="btn-row compact-row"><button type="button" class="ghost-btn danger-btn" data-yx-conflict-cancel="'+esc(item.id)+'">取消這筆排隊</button></div></div>';}).join('');
    el.classList.remove('hidden');
  }
  async function openConflictSource(id,index){const rows=window.__YX94_CONFLICT_ROWS__||await window.YXCache?.queueAll?.()||[];const item=rows.find(x=>String(x.id)===String(id));if(!item)return;const c=(Array.isArray(item.conflicts)?item.conflicts:[])[Number(index)||0]||{};try{const d=await rawJson('/api/offline-conflicts/resolve-target',{method:'POST',body:JSON.stringify({queue:item,body:bodyOf(item),conflict:c})});if(d.url) location.href=d.url;else (window.toast||console.warn)('找不到來源頁','warn');}catch(e){(window.toast||alert)(e.message||'來源定位失敗','error');}}
  document.addEventListener('click',async ev=>{const panelEl=ev.target?.closest?.('#yx-offline-conflict-panel'); if(ev.target?.closest?.('#yx-offline-queue-chip')){const rows=await window.YXCache?.queueAll?.()||[]; if(rows.some(x=>x&&x.status==='conflict')){ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation?.(); await openPanel(); return;}} if(!panelEl)return; const open=ev.target.closest('[data-yx94-conflict-open]'); if(open){ev.preventDefault();ev.stopPropagation();await openConflictSource(open.dataset.yx94ConflictOpen,open.dataset.yx94ConflictIndex);return;} if(ev.target.closest('[data-yx-conflict-close]')||ev.target===panelEl){panelEl.classList.add('hidden');return;} const cancel=ev.target.closest('[data-yx-conflict-cancel]'); if(cancel){await window.YXCache?.queueDelete?.(cancel.dataset.yxConflictCancel); await openPanel(); await window.YXCache?.refreshQueueChip?.(); return;} if(ev.target.closest('[data-yx-conflict-clear-all]')){const rows=await window.YXCache?.queueAll?.()||[]; for(const r of rows.filter(x=>x&&x.status==='conflict')) await window.YXCache?.queueDelete?.(r.id); await openPanel(); await window.YXCache?.refreshQueueChip?.(); return;} if(ev.target.closest('[data-yx-conflict-refresh]')){try{await window.YXCacheSync?.syncNow?.(true);(window.toast||console.log)('已重新整理商品資料','ok');}catch(_){}}},true);
  const install=()=>{if(window.YXCache) window.YXCache.openConflictPanel=openPanel;};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
})();
