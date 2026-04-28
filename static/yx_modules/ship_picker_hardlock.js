/* FIX118 出貨客戶商品下拉母版硬鎖：輸入客戶名稱後立即刷新該客戶全部商品 */
(function(){
  'use strict';
  const YX = window.YXHardLock;
  if (!YX) return;
  const state = {timer:null, loading:null, lastKey:'', items:[], bound:false};
  const $ = id => document.getElementById(id);
  const isShip = () => YX.moduleKey() === 'ship' || !!$('ship-customer-item-select');
  const clean = v => YX.clean(v);
  const esc = v => YX.esc(v);
  function customer(){ return clean($('customer-name')?.value || window.__YX_SELECTED_CUSTOMER__ || ''); }
  function qtyOf(it){
    const raw = String(it?.product_text || it?.support || '').replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=');
    const right = raw.includes('=') ? raw.split('=').slice(1).join('=') : '';
    if (right) {
      const parts = right.split('+').map(x => x.trim()).filter(Boolean);
      let total = 0;
      parts.forEach(seg => { const m = seg.match(/x\s*(\d+)$/i); total += m ? Number(m[1] || 0) : (/\d/.test(seg) ? 1 : 0); });
      if (total) return total;
    }
    const n = Number(it?.qty ?? it?.effective_qty ?? it?.total_qty ?? 0);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  }
  function sourceLabel(it){
    const src = clean(it?.source_label || it?.source || it?.type || '');
    if (/master/i.test(src) || src === 'master_orders') return '總單';
    if (/order/i.test(src) || src === 'orders') return '訂單';
    if (/inventory/i.test(src)) return '庫存';
    return src || '商品';
  }
  function optionText(it){
    const material = clean(it?.material || it?.product_code || '');
    const p = clean(it?.product_text || it?.product_size || it?.size || '未填尺寸');
    const q = qtyOf(it);
    return `${material && !/^\d/.test(material) ? material + '｜' : ''}${p}｜${sourceLabel(it)}｜${q}件`;
  }
  function setCaches(items){
    state.items = Array.isArray(items) ? items : [];
    window.__YX_SHIP_CUSTOMER_ITEMS__ = state.items;
    window.__YX82_SHIP_ITEMS__ = state.items;
    window.__YX83_SHIP_ITEMS__ = state.items;
    window.__YX116_SHIP_ITEMS__ = state.items;
  }
  function fillSelect(items, name){
    const sel = $('ship-customer-item-select');
    if (!sel) return;
    setCaches(items);
    if (!name) {
      sel.innerHTML = '<option value="">請先選擇 / 輸入客戶名稱</option>';
      return;
    }
    if (!state.items.length) {
      sel.innerHTML = `<option value="">${esc(name)} 目前沒有商品</option>`;
      return;
    }
    sel.innerHTML = '<option value="">請選擇商品</option>' + state.items.map((it,i)=>`<option value="${i}">${esc(optionText(it))}</option>`).join('');
  }
  async function loadShipCustomerItems(name){
    if (!isShip()) return [];
    name = clean(name || customer());
    const sel = $('ship-customer-item-select');
    if (!name) { fillSelect([], ''); return []; }
    const key = `${name}|${Date.now()}`;
    state.lastKey = key;
    if (sel) sel.innerHTML = `<option value="">載入 ${esc(name)} 商品中…</option>`;
    const p = (async () => {
      try {
        const d = await YX.api(`/api/customer-items?name=${encodeURIComponent(name)}&yx116_ship=1&ts=${Date.now()}`, {method:'GET'});
        if (state.lastKey !== key) return state.items;
        const items = Array.isArray(d.items) ? d.items : [];
        fillSelect(items, name);
        return items;
      } catch(e) {
        if (sel) sel.innerHTML = `<option value="">${esc(e.message || '商品載入失敗')}</option>`;
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
    state.timer = setTimeout(() => loadShipCustomerItems(customer()), 120);
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
    const idx = Number($('ship-customer-item-select')?.value ?? -1);
    return state.items[idx] || window.__YX_SHIP_CUSTOMER_ITEMS__?.[idx] || null;
  }
  function bind(){
    if (state.bound) return; state.bound = true;
    document.addEventListener('input', ev => { if (ev.target?.id === 'customer-name') scheduleLoad(); }, true);
    document.addEventListener('change', ev => { if (ev.target?.id === 'customer-name') scheduleLoad(); }, true);
    document.addEventListener('click', ev => {
      const btn = ev.target?.closest?.('#ship-refresh-customer-items,#ship-add-selected-item,#ship-add-all-items');
      if (!btn || !isShip()) return;
      ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.();
      (async () => {
        if (btn.id === 'ship-refresh-customer-items') { await loadShipCustomerItems(customer()); YX.toast('客戶商品已重新載入', 'ok'); return; }
        if (!state.items.length) await loadShipCustomerItems(customer());
        if (btn.id === 'ship-add-selected-item') {
          const it = selectedItem();
          if (!it) return YX.toast('請先選擇商品', 'warn');
          appendToText([it]);
          return;
        }
        if (btn.id === 'ship-add-all-items') appendToText(state.items);
      })().catch(e => YX.toast(e.message || '出貨商品操作失敗', 'error'));
    }, true);
  }
  function lockGlobals(){
    const fn = YX.mark(loadShipCustomerItems, 'ship_picker_116');
    ['loadShipCustomerItems','loadShipCustomerItems66','loadShipCustomerItems82','loadShipCustomerItems83'].forEach(n => {
      try { YX.hardAssign(n, fn, {configurable:false}); } catch(_e) { try { window[n] = fn; } catch(_e2){} }
    });
    window.YX116ShipPicker = {load:loadShipCustomerItems, items:() => state.items};
  }
  function install(){
    if (!isShip()) return;
    document.documentElement.dataset.yx116ShipPicker = 'locked';
    bind(); lockGlobals();
    if (customer()) scheduleLoad(); else fillSelect([], '');
    [80, 240, 700, 1400].forEach(ms => setTimeout(() => { lockGlobals(); if (customer()) scheduleLoad(); }, ms));
  }
  YX.register('ship_picker', {install, load:loadShipCustomerItems});
})();
