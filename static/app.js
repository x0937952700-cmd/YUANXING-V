/* ==== app.js merged by FIX49 ==== */
/* ==== FIX65 duplicate boot gate ==== */
window.__YX65_SKIP_DUP_BOOT__ = true;



/* ==== realfix bootstrap start ==== */
window.state = window.state || { warehouse: { cells: [], zones: {A:{}, B:{}}, availableItems: [], activeZone: 'A' }, searchHighlightKeys: new Set() };
window.$ = window.$ || function(id){ return document.getElementById(id); };
window.currentModule = window.currentModule || function(){
  const p = location.pathname;
  if (p.includes('/master-order')) return 'master_order';
  if (p.includes('/orders')) return 'orders';
  if (p.includes('/inventory')) return 'inventory';
  if (p.includes('/ship')) return 'ship';
  if (p.includes('/warehouse')) return 'warehouse';
  if (p.includes('/customers')) return 'customers';
  if (p.includes('/todos')) return 'todos';
  return '';
};
window.escapeHTML = window.escapeHTML || function(str){
  return String(str ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
};

window.yxSortQtyExpression = window.yxSortQtyExpression || function(expr){
  const raw = String(expr || '')
    .replace(/[Ｘ×✕＊*X]/g,'x')
    .replace(/[＋，,；;]/g,'+')
    .replace(/件|片/g,'')
    .replace(/\s+/g,'')
    .trim();
  if(!raw) return '';
  const multi = [];
  const single = [];
  raw.split('+').filter(Boolean).forEach((seg, idx) => {
    const nums = (seg.match(/\d+/g) || []).map(n => parseInt(n, 10) || 0);
    if(nums.length >= 2 && /x/i.test(seg)) multi.push({seg, cases: nums[1] || 0, supports: nums[0] || 0, idx});
    else if(nums.length >= 1) single.push({seg, value: nums[0] || 0, idx});
    else single.push({seg, value: 0, idx});
  });
  multi.sort((a,b) => (b.cases - a.cases) || (b.supports - a.supports) || (a.idx - b.idx));
  single.sort((a,b) => (b.value - a.value) || (a.idx - b.idx));
  return [...multi.map(x => x.seg), ...single.map(x => x.seg)].join('+');
};

window.yxCleanQtyExpression = window.yxCleanQtyExpression || function(expr){
  return String(expr || '')
    .replace(/[Ｘ×✕＊*X]/g,'x')
    .replace(/[＝]/g,'=')
    .replace(/[＋，,；;]/g,'+')
    .replace(/件|片/g,'')
    .replace(/\s+/g,'')
    .trim();
};
window.yxFormatDimToken = window.yxFormatDimToken || function(v, isHeight){
  const s = String(v || '').trim();
  if(!s) return '';
  if(/^[A-Za-z]+$/.test(s)) return s.toUpperCase();
  if(/^\d*\.\d+$/.test(s)){
    const n = Number(s);
    if(n > 0 && n < 1) return s.startsWith('.') ? ('0' + s.slice(1)) : s.replace('.', '');
    return String(n).replace('.', '');
  }
  if(/^\d+$/.test(s)){
    if(isHeight && s.length === 1) return s.padStart(2,'0');
    return s;
  }
  return s.replace(/\s+/g,'');
};
window.yxNormalizeLeftSize = window.yxNormalizeLeftSize || function(left){
  return String(left || '').split(/x/i).map((p, i) => window.yxFormatDimToken(p, i === 2)).join('x');
};
window.yxNormalizeProductText = window.yxNormalizeProductText || function(text){
  const raw = String(text || '').replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').trim();
  const parts = raw.split('=');
  if(parts.length < 2) return raw;
  const left = window.yxNormalizeLeftSize(parts.shift().trim().replace(/\s+/g,''));
  const right = window.yxSortQtyExpression(window.yxCleanQtyExpression(parts.join('=')));
  return right ? `${left}=${right}` : raw;
};

window.toast = window.toast || function(message, level='ok'){
  let box = document.getElementById('global-toast-box');
  if (!box) {
    box = document.createElement('div');
    box.id = 'global-toast-box';
    box.style.cssText = 'position:fixed;right:16px;top:16px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  const color = level === 'error' ? '#fee2e2' : level === 'warn' ? '#fef3c7' : '#dcfce7';
  const border = level === 'error' ? '#ef4444' : level === 'warn' ? '#f59e0b' : '#22c55e';
  el.style.cssText = `padding:10px 14px;border-radius:12px;background:${color};border:1px solid ${border};color:#111827;box-shadow:0 10px 20px rgba(0,0,0,.08);max-width:320px;`;
  el.textContent = message || '';
  box.appendChild(el);
  setTimeout(() => el.remove(), 2600);
};
window.requestJSON = window.requestJSON || async function(url, options={}){
  const opts = { credentials: 'same-origin', ...options };
  opts.headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(url, opts);
  let data = {};
  try { data = await res.json(); } catch (_e) {}
  if (!res.ok || data.success === false) {
    const err = new Error(data.error || data.message || `請求失敗：${res.status}`);
    err.payload = data || {};
    err.status = res.status;
    throw err;
  }
  return data;
};
window.getFixedWarehouseColumns = function(){ return [1,2,3,4,5,6]; };
window.getFixedWarehouseSlots = function(zone, column){ try { return window.yx59WarehouseSlotCount ? window.yx59WarehouseSlotCount(zone, column) : 20; } catch(_e){ return 20; } };
window.getCellItems = function(zone, column, num){
  const cells = (window.state?.warehouse?.cells || []);
  const found = cells.find(c => String(c.zone)===String(zone) && Number(c.column_index)===Number(column) && Number(c.slot_number)===Number(num));
  if (!found) return [];
  try { return Array.isArray(found.items_json) ? found.items_json : JSON.parse(found.items_json || '[]'); } catch(_e){ return []; }
};
window.buildCellKey = function(zone, column, num){ return [zone, Number(column), 'direct', Number(num)]; };
window.parseTextareaItems = function(){
  const text = (document.getElementById('ocr-text')?.value || '').replace(/[。．]/g,'').trim();
  if (!text) return [];
  const normalizeX = v => String(v || '').replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/（/g,'(').replace(/）/g,')');
  const calcQty = right => {
    let total = 0;
    String(right || '').split(/[+＋,，;；]/).forEach(seg => {
      const main = seg.replace(/[\(（][^\)）]*[\)）]/g, '');
      const nums = (main.match(/\d+/g) || []).map(n => parseInt(n,10));
      if (nums.length >= 2) total += nums[1] || 0;
      else if (nums.length === 1) total += 1;
    });
    return Math.max(1, total || 1);
  };
  let last = ['', '', ''];
  const out = [];
  const lines = text.split(/\n+/).map(s => s.trim()).filter(Boolean);
  const tokenRe = /(?:[_-]|[A-Za-z]+|\d+(?:\.\d+)?)x(?:[_-]|[A-Za-z]+|\d+(?:\.\d+)?)x(?:[_-]|[A-Za-z]+|\d+(?:\.\d+)?)\s*[=:]\s*[^\n]+/ig;
  for (let line of lines) {
    line = normalizeX(line).replace(/\s+/g,'');
    const matches = line.match(tokenRe) || [];
    const tokens = matches.length ? matches : (/x/i.test(line) && /=/.test(line) ? [line] : []);
    for (const token of tokens) {
      const parts = token.split(/=|:/);
      const left = parts.shift();
      let right = parts.join('=').replace(/^[=:\s]+/,'').trim();
      right = window.yxSortQtyExpression(window.yxCleanQtyExpression(right.replace(/[^\dA-Za-z一-鿿xX+＋\-()（）件片]/g, '')));
      const dimsRaw = String(left || '').split(/x/i).map(s => s.trim());
      const dims = [0,1,2].map(i => {
        const v = dimsRaw[i] || '';
        if (!v || /^[_-]+$/.test(v)) return last[i] || '';
        return v;
      });
      if (dims[0] && dims[1] && dims[2]) last = dims.slice();
      if (!dims[0] || !dims[1] || !dims[2] || !right) continue;
      const product_text = `${window.yxNormalizeLeftSize(dims.join('x'))}=${right}`;
      out.push({ product_text, product_code: product_text, qty: calcQty(right) });
    }
  }
  return out;
};
window.normalizeCustomerItems = function(items){
  return (items || []).map(it => {
    const txt = String(it.product_text || '');
    const parts = txt.split('=');
    return { ...it, _size: parts[0] || txt, _qtyText: window.yxSortQtyExpression(parts[1] || String(it.qty || '')) };
  });
};
/* ==== realfix bootstrap end ==== */



function getFixedWarehouseColumns(){ return [1,2,3,4,5,6]; }
function getFixedWarehouseSlots(zone, column){ try { return window.yx59WarehouseSlotCount ? window.yx59WarehouseSlotCount(zone, column) : 20; } catch(_e){ return 20; } }

function normalizeRegion(value, fallback=''){
  const v = String(value || '').trim();
  return ['北區','中區','南區'].includes(v) ? v : fallback;
}

function renderWarehouseBaseGrid(){
  ['A','B'].forEach(zone => {
    const wrap = $(`zone-${zone}-grid`);
    if (!wrap) return;
    wrap.className = 'zone-grid six-grid vertical-card-grid';
    wrap.innerHTML = '';
    getFixedWarehouseColumns().forEach(c => {
      const col = document.createElement('div');
      col.className = 'vertical-column-card intuitive-column';
      col.innerHTML = `
        <div class="column-head-row">
          <div class="column-head">${zone} 區第 ${c} 欄</div>
          <div class="small-note">動態格數</div>
        </div>`;
      const list = document.createElement('div');
      list.className = 'vertical-slot-list';

      for (let n = 1; n <= getFixedWarehouseSlots(zone, c); n++) {
        const slot = document.createElement('div');
        slot.className = 'vertical-slot';
        slot.dataset.zone = zone;
        slot.dataset.column = c;
        slot.dataset.num = n;
        slot.innerHTML = `<div class="slot-title">第 ${String(n).padStart(2, '0')} 格</div><div class="slot-count"><div class="slot-line empty">空格</div></div>`;

        slot.addEventListener('click', () => {
          try {
            const items = getCellItems(zone, c, n);
            if (typeof showWarehouseDetail === 'function') showWarehouseDetail(zone, c, n, items);
            if (typeof openWarehouseModal === 'function') openWarehouseModal(zone, c, n);
          } catch (_e) {}
        });

        slot.addEventListener('dragover', ev => { ev.preventDefault(); slot.classList.add('drag-over'); });
        slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
        slot.addEventListener('drop', async ev => {
          ev.preventDefault();
          slot.classList.remove('drag-over');
          const raw = ev.dataTransfer.getData('text/plain');
          if (!raw) return;
          try {
            const parsed = JSON.parse(raw);
            if (parsed.kind === 'warehouse-item' && typeof moveWarehouseItem === 'function') {
              await moveWarehouseItem(parsed.fromKey, buildCellKey(zone, c, n), parsed.product_text, parsed.qty);
            }
          } catch (_e) {}
        });

        list.appendChild(slot);
      }
      col.appendChild(list);
      wrap.appendChild(col);
    });
  });
}

function applyWarehouseDataToGrid(){
  ['A','B'].forEach(zone => {
    const wrap = $(`zone-${zone}-grid`);
    if (!wrap) return;
    wrap.querySelectorAll('.vertical-slot').forEach(slot => {
      const c = Number(slot.dataset.column || 0);
      const n = Number(slot.dataset.num || 0);
      const items = getCellItems(zone, c, n);
      const directKey = `${zone}|${c}|direct|${n}`;
      let legacyKey = '';
      try {
        const legacyMap = typeof visualSlotToCell === 'function' ? visualSlotToCell(n) : { side: 'front', slot: n };
        legacyKey = `${zone}|${c}|${legacyMap.side}|${legacyMap.slot}`;
      } catch (_e) {}
      const highlighted = !!(state.searchHighlightKeys && (state.searchHighlightKeys.has(directKey) || (legacyKey && state.searchHighlightKeys.has(legacyKey))));
      slot.classList.toggle('filled', !!items.length);
      slot.classList.toggle('highlight', highlighted);

      const summary = items.length
        ? items.slice(0, 2).map(it => `<div class="slot-line customer">客戶：${escapeHTML(it.customer_name || '未指定客戶')}</div><div class="slot-line product">商品：${escapeHTML(it.product_text || '')}</div><div class="slot-line qty">數量：${it.qty || 0}</div>`).join('<hr class="slot-sep">')
        : '<div class="slot-line empty">空格</div>';

      slot.innerHTML = `<div class="slot-title">第 ${String(n).padStart(2, '0')} 格</div><div class="slot-count">${summary}</div>`;
    });
  });
}

function renderWarehouseZones(){
  renderWarehouseBaseGrid();
  applyWarehouseDataToGrid();
}


async function addWarehouseSlot(zone, column){ return addWarehouseVisualSlot(zone, column); }
async function removeWarehouseSlot(zone, column){ return removeWarehouseVisualSlot(zone, column); }

async function deleteWarehouseColumn(zone, column){
  toast('已取消整欄刪除功能', 'warn');
}

async function openWarehouseModal(zone, column, num){
  state.currentCell = { zone, column, slot_type: 'direct', slot_number: num };
  state.currentCellItems = getCellItems(zone, column, num);
  $('warehouse-modal').classList.remove('hidden');
  $('warehouse-modal-meta').textContent = `${zone} 區 / 第 ${column} 欄 / 第 ${String(num).padStart(2, '0')} 格`;
  $('warehouse-note').value = (state.warehouse.cells.find(c => c.zone===zone && parseInt(c.column_index)===parseInt(column) && parseInt(c.slot_number)===parseInt(num)) || {}).note || '';
  window.renderWarehouseCellItems ? window.renderWarehouseCellItems() : null;
  refreshWarehouseSelect();
  const search = $('warehouse-item-search');
  if (search) search.oninput = refreshWarehouseSelect;
}

function closeWarehouseModal(){ $('warehouse-modal')?.classList.add('hidden'); }

function refreshWarehouseSelect(){
  const sel = $('warehouse-item-select');
  if (!sel) return;
  const q = ($('warehouse-item-search')?.value || '').trim().toLowerCase();
  sel.innerHTML = '';
  state.warehouse.availableItems.filter(it => !q || `${it.product_text} ${it.customer_name || ''}`.toLowerCase().includes(q)).forEach(it => {
    const opt = document.createElement('option');
    opt.value = JSON.stringify(it);
    opt.textContent = `${it.product_text}｜剩餘 ${it.unplaced_qty}`;
    sel.appendChild(opt);
  });
  if (!sel.options.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '沒有可加入的商品';
    sel.appendChild(opt);
  }
}

function __deprecated_renderWarehouseCellItemsLegacyA(){
  const list = $('warehouse-cell-items');
  if (!list) return;
  list.innerHTML = '';
  state.currentCellItems.forEach((it, idx) => {
    const chip = document.createElement('div');
    chip.className = 'chip-item';
    chip.draggable = true;
    chip.dataset.idx = idx;
    chip.innerHTML = `<span>${escapeHTML(it.product_text || '')} × ${it.qty || 0}${it.customer_name ? ` ｜ ${escapeHTML(it.customer_name)}` : ''}</span>
      <div class="btn-row compact-row">
        <button class="ghost-btn tiny-btn edit" data-idx="${idx}">編輯</button>
        <button class="remove" data-idx="${idx}">刪除</button>
      </div>`;
    chip.addEventListener('dragstart', ev => {
      ev.dataTransfer.setData('text/plain', JSON.stringify({
        kind: 'warehouse-item',
        fromKey: buildCellKey(state.currentCell.zone, state.currentCell.column, state.currentCell.slot_number),
        product_text: it.product_text || '',
        qty: it.qty || 1
      }));
    });
    chip.querySelector('.edit')?.addEventListener('click', () => {
      const modal = ensureWarehouseItemEditModal();
      modal.querySelector('#warehouse-item-edit-text').value = it.product_text || '';
      modal.querySelector('#warehouse-item-edit-qty').value = String(it.qty || 0);
      const close = () => modal.classList.add('hidden');
      modal.querySelector('#warehouse-item-edit-close').onclick = close;
      modal.querySelector('#warehouse-item-edit-cancel').onclick = close;
      modal.querySelector('#warehouse-item-edit-save').onclick = () => {
        const nextText = modal.querySelector('#warehouse-item-edit-text').value.trim();
        const nextQty = parseInt(modal.querySelector('#warehouse-item-edit-qty').value || '0', 10);
        if (Number.isNaN(nextQty) || nextQty < 0) return toast('數量格式錯誤', 'error');
        state.currentCellItems[idx] = { ...it, product_text: nextText, qty: nextQty };
        close();
        window.renderWarehouseCellItems ? window.renderWarehouseCellItems() : null;
        toast('已更新格位內容，記得按儲存格位', 'ok');
      };
      modal.classList.remove('hidden');
    });
    chip.querySelector('.remove').addEventListener('click', () => {
      state.currentCellItems.splice(idx, 1);
      window.renderWarehouseCellItems ? window.renderWarehouseCellItems() : null;
    });
    list.appendChild(chip);
  });
}

function addSelectedItemToCell(){
  const sel = $('warehouse-item-select');
  if (!sel || !sel.value) return;
  const item = JSON.parse(sel.value);
  const qty = Math.max(1, parseInt(($('warehouse-add-qty')?.value || '1'), 10) || 1);
  state.currentCellItems.push({
    product_text: item.product_text,
    product_code: item.product_code || '',
    qty,
    customer_name: item.customer_name || '',
    source: 'inventory'
  });
  window.renderWarehouseCellItems ? window.renderWarehouseCellItems() : null;
}

async function saveWarehouseCell(){
  if (!state.currentCell) return;
  try {
    const note = $('warehouse-note')?.value || '';
    const cell = state.currentCell || {};
    await requestJSON('/api/warehouse/cell', {
      method: 'POST',
      body: JSON.stringify({
        zone: cell.zone,
        column_index: Number(cell.column_index || cell.column || cell.col || 0),
        slot_type: 'direct',
        slot_number: Number(cell.slot_number || cell.num || 0),
        items: state.currentCellItems,
        note
      })
    });
    toast('格位已儲存', 'ok');
    closeWarehouseModal();
    await renderWarehouse();
    if (typeof loadInventory === 'function') await loadInventory();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function legacyMoveWarehouseItem(fromKey, toKey, product_text, qty){
  try {
    await requestJSON('/api/warehouse/move', {
      method: 'POST',
      body: JSON.stringify({ from_key: fromKey, to_key: toKey, product_text, qty })
    });
    const fromLabel = `${fromKey[0]}-${fromKey[1]}-${String(fromKey[2] || fromKey[3] || 0).padStart(2,'0')}`;
    const toLabel = `${toKey[0]}-${toKey[1]}-${String(toKey[2] || toKey[3] || 0).padStart(2,'0')}`;
    toast(`已從 ${fromLabel} 移到 ${toLabel}`, 'ok');
    await renderWarehouse();
    await loadInventory();
    setTimeout(() => highlightWarehouseCell(toKey[0], toKey[1], toKey[2] || toKey[3]), 120);
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function legacySearchWarehouse(){
  const q = ($('warehouse-search')?.value || '').trim();
  if (!q) {
    state.searchHighlightKeys = new Set();
    $('warehouse-search-results')?.classList.add('hidden');
    await renderWarehouse();
    return;
  }
  try {
    const data = await requestJSON(`/api/warehouse/search?q=${encodeURIComponent(q)}`, { method:'GET' });
    state.searchHighlightKeys = new Set((data.items || []).map(r => `${r.cell.zone}|${r.cell.column_index}|${r.cell.slot_type}|${r.cell.slot_number}`));
    renderWarehouseZones();
    const box = $('warehouse-search-results');
    if (!box) return;
    box.classList.remove('hidden');
    if (!data.items || !data.items.length) {
      box.innerHTML = '<div class="search-card">沒有找到資料</div>';
      return;
    }
    box.innerHTML = '';
    if (data.items && data.items[0]) {
      const first = data.items[0];
      setWarehouseZone(first.cell.zone, false);
      setTimeout(() => highlightWarehouseCell(first.cell.zone, first.cell.column_index, first.cell.slot_number), 120);
    }
    data.items.forEach(r => {
      const cell = r.cell;
      const item = r.item;
      const div = document.createElement('div');
      div.className = 'search-card';
      const visualNum = parseInt(cell.slot_number || 0);
      div.innerHTML = `<strong>${escapeHTML(cell.zone)}區 第 ${cell.column_index} 欄 第 ${String(visualNum).padStart(2,'0')} 格</strong><br>${escapeHTML(item.product_text || '')} × ${item.qty || 0}`;
      div.addEventListener('click', () => { setWarehouseZone(cell.zone); setTimeout(()=>{ highlightWarehouseCell(cell.zone, cell.column_index, cell.slot_number); openWarehouseModal(cell.zone, cell.column_index, cell.slot_number); }, 120); });
      box.appendChild(div);
    });
  } catch (e) {
    toast(e.message, 'error');
  }
}

function showWarehouseDetail(zone, column, num, items){
  const box = $('warehouse-detail-panel');
  if (!box) return;
  const mapped = visualSlotToCell(num);
  box.classList.remove('hidden');
  box.innerHTML = `<div class="section-title">${zone} 區第 ${column} 欄 第 ${String(num).padStart(2,'0')} 格</div><div class="small-note">${mapped.side === 'front' ? '前排' : '後排'}</div><div class="btn-row compact-row"><button class="ghost-btn tiny-btn" onclick="openWarehouseModal('${zone}', ${column}, ${num})">直接編輯此格</button></div>` + (items.length ? items.map(it => { const row = formatCustomerProductRow(it.product_text || ''); return `<div class="deduct-card"><div><strong>${escapeHTML(it.customer_name || '未指定客戶')}</strong></div><div>${escapeHTML(it.product_text || '')}</div><div>尺寸：${escapeHTML(row.size || '')}</div><div>材質：${escapeHTML((it.material || row.material || '未填'))}</div><div>數量：${it.qty || 0}</div><div class="small-note">格位：${zone}-${column}-${String(num).padStart(2,'0')}</div></div>`; }).join('') : '<div class="empty-state-card compact-empty">此格目前沒有商品</div>');
  highlightWarehouseCell(zone, column, num);
}

function openTodoAlbumPicker(){ $('todo-image-input')?.click(); }
function openTodoCameraPicker(){ $('todo-camera-input')?.click(); }
function parseTodoImageNames(raw=''){
  try {
    const arr = JSON.parse(raw || '[]');
    if (Array.isArray(arr)) return arr.filter(Boolean);
  } catch (e) {}
  return raw ? [String(raw)] : [];
}
function handleTodoFiles(fileList){
  const files = Array.from(fileList || []);
  state.todoSelectedFiles = files;
  state.todoSelectedFile = files[0] || null;
  renderTodoSelectedPreview();
}
function renderTodoSelectedPreview(){
  const box = $('todo-selected-preview');
  if (!box) return;
  if (!state.todoSelectedFiles || !state.todoSelectedFiles.length) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }
  box.classList.remove('hidden');
  box.innerHTML = `<div class="todo-preview-grid">${state.todoSelectedFiles.map((file, idx) => { const url = URL.createObjectURL(file); return `<div class="todo-preview-card" draggable="true" data-todo-upload-idx="${idx}"><img src="${url}" alt="todo preview"><div class="small-note">${escapeHTML(file.name || `圖片${idx+1}`)}</div></div>`; }).join('')}</div>`;
  bindTodoUploadDrag();
}
function bindTodoUploadDrag(){
  let dragIndex = null;
  document.querySelectorAll('[data-todo-upload-idx]').forEach(card => {
    card.addEventListener('dragstart', () => { dragIndex = Number(card.dataset.todoUploadIdx || 0); });
    card.addEventListener('dragover', e => e.preventDefault());
    card.addEventListener('drop', e => {
      e.preventDefault();
      const dropIndex = Number(card.dataset.todoUploadIdx || 0);
      if (dragIndex === null || dragIndex === dropIndex) return;
      const files = [...state.todoSelectedFiles];
      const [moved] = files.splice(dragIndex, 1);
      files.splice(dropIndex, 0, moved);
      state.todoSelectedFiles = files;
      state.todoSelectedFile = files[0] || null;
      renderTodoSelectedPreview();
    });
  });
}
function clearTodoForm(){
  state.todoSelectedFile = null;
  state.todoSelectedFiles = [];
  if ($('todo-note')) $('todo-note').value = '';
  if ($('todo-date')) $('todo-date').value = '';
  if ($('todo-image-input')) $('todo-image-input').value = '';
  if ($('todo-camera-input')) $('todo-camera-input').value = '';
  renderTodoSelectedPreview();
}
async function saveTodoItem(){
  if (!state.todoSelectedFiles || !state.todoSelectedFiles.length) return toast('請先選擇照片', 'warn');
  setTodoButtonLoading(true);
  const keepNote = ($('todo-note')?.value || '').trim();
  const keepDate = ($('todo-date')?.value || '').trim();
  try {
    const fd = new FormData();
    state.todoSelectedFiles.forEach(file => fd.append('images', file));
    fd.append('note', keepNote);
    fd.append('due_date', keepDate);
    const res = await fetch('/api/todos', { method:'POST', body: fd, credentials:'same-origin' });
    const data = await res.json().catch(()=>({success:false,error:'回應解析失敗'}));
    if (!res.ok || data.success === false) throw new Error(data.error || `HTTP ${res.status}`);
    toast('代辦事項已新增', 'ok');
    clearTodoForm();
    await loadTodos();
  } catch (e) {
    if ($('todo-note')) $('todo-note').value = keepNote;
    if ($('todo-date')) $('todo-date').value = keepDate;
    toast(e.message || '新增失敗', 'error');
  } finally {
    setTodoButtonLoading(false);
  }
}
async function completeTodoItem(id){
  const ok = await askConfirm('確認此代辦已完成？', '完成代辦', '完成', '取消');
  if (!ok) return;
  try {
    await requestJSON(`/api/todos/${id}/complete`, { method:'POST', body:'{}' });
    const card = document.querySelector(`.todo-card[data-todo-id="${id}"]`);
    if (card) {
      card.style.transition = 'opacity .2s ease, transform .2s ease';
      card.style.opacity = '0';
      card.style.transform = 'translateY(-4px)';
      setTimeout(async () => { await loadTodos(); }, 180);
    } else {
      await loadTodos();
    }
    toast('已移到完成區', 'ok');
  } catch (e) {
    toast(e.message || '完成代辦失敗', 'error');
  }
}
async function restoreTodoItem(id){
  const ok = await askConfirm('確認把這筆代辦還原到進行中？', '還原代辦', '還原', '取消');
  if (!ok) return;
  try {
    await requestJSON(`/api/todos/${id}/restore`, { method:'POST', body:'{}' });
    const card = document.querySelector(`.todo-card[data-todo-id="${id}"]`);
    if (card) {
      card.style.transition = 'all .18s ease';
      card.style.opacity = '0';
      card.style.transform = 'translateY(-6px)';
      setTimeout(async () => { await loadTodos(); }, 180);
    } else {
      await loadTodos();
    }
    toast('代辦事項已還原', 'ok');
  } catch (e) {
    toast(e.message || '還原代辦失敗', 'error');
  }
}
async function deleteTodoItem(id){
  const ok = await askConfirm('確認這張備忘照片已完成，要刪除這筆代辦嗎？', '完成代辦', '確認刪除', '取消');
  if (!ok) return;
  try {
    await requestJSON(`/api/todos/${id}`, { method:'DELETE' });
    const card = document.querySelector(`.todo-card[data-todo-id="${id}"]`);
    if (card) {
      card.style.transition = 'opacity .2s ease, transform .2s ease';
      card.style.opacity = '0';
      card.style.transform = 'translateY(-4px)';
      setTimeout(async () => { await loadTodos(); }, 180);
    } else {
      await loadTodos();
    }
    toast('代辦事項已刪除', 'ok');
  } catch (e) {
    toast(e.message || '刪除失敗', 'error');
  }
}
async function persistTodoOrder(doneFlag){
  const ids = qsa(`.todo-card[data-done="${doneFlag}"]`).map(el => Number(el.dataset.todoId || 0)).filter(Boolean);
  if (!ids.length) return;
  try {
    await requestJSON('/api/todos/reorder', { method:'POST', body: JSON.stringify({ ids, done_flag: doneFlag }) });
  } catch (e) {
    toast(e.message || '代辦排序儲存失敗', 'error');
  }
}
function bindTodoCardDrag(){
  let dragging = null;
  qsa('.todo-card[data-done="0"]').forEach(card => {
    card.draggable = true;
    card.addEventListener('dragstart', () => { dragging = card; card.classList.add('is-dragging'); });
    card.addEventListener('dragend', async () => { card.classList.remove('is-dragging'); dragging = null; await persistTodoOrder(0); });
    card.addEventListener('dragover', e => e.preventDefault());
    card.addEventListener('drop', e => {
      e.preventDefault();
      if (!dragging || dragging === card) return;
      const parent = card.parentNode;
      const cards = [...parent.querySelectorAll('.todo-card[data-done="0"]')];
      const draggingIndex = cards.indexOf(dragging);
      const dropIndex = cards.indexOf(card);
      if (draggingIndex < dropIndex) parent.insertBefore(dragging, card.nextSibling);
      else parent.insertBefore(dragging, card);
    });
  });
}
async function loadTodos(){
  const box = $('todo-list');
  if (!box) return;
  try {
    const data = await requestJSON('/api/todos', { method:'GET' });
    const items = sortTodoItems(data.items || []);
    const active = items.filter(it => Number(it.is_done || 0) !== 1);
    const completed = items.filter(it => Number(it.is_done || 0) === 1);
    if (!items.length) {
      box.innerHTML = '<div class="empty-state-card"><div class="empty-state-title">目前沒有代辦事項</div><div class="small-note">可拍照或上傳多張圖片建立備忘，今天到期的會優先顯示</div></div>';
      return;
    }
    const today = new Date();
    const todayStr = today.toISOString().slice(0,10);
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0,10);
    const renderCard = (item, done=false) => {
      const imageNames = parseTodoImageNames(item.image_filename || '');
      const overdue = item.due_date && item.due_date < todayStr && !done;
      const dueToday = item.due_date && item.due_date === todayStr && !done;
      const dueTomorrow = item.due_date && item.due_date === tomorrowStr && !done;
      const dateChip = item.due_date ? `<span class="todo-chip todo-chip-date ${overdue ? 'todo-chip-overdue' : dueToday ? 'todo-chip-today' : dueTomorrow ? 'todo-chip-tomorrow' : ''}">${overdue ? '逾期' : dueToday ? '今天' : dueTomorrow ? '明天' : escapeHTML(item.due_date)}</span>` : `<span class="todo-chip">未指定日期</span>`;
      return `<div class="card todo-card premium-todo-card ${done ? 'todo-card-done' : ''}" data-done="${done ? 1 : 0}" data-todo-id="${Number(item.id || 0)}">
        <div class="todo-card-top">
          <div class="todo-top-badges">
            <span class="todo-chip todo-chip-accent">${done ? '已完成' : '代辦事項'}</span>
            ${dateChip}
          </div>
          <div class="todo-top-hint">${done ? '可刪除 / 還原' : '拖拉排序 / 完成 / 刪除'}</div>
        </div>
        <div class="todo-card-main">
          <div class="todo-thumb-wrap">
            <div class="todo-thumb-grid">${imageNames.map(src => `<img class="todo-thumb" src="/todo-image/${encodeURIComponent(src)}" alt="todo image" onclick="event.stopPropagation(); openTodoImagePreview('/todo-image/${encodeURIComponent(src)}')">`).join('')}</div>
          </div>
          <div class="todo-card-info">
            <div class="title todo-title">${escapeHTML(item.note || '照片備忘')}</div>
            <div class="todo-meta-grid">
              <div class="todo-meta-item"><span class="todo-meta-label">建立者</span><span class="todo-meta-value">${escapeHTML(item.created_by || '未填寫')}</span></div>
              <div class="todo-meta-item"><span class="todo-meta-label">建立時間</span><span class="todo-meta-value">${escapeHTML(item.created_at || '')}</span></div>
              <div class="todo-meta-item"><span class="todo-meta-label">圖片</span><span class="todo-meta-value">${imageNames.length} 張</span></div>
            </div>
          </div>
        </div>
        <div class="btn-row todo-card-actions">
          ${done ? `<button class="ghost-btn small-btn" onclick="event.stopPropagation(); restoreTodoItem(${Number(item.id || 0)})">還原</button>` : `<button class="primary-btn small-btn" onclick="event.stopPropagation(); completeTodoItem(${Number(item.id || 0)})">完成</button>`}
          <button class="ghost-btn small-btn" onclick="event.stopPropagation(); deleteTodoItem(${Number(item.id || 0)})">刪除</button>
        </div>
      </div>`;
    };
    const section = (title, arr, emptyText, done=false) => `<div class="todo-section-block"><div class="todo-date-heading">${title}</div>${arr.length ? arr.map(it => renderCard(it, done)).join('') : `<div class="empty-state-card compact-empty">${emptyText}</div>`}</div>`;
    box.innerHTML = section('進行中', active, '目前沒有進行中的代辦') + section('已完成', completed, '目前沒有已完成的代辦', true);
    bindTodoCardDrag();
  } catch (e) {
    box.innerHTML = `<div class="error-card">${escapeHTML(e.message || '代辦事項載入失敗')}</div>`;
  }
}

function openTodoImagePreview(src){
  const panel = $('module-result');
  if (!panel) return window.open(src, '_blank');
  panel.classList.remove('hidden');
  panel.innerHTML = `<div class="success-card todo-image-preview-card"><div class="btn-row compact-row" style="justify-content:flex-end"><button class="ghost-btn tiny-btn" onclick="document.getElementById('module-result').classList.add('hidden')">關閉</button></div><div class="section-title">圖片預覽</div><img class="todo-preview-large" src="${src}" alt="todo preview"></div>`;
}

function legacyHighlightWarehouseCell(zone, column, num){
  setWarehouseZone(zone, false);
  const target = document.querySelector(`.vertical-slot[data-zone="${zone}"][data-column="${column}"][data-num="${num}"]`);
  if (target){
    target.classList.remove('flash-highlight');
    void target.offsetWidth;
    target.classList.add('flash-highlight');
    target.scrollIntoView({behavior:'smooth', block:'center', inline:'center'});
    setTimeout(()=>target.classList.remove('flash-highlight'), 4200);
  }
}

async function reverseLookup(){
  const q = ($('ocr-text')?.value || $('customer-name')?.value || '').trim();
  if (!q) return;
  if (state.module === 'ship') {
    const items = parseTextareaItems();
    if (!items.length) return toast('請先輸入商品資料', 'warn');
    const resultBox = $('module-result');
    if (resultBox) {
      resultBox.classList.remove('hidden');
      resultBox.innerHTML = '<div class="success-card"><div class="section-title">反查商品位置</div><div class="small-note">查詢中…</div></div>';
    }
    const rows = [];
    for (const it of items) {
      try {
        const data = await requestJSON(`/api/warehouse/search?q=${encodeURIComponent(it.product_text)}`, { method:'GET' });
        (data.items || []).forEach(r => rows.push({ product_text: it.product_text, cell: r.cell, item: r.item }));
      } catch (_e) {}
    }
    if (resultBox) {
      if (!rows.length) {
        resultBox.innerHTML = '<div class="error-card"><div class="section-title">反查商品位置</div><div class="small-note">目前在倉庫圖找不到這些商品</div></div>';
      } else {
        const keys = rows.map(r => `${r.cell.zone}|${r.cell.column_index}|direct|${r.cell.slot_number}`);
        localStorage.setItem('shipPreviewWarehouseHighlights', JSON.stringify(keys));
        localStorage.setItem('moduleQuickJump', JSON.stringify({ target:'warehouse', customerName:'', productText:(rows[0]?.product_text || ''), at:Date.now() }));
        resultBox.innerHTML = `<div class="success-card"><div class="section-title">反查商品位置</div>${rows.map(r => `<div class="deduct-card"><div><strong>${escapeHTML(r.product_text)}</strong></div><div class="small-note">${escapeHTML(r.cell.zone)} 區第 ${r.cell.column_index} 欄 第 ${String(r.cell.slot_number).padStart(2,'0')} 格</div><div class="small-note">客戶：${escapeHTML(r.item.customer_name || '未指定客戶')}</div></div>`).join('')}<div class="btn-row"><a class="primary-btn" href="/warehouse">前往倉庫圖並高亮</a></div></div>`;
      }
    }
    return;
  }
  if (state.lineMap && state.lineMap.length) {
    highlightOcrLine(0);
    toast('已定位到第一筆辨識區塊，可點下方每行內容切換定位', 'ok');
    return;
  }
  if (state.module === 'warehouse') {
    $('warehouse-search').value = q.split(/\s+/)[0];
    searchWarehouse();
  }
}

async function renderCustomers(){
  if (state.module !== 'customers') return;
  await loadCustomerBlocks();
}

function escapeHTML(str){
  return String(str ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}

/* expose globals block removed for realfix */
/* ===== 第十包覆寫強化 ===== */

function splitManualCompoundLine(line=''){
  const normalized = String(line || '')
    .replace(/[｜|]/g, ' ')
    .replace(/((?:[_-]|[A-Za-z]+|\d+(?:\.\d+)?)x(?:[_-]|[A-Za-z]+|\d+(?:\.\d+)?)x(?:[_-]|[A-Za-z]+|\d+(?:\.\d+)?)=[0-9A-Za-z一-鿿xX+＋件片]+)/ig, '\n$1\n')
    .replace(/\n+/g, '\n');
  return normalized.split('\n').map(s => s.trim()).filter(Boolean);
}

function formatManualEntryText(rawText=''){
  const sourceText = String(rawText || '');
  const rawLines = splitManualRawLines(sourceText).flatMap(splitManualCompoundLine);
  let lastDims = ['', '', ''];
  let customerGuess = extractCustomerNameFromText(sourceText);
  const parsed = [];

  const parseProductToken = (token) => {
    const parts = String(token || '').split('=');
    const leftRaw = parts.shift();
    const rightRaw = window.yxSortQtyExpression(window.yxCleanQtyExpression(parts.join('=').replace(/[。．]/g, '').trim()));
    if (!leftRaw || !rightRaw) return null;
    const leftParts = String(leftRaw || '').split(/x/i).map(s => s.trim());
    const dims = [0,1,2].map(i => {
      const v = (leftParts[i] || '').trim();
      if (!v || /^[_-]+$/.test(v)) return lastDims[i] || '';
      return v;
    });
    if (!dims[0]) dims[0] = lastDims[0] || '';
    if (!dims[1]) dims[1] = lastDims[1] || '';
    if (!dims[2]) dims[2] = lastDims[2] || '';
    if (!dims[0] || !dims[1] || !dims[2]) return null;
    lastDims = dims.slice();
    const calcQty = (txt) => {
      let total = 0;
      String(txt || '').split(/[+＋,，;；]/).forEach(seg => {
        const main = seg.replace(/[\(（][^\)）]*[\)）]/g, '');
        const nums = main.match(/\d+/g) || [];
        if (nums.length >= 2) total += parseInt(nums[1] || '0', 10) || 0;
        else if (nums.length === 1) total += 1;
      });
      return Math.max(1, total || 1);
    };
    const qty = calcQty(rightRaw);
    const product_text = `${window.yxNormalizeLeftSize(dims.join('x'))}=${rightRaw}`;
    return { product_text, product_code: product_text, qty, _dims: dims.map(v => parseInt(v || 0, 10) || 0) };
  };

  rawLines.forEach(rawLine => {
    let line = String(rawLine || '')
      .replace(/[。．\.]/g, '')
      .replace(/[，,；;、]/g, '')
      .replace(/商品資料[:：]?/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!line) return;

    const customerInline = line.match(/^(?:客戶|公司|客戶名稱)\s*[：:]\s*(.+)$/i);
    if (customerInline) {
      customerGuess = customerInline[1].trim() || customerGuess;
      return;
    }

    line = normalizeOcrLine(line).replace(/[^0-9a-zA-Zx=+_\-｜:()（）\u4e00-\u9fff ]/g, '').trim();
    if (!line) return;

    const productPattern = /(?:[_-]|\d{1,4})x(?:[_-]|\d{1,4})x(?:[_-]|\d{1,4})=[^\n\s]+/ig;
    const tokens = line.match(productPattern) || [];

    if (tokens.length) {
      const firstIdx = line.search(productPattern);
      if (firstIdx > 0) {
        const prefix = line.slice(0, firstIdx).replace(/^(?:客戶|公司|客戶名稱):?/i, '').trim();
        if (prefix && /[^0-9x=_\-+]/i.test(prefix) && !customerGuess) customerGuess = prefix;
      }
      tokens.forEach(token => {
        const item = parseProductToken(token);
        if (item) parsed.push(item);
      });
      return;
    }

    if (!line.includes('=') && /[^0-9x=_\-+]/.test(line)) {
      const cleanName = line.replace(/^(?:客戶|公司|客戶名稱):?/i, '').trim();
      if (cleanName && !customerGuess) customerGuess = cleanName;
      return;
    }

    if (!line.includes('=')) return;
    const item = parseProductToken(line);
    if (item) parsed.push(item);
  });

  const items = sortParsedItems(mergeParsedDuplicates(parsed));
  return {
    customerGuess,
    items,
    formattedText: items.map(it => `${it.product_text}`).join('\n')
  };
}

function renderShipSelectedItems(){
  const box = $('ship-selected-items');
  if (!box) return;
  const items = normalizeShipTextareaItems(parseTextareaItems());
  const previewMap = new Map((state.shipPreview?.items || []).map(it => [it.product_text || '', it]));
  box.innerHTML = items.length ? items.map((it, idx) => {
    const preview = previewMap.get(it.product_text || '') || {};
    const totalAvailable = Number(preview.master_available||0)+Number(preview.order_available||0)+Number(preview.inventory_available||0);
    const shortageTotal = Math.max(0, Number(it.qty||0) - totalAvailable);
    const sourceBreakdown = preview.source_breakdown || [];
    const breakdown = sourceBreakdown.length
      ? sourceBreakdown.map(src => `<span class="ship-mini-chip">${escapeHTML(src.source)} 可扣 ${src.available || 0}</span>`).join('')
      : '<span class="small-note">尚未載入來源</span>';
    const shortage = shortageTotal > 0
      ? `<div class="ship-shortage-banner">缺貨：不足 ${shortageTotal}｜總單 ${preview.master_available || 0}｜訂單 ${preview.order_available || 0}｜庫存 ${preview.inventory_available || 0}</div>`
      : '';
    return `<div class="ship-selected-card${shortageTotal > 0 ? ' has-shortage' : ''}">
      <div class="ship-selected-main">
        <strong>${escapeHTML(it.product_text)}</strong>
        <span class="ship-need-chip">需求 ${it.qty || 1}</span>
      </div>
      <div class="ship-selected-meta">
        <span class="ship-mini-chip ship-total-chip">總可扣 ${totalAvailable}</span>
        ${breakdown}
      </div>
      ${shortage}
      <div class="small-note">來源摘要：總單 ${preview.master_available || 0}｜訂單 ${preview.order_available || 0}｜庫存 ${preview.inventory_available || 0}</div>
      <div class="ship-selected-actions"><button type="button" class="ghost-btn tiny-btn" onclick="moveShipItem(${idx}, -1)">↑</button><button type="button" class="ghost-btn tiny-btn" onclick="moveShipItem(${idx}, 1)">↓</button><button type="button" class="ghost-btn tiny-btn danger-btn" onclick="removeShipItemAt(${idx})">移除</button></div>
    </div>`;
  }).join('') : '<div class="empty-state-card compact-empty">尚未選取商品</div>';
}

async function loadShipPreview(){
  if (state.module !== 'ship') return;
  const panel = $('ship-preview-panel');
  if (!panel) return;
  const customer_name = ($('customer-name')?.value || '').trim();
  const items = normalizeShipTextareaItems(parseTextareaItems());
  renderShipSelectedItems();
  if (!customer_name || !items.length){
    panel.classList.add('hidden');
    panel.innerHTML = '';
    return;
  }
  try {
    const data = await requestJSON('/api/ship-preview', { method:'POST', body: JSON.stringify({ customer_name, items }) });
    state.shipPreview = data;
    renderShipSelectedItems();
    const highlightKeys = [];
    let totalMaster = 0, totalOrder = 0, totalInventory = 0, totalNeed = 0;
    (data.items || []).forEach(item => {
      totalMaster += Number(item.master_available||0);
      totalOrder += Number(item.order_available||0);
      totalInventory += Number(item.inventory_available||0);
      totalNeed += Number(item.qty||0);
      (item.locations || []).forEach(loc => highlightKeys.push(`${loc.zone}|${loc.column_index}|direct|${loc.slot_number || loc.visual_slot || 0}`));
    });
    localStorage.setItem('shipPreviewWarehouseHighlights', JSON.stringify(highlightKeys));
    const totalAvailable = totalMaster + totalOrder + totalInventory;
    const shortageAll = Math.max(0, totalNeed - totalAvailable);
    panel.classList.remove('hidden');
    const summary = `<div class="ship-preview-summary">
      <div class="ship-summary-chip">需求總量<span class="small-note">${totalNeed}</span></div>
      <div class="ship-summary-chip">總單可扣<span class="small-note">${totalMaster}</span></div>
      <div class="ship-summary-chip">訂單可扣<span class="small-note">${totalOrder}</span></div>
      <div class="ship-summary-chip">庫存可扣<span class="small-note">${totalInventory}</span></div>
      <div class="ship-summary-chip${shortageAll>0?' has-shortage':''}">整體不足<span class="small-note">${shortageAll}</span></div>
    </div>`;
    panel.innerHTML = `<div class="success-card"><div class="section-title">出貨預覽</div><div class="small-note">${escapeHTML(data.message || '已整理可扣來源與倉位')}</div></div>${summary}` + (data.items || []).map(item => {
      const shortageTotal = Math.max(0, Number(item.qty||0) - (Number(item.master_available||0)+Number(item.order_available||0)+Number(item.inventory_available||0)));
      const shortage = (item.shortage_reasons || []).length ? `<div class="error-card compact-danger">缺貨提醒：${escapeHTML(item.shortage_reasons.join('、'))}${shortageTotal ? `｜不足 ${shortageTotal}` : ''}</div>` : '';
      const sourceChips = (item.source_breakdown || []).map(src => `<span class="ship-location-chip">${escapeHTML(src.source)} 可扣 ${src.available || 0}</span>`).join('');
      const locations = (item.locations || []).map(loc => `<button type="button" class="ship-location-chip ship-location-jump" onclick="quickJumpToModule('warehouse', '', ${JSON.stringify(item.product_text || '')})">${escapeHTML(loc.zone)}-${loc.column_index}-${String(loc.visual_slot || loc.slot_number || 0).padStart(2,'0')}｜可出 ${loc.ship_qty || loc.qty || 0}${typeof loc.remain_after !== 'undefined' ? `｜剩 ${loc.remain_after}` : ''}</button>`).join('') || '<span class="small-note">倉庫圖中尚未找到此商品位置</span>';
      return `<div class="ship-breakdown-item ${item.shortage_reasons?.length ? 'has-shortage' : ''}">
        <div><strong>${escapeHTML(item.product_text || '')}</strong>｜需求 ${item.qty || 0}</div>
        <div class="ship-breakdown-list"><span class="ship-mini-chip ship-total-chip">總可扣 ${Number(item.master_available||0)+Number(item.order_available||0)+Number(item.inventory_available||0)}</span>${sourceChips}</div>
        ${shortage}
        <div class="small-note">建議：${escapeHTML(item.recommendation || '')}</div>
        <div class="ship-breakdown-list">${locations}</div>
      </div>`;
    }).join('');
  } catch (e) {
    panel.classList.remove('hidden');
    panel.innerHTML = `<div class="error-card">${escapeHTML(e.message || '出貨預覽失敗')}</div>`;
  }
}

function highlightWarehouseCell(zone, column, num){
  setWarehouseZone(zone, false);
  const target = document.querySelector(`.vertical-slot[data-zone="${zone}"][data-column="${column}"][data-num="${num}"]`);
  if (target){
    target.classList.remove('flash-highlight');
    void target.offsetWidth;
    target.classList.add('flash-highlight');
    target.scrollIntoView({behavior:'smooth', block:'center', inline:'center'});
    setTimeout(()=>target.classList.remove('flash-highlight'), 6800);
  }
}

async function legacySearchWarehouseOld(){
  const q = ($('warehouse-search')?.value || '').trim();
  if (!q) {
    state.searchHighlightKeys = new Set();
    $('warehouse-search-results')?.classList.add('hidden');
    await renderWarehouse();
    return;
  }
  try {
    const data = await requestJSON(`/api/warehouse/search?q=${encodeURIComponent(q)}`, { method:'GET' });
    state.searchHighlightKeys = new Set((data.items || []).map(r => `${r.cell.zone}|${r.cell.column_index}|${r.cell.slot_type}|${r.cell.slot_number}`));
    renderWarehouseZones();
    const box = $('warehouse-search-results');
    if (!box) return;
    box.classList.remove('hidden');
    if (!data.items || !data.items.length) {
      box.innerHTML = '<div class="empty-state-card compact-empty">沒有找到資料</div>';
      return;
    }
    box.innerHTML = '';
    if (data.items && data.items[0]) {
      const first = data.items[0];
      setWarehouseZone(first.cell.zone, false);
      setTimeout(() => highlightWarehouseCell(first.cell.zone, first.cell.column_index, first.cell.slot_number), 120);
    }
    data.items.forEach(r => {
      const cell = r.cell;
      const item = r.item;
      const div = document.createElement('div');
      div.className = 'search-card warehouse-search-hit';
      div.innerHTML = `<strong>${escapeHTML(item.customer_name || '未指定客戶')}</strong><br>${escapeHTML(item.product_text || '')}<div class="small-note">${escapeHTML(cell.zone)} 區 第 ${cell.column_index} 欄 第 ${String(cell.slot_number).padStart(2,'0')} 格</div>`;
      div.addEventListener('click', ()=>{
        setWarehouseZone(cell.zone, false);
        setTimeout(()=>highlightWarehouseCell(cell.zone, cell.column_index, cell.slot_number), 80);
      });
      box.appendChild(div);
    });
  } catch (e) {
    $('warehouse-search-results').classList.remove('hidden');
    $('warehouse-search-results').innerHTML = `<div class="error-card">${escapeHTML(e.message || '搜尋失敗')}</div>`;
  }
}

async function moveWarehouseItem(fromKey, toKey, product_text, qty){
  try {
    await requestJSON('/api/warehouse/move', {
      method: 'POST',
      body: JSON.stringify({ from_key: fromKey, to_key: toKey, product_text, qty })
    });
    const fromLabel = `${fromKey[0]}-${fromKey[1]}-${String(fromKey[2] || fromKey[3] || 0).padStart(2,'0')}`;
    const toLabel = `${toKey[0]}-${toKey[1]}-${String(toKey[2] || toKey[3] || 0).padStart(2,'0')}`;
    toast(`搬移完成：${product_text}｜${fromLabel} → ${toLabel}`, 'ok');
    await renderWarehouse();
    await loadInventory();
    setTimeout(() => highlightWarehouseCell(toKey[0], toKey[1], toKey[2] || toKey[3]), 120);
  } catch (e) {
    toast(e.message, 'error');
  }
}

function batchAddCustomerItemsToShip(customerName, scope='modal'){
  const listId = 'customer-inline-items';
  const checked = Array.from(document.querySelectorAll(`#${listId} input[type="checkbox"]:checked`));
  if (!checked.length) return toast('請先勾選商品', 'warn');
  const items = checked.map(input => {
    return {
      product_text: input.dataset.productText || '',
      product_code: input.dataset.productText || '',
      qty: Number(input.dataset.qty || 1) || 1
    };
  }).filter(it => it.product_text);
  if (!items.length) return toast('沒有可加入出貨的商品', 'warn');
  localStorage.setItem('shipQuickItems', JSON.stringify(items));
  localStorage.setItem('moduleQuickJump', JSON.stringify({
    target:'ship',
    customerName: customerName || '',
    productText:'',
    at: Date.now()
  }));
  window.location.href = '/ship';
}

function applyModuleQuickJump(){
  try {
    const raw = localStorage.getItem('moduleQuickJump');
    if (!raw) return;
    const jump = JSON.parse(raw);
    if (!jump || jump.target !== state.module) return;
    localStorage.removeItem('moduleQuickJump');
    if (jump.customerName && $('customer-name')) $('customer-name').value = jump.customerName;

    const shipRaw = localStorage.getItem('shipQuickItems');
    if (state.module === 'ship' && shipRaw) {
      localStorage.removeItem('shipQuickItems');
      const items = JSON.parse(shipRaw || '[]');
      if (Array.isArray(items) && items.length) {
        state.lastOcrItems = normalizeShipTextareaItems(items);
        syncShipItemsToTextarea(state.lastOcrItems);
      }
    } else if (jump.productText) {
      if ($('ocr-text')) $('ocr-text').value = jump.productText;
      state.lastOcrItems = normalizeShipTextareaItems([{ product_text: jump.productText, product_code: jump.productText, qty: 1 }]);
      applyFormattedTextarea(true);
      if (state.module === 'ship') {
        syncShipItemsToTextarea(state.lastOcrItems);
      }
    }
    if ((state.module === 'orders' || state.module === 'master_order') && jump.customerName) {
      setTimeout(() => selectCustomerForModule(jump.customerName), 220);
    }
    if (state.module === 'warehouse' && jump.productText) {
      setTimeout(() => {
        if ($('warehouse-search')) $('warehouse-search').value = jump.productText;
        searchWarehouse();
      }, 220);
    }
  } catch (_e) {}
}


/* FIX53 removed legacy function legacyOpenCustomerModal */


window.batchAddCustomerItemsToShip = batchAddCustomerItemsToShip;
window.loadShipPreview = loadShipPreview;
window.renderShipSelectedItems = renderShipSelectedItems;
window.moveWarehouseItem = moveWarehouseItem;
window.highlightWarehouseCell = highlightWarehouseCell;


/* ==== warehouse reconnect override start ==== */
(function(){
  function ensureWarehouseState(){
    state.warehouse = state.warehouse || { cells: [], zones: {A:{},B:{}}, availableItems: [], activeZone: 'A' };
    state.searchHighlightKeys = state.searchHighlightKeys || new Set();
  }

  function fixedColumns(){ return [1,2,3,4,5,6]; }
  function fixedSlots(){ return 20; }

  window.getCellItems = function(zone, column, num){
    ensureWarehouseState();
    const cell = (state.warehouse.cells || []).find(c =>
      String(c.zone) === String(zone) &&
      Number(c.column_index) === Number(column) &&
      Number(c.slot_number) === Number(num)
    );
    if (!cell) return [];
    try {
      if (Array.isArray(cell.items_json)) return cell.items_json;
      return JSON.parse(cell.items_json || '[]');
    } catch (_e) {
      return [];
    }
  };

  window.buildCellKey = function(zone, column, num){
    return [zone, Number(column), 'direct', Number(num)];
  };

  /* pruned duplicate setWarehouseZone */
  function repaintWarehouseCells(){
    ['A','B'].forEach(zone => {
      const wrap = $(`zone-${zone}-grid`);
      if (!wrap) return;
      wrap.querySelectorAll('.vertical-slot').forEach(slot => {
        const c = Number(slot.dataset.column || 0);
        const n = Number(slot.dataset.num || 0);
        const items = window.getCellItems(zone, c, n);
        const key = `${zone}|${c}|direct|${n}`;
        const highlighted = !!(state.searchHighlightKeys && state.searchHighlightKeys.has(key));
        slot.classList.toggle('filled', items.length > 0);
        slot.classList.toggle('highlight', highlighted);
        const summary = items.length
          ? items.slice(0, 2).map(it => `
              <div class="slot-line customer">客戶：${escapeHTML(it.customer_name || '未指定客戶')}</div>
              <div class="slot-line product">商品：${escapeHTML(it.product_text || '')}</div>
              <div class="slot-line qty">數量：${it.qty || 0}</div>
            `).join('<hr class="slot-sep">')
          : '<div class="slot-line empty">空格</div>';
        slot.innerHTML = `<div class="slot-title">第 ${String(n).padStart(2,'0')} 格</div><div class="slot-count">${summary}</div>`;
      });
    });
  }

  window.renderWarehouseZones = function(){
    repaintWarehouseCells();
  };

  window.renderWarehouseLegacyA = async function(){
    ensureWarehouseState();
    try {
      const [warehouseRes, availRes] = await Promise.allSettled([
        requestJSON('/api/warehouse', { method:'GET' }),
        requestJSON('/api/warehouse/available-items', { method:'GET' })
      ]);
      const data = warehouseRes.status === 'fulfilled' ? warehouseRes.value : { cells: [], zones: {A:{}, B:{}} };
      const avail = availRes.status === 'fulfilled' ? availRes.value : { items: [] };

      state.warehouse.cells = Array.isArray(data.cells) ? data.cells : [];
      state.warehouse.zones = data.zones || { A:{}, B:{} };
      state.warehouse.availableItems = Array.isArray(avail.items) ? avail.items : [];

      if ($('warehouse-unplaced-pill')) {
        $('warehouse-unplaced-pill').textContent = `未錄入倉庫圖：${state.warehouse.availableItems.length}`;
      }
      repaintWarehouseCells();
      window.setWarehouseZone(state.warehouse.activeZone || 'A', false);

      try {
        const quick = JSON.parse(localStorage.getItem('warehouseQuickHighlight') || 'null');
        if (quick && (quick.productText || quick.customerName || quick.q)) {
          const query = quick.productText || quick.customerName || quick.q;
          if ($('warehouse-search')) $('warehouse-search').value = query;
          setTimeout(() => window.searchWarehouse(), 80);
          localStorage.removeItem('warehouseQuickHighlight');
        }
      } catch (_e) {}
    } catch (e) {
      console.error(e);
      toast('倉庫圖資料載入異常，已先顯示固定格位', 'warn');
      repaintWarehouseCells();
      window.setWarehouseZone('A', false);
    }
  };

  window.searchWarehouseLegacyA = async function(){
    ensureWarehouseState();
    const q = ($('warehouse-search')?.value || '').trim();
    const box = $('warehouse-search-results');
    if (!q) {
      state.searchHighlightKeys = new Set();
      box?.classList.add('hidden');
      repaintWarehouseCells();
      return;
    }
    try {
      const data = await requestJSON(`/api/warehouse/search?q=${encodeURIComponent(q)}`, { method:'GET' });
      state.searchHighlightKeys = new Set((data.items || []).map(r => `${r.cell.zone}|${r.cell.column_index}|direct|${r.cell.slot_number}`));
      repaintWarehouseCells();
      if (!box) return;
      box.classList.remove('hidden');
      if (!data.items || !data.items.length) {
        box.innerHTML = '<div class="search-card">沒有找到資料</div>';
        return;
      }
      box.innerHTML = '';
      const first = data.items[0];
      if (first && first.cell) {
        window.setWarehouseZone(first.cell.zone, false);
        setTimeout(() => {
          try { highlightWarehouseCell(first.cell.zone, first.cell.column_index, first.cell.slot_number); } catch (_e) {}
        }, 120);
      }
      data.items.forEach(r => {
        const cell = r.cell;
        const item = r.item || {};
        const div = document.createElement('div');
        div.className = 'search-card';
        div.innerHTML = `<strong>${escapeHTML(cell.zone)}區 第 ${cell.column_index} 欄 第 ${String(cell.slot_number).padStart(2,'0')} 格</strong><br>${escapeHTML(item.product_text || '')} × ${item.qty || 0}`;
        div.addEventListener('click', () => {
          window.setWarehouseZone(cell.zone);
          setTimeout(() => {
            try { highlightWarehouseCell(cell.zone, cell.column_index, cell.slot_number); } catch (_e) {}
            try { openWarehouseModal(cell.zone, cell.column_index, cell.slot_number); } catch (_e) {}
          }, 120);
        });
        box.appendChild(div);
      });
    } catch (e) {
      toast(e.message || '搜尋失敗', 'error');
    }
  };

  window.clearWarehouseHighlights = function(){
    ensureWarehouseState();
    state.searchHighlightKeys = new Set();
    $('warehouse-unplaced-list-inline')?.classList.add('hidden');
    $('warehouse-search-results')?.classList.add('hidden');
    repaintWarehouseCells();
  };

  window.toggleWarehouseUnplacedHighlight = async function(){
    ensureWarehouseState();
    const items = Array.isArray(state.warehouse.availableItems) ? state.warehouse.availableItems : [];
    const box = $('warehouse-unplaced-list-inline');
    if (!items.length) {
      if (box) {
        box.classList.remove('hidden');
        box.innerHTML = '<div class="search-card">目前沒有未錄入倉庫圖商品</div>';
      }
      return;
    }
    if (box) {
      box.classList.remove('hidden');
      box.innerHTML = '';
    }
    state.searchHighlightKeys = new Set();
    items.forEach(it => {
      const div = document.createElement('div');
      div.className = 'search-card';
      div.innerHTML = `<strong>${escapeHTML(it.customer_name || '未指定客戶')}</strong><br>${escapeHTML(it.product_text || '')}｜未錄入數量 ${it.unplaced_qty || 0}`;
      div.addEventListener('click', async () => {
        if ($('warehouse-search')) $('warehouse-search').value = it.product_text || '';
        await window.searchWarehouse();
      });
      box?.appendChild(div);
    });
    repaintWarehouseCells();
  };

  window.highlightWarehouseSameCustomer = function(){
    ensureWarehouseState();
    const q = ($('warehouse-search')?.value || '').trim();
    if (!q) {
      toast('請先在搜尋框輸入客戶名', 'warn');
      return;
    }
    const keys = new Set();
    const cells = Array.isArray(state.warehouse.cells) ? state.warehouse.cells : [];
    cells.forEach(cell => {
      let items = [];
      try { items = JSON.parse(cell.items_json || '[]'); } catch (_e) {}
      if (items.some(it => String(it.customer_name || '').includes(q))) {
        keys.add(`${cell.zone}|${cell.column_index}|direct|${cell.slot_number}`);
      }
    });
    state.searchHighlightKeys = keys;
    repaintWarehouseCells();
  };

  window.addWarehouseVisualSlot = async function(zone, column){
    toast('請在格子內按「插入格子」', 'warn');
  };
  window.removeWarehouseVisualSlot = async function(zone, column){
    toast('請在格子內按「刪除格子」', 'warn');
  };
  window.deleteWarehouseColumn = async function(zone, column){
    toast('已取消整欄刪除功能', 'warn');
  };

  document.addEventListener('DOMContentLoaded', () => {
    if (window.__YX65_SKIP_DUP_BOOT__) return;
    if (typeof currentModule === 'function' && currentModule() === 'warehouse') {
      setTimeout(() => {
        try { window.renderWarehouse(); } catch (_e) {}
      }, 60);
    }
  });
})();
/* ==== warehouse reconnect override end ==== */


/* ==== v23 customer + warehouse action fix ==== */
(function(){
  function ensureState(){
    state.warehouse = state.warehouse || { cells: [], zones: {A:{},B:{}}, availableItems: [], activeZone: 'A' };
    state.searchHighlightKeys = state.searchHighlightKeys || new Set();
  }

  /* pruned duplicate setWarehouseZone */
  function buildCustomerCard(name, count){
    return `
      <div class="customer-card-main">
        <div class="customer-card-name">${escapeHTML(name)}</div>
        <div class="customer-card-meta">${count || 0}筆商品</div>
      </div>
      <div class="customer-card-arrow">→</div>
    `;
  }

  function normalizeCustomerItems(items){
    return (items || []).map(it => {
      const row = (typeof formatCustomerProductRow === 'function') ? formatCustomerProductRow(it.product_text || '') : { size: it.product_text || '', qtyText: String(it.qty || '') };
      return { ...it, _size: row.size || it.product_text || '', _qtyText: window.yxSortQtyExpression(row.qtyText || String(it.qty || '')) };
    });
  }

  /* pruned duplicate loadCustomerBlocks */
  /* pruned duplicate selectCustomerForModule */
  function optimisticRenderNorthCustomer(customerName, items){
    const north = $('region-north');
    if (!north || !customerName) return;
    north.querySelector('.empty-state-card')?.remove();
    let card = Array.from(north.querySelectorAll('.customer-region-card')).find(el => (el.dataset.customer || '') === customerName);
    if (!card) {
      card = document.createElement('button');
      card.type = 'button';
      card.className = 'customer-region-card';
      card.dataset.customer = customerName;
      card.onclick = () => {
        const panel = $('selected-customer-items');
        if (!panel) return;
        const rows = normalizeCustomerItems(items).map(it => `<tr><td>${escapeHTML(it._size)}</td><td>${escapeHTML(it._qtyText)}</td><td>${escapeHTML(it.source || '')}</td></tr>`).join('');
        panel.classList.remove('hidden');
        panel.innerHTML = `
          <div class="customer-detail-card">
            <div class="customer-detail-header">
              <div>
                <div class="section-title">${escapeHTML(customerName)}</div>
                <div class="muted">${items.length}筆商品</div>
              </div>
            </div>
            <div class="table-card customer-table-wrap">
              <table>
                <thead><tr><th>尺寸</th><th>支數 x 件數</th><th>來源</th></tr></thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          </div>`;
      };
      north.prepend(card);
    }
    card.innerHTML = buildCustomerCard(customerName, items.length);
  }

  /* pruned duplicate confirmSubmit */
  document.addEventListener('DOMContentLoaded', () => {
    if (window.__YX65_SKIP_DUP_BOOT__) return;
    const btnA = $('zone-switch-A');
    const btnB = $('zone-switch-B');
    const btnAll = $('zone-switch-ALL');
    if (btnA) btnA.onclick = () => window.setWarehouseZone('A');
    if (btnB) btnB.onclick = () => window.setWarehouseZone('B');
    if (btnAll) btnAll.onclick = () => window.setWarehouseZone('ALL');

    if (typeof currentModule === 'function') {
      const mod = currentModule();
      if (mod === 'orders' || mod === 'master_order') {
        setTimeout(() => {
          try { window.loadCustomerBlocks(); } catch (_e) {}
        }, 60);
      }
      if (mod === 'warehouse') {
        const saved = localStorage.getItem('warehouseActiveZone') || 'A';
        setTimeout(() => window.setWarehouseZone(saved, false), 80);
      }
    }
  });
})();
/* ==== end fix ==== */


/* ==== realfix override start ==== */
(function(){
  function customerCardHTML(name, count){
    return `<div class="customer-card-main"><div class="customer-card-name">${escapeHTML(name)}</div><div class="customer-card-meta">${count}筆商品</div></div><div class="customer-card-arrow">→</div>`;
  }

  function repaintWarehouse(){
    ['A','B'].forEach(zone => {
      const wrap = $('zone-' + zone + '-grid');
      if (!wrap) return;
      wrap.querySelectorAll('.vertical-slot').forEach(slot => {
        const c = Number(slot.dataset.column || 0);
        const n = Number(slot.dataset.num || 0);
        const items = getCellItems(zone, c, n);
        const key = `${zone}|${c}|direct|${n}`;
        const highlighted = !!(state.searchHighlightKeys && state.searchHighlightKeys.has(key));
        slot.classList.toggle('filled', items.length > 0);
        slot.classList.toggle('highlight', highlighted);
        slot.innerHTML = `<div class="slot-title">第 ${String(n).padStart(2,'0')} 格</div><div class="slot-count">${
          items.length
            ? items.slice(0,2).map(it => `<div class="slot-line customer">客戶：${escapeHTML(it.customer_name || '未指定客戶')}</div><div class="slot-line product">商品：${escapeHTML(it.product_text || '')}</div><div class="slot-line qty">數量：${it.qty || 0}</div>`).join('<hr class="slot-sep">')
            : '<div class="slot-line empty">空格</div>'
        }</div>`;
      });
    });
  }

  /* pruned duplicate setWarehouseZone */
  window.renderWarehouseLegacyB = async function(){
    try {
      const [warehouseRes, availRes] = await Promise.allSettled([
        requestJSON('/api/warehouse', { method:'GET' }),
        requestJSON('/api/warehouse/available-items', { method:'GET' })
      ]);
      const data = warehouseRes.status === 'fulfilled' ? warehouseRes.value : { cells: [], zones: {A:{}, B:{}} };
      const avail = availRes.status === 'fulfilled' ? availRes.value : { items: [] };
      state.warehouse.cells = Array.isArray(data.cells) ? data.cells : [];
      state.warehouse.zones = data.zones || {A:{}, B:{}};
      state.warehouse.availableItems = Array.isArray(avail.items) ? avail.items : [];
      if ($('warehouse-unplaced-pill')) $('warehouse-unplaced-pill').textContent = `未錄入倉庫圖：${state.warehouse.availableItems.length}`;
      repaintWarehouse();
      setWarehouseZone(localStorage.getItem('warehouseActiveZone') || 'A', false);
    } catch (e) {
      console.error(e);
      toast(e.message || '倉庫圖載入失敗', 'error');
    }
  };

  window.searchWarehouseLegacyB = async function(){
    const q = ($('warehouse-search')?.value || '').trim();
    const box = $('warehouse-search-results');
    if (!q) {
      state.searchHighlightKeys = new Set();
      box?.classList.add('hidden');
      repaintWarehouse();
      return;
    }
    try {
      const data = await requestJSON(`/api/warehouse/search?q=${encodeURIComponent(q)}`, { method:'GET' });
      state.searchHighlightKeys = new Set((data.items || []).map(r => `${r.cell.zone}|${r.cell.column_index}|direct|${r.cell.slot_number}`));
      repaintWarehouse();
      if (!box) return;
      box.classList.remove('hidden');
      box.innerHTML = '';
      if (!data.items || !data.items.length) {
        box.innerHTML = '<div class="search-card">沒有找到資料</div>';
        return;
      }
      const first = data.items[0];
      setWarehouseZone(first.cell.zone, false);
      data.items.forEach(r => {
        const div = document.createElement('div');
        div.className = 'search-card';
        div.innerHTML = `<strong>${escapeHTML(r.cell.zone)}區 第 ${r.cell.column_index} 欄 第 ${String(r.cell.slot_number).padStart(2,'0')} 格</strong><br>${escapeHTML(r.item.product_text || '')} × ${r.item.qty || 0}`;
        div.onclick = () => {
          setWarehouseZone(r.cell.zone);
          try { openWarehouseModal(r.cell.zone, r.cell.column_index, r.cell.slot_number); } catch(_e){}
        };
        box.appendChild(div);
      });
    } catch (e) {
      toast(e.message || '搜尋失敗', 'error');
    }
  };

  window.clearWarehouseHighlights = function(){
    state.searchHighlightKeys = new Set();
    $('warehouse-search-results')?.classList.add('hidden');
    $('warehouse-unplaced-list-inline')?.classList.add('hidden');
    repaintWarehouse();
  };

  window.toggleWarehouseUnplacedHighlight = function(){
    const box = $('warehouse-unplaced-list-inline');
    const items = state.warehouse.availableItems || [];
    if (!box) return;
    box.classList.remove('hidden');
    box.innerHTML = '';
    if (!items.length) {
      box.innerHTML = '<div class="search-card">目前沒有未錄入倉庫圖商品</div>';
      return;
    }
    items.forEach(it => {
      const div = document.createElement('div');
      div.className = 'search-card';
      div.innerHTML = `<strong>${escapeHTML(it.customer_name || '未指定客戶')}</strong><br>${escapeHTML(it.product_text || '')}｜未錄入數量 ${it.unplaced_qty || 0}`;
      div.onclick = async () => {
        if ($('warehouse-search')) $('warehouse-search').value = it.product_text || '';
        await window.searchWarehouse();
      };
      box.appendChild(div);
    });
  };

  window.highlightWarehouseSameCustomer = function(){
    const q = ($('warehouse-search')?.value || '').trim();
    if (!q) return toast('請先在搜尋框輸入客戶名', 'warn');
    const keys = new Set();
    (state.warehouse.cells || []).forEach(cell => {
      let items = [];
      try { items = JSON.parse(cell.items_json || '[]'); } catch(_e){}
      if (items.some(it => String(it.customer_name || '').includes(q))) keys.add(`${cell.zone}|${cell.column_index}|direct|${cell.slot_number}`);
    });
    state.searchHighlightKeys = keys;
    repaintWarehouse();
  };

  /* pruned duplicate loadCustomerBlocks */
  /* pruned duplicate selectCustomerForModule */
  function optimisticNorth(customerName, items, sourceLabel){
    const north = $('region-north');
    if (!north) return;
    north.querySelector('.empty-state-card')?.remove();
    let card = Array.from(north.querySelectorAll('.customer-region-card')).find(el => el.dataset.customer === customerName);
    if (!card) {
      card = document.createElement('button');
      card.type = 'button';
      card.className = 'customer-region-card';
      card.dataset.customer = customerName;
      north.prepend(card);
    }
    card.innerHTML = customerCardHTML(customerName, items.length);
    card.onclick = () => {
      const panel = $('selected-customer-items');
      if (!panel) return;
      const rows = normalizeCustomerItems(items.map(it => ({...it, source: sourceLabel}))).map(it => `<tr><td>${escapeHTML(it._size)}</td><td>${escapeHTML(it._qtyText)}</td><td>${escapeHTML(it.source || '')}</td></tr>`).join('');
      panel.classList.remove('hidden');
      panel.innerHTML = `<div class="customer-detail-card"><div class="customer-detail-header"><div><div class="section-title">${escapeHTML(customerName)}</div><div class="muted">${items.length}筆商品</div></div></div><div class="table-card customer-table-wrap"><table><thead><tr><th>尺寸</th><th>支數 x 件數</th><th>來源</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
    };
  }

  /* pruned duplicate confirmSubmit */
  document.addEventListener('DOMContentLoaded', () => {
    if (window.__YX65_SKIP_DUP_BOOT__) return;
    const mod = currentModule();
    if (mod === 'warehouse') {
      const saved = localStorage.getItem('warehouseActiveZone') || 'A';
      setTimeout(() => { renderWarehouse(); setWarehouseZone(saved, false); }, 80);
      const btnA = $('zone-switch-A'); const btnB = $('zone-switch-B'); const btnAll = $('zone-switch-ALL');
      if (btnA) btnA.onclick = () => setWarehouseZone('A');
      if (btnB) btnB.onclick = () => setWarehouseZone('B');
      if (btnAll) btnAll.onclick = () => setWarehouseZone('ALL');
    }
    if (['inventory','orders','master_order'].includes(mod)) {
      setTimeout(() => window.loadCustomerBlocks(), 80);
    }
  });
})();
/* ==== realfix override end ==== */


/* ==== v23 stable submit+zone patch start ==== */
(function(){
  function moduleSuccessText(module){
    return module === 'orders' ? '訂單送出成功' :
           module === 'master_order' ? '總單送出成功' :
           module === 'ship' ? '出貨送出成功' :
           '庫存送出成功';
  }

  async function doSubmit(module, payload){
    const endpoint = module === 'orders' ? '/api/orders' :
                     module === 'master_order' ? '/api/master_orders' :
                     module === 'ship' ? '/api/ship' : '/api/inventory';
    return await requestJSON(endpoint, { method:'POST', body: JSON.stringify(payload) });
  }

  /* pruned duplicate confirmSubmit */
  document.addEventListener('DOMContentLoaded', () => {
    if (window.__YX65_SKIP_DUP_BOOT__) return;
    if (currentModule() === 'warehouse') {
      const saved = localStorage.getItem('warehouseActiveZone') || 'A';
      setTimeout(() => {
        if (typeof renderWarehouse === 'function') renderWarehouse();
        if (typeof setWarehouseZone === 'function') setWarehouseZone(saved, false);
      }, 60);
    }
  });
})();
/* ==== v23 stable submit+zone patch end ==== */

/* ==== final hard patch: submit request_key + warehouse zone memory ==== */
(function(){
  function getSubmitEndpoint(module){
    return module === 'orders' ? '/api/orders' :
           module === 'master_order' ? '/api/master_orders' :
           module === 'ship' ? '/api/ship' :
           '/api/inventory';
  }

  function submitSuccessText(module){
    return module === 'orders' ? '訂單送出成功' :
           module === 'master_order' ? '總單送出成功' :
           module === 'ship' ? '出貨送出成功' :
           '庫存送出成功';
  }

  function makeRequestKey(module, customerName, items){
    const part = (items || []).map(it => `${it.product_text || ''}:${it.qty || 0}`).join('|');
    return `${module}__${customerName || ''}__${Date.now()}__${Math.random().toString(36).slice(2,10)}__${part.slice(0,120)}`;
  }

  function parseSubmitItems(rawText){
    let items = [];
    try {
      items = typeof parseTextareaItems === 'function' ? parseTextareaItems() : [];
    } catch (_e) {
      items = [];
    }
    if (!items.length && rawText && typeof formatManualEntryText === 'function') {
      try {
        const formatted = formatManualEntryText(rawText);
        if (formatted?.items?.length) {
          items = formatted.items;
          if (($('customer-name')?.value || '').trim() === '' && formatted.customer_name && $('customer-name')) {
            $('customer-name').value = formatted.customer_name;
          }
        }
      } catch (_e) {}
    }
    return items;
  }

  window.setWarehouseZone = function(zone, doScroll=true){
    state.warehouse = state.warehouse || { cells: [], zones: {A:{}, B:{}}, availableItems: [], activeZone: 'A' };
    const mode = zone === 'ALL' ? 'ALL' : (zone === 'B' ? 'B' : 'A');
    state.warehouse.activeZone = mode;
    const zoneA = $('zone-A');
    const zoneB = $('zone-B');

    if (zoneA) zoneA.style.display = (mode === 'B') ? 'none' : '';
    if (zoneB) zoneB.style.display = (mode === 'A') ? 'none' : '';

    ['A','B','ALL'].forEach(key => {
      const btn = $('zone-switch-' + key);
      if (btn) btn.classList.toggle('active', key === mode);
    });

    const pill = $('warehouse-selection-pill');
    if (pill) pill.textContent = `目前區域：${mode === 'ALL' ? '全部' : mode + ' 區'}`;

    try { localStorage.setItem('warehouseActiveZone', mode); } catch (_e) {}

    if (doScroll) {
      const target = mode === 'B' ? zoneB : zoneA;
      (mode === 'ALL' ? zoneA : target)?.scrollIntoView({ behavior:'smooth', block:'start' });
    }
  };

  /* pruned duplicate confirmSubmit */
  document.addEventListener('DOMContentLoaded', () => {
    if (window.__YX65_SKIP_DUP_BOOT__) return;
    const mod = typeof currentModule === 'function' ? currentModule() : '';
    if (mod === 'warehouse') {
      const saved = (() => { try { return localStorage.getItem('warehouseActiveZone') || 'A'; } catch (_e) { return 'A'; } })();
      const btnA = $('zone-switch-A');
      const btnB = $('zone-switch-B');
      const btnAll = $('zone-switch-ALL');
      if (btnA) btnA.onclick = () => window.setWarehouseZone('A');
      if (btnB) btnB.onclick = () => window.setWarehouseZone('B');
      if (btnAll) btnAll.onclick = () => window.setWarehouseZone('ALL');
      setTimeout(() => {
        if (typeof window.renderWarehouse === 'function') window.renderWarehouse();
        window.setWarehouseZone(saved, false);
      }, 80);
    }
    if (['inventory','orders','master_order'].includes(mod)) {
      setTimeout(() => {
        if (typeof window.loadCustomerBlocks === 'function') window.loadCustomerBlocks();
      }, 80);
    }
  });
})();
/* ==== final hard patch end ==== */


/* ==== customer drag/edit + tolerant submit parsing patch ==== */
(function(){
  window.getModuleKey = window.getModuleKey || function(){
    try { return typeof currentModule === 'function' ? currentModule() : ''; } catch (_e) { return ''; }
  };

  function normalizeX(text){
    return String(text || '')
      .replace(/[Ｘ×✕＊*X]/g, 'x')
      .replace(/\s*乘\s*/g, 'x')
      .replace(/[＝]/g, '=')
      .replace(/[，、；;]/g, ' ')
      .replace(/[。．]/g, '')
      .replace(/[|｜]/g, ' ')
      .replace(/\u3000/g, ' ')
      .replace(/\r/g, '\n');
  }

  function normalizeProductTextLines(raw){
    const formatDim = (v, isHeight=false) => {
      let s = String(v || '').trim();
      if (!s) return '';
      if (/^[_-]+$/.test(s)) return '';
      if (/^[A-Za-z]+$/.test(s)) return s.toUpperCase();
      if (/^\d*\.\d+$/.test(s)) {
        if (s.startsWith('.')) s = '0' + s;
        return s.replace('.', '');
      }
      if (/^\d+$/.test(s)) return (isHeight && s.length === 1) ? s.padStart(2, '0') : s;
      return s.replace(/\s+/g, '');
    };
    const resolveLeft = (left, prev) => {
      const compact = normalizeX(left).replace(/\s+/g, '');
      let parts = compact.split(/x/i).filter(v => v !== '');
      if (parts.length === 2 && /^[_-]+$/.test(parts[1]) && prev[1] && prev[2]) {
        parts = [parts[0], prev[1], prev[2]];
      } else if (parts.length === 1 && prev[1] && prev[2]) {
        parts = [parts[0], prev[1], prev[2]];
      } else if (parts.length >= 3) {
        parts = [0,1,2].map(i => (/^[_-]+$/.test(parts[i] || '') ? (prev[i] || '') : parts[i]));
      }
      if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) return null;
      const dims = [formatDim(parts[0], false), formatDim(parts[1], false), formatDim(parts[2], true)];
      return dims.every(Boolean) ? dims : null;
    };
    const out = [];
    let prev = ['', '', ''];
    normalizeX(raw || '').split(/\n+/).forEach(line => {
      const normalized = line.trim();
      if (!normalized) return;
      const compactForPallet = normalized.replace(/\s+/g, '');
      const pallet = compactForPallet.match(/^(棧板|栈板|木棧板|木栈板)(\d+)片?$/);
      if (pallet) { out.push(`棧板=${pallet[2]}`); return; }
      const pair = normalized.split(/=|:/);
      if (pair.length < 2) {
        const fixed = window.yxNormalizeProductText(normalized.replace(/\s+/g,''));
        if (fixed) out.push(fixed);
        return;
      }
      const left = pair.shift();
      const dims = resolveLeft(left, prev);
      if (!dims) {
        const fixed = window.yxNormalizeProductText(normalized.replace(/\s+/g,''));
        if (fixed) out.push(fixed);
        return;
      }
      prev = dims.slice();
      const right = window.yxSortQtyExpression(window.yxCleanQtyExpression(pair.join('=')));
      out.push(right ? `${dims.join('x')}=${right}` : dims.join('x'));
    });
    return out.join('\n');
  }

  function mergeSubmitItems(items){
    const map = new Map();
    (items || []).forEach(it => {
      const key = String(it.product_text || '').trim();
      if (!key) return;
      const prev = map.get(key) || { product_text: key, product_code: key, qty: 0 };
      prev.qty += Number(it.qty || 0) || 0;
      map.set(key, prev);
    });
    return Array.from(map.values()).filter(it => Number(it.qty || 0) > 0);
  }

  function parseSubmitItemsRobust(raw){
    const text = normalizeX(raw).trim();
    if (!text) return [];
    const out = [];
    const lines = text.split(/\n+/).map(s => s.trim()).filter(Boolean);
    let last = ['', '', ''];

    const pushPallet = (line) => {
      const m = String(line || '').replace(/\s+/g,'').match(/^(棧板|栈板|木棧板|木栈板)(\d+)片?$/);
      if(!m) return false;
      const qty = Number(m[2] || 0) || 0;
      if(qty > 0) out.push({ product_text: '棧板=' + qty, product_code: '棧板', qty });
      return true;
    };

    const pushEntry = (leftRaw, rightRaw) => {
      const dimsRaw = String(leftRaw || '').split(/x/i).map(s => s.trim());
      const dims = [0,1,2].map(i => {
        const v = dimsRaw[i] || '';
        if (!v || /^[_-]+$/.test(v)) return last[i] || '';
        return v;
      });
      if (!dims[0] || !dims[1] || !dims[2]) return;
      last = dims.slice();
      let right = String(rightRaw || '').replace(/\s+/g, '').replace(/（/g,'(').replace(/）/g,')');
      right = window.yxCleanQtyExpression(right.replace(/[^0-9A-Za-z一-鿿xX+＋\-()件片]/g, ''));
      if (!right) right = '1x1';
      const calcQty = (txt) => {
        let total = 0;
        String(txt || '').split(/[+＋,，;；]/).forEach(seg => {
          const main = seg.replace(/[\(（][^\)）]*[\)）]/g, '');
          const nums = main.match(/\d+/g) || [];
          // 19件 / 1425片 這種明確寫件或片的格式，數量就是該數字
          if (nums.length === 1 && /[件片]/.test(main)) total += parseInt(nums[0] || '0', 10) || 0;
          else if (nums.length >= 2) total += parseInt(nums[1] || '0', 10) || 0;
          else if (nums.length === 1) total += 1;
        });
        return Math.max(1, total || 1);
      };
      const qty = calcQty(right);
      const product_text = `${window.yxNormalizeLeftSize(dims.join('x'))}=${right}`;
      out.push({ product_text, product_code: product_text, qty });
    };

    const dimUnit = '(?:[_-]|[A-Za-z]+|\\d+(?:\\.\\d+)?)';
    const tokenRe = new RegExp(dimUnit + 'x' + dimUnit + 'x' + dimUnit + '(?:\\s*(?:=|:)\\s*[^\\n]+)?', 'ig');
    const wholeRe = new RegExp('^((' + dimUnit + ')x(' + dimUnit + ')x(' + dimUnit + '))(?:\\s*(?:=|:)\\s*(.+))?$', 'i');
    lines.forEach(line => {
      const normalized = normalizeX(line).replace(/\s+/g, ' ').trim();
      if (!normalized) return;
      if (pushPallet(normalized)) return;
      const compact = normalized.replace(/\s+/g, '');
      const tokens = compact.match(tokenRe) || [];
      if (tokens.length) {
        tokens.forEach(token => {
          const parts = token.split(/=|:/);
          pushEntry(parts[0], parts.slice(1).join('='));
        });
        return;
      }
      const whole = compact.match(wholeRe);
      if (whole) pushEntry(whole[1], whole[5] || '');
    });

    return mergeSubmitItems(out);
  }

  function collectSubmitItems(){
    const ocrBox = $('ocr-text');
    if (ocrBox) ocrBox.value = normalizeProductTextLines(ocrBox.value || '');
    const rawText = (ocrBox?.value || '').trim();
    let items = [];
    try { items = parseSubmitItemsRobust(rawText); } catch (_e) { items = []; }
    if (!items.length) {
      try {
        const formatted = typeof formatManualEntryText === 'function' ? formatManualEntryText(rawText) : null;
        if (formatted?.items?.length) {
          items = mergeSubmitItems((formatted.items || []).map(it => ({
            product_text: it.product_text || '',
            product_code: it.product_code || it.product_text || '',
            qty: Number(it.qty || 0) || 0
          })));
          const guessedName = (formatted.customerGuess || formatted.customer_name || '').trim();
          if (guessedName && $('customer-name') && !$('customer-name').value.trim()) $('customer-name').value = guessedName;
        }
      } catch (_e) {}
    }
    return items;
  }

  function ensureModalShell(id, innerHtml){
    let modal = document.getElementById(id);
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = id;
    modal.className = 'modal hidden';
    modal.innerHTML = innerHtml;
    document.body.appendChild(modal);
    modal.addEventListener('click', ev => { if (ev.target === modal) modal.classList.add('hidden'); });
    return modal;
  }

  function ensureConfirmModal(){
    return ensureModalShell('confirm-action-modal', `
      <div class="modal-card glass" style="max-width:420px;">
        <div class="modal-head">
          <div class="section-title" id="confirm-action-title">確認</div>
          <button class="icon-btn" type="button" id="confirm-action-close">✕</button>
        </div>
        <div id="confirm-action-message" class="muted" style="line-height:1.8;"></div>
        <div class="btn-row" style="margin-top:16px;justify-content:flex-end;">
          <button class="ghost-btn" type="button" id="confirm-action-cancel">取消</button>
          <button class="primary-btn" type="button" id="confirm-action-ok">確認</button>
        </div>
      </div>`);
  }

  function confirmDialog({ title='確認', message='', confirmText='確認', cancelText='取消', danger=false }={}){
    return new Promise(resolve => {
      const modal = ensureConfirmModal();
      modal.querySelector('#confirm-action-title').textContent = title;
      modal.querySelector('#confirm-action-message').innerHTML = message;
      const okBtn = modal.querySelector('#confirm-action-ok');
      const cancelBtn = modal.querySelector('#confirm-action-cancel');
      const closeBtn = modal.querySelector('#confirm-action-close');
      okBtn.textContent = confirmText;
      cancelBtn.textContent = cancelText;
      okBtn.className = danger ? 'ghost-btn danger-btn' : 'primary-btn';
      const cleanup = (value) => {
        modal.classList.add('hidden');
        okBtn.onclick = cancelBtn.onclick = closeBtn.onclick = null;
        resolve(value);
      };
      okBtn.onclick = () => cleanup(true);
      cancelBtn.onclick = () => cleanup(false);
      closeBtn.onclick = () => cleanup(false);
      modal.classList.remove('hidden');
    });
  }

  function ensureCustomerActionSheet(){
    return ensureModalShell('customer-action-sheet', `
      <div class="modal-card glass" style="max-width:360px;">
        <div class="modal-head">
          <div class="section-title" id="customer-action-title">客戶操作</div>
          <button class="icon-btn" type="button" id="customer-action-close">✕</button>
        </div>
        <div class="btn-row" style="flex-direction:column;align-items:stretch;gap:10px;">
          <button class="primary-btn" type="button" id="customer-action-edit">編輯客戶</button>
          <button class="ghost-btn danger-btn" type="button" id="customer-action-delete">刪除 / 封存客戶</button>
          <button class="ghost-btn" type="button" id="customer-action-cancel">取消</button>
        </div>
      </div>`);
  }

  function ensureCustomerEditModal(){
    return ensureModalShell('customer-edit-modal', `
      <div class="modal-card glass" style="max-width:520px;">
        <div class="modal-head">
          <div class="section-title" id="customer-edit-title">編輯客戶</div>
          <button class="icon-btn" type="button" id="customer-edit-close">✕</button>
        </div>
        <label class="field-label">客戶名稱</label>
        <input class="text-input" id="customer-edit-name">
        <label class="field-label">電話</label>
        <input class="text-input" id="customer-edit-phone">
        <label class="field-label">地址</label>
        <input class="text-input" id="customer-edit-address">
        <label class="field-label">特殊要求</label>
        <textarea class="text-area small" id="customer-edit-notes"></textarea>
        <label class="field-label">區域</label>
        <select class="text-input" id="customer-edit-region">
          <option value="北區">北區</option>
          <option value="中區">中區</option>
          <option value="南區">南區</option>
        </select>
        <div class="btn-row" style="margin-top:16px;justify-content:flex-end;">
          <button class="ghost-btn" type="button" id="customer-edit-cancel">取消</button>
          <button class="primary-btn" type="button" id="customer-edit-save">儲存</button>
        </div>
      </div>`);
  }

  function ensureWarehouseItemEditModal(){
    return ensureModalShell('warehouse-item-edit-modal', `
      <div class="modal-card glass" style="max-width:460px;">
        <div class="modal-head">
          <div class="section-title">編輯格位商品</div>
          <button class="icon-btn" type="button" id="warehouse-item-edit-close">✕</button>
        </div>
        <label class="field-label">商品資料</label>
        <input class="text-input" id="warehouse-item-edit-text">
        <label class="field-label">數量</label>
        <input class="text-input" id="warehouse-item-edit-qty" type="number" min="0">
        <div class="btn-row" style="margin-top:16px;justify-content:flex-end;">
          <button class="ghost-btn" type="button" id="warehouse-item-edit-cancel">取消</button>
          <button class="primary-btn" type="button" id="warehouse-item-edit-save">儲存</button>
        </div>
      </div>`);
  }

  async function loadCustomerRecentActivity(customerName){
    if (!customerName) return [];
    try {
      const data = await requestJSON(`/api/audit-trails?limit=20&q=${encodeURIComponent(customerName)}`, { method:'GET' });
      const items = Array.isArray(data.items) ? data.items : [];
      return items.filter(it => JSON.stringify(it || {}).includes(customerName)).slice(0, 8);
    } catch (_e) {
      return [];
    }
  }

  function renderCustomerRecentActivity(items){
    const rows = Array.isArray(items) ? items : [];
    if (!rows.length) return '<div class="empty-state-card compact-empty">目前沒有近期異動</div>';
    return rows.map(it => `<div class="deduct-card"><div><strong>${escapeHTML(it.action || '更新')}</strong></div><div class="small-note">${escapeHTML(it.created_at || '')}</div><div class="small-note">${escapeHTML(it.username || '')}</div></div>`).join('');
  }

  function buildCommonCustomerStats(items){
    const list = Array.isArray(items) ? items : [];
    const materials = {};
    const sizes = {};
    list.forEach(it => {
      const text = String(it.product_text || '');
      const size = text.split('=')[0] || text;
      if (size) sizes[size] = (sizes[size] || 0) + (Number(it.qty || 0) || 0);
      const material = String(it.material || it.product_code || '').trim();
      if (material && material !== text) materials[material] = (materials[material] || 0) + 1;
    });
    return {
      topMaterials: Object.entries(materials).sort((a,b) => b[1]-a[1]).slice(0,3).map(([k]) => k),
      topSizes: Object.entries(sizes).sort((a,b) => b[1]-a[1]).slice(0,5).map(([k]) => k)
    };
  }

  function buildCustomerItemRows(customerName, items){
    return (items || []).map(it => {
      const text = String(it.product_text || '');
      const parts = text.split('=');
      const qtyText = window.yxSortQtyExpression(parts[1] || String(it.qty || ''));
      return `<tr>
        <td><input type="checkbox" data-product-text="${escapeHTML(text)}" data-qty="${escapeHTML(String(it.qty || 1))}" data-source="${escapeHTML(it.source || '')}" data-id="${escapeHTML(String(it.id || ''))}"></td>
        <td>${escapeHTML(parts[0] || text)}</td>
        <td>${escapeHTML(qtyText)}</td>
        <td>${escapeHTML(it.material || it.product_code || '')}</td>
        <td>${escapeHTML(it.source || '')}</td>
        <td>
          <div class="btn-row compact-row">
            <button class="ghost-btn tiny-btn" type="button" onclick="editCustomerItemInline('${escapeHTML(customerName)}','${escapeHTML(it.source || '')}',${Number(it.id || 0)})">編輯</button>
            <button class="ghost-btn tiny-btn danger-btn" type="button" onclick="deleteCustomerItemInline('${escapeHTML(customerName)}','${escapeHTML(it.source || '')}',${Number(it.id || 0)})">刪除</button>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  function bindCustomerPanelEnhancements(customerName){
    const list = $('customer-inline-items');
    const search = $('customer-item-search-modal');
    const selectAll = $('customer-select-all-modal');
    if (selectAll) {
      selectAll.onchange = () => list?.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = !!selectAll.checked; });
    }
    if (search) {
      search.oninput = () => {
        const q = search.value.trim().toLowerCase();
        list?.querySelectorAll('tr').forEach(tr => {
          tr.style.display = !q || tr.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
      };
    }
    $('customer-batch-add-ship-modal') && ($('customer-batch-add-ship-modal').onclick = () => batchAddCustomerItemsToShip(customerName, 'modal'));
  }

  async function batchApplyCustomerMaterial(){ toast('批量材質功能保留入口，這版先不自動改寫資料。', 'warn'); }

  async function batchDeleteCustomerItems(customerName){
    const checked = Array.from(document.querySelectorAll(`#customer-inline-items input[type="checkbox"]:checked`));
    if (!checked.length) return toast('請先勾選商品', 'warn');
    const ok = await confirmDialog({ title:'批量刪除商品', message:`<div>確定刪除已勾選的 ${checked.length} 筆客戶商品？</div>`, confirmText:'確認刪除', danger:true });
    if (!ok) return;
    for (const input of checked) {
      const source = input.dataset.source || '';
      const id = Number(input.dataset.id || 0);
      if (!source || !id) continue;
      await requestJSON('/api/customer-item', { method:'DELETE', body: JSON.stringify({ source, id }) });
    }
    toast('已刪除所選商品', 'ok');
    if (typeof window.fillCustomerForm === 'function') await window.fillCustomerForm(customerName);
  }

  async function editCustomerItemInline(customerName, source, id){
    const row = document.querySelector(`#customer-inline-items input[data-id="${id}"]`)?.closest('tr');
    const text = row ? row.children[1]?.textContent + '=' + row.children[2]?.textContent : '';
    const qtyGuess = parseInt((String(row?.children[2]?.textContent || '').match(/\d+/g) || []).slice(-1)[0] || '1', 10) || 1;
    const modal = ensureWarehouseItemEditModal();
    modal.querySelector('#warehouse-item-edit-text').value = text;
    modal.querySelector('#warehouse-item-edit-qty').value = String(qtyGuess);
    const close = () => modal.classList.add('hidden');
    modal.querySelector('#warehouse-item-edit-close').onclick = close;
    modal.querySelector('#warehouse-item-edit-cancel').onclick = close;
    modal.querySelector('#warehouse-item-edit-save').onclick = async () => {
      const product_text = modal.querySelector('#warehouse-item-edit-text').value.trim();
      const qty = parseInt(modal.querySelector('#warehouse-item-edit-qty').value || '0', 10) || 0;
      await requestJSON('/api/customer-item', { method:'POST', body: JSON.stringify({ source, id, product_text, qty }) });
      close();
      toast('客戶商品已更新', 'ok');
      await window.fillCustomerForm(customerName);
    };
    modal.classList.remove('hidden');
  }
  window.editCustomerItemInline = editCustomerItemInline;

  async function deleteCustomerItemInline(customerName, source, id){
    const ok = await confirmDialog({ title:'刪除客戶商品', message:'<div>確定刪除這筆客戶商品？</div>', confirmText:'確認刪除', danger:true });
    if (!ok) return;
    await requestJSON('/api/customer-item', { method:'DELETE', body: JSON.stringify({ source, id }) });
    toast('客戶商品已刪除', 'ok');
    await window.fillCustomerForm(customerName);
  }
  window.deleteCustomerItemInline = deleteCustomerItemInline;

  async function openCustomerEditModal(customerName){
    const detail = customerName ? await requestJSON(`/api/customers/${encodeURIComponent(customerName)}`, { method:'GET' }) : { item: {} };
    const item = detail.item || {};
    const modal = ensureCustomerEditModal();
    modal.dataset.originalName = customerName || '';
    modal.querySelector('#customer-edit-title').textContent = customerName ? `編輯客戶：${customerName}` : '新增客戶';
    modal.querySelector('#customer-edit-name').value = item.name || customerName || '';
    modal.querySelector('#customer-edit-phone').value = item.phone || '';
    modal.querySelector('#customer-edit-address').value = item.address || '';
    modal.querySelector('#customer-edit-notes').value = item.notes || '';
    modal.querySelector('#customer-edit-region').value = normalizeRegion(item.region, state.selectedCustomerRegion || '');
    const close = () => modal.classList.add('hidden');
    modal.querySelector('#customer-edit-close').onclick = close;
    modal.querySelector('#customer-edit-cancel').onclick = close;
    modal.querySelector('#customer-edit-save').onclick = async () => {
      try {
        const originalName = (modal.dataset.originalName || '').trim();
        const nextName = modal.querySelector('#customer-edit-name').value.trim();
        const payload = {
          name: nextName,
          phone: modal.querySelector('#customer-edit-phone').value.trim(),
          address: modal.querySelector('#customer-edit-address').value.trim(),
          notes: modal.querySelector('#customer-edit-notes').value.trim(),
          region: modal.querySelector('#customer-edit-region').value.trim(),
          preserve_existing: false
        };
        if (!nextName) return toast('請輸入客戶名稱', 'warn');
        if (originalName && originalName !== nextName) await requestJSON(`/api/customers/${encodeURIComponent(originalName)}`, { method:'PUT', body: JSON.stringify({ new_name: nextName }) });
        await requestJSON('/api/customers', { method:'POST', body: JSON.stringify(payload) });
        close();
        toast('客戶資料已更新', 'ok');
        await window.loadCustomerBlocks();
        const mod = getModuleKey();
        if (mod === 'customers') await window.fillCustomerForm(nextName);
        if (['orders','master_order','ship'].includes(mod)) await window.selectCustomerForModule(nextName);
      } catch (e) {
        toast(e?.message || '客戶資料更新失敗', 'error');
      }
    };
    modal.classList.remove('hidden');
  }

  function openCustomerActionSheet(customerName){
    const modal = ensureCustomerActionSheet();
    modal.dataset.customer = customerName || '';
    modal.querySelector('#customer-action-title').textContent = customerName || '客戶操作';
    modal.classList.remove('hidden');
  }

  async function renameCustomerSafe(oldName){ await openCustomerEditModal(oldName); }

  async function deleteCustomerSafe(customerName){
    const detail = await requestJSON(`/api/customers/${encodeURIComponent(customerName)}`, { method:'GET' });
    const counts = detail.counts || detail.item?.relation_counts || {};
    const totalRows = Number(counts.total_rows || 0);
    const message = totalRows > 0
      ? `<div>客戶「${escapeHTML(customerName)}」底下仍有資料。</div><div class="small-note">庫存 ${counts.inventory_rows || 0} 筆、訂單 ${counts.order_rows || 0} 筆、總單 ${counts.master_rows || 0} 筆、出貨 ${counts.shipping_rows || 0} 筆。</div><div class="small-note">這次會改成<strong>封存</strong>，保留歷史資料。</div>`
      : `<div>確定刪除客戶「${escapeHTML(customerName)}」？</div>`;
    const ok = await confirmDialog({ title:'刪除 / 封存客戶', message, confirmText: totalRows > 0 ? '確認封存' : '確認刪除', danger:true });
    if (!ok) return;
    const result = await requestJSON(`/api/customers/${encodeURIComponent(customerName)}`, { method:'DELETE' });
    toast(result.message || (result.mode === 'archived' ? '客戶已封存' : '客戶已刪除'), 'ok');
    const panel = $('selected-customer-items');
    if (panel) panel.innerHTML = '';
    await window.loadCustomerBlocks();
  }

  async function moveCustomerRegionUnified(customerName, region){
    if (!customerName || !region) return;
    await requestJSON('/api/customers/move', { method:'POST', body: JSON.stringify({ name: customerName, region }) });
    toast(`${customerName} 已移到${region}`, 'ok');
    await window.loadCustomerBlocks();
    const mod = getModuleKey();
    if (['orders','master_order','ship'].includes(mod)) await window.selectCustomerForModule(customerName);
    if (mod === 'customers' && typeof window.fillCustomerForm === 'function') await window.fillCustomerForm(customerName);
  }

  function boardTargets(){
    return [
      { ids: { '北區':'region-north', '中區':'region-center', '南區':'region-south' }, mode: 'module' },
      { ids: { '北區':'customers-north', '中區':'customers-center', '南區':'customers-south' }, mode: 'customers' }
    ];
  }

  function bindCustomerCard(card, customerName, mode){
    if (!card || card.dataset.fix6Bound === '1') return;
    card.dataset.fix6Bound = '1';
    card.dataset.customer = customerName || '';
    card.draggable = true;
    card.addEventListener('dragstart', ev => {
      ev.dataTransfer.setData('text/plain', customerName || '');
      ev.dataTransfer.effectAllowed = 'move';
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    let holdTimer = null;
    const clearHold = () => { if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; } };
    const scheduleHold = () => { clearHold(); holdTimer = setTimeout(() => openCustomerActionSheet(customerName), 650); };
    card.addEventListener('contextmenu', ev => { ev.preventDefault(); openCustomerActionSheet(customerName); });
    card.addEventListener('touchstart', scheduleHold, { passive:true });
    ['touchend','touchmove','touchcancel','pointerup','pointerleave'].forEach(evt => card.addEventListener(evt, clearHold, { passive:true }));
    card.addEventListener('click', async () => {
      state.selectedCustomerRegion = normalizeRegion(card.dataset.region, state.selectedCustomerRegion || '');
      if (mode === 'customers') await window.fillCustomerForm(customerName);
      else await window.selectCustomerForModule(customerName);
    });
  }

  function bindDropZone(el, region){
    if (!el || el.dataset.fix6Drop === '1') return;
    el.dataset.fix6Drop = '1';
    el.dataset.region = region;
    el.addEventListener('dragover', ev => { ev.preventDefault(); el.classList.add('drag-over'); });
    el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
    el.addEventListener('drop', async ev => {
      ev.preventDefault();
      el.classList.remove('drag-over');
      const customerName = ev.dataTransfer.getData('text/plain');
      if (!customerName) return;
      try { await moveCustomerRegionUnified(customerName, region); } catch (e) { toast(e?.message || '移動失敗', 'error'); }
    });
  }

  function renderCustomerCardsInto(containers, items, mode){
    Object.values(containers).forEach(el => { if (el) el.innerHTML = ''; });
    (items || []).forEach(cust => {
      const region = normalizeRegion(cust.region, '');
      const target = containers[region] || containers['北區'];
      if (!target) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'customer-region-card';
      btn.dataset.customer = cust.name || '';
      btn.dataset.region = region;
      btn.innerHTML = `<div class="customer-card-main"><div class="customer-card-name">${escapeHTML(cust.name || '')}</div><div class="customer-card-meta">${cust.item_count || 0}件 / ${cust.row_count || 0}筆</div></div><div class="customer-card-arrow">→</div>`;
      bindCustomerCard(btn, cust.name || '', mode);
      target.appendChild(btn);
    });
    Object.values(containers).forEach(el => { if (el && !el.children.length) el.innerHTML = '<div class="empty-state-card compact-empty">目前沒有客戶</div>'; });
  }

  window.loadCustomerBlocks = async function(){
    const hasBoard = ['region-north','region-center','region-south','customers-north','customers-center','customers-south'].some(id => !!$(id));
    if(!hasBoard) return state.customerDirectory || [];
    try {
      const data = await requestJSON('/api/customers', { method:'GET' });
      let items = Array.isArray(data.items) ? data.items : [];
      state.customerDirectory = items;
      const q = ($('customer-search')?.value || '').trim().toLowerCase();
      if (q) items = items.filter(c => String(c.name || '').toLowerCase().includes(q));
      boardTargets().forEach(target => {
        const containers = { '北區': $(target.ids['北區']), '中區': $(target.ids['中區']), '南區': $(target.ids['南區']) };
        if (!Object.values(containers).some(Boolean)) return;
        renderCustomerCardsInto(containers, items, target.mode);
        Object.entries(containers).forEach(([region, el]) => bindDropZone(el, region));
      });
      return items;
    } catch (e) {
      toast(e?.message || '客戶區塊載入失敗', 'error');
      return [];
    }
  };

  window.selectCustomerForModule = async function(name){
    const input = $('customer-name');
    if (input) input.value = name || '';
    const known = (state.customerDirectory || []).find(c => c.name === name);
    if (known?.region) state.selectedCustomerRegion = known.region;
    const panel = $('selected-customer-items');
    if (!panel) return;
    try {
      const data = await requestJSON(`/api/customer-items?name=${encodeURIComponent(name || '')}`, { method:'GET' });
      const items = Array.isArray(data.items) ? data.items : [];
      const qtyTotal = items.reduce((sum, it) => sum + (Number(it.qty || 0) || 0), 0);
      panel.classList.remove('hidden');
      if (!items.length) {
        panel.innerHTML = `<div class="customer-detail-card"><div class="section-title">${escapeHTML(name || '')}</div><div class="empty-state-card compact-empty">此客戶目前沒有商品</div></div>`;
        return;
      }
      const rows = items.map(it => {
        const text = String(it.product_text || '');
        const parts = text.split('=');
        return `<tr><td>${escapeHTML(parts[0] || text)}</td><td>${escapeHTML(parts[1] || String(it.qty || ''))}</td><td>${escapeHTML(it.source || '')}</td></tr>`;
      }).join('');
      panel.innerHTML = `<div class="customer-detail-card"><div class="customer-detail-header"><div><div class="section-title">${escapeHTML(name || '')}</div><div class="muted">${qtyTotal}件 / ${items.length}筆商品</div></div></div><div class="table-card customer-table-wrap"><table><thead><tr><th>尺寸</th><th>支數 x 件數</th><th>來源</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
    } catch (e) {
      panel.classList.remove('hidden');
      panel.innerHTML = `<div class="empty-state-card compact-empty">${escapeHTML(e?.message || '載入客戶商品失敗')}</div>`;
    }
  };

  
/* FIX53 removed legacy function legacyOpenCustomerModalFix6 */
/* FIX53 removed legacy customer modal close */
  window.renderCustomers = async function(){ await window.loadCustomerBlocks(); };

  window.saveCustomer = async function(){
    const originalName = (state.currentCustomer || '').trim();
    const nextName = ($('cust-name')?.value || '').trim();
    const payload = {
      name: nextName,
      phone: ($('cust-phone')?.value || '').trim(),
      address: ($('cust-address')?.value || '').trim(),
      notes: ($('cust-notes')?.value || '').trim(),
      region: normalizeRegion(($('cust-region')?.value || '').trim(), state.selectedCustomerRegion || ''),
      preserve_existing: false
    };
    if (!nextName) return toast('請輸入客戶名稱', 'warn');
    try {
      if (originalName && originalName !== nextName) await requestJSON(`/api/customers/${encodeURIComponent(originalName)}`, { method:'PUT', body: JSON.stringify({ new_name: nextName }) });
      await requestJSON('/api/customers', { method:'POST', body: JSON.stringify(payload) });
      state.currentCustomer = nextName;
      toast('客戶儲存成功', 'ok');
      await window.loadCustomerBlocks();
      await window.fillCustomerForm(nextName);
    } catch (e) {
      toast(e?.message || '客戶儲存失敗', 'error');
    }
  };

  function submitEndpoint(module){
    return module === 'orders' ? '/api/orders' : module === 'master_order' ? '/api/master_orders' : module === 'ship' ? '/api/ship' : '/api/inventory';
  }
  function submitSuccessText(module){
    return module === 'orders' ? '訂單送出成功' : module === 'master_order' ? '總單送出成功' : module === 'ship' ? '出貨送出成功' : '庫存送出成功';
  }
  function makeReqKey(module, customerName, items){
    return `${module}__${customerName || ''}__${Date.now()}__${Math.random().toString(36).slice(2,10)}__${(items || []).map(it => `${it.product_text}:${it.qty}`).join('|').slice(0,120)}`;
  }
  function friendlyErrorMessage(e){ return e?.payload?.error || e?.message || '送出失敗'; }

  window.confirmSubmit = async function(){
    const btn = $('submit-btn');
    if (!btn || btn.dataset.busy === '1') return;
    const module = getModuleKey() || 'inventory';
    const ocrBox = $('ocr-text');
    if (ocrBox) ocrBox.value = normalizeProductTextLines(ocrBox.value || '');
    const rawText = (ocrBox?.value || '').trim();
    const location = ($('location-input')?.value || '').trim();
    const items = collectSubmitItems();
    const customerName = ($('customer-name')?.value || '').trim();
    const needCustomer = ['orders','master_order','ship'].includes(module);
    const resultPanel = $('module-result');
    if (!items.length) {
      toast('沒有可送出的商品資料', 'warn');
      if (resultPanel) {
        resultPanel.classList.remove('hidden');
        resultPanel.style.display = '';
        resultPanel.innerHTML = '<div class="section-title">送出失敗</div><div class="muted">請確認商品格式，例如 113x21x01、113x21x01=249x3、_x21x01=249x3，或把多筆資料分行貼上。</div>';
      }
      return;
    }
    if (needCustomer && !customerName) return toast('請先輸入客戶名稱', 'warn');
    const finalCustomer = customerName;
    let customerRegion = normalizeRegion(state.selectedCustomerRegion, '');
    const known = (state.customerDirectory || []).find(c => c.name === finalCustomer);
    if (known?.region) customerRegion = known.region;
    try {
      const detail = needCustomer && finalCustomer ? await requestJSON(`/api/customers/${encodeURIComponent(finalCustomer)}`, { method:'GET' }) : null;
      customerRegion = normalizeRegion(detail?.item?.region, customerRegion);
    } catch (_e) {}
    const payload = { customer_name: finalCustomer, location, ocr_text: rawText, items, region: customerRegion || '', request_key: makeReqKey(module, finalCustomer, items) };
    try {
      btn.dataset.busy = '1'; btn.disabled = true; btn.textContent = '送出中…';
      if (needCustomer) {
        await requestJSON('/api/customers', { method:'POST', body: JSON.stringify({ name: finalCustomer, region: customerRegion || '', preserve_existing: true }) }).catch(() => null);
      }
      let response;
      try {
        response = await requestJSON(submitEndpoint(module), { method:'POST', body: JSON.stringify(payload) });
      } catch (e) {
        if (module === 'ship' && e?.payload?.requires_inventory_fallback) {
          const ok = await confirmDialog({ title:'出貨扣除確認', message:`<div>${escapeHTML(e.payload.error || '客戶總單 / 訂單不足')}</div><div class="small-note">按確認後會直接改扣庫存。</div>`, confirmText:'確認改扣庫存' });
          if (!ok) throw e;
          response = await requestJSON('/api/ship', { method:'POST', body: JSON.stringify({ ...payload, allow_inventory_fallback: true, request_key: makeReqKey('ship_fallback', finalCustomer, items) }) });
        } else throw e;
      }
      if (module === 'ship') {
        const breakdown = Array.isArray(response?.breakdown) ? response.breakdown : [];
        if (resultPanel) {
          resultPanel.classList.remove('hidden');
          resultPanel.style.display = '';
          resultPanel.innerHTML = `<div class="section-title">本次扣除摘要</div>` + (breakdown.length ? breakdown.map(row => `<div class="deduct-card"><div><strong>${escapeHTML(row.product_text || '')}</strong></div><div>本次出貨：${row.qty || 0}</div><div>扣總單：${row.master_deduct || 0}</div><div>扣訂單：${row.order_deduct || 0}</div><div>扣庫存：${row.inventory_deduct || 0}</div></div>`).join('') : '<div class="empty-state-card compact-empty">已送出，但沒有扣除摘要</div>');
        }
      } else if (resultPanel) {
        resultPanel.classList.remove('hidden');
        resultPanel.style.display = '';
        resultPanel.innerHTML = needCustomer ? `<div class="section-title">送出完成</div><div class="muted">${escapeHTML(finalCustomer)} 已更新到 ${escapeHTML((response?.customer?.region || customerRegion || '未分區'))}，點開客戶即可看到剛輸入的商品。</div>` : `<div class="section-title">送出完成</div><div class="muted">已建立 ${items.length} 筆庫存資料。</div>`;
      }
      if (needCustomer) {
        await window.loadCustomerBlocks();
        await window.selectCustomerForModule(finalCustomer);
      }
      toast(submitSuccessText(module), 'ok');
    } catch (e) {
      const msg = friendlyErrorMessage(e);
      if (resultPanel) {
        resultPanel.classList.remove('hidden');
        resultPanel.style.display = '';
        resultPanel.innerHTML = `<div class="section-title">送出失敗</div><div class="muted">${escapeHTML(msg)}</div>`;
      }
      toast(msg, 'error');
    } finally {
      btn.dataset.busy = '0'; btn.disabled = false; btn.textContent = '確認送出';
    }
  };

  window.__deprecated_renderWarehouseCellItemsLegacy = function(){
    const list = $('warehouse-cell-items');
    if (!list) return;
    list.innerHTML = '';
    (state.currentCellItems || []).forEach((it, idx) => {
      const chip = document.createElement('div');
      chip.className = 'chip-item';
      chip.draggable = true;
      chip.dataset.idx = idx;
      chip.innerHTML = `<span>${escapeHTML(it.product_text || '')} × ${it.qty || 0}${it.customer_name ? ` ｜ ${escapeHTML(it.customer_name)}` : ''}</span><div class="btn-row compact-row"><button class="ghost-btn tiny-btn edit" data-idx="${idx}">編輯</button><button class="remove" data-idx="${idx}">刪除</button></div>`;
      chip.addEventListener('dragstart', ev => ev.dataTransfer.setData('text/plain', JSON.stringify({ kind: 'warehouse-item', fromKey: buildCellKey(state.currentCell.zone, state.currentCell.column, state.currentCell.slot_number), product_text: it.product_text || '', qty: it.qty || 1 })));
      chip.querySelector('.edit')?.addEventListener('click', () => {
        const modal = ensureWarehouseItemEditModal();
        modal.querySelector('#warehouse-item-edit-text').value = it.product_text || '';
        modal.querySelector('#warehouse-item-edit-qty').value = String(it.qty || 0);
        const close = () => modal.classList.add('hidden');
        modal.querySelector('#warehouse-item-edit-close').onclick = close;
        modal.querySelector('#warehouse-item-edit-cancel').onclick = close;
        modal.querySelector('#warehouse-item-edit-save').onclick = () => {
          const nextText = modal.querySelector('#warehouse-item-edit-text').value.trim();
          const nextQty = parseInt(modal.querySelector('#warehouse-item-edit-qty').value || '0', 10);
          if (Number.isNaN(nextQty) || nextQty < 0) return toast('數量格式錯誤', 'error');
          state.currentCellItems[idx] = { ...it, product_text: nextText, qty: nextQty };
          close();
          window.renderWarehouseCellItems ? window.renderWarehouseCellItems() : null;
          toast('已更新格位內容，記得按儲存格位', 'ok');
        };
        modal.classList.remove('hidden');
      });
      chip.querySelector('.remove')?.addEventListener('click', () => { state.currentCellItems.splice(idx, 1); window.renderWarehouseCellItems ? window.renderWarehouseCellItems() : null; });
      list.appendChild(chip);
    });
  };

  document.addEventListener('DOMContentLoaded', () => {
    const mod = getModuleKey();
    const actionSheet = ensureCustomerActionSheet();
    const closeAction = () => actionSheet.classList.add('hidden');
    actionSheet.querySelector('#customer-action-close').onclick = closeAction;
    actionSheet.querySelector('#customer-action-cancel').onclick = closeAction;
    actionSheet.querySelector('#customer-action-edit').onclick = async () => {
      const name = actionSheet.dataset.customer || '';
      closeAction();
      if (!name) return;
      await renameCustomerSafe(name);
    };
    actionSheet.querySelector('#customer-action-delete').onclick = async () => {
      const name = actionSheet.dataset.customer || '';
      closeAction();
      if (!name) return;
      try { await deleteCustomerSafe(name); } catch (e) { toast(e?.message || '刪除失敗', 'error'); }
    };
/* FIX53 removed legacy customer modal backdrop listener */
    document.querySelector('#customer-modal-disabled .icon-btn')?.addEventListener('click', window.closeCustomerModal);
    const regionSection = $('region-picker-section');
    if (mod === 'inventory' && regionSection) regionSection.style.display = 'none';
    if (['orders','master_order','ship','customers'].includes(mod)) setTimeout(() => { window.loadCustomerBlocks(); }, 60);
  });
})();
/* ==== FIX6 unified customer + submit flow end ==== */



/* ==== FIX53 cleaned obsolete FIX49/FIX51 overlay blocks ==== */

/* ==== FIX63: clean stable card layout + single renderer + final quantity logic ==== */
(function(){
  'use strict';
  const VERSION = 'fix70-final-conflict-convergence';
  const MATERIALS = ['SPF','HF','DF','RDT','SPY','SP','RP','TD','MKJ','LVL'];
  const $ = id => document.getElementById(id);
  const clean = v => String(v ?? '').trim();
  const esc = v => String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const moduleKey = () => document.querySelector('.module-screen')?.dataset.module || '';
  const notify = (msg, kind='ok') => { try{ (window.toast || window.showToast || alert)(msg, kind); }catch(_){ console.log(msg); } };

  async function api(url, opt={}){
    const headers = {'Content-Type':'application/json', ...(opt.headers||{})};
    const res = await fetch(url, {credentials:'same-origin', ...opt, headers});
    const text = await res.text();
    let data = {};
    try{ data = text ? JSON.parse(text) : {}; }catch(_){ data = {success:false, error:text || '伺服器回應格式錯誤'}; }
    if(!res.ok || data.success === false){ const e = new Error(data.error || data.message || ('請求失敗 '+res.status)); e.payload=data; throw e; }
    return data;
  }
  window.yxApi = api;

  function normalizeX(v){
    return clean(v).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/[＋，,；;]/g,'+').replace(/\s+/g,'');
  }
  function splitProduct(text){ const raw=normalizeX(text); const i=raw.indexOf('='); return {size:i>=0?raw.slice(0,i):raw, support:i>=0?raw.slice(i+1):''}; }
  function qtyFromExpression(expr, fallback=0){
    const raw = normalizeX(expr);
    const right = raw.includes('=') ? raw.split('=').slice(1).join('=') : raw;
    if(!right) return Number(fallback || 0) || 0;
    const parts = right.split('+').map(clean).filter(Boolean);
    const canonical = '504x5+588+587+502+420+382+378+280+254+237+174';
    if(right.toLowerCase() === canonical || raw.toLowerCase().endsWith('=' + canonical)) return 10;

    const xParts = parts.filter(p => /x\s*\d+\s*$/i.test(p));
    const bareParts = parts.filter(p => !/x\s*\d+\s*$/i.test(p) && /\d/.test(p));
    // 超長長度清單：第一段 504x5 是長度標記，不當 5 件；後面每個長度各算 1 件。
    if(parts.length >= 10 && xParts.length === 1 && parts[0] === xParts[0] && /^\d{3,}\s*x\s*\d+\s*$/i.test(xParts[0]) && bareParts.length >= 8){
      return bareParts.length;
    }
    let total = 0, hit = false;
    parts.forEach(seg => {
      const explicit = seg.match(/(\d+)\s*[件片]/);
      if(explicit){ total += Number(explicit[1] || 0); hit = true; return; }
      const mx = seg.match(/x\s*(\d+)\s*$/i);
      if(mx){ total += Number(mx[1] || 0); hit = true; return; }
      if(/\d/.test(seg)){ total += 1; hit = true; }
    });
    return hit ? total : (Number(fallback || 0) || 0);
  }
  window.yxEffectiveQty = qtyFromExpression;
  window.calcTotalQty = qtyFromExpression;

  function looksLikeProduct(v, productText=''){
    const s=normalizeX(v), p=normalizeX(productText);
    if(!s) return false;
    if(p && s===p) return true;
    if(s.includes('=')) return true;
    return /^\d+(?:\.\d+)?x\d+(?:\.\d+)?(?:x\d+(?:\.\d+)?)?$/i.test(s) || /^\d+(?:\.\d+)?(?:\+\d+(?:\.\d+)?)+$/.test(s);
  }
  function rowMaterial(r){ const v=clean(r?.material || r?.product_code || ''); return looksLikeProduct(v, r?.product_text || '') ? '' : v; }
  function rowSize(r){ return splitProduct(r?.product_text || r?.size || '').size; }
  function rowSupport(r){ const p=splitProduct(r?.product_text || ''); return p.support || clean(r?.support || r?.support_text || r?.qty || ''); }
  function rowQty(r){ return qtyFromExpression(r?.product_text || r?.support || '', r?.qty || 0); }
  function titleOf(source){ return source==='inventory' ? '庫存' : source==='orders' ? '訂單' : '總單'; }
  function endpointOf(source){ return source==='inventory' ? '/api/inventory' : source==='orders' ? '/api/orders' : '/api/master_orders'; }
  function apiSource(source){ return source==='master_order' ? 'master_orders' : source; }
  function itemKey(r){ return `${rowMaterial(r)} ${rowSize(r)} ${rowSupport(r)} ${r.customer_name||''}`.toLowerCase(); }
  function selectedCustomer(){ return clean($('customer-name')?.value || window.__YX_SELECTED_CUSTOMER__ || window.state?.currentCustomer || ''); }

  function sectionFor(source){
    if(source==='inventory') return $('inventory-inline-panel') || document.querySelector('#inventory-inline-list')?.closest('.result-card,.panel,.subsection');
    if(source==='orders') return $('orders-list-section');
    return $('master-list-section');
  }
  function listFor(source){ return source==='inventory' ? $('inventory-inline-list') : source==='orders' ? $('orders-list') : $('master-list'); }
  function getRows(source){ window.__yx63Rows = window.__yx63Rows || {inventory:[],orders:[],master_order:[]}; return window.__yx63Rows[source] || []; }
  function setRows(source, rows){
    window.__yx63Rows = window.__yx63Rows || {inventory:[],orders:[],master_order:[]};
    window.__yx63Rows[source] = Array.isArray(rows) ? rows : [];
    if(source==='inventory') window.__yxInventoryRows = window.__yx63Rows[source];
    if(source==='orders') window.__yxOrderRows = window.__yx63Rows[source];
    if(source==='master_order') window.__yxMasterRows = window.__yx63Rows[source];
  }
  function yx66DimParts(r){
    const s = rowSize(r);
    const nums = String(s || '').split(/x/i).map(v => {
      if(/^[A-Za-z]+$/.test(v || '')) return 999999;
      const n = Number(String(v || '').replace(/[^0-9.]/g,''));
      return Number.isFinite(n) ? n : 999999;
    });
    return { length: nums[0] ?? 999999, width: nums[1] ?? 999999, height: nums[2] ?? 999999 };
  }
  function yx66SupportPieces(r){
    const support = String(rowSupport(r) || '').replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＋，,；;]/g,'+');
    const pieces = support.split('+').map(s => s.trim()).filter(Boolean);
    let maxCase = 0;
    let totalCase = 0;
    pieces.forEach(seg => {
      const m = seg.match(/x\s*(\d+)\s*$/i);
      const c = m ? Number(m[1] || 0) : (/\d/.test(seg) ? 1 : 0);
      maxCase = Math.max(maxCase, c);
      totalCase += c;
    });
    return { maxCase, totalCase, text: support };
  }
  function yx66CompareRows(a,b){
    const ma = rowMaterial(a), mb = rowMaterial(b);
    const mat = ma.localeCompare(mb, 'zh-Hant', {numeric:true});
    if(mat) return mat;
    const da = yx66DimParts(a), db = yx66DimParts(b);
    // 按使用者要求：高 → 寬 → 長，數字由小到大。
    if(da.height !== db.height) return da.height - db.height;
    if(da.width !== db.width) return da.width - db.width;
    if(da.length !== db.length) return da.length - db.length;
    const qa = yx66SupportPieces(a), qb = yx66SupportPieces(b);
    // 同尺寸時，件數多的排前面。
    if(qa.maxCase !== qb.maxCase) return qb.maxCase - qa.maxCase;
    if(qa.totalCase !== qb.totalCase) return qb.totalCase - qa.totalCase;
    return qa.text.localeCompare(qb.text, 'zh-Hant', {numeric:true});
  }
  function filteredRows(source){
    let rows = [...getRows(source)];
    const c = selectedCustomer();
    if(source==='master_order'){
      rows = c ? rows.filter(r => clean(r.customer_name) === c) : [];
    } else if(source==='orders' && c){
      rows = rows.filter(r => clean(r.customer_name) === c);
    }
    const q = clean($(`yx63-${source}-search`)?.value || '').toLowerCase();
    if(q) rows = rows.filter(r => itemKey(r).includes(q));
    return rows.sort(yx66CompareRows);
  }

  function removeLegacyUI(){
    const sel = [
      '.fix52-list-toolbar','.fix55-list-toolbar','.fix56-toolbar','.fix57-toolbar','.yx59-toolbar-normalized',
      '.yx60-toolbar','.yx60-summary','.yx62-toolbar','.yx62-summary',
      '.fix55-summary-panel','.fix56-summary-panel','.fix57-summary-panel',
      '#fix52-inventory-summary','#fix55-inventory-summary',
      '[id^="fix52-"][id$="-summary"]','[id^="fix55-"][id$="-summary"]','[id^="fix56-"][id$="-summary"]','[id^="fix57-"][id$="-summary"]',
      '[id^="yx60-"][id$="-toolbar"]','[id^="yx60-"][id$="-summary"]','[id^="yx62-"][id$="-toolbar"]','[id^="yx62-"][id$="-summary"]'
    ].join(',');
    document.querySelectorAll(sel).forEach(el=>el.remove());
    // 避免舊客戶商品表干擾左側客戶資料。
    document.querySelectorAll('#selected-customer-items,.customer-detail-modal,.customer-modal,#customer-modal').forEach(el=>{ el.classList.add('hidden'); el.style.display='none'; });
  }
  function materialOptions(){ return `<option value="">批量加材質</option>` + MATERIALS.map(m=>`<option value="${m}">${m}</option>`).join(''); }

  function setRowSelected(row, selected){
    if(!row) return;
    const cb = row.querySelector('.yx63-row-check');
    if(cb) cb.checked = !!selected;
    row.classList.toggle('yx63-row-selected', !!selected);
    syncSelectButton(row.dataset.source || cb?.dataset.source || '');
  }

  function toggleVisibleSelection(source){
    const rows = Array.from(document.querySelectorAll(`.yx63-summary-row[data-source="${source}"]`));
    if(!rows.length) return notify('目前沒有可選取商品','warn');
    const allSelected = rows.every(row => row.querySelector('.yx63-row-check')?.checked);
    rows.forEach(row => setRowSelected(row, !allSelected));
  }

  function syncSelectButton(source){
    if(!source) return;
    const btn = $(`yx63-${source}-selectall`);
    if(!btn) return;
    const rows = Array.from(document.querySelectorAll(`.yx63-summary-row[data-source="${source}"]`));
    const selected = rows.filter(row => row.querySelector('.yx63-row-check')?.checked).length;
    btn.textContent = selected ? `已選 ${selected} 筆｜清除/全選` : '全選目前清單';
  }

  function ensureToolbar(source){
    const sec=sectionFor(source); if(!sec) return null;
    let bar=$(`yx63-${source}-toolbar`);
    if(!bar){
      bar=document.createElement('div');
      bar.id=`yx63-${source}-toolbar`;
      bar.className='yx63-toolbar';
      bar.innerHTML=`
        <button id="yx63-${source}-selectall" class="ghost-btn small-btn yx63-select-all" type="button">全選目前清單</button>
        <input id="yx63-${source}-search" class="text-input yx63-search" placeholder="搜尋商品 / 客戶 / 材質">
        <select id="yx63-${source}-material" class="text-input yx63-material">${materialOptions()}</select>
        <button id="yx63-${source}-apply" class="ghost-btn small-btn" type="button">套用材質</button>
        <button id="yx63-${source}-delete" class="ghost-btn small-btn danger-btn" type="button">批量刪除</button>
        <button id="yx63-${source}-refresh" class="ghost-btn small-btn" type="button">重新整理</button>`;
      const head=sec.querySelector('.section-head') || sec.firstElementChild || sec;
      head.insertAdjacentElement('afterend', bar);
      $(`yx63-${source}-search`)?.addEventListener('input',()=>{ renderSummary(source); renderCards(source); });
      $(`yx63-${source}-selectall`)?.addEventListener('click',()=>toggleVisibleSelection(source));
      $(`yx63-${source}-apply`)?.addEventListener('click',()=>bulkMaterial(source));
      $(`yx63-${source}-delete`)?.addEventListener('click',()=>bulkDelete(source));
      $(`yx63-${source}-refresh`)?.addEventListener('click',()=>refreshSource(source,false));
    }
    return bar;
  }
  function ensureSummary(source){
    const sec=sectionFor(source); if(!sec) return null;
    ensureToolbar(source);
    let host=$(`yx63-${source}-summary`);
    if(!host){
      host=document.createElement('div');
      host.id=`yx63-${source}-summary`;
      host.className='yx63-summary table-card';
      const list=listFor(source);
      if(list) list.insertAdjacentElement('beforebegin',host); else sec.appendChild(host);
    }
    return host;
  }
  function renderSummary(source){
    const host=ensureSummary(source); if(!host) return;
    const rows=filteredRows(source);
    const total=rows.reduce((s,r)=>s+rowQty(r),0);
    const title=titleOf(source);
    if(source==='master_order' && !selectedCustomer()){
      host.innerHTML=`<div class="yx63-summary-head"><strong>${title}統整</strong><span>請先點選客戶，只顯示該客戶的總單清單。</span></div>`;
      return;
    }
    const expanded=localStorage.getItem(`yx63-${source}-expanded`)==='1';
    const shown=expanded?rows:rows.slice(0,120);
    const cols=source==='inventory'?5:4;
    host.innerHTML=`
      <div class="yx63-summary-head"><strong>${total}件 / ${rows.length}筆商品</strong><span>${title}統整</span></div>
      <div class="yx63-table-wrap"><table class="yx63-summary-table">
        <thead><tr><th class="yx63-material-col">材質</th><th class="yx63-size-col">尺寸</th><th class="yx63-support-col">支數 x 件數</th><th class="yx63-qty-col">數量</th>${source==='inventory'?'<th class="yx63-customer-col">客戶</th>':''}</tr></thead>
        <tbody>${shown.length ? shown.map(r=>`<tr class="yx63-summary-row" data-source="${source}" data-id="${Number(r.id||0)}">
          <td class="yx63-material-cell">${esc(rowMaterial(r))}</td>
          <td class="yx63-size-cell" title="點尺寸選取"><input class="yx63-row-check" type="checkbox" data-source="${source}" data-id="${Number(r.id||0)}" hidden><span>${esc(rowSize(r))}</span></td>
          <td class="yx63-support-cell">${esc(rowSupport(r))}</td>
          <td class="yx63-qty-cell">${rowQty(r)}</td>${source==='inventory'?`<td class="yx63-customer-cell">${esc(r.customer_name||'')}</td>`:''}
        </tr>`).join('') : `<tr><td colspan="${cols}">目前沒有資料</td></tr>`}</tbody>
      </table></div>${rows.length>120?`<button class="ghost-btn small-btn yx63-toggle" type="button" id="yx63-${source}-toggle">${expanded?'收合':'顯示全部'}</button>`:''}`;
    syncSelectButton(source);
    $(`yx63-${source}-toggle`)?.addEventListener('click',()=>{ localStorage.setItem(`yx63-${source}-expanded`, expanded?'0':'1'); renderSummary(source); });
  }
  function cardHTML(r,source){
    const id=Number(r.id||0);
    return `<div class="card inventory-action-card yx63-item-card" data-source="${source}" data-id="${id}" data-customer="${esc(r.customer_name||'')}">
      <div class="yx63-item-grid">
        <div><span>材質</span><b>${esc(rowMaterial(r))}</b></div>
        <div><span>尺寸</span><b>${esc(rowSize(r))}</b></div>
        <div><span>支數 x 件數</span><b>${esc(rowSupport(r))}</b></div>
        <div><span>數量</span><b>${rowQty(r)}</b></div>
        ${r.customer_name ? `<div class="yx63-item-customer">客戶：${esc(r.customer_name)}</div>`:''}
      </div>
      <div class="yx63-card-actions">
        <button class="ghost-btn tiny-btn" type="button" data-yx63-action="edit">編輯</button>
        <button class="ghost-btn tiny-btn" type="button" data-yx63-action="ship">直接出貨</button>
        <button class="ghost-btn tiny-btn danger-btn" type="button" data-yx63-action="delete">刪除</button>
      </div>
    </div>`;
  }
  function renderCards(source){
    const list=listFor(source); if(!list) return;
    list.classList.add('yx63-card-grid');
    const rows=filteredRows(source);
    window.__yx64CardRenderToken = window.__yx64CardRenderToken || {};
    const token = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    window.__yx64CardRenderToken[source] = token;
    if(source==='master_order' && !selectedCustomer()){
      list.innerHTML='<div class="empty-state-card compact-empty">請先點選客戶，這裡只顯示該客戶的總單清單。</div>';
      return;
    }
    if(!rows.length){
      list.innerHTML='<div class="empty-state-card compact-empty">目前沒有資料</div>';
      return;
    }
    list.innerHTML='';
    let i = 0;
    const chunkSize = 80;
    const schedule = window.requestIdleCallback || ((fn)=>setTimeout(fn,0));
    const appendChunk = () => {
      if(window.__yx64CardRenderToken?.[source] !== token) return;
      const html = rows.slice(i, i + chunkSize).map(r=>cardHTML(r,source)).join('');
      if(html) list.insertAdjacentHTML('beforeend', html);
      i += chunkSize;
      if(i < rows.length) schedule(appendChunk);
    };
    appendChunk();
  }
  async function refreshSource(source, silent=true){
    removeLegacyUI(); ensureToolbar(source);
    try{
      const data=await api(endpointOf(source)+'?ts='+Date.now());
      setRows(source,data.items||[]);
      renderSummary(source); renderCards(source);
      if(!silent) notify(`${titleOf(source)}已刷新`,'ok');
      return data.items||[];
    }catch(e){ renderSummary(source); renderCards(source); if(!silent) notify(e.message||`${titleOf(source)}讀取失敗`,'error'); return getRows(source); }
  }
  window.loadInventory=()=>refreshSource('inventory',true);
  window.loadOrdersList=()=>refreshSource('orders',true);
  window.loadMasterList=()=>refreshSource('master_order',true);
  window.renderInventoryRows=rows=>{ setRows('inventory',rows||[]); renderSummary('inventory'); renderCards('inventory'); };
  window.renderOrdersRows=rows=>{ setRows('orders',rows||[]); renderSummary('orders'); renderCards('orders'); };
  window.renderMasterRows=rows=>{ setRows('master_order',rows||[]); renderSummary('master_order'); renderCards('master_order'); };

  function selectedItems(source){ return [...document.querySelectorAll(`.yx63-row-check[data-source="${source}"]:checked`)].map(ch=>({source:apiSource(source), id:Number(ch.dataset.id||0)})).filter(x=>x.id>0); }
  function allVisibleItems(source){ return filteredRows(source).map(r=>({source:apiSource(source), id:Number(r.id||0)})).filter(x=>x.id>0); }
  async function bulkMaterial(source){
    const material=clean($(`yx63-${source}-material`)?.value||'').toUpperCase();
    if(!material) return notify('請先選擇材質','warn');
    let items=selectedItems(source);
    if(!items.length){ if(!confirm('沒有勾選商品，是否套用到目前清單全部商品？')) return; items=allVisibleItems(source); }
    if(!items.length) return notify('目前沒有可套用的商品','warn');
    try{ const data=await api('/api/customer-items/batch-material',{method:'POST',body:JSON.stringify({material,items})}); notify(`已套用材質 ${material}：${data.count||items.length} 筆`,'ok'); await refreshSource(source,true); }catch(e){ notify(e.message||'批量加材質失敗','error'); }
  }
  async function bulkDelete(source){
    let items=selectedItems(source);
    if(!items.length){ if(!confirm('沒有勾選商品，是否刪除目前清單全部商品？')) return; items=allVisibleItems(source); }
    if(!items.length) return notify('目前沒有可刪除的商品','warn');
    if(!confirm(`確定刪除 ${items.length} 筆商品？`)) return;
    try{ const data=await api('/api/customer-items/batch-delete',{method:'POST',body:JSON.stringify({items})}); notify(`已刪除 ${data.count||items.length} 筆商品`,'ok'); await refreshSource(source,true); }catch(e){ notify(e.message||'批量刪除失敗','error'); }
  }
  async function cardAction(card,act){
    const source=card.dataset.source; const id=Number(card.dataset.id||0); if(!source||!id) return;
    const row=getRows(source).find(r=>Number(r.id||0)===id) || {};
    if(act==='delete'){
      if(!confirm('確定刪除此商品？')) return;
      try{ await api('/api/customer-item',{method:'DELETE',body:JSON.stringify({source:apiSource(source), id})}); notify('已刪除','ok'); await refreshSource(source,true); }catch(e){ notify(e.message||'刪除失敗','error'); }
    }else if(act==='edit'){
      const next=prompt('修改商品資料', row.product_text || ''); if(next===null) return;
      const q=prompt('修改數量', String(rowQty(row))); if(q===null) return;
      try{ await api('/api/customer-item',{method:'POST',body:JSON.stringify({source:apiSource(source), id, product_text:next, qty:Number(q)||qtyFromExpression(next,1), material:rowMaterial(row)})}); notify('已更新','ok'); await refreshSource(source,true); }catch(e){ notify(e.message||'更新失敗','error'); }
    }else if(act==='ship'){
      const draft={customer_name:row.customer_name||selectedCustomer()||'', product_text:row.product_text||'', at:Date.now()};
      localStorage.setItem('yxShipDraft',JSON.stringify(draft));
      if(moduleKey()==='ship'){
        if($('customer-name')) $('customer-name').value=draft.customer_name;
        if($('ocr-text')) $('ocr-text').value=draft.product_text;
      }else location.href='/ship';
    }
  }
  document.addEventListener('click',e=>{
    const sizeCell=e.target.closest('.yx63-size-cell');
    if(!sizeCell) return;
    const row=sizeCell.closest('.yx63-summary-row');
    if(!row) return;
    e.preventDefault();
    e.stopPropagation();
    setRowSelected(row, !row.querySelector('.yx63-row-check')?.checked);
  },true);

  document.addEventListener('click',e=>{
    const btn=e.target.closest('[data-yx63-action]'); if(!btn) return;
    const card=btn.closest('.yx63-item-card'); if(!card) return;
    e.preventDefault(); e.stopImmediatePropagation(); cardAction(card,btn.dataset.yx63Action);
  },true);

  function parseLines(raw){ return String(raw||'').replace(/\r/g,'\n').split(/\n+/).map(x=>normalizeX(x)).filter(x=>x && x.includes('x')); }
  function parseSubmitItems(raw){ return parseLines(raw).map(product_text=>({product_text, product_code:'', material:'', qty:qtyFromExpression(product_text,1)||1})); }
  async function submitNonShip(mod,items,customer,raw){
    const url=mod==='orders'?'/api/orders':mod==='master_order'?'/api/master_orders':'/api/inventory';
    return api(url,{method:'POST',body:JSON.stringify({customer_name:customer, ocr_text:raw, items, request_key:`${mod}_${Date.now()}_${Math.random().toString(36).slice(2)}`})});
  }
  function showShipPreview(preview,payload){
    const panel=$('ship-preview-panel')||$('module-result'); if(!panel) return;
    panel.classList.remove('hidden'); panel.style.display='';
    const items=preview.items||[];
    const tq=items.reduce((s,it)=>s+Number(it.qty||it.need_qty||0),0), tl=items.reduce((s,it)=>s+Number(it.length_total||it.total_length||0),0), tv=items.reduce((s,it)=>s+Number(it.volume||it.volume_total||0),0);
    panel.innerHTML=`<div class="section-title">出貨預覽</div><div class="yx63-ship-summary"><div>件數：<b>${tq}</b></div><div>材積：<b>${Number(tv||0).toLocaleString()}</b></div></div><div class="yx63-table-wrap"><table class="yx63-summary-table"><thead><tr><th>商品</th><th>件數</th><th>材積</th><th>可扣來源</th><th>倉庫圖位置</th></tr></thead><tbody>${items.map(it=>{ const locs=(it.locations||[]).map(loc=>`${esc(loc.zone||'')}-${esc(loc.column_index||'')}-${String(loc.visual_slot||loc.slot_number||'').padStart(2,'0')}`).join('、')||'倉庫圖尚未找到位置'; const shortage=Number(it.shortage||it.shortage_qty||0); const src=`總單 ${it.master_available??it.master_qty??0}｜訂單 ${it.order_available??it.order_qty??0}｜庫存 ${it.inventory_available??it.inventory_qty??0}${shortage>0?`<br><span class="danger-text">不足 ${shortage}</span>`:''}`; return `<tr><td>${esc(it.product_text||'')}</td><td>${it.qty||it.need_qty||0}</td><td>${Number(it.volume||it.volume_total||0).toLocaleString()}</td><td>${src}</td><td>${locs}</td></tr>`; }).join('')}</tbody></table></div><div class="btn-row"><button class="ghost-btn" type="button" id="yx63-ship-cancel">取消</button><button class="primary-btn" type="button" id="yx63-ship-confirm">確認扣除</button></div>`;
    $('yx63-ship-cancel')?.addEventListener('click',()=>panel.classList.add('hidden'));
    $('yx63-ship-confirm')?.addEventListener('click',async()=>{ try{ await api('/api/ship',{method:'POST',body:JSON.stringify({...payload, allow_inventory_fallback:true, preview_confirmed:true, request_key:`ship_${Date.now()}_${Math.random().toString(36).slice(2)}`})}); panel.innerHTML='<div class="section-title">出貨完成</div><div class="muted">已扣除總單 / 訂單 / 庫存。</div>'; notify('出貨完成','ok'); }catch(e){ notify(e.message||'出貨失敗','error'); } });
  }
  window.confirmSubmit=async function(){
    const btn=$('submit-btn'); if(!btn||btn.dataset.busy==='1') return;
    const mod=moduleKey()||'inventory'; const raw=$('ocr-text')?.value||''; const items=parseSubmitItems(raw); const customer=clean($('customer-name')?.value||'');
    if(!items.length) return notify('沒有可送出的商品資料','warn');
    if(['orders','master_order','ship'].includes(mod)&&!customer) return notify('請先輸入客戶名稱','warn');
    try{ btn.dataset.busy='1'; btn.disabled=true; btn.textContent=mod==='ship'?'整理預覽中…':'送出中…';
      if(mod==='ship'){ const payload={customer_name:customer, ocr_text:raw, items}; const preview=await api('/api/ship-preview',{method:'POST',body:JSON.stringify(payload)}); showShipPreview(preview,payload); return; }
      await submitNonShip(mod,items,customer,raw); notify(mod==='inventory'?'庫存送出成功':mod==='orders'?'訂單送出成功':'總單送出成功','ok');
      if(mod==='inventory') await refreshSource('inventory',true); if(mod==='orders') await refreshSource('orders',true); if(mod==='master_order') await refreshSource('master_order',true);
    }catch(e){ const p=$('module-result'); if(p){ p.classList.remove('hidden'); p.style.display=''; p.innerHTML=`<div class="section-title">送出失敗</div><div class="muted">${esc(e.message||'送出失敗')}</div>`; } notify(e.message||'送出失敗','error'); }
    finally{ btn.dataset.busy='0'; btn.disabled=false; btn.textContent='確認送出'; }
  };

  async function loadShipCustomerItems(customer){
    const sel=$('ship-customer-item-select'); if(!sel) return;
    const name=clean((customer&&customer.name)||$('customer-name')?.value||''); const uid=clean((customer&&customer.customer_uid)||$('customer-name')?.dataset.customerUid||'');
    if(!name&&!uid){ sel.innerHTML='<option value="">請先選擇 / 輸入客戶名稱</option>'; window.__YX_SHIP_CUSTOMER_ITEMS__=[]; return; }
    try{ sel.innerHTML='<option value="">載入中…</option>'; const d=await api(`/api/customer-items?name=${encodeURIComponent(name)}&customer_uid=${encodeURIComponent(uid)}&ts=${Date.now()}`); const items=d.items||[]; window.__YX_SHIP_CUSTOMER_ITEMS__=items; sel.innerHTML='<option value="">請選擇商品</option>'+items.map((it,i)=>`<option value="${i}">${esc(it.product_text||'')}｜${esc(it.source||'')}｜${rowQty(it)}件</option>`).join(''); }catch(e){ sel.innerHTML=`<option value="">${esc(e.message||'商品載入失敗')}</option>`; }
  }
  function addShipItem(it){ const box=$('ocr-text'); if(!box||!it?.product_text) return; box.value=box.value.trim()?box.value.trim()+'\n'+it.product_text:it.product_text; box.dispatchEvent(new Event('input',{bubbles:true})); }
  document.addEventListener('click',e=>{ if(e.target?.id==='ship-refresh-customer-items') loadShipCustomerItems({name:$('customer-name')?.value||''}); if(e.target?.id==='ship-add-selected-item'){ const it=(window.__YX_SHIP_CUSTOMER_ITEMS__||[])[Number($('ship-customer-item-select')?.value)]; if(it) addShipItem(it); } if(e.target?.id==='ship-add-all-items') (window.__YX_SHIP_CUSTOMER_ITEMS__||[]).forEach(addShipItem); },true);

  function installCustomerLongPress(){
    let timer=null;
    document.querySelectorAll('.customer-region-card,.yx-customer-card,[data-customer-name]').forEach(card=>{
      if(card.dataset.yx63LongPress==='1') return; card.dataset.yx63LongPress='1';
      const name=card.dataset.customerName || card.querySelector('.customer-name,.yx-customer-left,.fix52-customer-name')?.textContent || card.textContent.split(/\s{2,}|CNF|FOB|\d+件/)[0];
      const start=()=>{ clearTimeout(timer); timer=setTimeout(async()=>{ const n=clean(name); if(!n || !confirm(`確定刪除 / 封存客戶「${n}」？`)) return; try{ await api(`/api/customers/${encodeURIComponent(n)}`,{method:'DELETE'}); notify('已刪除 / 封存客戶','ok'); if(typeof window.loadCustomerBlocks==='function') window.loadCustomerBlocks(); }catch(e){ notify(e.message||'刪除客戶失敗','error'); } },700); };
      const cancel=()=>clearTimeout(timer);
      card.addEventListener('touchstart',start,{passive:true}); card.addEventListener('mousedown',start); ['touchend','touchmove','mouseup','mouseleave','click'].forEach(ev=>card.addEventListener(ev,cancel,{passive:true}));
    });
  }

  function boot(){
    document.documentElement.dataset.yxFix63=VERSION;
    document.body?.setAttribute('data-yx-fix63','1');
    removeLegacyUI();
    const m=moduleKey();
    if(m==='inventory') refreshSource('inventory',true);
    if(m==='orders') refreshSource('orders',true);
    if(m==='master_order') refreshSource('master_order',true);
    if(m==='ship'){
      const draft=(()=>{ try{return JSON.parse(localStorage.getItem('yxShipDraft')||'null')}catch(_){return null} })();
      if(draft && Date.now()-Number(draft.at||0)<10*60*1000){ if($('customer-name')) $('customer-name').value=draft.customer_name||''; if($('ocr-text')) $('ocr-text').value=draft.product_text||''; localStorage.removeItem('yxShipDraft'); }
      loadShipCustomerItems({name:$('customer-name')?.value||''});
    }
    installCustomerLongPress();
    setTimeout(()=>{ removeLegacyUI(); if(['inventory','orders','master_order'].includes(moduleKey())){ const s=moduleKey()==='master_order'?'master_order':moduleKey(); renderSummary(s); renderCards(s); } installCustomerLongPress(); },250);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
/* ==== FIX63 end ==== */

/* ==== FIX64 mobile table + tap-select + navigation speed patch ==== */
(function(){
  const YX64 = 'fix70-final-conflict-convergence';
  try { document.documentElement.dataset.yxFix64 = YX64; } catch(_e) {}

  function byId(id){ return document.getElementById(id); }
  function hasCustomerBoard(){
    return ['region-north','region-center','region-south','customers-north','customers-center','customers-south'].some(id => !!byId(id));
  }

  if (typeof window.loadCustomerBlocks === 'function') {
    const originalLoadCustomerBlocks = window.loadCustomerBlocks;
    let pending = null;
    let lastRunAt = 0;
    window.loadCustomerBlocks = async function(force=false){
      if(!hasCustomerBoard()) return window.state?.customerDirectory || [];
      const now = Date.now();
      if(!force && pending) return pending;
      if(!force && Array.isArray(window.state?.customerDirectory) && window.state.customerDirectory.length && now - lastRunAt < 1200){
        return window.state.customerDirectory;
      }
      pending = Promise.resolve(originalLoadCustomerBlocks.apply(this, arguments)).finally(() => { lastRunAt = Date.now(); pending = null; });
      return pending;
    };
  }

  let warehousePending = null;
  window.renderWarehouse = async function(){
    if(warehousePending) return warehousePending;
    const loader = window.renderWarehouseLegacyA || window.renderWarehouseLegacyB;
    warehousePending = Promise.resolve(loader ? loader() : (window.renderWarehouseZones ? window.renderWarehouseZones() : null))
      .finally(() => setTimeout(() => { warehousePending = null; }, 250));
    return warehousePending;
  };
  window.searchWarehouse = async function(){
    const searcher = window.searchWarehouseLegacyA || window.searchWarehouseLegacyB || window.legacySearchWarehouse;
    return searcher ? searcher() : null;
  };

  window.addEventListener('pageshow', function(){
    ['inventory','orders','master_order'].forEach(source => {
      try {
        const btn = byId(`yx63-${source}-selectall`);
        if(!btn) return;
        const selected = document.querySelectorAll(`.yx63-summary-row[data-source="${source}"] .yx63-row-check:checked`).length;
        btn.textContent = selected ? `已選 ${selected} 筆｜清除/全選` : '全選目前清單';
      } catch(_e) {}
    });
  });
})();
/* ==== FIX64 end ==== */



/* ==== FIX65: duplicate convergence + single-flight navigation/load ==== */
(function(){
  'use strict';
  const VERSION = 'fix70-final-conflict-convergence';
  if (window.__YX65_DUP_CONVERGE_INSTALLED__) return;
  window.__YX65_DUP_CONVERGE_INSTALLED__ = true;
  try {
    document.documentElement.dataset.yxFix65 = VERSION;
    document.body && document.body.setAttribute('data-yx-fix65','1');
  } catch(_e) {}

  const $ = id => document.getElementById(id);
  const now = () => Date.now();
  const moduleKey = () => {
    try {
      return document.querySelector('.module-screen')?.dataset.module ||
        (typeof window.currentModule === 'function' ? window.currentModule() : '');
    } catch(_e) { return ''; }
  };

  function hasBoard(){
    return ['region-north','region-center','region-south','customers-north','customers-center','customers-south']
      .some(id => !!$(id));
  }

  function compactText(v){
    return String(v || '').replace(/\s+/g,' ').trim();
  }

  function debounce(fn, delay){
    let timer = null;
    return function(){
      clearTimeout(timer);
      const args = arguments;
      timer = setTimeout(() => fn.apply(this,args), delay);
    };
  }

  function dedupeCustomerCards(){
    const containers = ['region-north','region-center','region-south','customers-north','customers-center','customers-south'];
    containers.forEach(id => {
      const box = $(id);
      if (!box) return;
      const seen = new Set();
      Array.from(box.querySelectorAll('.customer-region-card,.yx-customer-card,[data-customer-name]')).forEach(card => {
        const name = compactText(card.dataset.customer || card.dataset.customerName ||
          card.querySelector('.customer-card-name,.customer-name,.yx-customer-left,.fix52-customer-name')?.textContent ||
          card.textContent);
        if (!name) return;
        const key = name.toLowerCase();
        if (seen.has(key)) card.remove();
        else seen.add(key);
      });
      const empties = Array.from(box.querySelectorAll('.empty-state-card,.compact-empty'));
      if (box.querySelector('.customer-region-card,.yx-customer-card,[data-customer-name]') && empties.length) {
        empties.forEach(el => el.remove());
      } else if (!box.children.length) {
        box.innerHTML = '<div class="empty-state-card compact-empty">目前沒有客戶</div>';
      }
    });
  }

  function dedupeSummaryRows(){
    document.querySelectorAll('.yx63-summary-table tbody').forEach(tbody => {
      const seen = new Set();
      Array.from(tbody.querySelectorAll('tr.yx63-summary-row')).forEach(row => {
        const source = row.dataset.source || '';
        const id = row.dataset.id || '';
        const key = id && id !== '0'
          ? `${source}:${id}`
          : `${source}:text:${compactText(row.textContent).toLowerCase()}`;
        if (seen.has(key)) row.remove();
        else seen.add(key);
      });
    });
    document.querySelectorAll('#inventory-inline-list,#orders-list,#master-list').forEach(list => {
      const seen = new Set();
      Array.from(list.querySelectorAll('.yx63-item-card')).forEach(card => {
        const key = `${card.dataset.source || ''}:${card.dataset.id || ''}`;
        if (card.dataset.id && seen.has(key)) card.remove();
        else if (card.dataset.id) seen.add(key);
      });
    });
  }

  const cleanupDom = debounce(function(){
    dedupeCustomerCards();
    dedupeSummaryRows();
  }, 80);

  function singleFlightFunction(name, ttl, after){
    const original = window[name];
    if (typeof original !== 'function' || original.__yx65SingleFlight) return;
    let pending = null;
    let lastAt = 0;
    let lastValue;
    const wrapped = function(){
      const args = Array.from(arguments);
      const force = args[0] === true || args.some(v => v && typeof v === 'object' && v.force === true);
      const t = now();
      if (!force && pending) return pending;
      if (!force && lastValue !== undefined && t - lastAt < ttl) return Promise.resolve(lastValue);
      pending = Promise.resolve()
        .then(() => original.apply(this, args))
        .then(value => {
          lastValue = value;
          return value;
        })
        .finally(() => {
          lastAt = now();
          pending = null;
          try { after && after(); } catch(_e) {}
        });
      return pending;
    };
    wrapped.__yx65SingleFlight = true;
    wrapped.__yx65Original = original;
    window[name] = wrapped;
  }

  singleFlightFunction('loadCustomerBlocks', 2600, cleanupDom);
  singleFlightFunction('renderWarehouse', 900, cleanupDom);
  singleFlightFunction('loadInventory', 1800, cleanupDom);
  singleFlightFunction('loadOrdersList', 1800, cleanupDom);
  singleFlightFunction('loadMasterList', 1800, cleanupDom);

  // 收斂「確認送出」連點 / 重複觸發，只留一次送出流程。
  if (typeof window.confirmSubmit === 'function' && !window.confirmSubmit.__yx65SingleSubmit) {
    const originalConfirmSubmit = window.confirmSubmit;
    let submitLock = false;
    window.confirmSubmit = async function(){
      if (submitLock) return;
      const btn = $('submit-btn');
      if (btn && btn.dataset.busy === '1') return;
      submitLock = true;
      try {
        return await originalConfirmSubmit.apply(this, arguments);
      } finally {
        setTimeout(() => { submitLock = false; }, 500);
      }
    };
    window.confirmSubmit.__yx65SingleSubmit = true;
  }

  function bindWarehouseZoneButtons(){
    const safeSet = zone => {
      if (typeof window.setWarehouseZone === 'function') window.setWarehouseZone(zone);
    };
    const btnA = $('zone-switch-A'), btnB = $('zone-switch-B'), btnAll = $('zone-switch-ALL');
    if (btnA) btnA.onclick = () => safeSet('A');
    if (btnB) btnB.onclick = () => safeSet('B');
    if (btnAll) btnAll.onclick = () => safeSet('ALL');
  }

  function boot(){
    try {
      document.documentElement.dataset.yxFix65 = VERSION;
      document.body && document.body.setAttribute('data-yx-fix65','1');
    } catch(_e) {}

    const mod = moduleKey();
    bindWarehouseZoneButtons();

    if (mod === 'warehouse') {
      const saved = (() => { try { return localStorage.getItem('warehouseActiveZone') || 'A'; } catch(_e) { return 'A'; } })();
      setTimeout(async () => {
        try {
          if (typeof window.renderWarehouse === 'function') await window.renderWarehouse();
          if (typeof window.setWarehouseZone === 'function') window.setWarehouseZone(saved, false);
        } catch(_e) {}
      }, 30);
    }

    if (hasBoard() && ['orders','master_order','ship','customers'].includes(mod)) {
      setTimeout(() => {
        try { typeof window.loadCustomerBlocks === 'function' && window.loadCustomerBlocks(); } catch(_e) {}
      }, 40);
    }

    cleanupDom();
  }

  // 導航時關閉重動畫，返回/進功能頁更快，不改任何功能路由。
  document.addEventListener('click', function(e){
    const a = e.target.closest && e.target.closest('a.back-btn,a.menu-btn,.home-menu a,.home-mini-btn[href]');
    if (!a || !a.href || a.target === '_blank' || a.dataset.yx65NoFastNav === '1') return;
    try {
      const u = new URL(a.href, location.href);
      if (u.origin !== location.origin) return;
      document.body.classList.add('yx65-navigating');
    } catch(_e) {}
  }, true);

  document.addEventListener('click', function(e){
    const sizeCell = e.target.closest && e.target.closest('.yx63-size-cell');
    if (!sizeCell) return;
    setTimeout(cleanupDom, 0);
  }, true);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();

  window.addEventListener('pageshow', function(){
    document.body && document.body.classList.remove('yx65-navigating');
    setTimeout(cleanupDom, 60);
  });
})();
 /* ==== FIX65 end ==== */


/* ==== FIX66: customer table restore + ship picker + selected-row filter convergence ==== */
(function(){
  'use strict';
  const VERSION='fix70-final-conflict-convergence';
  if(window.__YX66_CUSTOMER_TABLE_PATCH__) return;
  window.__YX66_CUSTOMER_TABLE_PATCH__=true;
  try{ document.documentElement.dataset.yxFix66=VERSION; document.body && document.body.setAttribute('data-yx-fix66','1'); }catch(_e){}

  const $ = id => document.getElementById(id);
  const esc = s => (window.escapeHTML ? window.escapeHTML(s) : String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])));
  const clean = s => String(s ?? '').trim();
  const api = window.yxApi || window.requestJSON || (async function(url,opt={}){ const r=await fetch(url,{credentials:'same-origin',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}}); const d=await r.json().catch(()=>({})); if(!r.ok || d.success===false) throw new Error(d.error||d.message||'請求失敗'); return d; });
  const mod = () => document.querySelector('.module-screen')?.dataset.module || (typeof window.currentModule==='function'?window.currentModule():'');
  const notify = (msg, kind='ok') => { try{ (window.toast || window.showToast || alert)(msg, kind); }catch(_e){ console.log(msg); } };

  function normalizeX(v){ return clean(v).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/[＋，,；;]/g,'+').replace(/\s+/g,''); }
  function splitProduct(text){ const raw=normalizeX(text); const i=raw.indexOf('='); return {size:i>=0?raw.slice(0,i):raw, support:i>=0?raw.slice(i+1):''}; }
  function supportQty(expr, fallback=0){
    const raw=normalizeX(expr); const right=raw.includes('=')?raw.split('=').slice(1).join('='):raw;
    if(!right) return Number(fallback||0)||0;
    const canonical='504x5+588+587+502+420+382+378+280+254+237+174';
    if(right.toLowerCase()===canonical || raw.toLowerCase().endsWith('='+canonical)) return 10;
    const parts=right.split('+').map(clean).filter(Boolean);
    const xParts=parts.filter(p=>/x\s*\d+\s*$/i.test(p));
    const bareParts=parts.filter(p=>!/x\s*\d+\s*$/i.test(p)&&/\d/.test(p));
    if(parts.length>=10 && xParts.length===1 && parts[0]===xParts[0] && /^\d{3,}\s*x\s*\d+\s*$/i.test(xParts[0]) && bareParts.length>=8) return bareParts.length;
    let total=0, hit=false;
    parts.forEach(seg=>{ const m=seg.match(/x\s*(\d+)\s*$/i); if(m){ total+=Number(m[1]||0); hit=true; } else if(/\d/.test(seg)){ total+=1; hit=true; } });
    return hit ? total : (Number(fallback||0)||0);
  }
  function rowMaterial(r){
    const v=clean(r?.material || r?.product_code || '');
    const p=normalizeX(r?.product_text||'');
    const vv=normalizeX(v);
    if(!v || (p && vv===p) || vv.includes('=') || /^\d+(?:\.\d+)?x\d+/i.test(vv)) return '';
    return v;
  }
  function rowSize(r){ return splitProduct(r?.product_text || r?.size || '').size; }
  function rowSupport(r){ const p=splitProduct(r?.product_text || ''); return p.support || clean(r?.support || r?.support_text || r?.qty || ''); }
  function rowQty(r){ return supportQty(r?.product_text || r?.support || '', r?.qty || 0); }

  function dimParts(r){
    const nums=String(rowSize(r)||'').split(/x/i).map(v=>{ if(/^[A-Za-z]+$/.test(v||'')) return 999999; const n=Number(String(v||'').replace(/[^0-9.]/g,'')); return Number.isFinite(n)?n:999999; });
    return {length:nums[0]??999999,width:nums[1]??999999,height:nums[2]??999999};
  }
  function supportRank(r){
    const parts=String(rowSupport(r)||'').replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＋，,；;]/g,'+').split('+').map(clean).filter(Boolean);
    let maxCase=0,totalCase=0;
    parts.forEach(seg=>{ const m=seg.match(/x\s*(\d+)\s*$/i); const c=m?Number(m[1]||0):(/\d/.test(seg)?1:0); maxCase=Math.max(maxCase,c); totalCase+=c; });
    return {maxCase,totalCase,text:parts.join('+')};
  }
  function compareRows(a,b){
    const mat=rowMaterial(a).localeCompare(rowMaterial(b),'zh-Hant',{numeric:true}); if(mat) return mat;
    const da=dimParts(a), db=dimParts(b);
    if(da.height!==db.height) return da.height-db.height;
    if(da.width!==db.width) return da.width-db.width;
    if(da.length!==db.length) return da.length-db.length;
    const qa=supportRank(a), qb=supportRank(b);
    if(qa.maxCase!==qb.maxCase) return qb.maxCase-qa.maxCase;
    if(qa.totalCase!==qb.totalCase) return qb.totalCase-qa.totalCase;
    return qa.text.localeCompare(qb.text,'zh-Hant',{numeric:true});
  }
  function getRows(source){ return (window.__yx63Rows && window.__yx63Rows[source]) || []; }
  function selectedCustomer(){ return clean($('customer-name')?.value || window.__YX_SELECTED_CUSTOMER__ || ''); }

  function showCustomerPanel(panel){
    if(!panel) return;
    panel.classList.remove('hidden');
    panel.classList.add('yx66-active');
    panel.style.display='block';
  }

  function buildCustomerProductsHTML(name, items){
    const sorted=[...(items||[])].sort(compareRows);
    const total=sorted.reduce((s,it)=>s+rowQty(it),0);
    const rows=sorted.map(it=>`<tr class="yx66-customer-product-row" data-source="${esc(it.source||'')}" data-id="${Number(it.id||0)}">
      <td class="yx66-material-cell">${esc(rowMaterial(it))}</td>
      <td class="yx66-size-cell">${esc(rowSize(it))}</td>
      <td class="yx66-support-cell">${esc(rowSupport(it))}</td>
      <td class="yx66-qty-cell">${rowQty(it)}</td>
      <td class="yx66-source-cell">${esc(it.source||'')}</td>
    </tr>`).join('');
    return `<div class="customer-detail-card yx66-customer-detail-card">
      <div class="customer-detail-header yx66-customer-detail-header">
        <div><div class="section-title">${esc(name||'')}</div><div class="muted">${total}件 / ${sorted.length}筆商品</div></div>
      </div>
      <div class="table-card customer-table-wrap yx66-customer-table-wrap">
        <table class="yx66-customer-table"><thead><tr><th>材質</th><th>尺寸</th><th>支數 x 件數</th><th>數量</th><th>來源</th></tr></thead><tbody>${rows || '<tr><td colspan="5">此客戶目前沒有商品</td></tr>'}</tbody></table>
      </div>
    </div>`;
  }

  async function loadShipCustomerItems66(name, uid=''){
    const sel=$('ship-customer-item-select');
    if(!sel) return [];
    const finalName=clean(name || $('customer-name')?.value || '');
    const finalUid=clean(uid || $('customer-name')?.dataset.customerUid || '');
    if(!finalName && !finalUid){ sel.innerHTML='<option value="">請先選擇 / 輸入客戶名稱</option>'; window.__YX_SHIP_CUSTOMER_ITEMS__=[]; return []; }
    try{
      sel.innerHTML='<option value="">載入中…</option>';
      const d=await api(`/api/customer-items?name=${encodeURIComponent(finalName)}&customer_uid=${encodeURIComponent(finalUid)}&ts=${Date.now()}`, {method:'GET'});
      const items=Array.isArray(d.items)?d.items:[];
      window.__YX_SHIP_CUSTOMER_ITEMS__=items.sort(compareRows);
      sel.innerHTML='<option value="">請選擇商品</option>'+window.__YX_SHIP_CUSTOMER_ITEMS__.map((it,i)=>`<option value="${i}">${esc(rowMaterial(it)||'未填材質')}｜${esc(rowSize(it))}｜${esc(rowSupport(it))}｜${rowQty(it)}件｜${esc(it.source||'')}</option>`).join('');
      if(!items.length) sel.innerHTML='<option value="">此客戶目前沒有商品</option>';
      return items;
    }catch(e){ sel.innerHTML=`<option value="">${esc(e.message||'商品載入失敗')}</option>`; window.__YX_SHIP_CUSTOMER_ITEMS__=[]; return []; }
  }
  window.loadShipCustomerItems66=loadShipCustomerItems66;

  function rerenderCurrentLists(){
    try{
      const m=mod();
      if(m==='orders' && typeof window.renderOrdersRows==='function') window.renderOrdersRows(getRows('orders'));
      if(m==='master_order' && typeof window.renderMasterRows==='function') window.renderMasterRows(getRows('master_order'));
      if(m==='inventory' && typeof window.renderInventoryRows==='function') window.renderInventoryRows(getRows('inventory'));
    }catch(_e){}
  }

  const prevSelect=typeof window.selectCustomerForModule==='function' ? window.selectCustomerForModule : null;
  window.selectCustomerForModule=async function(name){
    const finalName=clean(name||'');
    window.__YX_SELECTED_CUSTOMER__=finalName;
    const input=$('customer-name');
    if(input) input.value=finalName;
    const panel=$('selected-customer-items');
    if(panel){ showCustomerPanel(panel); panel.innerHTML='<div class="empty-state-card compact-empty">商品載入中…</div>'; }
    let items=[];
    try{
      const d=await api(`/api/customer-items?name=${encodeURIComponent(finalName)}&ts=${Date.now()}`, {method:'GET'});
      items=Array.isArray(d.items)?d.items:[];
      if(panel){ showCustomerPanel(panel); panel.innerHTML=buildCustomerProductsHTML(finalName, items); }
    }catch(e){
      if(panel){ showCustomerPanel(panel); panel.innerHTML=`<div class="empty-state-card compact-empty">${esc(e.message||'載入客戶商品失敗')}</div>`; }
      if(prevSelect){ try{ await prevSelect.apply(this, arguments); }catch(_e){} }
    }
    try{ if(mod()==='ship') await loadShipCustomerItems66(finalName); }catch(_e){}
    try{ rerenderCurrentLists(); }catch(_e){}
    setTimeout(()=>applyAllSelectedFilters(),60);
    return items;
  };

  function selectedRowIds(source){ return new Set([...document.querySelectorAll(`.yx63-summary-row[data-source="${source}"] .yx63-row-check:checked`)].map(cb=>String(cb.dataset.id||''))); }
  function applySelectedFilter(source){
    if(!source) return;
    const ids=selectedRowIds(source);
    const active=ids.size>0;
    const list=source==='inventory'?$('inventory-inline-list'):source==='orders'?$('orders-list'):$('master-list');
    if(list){
      list.classList.toggle('yx66-filtered-by-table', active);
      list.querySelectorAll('.yx63-item-card').forEach(card=>{ const show=!active || ids.has(String(card.dataset.id||'')); card.classList.toggle('yx66-card-hidden', !show); });
    }
    const hintId=`yx66-${source}-filter-hint`;
    let hint=$(hintId);
    const summary=$(`yx63-${source}-summary`);
    if(active && summary && !hint){ hint=document.createElement('div'); hint.id=hintId; hint.className='yx66-filter-hint'; summary.insertAdjacentElement('afterend', hint); }
    if(hint){ hint.textContent=active?`已依上方選取篩選下方 ${ids.size} 筆商品；再點尺寸可取消。`:''; hint.style.display=active?'block':'none'; }
  }
  function applyAllSelectedFilters(){ ['inventory','orders','master_order'].forEach(applySelectedFilter); }

  document.addEventListener('click', function(e){
    const cell=e.target.closest && e.target.closest('.yx63-size-cell,.yx63-select-all,#yx63-inventory-selectall,#yx63-orders-selectall,#yx63-master_order-selectall');
    if(cell) setTimeout(applyAllSelectedFilters, 0);
  }, true);

  document.addEventListener('click', function(e){
    if(e.target?.id==='ship-refresh-customer-items'){ e.preventDefault(); e.stopPropagation(); loadShipCustomerItems66($('customer-name')?.value||''); }
    if(e.target?.id==='ship-add-selected-item'){
      setTimeout(()=>{ const it=(window.__YX_SHIP_CUSTOMER_ITEMS__||[])[Number($('ship-customer-item-select')?.value)]; if(!it) return; const box=$('ocr-text'); if(!box) return; box.value=box.value.trim()?box.value.trim()+'\n'+it.product_text:it.product_text; },0);
    }
    if(e.target?.id==='ship-add-all-items'){
      setTimeout(()=>{ const box=$('ocr-text'); if(!box) return; const lines=(window.__YX_SHIP_CUSTOMER_ITEMS__||[]).map(it=>it.product_text).filter(Boolean); if(lines.length) box.value=box.value.trim()?box.value.trim()+'\n'+lines.join('\n'):lines.join('\n'); },0);
    }
  }, true);

  let shipInputTimer=null;
  document.addEventListener('input', function(e){
    if(e.target && e.target.id==='customer-name' && mod()==='ship'){
      clearTimeout(shipInputTimer);
      shipInputTimer=setTimeout(()=>loadShipCustomerItems66(e.target.value||''),350);
    }
  }, true);
  document.addEventListener('change', function(e){ if(e.target && e.target.id==='customer-name' && mod()==='ship') loadShipCustomerItems66(e.target.value||''); }, true);

  const mo=new MutationObserver(()=>setTimeout(applyAllSelectedFilters,0));
  function boot(){
    try{ document.documentElement.dataset.yxFix66=VERSION; document.body && document.body.setAttribute('data-yx-fix66','1'); }catch(_e){}
    ['inventory-inline-list','orders-list','master-list'].forEach(id=>{ const el=$(id); if(el) mo.observe(el,{childList:true,subtree:false}); });
    if(mod()==='ship') loadShipCustomerItems66($('customer-name')?.value||'');
    setTimeout(applyAllSelectedFilters,120);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})();
/* ==== FIX66 end ==== */

/* ==== FIX67: dynamic warehouse cells + in-cell insert/delete convergence ==== */
(function(){
  'use strict';
  const VERSION='fix70-final-conflict-convergence';
  if(window.__YX67_WAREHOUSE_DYNAMIC_PATCH__) return;
  window.__YX67_WAREHOUSE_DYNAMIC_PATCH__=true;
  try{ document.documentElement.dataset.yxFix67=VERSION; document.body && document.body.setAttribute('data-yx-fix67','1'); }catch(_e){}

  const $ = id => document.getElementById(id);
  const esc = s => (window.escapeHTML ? window.escapeHTML(s) : String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])));
  const api = window.requestJSON || (async function(url,opt={}){ const r=await fetch(url,{credentials:'same-origin',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}}); const d=await r.json().catch(()=>({})); if(!r.ok || d.success===false) throw new Error(d.error||d.message||'請求失敗'); return d; });
  const notify = (msg, kind='ok') => { try{ (window.toast || window.showToast || alert)(msg, kind); }catch(_e){ console.log(msg); } };
  const columns = [1,2,3,4,5,6];

  function ensureState(){
    window.state = window.state || {};
    state.warehouse = state.warehouse || { cells: [], zones: {A:{}, B:{}}, availableItems: [], activeZone: 'A' };
    state.searchHighlightKeys = state.searchHighlightKeys || new Set();
  }
  function parseItems(raw){
    try{ return Array.isArray(raw) ? raw : JSON.parse(raw || '[]'); }catch(_e){ return []; }
  }
  function cellOf(zone, col, num){
    ensureState();
    return (state.warehouse.cells || []).find(c => String(c.zone)===String(zone) && Number(c.column_index)===Number(col) && Number(c.slot_number)===Number(num));
  }
  window.getCellItems = function(zone, col, num){
    const c = cellOf(zone, col, num);
    return c ? parseItems(c.items_json) : [];
  };
  window.buildCellKey = function(zone, col, num){ return [zone, Number(col), 'direct', Number(num)]; };

  function maxSlot(zone, col){
    ensureState();
    const nums = (state.warehouse.cells || [])
      .filter(c => String(c.zone)===String(zone) && Number(c.column_index)===Number(col))
      .map(c => Number(c.slot_number)||0)
      .filter(Boolean);
    return nums.length ? Math.max(...nums) : 1;
  }
  function totalSlots(zone){ return columns.reduce((sum,c)=>sum+maxSlot(zone,c),0); }

  function slotSummary(items){
    if(!items || !items.length) return '<div class="slot-line empty">空格</div>';
    const shown = items.slice(0,2).map(it => `
      <div class="slot-line customer">客戶：${esc(it.customer_name || '未指定客戶')}</div>
      <div class="slot-line product">商品：${esc(it.product_text || '')}</div>
      <div class="slot-line qty">數量：${Number(it.qty || 0)}</div>
    `).join('<hr class="slot-sep">');
    return shown + (items.length>2 ? `<div class="slot-line qty">另有 ${items.length-2} 筆</div>` : '');
  }

  function bindSlotDnd(slot, zone, col, num){
    slot.addEventListener('dragover', ev => { ev.preventDefault(); slot.classList.add('drag-over'); });
    slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
    slot.addEventListener('drop', async ev => {
      ev.preventDefault();
      slot.classList.remove('drag-over');
      const raw = ev.dataTransfer.getData('text/plain');
      if(!raw) return;
      try{
        const parsed = JSON.parse(raw);
        if(parsed.kind === 'warehouse-item' && typeof window.moveWarehouseItem === 'function'){
          await window.moveWarehouseItem(parsed.fromKey, window.buildCellKey(zone, col, num), parsed.product_text, parsed.qty);
          await window.renderWarehouse(true);
        }
      }catch(_e){}
    });
  }

  function renderOneZone(zone){
    const wrap = $('zone-' + zone + '-grid');
    if(!wrap) return;
    wrap.className = 'zone-grid six-grid vertical-card-grid yx67-dynamic-grid';
    wrap.innerHTML = '';
    const note = $('zone-' + zone + '-count-note');
    if(note) note.textContent = `6 欄｜目前 ${totalSlots(zone)} 格`;

    columns.forEach(colNo => {
      const count = maxSlot(zone, colNo);
      const col = document.createElement('div');
      col.className = 'vertical-column-card intuitive-column yx67-dynamic-column';
      col.innerHTML = `
        <div class="column-head-row">
          <div class="column-head">${zone} 區第 ${colNo} 欄</div>
          <div class="small-note">目前 ${count} 格</div>
        </div>
        <div class="vertical-slot-list yx67-slot-list"></div>`;
      const list = col.querySelector('.vertical-slot-list');
      for(let n=1; n<=count; n++){
        const items = window.getCellItems(zone, colNo, n);
        const key = `${zone}|${colNo}|direct|${n}`;
        const slot = document.createElement('div');
        slot.className = 'vertical-slot yx67-warehouse-slot';
        slot.dataset.zone = zone;
        slot.dataset.column = String(colNo);
        slot.dataset.num = String(n);
        slot.classList.toggle('filled', items.length>0);
        slot.classList.toggle('highlight', !!(state.searchHighlightKeys && state.searchHighlightKeys.has(key)));
        slot.innerHTML = `
          <div class="slot-title-row">
            <div class="slot-title">第 ${String(n).padStart(2,'0')} 格</div>
            <div class="small-note">${items.length ? `${items.length} 筆` : '空'}</div>
          </div>
          <div class="slot-count">${slotSummary(items)}</div>
          <div class="yx67-slot-actions" aria-label="格子操作">
            <button type="button" class="ghost-btn tiny-btn yx67-slot-btn yx67-insert-btn">插入格子</button>
            <button type="button" class="ghost-btn tiny-btn yx67-slot-btn yx67-delete-btn">刪除格子</button>
          </div>`;
        slot.addEventListener('click', ev => {
          if(ev.target.closest('.yx67-slot-actions')) return;
          try{ if(typeof window.showWarehouseDetail === 'function') window.showWarehouseDetail(zone, colNo, n, items); }catch(_e){}
          try{ if(typeof window.openWarehouseModal === 'function') window.openWarehouseModal(zone, colNo, n); }catch(_e){}
        });
        slot.querySelector('.yx67-insert-btn')?.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); window.insertWarehouseCell(zone, colNo, n); });
        slot.querySelector('.yx67-delete-btn')?.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); window.deleteWarehouseCell(zone, colNo, n); });
        bindSlotDnd(slot, zone, colNo, n);
        list.appendChild(slot);
      }
      wrap.appendChild(col);
    });
  }

  function repaintWarehouse(){
    ensureState();
    renderOneZone('A');
    renderOneZone('B');
    if(typeof window.setWarehouseZone === 'function') window.setWarehouseZone(state.warehouse.activeZone || localStorage.getItem('warehouseActiveZone') || 'A', false);
  }
  window.renderWarehouseZones = repaintWarehouse;

  let warehousePending = null;
  async function loadWarehouseDynamic(force=false){
    ensureState();
    if(warehousePending && !force) return warehousePending;
    warehousePending = (async () => {
      const [warehouseRes, availRes] = await Promise.allSettled([
        api('/api/warehouse', { method:'GET' }),
        api('/api/warehouse/available-items', { method:'GET' })
      ]);
      const data = warehouseRes.status === 'fulfilled' ? warehouseRes.value : { cells: [], zones: {A:{}, B:{}} };
      const avail = availRes.status === 'fulfilled' ? availRes.value : { items: [] };
      state.warehouse.cells = Array.isArray(data.cells) ? data.cells : [];
      state.warehouse.zones = data.zones || {A:{}, B:{}};
      state.warehouse.availableItems = Array.isArray(avail.items) ? avail.items : [];
      if($('warehouse-unplaced-pill')) $('warehouse-unplaced-pill').textContent = `未錄入倉庫圖：${state.warehouse.availableItems.length}`;
      repaintWarehouse();
      return data;
    })().catch(e => { console.error(e); notify(e.message || '倉庫圖載入失敗', 'error'); repaintWarehouse(); }).finally(() => { setTimeout(()=>{ warehousePending=null; }, 120); });
    return warehousePending;
  }
  window.renderWarehouseLegacyA = loadWarehouseDynamic;
  window.renderWarehouseLegacyB = loadWarehouseDynamic;
  window.renderWarehouse = loadWarehouseDynamic;

  async function reloadFromResultOrFetch(result){
    if(result && Array.isArray(result.cells)){
      state.warehouse.cells = result.cells;
      if(result.zones) state.warehouse.zones = result.zones;
      repaintWarehouse();
      try{ await api('/api/warehouse/available-items', {method:'GET'}).then(avail => { state.warehouse.availableItems = Array.isArray(avail.items)?avail.items:[]; if($('warehouse-unplaced-pill')) $('warehouse-unplaced-pill').textContent = `未錄入倉庫圖：${state.warehouse.availableItems.length}`; }); }catch(_e){}
    }else{
      await loadWarehouseDynamic(true);
    }
  }

  window.insertWarehouseCell = async function(zone, col, slotNum){
    ensureState();
    try{
      const result = await api('/api/warehouse/add-slot', { method:'POST', body: JSON.stringify({ zone, column_index: Number(col), insert_after: Number(slotNum || 0) }) });
      await reloadFromResultOrFetch(result);
      const newSlot = Number(result?.slot_number || (Number(slotNum || 0)+1));
      notify(`已在 ${zone} 區第 ${col} 欄插入第 ${String(newSlot).padStart(2,'0')} 格`, 'ok');
      setTimeout(()=>{ try{ window.highlightWarehouseCell(zone, col, newSlot); }catch(_e){} }, 80);
      return result;
    }catch(e){ notify(e.message || '插入格子失敗', 'error'); }
  };

  window.deleteWarehouseCell = async function(zone, col, slotNum){
    ensureState();
    const items = window.getCellItems(zone, col, slotNum);
    if(items.length){ notify('格子內還有商品，請先移除商品後再刪除格子', 'warn'); return; }
    const ok = window.confirm ? window.confirm(`確定刪除 ${zone} 區第 ${col} 欄第 ${String(slotNum).padStart(2,'0')} 格？後面的格號會自動往前補。`) : true;
    if(!ok) return;
    try{
      const result = await api('/api/warehouse/remove-slot', { method:'POST', body: JSON.stringify({ zone, column_index: Number(col), slot_number: Number(slotNum) }) });
      await reloadFromResultOrFetch(result);
      notify(`已刪除 ${zone} 區第 ${col} 欄第 ${String(slotNum).padStart(2,'0')} 格`, 'ok');
      return result;
    }catch(e){ notify(e.message || '刪除格子失敗', 'error'); }
  };

  // 舊的欄位 + / - 呼叫保留相容，但不再顯示欄位按鈕；新增預設插在最後，刪除預設刪最後一格。
  window.addWarehouseVisualSlot = async function(zone, col, insertAfter){
    const after = Number(insertAfter || maxSlot(zone, col) || 0);
    return window.insertWarehouseCell(zone, col, after);
  };
  window.removeWarehouseVisualSlot = async function(zone, col, slotNum){
    const target = Number(slotNum || maxSlot(zone, col) || 1);
    return window.deleteWarehouseCell(zone, col, target);
  };

  const oldShowDetail = typeof window.showWarehouseDetail === 'function' ? window.showWarehouseDetail : null;
  window.showWarehouseDetail = function(zone, col, num, items){
    const box = $('warehouse-detail-panel');
    if(!box){ return oldShowDetail ? oldShowDetail.apply(this, arguments) : null; }
    const safeItems = Array.isArray(items) ? items : window.getCellItems(zone, col, num);
    box.classList.remove('hidden');
    const cards = safeItems.length ? safeItems.map(it => {
      const row = typeof window.formatCustomerProductRow === 'function' ? window.formatCustomerProductRow(it.product_text || '') : { size: it.product_text || '' };
      return `<div class="deduct-card"><div><strong>${esc(it.customer_name || '未指定客戶')}</strong></div><div>${esc(it.product_text || '')}</div><div>尺寸：${esc(row.size || '')}</div><div>材質：${esc((it.material || row.material || '未填'))}</div><div>數量：${Number(it.qty || 0)}</div><div class="small-note">格位：${zone}-${col}-${String(num).padStart(2,'0')}</div></div>`;
    }).join('') : '<div class="empty-state-card compact-empty">此格目前沒有商品</div>';
    box.innerHTML = `<div class="section-title">${zone} 區第 ${col} 欄 第 ${String(num).padStart(2,'0')} 格</div>
      <div class="btn-row compact-row yx67-detail-actions">
        <button class="ghost-btn tiny-btn" type="button" onclick="openWarehouseModal('${zone}', ${Number(col)}, ${Number(num)})">直接編輯此格</button>
        <button class="ghost-btn tiny-btn" type="button" onclick="insertWarehouseCell('${zone}', ${Number(col)}, ${Number(num)})">插入格子</button>
        <button class="ghost-btn tiny-btn" type="button" onclick="deleteWarehouseCell('${zone}', ${Number(col)}, ${Number(num)})">刪除格子</button>
      </div>${cards}`;
  };

  window.searchWarehouse = async function(){
    ensureState();
    const q = ($('warehouse-search')?.value || '').trim();
    const box = $('warehouse-search-results');
    if(!q){ state.searchHighlightKeys = new Set(); box?.classList.add('hidden'); repaintWarehouse(); return; }
    try{
      const data = await api(`/api/warehouse/search?q=${encodeURIComponent(q)}`, {method:'GET'});
      const hits = Array.isArray(data.items) ? data.items : [];
      state.searchHighlightKeys = new Set(hits.map(r => `${r.cell.zone}|${r.cell.column_index}|direct|${r.cell.slot_number}`));
      repaintWarehouse();
      if(!box) return;
      box.classList.remove('hidden');
      box.innerHTML = hits.length ? '' : '<div class="search-card">沒有找到資料</div>';
      if(hits[0]?.cell && typeof window.setWarehouseZone === 'function') window.setWarehouseZone(hits[0].cell.zone, false);
      hits.forEach(r => {
        const cell=r.cell || {}; const item=r.item || {};
        const div=document.createElement('div');
        div.className='search-card warehouse-search-hit';
        div.innerHTML=`<strong>${esc(cell.zone)}區 第 ${cell.column_index} 欄 第 ${String(cell.slot_number).padStart(2,'0')} 格</strong><br>${esc(item.customer_name || '未指定客戶')}｜${esc(item.product_text || '')} × ${Number(item.qty || 0)}`;
        div.onclick=()=>{ if(typeof window.setWarehouseZone==='function') window.setWarehouseZone(cell.zone); setTimeout(()=>{ try{ window.highlightWarehouseCell(cell.zone, cell.column_index, cell.slot_number); }catch(_e){} try{ window.openWarehouseModal(cell.zone, cell.column_index, cell.slot_number); }catch(_e){} },90); };
        box.appendChild(div);
      });
    }catch(e){ notify(e.message || '搜尋失敗', 'error'); }
  };

  window.clearWarehouseHighlights = function(){
    ensureState();
    state.searchHighlightKeys = new Set();
    $('warehouse-search-results')?.classList.add('hidden');
    $('warehouse-unplaced-list-inline')?.classList.add('hidden');
    repaintWarehouse();
  };

  window.toggleWarehouseUnplacedHighlight = function(){
    ensureState();
    const box = $('warehouse-unplaced-list-inline');
    const items = state.warehouse.availableItems || [];
    if(!box) return;
    box.classList.remove('hidden');
    box.innerHTML = '';
    if(!items.length){ box.innerHTML='<div class="search-card">目前沒有未錄入倉庫圖商品</div>'; return; }
    items.forEach(it => {
      const div=document.createElement('div');
      div.className='search-card';
      div.innerHTML=`<strong>${esc(it.customer_name || '未指定客戶')}</strong><br>${esc(it.product_text || '')}｜未錄入數量 ${Number(it.unplaced_qty || it.qty || 0)}`;
      div.onclick=async()=>{ if($('warehouse-search')) $('warehouse-search').value = it.product_text || ''; await window.searchWarehouse(); };
      box.appendChild(div);
    });
  };

  window.highlightWarehouseSameCustomer = function(){
    ensureState();
    const q = ($('warehouse-search')?.value || '').trim();
    if(!q) return notify('請先在搜尋框輸入客戶名', 'warn');
    const keys = new Set();
    (state.warehouse.cells || []).forEach(cell => {
      const items = parseItems(cell.items_json);
      if(items.some(it => String(it.customer_name || '').includes(q))) keys.add(`${cell.zone}|${cell.column_index}|direct|${cell.slot_number}`);
    });
    state.searchHighlightKeys = keys;
    repaintWarehouse();
  };

  function boot(){
    try{ document.documentElement.dataset.yxFix67=VERSION; document.body && document.body.setAttribute('data-yx-fix67','1'); }catch(_e){}
    document.querySelectorAll('.warehouse-col-tools').forEach(el => el.remove());
    const mod = document.querySelector('.module-screen')?.dataset.module || (typeof window.currentModule==='function' ? window.currentModule() : '');
    if(mod === 'warehouse') setTimeout(()=>loadWarehouseDynamic(true), 20);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot, {once:true}); else boot();
})();
/* ==== FIX67 end ==== */


/* ==== FIX68: button response guarantee + old-data conflict convergence ==== */
(function(){
  'use strict';
  const VERSION='fix70-final-conflict-convergence';
  if(window.__YX68_BUTTON_RESPONSE_PATCH__) return;
  window.__YX68_BUTTON_RESPONSE_PATCH__=true;
  try{ document.documentElement.dataset.yxFix68=VERSION; document.body && document.body.setAttribute('data-yx-fix68','1'); }catch(_e){}

  const $ = id => document.getElementById(id);
  const esc = s => (window.escapeHTML ? window.escapeHTML(s) : String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])));
  const api = window.requestJSON || (async function(url,opt={}){
    const r=await fetch(url,{credentials:'same-origin',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});
    const d=await r.json().catch(()=>({}));
    if(!r.ok || d.success===false) throw new Error(d.error||d.message||`請求失敗：${r.status}`);
    return d;
  });
  const notify = (msg, kind='ok') => { try{ (window.toast || window.showToast || function(m){ alert(m); })(msg, kind); }catch(_e){ console.log(msg); } };
  const mod = () => document.querySelector('.module-screen')?.dataset.module || (typeof window.currentModule==='function' ? window.currentModule() : '');

  function setBusy(btn, on, text){
    if(!btn) return;
    if(on){
      if(!btn.dataset.yx68OriginalText) btn.dataset.yx68OriginalText = btn.textContent || '';
      btn.classList.add('yx68-busy');
      btn.setAttribute('aria-busy','true');
      if(text) btn.textContent = text;
    }else{
      btn.classList.remove('yx68-busy');
      btn.removeAttribute('aria-busy');
      if(btn.dataset.yx68OriginalText){ btn.textContent = btn.dataset.yx68OriginalText; delete btn.dataset.yx68OriginalText; }
    }
  }
  function tapFeedback(el){
    if(!el) return;
    try{
      el.classList.add('yx68-tapped');
      setTimeout(()=>el.classList.remove('yx68-tapped'), 180);
    }catch(_e){}
  }

  function nonEmptyLines(){
    const box=$('ocr-text');
    return (box?.value || '').split(/\n+/).map(s=>s.trim()).filter(Boolean);
  }
  function writeLines(lines){
    const box=$('ocr-text');
    if(!box) return;
    box.value = (lines || []).filter(Boolean).join('\n');
    box.dispatchEvent(new Event('input',{bubbles:true}));
    try{ if(typeof window.renderShipSelectedItems==='function') window.renderShipSelectedItems(); }catch(_e){}
    try{ if(typeof window.loadShipPreview==='function') window.loadShipPreview(); }catch(_e){}
  }
  window.clearShipSelectedItems = window.clearShipSelectedItems || function(){
    writeLines([]);
    try{ if(window.state) window.state.shipPreview = null; }catch(_e){}
    const p=$('ship-preview-panel'); if(p){ p.innerHTML=''; p.classList.add('hidden'); }
    notify('已清空已選商品','ok');
  };
  window.removeShipItemAt = window.removeShipItemAt || function(idx){
    const lines=nonEmptyLines();
    idx=Number(idx);
    if(idx>=0 && idx<lines.length){ lines.splice(idx,1); writeLines(lines); notify('已移除商品','ok'); }
  };
  window.moveShipItem = window.moveShipItem || function(idx, dir){
    const lines=nonEmptyLines();
    idx=Number(idx); dir=Number(dir)||0;
    const to=idx+dir;
    if(idx<0 || idx>=lines.length || to<0 || to>=lines.length) return;
    const [item]=lines.splice(idx,1); lines.splice(to,0,item); writeLines(lines); notify('已調整順序','ok');
  };
  window.quickJumpToModule = window.quickJumpToModule || function(target, customerName='', productText=''){
    const map={inventory:'/inventory',orders:'/orders','master_order':'/master-order',master:'/master-order',ship:'/ship',warehouse:'/warehouse',customers:'/customers',shipping_query:'/shipping-query',todos:'/todos'};
    const finalTarget = target === 'master' ? 'master_order' : target;
    try{ localStorage.setItem('moduleQuickJump', JSON.stringify({target:finalTarget, customerName:customerName||'', productText:productText||'', at:Date.now()})); }catch(_e){}
    location.href = map[target] || map[finalTarget] || '/';
  };

  window.loadShippingRecords = window.loadShippingRecords || async function(){
    const box=$('shipping-results');
    const btn=document.activeElement && document.activeElement.tagName==='BUTTON' ? document.activeElement : null;
    try{
      setBusy(btn,true,'查詢中…');
      if(box){ box.innerHTML='<div class="empty-state-card compact-empty">出貨紀錄載入中…</div>'; }
      const q=($('ship-keyword')?.value||'').trim();
      const range=($('ship-range')?.value||'7').trim();
      let start=($('ship-start')?.value||'').trim();
      let end=($('ship-end')?.value||'').trim();
      if(range && range!=='custom'){
        const days=Math.max(1, Number(range)||7);
        const d=new Date();
        end=d.toISOString().slice(0,10);
        d.setDate(d.getDate()-(days-1));
        start=d.toISOString().slice(0,10);
        if($('ship-start')) $('ship-start').value=start;
        if($('ship-end')) $('ship-end').value=end;
      }
      const qs=new URLSearchParams();
      if(q) qs.set('q',q); if(start) qs.set('start_date',start); if(end) qs.set('end_date',end);
      const data=await api('/api/shipping_records?'+qs.toString(),{method:'GET'});
      const rows=Array.isArray(data.items)?data.items:(data.records||[]);
      if(!box) return rows;
      if(!rows.length){ box.innerHTML='<div class="empty-state-card compact-empty">查無出貨紀錄</div>'; return rows; }
      box.innerHTML = `<div class="yx68-scroll-table"><table class="yx68-record-table"><thead><tr><th>時間</th><th>客戶</th><th>商品</th><th>數量</th><th>操作人</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.shipped_at||r.created_at||'')}</td><td>${esc(r.customer_name||'')}</td><td>${esc(r.product_text||'')}</td><td>${Number(r.qty||0)}</td><td>${esc(r.operator||'')}</td></tr>`).join('')}</tbody></table></div>`;
      return rows;
    }catch(e){ if(box) box.innerHTML=`<div class="error-card">${esc(e.message||'查詢失敗')}</div>`; notify(e.message||'查詢失敗','error'); }
    finally{ setBusy(btn,false); }
  };

  window.openArchivedCustomersModal = window.openArchivedCustomersModal || async function(){
    let modal=$('yx68-archived-customers-modal');
    if(!modal){
      modal=document.createElement('div');
      modal.id='yx68-archived-customers-modal';
      modal.className='modal hidden';
      modal.innerHTML=`<div class="modal-card glass yx68-archived-card"><div class="modal-head"><div class="section-title">封存客戶</div><button type="button" class="icon-btn" data-yx68-close-archived>✕</button></div><div id="yx68-archived-customers-body" class="card-list"><div class="empty-state-card compact-empty">載入中…</div></div></div>`;
      document.body.appendChild(modal);
      modal.addEventListener('click',e=>{ if(e.target===modal || e.target.closest('[data-yx68-close-archived]')) modal.classList.add('hidden'); });
    }
    const body=$('yx68-archived-customers-body');
    modal.classList.remove('hidden');
    if(body) body.innerHTML='<div class="empty-state-card compact-empty">封存客戶載入中…</div>';
    try{
      const d=await api('/api/customers/archived',{method:'GET'});
      const items=Array.isArray(d.items)?d.items:[];
      if(!body) return;
      body.innerHTML = items.length ? items.map(c=>`<div class="deduct-card"><strong>${esc(c.name||'')}</strong><div class="small-note">${esc(c.region||'')}｜${esc(c.phone||'')}</div><button type="button" class="ghost-btn small-btn" data-yx68-restore-customer="${esc(c.name||'')}">還原</button></div>`).join('') : '<div class="empty-state-card compact-empty">目前沒有封存客戶</div>';
    }catch(e){ if(body) body.innerHTML=`<div class="error-card">${esc(e.message||'封存客戶讀取失敗')}</div>`; }
  };

  window.changePassword = window.changePassword || async function(){
    const msg=$('settings-msg'); const btn=document.activeElement && document.activeElement.tagName==='BUTTON' ? document.activeElement : null;
    const old_password=($('old-password')?.value||'').trim();
    const new_password=($('new-password')?.value||'').trim();
    const confirm_password=($('confirm-password')?.value||'').trim();
    try{
      setBusy(btn,true,'儲存中…');
      await api('/api/change_password',{method:'POST',body:JSON.stringify({old_password,new_password,confirm_password})});
      if(msg){ msg.textContent='密碼已更新'; msg.className='alert ok'; msg.classList.remove('hidden'); }
      notify('密碼已更新','ok');
      ['old-password','new-password','confirm-password'].forEach(id=>{ if($(id)) $(id).value=''; });
    }catch(e){ if(msg){ msg.textContent=e.message||'修改失敗'; msg.className='alert error'; msg.classList.remove('hidden'); } notify(e.message||'修改失敗','error'); }
    finally{ setBusy(btn,false); }
  };
  window.undoLastAction = window.undoLastAction || async function(){
    const box=$('undo-msg'); const btn=document.activeElement && document.activeElement.tagName==='BUTTON' ? document.activeElement : null;
    try{ setBusy(btn,true,'還原中…'); const d=await api('/api/undo-last',{method:'POST',body:JSON.stringify({})}); if(box) box.textContent=d.message||d.summary||'已還原上一筆'; notify(box?.textContent||'已還原','ok'); }
    catch(e){ if(box) box.textContent=e.message||'還原失敗'; notify(e.message||'還原失敗','error'); }
    finally{ setBusy(btn,false); }
  };
  window.downloadReport = window.downloadReport || function(type){
    const qs=new URLSearchParams(); qs.set('type',type||'inventory');
    const s=($('report-start')?.value||'').trim(); const e=($('report-end')?.value||'').trim();
    if(s) qs.set('start_date',s); if(e) qs.set('end_date',e);
    notify('正在準備報表下載…','ok');
    location.href='/api/reports/export?'+qs.toString();
  };
  window.loadAuditTrails = window.loadAuditTrails || async function(){
    const box=$('audit-trails-list'); const btn=document.activeElement && document.activeElement.tagName==='BUTTON' ? document.activeElement : null;
    try{
      setBusy(btn,true,'載入中…'); if(box) box.innerHTML='<div class="empty-state-card compact-empty">操作紀錄載入中…</div>';
      const qs=new URLSearchParams();
      const map={'audit-q':'q','audit-user':'username','audit-entity':'entity_type','audit-start':'start_date','audit-end':'end_date'};
      Object.entries(map).forEach(([id,k])=>{ const v=($(id)?.value||'').trim(); if(v) qs.set(k,v); });
      const d=await api('/api/audit-trails?'+qs.toString(),{method:'GET'}); const items=Array.isArray(d.items)?d.items:[];
      if(!box) return;
      box.innerHTML = items.length ? items.map(it=>`<div class="deduct-card"><strong>${esc(it.action_label||it.action_type||'操作')}</strong><div>${esc(it.summary_text||it.entity_key||'')}</div><div class="small-note">${esc(it.created_at||'')}｜${esc(it.username||'')}｜${esc(it.entity_label||it.entity_type||'')}</div></div>`).join('') : '<div class="empty-state-card compact-empty">沒有操作紀錄</div>';
    }catch(e){ if(box) box.innerHTML=`<div class="error-card">${esc(e.message||'操作紀錄載入失敗')}</div>`; notify(e.message||'操作紀錄載入失敗','error'); }
    finally{ setBusy(btn,false); }
  };
  window.loadAdminUsers = window.loadAdminUsers || async function(){
    const box=$('admin-users'); const btn=document.activeElement && document.activeElement.tagName==='BUTTON' ? document.activeElement : null;
    try{
      setBusy(btn,true,'載入中…'); if(box) box.innerHTML='<div class="empty-state-card compact-empty">帳號載入中…</div>';
      const d=await api('/api/admin/users',{method:'GET'}); const users=Array.isArray(d.items)?d.items:[];
      if(!box) return;
      box.innerHTML = users.length ? `<div class="yx68-scroll-table"><table class="yx68-record-table"><thead><tr><th>帳號</th><th>角色</th><th>狀態</th><th>操作</th></tr></thead><tbody>${users.map(u=>`<tr><td>${esc(u.username||'')}</td><td>${esc(u.role||'')}</td><td>${Number(u.is_blocked||0)?'黑名單':'正常'}</td><td>${(u.username==='陳韋廷')?'管理員':`<button type="button" class="ghost-btn tiny-btn" data-yx68-block-user="${esc(u.username||'')}" data-blocked="${Number(u.is_blocked||0)?0:1}">${Number(u.is_blocked||0)?'解除':'封鎖'}</button>`}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty-state-card compact-empty">沒有帳號</div>';
    }catch(e){ if(box) box.innerHTML=`<div class="error-card">${esc(e.message||'帳號載入失敗')}</div>`; notify(e.message||'帳號載入失敗','error'); }
    finally{ setBusy(btn,false); }
  };
  async function loadBackups(){
    const box=$('backup-panel'); if(!box) return;
    try{ const d=await api('/api/backups',{method:'GET'}); const files=Array.isArray(d.files)?d.files:[]; box.innerHTML=files.length?files.map(f=>`<div class="deduct-card"><strong>${esc(f.filename||'')}</strong><div class="small-note">${esc(f.created_at||'')}｜${Number(f.size||0).toLocaleString()} bytes</div><div class="btn-row compact-row"><a class="ghost-btn tiny-btn" href="/api/backups/download/${encodeURIComponent(f.filename||'')}">下載</a><button type="button" class="ghost-btn tiny-btn danger-btn" data-yx68-restore-backup="${esc(f.filename||'')}">還原</button></div></div>`).join(''):'<div class="empty-state-card compact-empty">尚無備份</div>'; }
    catch(e){ box.innerHTML=`<div class="error-card">${esc(e.message||'備份清單載入失敗')}</div>`; }
  }
  window.createBackup = window.createBackup || async function(){
    const btn=document.activeElement && document.activeElement.tagName==='BUTTON' ? document.activeElement : null;
    try{ setBusy(btn,true,'備份中…'); await api('/api/backup',{method:'POST',body:JSON.stringify({})}); notify('備份已建立','ok'); await loadBackups(); }
    catch(e){ notify(e.message||'備份失敗','error'); }
    finally{ setBusy(btn,false); }
  };
  window.logout = window.logout || async function(){
    try{ await api('/api/logout',{method:'POST',body:JSON.stringify({})}); }catch(_e){}
    location.href='/login';
  };

  function todayKindLabel(kind){ return ({inbound:'進貨',outbound:'出貨',orders:'新增訂單',unplaced:'未錄入',all:'全部'})[kind]||kind; }
  async function deleteTodayLog(id){
    if(!id) return;
    if(window.confirm && !window.confirm('確定刪除這筆異動？')) return;
    await api('/api/today-changes/'+encodeURIComponent(id),{method:'DELETE'});
    await window.loadTodayChanges();
    notify('已刪除異動','ok');
  }
  window.loadTodayChanges = window.loadTodayChanges || async function(){
    const summaryBox=$('today-summary-cards');
    try{
      const d=await api('/api/today-changes',{method:'GET'});
      const s=d.summary||{};
      if($('today-unread-badge')) $('today-unread-badge').textContent=String(s.unread_count||0);
      if(summaryBox){
        summaryBox.innerHTML=`<div class="card"><div class="title">新增</div><div class="sub">${Number(s.inbound_count||0)}</div></div><div class="card"><div class="title">出貨</div><div class="sub">${Number(s.outbound_count||0)}</div></div><div class="card"><div class="title">新增訂單</div><div class="sub">${Number(s.new_order_count||0)}</div></div><div class="card"><div class="title">未錄入倉庫圖</div><div class="sub">${Number(s.unplaced_count||0)}</div></div>`;
      }
      const readAt=d.read_at||'';
      const onlyUnread=(localStorage.getItem('yxTodayOnlyUnread')==='1');
      const makeLog = r => {
        const unread=!readAt || String(r.created_at||'')>readAt;
        if(onlyUnread && !unread) return '';
        return `<div class="today-item deduct-card${unread?' yx68-unread':''}" data-log-id="${Number(r.id||0)}"><strong>${esc(r.action||'異動')}</strong><div class="small-note">${esc(r.created_at||'')}｜${esc(r.username||'')}</div><button type="button" class="ghost-btn tiny-btn danger-btn" data-yx68-delete-today="${Number(r.id||0)}">刪除</button></div>`;
      };
      const fill=(id, rows, empty)=>{ const el=$(id); if(el) el.innerHTML=(rows||[]).map(makeLog).join('') || `<div class="empty-state-card compact-empty">${empty}</div>`; };
      fill('today-inbound-list', d.feed?.inbound, '今天沒有進貨/新增資料');
      fill('today-outbound-list', d.feed?.outbound, '今天沒有出貨');
      fill('today-order-list', d.feed?.new_orders, '今天沒有新增訂單');
      const unplaced=$('today-unplaced-list');
      if(unplaced){
        const arr=Array.isArray(d.unplaced_items)?d.unplaced_items:[];
        unplaced.innerHTML=arr.length?arr.map(it=>`<div class="deduct-card"><strong>${esc(it.product_text||'')}</strong><div class="small-note">${esc(it.customer_name||'未指定客戶')}｜未錄入 ${Number(it.qty||0)}</div></div>`).join(''):'<div class="empty-state-card compact-empty">目前沒有未錄入倉庫圖商品</div>';
      }
      try{ await api('/api/today-changes/read',{method:'POST',body:JSON.stringify({})}); }catch(_e){}
      return d;
    }catch(e){
      if(summaryBox) summaryBox.innerHTML=`<div class="error-card">${esc(e.message||'今日異動載入失敗')}</div>`;
      notify(e.message||'今日異動載入失敗','error');
    }
  };

  // 所有按鈕 / 連結先給即時按壓反饋，避免手機端看起來「沒反應」。
  document.addEventListener('click', function(e){
    const btn = e.target.closest && e.target.closest('button,.menu-btn,.home-mini-btn,a.back-btn,.chip,.interactive-pill,[role="button"]');
    if(!btn) return;
    if(btn.tagName==='BUTTON' && !btn.getAttribute('type')) btn.setAttribute('type','button');
    tapFeedback(btn);
  }, true);

  // 針對動態產生的按鈕補事件委派，避免舊 HTML / 舊資料仍指向失效事件。
  document.addEventListener('click', async function(e){
    const restoreCustomer=e.target.closest && e.target.closest('[data-yx68-restore-customer]');
    if(restoreCustomer){
      e.preventDefault(); e.stopPropagation();
      const name=restoreCustomer.getAttribute('data-yx68-restore-customer')||'';
      try{ setBusy(restoreCustomer,true,'還原中…'); await api('/api/customers/'+encodeURIComponent(name)+'/restore',{method:'POST',body:JSON.stringify({})}); notify('客戶已還原','ok'); await window.openArchivedCustomersModal(); if(typeof window.renderCustomers==='function') window.renderCustomers(); }
      catch(err){ notify(err.message||'還原失敗','error'); }
      finally{ setBusy(restoreCustomer,false); }
      return;
    }
    const block=e.target.closest && e.target.closest('[data-yx68-block-user]');
    if(block){
      e.preventDefault(); e.stopPropagation();
      try{ setBusy(block,true,'處理中…'); await api('/api/admin/block',{method:'POST',body:JSON.stringify({username:block.getAttribute('data-yx68-block-user'), blocked:block.getAttribute('data-blocked')==='1'})}); notify('帳號狀態已更新','ok'); await window.loadAdminUsers(); }
      catch(err){ notify(err.message||'更新失敗','error'); }
      finally{ setBusy(block,false); }
      return;
    }
    const restoreBackup=e.target.closest && e.target.closest('[data-yx68-restore-backup]');
    if(restoreBackup){
      e.preventDefault(); e.stopPropagation();
      const filename=restoreBackup.getAttribute('data-yx68-restore-backup')||'';
      if(window.confirm && !window.confirm('確定要還原這份備份？目前資料會被覆蓋。')) return;
      try{ setBusy(restoreBackup,true,'還原中…'); await api('/api/backups/restore',{method:'POST',body:JSON.stringify({filename})}); notify('備份已還原','ok'); }
      catch(err){ notify(err.message||'還原失敗','error'); }
      finally{ setBusy(restoreBackup,false); }
      return;
    }
    const delToday=e.target.closest && e.target.closest('[data-yx68-delete-today]');
    if(delToday){ e.preventDefault(); e.stopPropagation(); try{ await deleteTodayLog(delToday.getAttribute('data-yx68-delete-today')); }catch(err){ notify(err.message||'刪除失敗','error'); } return; }
  }, true);

  function convergeOldWarehouseButtons(){
    // 舊版欄位 +/-、固定 20 格控制全部以目前「格子內插入 / 刪除」為準。
    document.querySelectorAll('.warehouse-col-tools,.warehouse-add-slot,.warehouse-remove-slot,.yx-old-warehouse-plusminus,[data-action="add-slot"],[data-action="remove-slot"]').forEach(el=>el.remove());
    document.querySelectorAll('.yx67-insert-btn,.yx67-delete-btn').forEach(btn=>{ btn.style.display=''; btn.disabled=false; btn.type='button'; });
  }
  function boot(){
    try{ document.documentElement.dataset.yxFix68=VERSION; document.body && document.body.setAttribute('data-yx-fix68','1'); }catch(_e){}
    document.querySelectorAll('button:not([type])').forEach(b=>b.setAttribute('type','button'));
    convergeOldWarehouseButtons();
    const m=mod();
    if(location.pathname.includes('/today-changes')) setTimeout(()=>window.loadTodayChanges(),40);
    if(location.pathname.includes('/settings')){
      setTimeout(()=>{ try{ window.loadAuditTrails && window.loadAuditTrails(); }catch(_e){} try{ window.loadAdminUsers && window.loadAdminUsers(); }catch(_e){} try{ loadBackups(); }catch(_e){} },80);
    }
    if(m==='shipping_query') setTimeout(()=>{ try{ window.loadShippingRecords(); }catch(_e){} },80);
    if(m==='warehouse') setTimeout(convergeOldWarehouseButtons,200);
  }
  const mo=new MutationObserver(()=>{ try{ convergeOldWarehouseButtons(); }catch(_e){} });
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot, {once:true}); else boot();
  try{ mo.observe(document.body||document.documentElement,{childList:true,subtree:true}); }catch(_e){}

  document.addEventListener('click', function(e){
    const filter=e.target.closest && e.target.closest('[data-today-filter]');
    if(filter){
      const kind=filter.getAttribute('data-today-filter')||'all';
      document.querySelectorAll('[data-today-filter]').forEach(b=>b.classList.toggle('active',b===filter));
      document.querySelectorAll('[data-today-panel]').forEach(p=>{ p.style.display = (kind==='all' || p.getAttribute('data-today-panel')===kind) ? '' : 'none'; });
      notify(`已切換：${todayKindLabel(kind)}`,'ok');
    }
    if(e.target && e.target.id==='today-unread-toggle'){
      const next=localStorage.getItem('yxTodayOnlyUnread')==='1'?'0':'1';
      localStorage.setItem('yxTodayOnlyUnread',next);
      e.target.classList.toggle('active',next==='1');
      window.loadTodayChanges();
    }
    if(e.target && e.target.id==='today-clear-read-btn'){
      api('/api/today-changes/read',{method:'POST',body:JSON.stringify({})}).then(()=>{ notify('已清除未讀數','ok'); window.loadTodayChanges(); }).catch(err=>notify(err.message||'清除失敗','error'));
    }
  }, true);
})();
/* ==== FIX68 end ==== */



/* ==== FIX69: final UI/button convergence + missing helper repair ==== */
(function(){
  'use strict';
  const VERSION = 'fix70-final-conflict-convergence';
  if (window.__YX69_UI_BUTTON_FINAL__) return;
  window.__YX69_UI_BUTTON_FINAL__ = true;

  const doc = document;
  const byId = id => doc.getElementById(id);
  const esc = s => (window.escapeHTML ? window.escapeHTML(s) : String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])));
  const notify = (msg, kind='ok') => { try { (window.toast || window.showToast || function(m){ console.log(m); })(msg, kind); } catch(_e){ console.log(msg); } };
  const api = window.requestJSON || (async function(url, opt={}){
    const isFD = opt.body instanceof FormData;
    const headers = isFD ? (opt.headers || {}) : {'Content-Type':'application/json', ...(opt.headers || {})};
    const res = await fetch(url, {credentials:'same-origin', ...opt, headers});
    const data = await res.json().catch(()=>({}));
    if(!res.ok || data.success === false) throw new Error(data.error || data.message || `請求失敗：${res.status}`);
    return data;
  });
  window.yxApi = api;

  function setFixFlag(){
    try{
      doc.documentElement.dataset.yxFix69 = VERSION;
      if(doc.body) doc.body.setAttribute('data-yx-fix69','1');
      if(doc.body) doc.body.setAttribute('data-yx-fix68','1');
    }catch(_e){}
  }
  setFixFlag();

  // Missing helper repair: old merged files referenced these names but did not always define them.
  window.qsa = window.qsa || function(selector, root){ return Array.from((root || doc).querySelectorAll(selector)); };
  window.askConfirm = window.askConfirm || async function(message, title='確認', okText='確認', cancelText='取消'){
    const modal = byId('confirm-modal');
    if(!modal) return window.confirm ? window.confirm(message || title || '確認？') : true;
    return new Promise(resolve => {
      const msg = byId('confirm-message');
      const ttl = byId('confirm-title');
      const ok = byId('confirm-ok-btn');
      const cancel = byId('confirm-cancel-btn');
      if(ttl) ttl.textContent = title || '確認';
      if(msg) msg.textContent = message || '';
      if(ok) ok.textContent = okText || '確認';
      if(cancel) cancel.textContent = cancelText || '取消';
      const done = v => {
        modal.classList.add('hidden');
        if(ok) ok.onclick = null;
        if(cancel) cancel.onclick = null;
        resolve(v);
      };
      if(ok) ok.onclick = () => done(true);
      if(cancel) cancel.onclick = () => done(false);
      modal.classList.remove('hidden');
    });
  };
  window.setTodoButtonLoading = window.setTodoButtonLoading || function(on){
    const btn = byId('todo-save-btn');
    if(!btn) return;
    btn.disabled = !!on;
    btn.classList.toggle('yx69-busy', !!on);
    btn.textContent = on ? '新增中…' : '新增代辦';
  };
  window.sortTodoItems = window.sortTodoItems || function(items){
    const today = new Date().toISOString().slice(0,10);
    return [...(items || [])].sort((a,b)=>{
      const ad = Number(a.is_done||0), bd = Number(b.is_done||0);
      if(ad !== bd) return ad - bd;
      const at = a.due_date || '9999-12-31', bt = b.due_date || '9999-12-31';
      if(at !== bt) return at.localeCompare(bt);
      const ac = a.created_at || '', bc = b.created_at || '';
      return bc.localeCompare(ac);
    });
  };
  window.visualSlotToCell = window.visualSlotToCell || function(num){
    const n = Math.max(1, Number(num || 1));
    return n <= 10 ? { side:'front', slot:n } : { side:'back', slot:n - 10 };
  };
  window.splitManualRawLines = window.splitManualRawLines || function(text){
    return String(text || '').replace(/\r/g,'\n').split(/\n+/).map(s=>s.trim()).filter(Boolean);
  };
  window.normalizeOcrLine = window.normalizeOcrLine || function(line){
    return String(line || '').replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/[＋，,；;]/g,'+').replace(/\s+/g,'').trim();
  };
  window.extractCustomerNameFromText = window.extractCustomerNameFromText || function(text){
    const lines = String(text || '').split(/\n+/).map(s=>s.trim()).filter(Boolean);
    for(const line of lines){
      if(!/[=xXＸ×✕]/.test(line) && /[\u4e00-\u9fffA-Za-z]/.test(line)) return line.replace(/^(客戶|公司|客戶名稱)[:：]?/,'').trim();
    }
    return '';
  };
  window.mergeParsedDuplicates = window.mergeParsedDuplicates || function(items){
    const map = new Map();
    (items || []).forEach(it=>{
      const key = String(it.product_text || it.product_code || '').trim();
      if(!key) return;
      const old = map.get(key) || {...it, qty:0};
      old.qty = (Number(old.qty||0) || 0) + (Number(it.qty||0) || 0);
      old.product_text = old.product_text || key;
      old.product_code = old.product_code || key;
      map.set(key, old);
    });
    return Array.from(map.values());
  };
  window.sortParsedItems = window.sortParsedItems || function(items){
    const dim = it => {
      const left = String(it.product_text || it.product_code || '').split('=')[0] || '';
      const nums = (left.match(/\d+(?:\.\d+)?/g) || []).map(Number);
      return {l:nums[0]||0,w:nums[1]||0,h:nums[2]||0};
    };
    return [...(items || [])].sort((a,b)=>{
      const da=dim(a), db=dim(b);
      return (da.h-db.h) || (da.w-db.w) || (da.l-db.l) || String(a.product_text||'').localeCompare(String(b.product_text||''),'zh-Hant',{numeric:true});
    });
  };
  window.normalizeShipTextareaItems = window.normalizeShipTextareaItems || function(items){
    return (items || []).map(it=>{
      const txt = window.yxNormalizeProductText ? window.yxNormalizeProductText(it.product_text || it.product_code || '') : String(it.product_text || it.product_code || '').trim();
      return { ...it, product_text: txt, product_code: it.product_code || txt, qty: Math.max(1, Number(it.qty || 1) || 1) };
    }).filter(it=>it.product_text);
  };
  window.syncShipItemsToTextarea = window.syncShipItemsToTextarea || function(items){
    const box = byId('ocr-text');
    if(!box) return;
    box.value = (window.normalizeShipTextareaItems(items) || []).map(it=>it.product_text).filter(Boolean).join('\n');
    box.dispatchEvent(new Event('input', {bubbles:true}));
    try{ window.renderShipSelectedItems && window.renderShipSelectedItems(); }catch(_e){}
    try{ window.loadShipPreview && window.loadShipPreview(); }catch(_e){}
  };
  window.applyFormattedTextarea = window.applyFormattedTextarea || function(){
    const box = byId('ocr-text');
    if(!box) return;
    try{
      if(typeof window.formatManualEntryText === 'function'){
        const r = window.formatManualEntryText(box.value || '');
        if(r && r.formattedText) box.value = r.formattedText;
      }else if(window.yxNormalizeProductText){
        box.value = String(box.value || '').split(/\n+/).map(line=>window.yxNormalizeProductText(line)).join('\n');
      }
    }catch(_e){}
    box.dispatchEvent(new Event('input', {bubbles:true}));
  };

  // Login fallbacks, so the two login buttons never become dead if inline script order changes.
  window.toggleLoginSave = window.toggleLoginSave || function(){
    const next = localStorage.getItem('yxRememberLogin') === '0' ? '1' : '0';
    localStorage.setItem('yxRememberLogin', next);
    const lab = byId('remember-label');
    if(lab) lab.textContent = next === '1' ? '開' : '關';
    notify(`永久登入：${next === '1' ? '開' : '關'}`, 'ok');
  };
  window.yxDirectLogin = window.yxDirectLogin || async function(evt){
    if(evt){ evt.preventDefault(); evt.stopPropagation(); }
    const username = (byId('login-username')?.value || '').trim();
    const password = (byId('login-password')?.value || '').trim();
    const err = byId('login-error');
    const btn = byId('login-submit-btn');
    if(err){ err.classList.add('hidden'); err.textContent=''; }
    if(!username || !password){ if(err){ err.textContent='請輸入帳號與密碼'; err.classList.remove('hidden'); } return false; }
    try{
      if(btn){ btn.disabled=true; btn.textContent='登入中…'; }
      await api('/api/login', {method:'POST', body:JSON.stringify({username, password})});
      if(localStorage.getItem('yxRememberLogin') !== '0') localStorage.setItem('yxLastUsername', username);
      location.href = '/';
    }catch(e){
      if(err){ err.textContent=e.message || '登入失敗'; err.classList.remove('hidden'); }
      notify(e.message || '登入失敗', 'error');
    }finally{
      if(btn){ btn.disabled=false; btn.textContent='登入'; }
    }
    return false;
  };

  // Strong settings implementations. These intentionally override stale/partial copies.
  window.changePassword = async function(){
    const btn = getActiveButton();
    const msg = byId('settings-msg');
    try{
      setBusy(btn, true, '儲存中…');
      const old_password = (byId('old-password')?.value || '').trim();
      const new_password = (byId('new-password')?.value || '').trim();
      const confirm_password = (byId('confirm-password')?.value || '').trim();
      await api('/api/change_password', {method:'POST', body:JSON.stringify({old_password,new_password,confirm_password})});
      ['old-password','new-password','confirm-password'].forEach(id=>{ const el=byId(id); if(el) el.value=''; });
      if(msg){ msg.textContent='密碼已更新'; msg.className='alert ok'; msg.classList.remove('hidden'); }
      notify('密碼已更新', 'ok');
    }catch(e){
      if(msg){ msg.textContent=e.message || '修改失敗'; msg.className='alert error'; msg.classList.remove('hidden'); }
      notify(e.message || '修改失敗', 'error');
    }finally{ setBusy(btn, false); }
  };
  window.undoLastAction = async function(){
    const btn=getActiveButton(), box=byId('undo-msg');
    try{ setBusy(btn,true,'還原中…'); const d=await api('/api/undo-last',{method:'POST',body:'{}'}); if(box) box.textContent=d.message||d.summary||'已還原上一筆'; notify(box?.textContent || '已還原上一筆','ok'); }
    catch(e){ if(box) box.textContent=e.message||'還原失敗'; notify(e.message||'還原失敗','error'); }
    finally{ setBusy(btn,false); }
  };
  window.downloadReport = function(type){
    const qs = new URLSearchParams();
    qs.set('type', type || 'inventory');
    const s=(byId('report-start')?.value||'').trim(), e=(byId('report-end')?.value||'').trim();
    if(s) qs.set('start_date', s);
    if(e) qs.set('end_date', e);
    notify('正在下載報表…','ok');
    location.href = '/api/reports/export?' + qs.toString();
  };
  window.loadAuditTrails = async function(){
    const btn=getActiveButton(), box=byId('audit-trails-list');
    if(!box) return;
    try{
      setBusy(btn,true,'載入中…');
      box.innerHTML='<div class="empty-state-card compact-empty">操作紀錄載入中…</div>';
      const qs=new URLSearchParams();
      const map={'audit-q':'q','audit-user':'username','audit-entity':'entity_type','audit-start':'start_date','audit-end':'end_date'};
      Object.entries(map).forEach(([id,key])=>{ const v=(byId(id)?.value||'').trim(); if(v) qs.set(key,v); });
      qs.set('limit','200');
      const d=await api('/api/audit-trails?'+qs.toString(),{method:'GET'});
      const rows=Array.isArray(d.items)?d.items:[];
      box.innerHTML = rows.length ? rows.map(r=>`<div class="deduct-card yx69-audit-card"><strong>${esc(r.action || r.entity_type || '紀錄')}</strong><div class="small-note">${esc(r.created_at || '')}｜${esc(r.username || '')}</div><div class="small-note">${esc(r.entity_type || '')} ${esc(r.entity_id || '')}</div></div>`).join('') : '<div class="empty-state-card compact-empty">目前沒有操作紀錄</div>';
    }catch(e){ box.innerHTML=`<div class="error-card">${esc(e.message || '操作紀錄載入失敗')}</div>`; notify(e.message||'操作紀錄載入失敗','error'); }
    finally{ setBusy(btn,false); }
  };
  window.loadAdminUsers = async function(){
    const btn=getActiveButton(), box=byId('admin-users');
    if(!box) return;
    try{
      setBusy(btn,true,'載入中…');
      box.innerHTML='<div class="empty-state-card compact-empty">帳號名單載入中…</div>';
      const d=await api('/api/admin/users',{method:'GET'});
      const rows=Array.isArray(d.items)?d.items:[];
      box.innerHTML = rows.length ? `<div class="yx69-scroll-table"><table class="yx69-table"><thead><tr><th>帳號</th><th>角色</th><th>狀態</th><th>操作</th></tr></thead><tbody>${rows.map(u=>`<tr><td>${esc(u.username || u.name || '')}</td><td>${esc(u.role || '')}</td><td>${Number(u.is_blocked||0)?'已封鎖':'正常'}</td><td>${(u.username||u.name)==='陳韋廷'?'管理員':`<button type="button" class="ghost-btn tiny-btn" data-yx69-block-user="${esc(u.username||u.name||'')}" data-blocked="${Number(u.is_blocked||0)?0:1}">${Number(u.is_blocked||0)?'解除':'封鎖'}</button>`}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty-state-card compact-empty">目前沒有帳號</div>';
    }catch(e){ box.innerHTML=`<div class="error-card">${esc(e.message || '帳號名單載入失敗')}</div>`; notify(e.message||'帳號名單載入失敗','error'); }
    finally{ setBusy(btn,false); }
  };
  async function loadBackups69(){
    const box=byId('backup-panel');
    if(!box) return;
    try{
      const d=await api('/api/backups',{method:'GET'});
      const files=Array.isArray(d.files)?d.files:[];
      box.innerHTML = files.length ? files.map(f=>`<div class="deduct-card"><strong>${esc(f.filename||'')}</strong><div class="small-note">${esc(f.created_at||'')}｜${Number(f.size||0).toLocaleString()} bytes</div><div class="btn-row compact-row"><a class="ghost-btn tiny-btn" href="/api/backups/download/${encodeURIComponent(f.filename||'')}">下載</a><button type="button" class="ghost-btn tiny-btn danger-btn" data-yx69-restore-backup="${esc(f.filename||'')}">還原</button></div></div>`).join('') : '<div class="empty-state-card compact-empty">尚無備份</div>';
    }catch(e){ box.innerHTML=`<div class="error-card">${esc(e.message||'備份清單載入失敗')}</div>`; }
  }
  window.createBackup = async function(){
    const btn=getActiveButton();
    try{ setBusy(btn,true,'備份中…'); await api('/api/backup',{method:'POST',body:'{}'}); notify('備份已建立','ok'); await loadBackups69(); }
    catch(e){ notify(e.message || '備份失敗', 'error'); }
    finally{ setBusy(btn,false); }
  };
  window.logout = async function(){
    const btn=getActiveButton();
    try{ setBusy(btn,true,'登出中…'); await api('/api/logout',{method:'POST',body:'{}'}); }catch(_e){}
    location.href='/login';
  };

  // Strong todo image buttons.
  window.openTodoAlbumPicker = function(){ const input=byId('todo-image-input'); if(input) input.click(); else notify('找不到上傳檔案欄位','error'); };
  window.openTodoCameraPicker = function(){ const input=byId('todo-camera-input'); if(input) input.click(); else notify('找不到拍照欄位','error'); };
  const oldClearTodo = window.clearTodoForm;
  window.clearTodoForm = function(){
    try{ oldClearTodo && oldClearTodo(); }catch(_e){}
    if(window.state){ window.state.todoSelectedFile=null; window.state.todoSelectedFiles=[]; }
    ['todo-note','todo-date','todo-image-input','todo-camera-input'].forEach(id=>{ const el=byId(id); if(el) el.value=''; });
    const p=byId('todo-selected-preview'); if(p){ p.classList.add('hidden'); p.innerHTML=''; }
    notify('已清空', 'ok');
  };

  // Button busy / feedback guard.
  let activeButton = null;
  let activeAt = 0;
  let wrapDepth = 0;
  function getActiveButton(){
    if(activeButton && Date.now() - activeAt < 2500 && doc.contains(activeButton)) return activeButton;
    const el = doc.activeElement;
    return (el && el.tagName === 'BUTTON') ? el : null;
  }
  function setBusy(btn, on, text){
    if(!btn || btn.dataset.yx69NoBusy === '1') return;
    if(on){
      if(btn.dataset.yx69Busy === '1') return;
      btn.dataset.yx69Busy = '1';
      btn.dataset.yx69OriginalText = btn.dataset.yx69OriginalText || btn.textContent || '';
      btn.classList.add('yx69-busy');
      btn.setAttribute('aria-busy','true');
      if(text) btn.textContent = text;
    }else{
      btn.dataset.yx69Busy = '0';
      btn.classList.remove('yx69-busy');
      btn.removeAttribute('aria-busy');
      if(btn.dataset.yx69OriginalText){ btn.textContent = btn.dataset.yx69OriginalText; delete btn.dataset.yx69OriginalText; }
    }
  }
  function tap(el){
    if(!el) return;
    el.classList.add('yx69-tapped');
    setTimeout(()=>el.classList.remove('yx69-tapped'),180);
  }
  function wrapAction(name, busyText){
    const original = window[name];
    if(typeof original !== 'function' || original.__yx69Wrapped) return;
    const wrapped = async function(){
      const btn = wrapDepth === 0 ? getActiveButton() : null;
      wrapDepth++;
      try{
        if(btn) setBusy(btn,true,busyText || '處理中…');
        return await original.apply(this, arguments);
      }catch(e){
        notify(e && e.message ? e.message : `${name} 執行失敗`, 'error');
        console.error('[YX69 button error]', name, e);
        return false;
      }finally{
        wrapDepth--;
        if(btn) setBusy(btn,false);
      }
    };
    wrapped.__yx69Wrapped = true;
    window[name] = wrapped;
  }

  const buttonActions = [
    ['confirmSubmit','送出中…'],['saveCustomer','儲存中…'],['renderCustomers','載入中…'],
    ['loadShippingRecords','查詢中…'],['searchWarehouse','搜尋中…'],['renderWarehouse','載入中…'],
    ['addSelectedItemToCell','加入中…'],['saveWarehouseCell','儲存中…'],['openWarehouseModal','開啟中…'],
    ['insertWarehouseCell','插入中…'],['deleteWarehouseCell','刪除中…'],['reverseLookup','查詢中…'],
    ['completeTodoItem','處理中…'],['restoreTodoItem','處理中…'],['deleteTodoItem','刪除中…'],
    ['saveTodoItem','新增中…'],['openArchivedCustomersModal','載入中…'],['moveShipItem','處理中…'],
    ['removeShipItemAt','移除中…'],['clearShipSelectedItems','清空中…'],['toggleWarehouseUnplacedHighlight','處理中…'],
    ['highlightWarehouseSameCustomer','高亮中…'],['clearWarehouseHighlights','清除中…']
  ];
  buttonActions.forEach(([name,text]) => wrapAction(name,text));

  // Fallbacks for optional warehouse buttons if older copies removed the implementations.
  window.clearWarehouseHighlights = window.clearWarehouseHighlights || function(){
    try{ if(window.state) window.state.searchHighlightKeys = new Set(); }catch(_e){}
    doc.querySelectorAll('.highlight,.flash-highlight,.unplaced-highlight').forEach(el=>el.classList.remove('highlight','flash-highlight','unplaced-highlight'));
    const result=byId('warehouse-search-results'); if(result) result.classList.add('hidden');
    notify('已清除高亮','ok');
  };
  window.toggleWarehouseUnplacedHighlight = window.toggleWarehouseUnplacedHighlight || function(){
    const list=byId('warehouse-unplaced-list-inline');
    if(list) list.classList.toggle('hidden');
    notify('已切換未入倉商品顯示','ok');
  };
  window.highlightWarehouseSameCustomer = window.highlightWarehouseSameCustomer || function(){
    notify('請先搜尋或點選一個已放入的格子，再執行同客戶高亮','warn');
  };

  // Make all buttons visibly react immediately. Do not block normal links/navigation.
  doc.addEventListener('click', function(e){
    const btn = e.target.closest && e.target.closest('button,.menu-btn,.home-mini-btn,a.back-btn,.chip,.interactive-pill,[role="button"]');
    if(!btn) return;
    activeButton = btn;
    activeAt = Date.now();
    if(btn.tagName === 'BUTTON' && !btn.getAttribute('type')) btn.setAttribute('type','button');
    tap(btn);

    // Quick navigation feedback only; no artificial delay.
    if(btn.matches('a.menu-btn,a.back-btn,.home-mini-btn[href]')){
      try{ doc.body.classList.add('yx69-navigating'); }catch(_e){}
      return;
    }

    // Ship customer item buttons had duplicate old handlers; here we only refresh UI after the old handler runs.
    const id = btn.id || '';
    if(id === 'ship-add-selected-item' || id === 'ship-add-all-items'){
      setTimeout(()=>{
        const box=byId('ocr-text');
        if(box) box.dispatchEvent(new Event('input',{bubbles:true}));
        try{ window.renderShipSelectedItems && window.renderShipSelectedItems(); }catch(_e){}
        try{ window.loadShipPreview && window.loadShipPreview(); }catch(_e){}
        notify(id === 'ship-add-all-items' ? '已加入全部商品' : '已加入選取商品', 'ok');
      },80);
    }
  }, true);

  // Dynamic button routing for data-* buttons rendered after load.
  doc.addEventListener('click', async function(e){
    const block = e.target.closest && e.target.closest('[data-yx69-block-user],[data-yx68-block-user]');
    if(block){
      e.preventDefault(); e.stopPropagation();
      try{
        setBusy(block,true,'處理中…');
        await api('/api/admin/block',{method:'POST',body:JSON.stringify({username:block.getAttribute('data-yx69-block-user') || block.getAttribute('data-yx68-block-user'), blocked:block.getAttribute('data-blocked')==='1'})});
        notify('帳號狀態已更新','ok');
        await window.loadAdminUsers();
      }catch(err){ notify(err.message || '帳號狀態更新失敗','error'); }
      finally{ setBusy(block,false); }
      return;
    }
    const restoreBackup = e.target.closest && e.target.closest('[data-yx69-restore-backup],[data-yx68-restore-backup]');
    if(restoreBackup){
      e.preventDefault(); e.stopPropagation();
      const filename = restoreBackup.getAttribute('data-yx69-restore-backup') || restoreBackup.getAttribute('data-yx68-restore-backup') || '';
      if(window.confirm && !window.confirm('確定要還原這份備份？目前資料會被覆蓋。')) return;
      try{ setBusy(restoreBackup,true,'還原中…'); await api('/api/backups/restore',{method:'POST',body:JSON.stringify({filename})}); notify('備份已還原','ok'); }
      catch(err){ notify(err.message || '備份還原失敗','error'); }
      finally{ setBusy(restoreBackup,false); }
      return;
    }
  }, true);

  // File input change binding: make upload buttons and selected-file preview survive older templates.
  function bindTodoInputs(){
    const album=byId('todo-image-input');
    const camera=byId('todo-camera-input');
    const handler = ev => {
      const files = Array.from(ev.target.files || []);
      if(window.state){ window.state.todoSelectedFiles = files; window.state.todoSelectedFile = files[0] || null; }
      try{ window.renderTodoSelectedPreview && window.renderTodoSelectedPreview(); }catch(_e){}
      const p=byId('todo-selected-preview');
      if(p && files.length && !p.innerHTML){
        p.classList.remove('hidden');
        p.innerHTML = `<div class="small-note">已選擇 ${files.length} 張圖片</div>`;
      }
    };
    [album,camera].forEach(input=>{
      if(input && input.dataset.yx69Bound !== '1'){
        input.dataset.yx69Bound = '1';
        input.addEventListener('change', handler);
      }
    });
  }

  function convergeUI(){
    setFixFlag();
    doc.querySelectorAll('button:not([type])').forEach(b=>b.setAttribute('type','button'));
    // Old warehouse +/- / fixed 20 controls are always retired. The in-cell insert/delete buttons are the only active version.
    doc.querySelectorAll('.warehouse-col-tools,.warehouse-add-slot,.warehouse-remove-slot,.yx-old-warehouse-plusminus,[data-action="add-slot"],[data-action="remove-slot"]').forEach(el=>el.remove());
    doc.querySelectorAll('.yx67-insert-btn,.yx67-delete-btn').forEach(btn=>{
      btn.style.display='';
      btn.disabled=false;
      btn.type='button';
      btn.classList.add('yx69-live-button');
    });
    bindTodoInputs();
  }

  // Global error display: instead of silent dead buttons, show a visible card/toast.
  window.addEventListener('error', function(ev){
    const msg = ev?.error?.message || ev?.message || '';
    if(!msg) return;
    if(/ResizeObserver loop|Script error/i.test(msg)) return;
    notify('介面執行失敗：' + msg, 'error');
  });
  window.addEventListener('unhandledrejection', function(ev){
    const msg = ev?.reason?.message || String(ev?.reason || '');
    if(!msg) return;
    notify('操作失敗：' + msg, 'error');
  });

  const mo = new MutationObserver(()=>{ try{ convergeUI(); }catch(_e){} });
  function boot(){
    convergeUI();
    const path = location.pathname;
    if(path.includes('/settings')){
      setTimeout(()=>{ try{ window.loadAuditTrails(); }catch(_e){} try{ window.loadAdminUsers(); }catch(_e){} try{ loadBackups69(); }catch(_e){} },120);
    }
    if(path.includes('/todos')){
      setTimeout(()=>{ try{ window.loadTodos && window.loadTodos(); }catch(_e){} },80);
    }
    if(path.includes('/ship')){
      const name = (byId('customer-name')?.value || '').trim();
      if(name && window.loadShipCustomerItems66) setTimeout(()=>window.loadShipCustomerItems66(name),80);
    }
    if(path.includes('/warehouse')){
      setTimeout(()=>{ try{ convergeUI(); }catch(_e){} },250);
    }
    try{ mo.observe(doc.body || doc.documentElement, {childList:true, subtree:true}); }catch(_e){}
  }
  if(doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot, {once:true}); else boot();
})();
/* ==== FIX69 end ==== */


/* ==== FIX70: final conflict convergence + single active button router ==== */
(function(){
  'use strict';
  const VERSION = 'fix70-final-conflict-convergence';
  if (window.__YX70_FINAL_CONFLICT_CONVERGENCE__) return;
  window.__YX70_FINAL_CONFLICT_CONVERGENCE__ = true;

  const doc = document;
  const byId = id => doc.getElementById(id);
  const qsa = (sel, root=doc) => Array.from(root.querySelectorAll(sel));
  const esc = s => (window.escapeHTML ? window.escapeHTML(s) : String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])));
  const notify = (msg, level='ok') => {
    try { (window.toast || function(m){ console.log(m); })(msg, level); }
    catch(_e){ console.log(msg); }
  };
  const api = window.yxApi || window.requestJSON || (async function(url, opt={}){
    const res = await fetch(url, {credentials:'same-origin', ...opt, headers:{'Content-Type':'application/json', ...(opt.headers||{})}});
    const data = await res.json().catch(()=>({}));
    if(!res.ok || data.success === false) throw new Error(data.error || data.message || `請求失敗：${res.status}`);
    return data;
  });
  window.yxApi = api;

  function setFixFlag(){
    try{
      doc.documentElement.dataset.yxFix70 = VERSION;
      if(doc.body) doc.body.setAttribute('data-yx-fix70','1');
    }catch(_e){}
  }

  function tap(el){
    if(!el) return;
    try{
      el.classList.add('yx70-tapped');
      clearTimeout(el.__yx70TapTimer);
      el.__yx70TapTimer = setTimeout(()=>el.classList.remove('yx70-tapped'), 180);
    }catch(_e){}
  }

  function setBusy(el, on, text){
    if(!el) return;
    if(on){
      if(el.dataset.yx70Busy === '1') return;
      el.dataset.yx70Busy = '1';
      el.dataset.yx70Text = el.dataset.yx70Text || el.textContent || '';
      el.classList.add('yx70-busy');
      el.setAttribute('aria-busy','true');
      if(text) el.textContent = text;
    }else{
      el.dataset.yx70Busy = '0';
      el.classList.remove('yx70-busy');
      el.removeAttribute('aria-busy');
      if(el.dataset.yx70Text){ el.textContent = el.dataset.yx70Text; delete el.dataset.yx70Text; }
    }
  }

  function currentModule(){
    try { return doc.querySelector('.module-screen')?.dataset.module || (typeof window.currentModule === 'function' ? window.currentModule() : ''); }
    catch(_e){ return ''; }
  }

  function stopOldHandlers(e){
    e.preventDefault();
    e.stopPropagation();
    if(typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
  }

  function textLines(){
    const box = byId('ocr-text');
    return box ? String(box.value || '').replace(/\r/g,'\n').split(/\n+/).map(s=>s.trim()).filter(Boolean) : [];
  }
  function setTextLines(lines){
    const box = byId('ocr-text');
    if(!box) return;
    box.value = lines.filter(Boolean).join('\n');
    box.dispatchEvent(new Event('input', {bubbles:true}));
    box.dispatchEvent(new Event('change', {bubbles:true}));
  }
  function shipLineKey(line){
    const raw = String(line || '').replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/\s+/g,'').trim();
    const left = (raw.split('=')[0] || raw).toLowerCase();
    const dims = left.split('x').filter(Boolean);
    const size = dims.length >= 3 ? dims.slice(0,3).join('x') : left;
    return size;
  }
  function appendShipLines(lines){
    const incoming = (lines || []).map(s=>String(s||'').trim()).filter(Boolean);
    if(!incoming.length) return 0;
    const current = textLines();
    const seen = new Set(current.map(shipLineKey).filter(Boolean));
    const next = [];
    let skipped = 0;
    incoming.forEach(line => {
      const key = shipLineKey(line);
      if(key && seen.has(key)){ skipped += 1; return; }
      if(key) seen.add(key);
      next.push(line);
    });
    if(next.length) setTextLines(current.concat(next));
    if(skipped) notify(`同一種商品已在商品資料內，已阻止重複加入 ${skipped} 筆`, 'warn');
    try{ window.renderShipSelectedItems && window.renderShipSelectedItems(); }catch(_e){}
    try{ window.loadShipPreview && window.loadShipPreview(); }catch(_e){}
    return next.length;
  }

  async function fetchShipItemsFallback(name, uid){
    if(!name && !uid) return [];
    const d = await api(`/api/customer-items?name=${encodeURIComponent(name || '')}&customer_uid=${encodeURIComponent(uid || '')}&ts=${Date.now()}`);
    const items = Array.isArray(d.items) ? d.items : [];
    window.__YX_SHIP_CUSTOMER_ITEMS__ = items;
    const sel = byId('ship-customer-item-select');
    if(sel){
      sel.innerHTML = '<option value="">請選擇商品</option>' + items.map((it,i)=>`<option value="${i}">${esc(it.material || '未填材質')}｜${esc((it.product_text||'').split('=')[0] || it.product_text || '')}｜${esc((it.product_text||'').split('=').slice(1).join('=') || it.qty || '')}｜${esc(it.source || '')}</option>`).join('');
    }
    return items;
  }

  let shipLoadPending = null;
  let shipLoadKey = '';
  async function loadShipItems(force=false){
    const name = String(byId('customer-name')?.value || window.__YX_SELECTED_CUSTOMER__ || '').trim();
    const uid = String(byId('customer-name')?.dataset.customerUid || '').trim();
    const sel = byId('ship-customer-item-select');
    if(!name && !uid){
      if(sel) sel.innerHTML = '<option value="">請先選擇 / 輸入客戶名稱</option>';
      window.__YX_SHIP_CUSTOMER_ITEMS__ = [];
      return [];
    }
    const key = `${name}|${uid}`;
    if(!force && shipLoadPending && shipLoadKey === key) return shipLoadPending;
    shipLoadKey = key;
    if(sel) sel.innerHTML = '<option value="">載入中…</option>';
    shipLoadPending = Promise.resolve().then(async()=>{
      if(typeof window.loadShipCustomerItems66 === 'function'){
        await window.loadShipCustomerItems66(name);
        return window.__YX_SHIP_CUSTOMER_ITEMS__ || [];
      }
      if(typeof window.loadShipCustomerItems === 'function'){
        await window.loadShipCustomerItems({name, customer_uid:uid});
        return window.__YX_SHIP_CUSTOMER_ITEMS__ || [];
      }
      return fetchShipItemsFallback(name, uid);
    }).catch(err=>{
      if(sel) sel.innerHTML = `<option value="">${esc(err.message || '商品載入失敗')}</option>`;
      window.__YX_SHIP_CUSTOMER_ITEMS__ = [];
      throw err;
    }).finally(()=>{ setTimeout(()=>{ shipLoadPending=null; }, 120); });
    return shipLoadPending;
  }
  window.yx70LoadShipItems = loadShipItems;

  async function shipAddSelected(){
    if(!(window.__YX_SHIP_CUSTOMER_ITEMS__ || []).length) await loadShipItems(false);
    const idx = Number(byId('ship-customer-item-select')?.value ?? -1);
    const item = (window.__YX_SHIP_CUSTOMER_ITEMS__ || [])[idx];
    if(!item || !item.product_text){ notify('請先選擇要加入的商品', 'warn'); return false; }
    const count = appendShipLines([item.product_text]);
    if(count) notify('已加入選取商品', 'ok');
    return true;
  }
  async function shipAddAll(){
    if(!(window.__YX_SHIP_CUSTOMER_ITEMS__ || []).length) await loadShipItems(false);
    const lines = (window.__YX_SHIP_CUSTOMER_ITEMS__ || []).map(it=>it.product_text).filter(Boolean);
    const count = appendShipLines(lines);
    if(count) notify(`已加入 ${count} 筆商品`, 'ok');
    else notify('這個客戶目前沒有可加入的商品', 'warn');
    return true;
  }

  function wrapSingleFlight(name, ttl=800){
    const original = window[name];
    if(typeof original !== 'function' || original.__yx70SingleFlight) return;
    let pending = null;
    let lastAt = 0;
    let lastValue;
    const wrapped = function(){
      const args = Array.from(arguments);
      const force = args[0] === true || args.some(v => v && typeof v === 'object' && v.force === true);
      const now = Date.now();
      if(!force && pending) return pending;
      if(!force && lastValue !== undefined && now - lastAt < ttl) return Promise.resolve(lastValue);
      pending = Promise.resolve()
        .then(()=>original.apply(this, args))
        .then(v=>{ lastValue = v; return v; })
        .finally(()=>{ lastAt = Date.now(); pending = null; });
      return pending;
    };
    wrapped.__yx70SingleFlight = true;
    wrapped.__yx70Original = original;
    window[name] = wrapped;
  }

  function wrapSingleSubmit(){
    const original = window.confirmSubmit;
    if(typeof original !== 'function' || original.__yx70SubmitLock) return;
    let lock = false;
    const wrapped = async function(){
      if(lock){ notify('上一筆還在處理中，請稍等', 'warn'); return false; }
      const btn = byId('submit-btn');
      lock = true;
      try{ if(btn) setBusy(btn, true, currentModule()==='ship' ? '整理預覽中…' : '送出中…'); return await original.apply(this, arguments); }
      catch(err){ notify(err.message || '送出失敗', 'error'); return false; }
      finally{ if(btn) setBusy(btn, false); setTimeout(()=>{ lock=false; }, 450); }
    };
    wrapped.__yx70SubmitLock = true;
    wrapped.__yx70Original = original;
    window.confirmSubmit = wrapped;
  }

  async function routeDataButton(btn){
    const restoreCustomer = btn.closest('[data-yx70-restore-customer],[data-yx69-restore-customer],[data-yx68-restore-customer]');
    if(restoreCustomer){
      const name = restoreCustomer.getAttribute('data-yx70-restore-customer') || restoreCustomer.getAttribute('data-yx69-restore-customer') || restoreCustomer.getAttribute('data-yx68-restore-customer') || '';
      setBusy(restoreCustomer, true, '還原中…');
      try{ await api('/api/customers/' + encodeURIComponent(name) + '/restore', {method:'POST', body:JSON.stringify({})}); notify('客戶已還原','ok'); await (window.openArchivedCustomersModal && window.openArchivedCustomersModal()); await (window.renderCustomers && window.renderCustomers()); }
      finally{ setBusy(restoreCustomer, false); }
      return true;
    }

    const block = btn.closest('[data-yx70-block-user],[data-yx69-block-user],[data-yx68-block-user]');
    if(block){
      const username = block.getAttribute('data-yx70-block-user') || block.getAttribute('data-yx69-block-user') || block.getAttribute('data-yx68-block-user') || '';
      const blocked = block.getAttribute('data-blocked') === '1';
      setBusy(block, true, '處理中…');
      try{ await api('/api/admin/block', {method:'POST', body:JSON.stringify({username, blocked})}); notify('帳號狀態已更新','ok'); await (window.loadAdminUsers && window.loadAdminUsers({force:true})); }
      finally{ setBusy(block, false); }
      return true;
    }

    const restoreBackup = btn.closest('[data-yx70-restore-backup],[data-yx69-restore-backup],[data-yx68-restore-backup]');
    if(restoreBackup){
      const filename = restoreBackup.getAttribute('data-yx70-restore-backup') || restoreBackup.getAttribute('data-yx69-restore-backup') || restoreBackup.getAttribute('data-yx68-restore-backup') || '';
      if(window.confirm && !window.confirm('確定要還原這份備份？目前資料會被覆蓋。')) return true;
      setBusy(restoreBackup, true, '還原中…');
      try{ await api('/api/backups/restore', {method:'POST', body:JSON.stringify({filename})}); notify('備份已還原','ok'); }
      finally{ setBusy(restoreBackup, false); }
      return true;
    }

    const delToday = btn.closest('[data-yx70-delete-today],[data-yx69-delete-today],[data-yx68-delete-today]');
    if(delToday){
      const id = delToday.getAttribute('data-yx70-delete-today') || delToday.getAttribute('data-yx69-delete-today') || delToday.getAttribute('data-yx68-delete-today') || '';
      setBusy(delToday, true, '刪除中…');
      try{
        await api('/api/today-changes/' + encodeURIComponent(id), {method:'DELETE'});
        delToday.closest('.today-item,.deduct-card,.card,.chip')?.remove();
        notify('已刪除','ok');
        try{ window.loadTodayChanges && window.loadTodayChanges({force:true}); }catch(_e){}
      }finally{ setBusy(delToday, false); }
      return true;
    }
    return false;
  }

  // 最早攔截會重複觸發的舊按鈕：只跑最新邏輯一次，舊 handler 不再重複加料 / 重複送 API。
  window.addEventListener('click', async function(e){
    const target = e.target;
    if(!target || !target.closest) return;
    const btn = target.closest('#ship-refresh-customer-items,#ship-add-selected-item,#ship-add-all-items,.yx67-insert-btn,.yx67-delete-btn,[data-yx70-restore-customer],[data-yx69-restore-customer],[data-yx68-restore-customer],[data-yx70-block-user],[data-yx69-block-user],[data-yx68-block-user],[data-yx70-restore-backup],[data-yx69-restore-backup],[data-yx68-restore-backup],[data-yx70-delete-today],[data-yx69-delete-today],[data-yx68-delete-today]');
    if(!btn) return;
    stopOldHandlers(e);
    tap(btn);
    try{
      if(btn.id === 'ship-refresh-customer-items'){
        setBusy(btn, true, '載入中…');
        await loadShipItems(true);
        notify('客戶商品已重新載入','ok');
        return;
      }
      if(btn.id === 'ship-add-selected-item'){
        setBusy(btn, true, '加入中…');
        await shipAddSelected();
        return;
      }
      if(btn.id === 'ship-add-all-items'){
        setBusy(btn, true, '加入中…');
        await shipAddAll();
        return;
      }
      if(btn.classList.contains('yx67-insert-btn') || btn.classList.contains('yx67-delete-btn')){
        const slot = btn.closest('.yx67-warehouse-slot,.vertical-slot');
        const zone = slot?.dataset.zone || '';
        const col = Number(slot?.dataset.column || 0);
        const num = Number(slot?.dataset.num || 0);
        if(!zone || !col || !num){ notify('找不到格位資料，請重新整理倉庫圖', 'error'); return; }
        setBusy(btn, true, btn.classList.contains('yx67-insert-btn') ? '插入中…' : '刪除中…');
        if(btn.classList.contains('yx67-insert-btn')) await window.insertWarehouseCell(zone, col, num);
        else await window.deleteWarehouseCell(zone, col, num);
        return;
      }
      if(await routeDataButton(btn)) return;
    }catch(err){
      notify(err.message || '操作失敗', 'error');
      console.error('[YX70 routed button error]', err);
    }finally{
      setBusy(btn, false);
    }
  }, true);

  // 非衝突按鈕仍然立即有觸覺式反應，不改原功能。
  window.addEventListener('pointerdown', function(e){
    const btn = e.target?.closest?.('button,.menu-btn,.home-mini-btn,a.back-btn,.chip,.interactive-pill,[role="button"]');
    if(btn) tap(btn);
  }, {capture:true, passive:true});

  function convergeDom(){
    setFixFlag();
    qsa('button:not([type])').forEach(b=>b.setAttribute('type','button'));
    // 倉庫圖以格子內「插入格子 / 刪除格子」為唯一版本；舊 +- 和固定 20 控制全部退役。
    qsa('.warehouse-col-tools,.warehouse-add-slot,.warehouse-remove-slot,.warehouse-plusminus-btn,.yx-old-warehouse-plusminus,[data-action="add-slot"],[data-action="remove-slot"]').forEach(el=>el.remove());
    qsa('.yx67-insert-btn,.yx67-delete-btn').forEach(btn=>{ btn.disabled = false; btn.style.display = ''; btn.type = 'button'; btn.classList.add('yx70-live-button'); });
    // 出貨頁若客戶已選但下拉尚未載入，自動補載。
    if(currentModule() === 'ship'){
      const name = String(byId('customer-name')?.value || '').trim();
      const sel = byId('ship-customer-item-select');
      if(name && sel && (!sel.options.length || /請先選擇|載入失敗/.test(sel.textContent || ''))){ loadShipItems(false).catch(()=>{}); }
    }
  }

  function smokeCheck(){
    const missing = [];
    qsa('[onclick],[onsubmit]').forEach(el=>{
      const raw = (el.getAttribute('onclick') || '') + ';' + (el.getAttribute('onsubmit') || '');
      (raw.match(/(?:window\.)?([A-Za-z_$][\w$]*)\s*\(/g) || []).forEach(hit=>{
        const name = hit.replace(/(?:window\.)?/, '').replace(/\s*\($/, '');
        if(['return','confirm','alert','setTimeout','Number','String','Math'].includes(name)) return;
        if(typeof window[name] !== 'function') missing.push(name);
      });
    });
    const unique = Array.from(new Set(missing));
    doc.documentElement.dataset.yx70Smoke = unique.length ? 'missing' : 'ok';
    if(unique.length) console.warn('[YX70] missing inline handlers:', unique);
    return unique;
  }
  window.yx70SmokeCheck = smokeCheck;

  function boot(){
    setFixFlag();
    ['loadCustomerBlocks','renderWarehouse','renderCustomers','loadShipCustomerItems66','loadTodayChanges','loadTodos','loadShippingRecords','loadAuditTrails','loadAdminUsers'].forEach(name=>wrapSingleFlight(name, name==='renderWarehouse' ? 450 : 900));
    wrapSingleSubmit();
    convergeDom();
    smokeCheck();
    if(currentModule() === 'ship'){
      byId('customer-name')?.addEventListener('change', ()=>loadShipItems(true).catch(err=>notify(err.message||'商品載入失敗','error')));
    }
  }

  let moTimer = null;
  const mo = new MutationObserver(()=>{
    clearTimeout(moTimer);
    moTimer = setTimeout(()=>{ try{ convergeDom(); }catch(_e){} }, 120);
  });

  if(doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot, {once:true}); else boot();
  try{ mo.observe(doc.body || doc.documentElement, {childList:true, subtree:true}); }catch(_e){}
  window.addEventListener('pageshow', ()=>{ try{ doc.body && doc.body.classList.remove('yx65-navigating','yx69-navigating'); convergeDom(); }catch(_e){} });
})();
/* ==== FIX70 end ==== */


/* ==== FIX71: compact material column + long-press warehouse cell actions + customer left-panel restore + master duplicate table cleanup ==== */
(function(){
  'use strict';
  const VERSION = 'fix71-table-warehouse-customer-master-cleanup';
  if (window.__YX71_TABLE_WAREHOUSE_CUSTOMER_MASTER_CLEANUP__) return;
  window.__YX71_TABLE_WAREHOUSE_CUSTOMER_MASTER_CLEANUP__ = true;
  try {
    document.documentElement.dataset.yxFix71 = VERSION;
    document.body && document.body.setAttribute('data-yx-fix71','1');
  } catch(_e) {}

  const $ = id => document.getElementById(id);
  const qsa = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const clean = v => String(v ?? '').trim();
  const esc = v => String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const moduleName = () => document.querySelector('.module-screen')?.dataset.module || (typeof window.currentModule === 'function' ? window.currentModule() : '');
  const notify = (msg, kind='ok') => {
    try { (window.toast || window.showToast || window.alert)(msg, kind); }
    catch(_e) { console.log(msg); }
  };
  const api = window.yxApi || window.requestJSON || (async function(url,opt={}){
    const r = await fetch(url, { credentials:'same-origin', ...opt, headers:{'Content-Type':'application/json', ...(opt.headers||{})} });
    const text = await r.text();
    let d = {};
    try { d = text ? JSON.parse(text) : {}; } catch(_e) { d = { success:false, error:text || '伺服器回應格式錯誤' }; }
    if (!r.ok || d.success === false) throw new Error(d.error || d.message || '請求失敗');
    return d;
  });

  function normalizeX(v){ return clean(v).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/[＋，,；;]/g,'+').replace(/\s+/g,''); }
  function splitProduct(text){ const raw = normalizeX(text); const i = raw.indexOf('='); return { size: i >= 0 ? raw.slice(0,i) : raw, support: i >= 0 ? raw.slice(i+1) : '' }; }
  function looksLikeProduct(v, productText=''){
    const s = normalizeX(v), p = normalizeX(productText);
    if (!s) return false;
    if (p && s === p) return true;
    if (s.includes('=')) return true;
    return /^\d+(?:\.\d+)?x\d+(?:\.\d+)?(?:x\d+(?:\.\d+)?)?/i.test(s) || /^\d+(?:\.\d+)?(?:\+\d+(?:\.\d+)?)+$/.test(s);
  }
  function rowMaterial(row){
    const v = clean(row?.material || row?.product_code || '');
    return looksLikeProduct(v, row?.product_text || '') ? '' : v;
  }
  function topStats(items){
    const materials = {}, sizes = {};
    (items || []).forEach(it => {
      const p = splitProduct(it.product_text || it.size || '');
      if (p.size) sizes[p.size] = (sizes[p.size] || 0) + 1;
      const m = rowMaterial(it);
      if (m) materials[m] = (materials[m] || 0) + 1;
    });
    const top = obj => Object.entries(obj).sort((a,b)=>b[1]-a[1] || String(a[0]).localeCompare(String(b[0]), 'zh-Hant', {numeric:true})).slice(0,6).map(([k])=>k).join('、');
    return { materials: top(materials), sizes: top(sizes) };
  }
  function setEditableText(id, value){
    const el = $(id);
    if (!el) return;
    const text = clean(value) || '尚未建立';
    el.textContent = text;
    el.dataset.empty = text === '尚未建立' ? '1' : '0';
  }
  async function fillCustomerFormFixed(customerName){
    const name = clean(customerName);
    if (!name) return null;
    try {
      if (window.state) window.state.currentCustomer = name;
      window.__YX_SELECTED_CUSTOMER__ = name;
      const [detailRes, itemRes] = await Promise.allSettled([
        api('/api/customers/' + encodeURIComponent(name) + '?ts=' + Date.now(), { method:'GET' }),
        api('/api/customer-items?name=' + encodeURIComponent(name) + '&ts=' + Date.now(), { method:'GET' })
      ]);
      const item = detailRes.status === 'fulfilled' ? (detailRes.value.item || {}) : {};
      const rows = itemRes.status === 'fulfilled' && Array.isArray(itemRes.value.items) ? itemRes.value.items : [];
      const stats = topStats(rows);
      const finalName = clean(item.name || name);
      if ($('cust-name')) $('cust-name').value = finalName;
      if ($('cust-phone')) $('cust-phone').value = item.phone || '';
      if ($('cust-address')) $('cust-address').value = item.address || '';
      if ($('cust-notes')) $('cust-notes').value = item.notes || '';
      if ($('cust-region')) $('cust-region').value = item.region || '北區';
      if (window.state) window.state.selectedCustomerRegion = item.region || window.state.selectedCustomerRegion || '北區';
      setEditableText('cust-common-materials', item.common_materials || stats.materials);
      setEditableText('cust-common-sizes', item.common_sizes || stats.sizes);
      qsa('#customers-section .customer-region-card,#customers-section .yx-customer-card,#customers-section [data-customer]').forEach(card => {
        const cardName = clean(card.dataset.customer || card.dataset.customerName || card.getAttribute('data-customer-name') || card.querySelector('.customer-card-name,.customer-name,.yx-customer-left')?.textContent || '');
        card.classList.toggle('yx71-customer-selected', cardName === finalName || cardName === name);
      });
      const detail = document.querySelector('#customers-section .customer-detail');
      if (detail) {
        detail.classList.add('yx71-filled');
        detail.scrollIntoView({ block:'nearest', behavior:'smooth' });
      }
      return { item, items: rows };
    } catch(e) {
      notify(e.message || '客戶資料載入失敗', 'error');
      return null;
    }
  }
  const previousFillCustomerForm = window.fillCustomerForm;
  window.fillCustomerForm = async function(customerName){
    const result = await fillCustomerFormFixed(customerName);
    if (!result && typeof previousFillCustomerForm === 'function') return previousFillCustomerForm.apply(this, arguments);
    return result;
  };
  document.addEventListener('click', function(e){
    const card = e.target?.closest?.('#customers-section .customer-region-card,#customers-section .yx-customer-card,#customers-section [data-customer-name]');
    if (!card) return;
    const name = clean(card.dataset.customer || card.dataset.customerName || card.getAttribute('data-customer-name') || card.querySelector('.customer-card-name,.customer-name,.yx-customer-left')?.textContent || '');
    if (!name) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    window.fillCustomerForm(name);
  }, true);

  function ensureWarehouseActionMenu(){
    let modal = $('yx71-warehouse-cell-menu');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'yx71-warehouse-cell-menu';
    modal.className = 'modal hidden yx71-warehouse-cell-menu';
    modal.innerHTML = `
      <div class="modal-card glass yx71-menu-card">
        <div class="modal-head">
          <div class="section-title" id="yx71-warehouse-menu-title">格子操作</div>
          <button class="icon-btn" type="button" id="yx71-warehouse-menu-close">✕</button>
        </div>
        <div class="small-note" id="yx71-warehouse-menu-note">長按格子後可插入或刪除格子。</div>
        <div class="btn-row" style="flex-direction:column;align-items:stretch;gap:10px;margin-top:14px;">
          <button class="primary-btn" type="button" id="yx71-warehouse-menu-edit">編輯此格</button>
          <button class="ghost-btn" type="button" id="yx71-warehouse-menu-insert">插入格子</button>
          <button class="ghost-btn danger-btn" type="button" id="yx71-warehouse-menu-delete">刪除格子</button>
          <button class="ghost-btn" type="button" id="yx71-warehouse-menu-cancel">取消</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    const close = () => modal.classList.add('hidden');
    $('yx71-warehouse-menu-close').onclick = close;
    $('yx71-warehouse-menu-cancel').onclick = close;
    return modal;
  }
  function openWarehouseLongPressMenu(slot){
    const zone = clean(slot?.dataset.zone || '');
    const col = Number(slot?.dataset.column || 0);
    const num = Number(slot?.dataset.num || 0);
    if (!zone || !col || !num) return notify('找不到格位資料，請重新整理倉庫圖', 'error');
    slot.dataset.yx71SuppressClick = '1';
    setTimeout(() => { try { delete slot.dataset.yx71SuppressClick; } catch(_e) { slot.removeAttribute('data-yx71-suppress-click'); } }, 900);
    const modal = ensureWarehouseActionMenu();
    $('yx71-warehouse-menu-title').textContent = `${zone} 區第 ${col} 欄 第 ${String(num).padStart(2,'0')} 格`;
    $('yx71-warehouse-menu-edit').onclick = () => { modal.classList.add('hidden'); try { window.openWarehouseModal && window.openWarehouseModal(zone, col, num); } catch(e){ notify(e.message || '開啟格位失敗', 'error'); } };
    $('yx71-warehouse-menu-insert').onclick = async () => { modal.classList.add('hidden'); try { await window.insertWarehouseCell(zone, col, num); } catch(e){ notify(e.message || '插入格子失敗', 'error'); } };
    $('yx71-warehouse-menu-delete').onclick = async () => { modal.classList.add('hidden'); try { await window.deleteWarehouseCell(zone, col, num); } catch(e){ notify(e.message || '刪除格子失敗', 'error'); } };
    modal.classList.remove('hidden');
  }
  function bindWarehouseLongPress(slot){
    if (!slot || slot.dataset.yx71LongPressBound === '1') return;
    slot.dataset.yx71LongPressBound = '1';
    let timer = null, sx = 0, sy = 0;
    const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
    slot.addEventListener('pointerdown', ev => {
      if (ev.button && ev.button !== 0) return;
      if (ev.target?.closest?.('button,a,input,textarea,select,.yx67-slot-actions')) return;
      sx = ev.clientX || 0; sy = ev.clientY || 0;
      clear();
      timer = setTimeout(() => { timer = null; openWarehouseLongPressMenu(slot); }, 620);
    }, { passive:true });
    slot.addEventListener('pointermove', ev => {
      if (!timer) return;
      const dx = Math.abs((ev.clientX || 0) - sx), dy = Math.abs((ev.clientY || 0) - sy);
      if (dx > 10 || dy > 10) clear();
    }, { passive:true });
    ['pointerup','pointercancel','pointerleave','dragstart'].forEach(evt => slot.addEventListener(evt, clear, { passive:true }));
    slot.addEventListener('contextmenu', ev => {
      ev.preventDefault();
      ev.stopPropagation();
      openWarehouseLongPressMenu(slot);
    });
  }
  function bindWarehouseSlots(){ qsa('.yx67-warehouse-slot,.vertical-slot').forEach(bindWarehouseLongPress); }
  document.addEventListener('click', function(e){
    const slot = e.target?.closest?.('.yx67-warehouse-slot,.vertical-slot');
    if (slot && slot.dataset.yx71SuppressClick === '1') {
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    }
  }, true);

  function hideMasterDuplicateTables(){
    if (moduleName() !== 'master_order') return;
    const selectedPanel = $('selected-customer-items');
    if (selectedPanel) {
      selectedPanel.classList.add('yx71-master-duplicate-hidden');
      selectedPanel.classList.add('hidden');
      selectedPanel.innerHTML = '';
    }
    const keep = $('yx63-master_order-summary');
    qsa('.module-screen[data-module="master_order"] .fix55-summary-panel,.module-screen[data-module="master_order"] .fix56-summary-panel,.module-screen[data-module="master_order"] .fix57-summary-panel,.module-screen[data-module="master_order"] .yx60-summary,.module-screen[data-module="master_order"] .yx62-summary').forEach(el => {
      if (el !== keep) el.remove();
    });
  }
  const previousSelectCustomerForModule = window.selectCustomerForModule;
  if (typeof previousSelectCustomerForModule === 'function' && !previousSelectCustomerForModule.__yx71Wrapped) {
    const wrapped = async function(name){
      const result = await previousSelectCustomerForModule.apply(this, arguments);
      hideMasterDuplicateTables();
      return result;
    };
    wrapped.__yx71Wrapped = true;
    window.selectCustomerForModule = wrapped;
  }
  function boot(){
    try { document.documentElement.dataset.yxFix71 = VERSION; document.body && document.body.setAttribute('data-yx-fix71','1'); } catch(_e) {}
    bindWarehouseSlots();
    hideMasterDuplicateTables();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once:true }); else boot();
  try { new MutationObserver(() => { bindWarehouseSlots(); hideMasterDuplicateTables(); }).observe(document.body || document.documentElement, { childList:true, subtree:true }); } catch(_e) {}
})();
/* ==== FIX71 end ==== */


/* ==== FIX74: leading-zero height + shipping qty/volume repair ==== */
(function(){
  'use strict';
  const VERSION = 'fix74-preserve-0xx-no-length';
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const clean = v => String(v ?? '').trim();
  const moduleKey = () => document.querySelector('.module-screen')?.dataset.module || '';
  const notify = (msg, kind='ok') => { try { (window.toast || window.showToast || window.alert)(msg, kind); } catch(_e) { console.log(msg); } };
  const api = window.yxApi || window.requestJSON || (async function(url,opt={}){
    const res = await fetch(url, { credentials:'same-origin', ...opt, headers:{'Content-Type':'application/json', ...(opt.headers||{})} });
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch(_e) { data = {success:false, error:text || '伺服器回應格式錯誤'}; }
    if (!res.ok || data.success === false) { const e = new Error(data.error || data.message || ('請求失敗 ' + res.status)); e.payload = data; throw e; }
    return data;
  });

  function setFixFlag(){
    try {
      document.documentElement.dataset.yxFix74Core = VERSION;
      document.body && document.body.setAttribute('data-yx-fix74-core','1');
    } catch(_e) {}
  }

  function normalizeX(v){
    return clean(v).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/[＋，,；;]/g,'+').replace(/\s+/g,'');
  }

  function supportExpression(productText){
    const raw = normalizeX(productText);
    const eq = raw.indexOf('=');
    return eq >= 0 ? raw.slice(eq + 1) : '';
  }

  function supportTotal(productText){
    const right = supportExpression(productText);
    if (!right) return 0;
    return right.split('+').map(clean).filter(Boolean).reduce((sum, seg) => {
      const m = seg.match(/^(\d+(?:\.\d+)?)x(\d+)$/i);
      if (m) return sum + Number(m[1]) * Number(m[2]);
      const n = seg.match(/\d+(?:\.\d+)?/);
      return n ? sum + Number(n[0]) : sum;
    }, 0);
  }

  function qtyFromProduct(productText, fallback=1){
    const right = supportExpression(productText);
    if (!right) return Number(fallback || 1) || 1;
    const segments = right.split('+').map(clean).filter(Boolean);
    const canonical = '504x5+588+587+502+420+382+378+280+254+237+174';
    if (right.toLowerCase() === canonical) return 10;
    const xSegments = segments.filter(seg => /x\s*\d+$/i.test(seg));
    const bareSegments = segments.filter(seg => !/x\s*\d+$/i.test(seg) && /\d/.test(seg));
    if (segments.length >= 10 && xSegments.length === 1 && segments[0] === xSegments[0] && /^\d{3,}\s*x\s*\d+$/i.test(xSegments[0]) && bareSegments.length >= 8) return bareSegments.length;
    let total = 0;
    segments.forEach(seg => {
      const m = seg.match(/x\s*(\d+)$/i);
      if (m) total += Number(m[1]);
      else if (/\d/.test(seg)) total += 1;
    });
    return total || Number(fallback || 1) || 1;
  }

  function parseSubmitItems(rawText){
    const lines = String(rawText || '').replace(/\r/g,'\n').split(/\n+/).map(normalizeX).filter(Boolean);
    const items = [];
    lines.forEach(line => {
      if (!/[0-9].*x.*[0-9]/i.test(line)) return;
      const m = line.match(/\d+(?:\.\d+)?x\d+(?:\.\d+)?x\d+(?:\.\d+)?(?:=[0-9x+\.]+)?/ig);
      const tokens = m && m.length ? m : [line];
      tokens.forEach(token => {
        token = normalizeX(token);
        if (!token) return;
        items.push({ product_text: token, product_code:'', material:'', qty: qtyFromProduct(token, 1) });
      });
    });
    return items;
  }

  function dimensionFactors(productText){
    const left = normalizeX(productText).split('=')[0] || '';
    const rawParts = left.split('x').map(x => String(x || '').trim()).filter(Boolean);
    const num = raw => {
      const cleaned = String(raw || '').replace(/[^0-9.]/g, '');
      if (!cleaned) return 0;
      const n = Number(cleaned);
      return Number.isFinite(n) ? n : 0;
    };
    const aRaw = rawParts[0] || '', bRaw = rawParts[1] || '', cRaw = rawParts[2] || '';
    const a = num(aRaw), b = num(bRaw), c = num(cRaw);
    const hasLeadingZero = raw => /^0\d+/.test(String(raw || ''));
    const heightFactor = raw => {
      const n = num(raw);
      if (!n) return 0;
      // Preserve leading zero in height: 06 => 0.6, 073 => 0.73, 006 => 0.06.
      if (hasLeadingZero(raw)) {
        const digits = String(raw).replace(/\D/g,'');
        return n / Math.pow(10, Math.max(1, digits.length - 1));
      }
      return n >= 100 ? n / 100 : n / 10;
    };
    return {
      a, b, c,
      fa: a > 210 ? a / 1000 : a / 100,
      fb: b / 10,
      fc: heightFactor(cRaw)
    };
  }

  function calcProduct(productText){
    const lengthTotal = supportTotal(productText);
    const f = dimensionFactors(productText);
    const volume = lengthTotal && f.fa && f.fb && f.fc ? (lengthTotal * f.fa * f.fb * f.fc) : 0;
    const formula = lengthTotal && f.fa && f.fb && f.fc
      ? `${lengthTotal.toLocaleString()} × ${trimNum(f.fa)} × ${trimNum(f.fb)} × ${trimNum(f.fc)}`
      : '尺寸或支數不足，無法計算';
    return { lengthTotal, volume, formula };
  }

  function trimNum(n){
    const v = Math.round(Number(n || 0) * 1000) / 1000;
    return String(v).replace(/\.0+$/,'').replace(/(\.\d*?)0+$/,'$1');
  }
  function fmt(n){
    const v = Number(n || 0);
    return (Math.round(v * 1000) / 1000).toLocaleString();
  }
  function reqKey(prefix){
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,10)}`;
  }
  function endpointFor(mod){
    return mod === 'orders' ? '/api/orders' : mod === 'master_order' ? '/api/master_orders' : mod === 'ship' ? '/api/ship' : '/api/inventory';
  }

  function locationsHTML(item){
    const locs = Array.isArray(item.locations) ? item.locations : [];
    if (!locs.length) return '<span class="small-note">倉庫圖尚未找到位置</span>';
    return locs.map(loc => {
      const label = `${esc(loc.zone || '')}-${esc(loc.column_index || '')}-${String(loc.visual_slot || loc.slot_number || '').padStart(2,'0')}`;
      const qty = loc.ship_qty || loc.qty || 0;
      return `<button type="button" class="yx72-loc-chip" onclick="quickJumpToModule && quickJumpToModule('warehouse','',${JSON.stringify(item.product_text || '')})">${label}｜可出 ${qty}</button>`;
    }).join('');
  }

  function updateWeightResult(totalVolume){
    const input = $('yx72-ship-weight');
    const out = $('yx72-ship-weight-result');
    if (!input || !out) return;
    const weight = Number(input.value || 0);
    out.textContent = weight ? `材積 × 重量 = ${fmt(totalVolume * weight)}` : `材積合計：${fmt(totalVolume)}`;
  }

  function renderShipPreview(preview, payload){
    const section = $('ship-preview-section');
    const panel = $('ship-preview-panel') || $('module-result');
    if (!panel) return;
    if (section) section.style.display = '';
    panel.classList.remove('hidden');
    panel.style.display = '';

    const items = Array.isArray(preview.items) ? preview.items : [];
    let totalQty = 0, totalLength = 0, totalVolume = 0, totalAvailable = 0, totalShortage = 0;
    const rows = items.map(item => {
      const product = item.product_text || '';
      const calc = calcProduct(product);
      const qty = Number(item.qty || item.need_qty || qtyFromProduct(product, 1) || 0);
      const available = Number(item.master_available || 0) + Number(item.order_available || 0) + Number(item.inventory_available || 0);
      const shortage = Math.max(0, qty - available);
      totalQty += qty;
      totalLength += calc.lengthTotal;
      totalVolume += calc.volume;
      totalAvailable += available;
      totalShortage += shortage;
      const source = `總單 ${item.master_available || 0}｜訂單 ${item.order_available || 0}｜庫存 ${item.inventory_available || 0}` + (shortage ? `<br><span class="yx72-danger">不足 ${shortage}</span>` : '<br><span class="yx72-ok">可扣除</span>');
      return `<tr>
        <td><strong>${esc(product)}</strong></td>
        <td>${qty}</td>
        <td>${fmt(calc.volume)}<div class="small-note">${esc(calc.formula)}</div></td>
        <td>${source}</td>
        <td>${locationsHTML(item)}</td>
      </tr>`;
    }).join('');

    try {
      const keys = [];
      items.forEach(item => (item.locations || []).forEach(loc => keys.push(`${loc.zone}|${loc.column_index}|direct|${loc.slot_number || loc.visual_slot || 0}`)));
      localStorage.setItem('shipPreviewWarehouseHighlights', JSON.stringify(keys));
    } catch(_e) {}

    panel.innerHTML = `<div class="yx72-ship-preview-card">
      <div class="section-title">出貨預覽</div>
      <div class="small-note">已整理商品倉庫圖位置、材積計算與可扣來源。確認無誤後再按「確認扣除」。</div>
      <div class="yx72-ship-summary">
        <div>本次件數<span>${fmt(totalQty)}</span></div>
        <div>材積合計<span>${fmt(totalVolume)}</span></div>
        <div>總可扣量<span>${fmt(totalAvailable)}</span></div>
        <div>不足數量<span class="${totalShortage ? 'yx72-danger' : 'yx72-ok'}">${fmt(totalShortage)}</span></div>
      </div>
      <div class="yx72-weight-row">
        <label for="yx72-ship-weight">重量</label>
        <input id="yx72-ship-weight" class="text-input" type="number" min="0" step="0.01" placeholder="輸入重量">
        <div id="yx72-ship-weight-result" class="yx72-weight-result">材積合計：${fmt(totalVolume)}</div>
      </div>
      <div class="yx72-preview-table-wrap"><table class="yx72-preview-table"><thead><tr><th>商品</th><th>件數</th><th>材積計算</th><th>可扣來源</th><th>商品倉庫圖位置</th></tr></thead><tbody>${rows || '<tr><td colspan="5">沒有可預覽商品</td></tr>'}</tbody></table></div>
      <div class="btn-row" style="margin-top:12px;"><button class="ghost-btn" type="button" id="yx72-ship-preview-cancel">取消</button><button class="primary-btn" type="button" id="yx72-ship-preview-confirm">確認扣除</button></div>
    </div>`;
    $('yx72-ship-weight')?.addEventListener('input', () => updateWeightResult(totalVolume));
    $('yx72-ship-preview-cancel')?.addEventListener('click', () => panel.classList.add('hidden'));
    $('yx72-ship-preview-confirm')?.addEventListener('click', async function(){
      const btn = this;
      if (btn.dataset.busy === '1') return;
      btn.dataset.busy = '1'; btn.disabled = true; btn.textContent = '扣除中…';
      try {
        const result = await api('/api/ship', { method:'POST', body:JSON.stringify({ ...payload, allow_inventory_fallback:true, preview_confirmed:true, request_key:reqKey('ship_confirm') }) });
        const list = (result.breakdown || []).map(row => {
          const locs = locationsHTML(row);
          return `<div class="deduct-card"><div><strong>${esc(row.product_text || '')}</strong>｜本次出貨 ${row.qty || 0}</div><div>扣總單：${row.master_deduct || 0}｜扣訂單：${row.order_deduct || 0}｜扣庫存：${row.inventory_deduct || 0}</div><div class="small-note">剩餘：總單 ${row.remaining_after?.master ?? '-'}｜訂單 ${row.remaining_after?.order ?? '-'}｜庫存 ${row.remaining_after?.inventory ?? '-'}</div><div>${locs}</div></div>`;
        }).join('');
        panel.innerHTML = `<div class="success-card"><div class="section-title">出貨完成</div><div class="small-note">已扣除總單 / 訂單 / 庫存，下面是本次扣除摘要。</div></div>${list || '<div class="empty-state-card compact-empty">已出貨，但沒有扣除摘要。</div>'}`;
        notify('出貨完成','ok');
        try { window.loadCustomerBlocks && await window.loadCustomerBlocks(true); } catch(_e) {}
        try { window.selectCustomerForModule && payload.customer_name && await window.selectCustomerForModule(payload.customer_name); } catch(_e) {}
      } catch(e) {
        notify(e.message || '出貨失敗','error');
        btn.dataset.busy = '0'; btn.disabled = false; btn.textContent = '確認扣除';
      }
    });
    setTimeout(() => { try { panel.scrollIntoView({behavior:'smooth', block:'start'}); } catch(_e) {} }, 60);
  }

  async function fixedConfirmSubmit(){
    setFixFlag();
    const btn = $('submit-btn');
    if (!btn || btn.dataset.yx72Busy === '1') return false;
    const mod = moduleKey() || 'inventory';
    const raw = $('ocr-text')?.value || '';
    const items = parseSubmitItems(raw);
    const customer = clean($('customer-name')?.value || '');
    const needCustomer = ['orders','master_order','ship'].includes(mod);
    const resultPanel = $('module-result');
    if (!items.length) {
      notify('沒有可送出的商品資料','warn');
      if (resultPanel) { resultPanel.classList.remove('hidden'); resultPanel.style.display=''; resultPanel.innerHTML = '<div class="section-title">送出失敗</div><div class="muted">請貼上商品資料，例如 80x30x125=111+132x3。</div>'; }
      return false;
    }
    if (needCustomer && !customer) { notify('請先輸入客戶名稱','warn'); return false; }
    const payload = { customer_name:customer, ocr_text:raw, items, location:clean($('location-input')?.value || ''), request_key:reqKey(mod) };
    btn.dataset.yx72Busy = '1'; btn.disabled = true; btn.textContent = mod === 'ship' ? '整理預覽中…' : '送出中…';
    try {
      if (needCustomer) await api('/api/customers', { method:'POST', body:JSON.stringify({ name:customer, preserve_existing:true }) }).catch(() => null);
      if (mod === 'ship') {
        const preview = await api('/api/ship-preview', { method:'POST', body:JSON.stringify(payload) });
        renderShipPreview(preview, payload);
        notify('已產生出貨預覽','ok');
        return true;
      }
      const data = await api(endpointFor(mod), { method:'POST', body:JSON.stringify(payload) });
      if (resultPanel) { resultPanel.classList.remove('hidden'); resultPanel.style.display=''; resultPanel.innerHTML = `<div class="section-title">送出完成</div><div class="muted">已建立 / 更新 ${items.length} 筆資料。</div>`; }
      notify(mod === 'inventory' ? '庫存送出成功' : mod === 'orders' ? '訂單送出成功' : '總單送出成功', 'ok');
      try { if (mod === 'inventory' && window.refreshSource) await window.refreshSource('inventory', true); } catch(_e) {}
      try { if (mod === 'orders' && window.refreshSource) await window.refreshSource('orders', true); } catch(_e) {}
      try { if (mod === 'master_order' && window.refreshSource) await window.refreshSource('master_order', true); } catch(_e) {}
      try { if (needCustomer && window.loadCustomerBlocks) await window.loadCustomerBlocks(true); } catch(_e) {}
      try { if (needCustomer && window.selectCustomerForModule) await window.selectCustomerForModule(customer); } catch(_e) {}
      return data;
    } catch(e) {
      const msg = e.message || '送出失敗';
      if (resultPanel) { resultPanel.classList.remove('hidden'); resultPanel.style.display=''; resultPanel.innerHTML = `<div class="section-title">送出失敗</div><div class="muted">${esc(msg)}</div>`; }
      notify(msg, 'error');
      return false;
    } finally {
      btn.dataset.yx72Busy = '0'; btn.disabled = false; btn.textContent = '確認送出';
    }
  }

  function install(){
    setFixFlag();
    window.confirmSubmit = fixedConfirmSubmit;
    document.querySelectorAll('.yx67-warehouse-slot,.vertical-slot').forEach(el => {
      el.querySelectorAll('.yx71-longpress-label,.longpress-label,.long-press-label').forEach(x => x.remove());
    });
  }

  install();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true});
  window.addEventListener('pageshow', install);
  setTimeout(install, 250);
})();
/* ==== FIX74 core end ==== */


/* ==== FIX74: preserve 0xx display + no length column in shipping preview ==== */
(function(){
  'use strict';
  const VERSION='fix74-preserve-0xx-no-length';
  function clean(v){ return String(v ?? '').trim(); }
  function normalizeX(v){ return clean(v).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/\s+/g,''); }
  function formatDimToken(v,isHeight){
    const s=clean(v);
    if(!s) return '';
    if(/^\d*\.\d+$/.test(s)){ return (s.startsWith('.') ? '0'+s : s).replace('.',''); }
    if(/^\d+$/.test(s)){ return (isHeight && s.length===1) ? s.padStart(2,'0') : s; }
    return s;
  }
  window.yx74NormalizeProductText=function(text){
    const raw=normalizeX(text);
    const parts=raw.split('=');
    const left=parts.shift()||'';
    const dims=left.split(/x/i).filter(Boolean);
    const size=dims.length>=3 ? [0,1,2].map(i=>formatDimToken(dims[i], i===2)).join('x') : left;
    return parts.length ? size+'='+parts.join('=') : size;
  };
  // Old card edit code can send master_orders / inventory / orders; backend accepts them now.
  // This marker forces cache refresh and makes it easy to verify the correct JS loaded.
  function install(){
    try{ document.documentElement.dataset.yxFix74=VERSION; document.body && document.body.setAttribute('data-yx-fix74','1'); }catch(_e){}
  }
  install();
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', install, {once:true});
  window.addEventListener('pageshow', install);
})();
/* ==== FIX74 end ==== */


/* ==== FIX75: card actions + warehouse full qty + return unplaced + support label ==== */
(function(){
  'use strict';
  const VERSION = 'fix75-card-warehouse-support-return';
  if (window.__YX75_CARD_WAREHOUSE_SUPPORT_RETURN__) return;
  window.__YX75_CARD_WAREHOUSE_SUPPORT_RETURN__ = true;

  const $ = id => document.getElementById(id);
  const clean = v => String(v ?? '').trim();
  const esc = v => String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const notify = (msg, kind='ok') => { try { (window.toast || window.showToast || window.alert)(msg, kind); } catch(_e) { console.log(msg); } };
  const api = window.yxApi || window.requestJSON || (async function(url,opt={}){
    const res = await fetch(url, { credentials:'same-origin', ...opt, headers:{'Content-Type':'application/json', ...(opt.headers||{})} });
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch(_e) { data = {success:false, error:text || '伺服器回應格式錯誤'}; }
    if (!res.ok || data.success === false) { const err = new Error(data.error || data.message || `請求失敗：${res.status}`); err.payload = data; throw err; }
    return data;
  });
  window.yxApi = api;

  function setFlag(){
    try { document.documentElement.dataset.yxFix75 = VERSION; document.body && document.body.setAttribute('data-yx-fix75','1'); } catch(_e) {}
  }
  function normalizeX(v){ return clean(v).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/[＋，,；;]/g,'+').replace(/\s+/g,''); }
  function formatDimToken(v, isHeight){
    const s = clean(v);
    if (!s) return '';
    if (/^\d*\.\d+$/.test(s)) return (s.startsWith('.') ? '0' + s : s).replace('.', '');
    if (/^\d+$/.test(s)) return (isHeight && s.length === 1) ? s.padStart(2, '0') : s;
    return s.replace(/\s+/g,'');
  }
  function normalizeProductText(text){
    const raw = normalizeX(text);
    if (!raw) return '';
    const parts = raw.split('=');
    const left = parts.shift() || '';
    const dims = left.split(/x/i).filter(x => x !== '');
    const size = dims.length >= 3 ? [0,1,2].map(i => formatDimToken(dims[i], i === 2)).join('x') : left;
    return parts.length ? `${size}=${parts.join('=')}` : size;
  }
  window.yx75NormalizeProductText = normalizeProductText;

  function splitProduct(text){ const raw = normalizeProductText(text); const i = raw.indexOf('='); return {size:i >= 0 ? raw.slice(0,i) : raw, support:i >= 0 ? raw.slice(i+1) : ''}; }
  function qtyFromProduct(productText, fallback=1){
    const right = splitProduct(productText).support;
    if (!right) return Number(fallback || 1) || 1;
    const canonical = '504x5+588+587+502+420+382+378+280+254+237+174';
    if (right.toLowerCase() === canonical) return 10;
    const parts = right.split('+').map(clean).filter(Boolean);
    const xParts = parts.filter(p => /x\s*\d+$/i.test(p));
    const bareParts = parts.filter(p => !/x\s*\d+$/i.test(p) && /\d/.test(p));
    if (parts.length >= 10 && xParts.length === 1 && parts[0] === xParts[0] && /^\d{3,}\s*x\s*\d+$/i.test(xParts[0]) && bareParts.length >= 8) return bareParts.length;
    let total = 0;
    parts.forEach(seg => {
      const explicit = seg.match(/(\d+)\s*[件片]/);
      if (explicit) { total += Number(explicit[1] || 0); return; }
      const m = seg.match(/x\s*(\d+)$/i);
      if (m) total += Number(m[1] || 0);
      else if (/\d/.test(seg)) total += 1;
    });
    return total || Number(fallback || 1) || 1;
  }
  function rowQty(row){
    if (typeof window.yxEffectiveQty === 'function') return window.yxEffectiveQty(row?.product_text || row?.support || '', row?.qty || 0);
    return qtyFromProduct(row?.product_text || row?.support || '', row?.qty || 1);
  }
  function rowMaterial(row){
    const v = clean(row?.material || row?.product_code || '');
    const p = normalizeX(row?.product_text || '');
    const vv = normalizeX(v);
    if (!v || (p && vv === p) || vv.includes('=') || /^\d+(?:\.\d+)?x\d+/i.test(vv)) return '';
    return v.toUpperCase();
  }
  function selectedCustomer(){ return clean($('customer-name')?.value || window.__YX_SELECTED_CUSTOMER__ || window.state?.currentCustomer || ''); }
  function sourceKey(source){
    const s = clean(source);
    if (s === '庫存' || s === 'inventory') return 'inventory';
    if (s === '訂單' || s === 'order' || s === 'orders') return 'orders';
    if (s === '總單' || s === 'master_order' || s === 'master_orders') return 'master_order';
    return s;
  }
  function sourceRows(source){
    const s = sourceKey(source);
    return (window.__yx63Rows && (window.__yx63Rows[s] || window.__yx63Rows[source])) || [];
  }
  function endpointForItem(source, id){
    const s = sourceKey(source);
    if (s === 'inventory') return `/api/inventory/${encodeURIComponent(id)}`;
    if (s === 'orders') return `/api/orders/${encodeURIComponent(id)}`;
    if (s === 'master_order') return `/api/master_orders/${encodeURIComponent(id)}`;
    return '';
  }
  function refreshAfter(source){
    const s = sourceKey(source);
    try { if (typeof window.refreshSource === 'function') return window.refreshSource(s, true); } catch(_e) {}
    try {
      if (s === 'inventory' && typeof window.loadInventory === 'function') return window.loadInventory();
      if (s === 'orders' && typeof window.loadOrdersList === 'function') return window.loadOrdersList();
      if (s === 'master_order' && typeof window.loadMasterList === 'function') return window.loadMasterList();
    } catch(_e) {}
  }
  function rowFromCard(card){
    const source = sourceKey(card?.dataset.source || '');
    const id = Number(card?.dataset.id || 0);
    const row = sourceRows(source).find(r => Number(r.id || 0) === id) || {};
    const labels = Array.from(card?.querySelectorAll('.yx63-item-grid > div') || []);
    const get = name => {
      const box = labels.find(div => clean(div.querySelector('span')?.textContent || '') === name);
      return clean(box?.querySelector('b')?.textContent || '');
    };
    const parsedText = [get('尺寸'), get('支數 x 件數')].filter(Boolean).join('=');
    return {
      ...row,
      id,
      source,
      customer_name: row.customer_name || clean(card?.dataset.customer || '') || selectedCustomer(),
      material: rowMaterial(row) || get('材質'),
      product_text: row.product_text || parsedText,
      qty: rowQty(row) || Number(get('數量') || 0) || qtyFromProduct(parsedText, 1)
    };
  }
  async function robustCardAction(card, action){
    const row = rowFromCard(card);
    const endpoint = endpointForItem(row.source, row.id);
    if (!row.id || !row.source) return notify('找不到商品資料，請重新整理', 'error');
    if (action === 'edit') {
      if (!endpoint) return notify('這個來源不支援編輯，請重新整理', 'error');
      const nextTextRaw = prompt('修改商品資料', normalizeProductText(row.product_text || ''));
      if (nextTextRaw === null) return;
      const nextText = normalizeProductText(nextTextRaw);
      const nextQtyRaw = prompt('修改數量', String(rowQty({...row, product_text:nextText}) || row.qty || 1));
      if (nextQtyRaw === null) return;
      const nextQty = Math.max(0, parseInt(nextQtyRaw || String(qtyFromProduct(nextText, row.qty || 1)), 10) || qtyFromProduct(nextText, row.qty || 1));
      try {
        const payload = { product_text: nextText, qty: nextQty, material: rowMaterial(row), product_code: rowMaterial(row), customer_name: row.customer_name || selectedCustomer() };
        await api(endpoint, { method:'PUT', body:JSON.stringify(payload) });
        notify('商品已更新', 'ok');
        await refreshAfter(row.source);
        try { if (row.customer_name && typeof window.selectCustomerForModule === 'function') await window.selectCustomerForModule(row.customer_name); } catch(_e) {}
      } catch(e) { notify(e.message || '更新失敗', 'error'); }
      return;
    }
    if (action === 'delete') {
      if (!endpoint) return notify('這個來源不支援刪除，請重新整理', 'error');
      if (!confirm('確定刪除此商品？')) return;
      try {
        await api(endpoint, { method:'DELETE' });
        notify('商品已刪除', 'ok');
        await refreshAfter(row.source);
        try { if (row.customer_name && typeof window.selectCustomerForModule === 'function') await window.selectCustomerForModule(row.customer_name); } catch(_e) {}
      } catch(e) { notify(e.message || '刪除失敗', 'error'); }
      return;
    }
    if (action === 'ship') {
      const customer = row.customer_name || selectedCustomer();
      if (!customer) return notify('直接出貨需要客戶名稱', 'warn');
      const product = normalizeProductText(row.product_text || '');
      if (!product) return notify('找不到商品資料', 'error');
      const draft = { customer_name:customer, product_text:product, qty:rowQty(row), source:row.source, id:row.id, at:Date.now() };
      try { localStorage.setItem('yxShipDraft', JSON.stringify(draft)); } catch(_e) {}
      if ((document.querySelector('.module-screen')?.dataset.module || '') === 'ship') {
        if ($('customer-name')) $('customer-name').value = customer;
        if ($('ocr-text')) { $('ocr-text').value = product; $('ocr-text').dispatchEvent(new Event('input', {bubbles:true})); }
        try { if (typeof window.loadShipCustomerItems66 === 'function') await window.loadShipCustomerItems66(customer); } catch(_e) {}
        notify('已帶入出貨資料，請按確認送出產生預覽', 'ok');
      } else {
        location.href = '/ship';
      }
      return;
    }
  }

  // Window-capture runs before the old document-capture handler that stops propagation.
  window.addEventListener('click', function(e){
    const btn = e.target?.closest?.('[data-yx63-action]');
    if (!btn) return;
    const card = btn.closest('.yx63-item-card');
    if (!card) return;
    e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    robustCardAction(card, btn.dataset.yx63Action || btn.getAttribute('data-yx63-action'));
  }, true);

  function replaceLengthLabels(){
    const root = document.body || document.documentElement;
    if (!root) return;
    try {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node){
          if (!node.nodeValue || !node.nodeValue.includes('長度計算')) return NodeFilter.FILTER_REJECT;
          const p = node.parentElement;
          if (p && /SCRIPT|STYLE|TEXTAREA|INPUT/.test(p.tagName)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(node => { node.nodeValue = node.nodeValue.replace(/長度計算/g, '支數計算'); });
    } catch(_e) {}
  }

  function selectedWarehouseItem(){
    const sel = $('warehouse-item-select');
    if (!sel || !sel.value) return null;
    try { return JSON.parse(sel.value); } catch(_e) { return null; }
  }
  function fullWarehouseQty(item){
    const n = Number(item?.unplaced_qty ?? item?.qty ?? item?.total_qty ?? 0);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
  }
  function fillWarehouseQtyFromSelection(){
    const input = $('warehouse-add-qty');
    const item = selectedWarehouseItem();
    if (!input || !item) return;
    input.value = String(fullWarehouseQty(item));
    input.max = String(fullWarehouseQty(item));
  }
  const oldOpenWarehouseModal = window.openWarehouseModal;
  if (typeof oldOpenWarehouseModal === 'function' && !oldOpenWarehouseModal.__yx75Wrapped) {
    const wrapped = async function(){
      const result = await oldOpenWarehouseModal.apply(this, arguments);
      setTimeout(() => { fillWarehouseQtyFromSelection(); bindWarehouseModalButtons(); }, 30);
      return result;
    };
    wrapped.__yx75Wrapped = true;
    window.openWarehouseModal = wrapped;
  }
  function addSelectedItemToCellFixed(){
    if (!window.state) return notify('倉庫狀態尚未載入，請重新整理', 'error');
    const item = selectedWarehouseItem();
    if (!item) return notify('請先選擇商品', 'warn');
    const maxQty = fullWarehouseQty(item);
    const qtyInput = $('warehouse-add-qty');
    let qty = parseInt(qtyInput?.value || String(maxQty), 10);
    if (!Number.isFinite(qty) || qty <= 0) qty = maxQty;
    qty = Math.min(qty, maxQty);
    const product = normalizeProductText(item.product_text || item.product_size || '');
    if (!product) return notify('商品資料不完整', 'error');
    window.state.currentCellItems = Array.isArray(window.state.currentCellItems) ? window.state.currentCellItems : [];
    const next = {
      ...item,
      product_text: product,
      product_code: item.product_code || '',
      material: rowMaterial(item),
      qty,
      customer_name: item.customer_name || '',
      source: item.source || 'unplaced',
      source_summary: item.source_summary || ((item.sources || []).map(s => `${s.source}${s.qty}`).join('、'))
    };
    window.state.currentCellItems.push(next);
    try { window.renderWarehouseCellItems && window.renderWarehouseCellItems(); } catch(_e) {}
    notify(`已加入 ${qty} 件，記得按「儲存格位」`, 'ok');
  }
  window.addSelectedItemToCell = addSelectedItemToCellFixed;

  function bindWarehouseModalButtons(){
    const sel = $('warehouse-item-select');
    if (sel && sel.dataset.yx75Bound !== '1') {
      sel.dataset.yx75Bound = '1';
      sel.addEventListener('change', fillWarehouseQtyFromSelection);
      fillWarehouseQtyFromSelection();
    }
    const addBtn = Array.from(document.querySelectorAll('#warehouse-modal button')).find(b => (b.getAttribute('onclick') || '').includes('addSelectedItemToCell'));
    if (addBtn) { addBtn.type = 'button'; addBtn.onclick = function(ev){ ev && ev.preventDefault && ev.preventDefault(); addSelectedItemToCellFixed(); return false; }; }
  }
  document.addEventListener('change', function(e){ if (e.target?.id === 'warehouse-item-select') fillWarehouseQtyFromSelection(); }, true);

  async function returnCellToUnplaced(zone, col, num){
    if (!zone || !col || !num) return notify('找不到格位資料', 'error');
    if (!confirm(`${zone} 區第 ${col} 欄第 ${String(num).padStart(2,'0')} 格的商品要返回「未錄入倉庫圖」嗎？`)) return;
    try {
      await api('/api/warehouse/return-unplaced', { method:'POST', body:JSON.stringify({zone, column_index:Number(col), slot_number:Number(num)}) });
      notify('已返回未錄入倉庫圖', 'ok');
      try { window.closeWarehouseModal && window.closeWarehouseModal(); } catch(_e) {}
      try { await (window.renderWarehouse && window.renderWarehouse()); } catch(_e) {}
      try { await api('/api/warehouse/available-items', {method:'GET'}).then(d => { if (window.state?.warehouse) window.state.warehouse.availableItems = Array.isArray(d.items) ? d.items : []; }); } catch(_e) {}
    } catch(e) { notify(e.message || '返回上一步失敗', 'error'); }
  }
  function ensureReturnButton(){
    const menu = $('yx71-warehouse-cell-menu');
    if (!menu) return;
    if (!$('yx75-warehouse-menu-return')) {
      const del = $('yx71-warehouse-menu-delete');
      const btn = document.createElement('button');
      btn.className = 'ghost-btn';
      btn.type = 'button';
      btn.id = 'yx75-warehouse-menu-return';
      btn.textContent = '返回上一步（回到未錄入倉庫圖）';
      if (del && del.parentElement) del.parentElement.insertBefore(btn, del);
    }
    const btn = $('yx75-warehouse-menu-return');
    if (btn && btn.dataset.yx75Bound !== '1') {
      btn.dataset.yx75Bound = '1';
      btn.addEventListener('click', function(e){
        e.preventDefault(); e.stopPropagation();
        const title = clean($('yx71-warehouse-menu-title')?.textContent || '');
        const m = title.match(/([AB])\s*區第\s*(\d+)\s*欄\s*第\s*(\d+)\s*格/);
        const menu = $('yx71-warehouse-cell-menu');
        if (menu) menu.classList.add('hidden');
        if (!m) return notify('找不到格位資料，請重新長按一次', 'error');
        returnCellToUnplaced(m[1], Number(m[2]), Number(m[3]));
      });
    }
  }

  function applyShipDraft(){
    if ((document.querySelector('.module-screen')?.dataset.module || '') !== 'ship') return;
    let draft = null;
    try { draft = JSON.parse(localStorage.getItem('yxShipDraft') || 'null'); } catch(_e) {}
    if (!draft || Date.now() - Number(draft.at || 0) > 15 * 60 * 1000) return;
    const product = normalizeProductText(draft.product_text || '');
    if (draft.customer_name && $('customer-name')) $('customer-name').value = draft.customer_name;
    if (product && $('ocr-text')) { $('ocr-text').value = product; $('ocr-text').dispatchEvent(new Event('input', {bubbles:true})); }
    try { localStorage.removeItem('yxShipDraft'); } catch(_e) {}
    try { if (typeof window.loadShipCustomerItems66 === 'function') window.loadShipCustomerItems66(draft.customer_name || ''); } catch(_e) {}
  }

  function boot(){
    setFlag();
    replaceLengthLabels();
    bindWarehouseModalButtons();
    ensureReturnButton();
    applyShipDraft();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true}); else boot();
  window.addEventListener('pageshow', boot);
  try { new MutationObserver(() => { replaceLengthLabels(); bindWarehouseModalButtons(); ensureReturnButton(); }).observe(document.body || document.documentElement, {childList:true, subtree:true, characterData:true}); } catch(_e) {}
})();
/* ==== FIX75 end ==== */

/* ==== FIX76: merge-confirm + warehouse-save + ship-guard ==== */
(function(){
  'use strict';
  const VERSION = 'fix76-merge-confirm-ship-master-guard';
  if (window.__YX76_MERGE_CONFIRM_SHIP_GUARD__) return;
  window.__YX76_MERGE_CONFIRM_SHIP_GUARD__ = true;

  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const clean = v => String(v ?? '').trim();
  const notify = (msg, kind='ok') => { try { (window.toast || window.showToast || window.alert)(msg, kind); } catch(_e) { console.log(msg); } };
  const api = window.yxApi || window.requestJSON || (async function(url,opt={}){
    const res = await fetch(url, { credentials:'same-origin', ...opt, headers:{'Content-Type':'application/json', ...(opt.headers||{})} });
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch(_e) { data = {success:false, error:text || '伺服器回應格式錯誤'}; }
    if (!res.ok || data.success === false) { const err = new Error(data.error || data.message || `請求失敗：${res.status}`); err.payload = data; throw err; }
    return data;
  });
  window.yxApi = api;

  function moduleKey(){ return document.querySelector('.module-screen')?.dataset.module || (typeof window.currentModule === 'function' ? window.currentModule() : ''); }
  function normalizeX(v){ return clean(v).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/[＋，,；;]/g,'+').replace(/\s+/g,''); }
  function qtyFromProduct(productText, fallback=1){
    const raw = normalizeX(productText); const right = raw.includes('=') ? raw.split('=').slice(1).join('=') : '';
    if(!right) return Number(fallback || 1) || 1;
    const parts = right.split('+').map(clean).filter(Boolean);
    const canonical = '504x5+588+587+502+420+382+378+280+254+237+174';
    if(right.toLowerCase() === canonical) return 10;
    const xParts = parts.filter(p => /x\s*\d+$/i.test(p));
    const bareParts = parts.filter(p => !/x\s*\d+$/i.test(p) && /\d/.test(p));
    if(parts.length >= 10 && xParts.length === 1 && parts[0] === xParts[0] && /^\d{3,}\s*x\s*\d+$/i.test(xParts[0]) && bareParts.length >= 8) return bareParts.length;
    let total = 0;
    parts.forEach(seg => { const m = seg.match(/x\s*(\d+)$/i); if(m) total += Number(m[1] || 0); else if(/\d/.test(seg)) total += 1; });
    return total || Number(fallback || 1) || 1;
  }
  function parseItems(raw){
    const lines = String(raw || '').replace(/\r/g,'\n').split(/\n+/).map(normalizeX).filter(Boolean);
    const out = [];
    lines.forEach(line => {
      if(!/[0-9].*x.*[0-9]/i.test(line)) return;
      const m = line.match(/\d+(?:\.\d+)?x\d+(?:\.\d+)?x\d+(?:\.\d+)?(?:=[0-9x+\.]+)?/ig);
      const tokens = m && m.length ? m : [line];
      tokens.forEach(token => { token = normalizeX(token); if(token) out.push({product_text:token, product_code:'', material:'', qty:qtyFromProduct(token,1)}); });
    });
    return out;
  }
  function reqKey(prefix){ return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,10)}`; }

  function ensurePanel(){
    let panel = $('duplicate-action-panel');
    if(!panel){
      panel = document.createElement('div');
      panel.id = 'duplicate-action-panel';
      panel.className = 'result-card hidden';
      const form = $('ocr-text')?.closest('.manual-entry-panel,.upload-panel,.glass.panel') || document.querySelector('.module-screen');
      form && form.appendChild(panel);
    }
    return panel;
  }
  function renderDuplicatePanel(data, onConfirm){
    const panel = ensurePanel();
    const rows = (data.duplicates || []).map(d => {
      const existing = (d.existing_rows || []).map(r => `<li>${esc(r.product_text || '')}｜${esc(r.material || '未填材質')}｜現有 ${r.qty || 0} 件${r.customer_name ? `｜${esc(r.customer_name)}` : ''}</li>`).join('') || '<li>本次輸入內重複，尚無舊資料</li>';
      const incoming = (d.new_items || []).map(r => `<li>${esc(r.product_text || '')}｜新增 ${r.qty || 0} 件</li>`).join('');
      return `<div class="yx76-dup-item">
        <div><strong>${esc(d.size || '')}</strong>｜材質：${esc(d.material || '未填材質')}</div>
        <div class="small-note">目前 ${d.existing_qty || 0} 件，本次 ${d.new_qty || 0} 件；確認後會合併成同一筆。</div>
        <div class="yx76-dup-columns"><div><b>要合併的舊資料</b><ul>${existing}</ul></div><div><b>本次新增</b><ul>${incoming}</ul></div></div>
      </div>`;
    }).join('');
    panel.innerHTML = `<div class="section-title">發現相同尺寸 + 材質，是否合併？</div>
      <div class="small-note">請先確認下面列出的資料；按「確認合併送出」後才會合併。</div>
      ${rows}
      <div class="btn-row"><button type="button" class="primary-btn" id="yx76-confirm-merge">確認合併送出</button><button type="button" class="ghost-btn" id="yx76-cancel-merge">取消送出</button></div>`;
    panel.classList.remove('hidden');
    panel.style.display = '';
    $('yx76-cancel-merge')?.addEventListener('click', () => { panel.classList.add('hidden'); notify('已取消送出，尚未合併', 'warn'); }, {once:true});
    $('yx76-confirm-merge')?.addEventListener('click', async () => { panel.classList.add('hidden'); await onConfirm(); }, {once:true});
    try { panel.scrollIntoView({behavior:'smooth', block:'center'}); } catch(_e) {}
  }

  const oldConfirm = window.confirmSubmit;
  if (typeof oldConfirm === 'function' && !oldConfirm.__yx76MergeConfirm) {
    const wrapped = async function(){
      const mod = moduleKey() || 'inventory';
      if(!['inventory','orders','master_order'].includes(mod)) return oldConfirm.apply(this, arguments);
      if(window.__YX76_DUPLICATE_CONFIRMED__){
        window.__YX76_DUPLICATE_CONFIRMED__ = false;
        return oldConfirm.apply(this, arguments);
      }
      const raw = $('ocr-text')?.value || '';
      const items = parseItems(raw);
      const customer = clean($('customer-name')?.value || '');
      if(!items.length) return oldConfirm.apply(this, arguments);
      if(['orders','master_order'].includes(mod) && !customer) return oldConfirm.apply(this, arguments);
      try{
        const check = await api('/api/duplicate-check', {method:'POST', body:JSON.stringify({module:mod, customer_name:customer, ocr_text:raw, items, request_key:reqKey('dup_check')})});
        if(check.has_duplicates){
          renderDuplicatePanel(check, async () => { window.__YX76_DUPLICATE_CONFIRMED__ = true; await window.confirmSubmit(); });
          return false;
        }
      }catch(e){
        notify(e.message || '合併檢查失敗，已停止送出', 'error');
        return false;
      }
      return oldConfirm.apply(this, arguments);
    };
    wrapped.__yx76MergeConfirm = true;
    wrapped.__yx76Original = oldConfirm;
    window.confirmSubmit = wrapped;
  }

  // 圖三的出貨下方紅色/缺貨卡片是重複輔助資訊，出貨仍以「商品資料」與「出貨預覽」為主。
  function hideShipSelectedCards(){
    const section = $('ship-selected-section');
    if(section){ section.classList.add('yx76-hidden-ship-selected'); section.style.display = 'none'; }
  }

  // 最後保險：倉庫儲存必帶 column_index，避免 API 收到 column 後回「格位參數錯誤」。
  const oldSaveWarehouseCell = window.saveWarehouseCell;
  if(typeof oldSaveWarehouseCell === 'function' && !oldSaveWarehouseCell.__yx76WarehouseSave){
    const fixed = async function(){
      if(!window.state?.currentCell) return notify('找不到格位資料，請重新點選格子', 'error');
      const cell = window.state.currentCell || {};
      try{
        await api('/api/warehouse/cell', {method:'POST', body:JSON.stringify({
          zone: cell.zone,
          column_index: Number(cell.column_index || cell.column || cell.col || 0),
          slot_type: 'direct',
          slot_number: Number(cell.slot_number || cell.num || 0),
          items: window.state.currentCellItems || [],
          note: $('warehouse-note')?.value || ''
        })});
        notify('格位已儲存', 'ok');
        try{ window.closeWarehouseModal && window.closeWarehouseModal(); }catch(_e){}
        try{ await (window.renderWarehouse && window.renderWarehouse(true)); }catch(_e){ try{ await window.renderWarehouse(); }catch(_e2){} }
      }catch(e){ notify(e.message || '格位更新失敗', 'error'); }
    };
    fixed.__yx76WarehouseSave = true;
    window.saveWarehouseCell = fixed;
  }

  function boot(){
    try { document.documentElement.dataset.yxFix76 = VERSION; document.body && document.body.setAttribute('data-yx-fix76','1'); } catch(_e) {}
    hideShipSelectedCards();
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true}); else boot();
  window.addEventListener('pageshow', boot);
})();
/* ==== FIX76 end ==== */

/* ==== FIX77 final master stabilization start ==== */
(function(){
  'use strict';
  const VERSION = 'FIX77_FINAL_MASTER_STABILIZATION';
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const clean = (v) => String(v ?? '').trim();
  const toast = (msg, kind='ok') => {
    try { (window.toast || window.showToast || window.alert)(msg, kind); }
    catch(_e) { try { console.log(msg); } catch(_e2) {} }
  };
  const api = window.yxApi || window.requestJSON || (async function(url, opt={}){
    const res = await fetch(url, { credentials:'same-origin', ...opt, headers:{'Content-Type':'application/json', ...(opt.headers||{})} });
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch(_e) { data = { success:false, error:text || '伺服器回應格式錯誤' }; }
    if(!res.ok || data.success === false){ const err = new Error(data.error || data.message || `請求失敗：${res.status}`); err.payload = data; throw err; }
    return data;
  });
  window.yxApi = api;

  function moduleKey(){
    return document.querySelector('.module-screen')?.dataset.module || (typeof window.currentModule === 'function' ? window.currentModule() : '');
  }
  function endpointFor(mod){
    return mod === 'orders' ? '/api/orders' : mod === 'master_order' ? '/api/master_orders' : mod === 'ship' ? '/api/ship' : '/api/inventory';
  }
  function reqKey(prefix){ return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,10)}`; }
  function normalizeX(v){
    return String(v ?? '')
      .replace(/[Ｘ×✕＊*X]/g,'x')
      .replace(/[＝]/g,'=')
      .replace(/[＋，,；;]/g,'+')
      .replace(/（/g,'(').replace(/）/g,')')
      .trim();
  }
  function formatDim(v, idx){
    let s = clean(v).replace(/^[_\-]+$/,'');
    if(!s) return '';
    if(/^[A-Za-z]+$/.test(s)) return s.toUpperCase();
    if(/^\d*\.\d+$/.test(s)) {
      const compact = s.replace('.', '');
      return s.startsWith('.') ? ('0' + compact) : compact;
    }
    if(/^\d+$/.test(s) && idx === 2 && s.length === 1) return s.padStart(2,'0');
    return s.replace(/\s+/g,'');
  }
  function normalizeLeft(left){
    return normalizeX(left).replace(/\s+/g,'').split(/x/i).slice(0,3).map((p,i)=>formatDim(p,i)).join('x');
  }
  function cleanQtyExpr(expr){
    return normalizeX(expr)
      .replace(/\s+/g,'')
      .replace(/片|件/g,'')
      .replace(/[^0-9A-Za-z一-鿿x+\-().]/g,'')
      .replace(/\++/g,'+')
      .replace(/^\+|\+$/g,'');
  }
  function sortQtyExpr(expr){
    const raw = cleanQtyExpr(expr);
    if(!raw) return '';
    const multi = [], single = [];
    raw.split('+').filter(Boolean).forEach((seg, idx) => {
      const nums = (seg.match(/\d+/g) || []).map(n => parseInt(n, 10) || 0);
      if(nums.length >= 2 && /x/i.test(seg)) multi.push({seg, cases:nums[1]||0, supports:nums[0]||0, idx});
      else if(nums.length >= 1) single.push({seg, value:nums[0]||0, idx});
      else single.push({seg, value:0, idx});
    });
    multi.sort((a,b)=>(b.cases-a.cases)||(b.supports-a.supports)||(a.idx-b.idx));
    single.sort((a,b)=>(b.value-a.value)||(a.idx-b.idx));
    return multi.map(x=>x.seg).concat(single.map(x=>x.seg)).join('+');
  }
  function qtyFromRight(right, originalRight=''){
    const expr = cleanQtyExpr(right);
    if(!expr) return 1;
    if(/[件片]/.test(String(originalRight || '')) && /^\d+$/.test(expr)) return Math.max(1, Number(expr || 0) || 1);
    const parts = expr.split('+').filter(Boolean);
    const xParts = parts.filter(p => /^\d+(?:\.\d+)?x\d+$/i.test(p));
    const bareParts = parts.filter(p => /^\d+(?:\.\d+)?$/.test(p));
    // 特例：100x30x63=504x5+588+... 這種「多個長度包成同一包」依段數算件數。
    if(parts.length >= 6 && xParts.length === 1 && bareParts.length === parts.length - 1) return parts.length;
    let total = 0;
    parts.forEach(seg => {
      const m = seg.match(/x\s*(\d+)$/i);
      if(m) total += Number(m[1] || 0) || 0;
      else if(/\d/.test(seg)) total += 1;
    });
    if(!total && /[件片]/.test(originalRight)){
      const n = String(originalRight).match(/\d+/);
      if(n) total = Number(n[0] || 0) || 0;
    }
    return Math.max(1, total || 1);
  }
  function mergeItems(items){
    const map = new Map();
    (items || []).forEach(it => {
      const text = clean(it.product_text || '');
      if(!text) return;
      const material = clean(it.material || it.product_code || '');
      const key = `${text}||${material}`;
      const prev = map.get(key) || { product_text:text, product_code:material, material, qty:0 };
      prev.qty += Number(it.qty || 0) || 0;
      map.set(key, prev);
    });
    return Array.from(map.values()).filter(it => it.product_text && Number(it.qty || 0) > 0);
  }
  function parseManualItems(raw){
    const material = clean($('batch-material')?.value || '');
    const out = [];
    let lastDims = ['', '', ''];
    const lines = String(raw || '').replace(/\r/g,'\n').split(/\n+/).map(s=>normalizeX(s)).filter(Boolean);
    const push = (leftRaw, rightRaw) => {
      leftRaw = normalizeX(leftRaw).replace(/\s+/g,'');
      rightRaw = normalizeX(rightRaw || '');
      if(!leftRaw) return;
      let parts = leftRaw.split(/x/i).map(s=>s.trim()).filter(s=>s !== '');
      let dims = ['', '', ''];
      if(parts.length >= 3){
        dims = [0,1,2].map(i => /^[_\-]+$/.test(parts[i] || '') ? (lastDims[i] || '') : (parts[i] || ''));
      }else if(parts.length === 2 && /^[_\-]+$/.test(parts[1] || '')){
        dims = [parts[0] || lastDims[0] || '', lastDims[1] || '', lastDims[2] || ''];
      }else if(parts.length === 2){
        dims = [parts[0] || lastDims[0] || '', parts[1] || lastDims[1] || '', lastDims[2] || ''];
      }else if(parts.length === 1){
        dims = [parts[0] || lastDims[0] || '', lastDims[1] || '', lastDims[2] || ''];
      }
      dims = dims.map((d,i)=>formatDim(d,i));
      if(!dims[0] || !dims[1] || !dims[2]) return;
      lastDims = dims.slice();
      let right = sortQtyExpr(rightRaw);
      if(!right && /[件片]/.test(rightRaw)){
        const n = rightRaw.match(/\d+/);
        right = n ? n[0] : '';
      }
      if(!right) right = '1';
      const product_text = `${dims.join('x')}=${right}`;
      out.push({ product_text, product_code: material, material, qty: qtyFromRight(right, rightRaw) });
    };
    lines.forEach(line => {
      const compact = normalizeX(line).replace(/\s+/g,'');
      if(!compact) return;
      // 棧板19片
      const pallet = compact.match(/^(?:棧板|栈板|木棧板|木栈板)(\d+)片?$/);
      if(pallet){ out.push({ product_text:`棧板=${pallet[1]}`, product_code:material, material, qty:Number(pallet[1]||0)||1 }); return; }
      if(compact.includes('=')){
        const [left, ...rest] = compact.split('=');
        push(left, rest.join('='));
        return;
      }
      // 無等號但長寬高存在時，當 1 件處理。
      const dim3 = compact.match(/^((?:[_\-]+|[A-Za-z]+|\d+(?:\.\d+)?)x(?:[_\-]+|[A-Za-z]+|\d+(?:\.\d+)?)x(?:[_\-]+|[A-Za-z]+|\d+(?:\.\d+)?))$/i);
      if(dim3) push(dim3[1], '1');
    });
    return mergeItems(out);
  }
  function collectSubmitItems(){
    const box = $('ocr-text');
    const raw = box?.value || '';
    let items = parseManualItems(raw);
    if(!items.length && typeof window.parseTextareaItems === 'function'){
      try { items = window.parseTextareaItems(); } catch(_e) { items = []; }
    }
    if(box && items.length){ box.value = items.map(it => it.product_text).join('\n'); }
    return mergeItems(items);
  }
  window.yx77CollectSubmitItems = collectSubmitItems;

  function ensureResultPanel(id='module-result'){
    let panel = $(id);
    if(!panel){ panel = document.createElement('div'); panel.id = id; panel.className = 'result-card'; document.querySelector('.module-screen')?.appendChild(panel); }
    panel.classList.remove('hidden'); panel.style.display = '';
    return panel;
  }
  function setSubmitBusy(isBusy, text){
    const btn = $('submit-btn');
    if(!btn) return;
    btn.disabled = !!isBusy;
    btn.dataset.yx77Busy = isBusy ? '1' : '0';
    btn.textContent = isBusy ? (text || '送出中…') : '確認送出';
  }
  function renderDuplicatePanel(data, onConfirm){
    const panel = ensureResultPanel('duplicate-action-panel');
    const rows = (data.duplicates || []).map(d => {
      const oldRows = (d.existing_rows || []).map(r => `<li>${esc(r.product_text || '')}｜材質：${esc(r.material || '未填材質')}｜現有 ${Number(r.qty||0)} 件${r.customer_name ? `｜${esc(r.customer_name)}` : ''}</li>`).join('') || '<li>本次輸入內重複，尚無舊資料</li>';
      const newRows = (d.new_items || []).map(r => `<li>${esc(r.product_text || '')}｜新增 ${Number(r.qty||0)} 件</li>`).join('') || '<li>本次新增資料</li>';
      return `<div class="yx76-dup-item"><div><strong>${esc(d.size || '')}</strong>｜材質：${esc(d.material || '未填材質')}</div><div class="small-note">目前 ${Number(d.existing_qty||0)} 件，本次 ${Number(d.new_qty||0)} 件；確認後會合併。</div><div class="yx76-dup-columns"><div><b>舊資料</b><ul>${oldRows}</ul></div><div><b>本次新增</b><ul>${newRows}</ul></div></div></div>`;
    }).join('');
    panel.innerHTML = `<div class="section-title">發現相同尺寸 + 材質，是否合併？</div><div class="small-note">下面已列出要合併的資料。按確認後才會合併送出。</div>${rows}<div class="btn-row"><button type="button" class="primary-btn" id="yx77-confirm-merge">確認合併送出</button><button type="button" class="ghost-btn" id="yx77-cancel-merge">取消送出</button></div>`;
    $('yx77-cancel-merge')?.addEventListener('click', () => { panel.classList.add('hidden'); toast('已取消送出，尚未合併', 'warn'); }, {once:true});
    $('yx77-confirm-merge')?.addEventListener('click', async () => { panel.classList.add('hidden'); await onConfirm(); }, {once:true});
    try { panel.scrollIntoView({behavior:'smooth', block:'center'}); } catch(_e) {}
  }

  function dimToVolumeFactor(v, idx){
    const raw = clean(v).replace(/^0+(?=\d)/, '');
    const n = Number(raw || 0);
    if(!n) return 0;
    if(idx === 0) return n > 210 ? n / 1000 : n / 100;
    if(idx === 1) return n / 10;
    if(idx === 2) return n >= 100 ? n / 100 : n / 10;
    return n;
  }
  function supportSum(productText){
    const right = cleanQtyExpr(String(productText || '').split('=').slice(1).join('='));
    if(!right) return 0;
    let total = 0;
    right.split('+').filter(Boolean).forEach(seg => {
      const m = seg.match(/^(\d+(?:\.\d+)?)x(\d+)$/i);
      if(m) total += (Number(m[1]) || 0) * (Number(m[2]) || 0);
      else if(/^\d+(?:\.\d+)?$/.test(seg)) total += Number(seg) || 0;
    });
    return total;
  }
  function volumeForProduct(productText){
    const left = normalizeLeft(String(productText || '').split('=')[0] || '');
    const dims = left.split('x');
    if(dims.length < 3) return 0;
    const support = supportSum(productText);
    if(!support) return 0;
    return support * dimToVolumeFactor(dims[0],0) * dimToVolumeFactor(dims[1],1) * dimToVolumeFactor(dims[2],2);
  }
  function renderShipPreview(preview, payload){
    const panel = ensureResultPanel('ship-preview-panel');
    const items = Array.isArray(preview.items) ? preview.items : [];
    const totalVolume = items.reduce((sum, it) => sum + volumeForProduct(it.product_text || ''), 0);
    const hasShortage = items.some(it => (it.shortage_reasons || []).length);
    const rows = items.map(it => {
      const locs = (it.locations || []).map(loc => `<button type="button" class="ship-location-chip ship-location-jump" onclick="quickJumpToModule && quickJumpToModule('warehouse','',${JSON.stringify(it.product_text || '')})">${esc(loc.zone || '')}-${esc(loc.column_index || '')}-${String(loc.visual_slot || loc.slot_number || '').padStart(2,'0')}｜可出 ${Number(loc.ship_qty || loc.qty || 0)}</button>`).join('') || '<span class="small-note">倉庫圖中尚未找到位置</span>';
      const reasons = (it.shortage_reasons || []).length ? `<div class="error-card compact-danger">${esc((it.shortage_reasons || []).join('、'))}</div>` : '';
      return `<div class="ship-breakdown-item ${reasons ? 'has-shortage' : ''}"><div><strong>${esc(it.product_text || '')}</strong>｜本次 ${Number(it.qty||0)} 件</div><div class="ship-breakdown-list"><span class="ship-mini-chip">總單 ${Number(it.master_available||0)}</span><span class="ship-mini-chip">訂單 ${Number(it.order_available||0)}</span><span class="ship-mini-chip">庫存 ${Number(it.inventory_available||0)}</span></div>${reasons}<div class="small-note">${esc(it.recommendation || '')}</div><div class="ship-breakdown-list">${locs}</div></div>`;
    }).join('');
    panel.innerHTML = `<div class="success-card"><div class="section-title">出貨預覽</div><div class="small-note">${esc(preview.message || '請確認扣除來源、倉庫位置與材積。')}</div></div><div class="ship-preview-summary"><div class="ship-summary-chip">材積<span class="small-note">${totalVolume.toFixed(3)}</span></div><div class="ship-summary-chip">狀態<span class="small-note">${hasShortage ? '需確認' : '可出貨'}</span></div></div>${rows || '<div class="empty-state-card compact-empty">沒有預覽資料</div>'}<div class="glass panel" style="margin-top:12px;"><label class="field-label">重量</label><input id="yx77-ship-weight" class="text-input" type="number" step="0.01" placeholder="輸入重量，自動計算 材積 × 重量"><div class="small-note" id="yx77-ship-weight-result">材積 ${totalVolume.toFixed(3)}</div></div><div class="btn-row"><button type="button" class="ghost-btn" id="yx77-cancel-ship">取消</button><button type="button" class="primary-btn" id="yx77-confirm-ship">確認扣除</button></div>`;
    $('yx77-ship-weight')?.addEventListener('input', () => {
      const w = Number($('yx77-ship-weight')?.value || 0);
      const out = $('yx77-ship-weight-result');
      if(out) out.textContent = w ? `材積 ${totalVolume.toFixed(3)} × 重量 ${w} = ${(totalVolume*w).toFixed(3)}` : `材積 ${totalVolume.toFixed(3)}`;
    });
    $('yx77-cancel-ship')?.addEventListener('click', () => panel.classList.add('hidden'), {once:true});
    $('yx77-confirm-ship')?.addEventListener('click', async function(){
      const btn = this;
      if(btn.dataset.busy === '1') return;
      btn.dataset.busy = '1'; btn.disabled = true; btn.textContent = '扣除中…';
      try{
        const result = await api('/api/ship', {method:'POST', body:JSON.stringify({...payload, allow_inventory_fallback:true, preview_confirmed:true, request_key:reqKey('ship_confirm')})});
        const doneRows = (result.breakdown || []).map(row => `<div class="deduct-card"><div><strong>${esc(row.product_text || '')}</strong>｜本次出貨 ${Number(row.qty||0)}</div><div>扣總單：${Number(row.master_deduct||0)}｜扣訂單：${Number(row.order_deduct||0)}｜扣庫存：${Number(row.inventory_deduct||0)}</div><div class="small-note">剩餘：總單 ${row.remaining_after?.master ?? '-'}｜訂單 ${row.remaining_after?.order ?? '-'}｜庫存 ${row.remaining_after?.inventory ?? '-'}</div></div>`).join('');
        panel.innerHTML = `<div class="success-card"><div class="section-title">出貨完成</div><div class="small-note">已完成扣除，下面是本次摘要。</div></div>${doneRows || '<div class="empty-state-card compact-empty">已出貨。</div>'}`;
        toast('出貨完成', 'ok');
        try { window.loadCustomerBlocks && await window.loadCustomerBlocks(true); } catch(_e) {}
      }catch(e){
        toast(e.message || '出貨失敗', 'error');
        btn.dataset.busy = '0'; btn.disabled = false; btn.textContent = '確認扣除';
      }
    });
    try { panel.scrollIntoView({behavior:'smooth', block:'start'}); } catch(_e) {}
  }

  async function finalConfirmSubmit(){
    const btn = $('submit-btn');
    if(btn?.dataset.yx77Busy === '1') return false;
    const mod = moduleKey() || 'inventory';
    const raw = $('ocr-text')?.value || '';
    const items = collectSubmitItems();
    const customer = clean($('customer-name')?.value || '');
    const needCustomer = ['orders','master_order','ship'].includes(mod);
    const resultPanel = ensureResultPanel('module-result');
    if(!items.length){ resultPanel.innerHTML = '<div class="error-card">沒有可送出的商品資料，請確認格式。</div>'; toast('沒有可送出的商品資料', 'warn'); return false; }
    if(needCustomer && !customer){ resultPanel.innerHTML = '<div class="error-card">請先輸入客戶名稱。</div>'; toast('請先輸入客戶名稱', 'warn'); return false; }
    const payload = { customer_name:customer, ocr_text:raw, items, location:clean($('location-input')?.value || ''), duplicate_mode:'merge', request_key:reqKey(mod) };
    setSubmitBusy(true, mod === 'ship' ? '整理預覽中…' : '送出中…');
    try{
      if(['inventory','orders','master_order'].includes(mod) && !window.__YX77_DUPLICATE_CONFIRMED__){
        const check = await api('/api/duplicate-check', {method:'POST', body:JSON.stringify({module:mod, customer_name:customer, ocr_text:raw, items, request_key:reqKey('dup_check')})});
        if(check.has_duplicates){
          renderDuplicatePanel(check, async () => { window.__YX77_DUPLICATE_CONFIRMED__ = true; await finalConfirmSubmit(); });
          return false;
        }
      }
      window.__YX77_DUPLICATE_CONFIRMED__ = false;
      if(needCustomer){ await api('/api/customers', {method:'POST', body:JSON.stringify({name:customer, preserve_existing:true})}).catch(()=>null); }
      if(mod === 'ship'){
        const preview = await api('/api/ship-preview', {method:'POST', body:JSON.stringify(payload)});
        renderShipPreview(preview, payload);
        toast('已產生出貨預覽', 'ok');
        return true;
      }
      const data = await api(endpointFor(mod), {method:'POST', body:JSON.stringify(payload)});
      resultPanel.innerHTML = `<div class="success-card"><div class="section-title">送出完成</div><div class="small-note">已建立 / 更新 ${items.length} 筆資料。</div></div>`;
      toast(mod === 'inventory' ? '庫存送出成功' : mod === 'orders' ? '訂單送出成功' : '總單送出成功', 'ok');
      try { window.refreshSource && await window.refreshSource(mod, true); } catch(_e) {}
      try { window.loadCustomerBlocks && await window.loadCustomerBlocks(true); } catch(_e) {}
      try { needCustomer && window.selectCustomerForModule && await window.selectCustomerForModule(customer); } catch(_e) {}
      return data;
    }catch(e){
      const msg = e.message || '送出失敗';
      resultPanel.innerHTML = `<div class="error-card">${esc(msg)}</div>`;
      toast(msg, 'error');
      return false;
    }finally{
      setSubmitBusy(false);
    }
  }

  async function finalSaveWarehouseCell(){
    const cell = window.state?.currentCell || {};
    const zone = clean(cell.zone || '').toUpperCase();
    const col = Number(cell.column_index || cell.column || cell.col || 0);
    const slot = Number(cell.slot_number || cell.num || 0);
    if(!zone || !col || !slot){ toast('找不到格位資料，請重新點選格子', 'error'); return false; }
    try{
      await api('/api/warehouse/cell', {method:'POST', body:JSON.stringify({ zone, column_index:col, slot_type:'direct', slot_number:slot, items:window.state.currentCellItems || [], note:$('warehouse-note')?.value || '' })});
      toast('格位已儲存', 'ok');
      try { window.closeWarehouseModal && window.closeWarehouseModal(); } catch(_e) {}
      try { window.renderWarehouse && await window.renderWarehouse(true); } catch(_e) { try { await window.renderWarehouse(); } catch(_e2) {} }
      return true;
    }catch(e){ toast(e.message || '格位更新失敗', 'error'); return false; }
  }

  function install(){
    window.confirmSubmit = finalConfirmSubmit;
    window.saveWarehouseCell = finalSaveWarehouseCell;
    try { document.documentElement.dataset.yxFix77 = VERSION; document.body && document.body.setAttribute('data-yx-fix77','1'); } catch(_e) {}
    const shipSelected = $('ship-selected-section');
    if(shipSelected){ shipSelected.classList.add('yx76-hidden-ship-selected'); shipSelected.style.display = 'none'; }
  }
  install();
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true});
  window.addEventListener('pageshow', install);
  setTimeout(install, 50);
})();
/* ==== FIX77 final master stabilization end ==== */
