
/* Formal Yuanxing namespace: one stable home for shared globals. */
(function(){
  'use strict';
  const root = window.YX || {};
  const clean = v => String(v == null ? '' : v).trim();
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  async function api(url, options){
    let opt = Object.assign({credentials:'same-origin', cache:'no-store'}, options || {});
    const method = String(opt.method || 'GET').toUpperCase();
    let timer = null, ctrl = null;
    if (!opt.signal && window.AbortController) {
      ctrl = new AbortController();
      opt = Object.assign({}, opt, {signal: ctrl.signal});
      timer = setTimeout(()=>{ try{ ctrl.abort(); }catch(_e){} }, Number(opt.timeout || (method === 'GET' ? 9000 : 18000)));
    }
    opt.headers = Object.assign({'Accept':'application/json'}, opt.headers || {});
    let res;
    try { res = await fetch(url, opt); }
    finally { if (timer) clearTimeout(timer); }
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
  window.YXCache={version:VERSION, loaded:true, policy:'frontend-state-cache-alignment', run, unregisterServiceWorkers, clearBrowserCachesOnce, clearOldIndexedDBOnce};
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

/* V144 cache status marker. */
(function(){ try { window.YX = window.YX || {}; window.YX.cacheVersion = 'v406-warehouse-order-drag-longpress-fix'; } catch(_e){} })();
