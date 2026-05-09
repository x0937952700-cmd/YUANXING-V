
/* Formal Yuanxing namespace: one stable home for shared globals. */
(function(){
  'use strict';
  const root = window.YX || {};
  const clean = v => String(v == null ? '' : v).trim();
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  async function api(url, options){
    const opt = Object.assign({credentials:'same-origin', cache:'no-store'}, options || {});
    opt.headers = Object.assign({'Accept':'application/json'}, opt.headers || {});
    const res = await fetch(url, opt);
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
  root.version = '119-v131-rightclick-cache';
  window.YX = root;
})();

/* 沅興木業 119 cache guard: silent one-shot cleanup; no UI layer, no fetch interception, no page refresh. */
(function(){
  'use strict';
  if (window.__YX_CACHE_GUARD_RUNNING__) return;
  window.__YX_CACHE_GUARD_RUNNING__ = true;
  const VERSION='131';
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
    // keep insertion order, remove duplicate ids
    const seen = new Set();
    q = q.filter(x => x && x.url && !seen.has(x.id || '') && (seen.add(x.id || nowId()), true));
    write(q);
    return q;
  }
  function write(q){
    try { localStorage.setItem(KEY, JSON.stringify((q || []).slice(-240))); }
    catch(_e){}
  }
  function remove(id){ write(read().filter(x => x && x.id !== id)); }
  function isPermanentFailure(err){
    const st = Number(err && err.status || 0);
    return !!(err && err.permanent) || (st >= 400 && st < 500);
  }
  async function send(item){
    const body = item.body || '';
    const keep = body.length < 60000;
    const res = await fetch(item.url, {
      method: item.method || 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      keepalive: keep,
      headers: Object.assign({'Content-Type':'application/json','Accept':'application/json'}, item.headers || {}),
      body
    });
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
  async function drain(){
    if (running) return;
    running = true;
    try {
      const q = read();
      for (const item of q.slice()) {
        try { await send(item); remove(item.id); }
        catch(e) {
          if (isPermanentFailure(e)) { remove(item.id); continue; }
          break;
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
      module: (opt && opt.module) || 'warehouse'
    };
    const q = read(); q.push(item); write(q);
    return item;
  }
  function request(url, payload, opt){
    const item = enqueue(url, payload, opt || {});
    return send(item).then(data => { remove(item.id); return data; }).catch(err => {
      if (isPermanentFailure(err)) remove(item.id);
      else { try { drain(); } catch(_e){} }
      throw err;
    });
  }
  function requestSoft(url, payload, opt){
    const item = enqueue(url, payload, opt || {});
    return send(item).then(data => { remove(item.id); return {success:true, data}; }).catch(err => {
      if (isPermanentFailure(err)) remove(item.id);
      else { try { drain(); } catch(_e){} }
      return {success:false, queued:!isPermanentFailure(err), error:err && err.message, permanent:isPermanentFailure(err)};
    });
  }
  window.YXBackgroundSave = {enqueue, request, requestSoft, drain, pending:()=>read().length, key:KEY, version:'119-batch2'};
  window.addEventListener('online', drain, {passive:true});
  window.addEventListener('visibilitychange', function(){ if (document.visibilityState === 'hidden') drain(); }, {passive:true});
  window.addEventListener('pagehide', drain, {passive:true});
  try { (window.requestIdleCallback || function(fn){ return setTimeout(fn, 0); })(drain); } catch(_e) {}
})();
