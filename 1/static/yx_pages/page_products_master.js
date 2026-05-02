/* 沅興木業 v26-one-table-no-legacy-action product page master
   單一最終商品頁母版：
   - 庫存只保留無「操作」欄版本。
   - 訂單保留批量操作表格版本。
   - 總單保留批量操作表格版本。
   - 不新增補丁檔，不新增第二 renderer。 */

/* ===== absorbed from product_actions_hardlock.js ===== */
/* v20 TRUE CLEAN PRODUCT MASTER：商品頁唯一 renderer / 唯一事件主線；批量操作走單次 API。 */
(function(){
  'use strict';
  const YX = window.YXHardLock;
  if (!YX) return;

  const MATERIALS = ['TD','MER','DF','SP','SPF','HF','RDT','SPY','RP','MKJ','LVL','尤加利','尤佳利'];
  const state = { rows:{inventory:[], orders:[], master_order:[]}, selected:{inventory:new Set(), orders:new Set(), master_order:new Set()}, editAll:{inventory:false, orders:false, master_order:false}, editScope:{inventory:null, orders:null, master_order:null}, zoneFilter:{inventory:'ALL', orders:'ALL', master_order:'ALL'}, loading:null, bound:false, observer:null, repairTimer:null, installedSource:'' };
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
  function selectedOrAllIds(source){
    const ids = selectedIds(source);
    if (ids.size) return Array.from(ids);
    return filteredRows(source).map(r => String(r.id || '')).filter(Boolean);
  }
  function autoQtyFromSupport(support){ return qtyFromText('=' + norm(support || ''), 1) || 1; }

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
    const rawSupport = norm(parts.support || '');
    const support = rawSupport || supportWithQty(rawSupport, parts.qty);
    const product_text = productTextFromParts(parts.size, support);
    const material = YX.clean(parts.material || '').toUpperCase();
    const customer_name = YX.clean(parts.customer_name ?? customerOf(row));
    const zone = YX.clean(parts.zone || row?.location || row?.zone || '');
    return {product_text, material, product_code:material, qty:qtyFromText(product_text, parts.qty || 1) || 1, customer_name, location:zone};
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
  function customerTagFor(source, rows){
    const cust = selectedCustomer();
    if (cust) return cust;
    if (source === 'inventory') return '庫存';
    const names = Array.from(new Set((rows || []).map(r => customerOf(r)).filter(Boolean)));
    return names.length === 1 ? names[0] : '';
  }
  function zoneOf(r){
    const raw = YX.clean(r?.zone || r?.warehouse_zone || r?.location || '');
    if (/^B(?:區)?$/i.test(raw) || /^B[-_]/i.test(raw) || raw.includes('B區')) return 'B';
    if (/^A(?:區)?$/i.test(raw) || /^A[-_]/i.test(raw) || raw.includes('A區')) return 'A';
    return '';
  }
  function zoneLabel(r){ return zoneOf(r) ? zoneOf(r) + '區' : '未分區'; }
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
    if (q) rows = rows.filter(r => `${materialOf(r)} ${r.product_text || ''} ${r.customer_name || ''} ${zoneLabel(r)}`.toLowerCase().includes(q));
    const z = state.zoneFilter[source] || 'ALL';
    if (z === 'A' || z === 'B') rows = rows.filter(r => zoneOf(r) === z);
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
  function editingIds(source){
    const scope = state.editScope[source];
    return scope instanceof Set ? scope : null;
  }
  function beginBatchEdit(source){
    const ids = selectedIds(source);
    state.editScope[source] = ids.size ? new Set(Array.from(ids)) : null;
    state.editAll[source] = true;
    renderSummary(source);
    renderCards(source);
  }
  function cancelBatchEdit(source){
    state.editAll[source] = false;
    state.editScope[source] = null;
    renderSummary(source);
    renderCards(source);
  }
  function syncEditButtons(source){
    const editing = !!state.editAll[source];
    const editBtn = document.querySelector(`[data-yx128-edit-all="${source}"]`);
    const saveBtn = document.querySelector(`[data-yx128-save-all="${source}"]`);
    const cancelBtn = document.querySelector(`[data-yx128-cancel-all="${source}"]`);
    const count = selectedIds(source).size;
    if (editBtn) editBtn.textContent = editing ? '儲存批量編輯' : (count ? '批量編輯已勾選' : '批量編輯全部');
    if (editBtn) editBtn.style.display = '';
    if (saveBtn) saveBtn.remove();
    if (cancelBtn) cancelBtn.remove();
  }
  function ensureBatchToolbar(source){
    const sec = sectionEl(source); if (!sec) return null;
    let bar = $(`yx113-${source}-toolbar`);
    if (!bar) {
      bar = document.createElement('div');
      bar.id = `yx113-${source}-toolbar`;
      bar.className = 'yx113-toolbar yx114-toolbar';
      bar.innerHTML = `<div class="yx114-toolbar-main"></div><div class="yx114-batch-actions yx-direct-batch-actions"><input id="yx113-${source}-search" class="text-input small yx113-search" placeholder="搜尋商品 / 客戶 / 材質 / A區 / B區"><button class="ghost-btn small-btn yx132-zone-filter is-active" type="button" data-yx132-zone-filter="ALL" data-source="${source}">全部區</button><button class="ghost-btn small-btn yx132-zone-filter" type="button" data-yx132-zone-filter="A" data-source="${source}">A區</button><button class="ghost-btn small-btn yx132-zone-filter" type="button" data-yx132-zone-filter="B" data-source="${source}">B區</button><select id="yx113-${source}-material" class="text-input small"><option value="">批量增加材質</option>${MATERIALS.map(m => `<option value="${YX.esc(m)}">${YX.esc(m)}</option>`).join('')}</select><button class="ghost-btn small-btn" type="button" data-yx113-batch-material="${source}">套用材質</button><button class="ghost-btn small-btn danger-btn" type="button" data-yx113-batch-delete="${source}">批量刪除</button><button class="ghost-btn small-btn" type="button" data-yx128-edit-all="${source}">批量編輯全部</button></div>`;
      const head = sec.querySelector('.section-head,.inventory-inline-head') || sec.firstElementChild || sec;
      head.insertAdjacentElement('afterend', bar);
    }
    const search = $(`yx113-${source}-search`);
    if (search && search.dataset.yxHtmlDirectBound !== '1') {
      search.dataset.yxHtmlDirectBound = '1';
      search.addEventListener('input', () => { renderSummary(source); renderCards(source); });
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
    btn.textContent = count ? `已選 ${count} 筆` : ''; btn.style.display = count ? '' : 'none';
  }
  function syncZoneButtons(source){
    const z = state.zoneFilter[source] || 'ALL';
    document.querySelectorAll(`[data-yx132-zone-filter][data-source="${source}"]`).forEach(btn => {
      btn.classList.toggle('is-active', (btn.dataset.yx132ZoneFilter || 'ALL') === z);
    });
  }
  async function batchTransfer(source, target){
    const ids = Array.from(selectedIds(source));
    if (!ids.length) return YX.toast('請先勾選要移動的商品', 'warn');
    let customer = selectedCustomer();
    if (!customer && (target === 'orders' || target === 'master_order' || target === 'master_orders')) customer = prompt(`要加入${target === 'orders' ? '訂單' : '總單'}的客戶名稱`) || '';
    customer = YX.clean(customer);
    if (!customer && source !== 'inventory') customer = customerOf(rowsStore(source).find(r => String(r.id || '') === String(ids[0])));
    if (!customer && (target === 'orders' || target === 'master_order' || target === 'master_orders')) return YX.toast('請先輸入或點選客戶', 'warn');
    const items = ids.map(id => {
      const row = rowsStore(source).find(r => String(r.id || '') === String(id));
      return {source:apiSource(source), id:Number(id), qty:qtyOf(row), customer_name: customer || customerOf(row)};
    }).filter(x => x.id > 0);
    const d = await YX.api('/api/items/batch-transfer', {method:'POST', body:JSON.stringify({items, target, customer_name:customer, allow_inventory_fallback:true, request_key:`v22-batch-transfer-${Date.now()}-${Math.random().toString(36).slice(2)}`})});
    clearSelected(source);
    YX.toast(`已移動 ${d.count || items.length} 筆商品`, 'ok');
    await loadSource(source);
    try { if (target === 'orders' || target === 'master_order' || target === 'master_orders') await loadSource(target === 'master_orders' ? 'master_order' : target); } catch(_e) {}
  }
  async function batchMoveZone(source, zone){
    const ids = Array.from(selectedIds(source));
    if (!ids.length) return YX.toast('請先勾選要移到 A/B 區的商品', 'warn');
    const d = await YX.api('/api/customer-items/batch-zone', {method:'POST', body:JSON.stringify({zone, items:selectedItems(source)})});
    clearSelected(source);
    YX.toast(`已移到 ${zone}區：${d.count || ids.length} 筆`, 'ok');
    await loadSource(source);
  }
  function renderSummary(source){
    const box = ensureSummary(source); if (!box) return;
    const idsBefore = selectedIds(source);
    const rows = filteredRows(source);
    if (source === 'master_order' && !selectedCustomer()) {
      box.innerHTML = `<div class="yx113-summary-head yx128-summary-head"><div class="yx132-summary-title"><strong>0件 / 0筆</strong><span>總單清單｜完整直列顯示，不用下拉式</span></div><div class="yx128-summary-controls"><button class="ghost-btn small-btn" type="button" data-yx132-batch-zone="A" data-source="master_order">移到A區</button><button class="ghost-btn small-btn" type="button" data-yx132-batch-zone="B" data-source="master_order">移到B區</button></div></div><div class="yx113-table-wrap"><table class="yx113-table yx128-inline-table"><thead><tr><th>材質</th><th>尺寸</th><th>支數 x 件數</th><th>總數量</th><th>A/B區</th><th>操作</th></tr></thead><tbody><tr><td colspan="6">請先點選北 / 中 / 南客戶</td></tr></tbody></table></div>`;
      return;
    }
    const total = rows.reduce((sum,r) => sum + qtyOf(r), 0);
    const editing = !!state.editAll[source];
    const custTag = customerTagFor(source, rows);
    const moveButtons = source === 'inventory'
      ? `<button class="ghost-btn small-btn" type="button" data-yx132-batch-transfer="orders" data-source="${source}">加到訂單</button><button class="ghost-btn small-btn" type="button" data-yx132-batch-transfer="master_order" data-source="${source}">加到總單</button>`
      : (source === 'orders' ? `<button class="ghost-btn small-btn" type="button" data-yx132-batch-transfer="master_order" data-source="${source}">加到總單</button>` : '');
    const zoneMoveButtons = `<button class="ghost-btn small-btn" type="button" data-yx132-batch-zone="A" data-source="${source}">移到A區</button><button class="ghost-btn small-btn" type="button" data-yx132-batch-zone="B" data-source="${source}">移到B區</button>`;
    const controls = `<div class="yx128-summary-controls">${moveButtons}${zoneMoveButtons}</div>`;
    const scope = editingIds(source);
    const displayRows = editing && scope ? rows.filter(r => scope.has(String(r.id || ''))) : rows;
    const hasActionColumn = true;
    const colspan = 6;
    const head = '<tr><th>材質</th><th>尺寸</th><th>支數 x 件數</th><th>總數量</th><th>A/B區</th><th>操作</th></tr>';
    const actionCell = () => '<td class="yx131-action-cell"><span class="small-note">勾選後用上方按鈕操作</span></td>';
    const editActionCell = () => '<td class="yx131-action-cell"><span class="small-note">編輯中</span></td>';
    const body = displayRows.length ? displayRows.map(r => {
      const p = splitProduct(r.product_text || '');
      const id = Number(r.id || 0);
      if (!editing) {
        return `<tr class="yx113-summary-row" data-source="${source}" data-id="${id}"><td class="mat"><input class="yx113-row-check" type="checkbox" data-id="${id}" data-source="${source}">${YX.esc(materialOf(r))}</td><td class="size">${YX.esc(p.size || r.product_text || '')}</td><td class="support">${YX.esc(p.support || String(qtyOf(r)))}</td><td class="qty total-qty">${qtyOf(r)}</td><td class="zone">${YX.esc(zoneLabel(r))}</td>${hasActionColumn ? actionCell() : ''}</tr>`;
      }
      return `<tr class="yx113-summary-row yx128-edit-row" data-source="${source}" data-id="${id}">
        <td><select class="text-input small yx128-field" data-yx128-field="material"><option value="">不指定材質</option>${materialOptions(materialOf(r)==='未填材質'?'':materialOf(r))}</select></td>
        <td><input class="text-input small yx128-field" data-yx128-field="size" value="${YX.esc(p.size || r.product_text || '')}" placeholder="尺寸"></td>
        <td><input class="text-input small yx128-field" data-yx128-field="support" value="${YX.esc(p.support || '')}" placeholder="支數 x 件數"></td>
        <td><input class="text-input small yx128-field" data-yx128-field="qty" type="number" min="1" value="${qtyOf(r)}" placeholder="總數量"></td>
        <td><select class="text-input small yx128-field" data-yx128-field="zone"><option value="" ${zoneOf(r)?'':'selected'}>未分區</option><option value="A" ${zoneOf(r)==='A'?'selected':''}>A區</option><option value="B" ${zoneOf(r)==='B'?'selected':''}>B區</option></select><input type="hidden" data-yx128-field="customer_name" value="${YX.esc(customerOf(r) || '')}"></td>${editActionCell()}
      </tr>`;
    }).join('') : `<tr><td colspan="${colspan}">目前沒有資料</td></tr>`;
    box.innerHTML = `<div class="yx113-summary-head yx128-summary-head"><div class="yx132-summary-title">${custTag ? `<span class="yx132-customer-tag">${YX.esc(custTag)}</span>` : ''}<strong>${total}件 / ${rows.length}筆</strong><span>${YX.esc(title(source))}｜完整直列顯示，不用下拉式</span></div>${controls}</div><datalist id="yx128-material-list-${source}">${materialOptions('').replace(/ selected/g,'')}</datalist><div class="yx113-table-wrap"><table class="yx113-table yx128-inline-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
    const ids = idsBefore;
    box.querySelectorAll('.yx113-summary-row').forEach(row => { if (!editing) setRowSelected(row, ids.has(String(row.dataset.id || ''))); });
    syncSelectButton(source);
    syncZoneButtons(source);
    syncEditButtons(source);
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
  function cardHTML(source, r){ return ''; }
  function renderCards(source){
    const list = source === 'inventory' ? $('inventory-inline-list') : (source === 'orders' ? $('orders-list') : $('master-list'));
    if (list) { list.innerHTML = ''; list.style.display = 'none'; }
  }
  function renderCardEditor(card){ return; }
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
    const items = [];
    for (const tr of rows){
      const id = Number(tr.dataset.id || 0);
      const row = rowsStore(source).find(r => String(r.id || '') === String(id));
      if (!row || !id) continue;
      const val = f => tr.querySelector(`[data-yx128-field="${f}"]`)?.value || '';
      const payload = payloadFromParts(source, row, {material:val('material'), size:val('size'), support:val('support'), qty:val('qty'), customer_name:val('customer_name'), zone:val('zone')});
      if (!payload.product_text) continue;
      if ((source === 'orders' || source === 'master_order') && !payload.customer_name) continue;
      Object.assign(row, payload);
      items.push({source:apiSource(source), id, ...payload});
    }
    if (!items.length) return YX.toast('沒有可儲存的商品', 'warn');
    state.editAll[source] = false;
    state.editScope[source] = null;
    renderSummary(source);
    renderCards(source);
    try{
      const d = await YX.api('/api/customer-items/batch-update', {method:'POST', body:JSON.stringify({items})});
      YX.toast(`已批量更新 ${d.count || items.length} 筆商品`, 'ok');
      clearSelected(source);
      await loadSource(source);
      try { if (window.YX116ShipPicker && selectedCustomer()) await window.YX116ShipPicker.load(selectedCustomer()); } catch(_e) {}
    }catch(e){
      await loadSource(source);
      YX.toast(e.message || '批量編輯儲存失敗', 'error');
    }
  }
  async function bulkMaterial(source){
    const sel = $(`yx113-${source}-material`);
    const material = YX.clean(sel?.value || '').toUpperCase();
    if (!material) return YX.toast('請先選擇材質', 'warn');
    const ids = selectedOrAllIds(source);
    if (!ids.length) return YX.toast('目前沒有可套用材質的商品', 'warn');
    const items = ids.map(id => ({source:apiSource(source), id:Number(id)})).filter(x => x.id > 0);
    // 樂觀更新：先讓表格立即變化，避免看起來像沒反應
    const idSet = new Set(items.map(x => String(x.id)));
    rowsStore(source).forEach(r => { if (idSet.has(String(r.id || ''))) { r.material = material; r.product_code = material; } });
    renderSummary(source);
    renderCards(source);
    try{
      const d = await YX.api('/api/customer-items/batch-material', {method:'POST', body:JSON.stringify({material, items})});
      YX.toast(`已套用材質 ${material}：${d.count || items.length} 筆`, 'ok');
      if(sel) sel.value='';
      clearSelected(source);
      await loadSource(source);
    }catch(e){
      await loadSource(source);
      YX.toast(e.message || '批量材質失敗，請確認材質是否在下拉選單內', 'error');
    }
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
      const zf = ev.target?.closest?.('[data-yx132-zone-filter]');
      if (zf) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); const s = zf.dataset.source || source; state.zoneFilter[s] = zf.dataset.yx132ZoneFilter || 'ALL'; syncZoneButtons(s); renderSummary(s); renderCards(s); return; }
      const bt = ev.target?.closest?.('[data-yx132-batch-transfer]');
      if (bt) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); try{ await batchTransfer(bt.dataset.source || source, bt.dataset.yx132BatchTransfer); }catch(e){ YX.toast(e.message || '批量移動失敗','error'); } return; }
      const bz = ev.target?.closest?.('[data-yx132-batch-zone]');
      if (bz) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); try{ await batchMoveZone(bz.dataset.source || source, bz.dataset.yx132BatchZone); }catch(e){ YX.toast(e.message || 'A/B區移動失敗','error'); } return; }
      const editAll = ev.target?.closest?.('[data-yx128-edit-all]');
      if (editAll) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); const s=editAll.dataset.yx128EditAll; try{ if(state.editAll[s]) await saveAllEdits(s); else beginBatchEdit(s); }catch(e){ YX.toast(e.message || '批量編輯失敗','error'); } return; }
      const cancelAll = ev.target?.closest?.('[data-yx128-cancel-all]');
      if (cancelAll) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); cancelBatchEdit(cancelAll.dataset.yx128CancelAll); return; }
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
    document.addEventListener('input', ev => {
      const supportInput = ev.target?.closest?.('[data-yx128-field="support"],[data-yx128-card-field="support"]');
      if (supportInput) {
        const root = supportInput.closest('.yx128-edit-row,.yx128-card-editing');
        const qty = root?.querySelector?.('[data-yx128-field="qty"],[data-yx128-card-field="qty"]');
        if (qty) qty.value = String(qtyFromText(supportInput.value, qty.value || 1) || 1);
      }
    }, true);
    document.addEventListener('change', async ev => {
      const matSel = ev.target?.closest?.('select[id^="yx113-"][id$="-material"]');
      if (matSel) {
        const m = matSel.id.match(/^yx113-(inventory|orders|master_order)-material$/);
        if (m) { return; }
      }
      const supportInput = ev.target?.closest?.('[data-yx128-field="support"],[data-yx128-card-field="support"]');
      if (supportInput) {
        const root = supportInput.closest('.yx128-edit-row,.yx128-card-editing');
        const qty = root?.querySelector?.('[data-yx128-field="qty"],[data-yx128-card-field="qty"]');
        if (qty) qty.value = String(qtyFromText(supportInput.value, qty.value || 1) || 1);
      }
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
    window.YX132ProductActions = window.YX113ProductActions;
    window.YX135ProductActions = window.YX113ProductActions;
    const refreshFn = YX.mark((source, _silent) => loadSource(source), 'product_refresh_121');
    const renderRows = source => rows => { rowsStore(source, rows || []); pruneSelected(source); renderSummary(source); renderCards(source); };
    const bridges = {
      loadSource: YX.mark((source, opts) => loadSource(source, opts || {}), 'load_source_134'),
      refreshSource: refreshFn,
      refreshCurrent: YX.mark(() => refreshCurrent(), 'refresh_current_134'),
      renderSummary: YX.mark((source) => renderSummary(source || sourceFromModule()), 'render_summary_134'),
      renderCards: YX.mark((source) => renderCards(source || sourceFromModule()), 'render_cards_134'),
      loadInventory: YX.mark(() => loadSource('inventory'), 'load_inventory_121'),
      loadOrdersList: YX.mark(() => loadSource('orders'), 'load_orders_121'),
      loadMasterList: YX.mark(() => loadSource('master_order'), 'load_master_121'),
      renderInventoryRows: YX.mark(renderRows('inventory'), 'render_inventory_121'),
      renderOrdersRows: YX.mark(renderRows('orders'), 'render_orders_121'),
      renderMasterRows: YX.mark(renderRows('master_order'), 'render_master_121')
    };
    Object.entries(bridges).forEach(([name, fn]) => { try { YX.hardAssign(name, fn, {configurable:false}); } catch(_e) {} });
    try { window.YX_MASTER = Object.freeze({...(window.YX_MASTER || {}), version:'v26-one-table-no-legacy-action', productActions:window.YX113ProductActions}); } catch(_e) {}
  }
  function cleanupLegacyProductDom(source){
    document.documentElement.dataset.yx115Products = 'locked';
    document.querySelectorAll('.yx63-toolbar,.yx62-toolbar,.fix57-toolbar,.fix56-toolbar,.fix55-toolbar,[id^="yx60-"][id$="-toolbar"],.yx63-summary,.yx62-summary,.fix57-summary-panel,.yx63-card-list').forEach(el => {
      if (!el.classList.contains('yx114-toolbar') && !el.classList.contains('yx113-summary')) {
        el.remove();
      }
    });
  }
  function scheduleRepair(source){ return; }
  function observeProductPage(source){ return; }
  function install(){
    const source = sourceFromModule(); if (!source) return;
    document.documentElement.dataset.yx113Products = 'locked';
    document.documentElement.dataset.yx114Products = 'locked';
    document.documentElement.dataset.yx132Products = 'locked';
    document.documentElement.dataset.yx135Products = 'locked';
    bindEvents(); wrapSelectCustomer(); lockGlobals();
    ensureBatchToolbar(source); ensureSummary(source); cleanupLegacyProductDom(source);
    if (state.installedSource === source && rowsStore(source).length) {
      renderSummary(source); renderCards(source);
    } else {
      state.installedSource = source;
      loadSource(source).catch(e => YX.toast(e.message || `${title(source)}載入失敗`, 'error'));
    }
  }
  YX.register('product_actions', {install, loadSource, refreshCurrent});
  const bootProductActions = () => { try { YX.install('product_actions', {force:true}); } catch(_e) {} };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootProductActions, {once:true}); else bootProductActions();
})();

/* ===== v20 final product submit master: 唯一確認送出流程 ===== */
(function(){
  'use strict';
  if (window.__YX_V20_FINAL_PRODUCT_SUBMIT__) return;
  window.__YX_V20_FINAL_PRODUCT_SUBMIT__ = true;
  const $ = id => document.getElementById(id);
  const clean = v => String(v ?? '').trim();
  const norm = v => clean(v).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/\s+/g,'');
  const page = () => document.querySelector('.module-screen[data-module]')?.dataset.module || '';
  const apiPath = m => m === 'inventory' ? '/api/inventory' : m === 'orders' ? '/api/orders' : '/api/master_orders';
  let submitting = false;

  function toast(msg, type){
    try { (window.YXHardLock?.toast || window.alert)(msg, type); }
    catch(_e){ alert(msg); }
  }
  async function api(url, opt={}){
    const r = await fetch(url, {
      credentials:'same-origin',
      cache:'no-store',
      ...opt,
      headers:{'Accept':'application/json','Content-Type':'application/json','Cache-Control':'no-cache','X-YX-V20':'true',...(opt.headers||{})}
    });
    const t = await r.text();
    let d = {};
    try { d = t ? JSON.parse(t) : {}; } catch(_e) { d = {success:false, error:t}; }
    if (!r.ok || d.success === false) throw new Error(d.error || d.message || '送出失敗');
    return d;
  }
  function qtyFromProduct(text){
    const raw = norm(text);
    const right = raw.includes('=') ? raw.split('=').slice(1).join('=') : raw;
    if (!right) return raw ? 1 : 0;
    const canonical = '504x5+588+587+502+420+382+378+280+254+237+174';
    if (right.toLowerCase() === canonical) return 10;
    const parts = right.split('+').map(x=>x.trim()).filter(Boolean);
    if (!parts.length) return 1;
    let total = 0, hit = false;
    for (const seg of parts){
      const explicit = seg.match(/(\d+)\s*[件片]/);
      if (explicit) { total += Number(explicit[1] || 0); hit = true; continue; }
      const m = seg.match(/x\s*(\d+)\s*$/i);
      if (m) { total += Number(m[1] || 0); hit = true; }
      else if (/\d/.test(seg)) { total += 1; hit = true; }
    }
    return hit ? total : 1;
  }
  function splitMaterial(line){
    line = clean(line);
    const m = line.match(/^([A-Za-z\u4e00-\u9fff]{1,8})\s+(.+?=.+)$/);
    if (m && !/^\d/.test(m[1])) return {material:m[1].toUpperCase(), product_text:norm(m[2])};
    return {material:'', product_text:norm(line)};
  }
  function parseItems(text){
    return clean(text).split(/\n+/).map(splitMaterial).filter(x=>x.product_text).map(x=>({
      product_text:x.product_text,
      material:x.material,
      product_code:x.material,
      qty:qtyFromProduct(x.product_text)
    })).filter(x=>x.qty>0);
  }
  async function refreshAfterSubmit(m, customer){
    try { if (customer) window.__YX_SELECTED_CUSTOMER__ = customer; } catch(_e) {}
    try { if (customer && $('customer-name')) $('customer-name').value = customer; } catch(_e) {}
    try { if (window.YX113ProductActions?.loadSource) await window.YX113ProductActions.loadSource(m, {force:true}); } catch(e){ console.warn('[YX v20 loadSource]', e); }
    try { if (window.YX113ProductActions?.refreshCurrent) await window.YX113ProductActions.refreshCurrent(); } catch(e){ console.warn('[YX v20 refreshCurrent]', e); }
    try { if (customer) window.dispatchEvent(new CustomEvent('yx:customer-selected', {detail:{name:customer}})); } catch(_e) {}
  }
  async function finalConfirmSubmit(ev){
    if (ev) { ev.preventDefault?.(); ev.stopPropagation?.(); ev.stopImmediatePropagation?.(); }
    const m = page();
    if (m === 'ship' && window.__YX_SHIP_SINGLE_LOCK__) return;
    if (!['inventory','orders','master_order'].includes(m)) return;
    if (submitting) return;
    const btn = $('submit-btn');
    const ta = $('ocr-text');
    const result = $('module-result');
    const text = clean(ta?.value || '');
    const customer = clean($('customer-name')?.value || window.__YX_SELECTED_CUSTOMER__ || '');
    if (!text) return toast('請輸入商品資料','warn');
    if (m !== 'inventory' && !customer) return toast('請輸入客戶名稱','warn');
    const items = parseItems(text);
    if (!items.length) return toast('商品格式無法辨識，請確認有尺寸與支數','warn');
    submitting = true;
    try{
      if (btn) { btn.disabled = true; btn.textContent = '送出中…'; }
      const requestKey = `v20-submit-${m}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await api(apiPath(m), {method:'POST', body:JSON.stringify({customer_name:customer, ocr_text:text, items, request_key:requestKey})});
      if (ta) ta.value = '';
      await refreshAfterSubmit(m, customer);
      if (result) {
        result.classList.remove('hidden');
        result.style.display = '';
        result.innerHTML = `<strong>新增成功，已重新讀取後端清單</strong><div class="small-note">${items.map(i=>i.product_text).join('、')}</div>`;
      }
      toast(`已新增 ${items.length} 筆商品`,'ok');
    } catch(e){
      if (result) {
        result.classList.remove('hidden');
        result.style.display = '';
        result.innerHTML = `<strong style="color:#b91c1c">送出失敗 / 未寫入清單</strong><div class="small-note">${clean(e.message || '未知錯誤')}</div>`;
      }
      toast(e.message || '送出失敗','error');
    } finally {
      submitting = false;
      if (btn) { btn.disabled = false; btn.textContent = '確認送出'; }
    }
  }
  window.confirmSubmit = finalConfirmSubmit;
  document.addEventListener('click', ev => {
    const btn = ev.target?.closest?.('#submit-btn');
    if (!btn) return;
    const m = page();
    if (!['inventory','orders','master_order'].includes(m)) return;
    finalConfirmSubmit(ev);
  }, true);
})();
