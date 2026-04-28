/* FIX117 倉庫硬鎖：倉庫圖只允許新版渲染入口；舊版渲染函式一律轉接，不直接輸出舊介面 */
(function(){
  'use strict';
  const YX = window.YXHardLock;
  if (!YX) return;
  const state = {observer:null, repairTimer:null, normalizing:false, rendering:false, loading:null, data:{cells:[], zones:{A:{},B:{}}}};
  const $ = id => document.getElementById(id);
  const isWarehouse = () => YX.moduleKey() === 'warehouse' || !!$('zone-A-grid') || !!$('zone-B-grid');

  function esc(v){ return YX.esc(v); }
  function clean(v){ return YX.clean(v); }
  function setWhData(d){
    state.data.cells = Array.isArray(d?.cells) ? d.cells : [];
    state.data.zones = d?.zones || {A:{},B:{}};
    window.state = window.state || {};
    window.state.warehouse = window.state.warehouse || {cells:[], zones:{A:{},B:{}}, availableItems:[], activeZone:'A'};
    window.state.warehouse.cells = state.data.cells;
    window.state.warehouse.zones = state.data.zones;
  }
  function parseItems(raw){
    if (Array.isArray(raw)) return raw;
    if (!raw) return [];
    try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch(_e) { return []; }
  }
  function cellAt(zone, col, slot){
    zone = clean(zone).toUpperCase(); col = Number(col); slot = Number(slot);
    return (state.data.cells || []).find(c => clean(c.zone).toUpperCase() === zone && Number(c.column_index || 0) === col && Number(c.slot_number || 0) === slot);
  }
  function cellItems(zone, col, slot){
    const c = cellAt(zone, col, slot);
    return parseItems(c?.items_json ?? c?.items).map(x => ({...x}));
  }
  function qtyOf(it){
    const n = Number(it?.qty ?? it?.unplaced_qty ?? it?.total_qty ?? 0);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  }
  function cleanCustomerText(v){
    const raw = clean(v || '')
      .replace(/FOB代付|FOB代|FOB|CNF/gi, '')
      .replace(/[、,，\s]+/g, '/')
      .replace(/\/+/g, '/')
      .replace(/^\/|\/$/g, '');
    return raw || '庫存';
  }
  function itemCustomer(it){ return cleanCustomerText(it?.customer_name || it?.customer || '庫存'); }
  function maxSlot(zone, col){
    const nums = (state.data.cells || [])
      .filter(c => clean(c.zone).toUpperCase() === zone && Number(c.column_index || 0) === Number(col))
      .map(c => Number(c.slot_number || 0)).filter(Boolean);
    return Math.max(10, ...nums);
  }
  function slotHTML(zone, col, slot){
    const items = cellItems(zone, col, slot).filter(it => qtyOf(it) > 0);
    const slotNo = String(Number(slot) || slot);
    const key1 = [zone, col, 'direct', slot].join('|'), key2 = `${zone}-${col}-${slot}`;
    const hi = window.__YX_HIGHLIGHTED_KEYS__?.has?.(key1) || window.__YX_HIGHLIGHTED_KEYS__?.has?.(key2);
    if (!items.length) {
      return `<div class="yx108-slot yx106-slot yx116-slot vertical-slot ${hi ? 'highlight' : ''}" data-zone="${esc(zone)}" data-column="${Number(col)}" data-slot="${Number(slot)}" draggable="true"><div class="yx108-slot-row yx108-slot-row1 yx116-slot-row1"><span class="yx108-slot-no">${esc(slotNo)}</span><span class="yx108-slot-empty">空格</span></div></div>`;
    }
    const names = Array.from(new Set(items.map(itemCustomer).filter(Boolean)));
    const customerText = cleanCustomerText(names.join('/'));
    const qtys = items.map(qtyOf).filter(n => n > 0);
    const qtyExpr = qtys.join('+') || String(qtys.reduce((a,b)=>a+b,0));
    const total = qtys.reduce((a,b) => a + b, 0);
    return `<div class="yx108-slot yx106-slot yx116-slot vertical-slot filled ${hi ? 'highlight' : ''}" data-zone="${esc(zone)}" data-column="${Number(col)}" data-slot="${Number(slot)}" draggable="true"><div class="yx108-slot-row yx108-slot-row1 yx116-slot-row1"><span class="yx108-slot-no">${esc(slotNo)}</span><span class="yx108-slot-customers">${esc(customerText)}</span></div><div class="yx108-slot-row yx108-slot-row2 yx116-slot-row2"><span class="yx108-slot-sum">${esc(qtyExpr)}</span><span class="yx108-slot-total">${total}件</span></div></div>`;
  }
  function renderGrid(){
    if (!isWarehouse()) return;
    state.rendering = true;
    ['A','B'].forEach(zone => {
      const grid = $(zone === 'A' ? 'zone-A-grid' : 'zone-B-grid');
      if (!grid) return;
      grid.className = 'zone-grid six-grid vertical-card-grid yx106-warehouse-grid yx116-warehouse-grid';
      grid.innerHTML = '';
      for (let col=1; col<=6; col++) {
        const card = document.createElement('div');
        card.className = 'yx106-warehouse-column yx116-warehouse-column vertical-column-card';
        card.dataset.zone = zone;
        card.dataset.column = String(col);
        let rows = '';
        for (let slot=1; slot<=maxSlot(zone, col); slot++) rows += slotHTML(zone, col, slot);
        card.innerHTML = `<div class="yx106-warehouse-column-title yx116-warehouse-column-title"><span>${zone} 區第 ${col} 欄</span><span class="small-note">長按增刪</span></div><div class="yx106-slot-list yx116-slot-list vertical-slot-list">${rows}</div>`;
        grid.appendChild(card);
      }
      const note = $(zone === 'A' ? 'zone-A-count-note' : 'zone-B-count-note');
      if (note) note.textContent = '格位唯一新版';
    });
    cleanupLegacyPanels();
    try { if (typeof window.setWarehouseZone === 'function') window.setWarehouseZone(localStorage.getItem('warehouseActiveZone') || window.state?.warehouse?.activeZone || 'A', false); } catch(_e) {}
    state.rendering = false;
  }
  async function renderWarehouseLocked(force=false){
    if (!isWarehouse()) return null;
    if (state.loading) return state.loading;
    state.loading = (async () => {
      try {
        const d = await YX.api('/api/warehouse?yx116=1&ts=' + Date.now(), {method:'GET'});
        setWhData(d || {});
        renderGrid();
        try { if (typeof window.installUnplacedPill99 === 'function') window.installUnplacedPill99(); } catch(_e) {}
      } catch(e) {
        YX.toast(e.message || '倉庫圖載入失敗', 'error');
      } finally {
        state.loading = null;
      }
    })();
    return state.loading;
  }
  function normalizeSlot(slot){
    if (!slot || state.normalizing) return;
    slot.querySelectorAll('.yx102-slot-group,.yx102-slot-head,.yx102-slot-qty,.yx106-slot-group,.yx106-slot-head,.yx106-slot-qty,.yx106-slot-customer,.yx106-slot-title,.small-note').forEach(el => {
      if (!el.classList.contains('yx108-slot-row') && !el.closest('.yx106-warehouse-column-title,.yx116-warehouse-column-title')) el.remove();
    });
    const row1 = slot.querySelector('.yx108-slot-row1');
    const cust = slot.querySelector('.yx108-slot-customers');
    if (row1 && cust) {
      cust.textContent = cleanCustomerText(cust.textContent);
      row1.classList.add('yx114-slot-line','yx116-slot-row1');
    }
    slot.querySelectorAll('.yx108-slot-row2,.yx108-slot-sum,.yx108-slot-total').forEach(el => el.classList.add('yx113-warehouse-qty-row','yx114-warehouse-qty-row','yx116-warehouse-qty-row'));
  }
  function cleanupLegacyPanels(){
    document.querySelectorAll([
      '#warehouse-detail-panel','#warehouse-cell-items:not(.yx113-keep)',
      '#yx71-warehouse-cell-menu','#yx91-warehouse-batch-panel','#yx97-warehouse-batch-panel','#yx99-warehouse-batch-panel','#yx102-warehouse-batch-panel','#yx103-warehouse-batch-panel','#yx105-warehouse-batch-panel',
      '#yx91-warehouse-detail-panel','#yx97-warehouse-detail-panel','#yx99-warehouse-detail-panel','#yx102-warehouse-detail-panel','#yx103-warehouse-detail-panel','#yx105-warehouse-detail-panel'
    ].join(',')).forEach(el => {
      if (el.id === 'warehouse-detail-panel') { el.innerHTML = ''; el.classList.add('hidden','yx113-hidden-legacy','yx114-hidden-legacy','yx116-hidden-legacy'); el.style.display = 'none'; }
      else if (el.id !== 'warehouse-cell-items') el.remove();
    });
    state.normalizing = true;
    document.querySelectorAll('.yx108-slot,.yx106-slot,[data-zone][data-column][data-slot]').forEach(slot => { state.normalizing = false; normalizeSlot(slot); state.normalizing = true; });
    state.normalizing = false;
  }
  function isLegacyWarehouseNode(node){
    if (!node || node.nodeType !== 1) return false;
    const sel = '.yx96-slot,.yx102-slot,.yx103-slot,.yx105-slot,.yx106-slot-group,.yx102-slot-group,.customer-card-arrow,.small-note:not(.yx116-warehouse-column-title .small-note),#warehouse-detail-panel,#warehouse-cell-items,#yx99-warehouse-batch-panel,#yx102-warehouse-batch-panel';
    return node.matches?.(sel) || node.querySelector?.(sel);
  }
  function aliasWarehouseEntries(){
    const fn = YX.mark(renderWarehouseLocked, 'warehouse_render_116');
    const grid = YX.mark(renderGrid, 'warehouse_grid_116');
    ['renderWarehouse','renderWarehouse108','renderWarehouseLegacyA','renderWarehouseLegacyB','loadWarehouseDynamic','__yx96RemovedWarehouseLegacyA','__yx96RemovedWarehouseLegacyB','renderWarehouse82','renderWarehouse95','renderWarehouse96','renderWarehouse102'].forEach(n => {
      try { YX.hardAssign(n, fn, {configurable:false}); } catch(_e) { try { window[n] = fn; } catch(_e2){} }
    });
    try { YX.hardAssign('renderWarehouseZones', grid, {configurable:false}); } catch(_e) { window.renderWarehouseZones = grid; }
  }
  function scheduleRepair(){
    if (state.repairTimer || state.rendering) return;
    state.repairTimer = setTimeout(() => {
      state.repairTimer = null;
      cleanupLegacyPanels();
      const bad = document.querySelector('#zone-A-grid .yx96-slot,#zone-B-grid .yx96-slot,#zone-A-grid .yx102-slot,#zone-B-grid .yx102-slot,#zone-A-grid .yx103-slot,#zone-B-grid .yx103-slot,#zone-A-grid .yx105-slot,#zone-B-grid .yx105-slot,#zone-A-grid .yx106-slot-group,#zone-B-grid .yx106-slot-group,#zone-A-grid .customer-card-arrow,#zone-B-grid .customer-card-arrow');
      if (bad) renderWarehouseLocked(true);
    }, 60);
  }
  function observeWarehouse(){
    if (state.observer || !isWarehouse()) return;
    const NativeMO = window.__YX96_NATIVE_MUTATION_OBSERVER__ || window.MutationObserver;
    const targets = ['zone-A-grid','zone-B-grid','warehouse-section','warehouse-modal'].map($).filter(Boolean);
    if (!targets.length || typeof NativeMO === 'undefined') return;
    state.observer = new NativeMO(muts => {
      if (state.normalizing || state.rendering) return;
      for (const m of muts){
        const added = Array.from(m.addedNodes || []).filter(n => n && n.nodeType === 1);
        if (added.length && (added.some(isLegacyWarehouseNode) || m.target?.id === 'zone-A-grid' || m.target?.id === 'zone-B-grid')) { scheduleRepair(); break; }
      }
    });
    targets.forEach(t => state.observer.observe(t, {childList:true, subtree:true}));
  }
  function install(){
    if (!isWarehouse()) return;
    document.documentElement.dataset.yx113Warehouse = 'locked';
    document.documentElement.dataset.yx114Warehouse = 'locked';
    document.documentElement.dataset.yx115Warehouse = 'locked';
    document.documentElement.dataset.yx116Warehouse = 'locked';
    document.documentElement.dataset.yx117Warehouse = 'locked';
    aliasWarehouseEntries();
    observeWarehouse();
    cleanupLegacyPanels();
    renderWarehouseLocked(true);
    [80, 180, 420, 900, 1800, 3200, 5200].forEach(ms => setTimeout(() => { aliasWarehouseEntries(); observeWarehouse(); cleanupLegacyPanels(); }, ms));
  }
  window.YX116Warehouse = {render:renderWarehouseLocked, renderGrid, cleanup:cleanupLegacyPanels};
  YX.register('warehouse', {install, cleanup:cleanupLegacyPanels, render:renderWarehouseLocked});
})();
