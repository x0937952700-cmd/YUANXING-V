/* FIX120 北中南客戶母版硬鎖：一排一個客戶、FOB/CNF 標籤置中、件/筆靠右、長按操作、操作後立即刷新 */
(function(){
  'use strict';
  const YX = window.YXHardLock;
  if (!YX) return;
  const $ = id => document.getElementById(id);
  const state = {items:[], bound:false, oldSelect:null, rendering:false, observer:null, repairTimer:null, lastRenderAt:0, itemCache:new Map()};
  const REGIONS = ['北區','中區','南區'];
  const moduleKey = () => YX.moduleKey();
  const isRegionPage = () => ['orders','master_order','ship','customers'].includes(moduleKey()) || !!$('region-north') || !!$('customers-north');
  const normRegion = v => { const s = YX.clean(v); return s.includes('中') ? '中區' : s.includes('南') ? '南區' : '北區'; };
  function tradeInfo(name){
    const raw = YX.clean(name || '');
    const tags = [];
    raw.replace(/FOB代付|FOB代|FOB|CNF/gi, m => { const t = /代/.test(m) ? 'FOB代' : m.toUpperCase(); if (!tags.includes(t)) tags.push(t); return m; });
    const base = YX.clean(raw.replace(/FOB代付|FOB代|FOB|CNF/gi, ' '));
    return {base:base || raw, tag:tags.join(' / ')};
  }
  function counts(c, mode){
    const r = c.relation_counts || {};
    if (mode === 'orders') return {qty:Number(r.order_qty || 0), rows:Number(r.order_rows || 0)};
    if (mode === 'master_order') return {qty:Number(r.master_qty || 0), rows:Number(r.master_rows || 0)};
    if (mode === 'ship') return {qty:Number((r.order_qty || 0) + (r.master_qty || 0) + (r.inventory_qty || 0)), rows:Number((r.order_rows || 0) + (r.master_rows || 0) + (r.inventory_rows || 0))};
    return {qty:Number(c.item_count || r.total_qty || 0), rows:Number(c.row_count || r.total_rows || 0)};
  }
  function mergeKey(name){
    const info = tradeInfo(name || '');
    const base = YX.clean(info.base || name || '').replace(/\s+/g,'').toLowerCase();
    const tag = YX.clean(info.tag || '').replace(/\s+/g,'').toUpperCase();
    return `${base}|${tag}`;
  }
  function mergeCounts(target, src, mode){
    const fields = ['inventory_rows','order_rows','master_rows','shipping_rows','inventory_qty','order_qty','master_qty','shipping_qty','active_rows','total_rows','active_qty_total','history_qty_total','total_qty'];
    target.relation_counts = target.relation_counts || {};
    const sr = src.relation_counts || {};
    fields.forEach(k => { target.relation_counts[k] = Number(target.relation_counts[k] || 0) + Number(sr[k] || 0); });
    target.item_count = Number(target.item_count || 0) + Number(src.item_count || 0);
    target.row_count = Number(target.row_count || 0) + Number(src.row_count || 0);
    target.history_count = Number(target.history_count || 0) + Number(src.history_count || 0);
    const rawNames = new Set([...(target.merge_names || []), target.name, ...(src.merge_names || []), src.name].filter(Boolean));
    target.merge_names = Array.from(rawNames);
    target.duplicate_merged_count = Math.max(0, target.merge_names.length - 1);
    return target;
  }
  function mergeCustomerRows(items, mode){
    const out = [];
    const map = new Map();
    (items || []).forEach(c => {
      const key = mergeKey(c.name || '');
      if (!key) return;
      if (!map.has(key)) {
        const clone = Object.assign({}, c, {relation_counts:Object.assign({}, c.relation_counts || {}), merge_names:Array.isArray(c.merge_names) ? [...c.merge_names] : [c.name].filter(Boolean)});
        map.set(key, clone); out.push(clone);
      } else {
        mergeCounts(map.get(key), c, mode);
      }
    });
    return out;
  }

  function variantsForName(name){
    name = YX.clean(name || '');
    const fromGlobal = Array.isArray(window.__YX_SELECTED_CUSTOMER_VARIANTS__) ? window.__YX_SELECTED_CUSTOMER_VARIANTS__.filter(Boolean) : [];
    if (fromGlobal.length && fromGlobal.includes(name)) return Array.from(new Set(fromGlobal));
    const row = (state.items || []).find(c => YX.clean(c.name || '') === name || (Array.isArray(c.merge_names) && c.merge_names.includes(name)));
    const arr = row && Array.isArray(row.merge_names) ? row.merge_names.filter(Boolean) : [name];
    return Array.from(new Set(arr.length ? arr : [name]));
  }
  function variantsQuery(name){
    const v = variantsForName(name);
    return '&variants=' + encodeURIComponent(JSON.stringify(v));
  }
  function renderCachedSelectedPanel(name){
    const panel = $('selected-customer-items');
    if (!panel || moduleKey() === 'ship' || !['orders','master_order'].includes(moduleKey())) return false;
    const cache = state.itemCache.get(mergeKey(name) || name);
    if (!cache || !Array.isArray(cache.items)) return false;
    renderSelectedCustomerItems(name, cache.items);
    return true;
  }
  function renderSelectedCustomerItems(name, items){
    const panel = $('selected-customer-items');
    if (!panel || moduleKey() === 'ship' || !['orders','master_order'].includes(moduleKey())) return;
    panel.classList.remove('hidden');
    const total = (items || []).reduce((sum,it)=>sum + qtyFromProduct(it.product_text, it.qty), 0);
    panel.innerHTML = `<div class="customer-detail-card yx121-selected-customer-products"><div class="customer-detail-header"><div><div class="section-title">${YX.esc(name)}</div><div class="muted">${total}件 / ${(items||[]).length}筆商品</div></div></div><div class="card-list">${(items||[]).length ? items.map(it=>{ const raw=String(it.product_text||''); const ps=raw.split('='); return `<div class="deduct-card yx112-product-card"><div class="yx113-product-head"><strong class="material-text">${YX.esc(it.material || it.product_code || '未填材質')}</strong><strong>${qtyFromProduct(raw,it.qty)}件</strong></div><div class="yx113-product-main"><span>${YX.esc(ps[0]||raw)}</span><span>${YX.esc(ps.slice(1).join('=') || it.qty || '')}</span></div><div class="small-note">${YX.esc(it.source || '')}</div></div>`; }).join('') : '<div class="empty-state-card compact-empty">此客戶目前沒有商品</div>'}</div></div>`;
  }

  function shouldShow(c, mode){
    const ct = counts(c, mode);
    if (mode === 'orders') return ct.qty > 0 || ct.rows > 0;
    if (mode === 'master_order') return ct.qty > 0 || ct.rows > 0;
    return true;
  }
  function containerMaps(){
    return [
      {mode:moduleKey(), ids:{'北區':'region-north','中區':'region-center','南區':'region-south'}},
      {mode:'customers', ids:{'北區':'customers-north','中區':'customers-center','南區':'customers-south'}}
    ];
  }
  function cardHTML(c, mode){
    const name = c.name || '';
    const info = tradeInfo(name);
    const ct = counts(c, mode);
    return `<button type="button" class="customer-region-card yx113-customer-card yx114-customer-card yx116-customer-card yx117-customer-card" title="${YX.esc(name)}｜${ct.qty}件 / ${ct.rows}筆" data-yx116-card="1" data-yx117-card="1" data-customer-name="${YX.esc(name)}" data-customer="${YX.esc(name)}" data-customer-variants="${YX.esc(JSON.stringify(c.merge_names || [name]))}" data-region="${YX.esc(normRegion(c.region))}"><span class="yx113-customer-left yx116-customer-name">${YX.esc(info.base)}</span><span class="yx113-customer-tag yx116-customer-tag">${info.tag ? YX.esc(info.tag) : ''}</span><span class="yx113-customer-count yx116-customer-count">${ct.qty}件 / ${ct.rows}筆</span></button>`;
  }

  function qtyFromProduct(text, fallback){
    const raw = String(text || '').replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=');
    const right = raw.includes('=') ? raw.split('=').slice(1).join('=') : '';
    if (right) {
      const parts = right.split('+').map(x => x.trim()).filter(Boolean);
      let total = 0;
      parts.forEach(seg => { const m = seg.match(/x\s*(\d+)$/i); total += m ? Number(m[1] || 0) : (/\d/.test(seg) ? 1 : 0); });
      if (total) return total;
    }
    return Number(fallback || 0) || 0;
  }
  async function renderSelectedCustomerPanel(name){
    const panel = $('selected-customer-items');
    if (!panel || moduleKey() === 'ship' || !['orders','master_order'].includes(moduleKey())) return;
    panel.classList.remove('hidden');
    if (!renderCachedSelectedPanel(name)) panel.innerHTML = '<div class="empty-state-card compact-empty">客戶商品載入中…</div>';
    try {
      const d = await YX.api(`/api/customer-items?name=${encodeURIComponent(name)}&fast=1${variantsQuery(name)}`, {method:'GET'});
      const items = Array.isArray(d.items) ? d.items : [];
      state.itemCache.set(mergeKey(name) || name, {items, at:Date.now()});
      renderSelectedCustomerItems(name, items);
    } catch(e) { panel.innerHTML = `<div class="empty-state-card compact-empty">${YX.esc(e.message || '客戶商品載入失敗')}</div>`; }
  }

  async function selectCustomer(name){
    name = YX.clean(name || ''); if (!name) return;
    window.__YX_SELECTED_CUSTOMER__ = name;
    try { window.dispatchEvent(new CustomEvent('yx:customer-selected', {detail:{name, variants:variantsForName(name)}})); } catch(_e) {}
    const input = $('customer-name');
    if (input) input.value = name;
    document.querySelectorAll('.yx113-customer-card,.yx114-customer-card').forEach(card => card.classList.toggle('is-active', YX.clean(card.dataset.customerName) === name));
    try {
      const source = moduleKey() === 'master_order' ? 'master_order' : (moduleKey() === 'orders' ? 'orders' : '');
      if (source && window.YX113ProductActions) {
        window.YX113ProductActions.renderSummary?.(source);
        window.YX113ProductActions.renderCards?.(source);
        const target = document.getElementById(source === 'orders' ? 'orders-list-section' : 'master-list-section');
        target?.scrollIntoView?.({behavior:'smooth', block:'start'});
      }
    } catch(_e) {}
    const m = moduleKey();
    if (m === 'customers' && typeof window.fillCustomerForm === 'function') {
      try { await window.fillCustomerForm(name); } catch(_e) {}
      return;
    }
    // 出貨頁專用分工：北中南客戶只負責選客戶，不再渲染 selected-customer-items，避免和 ship_single_lock.js 同時打 /api/customer-items。
    if (m === 'ship') {
      try {
        if (window.YX116ShipPicker) {
          window.YX116ShipPicker.load(name).catch(()=>{});
          document.getElementById('ship-customer-picker')?.scrollIntoView?.({behavior:'smooth', block:'start'});
        }
      } catch(_e) {}
      return;
    }
    // FIX120/121：不再呼叫舊版 selectCustomerForModule，避免舊版清空新版商品清單。
    // 商品清單統一交給 product_actions_hardlock 母版與 selected-customer panel 刷新。
    renderSelectedCustomerPanel(name).catch(()=>{});
    try {
      const source = moduleKey() === 'master_order' ? 'master_order' : (moduleKey() === 'orders' ? 'orders' : '');
      if (source && window.YX113ProductActions && !window.YX113ProductActions.rowsStore?.(source)?.length) window.YX113ProductActions.refreshCurrent?.().catch(()=>{});
    } catch(_e) {}
  }
  function renderBoards(items){
    if (!isRegionPage()) return;
    state.rendering = true;
    const q = YX.clean($('customer-search')?.value || '').toLowerCase();
    containerMaps().forEach(map => {
      const containers = Object.fromEntries(REGIONS.map(r => [r, $(map.ids[r])]).filter(([,el]) => !!el));
      if (!Object.keys(containers).length) return;
      Object.values(containers).forEach(el => { el.innerHTML = ''; el.classList.add('yx113-customer-list','yx114-customer-list'); });
      let rows = mergeCustomerRows(items || [], map.mode).filter(c => shouldShow(c, map.mode));
      if (q) rows = rows.filter(c => String(c.name || '').toLowerCase().includes(q));
      rows.forEach(c => {
        const region = normRegion(c.region);
        const target = containers[region] || containers['北區'];
        if (!target) return;
        target.insertAdjacentHTML('beforeend', cardHTML(c, map.mode));
      });
      Object.values(containers).forEach(el => { if (!el.children.length) el.innerHTML = '<div class="empty-state-card compact-empty">目前沒有客戶</div>'; });
    });
    state.lastRenderAt = Date.now();
    state.rendering = false;
  }
  function hasLegacyCustomerDom(){
    if (!isRegionPage()) return false;
    const boards = ['region-north','region-center','region-south','customers-north','customers-center','customers-south'].map($).filter(Boolean);
    return boards.some(el => {
      if (!el || el.querySelector('.customer-card-arrow,.fix48-customer-arrow,.yx113-customer-arrow')) return true;
      const cards = Array.from(el.querySelectorAll('.customer-region-card,[data-customer-name]')).filter(c => !c.classList.contains('empty-state-card'));
      return cards.some(c => !c.classList.contains('yx116-customer-card') && !c.closest('.yx113-customer-actions'));
    });
  }
  function scheduleRepair(){
    if (state.rendering) return;
    if (state.repairTimer) return;
    state.repairTimer = setTimeout(() => {
      state.repairTimer = null;
      renderBoards(state.items);
    }, 50);
  }
  function observeCustomerBoards(){
    if (moduleKey() === 'ship' || state.observer || !isRegionPage()) return;
    const targets = ['region-north','region-center','region-south','customers-north','customers-center','customers-south'].map($).filter(Boolean);
    const NativeMO = window.__YX96_NATIVE_MUTATION_OBSERVER__ || window.MutationObserver;
    if (!targets.length || typeof NativeMO === 'undefined') return;
    state.observer = new NativeMO(muts => {
      if (state.rendering) return;
      for (const m of muts){
        const added = Array.from(m.addedNodes || []).filter(n => n && n.nodeType === 1);
        if (added.length && (added.some(n => (n.matches?.('.customer-region-card:not(.yx116-customer-card),.customer-card-arrow,.fix48-customer-arrow,.yx113-customer-arrow') || n.querySelector?.('.customer-region-card:not(.yx116-customer-card),.customer-card-arrow,.fix48-customer-arrow,.yx113-customer-arrow'))) || hasLegacyCustomerDom())) {
          scheduleRepair();
          break;
        }
      }
    });
    targets.forEach(t => state.observer.observe(t, {childList:true, subtree:true}));
  }
  async function loadCustomerBlocks(force=true){
    if (!isRegionPage()) return state.items;
    try {
      const d = await YX.api('/api/customers?yx114=1&ts=' + Date.now(), {method:'GET'});
      state.items = Array.isArray(d.items) ? d.items : [];
      renderBoards(state.items);
      try { window.dispatchEvent(new CustomEvent('yx:customers-loaded', {detail:{items:state.items}})); } catch(_e) {}
      return state.items;
    } catch(e) {
      YX.toast(e.message || '客戶名單載入失敗', 'error');
      return state.items;
    }
  }
  function actionSheet(){
    let modal = $('yx113-customer-actions');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'yx113-customer-actions';
    modal.className = 'modal hidden yx113-customer-actions';
    modal.innerHTML = `<div class="modal-card glass yx113-customer-action-card"><div class="modal-head"><div class="section-title" id="yx113-customer-action-title">客戶操作</div><button class="icon-btn" type="button" id="yx113-customer-action-close">✕</button></div><div class="yx113-action-stack"><button class="ghost-btn" type="button" data-yx113-customer-act="open">打開客戶商品</button><button class="ghost-btn" type="button" data-yx113-customer-act="edit">編輯客戶</button><button class="ghost-btn" type="button" data-yx113-customer-act="move-north">移到北區</button><button class="ghost-btn" type="button" data-yx113-customer-act="move-center">移到中區</button><button class="ghost-btn" type="button" data-yx113-customer-act="move-south">移到南區</button><button class="ghost-btn danger-btn" type="button" data-yx113-customer-act="delete">刪除客戶</button></div></div>`;
    document.body.appendChild(modal);
    const close = () => modal.classList.add('hidden');
    $('yx113-customer-action-close').onclick = close;
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    return modal;
  }
  async function editCustomer(name){
    let item = state.items.find(c => c.name === name) || {};
    try { const d = await YX.api(`/api/customers/${encodeURIComponent(name)}`, {method:'GET'}); item = d.item || item; } catch(_e) {}
    const nextName = prompt('客戶名稱', item.name || name); if (nextName === null) return;
    const region = prompt('區域：北區 / 中區 / 南區', normRegion(item.region || '北區')); if (region === null) return;
    const cleanName = YX.clean(nextName); if (!cleanName) return YX.toast('客戶名稱不可空白', 'warn');
    if (cleanName !== name) await YX.api(`/api/customers/${encodeURIComponent(name)}`, {method:'PUT', body:JSON.stringify({new_name:cleanName})});
    await YX.api('/api/customers', {method:'POST', body:JSON.stringify({name:cleanName, phone:item.phone || '', address:item.address || '', notes:item.notes || '', common_materials:item.common_materials || '', common_sizes:item.common_sizes || '', region:normRegion(region), preserve_existing:false})});
    YX.toast('客戶已更新', 'ok'); await loadCustomerBlocks(true); await selectCustomer(cleanName);
  }
  async function moveCustomer(name, region){
    await YX.api('/api/customers/move', {method:'POST', body:JSON.stringify({name, region})});
    YX.toast(`${name} 已移到${region}`, 'ok'); await loadCustomerBlocks(true); await selectCustomer(name);
  }
  async function deleteCustomer(name){
    if (!confirm(`確定刪除 / 封存客戶「${name}」？`)) return;
    const d = await YX.api(`/api/customers/${encodeURIComponent(name)}`, {method:'DELETE'});
    YX.toast(d.message || '客戶已更新', 'ok');
    if (window.__YX_SELECTED_CUSTOMER__ === name) window.__YX_SELECTED_CUSTOMER__ = '';
    await loadCustomerBlocks(true);
    try { if (window.YX113ProductActions) await window.YX113ProductActions.refreshCurrent(); } catch(_e) {}
  }
  function showActions(name){
    const modal = actionSheet();
    modal.dataset.customer = name;
    $('yx113-customer-action-title').textContent = name || '客戶操作';
    modal.classList.remove('hidden');
  }
  function bindEvents(){
    if (state.bound) return; state.bound = true;
    let press = null, blockClickUntil = 0;
    const clear = () => { if (press?.timer) clearTimeout(press.timer); if (press?.card) press.card.classList.remove('yx121-dragging-customer'); press = null; };
    const regionFromPoint = (x,y) => {
      const el = document.elementFromPoint(x,y);
      const box = el?.closest?.('.category-box[data-region]');
      return box ? normRegion(box.dataset.region || box.querySelector('.category-title')?.textContent || '') : '';
    };
    document.addEventListener('pointerdown', ev => {
      const card = ev.target?.closest?.('.yx114-customer-card,.yx113-customer-card,.customer-region-card[data-customer-name],[data-customer-name]');
      if (!card || ev.target.closest('button,input,select,textarea,a')) return;
      const name = YX.clean(card.dataset.customerName || card.dataset.customer || ''); if (!name) return;
      const x = ev.clientX, y = ev.clientY;
      clear();
      press = {card, name, x, y, dragging:false, timer:setTimeout(() => { blockClickUntil = Date.now() + 900; showActions(name); clear(); }, 650)};
    }, true);
    document.addEventListener('pointermove', ev => {
      if (!press) return;
      const dx = Math.abs(ev.clientX - press.x), dy = Math.abs(ev.clientY - press.y);
      if ((dx > 8 || dy > 8) && press.timer) { clearTimeout(press.timer); press.timer = null; }
      if (dx > 14 || dy > 14) {
        press.dragging = true;
        press.card.classList.add('yx121-dragging-customer');
        document.querySelectorAll('.category-box[data-region]').forEach(box => box.classList.toggle('yx121-drop-target', !!regionFromPoint(ev.clientX, ev.clientY) && box === document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('.category-box[data-region]')));
      }
    }, true);
    document.addEventListener('pointerup', ev => {
      if (press?.dragging) {
        ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.();
        const target = regionFromPoint(ev.clientX, ev.clientY);
        const name = press.name;
        blockClickUntil = Date.now() + 900;
        clear();
        document.querySelectorAll('.category-box[data-region]').forEach(box => box.classList.remove('yx121-drop-target'));
        if (target) moveCustomer(name, target).catch(e => YX.toast(e.message || '移動客戶失敗', 'error'));
        return;
      }
      clear();
    }, true);
    ['pointercancel','pointerleave','dragstart'].forEach(t => document.addEventListener(t, clear, true));
    document.addEventListener('contextmenu', ev => {
      const card = ev.target?.closest?.('.yx114-customer-card,.yx113-customer-card,.customer-region-card[data-customer-name],[data-customer-name]');
      if (!card) return;
      const name = YX.clean(card.dataset.customerName || card.dataset.customer || ''); if (!name) return;
      ev.preventDefault(); showActions(name);
    }, true);
    document.addEventListener('click', async ev => {
      const actBtn = ev.target?.closest?.('[data-yx113-customer-act]');
      if (actBtn) {
        ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.();
        const modal = $('yx113-customer-actions'); const name = YX.clean(modal?.dataset.customer || ''); const act = actBtn.dataset.yx113CustomerAct;
        try {
          if (act === 'open') { modal.classList.add('hidden'); await selectCustomer(name); }
          if (act === 'edit') { modal.classList.add('hidden'); await editCustomer(name); }
          if (act === 'move-north') { modal.classList.add('hidden'); await moveCustomer(name, '北區'); }
          if (act === 'move-center') { modal.classList.add('hidden'); await moveCustomer(name, '中區'); }
          if (act === 'move-south') { modal.classList.add('hidden'); await moveCustomer(name, '南區'); }
          if (act === 'delete') { modal.classList.add('hidden'); await deleteCustomer(name); }
        } catch(e) { YX.toast(e.message || '客戶操作失敗', 'error'); }
        return;
      }
      const card = ev.target?.closest?.('.yx114-customer-card,.yx113-customer-card,.customer-region-card[data-customer-name],[data-customer-name]');
      if (!card || Date.now() < blockClickUntil) { if (card) { ev.preventDefault(); ev.stopPropagation(); } return; }
      const name = YX.clean(card.dataset.customerName || card.dataset.customer || ''); if (!name) return;
      try { window.__YX_SELECTED_CUSTOMER_VARIANTS__ = JSON.parse(card.dataset.customerVariants || '[]'); } catch(_e) { window.__YX_SELECTED_CUSTOMER_VARIANTS__ = [name]; }
      ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.();
      await selectCustomer(name);
    }, true);
  }
  function lockGlobals(){
    if (!state.oldSelect && typeof window.selectCustomerForModule === 'function') state.oldSelect = window.selectCustomerForModule;
    const selectFn = YX.mark(selectCustomer, 'customer_select');
    window.selectCustomerForModule = selectFn;
    const loadFn = YX.mark(loadCustomerBlocks, 'customer_blocks');
    try { YX.hardAssign('loadCustomerBlocks', loadFn, {configurable:false}); } catch(_e) { window.loadCustomerBlocks = loadFn; }
    try { YX.hardAssign('renderCustomers', loadFn, {configurable:false}); } catch(_e) { window.renderCustomers = loadFn; }
    window.YX113CustomerRegions = {loadCustomerBlocks, renderBoards, selectCustomer};
    window.YX114CustomerRegions = window.YX113CustomerRegions;
    window.YX115CustomerRegions = window.YX113CustomerRegions;
    window.YX116CustomerRegions = window.YX113CustomerRegions;
    window.YX117CustomerRegions = window.YX113CustomerRegions;
  }
  function install(){
    if (!isRegionPage()) return;
    document.documentElement.dataset.yx113Customers = 'locked';
    document.documentElement.dataset.yx114Customers = 'locked';
    document.documentElement.dataset.yx115Customers = 'locked';
    document.documentElement.dataset.yx116Customers = 'locked';
    document.documentElement.dataset.yx117Customers = 'locked';
    bindEvents(); lockGlobals(); observeCustomerBoards(); loadCustomerBlocks(true);
    [80, 160, 320, 700, 1500, 3000, 5200].forEach(ms => setTimeout(() => { lockGlobals(); observeCustomerBoards(); if (hasLegacyCustomerDom() || Date.now() - state.lastRenderAt > 1200) renderBoards(state.items); }, ms));
  }
  YX.register('customer_regions', {install, loadCustomerBlocks, selectCustomer});
})();
