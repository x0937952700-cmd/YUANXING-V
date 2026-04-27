/* FIX114 倉庫硬鎖：格子固定只顯示格號、客戶紅字、件數藍字；舊入口不再覆蓋新版 */
(function(){
  'use strict';
  const YX = window.YXHardLock;
  if (!YX) return;
  const state = {wrapped:false, observer:null, repairTimer:null, normalizing:false};
  function $(id){ return document.getElementById(id); }
  function isWarehouse(){ return YX.moduleKey() === 'warehouse' || !!$('zone-A-grid') || !!$('zone-B-grid'); }
  function cleanCustomerText(v){
    const raw = YX.clean(v || '')
      .replace(/FOB代付|FOB代|FOB|CNF/gi, '')
      .replace(/[、,，\s]+/g, '/')
      .replace(/\/+/g, '/')
      .replace(/^\/|\/$/g, '');
    return raw || '庫存';
  }
  function normalizeSlot(slot){
    if (!slot || state.normalizing) return;
    slot.querySelectorAll('.yx102-slot-group,.yx102-slot-head,.yx102-slot-qty,.yx106-slot-group,.yx106-slot-head,.yx106-slot-qty,.small-note').forEach(el => {
      if (!el.classList.contains('yx108-slot-row')) el.remove();
    });
    const row1 = slot.querySelector('.yx108-slot-row1');
    const no = slot.querySelector('.yx108-slot-no');
    const cust = slot.querySelector('.yx108-slot-customers');
    if (row1 && no && cust) {
      cust.textContent = cleanCustomerText(cust.textContent);
      // 保持格號與客戶同一行：1 客戶/客戶/客戶
      row1.classList.add('yx114-slot-line');
    }
    slot.querySelectorAll('.yx108-slot-row2,.yx108-slot-sum,.yx108-slot-total').forEach(el => el.classList.add('yx113-warehouse-qty-row','yx114-warehouse-qty-row'));
  }
  function cleanupLegacyPanels(){
    document.querySelectorAll([
      '#warehouse-detail-panel','#warehouse-cell-items:not(.yx113-keep)',
      '#yx71-warehouse-cell-menu','#yx91-warehouse-batch-panel','#yx97-warehouse-batch-panel','#yx99-warehouse-batch-panel','#yx102-warehouse-batch-panel','#yx103-warehouse-batch-panel','#yx105-warehouse-batch-panel',
      '#yx91-warehouse-detail-panel','#yx97-warehouse-detail-panel','#yx99-warehouse-detail-panel','#yx102-warehouse-detail-panel','#yx103-warehouse-detail-panel','#yx105-warehouse-detail-panel'
    ].join(',')).forEach(el => {
      if (el.id === 'warehouse-detail-panel') { el.innerHTML = ''; el.classList.add('hidden','yx113-hidden-legacy','yx114-hidden-legacy'); el.style.display = 'none'; }
      else if (el.id !== 'warehouse-cell-items') el.remove();
    });
    state.normalizing = true;
    document.querySelectorAll('.yx108-slot,.yx106-slot,[data-zone][data-column][data-slot]').forEach(slot => {
      state.normalizing = false;
      normalizeSlot(slot);
      state.normalizing = true;
    });
    state.normalizing = false;
  }
  function wrapFn(name, after){
    const orig = window[name];
    if (typeof orig !== 'function' || orig.__yx114WarehouseWrapped) return;
    const wrapped = async function(...args){
      const ret = orig.apply(this, args);
      if (ret && typeof ret.then === 'function') {
        try { return await ret; }
        finally { try { after(); } catch(_e) {} }
      }
      try { after(); } catch(_e) {}
      return ret;
    };
    wrapped.__yx114WarehouseWrapped = true;
    YX.mark(wrapped, 'warehouse_' + name);
    try { YX.hardAssign(name, wrapped, {configurable:false}); } catch(_e) { window[name] = wrapped; }
  }
  function aliasWarehouseEntries(){
    const after = () => setTimeout(cleanupLegacyPanels, 0);
    wrapFn('renderWarehouse', after);
    wrapFn('renderWarehouseZones', after);
    wrapFn('renderWarehouseGrid96', after);
    const render = window.renderWarehouse;
    const open = window.openWarehouseModal;
    if (typeof render === 'function') ['renderWarehouseLegacyA','renderWarehouseLegacyB','loadWarehouseDynamic','renderWarehouse82','renderWarehouse95','renderWarehouse96','renderWarehouse102'].forEach(n => { try { YX.hardAssign(n, render, {configurable:true}); } catch(_e){ try { window[n] = render; } catch(_e2){} } });
    if (typeof open === 'function') ['openWarehouseCellEditor101','showWarehouseDetail'].forEach(n => { try { window[n] = open; } catch(_e){} });
  }
  function scheduleRepair(){
    if (state.repairTimer) return;
    state.repairTimer = setTimeout(() => {
      state.repairTimer = null;
      cleanupLegacyPanels();
      const bad = document.querySelector('#zone-A-grid .yx96-slot,#zone-B-grid .yx96-slot,#zone-A-grid .yx102-slot,#zone-B-grid .yx102-slot,#zone-A-grid .customer-card-arrow,#zone-B-grid .customer-card-arrow');
      if (bad && typeof window.renderWarehouse === 'function') {
        try { window.renderWarehouse(true); } catch(_e) {}
      }
    }, 80);
  }
  function observeWarehouse(){
    if (state.observer || !isWarehouse() || typeof MutationObserver === 'undefined') return;
    const targets = ['zone-A-grid','zone-B-grid','warehouse-section','warehouse-modal'].map($).filter(Boolean);
    if (!targets.length) return;
    state.observer = new MutationObserver(muts => {
      if (state.normalizing) return;
      for (const m of muts){
        if (m.addedNodes && m.addedNodes.length) { scheduleRepair(); break; }
      }
    });
    targets.forEach(t => state.observer.observe(t, {childList:true, subtree:true}));
  }
  function install(){
    if (!isWarehouse()) return;
    document.documentElement.dataset.yx113Warehouse = 'locked';
    document.documentElement.dataset.yx112Warehouse = 'locked';
    document.documentElement.dataset.yx114Warehouse = 'locked';
    aliasWarehouseEntries();
    observeWarehouse();
    cleanupLegacyPanels();
    [60, 120, 360, 800, 1600, 2600, 4200].forEach(ms => setTimeout(() => { aliasWarehouseEntries(); observeWarehouse(); cleanupLegacyPanels(); }, ms));
  }
  YX.register('warehouse', {install, cleanup:cleanupLegacyPanels});
})();
