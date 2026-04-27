/* FIX113 倉庫硬鎖：格子固定只顯示格號、客戶紅字、件數藍字；舊入口不再覆蓋新版 */
(function(){
  'use strict';
  const YX = window.YXHardLock;
  if (!YX) return;
  function $(id){ return document.getElementById(id); }
  function isWarehouse(){ return YX.moduleKey() === 'warehouse' || !!$('zone-A-grid') || !!$('zone-B-grid'); }
  function normalizeSlot(slot){
    if (!slot) return;
    slot.querySelectorAll('.yx102-slot-group,.yx102-slot-head,.yx102-slot-qty,.yx106-slot-group,.small-note').forEach(el => {
      if (!el.classList.contains('yx108-slot-row')) el.remove();
    });
    slot.querySelectorAll('.yx108-slot-customers').forEach(el => {
      const raw = YX.clean(el.textContent).replace(/FOB代付|FOB代|FOB|CNF/gi, '').replace(/[、,，\s]+/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
      el.textContent = raw || '庫存';
    });
    slot.querySelectorAll('.yx108-slot-row2,.yx108-slot-total').forEach(el => el.classList.add('yx113-warehouse-qty-row'));
  }
  function cleanupLegacyPanels(){
    document.querySelectorAll([
      '#warehouse-detail-panel','#warehouse-cell-items:not(.yx113-keep)',
      '#yx71-warehouse-cell-menu','#yx91-warehouse-batch-panel','#yx97-warehouse-batch-panel','#yx99-warehouse-batch-panel','#yx102-warehouse-batch-panel','#yx103-warehouse-batch-panel','#yx105-warehouse-batch-panel',
      '#yx91-warehouse-detail-panel','#yx97-warehouse-detail-panel','#yx99-warehouse-detail-panel','#yx102-warehouse-detail-panel','#yx103-warehouse-detail-panel','#yx105-warehouse-detail-panel'
    ].join(',')).forEach(el => {
      if (el.id === 'warehouse-detail-panel') { el.innerHTML = ''; el.classList.add('hidden','yx113-hidden-legacy'); el.style.display = 'none'; }
      else if (el.id !== 'warehouse-cell-items') el.remove();
    });
    document.querySelectorAll('.yx108-slot,.yx106-slot,[data-zone][data-column][data-slot]').forEach(normalizeSlot);
  }
  function aliasWarehouseEntries(){
    const render = window.renderWarehouse;
    const zones = window.renderWarehouseZones;
    const open = window.openWarehouseModal;
    if (typeof render === 'function') ['renderWarehouseLegacyA','renderWarehouseLegacyB','loadWarehouseDynamic','renderWarehouse82','renderWarehouse95'].forEach(n => { try { window[n] = render; } catch(_e){} });
    if (typeof zones === 'function') ['renderWarehouseGrid82','renderWarehouseGrid95','renderWarehouseGrid96'].forEach(n => { try { window[n] = zones; } catch(_e){} });
    if (typeof open === 'function') ['openWarehouseCellEditor101','showWarehouseDetail'].forEach(n => { try { window[n] = open; } catch(_e){} });
  }
  function install(){
    if (!isWarehouse()) return;
    document.documentElement.dataset.yx113Warehouse = 'locked';
    document.documentElement.dataset.yx112Warehouse = 'locked';
    aliasWarehouseEntries();
    cleanupLegacyPanels();
    [120, 360, 800, 1600, 2600].forEach(ms => setTimeout(() => { aliasWarehouseEntries(); cleanupLegacyPanels(); }, ms));
  }
  YX.register('warehouse', {install, cleanup:cleanupLegacyPanels});
})();
