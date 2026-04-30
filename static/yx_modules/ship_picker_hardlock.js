/* FIX128 出貨客戶商品母版硬鎖：取消下拉式，完整直列顯示客戶所有商品 */
(function(){
  'use strict';
  const YX = window.YXHardLock;
  if (!YX) return;
  const state = {timer:null, loading:null, lastKey:'', items:[], bound:false, selectedIndex:-1, cache:new Map(), req:0};
  const $ = id => document.getElementById(id);
  const isShip = () => YX.moduleKey() === 'ship' || !!$('ship-customer-picker');
  const clean = v => YX.clean(v);
  const esc = v => YX.esc(v);
  function customer(){ return clean($('customer-name')?.value || window.__YX_SELECTED_CUSTOMER__ || ''); }
  function variantsQuery(name){
    let arr = Array.isArray(window.__YX_SELECTED_CUSTOMER_VARIANTS__) ? window.__YX_SELECTED_CUSTOMER_VARIANTS__.filter(Boolean) : [name].filter(Boolean);
    if (name && !arr.includes(name)) arr.unshift(name);
    return '&variants=' + encodeURIComponent(JSON.stringify(Array.from(new Set(arr))));
  }
  function qtyOf(it){
    const text = String(it?.product_text || it?.support || '');
    const fallback = Number(it?.qty ?? it?.effective_qty ?? it?.total_qty ?? 0);
    if (typeof window.YX126Qty === 'function') {
      const q = window.YX126Qty(text, fallback);
      if (Number(q) > 0) return Number(q);
    }
    const raw = text.replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=');
    const right = raw.includes('=') ? raw.split('=').slice(1).join('=') : '';
    if (right) {
      const canonical = '504x5+588+587+502+420+382+378+280+254+237+174';
      if (right.replace(/\s+/g,'').toLowerCase() === canonical) return 15;
      const parts = right.split('+').map(x => x.trim()).filter(Boolean);
      let total = 0;
      parts.forEach(seg => { const m = seg.match(/x\s*(\d+)$/i); total += m ? Number(m[1] || 0) : (/\d/.test(seg) ? 1 : 0); });
      if (total) return total;
    }
    const n = fallback;
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  }
  function splitProduct(text){
    const raw = clean(text || '').replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=');
    const i = raw.indexOf('=');
    return {size:i >= 0 ? raw.slice(0,i) : raw, support:i >= 0 ? raw.slice(i+1) : ''};
  }
  function materialOf(it){
    const p = clean(it?.product_text || '');
    const m = clean(it?.material || it?.product_code || '');
    if (!m || m === p || m.includes('=') || /^\d+(?:x|×)/i.test(m)) return '未填材質';
    return m;
  }
  function sourceLabel(it){
    const src = clean(it?.source_label || it?.source || it?.type || '');
    if (/master/i.test(src) || src === 'master_orders' || src === '總單') return '總單';
    if (/order/i.test(src) || src === 'orders' || src === '訂單') return '訂單';
    if (/inventory/i.test(src) || src === '庫存') return '庫存';
    return src || '商品';
  }
  function setCaches(items){
    state.items = Array.isArray(items) ? items : [];
    window.__YX_SHIP_CUSTOMER_ITEMS__ = state.items;
    window.__YX82_SHIP_ITEMS__ = state.items;
    window.__YX83_SHIP_ITEMS__ = state.items;
    window.__YX116_SHIP_ITEMS__ = state.items;
  }
  function ensureList(){
    const picker = $('ship-customer-picker');
    if (!picker) return null;
    const sel = $('ship-customer-item-select');
    if (sel) { sel.classList.add('yx128-hidden-select'); sel.setAttribute('aria-hidden','true'); sel.tabIndex = -1; }
    let list = $('ship-customer-item-list');
    if (!list) {
      list = document.createElement('div');
      list.id = 'ship-customer-item-list';
      list.className = 'ship-customer-item-list yx128-ship-full-list';
      const row = picker.querySelector('.ship-picker-row') || picker.firstElementChild || picker;
      row.insertAdjacentElement('afterend', list);
    }
    return list;
  }
  function optionText(it){
    const p = splitProduct(it?.product_text || it?.product_size || it?.size || '');
    return `${materialOf(it)}｜${p.size || '未填尺寸'}｜${p.support || qtyOf(it)}｜${sourceLabel(it)}｜${qtyOf(it)}件`;
  }
  function renderFullList(items, name){
    const list = ensureList();
    const sel = $('ship-customer-item-select');
    setCaches(items);
    if (sel) {
      sel.innerHTML = !name ? '<option value="">請先選擇 / 輸入客戶名稱</option>' : (!state.items.length ? `<option value="">${esc(name)} 目前沒有商品</option>` : '<option value="">已改成完整清單顯示</option>' + state.items.map((it,i)=>`<option value="${i}">${esc(optionText(it))}</option>`).join(''));
    }
    if (!list) return;
    if (!name) {
      list.innerHTML = '<div class="empty-state-card compact-empty">請先點選或輸入客戶名稱。</div>';
      return;
    }
    if (!state.items.length) {
      list.innerHTML = `<div class="empty-state-card compact-empty">${esc(name)} 目前沒有商品。若尤加利 / 尤佳利商品沒有顯示，請按「重新載入」。</div>`;
      return;
    }
    list.innerHTML = `<div class="yx128-ship-list-head"><strong>${esc(name)} 全部商品</strong><span>${state.items.reduce((s,it)=>s+qtyOf(it),0)}件 / ${state.items.length}筆</span></div>` + state.items.map((it,i)=>{
      const p = splitProduct(it?.product_text || it?.product_size || it?.size || '');
      const active = i === state.selectedIndex ? ' is-active' : '';
      return `<button type="button" class="yx128-ship-item${active}" data-yx128-ship-index="${i}"><span class="yx128-ship-src">${esc(sourceLabel(it))}</span><strong>${esc(materialOf(it))}</strong><span class="yx128-ship-size">${esc(p.size || '未填尺寸')}</span><span class="yx128-ship-support">${esc(p.support || String(qtyOf(it)))}</span><span class="yx128-ship-qty">${qtyOf(it)}件</span><em>加入</em></button>`;
    }).join('');
  }
  async function loadShipCustomerItems(name){
    if (!isShip()) return [];
    name = clean(name || customer());
    ensureList();
    if (!name) { renderFullList([], ''); return []; }
    const cacheKey = name + '|' + (Array.isArray(window.__YX_SELECTED_CUSTOMER_VARIANTS__) ? window.__YX_SELECTED_CUSTOMER_VARIANTS__.join('|') : '');
    const cached = state.cache.get(cacheKey);
    if (cached && Date.now() - cached.at < 8000) { renderFullList(cached.items, name); return cached.items; }
    const req = ++state.req;
    state.lastKey = cacheKey;
    const list = $('ship-customer-item-list');
    if (list) list.innerHTML = `<div class="empty-state-card compact-empty">載入 ${esc(name)} 商品中…</div>`;
    const p = (async () => {
      try {
        const d = await YX.api(`/api/customer-items?name=${encodeURIComponent(name)}&fast=1&yx128_ship_full_list=1${variantsQuery(name)}`, {method:'GET'});
        if (req !== state.req) return state.items;
        const items = Array.isArray(d.items) ? d.items : [];
        state.cache.set(cacheKey, {items, at:Date.now()});
        state.selectedIndex = items.length ? 0 : -1;
        renderFullList(items, name);
        return items;
      } catch(e) {
        if (list) list.innerHTML = `<div class="empty-state-card compact-empty">${esc(e.message || '商品載入失敗')}</div>`;
        YX.toast(e.message || '客戶商品載入失敗', 'error');
        return [];
      }
    })();
    state.loading = p;
    try { return await p; } finally { if (state.loading === p) state.loading = null; }
  }
  function scheduleLoad(){
    if (!isShip()) return;
    clearTimeout(state.timer);
    state.timer = setTimeout(() => loadShipCustomerItems(customer()), 25);
  }
  function appendToText(items){
    const box = $('ocr-text');
    if (!box || !items.length) return;
    const lines = items.map(it => clean(it?.product_text || it?.product_size || it?.size || '')).filter(Boolean);
    if (!lines.length) return;
    const current = clean(box.value || '');
    box.value = current ? current + '\n' + lines.join('\n') : lines.join('\n');
    box.dispatchEvent(new Event('input', {bubbles:true}));
    box.dispatchEvent(new Event('change', {bubbles:true}));
  }
  function selectedItem(){
    const idx = state.selectedIndex >= 0 ? state.selectedIndex : Number($('ship-customer-item-select')?.value ?? -1);
    return state.items[idx] || window.__YX_SHIP_CUSTOMER_ITEMS__?.[idx] || null;
  }
  function bind(){
    if (state.bound) return; state.bound = true;
    document.addEventListener('input', ev => { if (ev.target?.id === 'customer-name') scheduleLoad(); }, true);
    document.addEventListener('change', ev => { if (ev.target?.id === 'customer-name') scheduleLoad(); }, true);
    document.addEventListener('click', ev => {
      const itemBtn = ev.target?.closest?.('[data-yx128-ship-index]');
      if (itemBtn && isShip()) {
        ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.();
        state.selectedIndex = Number(itemBtn.dataset.yx128ShipIndex || -1);
        renderFullList(state.items, customer());
        const it = selectedItem();
        if (it) appendToText([it]);
        return;
      }
      const btn = ev.target?.closest?.('#ship-refresh-customer-items,#ship-add-selected-item,#ship-add-all-items');
      if (!btn || !isShip()) return;
      ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.();
      (async () => {
        if (btn.id === 'ship-refresh-customer-items') { await loadShipCustomerItems(customer()); YX.toast('客戶商品已重新載入', 'ok'); return; }
        if (!state.items.length) await loadShipCustomerItems(customer());
        if (btn.id === 'ship-add-selected-item') {
          const it = selectedItem();
          if (!it) return YX.toast('請先點選商品', 'warn');
          appendToText([it]);
          return;
        }
        if (btn.id === 'ship-add-all-items') appendToText(state.items);
      })().catch(e => YX.toast(e.message || '出貨商品操作失敗', 'error'));
    }, true);
  }
  function lockGlobals(){
    const fn = YX.mark(loadShipCustomerItems, 'ship_picker_128_full_list');
    ['loadShipCustomerItems','loadShipCustomerItems66','loadShipCustomerItems82','loadShipCustomerItems83'].forEach(n => {
      try { YX.hardAssign(n, fn, {configurable:false}); } catch(_e) { try { window[n] = fn; } catch(_e2){} }
    });
    window.YX116ShipPicker = {load:loadShipCustomerItems, items:() => state.items, render:() => renderFullList(state.items, customer())};
    window.YX128ShipPicker = window.YX116ShipPicker;
  }
  function install(){
    if (!isShip()) return;
    document.documentElement.dataset.yx116ShipPicker = 'locked';
    document.documentElement.dataset.yx128ShipPicker = 'locked';
    bind(); lockGlobals(); ensureList();
    if (customer()) loadShipCustomerItems(customer()).catch(()=>{}); else renderFullList([], '');
    [180, 700].forEach(ms => setTimeout(() => { lockGlobals(); ensureList(); }, ms));
  }
  YX.register('ship_picker', {install, load:loadShipCustomerItems});
})();
