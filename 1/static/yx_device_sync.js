/* V483 device sync predeploy final audit: full authoritative sync + datastore bridge + empty-overwrite guard. No yx_cache/yx_core edits, no timers/observers. */
(function(){
  'use strict';
  if (window.__YX_DEVICE_SYNC_V480__) return;
  window.__YX_DEVICE_SYNC_V480__ = true;

  const VERSION = 'v484-speed-persist-diag-final-patch';
  const DB_NAME = 'yuanxing_device_sync_v452';
  const DB_VERSION = 1;
  const STORE = 'payloads';
  const META_KEY = 'yx_device_sync_v452_meta';
  const SYNC_EVENT = 'yx:device-sync-updated';
  const RUN_KEY = 'yx_device_sync_v462_running';
  const DIRTY_PREFIX = 'yx_device_sync_dirty_';
  const AUTO_KEY = 'yx_device_sync_v453_auto';
  const LAST_SYNC_KEY = 'yx_device_sync_last_success_at';
  const bgRefreshAt = Object.create(null);
  const productCachePrefix = 'yx_v406_cache_';
  const staticToken = () => String(window.__YX_STATIC_VERSION__ || window.YX?.version || VERSION).replace(/[^A-Za-z0-9_-]/g, '_');
  const now = () => Date.now();
  const clone = (v) => { try { return JSON.parse(JSON.stringify(v)); } catch(_e) { return v; } };
  const cleanUrl = (u) => {
    try { return new URL(String(u || ''), location.origin); } catch(_e) { return null; }
  };
  const isGet = (opt) => String((opt && opt.method) || 'GET').toUpperCase() === 'GET';
  const rowsOf = (data) => Array.isArray(data?.items) ? data.items : (Array.isArray(data?.rows) ? data.rows : []);
  const warehouseItemCount = (data) => {
    try {
      const cells = Array.isArray(data?.cells) ? data.cells : [];
      return cells.reduce((sum,c)=>{
        const arr = Array.isArray(c?.items) ? c.items : (Array.isArray(c?.items_json) ? c.items_json : []);
        if (arr.length) return sum + arr.length;
        const raw = typeof c?.items_json === 'string' ? c.items_json.trim() : '';
        return sum + (raw && raw !== '[]' && raw !== 'null' ? 1 : 0);
      },0);
    } catch(_e) { return 0; }
  };
  const safeJson = (res) => res.json().catch(() => ({}));

  const TASKS = [
    {key:'inventory', label:'庫存資料', url:'/api/inventory?force=1&all=1&limit=0&yx_device_sync=1&sync_full=1', productSource:'inventory', fullAlways:true},
    {key:'orders', label:'訂單資料', url:'/api/orders?force=1&all=1&limit=0&yx_device_sync=1&sync_full=1', productSource:'orders', fullAlways:true},
    {key:'master_order', label:'總單資料', url:'/api/master_orders?force=1&all=1&limit=0&yx_device_sync=1&sync_full=1', productSource:'master_order', fullAlways:true},
    {key:'customers', label:'客戶資料', url:'/api/customers?force=1&yx_device_sync=1&sync_full=1', fullAlways:true},
    {key:'warehouse', label:'倉庫格位', url:'/api/warehouse?force=1&yx_device_sync=1&sync_full=1', warehouse:true, fullAlways:true},
    {key:'warehouse_available', label:'未錄入倉庫圖', url:'/api/warehouse/available-items?force=1&yx_device_sync=1&sync_full=1', warehouseAvailable:true, fullAlways:true},
    {key:'shipping_records', label:'出貨紀錄', url:'/api/shipping_records?force=1&yx_device_sync=1&sync_full=1', fullAlways:true},
    {key:'today_changes', label:'今日異動', url:'/api/today-changes?force=1&yx_device_sync=1&sync_full=1', fullAlways:true},
    {key:'todos', label:'代辦事項', url:'/api/todos?yx_device_sync=1'}
  ];
  const ENDPOINT_TO_KEY = [
    [/^\/api\/inventory\b/, 'inventory'],
    [/^\/api\/orders\b/, 'orders'],
    [/^\/api\/master_orders\b/, 'master_order'],
    [/^\/api\/customers\b/, 'customers'],
    [/^\/api\/warehouse\/available-items\b/, 'warehouse_available'],
    [/^\/api\/warehouse(?:\/cells)?\b/, 'warehouse'],
    [/^\/api\/shipping_records\b/, 'shipping_records'],
    [/^\/api\/today-changes\b/, 'today_changes'],
    [/^\/api\/todos\b/, 'todos']
  ];

  function openDB(){
    if (!('indexedDB' in window)) return Promise.reject(new Error('此裝置不支援 IndexedDB'));
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, {keyPath:'key'});
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB 開啟失敗'));
      req.onblocked = () => reject(new Error('IndexedDB 被舊分頁占用'));
    });
  }
  async function idbPut(key, data, extra){
    const db = await openDB();
    try{
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(Object.assign({key, saved_at:now(), static_version:window.__YX_STATIC_VERSION__ || '', data:clone(data)}, extra || {}));
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error('IndexedDB 寫入失敗'));
      });
    } finally { try { db.close(); } catch(_e){} }
  }
  async function idbGet(key){
    const db = await openDB();
    try{
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error || new Error('IndexedDB 讀取失敗'));
      });
    } finally { try { db.close(); } catch(_e){} }
  }
  async function idbDelete(key){
    try{
      const db = await openDB();
      try{
        await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).delete(key);
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error || new Error('IndexedDB 刪除失敗'));
        });
      } finally { try { db.close(); } catch(_e){} }
    }catch(_e){}
  }
  function dirtyKeysFromUrl(url){
    const u = cleanUrl(url); if(!u) return [];
    const p = u.pathname || '';
    const out = new Set();
    const add = (...ks)=>ks.forEach(k=>k&&out.add(k));
    if (/^\/api\/orders\b/.test(p)) add('orders','customers','today_changes','warehouse_available');
    else if (/^\/api\/master_orders?\b/.test(p)) add('master_order','customers','today_changes','warehouse_available');
    else if (/^\/api\/inventory\b/.test(p)) add('inventory','today_changes','warehouse_available');
    else if (/^\/api\/customers\b/.test(p)) add('customers','orders','master_order');
    else if (/^\/api\/warehouse\/available-items\b/.test(p)) add('warehouse_available','today_changes');
    else if (/^\/api\/warehouse\b/.test(p)) add('warehouse','warehouse_available','today_changes','shipping_records');
    else if (/^\/api\/(?:ship|shipping|shipping_records)\b/.test(p)) add('orders','master_order','inventory','warehouse','warehouse_available','shipping_records','today_changes','customers');
    else if (/^\/api\/today-changes\b/.test(p)) add('today_changes');
    return Array.from(out);
  }
  function markDirty(keys){
    try{ (keys||[]).forEach(k=>localStorage.setItem(DIRTY_PREFIX+k, String(now()))); }catch(_e){}
  }
  function clearDirty(key){ try{ localStorage.removeItem(DIRTY_PREFIX+key); }catch(_e){} }
  function isDirty(key){ try{ return Number(localStorage.getItem(DIRTY_PREFIX+key)||0) > 0; }catch(_e){ return false; } }
  function writeLocalProductCache(source, data){
    try{
      if (!source) return;
      const rows = rowsOf(data);
      const key = productCachePrefix + 'products_' + source + '_' + staticToken();
      const payload = {saved_at:now(), data:{rows, selectedCustomer:'', saved_at:now(), from_device_sync:true}};
      localStorage.setItem(key, JSON.stringify(payload));
    }catch(_e){}
  }
  function writeLocalWarehouseCache(data){
    try{
      if (!data || !Array.isArray(data.cells)) return;
      const keys = [
        'yx_warehouse_cache_v484-speed-persist-diag-final-patch',
        'yx_warehouse_cache_v471-smoke-path-data-spine-pass8',
        'yx_warehouse_cache_' + VERSION,
        'yx_warehouse_cache_v463-data-spine-100pct-pass1',
        'yx_warehouse_cache_v460-final-sync-cache-realtime-align',
        'yx_warehouse_cache_v459-full-audit-no-half-sync-visible',
        'yx_warehouse_cache_v455-dirty-sync-cache-align',
        'yx_warehouse_cache_v451-device-prefetch-indexeddb-progress',
        'yx_warehouse_cache_v450-warehouse-longpress-single-engine-cleanout-proof'
      ];
      const incomingCount = warehouseItemCount(data);
      let oldCount = 0;
      for (const k of keys) { try { oldCount = Math.max(oldCount, warehouseItemCount((JSON.parse(localStorage.getItem(k) || 'null') || {}).data)); } catch(_e) {} }
      if (incomingCount <= 0 && oldCount > 0) return;
      const payload = JSON.stringify({saved_at:now(), data:clone(data)});
      keys.forEach(k => { try { localStorage.setItem(k, payload); } catch(_e) {} });
    }catch(_e){}
  }
  function writeLocalWarehouseAvailableCache(data){
    try{
      if (!data) return;
      const keys = [
        'yx_warehouse_available_cache_v484-speed-persist-diag-final-patch',
        'yx_warehouse_available_cache_v471-smoke-path-data-spine-pass8',
        'yx_warehouse_available_cache_' + VERSION,
        'yx_warehouse_available_cache_v463-data-spine-100pct-pass1',
        'yx_warehouse_available_cache_v460-final-sync-cache-realtime-align',
        'yx_warehouse_available_cache_v459-full-audit-no-half-sync-visible',
        'yx_warehouse_available_cache_v455-dirty-sync-cache-align',
        'yx_warehouse_available_cache_v451-device-prefetch-indexeddb-progress',
        'yx_warehouse_available_cache_v450-warehouse-longpress-single-engine-cleanout-proof'
      ];
      const payload = {
        available: Array.isArray(data.available) ? data.available : (Array.isArray(data.items) ? data.items : []),
        items: Array.isArray(data.items) ? data.items : (Array.isArray(data.available) ? data.available : []),
        availableByZone: data.availableByZone || data.available_by_zone || {A:[],B:[]},
        zone_summary: data.zone_summary || null,
        from_device_sync: true
      };
      const raw = JSON.stringify({saved_at:now(), data:payload});
      keys.forEach(k => { try { localStorage.setItem(k, raw); } catch(_e) {} });
      try { localStorage.setItem('yx_today_unplaced_summary_from_sync', JSON.stringify({saved_at:now(), summary:payload.zone_summary || null, count:(payload.items||[]).reduce((n,it)=>n+(Number(it.unplaced_qty||it.qty||1)||1),0)})); } catch(_e) {}
    }catch(_e){}
  }
  function writeMeta(meta){
    try {
      const payload = Object.assign({saved_at:now(), version:VERSION, static_version:window.__YX_STATIC_VERSION__ || ''}, meta || {});
      if (!payload.last_success_at && payload.ok) payload.last_success_at = now();
      localStorage.setItem(META_KEY, JSON.stringify(payload));
      if (payload.saved_at || payload.last_success_at) localStorage.setItem(LAST_SYNC_KEY, String(payload.last_success_at || payload.saved_at));
    } catch(_e) {}
  }
  function readMeta(){ try { const m = JSON.parse(localStorage.getItem(META_KEY) || 'null') || null; const last = Number(localStorage.getItem(LAST_SYNC_KEY) || 0); if (last && (!m || !(m.saved_at || m.last_success_at))) return {saved_at:last,last_success_at:last,version:VERSION}; return m; } catch(_e) { return null; } }
  function matchKey(url){
    const u = cleanUrl(url); if (!u) return '';
    const p = u.pathname;
    // available-items must win before generic /api/warehouse.
    if (/^\/api\/warehouse\/available-items\b/.test(p)) return 'warehouse_available';
    for (const [re, key] of ENDPOINT_TO_KEY) if (re.test(p)) return key;
    return '';
  }
  async function readCachedPayload(key, maxAgeMs){
    if (!key) return null;
    try{
      const rec = await idbGet(key);
      if (!rec || !rec.saved_at) return null;
      if (maxAgeMs && now() - Number(rec.saved_at || 0) > maxAgeMs) return null;
      return clone(rec.data);
    }catch(_e){ return null; }
  }
  async function networkFetchJson(url, opt){
    const res = await fetch(url, Object.assign({credentials:'same-origin', cache:'no-store', yxRawFetch:true}, opt || {}, {headers:Object.assign({'Accept':'application/json'}, (opt && opt.headers) || {})}));
    const data = await safeJson(res);
    if (!res.ok || data?.success === false) throw new Error(data?.error || data?.message || ('HTTP ' + res.status));
    return data;
  }
  function bridgeLocalCache(task, data){
    if (!task || !data) return;
    if (task.productSource) {
      writeLocalProductCache(task.productSource, data);
      try { const rows = rowsOf(data); if (window.YXDataStore?.setRows && Array.isArray(rows)) window.YXDataStore.setRows(task.productSource, rows, {reason:'device-sync-bridge'}); } catch(_e) {}
    }
    if (task.warehouse) writeLocalWarehouseCache(data);
    if (task.warehouseAvailable) writeLocalWarehouseAvailableCache(data);
    if (task.key) clearDirty(task.key);
  }
  function mergeByStableKey(oldRows, newRows){
    const out=[]; const seen=new Set();
    const stable=(r)=>String(r?.id || r?.uuid || r?.key || [r?.customer_name||r?.customer||'', r?.product_text||r?.text||'', r?.material||r?.product_code||'', r?.qty||''].join('|'));
    (Array.isArray(oldRows)?oldRows:[]).forEach(r=>{ const k=stable(r); if(!seen.has(k)){ seen.add(k); out.push(r); } });
    (Array.isArray(newRows)?newRows:[]).forEach(r=>{ const k=stable(r); const idx=out.findIndex(x=>stable(x)===k); if(idx>=0) out[idx]=r; else out.push(r); seen.add(k); });
    return out;
  }
  function mergeCellsBySlot(oldCells, newCells){
    const stable=(c)=>[String(c?.zone||'').toUpperCase(), Number(c?.column_index||c?.col||0), Number(c?.slot_number||c?.slot||0)].join('-');
    const out=[]; const map=new Map();
    (Array.isArray(oldCells)?oldCells:[]).forEach(c=>{ const k=stable(c); if(k!=='--0-0'){ map.set(k,c); } });
    (Array.isArray(newCells)?newCells:[]).forEach(c=>{ const k=stable(c); if(k!=='--0-0'){ map.set(k,c); } });
    map.forEach(v=>out.push(v));
    return out.sort((a,b)=>String(a.zone||'').localeCompare(String(b.zone||'')) || Number(a.column_index||0)-Number(b.column_index||0) || Number(a.slot_number||0)-Number(b.slot_number||0));
  }
  async function mergeIncrementalPayload(task, data){
    try{
      if(!task || !data || !(data.incremental || data.is_incremental || data.changed_since || data.delta)) return data;
      const old = await readCachedPayload(task.key, 0);
      if(!old) return data;
      const merged = clone(old) || {};
      if(Array.isArray(data.items) || Array.isArray(data.rows)){
        const nr = Array.isArray(data.items) ? data.items : data.rows;
        const or = Array.isArray(old.items) ? old.items : (Array.isArray(old.rows) ? old.rows : []);
        const rows = mergeByStableKey(or, nr);
        merged.items = rows; merged.rows = rows; merged.incremental_merged = true;
      }
      if(Array.isArray(data.cells)){
        merged.cells = mergeCellsBySlot(old.cells || [], data.cells || []);
        merged.zones = data.zones || old.zones || {A:{},B:{}};
        merged.incremental_merged = true;
      }
      if(task.key === 'warehouse_available'){
        // 未錄入倉庫圖必須以最新回傳為準，避免已入倉商品還留在下拉/今日異動。
        return data;
      }
      Object.keys(data||{}).forEach(k=>{ if(!['items','rows','cells','zones'].includes(k)) merged[k]=data[k]; });
      return merged;
    }catch(_e){ return data; }
  }
  async function storeTaskPayload(task, data){
    data = await mergeIncrementalPayload(task, data);
    if (task && task.warehouse && warehouseItemCount(data) <= 0) {
      try { const old = await readCachedPayload(task.key, 0); if (warehouseItemCount(old) > 0) { bridgeLocalCache(task, old); return; } } catch(_e) {}
    }
    await idbPut(task.key, data, {label:task.label, url:task.url});
    try { clearDirty(task.key); } catch(_e) {}
    bridgeLocalCache(task, data);
  }
  function installApiLocalFirst(){
    const root = window.YX || (window.YX = {});
    if (root.__deviceSyncApiPatchedV464) return;
    const original = root.api;
    if (typeof original !== 'function') return;
    root.api = async function(url, opt){
      opt = opt || {};
      const methodIsGet = isGet(opt);
      if (!methodIsGet) {
        const dirty = dirtyKeysFromUrl(url);
        try {
          const out = await original.call(this, url, opt);
          if (!out || out.success !== false) {
            markDirty(dirty);
            try {
              if(out && out.snapshots && typeof out.snapshots === 'object') {
                const map = {inventory:'inventory', orders:'orders', master_order:'master_order', master_orders:'master_order'};
                Object.keys(map).forEach(k => {
                  const rows = out.snapshots[k];
                  if(Array.isArray(rows)) {
                    const key = map[k];
                    idbPut(key, {success:true, items:clone(rows), rows:clone(rows), sync_authority:true, from_api_write_snapshot:true, saved_at:now()}, {label:key, url:'api-write-snapshot'}).catch(()=>{});
                    writeLocalProductCache(key, {items:rows, rows});
                  }
                });
              }
              const u = cleanUrl(url); const p = u && u.pathname || '';
              const exact = Array.isArray(out?.exact_customer_items) ? out.exact_customer_items : null;
              if(exact && exact.length) {
                const path = (cleanUrl(url)||{}).pathname || '';
                const src = /^\/api\/orders\b/.test(path) ? 'orders' : (/^\/api\/master_orders?\b/.test(path) ? 'master_order' : (/^\/api\/inventory\b/.test(path) ? 'inventory' : ''));
                if(src && window.YXDataStore?.upsertRows) window.YXDataStore.upsertRows(src, exact, {reason:'api-write-exact'});
              }
            } catch(_e) {}
            // V464: do NOT delete synced payloads after a write. Deleting them made reload/page-open slow and empty before DB readback.
            try { window.dispatchEvent(new CustomEvent(SYNC_EVENT, {detail:{key:'dirty', dirty, source:'api-write'}})); } catch(_e) {}
          }
          return out;
        } catch(e) {
          markDirty(dirty);
          throw e;
        }
      }
      const key = matchKey(url);
      const u = cleanUrl(url);
      const forceFresh = u && (u.searchParams.get('yx_device_network') === '1' || u.searchParams.get('no_cache') === '1');
      const dirty = key && isDirty(key);
      const bypass = !key || forceFresh || opt.yxDeviceLocalFirst === false;
      const task = TASKS.find(t => t.key === key) || {key, label:key, url:String(url || '')};
      if (!bypass) {
        const cached = await readCachedPayload(key, 1000*60*60*24*7);
        if (cached) {
          try {
            const age = now() - Number((await idbGet(key))?.saved_at || 0);
            const lastBg = Number(bgRefreshAt[key] || 0);
            if ((dirty || age > 1000*60*30) && now() - lastBg > 1000*60*3) {
              bgRefreshAt[key] = now();
              original.call(this, url, Object.assign({}, opt, {yxDeviceLocalFirst:false, yx_device_network:1})).then(fresh => {
                if (fresh && fresh.success !== false) storeTaskPayload(task, fresh).then(() => {
                  try { window.dispatchEvent(new CustomEvent(SYNC_EVENT, {detail:{key, source: dirty ? 'api-dirty-background' : 'api-background', data:fresh}})); } catch(_e) {}
                }).catch(()=>{});
              }).catch(()=>{});
            }
          } catch(_e) {}
          // V462: even when dirty, show synced cache immediately and refresh in background; never block the page on DB.
          return clone(cached);
        }
      }
      const fresh = await original.call(this, url, opt);
      try { if (key && fresh && fresh.success !== false) await storeTaskPayload(task, fresh); } catch(_e) {}
      return fresh;
    };
    root.__deviceSyncApiPatchedV464 = true;
  }
  function readRunState(){ try { return JSON.parse(localStorage.getItem(RUN_KEY) || 'null') || null; } catch(_e) { return null; } }
  function writeRunState(v){ try { if (v) localStorage.setItem(RUN_KEY, JSON.stringify(v)); else localStorage.removeItem(RUN_KEY); } catch(_e) {} }
  function readAuto(){ try { return JSON.parse(localStorage.getItem(AUTO_KEY) || 'null') || null; } catch(_e) { return null; } }
  function writeAuto(v){ try { localStorage.setItem(AUTO_KEY, JSON.stringify(Object.assign({enabled:false}, v || {}))); } catch(_e) {} }
  function isoFromMs(ms){ try { return ms ? new Date(Number(ms)).toISOString() : ''; } catch(_e) { return ''; } }
  function taskUrl(task, meta){
    const join = task.url.includes('?') ? '&' : '?';
    // V462: 商品/客戶/倉庫/今日異動必須用完整權威資料，否則刪除項目不會同步消失、件/筆會殘留、倉庫格會舊資料重複。
    // 只有非關鍵小資料才允許 changed_since。
    if (task && task.fullAlways) return task.url + join + '_=' + Date.now() + '&sync_authority=1';
    const lastMs = Number(meta?.saved_at || meta?.last_success_at || 0) || 0;
    const since = lastMs ? '&changed_since=' + encodeURIComponent(isoFromMs(lastMs)) + '&since=' + encodeURIComponent(isoFromMs(lastMs)) + '&incremental=1' : '';
    return task.url + join + '_=' + Date.now() + since;
  }
  async function syncOneTask(task, meta){
    const data = await networkFetchJson(taskUrl(task, meta), {method:'GET'});
    await storeTaskPayload(task, data);
    return data;
  }
  async function syncAll(onProgress, opts={}){
    const started = now();
    const meta = readMeta() || {};
    let run = opts.resume ? readRunState() : null;
    if (!run || !Array.isArray(run.remaining) || !run.remaining.length) {
      run = {id:'sync-' + started, started_at:started, remaining:TASKS.map(t=>t.key), done:[], results:[], active:true};
    }
    run.active = true; writeRunState(run);
    const results = Array.isArray(run.results) ? run.results : [];
    const doneKeys = new Set(Array.isArray(run.done) ? run.done : []);
    const remaining = () => TASKS.filter(t => (run.remaining || []).includes(t.key) && !doneKeys.has(t.key));
    let done = doneKeys.size;
    for (const task of remaining()) {
      const pctStart = Math.round((done / TASKS.length) * 100);
      try { onProgress && onProgress({task, done, total:TASKS.length, percent:pctStart, phase:'running'}); } catch(_e) {}
      try{
        const data = await syncOneTask(task, meta);
        done += 1; doneKeys.add(task.key);
        results.push({key:task.key, ok:true, count:rowsOf(data).length || (Array.isArray(data.cells) ? data.cells.length : 0), incremental:!!meta.saved_at});
        run.done = Array.from(doneKeys); run.results = results; run.remaining = TASKS.map(t=>t.key).filter(k=>!doneKeys.has(k)); writeRunState(run);
        try { onProgress && onProgress({task, done, total:TASKS.length, percent:Math.round((done / TASKS.length) * 100), phase:'done'}); } catch(_e) {}
        try { window.dispatchEvent(new CustomEvent(SYNC_EVENT, {detail:{key:task.key, source:'manual-sync-task', data:null}})); } catch(_e) {}
      }catch(e){
        done += 1; doneKeys.add(task.key);
        results.push({key:task.key, ok:false, error:e?.message || String(e)});
        run.done = Array.from(doneKeys); run.results = results; run.remaining = TASKS.map(t=>t.key).filter(k=>!doneKeys.has(k)); writeRunState(run);
        try { onProgress && onProgress({task, done, total:TASKS.length, percent:Math.round((done / TASKS.length) * 100), phase:'error', error:e}); } catch(_e) {}
      }
    }
    const ok = results.filter(x => x.ok).length;
    writeMeta({ok, total:TASKS.length, elapsed_ms:now()-started, results, last_success_at: ok ? now() : Number(meta.last_success_at || 0), incremental_from: meta.saved_at || 0});
    writeRunState(null);
    try { window.dispatchEvent(new CustomEvent(SYNC_EVENT, {detail:{key:'all', source:opts.auto?'auto-sync':'manual-sync', results}})); } catch(_e) {}
    try { window.dispatchEvent(new CustomEvent('yx:product-data-changed', {detail:{source:'all', reason:'device-sync-complete', results}})); } catch(_e) {}
    try { window.dispatchEvent(new CustomEvent('yx:warehouse-changed', {detail:{source:'device-sync', reason:'device-sync-complete'}})); } catch(_e) {}
    try { window.dispatchEvent(new CustomEvent('yx:today-changes-refresh', {detail:{source:'device-sync', reason:'device-sync-complete'}})); } catch(_e) {}
    return {ok, total:TASKS.length, results, elapsed_ms:now()-started};
  }
  function fmtTime(ms){ return ms ? new Date(Number(ms)).toLocaleString('zh-TW', {hour12:false}) : '尚未同步'; }
  function updateHomePanelStatus(){
    const meta = readMeta();
    const txt = document.getElementById('yx-device-sync-text');
    if (txt && !document.getElementById('yx-device-sync-card')?.classList.contains('is-syncing')) txt.textContent = '上次同步：' + fmtTime(meta?.saved_at || meta?.last_success_at || 0);
    const auto = readAuto() || {};
    const autoBtn = document.getElementById('yx-device-auto-sync-btn');
    if (autoBtn) autoBtn.textContent = auto.enabled ? '自動同步：開' : '自動同步：關';
  }
  function nextAutoDate(){
    const d = new Date();
    d.setHours(5,0,0,0);
    if (Date.now() >= d.getTime()) d.setDate(d.getDate()+1);
    return d;
  }
  async function maybeRunAutoSync(){
    const auto = readAuto();
    if (!auto?.enabled) return;
    const today = new Date(); today.setHours(5,0,0,0);
    const last = Number(auto.last_run_at || 0);
    const lastDay = last ? new Date(last).toDateString() : '';
    if (Date.now() >= today.getTime() && lastDay !== new Date().toDateString()) {
      writeAuto(Object.assign({}, auto, {last_run_at:Date.now()}));
      syncAll(()=>{}, {auto:true, resume:true}).then(updateHomePanelStatus).catch(()=>{});
    }
  }
  async function resumeIfNeeded(){
    const run = readRunState();
    if (run?.active && Array.isArray(run.remaining) && run.remaining.length) {
      syncAll(()=>{}, {resume:true}).then(updateHomePanelStatus).catch(()=>{});
    }
  }
  function ensureHomePanel(){
    if (document.getElementById('yx-device-sync-card')) return;
    const meta = readMeta();
    const last = fmtTime(meta?.saved_at || meta?.last_success_at || 0);
    const card = document.createElement('div');
    card.id = 'yx-device-sync-card';
    card.className = 'yx-device-sync-card';
    card.innerHTML = `
      <div class="yx-device-sync-head">
        <div><strong>裝置資料同步</strong><span>只更新最新改動；切頁後會接續同步，不會整個中斷</span></div>
        <div class="yx-device-sync-actions"><button id="yx-device-sync-btn" class="yx-device-sync-btn" type="button">同步資料</button><button id="yx-device-auto-sync-btn" class="yx-device-sync-btn ghost" type="button">自動同步：${(readAuto()||{}).enabled?'開':'關'}</button></div>
      </div>
      <div class="yx-device-sync-progress" aria-live="polite">
        <div class="yx-device-sync-bar"><i style="width:0%"></i></div>
        <div class="yx-device-sync-status"><span id="yx-device-sync-text">上次同步：${last}</span><b id="yx-device-sync-percent">0%</b></div>
      </div>`;
    const todo = Array.from(document.querySelectorAll('.home-menu a.menu-btn')).find(a => /代辦事項/.test(a.textContent || '') || /todos/.test(a.getAttribute('href') || ''));
    if (todo && todo.parentElement) todo.insertAdjacentElement('afterend', card);
    else (document.querySelector('.home-menu') || document.querySelector('.home-screen') || document.body).appendChild(card);
    const btn = card.querySelector('#yx-device-sync-btn');
    const autoBtn = card.querySelector('#yx-device-auto-sync-btn');
    const bar = card.querySelector('.yx-device-sync-bar i');
    const txt = card.querySelector('#yx-device-sync-text');
    const pct = card.querySelector('#yx-device-sync-percent');
    const runSync = async (auto=false) => {
      btn.disabled = true; card.classList.add('is-syncing');
      try{
        const res = await syncAll(info => {
          const p = Math.max(0, Math.min(100, Number(info.percent || 0)));
          if (bar) bar.style.width = p + '%';
          if (pct) pct.textContent = p + '%';
          if (txt) txt.textContent = `${info.task?.label || '資料'} ${info.phase === 'error' ? '同步失敗，繼續下一項' : '同步中'}（${info.done}/${info.total}）`;
        }, {auto});
        if (bar) bar.style.width = '100%';
        if (pct) pct.textContent = '100%';
        if (txt) txt.textContent = `同步完成：${res.ok}/${res.total} 項｜上次同步：${fmtTime(Date.now())}`;
        card.classList.toggle('has-error', res.ok < res.total);
        try { window.YX?.toast?.(`同步完成 ${res.ok}/${res.total}`, res.ok === res.total ? 'ok' : 'warn'); } catch(_e) {}
      }catch(e){
        if (txt) txt.textContent = e?.message || '同步失敗';
        card.classList.add('has-error');
        try { window.YX?.toast?.(e?.message || '同步失敗', 'error'); } catch(_e) {}
      }finally{
        btn.disabled = false; card.classList.remove('is-syncing');
      }
    };
    btn?.addEventListener('click', () => runSync(false));
    autoBtn?.addEventListener('click', () => {
      const cur = readAuto() || {};
      const next = !cur.enabled;
      writeAuto(Object.assign({}, cur, {enabled:next, next_run_at:nextAutoDate().getTime()}));
      updateHomePanelStatus();
      try { window.YX?.toast?.(next ? '已開啟每天凌晨 5 點自動同步（開啟網頁時會執行）' : '已關閉自動同步', 'ok'); } catch(_e) {}
    });
    updateHomePanelStatus();
  }
  async function writeCachedPayload(key, data){
    if(!key) return false;
    const task = TASKS.find(t => t.key === key) || {key, label:key, url:''};
    await storeTaskPayload(task, data || {success:true, items:[], rows:[]});
    try { window.dispatchEvent(new CustomEvent(SYNC_EVENT, {detail:{key, source:'writeCachedPayload', data:data||{}}})); } catch(_e) {}
    return true;
  }
  window.YXDeviceSync = Object.assign(window.YXDeviceSync || {}, {version:VERSION, tasks:TASKS.slice(), syncAll, readCachedPayload, writeCachedPayload, readMeta, installApiLocalFirst, resumeIfNeeded, maybeRunAutoSync, markDirty});
  installApiLocalFirst();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ()=>{ resumeIfNeeded(); maybeRunAutoSync(); }, {once:true});
  else { resumeIfNeeded(); maybeRunAutoSync(); }
  if ((window.__YX_PAGE_ENDPOINT__ || '') === 'home' || document.body?.dataset?.module === 'home') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureHomePanel, {once:true});
    else ensureHomePanel();
  }
})();
