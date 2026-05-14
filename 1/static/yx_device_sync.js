/* V453 device sync: stable position, resume across page switches, incremental request hints, 5AM auto option. No yx_cache/yx_core edits, no timers/observers. */
(function(){
  'use strict';
  if (window.__YX_DEVICE_SYNC_V453__) return;
  window.__YX_DEVICE_SYNC_V453__ = true;

  const VERSION = 'v453-device-sync-resume-incremental-auto5';
  const DB_NAME = 'yuanxing_device_sync_v452';
  const DB_VERSION = 1;
  const STORE = 'payloads';
  const META_KEY = 'yx_device_sync_v452_meta';
  const SYNC_EVENT = 'yx:device-sync-updated';
  const RUN_KEY = 'yx_device_sync_v453_running';
  const AUTO_KEY = 'yx_device_sync_v453_auto';
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
    {key:'inventory', label:'庫存資料', url:'/api/inventory?force=1&limit=0&yx_device_sync=1', productSource:'inventory'},
    {key:'orders', label:'訂單資料', url:'/api/orders?force=1&limit=0&yx_device_sync=1', productSource:'orders'},
    {key:'master_order', label:'總單資料', url:'/api/master_orders?force=1&limit=0&yx_device_sync=1', productSource:'master_order'},
    {key:'customers', label:'客戶資料', url:'/api/customers?force=1&yx_device_sync=1'},
    {key:'warehouse', label:'倉庫格位', url:'/api/warehouse?force=1&yx_device_sync=1', warehouse:true},
    {key:'warehouse_available', label:'未錄入倉庫圖', url:'/api/warehouse/available-items?force=1&yx_device_sync=1', warehouseAvailable:true},
    {key:'shipping_records', label:'出貨紀錄', url:'/api/shipping_records?force=1&yx_device_sync=1'},
    {key:'today_changes', label:'今日異動', url:'/api/today-changes?force=1&yx_device_sync=1'},
    {key:'todos', label:'代辦事項', url:'/api/todos?yx_device_sync=1'}
  ];
  const ENDPOINT_TO_KEY = [
    [/^\/api\/inventory\b/, 'inventory'],
    [/^\/api\/orders\b/, 'orders'],
    [/^\/api\/master_orders\b/, 'master_order'],
    [/^\/api\/customers\b/, 'customers'],
    [/^\/api\/warehouse(?:\/cells)?\b/, 'warehouse'],
    [/^\/api\/warehouse\/available-items\b/, 'warehouse_available'],
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
      const key = 'yx_warehouse_cache_' + VERSION;
      const incomingCount = warehouseItemCount(data);
      let oldCount = 0;
      try { oldCount = warehouseItemCount((JSON.parse(localStorage.getItem(key) || 'null') || {}).data); } catch(_e) {}
      if (incomingCount <= 0 && oldCount > 0) return;
      localStorage.setItem(key, JSON.stringify({saved_at:now(), data:clone(data)}));
    }catch(_e){}
  }
  function writeLocalWarehouseAvailableCache(data){
    try{
      if (!data) return;
      const key = 'yx_warehouse_available_cache_' + VERSION;
      const payload = {
        available: Array.isArray(data.available) ? data.available : (Array.isArray(data.items) ? data.items : []),
        availableByZone: data.availableByZone || data.available_by_zone || {A:[],B:[]},
        zone_summary: data.zone_summary || null,
        from_device_sync: true
      };
      localStorage.setItem(key, JSON.stringify({saved_at:now(), data:payload}));
    }catch(_e){}
  }
  function writeMeta(meta){
    try { localStorage.setItem(META_KEY, JSON.stringify(Object.assign({saved_at:now(), version:VERSION, static_version:window.__YX_STATIC_VERSION__ || ''}, meta || {}))); } catch(_e) {}
  }
  function readMeta(){ try { return JSON.parse(localStorage.getItem(META_KEY) || 'null') || null; } catch(_e) { return null; } }
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
    const res = await fetch(url, Object.assign({credentials:'same-origin', cache:'no-store'}, opt || {}, {headers:Object.assign({'Accept':'application/json'}, (opt && opt.headers) || {})}));
    const data = await safeJson(res);
    if (!res.ok || data?.success === false) throw new Error(data?.error || data?.message || ('HTTP ' + res.status));
    return data;
  }
  function bridgeLocalCache(task, data){
    if (!task || !data) return;
    if (task.productSource) writeLocalProductCache(task.productSource, data);
    if (task.warehouse) writeLocalWarehouseCache(data);
    if (task.warehouseAvailable) writeLocalWarehouseAvailableCache(data);
  }
  async function storeTaskPayload(task, data){
    if (task && task.warehouse && warehouseItemCount(data) <= 0) {
      try { const old = await readCachedPayload(task.key, 0); if (warehouseItemCount(old) > 0) { bridgeLocalCache(task, old); return; } } catch(_e) {}
    }
    await idbPut(task.key, data, {label:task.label, url:task.url});
    bridgeLocalCache(task, data);
  }
  function installApiLocalFirst(){
    const root = window.YX || (window.YX = {});
    if (root.__deviceSyncApiPatchedV453) return;
    const original = root.api;
    if (typeof original !== 'function') return;
    root.api = async function(url, opt){
      opt = opt || {};
      const key = isGet(opt) ? matchKey(url) : '';
      const u = cleanUrl(url);
      const bypass = !key || (u && u.searchParams.get('yx_device_network') === '1') || opt.yxDeviceLocalFirst === false;
      if (bypass) return original.call(this, url, opt);
      const task = TASKS.find(t => t.key === key) || {key, label:key, url:String(url || '')};
      const cached = await readCachedPayload(key, 1000*60*60*24*7);
      if (cached) {
        try {
          original.call(this, url, Object.assign({}, opt, {yxDeviceLocalFirst:false})).then(fresh => {
            if (fresh && fresh.success !== false) storeTaskPayload(task, fresh).then(() => {
              try { window.dispatchEvent(new CustomEvent(SYNC_EVENT, {detail:{key, source:'api-background', data:fresh}})); } catch(_e) {}
            }).catch(()=>{});
          }).catch(()=>{});
        } catch(_e) {}
        return clone(cached);
      }
      const fresh = await original.call(this, url, opt);
      try { await storeTaskPayload(task, fresh); } catch(_e) {}
      return fresh;
    };
    root.__deviceSyncApiPatchedV453 = true;
  }
  function readRunState(){ try { return JSON.parse(localStorage.getItem(RUN_KEY) || 'null') || null; } catch(_e) { return null; } }
  function writeRunState(v){ try { if (v) localStorage.setItem(RUN_KEY, JSON.stringify(v)); else localStorage.removeItem(RUN_KEY); } catch(_e) {} }
  function readAuto(){ try { return JSON.parse(localStorage.getItem(AUTO_KEY) || 'null') || null; } catch(_e) { return null; } }
  function writeAuto(v){ try { localStorage.setItem(AUTO_KEY, JSON.stringify(Object.assign({enabled:false}, v || {}))); } catch(_e) {} }
  function isoFromMs(ms){ try { return ms ? new Date(Number(ms)).toISOString() : ''; } catch(_e) { return ''; } }
  function taskUrl(task, meta){
    const lastMs = Number(meta?.saved_at || meta?.last_success_at || 0) || 0;
    const join = task.url.includes('?') ? '&' : '?';
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
  window.YXDeviceSync = Object.assign(window.YXDeviceSync || {}, {version:VERSION, tasks:TASKS.slice(), syncAll, readCachedPayload, readMeta, installApiLocalFirst, resumeIfNeeded, maybeRunAutoSync});
  installApiLocalFirst();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ()=>{ resumeIfNeeded(); maybeRunAutoSync(); }, {once:true});
  else { resumeIfNeeded(); maybeRunAutoSync(); }
  if ((window.__YX_PAGE_ENDPOINT__ || '') === 'home' || document.body?.dataset?.module === 'home') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureHomePanel, {once:true});
    else ensureHomePanel();
  }
})();
