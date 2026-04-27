/* FIX113 商品母版硬鎖：庫存 / 訂單 / 總單統整表、批量材質/刪除、小卡篩選與動作固定 */
(function(){
  'use strict';
  const YX = window.YXHardLock;
  if (!YX) return;

  const MATERIALS = ['SPF','HF','DF','RDT','SPY','SP','RP','TD','MKJ','LVL'];
  const state = { rows:{inventory:[], orders:[], master_order:[]}, loading:null, bound:false };
  const $ = id => document.getElementById(id);
  const norm = v => YX.clean(v).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/\s+/g,'');
  const sourceFromModule = () => {
    const m = YX.moduleKey();
    return m === 'inventory' ? 'inventory' : m === 'orders' ? 'orders' : m === 'master_order' ? 'master_order' : '';
  };
  const apiSource = s => s === 'master_order' ? 'master_orders' : s;
  const endpoint = s => s === 'inventory' ? '/api/inventory' : s === 'orders' ? '/api/orders' : '/api/master_orders';
  const title = s => s === 'inventory' ? '庫存清單' : s === 'orders' ? '訂單清單' : '總單清單';
  const listEl = s => s === 'inventory' ? $('inventory-inline-list') : s === 'orders' ? $('orders-list') : $('master-list');
  const sectionEl = s => s === 'inventory' ? ($('inventory-inline-panel') || listEl(s)?.closest('.panel,.result-card,.subsection')) : s === 'orders' ? $('orders-list-section') : $('master-list-section');
  const selectedCustomer = () => YX.clean($('customer-name')?.value || window.__YX_SELECTED_CUSTOMER__ || '');

  function splitProduct(text){
    const raw = norm(text || '');
    const i = raw.indexOf('=');
    return {size:i >= 0 ? raw.slice(0,i) : raw, support:i >= 0 ? raw.slice(i+1) : ''};
  }
  function qtyFromText(text, fallback){
    const right = norm(text || '').split('=').slice(1).join('=') || norm(text || '');
    if (!right) return Number(fallback || 0) || 0;
    if (right.toLowerCase() === '504x5+588+587+502+420+382+378+280+254+237+174') return 10;
    const parts = right.split('+').map(s => s.trim()).filter(Boolean);
    if (!parts.length) return Number(fallback || 0) || 0;
    let total = 0;
    for (const seg of parts){
      const m = seg.match(/x\s*(\d+)$/i);
      if (m) total += Number(m[1] || 0);
      else if (/\d/.test(seg)) total += 1;
    }
    return total || Number(fallback || 0) || 0;
  }
  function qtyOf(r){ return qtyFromText(r?.product_text || r?.support || '', r?.qty ?? r?.effective_qty ?? 0); }
  function materialOf(r){
    const p = norm(r?.product_text || '');
    const raw = YX.clean(r?.material || r?.product_code || '').toUpperCase();
    const rr = norm(raw);
    if (!raw || raw === p || rr.includes('=') || /^\d+(?:x|×)/i.test(rr)) return '未填材質';
    return raw;
  }
  function customerOf(r){ return YX.clean(r?.customer_name || selectedCustomer() || ''); }
  function rowsStore(source, rows){
    window.__YX112_ROWS__ = window.__YX112_ROWS__ || {};
    window.__yx63Rows = window.__yx63Rows || {};
    if (Array.isArray(rows)) {
      state.rows[source] = rows;
      window.__YX112_ROWS__[source] = rows;
      window.__yx63Rows[source] = rows;
    }
    return state.rows[source] || window.__YX112_ROWS__[source] || window.__yx63Rows[source] || [];
  }
  function filteredRows(source){
    let rows = [...rowsStore(source)];
    const cust = selectedCustomer();
    if ((source === 'orders' || source === 'master_order') && cust) rows = rows.filter(r => YX.clean(r.customer_name || '') === cust);
    if (source === 'master_order' && !cust) rows = [];
    const q = YX.clean($(`yx113-${source}-search`)?.value || '').toLowerCase();
    if (q) rows = rows.filter(r => `${materialOf(r)} ${r.product_text || ''} ${r.customer_name || ''}`.toLowerCase().includes(q));
    return rows.sort((a,b) => `${materialOf(a)} ${splitProduct(a.product_text).size}`.localeCompare(`${materialOf(b)} ${splitProduct(b.product_text).size}`, 'zh-Hant', {numeric:true}));
  }
  function selectedIds(source){
    const ids = new Set();
    document.querySelectorAll(`.yx113-summary-row[data-source="${source}"] .yx113-row-check:checked,.yx63-summary-row[data-source="${source}"] .yx63-row-check:checked`).forEach(cb => ids.add(String(cb.dataset.id || cb.closest('tr')?.dataset.id || '')));
    document.querySelectorAll(`.yx113-summary-row.yx113-row-selected[data-source="${source}"],.yx63-summary-row.yx63-row-selected[data-source="${source}"]`).forEach(row => ids.add(String(row.dataset.id || row.querySelector('input')?.dataset.id || '')));
    ids.delete('');
    return ids;
  }
  function selectedItems(source){
    const ids = selectedIds(source);
    return [...ids].map(id => ({source:apiSource(source), id:Number(id)})).filter(x => x.id > 0);
  }
  function ensureBatchToolbar(source){
    const sec = sectionEl(source); if (!sec) return null;
    let bar = $(`yx113-${source}-toolbar`);
    if (!bar) {
      bar = document.createElement('div');
      bar.id = `yx113-${source}-toolbar`;
      bar.className = 'yx113-toolbar';
      bar.innerHTML = `<button class="ghost-btn small-btn" type="button" data-yx113-selectall="${source}">全選目前清單</button><input id="yx113-${source}-search" class="text-input small" placeholder="搜尋商品 / 客戶 / 材質"><select id="yx113-${source}-material" class="text-input small"><option value="">批量增加材質</option>${MATERIALS.map(m => `<option value="${YX.esc(m)}">${YX.esc(m)}</option>`).join('')}</select><button class="ghost-btn small-btn" type="button" data-yx113-batch-material="${source}">套用材質</button><button class="ghost-btn small-btn danger-btn" type="button" data-yx113-batch-delete="${source}">批量刪除</button>`;
      const head = sec.querySelector('.section-head,.inventory-inline-head') || sec.firstElementChild || sec;
      head.insertAdjacentElement('afterend', bar);
      $(`yx113-${source}-search`)?.addEventListener('input', () => { renderSummary(source); renderCards(source); });
    }
    return bar;
  }
  function ensureSummary(source){
    const sec = sectionEl(source); if (!sec) return null;
    ensureBatchToolbar(source);
    let box = $(`yx113-${source}-summary`);
    if (!box) {
      box = document.createElement('div');
      box.id = `yx113-${source}-summary`;
      box.className = 'yx113-summary table-card';
      const list = listEl(source);
      if (list) list.insertAdjacentElement('beforebegin', box); else sec.appendChild(box);
    }
    return box;
  }
  function setRowSelected(row, checked){
    if (!row) return;
    const cb = row.querySelector('input[type="checkbox"]');
    if (cb) cb.checked = !!checked;
    row.classList.toggle('yx113-row-selected', !!checked);
  }
  function syncSelectButton(source){
    const btn = document.querySelector(`[data-yx113-selectall="${source}"]`);
    if (!btn) return;
    const count = selectedIds(source).size;
    btn.textContent = count ? `已選 ${count} 筆｜清除/全選` : '全選目前清單';
  }
  function renderSummary(source){
    const box = ensureSummary(source); if (!box) return;
    const rows = filteredRows(source);
    if (source === 'master_order' && !selectedCustomer()) {
      box.innerHTML = '<div class="yx113-summary-head"><strong>總單清單</strong><span>請先點選北 / 中 / 南客戶，會立刻顯示該客戶商品。</span></div>';
      return;
    }
    const total = rows.reduce((sum,r) => sum + qtyOf(r), 0);
    const showCustomer = source === 'inventory';
    box.innerHTML = `<div class="yx113-summary-head"><strong>${total}件 / ${rows.length}筆</strong><span>${YX.esc(title(source))}</span></div><div class="yx113-table-wrap"><table class="yx113-table"><thead><tr><th>材質</th><th>尺寸</th><th>支數 x 件數</th><th>數量</th>${showCustomer ? '<th>客戶</th>' : ''}</tr></thead><tbody>${rows.length ? rows.map(r => { const p = splitProduct(r.product_text || ''); return `<tr class="yx113-summary-row" data-source="${source}" data-id="${Number(r.id || 0)}"><td class="mat"><input class="yx113-row-check" type="checkbox" data-id="${Number(r.id || 0)}" data-source="${source}" hidden>${YX.esc(materialOf(r))}</td><td class="size">${YX.esc(p.size || r.product_text || '')}</td><td>${YX.esc(p.support || String(qtyOf(r)))}</td><td class="qty">${qtyOf(r)}</td>${showCustomer ? `<td>${YX.esc(customerOf(r) || '庫存')}</td>` : ''}</tr>`; }).join('') : `<tr><td colspan="${showCustomer ? 5 : 4}">目前沒有資料</td></tr>`}</tbody></table></div>`;
    const ids = selectedIds(source);
    box.querySelectorAll('.yx113-summary-row').forEach(row => setRowSelected(row, ids.has(String(row.dataset.id || ''))));
    syncSelectButton(source);
  }
  function ensureFilterNote(source, n){
    let note = $(`yx113-${source}-filter-note`);
    if (!n) { note?.remove(); return; }
    if (!note) {
      note = document.createElement('div');
      note.id = `yx113-${source}-filter-note`;
      note.className = 'yx113-filter-note';
      listEl(source)?.insertAdjacentElement('beforebegin', note);
    }
    note.innerHTML = `<strong>下方已篩選 ${n} 筆</strong><button class="ghost-btn tiny-btn" type="button" data-yx113-clear-filter="${source}">清除篩選</button>`;
  }
  function cardHTML(source, r){
    const p = splitProduct(r.product_text || '');
    const q = qtyOf(r);
    const actions = source === 'inventory'
      ? `<button class="ghost-btn tiny-btn" data-yx113-action="edit">編輯</button><button class="ghost-btn tiny-btn danger-btn" data-yx113-action="delete">刪除</button><button class="ghost-btn tiny-btn" data-yx113-action="to-orders">加到訂單</button><button class="ghost-btn tiny-btn" data-yx113-action="to-master">加到總單</button>`
      : `<button class="ghost-btn tiny-btn" data-yx113-action="edit">編輯</button><button class="ghost-btn tiny-btn" data-yx113-action="ship">直接出貨</button><button class="ghost-btn tiny-btn danger-btn" data-yx113-action="delete">刪除</button>`;
    return `<div class="deduct-card yx113-product-card yx112-product-card ${Number(r.unplaced_qty || 0) > 0 ? 'needs-red' : ''}" data-source="${source}" data-id="${Number(r.id || 0)}"><div class="yx113-product-head"><strong class="material-text">${YX.esc(materialOf(r))}</strong><strong>${q}件</strong></div><button class="yx113-product-main" type="button" data-yx113-action="filter"><span>${YX.esc(p.size || r.product_text || '')}</span><span>${YX.esc(p.support || String(q))}</span></button>${source !== 'inventory' ? `<div class="small-note">${YX.esc(customerOf(r))}</div>` : ''}<div class="btn-row compact-row yx113-product-actions">${actions}</div></div>`;
  }
  function renderCards(source){
    const list = listEl(source); if (!list) return;
    let rows = filteredRows(source);
    const ids = selectedIds(source);
    if (ids.size) rows = rows.filter(r => ids.has(String(r.id || '')));
    ensureFilterNote(source, ids.size);
    list.classList.add('yx113-product-list','yx112-product-list');
    if (source === 'master_order' && !selectedCustomer()) {
      list.innerHTML = '<div class="empty-state-card compact-empty">請先點選客戶。</div>'; return;
    }
    list.innerHTML = rows.length ? rows.map(r => cardHTML(source, r)).join('') : `<div class="empty-state-card compact-empty">目前沒有${YX.esc(title(source))}</div>`;
  }
  async function loadSource(source, opts={}){
    if (!source) return [];
    const d = await YX.api(endpoint(source) + '?yx113=1&ts=' + Date.now(), {method:'GET'});
    rowsStore(source, Array.isArray(d.items) ? d.items : []);
    renderSummary(source); renderCards(source);
    return rowsStore(source);
  }
  async function refreshCurrent(){ return loadSource(sourceFromModule()); }
  async function editItem(card){
    const source = card.dataset.source, id = card.dataset.id;
    const row = rowsStore(source).find(r => String(r.id || '') === String(id)); if (!row) return;
    const product_text = prompt('商品資料', row.product_text || ''); if (product_text === null) return;
    const material = prompt('材質', materialOf(row) === '未填材質' ? '' : materialOf(row)); if (material === null) return;
    const qty = prompt('數量', String(row.qty ?? qtyOf(row))); if (qty === null) return;
    const url = source === 'inventory' ? `/api/inventory/${encodeURIComponent(id)}` : source === 'orders' ? `/api/orders/${encodeURIComponent(id)}` : `/api/master_orders/${encodeURIComponent(id)}`;
    await YX.api(url, {method:'PUT', body:JSON.stringify({product_text, material, product_code:material, qty:Number(qty || 0), customer_name:customerOf(row)})});
    YX.toast('已更新商品', 'ok'); await loadSource(source);
  }
  async function deleteItem(card){
    const source = card.dataset.source, id = card.dataset.id;
    if (!confirm(`確定刪除這筆${title(source)}商品？`)) return;
    const url = source === 'inventory' ? `/api/inventory/${encodeURIComponent(id)}` : source === 'orders' ? `/api/orders/${encodeURIComponent(id)}` : `/api/master_orders/${encodeURIComponent(id)}`;
    await YX.api(url, {method:'DELETE'}); YX.toast('已刪除', 'ok'); await loadSource(source);
  }
  async function moveInventory(card, target){
    const id = card.dataset.id;
    let customer = selectedCustomer();
    if (!customer) customer = prompt(`要加入${target === 'orders' ? '訂單' : '總單'}的客戶名稱`) || '';
    customer = YX.clean(customer);
    if (!customer) return YX.toast('請輸入客戶名稱', 'warn');
    await YX.api(`/api/inventory/${encodeURIComponent(id)}/move`, {method:'POST', body:JSON.stringify({target, customer_name:customer})});
    YX.toast(`已加到${target === 'orders' ? '訂單' : '總單'}`, 'ok'); await loadSource('inventory');
  }
  async function shipItem(card){
    const source = card.dataset.source, id = card.dataset.id;
    const row = rowsStore(source).find(r => String(r.id || '') === String(id)); if (!row) return;
    if (!confirm(`直接出貨：${customerOf(row)} ${row.product_text || ''}？`)) return;
    await YX.api('/api/items/transfer', {method:'POST', body:JSON.stringify({source:apiSource(source), id, target:'ship', customer_name:customerOf(row), qty:row.qty || qtyOf(row), allow_inventory_fallback:true})});
    YX.toast('已直接出貨', 'ok'); await loadSource(source);
  }
  async function bulkMaterial(source){
    const material = YX.clean($(`yx113-${source}-material`)?.value || '').toUpperCase();
    if (!material) return YX.toast('請先選擇材質', 'warn');
    const items = selectedItems(source);
    if (!items.length) return YX.toast('請先批量選取要套用材質的商品', 'warn');
    const d = await YX.api('/api/customer-items/batch-material', {method:'POST', body:JSON.stringify({material, items})});
    YX.toast(`已套用材質 ${material}：${d.count || items.length} 筆`, 'ok'); await loadSource(source);
  }
  async function bulkDelete(source){
    const items = selectedItems(source);
    if (!items.length) return YX.toast('請先批量選取要刪除的商品', 'warn');
    if (!confirm(`確定刪除 ${items.length} 筆商品？`)) return;
    const d = await YX.api('/api/customer-items/batch-delete', {method:'POST', body:JSON.stringify({items})});
    YX.toast(`已刪除 ${d.count || items.length} 筆商品`, 'ok'); await loadSource(source);
  }
  function bindEvents(){
    if (state.bound) return; state.bound = true;
    document.addEventListener('click', async ev => {
      const source = sourceFromModule();
      const row = ev.target?.closest?.('.yx113-summary-row[data-source]');
      if (row && !ev.target.closest('button,a,input,select,textarea')) {
        ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.();
        setRowSelected(row, !row.classList.contains('yx113-row-selected'));
        syncSelectButton(row.dataset.source); renderCards(row.dataset.source); return;
      }
      const selectAll = ev.target?.closest?.('[data-yx113-selectall]');
      if (selectAll) {
        ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.();
        const s = selectAll.dataset.yx113Selectall; const rows = [...document.querySelectorAll(`.yx113-summary-row[data-source="${s}"]`)];
        const all = rows.length && rows.every(r => r.classList.contains('yx113-row-selected'));
        rows.forEach(r => setRowSelected(r, !all)); syncSelectButton(s); renderCards(s); return;
      }
      const clear = ev.target?.closest?.('[data-yx113-clear-filter]');
      if (clear) {
        ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.();
        const s = clear.dataset.yx113ClearFilter;
        document.querySelectorAll(`.yx113-summary-row[data-source="${s}"]`).forEach(r => setRowSelected(r, false)); syncSelectButton(s); renderCards(s); return;
      }
      const bm = ev.target?.closest?.('[data-yx113-batch-material]');
      if (bm) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); try{ await bulkMaterial(bm.dataset.yx113BatchMaterial); }catch(e){ YX.toast(e.message || '批量材質失敗','error'); } return; }
      const bd = ev.target?.closest?.('[data-yx113-batch-delete]');
      if (bd) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); try{ await bulkDelete(bd.dataset.yx113BatchDelete); }catch(e){ YX.toast(e.message || '批量刪除失敗','error'); } return; }
      const card = ev.target?.closest?.('.yx113-product-card,.yx112-product-card');
      const act = ev.target?.closest?.('[data-yx113-action],[data-yx112-action]')?.getAttribute('data-yx113-action') || ev.target?.closest?.('[data-yx112-action]')?.getAttribute('data-yx112-action');
      if (!card || !act) return;
      ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.();
      try {
        if (act === 'filter') { document.querySelectorAll(`.yx113-summary-row[data-source="${card.dataset.source}"]`).forEach(r => setRowSelected(r, String(r.dataset.id) === String(card.dataset.id))); syncSelectButton(card.dataset.source); renderCards(card.dataset.source); }
        else if (act === 'edit') await editItem(card);
        else if (act === 'delete') await deleteItem(card);
        else if (act === 'to-orders') await moveInventory(card, 'orders');
        else if (act === 'to-master') await moveInventory(card, 'master_order');
        else if (act === 'ship') await shipItem(card);
      } catch(e) { YX.toast(e.message || '操作失敗', 'error'); }
    }, true);
    document.addEventListener('change', ev => {
      const cb = ev.target?.closest?.('.yx113-row-check,.yx63-row-check');
      if (!cb) return; const s = cb.dataset.source || cb.closest('tr')?.dataset.source || sourceFromModule();
      cb.closest('tr')?.classList.toggle('yx113-row-selected', !!cb.checked); syncSelectButton(s); renderCards(s);
    }, true);
  }
  function wrapSelectCustomer(){
    const old = window.selectCustomerForModule;
    if (typeof old !== 'function' || old.__yx113ProductWrapped) return;
    const wrapped = async function(name, ...args){
      window.__YX_SELECTED_CUSTOMER__ = YX.clean(name || '');
      const input = $('customer-name'); if (input) input.value = window.__YX_SELECTED_CUSTOMER__;
      const ret = await old.call(this, name, ...args);
      try { await refreshCurrent(); } catch(_e) {}
      return ret;
    };
    wrapped.__yx113ProductWrapped = true;
    window.selectCustomerForModule = wrapped;
  }
  function lockGlobals(){
    window.YX113ProductActions = {loadSource, refreshCurrent, renderSummary, renderCards};
    YX.hardAssign('refreshSource', YX.mark((source, _silent) => loadSource(source), 'product_refresh'), {configurable:true});
  }
  function install(){
    const source = sourceFromModule(); if (!source) return;
    document.documentElement.dataset.yx113Products = 'locked';
    bindEvents(); wrapSelectCustomer(); lockGlobals();
    ensureBatchToolbar(source); ensureSummary(source);
    loadSource(source).catch(e => YX.toast(e.message || `${title(source)}載入失敗`, 'error'));
    [200, 700, 1500].forEach(ms => setTimeout(() => { wrapSelectCustomer(); lockGlobals(); renderSummary(source); renderCards(source); }, ms));
  }
  YX.register('product_actions', {install, loadSource, refreshCurrent});
})();
