/* FIX125 單一新版介面來源：舊版可保留函式，但不再接管畫面；母版最後只顯示新版頁面與淡灰標籤 */
(function(){
  'use strict';
  if (window.__YX125_SINGLE_SOURCE_BOOT__) return;
  window.__YX125_SINGLE_SOURCE_BOOT__ = true;

  const doc = document;
  const root = doc.documentElement;
  const STATE = window.__YX125_SINGLE_SOURCE_STATE__ = window.__YX125_SINGLE_SOURCE_STATE__ || {
    legacyFns:Object.create(null), proxies:Object.create(null), master:null, observer:null, releaseTimer:null, ready:false, boot:true
  };
  const UI_FN_NAMES = [
    'loadCustomerBlocks','renderCustomers','selectCustomerForModule',
    'renderWarehouse','renderWarehouseZones','renderWarehouse108','renderWarehouse82','renderWarehouse95','renderWarehouse96','renderWarehouse102','loadWarehouseDynamic','renderWarehouseLegacyA','renderWarehouseLegacyB','__yx96RemovedWarehouseLegacyA','__yx96RemovedWarehouseLegacyB',
    'loadTodayChanges','loadTodayChanges80','loadTodayChanges93','loadTodayChanges95','loadTodayChanges96','loadTodayChanges97','loadTodayChanges98','loadTodayChanges99','__yx96RemovedToday80','__yx96RemovedToday93','__yx96RemovedToday95'
  ];

  root.classList.add('yx125-single-ui-booting');
  root.dataset.yx125SingleInterface = 'booting';
  root.dataset.yx121LuxuryUi = 'disabled-by-fix125';
  root.dataset.yx122LabelUi = 'disabled-by-fix125';
  root.dataset.yx123LabelUi = 'disabled-by-fix125';
  root.dataset.yx124MinimalGreyUi = 'locked';

  function clean(v){ return String(v == null ? '' : v).replace(/\s+/g,' ').trim(); }
  function moduleKey(){
    try { return window.YXHardLock?.moduleKey?.() || doc.querySelector('.module-screen[data-module]')?.getAttribute('data-module') || ((location.pathname || '/') === '/' ? 'home' : ''); }
    catch(_e){ return ''; }
  }
  function isModulePage(){ return !['home','login_page','login',''].includes(moduleKey()) && !!doc.querySelector('.module-screen'); }
  function injectBootStyle(){
    if (doc.getElementById('yx125-single-source-style')) return;
    const style = doc.createElement('style');
    style.id = 'yx125-single-source-style';
    style.textContent = `
html.yx125-single-ui-booting .customer-list,
html.yx125-single-ui-booting #selected-customer-items,
html.yx125-single-ui-booting #zone-A-grid,
html.yx125-single-ui-booting #zone-B-grid,
html.yx125-single-ui-booting #today-summary-cards,
html.yx125-single-ui-booting #today-inbound-list,
html.yx125-single-ui-booting #today-outbound-list,
html.yx125-single-ui-booting #today-order-list,
html.yx125-single-ui-booting #today-unplaced-list,
html.yx125-single-ui-booting #inventory-inline-list,
html.yx125-single-ui-booting #orders-list-section,
html.yx125-single-ui-booting #master-list-section{visibility:hidden!important;}
html[data-yx125-single-interface="locked"] .customer-card-arrow,
html[data-yx125-single-interface="locked"] .fix48-customer-arrow,
html[data-yx125-single-interface="locked"] .yx113-customer-arrow,
html[data-yx125-single-interface="locked"] .yx94-today-refresh-row,
html[data-yx125-single-interface="locked"] .yx95-today-refresh-row,
html[data-yx125-single-interface="locked"] .yx96-today-refresh-row,
html[data-yx125-single-interface="locked"] .yx98-today-refresh-row,
html[data-yx125-single-interface="locked"] #yx94-refresh-today,
html[data-yx125-single-interface="locked"] #yx95-refresh-today,
html[data-yx125-single-interface="locked"] #yx96-refresh-today,
html[data-yx125-single-interface="locked"] #yx98-refresh-today,
html[data-yx125-single-interface="locked"] #warehouse-detail-panel.yx125-hidden-legacy,
html[data-yx125-single-interface="locked"] .yx63-toolbar,
html[data-yx125-single-interface="locked"] .yx62-toolbar,
html[data-yx125-single-interface="locked"] .fix57-toolbar,
html[data-yx125-single-interface="locked"] .fix56-toolbar,
html[data-yx125-single-interface="locked"] .fix55-toolbar{display:none!important;}
html[data-yx125-single-interface="locked"] [data-yx125-new-ui="1"]{visibility:visible!important;}
html[data-yx125-single-interface="locked"] .home-screen .menu-btn{will-change:auto!important;}
`;
    (doc.head || doc.documentElement).appendChild(style);
  }
  injectBootStyle();

  function disableOldVisualInstallers(){
    ['yx121-luxury-label-ui-style','yx122-luxury-label-ui-style','yx123-luxury-label-ui-style','yx118-apple-ui-style'].forEach(id => {
      try { doc.getElementById(id)?.remove(); } catch(_e) {}
    });
    const disabled = Object.freeze({install:function(){ return false; }, disabledBy:'FIX125'});
    ['YXLuxuryLabelUI','YXLuxuryLabelUI122','YXAppleUI'].forEach(name => {
      try {
        Object.defineProperty(window, name, {configurable:true, enumerable:false, get(){ return disabled; }, set(_v){ /* 保留舊模組檔案，但禁止舊視覺重新安裝 */ }});
      } catch(_e) { try { window[name] = disabled; } catch(_e2){} }
    });
  }

  function targetFor(name){
    const n = String(name || '');
    if (/Customer|Customers|loadCustomerBlocks|renderCustomers|selectCustomerForModule/.test(n)) {
      const c = window.YX117CustomerRegions || window.YX116CustomerRegions || window.YX115CustomerRegions || window.YX114CustomerRegions || window.YX113CustomerRegions;
      if (n === 'selectCustomerForModule') return c?.selectCustomer;
      return c?.loadCustomerBlocks;
    }
    if (/Warehouse|renderWarehouse|loadWarehouse/.test(n) || n.indexOf('__yx96RemovedWarehouse') === 0) {
      const w = window.YX116Warehouse;
      if (n === 'renderWarehouseZones') return w?.renderGrid;
      return w?.render;
    }
    if (/Today|loadTodayChanges|__yx96RemovedToday/.test(n)) {
      return window.loadTodayChanges?.__yx113HardLock ? window.loadTodayChanges : null;
    }
    return null;
  }
  function proxyFor(name){
    if (STATE.proxies[name]) return STATE.proxies[name];
    const fn = function YX125_SINGLE_SOURCE_PROXY(){
      const target = targetFor(name);
      if (target && target !== fn) return target.apply(this, arguments);
      // 母版尚未安裝前，舊版自動重畫呼叫直接吃掉，保留舊函式在 legacyFns 內不刪除。
      return Promise.resolve(null);
    };
    try { Object.defineProperty(fn, '__yx125Proxy', {value:name}); } catch(_e) { fn.__yx125Proxy = name; }
    STATE.proxies[name] = fn;
    return fn;
  }
  function guardWindowFunction(name){
    if (!name || Object.prototype.hasOwnProperty.call(STATE.proxies, name)) return;
    const proxy = proxyFor(name);
    try {
      const existing = window[name];
      if (typeof existing === 'function' && existing !== proxy) STATE.legacyFns[name] = existing;
      Object.defineProperty(window, name, {
        configurable:true,
        enumerable:false,
        get(){ return proxy; },
        set(v){ if (typeof v === 'function' && v !== proxy) STATE.legacyFns[name] = v; }
      });
    } catch(_e) {}
  }
  function guardMaster(){
    try {
      let localMaster = window.YX_MASTER || STATE.master;
      Object.defineProperty(window, 'YX_MASTER', {
        configurable:true,
        enumerable:false,
        get(){
          const base = localMaster || {};
          return new Proxy(base, {
            get(obj, prop){
              if (UI_FN_NAMES.includes(String(prop))) return proxyFor(String(prop));
              return obj ? obj[prop] : undefined;
            },
            set(obj, prop, value){ if (obj) obj[prop] = value; return true; },
            ownKeys(obj){ return Reflect.ownKeys(obj || {}); },
            getOwnPropertyDescriptor(obj, prop){
              const d = Object.getOwnPropertyDescriptor(obj || {}, prop);
              return d || {configurable:true, enumerable:true, writable:true, value:undefined};
            }
          });
        },
        set(v){ localMaster = v || {}; STATE.master = localMaster; }
      });
    } catch(_e) {}
  }

  // 在 app.js 載入前先佔住舊版 UI 入口；舊函式仍被記錄，但不會自己畫面。
  UI_FN_NAMES.forEach(guardWindowFunction);
  guardMaster();
  disableOldVisualInstallers();

  function markNewOnly(){
    doc.querySelectorAll('.customer-list').forEach(el => el.dataset.yx125NewUi = '1');
    ['zone-A-grid','zone-B-grid','today-summary-cards','today-inbound-list','today-outbound-list','today-order-list','today-unplaced-list','inventory-inline-list','selected-customer-items'].forEach(id => {
      const el = doc.getElementById(id); if (el) el.dataset.yx125NewUi = '1';
    });
  }
  function hideOldArtifacts(){
    disableOldVisualInstallers();
    doc.querySelectorAll('.customer-card-arrow,.fix48-customer-arrow,.yx113-customer-arrow').forEach(el => el.remove());
    doc.querySelectorAll('#yx94-refresh-today,#yx95-refresh-today,#yx96-refresh-today,#yx98-refresh-today,.yx94-today-refresh-row,.yx95-today-refresh-row,.yx96-today-refresh-row,.yx98-today-refresh-row').forEach(el => (el.closest?.('.btn-row') || el).remove());
    const detail = doc.getElementById('warehouse-detail-panel');
    if (detail) { detail.classList.add('hidden','yx125-hidden-legacy'); detail.style.display = 'none'; }
    doc.querySelectorAll('#yx71-warehouse-cell-menu,#yx91-warehouse-batch-panel,#yx97-warehouse-batch-panel,#yx99-warehouse-batch-panel,#yx102-warehouse-batch-panel,#yx103-warehouse-batch-panel,#yx105-warehouse-batch-panel').forEach(el => el.remove());
  }
  function callFreshRender(){
    const m = moduleKey();
    try { if (['orders','master_order','ship','customers'].includes(m)) (window.YX117CustomerRegions || window.YX116CustomerRegions || window.YX113CustomerRegions)?.loadCustomerBlocks?.(true); } catch(_e) {}
    try { if (m === 'warehouse') window.YX116Warehouse?.render?.(true); } catch(_e) {}
    try { if (m === 'today_changes' && window.loadTodayChanges?.__yx113HardLock) window.loadTodayChanges({force:true, silent:true}); } catch(_e) {}
    try { if (['inventory','orders','master_order'].includes(m)) window.YX113ProductActions?.refreshCurrent?.(); } catch(_e) {}
  }
  function observeOnce(){
    if (STATE.observer || !isModulePage()) return;
    const NativeMO = window.__YX96_NATIVE_MUTATION_OBSERVER__ || window.MutationObserver;
    if (typeof NativeMO === 'undefined') return;
    const targets = [doc.getElementById('region-picker-section'), doc.getElementById('warehouse-section'), doc.getElementById('today-summary-cards'), doc.getElementById('inventory-inline-panel'), doc.getElementById('selected-customer-items')].filter(Boolean);
    if (!targets.length) return;
    let t = null;
    STATE.observer = new NativeMO(muts => {
      if (root.classList.contains('yx125-single-ui-booting')) return;
      const bad = muts.some(m => Array.from(m.addedNodes || []).some(n => n && n.nodeType === 1 && (n.matches?.('.customer-card-arrow,.fix48-customer-arrow,.yx113-customer-arrow,.yx96-slot,.yx102-slot,.yx103-slot,.yx105-slot,#yx94-refresh-today,#yx95-refresh-today,#yx96-refresh-today,#yx98-refresh-today') || n.querySelector?.('.customer-card-arrow,.fix48-customer-arrow,.yx113-customer-arrow,.yx96-slot,.yx102-slot,.yx103-slot,.yx105-slot,#yx94-refresh-today,#yx95-refresh-today,#yx96-refresh-today,#yx98-refresh-today'))));
      if (!bad) return;
      clearTimeout(t);
      t = setTimeout(() => { hideOldArtifacts(); callFreshRender(); }, 80);
    });
    targets.forEach(el => STATE.observer.observe(el, {childList:true, subtree:true}));
    setTimeout(() => { try { STATE.observer?.disconnect(); STATE.observer = null; } catch(_e){} }, 9000);
  }
  function release(){
    root.dataset.yx125SingleInterface = 'locked';
    root.classList.remove('yx125-single-ui-booting');
    root.classList.add('yx125-single-ui-ready');
    if (doc.body) doc.body.classList.add('yx125-single-ui-ready');
    STATE.ready = true;
    markNewOnly();
    hideOldArtifacts();
  }
  function install(opts){
    root.dataset.yx125SingleInterface = 'locked';
    disableOldVisualInstallers();
    UI_FN_NAMES.forEach(guardWindowFunction);
    guardMaster();
    markNewOnly();
    hideOldArtifacts();
    observeOnce();
    if (opts && opts.release !== false) release();
  }

  window.YX125SingleSource = {install, release, hideOldArtifacts, callFreshRender, proxyFor, legacyFns:STATE.legacyFns};
  function register(){
    const YX = window.YXHardLock;
    if (!YX || !YX.register) return false;
    YX.register('interface_single_source_v125', {install});
    return true;
  }
  if (!register()) [0,80,200,600].forEach(ms => setTimeout(register, ms));

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', () => {
      if (!isModulePage()) install({release:true});
      else install({release:false});
    }, {once:true});
  } else {
    if (!isModulePage()) install({release:true}); else install({release:false});
  }
})();
