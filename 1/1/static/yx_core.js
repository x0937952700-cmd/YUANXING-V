
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
  root.version = '119-asset-cache-alignment-v155';
  window.YX = root;
})();


/* V132 local-first data cache: page opens render cached rows immediately, then refresh DB in background. */
(function(){
  'use strict';
  const root = window.YX || (window.YX = {});
  const PREFIX = 'yx_v155_cache_';
  function now(){ return Date.now(); }
  function clone(v){ try { return JSON.parse(JSON.stringify(v)); } catch(_e) { return v; } }
  function read(name, maxAgeMs){
    const prefixes = [PREFIX, 'yx_v154_cache_', 'yx_v153_cache_', 'yx_v146_cache_', 'yx_v145_cache_', 'yx_v144_cache_', 'yx_v143_cache_', 'yx_v142_cache_', 'yx_v141_cache_', 'yx_v140_cache_', 'yx_v139_cache_', 'yx_v138_cache_', 'yx_v137_cache_', 'yx_v136_cache_', 'yx_v135_cache_', 'yx_v134_cache_', 'yx_v132_cache_'];
    for (const pref of prefixes) {
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
  function remove(name){ try{ localStorage.removeItem(PREFIX + name); }catch(_e){} }
  function clearGroup(prefix){
    try{
      const k = PREFIX + prefix;
      for(let i=localStorage.length-1;i>=0;i--){ const key = localStorage.key(i); if(key && key.indexOf(k) === 0) localStorage.removeItem(key); }
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
  root.cache = Object.assign(root.cache || {}, {version:'v155', read, write, remove, clearGroup, paintThenFetch});
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
  root.scheduler = Object.assign(root.scheduler || {}, {idle, afterPaint, softNavigate, version:'v155'});
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
  const VERSION='150';
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
  window.YXBackgroundSave = {enqueue, request, requestSoft, drain, pending:()=>read().length, key:KEY, version:'119-v155-old-queue-disabled'};
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
  root.nav = Object.assign(root.nav || {}, {markLeaving, nextPageSeq, version:'v155'});
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
  root.nav = Object.assign(root.nav || {}, {markLeaving:markRouteLeaving, currentToken, version:'v155'});
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
  window.addEventListener('yx:chunk-render-complete', () => setStatus('已顯示快取/分批完成', 'ok'));
  window.addEventListener('yx:route-leaving', () => setStatus('', ''));
})();

/* V144 final speed guard: GET timeout, stale cache fallback, navigation-safe requests. */
(function(){
  'use strict';
  const root = window.YX || (window.YX = {});
  if (root.__v144FinalSpeedGuard) return;
  root.__v144FinalSpeedGuard = true;
  const API_CACHE_PREFIX = 'yx_v149_api_cache_';
  const FALLBACK_PREFIXES = ['yx_v149_api_cache_','yx_v148_api_cache_','yx_v147_api_cache_','yx_v146_api_cache_','yx_v145_api_cache_','yx_v144_api_cache_','yx_v143_api_cache_','yx_v142_api_cache_','yx_v141_api_cache_','yx_v140_api_cache_','yx_v139_cache_','yx_v138_cache_','yx_v137_cache_','yx_v136_cache_'];
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
  root.apiCache = Object.assign(root.apiCache || {}, {version:'v155', read:readApiCache, write:writeApiCache});
  root.requestGuard = Object.assign(root.requestGuard || {}, {version:'v155', inflightCount:()=>inflight.size});
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
  const VERSION = 'v149';
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
      const keep = ['yx_v149_cache_','yx_v148_cache_','yx_v149_api_cache_','yx_v148_api_cache_','yx_bg_save_queue_119'];
      const stalePrefixes = ['yx_v132_cache_','yx_v134_cache_','yx_v135_cache_','yx_v136_cache_','yx_v137_cache_','yx_v138_cache_','yx_v139_cache_','yx_v140_cache_','yx_v141_cache_','yx_v142_cache_','yx_v143_cache_','yx_v144_cache_','yx_v145_cache_'];
      const apiStale = ['yx_v136_api_cache_','yx_v137_api_cache_','yx_v138_api_cache_','yx_v139_api_cache_','yx_v140_api_cache_','yx_v141_api_cache_','yx_v142_api_cache_','yx_v143_api_cache_'];
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
      const api = root.api || window.fetch;
      if (typeof api === 'function') {
        api('/api/performance/cache-summary', {method:'GET', timeoutMs:3500, softCacheMs:600, key:'v149-cache-summary'}).catch(function(){});
      }
    } catch(_e) {}
  });
})();



/* V149 guarded route prewarm: do not let prewarm/cache itself slow the app. No polling, no MutationObserver. */
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



/* V153 adaptive degrade guard: if the phone/network is slow, keep pages usable by skipping non-essential prewarm/heavy refresh. No polling, no MutationObserver. */
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
