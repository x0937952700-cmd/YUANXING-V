/* FIX118 倉庫硬鎖 / FIX124 母版橋接：倉庫圖、格位編輯、長按插入刪除全部由新版入口接管 */
(function(){
  'use strict';
  const YX = window.YXHardLock;
  if (!YX) return;
  const $ = id => document.getElementById(id);
  const state = {
    observer:null, repairTimer:null, normalizing:false, rendering:false, loading:null,
    data:{cells:[], zones:{A:{},B:{}}}, available:[], activeZone: localStorage.getItem('warehouseActiveZone') || 'A',
    current:{zone:'A', col:1, slot:1, items:[], note:''}, menu:null, bound:false, searchKeys:new Set(), unplacedOpen:false
  };
  const isWarehouse = () => YX.moduleKey() === 'warehouse' || !!$('zone-A-grid') || !!$('zone-B-grid');
  const clean = v => YX.clean(v);
  const esc = v => YX.esc(v);
  const zones = ['A','B'];

  function parseItems(raw){
    if (Array.isArray(raw)) return raw;
    if (!raw) return [];
    try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch(_e) { return []; }
  }
  function qtyOf(it){
    const raw = String(it?.product_text || it?.product || '').replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=');
    const right = raw.includes('=') ? raw.split('=').slice(1).join('=') : '';
    if (right) {
      const parts = right.split('+').map(s => s.trim()).filter(Boolean);
      let total = 0;
      parts.forEach(seg => { const m = seg.match(/x\s*(\d+)$/i); total += m ? Number(m[1] || 0) : (/\d/.test(seg) ? 1 : 0); });
      if (total) return total;
    }
    const n = Number(it?.qty ?? it?.effective_qty ?? it?.unplaced_qty ?? it?.total_qty ?? 0);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  }
  function cellKey(zone, col, slot){ return `${clean(zone).toUpperCase()}|${Number(col)}|direct|${Number(slot)}`; }
  function altKey(zone, col, slot){ return `${clean(zone).toUpperCase()}-${Number(col)}-${Number(slot)}`; }
  function setWhData(d){
    state.data.cells = Array.isArray(d?.cells) ? d.cells : [];
    state.data.zones = d?.zones || {A:{},B:{}};
    window.state = window.state || {};
    window.state.warehouse = window.state.warehouse || {cells:[], zones:{A:{},B:{}}, availableItems:[], activeZone:state.activeZone};
    window.state.warehouse.cells = state.data.cells;
    window.state.warehouse.zones = state.data.zones;
    window.state.warehouse.activeZone = state.activeZone;
  }
  function setAvailable(items){
    state.available = Array.isArray(items) ? items : [];
    window.state = window.state || {};
    window.state.warehouse = window.state.warehouse || {};
    window.state.warehouse.availableItems = state.available;
    const pill = $('warehouse-unplaced-pill');
    if (pill) pill.textContent = `未錄入倉庫圖：${state.available.reduce((s,it)=>s+qtyOf(it),0)}件`;
  }
  function cellAt(zone, col, slot){
    zone = clean(zone).toUpperCase(); col = Number(col); slot = Number(slot);
    return (state.data.cells || []).find(c => clean(c.zone).toUpperCase() === zone && Number(c.column_index || 0) === col && Number(c.slot_number || 0) === slot);
  }
  function cellItems(zone, col, slot){ return parseItems(cellAt(zone,col,slot)?.items_json ?? cellAt(zone,col,slot)?.items).map(x => ({...x})); }
  function cellNote(zone, col, slot){ return clean(cellAt(zone,col,slot)?.note || ''); }
  function maxSlot(zone, col){
    const nums = (state.data.cells || [])
      .filter(c => clean(c.zone).toUpperCase() === zone && Number(c.column_index || 0) === Number(col))
      .map(c => Number(c.slot_number || 0)).filter(Boolean);
    return Math.max(10, ...nums);
  }
  function cleanCustomerText(v){
    const raw = clean(v || '').replace(/FOB代付|FOB代|FOB|CNF/gi,'').replace(/[、,，\s]+/g,'/').replace(/\/+/g,'/').replace(/^\/|\/$/g,'');
    return raw || '庫存';
  }
  function itemCustomer(it){ return cleanCustomerText(it?.customer_name || it?.customer || '庫存'); }
  function slotHTML(zone, col, slot){
    const items = cellItems(zone, col, slot).filter(it => qtyOf(it) > 0);
    const hi = state.searchKeys.has(cellKey(zone,col,slot)) || state.searchKeys.has(altKey(zone,col,slot)) || window.__YX_HIGHLIGHTED_KEYS__?.has?.(cellKey(zone,col,slot)) || window.__YX_HIGHLIGHTED_KEYS__?.has?.(altKey(zone,col,slot));
    if (!items.length) {
      return `<button type="button" class="yx108-slot yx106-slot yx116-slot vertical-slot ${hi ? 'highlight' : ''}" data-zone="${esc(zone)}" data-column="${Number(col)}" data-slot="${Number(slot)}"><div class="yx108-slot-row yx108-slot-row1 yx116-slot-row1"><span class="yx108-slot-no">${Number(slot)}</span><span class="yx108-slot-empty">空格</span></div></button>`;
    }
    const names = Array.from(new Set(items.map(itemCustomer).filter(Boolean)));
    const qtys = items.map(qtyOf).filter(n => n > 0);
    const total = qtys.reduce((a,b)=>a+b,0);
    const qtyExpr = qtys.join('+') || String(total);
    return `<button type="button" class="yx108-slot yx106-slot yx116-slot vertical-slot filled ${hi ? 'highlight' : ''}" data-zone="${esc(zone)}" data-column="${Number(col)}" data-slot="${Number(slot)}"><div class="yx108-slot-row yx108-slot-row1 yx116-slot-row1"><span class="yx108-slot-no">${Number(slot)}</span><span class="yx108-slot-customers">${esc(cleanCustomerText(names.join('/')))}</span></div><div class="yx108-slot-row yx108-slot-row2 yx116-slot-row2"><span class="yx108-slot-sum">${esc(qtyExpr)}</span><span class="yx108-slot-total">${total}件</span></div></button>`;
  }
  function renderGrid(){
    if (!isWarehouse()) return;
    state.rendering = true;
    zones.forEach(zone => {
      const grid = $(zone === 'A' ? 'zone-A-grid' : 'zone-B-grid');
      if (!grid) return;
      grid.className = 'zone-grid six-grid vertical-card-grid yx106-warehouse-grid yx116-warehouse-grid yx121-warehouse-grid';
      grid.innerHTML = '';
      for (let col=1; col<=6; col++) {
        const card = document.createElement('div');
        card.className = 'yx106-warehouse-column yx116-warehouse-column vertical-column-card';
        card.dataset.zone = zone;
        card.dataset.column = String(col);
        let rows = '';
        for (let slot=1; slot<=maxSlot(zone, col); slot++) rows += slotHTML(zone, col, slot);
        card.innerHTML = `<div class="yx106-warehouse-column-title yx116-warehouse-column-title"><span>${zone} 區第 ${col} 欄</span><span class="small-note">長按格子插入 / 刪除</span></div><div class="yx106-slot-list yx116-slot-list vertical-slot-list">${rows}</div>`;
        grid.appendChild(card);
      }
      const note = $(zone === 'A' ? 'zone-A-count-note' : 'zone-B-count-note');
      if (note) note.textContent = '新版格位母版';
    });
    bindSlotEvents();
    cleanupLegacyPanels();
    setWarehouseZone(state.activeZone || 'A', false);
    state.rendering = false;
  }
  async function loadAvailable(){
    try { const d = await YX.api('/api/warehouse/available-items?yx121=1&ts=' + Date.now(), {method:'GET'}); setAvailable(Array.isArray(d.items) ? d.items : []); }
    catch(_e) { setAvailable(state.available || []); }
  }
  async function renderWarehouseLocked(force=false){
    if (!isWarehouse()) return null;
    if (state.loading && !force) return state.loading;
    state.loading = (async () => {
      try {
        const [wh] = await Promise.all([YX.api('/api/warehouse?yx121=1&ts=' + Date.now(), {method:'GET'}), loadAvailable()]);
        setWhData(wh || {});
        renderGrid();
      } catch(e) { YX.toast(e.message || '倉庫圖載入失敗', 'error'); }
      finally { state.loading = null; }
    })();
    return state.loading;
  }
  function setWarehouseZone(zone='A', scroll=true){
    zone = clean(zone || 'A').toUpperCase();
    if (!['A','B','ALL'].includes(zone)) zone = 'A';
    state.activeZone = zone;
    try { localStorage.setItem('warehouseActiveZone', zone); } catch(_e) {}
    window.state = window.state || {}; window.state.warehouse = window.state.warehouse || {}; window.state.warehouse.activeZone = zone;
    const za = $('zone-A'), zb = $('zone-B');
    if (za) za.style.display = (zone === 'B') ? 'none' : '';
    if (zb) zb.style.display = (zone === 'A') ? 'none' : '';
    ['A','B','ALL'].forEach(z => $('zone-switch-' + z)?.classList.toggle('active', z === zone));
    const pill = $('warehouse-selection-pill'); if (pill) pill.textContent = `目前區域：${zone === 'ALL' ? '全部' : zone + ' 區'}`;
    if (scroll && zone !== 'ALL') (zone === 'A' ? za : zb)?.scrollIntoView?.({behavior:'smooth', block:'start'});
  }
  function highlightWarehouseCell(zone, col, slot){
    setWarehouseZone(clean(zone).toUpperCase(), false);
    const key = cellKey(zone,col,slot); state.searchKeys.add(key);
    renderGrid();
    const el = document.querySelector(`[data-zone="${clean(zone).toUpperCase()}"][data-column="${Number(col)}"][data-slot="${Number(slot)}"]`);
    if (el) { el.classList.add('flash-highlight','highlight'); el.scrollIntoView?.({behavior:'smooth', block:'center'}); setTimeout(()=>el.classList.remove('flash-highlight'), 2400); }
  }
  function clearWarehouseHighlights(){
    state.searchKeys.clear(); window.__YX_HIGHLIGHTED_KEYS__ = new Set();
    $('warehouse-search-results')?.classList.add('hidden');
    $('warehouse-unplaced-list-inline')?.classList.add('hidden');
    state.unplacedOpen = false;
    renderGrid();
  }
  async function searchWarehouse(){
    const q = clean($('warehouse-search')?.value || '');
    const box = $('warehouse-search-results');
    if (!q) { clearWarehouseHighlights(); return; }
    try {
      const d = await YX.api('/api/warehouse/search?q=' + encodeURIComponent(q) + '&yx121=1&ts=' + Date.now(), {method:'GET'});
      const hits = Array.isArray(d.items) ? d.items : [];
      state.searchKeys = new Set(hits.map(h => cellKey(h.cell?.zone || h.zone, h.cell?.column_index || h.column_index, h.cell?.slot_number || h.slot_number)));
      if (box) {
        box.classList.remove('hidden');
        box.innerHTML = hits.length ? hits.map((h,i)=>{ const c=h.cell||h; return `<button type="button" class="deduct-card yx121-search-hit" data-hit="${i}"><strong>${esc(c.zone)}-${Number(c.column_index)}-${Number(c.slot_number)}</strong><div>${esc(h.customer_name || h.item?.customer_name || '')}</div><div class="small-note">${esc(h.product_text || h.item?.product_text || '')}</div></button>`; }).join('') : '<div class="empty-state-card compact-empty">找不到格位</div>';
        box.querySelectorAll('[data-hit]').forEach((btn,i)=>btn.onclick=()=>{ const c=hits[i].cell||hits[i]; highlightWarehouseCell(c.zone,c.column_index,c.slot_number); });
      }
      renderGrid();
      if (hits[0]) { const c=hits[0].cell||hits[0]; highlightWarehouseCell(c.zone,c.column_index,c.slot_number); }
    } catch(e) { YX.toast(e.message || '搜尋失敗', 'error'); }
  }
  function highlightWarehouseSameCustomer(){
    const name = clean(window.__YX_SELECTED_CUSTOMER__ || $('customer-name')?.value || '');
    if (!name) return YX.toast('請先選擇客戶', 'warn');
    state.searchKeys.clear();
    (state.data.cells || []).forEach(c => cellItems(c.zone,c.column_index,c.slot_number).forEach(it => { if (clean(it.customer_name).includes(name) || name.includes(clean(it.customer_name))) state.searchKeys.add(cellKey(c.zone,c.column_index,c.slot_number)); }));
    renderGrid();
  }
  async function toggleWarehouseUnplacedHighlight(){
    await loadAvailable();
    const box = $('warehouse-unplaced-list-inline');
    state.unplacedOpen = !state.unplacedOpen;
    if (!box) return;
    if (!state.unplacedOpen) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    box.innerHTML = state.available.length ? state.available.map((it,idx)=>`<div class="deduct-card"><strong>${esc(clean(it.customer_name || '') || '庫存')}</strong><div>${esc(it.product_text || '')}</div><div class="small-note">${qtyOf(it)}件｜${esc(it.source || '')}</div><button type="button" class="ghost-btn tiny-btn" data-yx121-unplaced="${idx}">加入目前開啟格位</button></div>`).join('') : '<div class="empty-state-card compact-empty">目前沒有未錄入倉庫圖商品</div>';
  }
  function currentCellTitle(){ return `${state.current.zone} 區第 ${state.current.col} 欄 第 ${String(state.current.slot).padStart(2,'0')} 格`; }
  function optionLabel(it){ return `${clean(it.customer_name || '') || '庫存'}｜${clean(it.product_text || '')}｜${qtyOf(it)}件｜${clean(it.source || '')}`; }
  function availableFiltered(){
    const q = clean($('warehouse-item-search')?.value || '').toLowerCase();
    const items = state.available || [];
    if (!q) return items;
    return items.filter(it => optionLabel(it).toLowerCase().includes(q));
  }
  function renderCellItems(){
    const box = $('warehouse-cell-items'); if (!box) return;
    box.classList.add('yx113-keep','yx121-warehouse-cell-items');
    const rows = (state.current.items || []).map((it,idx)=>`<div class="chip-item yx121-cell-item" data-idx="${idx}"><strong>${esc(clean(it.customer_name || '') || '庫存')}</strong><span>${esc(it.product_text || '')}</span><span>${qtyOf(it)}件</span><button class="remove" type="button" data-yx121-remove-cell-item="${idx}">×</button></div>`).join('') || '<div class="empty-state-card compact-empty">此格目前沒有商品</div>';
    const opts = availableFiltered().map((it,idx)=>`<option value="${idx}">${esc(optionLabel(it))}</option>`).join('');
    box.innerHTML = `${rows}<div class="yx121-cell-editor"><label class="field-label">加入未錄入商品</label><div class="ship-picker-row"><select id="yx121-warehouse-add-select" class="text-input"><option value="">選擇商品</option>${opts}</select><input id="yx121-warehouse-add-qty" class="text-input" type="number" min="1" value="1"></div><div class="btn-row compact-row"><button class="ghost-btn small-btn" type="button" id="yx121-add-cell-item">加入格位</button><button class="primary-btn small-btn" type="button" id="yx121-save-cell">儲存格位</button></div></div>`;
  }
  async function openWarehouseModal(zone, col, slot){
    await loadAvailable();
    state.current = {zone:clean(zone).toUpperCase(), col:Number(col), slot:Number(slot), items:cellItems(zone,col,slot), note:cellNote(zone,col,slot)};
    const modal = $('warehouse-modal'); if (!modal) return;
    const meta = $('warehouse-modal-meta'); if (meta) meta.textContent = currentCellTitle();
    const note = $('warehouse-note'); if (note) note.value = state.current.note || '';
    modal.classList.remove('hidden');
    renderCellItems();
    const search = $('warehouse-item-search');
    if (search && search.dataset.yx121Bound !== '1') { search.dataset.yx121Bound='1'; search.addEventListener('input', renderCellItems); }
  }
  function closeWarehouseModal(){ $('warehouse-modal')?.classList.add('hidden'); }
  function addSelectedItemToCell(){
    const idx = Number($('yx121-warehouse-add-select')?.value);
    const item = availableFiltered()[idx];
    if (!item) return YX.toast('請先選擇商品', 'warn');
    let qty = Number($('yx121-warehouse-add-qty')?.value || qtyOf(item) || 1);
    qty = Math.max(1, Math.min(qtyOf(item) || qty, qty));
    state.current.items.push({...item, qty, product_text:item.product_text || item.product || '', customer_name:item.customer_name || ''});
    renderCellItems();
    YX.toast('已加入格位，請按儲存格位', 'ok');
  }
  async function saveWarehouseCell(){
    const note = $('warehouse-note')?.value || '';
    const payload = {zone:state.current.zone, column_index:state.current.col, slot_type:'direct', slot_number:state.current.slot, items:state.current.items || [], note};
    await YX.api('/api/warehouse/cell', {method:'POST', body:JSON.stringify(payload)});
    YX.toast('格位已儲存', 'ok');
    closeWarehouseModal();
    await renderWarehouseLocked(true);
    highlightWarehouseCell(payload.zone, payload.column_index, payload.slot_number);
  }
  async function insertWarehouseCell(zone, col, slot){
    const d = await YX.api('/api/warehouse/add-slot', {method:'POST', body:JSON.stringify({zone:clean(zone).toUpperCase(), column_index:Number(col), insert_after:Number(slot || 0), slot_type:'direct'})});
    YX.toast('已插入格子', 'ok');
    await renderWarehouseLocked(true);
    highlightWarehouseCell(zone, col, Number(d.slot_number || slot || 1) + (d.slot_number ? 0 : 1));
  }
  async function deleteWarehouseCell(zone, col, slot){
    if (cellItems(zone,col,slot).length) return YX.toast('格子內還有商品，請先移除商品後再刪除', 'warn');
    if (!confirm(`確定刪除 ${zone} 區第 ${col} 欄第 ${slot} 格？`)) return;
    await YX.api('/api/warehouse/remove-slot', {method:'POST', body:JSON.stringify({zone:clean(zone).toUpperCase(), column_index:Number(col), slot_number:Number(slot), slot_type:'direct'})});
    YX.toast('已刪除格子', 'ok');
    await renderWarehouseLocked(true);
  }
  function menu(){
    if (state.menu) return state.menu;
    const m = document.createElement('div');
    m.id = 'yx121-warehouse-cell-menu';
    m.className = 'modal hidden yx121-warehouse-menu';
    m.innerHTML = `<div class="modal-card glass"><div class="modal-head"><div class="section-title" id="yx121-warehouse-menu-title">格位操作</div><button class="icon-btn" id="yx121-warehouse-menu-close" type="button">✕</button></div><div class="yx113-action-stack"><button class="ghost-btn" type="button" data-yx121-wh-act="open">開啟 / 編輯格位</button><button class="ghost-btn" type="button" data-yx121-wh-act="insert">在此格後插入格子</button><button class="ghost-btn danger-btn" type="button" data-yx121-wh-act="delete">刪除此格</button></div></div>`;
    document.body.appendChild(m);
    m.addEventListener('click', ev => { if (ev.target === m || ev.target?.id === 'yx121-warehouse-menu-close') m.classList.add('hidden'); });
    state.menu = m;
    return m;
  }
  function showMenu(zone,col,slot){
    const m = menu(); m.dataset.zone=zone; m.dataset.column=String(col); m.dataset.slot=String(slot);
    const title = $('yx121-warehouse-menu-title'); if (title) title.textContent = `${zone} 區第 ${col} 欄 第 ${slot} 格`;
    m.classList.remove('hidden');
  }
  function bindSlotEvents(){
    document.querySelectorAll('.yx116-slot[data-zone][data-column][data-slot],.yx108-slot[data-zone][data-column][data-slot]').forEach(slot => {
      if (slot.dataset.yx121Bound === '1') return;
      slot.dataset.yx121Bound = '1';
      let press=null;
      const data = () => [slot.dataset.zone, Number(slot.dataset.column), Number(slot.dataset.slot)];
      slot.addEventListener('pointerdown', ev => {
        if (ev.target.closest('button,input,select,textarea,a') && ev.target !== slot) return;
        const [z,c,s] = data();
        press = {x:ev.clientX, y:ev.clientY, timer:setTimeout(()=>{ slot.dataset.yxBlockClickUntil=String(Date.now()+900); showMenu(z,c,s); press=null; }, 620)};
      });
      slot.addEventListener('pointermove', ev => { if (press && (Math.abs(ev.clientX-press.x)>8 || Math.abs(ev.clientY-press.y)>8)) { clearTimeout(press.timer); press=null; } });
      ['pointerup','pointercancel','pointerleave'].forEach(t => slot.addEventListener(t, () => { if (press) { clearTimeout(press.timer); press=null; } }));
      slot.addEventListener('contextmenu', ev => { ev.preventDefault(); const [z,c,s] = data(); showMenu(z,c,s); });
      slot.addEventListener('click', ev => { if (Date.now() < Number(slot.dataset.yxBlockClickUntil || 0)) return; const [z,c,s] = data(); openWarehouseModal(z,c,s); });
    });
  }
  function bindGlobalEvents(){
    if (state.bound) return; state.bound = true;
    document.addEventListener('click', async ev => {
      const act = ev.target?.closest?.('[data-yx121-wh-act]');
      if (act) {
        ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.();
        const m = menu(); const z=m.dataset.zone, c=Number(m.dataset.column), s=Number(m.dataset.slot); m.classList.add('hidden');
        try { if (act.dataset.yx121WhAct === 'open') await openWarehouseModal(z,c,s); if (act.dataset.yx121WhAct === 'insert') await insertWarehouseCell(z,c,s); if (act.dataset.yx121WhAct === 'delete') await deleteWarehouseCell(z,c,s); }
        catch(e) { YX.toast(e.message || '格位操作失敗', 'error'); }
        return;
      }
      if (ev.target?.id === 'yx121-add-cell-item') { ev.preventDefault(); addSelectedItemToCell(); return; }
      if (ev.target?.id === 'yx121-save-cell') { ev.preventDefault(); try{ await saveWarehouseCell(); } catch(e){ YX.toast(e.message || '儲存格位失敗','error'); } return; }
      const rm = ev.target?.closest?.('[data-yx121-remove-cell-item]');
      if (rm) { ev.preventDefault(); state.current.items.splice(Number(rm.dataset.yx121RemoveCellItem), 1); renderCellItems(); return; }
      const unp = ev.target?.closest?.('[data-yx121-unplaced]');
      if (unp) { ev.preventDefault(); const it = state.available[Number(unp.dataset.yx121Unplaced)]; if (it) { state.current.items.push({...it, qty:qtyOf(it)}); renderCellItems(); } return; }
    }, true);
  }
  function normalizeSlot(slot){
    if (!slot || state.normalizing) return;
    slot.querySelectorAll('.yx102-slot-group,.yx102-slot-head,.yx102-slot-qty,.yx106-slot-group,.yx106-slot-head,.yx106-slot-qty,.yx106-slot-customer,.yx106-slot-title,.small-note').forEach(el => {
      if (!el.classList.contains('yx108-slot-row') && !el.closest('.yx106-warehouse-column-title,.yx116-warehouse-column-title')) el.remove();
    });
    const cust = slot.querySelector('.yx108-slot-customers');
    if (cust) cust.textContent = cleanCustomerText(cust.textContent);
    slot.querySelectorAll('.yx108-slot-row2,.yx108-slot-sum,.yx108-slot-total').forEach(el => el.classList.add('yx113-warehouse-qty-row','yx114-warehouse-qty-row','yx116-warehouse-qty-row'));
  }
  function cleanupLegacyPanels(){
    document.querySelectorAll(['#warehouse-detail-panel','#yx71-warehouse-cell-menu','#yx91-warehouse-batch-panel','#yx97-warehouse-batch-panel','#yx99-warehouse-batch-panel','#yx102-warehouse-batch-panel','#yx103-warehouse-batch-panel','#yx105-warehouse-batch-panel','#yx91-warehouse-detail-panel','#yx97-warehouse-detail-panel','#yx99-warehouse-detail-panel','#yx102-warehouse-detail-panel','#yx103-warehouse-detail-panel','#yx105-warehouse-detail-panel'].join(',')).forEach(el => {
      if (el.id === 'warehouse-detail-panel') { el.innerHTML=''; el.classList.add('hidden','yx113-hidden-legacy','yx114-hidden-legacy','yx116-hidden-legacy'); el.style.display='none'; }
      else el.remove();
    });
    state.normalizing = true;
    document.querySelectorAll('.yx108-slot,.yx106-slot,[data-zone][data-column][data-slot]').forEach(slot => { state.normalizing=false; normalizeSlot(slot); state.normalizing=true; });
    state.normalizing = false;
  }
  function isLegacyWarehouseNode(node){
    if (!node || node.nodeType !== 1) return false;
    const sel = '.yx96-slot,.yx102-slot,.yx103-slot,.yx105-slot,.yx106-slot-group,.yx102-slot-group,.customer-card-arrow,#yx99-warehouse-batch-panel,#yx102-warehouse-batch-panel,#warehouse-detail-panel';
    return node.matches?.(sel) || node.querySelector?.(sel);
  }
  function observeWarehouse(){
    if (state.observer || !isWarehouse()) return;
    const NativeMO = window.__YX96_NATIVE_MUTATION_OBSERVER__ || window.MutationObserver;
    const targets = ['zone-A-grid','zone-B-grid','warehouse-section','warehouse-modal'].map($).filter(Boolean);
    if (!targets.length || typeof NativeMO === 'undefined') return;
    state.observer = new NativeMO(muts => {
      if (state.normalizing || state.rendering) return;
      for (const m of muts){ const added = Array.from(m.addedNodes || []).filter(n => n && n.nodeType === 1); if (added.some(isLegacyWarehouseNode)) { scheduleRepair(); break; } }
    });
    targets.forEach(t => state.observer.observe(t, {childList:true, subtree:true}));
  }
  function scheduleRepair(){ if (state.repairTimer || state.rendering) return; state.repairTimer = setTimeout(()=>{ state.repairTimer=null; cleanupLegacyPanels(); }, 50); }
  function aliasWarehouseEntries(){
    const map = {
      renderWarehouse:renderWarehouseLocked, renderWarehouse108:renderWarehouseLocked, renderWarehouseLegacyA:renderWarehouseLocked, renderWarehouseLegacyB:renderWarehouseLocked, loadWarehouseDynamic:renderWarehouseLocked, __yx96RemovedWarehouseLegacyA:renderWarehouseLocked, __yx96RemovedWarehouseLegacyB:renderWarehouseLocked, renderWarehouse82:renderWarehouseLocked, renderWarehouse95:renderWarehouseLocked, renderWarehouse96:renderWarehouseLocked, renderWarehouse102:renderWarehouseLocked,
      renderWarehouseZones:renderGrid, setWarehouseZone, searchWarehouse, clearWarehouseHighlights, highlightWarehouseCell, highlightWarehouseSameCustomer, toggleWarehouseUnplacedHighlight,
      insertWarehouseCell, deleteWarehouseCell, addWarehouseVisualSlot:(z,c,s)=>insertWarehouseCell(z,c,s||maxSlot(clean(z).toUpperCase(),c)), removeWarehouseVisualSlot:(z,c,s)=>deleteWarehouseCell(z,c,s||maxSlot(clean(z).toUpperCase(),c)),
      openWarehouseModal, closeWarehouseModal, saveWarehouseCell, addSelectedItemToCell, renderWarehouseCellItems:renderCellItems, getCellItems:cellItems, buildCellKey:(z,c,s)=>[z,Number(c),'direct',Number(s)], showWarehouseDetail:openWarehouseModal
    };
    Object.entries(map).forEach(([n,fn]) => { try { YX.hardAssign(n, YX.mark(fn, 'warehouse_121_' + n), {configurable:false}); } catch(_e) { try { window[n]=fn; } catch(_e2){} } });
  }
  function install(){
    if (!isWarehouse()) return;
    document.documentElement.dataset.yx113Warehouse='locked';
    document.documentElement.dataset.yx114Warehouse='locked';
    document.documentElement.dataset.yx115Warehouse='locked';
    document.documentElement.dataset.yx116Warehouse='locked';
    document.documentElement.dataset.yx117Warehouse='locked';
    document.documentElement.dataset.yx121Warehouse='locked';
    aliasWarehouseEntries(); bindGlobalEvents(); observeWarehouse(); cleanupLegacyPanels(); renderWarehouseLocked(true);
    [60,180,420].forEach(ms => setTimeout(()=>{ aliasWarehouseEntries(); bindGlobalEvents(); observeWarehouse(); cleanupLegacyPanels(); }, ms));
  }
  window.YX116Warehouse = {render:renderWarehouseLocked, renderGrid, cleanup:cleanupLegacyPanels, openWarehouseModal, saveWarehouseCell};
  window.YX121Warehouse = window.YX116Warehouse;
  YX.register('warehouse', {install, cleanup:cleanupLegacyPanels, render:renderWarehouseLocked, normalizeSlot});
})();
