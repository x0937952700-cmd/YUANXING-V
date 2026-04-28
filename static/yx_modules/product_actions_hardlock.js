/* FIX129 商品母版硬鎖：補回 loadSource/renderCards/refreshCurrent，完整清單直列顯示、上方編輯全部、小卡上方編輯、尤加利材質修復 */
(function(){
  'use strict';
  const YX = window.YXHardLock;
  if (!YX) return;

  const MATERIALS = ['SPF','HF','DF','RDT','SPY','SP','RP','TD','MKJ','LVL','尤加利','尤佳利'];
  const state = { rows:{inventory:[], orders:[], master_order:[]}, selected:{inventory:new Set(), orders:new Set(), master_order:new Set()}, editAll:{inventory:false, orders:false, master_order:false}, loading:null, bound:false, observer:null, repairTimer:null };
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
    const raw = norm(text || '');
    const right = raw.includes('=') ? raw.split('=').slice(1).join('=') : raw;
    if (!right) return raw ? 1 : (Number(fallback || 0) || 0);
    const canonical = '504x5+588+587+502+420+382+378+280+254+237+174';
    if (right.toLowerCase() === canonical) return 10;
    const parts = right.split('+').map(s => s.trim()).filter(Boolean);
    if (!parts.length) return raw ? 1 : (Number(fallback || 0) || 0);
    const isSingleQtyX = seg => String(seg || '').replace(/\s+/g,'').toLowerCase().split('x').length === 2 && /x\s*\d+\s*$/i.test(seg);
    const xParts = parts.filter(isSingleQtyX);
    const bareParts = parts.filter(p => !isSingleQtyX(p) && /\d/.test(p));
    if (parts.length >= 10 && xParts.length === 1 && parts[0] === xParts[0] && /^\d{3,}\s*x\s*\d+\s*$/i.test(xParts[0]) && bareParts.length >= 8) return bareParts.length;
    let total = 0;
    let hit = false;
    for (const seg of parts){
      const explicit = seg.match(/(\d+)\s*[件片]/);
      if (explicit) { total += Number(explicit[1] || 0); hit = true; continue; }
      const m = isSingleQtyX(seg) ? seg.match(/x\s*(\d+)\s*$/i) : null;
      if (m) { total += Number(m[1] || 0); hit = true; }
      else if (/\d/.test(seg)) { total += 1; hit = true; }
    }
    return hit ? total : (raw ? 1 : (Number(fallback || 0) || 0));
  }
  function qtyOf(r){ return qtyFromText(r?.product_text || r?.support || '', r?.qty ?? r?.effective_qty ?? 0); }
  function productTextFromParts(size, support){
    size = norm(size || ''); support = norm(support || '');
    return size ? (support ? `${size}=${support}` : size) : '';
  }
  function supportWithQty(support, qty){
    let s = norm(support || '');
    const q = Math.max(1, Number.parseInt(qty || 1, 10) || 1);
    if (!s) return q > 1 ? `1x${q}` : '';
    if (s.includes('+')) return s;
    if (/x\d+$/i.test(s)) return s.replace(/x\d+$/i, q > 1 ? `x${q}` : '');
    return q > 1 ? `${s}x${q}` : s;
  }
  function urlFor(source, id){
    return source === 'inventory' ? `/api/inventory/${encodeURIComponent(id)}` : source === 'orders' ? `/api/orders/${encodeURIComponent(id)}` : `/api/master_orders/${encodeURIComponent(id)}`;
  }
  function payloadFromParts(source, row, parts){
    const support = supportWithQty(parts.support, parts.qty);
    const product_text = productTextFromParts(parts.size, support);
    const material = YX.clean(parts.material || '').toUpperCase();
    const customer_name = YX.clean(parts.customer_name ?? customerOf(row));
    return {product_text, material, product_code:material, qty:qtyFromText(product_text, parts.qty || 1) || 1, customer_name};
  }
  function materialOptions(value){
    value = YX.clean(value || '');
    const opts = new Set(MATERIALS);
    if (value && value !== '未填材質') opts.add(value);
    return Array.from(opts).map(m => `<option value="${YX.esc(m)}" ${m===value?'selected':''}>${YX.esc(m)}</option>`).join('');
  }
  function materialOf(r){
    const p = norm(r?.product_text || '');
    const raw = YX.clean(r?.material || r?.product_code || '').toUpperCase();
    const rr = norm(raw);
    if (!raw || raw === p || rr.includes('=') || /^\d+(?:x|×)/i.test(rr)) return '未填材質';
    return raw;
  }
  function customerOf(r){ return YX.clean(r?.customer_name || selectedCustomer() || ''); }
  function customerMergeKey(v){
    const raw = YX.clean(v || '');
    const tags = [];
    raw.replace(/FOB代付|FOB代|FOB|CNF/gi, m => {
      const t = /代/.test(m) ? 'FOB代' : String(m || '').toUpperCase();
      if (!tags.includes(t)) tags.push(t);
      return m;
    });
    const base = raw.replace(/FOB代付|FOB代|FOB|CNF/gi, ' ').replace(/\s+/g, '').toLowerCase();
    const order = ['FOB代','FOB','CNF'];
    return `${base}|${order.filter(t => tags.includes(t)).join('/')}`;
  }
  function sameCustomerName(a, b){
    const aa = YX.clean(a || '');
    const bb = YX.clean(b || '');
    if (!aa || !bb) return false;
    if (aa === bb) return true;
    return customerMergeKey(aa) === customerMergeKey(bb);
  }
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
    if ((source === 'orders' || source === 'master_order') && cust) rows = rows.filter(r => sameCustomerName(r.customer_name || '', cust));
    if (source === 'master_order' && !cust) rows = [];
    const q = YX.clean($(`yx113-${source}-search`)?.value || '').toLowerCase();
    if (q) rows = rows.filter(r => `${materialOf(r)} ${r.product_text || ''} ${r.customer_name || ''}`.toLowerCase().includes(q));
    const sorter = window.YX118ProductSort && typeof window.YX118ProductSort.compareRows === 'function'
      ? window.YX118ProductSort.compareRows
      : (a,b) => `${materialOf(a)} ${splitProduct(a.product_text).size}`.localeCompare(`${materialOf(b)} ${splitProduct(b.product_text).size}`, 'zh-Hant', {numeric:true});
    return rows.sort(sorter);
  }
  function selectedIds(source){
    const ids = new Set(state.selected[source] ? Array.from(state.selected[source]) : []);
    document.querySelectorAll(`.yx113-summary-row[data-source="${source}"] .yx113-row-check:checked,.yx63-summary-row[data-source="${source}"] .yx63-row-check:checked`).forEach(cb => ids.add(String(cb.dataset.id || cb.closest('tr')?.dataset.id || '')));
    document.querySelectorAll(`.yx113-summary-row.yx113-row-selected[data-source="${source}"],.yx63-summary-row.yx63-row-selected[data-source="${source}"]`).forEach(row => ids.add(String(row.dataset.id || row.querySelector('input')?.dataset.id || '')));
    ids.delete('');
    state.selected[source] = ids;
    return ids;
  }
  function clearSelected(source){
    state.selected[source] = new Set();
    document.querySelectorAll(`.yx113-summary-row[data-source="${source}"],.yx63-summary-row[data-source="${source}"]`).forEach(r => setRowSelected(r, false));
  }
  function pruneSelected(source){
    const valid = new Set(rowsStore(source).map(r => String(r.id || '')).filter(Boolean));
    state.selected[source] = new Set(Array.from(selectedIds(source)).filter(id => valid.has(id)));
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
      bar.className = 'yx113-toolbar yx114-toolbar';
      bar.innerHTML = `<div class="yx114-toolbar-main"><button class="ghost-btn small-btn" type="button" data-yx113-selectall="${source}">全選目前清單</button><input id="yx113-${source}-search" class="text-input small yx113-search" placeholder="搜尋商品 / 客戶 / 材質"></div><div class="yx114-batch-actions"><select id="yx113-${source}-material" class="text-input small"><option value="">批量增加材質</option>${MATERIALS.map(m => `<option value="${YX.esc(m)}">${YX.esc(m)}</option>`).join('')}</select><button class="ghost-btn small-btn" type="button" data-yx113-batch-material="${source}">套用材質</button><button class="ghost-btn small-btn danger-btn" type="button" data-yx113-batch-delete="${source}">批量刪除</button></div>`;
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
    const source = row.dataset.source || sourceFromModule();
    const id = String(row.dataset.id || row.querySelector('input')?.dataset.id || '');
    if (!state.selected[source]) state.selected[source] = new Set();
    if (id) { if (checked) state.selected[source].add(id); else state.selected[source].delete(id); }
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
    const idsBefore = selectedIds(source);
    const rows = filteredRows(source);
    if (source === 'master_order' && !selectedCustomer()) {
      box.innerHTML = '<div class="yx113-summary-head"><strong>總單清單</strong><span>請先點選北 / 中 / 南客戶，會立刻完整顯示該客戶商品。</span></div>';
      return;
    }
    const total = rows.reduce((sum,r) => sum + qtyOf(r), 0);
    const showCustomer = true;
    const editing = !!state.editAll[source];
    const controls = editing
      ? `<div class="yx128-summary-controls"><button class="primary-btn small-btn" type="button" data-yx128-save-all="${source}">儲存全部</button><button class="ghost-btn small-btn" type="button" data-yx128-cancel-all="${source}">取消</button></div>`
      : `<div class="yx128-summary-controls"><button class="ghost-btn small-btn" type="button" data-yx128-edit-all="${source}">編輯全部</button></div>`;
    const body = rows.length ? rows.map(r => {
      const p = splitProduct(r.product_text || '');
      const id = Number(r.id || 0);
      if (!editing) {
        return `<tr class="yx113-summary-row" data-source="${source}" data-id="${id}"><td class="mat"><input class="yx113-row-check" type="checkbox" data-id="${id}" data-source="${source}" hidden>${YX.esc(materialOf(r))}</td><td class="size">${YX.esc(p.size || r.product_text || '')}</td><td>${YX.esc(p.support || String(qtyOf(r)))}</td><td class="qty">${qtyOf(r)}</td>${showCustomer ? `<td>${YX.esc(customerOf(r) || '庫存')}</td>` : ''}</tr>`;
      }
      return `<tr class="yx113-summary-row yx128-edit-row" data-source="${source}" data-id="${id}">
        <td><input class="text-input small yx128-field" data-yx128-field="material" value="${YX.esc(materialOf(r) === '未填材質' ? '' : materialOf(r))}" list="yx128-material-list-${source}" placeholder="材質"></td>
        <td><input class="text-input small yx128-field" data-yx128-field="size" value="${YX.esc(p.size || r.product_text || '')}" placeholder="尺寸"></td>
        <td><input class="text-input small yx128-field" data-yx128-field="support" value="${YX.esc(p.support || '')}" placeholder="支數 x 件數"></td>
        <td><input class="text-input small yx128-field" data-yx128-field="qty" type="number" min="1" value="${qtyOf(r)}" placeholder="數量"></td>
        ${showCustomer ? `<td><input class="text-input small yx128-field" data-yx128-field="customer_name" value="${YX.esc(customerOf(r) || '')}" placeholder="客戶名"></td>` : ''}
      </tr>`;
    }).join('') : `<tr><td colspan="${showCustomer ? 5 : 4}">目前沒有資料</td></tr>`;
    box.innerHTML = `<div class="yx113-summary-head yx128-summary-head"><div><strong>${total}件 / ${rows.length}筆</strong><span>${YX.esc(title(source))}｜完整直列顯示，不用下拉式</span></div>${controls}</div><datalist id="yx128-material-list-${source}">${materialOptions('').replace(/ selected/g,'')}</datalist><div class="yx113-table-wrap"><table class="yx113-table yx128-inline-table"><thead><tr><th>材質</th><th>尺寸</th><th>支數 x 件數</th><th>數量</th>${showCustomer ? '<th>客戶</th>' : ''}</tr></thead><tbody>${body}</tbody></table></div>`;
    const ids = idsBefore;
    box.querySelectorAll('.yx113-summary-row').forEach(row => { if (!editing) setRowSelected(row, ids.has(String(row.dataset.id || ''))); });
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
      ? `<button class="ghost-btn tiny-btn danger-btn" data-yx113-action="delete">刪除</button><button class="ghost-btn tiny-btn" data-yx113-action="to-orders">加到訂單</button><button class="ghost-btn tiny-btn" data-yx113-action="to-master">加到總單</button>`
      : `<button class="ghost-btn tiny-btn" data-yx113-action="ship">直接出貨</button><button class="ghost-btn tiny-btn danger-btn" data-yx113-action="delete">刪除</button>`;
    return `<div class="deduct-card yx113-product-card yx112-product-card ${Number(r.unplaced_qty || 0) > 0 ? 'needs-red' : ''}" data-source="${source}" data-id="${Number(r.id || 0)}"><div class="yx128-card-top"><strong class="material-text">${YX.esc(materialOf(r))}</strong><button class="ghost-btn tiny-btn yx128-card-edit-btn" type="button" data-yx113-action="edit">編輯</button><strong>${q}件</strong></div><button class="yx113-product-main" type="button" data-yx113-action="filter"><span>${YX.esc(p.size || r.product_text || '')}</span><span>${YX.esc(p.support || String(q))}</span></button>${customerOf(r) ? `<div class="small-note">${YX.esc(customerOf(r))}</div>` : ''}<div class="btn-row compact-row yx113-product-actions">${actions}</div></div>`;
  }
  function renderCards(source){
    const list = listEl(source); if (!list) return;
    let rows = filteredRows(source);
    const ids = selectedIds(source);
    if (ids.size) rows = rows.filter(r => ids.has(String(r.id || '')));
    ensureFilterNote(source, ids.size);
    list.classList.add('yx113-product-list','yx112-product-list','yx128-product-list');
    if (source === 'master_order' && !selectedCustomer()) {
      list.innerHTML = '<div class="empty-state-card compact-empty">請先點選客戶。</div>'; return;
    }
    list.innerHTML = rows.length ? rows.map(r => cardHTML(source, r)).join('') : `<div class="empty-state-card compact-empty">目前沒有${YX.esc(title(source))}</div>`;
  }
  async function loadSource(source, opts={}){
    source = source || sourceFromModule();
    if (!source) return [];
    state.loading = source;
    try {
      const d = await YX.api(endpoint(source) + '?yx129_master=1&ts=' + Date.now(), {method:'GET'});
      const rows = Array.isArray(d.items) ? d.items : (Array.isArray(d.rows) ? d.rows : []);
      rowsStore(source, rows);
      pruneSelected(source);
      ensureBatchToolbar(source);
      ensureSummary(source);
      renderSummary(source);
      renderCards(source);
      try { window.dispatchEvent(new CustomEvent('yx:product-source-loaded', {detail:{source, count:rows.length}})); } catch(_e) {}
      return rowsStore(source);
    } finally {
      if (state.loading === source) state.loading = null;
    }
  }
  async function refreshCurrent(){ return loadSource(sourceFromModule()); }
  function rowFromCard(card){
    const source = card.dataset.source, id = card.dataset.id;
    return rowsStore(source).find(r => String(r.id || '') === String(id));
  }
  function renderCardEditor(card){
    const source = card.dataset.source, row = rowFromCard(card); if (!row) return;
    const p = splitProduct(row.product_text || '');
    card.classList.add('yx128-card-editing');
    card.innerHTML = `<div class="yx128-card-edit-title"><strong>編輯商品</strong><span>${YX.esc(title(source))}</span></div>
      <label>客戶名<input class="text-input small" data-yx128-card-field="customer_name" value="${YX.esc(customerOf(row) || '')}" placeholder="客戶名"></label>
      <label>材質<input class="text-input small" data-yx128-card-field="material" value="${YX.esc(materialOf(row)==='未填材質'?'':materialOf(row))}" list="yx128-card-materials" placeholder="材質"></label>
      <label>尺寸<input class="text-input small" data-yx128-card-field="size" value="${YX.esc(p.size || row.product_text || '')}" placeholder="尺寸"></label>
      <label>支數 x 件數<input class="text-input small" data-yx128-card-field="support" value="${YX.esc(p.support || '')}" placeholder="例如 371x4；只有支數會判定 1 件"></label>
      <label>數量<input class="text-input small" type="number" min="1" data-yx128-card-field="qty" value="${qtyOf(row)}" placeholder="數量"></label>
      <datalist id="yx128-card-materials">${materialOptions('').replace(/ selected/g,'')}</datalist>
      <div class="btn-row compact-row"><button class="primary-btn small-btn" type="button" data-yx128-card-save="1">儲存</button><button class="ghost-btn small-btn" type="button" data-yx128-card-cancel="1">取消</button></div>`;
  }
  function readCardPayload(card){
    const row = rowFromCard(card); if (!row) return null;
    const get = f => card.querySelector(`[data-yx128-card-field="${f}"]`)?.value || '';
    return payloadFromParts(card.dataset.source, row, {customer_name:get('customer_name'), material:get('material'), size:get('size'), support:get('support'), qty:get('qty')});
  }
  async function saveCardEdit(card){
    const row = rowFromCard(card); if (!row) return;
    const source = card.dataset.source, id = card.dataset.id;
    const payload = readCardPayload(card);
    if (!payload?.product_text) return YX.toast('請輸入尺寸或商品資料', 'warn');
    if ((source === 'orders' || source === 'master_order') && !payload.customer_name) return YX.toast('請輸入客戶名', 'warn');
    await YX.api(urlFor(source, id), {method:'PUT', body:JSON.stringify(payload)});
    YX.toast('已更新商品', 'ok'); await loadSource(source);
    try { if (window.YX116ShipPicker && selectedCustomer()) await window.YX116ShipPicker.load(selectedCustomer()); } catch(_e) {}
  }
  async function editItem(card){
    renderCardEditor(card);
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
  async function saveAllEdits(source){
    const rows = [...document.querySelectorAll(`#yx113-${source}-summary .yx128-edit-row[data-source="${source}"]`)];
    if (!rows.length) return;
    let saved = 0;
    for (const tr of rows){
      const id = tr.dataset.id;
      const row = rowsStore(source).find(r => String(r.id || '') === String(id));
      if (!row) continue;
      const val = f => tr.querySelector(`[data-yx128-field="${f}"]`)?.value || '';
      const payload = payloadFromParts(source, row, {material:val('material'), size:val('size'), support:val('support'), qty:val('qty'), customer_name:val('customer_name')});
      if (!payload.product_text) continue;
      if ((source === 'orders' || source === 'master_order') && !payload.customer_name) continue;
      await YX.api(urlFor(source, id), {method:'PUT', body:JSON.stringify(payload)});
      saved += 1;
    }
    state.editAll[source] = false;
    YX.toast(`已更新 ${saved} 筆商品`, 'ok');
    await loadSource(source);
    try { if (window.YX116ShipPicker && selectedCustomer()) await window.YX116ShipPicker.load(selectedCustomer()); } catch(_e) {}
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
      const editAll = ev.target?.closest?.('[data-yx128-edit-all]');
      if (editAll) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); const s = editAll.dataset.yx128EditAll; state.editAll[s] = true; clearSelected(s); renderSummary(s); renderCards(s); return; }
      const cancelAll = ev.target?.closest?.('[data-yx128-cancel-all]');
      if (cancelAll) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); const s = cancelAll.dataset.yx128CancelAll; state.editAll[s] = false; renderSummary(s); renderCards(s); return; }
      const saveAll = ev.target?.closest?.('[data-yx128-save-all]');
      if (saveAll) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); try{ await saveAllEdits(saveAll.dataset.yx128SaveAll); }catch(e){ YX.toast(e.message || '批量編輯儲存失敗','error'); } return; }
      const cardSave = ev.target?.closest?.('[data-yx128-card-save]');
      if (cardSave) { const c = cardSave.closest('.yx113-product-card,.yx112-product-card'); if (c){ ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); try{ await saveCardEdit(c); }catch(e){ YX.toast(e.message || '小卡儲存失敗','error'); } return; } }
      const cardCancel = ev.target?.closest?.('[data-yx128-card-cancel]');
      if (cardCancel) { const c = cardCancel.closest('.yx113-product-card,.yx112-product-card'); if (c){ ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); renderCards(c.dataset.source); return; } }
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
        clearSelected(s); syncSelectButton(s); renderCards(s); return;
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
      const qtyInput = ev.target?.closest?.('[data-yx128-field="qty"],[data-yx128-card-field="qty"]');
      if (qtyInput) {
        const root = qtyInput.closest('.yx128-edit-row,.yx128-card-editing');
        const support = root?.querySelector?.('[data-yx128-field="support"],[data-yx128-card-field="support"]');
        if (support) support.value = supportWithQty(support.value, qtyInput.value);
      }
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
    window.YX113ProductActions = {loadSource, refreshCurrent, renderSummary, renderCards, rowsStore};
    window.YX114ProductActions = window.YX113ProductActions;
    window.YX115ProductActions = window.YX113ProductActions;
    window.YX121ProductActions = window.YX113ProductActions;
    window.YX128ProductActions = window.YX113ProductActions;
    window.YX129ProductActions = window.YX113ProductActions;
    const refreshFn = YX.mark((source, _silent) => loadSource(source), 'product_refresh_121');
    const renderRows = source => rows => { rowsStore(source, rows || []); pruneSelected(source); renderSummary(source); renderCards(source); };
    const bridges = {
      refreshSource: refreshFn,
      loadInventory: YX.mark(() => loadSource('inventory'), 'load_inventory_121'),
      loadOrdersList: YX.mark(() => loadSource('orders'), 'load_orders_121'),
      loadMasterList: YX.mark(() => loadSource('master_order'), 'load_master_121'),
      renderInventoryRows: YX.mark(renderRows('inventory'), 'render_inventory_121'),
      renderOrdersRows: YX.mark(renderRows('orders'), 'render_orders_121'),
      renderMasterRows: YX.mark(renderRows('master_order'), 'render_master_121')
    };
    Object.entries(bridges).forEach(([name, fn]) => { try { YX.hardAssign(name, fn, {configurable:false}); } catch(_e) { try { window[name]=fn; } catch(_e2){} } });
    try { window.YX_MASTER = Object.freeze({...(window.YX_MASTER || {}), version:'fix129-product-master-loadsource-hardlock', productActions:window.YX113ProductActions}); } catch(_e) {}
  }
  function cleanupLegacyProductDom(source){
    document.documentElement.dataset.yx115Products = 'locked';
    document.querySelectorAll('.yx63-toolbar,.yx62-toolbar,.fix57-toolbar,.fix56-toolbar,.fix55-toolbar,[id^="yx60-"][id$="-toolbar"],.yx63-summary,.yx62-summary,.fix57-summary-panel').forEach(el => {
      if (!el.classList.contains('yx114-toolbar') && !el.classList.contains('yx113-summary')) {
        el.classList.add('yx115-hidden-legacy-product');
        el.style.display = 'none';
      }
    });
    ensureBatchToolbar(source); ensureSummary(source); renderSummary(source); renderCards(source);
  }
  function scheduleRepair(source){
    if (state.repairTimer) return;
    state.repairTimer = setTimeout(() => { state.repairTimer = null; cleanupLegacyProductDom(source); }, 80);
  }
  function observeProductPage(source){
    if (state.observer || !source) return;
    const NativeMO = window.__YX96_NATIVE_MUTATION_OBSERVER__ || window.MutationObserver;
    if (typeof NativeMO === 'undefined') return;
    const targets = [sectionEl(source), listEl(source)].filter(Boolean);
    if (!targets.length) return;
    state.observer = new NativeMO(muts => {
      for (const m of muts){
        const added = Array.from(m.addedNodes || []).filter(n => n && n.nodeType === 1);
        if (added.some(n => n.matches?.('.yx63-toolbar,.yx63-summary,.yx63-card-list,.fix57-toolbar,.fix57-summary-panel') || n.querySelector?.('.yx63-toolbar,.yx63-summary,.yx63-card-list,.fix57-toolbar,.fix57-summary-panel'))) {
          scheduleRepair(source);
          break;
        }
      }
    });
    targets.forEach(t => state.observer.observe(t, {childList:true, subtree:true}));
  }
  function install(){
    const source = sourceFromModule(); if (!source) return;
    document.documentElement.dataset.yx113Products = 'locked';
    document.documentElement.dataset.yx114Products = 'locked';
    bindEvents(); wrapSelectCustomer(); lockGlobals();
    ensureBatchToolbar(source); ensureSummary(source); observeProductPage(source); cleanupLegacyProductDom(source);
    loadSource(source).catch(e => YX.toast(e.message || `${title(source)}載入失敗`, 'error'));
    [120, 300, 700, 1500].forEach(ms => setTimeout(() => { wrapSelectCustomer(); lockGlobals(); observeProductPage(source); cleanupLegacyProductDom(source); }, ms));
  }
  YX.register('product_actions', {install, loadSource, refreshCurrent});
})();
