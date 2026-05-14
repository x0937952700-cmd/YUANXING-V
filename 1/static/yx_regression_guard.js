/* V483 regression guard: prevents old empty-overwrite / timeout-wash regressions. No polling, no MutationObserver. */
(function(){
  'use strict';
  if (window.YXRegressionGuard && window.YXRegressionGuard.version === 'v485-restore-buttons-realtime-ship-wh') return;
  const VERSION = 'v485-restore-buttons-realtime-ship-wh';
  const KEY = 'yx_regression_guard_events_v480';
  const MAX = 80;
  const clean = v => String(v == null ? '' : v).slice(0, 1200);
  const rowsOf = v => Array.isArray(v) ? v : (Array.isArray(v?.rows) ? v.rows : (Array.isArray(v?.items) ? v.items : []));
  const nonEmpty = v => rowsOf(v).length > 0;
  const readEvents = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch(_e){ return []; } };
  const writeEvents = rows => { try { localStorage.setItem(KEY, JSON.stringify((rows || []).slice(0, MAX))); } catch(_e){} };
  function allowedEmptyReason(reason){
    reason = clean(reason).toLowerCase();
    return /delete|remove|clear|ship|sync|authoritative|full|manual-empty|reset/.test(reason);
  }
  function record(type, detail){
    const item = {type:clean(type), detail:detail || {}, at:new Date().toISOString(), page:location.pathname, module:document.body?.dataset?.module || window.__YX_PAGE_ENDPOINT__ || '', version:VERSION};
    const rows = readEvents(); rows.unshift(item); writeEvents(rows);
    try { window.YXDiagnostics?.record?.('regression_guard.' + type, item); } catch(_e) {}
    try { window.dispatchEvent(new CustomEvent('yx:regression-guard-event', {detail:item})); } catch(_e) {}
    return item;
  }
  function canReplaceWithEmpty(source, rows, opts){
    if (Array.isArray(rows) && rows.length > 0) return true;
    opts = opts || {};
    if (opts.allowEmpty === true || opts.authoritativeFullSync === true || opts.sync_authority === true || opts.yxDbOnly === true) return true;
    if (allowedEmptyReason(opts.reason || opts.action || '')) return true;
    const current = window.YXDataStore?.productRowsSync?.(source) || [];
    if (current.length > 0) return false;
    return true;
  }
  function patchDataStore(){
    const ds = window.YXDataStore;
    if (!ds || ds.__yxRegressionGuardV480) return false;
    ds.__yxRegressionGuardV480 = true;
    const originalSetRows = ds.setRows;
    if (typeof originalSetRows === 'function') {
      ds.setRows = function(source, rows, opts){
        opts = opts || {};
        if (!canReplaceWithEmpty(source, rows, opts)) {
          record('empty_overwrite_blocked', {source:clean(source), incoming_count:rowsOf(rows).length, current_count:(ds.productRowsSync?.(source)||[]).length, reason:opts.reason || ''});
          return ds.productRowsSync ? ds.productRowsSync(source) : [];
        }
        return originalSetRows.call(this, source, rows, opts);
      };
    }
    const originalApply = ds.applyResponseRows;
    if (typeof originalApply === 'function') {
      ds.applyResponseRows = function(source, data, opts){
        opts = opts || {};
        const incoming = rowsOf(data);
        if (!incoming.length && !canReplaceWithEmpty(source, incoming, opts)) {
          record('empty_response_rows_blocked', {source:clean(source), reason:opts.reason || '', data_keys:Object.keys(data || {}).slice(0,20)});
          return ds.productRowsSync ? ds.productRowsSync(source) : [];
        }
        return originalApply.call(this, source, data, opts);
      };
    }
    const originalToday = ds.getTodayWithUnplaced;
    if (typeof originalToday === 'function') {
      ds.getTodayWithUnplaced = async function(){
        const out = await originalToday.apply(this, arguments);
        try {
          const wh = await ds.getWarehouseAvailable?.();
          const items = rowsOf(wh);
          const count = items.reduce((n, it) => n + Math.max(0, Number(it?.unplaced_qty || it?.available_qty || it?.remaining_qty || it?.qty || 1) || 0), 0);
          out.summary = out.summary || {};
          if (count > 0 && Number(out.summary.unplaced_count || 0) === 0) {
            out.summary.unplaced_count = count;
            out.unplaced_count = count;
            record('today_unplaced_guard', {unplaced_count:count});
          }
        } catch(_e) {}
        return out;
      };
    }
    return true;
  }
  function ensureShipPreviewVisible(){
    try{
      if ((document.body?.dataset?.module || '') !== 'ship') return;
      const panel = document.getElementById('ship-preview-panel') || document.getElementById('module-result');
      if (panel && !panel.textContent.trim()) {
        panel.classList.remove('hidden'); panel.style.display = '';
        panel.innerHTML = '<div class="empty-state-card compact-empty">出貨預覽建立中，若沒有顯示請檢查商品是否已選取。</div>';
        record('shipping_preview_guard', {panel:panel.id || ''});
      }
    }catch(_e){}
  }
  function guardWarehouseTimeout(ev){
    try{
      const hasLocal = !!(window.YXDataStore && (window.YXDataStore.getWarehouse || window.YXDataStore.productRowsSync));
      record('warehouse_timeout_guard', {has_local_data_layer:hasLocal, detail:ev?.detail || {}});
      const empty = document.querySelector('.warehouse-empty,.empty-state-card');
      if (empty && /逾時|timeout|空白|沒有資料/.test(empty.textContent || '')) {
        empty.innerHTML = '<b>倉庫圖讀取逾時</b><br><span>已保留本機同步資料；請按同步資料或手動刷新校正，不會用逾時空資料覆蓋商品。</span>';
      }
    }catch(_e){}
  }
  function runSelfCheck(){
    const issues = [];
    if (!window.YXDataStore) issues.push('YXDataStore missing');
    if (!window.YXMutationBus) issues.push('YXMutationBus missing');
    if (document.querySelector('script[src*="yx_v452_max_repair"]')) issues.push('old yx_v452_max_repair loaded');
    if (issues.length) record('self_check_warn', {issues});
    return {ok:issues.length === 0, issues, version:VERSION};
  }
  function install(){
    patchDataStore();
    document.addEventListener('click', function(ev){ if(ev.target?.closest?.('#ship-confirm-btn,#submit-shipping-btn,#confirm-ship-btn,#submit-btn')) setTimeout(ensureShipPreviewVisible, 0); }, true);
    window.addEventListener('yx:warehouse-timeout', guardWarehouseTimeout, false);
    window.addEventListener('yx:warehouse-render-timeout', guardWarehouseTimeout, false);
    window.addEventListener('yx:data-store-updated', function(ev){ try{ if(rowsOf(ev?.detail?.rows).length === 0 && !allowedEmptyReason(ev?.detail?.reason || '')) record('data_store_zero_rows_seen', ev.detail || {}); }catch(_e){} }, false);
  }
  window.YXRegressionGuard = {version:VERSION, install, patchDataStore, canReplaceWithEmpty, record, recent:readEvents, clear:function(){writeEvents([]);}, runSelfCheck};
  install();
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ install(); runSelfCheck(); }, {once:true});
  else runSelfCheck();
})();
