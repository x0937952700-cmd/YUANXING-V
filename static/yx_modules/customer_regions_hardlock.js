/* FIX113 北中南客戶母版硬鎖：FOB/CNF 標籤置中、件/筆靠右、長按操作、操作後立即刷新 */
(function(){
  'use strict';
  const YX = window.YXHardLock;
  if (!YX) return;
  const $ = id => document.getElementById(id);
  const state = {items:[], bound:false, oldSelect:null};
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
    return `<button type="button" class="customer-region-card yx113-customer-card" data-customer-name="${YX.esc(name)}" data-customer="${YX.esc(name)}" data-region="${YX.esc(normRegion(c.region))}"><span class="yx113-customer-left">${YX.esc(info.base)}</span><span class="yx113-customer-tag">${info.tag ? YX.esc(info.tag) : ''}</span><span class="yx113-customer-count">${ct.qty}件 / ${ct.rows}筆</span><span class="yx113-customer-arrow">→</span></button>`;
  }
  async function selectCustomer(name){
    name = YX.clean(name || ''); if (!name) return;
    window.__YX_SELECTED_CUSTOMER__ = name;
    const input = $('customer-name');
    if (input) { input.value = name; input.dispatchEvent(new Event('input', {bubbles:true})); input.dispatchEvent(new Event('change', {bubbles:true})); }
    document.querySelectorAll('.yx113-customer-card').forEach(card => card.classList.toggle('is-active', YX.clean(card.dataset.customerName) === name));
    const m = moduleKey();
    if (m === 'customers' && typeof window.fillCustomerForm === 'function') {
      try { await window.fillCustomerForm(name); } catch(_e) {}
      return;
    }
    if (state.oldSelect && state.oldSelect !== selectCustomer) {
      try { await state.oldSelect.call(window, name); } catch(_e) {}
    }
    try { if (window.YX113ProductActions) await window.YX113ProductActions.refreshCurrent(); } catch(_e) {}
  }
  function renderBoards(items){
    if (!isRegionPage()) return;
    const q = YX.clean($('customer-search')?.value || '').toLowerCase();
    containerMaps().forEach(map => {
      const containers = Object.fromEntries(REGIONS.map(r => [r, $(map.ids[r])]).filter(([,el]) => !!el));
      if (!Object.keys(containers).length) return;
      Object.values(containers).forEach(el => { el.innerHTML = ''; el.classList.add('yx113-customer-list'); });
      let rows = (items || []).filter(c => shouldShow(c, map.mode));
      if (q) rows = rows.filter(c => String(c.name || '').toLowerCase().includes(q));
      rows.forEach(c => {
        const region = normRegion(c.region);
        const target = containers[region] || containers['北區'];
        if (!target) return;
        target.insertAdjacentHTML('beforeend', cardHTML(c, map.mode));
      });
      Object.values(containers).forEach(el => { if (!el.children.length) el.innerHTML = '<div class="empty-state-card compact-empty">目前沒有客戶</div>'; });
    });
  }
  async function loadCustomerBlocks(force=true){
    if (!isRegionPage()) return state.items;
    try {
      const d = await YX.api('/api/customers?yx113=1&ts=' + Date.now(), {method:'GET'});
      state.items = Array.isArray(d.items) ? d.items : [];
      renderBoards(state.items);
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
    const clear = () => { if (press?.timer) clearTimeout(press.timer); press = null; };
    document.addEventListener('pointerdown', ev => {
      const card = ev.target?.closest?.('.yx113-customer-card,.customer-region-card[data-customer-name],[data-customer-name]');
      if (!card || ev.target.closest('button,input,select,textarea,a')) return;
      const name = YX.clean(card.dataset.customerName || card.dataset.customer || ''); if (!name) return;
      const x = ev.clientX, y = ev.clientY;
      clear();
      press = {card, name, x, y, timer:setTimeout(() => { blockClickUntil = Date.now() + 900; showActions(name); clear(); }, 650)};
    }, true);
    document.addEventListener('pointermove', ev => { if (press && (Math.abs(ev.clientX - press.x) > 8 || Math.abs(ev.clientY - press.y) > 8)) clear(); }, true);
    ['pointerup','pointercancel','pointerleave','dragstart'].forEach(t => document.addEventListener(t, clear, true));
    document.addEventListener('contextmenu', ev => {
      const card = ev.target?.closest?.('.yx113-customer-card,.customer-region-card[data-customer-name],[data-customer-name]');
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
      const card = ev.target?.closest?.('.yx113-customer-card,.customer-region-card[data-customer-name],[data-customer-name]');
      if (!card || Date.now() < blockClickUntil) { if (card) { ev.preventDefault(); ev.stopPropagation(); } return; }
      const name = YX.clean(card.dataset.customerName || card.dataset.customer || ''); if (!name) return;
      ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.();
      await selectCustomer(name);
    }, true);
  }
  function lockGlobals(){
    if (!state.oldSelect && typeof window.selectCustomerForModule === 'function') state.oldSelect = window.selectCustomerForModule;
    const selectFn = YX.mark(selectCustomer, 'customer_select');
    window.selectCustomerForModule = selectFn;
    window.loadCustomerBlocks = YX.mark(loadCustomerBlocks, 'customer_blocks');
    window.renderCustomers = YX.mark(loadCustomerBlocks, 'customer_blocks');
    window.YX113CustomerRegions = {loadCustomerBlocks, renderBoards, selectCustomer};
  }
  function install(){
    if (!isRegionPage()) return;
    document.documentElement.dataset.yx113Customers = 'locked';
    bindEvents(); lockGlobals(); loadCustomerBlocks(true);
    [250, 900, 1800].forEach(ms => setTimeout(() => { lockGlobals(); renderBoards(state.items); }, ms));
  }
  YX.register('customer_regions', {install, loadCustomerBlocks, selectCustomer});
})();
