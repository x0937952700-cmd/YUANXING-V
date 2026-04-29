/* FIX118 舊版渲染隔離：只隔離舊畫面輸出，不刪功能、不改資料 API */
(function(){
  'use strict';
  const YX = window.YXHardLock;
  if (!YX) return;
  const state = {observer:null, timer:null};
  const $ = id => document.getElementById(id);
  const moduleKey = () => YX.moduleKey();
  const NativeMO = () => window.__YX96_NATIVE_MUTATION_OBSERVER__ || window.MutationObserver;

  function hide(el){
    if (!el) return;
    el.classList.add('yx115-hidden-legacy');
    el.setAttribute('aria-hidden','true');
    el.style.display = 'none';
  }
  function isolateToday(){
    if (moduleKey() !== 'today_changes' && !$('today-summary-cards')) return;
    document.documentElement.dataset.yx115Today = 'locked';
    document.querySelectorAll('#yx94-refresh-today,#yx95-refresh-today,#yx96-refresh-today,#yx98-refresh-today,.yx94-today-refresh-row,.yx95-today-refresh-row,.yx96-today-refresh-row,.yx98-today-refresh-row,.yx99-removed-today-cards').forEach(el => {
      if (!el.closest?.('#today-summary-cards')) hide(el.closest?.('.btn-row') || el);
    });
    document.querySelectorAll('.today-item,.yx112-today-row').forEach(row => {
      const txt = row.textContent || '';
      if (/customer_items|customer_profiles|corrections|image_hashes|登入|login/i.test(txt) && !/訂單|庫存|進貨|出貨|倉庫|未錄入/.test(txt)) hide(row);
    });
  }
  function isolateSettings(){
    if (moduleKey() !== 'settings' && !$('audit-trails-list') && !$('admin-users')) return;
    document.documentElement.dataset.yx115Settings = 'locked';
    document.querySelectorAll('#audit-trails-list .deduct-card,#audit-trails-list .chip-item,#audit-trails-list .today-item').forEach(row => {
      const txt = row.textContent || '';
      if (/customer_items|customer_profiles|corrections|image_hashes|todo_items|users|logs|errors/i.test(txt) && !/訂單|總單|庫存|進貨|出貨|倉庫/.test(txt)) hide(row);
    });
  }
  function isolateCustomers(){
    const m = moduleKey();
    if (!['orders','master_order','ship','customers'].includes(m) && !$('region-north') && !$('customers-north')) return;
    document.documentElement.dataset.yx115Customers = 'locked';
    document.documentElement.dataset.yx116Customers = 'locked';
    document.documentElement.dataset.yx117Customers = 'locked';
    document.querySelectorAll('.customer-card-arrow,.fix48-customer-arrow,.yx113-customer-arrow').forEach(hide);
    // FIX134：舊版客戶卡判定要同時不具新版 class 才算舊版。
    // 原本用兩個 :not() 逗號選擇器會把新版卡誤判成舊版，造成北中南區反覆刷新。
    const bad = document.querySelector('.customer-region-card:not(.yx114-customer-card):not(.yx116-customer-card),.customer-card-arrow,.fix48-customer-arrow');
    if (bad && window.YX116CustomerRegions?.loadCustomerBlocks) {
      try { window.YX116CustomerRegions.loadCustomerBlocks(true); } catch(_e) {}
    } else if (bad && window.YX115CustomerRegions?.loadCustomerBlocks) {
      try { window.YX115CustomerRegions.loadCustomerBlocks(true); } catch(_e) {}
    } else if (bad && window.YX114CustomerRegions?.loadCustomerBlocks) {
      try { window.YX114CustomerRegions.loadCustomerBlocks(true); } catch(_e) {}
    }
  }
  function isolateProducts(){
    const m = moduleKey();
    if (!['inventory','orders','master_order'].includes(m)) return;
    document.documentElement.dataset.yx115Products = 'locked';
    document.querySelectorAll('.yx63-toolbar,.yx62-toolbar,.fix57-toolbar,.fix56-toolbar,.fix55-toolbar,.fix52-list-toolbar,.yx63-summary,.yx62-summary,.fix57-summary-panel,.fix56-summary-panel,.fix55-summary-panel,.yx63-card-list:not(.yx113-product-list)').forEach(el => {
      if (!el.classList.contains('yx114-toolbar') && !el.classList.contains('yx113-summary') && !el.classList.contains('yx113-product-list')) hide(el);
    });
  }
  function isolateWarehouse(){
    if (moduleKey() !== 'warehouse' && !$('zone-A-grid') && !$('zone-B-grid')) return;
    document.documentElement.dataset.yx115Warehouse = 'locked';
    document.documentElement.dataset.yx116Warehouse = 'locked';
    document.documentElement.dataset.yx117Warehouse = 'locked';
    document.querySelectorAll('#warehouse-detail-panel,#yx71-warehouse-cell-menu,#yx91-warehouse-batch-panel,#yx97-warehouse-batch-panel,#yx99-warehouse-batch-panel,#yx102-warehouse-batch-panel,#yx103-warehouse-batch-panel,#yx105-warehouse-batch-panel').forEach(el => {
      if (el.id === 'warehouse-detail-panel') { el.innerHTML = ''; hide(el); }
      else hide(el);
    });
    document.querySelectorAll('.yx108-slot,.yx106-slot,[data-zone][data-column][data-slot]').forEach(slot => {
      slot.querySelectorAll('.yx102-slot-group,.yx102-slot-head,.yx102-slot-qty,.yx106-slot-group,.yx106-slot-head,.yx106-slot-qty,.yx106-slot-customer,.yx106-slot-title,.small-note').forEach(hide);
      slot.querySelectorAll('.yx108-slot-customers').forEach(el => {
        el.textContent = YX.clean(el.textContent || '').replace(/FOB代付|FOB代|FOB|CNF/gi,'').replace(/[、,，\s]+/g,'/').replace(/\/+$/,'').replace(/^\//,'') || '庫存';
      });
    });
  }
  function isolateAll(){
    isolateToday(); isolateSettings(); isolateCustomers(); isolateProducts(); isolateWarehouse();
  }
  function schedule(){
    if (state.timer) return;
    state.timer = setTimeout(() => { state.timer = null; isolateAll(); }, 60);
  }
  function observe(){
    if (state.observer) return;
    const MO = NativeMO();
    if (typeof MO === 'undefined') return;
    const targets = [
      $('today-summary-cards'), $('today-inbound-list'), $('today-outbound-list'), $('today-order-list'), $('today-unplaced-list'),
      $('audit-trails-list'), $('admin-users'),
      $('region-north'), $('region-center'), $('region-south'), $('customers-north'), $('customers-center'), $('customers-south'),
      $('inventory-inline-panel'), $('orders-list-section'), $('master-list-section'),
      $('zone-A-grid'), $('zone-B-grid'), $('warehouse-section')
    ].filter(Boolean);
    if (!targets.length) return;
    state.observer = new MO(muts => {
      for (const m of muts){
        if ((m.addedNodes && m.addedNodes.length) || (m.removedNodes && m.removedNodes.length)) { schedule(); break; }
      }
    });
    targets.forEach(t => state.observer.observe(t, {childList:true, subtree:true}));
  }
  function install(){
    document.documentElement.dataset.yx115LegacyIsolation = 'locked';
    document.documentElement.dataset.yx116LegacyIsolation = 'locked';
    isolateAll(); observe();
    [100, 300, 800, 1600, 3200].forEach(ms => setTimeout(isolateAll, ms));
  }
  YX.register('legacy_isolation', {install, isolateAll});
})();
