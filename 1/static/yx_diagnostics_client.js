/* V483 client diagnostic collector: error-only, no polling/timer/observer, no API cache change. */
(function(){
  'use strict';
  if (window.YXDiagnostics && window.YXDiagnostics.version === 'v518-restore-satisfied-ship-preview-diag-pack28') return;
  const VERSION = 'v518-restore-satisfied-ship-preview-diag-pack28';
  const MAX_LOCAL = 80;
  const KEY = 'yx_diagnostics_recent_errors_v480';
  const nowIso = () => new Date().toISOString();
  const clean = v => String(v == null ? '' : v).slice(0, 1200);
  function readLocal(){ try { return JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch(_e){ return []; } }
  function writeLocal(rows){ try { localStorage.setItem(KEY, JSON.stringify((rows || []).slice(0, MAX_LOCAL))); } catch(_e){} }
  function pushLocal(item){ const rows = readLocal(); rows.unshift(item); writeLocal(rows); return rows; }
  function payload(type, detail){
    return {
      type: clean(type), detail: detail || {},
      page: location.pathname, module: document.body?.dataset?.module || window.__YX_PAGE_ENDPOINT__ || '',
      app_version: window.__YX_APP_VERSION__ || '', static_version: window.__YX_STATIC_VERSION__ || '',
      at: nowIso(), user: window.__YX_USERNAME__ || ''
    };
  }
  function send(item){
    pushLocal(item);
    try{
      const body = JSON.stringify(item);
      if (navigator.sendBeacon) {
        const blob = new Blob([body], {type:'application/json'});
        navigator.sendBeacon('/api/diagnostics/client-log', blob);
      } else {
        const raw = window.__YX_DIAG_NATIVE_FETCH__ || window.fetch;
        raw('/api/diagnostics/client-log', {method:'POST', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body, yxRawFetch:true}).catch(()=>{});
      }
    }catch(_e){}
  }
  function record(type, detail){
    const item = payload(type, detail);
    send(item);
    try { window.dispatchEvent(new CustomEvent('yx:diagnostic-error-recorded', {detail:item})); } catch(_e){}
    return item;
  }
  window.addEventListener('error', function(e){
    record('window.error', {message:clean(e.message), source:clean(e.filename), line:e.lineno||0, col:e.colno||0, stack:clean(e.error && e.error.stack)});
  }, true);
  window.addEventListener('unhandledrejection', function(e){
    const r = e.reason || {};
    record('unhandledrejection', {message:clean(r.message || r), stack:clean(r.stack || '')});
  }, true);
  if (!window.__YX_DIAG_FETCH_WRAP__) {
    window.__YX_DIAG_FETCH_WRAP__ = true;
    window.__YX_DIAG_NATIVE_FETCH__ = window.fetch;
    window.fetch = function(input, init){
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      const started = Date.now();
      const raw = window.__YX_DIAG_NATIVE_FETCH__;
      return raw.apply(this, arguments).then(function(res){
        try{
          const path = new URL(String(url), location.origin).pathname;
          const ms = Date.now() - started;
          const softDiag = path === '/api/performance/cache-summary' || /^\/api\/health\/(postdeploy-evidence-report|final-evidence-bundle|final-gap-report|operation-closed-loop)$/.test(path);
          if (path.startsWith('/api/') && !path.includes('/api/diagnostics/') && !softDiag && (ms > 4500 || res.status >= 500)) {
            record('api.slow_or_error', {url:path, status:res.status, ms:ms});
          }
        }catch(_e){}
        return res;
      }).catch(function(err){
        try{
          const path = new URL(String(url), location.origin).pathname;
          const softDiag = path === '/api/performance/cache-summary' || path === '/api/performance/route-prewarm' || /^\/api\/health\/(postdeploy-evidence-report|final-evidence-bundle|final-gap-report|operation-closed-loop)$/.test(path);
          if (path.startsWith('/api/') && !path.includes('/api/diagnostics/') && !softDiag) record('api.fetch_failed', {url:path, message:clean(err && err.message)});
        }catch(_e){}
        throw err;
      });
    };
  }

  function formatSyncTime(v){
    const n = Number(v || 0);
    if(!n) return '';
    try { return new Date(n).toLocaleString('zh-TW', {hour12:false}); } catch(_e) { return String(v || ''); }
  }

  async function snapshot(){
    const out = {version:VERSION, app_version:window.__YX_APP_VERSION__||'', static_version:window.__YX_STATIC_VERSION__||'', page:location.pathname, module:document.body?.dataset?.module||'', last_errors:readLocal(), regression_guard_events:(window.YXRegressionGuard?.recent?.() || []), regression_guard_self_check:(window.YXRegressionGuard?.runSelfCheck?.() || null), sync:{}, local_counts:{}};
    try { const raw = localStorage.getItem('yx_device_sync_last_success_at') || ''; out.sync.last_success_at = raw; out.sync.last_success_display = formatSyncTime(raw) || raw; } catch(_e){}
    try { const a = JSON.parse(localStorage.getItem('yx_device_sync_v453_auto') || 'null') || {}; out.sync.auto_enabled = a.enabled ? '1' : ''; out.sync.auto_next = a.next_run_at || ''; } catch(_e){ try { out.sync.auto_enabled = localStorage.getItem('yx_device_sync_auto_enabled') || ''; } catch(__e){} }
    try{
      if(window.YXDataStore){
        const sources = ['inventory','orders','master_order'];
        for(const s of sources){ out.local_counts[s] = (window.YXDataStore.productRowsSync ? window.YXDataStore.productRowsSync(s) : []).length; }
        const today = await window.YXDataStore.getTodayWithUnplaced?.();
        out.local_counts.today_unplaced = today?.summary?.unplaced_count || 0;
        const wh = await window.YXDataStore.getWarehouse?.();
        out.local_counts.warehouse_cells = Array.isArray(wh?.items) ? wh.items.length : (Array.isArray(wh?.cells) ? wh.cells.length : 0);
      }
    }catch(e){ out.snapshot_error = clean(e.message || e); }
    return out;
  }
  window.YXDiagnostics = {version:VERSION, record, recent:readLocal, clear:function(){writeLocal([]);}, snapshot};
})();
