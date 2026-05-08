/* 沅興木業 V116 cache guard: silent one-shot cleanup; no UI layer, no fetch interception, no page refresh. */
(function(){
  'use strict';
  if (window.__YX_CACHE_GUARD_RUNNING__) return;
  window.__YX_CACHE_GUARD_RUNNING__ = true;
  const VERSION='V116';
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
      const sw=await unregisterServiceWorkers();
      const cache=await clearBrowserCachesOnce();
      const idb=await clearOldIndexedDBOnce();
      localStorage.setItem(FLAG,'1');
      window.__YX_CACHE_STATUS__={version:VERSION, serviceWorkers:sw.count||0, caches:cache.count||0, indexedDB:!!idb, refreshed:false};
    }catch(_){ }
  }
  window.YXCache={version:VERSION, run, unregisterServiceWorkers, clearBrowserCachesOnce, clearOldIndexedDBOnce};
  idle(run);
})();

/* V116 background save queue: operations continue after page switch; no polling, no UI layer. */
(function(){
  'use strict';
  if (window.__YX_BG_SAVE_V116__) return;
  window.__YX_BG_SAVE_V116__ = true;
  const KEY = 'yx_bg_save_queue_v114';
  let running = false;
  function nowId(){ return 'bg-' + Date.now() + '-' + Math.random().toString(36).slice(2); }
  function read(){
    try { const q = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(q) ? q : []; }
    catch(_e){ return []; }
  }
  function write(q){
    try { localStorage.setItem(KEY, JSON.stringify((q || []).slice(-120))); }
    catch(_e){}
  }
  function remove(id){ write(read().filter(x => x && x.id !== id)); }
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
    if (!res.ok || (data && data.success === false)) throw new Error((data && (data.error || data.message)) || ('HTTP ' + res.status));
    return data;
  }
  async function drain(){
    if (running) return;
    running = true;
    try {
      let q = read();
      for (const item of q.slice()) {
        try { await send(item); remove(item.id); }
        catch(_e) { break; }
      }
    } finally { running = false; }
  }
  function enqueue(url, payload, opt){
    const item = {
      id: nowId(), url,
      method: (opt && opt.method) || 'POST',
      headers: (opt && opt.headers) || {},
      body: typeof payload === 'string' ? payload : JSON.stringify(payload || {}),
      created_at: Date.now()
    };
    const q = read(); q.push(item); write(q);
    return item;
  }
  function request(url, payload, opt){
    const item = enqueue(url, payload, opt || {});
    return send(item).then(data => { remove(item.id); return data; }).catch(err => { drain(); throw err; });
  }
  window.YXBackgroundSave = {enqueue, request, drain, pending:()=>read().length};
  window.addEventListener('online', drain, {passive:true});
  window.addEventListener('visibilitychange', function(){ if (document.visibilityState === 'hidden') drain(); }, {passive:true});
  window.addEventListener('pagehide', drain, {passive:true});
  try { (window.requestIdleCallback || function(fn){ return setTimeout(fn, 0); })(drain); } catch(_e) {}
})();
