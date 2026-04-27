/* FIX112 商品功能硬鎖：庫存/訂單/總單卡片動作、點選篩選、批量材質刷新 */
(function(){
  'use strict';
  const YX = window.YXHardLock;
  if (!YX) return;
  function $(id){ return document.getElementById(id); }
  function sourceFromModule(){ const m = YX.moduleKey(); return m === 'inventory' ? 'inventory' : m === 'orders' ? 'orders' : m === 'master_order' ? 'master_order' : ''; }
  function endpoint(source){ return source === 'inventory' ? '/api/inventory' : source === 'orders' ? '/api/orders' : '/api/master_orders'; }
  function label(source){ return source === 'inventory' ? '庫存' : source === 'orders' ? '訂單' : '總單'; }
  function listEl(source){ return source === 'inventory' ? $('inventory-inline-list') : source === 'orders' ? $('orders-list') : $('master-list'); }
  function rowsStore(source, rows){ window.__YX112_ROWS__ = window.__YX112_ROWS__ || {}; if (Array.isArray(rows)) window.__YX112_ROWS__[source] = rows; return window.__YX112_ROWS__[source] || []; }
  function normText(v){ return YX.clean(v).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/\s+/g,''); }
  function splitProduct(text){ const raw = normText(text); const i = raw.indexOf('='); return {size:i >= 0 ? raw.slice(0, i) : raw, support:i >= 0 ? raw.slice(i+1) : ''}; }
  function materialOf(r){ const p = r?.product_text || ''; const raw = YX.clean(r?.material || r?.product_code || ''); if (!raw || raw === p || raw.includes('=')) return '未填材質'; return raw; }
  function qtyOf(r){ const n = Number(r?.qty ?? r?.effective_qty ?? 0); return Number.isFinite(n) ? n : 0; }
  function customerOf(r){ return YX.clean(r?.customer_name || $('customer-name')?.value || ''); }
  function renderCards(source, rows, opts={}){
    const list = listEl(source); if (!list) return;
    const selectedId = opts.selectedId ? String(opts.selectedId) : '';
    const filtered = selectedId ? rows.filter(r => String(r.id || '') === selectedId) : rows;
    list.classList.add('yx112-product-list');
    list.innerHTML = (filtered || []).map(r => {
      const parts = splitProduct(r.product_text || '');
      const customer = customerOf(r) || '未指定客戶';
      const needsRed = r.needs_red || Number(r.unplaced_qty || 0) > 0;
      const actions = source === 'inventory'
        ? `<button class="ghost-btn tiny-btn" data-yx112-action="edit">編輯</button><button class="ghost-btn tiny-btn danger-btn" data-yx112-action="delete">刪除</button><button class="ghost-btn tiny-btn" data-yx112-action="to-orders">加到訂單</button><button class="ghost-btn tiny-btn" data-yx112-action="to-master">加到總單</button>`
        : `<button class="ghost-btn tiny-btn" data-yx112-action="edit">編輯</button><button class="ghost-btn tiny-btn" data-yx112-action="ship">直接出貨</button><button class="ghost-btn tiny-btn danger-btn" data-yx112-action="delete">刪除</button>`;
      return `<div class="deduct-card yx112-product-card ${needsRed ? 'needs-red' : ''}" data-source="${YX.esc(source)}" data-id="${Number(r.id || 0)}">
        <div class="yx112-product-head"><strong class="material-text">${YX.esc(materialOf(r))}</strong><strong>${qtyOf(r)}件</strong></div>
        <button class="yx112-product-main" type="button" data-yx112-action="filter"><span>${YX.esc(parts.size || r.product_text || '')}</span><span>${YX.esc(parts.support || String(qtyOf(r)))}</span></button>
        ${source !== 'inventory' ? `<div class="small-note">${YX.esc(customer)}</div>` : ''}
        <div class="btn-row compact-row yx112-product-actions">${actions}</div>
      </div>`;
    }).join('') || `<div class="empty-state-card compact-empty">目前沒有${YX.esc(label(source))}商品</div>`;
  }
  async function loadSource(source, opts={}){
    const d = await YX.api(endpoint(source) + '?yx112=1&ts=' + Date.now(), {method:'GET'});
    let rows = Array.isArray(d.items) ? d.items : [];
    if (source !== 'inventory') {
      const selected = YX.clean($('customer-name')?.value || window.__YX_SELECTED_CUSTOMER__ || '');
      if (selected) rows = rows.filter(r => YX.clean(r.customer_name || '') === selected);
    }
    rowsStore(source, rows);
    renderCards(source, rows, opts);
    return rows;
  }
  async function refreshCurrent(){ const s = sourceFromModule(); if (s) return loadSource(s); return null; }
  async function editItem(card){
    const source = card.dataset.source, id = card.dataset.id;
    const row = (rowsStore(source) || []).find(r => String(r.id || '') === String(id)); if (!row) return;
    const product_text = prompt('商品資料', row.product_text || ''); if (product_text === null) return;
    const material = prompt('材質', materialOf(row) === '未填材質' ? '' : materialOf(row)); if (material === null) return;
    const qty = prompt('數量', String(qtyOf(row))); if (qty === null) return;
    const url = source === 'inventory' ? `/api/inventory/${encodeURIComponent(id)}` : source === 'orders' ? `/api/orders/${encodeURIComponent(id)}` : `/api/master_orders/${encodeURIComponent(id)}`;
    await YX.api(url, {method:'PUT', body:JSON.stringify({product_text, material, product_code:material, qty:Number(qty || 0), customer_name:customerOf(row)})});
    YX.toast('已更新商品', 'ok');
    await loadSource(source);
  }
  async function deleteItem(card){
    const source = card.dataset.source, id = card.dataset.id;
    if (!confirm(`確定刪除這筆${label(source)}商品？`)) return;
    const url = source === 'inventory' ? `/api/inventory/${encodeURIComponent(id)}` : source === 'orders' ? `/api/orders/${encodeURIComponent(id)}` : `/api/master_orders/${encodeURIComponent(id)}`;
    await YX.api(url, {method:'DELETE'});
    card.remove();
    YX.toast('已刪除', 'ok');
    await loadSource(source);
  }
  async function moveInventory(card, target){
    const id = card.dataset.id;
    let customer = YX.clean($('customer-name')?.value || window.__YX_SELECTED_CUSTOMER__ || '');
    if (!customer) customer = prompt(`要加入${target === 'orders' ? '訂單' : '總單'}的客戶名稱`) || '';
    customer = YX.clean(customer);
    if (!customer) return YX.toast('請輸入客戶名稱', 'warn');
    await YX.api(`/api/inventory/${encodeURIComponent(id)}/move`, {method:'POST', body:JSON.stringify({target, customer_name:customer})});
    YX.toast(`已加到${target === 'orders' ? '訂單' : '總單'}`, 'ok');
    await loadSource('inventory');
  }
  async function shipItem(card){
    const source = card.dataset.source, id = card.dataset.id;
    const row = (rowsStore(source) || []).find(r => String(r.id || '') === String(id)); if (!row) return;
    if (!confirm(`直接出貨：${row.customer_name || ''} ${row.product_text || ''}？`)) return;
    await YX.api('/api/items/transfer', {method:'POST', body:JSON.stringify({source: source === 'master_order' ? 'master_orders' : source, id, target:'ship', customer_name:customerOf(row), qty:qtyOf(row), allow_inventory_fallback:true})});
    YX.toast('已直接出貨', 'ok');
    await loadSource(source);
  }
  function bindEvents(){
    if (window.__YX112_PRODUCT_EVENTS__) return;
    window.__YX112_PRODUCT_EVENTS__ = true;
    document.addEventListener('click', async ev => {
      const card = ev.target?.closest?.('.yx112-product-card');
      const act = ev.target?.closest?.('[data-yx112-action]')?.getAttribute('data-yx112-action');
      if (!card || !act) return;
      ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.();
      try {
        if (act === 'filter') renderCards(card.dataset.source, rowsStore(card.dataset.source), {selectedId:card.dataset.id});
        else if (act === 'edit') await editItem(card);
        else if (act === 'delete') await deleteItem(card);
        else if (act === 'to-orders') await moveInventory(card, 'orders');
        else if (act === 'to-master') await moveInventory(card, 'master_order');
        else if (act === 'ship') await shipItem(card);
      } catch(e) { YX.toast(e.message || '操作失敗', 'error'); }
    }, true);
  }
  function wrapSelectCustomer(){
    const old = window.selectCustomerForModule;
    if (typeof old === 'function' && !old.__yx112ProductWrapped) {
      const wrapped = async function(name, ...args){
        const ret = await old.call(this, name, ...args);
        try { await refreshCurrent(); } catch(_e) {}
        return ret;
      };
      wrapped.__yx112ProductWrapped = true;
      window.selectCustomerForModule = wrapped;
    }
  }
  function wrapBatchMaterial(){
    const old = window.applyBatchMaterial || window.batchApplyMaterial;
    if (typeof old === 'function' && !old.__yx112Wrapped) {
      const wrapped = async function(...args){
        const ret = await old.apply(this, args);
        try { await refreshCurrent(); } catch(_e) {}
        return ret;
      };
      wrapped.__yx112Wrapped = true;
      if (window.applyBatchMaterial) window.applyBatchMaterial = wrapped;
      if (window.batchApplyMaterial) window.batchApplyMaterial = wrapped;
    }
  }
  function install(){
    const source = sourceFromModule();
    if (!source) return;
    document.documentElement.dataset.yx112Products = 'locked';
    bindEvents();
    wrapSelectCustomer();
    wrapBatchMaterial();
    // 不刪原本統整表；只把下方小卡硬鎖成單一動作卡，避免舊卡跳來跳去。
    loadSource(source).catch(e => YX.toast(e.message || `${label(source)}載入失敗`, 'error'));
    [400, 1200, 2500].forEach(ms => setTimeout(() => { wrapSelectCustomer(); wrapBatchMaterial(); }, ms));
  }
  YX.register('product_actions', {install, loadSource, refreshCurrent});
})();
