
/* Formal Yuanxing namespace: one stable home for shared globals. */
(function(){
  'use strict';
  const root = window.YX || {};
  const clean = v => String(v == null ? '' : v).trim();
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  async function api(url, options){
    const opt = Object.assign({credentials:'same-origin', cache:'no-store'}, options || {});
    opt.headers = Object.assign({'Accept':'application/json'}, opt.headers || {});
    const __yxApiStarted = Date.now();
    const method = String(opt.method || 'GET').toUpperCase();
    let __yxTimer = null;
    if (!opt.signal && window.AbortController) {
      const ctrl = new AbortController();
      opt.signal = ctrl.signal;
      __yxTimer = setTimeout(() => { try { ctrl.abort('yx-v155-timeout'); } catch(_e){} }, Number(opt.timeout || (method === 'GET' ? 9000 : 18000)));
    }
    let res;
    try { res = await fetch(url, opt); } finally { if (__yxTimer) clearTimeout(__yxTimer); }
    try { if (window.YX?.degrade?.remember) window.YX.degrade.remember(url, Date.now() - __yxApiStarted); } catch(_e){}
    let data = null; try { data = await res.json(); } catch(_e) { data = {}; }
    if (!res.ok || data?.success === false) throw new Error(data?.error || data?.message || ('HTTP '+res.status));
    return data;
  }
  function toast(message, kind){
    try { if (window.YXCore?.toast) return window.YXCore.toast(message, kind); } catch(_e){}
    try { console.log('[YX]', kind || 'info', message); } catch(_e){}
  }
  root.api = root.api || api;
  root.toast = root.toast || toast;
  root.clean = root.clean || clean;
  root.esc = root.esc || esc;
  root.products = root.products || {};
  root.customers = root.customers || {};
  root.warehouse = root.warehouse || {};
  root.shipping = root.shipping || {};
  root.undo = root.undo || {};
  root.audit = root.audit || {};
  root.sync = root.sync || {};
  root.version = window.__YX_STATIC_VERSION__ || '119-v406-warehouse-order-drag-longpress-fix';
  window.YX = root;
})();


/* V132 local-first data cache: page opens render cached rows immediately, then refresh DB in background. */
(function(){
  'use strict';
  const root = window.YX || (window.YX = {});
  const PREFIX = 'yx_v406_cache_';
  // V387: read only the current cache generation so old local data does not flash over the new UI.
  const PREFIXES = [PREFIX];
  const OLD_PREFIXES = ['yx_v402_cache_','yx_v401_cache_','yx_v400_cache_','yx_v399_cache_','yx_v398_cache_','yx_v397_cache_','yx_v396_cache_','yx_v395_cache_','yx_v394_cache_','yx_v393_cache_','yx_v392_cache_','yx_v391_cache_','yx_v390_cache_','yx_v389_cache_','yx_v388_cache_','yx_v387_cache_','yx_v386_cache_','yx_v385_cache_','yx_v384_cache_','yx_v383_cache_','yx_v382_cache_','yx_v381_cache_','yx_v155_cache_', 'yx_v154_cache_', 'yx_v153_cache_', 'yx_v146_cache_', 'yx_v145_cache_', 'yx_v144_cache_', 'yx_v143_cache_', 'yx_v142_cache_', 'yx_v141_cache_', 'yx_v140_cache_', 'yx_v139_cache_', 'yx_v138_cache_', 'yx_v137_cache_', 'yx_v136_cache_', 'yx_v135_cache_', 'yx_v134_cache_', 'yx_v132_cache_'];
  function now(){ return Date.now(); }
  function clone(v){ try { return JSON.parse(JSON.stringify(v)); } catch(_e) { return v; } }
  function read(name, maxAgeMs){
    for (const pref of PREFIXES) {
      try{
        const raw = localStorage.getItem(pref + name);
        if(!raw) continue;
        const obj = JSON.parse(raw);
        if(!obj || !obj.saved_at) continue;
        if(maxAgeMs && now() - Number(obj.saved_at || 0) > maxAgeMs) continue;
        return clone(obj.data);
      }catch(_e){}
    }
    return null;
  }
  function write(name, data){
    try{ localStorage.setItem(PREFIX + name, JSON.stringify({saved_at:now(), data:clone(data)})); return true; }
    catch(_e){ return false; }
  }
  function remove(name){
    try{ for (const pref of PREFIXES.concat(OLD_PREFIXES)) localStorage.removeItem(pref + name); }catch(_e){}
  }
  function clearGroup(prefix){
    try{
      for(let i=localStorage.length-1;i>=0;i--){
        const key = localStorage.key(i);
        if(!key) continue;
        for (const pref of PREFIXES.concat(OLD_PREFIXES)) {
          if(key.indexOf(pref + prefix) === 0) { localStorage.removeItem(key); break; }
        }
      }
    }catch(_e){}
  }
  function paintThenFetch(cacheName, maxAgeMs, paint, fetcher, after){
    const cached = read(cacheName, maxAgeMs);
    if(cached && typeof paint === 'function') { try{ paint(cached, true); }catch(_e){} }
    const p = Promise.resolve().then(fetcher).then(data => {
      if(data != null) write(cacheName, data);
      if(typeof paint === 'function') paint(data, false);
      if(typeof after === 'function') after(data, false);
      return data;
    }).catch(err => {
      if(cached) return cached;
      throw err;
    });
    return cached ? Promise.resolve(cached).then(()=>p) : p;
  }
  root.cache = Object.assign(root.cache || {}, {version:'v406-warehouse-order-drag-longpress-fix', storagePrefix:PREFIX, read, write, remove, clearGroup, paintThenFetch});
  window.YX = root;
})();


/* V139 non-blocking scheduler: render cache immediately, run heavy DB refresh in idle/background. */
(function(){
  'use strict';
  const root = window.YX || (window.YX = {});
  function idle(fn, timeout){
    try { if (typeof window.requestIdleCallback === 'function') return window.requestIdleCallback(fn, {timeout: timeout || 1800}); } catch(_e) {}
    return setTimeout(fn, 0);
  }
  function afterPaint(fn){
    try { return requestAnimationFrame(() => requestAnimationFrame(fn)); } catch(_e) { return setTimeout(fn, 0); }
  }
  function softNavigate(url){
    try { afterPaint(() => { window.location.href = url; }); return false; } catch(_e) { return true; }
  }
  root.scheduler = Object.assign(root.scheduler || {}, {idle, afterPaint, softNavigate, version:'v406'});
})();



/* V142 non-blocking DOM chunk renderer: prevents large product tables from freezing mobile. */
(function(){
  'use strict';
  const root = window.YX || (window.YX = {});
  function idle(fn, timeout){
    try { if (typeof window.requestIdleCallback === 'function') return window.requestIdleCallback(fn, {timeout: timeout || 900}); } catch(_e) {}
    return setTimeout(fn, 0);
  }
  function appendRows(tbody, rows, rowHTML, opts){
    if (!tbody || !Array.isArray(rows) || !rows.length || typeof rowHTML !== 'function') return;
    opts = opts || {};
    const token = String(Date.now()) + '-' + Math.random().toString(36).slice(2);
    tbody.dataset.yxChunkToken = token;
    let index = 0;
    const size = Math.max(10, Number(opts.size || 28) || 28);
    function step(){
      if (!tbody.isConnected || tbody.dataset.yxChunkToken !== token) return;
      const part = rows.slice(index, index + size);
      if (!part.length) return;
      tbody.insertAdjacentHTML('beforeend', part.map(rowHTML).join(''));
      index += part.length;
      if (index < rows.length) idle(step, 700);
      else {
        try { if (window.YX?.mobileZoom?.refreshSoon) window.YX.mobileZoom.refreshSoon(); } catch(_e) {}
        try { window.dispatchEvent(new CustomEvent('yx:chunk-render-complete', {detail:{count: rows.length}})); } catch(_e) {}
      }
    }
    idle(step, 700);
  }
  root.renderChunks = Object.assign(root.renderChunks || {}, {version:'v155', appendRows});
  window.YX = root;
})();

/* 沅興木業 119 cache guard: silent one-shot cleanup; no UI layer, no fetch interception, no page refresh. */
(function(){
  'use strict';
  if (window.__YX_CACHE_GUARD_RUNNING__) return;
  window.__YX_CACHE_GUARD_RUNNING__ = true;
  const VERSION='400';
  const FLAG='yx_cache_guard_'+VERSION;
  const DB_FLAG='yx_indexeddb_clear_'+VERSION;
  function idle(fn){
    try{
      if(typeof window.requestIdleCallback==='function') return window.requestIdleCallback(fn,{timeout:1200});
      return setTimeout(fn, 0);
    }catch(_){ return 0; }
  }
  async function unregisterServiceWorkers(){
    try{
      if(!('serviceWorker' in navigator)) return {count:0};
      const regs=await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r=>r.unregister()));
      return {count:regs.length};
    }catch(_){ return {count:0}; }
  }
  async function clearBrowserCachesOnce(){
    try{
      if(!('caches' in window)) return {count:0};
      const names=await caches.keys();
      await Promise.all(names.map(n=>caches.delete(n)));
      return {count:names.length};
    }catch(_){ return {count:0}; }
  }
  async function clearOldIndexedDBOnce(){
    try{
      if(!('indexedDB' in window)) return false;
      if(localStorage.getItem(DB_FLAG)==='1') return false;
      await new Promise(resolve=>{ const req=indexedDB.deleteDatabase('yx_cache_v1'); req.onsuccess=req.onerror=req.onblocked=()=>resolve(); });
      localStorage.setItem(DB_FLAG,'1');
      return true;
    }catch(_){ return false; }
  }
  async function run(){
    try{
      if(localStorage.getItem(FLAG)==='1') return;
      // V124: keep the current safe Service Worker registered; only clear old cache buckets once.
      const sw={count:0};
      const cache=await clearBrowserCachesOnce();
      const idb=await clearOldIndexedDBOnce();
      localStorage.setItem(FLAG,'1');
      window.__YX_CACHE_STATUS__={version:VERSION, serviceWorkers:sw.count||0, caches:cache.count||0, indexedDB:!!idb, refreshed:false};
    }catch(_){ }
  }
  window.YXCache={version:VERSION, run, unregisterServiceWorkers, clearBrowserCachesOnce, clearOldIndexedDBOnce};
  idle(run);
})();

/* 119 background save queue: operations continue after page switch; no polling, no UI layer. */
(function(){
  'use strict';
  if (window.__YX_BG_SAVE_119__) return;
  window.__YX_BG_SAVE_119__ = true;
  const KEY = 'yx_bg_save_queue_119';
  const LANE_RUNNING = Object.create(null);
  const MAX_QUEUE = 500;
  const OLD_KEYS = ['yx_bg_save_queue_v114','yx_bg_save_queue_117','yx_bg_save_queue_v118'];
  let running = false;
  function nowId(){ return 'bg-' + Date.now() + '-' + Math.random().toString(36).slice(2); }
  function parse(v){ try { const q = JSON.parse(v || '[]'); return Array.isArray(q) ? q : []; } catch(_e){ return []; } }

  function collectTargetIds(v, out){
    out = out || [];
    try{
      if(!v) return out;
      if(Array.isArray(v)){ v.forEach(x=>collectTargetIds(x,out)); return out; }
      if(typeof v === 'object'){
        const id = clean(v.id || v.item_id || v.row_id || v.product_id || v.source_id || '');
        if(id) out.push(id);
        ['ids','item_ids','target_ids','items','changed_items','rows','payload'].forEach(k=>{ if(v[k]) collectTargetIds(v[k],out); });
      } else { const id=clean(v); if(id) out.push(id); }
    }catch(_e){}
    return Array.from(new Set(out.filter(Boolean)));
  }
  function targetScopeFromDetail(d, source){
    const p = queuedPayloadFromDetail(d) || d.payload || {};
    const u = clean(d.url || (d.item && d.item.url) || '').toLowerCase();
    const target_ids = collectTargetIds(d.target_ids || d.ids || p.target_ids || p.ids || p.items || p.changed_items || p);
    const z=clean(d.zone || d.target_zone || p.zone || p.cell?.zone || d.cell?.zone || '').toUpperCase();
    const c=Number(d.column_index || d.col || d.target_column || p.column_index || p.col || p.cell?.column_index || d.cell?.column_index || 0);
    const slot=Number(d.slot_number || d.slot || d.target_slot || p.slot_number || p.slot || p.cell?.slot_number || d.cell?.slot_number || 0);
    const from=p.from||{}, to=p.to||{};
    const keys=[];
    if(z && c && slot) keys.push(`warehouse:${z}:${c}:${slot}`);
    if(from.zone && (from.column_index||from.col) && (from.slot_number||from.slot)) keys.push(`warehouse:${clean(from.zone).toUpperCase()}:${Number(from.column_index||from.col)}:${Number(from.slot_number||from.slot)}`);
    if(to.zone && (to.column_index||to.col) && (to.slot_number||to.slot)) keys.push(`warehouse:${clean(to.zone).toUpperCase()}:${Number(to.column_index||to.col)}:${Number(to.slot_number||to.slot)}`);
    let target_kind='', target_key='';
    if(source==='warehouse' || u.indexOf('/api/warehouse')>=0 || keys.length){
      target_kind = keys.length>1 ? 'warehouse-move' : (keys.length ? 'warehouse-cell' : 'warehouse');
      target_key = keys[0] || (z && c ? `warehouse-column:${z}:${c}` : 'warehouse');
    } else if(source==='ship' || u.indexOf('/api/ship')>=0 || u.indexOf('/api/shipping')>=0){
      target_kind = 'ship-operation';
      target_key = 'ship:' + clean(d.operation_id || p.operation_id || p.preview_token || d.customer_name || p.customer_name || 'current');
    } else if(source==='orders' || source==='master_order' || source==='inventory' || target_ids.length){
      target_kind = 'product-items';
      target_key = target_ids.length ? ('product:' + target_ids.slice().sort().join(',')) : ('product:' + clean(d.operation_id || p.operation_id || d.customer_name || p.customer_name || 'current'));
    } else if(source==='customers'){
      target_kind = 'customer-profile';
      target_key = 'customer:' + clean(d.customer_name || p.customer_name || p.name || 'current');
    }
    const target_keys = Array.from(new Set((d.target_keys || p.target_keys || keys || []).concat(target_key ? [target_key] : []).filter(Boolean)));
    const scope_key = clean(d.scope_key || p.scope_key || target_key || d.operation_id || d.queue_item_id || '');
    return {target_kind, target_key, target_keys, target_ids, scope_key};
  }

  function read(){
    let q = parse(localStorage.getItem(KEY));
    for (const k of OLD_KEYS) {
      const old = parse(localStorage.getItem(k));
      if (old.length) {
        q = q.concat(old.filter(x => x && x.url));
        try { localStorage.removeItem(k); } catch(_e){}
      }
    }
    // keep insertion order, remove duplicate ids, and normalize old queued rows without ids.
    const seen = new Set();
    q = q.filter(x => {
      if (!x || !x.url) return false;
      if (!x.id) x.id = nowId();
      if (seen.has(x.id)) return false;
      seen.add(x.id);
      return true;
    });
    write(q);
    return q;
  }
  function write(q){
    try { localStorage.setItem(KEY, JSON.stringify((q || []).slice(-MAX_QUEUE))); }
    catch(_e){}
  }
  function remove(id){ write(read().filter(x => x && x.id !== id)); }

  function clean(v){ return String(v == null ? '' : v).replace(/\s+/g,' ').trim(); }
  function parseBody(item){
    try { if(!item) return {}; if(item.payload && typeof item.payload === 'object') return item.payload; if(typeof item.body === 'string' && item.body) return JSON.parse(item.body); if(item.body && typeof item.body === 'object') return item.body; } catch(_e){}
    return {};
  }
  function summarizeItem(it){
    try{
      if(!it || typeof it !== 'object') return '';
      const txt = clean([it.customer_name||it.customer||it.name, it.material||it.product_code||it.wood_type, it.product_text||it.product||it.size||it.dimension||it.spec, it.qty||it.pieces||it.count||it.quantity ? (it.qty||it.pieces||it.count||it.quantity)+'件' : '', it.support_text||it.support].filter(Boolean).join(' '));
      return txt;
    }catch(_e){ return ''; }
  }
  function cellText(p){
    try{
      p = p || {};
      const z = clean(p.zone || p?.cell?.zone || p?.from?.zone || p?.to?.zone || '').toUpperCase();
      const c = Number(p.column_index || p.col || p?.cell?.column_index || p?.from?.column_index || p?.from?.col || p?.to?.column_index || p?.to?.col || 0);
      const s = Number(p.slot_number || p.slot || p?.cell?.slot_number || p?.from?.slot_number || p?.from?.slot || p?.to?.slot_number || p?.to?.slot || p.insert_after || 0);
      return [z?z+'區':'', c?'第'+c+'欄':'', s?'第'+s+'格':''].filter(Boolean).join(' ');
    }catch(_e){ return ''; }
  }
  function actionName(url, p){
    const u=clean(url).toLowerCase(); const a=clean(p && (p.action || p.reason || '')).toLowerCase();
    if(u.indexOf('/api/ship')>=0 || a.indexOf('ship')>=0) return '出貨';
    if(u.indexOf('move-cell')>=0 || a.indexOf('move')>=0) return '拖拉移動';
    if(u.indexOf('batch-add')>=0 || a.indexOf('batch-insert')>=0) return '批量新增格';
    if(u.indexOf('batch-remove')>=0 || a.indexOf('batch-delete')>=0) return '批量刪格';
    if(u.indexOf('add-slot')>=0 || a.indexOf('insert')>=0) return '新增格';
    if(u.indexOf('remove-slot')>=0 || a.indexOf('delete')>=0) return '刪除格';
    if(u.indexOf('return-unplaced')>=0 || a.indexOf('return')>=0) return '退回商品';
    if(u.indexOf('/api/warehouse')>=0) return '倉庫操作';
    if(u.indexOf('/api/customer-items')>=0 || u.indexOf('/api/inventory')>=0 || u.indexOf('/api/orders')>=0 || u.indexOf('/api/master')>=0) return '商品操作';
    return a || '背景保存';
  }

  function collectTargetIds(v, out){
    out = out || [];
    try{
      if(!v) return out;
      if(Array.isArray(v)){ v.forEach(x=>collectTargetIds(x,out)); return out; }
      if(typeof v === 'object'){
        const id = clean(v.id || v.item_id || v.row_id || v.product_id || v.source_id || '');
        if(id) out.push(id);
        ['ids','item_ids','target_ids','items','changed_items','rows','payload'].forEach(k=>{ if(v[k]) collectTargetIds(v[k],out); });
      } else {
        const id = clean(v); if(id) out.push(id);
      }
    }catch(_e){}
    return Array.from(new Set(out.filter(Boolean)));
  }
  function targetScopeFor(url, payload){
    payload = payload || {};
    const u = clean(url).toLowerCase();
    const z = clean(payload.zone || payload.cell?.zone || '').toUpperCase();
    const c = Number(payload.column_index || payload.col || payload.cell?.column_index || payload.cell?.col || 0);
    const s = Number(payload.slot_number || payload.slot || payload.cell?.slot_number || payload.cell?.slot || 0);
    const fromZ = clean(payload.from?.zone || '').toUpperCase(), fromC = Number(payload.from?.column_index || payload.from?.col || 0), fromS = Number(payload.from?.slot_number || payload.from?.slot || 0);
    const toZ = clean(payload.to?.zone || '').toUpperCase(), toC = Number(payload.to?.column_index || payload.to?.col || 0), toS = Number(payload.to?.slot_number || payload.to?.slot || 0);
    const target_ids = collectTargetIds(payload);
    let target_kind = 'operation', target_key = '', target_keys = [];
    if(u.indexOf('/api/warehouse') >= 0){
      target_kind = (fromZ || toZ) ? 'warehouse-move' : ((z && c && s) ? 'warehouse-cell' : ((z && c) ? 'warehouse-column' : 'warehouse'));
      if(z && c && s) target_keys.push(`warehouse:${z}:${c}:${s}`);
      if(fromZ && fromC && fromS) target_keys.push(`warehouse:${fromZ}:${fromC}:${fromS}`);
      if(toZ && toC && toS) target_keys.push(`warehouse:${toZ}:${toC}:${toS}`);
      if(!target_keys.length && z && c) target_keys.push(`warehouse-column:${z}:${c}`);
      target_key = target_keys[0] || '';
    } else if(u.indexOf('/api/ship') >= 0 || u.indexOf('/api/shipping') >= 0){
      target_kind = 'ship-operation';
      target_key = 'ship:' + clean(payload.operation_id || payload.request_key || payload.preview_token || payload.customer_name || payload.customer || 'current');
      target_keys = [target_key];
    } else if(u.indexOf('/api/customer-items') >= 0 || u.indexOf('/api/inventory') >= 0 || u.indexOf('/api/orders') >= 0 || u.indexOf('/api/master') >= 0){
      target_kind = 'product-items';
      target_key = target_ids.length ? ('product:' + target_ids.sort().join(',')) : ('product:' + clean(payload.operation_id || payload.request_key || payload.customer_name || payload.customer || 'current'));
      target_keys = [target_key];
    } else if(u.indexOf('/api/customers') >= 0){
      target_kind = 'customer-profile';
      target_key = 'customer:' + clean(payload.customer_name || payload.name || payload.old_name || payload.new_name || 'current');
      target_keys = [target_key];
    }
    return {target_kind, target_key, target_keys:Array.from(new Set(target_keys.filter(Boolean))), target_ids};
  }

  function summarizePayload(url, p){
    p = p || {};
    const parts=[actionName(url,p)];
    const from=cellText(p.from||{}), to=cellText(p.to||{}), cell=cellText(p);
    if(from || to) parts.push((from||'原格')+' → '+(to||'新格'));
    else if(cell) parts.push(cell);
    const rows = Array.isArray(p.items) ? p.items : (Array.isArray(p.returned_items) ? p.returned_items : []);
    const itemBits = rows.map(summarizeItem).filter(Boolean).slice(0,2);
    if(itemBits.length) parts.push(itemBits.join('、') + (rows.length>2?' 等'+rows.length+'筆':''));
    const cust = clean(p.customer_name || p.customer || p.name || ''); if(cust && parts.join(' ').indexOf(cust)<0) parts.push(cust);
    return clean(parts.filter(Boolean).join('｜'));
  }

  function isPermanentFailure(err){
    const st = Number(err && err.status || 0);
    return !!(err && err.permanent) || (st >= 400 && st < 500);
  }
  function emitBgStatus(name, item, extra){
    try{
      const payload=parseBody(item);
      const target=summarizePayload(item && item.url, payload);
      const detail=Object.assign({
        pending:read().length,
        item:item||null,
        queue_item_id:item&&item.id,
        module:item&&item.module,
        source:item&&item.module,
        lane:item&&item.lane,
        url:item&&item.url,
        operation_id:(item&&item.operation_id) || payload.operation_id || payload.request_key || '',
        request_key:payload.request_key || '',
        payload,
        target_label:target,
        detail_text:target,
        cell_label:cellText(payload),
        customer_name:clean(payload.customer_name || payload.customer || payload.name || ''),
        ...targetScopeFor(item && item.url, payload),
        created_at:Number(item&&item.created_at||0),
        retry_at:Number(item&&item.retry_at||0),
        tries:Number(item&&item.tries||0),
        version:'v406-warehouse-order-drag-longpress-fix'
      }, extra||{});
      window.dispatchEvent(new CustomEvent(name, {detail}));
    }catch(_e){}
  }
  async function send(item){
    const body = item.body || '';
    const keep = body.length < 60000;
    const method = item.method || 'POST';
    const timeout = Number(item.timeout || (String(method).toUpperCase() === 'GET' ? 9000 : 18000));
    let ctrl = null, timer = null;
    const opt = {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      keepalive: keep,
      headers: Object.assign({'Content-Type':'application/json','Accept':'application/json'}, item.headers || {}),
      body
    };
    if (window.AbortController) {
      ctrl = new AbortController();
      opt.signal = ctrl.signal;
      timer = setTimeout(() => { try { ctrl.abort('yx-bg-save-timeout'); } catch(_e){} }, timeout);
    }
    let res;
    try { res = await fetch(item.url, opt); }
    catch(e){
      if (e && (e.name === 'AbortError' || String(e.message || '').toLowerCase().includes('abort'))) {
        const err = new Error('背景保存逾時，已保留在佇列稍後重試');
        err.status = 0; err.timeout = true; throw err;
      }
      throw e;
    }
    finally { if (timer) clearTimeout(timer); }
    let data = null;
    try { data = await res.json(); } catch(_e) { data = {}; }
    if (!res.ok || (data && data.success === false)) {
      const err = new Error((data && (data.error || data.message)) || ('HTTP ' + res.status));
      err.status = res.status;
      err.permanent = (res.status >= 400 && res.status < 500) || (data && data.success === false);
      throw err;
    }
    return data || {};
  }
  function laneOf(item){ return String((item && (item.lane || item.module || item.url)) || 'default'); }
  async function drain(){
    if (running) return;
    running = true;
    try {
      let q = read();
      for (const item of q.slice()) {
        const lane = laneOf(item);
        if (item.retry_at && Date.now() < Number(item.retry_at || 0)) continue;
        if (LANE_RUNNING[lane]) continue;
        LANE_RUNNING[lane] = true;
        try {
          const data = await send(item);
          remove(item.id);
          emitBgStatus('yx:bg-save-success', item, {success:true, data:data, response:data, result:data});
        } catch(e) {
          if (isPermanentFailure(e)) { remove(item.id); emitBgStatus('yx:bg-save-failed', item, {success:false, permanent:true, error:e && e.message}); }
          else {
            emitBgStatus('yx:bg-save-failed', item, {success:false, permanent:false, error:e && e.message});
            item.retry_at = Date.now() + Math.min(30000, 1000 * Math.pow(2, Number(item.tries || 0)));
            item.tries = Number(item.tries || 0) + 1;
            write(read().map(x => x.id === item.id ? Object.assign(x, item) : x));
            break;
          }
        } finally {
          delete LANE_RUNNING[lane];
        }
      }
    } finally { running = false; }
  }
  function enqueue(url, payload, opt){
    const item = {
      id: (opt && opt.id) || nowId(), url,
      method: (opt && opt.method) || 'POST',
      headers: (opt && opt.headers) || {},
      body: typeof payload === 'string' ? payload : JSON.stringify(payload || {}),
      created_at: Date.now(),
      module: (opt && opt.module) || 'warehouse',
      operation_id: (payload && typeof payload === 'object' && (payload.operation_id || payload.request_key)) || (opt && opt.operation_id) || '',
      lane: (opt && opt.lane) || (opt && opt.module) || url
    };
    const q = read(); q.push(item); write(q);
    emitBgStatus('yx:bg-save-queued', item, {success:false, status:'pending', queued:true});
    return item;
  }
  function request(url, payload, opt){
    const item = enqueue(url, payload, opt || {});
    return send(item).then(data => { remove(item.id); emitBgStatus('yx:bg-save-success', item, {success:true, data:data, response:data, result:data}); return data; }).catch(err => {
      if (isPermanentFailure(err)) { remove(item.id); emitBgStatus('yx:bg-save-failed', item, {success:false, permanent:true, error:err && err.message}); }
      else { emitBgStatus('yx:bg-save-failed', item, {success:false, permanent:false, error:err && err.message}); try { drain(); } catch(_e){} }
      throw err;
    });
  }
  function requestSoft(url, payload, opt){
    const item = enqueue(url, payload, opt || {});
    return send(item).then(data => { remove(item.id); emitBgStatus('yx:bg-save-success', item, {success:true, data:data, response:data, result:data}); return {success:true, data}; }).catch(err => {
      if (isPermanentFailure(err)) { remove(item.id); emitBgStatus('yx:bg-save-failed', item, {success:false, permanent:true, error:err && err.message}); }
      else { emitBgStatus('yx:bg-save-failed', item, {success:false, permanent:false, error:err && err.message}); try { drain(); } catch(_e){} }
      return {success:false, queued:!isPermanentFailure(err), error:err && err.message, permanent:isPermanentFailure(err)};
    });
  }
  window.YXBackgroundSave = {enqueue, request, requestSoft, drain, list:()=>read(), remove, cancel:(id)=>{ const before=read().length; remove(id); const after=read().length; return Math.max(0,before-after); }, pending:()=>read().length, key:KEY, version:'119-v406-queued-lanes-timeout-status-sync'};
  window.addEventListener('online', drain, {passive:true});
  // V135: do not drain on pagehide/visibilitychange; background saves already send immediately.
  // Avoid blocking page switches on mobile after warehouse edits.
  try { (window.requestIdleCallback || function(fn){ return setTimeout(fn, 0); })(drain, {timeout:1500}); } catch(_e) {}
})();

// Batch3: low-cost SSE dispatcher. It never reloads the page and lets modules update only touched rows/cells.
(function(){
  if(window.__YX_SSE_BATCH3__) return; window.__YX_SSE_BATCH3__ = true;
  function start(){
    if(!('EventSource' in window)) return;
    try{
      const es = new EventSource('/api/sync/stream?enable=1');
      es.onmessage = function(ev){
        try{
          const data = JSON.parse(ev.data || '{}');
          window.dispatchEvent(new CustomEvent('yx:sync-event', {detail:data}));
          if(data.module === 'today_changes' || data.module === 'all'){
            try{ window.YXRefreshTodayBadge && window.YXRefreshTodayBadge(); }catch(_e){}
          }
        }catch(_e){}
      };
    }catch(_e){}
  }
  // V135: do not auto-open SSE. On Render one EventSource can hold a worker/thread
  // and make page/API loads look stuck. Keep it available for manual diagnostics only.
  window.YX = window.YX || {};
  window.YX.sync = Object.assign(window.YX.sync || {}, {startSSE:start, autoSSE:false});
})();


/* V136 first speed pack: link navigation must not wait for background saves or heavy page state. */
(function(){
  'use strict';
  if (window.__YX136_FAST_NAV__) return; window.__YX136_FAST_NAV__ = true;
  document.addEventListener('click', function(ev){
    const a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || a.target) return;
    try { document.documentElement.classList.add('yx-fast-leaving'); } catch(_e) {}
    // Do not drain background queue here. All saves are local-first and will retry online/idle.
  }, {capture:true, passive:true});
})();


/* V140 fifth speed pack: stale request guard, non-blocking navigation, and cache-safe updates. */
(function(){
  'use strict';
  if (window.__YX140_STALE_GUARD__) return; window.__YX140_STALE_GUARD__ = true;
  const root = window.YX || (window.YX = {});
  let pageSeq = Date.now();
  const active = Object.create(null);
  function keyOf(url, opt){
    const method = (opt && opt.method) || 'GET';
    return method + ' ' + String(url || '').replace(/([?&])_=[^&]*/g,'$1').replace(/[?&]$/,'');
  }
  function nextPageSeq(){ pageSeq = Date.now() + Math.random(); return pageSeq; }
  function markLeaving(){
    nextPageSeq();
    try { document.documentElement.classList.add('yx-fast-leaving'); } catch(_e) {}
  }
  async function apiLatest(url, opt){
    opt = opt || {};
    const method = String(opt.method || 'GET').toUpperCase();
    const isGet = method === 'GET';
    const k = opt.key || keyOf(url, opt);
    const mySeq = pageSeq;
    if (isGet && active[k]) { try { active[k].abort(); } catch(_e) {} }
    const ctrl = new AbortController();
    if (isGet) active[k] = ctrl;
    const headers = Object.assign({'Accept':'application/json'}, opt.headers || {});
    const timeout = Number(opt.timeout || (isGet ? 12000 : 20000));
    let timer = null;
    try{
      timer = setTimeout(()=>{ try{ ctrl.abort(); }catch(_e){} }, timeout);
      const res = await fetch(url, Object.assign({}, opt, {method, headers, credentials:'same-origin', cache:'no-store', signal:ctrl.signal}));
      const text = await res.text();
      let data = {}; try { data = text ? JSON.parse(text) : {}; } catch(_e){ data = {success:false,error:text||'伺服器回應格式錯誤'}; }
      if (!res.ok || data.success === false) throw new Error(data.error || data.message || ('HTTP '+res.status));
      if (isGet && mySeq !== pageSeq && !opt.allowStale) { data.__stale = true; }
      return data;
    } finally {
      if (timer) clearTimeout(timer);
      if (isGet && active[k] === ctrl) delete active[k];
    }
  }
  function shouldPaint(data){ return !(data && data.__stale); }
  function memoPaint(cacheName, maxAgeMs, paint, fetcher, after){
    const cache = root.cache;
    const cached = cache && cache.read ? cache.read(cacheName, maxAgeMs) : null;
    if (cached && typeof paint === 'function') { try { paint(cached, true); } catch(_e){} }
    const started = pageSeq;
    const run = Promise.resolve().then(fetcher).then(data => {
      if (started !== pageSeq && data && !data.__forcePaint) return data;
      try { if (cache && cache.write && data != null) cache.write(cacheName, data); } catch(_e){}
      if (typeof paint === 'function') paint(data, false);
      if (typeof after === 'function') after(data, false);
      return data;
    }).catch(err => { if (cached) return cached; throw err; });
    return cached ? Promise.resolve(cached).then(()=>run) : run;
  }
  root.apiLatest = apiLatest;
  root.shouldPaint = shouldPaint;
  root.memoPaint = memoPaint;
  root.nav = Object.assign(root.nav || {}, {markLeaving, nextPageSeq, version:'v406'});
  document.addEventListener('click', function(ev){
    const a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || a.target) return;
    markLeaving();
  }, {capture:true, passive:true});
})();

/* V142 seventh speed pack: one active GET per resource, page-leave abort, and cache paint guard. */
(function(){
  'use strict';
  if (window.__YX142_REQUEST_RENDER_GUARD__) return; window.__YX142_REQUEST_RENDER_GUARD__ = true;
  const root = window.YX || (window.YX = {});
  const active = Object.create(null);
  let routeToken = String(Date.now()) + '-' + Math.random().toString(36).slice(2);
  function cleanKey(url, opt){
    const method = String((opt && opt.method) || 'GET').toUpperCase();
    let u = String(url || '');
    u = u.replace(/([?&])(ts|_|t|cache_bust|cb)=[^&]*/g, '$1').replace(/[?&]$/,'');
    return method + ' ' + u;
  }
  function markRouteLeaving(){
    routeToken = String(Date.now()) + '-' + Math.random().toString(36).slice(2);
    try { document.documentElement.classList.add('yx-fast-leaving'); } catch(_e) {}
    Object.keys(active).forEach(k => { try { active[k].abort('page-leave'); } catch(_e){} delete active[k]; });
    try { window.dispatchEvent(new CustomEvent('yx:route-leaving', {detail:{token:routeToken}})); } catch(_e) {}
  }
  async function guardedApi(url, opt){
    opt = opt || {};
    const method = String(opt.method || 'GET').toUpperCase();
    const isGet = method === 'GET';
    const key = opt.key || cleanKey(url, opt);
    const startToken = routeToken;
    const headers = Object.assign({'Accept':'application/json'}, opt.headers || {});
    if (!isGet && opt.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    let ctrl = opt.signal ? null : new AbortController();
    if (isGet && ctrl) {
      if (active[key]) { try { active[key].abort('newer-request'); } catch(_e){} }
      active[key] = ctrl;
    }
    const timeout = Number(opt.timeout || (isGet ? 9000 : 18000));
    let timer = null;
    try {
      if (ctrl) timer = setTimeout(() => { try { ctrl.abort('timeout'); } catch(_e){} }, timeout);
      const res = await fetch(url, Object.assign({}, opt, {method, credentials:'same-origin', cache:'no-store', headers, signal: opt.signal || (ctrl && ctrl.signal)}));
      const text = await res.text();
      let data = {}; try { data = text ? JSON.parse(text) : {}; } catch(_e) { data = {success:false, error:text || '伺服器回應格式錯誤'}; }
      if (!res.ok || data.success === false) throw new Error(data.error || data.message || ('HTTP ' + res.status));
      if (isGet && startToken !== routeToken && !opt.allowStale) data.__stale = true;
      return data;
    } catch(e) {
      if (e && (e.name === 'AbortError' || String(e.message || '').includes('abort'))) {
        const err = new Error('請求已取消'); err.aborted = true; throw err;
      }
      throw e;
    } finally {
      if (timer) clearTimeout(timer);
      if (isGet && active[key] === ctrl) delete active[key];
    }
  }
  function safePaint(fn, token){
    const t = token || routeToken;
    return function(data, fromCache){
      if (!fromCache && (data && data.__stale)) return;
      if (!fromCache && t !== routeToken) return;
      return fn && fn(data, fromCache);
    };
  }
  function currentToken(){ return routeToken; }
  root.api = guardedApi;
  root.apiLatest = guardedApi;
  root.safePaint = safePaint;
  root.currentRouteToken = currentToken;
  root.nav = Object.assign(root.nav || {}, {markLeaving:markRouteLeaving, currentToken, version:'v406'});
  document.addEventListener('click', function(ev){
    const a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || a.target) return;
    markRouteLeaving();
  }, {capture:true, passive:true});
  window.addEventListener('pagehide', markRouteLeaving, {capture:true});
})();

/* V142 visible cache/save state without polling: helps confirm whether a page is using cache or waiting for DB. */
(function(){
  'use strict';
  if (window.__YX142_CACHE_STATUS__) return; window.__YX142_CACHE_STATUS__ = true;
  function badge(){
    let el = document.getElementById('yx-cache-save-status');
    if (!el) {
      el = document.createElement('div'); el.id = 'yx-cache-save-status'; el.className = 'yx-cache-save-status';
      el.textContent = '快取'; document.body.appendChild(el);
    }
    return el;
  }
  function setStatus(text, kind){
    try { const el = badge(); el.textContent = text; el.dataset.kind = kind || 'cache'; el.hidden = !text; } catch(_e) {}
  }
  window.addEventListener('yx:bg-save-queued', e => setStatus('背景儲存 ' + ((e.detail && e.detail.pending) || ''), 'saving'));
  window.addEventListener('yx:bg-save-success', e => setStatus('背景儲存完成 ' + ((e.detail && e.detail.pending) || 0), 'ok'));
  window.addEventListener('yx:bg-save-failed', e => setStatus('背景儲存待重試 ' + ((e.detail && e.detail.pending) || ''), 'warn'));
  window.addEventListener('yx:chunk-render-complete', () => setStatus('已顯示快取/分批完成', 'ok'));
  window.addEventListener('yx:route-leaving', () => setStatus('', ''));
})();

/* V144 final speed guard: GET timeout, stale cache fallback, navigation-safe requests. */
(function(){
  'use strict';
  const root = window.YX || (window.YX = {});
  if (root.__v144FinalSpeedGuard) return;
  root.__v144FinalSpeedGuard = true;
  const API_CACHE_PREFIX = 'yx_v406_api_cache_';
  // V387: do not read old API GET cache for live data. Old API cache is only cleaned, never painted.
  const FALLBACK_PREFIXES = [API_CACHE_PREFIX];
  const OLD_API_PREFIXES = ['yx_v400_api_cache_','yx_v399_api_cache_','yx_v398_api_cache_','yx_v397_api_cache_','yx_v396_api_cache_','yx_v395_api_cache_','yx_v394_api_cache_','yx_v393_api_cache_','yx_v392_api_cache_','yx_v391_api_cache_','yx_v390_api_cache_','yx_v389_api_cache_','yx_v388_api_cache_','yx_v387_api_cache_','yx_v386_api_cache_','yx_v385_api_cache_','yx_v384_api_cache_','yx_v383_api_cache_','yx_v382_api_cache_','yx_v381_api_cache_','yx_v149_api_cache_','yx_v148_api_cache_','yx_v147_api_cache_','yx_v146_api_cache_','yx_v145_api_cache_','yx_v144_api_cache_','yx_v143_api_cache_','yx_v142_api_cache_','yx_v141_api_cache_','yx_v140_api_cache_','yx_v139_api_cache_','yx_v138_api_cache_','yx_v137_api_cache_','yx_v136_api_cache_'];
  const inflight = new Map();
  const latestToken = new Map();
  function now(){ return Date.now(); }
  function safeKey(url){ return String(url||'').replace(/[^a-zA-Z0-9_.:/?=&%-]/g,'_').slice(0,240); }
  function cacheKey(url){ return API_CACHE_PREFIX + safeKey(url); }
  function clone(v){ try { return JSON.parse(JSON.stringify(v)); } catch(_e) { return v; } }
  function readApiCache(url, maxAge){
    const suffix = safeKey(url);
    for (const pref of FALLBACK_PREFIXES) {
      try {
        const raw = localStorage.getItem(pref + suffix);
        if (!raw) continue;
        const obj = JSON.parse(raw);
        if (!obj || !obj.saved_at) continue;
        if (maxAge && now() - Number(obj.saved_at || 0) > maxAge) continue;
        return clone(obj.data);
      } catch(_e) {}
    }
    return null;
  }
  function writeApiCache(url, data){
    try { localStorage.setItem(cacheKey(url), JSON.stringify({saved_at: now(), data: clone(data)})); } catch(_e) {}
  }
  function clearApiCacheByFragments(fragments){
    let removed = 0;
    try{
      const parts = (Array.isArray(fragments) ? fragments : [fragments]).map(x=>String(x||'')).filter(Boolean);
      if(!parts.length) return 0;
      const prefixes = [API_CACHE_PREFIX].concat(OLD_API_PREFIXES || []);
      for(let i=localStorage.length-1;i>=0;i--){
        const k = localStorage.key(i) || '';
        if(!prefixes.some(p=>k.indexOf(p)===0)) continue;
        if(parts.some(f=>k.indexOf(f)>=0 || k.indexOf(safeKey(f))>=0)){
          localStorage.removeItem(k); removed++;
        }
      }
    }catch(_e){}
    return removed;
  }
  function clearApiCacheAll(){
    let removed = 0;
    try{
      const prefixes = [API_CACHE_PREFIX].concat(OLD_API_PREFIXES || []);
      for(let i=localStorage.length-1;i>=0;i--){
        const k = localStorage.key(i) || '';
        if(prefixes.some(p=>k.indexOf(p)===0)){ localStorage.removeItem(k); removed++; }
      }
    }catch(_e){}
    return removed;
  }
  function invalidateApiCacheForEvent(ev){
    try{
      const d = ev && ev.detail || {};
      const src = String(d.source || d.module || d.reason || ev.type || '').toLowerCase();
      const common = ['/api/customers','/api/customer-items','/api/inventory','/api/orders','/api/master_orders','/api/today','/api/today-changes'];
      const ship = ['/api/ship','/api/shipping','/api/shipping_records'];
      const wh = ['/api/warehouse','/api/warehouse/available-items','/api/warehouse/source-qty-map','/api/warehouse/search'];
      let targets = common.slice();
      if(src.includes('ship') || src.includes('出貨') || ev.type === 'yx:ship-completed') targets = targets.concat(ship, wh);
      else if(src.includes('warehouse') || src.includes('倉庫') || ev.type === 'yx:warehouse-changed') targets = targets.concat(ship, wh);
      else targets = targets.concat(ship, wh);
      clearApiCacheByFragments(targets);
    }catch(_e){}
  }
  function timeoutMsFor(url, options){
    if (options && options.timeoutMs) return Number(options.timeoutMs) || 12000;
    const u = String(url||'');
    if (u.indexOf('/api/warehouse') >= 0) return 18000;
    if (u.indexOf('/api/today') >= 0) return 12000;
    if (u.indexOf('/api/ship') >= 0 || u.indexOf('/api/shipping') >= 0) return 18000;
    return 12000;
  }
  async function apiV144(url, options){
    const opt = Object.assign({credentials:'same-origin', cache:'no-store'}, options || {});
    const method = String(opt.method || 'GET').toUpperCase();
    opt.headers = Object.assign({'Accept':'application/json'}, opt.headers || {});
    const useCache = method === 'GET' && !opt.body;
    const staleMax = Number(opt.staleMaxAgeMs || (useCache ? 1000*60*60*24*7 : 0));
    const key = method + ':' + String(url||'');
    const cachedBefore = useCache ? readApiCache(url, staleMax) : null;
    if (useCache && inflight.has(key)) {
      try {
        const wait = Number(opt.softCacheMs || 1200);
        if (cachedBefore && opt.softCache !== false) {
          return await Promise.race([
            inflight.get(key),
            new Promise(resolve => setTimeout(() => {
              try { cachedBefore.__stale = true; cachedBefore.__soft_cache = true; cachedBefore.__stale_reason = 'soft-cache-fast-paint'; } catch(_e) {}
              resolve(cachedBefore);
            }, wait))
          ]);
        }
        return await inflight.get(key);
      } catch(_e) {}
    }
    const token = String(Date.now()) + ':' + Math.random().toString(36).slice(2);
    latestToken.set(key, token);
    const ctl = new AbortController();
    const t = setTimeout(() => { try { ctl.abort(); } catch(_e){} }, timeoutMsFor(url,opt));
    const merged = Object.assign({}, opt, {signal: ctl.signal});
    const p = fetch(url, merged).then(async res => {
      let data = null; try { data = await res.json(); } catch(_e) { data = {}; }
      if (!res.ok || (data && data.success === false)) throw new Error((data && (data.error || data.message)) || ('HTTP ' + res.status));
      if (useCache) writeApiCache(url, data);
      return data;
    }).catch(err => {
      if (useCache) {
        const cached = readApiCache(url, staleMax);
        if (cached) {
          try { cached.__stale = true; cached.__stale_reason = err && err.message ? err.message : 'network'; } catch(_e) {}
          return cached;
        }
      }
      throw err;
    }).finally(() => {
      clearTimeout(t);
      if (latestToken.get(key) === token) latestToken.delete(key);
      if (inflight.get(key) === p) inflight.delete(key);
    });
    if (useCache) inflight.set(key, p);
    if (useCache && cachedBefore && opt.softCache !== false) {
      const softMs = Math.max(350, Number(opt.softCacheMs || 1200) || 1200);
      return Promise.race([
        p,
        new Promise(resolve => setTimeout(() => {
          try { cachedBefore.__stale = true; cachedBefore.__soft_cache = true; cachedBefore.__stale_reason = 'soft-cache-fast-paint'; } catch(_e) {}
          resolve(cachedBefore);
        }, softMs))
      ]);
    }
    return p;
  }
  root.api = apiV144;
  root.apiCache = Object.assign(root.apiCache || {}, {version:'v406', read:readApiCache, write:writeApiCache, clearGroup:clearApiCacheByFragments, clearAll:clearApiCacheAll, prefix:API_CACHE_PREFIX});
  if(!root.__v406ApiCacheInvalidation){
    root.__v406ApiCacheInvalidation = true;
    ['yx:product-data-changed','yx:customer-profile-changed','yx:warehouse-changed','yx:ship-completed','yx:today-changes-refresh'].forEach(name=>{
      try{ window.addEventListener(name, invalidateApiCacheForEvent, {passive:true}); }catch(_e){}
    });
  }
  root.requestGuard = Object.assign(root.requestGuard || {}, {version:'v155', inflightCount:()=>inflight.size});
})();

/* V406 cross-page refresh convergence: one shared cache invalidation bus, no renderer/polling/click binding. */
(function(){
  'use strict';
  const root = window.YX || (window.YX = {});
  if(root.__v406CrossPageRefreshSync) return;
  root.__v406CrossPageRefreshSync = true;
  const VERSION = 'v406-warehouse-order-drag-longpress-fix';
  const EVENT_NAMES = ['yx:product-data-changed','yx:product-batch-write-success','yx:customer-profile-changed','yx:warehouse-changed','yx:ship-completed','yx:today-changes-refresh','yx:order-master-changed'];
  const LOCAL_GROUPS = ['products_','customer_blocks_','ship_customers_','ship_items_','warehouse_available_','warehouse_source_qty_map_','today_changes_','today_changes_light_'];
  const API_GROUPS = ['/api/customers','/api/customer-items','/api/inventory','/api/orders','/api/master_orders','/api/ship','/api/shipping','/api/shipping_records','/api/warehouse','/api/warehouse/available-items','/api/warehouse/source-qty-map','/api/today','/api/today-changes'];
  let badgeTimer = null;
  function idle(fn, delay){
    try { if (typeof requestIdleCallback === 'function') return requestIdleCallback(fn, {timeout: delay || 900}); } catch(_e){}
    return setTimeout(fn, delay || 80);
  }
  function clearLocalCaches(){
    let removed = 0;
    try {
      const c = root.cache;
      LOCAL_GROUPS.forEach(g => { try { c && c.clearGroup && c.clearGroup(g); removed++; } catch(_e){} });
    } catch(_e) {}
    try { root.apiCache && root.apiCache.clearGroup && root.apiCache.clearGroup(API_GROUPS); } catch(_e) {}
    return removed;
  }
  function refreshBadgeSoon(){
    try { if (badgeTimer) clearTimeout(badgeTimer); } catch(_e){}
    badgeTimer = idle(function(){
      badgeTimer = null;
      try { if (typeof window.YXRefreshTodayBadge === 'function') window.YXRefreshTodayBadge({source:'v406-warehouse-order-drag-longpress-fix'}); } catch(_e){}
    }, 160);
  }
  function handle(ev){
    try {
      clearLocalCaches();
      refreshBadgeSoon();
      try { window.__YX_LAST_CROSS_PAGE_SYNC__ = {at:Date.now(), event:ev && ev.type || '', detail:ev && ev.detail || {}, version:VERSION}; } catch(_e){}
    } catch(_e) {}
  }
  EVENT_NAMES.forEach(name => { try { window.addEventListener(name, handle, {passive:true}); } catch(_e){} });
  root.crossPageSync = Object.assign(root.crossPageSync || {}, {version:VERSION, clear:clearLocalCaches, events:EVENT_NAMES.slice()});
})();



/* V406 operation status data bus: records queue/ship/product/warehouse states for the existing status center.
   Data only; no renderer, no polling, no click binding. */
(function(){
  'use strict';
  const root = window.YX || (window.YX = {});
  if(root.__v406OperationStatusBus) return;
  root.__v406OperationStatusBus = true;
  const STORE_KEY='yx_operation_status_card_v406';
  const OLD_STORE_KEYS=['yx_operation_status_card_v402','yx_operation_status_card_v401','yx_operation_status_card_v400','yx_operation_status_card_v399','yx_operation_status_card_v398','yx_operation_status_card_v348','yx_operation_status_card_v342','yx_operation_status_card_v337','yx_operation_status_card_v332','yx_operation_status_card_v327','yx_operation_status_card_v322','yx_operation_status_card_v317','yx_operation_status_card_v312','yx_operation_status_card_v307','yx_operation_status_card_v302','yx_operation_status_card_v297','yx_operation_status_card_v292','yx_operation_status_card_v287','yx_operation_status_card_v282'];
  const MAX_ROWS=40;
  const clean=v=>String(v==null?'':v).replace(/\s+/g,' ').trim();
  const now=()=>Date.now();
  function parseStore(key){ try{ const a=JSON.parse(localStorage.getItem(key)||'[]'); return Array.isArray(a)?a:[]; }catch(_e){ return []; } }
  function writeStore(arr){ try{ localStorage.setItem(STORE_KEY, JSON.stringify((Array.isArray(arr)?arr:[]).slice(0,MAX_ROWS))); }catch(_e){} }
  function removeStatus(id){
    id=clean(id); if(!id) return 0;
    const matches=x=>clean(x&&x.id)!==id && clean(x&&x.operation_id)!==id && clean(x&&x.queue_item_id)!==id;
    const arr=read();
    const next=arr.filter(matches);
    writeStore(next);
    try{ OLD_STORE_KEYS.forEach(k=>{ const a=parseStore(k); const b=a.filter(matches); if(b.length!==a.length) localStorage.setItem(k, JSON.stringify(b)); }); }catch(_e){}
    try{ window.dispatchEvent(new CustomEvent('yx:operation-status-updated',{detail:{removed_id:id,version:'v406-warehouse-order-drag-longpress-fix'}})); }catch(_e){}
    return arr.length-next.length;
  }
  function updateStatus(id, patch){
    id=clean(id); if(!id) return null;
    let found=null;
    const arr=read().map(x=>{
      if(clean(x.id)===id || clean(x.operation_id)===id || clean(x.queue_item_id)===id){ found=Object.assign({},x,patch||{}, {ts:now()}); return found; }
      return x;
    });
    if(found) writeStore(arr);
    try{ window.dispatchEvent(new CustomEvent('yx:operation-status-updated',{detail:{row:found,version:'v406-warehouse-order-drag-longpress-fix'}})); }catch(_e){}
    return found;
  }
  function normalizeSource(s){ s=clean(s); if(s==='master_orders') return 'master_order'; if(s==='shipping') return 'ship'; return s || 'operation'; }
  function sourceFromUrl(url, fallback){
    const u=clean(url).toLowerCase();
    if(u.indexOf('/api/ship')>=0 || u.indexOf('/api/shipping')>=0) return 'ship';
    if(u.indexOf('/api/warehouse')>=0) return 'warehouse';
    if(u.indexOf('/api/master')>=0) return 'master_order';
    if(u.indexOf('/api/orders')>=0) return 'orders';
    if(u.indexOf('/api/inventory')>=0 || u.indexOf('/api/customer-items')>=0) return fallback || 'inventory';
    if(u.indexOf('/api/customers')>=0) return 'customers';
    return fallback || 'operation';
  }
  function idFrom(d){
    return clean(d.operation_id || d.request_key || d.queue_item_id || d.event_id || (d.item && (d.item.operation_id || d.item.id)) || [d.source,d.status,d.reason,d.url || (d.item&&d.item.url),d.customer_name,d.detail_text,d.target_label].join('|'));
  }
  function queuedPayloadFromDetail(d){
    try{
      if(d && d.payload) return d.payload;
      const it=d && d.item || {};
      if(it.payload) return it.payload;
      if(typeof it.body==='string' && it.body) return JSON.parse(it.body);
      if(it.body && typeof it.body==='object') return it.body;
    }catch(_e){}
    return d && d.payload || null;
  }

  function uniqList(arr){
    const out=[]; const seen=new Set();
    (Array.isArray(arr)?arr:[]).forEach(v=>{ const s=clean(v); if(s && !seen.has(s)){ seen.add(s); out.push(s); } });
    return out;
  }
  const PAGE_LABELS={
    products:'商品表格', inventory:'庫存', orders:'訂單', master_order:'總單', customers:'客戶卡',
    ship:'出貨下拉', warehouse:'倉庫圖', today:'今日異動', home:'首頁徽章'
  };
  function pageLabel(page){ return PAGE_LABELS[clean(page)] || clean(page); }
  function pageText(arr){ return uniqList(arr).map(pageLabel).filter(Boolean).join('、'); }
  function normalizePageArray(v){
    if(!v) return [];
    if(Array.isArray(v)) return uniqList(v.map(x=>typeof x==='object' ? (x.page||x.name||x.key||x.label||'') : x));
    if(typeof v==='object') return uniqList(Object.keys(v).filter(k=>v[k]));
    return uniqList(String(v).split(/[、,，\s]+/));
  }
  function collectStatusTargetIds(v, out){
    out = out || [];
    try{
      if(!v) return out;
      if(Array.isArray(v)){ v.forEach(x=>collectStatusTargetIds(x,out)); return out; }
      if(typeof v === 'object'){
        const id = clean(v.id || v.item_id || v.row_id || v.product_id || v.source_id || '');
        if(id) out.push(id);
        ['ids','item_ids','target_ids','items','changed_items','rows','payload'].forEach(k=>{ if(v[k]) collectStatusTargetIds(v[k],out); });
      } else { const id=clean(v); if(id) out.push(id); }
    }catch(_e){}
    return Array.from(new Set(out.filter(Boolean)));
  }
  function targetScopeFromDetail(d, source){
    d = d || {};
    const p = queuedPayloadFromDetail(d) || d.payload || {};
    const u = clean(d.url || (d.item && d.item.url) || '').toLowerCase();
    const target_ids = collectStatusTargetIds(d.target_ids || d.ids || p.target_ids || p.ids || p.items || p.changed_items || p);
    const z=clean(d.zone || d.target_zone || p.zone || (p.cell&&p.cell.zone) || (d.cell&&d.cell.zone) || '').toUpperCase();
    const c=Number(d.column_index || d.col || d.target_column || p.column_index || p.col || (p.cell&&(p.cell.column_index||p.cell.col)) || (d.cell&&(d.cell.column_index||d.cell.col)) || 0);
    const slot=Number(d.slot_number || d.slot || d.target_slot || p.slot_number || p.slot || (p.cell&&(p.cell.slot_number||p.cell.slot)) || (d.cell&&(d.cell.slot_number||d.cell.slot)) || 0);
    const from=p.from||{}, to=p.to||{};
    const keys=[];
    if(z && c && slot) keys.push(`warehouse:${z}:${c}:${slot}`);
    if(from.zone && (from.column_index||from.col) && (from.slot_number||from.slot)) keys.push(`warehouse:${clean(from.zone).toUpperCase()}:${Number(from.column_index||from.col)}:${Number(from.slot_number||from.slot)}`);
    if(to.zone && (to.column_index||to.col) && (to.slot_number||to.slot)) keys.push(`warehouse:${clean(to.zone).toUpperCase()}:${Number(to.column_index||to.col)}:${Number(to.slot_number||to.slot)}`);
    let target_kind='', target_key='';
    if(source==='warehouse' || u.indexOf('/api/warehouse')>=0 || keys.length){
      target_kind = keys.length>1 ? 'warehouse-move' : (keys.length ? 'warehouse-cell' : 'warehouse');
      target_key = keys[0] || (z && c ? `warehouse-column:${z}:${c}` : 'warehouse');
    } else if(source==='ship' || u.indexOf('/api/ship')>=0 || u.indexOf('/api/shipping')>=0){
      target_kind = 'ship-operation';
      target_key = 'ship:' + clean(d.operation_id || p.operation_id || p.preview_token || d.customer_name || p.customer_name || 'current');
    } else if(source==='orders' || source==='master_order' || source==='inventory' || target_ids.length){
      target_kind = 'product-items';
      target_key = target_ids.length ? ('product:' + target_ids.slice().sort().join(',')) : ('product:' + clean(d.operation_id || p.operation_id || d.customer_name || p.customer_name || 'current'));
    } else if(source==='customers'){
      target_kind = 'customer-profile';
      target_key = 'customer:' + clean(d.customer_name || p.customer_name || p.name || 'current');
    }
    const target_keys = Array.from(new Set((d.target_keys || p.target_keys || keys || []).concat(target_key ? [target_key] : []).filter(Boolean)));
    const scope_key = clean(d.scope_key || p.scope_key || target_key || d.operation_id || d.queue_item_id || '');
    return {target_kind, target_key, target_keys, target_ids, scope_key};
  }
  function inferExpectedPages(source, d){
    source=normalizeSource(source);
    const u=clean(d.url || (d.item&&d.item.url) || '').toLowerCase();
    if(source==='ship' || u.indexOf('/api/ship')>=0) return ['products','customers','ship','warehouse','today','home'];
    if(source==='warehouse' || u.indexOf('/api/warehouse')>=0) return ['warehouse','ship','today','home'];
    if(source==='customers') return ['customers','products','ship','warehouse','today','home'];
    if(source==='orders' || source==='master_order' || source==='inventory' || u.indexOf('/api/customer-items')>=0 || u.indexOf('/api/orders')>=0 || u.indexOf('/api/master')>=0 || u.indexOf('/api/inventory')>=0) return ['products','customers','ship','warehouse','today','home'];
    return [];
  }
  function inferSyncedPages(source, status, d){
    const explicit=normalizePageArray(d.synced_pages || d.syncedPages);
    const expected=normalizePageArray(d.expected_pages || d.sync_pages || inferExpectedPages(source,d));
    let synced=explicit.slice();
    if(status==='success'){
      if(source==='ship'){
        synced = synced.concat(['ship']);
        if(d.snapshots) synced.push('products');
        if(d.customers) synced.push('customers');
        if(d.warehouse_column_snapshots || d.warehouse_cells_snapshot || d.warehouse_columns) synced.push('warehouse');
        if(d.today_changes || d.today || d.unplaced_zone_summary || d.cache_bust || d.sync_version) synced=synced.concat(['today','home']);
      } else if(source==='warehouse'){
        synced.push('warehouse');
        if(d.available_items || d.cache_bust || d.sync_version || d.result || d.response || d.data) synced=synced.concat(['ship','today','home']);
      } else if(source==='customers'){
        synced.push('customers');
        if(d.snapshots) synced.push('products');
        if(d.cache_bust || d.sync_version) synced=synced.concat(['ship','warehouse','today','home']);
      } else if(source==='orders' || source==='master_order' || source==='inventory'){
        synced.push('products');
        if(d.customers) synced.push('customers');
        if(d.cache_bust || d.sync_version || d.snapshots) synced=synced.concat(['ship','warehouse','today','home']);
      }
    }
    synced=uniqList(synced);
    let pending=normalizePageArray(d.pending_pages || d.pendingPages);
    if(!pending.length && expected.length) pending=expected.filter(x=>!synced.includes(x));
    if(status==='pending') { pending=expected.length?expected:pending; synced=[]; }
    if(status==='failed') { pending=expected.length?expected:pending; }
    pending=uniqList(pending);
    const page_sync_text = clean(d.page_sync_text || (synced.length||pending.length ? [synced.length?'已同步：'+pageText(synced):'', pending.length?'待更新：'+pageText(pending):''].filter(Boolean).join('｜') : ''));
    return {expected_pages:expected, synced_pages:synced, pending_pages:pending, page_sync_text};
  }
  function tokenList(row){
    const out=[];
    try{
      if(!row) return out;
      ['operation_id','queue_item_id','scope_key','target_key'].forEach(k=>{ const v=clean(row[k]||''); if(v) out.push(k+':'+v); });
      (Array.isArray(row.target_keys)?row.target_keys:[]).forEach(v=>{ v=clean(v); if(v) out.push('target_key:'+v); });
      (Array.isArray(row.target_ids)?row.target_ids:[]).forEach(v=>{ v=clean(v); if(v) out.push('target_id:'+v); });
    }catch(_e){}
    return Array.from(new Set(out.filter(Boolean)));
  }
  function sameStatusTarget(a,b){
    try{
      const aa=tokenList(a), bb=new Set(tokenList(b));
      if(!aa.length || !bb.size) return false;
      return aa.some(x=>bb.has(x));
    }catch(_e){ return false; }
  }
  function shouldCollapseOldStatus(oldRow,newRow,newStatus){
    try{
      if(clean(newStatus)!=='success') return false;
      const oldStatus=clean(oldRow && oldRow.status);
      if(oldStatus!=='pending' && oldStatus!=='failed') return false;
      return sameStatusTarget(oldRow,newRow);
    }catch(_e){ return false; }
  }
  function read(){
    const merged=parseStore(STORE_KEY).concat(OLD_STORE_KEYS.flatMap(parseStore));
    const seen=new Set();
    return merged.filter(x=>x&&typeof x==='object').map(x=>Object.assign({ts:Number(x.ts||x.saved_at||x.pending_at||x.success_at||x.failed_at||now())},x)).filter(x=>{
      const id=clean(x.id)||JSON.stringify(x);
      if(!id || seen.has(id)) return false;
      seen.add(id); return true;
    }).sort((a,b)=>Number(b.ts||0)-Number(a.ts||0)).slice(0,MAX_ROWS);
  }
  function record(detail){
    try{
      const d = detail && detail.detail ? detail.detail : (detail||{});
      const status=clean(d.status || (d.success===true?'success':(d.error||d.success===false?'failed':'pending')));
      const source=normalizeSource(d.source || d.module || (d.item&&d.item.module) || sourceFromUrl(d.url || (d.item&&d.item.url),''));
      const id=idFrom(Object.assign({},d,{source,status}));
      const scope=targetScopeFromDetail(d, source);
      const pageSync=inferSyncedPages(source,status,d);
      const ts=now();
      const row={
        id, ts, status, source,
        reason:clean(d.reason || d.action || ''),
        message:clean(d.message || d.error || d.reason || (status==='success'?'操作已同步':status==='failed'?'操作失敗，已保留狀態':'操作處理中')),
        error:clean(d.error || ''),
        customer_name:clean(d.customer_name || d.customer || d.name || ''),
        cell_label:clean(d.cell_label || ''),
        product_label:clean(d.product_label || ''),
        detail_text:clean(d.detail_text || d.target_label || d.refresh_target || ''),
        refresh_target:clean(d.refresh_target || d.target_label || d.refreshed_target || ''),
        target_page:clean(d.target_page || d.dest || ''),
        target_zone:clean(d.zone || d.target_zone || (d.cell && d.cell.zone) || ''),
        target_column:Number(d.column_index || d.col || d.target_column || (d.cell && (d.cell.column_index || d.cell.col)) || 0),
        target_slot:Number(d.slot_number || d.slot || d.target_slot || (d.cell && (d.cell.slot_number || d.cell.slot)) || 0),
        url:clean(d.url || (d.item && d.item.url) || ''),
        payload:queuedPayloadFromDetail(d),
        result:d.result || d.response || d.data || null,
        operation_id:clean(d.operation_id || d.request_key || ''),
        queue_item_id:clean(d.queue_item_id || (d.item && d.item.id) || ''),
        pending_count:Number(d.pending || 0),
        target_kind:scope.target_kind||'',
        target_key:scope.target_key||'',
        target_keys:scope.target_keys||[],
        target_ids:scope.target_ids||[],
        scope_key:scope.scope_key||'',
        sync_pages:Array.isArray(d.sync_pages)?d.sync_pages:[],
        expected_pages:pageSync.expected_pages,
        synced_pages:pageSync.synced_pages,
        pending_pages:pageSync.pending_pages,
        page_sync_text:pageSync.page_sync_text,
        permanent:!!d.permanent,
        retry_at:Number(d.retry_at || 0),
        tries:Number(d.tries || 0),
        version:'v406-warehouse-order-drag-longpress-fix'
      };
      if(status==='success') row.success_at=Number(d.success_at||d.saved_at||ts);
      else if(status==='failed') row.failed_at=Number(d.failed_at||d.last_failed_at||ts);
      else row.pending_at=Number(d.pending_at||d.created_at||d.saved_at||ts);
      const arr=read().filter(x=>clean(x.id)!==id && !shouldCollapseOldStatus(x,row,status));
      arr.unshift(row);
      writeStore(arr);
      try{ window.dispatchEvent(new CustomEvent('yx:operation-status-updated',{detail:{row,pending:Number(d.pending||0),version:'v406-warehouse-order-drag-longpress-fix'}})); }catch(_e){}
      return row;
    }catch(_e){ return null; }
  }
  function fromBg(ev, status, reason, message){
    const d=ev && ev.detail || {};
    record(Object.assign({}, d, {status, source:d.source || d.module || sourceFromUrl(d.url,'warehouse'), reason, message:message || d.message || d.error || d.detail_text || d.target_label, error:status==='failed' ? clean(d.error||'') : ''}));
  }
  window.addEventListener('yx:bg-save-queued', ev=>fromBg(ev,'pending','bg-save-queued','背景保存已排入佇列'), {passive:true});
  window.addEventListener('yx:bg-save-success', ev=>fromBg(ev,'success','bg-save-success','背景保存完成'), {passive:true});
  window.addEventListener('yx:bg-save-failed', ev=>fromBg(ev, (ev.detail&&ev.detail.permanent)?'failed':'pending', 'bg-save-failed', (ev.detail&&ev.detail.permanent)?'背景保存失敗':'背景保存待重試'), {passive:true});
  window.addEventListener('yx:ship-completed', ev=>record(Object.assign({source:'ship',status:'success',reason:'ship-completed',message:'出貨完成並已同步'}, ev.detail||{})), {passive:true});
  window.addEventListener('yx:operation-status', ev=>record(ev.detail||{}), {passive:true});
  window.addEventListener('yx:operation-status-snapshot-applied', ev=>record(Object.assign({status:'success',reason:'snapshot-applied',message:'後端 snapshot 已套用'}, ev.detail||{})), {passive:true});
  window.addEventListener('yx:operation-target-refresh', ev=>record(Object.assign({status:'success',reason:'targeted-refresh',message:'局部刷新完成'}, ev.detail||{})), {passive:true});
  window.addEventListener('yx:operation-soft-failed', ev=>record(Object.assign({status:(ev.detail&&ev.detail.retry_saved)?'pending':'failed'}, ev.detail||{})), {passive:true});
  root.operationStatus = Object.assign(root.operationStatus || {}, {version:'v406-warehouse-order-drag-longpress-fix', key:STORE_KEY, read, record, remove:removeStatus, update:updateStatus});
})();


/* V406 visual sync markers: align existing table rows/cards, warehouse cells, and ship preview card with operationStatus.
   Visual markers only; no renderer, no polling, no click binding. */
(function(){
  'use strict';
  const root = window.YX || (window.YX = {});
  if(root.__v406VisualSyncMarkers) return;
  root.__v406VisualSyncMarkers = true;
  const VERSION='v406-warehouse-order-drag-longpress-fix';
  const SUCCESS_MS=8000; // V406: success markers are short-lived visual feedback, status rows remain in the operation center.
  const clean=v=>String(v==null?'':v).replace(/\s+/g,' ').trim();
  const now=()=>Date.now();
  const normSource=s=>{ s=clean(s); if(s==='master_orders'||s==='master') return 'master_order'; if(s==='order') return 'orders'; if(s==='shipping') return 'ship'; return s; };
  function readRows(){
    try{ return (root.operationStatus && typeof root.operationStatus.read==='function' ? root.operationStatus.read() : []) || []; }
    catch(_e){ return []; }
  }
  let cleanupTimer=0;
  function isExpiredSuccess(row){
    return rowState(row)==='success' && Number(row.ts||0) && now()-Number(row.ts||0)>SUCCESS_MS;
  }
  function visibleRows(rows){
    return (Array.isArray(rows)?rows:[]).filter(row=>!isExpiredSuccess(row));
  }
  function scheduleSuccessCleanup(rows){
    try{
      if(cleanupTimer){ clearTimeout(cleanupTimer); cleanupTimer=0; }
      let wait=0;
      (Array.isArray(rows)?rows:[]).forEach(row=>{
        if(rowState(row)!=='success') return;
        const ts=Number(row.ts||0);
        if(!ts) return;
        const left=Math.max(0, SUCCESS_MS-(now()-ts)+80);
        if(!wait || left<wait) wait=left;
      });
      if(wait){ cleanupTimer=setTimeout(()=>{ cleanupTimer=0; schedule(); }, Math.min(wait, SUCCESS_MS+250)); }
    }catch(_e){}
  }
  function rowState(row){
    if(!row) return '';
    const st=clean(row&&row.status);
    if(st==='success'||st==='failed'||st==='pending') return st;
    return row&&row.error ? 'failed' : 'pending';
  }
  function collectIds(v,out){
    out=out||[];
    try{
      if(!v) return out;
      if(Array.isArray(v)){ v.forEach(x=>collectIds(x,out)); return out; }
      if(typeof v==='object'){
        const id=clean(v.id || v.item_id || v.row_id || v.product_id || '');
        if(id) out.push(id);
        ['target_ids','ids','item_ids','items','changed_items','rows','payload','result','response','data'].forEach(k=>{ if(v[k]) collectIds(v[k],out); });
      }else{ const id=clean(v); if(id) out.push(id); }
    }catch(_e){}
    return Array.from(new Set(out.filter(Boolean)));
  }
  function statusPick(current,row){
    if(!row) return current;
    if(rowState(row)==='success' && Number(row.ts||0) && now()-Number(row.ts||0)>SUCCESS_MS) return current;
    if(!current) return row;
    return Number(row.ts||0) >= Number(current.ts||0) ? row : current;
  }
  function productMap(rows){
    const map=new Map();
    rows.forEach(row=>{
      const src=normSource(row.source||'');
      if(!['inventory','orders','master_order','ship'].includes(src)) return;
      const ids=collectIds(row.target_ids || row.ids || row.payload || row.result || row.response || row.data || row);
      ids.forEach(id=>{
        const exact=src+'|'+id;
        map.set(exact,statusPick(map.get(exact),row));
        map.set('*|'+id,statusPick(map.get('*|'+id),row));
      });
    });
    return map;
  }
  function setSyncClass(el,row,kind){
    try{
      el.classList.remove('yx-sync-visual-pending','yx-sync-visual-success','yx-sync-visual-failed');
      delete el.dataset.yxSyncState; delete el.dataset.yxSyncText; delete el.dataset.yxSyncPages;
      if(!row) return;
      const st=rowState(row);
      const pageText=clean(row.page_sync_text||'');
      const text=st==='success'?'已同步':(st==='failed'?'同步失敗':'待同步');
      el.classList.add('yx-sync-visual-'+st);
      el.dataset.yxSyncState=st;
      el.dataset.yxSyncText=text;
      if(pageText) el.dataset.yxSyncPages=pageText;
      if(st==='pending'||st==='failed') el.classList.add(kind==='warehouse'?'yx-warehouse-cell-saving':'yx-pending-save');
      if(st==='success') el.classList.remove('yx-pending-save','yx-warehouse-cell-saving');
    }catch(_e){}
  }
  function applyProduct(rows){
    try{
      const elems=document.querySelectorAll('.yx113-summary-row[data-id],.yx113-product-card[data-id],.yx112-product-card[data-id]');
      if(!elems.length) return;
      const map=productMap(rows);
      elems.forEach(el=>{
        const id=clean(el.dataset.id || el.dataset.itemId || '');
        const src=normSource(el.dataset.source||'');
        if(!id){ setSyncClass(el,null,'product'); return; }
        const row=map.get(src+'|'+id) || map.get('*|'+id) || null;
        setSyncClass(el,row,'product');
      });
    }catch(_e){}
  }
  function cellKeysFromRow(row){
    const keys=[];
    const add=(z,c,s)=>{ z=clean(z).toUpperCase(); c=Number(c); s=Number(s); if(z&&c&&s) keys.push(`warehouse:${z}:${c}:${s}`); };
    const readObj=o=>{ if(!o||typeof o!=='object') return; add(o.zone||o.target_zone,o.column_index||o.col||o.target_column,o.slot_number||o.slot||o.target_slot); };
    try{
      (Array.isArray(row.target_keys)?row.target_keys:[]).forEach(k=>{ k=clean(k); if(/^warehouse:[AB]:\d+:\d+$/i.test(k)) keys.push(k.toUpperCase().replace(/^WAREHOUSE/,'warehouse')); });
      const tk=clean(row.target_key||''); if(/^warehouse:[AB]:\d+:\d+$/i.test(tk)) keys.push(tk.toUpperCase().replace(/^WAREHOUSE/,'warehouse'));
      readObj(row); readObj(row.payload); readObj(row.result); readObj(row.response); readObj(row.data);
      const p=row.payload||{}; readObj(p.from); readObj(p.to); readObj(row.cell); readObj(row.server_cell); readObj(row.saved_cell);
      (Array.isArray(row.column_cells)?row.column_cells:[]).forEach(readObj);
      (Array.isArray(row.warehouse_column_snapshots)?row.warehouse_column_snapshots:[]).forEach(col=>{ (Array.isArray(col.cells)?col.cells:[]).forEach(readObj); });
    }catch(_e){}
    return Array.from(new Set(keys));
  }
  function applyWarehouse(rows){
    try{
      const elems=document.querySelectorAll('#warehouse-root [data-zone][data-column][data-slot]');
      if(!elems.length) return;
      const map=new Map();
      rows.forEach(row=>{
        const src=normSource(row.source||'');
        const keys=cellKeysFromRow(row);
        if(src!=='warehouse' && !keys.length) return;
        keys.forEach(k=>map.set(k,statusPick(map.get(k),row)));
      });
      elems.forEach(el=>{
        const k=`warehouse:${clean(el.dataset.zone).toUpperCase()}:${Number(el.dataset.column)}:${Number(el.dataset.slot)}`;
        el.classList.remove('yx-warehouse-cell-synced','yx-warehouse-cell-failed');
        const row=map.get(k)||null;
        if(rowState(row)==='success') el.classList.add('yx-warehouse-cell-synced');
        if(rowState(row)==='failed') el.classList.add('yx-warehouse-cell-failed');
        setSyncClass(el,row,'warehouse');
      });
    }catch(_e){}
  }
  function applyShip(rows){
    try{
      const panel=document.getElementById('ship-preview-panel') || document.querySelector('.yx22-preview') || document.getElementById('module-result');
      if(!panel) return;
      panel.classList.remove('yx-ship-operation-pending','yx-ship-operation-synced','yx-ship-operation-failed');
      delete panel.dataset.yxSyncState; delete panel.dataset.yxSyncText; delete panel.dataset.yxSyncPages;
      const shipRows=rows.filter(r=>normSource(r.source)==='ship');
      const row=shipRows.sort((a,b)=>Number(b.ts||0)-Number(a.ts||0))[0];
      if(!row) return;
      const st=rowState(row);
      if(st==='success' && Number(row.ts||0) && now()-Number(row.ts||0)>SUCCESS_MS) return;
      panel.classList.add(st==='success'?'yx-ship-operation-synced':(st==='failed'?'yx-ship-operation-failed':'yx-ship-operation-pending'));
      panel.dataset.yxSyncState=st;
      panel.dataset.yxSyncText=st==='success'?'本次出貨已同步':(st==='failed'?'本次出貨同步失敗':'本次出貨待同步');
      if(row.page_sync_text) panel.dataset.yxSyncPages=clean(row.page_sync_text);
    }catch(_e){}
  }
  let scheduled=false;
  function apply(){
    scheduled=false;
    const allRows=readRows();
    scheduleSuccessCleanup(allRows);
    const rows=visibleRows(allRows);
    applyProduct(rows); applyWarehouse(rows); applyShip(rows);
  }
  function schedule(){
    if(scheduled) return;
    scheduled=true;
    try{ (window.requestAnimationFrame||window.queueMicrotask||function(fn){Promise.resolve().then(fn);})(apply); }
    catch(_e){ try{ Promise.resolve().then(apply); }catch(__e){ apply(); } }
  }
  ['DOMContentLoaded','load','yx:operation-status-updated','yx:operation-status-snapshot-applied','yx:operation-target-refresh','yx:ship-completed','yx:bg-save-queued','yx:bg-save-success','yx:bg-save-failed','yx:product-source-loaded','yx:warehouse-changed','yx:product-data-changed'].forEach(name=>{
    try{ window.addEventListener(name,schedule,{passive:true}); }catch(_e){}
  });
  root.visualSync = Object.assign(root.visualSync || {}, {version:VERSION, apply:schedule, applyNow:apply});
  schedule();
})();

/* V144 save queue flush: never blocks page switch; drains only when browser is idle/online. */
(function(){
  'use strict';
  function idle(fn, timeout){
    try { if (typeof requestIdleCallback === 'function') return requestIdleCallback(fn, {timeout:timeout||2500}); } catch(_e){}
    return setTimeout(fn, 0);
  }
  window.addEventListener('online', function(){ idle(function(){ try { window.YXBackgroundSave && window.YXBackgroundSave.drain && window.YXBackgroundSave.drain(); } catch(_e){}; }, 2000); }, {passive:true});
  window.addEventListener('pagehide', function(){ try { window.__YX_PAGE_LEAVING__ = true; } catch(_e){} }, {passive:true});
})();


/* V147 final performance watchdog: keeps cache useful without letting stale/huge localStorage slow page open. */
(function(){
  'use strict';
  const root = window.YX || (window.YX = {});
  if (root.__v149PerformanceWatchdog) return;
  root.__v149PerformanceWatchdog = true;
  const VERSION = 'v406';
  function now(){ return Date.now(); }
  function idle(fn, timeout){
    try { if (typeof requestIdleCallback === 'function') return requestIdleCallback(fn, {timeout: timeout || 2200}); } catch(_e) {}
    return setTimeout(fn, 0);
  }
  function estimateLocalStorage(prefix){
    let total = 0, count = 0, biggest = [];
    try{
      for(let i=0;i<localStorage.length;i++){
        const k = localStorage.key(i); if(!k) continue;
        if(prefix && k.indexOf(prefix) !== 0) continue;
        const v = localStorage.getItem(k) || '';
        const bytes = (k.length + v.length) * 2;
        total += bytes; count += 1; biggest.push({key:k, bytes});
      }
      biggest.sort((a,b)=>b.bytes-a.bytes); biggest = biggest.slice(0,8);
    }catch(_e){}
    return {count, bytes:total, mb:Math.round(total/1024/1024*100)/100, biggest};
  }
  function cleanupOldLargeCaches(){
    try{
      const keep = ['yx_v406_cache_','yx_v406_api_cache_','yx_bg_save_queue_119'];
      const stalePrefixes = ['yx_v402_cache_','yx_v401_cache_','yx_v399_cache_','yx_v398_cache_','yx_v397_cache_','yx_v396_cache_','yx_v395_cache_','yx_v394_cache_','yx_v393_cache_','yx_v392_cache_','yx_v391_cache_','yx_v390_cache_','yx_v389_cache_','yx_v388_cache_','yx_v387_cache_','yx_v386_cache_','yx_v385_cache_','yx_v384_cache_','yx_v383_cache_','yx_v382_cache_','yx_v381_cache_','yx_v132_cache_','yx_v134_cache_','yx_v135_cache_','yx_v136_cache_','yx_v137_cache_','yx_v138_cache_','yx_v139_cache_','yx_v140_cache_','yx_v141_cache_','yx_v142_cache_','yx_v143_cache_','yx_v144_cache_','yx_v145_cache_','yx_v146_cache_','yx_v147_cache_','yx_v148_cache_','yx_v149_cache_','yx_v153_cache_','yx_v154_cache_','yx_v155_cache_'];
      const apiStale = ['yx_v402_api_cache_','yx_v401_api_cache_','yx_v399_api_cache_','yx_v398_api_cache_','yx_v397_api_cache_','yx_v396_api_cache_','yx_v395_api_cache_','yx_v394_api_cache_','yx_v393_api_cache_','yx_v392_api_cache_','yx_v391_api_cache_','yx_v390_api_cache_','yx_v389_api_cache_','yx_v388_api_cache_','yx_v387_api_cache_','yx_v386_api_cache_','yx_v385_api_cache_','yx_v384_api_cache_','yx_v383_api_cache_','yx_v382_api_cache_','yx_v381_api_cache_','yx_v136_api_cache_','yx_v137_api_cache_','yx_v138_api_cache_','yx_v139_api_cache_','yx_v140_api_cache_','yx_v141_api_cache_','yx_v142_api_cache_','yx_v143_api_cache_','yx_v144_api_cache_','yx_v145_api_cache_','yx_v146_api_cache_','yx_v147_api_cache_','yx_v148_api_cache_','yx_v149_api_cache_'];
      const prefixes = stalePrefixes.concat(apiStale);
      let removed = 0;
      for(let i=localStorage.length-1;i>=0;i--){
        const k = localStorage.key(i) || '';
        if(keep.some(p=>k.indexOf(p)===0)) continue;
        if(prefixes.some(p=>k.indexOf(p)===0)){
          const v = localStorage.getItem(k) || '';
          if(v.length > 350000){ localStorage.removeItem(k); removed++; }
        }
      }
      return removed;
    }catch(_e){ return 0; }
  }
  function status(){
    return {
      version: VERSION,
      storage: estimateLocalStorage('yx_'),
      inflight: root.requestGuard && root.requestGuard.inflightCount ? root.requestGuard.inflightCount() : null,
      bgQueue: (function(){ try { return JSON.parse(localStorage.getItem('yx_bg_save_queue_119')||'[]').length; } catch(_e){ return null; } })()
    };
  }
  idle(function(){
    const removed = cleanupOldLargeCaches();
    try { window.__YX_PERFORMANCE_STATUS__ = Object.assign(status(), {removedLargeOldCaches: removed}); } catch(_e) {}
  }, 2600);
  root.performance = Object.assign(root.performance || {}, {version:VERSION, status, cleanupOldLargeCaches});
})();


/* V147 soft-cache degraded-speed helper: one idle diagnostic request, no polling, no page blocking. */
(function(){
  'use strict';
  const root = window.YX || (window.YX = {});
  if (root.__v149SoftCacheHelper) return;
  root.__v149SoftCacheHelper = true;
  function idle(fn){
    try { if (typeof requestIdleCallback === 'function') return requestIdleCallback(fn, {timeout: 3500}); } catch(_e) {}
    return setTimeout(fn, 1200);
  }
  idle(function(){
    try {
      const flag = 'yx_v149_cache_summary_at';
      const last = Number(sessionStorage.getItem(flag) || 0);
      if (Date.now() - last < 10 * 60 * 1000) return;
      sessionStorage.setItem(flag, String(Date.now()));
      const raw = window.__YX_DIAG_NATIVE_FETCH__ || window.fetch;
      if (typeof raw === 'function') {
        const ctrl = window.AbortController ? new AbortController() : null;
        const timer = ctrl ? setTimeout(function(){ try{ ctrl.abort('soft-cache-summary-timeout'); }catch(_e){} }, 2500) : null;
        raw('/api/performance/cache-summary?diag_soft=1', {method:'GET', credentials:'same-origin', cache:'no-store', headers:{'Accept':'application/json'}, signal: ctrl && ctrl.signal, yxOptionalPerformanceProbe:true}).catch(function(){}).finally(function(){ if(timer) clearTimeout(timer); });
      }
    } catch(_e) {}
  });
})();



/* V149 guarded route prewarm: do not let prewarm/cache itself slow the app. No polling, no DOM observer. */
(function(){
  'use strict';
  const root = window.YX || (window.YX = {});
  if (root.__v149RoutePrewarm) return;
  root.__v149RoutePrewarm = true;
  const warmed = new Set();
  const pending = new Set();
  const ROUTE_ENDPOINTS = {
    inventory: ['/api/inventory?fast=1&limit=120&offset=0'],
    orders: ['/api/orders?fast=1&limit=120&offset=0','/api/customers?fast=1'],
    master_order: ['/api/master_orders?fast=1&limit=120&offset=0','/api/customers?fast=1'],
    ship: ['/api/customers?fast=1'],
    warehouse: ['/api/warehouse?fast=1'],
    today_changes: ['/api/today-changes/count']
  };
  function idle(fn, timeout){
    try { if (typeof requestIdleCallback === 'function') return requestIdleCallback(fn, {timeout: timeout || 2200}); } catch(_e) {}
    return setTimeout(fn, timeout || 1200);
  }
  function canPrewarm(){
    try {
      if (navigator.connection && (navigator.connection.saveData || /(^2g|slow-2g)$/i.test(navigator.connection.effectiveType || ''))) return false;
      if (root.requestGuard && root.requestGuard.inflightCount && root.requestGuard.inflightCount() > 2) return false;
      if (window.__YX_PAGE_LEAVING__) return false;
    } catch(_e) {}
    return true;
  }
  function prewarmRoute(name, opts){
    opts = opts || {};
    name = String(name || '').trim();
    if (!name || warmed.has(name) || pending.has(name)) return;
    if (!canPrewarm() && !opts.force) return;
    pending.add(name);
    idle(function(){
      if (!canPrewarm() && !opts.force) { pending.delete(name); return; }
      const urls = (ROUTE_ENDPOINTS[name] || []).slice(0, opts.deep ? 3 : 1);
      const api = root.api;
      let chain = Promise.resolve();
      urls.forEach(function(url){
        chain = chain.then(function(){
          if (!canPrewarm() && !opts.force) return null;
          try { return api && api(url, {method:'GET', timeoutMs:2600, softCacheMs:300, staleMaxAgeMs:1000*60*60*24*7, cacheKey:'prewarm:'+url}); } catch(_e) { return null; }
        });
      });
      chain.then(function(){
        try {
          if (api && canPrewarm()) return api('/api/performance/route-prewarm?module=' + encodeURIComponent(name), {method:'GET', timeoutMs:1800, softCacheMs:250, staleMaxAgeMs:1000*60*10, cacheKey:'server-prewarm:'+name});
        } catch(_e) {}
      }).catch(function(){}).finally(function(){ pending.delete(name); warmed.add(name); });
    }, opts.delay || 2600);
  }
  function moduleFromHref(href){
    const h = String(href || '');
    if (h.indexOf('inventory') >= 0 || h.indexOf('庫存') >= 0) return 'inventory';
    if (h.indexOf('orders') >= 0 || h.indexOf('訂單') >= 0) return 'orders';
    if (h.indexOf('master') >= 0 || h.indexOf('總單') >= 0) return 'master_order';
    if (h.indexOf('ship') >= 0 || h.indexOf('出貨') >= 0) return 'ship';
    if (h.indexOf('warehouse') >= 0 || h.indexOf('倉庫') >= 0) return 'warehouse';
    if (h.indexOf('today') >= 0 || h.indexOf('異動') >= 0) return 'today_changes';
    return '';
  }
  function attachLinkPrewarm(){
    try {
      document.querySelectorAll('a[href]').forEach(function(a){
        if (a.dataset.yxPrewarmBound === '1') return;
        const mod = moduleFromHref(a.getAttribute('href') || a.textContent || '');
        if (!mod) return;
        a.dataset.yxPrewarmBound = '1';
        a.addEventListener('touchstart', function(){ prewarmRoute(mod, {delay:700}); }, {passive:true, once:true});
        a.addEventListener('pointerenter', function(){ prewarmRoute(mod, {delay:900}); }, {passive:true, once:true});
      });
    } catch(_e) {}
  }
  function prewarmLikelyNext(){
    const current = (document.body && document.body.dataset && document.body.dataset.module) || '';
    const map = {
      home: ['inventory'],
      inventory: ['orders'],
      orders: ['ship'],
      master_order: ['ship'],
      ship: ['warehouse'],
      warehouse: ['inventory'],
      today_changes: ['warehouse']
    };
    (map[current] || []).slice(0,1).forEach(function(m){ prewarmRoute(m, {delay:3600}); });
  }
  try { document.addEventListener('DOMContentLoaded', function(){ attachLinkPrewarm(); prewarmLikelyNext(); }, {once:true}); } catch(_e) {}
  root.prewarm = Object.assign(root.prewarm || {}, {version:'v155', route:prewarmRoute, attach:attachLinkPrewarm, pending:function(){return Array.from(pending);}});
})();



/* V153 fast first-paint resource guard: page-specific CSS only, PWA delayed until load, no renderer changes. */
(function(){
  'use strict';
  const root = window.YX || (window.YX = {});
  const started = (performance && performance.timeOrigin) ? performance.timeOrigin : Date.now();
  function status(){
    let entries=[]; try{ entries = performance.getEntriesByType('resource') || []; }catch(_e){}
    const css = entries.filter(e => String(e.name||'').includes('/static/css/')).map(e => ({name:String(e.name||'').split('/').pop(), ms:Math.round(e.duration||0), bytes:Math.round(e.transferSize||0)}));
    return {version:'v155', first_paint_guard:true, page:document.body?.dataset?.module||'', css_count:css.length, css:css.slice(-8), nav_ms:Math.round(Date.now()-started)};
  }
  root.frontload = Object.assign(root.frontload || {}, {version:'v155', status});
})();



/* V153 adaptive degrade guard: if the phone/network is slow, keep pages usable by skipping non-essential prewarm/heavy refresh. No polling, no DOM observer. */
(function(){
  'use strict';
  const root = window.YX || (window.YX = {});
  const KEY = 'yx_v155_degrade_state';
  const SLOW_MS = 1800;
  const WINDOW_MS = 10 * 60 * 1000;
  function now(){ return Date.now(); }
  function read(){
    try { return JSON.parse(localStorage.getItem(KEY) || '{"slow":[],"manual":false}'); }
    catch(_e){ return {slow:[], manual:false}; }
  }
  function write(st){ try { localStorage.setItem(KEY, JSON.stringify(st)); } catch(_e){} }
  function remember(label, ms){
    const st = read();
    st.slow = (st.slow || []).filter(x => now() - Number(x.at || 0) < WINDOW_MS);
    if (Number(ms || 0) >= SLOW_MS) st.slow.push({at:now(), label:String(label||'api').slice(0,80), ms:Math.round(ms)});
    write(st); apply();
  }
  function isSlowConnection(){
    try { const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection; return !!(c && (c.saveData || /(^|-)2g$/.test(String(c.effectiveType||'')))); }
    catch(_e){ return false; }
  }
  function enabled(){
    const st = read();
    const recent = (st.slow || []).filter(x => now() - Number(x.at || 0) < WINDOW_MS).length;
    return !!st.manual || isSlowConnection() || recent >= 3;
  }
  function apply(){
    try { document.documentElement.classList.toggle('yx-degrade-mode', enabled()); } catch(_e){}
  }
  function setManual(on){ const st = read(); st.manual = !!on; write(st); apply(); }
  function clear(){ try { localStorage.removeItem(KEY); } catch(_e){} apply(); }
  function status(){ const st = read(); return {version:'v155', enabled:enabled(), manual:!!st.manual, slow_count:(st.slow||[]).length, slow:(st.slow||[]).slice(-8), slow_connection:isSlowConnection()}; }
  root.degrade = Object.assign(root.degrade || {}, {version:'v155', remember, enabled, apply, setManual, clear, status});
  try { document.addEventListener('DOMContentLoaded', apply, {once:true}); } catch(_e){}
  apply();
})();

/* V153 boot guard: keep first screen interactive while heavy page scripts finish.
   No renderer replacement, no click rebinding, no timers. */
(function(){
  'use strict';
  const root = window.YX || (window.YX = {});
  const started = Date.now();
  let bootMarked = false;
  function moduleName(){ try { return document.body?.dataset?.module || window.__YX_PAGE_ENDPOINT__ || ''; } catch(_e){ return ''; } }
  function markReady(reason){
    if (bootMarked) return;
    bootMarked = true;
    try {
      document.documentElement.dataset.yxBootReady = '1';
      document.body && (document.body.dataset.yxBootReady = '1');
      window.dispatchEvent(new CustomEvent('yx:boot-ready', {detail:{reason:reason||'ready', module:moduleName(), ms:Date.now()-started}}));
    } catch(_e) {}
  }
  function safePaint(fn){
    try { return requestAnimationFrame(() => requestAnimationFrame(fn)); } catch(_e) { return setTimeout(fn, 0); }
  }
  function bootStatus(){
    return {version:'v155', module:moduleName(), ready:bootMarked, ms:Date.now()-started, inflight:(root.requestGuard&&root.requestGuard.inflightCount?root.requestGuard.inflightCount():0)};
  }
  try {
    if (document.readyState === 'complete' || document.readyState === 'interactive') safePaint(()=>markReady('dom-ready'));
    else document.addEventListener('DOMContentLoaded', function(){ safePaint(()=>markReady('dom-ready')); }, {once:true});
  } catch(_e) {}
  root.boot = Object.assign(root.boot || {}, {version:'v155', markReady, status:bootStatus});
  window.YX = root;
})();


/* V155 asset version alignment guard: detect old HTML/static mismatch without blocking UI. */
(function(){
  'use strict';
  const root = window.YX || (window.YX = {});
  const expected = '119-v155-asset-cache-alignment';
  function status(){
    let scripts = [];
    try { scripts = Array.from(document.scripts||[]).map(s=>s.src||'').filter(Boolean); } catch(_e) {}
    const stale = scripts.concat(Array.from(document.querySelectorAll('link[href]')).map(l=>l.href||'')).filter(u => /[?&]v=15[0-4]/.test(u));
    return {version:'v155', expected_static_version:expected, stale_assets:stale.slice(0,12), stale_count:stale.length};
  }
  root.assetGuard = Object.assign(root.assetGuard || {}, {version:'v155', status});
})();


/* V504_GLOBAL_LOGOUT_MAINLINE: home/settings logout uses the same single mainline. */
(function(){
  'use strict';
  if (window.__YX_V504_GLOBAL_LOGOUT_MAINLINE__) return;
  window.__YX_V504_GLOBAL_LOGOUT_MAINLINE__ = true;
  async function doLogout(){
    try {
      const request = window.YXDataStore?.requestResponse || window.fetch;
      await request('/api/logout', {method:'POST', credentials:'same-origin', cache:'no-store', headers:{'Content-Type':'application/json'}, body:'{}'});
    } catch(_e) {}
    try { localStorage.removeItem('yx_auth_checked'); } catch(_e) {}
    location.href = '/login';
  }
  try { Object.defineProperty(window, 'logout', {configurable:true, writable:true, value:doLogout}); }
  catch(_e) { window.logout = doLogout; }
})();
