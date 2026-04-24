/* ==== app.js merged by FIX49 ==== */


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
          <div class="small-note">20 格</div>
        </div>
        <div class="btn-row compact warehouse-col-tools">
          <button class="ghost-btn small-btn warehouse-mini-btn" title="增加格子" onclick="addWarehouseVisualSlot('${zone}', ${c})">＋</button>
          <button class="ghost-btn small-btn warehouse-mini-btn" title="減少格子" onclick="removeWarehouseVisualSlot('${zone}', ${c})">－</button>
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
    await requestJSON('/api/warehouse/cell', {
      method: 'POST',
      body: JSON.stringify({
        ...state.currentCell,
        items: state.currentCellItems,
        note
      })
    });
    toast('格位已儲存', 'ok');
    closeWarehouseModal();
    await renderWarehouse();
    await loadInventory();
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
    toast('固定 20 格版本，暫不再增加', 'warn');
  };
  window.removeWarehouseVisualSlot = async function(zone, column){
    toast('固定 20 格版本，暫不再減少', 'warn');
  };
  window.deleteWarehouseColumn = async function(zone, column){
    toast('已取消整欄刪除功能', 'warn');
  };

  document.addEventListener('DOMContentLoaded', () => {
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

/* ==== FIX52 formal clean final override ==== */
(function(){
  'use strict';
  const VERSION='fix56-send-login-batch-customer-delete';
  const $=id=>document.getElementById(id);
  const clean=v=>String(v??'').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const mod=()=>document.querySelector('[data-module]')?.dataset.module || (location.pathname.includes('master')?'master_order':location.pathname.includes('orders')?'orders':location.pathname.includes('inventory')?'inventory':location.pathname.includes('ship')?'ship':location.pathname.includes('customers')?'customers':'');
  const api=async(url,opt={})=>{const res=await fetch(url,{credentials:'same-origin',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});let data={};try{data=await res.json();}catch(_){} if(!res.ok||data.success===false)throw new Error(data.error||data.message||`請求失敗 ${res.status}`);return data;};
  const toast=(msg,type='ok')=>{ if(window.toast) return window.toast(msg,type); alert(msg); };
  function normText(s){return String(s||'').replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/[＋，,；;]/g,'+').replace(/\s+/g,'').trim();}
  function looksLikeProduct(v, product=''){
    const s=normText(v), p=normText(product); if(!s) return false; if(p&&s===p) return true; if(s.includes('=')) return true;
    return /^\d+(?:\.\d+)?x\d+(?:\.\d+)?(?:x\d+(?:\.\d+)?)?$/i.test(s) || /^\d+(?:\.\d+)?(?:\+\d+(?:\.\d+)?)+$/.test(s);
  }
  function materialOf(row){const v=clean(row?.material || row?.product_code || ''); return looksLikeProduct(v,row?.product_text||'')?'':v;}
  function splitProduct(txt){const raw=normText(txt); const i=raw.indexOf('='); return {size:i>=0?raw.slice(0,i):raw, support:i>=0?raw.slice(i+1):''};}
  function qtyCount(rowOrText, fallback=0){const txt=typeof rowOrText==='string'?rowOrText:(rowOrText?.product_text||''); const fb=typeof rowOrText==='object'?Number(rowOrText?.qty||fallback||0):Number(fallback||0); const raw=normText(txt); if(!raw.includes('=')) return fb; let total=0, parsed=false; raw.split('=').slice(1).join('=').split('+').forEach(seg=>{seg=seg.trim(); if(!seg)return; if(/[件片]/.test(seg)){const n=(seg.match(/\d+/g)||[]).map(Number); if(n.length){total+=n[n.length-1]; parsed=true;} return;} const m=seg.match(/x\s*(\d+)/i); if(m){total+=Number(m[1]); parsed=true;} else if(/\d+/.test(seg)){total+=1; parsed=true;} }); return parsed?total:fb;}
  function supportOf(row){const s=splitProduct(row?.product_text||'').support; return s || clean(row?.qty||'');}
  function sizeOf(row){return splitProduct(row?.product_text||'').size;}
  function sortedRows(rows){return [...(rows||[])].sort((a,b)=>String(sizeOf(a)).localeCompare(String(sizeOf(b))));}
  function parseCustomerName(name){let s=clean(name); let type=''; const m=s.match(/(?:\s|^)(CNF|FOB代|FOB本|FOB自|FOB)\s*$/i) || s.match(/(?:\s|^)(CNF|FOB代|FOB本|FOB自|FOB)(?:\s|$)/i); if(m){type=m[1].toUpperCase(); s=s.replace(m[0],' ').replace(/\s+/g,' ').trim();} return {base:s||clean(name),type};}
  function customerCache(){try{return JSON.parse(localStorage.getItem('yxCustomersFix52')||'[]')}catch(_){return []}}
  function setCustomerCache(items){try{localStorage.setItem('yxCustomersFix52',JSON.stringify(items||[]));}catch(_){}}
  function cardCounts(c){const count=Number(c.item_count ?? c.relation_counts?.active_qty_total ?? 0); const rows=Number(c.row_count ?? c.relation_counts?.active_rows ?? 0); return `${count}件 / ${rows}筆`;}
  function customerCardHTML(c){const n=parseCustomerName(c.name||''); return `<span class="yx-customer-left">${esc(n.base)}</span><span class="yx-customer-mid">${esc(n.type)}</span><span class="yx-customer-right">${esc(cardCounts(c))}</span>`;}
  function boardTargets(){return [
    {'北區':'customers-north','中區':'customers-center','南區':'customers-south'},
    {'北區':'region-north','中區':'region-center','南區':'region-south'}
  ];}
  function renderCustomerBoards(items){const q=clean($('customer-search')?.value||'').toLowerCase(); let arr=(items||[]).filter(c=>Number(c?.is_archived||0)!==1); if(q)arr=arr.filter(c=>`${c.name||''} ${c.region||''}`.toLowerCase().includes(q)); boardTargets().forEach(map=>{if(!Object.values(map).some(id=>$(id)))return; Object.values(map).forEach(id=>{const el=$(id); if(el)el.innerHTML='';}); arr.forEach(c=>{const region=['北區','中區','南區'].includes(c.region)?c.region:'北區'; const host=$(map[region])||$(map['北區']); if(!host)return; const btn=document.createElement('button'); btn.type='button'; btn.className='customer-region-card yx-customer-card'; btn.draggable=true; btn.dataset.customer=clean(c.name||''); btn.dataset.customerUid=clean(c.customer_uid||''); btn.dataset.region=region; btn.innerHTML=customerCardHTML(c); btn.addEventListener('dragstart',ev=>{ev.dataTransfer.effectAllowed='move'; ev.dataTransfer.setData('text/plain',btn.dataset.customer); ev.dataTransfer.setData('application/x-yx-customer',btn.dataset.customer); ev.dataTransfer.setData('application/x-yx-customer-uid',btn.dataset.customerUid); btn.classList.add('dragging');}); btn.addEventListener('dragend',()=>btn.classList.remove('dragging')); btn.addEventListener('click',ev=>{ev.preventDefault(); ev.stopPropagation(); if(mod()==='customers') window.fillCustomerForm(c); else window.selectCustomerForModule(c);}); host.appendChild(btn);}); Object.values(map).forEach(id=>{const el=$(id); if(el&&!el.children.length)el.innerHTML='<div class="empty-state-card compact-empty">目前沒有客戶</div>';});}); bindDropZones();}
  function bindDropZones(){document.querySelectorAll('.category-box[data-region]').forEach(box=>{if(box.dataset.fix52Drop)return; box.dataset.fix52Drop='1'; box.addEventListener('dragover',ev=>{ev.preventDefault();box.classList.add('drag-over');}); box.addEventListener('dragleave',()=>box.classList.remove('drag-over')); box.addEventListener('drop',ev=>{ev.preventDefault();box.classList.remove('drag-over'); const name=ev.dataTransfer.getData('application/x-yx-customer')||ev.dataTransfer.getData('text/plain'); const uid=ev.dataTransfer.getData('application/x-yx-customer-uid')||''; moveCustomerRegion(name,box.dataset.region,uid);});});}
  async function moveCustomerRegion(name,region,uid=''){name=clean(name); if(!name)return; const cache=customerCache(); const next=cache.map(c=>clean(c.name)===name||clean(c.customer_uid)===uid?{...c,region}:c); setCustomerCache(next); renderCustomerBoards(next); if(clean($('cust-name')?.value||'')===name && $('cust-region')) $('cust-region').value=region; try{const data=await api('/api/customers/move',{method:'POST',body:JSON.stringify({name,customer_uid:uid,region})}); const items=data.items||next; setCustomerCache(items); renderCustomerBoards(items); toast('客戶區域已更新','ok');}catch(e){toast(e.message||'移動失敗','error'); window.loadCustomerBlocks();}}
  window.loadCustomerBlocks=async function(){const cached=customerCache(); if(cached.length)renderCustomerBoards(cached); else bindDropZones(); try{const data=await api('/api/customers?ts='+Date.now()); const items=data.items||[]; setCustomerCache(items); window.state=window.state||{}; window.state.customerDirectory=items; renderCustomerBoards(items); return items;}catch(e){toast(e.message||'客戶載入失敗','error'); return cached;}};
  function applyCustomerToForm(c){ if(!c)return; $('cust-name')&&( $('cust-name').value=c.name||'', $('cust-name').dataset.originalName=c.name||'' ); $('cust-phone')&&($('cust-phone').value=c.phone||''); $('cust-address')&&($('cust-address').value=c.address||''); $('cust-notes')&&($('cust-notes').value=c.notes||''); $('cust-region')&&($('cust-region').value=c.region||'北區'); const cm=$('cust-common-materials'), cs=$('cust-common-sizes'); if(cm){cm.textContent=c.common_materials||''; cm.dataset.empty=c.common_materials?'0':'1';} if(cs){cs.textContent=c.common_sizes||''; cs.dataset.empty=c.common_sizes?'0':'1';} window.state=window.state||{}; window.state.currentCustomer=c.name||''; window.state.currentCustomerUid=c.customer_uid||''; }
  window.fillCustomerForm=async function(customer){const name=typeof customer==='object'?clean(customer.name):clean(customer); const uid=typeof customer==='object'?clean(customer.customer_uid):''; const cached=(typeof customer==='object'?customer:customerCache().find(c=>clean(c.name)===name||clean(c.customer_uid)===uid))||{name,customer_uid:uid,region:'北區'}; applyCustomerToForm(cached); renderLeftCustomerItems(cached.name,cached.customer_uid); try{const data=await api(`/api/customers/${encodeURIComponent(cached.name)}?customer_uid=${encodeURIComponent(cached.customer_uid||'')}&ts=${Date.now()}`); applyCustomerToForm({...cached,...(data.item||{})}); renderLeftCustomerItems((data.item||cached).name,(data.item||cached).customer_uid);}catch(_){}};
  window.openCustomerModal=function(customer){return window.fillCustomerForm(customer);}; window.closeCustomerModal=function(){};
  async function renderLeftCustomerItems(name,uid=''){const host=$('fix52-left-customer-items') || (()=>{const h=document.createElement('div');h.id='fix52-left-customer-items';h.className='fix52-left-customer-items';document.querySelector('.customer-detail')?.appendChild(h);return h;})(); if(!host||!name)return; host.innerHTML='<div class="muted">商品載入中…</div>'; try{const data=await api(`/api/customer-items?name=${encodeURIComponent(name)}&customer_uid=${encodeURIComponent(uid||'')}&ts=${Date.now()}`); const arr=data.items||[]; const total=arr.reduce((s,r)=>s+qtyCount(r),0); host.innerHTML=`<div class="fix52-left-title">${esc(name)} 商品：${total}件 / ${arr.length}筆</div>`+(arr.length?`<div class="fix52-left-table-wrap"><table class="fix52-summary-table"><thead><tr><th>材質</th><th>尺寸</th><th>支數 x 件數</th><th>數量</th><th>來源</th></tr></thead><tbody>${arr.map(r=>`<tr><td>${esc(materialOf(r))}</td><td>${esc(sizeOf(r))}</td><td>${esc(supportOf(r))}</td><td>${qtyCount(r)}</td><td>${esc(r.source||'')}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty-state-card compact-empty">此客戶目前沒有商品</div>');}catch(e){host.innerHTML=`<div class="error-card">${esc(e.message||'商品載入失敗')}</div>`;}}
  window.saveCustomer=async function(){const btn=document.querySelector('button[onclick="saveCustomer()"]'); const original=clean($('cust-name')?.dataset.originalName||window.state?.currentCustomer||''); const name=clean($('cust-name')?.value||''); if(!name)return toast('請輸入客戶名稱','warn'); const read=id=>clean($(id)?.textContent||''); const payload={name,customer_uid:clean(window.state?.currentCustomerUid||''),phone:clean($('cust-phone')?.value||''),address:clean($('cust-address')?.value||''),notes:clean($('cust-notes')?.value||''),common_materials:read('cust-common-materials'),common_sizes:read('cust-common-sizes'),region:clean($('cust-region')?.value||'北區'),preserve_existing:false}; const cache=customerCache(); const idx=cache.findIndex(c=>clean(c.name)===original||clean(c.name)===name||clean(c.customer_uid)===payload.customer_uid); const optimistic={...(idx>=0?cache[idx]:{}),...payload}; if(idx>=0)cache[idx]=optimistic; else cache.unshift(optimistic); setCustomerCache(cache); applyCustomerToForm(optimistic); renderCustomerBoards(cache); try{if(btn){btn.disabled=true;btn.textContent='儲存中…';} if(original&&original!==name) await api(`/api/customers/${encodeURIComponent(original)}`,{method:'PUT',body:JSON.stringify({new_name:name,customer_uid:payload.customer_uid})}); const res=await api('/api/customers',{method:'POST',body:JSON.stringify(payload)}); const fresh=res.items||cache; setCustomerCache(fresh); renderCustomerBoards(fresh); applyCustomerToForm(res.item||optimistic); toast('客戶儲存成功','ok');}catch(e){toast(e.message||'客戶儲存失敗','error');}finally{if(btn){btn.disabled=false;btn.textContent='儲存客戶';}}};
  window.selectCustomerForModule=function(customer){const c=typeof customer==='object'?customer:{name:clean(customer)}; const input=$('customer-name'); if(input){input.value=c.name||''; input.dispatchEvent(new Event('input',{bubbles:true}));} const panel=$('selected-customer-items'); if(panel){panel.classList.remove('hidden'); panel.innerHTML='<div class="muted">商品載入中…</div>'; api(`/api/customer-items?name=${encodeURIComponent(c.name||'')}&customer_uid=${encodeURIComponent(c.customer_uid||'')}&ts=${Date.now()}`).then(data=>{const arr=data.items||[]; const total=arr.reduce((s,r)=>s+qtyCount(r),0); panel.innerHTML=`<div class="section-head"><h3>${esc(c.name||'')} 商品</h3><span class="muted">${total}件 / ${arr.length}筆商品</span></div><div class="table-card"><table class="fix52-summary-table"><thead><tr><th>材質</th><th>尺寸</th><th>支數 x 件數</th><th>數量</th><th>來源</th></tr></thead><tbody>${arr.map(r=>`<tr><td>${esc(materialOf(r))}</td><td>${esc(sizeOf(r))}</td><td>${esc(supportOf(r))}</td><td>${qtyCount(r)}</td><td>${esc(r.source||'')}</td></tr>`).join('')||'<tr><td colspan="5">目前沒有商品</td></tr>'}</tbody></table></div>`;}).catch(e=>{panel.innerHTML=`<div class="error-card">${esc(e.message||'商品載入失敗')}</div>`;});}}
  function renderItemCard(row,source){const isMaster=source==='master_order'; return `<div class="card inventory-action-card fix52-item-card" data-id="${Number(row.id||0)}"><div class="fix52-item-layout"><div><span class="fix52-item-label">材質</span><b>${esc(materialOf(row))}</b></div><div><span class="fix52-item-label">尺寸</span><b>${esc(sizeOf(row))}</b></div><div><span class="fix52-item-label">支數 x 件數</span><b>${esc(supportOf(row))}</b></div><div><span class="fix52-item-label">數量</span><b>${qtyCount(row)}</b></div>${row.customer_name?`<div class="fix52-item-source">客戶：${esc(row.customer_name)}</div>`:''}</div>${isMaster?'':'<div class="fix52-card-actions"><button class="ghost-btn tiny-btn" data-act="edit">編輯</button><button class="ghost-btn tiny-btn" data-act="ship">直接出貨</button><button class="ghost-btn tiny-btn danger-btn" data-act="delete">刪除</button></div>'}</div>`;}
  function ensureToolbar(source){const target=source==='inventory'?'inventory-inline-panel':source==='orders'?'orders-list-section':'master-list-section'; const panel=$(target); if(!panel||$(`fix52-${source}-search`))return; const html=`<div class="fix52-list-toolbar"><input id="fix52-${source}-search" class="text-input" placeholder="搜尋商品 / 客戶 / 材質"><button id="fix52-${source}-refresh" class="ghost-btn small-btn" type="button">重新整理</button></div>`; panel.querySelector('.section-head')?.insertAdjacentHTML('afterend',html); $(`fix52-${source}-search`).addEventListener('input',()=>{ if(source==='inventory') renderInventoryRows(window.__yxInventoryRows||[]); if(source==='orders') renderRows($('orders-list'),window.__yxOrderRows||[],'orders'); if(source==='master_order') renderRows($('master-list'),window.__yxMasterRows||[],'master_order');}); $(`fix52-${source}-refresh`).addEventListener('click',()=>{ if(source==='inventory') window.loadInventory(); if(source==='orders') window.loadOrdersList(); if(source==='master_order') window.loadMasterList();});}
  function renderRows(box,rows,source){if(!box)return; const kw=clean($(`fix52-${source}-search`)?.value||'').toLowerCase(); const list=sortedRows((rows||[]).filter(r=>!kw||`${r.product_text||''} ${r.customer_name||''} ${materialOf(r)} ${r.location||''}`.toLowerCase().includes(kw))); box.innerHTML=list.length?list.map(r=>renderItemCard(r,source)).join(''):'<div class="empty-state-card compact-empty">目前沒有資料</div>';}
  function renderInventorySummary(rows){const list=$('inventory-inline-list'); if(!list)return; let panel=$('fix52-inventory-summary'); if(!panel){panel=document.createElement('div'); panel.id='fix52-inventory-summary'; panel.className='fix52-summary-panel table-card'; list.insertAdjacentElement('beforebegin',panel);} document.querySelectorAll('#fix47-inventory-summary,#fix48-inventory-summary,#fix49-inventory-summary,#fix51-inventory-summary').forEach(x=>x.remove()); const expanded=localStorage.getItem('yxInventorySummaryExpanded')==='1'; const sorted=sortedRows(rows||[]); const kw=clean($('fix52-inventory-summary-search')?.value||'').toLowerCase(); const filtered=kw?sorted.filter(r=>`${r.product_text||''} ${r.customer_name||''} ${materialOf(r)} ${r.location||''}`.toLowerCase().includes(kw)):sorted; const shown=expanded?filtered:filtered.slice(0,250); const total=filtered.reduce((s,r)=>s+qtyCount(r),0); panel.innerHTML=`<div class="fix52-summary-title"><span>${total}件 / ${filtered.length}筆商品</span><span>庫存統整</span></div><div class="fix52-list-toolbar"><input id="fix52-inventory-summary-search" class="text-input" placeholder="搜尋統整表" value="${esc(kw)}"><button id="fix52-inventory-summary-toggle" class="ghost-btn small-btn" type="button">${expanded?'收合':'顯示全部'}</button></div><table class="fix52-summary-table"><thead><tr><th>材質</th><th>尺寸</th><th>支數 x 件數</th><th>數量</th><th>來源</th></tr></thead><tbody>${shown.map(r=>`<tr><td>${esc(materialOf(r))}</td><td>${esc(sizeOf(r))}</td><td>${esc(supportOf(r))}</td><td>${qtyCount(r)}</td><td>${esc(r.source||r.source_text||'庫存')}</td></tr>`).join('')||'<tr><td colspan="5">目前沒有庫存資料</td></tr>'}</tbody></table>${!expanded&&filtered.length>250?`<div class="muted">已顯示前 250 筆，共 ${filtered.length} 筆；可按「顯示全部」或搜尋縮小。</div>`:''}`; $('fix52-inventory-summary-search')?.addEventListener('input',()=>renderInventorySummary(rows)); $('fix52-inventory-summary-toggle')?.addEventListener('click',()=>{localStorage.setItem('yxInventorySummaryExpanded',expanded?'0':'1'); renderInventorySummary(rows);});}
  function renderInventoryRows(rows){renderInventorySummary(rows); renderRows($('inventory-inline-list'),rows,'inventory');}
  window.loadInventory=async function(){ensureToolbar('inventory'); const box=$('inventory-inline-list'); if(box)box.innerHTML='<div class="empty-state-card compact-empty">載入中…</div>'; try{const data=await api('/api/inventory?ts='+Date.now()); window.__yxInventoryRows=data.items||[]; renderInventoryRows(window.__yxInventoryRows);}catch(e){if(box)box.innerHTML=`<div class="error-card">${esc(e.message||'庫存載入失敗')}</div>`;}};
  window.loadOrdersList=async function(){ensureToolbar('orders'); const box=$('orders-list'); if(box)box.innerHTML='<div class="empty-state-card compact-empty">載入中…</div>'; try{const data=await api('/api/orders?ts='+Date.now()); window.__yxOrderRows=data.items||[]; renderRows(box,window.__yxOrderRows,'orders');}catch(e){if(box)box.innerHTML=`<div class="error-card">${esc(e.message||'訂單載入失敗')}</div>`;}};
  window.loadMasterList=async function(){ensureToolbar('master_order'); const box=$('master-list'); if(box)box.innerHTML='<div class="empty-state-card compact-empty">載入中…</div>'; try{const data=await api('/api/master_orders?ts='+Date.now()); window.__yxMasterRows=data.items||[]; renderRows(box,window.__yxMasterRows,'master_order');}catch(e){if(box)box.innerHTML=`<div class="error-card">${esc(e.message||'總單載入失敗')}</div>`;}};
  function removeBadHints(){document.querySelectorAll('.muted, .small-note, span, div').forEach(el=>{const t=clean(el.textContent); if(t.includes('UID 強化') || t===(['訂單','總單','庫存','出貨'].join('')) || t===(['庫存','訂單','總單','出貨'].join(' / ')))el.remove();});}
  function boot(){document.documentElement.dataset.yxFix52=VERSION; document.querySelectorAll('#cust-common-materials,#cust-common-sizes').forEach(el=>{el.contentEditable='true'; if(el.textContent==='尚未建立')el.textContent='';}); removeBadHints(); const m=mod(); if(['customers','orders','master_order','ship'].includes(m)) window.loadCustomerBlocks(); if(m==='inventory') window.loadInventory(); if(m==='orders') window.loadOrdersList(); if(m==='master_order') window.loadMasterList(); $('customer-search')?.addEventListener('input',()=>renderCustomerBoards(window.state?.customerDirectory||customerCache()));}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot); else setTimeout(boot,0);
})();


/* ==== FIX53 production clean guard: customer modal removed + final UI consistency ==== */
(function(){
  const VERSION = 'fix56-send-login-batch-customer-delete';
  const $ = window.$ || (id => document.getElementById(id));
  const clean = v => String(v ?? '').trim();
  const esc = window.escapeHTML || (s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));
  window.__YX_FIX_VERSION__ = VERSION;

  function removeLegacyCustomerModal(){
    document.querySelectorAll('[id*="customer-modal"], .customer-modal, .customer-detail-modal, .yx-retired-customer-modal-retired').forEach(el => {
      el.remove();
    });
  }

  function stripBadHints(){
    document.querySelectorAll('.muted,.small-note,span,div,p').forEach(el => {
      const t = clean(el.textContent);
      if (t.includes('UID 強化') || t === ['訂單','總單','庫存','出貨'].join('') || t === ['庫存','訂單','總單','出貨'].join(' / ')) el.remove();
    });
  }

  function normalizeCustomerArg(customer){
    if (customer && typeof customer === 'object') return customer;
    const name = clean(customer);
    const cached = (window.state?.customerDirectory || JSON.parse(localStorage.getItem('yxCustomersCache') || '[]') || [])
      .find(c => clean(c.name) === name || clean(c.customer_uid) === name);
    return cached || {name};
  }

  // This is the only allowed customer-click behavior after FIX53.
  window.openCustomerModal = function(customer){
    removeLegacyCustomerModal();
    const c = normalizeCustomerArg(customer);
    if (typeof window.fillCustomerForm === 'function') return window.fillCustomerForm(c);
    return null;
  };
  window.closeCustomerModal = function(){ removeLegacyCustomerModal(); };

  // Stable wrappers: immediate visual update, then background reload if available.
  const originalSaveCustomer = window.saveCustomer;
  if (typeof originalSaveCustomer === 'function') {
    window.saveCustomer = async function(){
      const btn = document.querySelector('button[onclick="saveCustomer()"], #save-customer-btn, [data-action="save-customer"]');
      const oldText = btn?.textContent;
      try{
        if (btn) { btn.disabled = true; btn.textContent = '儲存中…'; }
        const result = await originalSaveCustomer.apply(this, arguments);
        if (typeof window.loadCustomerBlocks === 'function') window.loadCustomerBlocks();
        return result;
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = oldText || '儲存客戶'; }
      }
    };
  }

  function bootFix53(){
    document.documentElement.dataset.yxFix53 = VERSION;
    removeLegacyCustomerModal();
    stripBadHints();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootFix53);
  else bootFix53();
  new MutationObserver(() => {
    clearTimeout(window.__yxFix53CleanTimer);
    window.__yxFix53CleanTimer = setTimeout(bootFix53, 80);
  }).observe(document.documentElement, {childList:true, subtree:true});
})();

/* ==== FIX54 shipping customer dropdown + card alignment cleanup ==== */
(function(){
  'use strict';
  const VERSION = 'fix56-send-login-batch-customer-delete';
  const $ = id => document.getElementById(id);
  const clean = v => String(v ?? '').trim();
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const mod = () => document.querySelector('[data-module]')?.dataset.module || (location.pathname.includes('ship') ? 'ship' : location.pathname.includes('master') ? 'master_order' : location.pathname.includes('orders') ? 'orders' : location.pathname.includes('customers') ? 'customers' : '');
  const api = async (url, opt={}) => {
    const res = await fetch(url, {credentials:'same-origin', ...opt, headers:{'Content-Type':'application/json', ...(opt.headers||{})}});
    let data = {};
    try { data = await res.json(); } catch(_e) {}
    if (!res.ok || data.success === false) throw new Error(data.error || data.message || `請求失敗 ${res.status}`);
    return data;
  };
  const toast = (msg, type='ok') => { if (window.toast) window.toast(msg, type); else console.log(type, msg); };

  function parseCustomerName(name){
    let s = clean(name);
    let type = '';
    const m = s.match(/(?:\s|^)(CNF|FOB代|FOB本|FOB自|FOB)\s*$/i) || s.match(/(?:\s|^)(CNF|FOB代|FOB本|FOB自|FOB)(?:\s|$)/i);
    if (m) {
      type = m[1].toUpperCase();
      s = s.replace(m[0], ' ').replace(/\s+/g, ' ').trim();
    }
    return {base: s || clean(name), type};
  }

  function fixCustomerCardLayout(){
    document.querySelectorAll('.yx-customer-card, .customer-region-card').forEach(card => {
      if (card.dataset.fix54Aligned === '1') return;
      const leftEl = card.querySelector('.yx-customer-left, .customer-card-name');
      const midEl = card.querySelector('.yx-customer-mid');
      const rightEl = card.querySelector('.yx-customer-right, .customer-card-meta');
      let fullName = clean(card.dataset.customer || leftEl?.textContent || '');
      let type = clean(midEl?.textContent || '');
      let right = clean(rightEl?.textContent || '');
      const parsed = parseCustomerName(fullName);
      if (!type) type = parsed.type;
      if (leftEl) leftEl.textContent = parsed.base;
      if (midEl) midEl.remove();
      if (rightEl) {
        rightEl.classList.add('yx-customer-right-combined');
        rightEl.innerHTML = `${type ? `<span class="yx-customer-trade-inline">${esc(type)}</span><span class="yx-customer-gap">&nbsp;&nbsp;&nbsp;</span>` : ''}<span>${esc(right)}</span>`;
      }
      card.classList.add('yx-fix54-card-aligned');
      card.dataset.fix54Aligned = '1';
    });
  }

  function hideSelectedCustomerTable(){
    const panel = $('selected-customer-items');
    if (panel) {
      panel.classList.add('hidden', 'yx-fix54-hidden-selected-panel');
      panel.innerHTML = '';
      panel.style.display = 'none';
    }
  }

  function normalizeProductText(text){
    return clean(text).replace(/[Ｘ×✕＊*X]/g, 'x').replace(/[＝]/g, '=').replace(/[＋，,；;]/g, '+');
  }

  function productLabel(item){
    const material = clean(item.material || item.product_code || '');
    const product = normalizeProductText(item.product_text || '');
    const source = clean(item.source || '');
    const qty = Number(item.qty || 0) || '';
    return `${material ? material + '｜' : ''}${product}${source ? '｜' + source : ''}${qty ? '｜' + qty + '件' : ''}`;
  }

  function setShipSelectState(message){
    const sel = $('ship-customer-item-select');
    if (!sel) return;
    sel.innerHTML = `<option value="">${esc(message)}</option>`;
  }

  async function loadShipCustomerDropdown(customer){
    if (mod() !== 'ship') return;
    bindShipPickerEvents();
    const c = typeof customer === 'object' && customer ? customer : {name: clean(customer || $('customer-name')?.value || '')};
    const name = clean(c.name || $('customer-name')?.value || '');
    const uid = clean(c.customer_uid || $('customer-name')?.dataset.customerUid || '');
    const sel = $('ship-customer-item-select');
    if (!sel) return;
    if (!name) {
      window.__yxShipCustomerItems = [];
      setShipSelectState('請先選擇 / 輸入客戶名稱');
      return;
    }
    setShipSelectState('商品載入中…');
    try {
      const data = await api(`/api/customer-items?name=${encodeURIComponent(name)}&customer_uid=${encodeURIComponent(uid)}&ts=${Date.now()}`);
      const items = Array.isArray(data.items) ? data.items.filter(it => clean(it.product_text)) : [];
      window.__yxShipCustomerItems = items;
      if (!items.length) {
        setShipSelectState('此客戶目前沒有可出貨商品');
        return;
      }
      sel.innerHTML = '<option value="">請選擇商品</option>' + items.map((it, idx) => `<option value="${idx}">${esc(productLabel(it))}</option>`).join('');
    } catch (e) {
      window.__yxShipCustomerItems = [];
      setShipSelectState(e.message || '商品載入失敗');
    }
  }

  function appendShipLines(lines){
    const ta = $('ocr-text');
    if (!ta) return;
    const incoming = (lines || []).map(normalizeProductText).filter(Boolean);
    if (!incoming.length) return;
    const oldLines = ta.value.split(/\n+/).map(normalizeProductText).filter(Boolean);
    const merged = oldLines.slice();
    incoming.forEach(line => { if (!merged.includes(line)) merged.push(line); });
    ta.value = merged.join('\n');
    ta.dispatchEvent(new Event('input', {bubbles:true}));
    if (typeof window.renderShipSelectedItems === 'function') window.renderShipSelectedItems();
    if (typeof window.loadShipPreview === 'function') {
      clearTimeout(window.__yxFix54ShipPreviewTimer);
      window.__yxFix54ShipPreviewTimer = setTimeout(() => window.loadShipPreview(), 180);
    }
  }

  function addSelectedShipItem(){
    const sel = $('ship-customer-item-select');
    const idx = Number(sel?.value);
    const items = window.__yxShipCustomerItems || [];
    if (!sel || !Number.isInteger(idx) || idx < 0 || !items[idx]) return toast('請先選擇商品', 'warn');
    appendShipLines([items[idx].product_text]);
    toast('已加入商品資料', 'ok');
  }

  function addAllShipItems(){
    const items = window.__yxShipCustomerItems || [];
    if (!items.length) return toast('這個客戶目前沒有商品可加入', 'warn');
    appendShipLines(items.map(it => it.product_text));
    toast(`已加入 ${items.length} 筆商品`, 'ok');
  }

  function bindShipPickerEvents(){
    const picker = $('ship-customer-picker');
    if (!picker || picker.dataset.fix54Bound === '1') return;
    picker.dataset.fix54Bound = '1';
    $('ship-refresh-customer-items')?.addEventListener('click', () => loadShipCustomerDropdown());
    $('ship-add-selected-item')?.addEventListener('click', addSelectedShipItem);
    $('ship-add-all-items')?.addEventListener('click', addAllShipItems);
    const input = $('customer-name');
    if (input) {
      input.addEventListener('input', () => {
        clearTimeout(window.__yxFix54ShipCustomerTimer);
        window.__yxFix54ShipCustomerTimer = setTimeout(() => loadShipCustomerDropdown(), 250);
      });
      input.addEventListener('change', () => loadShipCustomerDropdown());
    }
  }

  const oldSelectCustomerForModule = window.selectCustomerForModule;
  window.selectCustomerForModule = async function(customer){
    const c = typeof customer === 'object' && customer ? customer : {name: clean(customer)};
    const input = $('customer-name');
    if (input) {
      input.value = c.name || '';
      input.dataset.customerUid = c.customer_uid || '';
      input.dispatchEvent(new Event('input', {bubbles:true}));
      input.dispatchEvent(new Event('change', {bubbles:true}));
    }
    hideSelectedCustomerTable();
    if (mod() === 'ship') await loadShipCustomerDropdown(c);
    return null;
  };

  function bootFix54(){
    document.documentElement.dataset.yxFix54 = VERSION;
    hideSelectedCustomerTable();
    fixCustomerCardLayout();
    bindShipPickerEvents();
    if (mod() === 'ship') loadShipCustomerDropdown();
  }

  const oldLoadCustomerBlocks = window.loadCustomerBlocks;
  if (typeof oldLoadCustomerBlocks === 'function') {
    window.loadCustomerBlocks = async function(){
      const result = await oldLoadCustomerBlocks.apply(this, arguments);
      setTimeout(fixCustomerCardLayout, 0);
      setTimeout(fixCustomerCardLayout, 120);
      return result;
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootFix54);
  else setTimeout(bootFix54, 0);

  new MutationObserver(() => {
    clearTimeout(window.__yxFix54ObserverTimer);
    window.__yxFix54ObserverTimer = setTimeout(() => {
      hideSelectedCustomerTable();
      fixCustomerCardLayout();
    }, 80);
  }).observe(document.documentElement, {childList:true, subtree:true});
})();


/* ==== FIX55 inventory/order/master action + material + customer-filter cleanup ==== */
(function(){
  'use strict';
  const VERSION = 'fix56-send-login-batch-customer-delete';
  const MATERIALS = ['SPF','HF','DF','RDT','SPY','SP','RP','TD','MKJ','LVL'];
  const $ = (id) => document.getElementById(id);
  const clean = (v) => String(v ?? '').trim();
  const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[s]));
  const toastSafe = (msg, type='ok') => (typeof window.toast === 'function' ? window.toast(msg, type) : alert(msg));
  const pageModule = () => document.querySelector('[data-module]')?.dataset.module || (location.pathname.includes('/inventory') ? 'inventory' : location.pathname.includes('/orders') ? 'orders' : location.pathname.includes('/master') ? 'master_order' : location.pathname.includes('/ship') ? 'ship' : location.pathname.includes('/customers') ? 'customers' : '');
  async function api55(url, opts={}){ const res=await fetch(url,{...opts,headers:{'Content-Type':'application/json',...(opts.headers||{})},credentials:'same-origin'}); const txt=await res.text(); let data={}; try{data=txt?JSON.parse(txt):{};}catch(_){data={success:false,error:txt||'伺服器回應錯誤'};} if(!res.ok||data.success===false) throw new Error(data.error||data.message||'操作失敗'); return data; }
  function looksLikeProduct(v){ return /\d+\s*[xX×＊*]\s*\d+/.test(clean(v)) || /=/.test(clean(v)); }
  function materialOf(row){ const v=clean(row?.material||row?.product_code||''); const p=clean(row?.product_text||''); if(!v||v===p||looksLikeProduct(v)) return ''; return v; }
  function sizeOf(row){ const p=clean(row?.product_text||row?.size||''); const m=p.match(/\d+\s*[xX×＊*]\s*\d+\s*[xX×＊*]\s*\d+/); return (m?m[0]:(p.split('=')[0]||p)).replace(/[×＊*]/g,'x').replace(/\s+/g,''); }
  function supportOf(row){ const p=clean(row?.product_text||''); const right=p.split('=').slice(1).join('=').trim(); if(right) return right.replace(/[×＊*]/g,'x').replace(/\s+/g,''); const q=Number(row?.qty||0); return q>0?String(q):''; }
  function qtyCount(row){ const q=Number(row?.qty); if(Number.isFinite(q)&&q>0) return Math.trunc(q); const s=supportOf(row); if(!s) return 0; return s.split('+').map(x=>x.trim()).filter(Boolean).reduce((sum,part)=>{const m=part.match(/[xX×＊*]\s*(\d+)\s*$/); return sum+(m?Number(m[1]):1);},0); }
  function sortRows(rows){ return (rows||[]).slice().sort((a,b)=>{ const ma=materialOf(a).localeCompare(materialOf(b),'zh-Hant'); if(ma) return ma; return sizeOf(a).localeCompare(sizeOf(b),'zh-Hant',{numeric:true}); }); }
  function sourceToApi(source){ return source==='inventory'?'inventory':source==='orders'?'orders':'master_orders'; }
  function endpointFor(source,id){ id=Number(id||0); return source==='inventory'?`/api/inventory/${id}`:source==='orders'?`/api/orders/${id}`:`/api/master_orders/${id}`; }
  function rowsFor(source){ return source==='inventory'?(window.__yxInventoryRows||[]):source==='orders'?(window.__yxOrderRows||[]):(window.__yxMasterRows||[]); }
  function storeRows(source,rows){ if(source==='inventory') window.__yxInventoryRows=rows||[]; else if(source==='orders') window.__yxOrderRows=rows||[]; else window.__yxMasterRows=rows||[]; }
  function selectedCustomerName(){ return clean(document.getElementById('customer-name')?.value || window.state?.currentCustomer || ''); }
  function rowMatchesSelectedCustomer(row){ const want=selectedCustomerName(); return !!want && clean(row.customer_name).toLowerCase()===want.toLowerCase(); }
  function renderMaterialSelect(id){ return `<select id="${id}" class="text-input small-input fix55-material-select"><option value="">批量加材質</option>${MATERIALS.map(m=>`<option value="${m}">${m}</option>`).join('')}</select>`; }
  const toolbarId=s=>`fix55-${s}-toolbar`, searchId=s=>`fix55-${s}-search`, materialId=s=>`fix55-${s}-material`, toggleId=s=>`fix55-${s}-select-all`;
  function listElFor(s){ return s==='inventory'?$('inventory-inline-list'):s==='orders'?$('orders-list'):$('master-list'); }
  function panelFor(s){ return s==='inventory'?$('inventory-inline-panel'):s==='orders'?$('orders-list-section'):$('master-list-section'); }
  function ensureToolbar(source){ const panel=panelFor(source); if(!panel||$(toolbarId(source))) return; const html=`<div class="fix55-list-toolbar" id="${toolbarId(source)}"><label class="fix55-checkline"><input type="checkbox" id="${toggleId(source)}"> 全選目前清單</label><input id="${searchId(source)}" class="text-input" placeholder="搜尋商品 / 客戶 / 材質">${renderMaterialSelect(materialId(source))}<button id="fix55-${source}-apply-material" class="ghost-btn small-btn" type="button">套用材質</button><button id="fix55-${source}-refresh" class="ghost-btn small-btn" type="button">重新整理</button></div>`; (panel.querySelector('.section-head')||panel).insertAdjacentHTML('afterend',html); $(searchId(source))?.addEventListener('input',()=>renderSourceRows(source,rowsFor(source))); $(toggleId(source))?.addEventListener('change',e=>document.querySelectorAll(`.fix55-row-check[data-source="${source}"]`).forEach(ch=>ch.checked=e.target.checked)); $(`fix55-${source}-apply-material`)?.addEventListener('click',()=>applyBulkMaterial(source)); $(`fix55-${source}-refresh`)?.addEventListener('click',()=>refreshSource(source)); }
  function itemCard(row,source){ const id=Number(row.id||0); const isMaster=source==='master_order'; const actions=isMaster?'':`<div class="fix55-card-actions"><button class="ghost-btn tiny-btn" type="button" data-fix55-action="edit">編輯</button><button class="ghost-btn tiny-btn" type="button" data-fix55-action="ship">直接出貨</button><button class="ghost-btn tiny-btn danger-btn" type="button" data-fix55-action="delete">刪除</button></div>`; return `<div class="card inventory-action-card fix55-item-card" data-source="${source}" data-id="${id}" data-customer="${esc(row.customer_name||'')}"><label class="fix55-select-row"><input class="fix55-row-check" type="checkbox" data-source="${source}" data-id="${id}"> 選取</label><div class="fix55-item-grid"><div><span class="fix55-item-label">材質</span><b>${esc(materialOf(row))}</b></div><div><span class="fix55-item-label">尺寸</span><b>${esc(sizeOf(row))}</b></div><div><span class="fix55-item-label">支數 x 件數</span><b>${esc(supportOf(row))}</b></div><div><span class="fix55-item-label">數量</span><b>${qtyCount(row)}</b></div>${row.customer_name?`<div class="fix55-item-customer">客戶：${esc(row.customer_name)}</div>`:''}</div>${actions}</div>`; }
  function visibleRows(source,rows){ const kw=clean($(searchId(source))?.value||'').toLowerCase(); let list=sortRows(rows||[]); if(source==='master_order') list=selectedCustomerName()?list.filter(rowMatchesSelectedCustomer):[]; if(kw) list=list.filter(r=>`${materialOf(r)} ${sizeOf(r)} ${supportOf(r)} ${r.customer_name||''}`.toLowerCase().includes(kw)); window[`__yxFix55Visible_${source}`]=list; return list; }
  function renderSourceRows(source,rows){ ensureToolbar(source); const box=listElFor(source); if(!box) return; const list=visibleRows(source,rows); if(source==='master_order'&&!selectedCustomerName()){ box.innerHTML='<div class="empty-state-card compact-empty">請先在上方或左側點選客戶，這裡只顯示該客戶的總單清單。</div>'; return; } box.innerHTML=list.length?list.map(r=>itemCard(r,source)).join(''):'<div class="empty-state-card compact-empty">目前沒有資料</div>'; }
  function renderSummaryTable(rows){ const host=$('inventory-inline-list'); if(!host) return; let panel=$('fix55-inventory-summary'); if(!panel){ panel=document.createElement('div'); panel.id='fix55-inventory-summary'; panel.className='fix55-summary-panel table-card'; host.insertAdjacentElement('beforebegin',panel); } document.querySelectorAll('#fix52-inventory-summary,#fix51-inventory-summary,#fix49-inventory-summary,#fix48-inventory-summary,#fix47-inventory-summary').forEach(x=>x.remove()); const sorted=sortRows(rows||[]); const kw=clean($('fix55-inventory-summary-search')?.value||'').toLowerCase(); const filtered=kw?sorted.filter(r=>`${materialOf(r)} ${sizeOf(r)} ${supportOf(r)} ${r.customer_name||''}`.toLowerCase().includes(kw)):sorted; const expanded=localStorage.getItem('yxFix55InventorySummaryExpanded')==='1'; const shown=expanded?filtered:filtered.slice(0,120); const total=filtered.reduce((s,r)=>s+qtyCount(r),0); panel.innerHTML=`<div class="fix55-summary-title"><strong>${total}件 / ${filtered.length}筆商品</strong><span>庫存統整</span></div><div class="fix55-list-toolbar"><input id="fix55-inventory-summary-search" class="text-input" placeholder="搜尋統整表" value="${esc(kw)}"><button id="fix55-inventory-summary-toggle" type="button" class="ghost-btn small-btn">${expanded?'收合':'顯示全部'}</button></div><table class="fix55-summary-table"><thead><tr><th>材質</th><th>尺寸</th><th>支數 x 件數</th><th>數量</th></tr></thead><tbody>${shown.map(r=>`<tr><td>${esc(materialOf(r))}</td><td>${esc(sizeOf(r))}</td><td>${esc(supportOf(r))}</td><td>${qtyCount(r)}</td></tr>`).join('')||'<tr><td colspan="4">目前沒有庫存資料</td></tr>'}</tbody></table>${!expanded&&filtered.length>120?`<div class="muted">已顯示前 120 筆，共 ${filtered.length} 筆；可按「顯示全部」或搜尋縮小。</div>`:''}`; $('fix55-inventory-summary-search')?.addEventListener('input',()=>renderSummaryTable(rows)); $('fix55-inventory-summary-toggle')?.addEventListener('click',()=>{localStorage.setItem('yxFix55InventorySummaryExpanded',expanded?'0':'1');renderSummaryTable(rows);}); }
  window.renderInventoryRows=function(rows){ storeRows('inventory',rows||[]); renderSummaryTable(rows||[]); renderSourceRows('inventory',rows||[]); };
  window.loadInventory=async function(){ ensureToolbar('inventory'); const box=$('inventory-inline-list'); if(box) box.innerHTML='<div class="empty-state-card compact-empty">載入中…</div>'; try{const data=await api55('/api/inventory?ts='+Date.now()); window.renderInventoryRows(data.items||[]);}catch(e){if(box) box.innerHTML=`<div class="error-card">${esc(e.message||'庫存載入失敗')}</div>`;} };
  window.loadOrdersList=async function(){ ensureToolbar('orders'); const box=$('orders-list'); if(box) box.innerHTML='<div class="empty-state-card compact-empty">載入中…</div>'; try{const data=await api55('/api/orders?ts='+Date.now()); storeRows('orders',data.items||[]); renderSourceRows('orders',window.__yxOrderRows);}catch(e){if(box) box.innerHTML=`<div class="error-card">${esc(e.message||'訂單載入失敗')}</div>`;} };
  window.loadMasterList=async function(){ ensureToolbar('master_order'); const box=$('master-list'); if(box) box.innerHTML='<div class="empty-state-card compact-empty">載入中…</div>'; try{const data=await api55('/api/master_orders?ts='+Date.now()); storeRows('master_order',data.items||[]); renderSourceRows('master_order',window.__yxMasterRows);}catch(e){if(box) box.innerHTML=`<div class="error-card">${esc(e.message||'總單載入失敗')}</div>`;} };
  async function refreshSource(source){ if(source==='inventory') return window.loadInventory(); if(source==='orders') return window.loadOrdersList(); return window.loadMasterList(); }
  function checkedItemsFor(source){ const checked=Array.from(document.querySelectorAll(`.fix55-row-check[data-source="${source}"]:checked`)); const ids=(checked.length?checked.map(ch=>Number(ch.dataset.id||0)):(window[`__yxFix55Visible_${source}`]||[]).map(r=>Number(r.id||0))).filter(Boolean); return [...new Set(ids)].map(id=>({source:sourceToApi(source),id})); }
  async function applyBulkMaterial(source){ const mat=clean($(materialId(source))?.value||'').toUpperCase(); if(!mat) return toastSafe('請先選擇材質','warn'); const items=checkedItemsFor(source); if(!items.length) return toastSafe('目前沒有可套用材質的商品','warn'); const usingAll=!document.querySelector(`.fix55-row-check[data-source="${source}"]:checked`); if(!confirm(`${usingAll?'未勾選商品，將套用目前清單全部商品。\n':''}確定套用材質 ${mat} 到 ${items.length} 筆商品？`)) return; try{const data=await api55('/api/customer-items/batch-material',{method:'POST',body:JSON.stringify({material:mat,items})}); toastSafe(`已套用 ${data.material||mat}，共 ${data.count||items.length} 筆`,'ok'); await refreshSource(source);}catch(e){toastSafe(e.message||'批量套用材質失敗','error');} }
  function findRow(source,id){ return (rowsFor(source)||[]).find(r=>Number(r.id||0)===Number(id||0))||{}; }
  async function handleItemAction(card,action){ const source=card.dataset.source, id=Number(card.dataset.id||0), row=findRow(source,id); if(!id||!source) return; if(action==='delete'){ if(!confirm('確定刪除此商品？')) return; try{await api55(endpointFor(source,id),{method:'DELETE'}); toastSafe('已刪除','ok'); await refreshSource(source);}catch(e){toastSafe(e.message||'刪除失敗','error');} return; } if(action==='edit'){ const product=prompt('商品資料',row.product_text||''); if(product===null) return; const qtyRaw=prompt('數量',qtyCount(row)||row.qty||1); if(qtyRaw===null) return; const material=prompt('材質（可空白）',materialOf(row)); if(material===null) return; const payload={product_text:clean(product),qty:Number(qtyRaw||0),material:clean(material),customer_name:clean(row.customer_name||selectedCustomerName())}; try{await api55(endpointFor(source,id),{method:'PUT',body:JSON.stringify(payload)}); toastSafe('已更新','ok'); await refreshSource(source);}catch(e){toastSafe(e.message||'編輯失敗','error');} return; } if(action==='ship'){ const customer=clean(row.customer_name||selectedCustomerName()||prompt('請輸入出貨客戶名稱',row.customer_name||'')||''); if(!customer) return toastSafe('請先輸入客戶名稱','warn'); const qtyRaw=prompt('本次出貨數量',qtyCount(row)||row.qty||1); if(qtyRaw===null) return; try{await api55('/api/items/transfer',{method:'POST',body:JSON.stringify({source,id,target:'ship',customer_name:customer,qty:Number(qtyRaw||0),allow_inventory_fallback:true})}); toastSafe('已直接出貨','ok'); await refreshSource(source);}catch(e){toastSafe(e.message||'出貨失敗','error');} } }
  document.addEventListener('click',function(e){ const btn=e.target.closest('[data-fix55-action]'); if(!btn) return; e.preventDefault(); e.stopPropagation(); const card=btn.closest('.fix55-item-card'); if(card) handleItemAction(card,btn.dataset.fix55Action); },true);
  const oldSelectCustomerForModule=window.selectCustomerForModule;
  window.selectCustomerForModule=async function(customer){ const c=typeof customer==='object'&&customer?customer:{name:clean(customer)}; const input=$('customer-name'); if(input){ input.value=c.name||''; input.dataset.customerUid=c.customer_uid||''; input.dispatchEvent(new Event('input',{bubbles:true})); input.dispatchEvent(new Event('change',{bubbles:true})); } const selected=$('selected-customer-items'); if(selected){selected.classList.add('hidden'); selected.innerHTML='';} if(pageModule()==='ship'&&typeof window.loadShipCustomerDropdown==='function') await window.loadShipCustomerDropdown(c); if(pageModule()==='master_order') setTimeout(()=>window.loadMasterList(),0); if(pageModule()==='orders') setTimeout(()=>window.loadOrdersList(),0); return null; };
  function bootFix55(){ document.documentElement.dataset.yxFix55=VERSION; document.querySelectorAll('#selected-customer-items').forEach(el=>{el.classList.add('hidden'); el.innerHTML='';}); const m=pageModule(); if(m==='inventory') window.loadInventory(); if(m==='orders') window.loadOrdersList(); if(m==='master_order') window.loadMasterList(); $('customer-name')?.addEventListener('input',()=>{ if(pageModule()==='master_order') renderSourceRows('master_order',rowsFor('master_order')); }); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bootFix55); else setTimeout(bootFix55,0);
})();


/* ==== FIX56 send/login/long-press-delete/batch-table final override ==== */
(function(){
  'use strict';
  const VERSION = 'fix56-send-login-batch-customer-delete';
  const MATERIALS = ['SPF','HF','DF','RDT','SPY','SP','RP','TD','MKJ','LVL'];
  const $ = (id)=>document.getElementById(id);
  const clean = (v)=>String(v ?? '').trim();
  const esc = (v)=>String(v ?? '').replace(/[&<>"']/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const toastSafe = (msg,type='ok') => (typeof window.toast === 'function' ? window.toast(msg,type) : alert(msg));
  const api = async(url,opt={})=>{
    const res = await fetch(url,{credentials:'same-origin',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});
    const txt = await res.text();
    let data = {};
    try{ data = txt ? JSON.parse(txt) : {}; }catch(_){ data = {success:false,error:txt||'伺服器回應錯誤'}; }
    if(!res.ok || data.success === false) throw new Error(data.error || data.message || `請求失敗 ${res.status}`);
    return data;
  };
  const moduleKey = ()=>document.querySelector('[data-module]')?.dataset.module || (location.pathname.includes('/inventory')?'inventory':location.pathname.includes('/orders')?'orders':location.pathname.includes('/master')?'master_order':location.pathname.includes('/ship')?'ship':location.pathname.includes('/customers')?'customers':'');
  function normalizeText(v){ return clean(v).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/[＋，,；;]/g,'+').replace(/\s+/g,''); }
  function looksLikeProduct(v, product=''){
    const s=normalizeText(v), p=normalizeText(product);
    if(!s) return false; if(p && s===p) return true; if(s.includes('=')) return true;
    return /^\d+(?:\.\d+)?x\d+(?:\.\d+)?(?:x\d+(?:\.\d+)?)?$/i.test(s) || /^\d+(?:\.\d+)?(?:\+\d+(?:\.\d+)?)+$/.test(s);
  }
  function materialOf(row){ const v=clean(row?.material || row?.product_code || ''); return looksLikeProduct(v,row?.product_text||'') ? '' : v; }
  function splitProduct(row){ const raw=normalizeText(row?.product_text || row?.size || ''); const i=raw.indexOf('='); return {size:i>=0?raw.slice(0,i):raw, support:i>=0?raw.slice(i+1):''}; }
  function sizeOf(row){ const p=splitProduct(row); const m=p.size.match(/\d+(?:\.\d+)?x\d+(?:\.\d+)?x\d+(?:\.\d+)?/i); return m ? m[0] : p.size; }
  function supportOf(row){ const p=splitProduct(row); if(p.support) return p.support; const q=Number(row?.qty || 0); return q>0 ? String(Math.trunc(q)) : ''; }
  function qtyCount(row){ const s=supportOf(row); if(!s) return Math.max(0, Number(row?.qty||0)); return s.split('+').map(x=>clean(x)).filter(Boolean).reduce((sum,part)=>{ const m=part.match(/[xX×＊*]\s*(\d+)\s*$/); return sum + (m ? Number(m[1]) : 1); },0); }
  function rowsFor(source){ return source==='inventory' ? (window.__yxInventoryRows||[]) : source==='orders' ? (window.__yxOrderRows||[]) : (window.__yxMasterRows||[]); }
  function setRows(source, rows){ if(source==='inventory') window.__yxInventoryRows=rows||[]; else if(source==='orders') window.__yxOrderRows=rows||[]; else window.__yxMasterRows=rows||[]; }
  function endpointFor(source,id){ return source==='inventory' ? `/api/inventory/${id}` : source==='orders' ? `/api/orders/${id}` : `/api/master_orders/${id}`; }
  function apiSource(source){ return source==='inventory'?'inventory':source==='orders'?'orders':'master_orders'; }
  function listEl(source){ return source==='inventory' ? $('inventory-inline-list') : source==='orders' ? $('orders-list') : $('master-list'); }
  function panelEl(source){ return source==='inventory' ? $('inventory-inline-panel') : source==='orders' ? $('orders-list-section') : $('master-list-section'); }
  function selectedCustomer(){ return clean($('customer-name')?.value || window.state?.currentCustomer || ''); }
  function filteredRows(source){
    const kw = clean($(`fix56-${source}-summary-search`)?.value || $(`fix56-${source}-search`)?.value || '').toLowerCase();
    let rows = (rowsFor(source)||[]).slice();
    if(source==='master_order'){ const name = selectedCustomer(); rows = name ? rows.filter(r=>clean(r.customer_name).toLowerCase()===name.toLowerCase()) : []; }
    if(kw) rows = rows.filter(r=>`${materialOf(r)} ${sizeOf(r)} ${supportOf(r)} ${r.customer_name||''}`.toLowerCase().includes(kw));
    rows.sort((a,b)=> (materialOf(a).localeCompare(materialOf(b),'zh-Hant') || sizeOf(a).localeCompare(sizeOf(b),'zh-Hant',{numeric:true}) || supportOf(a).localeCompare(supportOf(b),'zh-Hant',{numeric:true})) );
    window[`__yxFix56Visible_${source}`] = rows; return rows;
  }
  function materialOptions(){ return '<option value="">批量加材質</option>' + MATERIALS.map(m=>`<option value="${m}">${m}</option>`).join(''); }
  function ensureFix56Toolbar(source){
    const panel = panelEl(source); if(!panel) return null;
    let bar = $(`fix56-${source}-toolbar`);
    if(!bar){
      bar = document.createElement('div'); bar.id = `fix56-${source}-toolbar`; bar.className = 'fix56-toolbar';
      bar.innerHTML = `<label class="fix56-checkline"><input type="checkbox" id="fix56-${source}-selectall"> 全選目前清單</label><input id="fix56-${source}-search" class="text-input" placeholder="搜尋商品 / 客戶 / 材質"><select id="fix56-${source}-material" class="text-input small-input">${materialOptions()}</select><button id="fix56-${source}-apply-material" class="ghost-btn small-btn" type="button">套用材質</button><button id="fix56-${source}-batch-delete" class="ghost-btn small-btn danger-btn" type="button">批量刪除</button><button id="fix56-${source}-refresh" class="ghost-btn small-btn" type="button">重新整理</button>`;
      const old = panel.querySelector(`#fix55-${source}-toolbar`) || panel.querySelector('.fix52-list-toolbar');
      if(old) old.replaceWith(bar); else (panel.querySelector('.section-head')||panel).insertAdjacentElement('afterend',bar);
      $(`fix56-${source}-search`)?.addEventListener('input',()=>{ renderSourceTable(source); renderSourceCards(source); });
      $(`fix56-${source}-selectall`)?.addEventListener('change',e=>document.querySelectorAll(`.fix56-row-check[data-source="${source}"]`).forEach(ch=>ch.checked=e.target.checked));
      $(`fix56-${source}-apply-material`)?.addEventListener('click',()=>batchMaterial(source));
      $(`fix56-${source}-batch-delete`)?.addEventListener('click',()=>batchDelete(source));
      $(`fix56-${source}-refresh`)?.addEventListener('click',()=>refreshSource(source));
    }
    return bar;
  }
  function ensureSummaryHost(source){
    const panel = panelEl(source); if(!panel) return null;
    let host = $(`fix56-${source}-summary`);
    if(!host){ host = document.createElement('div'); host.id = `fix56-${source}-summary`; host.className = 'fix56-summary-panel table-card'; const list = listEl(source); if(list) list.insertAdjacentElement('beforebegin',host); else panel.appendChild(host); }
    document.querySelectorAll(`#fix55-${source}-summary,#fix52-${source}-summary,#fix55-inventory-summary,#fix52-inventory-summary,#fix51-inventory-summary,#fix49-inventory-summary,#fix48-inventory-summary,#fix47-inventory-summary`).forEach(x=>{ if(x.id!==host.id) x.remove(); });
    return host;
  }
  function renderSourceTable(source){
    ensureFix56Toolbar(source); const host = ensureSummaryHost(source); if(!host) return;
    const rows = filteredRows(source); const total = rows.reduce((s,r)=>s+qtyCount(r),0); const sourceName = source==='inventory'?'庫存':source==='orders'?'訂單':'總單';
    if(source==='master_order' && !selectedCustomer()){ host.innerHTML = `<div class="fix56-summary-title"><strong>${sourceName}統整</strong><span>請先點選客戶，只顯示該客戶的總單清單</span></div>`; return; }
    const expandedKey = `yxFix56_${source}_expanded`; const expanded = localStorage.getItem(expandedKey)==='1'; const shown = expanded ? rows : rows.slice(0,160);
    host.innerHTML = `<div class="fix56-summary-title"><strong>${total}件 / ${rows.length}筆商品</strong><span>${sourceName}統整</span></div><table class="fix56-summary-table"><thead><tr><th class="check-col">選取</th><th>材質</th><th>尺寸</th><th>支數 x 件數</th><th>數量</th>${source==='inventory'?'<th>客戶</th>':''}</tr></thead><tbody>${shown.map(r=>`<tr><td><input class="fix56-row-check" type="checkbox" data-source="${source}" data-id="${Number(r.id||0)}"></td><td>${esc(materialOf(r))}</td><td>${esc(sizeOf(r))}</td><td>${esc(supportOf(r))}</td><td>${qtyCount(r)}</td>${source==='inventory'?`<td>${esc(r.customer_name||'')}</td>`:''}</tr>`).join('') || `<tr><td colspan="${source==='inventory'?6:5}">目前沒有資料</td></tr>`}</tbody></table>${rows.length>160?`<button class="ghost-btn small-btn" type="button" id="fix56-${source}-toggle">${expanded?'收合':'顯示全部'}</button>`:''}`;
    $(`fix56-${source}-toggle`)?.addEventListener('click',()=>{localStorage.setItem(expandedKey,expanded?'0':'1'); renderSourceTable(source);});
  }
  function itemCardHTML(row,source){
    const id=Number(row.id||0);
    const actions = `<div class="fix56-card-actions"><button class="ghost-btn tiny-btn" type="button" data-fix56-action="edit">編輯</button><button class="ghost-btn tiny-btn" type="button" data-fix56-action="ship">直接出貨</button><button class="ghost-btn tiny-btn danger-btn" type="button" data-fix56-action="delete">刪除</button></div>`;
    return `<div class="card inventory-action-card fix56-item-card" data-source="${source}" data-id="${id}" data-customer="${esc(row.customer_name||'')}"><div class="fix56-item-grid"><div><span class="fix56-item-label">材質</span><b>${esc(materialOf(row))}</b></div><div><span class="fix56-item-label">尺寸</span><b>${esc(sizeOf(row))}</b></div><div><span class="fix56-item-label">支數 x 件數</span><b>${esc(supportOf(row))}</b></div><div><span class="fix56-item-label">數量</span><b>${qtyCount(row)}</b></div>${row.customer_name?`<div class="fix56-item-customer">客戶：${esc(row.customer_name)}</div>`:''}</div>${actions}</div>`;
  }
  function renderSourceCards(source){ const box = listEl(source); if(!box) return; const rows = filteredRows(source); if(source==='master_order' && !selectedCustomer()){ box.innerHTML = '<div class="empty-state-card compact-empty">請先點選客戶，這裡只顯示該客戶的總單清單。</div>'; return; } box.innerHTML = rows.length ? rows.map(r=>itemCardHTML(r,source)).join('') : '<div class="empty-state-card compact-empty">目前沒有資料</div>'; }
  function checkedPayload(source){ let checks = Array.from(document.querySelectorAll(`.fix56-row-check[data-source="${source}"]:checked`)); let ids = checks.map(ch=>Number(ch.dataset.id||0)).filter(Boolean); if(!ids.length) ids = (window[`__yxFix56Visible_${source}`] || filteredRows(source)).map(r=>Number(r.id||0)).filter(Boolean); return [...new Set(ids)].map(id=>({source:apiSource(source),id})); }
  async function batchMaterial(source){ const mat = clean($(`fix56-${source}-material`)?.value || '').toUpperCase(); if(!mat) return toastSafe('請先選擇材質','warn'); const items = checkedPayload(source); if(!items.length) return toastSafe('目前沒有商品可套用','warn'); const hasChecked = document.querySelector(`.fix56-row-check[data-source="${source}"]:checked`); if(!confirm(`${hasChecked?'':'未勾選商品，將套用目前清單全部商品。\n'}確定套用材質 ${mat} 到 ${items.length} 筆商品？`)) return; try{ const data = await api('/api/customer-items/batch-material',{method:'POST',body:JSON.stringify({material:mat,items})}); toastSafe(`已套用 ${data.material||mat}，共 ${data.count||items.length} 筆`,'ok'); await refreshSource(source); } catch(e){ toastSafe(e.message||'批量套用材質失敗','error'); } }
  async function batchDelete(source){ const items = checkedPayload(source); if(!items.length) return toastSafe('目前沒有商品可刪除','warn'); const hasChecked = document.querySelector(`.fix56-row-check[data-source="${source}"]:checked`); if(!confirm(`${hasChecked?'':'未勾選商品，將刪除目前清單全部商品。\n'}確定刪除 ${items.length} 筆商品？`)) return; try{ const data = await api('/api/customer-items/batch-delete',{method:'POST',body:JSON.stringify({items})}); toastSafe(`已刪除 ${data.count||items.length} 筆`,'ok'); await refreshSource(source); } catch(e){ toastSafe(e.message||'批量刪除失敗','error'); } }
  async function refreshSource(source){ if(source==='inventory') return window.loadInventory(); if(source==='orders') return window.loadOrdersList(); return window.loadMasterList(); }
  async function handleCardAction(card,action){ const source = card.dataset.source || (moduleKey()==='orders'?'orders':moduleKey()==='master_order'?'master_order':'inventory'); const id = Number(card.dataset.id || 0); if(!id) return; const row = (rowsFor(source)||[]).find(r=>Number(r.id||0)===id) || {}; if(action==='delete'){ if(!confirm('確定刪除此商品？')) return; try{ await api(endpointFor(source,id),{method:'DELETE'}); toastSafe('已刪除','ok'); await refreshSource(source); }catch(e){ toastSafe(e.message||'刪除失敗','error'); } return; } if(action==='edit'){ const product = prompt('商品資料', row.product_text || ''); if(product===null) return; const qtyRaw = prompt('數量', qtyCount(row) || row.qty || 1); if(qtyRaw===null) return; const mat = prompt('材質（可空白）', materialOf(row)); if(mat===null) return; const customer = clean(row.customer_name || selectedCustomer() || ''); try{ await api(endpointFor(source,id),{method:'PUT',body:JSON.stringify({product_text:clean(product),qty:Number(qtyRaw||0),material:clean(mat),customer_name:customer})}); toastSafe('已更新','ok'); await refreshSource(source); }catch(e){ toastSafe(e.message||'編輯失敗','error'); } return; } if(action==='ship'){ const customer = clean(row.customer_name || selectedCustomer() || prompt('請輸入出貨客戶名稱','') || ''); if(!customer) return toastSafe('請先輸入客戶名稱','warn'); const qtyRaw = prompt('本次出貨數量', qtyCount(row) || row.qty || 1); if(qtyRaw===null) return; try{ await api('/api/items/transfer',{method:'POST',body:JSON.stringify({source,id,target:'ship',customer_name:customer,qty:Number(qtyRaw||0),allow_inventory_fallback:true})}); toastSafe('已直接出貨','ok'); await refreshSource(source); }catch(e){ toastSafe(e.message||'出貨失敗','error'); } } }
  document.addEventListener('click',e=>{ const btn = e.target.closest('[data-fix56-action],[data-fix55-action],[data-act]'); if(!btn) return; const card = btn.closest('.fix56-item-card,.fix55-item-card,.fix52-item-card,.inventory-action-card'); if(!card) return; e.preventDefault(); e.stopPropagation(); handleCardAction(card, btn.dataset.fix56Action || btn.dataset.fix55Action || btn.dataset.act); },true);
  const oldLoadInventory = window.loadInventory; window.loadInventory = async function(){ ensureFix56Toolbar('inventory'); try{ if(oldLoadInventory) await oldLoadInventory.apply(this,arguments); }catch(e){ console.warn(e); } if(!window.__yxInventoryRows?.length){ try{ const data=await api('/api/inventory?ts='+Date.now()); setRows('inventory',data.items||[]); }catch(_){} } renderSourceTable('inventory'); renderSourceCards('inventory'); };
  const oldLoadOrders = window.loadOrdersList; window.loadOrdersList = async function(){ ensureFix56Toolbar('orders'); try{ if(oldLoadOrders) await oldLoadOrders.apply(this,arguments); }catch(e){ console.warn(e); } if(!window.__yxOrderRows?.length){ try{ const data=await api('/api/orders?ts='+Date.now()); setRows('orders',data.items||[]); }catch(_){} } renderSourceTable('orders'); renderSourceCards('orders'); };
  const oldLoadMaster = window.loadMasterList; window.loadMasterList = async function(){ ensureFix56Toolbar('master_order'); try{ if(oldLoadMaster) await oldLoadMaster.apply(this,arguments); }catch(e){ console.warn(e); } if(!window.__yxMasterRows?.length){ try{ const data=await api('/api/master_orders?ts='+Date.now()); setRows('master_order',data.items||[]); }catch(_){} } renderSourceTable('master_order'); renderSourceCards('master_order'); };
  window.selectCustomerForModule = async function(customer){ const c = typeof customer === 'object' && customer ? customer : {name:clean(customer)}; const input = $('customer-name'); if(input){ input.value = c.name || ''; input.dataset.customerUid = c.customer_uid || ''; input.dispatchEvent(new Event('input',{bubbles:true})); input.dispatchEvent(new Event('change',{bubbles:true})); } if(moduleKey()==='ship' && typeof window.loadShipCustomerDropdown === 'function') await window.loadShipCustomerDropdown(c); if(moduleKey()==='master_order') setTimeout(()=>{ renderSourceTable('master_order'); renderSourceCards('master_order'); },30); if(moduleKey()==='orders') setTimeout(()=>{ renderSourceTable('orders'); renderSourceCards('orders'); },30); return null; };
  function bindLongPressDelete(){ document.querySelectorAll('.customer-region-card,.yx-customer-card').forEach(card=>{ if(card.dataset.fix56LongPress==='1') return; card.dataset.fix56LongPress='1'; let timer=null, fired=false; const start=()=>{ fired=false; clearTimeout(timer); timer=setTimeout(async()=>{ fired=true; const name=clean(card.dataset.customer || card.querySelector('.customer-card-name,.fix52-customer-name,.fix55-card-name')?.textContent || ''); const uid=clean(card.dataset.customerUid || ''); if(!name) return; if(!confirm(`確定刪除 / 封存客戶「${name}」？`)) return; try{ card.style.opacity='0.35'; const data=await api(`/api/customers/${encodeURIComponent(name)}`,{method:'DELETE',body:JSON.stringify({customer_uid:uid})}); card.remove(); toastSafe(data.message || '客戶已刪除 / 封存','ok'); if(typeof window.loadCustomerBlocks==='function') setTimeout(()=>window.loadCustomerBlocks(),80); }catch(e){ card.style.opacity=''; toastSafe(e.message||'刪除客戶失敗','error'); } },800); }; const cancel=(ev)=>{ clearTimeout(timer); if(fired && ev) { ev.preventDefault(); ev.stopPropagation(); } }; card.addEventListener('pointerdown',start,{passive:true}); ['pointerup','pointerleave','pointercancel','dragstart'].forEach(t=>card.addEventListener(t,cancel,true)); card.addEventListener('contextmenu',ev=>{ ev.preventDefault(); start(); setTimeout(()=>cancel(ev),850); }); }); }
  const oldRenderCustomers = window.renderCustomers; if(oldRenderCustomers) window.renderCustomers = function(){ const r=oldRenderCustomers.apply(this,arguments); setTimeout(bindLongPressDelete,30); return r; };
  const oldRenderCustomerBoards = window.renderCustomerBoards; if(oldRenderCustomerBoards) window.renderCustomerBoards = function(){ const r=oldRenderCustomerBoards.apply(this,arguments); setTimeout(bindLongPressDelete,30); return r; };
  const oldLoadCustomerBlocks = window.loadCustomerBlocks; if(oldLoadCustomerBlocks) window.loadCustomerBlocks = async function(){ const r=await oldLoadCustomerBlocks.apply(this,arguments); setTimeout(bindLongPressDelete,30); return r; };
  window.toggleLoginSave = function(){ const next = localStorage.getItem('yxRememberLogin') === '0' ? '1' : '0'; localStorage.setItem('yxRememberLogin', next); const lab = $('remember-label'); if(lab) lab.textContent = next === '1' ? '開' : '關'; };
  window.submitLogin = async function(){ const user = clean($('login-username')?.value || ''); const pass = clean($('login-password')?.value || ''); const err = $('login-error'); const btn = document.querySelector('button[onclick="submitLogin()"]'); if(err){ err.classList.add('hidden'); err.textContent=''; } if(!user || !pass){ if(err){err.textContent='請輸入帳號與密碼'; err.classList.remove('hidden');} else alert('請輸入帳號與密碼'); return; } try{ if(btn){btn.disabled=true; btn.textContent='登入中…';} await api('/api/login',{method:'POST',body:JSON.stringify({username:user,password:pass})}); if(localStorage.getItem('yxRememberLogin') !== '0') localStorage.setItem('yxLastUsername', user); location.href = '/'; }catch(e){ if(err){err.textContent=e.message||'登入失敗'; err.classList.remove('hidden');} else alert(e.message||'登入失敗'); } finally{ if(btn){btn.disabled=false; btn.textContent='登入';} } };
  function boot(){ document.documentElement.dataset.yxFix56 = VERSION; const last = localStorage.getItem('yxLastUsername') || ''; if($('login-username') && !$('login-username').value) $('login-username').value = last; const lab=$('remember-label'); if(lab) lab.textContent = localStorage.getItem('yxRememberLogin') === '0' ? '關' : '開'; $('login-password')?.addEventListener('keydown',e=>{ if(e.key==='Enter') window.submitLogin(); }); $('login-username')?.addEventListener('keydown',e=>{ if(e.key==='Enter') $('login-password')?.focus(); }); const m = moduleKey(); if(m==='inventory') setTimeout(()=>window.loadInventory(),50); if(m==='orders') setTimeout(()=>window.loadOrdersList(),50); if(m==='master_order') setTimeout(()=>window.loadMasterList(),50); setTimeout(bindLongPressDelete,120); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else setTimeout(boot,0);
})();

/* ==== FIX57 final hard patch: login / batch delete / summaries / customer delete ==== */
(function(){
  'use strict';
  const VERSION = 'fix57-final-hard-patch';
  const MATERIALS = ['SPF','HF','DF','RDT','SPY','SP','RP','TD','MKJ','LVL'];
  const $ = (id)=>document.getElementById(id);
  const clean = (v)=>String(v ?? '').trim();
  const esc = (v)=>String(v ?? '').replace(/[&<>"']/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const toast = (msg, kind='ok')=>{ try{ (window.toast||window.showToast||alert)(msg, kind); }catch(_){ alert(msg); } };
  async function api57(url, opt={}){
    const res = await fetch(url, { credentials:'same-origin', ...opt, headers:{ 'Content-Type':'application/json', ...(opt.headers||{}) } });
    const txt = await res.text(); let data = {};
    try{ data = txt ? JSON.parse(txt) : {}; }catch(_){ data = {success:false, error:txt || '伺服器回應格式錯誤'}; }
    if(!res.ok || data.success === false) throw new Error(data.error || data.message || ('請求失敗 ' + res.status));
    return data;
  }
  function moduleKey(){ const m=document.querySelector('.module-screen')?.dataset.module || ''; if(m) return m; const p=location.pathname; if(p.includes('master')) return 'master_order'; if(p.includes('orders')) return 'orders'; if(p.includes('inventory')) return 'inventory'; if(p.includes('customers')) return 'customers'; if(p.includes('ship')) return 'ship'; return ''; }
  function normText(v){ return clean(v).replace(/[Ｘ×✕＊*]/g,'x').replace(/＝/g,'=').replace(/[＋，,；;]/g,'+').replace(/\s+/g,''); }
  function splitProduct(row){ const raw=normText(row?.product_text || row?.size || row?.text || ''); const i=raw.indexOf('='); return { size:i>=0?raw.slice(0,i):raw, support:i>=0?raw.slice(i+1):clean(row?.support || row?.support_text || '') }; }
  function looksLikeProduct(v, productText=''){ const s=normText(v); if(!s) return false; if(normText(productText) && s===normText(productText)) return true; if(s.includes('=')) return true; return /^\d+(?:\.\d+)?x\d+(?:\.\d+)?(?:x\d+(?:\.\d+)?)?$/i.test(s) || /^\d+(?:\.\d+)?(?:\+\d+(?:\.\d+)?)+$/.test(s); }
  function materialOf(row){ const v=clean(row?.material || row?.product_code || ''); return looksLikeProduct(v, row?.product_text || '') ? '' : v; }
  function sizeOf(row){ const p=splitProduct(row); const m=p.size.match(/\d+(?:\.\d+)?x\d+(?:\.\d+)?x\d+(?:\.\d+)?/i); return m ? m[0] : p.size; }
  function supportOf(row){ const p=splitProduct(row); if(p.support) return p.support; const q=Number(row?.qty || 0); return q > 0 ? String(Math.trunc(q)) : ''; }
  function qtyFromSupport(s, fallback=0){ const raw=normText(s); if(!raw) return Number(fallback||0); let total=0, hit=false; raw.split('+').forEach(part=>{ part=clean(part); if(!part) return; const m=part.match(/[xX]\s*(\d+)\s*$/); if(m){ total += Number(m[1]); hit=true; } else if(/\d+/.test(part)){ total += 1; hit=true; } }); return hit ? total : Number(fallback||0); }
  function qtyCount(row){ return qtyFromSupport(supportOf(row), row?.qty || 0); }
  function sortRows(rows){ return (rows||[]).slice().sort((a,b)=> materialOf(a).localeCompare(materialOf(b),'zh-Hant') || sizeOf(a).localeCompare(sizeOf(b),'zh-Hant',{numeric:true}) || supportOf(a).localeCompare(supportOf(b),'zh-Hant',{numeric:true})); }
  function apiSource(source){ return source==='inventory'?'inventory':source==='orders'?'orders':'master_orders'; }
  function endpoint(source){ return source==='inventory' ? '/api/inventory' : source==='orders' ? '/api/orders' : '/api/master_orders'; }
  function itemEndpoint(source,id){ return source==='inventory' ? `/api/inventory/${id}` : source==='orders' ? `/api/orders/${id}` : `/api/master_orders/${id}`; }
  function listEl(source){ return source==='inventory' ? $('inventory-inline-list') : source==='orders' ? $('orders-list') : $('master-list'); }
  function sectionEl(source){ return source==='inventory' ? ($('inventory-inline-panel') || document.querySelector('#inventory-inline-list')?.parentElement) : source==='orders' ? $('orders-list-section') : $('master-list-section'); }
  function selectedCustomer(){ return clean($('customer-name')?.value || window.__YX_SELECTED_CUSTOMER__ || ''); }
  function setRows(source, rows){ window.__yx57Rows = window.__yx57Rows || {}; window.__yx57Rows[source] = rows || []; if(source==='inventory') window.__yxInventoryRows=rows||[]; if(source==='orders') window.__yxOrderRows=rows||[]; if(source==='master_order') window.__yxMasterRows=rows||[]; }
  function getRows(source){ window.__yx57Rows = window.__yx57Rows || {}; return window.__yx57Rows[source] || (source==='inventory'?window.__yxInventoryRows:source==='orders'?window.__yxOrderRows:window.__yxMasterRows) || []; }
  function filteredRows(source){
    const kw = clean($(`fix57-${source}-search`)?.value || '').toLowerCase();
    let rows = getRows(source).slice();
    if(source==='master_order'){
      const name = selectedCustomer().toLowerCase();
      rows = name ? rows.filter(r=>clean(r.customer_name).toLowerCase()===name) : [];
    }
    if(kw) rows = rows.filter(r=>`${materialOf(r)} ${sizeOf(r)} ${supportOf(r)} ${r.customer_name||''}`.toLowerCase().includes(kw));
    rows = sortRows(rows); window[`__yx57Visible_${source}`]=rows; return rows;
  }
  function materialOptions(){ return '<option value="">批量加材質</option>' + MATERIALS.map(m=>`<option value="${m}">${m}</option>`).join(''); }
  function ensureToolbar(source){
    const sec = sectionEl(source); if(!sec) return null;
    let bar = $(`fix57-${source}-toolbar`);
    if(!bar){
      bar = document.createElement('div'); bar.id=`fix57-${source}-toolbar`; bar.className='fix57-toolbar';
      bar.innerHTML = `<label class="fix57-checkline"><input type="checkbox" id="fix57-${source}-selectall"> 全選目前清單</label><input id="fix57-${source}-search" class="text-input" placeholder="搜尋商品 / 客戶 / 材質"><select id="fix57-${source}-material" class="text-input small-input">${materialOptions()}</select><button id="fix57-${source}-apply-material" class="ghost-btn small-btn" type="button">套用材質</button><button id="fix57-${source}-batch-delete" class="ghost-btn small-btn danger-btn" type="button">批量刪除</button><button id="fix57-${source}-refresh" class="ghost-btn small-btn" type="button">重新整理</button>`;
      sec.querySelectorAll('.fix56-toolbar,.fix55-toolbar').forEach(x=>x.remove());
      const anchor = sec.querySelector('.section-head') || sec.firstElementChild || sec;
      anchor.insertAdjacentElement('afterend', bar);
      $(`fix57-${source}-search`)?.addEventListener('input',()=>{ renderSummary(source); renderCards(source); });
      $(`fix57-${source}-selectall`)?.addEventListener('change',e=>document.querySelectorAll(`.fix57-row-check[data-source="${source}"]`).forEach(ch=>ch.checked=e.target.checked));
      $(`fix57-${source}-apply-material`)?.addEventListener('click',()=>batchMaterial(source));
      $(`fix57-${source}-batch-delete`)?.addEventListener('click',()=>batchDelete(source));
      $(`fix57-${source}-refresh`)?.addEventListener('click',()=>refreshSource(source));
    }
    return bar;
  }
  function ensureSummary(source){
    const sec = sectionEl(source); if(!sec) return null;
    let host = $(`fix57-${source}-summary`);
    if(!host){ host=document.createElement('div'); host.id=`fix57-${source}-summary`; host.className='fix57-summary-panel table-card'; const list=listEl(source); if(list) list.insertAdjacentElement('beforebegin', host); else sec.appendChild(host); }
    sec.querySelectorAll('.fix56-summary-panel,.fix55-summary-panel,#fix52-inventory-summary,#fix55-inventory-summary').forEach(el=>{ if(el.id!==host.id) el.remove(); });
    return host;
  }
  function renderSummary(source){
    ensureToolbar(source); const host=ensureSummary(source); if(!host) return;
    const rows=filteredRows(source); const total=rows.reduce((s,r)=>s+qtyCount(r),0); const sourceName=source==='inventory'?'庫存':source==='orders'?'訂單':'總單';
    if(source==='master_order' && !selectedCustomer()){
      host.innerHTML = `<div class="fix57-summary-title"><strong>${sourceName}統整</strong><span>請先點選客戶，只顯示該客戶的總單清單</span></div>`; return;
    }
    const expanded = localStorage.getItem(`yxFix57_${source}_expanded`)==='1'; const shown=expanded?rows:rows.slice(0,160);
    host.innerHTML = `<div class="fix57-summary-title"><strong>${total}件 / ${rows.length}筆商品</strong><span>${sourceName}統整</span></div><table class="fix57-summary-table"><thead><tr><th class="check-col">選取</th><th>材質</th><th>尺寸</th><th>支數 x 件數</th><th>數量</th>${source==='inventory'?'<th>客戶</th>':''}</tr></thead><tbody>${shown.map(r=>`<tr><td><input class="fix57-row-check" type="checkbox" data-source="${source}" data-id="${Number(r.id||0)}"></td><td>${esc(materialOf(r))}</td><td>${esc(sizeOf(r))}</td><td>${esc(supportOf(r))}</td><td>${qtyCount(r)}</td>${source==='inventory'?`<td>${esc(r.customer_name||'')}</td>`:''}</tr>`).join('') || `<tr><td colspan="${source==='inventory'?6:5}">目前沒有資料</td></tr>`}</tbody></table>${rows.length>160?`<button class="ghost-btn small-btn" id="fix57-${source}-toggle" type="button">${expanded?'收合':'顯示全部'}</button>`:''}`;
    $(`fix57-${source}-toggle`)?.addEventListener('click',()=>{localStorage.setItem(`yxFix57_${source}_expanded`,expanded?'0':'1'); renderSummary(source);});
  }
  function cardHTML(row,source){ const id=Number(row.id||0); const actions=`<div class="fix57-card-actions"><button class="ghost-btn tiny-btn" type="button" data-fix57-action="edit">編輯</button><button class="ghost-btn tiny-btn" type="button" data-fix57-action="ship">直接出貨</button><button class="ghost-btn tiny-btn danger-btn" type="button" data-fix57-action="delete">刪除</button></div>`; return `<div class="card inventory-action-card fix57-item-card" data-source="${source}" data-id="${id}" data-customer="${esc(row.customer_name||'')}"><div class="fix57-item-grid"><div><span class="fix57-item-label">材質</span><b>${esc(materialOf(row))}</b></div><div><span class="fix57-item-label">尺寸</span><b>${esc(sizeOf(row))}</b></div><div><span class="fix57-item-label">支數 x 件數</span><b>${esc(supportOf(row))}</b></div><div><span class="fix57-item-label">數量</span><b>${qtyCount(row)}</b></div>${row.customer_name?`<div class="fix57-item-customer">客戶：${esc(row.customer_name)}</div>`:''}</div>${actions}</div>`; }
  function renderCards(source){ const list=listEl(source); if(!list) return; const rows=filteredRows(source); if(source==='master_order' && !selectedCustomer()){ list.innerHTML='<div class="empty-state-card compact-empty">請先點選客戶，這裡只顯示該客戶的總單清單。</div>'; return; } list.innerHTML = rows.length ? rows.map(r=>cardHTML(r,source)).join('') : '<div class="empty-state-card compact-empty">目前沒有資料</div>'; }
  async function fetchRows(source){ const data=await api57(endpoint(source)+'?ts='+Date.now()); const rows=data.items || data.rows || []; setRows(source, rows); return rows; }
  async function refreshSource(source){ try{ await fetchRows(source); renderSummary(source); renderCards(source); }catch(e){ toast(e.message || '讀取失敗','error'); } }
  function selectedPayload(source){ const checked=Array.from(document.querySelectorAll(`.fix57-row-check[data-source="${source}"]:checked`)).map(x=>Number(x.dataset.id||0)).filter(Boolean); let ids=checked.length?checked:(window[`__yx57Visible_${source}`] || filteredRows(source)).map(r=>Number(r.id||0)).filter(Boolean); ids=[...new Set(ids)]; return ids.map(id=>({source:apiSource(source), id})); }
  async function batchMaterial(source){ const material=clean($(`fix57-${source}-material`)?.value || '').toUpperCase(); if(!material) return toast('請先選擇材質','warn'); const items=selectedPayload(source); if(!items.length) return toast('目前沒有可套用商品','warn'); const checked=document.querySelector(`.fix57-row-check[data-source="${source}"]:checked`); if(!confirm(`${checked?'':'未勾選商品，會套用目前清單全部商品。\n'}確定套用材質 ${material} 到 ${items.length} 筆？`)) return; try{ const data=await api57('/api/customer-items/batch-material',{method:'POST',body:JSON.stringify({material,items})}); toast(`已套用 ${data.material||material}，共 ${data.count||items.length} 筆`,'ok'); await refreshSource(source); }catch(e){ toast(e.message||'套用材質失敗','error'); } }
  async function batchDelete(source){ const items=selectedPayload(source); if(!items.length) return toast('目前沒有可刪除商品','warn'); const checked=document.querySelector(`.fix57-row-check[data-source="${source}"]:checked`); if(!confirm(`${checked?'':'未勾選商品，會刪除目前清單全部商品。\n'}確定刪除 ${items.length} 筆商品？`)) return; try{ const data=await api57('/api/customer-items/batch-delete',{method:'POST',body:JSON.stringify({items})}); toast(`已刪除 ${data.count||items.length} 筆`,'ok'); await refreshSource(source); }catch(e){ toast(e.message||'批量刪除失敗','error'); } }
  async function cardAction(card,action){ const source=card.dataset.source||moduleKey(); const id=Number(card.dataset.id||0); if(!id) return; const row=(getRows(source)||[]).find(r=>Number(r.id||0)===id)||{}; if(action==='delete'){ if(!confirm('確定刪除此商品？')) return; try{ await api57(itemEndpoint(source,id),{method:'DELETE'}); toast('已刪除','ok'); await refreshSource(source); }catch(e){ toast(e.message||'刪除失敗','error'); } } else if(action==='edit'){ const product=prompt('商品資料',row.product_text||''); if(product===null) return; const qty=prompt('數量',qtyCount(row)||row.qty||1); if(qty===null) return; const material=prompt('材質（可空白）',materialOf(row)); if(material===null) return; const customer=clean(row.customer_name||selectedCustomer()||''); try{ await api57(itemEndpoint(source,id),{method:'PUT',body:JSON.stringify({product_text:clean(product),qty:Number(qty||0),material:clean(material),customer_name:customer})}); toast('已更新','ok'); await refreshSource(source); }catch(e){ toast(e.message||'編輯失敗','error'); } } else if(action==='ship'){ const customer=clean(row.customer_name||selectedCustomer()||prompt('請輸入出貨客戶名稱','')||''); if(!customer) return; const qty=prompt('本次出貨數量',qtyCount(row)||row.qty||1); if(qty===null) return; try{ await api57('/api/items/transfer',{method:'POST',body:JSON.stringify({source:apiSource(source),id,target:'ship',customer_name:customer,qty:Number(qty||0),allow_inventory_fallback:true})}); toast('已直接出貨','ok'); await refreshSource(source); }catch(e){ toast(e.message||'直接出貨失敗','error'); } } }
  document.addEventListener('click', (e)=>{ const btn=e.target.closest('[data-fix57-action],[data-fix56-action],[data-fix55-action],[data-act]'); if(!btn) return; const card=btn.closest('.fix57-item-card,.fix56-item-card,.fix55-item-card,.inventory-action-card'); if(!card) return; e.preventDefault(); e.stopImmediatePropagation(); cardAction(card, btn.dataset.fix57Action || btn.dataset.fix56Action || btn.dataset.fix55Action || btn.dataset.act); }, true);
  window.yxDirectLogin = async function(evt){ if(evt){ evt.preventDefault(); evt.stopPropagation(); } const user=clean($('login-username')?.value||''); const pass=clean($('login-password')?.value||''); const err=$('login-error'); const btn=$('login-submit-btn') || document.querySelector('.auth-card button.primary-btn'); if(err){err.classList.add('hidden');err.textContent='';} if(!user||!pass){ if(err){err.textContent='請輸入帳號與密碼';err.classList.remove('hidden');} else alert('請輸入帳號與密碼'); return false; } try{ if(btn){btn.disabled=true;btn.textContent='登入中…';} await api57('/api/login',{method:'POST',body:JSON.stringify({username:user,password:pass})}); if(localStorage.getItem('yxRememberLogin')!=='0') localStorage.setItem('yxLastUsername',user); location.href='/'; }catch(e){ if(err){err.textContent=e.message||'登入失敗';err.classList.remove('hidden');} else alert(e.message||'登入失敗'); } finally{ if(btn){btn.disabled=false;btn.textContent='登入';} } return false; };
  window.submitLogin = window.yxDirectLogin;
  window.toggleLoginSave = function(){ const next=localStorage.getItem('yxRememberLogin')==='0'?'1':'0'; localStorage.setItem('yxRememberLogin',next); const lab=$('remember-label'); if(lab) lab.textContent=next==='1'?'開':'關'; };
  window.renderLeftCustomerItems = function(){ const h=$('fix52-left-customer-items'); if(h) h.remove(); return Promise.resolve(); };
  function removeCustomerDetailTables(){ if(moduleKey()==='customers'){ $('fix52-left-customer-items')?.remove(); document.querySelectorAll('.customer-detail .fix52-left-customer-items,.customer-detail .table-card,.customer-detail table').forEach(x=>x.remove()); } }
  let holdTimer=null, holdTarget=null, holdFired=false;
  function customerCardFromEvent(e){ return e.target.closest('.customer-region-card,.yx-customer-card'); }
  function cardCustomerName(card){ return clean(card?.dataset.customer || card?.querySelector('.yx-customer-left,.customer-card-name,.fix52-customer-name,.fix55-card-name')?.textContent || ''); }
  function cardCustomerUid(card){ return clean(card?.dataset.customerUid || ''); }
  document.addEventListener('pointerdown', e=>{ const card=customerCardFromEvent(e); if(!card) return; holdTarget=card; holdFired=false; clearTimeout(holdTimer); holdTimer=setTimeout(async()=>{ holdFired=true; const name=cardCustomerName(card); if(!name) return; if(!confirm(`確定刪除 / 封存客戶「${name}」？`)) return; try{ card.style.opacity='0.35'; const data=await api57(`/api/customers/${encodeURIComponent(name)}`,{method:'DELETE',body:JSON.stringify({customer_uid:cardCustomerUid(card)})}); card.remove(); toast(data.message||'客戶已刪除 / 封存','ok'); if(typeof window.loadCustomerBlocks==='function') setTimeout(()=>window.loadCustomerBlocks(),60); if(typeof window.renderCustomers==='function') setTimeout(()=>window.renderCustomers(),80); }catch(err){ card.style.opacity=''; toast(err.message||'刪除客戶失敗','error'); } },700); }, true);
  ['pointerup','pointercancel','pointerleave','dragstart','scroll'].forEach(type=>document.addEventListener(type,e=>{ if(holdTimer) clearTimeout(holdTimer); if(holdFired && holdTarget && type==='pointerup'){ e.preventDefault(); e.stopPropagation(); } holdTimer=null; holdTarget=null; }, true));
  document.addEventListener('contextmenu', e=>{ const card=customerCardFromEvent(e); if(!card) return; e.preventDefault(); }, true);
  function wrapLoader(name, source){ const old=window[name]; window[name]=async function(){ try{ if(old) await old.apply(this,arguments); }catch(e){ console.warn('old loader failed', name, e); } await refreshSource(source); }; }
  wrapLoader('loadInventory','inventory'); wrapLoader('loadOrdersList','orders'); wrapLoader('loadMasterList','master_order');
  const oldSelect = window.selectCustomerForModule;
  window.selectCustomerForModule = async function(customer){ const c=typeof customer==='object'&&customer?customer:{name:clean(customer)}; window.__YX_SELECTED_CUSTOMER__=clean(c.name||''); const input=$('customer-name'); if(input){ input.value=window.__YX_SELECTED_CUSTOMER__; input.dataset.customerUid=c.customer_uid||''; input.dispatchEvent(new Event('input',{bubbles:true})); input.dispatchEvent(new Event('change',{bubbles:true})); } if(moduleKey()==='customers'){ if(typeof window.fillCustomerForm==='function') window.fillCustomerForm(c); removeCustomerDetailTables(); return; } if(oldSelect && moduleKey()==='ship') { try{ await oldSelect.apply(this,arguments); }catch(_){} } if(moduleKey()==='master_order') setTimeout(()=>refreshSource('master_order'),20); if(moduleKey()==='orders') setTimeout(()=>refreshSource('orders'),20); };
  function boot57(){ document.documentElement.dataset.yxFix57=VERSION; const form=$('login-form'); if(form && !form.dataset.fix57Bound){ form.dataset.fix57Bound='1'; form.addEventListener('submit', window.yxDirectLogin, true); } const last=localStorage.getItem('yxLastUsername')||''; if($('login-username') && !$('login-username').value) $('login-username').value=last; const lab=$('remember-label'); if(lab) lab.textContent=localStorage.getItem('yxRememberLogin')==='0'?'關':'開'; removeCustomerDetailTables(); const m=moduleKey(); if(m==='inventory') refreshSource('inventory'); if(m==='orders') refreshSource('orders'); if(m==='master_order') refreshSource('master_order'); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot57); else setTimeout(boot57,0);
  setInterval(()=>{ removeCustomerDetailTables(); const m=moduleKey(); if(m==='inventory') ensureToolbar('inventory'); if(m==='orders') ensureToolbar('orders'); if(m==='master_order') ensureToolbar('master_order'); },1000);
})();

/* ==== FIX58: duplicate toolbar cleanup + shipping preview-before-submit + settings cleanup ==== */
(function(){
  const VERSION = 'fix58-ship-preview-clean';
  const $ = (id)=>document.getElementById(id);
  const clean = (v)=>String(v ?? '').trim();
  const esc = (v)=>String(v ?? '').replace(/[&<>"']/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  function mod(){ return document.querySelector('.module-screen')?.dataset.module || (location.pathname.includes('ship')?'ship':location.pathname.includes('orders')?'orders':location.pathname.includes('master')?'master_order':location.pathname.includes('inventory')?'inventory':''); }
  async function api(url,opt={}){
    const res = await fetch(url,{credentials:'same-origin',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});
    const txt = await res.text(); let data={};
    try{ data = txt ? JSON.parse(txt) : {}; }catch(_){ data={success:false,error:txt||'伺服器回應格式錯誤'}; }
    if(!res.ok || data.success===false) throw Object.assign(new Error(data.error||data.message||('請求失敗 '+res.status)), {payload:data});
    return data;
  }
  function toast(msg,kind='ok'){ try{ (window.toast||window.showToast||alert)(msg,kind); }catch(_){ alert(msg); } }

  function cleanupDuplicatePanels(){
    document.querySelectorAll('#selected-customer-items,.customer-detail #fix52-left-customer-items,.customer-detail .fix52-left-customer-items').forEach(el=>el.remove());
    ['inventory','orders','master_order'].forEach(source=>{
      const section = source==='inventory' ? ($('inventory-inline-panel') || $('inventory-inline-list')?.closest('.subsection,.panel')) : source==='orders' ? $('orders-list-section') : $('master-list-section');
      if(!section) return;
      // keep only one toolbar. Prefer the newest fix57 toolbar; remove older duplicated rows.
      const toolbars = Array.from(section.querySelectorAll('.fix57-toolbar,.fix56-toolbar,.fix55-toolbar,.fix55-list-toolbar,[id*="-toolbar"]'))
        .filter(el => /搜尋商品|批量加材質|全選目前清單|套用材質|批量刪除/.test(el.textContent + ' ' + Array.from(el.querySelectorAll('input,select')).map(x=>x.placeholder||x.value||'').join(' ')));
      let kept = false;
      toolbars.forEach(el=>{
        const isGood = el.classList.contains('fix57-toolbar') || (el.id||'').startsWith('fix57-');
        if(!kept && isGood){ kept = true; el.style.display=''; return; }
        if(!kept){ kept = true; el.style.display=''; return; }
        el.remove();
      });
      // Some old loaders create an identical block without class; remove duplicate rows by first search input.
      const searchInputs = Array.from(section.querySelectorAll('input[placeholder="搜尋商品 / 客戶 / 材質"]'));
      searchInputs.slice(1).forEach(inp=>{
        const row = inp.closest('.fix57-toolbar,.fix56-toolbar,.fix55-toolbar,.btn-row,.query-bar,div');
        if(row && row !== section) row.remove();
      });
    });
  }

  function normalizeText(v){ return clean(v).replace(/[Ｘ×✕＊*]/g,'x').replace(/＝/g,'=').replace(/[＋，,；;]/g,'+').replace(/\s+/g,''); }
  function parseSupportExpr(expr){
    const raw = normalizeText(expr); let pieces=0, lengthSum=0;
    raw.split('+').forEach(part=>{
      part=clean(part); if(!part) return;
      const m = part.match(/^(\d+(?:\.\d+)?)(?:x(\d+))?$/i);
      if(m){ const n=Number(m[1]||0); const c=Number(m[2]||1); pieces += c || 1; lengthSum += n * (c || 1); return; }
      const nums = part.match(/\d+(?:\.\d+)?/g) || [];
      if(nums.length){ pieces += 1; lengthSum += Number(nums[0]||0); }
    });
    return {pieces, lengthSum};
  }
  function parseProductLine(line){
    const raw = normalizeText(line); if(!raw || !raw.includes('=')) return null;
    const [left,...rightParts] = raw.split('='); const right = rightParts.join('=');
    const dims = left.split(/x/i).map(Number);
    if(dims.length < 3 || dims.some(n=>!Number.isFinite(n))) return null;
    const support = parseSupportExpr(right);
    return { product_text: `${left}=${right}`, size:left, support:right, dims, qty:support.pieces || 1, lengthSum:support.lengthSum || 0 };
  }
  function getSubmitItems(){
    let arr=[];
    try{
      const fn = window.collectSubmitItems || (typeof collectSubmitItems === 'function' ? collectSubmitItems : null);
      if(fn) arr = fn() || [];
    }catch(_){ arr=[]; }
    if(arr.length){
      return arr.map(it=>{
        const p = parseProductLine(it.product_text || it.text || '');
        return { ...it, ...(p||{}), product_text: it.product_text || p?.product_text || '', qty: Number(it.qty || p?.qty || 1) };
      }).filter(it=>it.product_text);
    }
    const txt = $('ocr-text')?.value || '';
    return txt.split(/\n+/).map(parseProductLine).filter(Boolean);
  }
  function dimFactor(dims){
    const L = Number(dims[0]||0), W = Number(dims[1]||0), H = Number(dims[2]||0);
    const l = L > 210 ? L/1000 : L/100;
    const w = W/10;
    const h = H >= 100 ? H/100 : H/10;
    return l*w*h;
  }
  function calcShipStats(items){
    let totalLength = 0, volume = 0, totalQty = 0;
    const rows = (items||[]).map(it=>{
      const parsed = parseProductLine(it.product_text || '') || it;
      const support = parseSupportExpr(parsed.support || String(parsed.product_text||'').split('=').slice(1).join('=') || '');
      const length = parsed.lengthSum || support.lengthSum || 0;
      const qty = Number(it.qty || parsed.qty || support.pieces || 1);
      const dims = parsed.dims || (parsed.size||'').split('x').map(Number);
      const vol = dims && dims.length>=3 ? length * dimFactor(dims) : 0;
      totalLength += length; volume += vol; totalQty += qty;
      return {product_text: it.product_text || parsed.product_text || '', qty, length, volume:vol};
    });
    return {rows, totalLength, volume, totalQty};
  }
  function formatNum(n){ return Number(n||0).toLocaleString('zh-TW',{maximumFractionDigits:3}); }

  function showShipPreviewModal(preview, stats){
    return new Promise(resolve=>{
      document.querySelector('.yx58-ship-modal')?.remove();
      const highlights=[];
      (preview.items||[]).forEach(it=>(it.locations||[]).forEach(loc=>highlights.push(`${loc.zone}|${loc.column_index}|direct|${loc.slot_number || loc.visual_slot || 0}`)));
      if(highlights.length) localStorage.setItem('shipPreviewWarehouseHighlights', JSON.stringify(highlights));
      const itemRows = (preview.items||[]).map((it,idx)=>{
        const stat = stats.rows.find(r=>normalizeText(r.product_text)===normalizeText(it.product_text)) || stats.rows[idx] || {};
        const locs = (it.locations||[]).map(loc=>`<span class="yx58-location-chip">${esc(loc.zone)}-${esc(loc.column_index)}-${String(loc.visual_slot || loc.slot_number || 0).padStart(2,'0')}｜可出 ${esc(loc.ship_qty || loc.qty || 0)}</span>`).join('') || '<span class="muted">倉庫圖尚未找到位置</span>';
        const can = Number(it.master_available||0)+Number(it.order_available||0)+Number(it.inventory_available||0);
        const shortage = Math.max(0, Number(it.qty||0)-can);
        return `<tr><td>${esc(it.product_text||'')}</td><td>${esc(it.qty||0)}</td><td>${formatNum(stat.length)}</td><td>${formatNum(stat.volume)}</td><td>總單 ${esc(it.master_available||0)}｜訂單 ${esc(it.order_available||0)}｜庫存 ${esc(it.inventory_available||0)}${shortage?`<br><b style="color:#dc2626">不足 ${shortage}</b>`:''}</td><td>${locs}</td></tr>`;
      }).join('');
      const modal=document.createElement('div'); modal.className='yx58-ship-modal';
      modal.innerHTML=`<div class="yx58-ship-card">
        <div class="yx58-ship-head"><div><h3 style="margin:0 0 4px">出貨預覽確認</h3><div class="muted">先確認材積、長度與倉庫位置，再扣總單 / 訂單 / 庫存。</div></div><button class="icon-btn" type="button" data-yx58-cancel>✕</button></div>
        <div class="yx58-ship-grid"><div class="yx58-stat">總件數<b>${formatNum(stats.totalQty)}</b></div><div class="yx58-stat">總長度<b>${formatNum(stats.totalLength)}</b></div><div class="yx58-stat">材積<b>${formatNum(stats.volume)}</b></div><div class="yx58-stat">倉庫位置<b>${highlights.length ? highlights.length+'格' : '未找到'}</b></div></div>
        <div class="yx58-preview-scroll"><table class="yx58-preview-table"><thead><tr><th>商品</th><th>件數</th><th>長度</th><th>材積</th><th>可扣來源</th><th>倉庫圖位置</th></tr></thead><tbody>${itemRows || '<tr><td colspan="6">沒有商品</td></tr>'}</tbody></table></div>
        <div class="yx58-modal-actions"><a class="ghost-btn" href="/warehouse" target="_blank">開啟倉庫圖</a><button class="ghost-btn" type="button" data-yx58-cancel>取消</button><button class="primary-btn" type="button" data-yx58-ok>確認扣除</button></div>
      </div>`;
      document.body.appendChild(modal);
      modal.querySelectorAll('[data-yx58-cancel]').forEach(btn=>btn.addEventListener('click',()=>{ modal.remove(); resolve(false); }));
      modal.querySelector('[data-yx58-ok]')?.addEventListener('click',()=>{ modal.remove(); resolve(true); });
    });
  }

  const oldConfirm = window.confirmSubmit;
  window.confirmSubmit = async function(){
    if(mod() !== 'ship' || window.__yx58ShipApproved){ return oldConfirm ? oldConfirm.apply(this,arguments) : undefined; }
    const customer = clean($('customer-name')?.value || '');
    const items = getSubmitItems();
    if(!customer || !items.length){ return oldConfirm ? oldConfirm.apply(this,arguments) : toast(!customer?'請先輸入客戶名稱':'沒有可送出的商品資料','warn'); }
    const btn=$('submit-btn');
    try{
      if(btn){ btn.disabled=true; btn.textContent='計算預覽…'; }
      const preview = await api('/api/ship-preview',{method:'POST',body:JSON.stringify({customer_name:customer,items})});
      const stats = calcShipStats(items);
      const ok = await showShipPreviewModal(preview, stats);
      if(!ok) return;
      window.__yx58ShipApproved = true;
      return await (oldConfirm ? oldConfirm.apply(this,arguments) : undefined);
    }catch(e){
      toast(e?.payload?.error || e.message || '出貨預覽失敗','error');
    }finally{
      window.__yx58ShipApproved = false;
      if(btn){ btn.disabled=false; btn.textContent='確認送出'; }
    }
  };

  function boot58(){
    document.documentElement.dataset.yxFix58 = VERSION;
    cleanupDuplicatePanels();
    setTimeout(cleanupDuplicatePanels,80);
    setTimeout(cleanupDuplicatePanels,400);
    setTimeout(cleanupDuplicatePanels,1200);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot58); else boot58();
  setInterval(cleanupDuplicatePanels,1500);
})();


/* ==== FIX59: material toolbar layout + stable summaries + ship availability + dynamic warehouse slots ==== */
(function(){
  const VERSION = 'fix59-material-summary-warehouse-slots';
  const $ = (id)=>document.getElementById(id);
  const clean = (v)=>String(v ?? '').trim();
  function toast(msg, kind='ok'){
    try { (window.toast || window.showToast || alert)(msg, kind); } catch(_e){ alert(msg); }
  }
  async function api(url, opt={}){
    const res = await fetch(url, {credentials:'same-origin', ...opt, headers:{'Content-Type':'application/json', ...(opt.headers||{})}});
    const txt = await res.text(); let data = {};
    try { data = txt ? JSON.parse(txt) : {}; } catch(_e){ data = {success:false, error:txt || '伺服器回應格式錯誤'}; }
    if(!res.ok || data.success === false) throw Object.assign(new Error(data.error || data.message || ('請求失敗 '+res.status)), {payload:data});
    return data;
  }
  function moduleKey(){
    const m = document.querySelector('.module-screen')?.dataset.module || '';
    if(m) return m;
    const p = location.pathname;
    if(p.includes('master')) return 'master_order';
    if(p.includes('orders')) return 'orders';
    if(p.includes('inventory')) return 'inventory';
    if(p.includes('warehouse')) return 'warehouse';
    if(p.includes('ship')) return 'ship';
    return '';
  }
  window.yx59WarehouseSlotCount = function(zone, column){
    zone = clean(zone || '').toUpperCase(); column = Number(column || 0);
    const cells = Array.isArray(window.state?.warehouse?.cells) ? window.state.warehouse.cells : [];
    let max = 20;
    cells.forEach(c=>{
      if(clean(c.zone).toUpperCase() === zone && Number(c.column_index) === column){
        max = Math.max(max, Number(c.slot_number || c.visual_slot || 0));
      }
    });
    return max;
  };
  window.getFixedWarehouseSlots = function(zone, column){ return window.yx59WarehouseSlotCount(zone, column); };

  async function reloadWarehouse(){
    try{
      const data = await api('/api/warehouse');
      window.state = window.state || {};
      window.state.warehouse = window.state.warehouse || {cells:[], zones:{A:{},B:{}}, availableItems:[], activeZone:'A'};
      window.state.warehouse.cells = Array.isArray(data.cells) ? data.cells : [];
      window.state.warehouse.zones = data.zones || window.state.warehouse.zones || {A:{},B:{}};
    }catch(e){ console.warn('reload warehouse failed', e); }
    try { if(typeof window.renderWarehouseZones === 'function') window.renderWarehouseZones(); } catch(_e){}
    try { if(typeof window.renderWarehouseCellItems === 'function') window.renderWarehouseCellItems(); } catch(_e){}
    setTimeout(installSlotTools, 30);
  }

  window.addWarehouseVisualSlot = async function(zone, column, insertAfter){
    zone = clean(zone || '').toUpperCase(); column = Number(column || 0);
    const payload = {zone, column_index: column};
    if(insertAfter !== undefined && insertAfter !== null) payload.insert_after = Number(insertAfter || 0);
    try{
      const data = await api('/api/warehouse/add-slot', {method:'POST', body:JSON.stringify(payload)});
      if(data.cells) {
        window.state.warehouse.cells = data.cells;
        window.state.warehouse.zones = data.zones || window.state.warehouse.zones;
      }
      toast(`已新增 ${zone} 區第 ${column} 欄格子`, 'ok');
      await reloadWarehouse();
    }catch(e){ toast(e.message || '新增格子失敗', 'error'); }
  };
  window.insertWarehouseSlotAfter = async function(zone, column, slotNumber){
    return window.addWarehouseVisualSlot(zone, column, Number(slotNumber || 0));
  };
  window.removeWarehouseVisualSlot = async function(zone, column, slotNumber){
    zone = clean(zone || '').toUpperCase(); column = Number(column || 0); slotNumber = Number(slotNumber || 0);
    if(!slotNumber){ slotNumber = window.yx59WarehouseSlotCount(zone, column); }
    if(!confirm(`確定刪除 ${zone} 區第 ${column} 欄第 ${String(slotNumber).padStart(2,'0')} 格？\n格子內有商品時不會刪除。`)) return;
    try{
      const data = await api('/api/warehouse/remove-slot', {method:'POST', body:JSON.stringify({zone, column_index: column, slot_number: slotNumber})});
      if(data.cells){
        window.state.warehouse.cells = data.cells;
        window.state.warehouse.zones = data.zones || window.state.warehouse.zones;
      }
      toast('已刪除格子', 'ok');
      await reloadWarehouse();
    }catch(e){ toast(e.message || '刪除格子失敗', 'error'); }
  };
  window.deleteWarehouseSlotAt = window.removeWarehouseVisualSlot;

  function installSlotTools(){
    if(moduleKey() !== 'warehouse') return;
    document.querySelectorAll('.vertical-slot').forEach(slot=>{
      if(slot.querySelector('.yx59-slot-tools')) return;
      const zone = clean(slot.dataset.zone || '').toUpperCase();
      const column = Number(slot.dataset.column || 0);
      const num = Number(slot.dataset.num || 0);
      if(!zone || !column || !num) return;
      const tools = document.createElement('div');
      tools.className = 'yx59-slot-tools';
      tools.innerHTML = `<button type="button" class="yx59-slot-btn" data-yx59-insert>插入下方</button><button type="button" class="yx59-slot-btn danger" data-yx59-delete>刪除此格</button>`;
      tools.addEventListener('click', e=>e.stopPropagation());
      tools.querySelector('[data-yx59-insert]')?.addEventListener('click', e=>{ e.stopPropagation(); window.insertWarehouseSlotAfter(zone, column, num); });
      tools.querySelector('[data-yx59-delete]')?.addEventListener('click', e=>{ e.stopPropagation(); window.deleteWarehouseSlotAt(zone, column, num); });
      slot.appendChild(tools);
    });
    document.querySelectorAll('.vertical-column-card').forEach(col=>{
      const firstSlot = col.querySelector('.vertical-slot');
      if(!firstSlot) return;
      const zone = clean(firstSlot.dataset.zone || '').toUpperCase();
      const column = Number(firstSlot.dataset.column || 0);
      const note = col.querySelector('.small-note');
      if(note) note.textContent = `${window.yx59WarehouseSlotCount(zone, column)} 格`;
    });
  }

  function normalizeToolbars(){
    ['inventory','orders','master_order'].forEach(source=>{
      const bar = $(`fix57-${source}-toolbar`);
      if(!bar) return;
      bar.classList.add('yx59-toolbar-normalized');
      const select = $(`fix57-${source}-material`);
      const apply = $(`fix57-${source}-apply-material`);
      if(select && apply && select.nextElementSibling !== apply) bar.insertBefore(select, apply);
      const search = $(`fix57-${source}-search`);
      if(search) search.classList.add('yx59-search-input');
    });
  }
  function stabilizeSummaryTables(){
    ['inventory','orders','master_order'].forEach(source=>{
      const host = $(`fix57-${source}-summary`);
      if(host){
        host.classList.add('yx59-stable-summary');
        const title = host.querySelector('.fix57-summary-title');
        if(title) title.classList.add('yx59-summary-title-centered');
      }
    });
  }
  function boot59(){
    document.documentElement.dataset.yxFix59 = VERSION;
    normalizeToolbars();
    stabilizeSummaryTables();
    installSlotTools();
  }
  const oldRenderCell = window.renderWarehouseCellItems;
  if(typeof oldRenderCell === 'function' && !oldRenderCell.__yx59Wrapped){
    window.renderWarehouseCellItems = function(){
      const ret = oldRenderCell.apply(this, arguments);
      setTimeout(installSlotTools, 20);
      return ret;
    };
    window.renderWarehouseCellItems.__yx59Wrapped = true;
  }
  const oldRenderZones = window.renderWarehouseZones;
  if(typeof oldRenderZones === 'function' && !oldRenderZones.__yx59Wrapped){
    window.renderWarehouseZones = function(){
      const ret = oldRenderZones.apply(this, arguments);
      setTimeout(installSlotTools, 20);
      return ret;
    };
    window.renderWarehouseZones.__yx59Wrapped = true;
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot59); else setTimeout(boot59, 0);
  setInterval(()=>{ normalizeToolbars(); stabilizeSummaryTables(); installSlotTools(); }, 900);
})();
/* ==== FIX59 end ==== */


/* ==== FIX60: stability lock layer - preserve features, unify UI entry points ==== */
(function(){
  const VERSION = 'fix60-stability-lock';
  const MATERIALS = ['SPF','HF','DF','RDT','SPY','SP','RP','TD','MKJ','LVL'];
  const $ = (id)=>document.getElementById(id);
  const esc = (v)=>String(v ?? '').replace(/[&<>"']/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const clean = (v)=>String(v ?? '').trim();
  const normalizeX = (v)=>String(v ?? '').replace(/[×ＸX✕＊*]/g,'x').replace(/＝/g,'=').trim();
  function mod(){
    const d = document.querySelector('.module-screen')?.dataset.module || '';
    if(d) return d;
    const p = location.pathname;
    if(p.includes('master')) return 'master_order';
    if(p.includes('orders')) return 'orders';
    if(p.includes('inventory')) return 'inventory';
    if(p.includes('ship')) return 'ship';
    if(p.includes('warehouse')) return 'warehouse';
    if(p.includes('customers')) return 'customers';
    return '';
  }
  function notify(msg, kind='ok'){
    try { (window.toast || window.showToast || function(m){ console.log(m); })(msg, kind); }
    catch(_){ try{ alert(msg); }catch(__){} }
  }
  async function api60(url, opt={}){
    const headers = {'Content-Type':'application/json', ...(opt.headers || {})};
    const res = await fetch(url, {credentials:'same-origin', ...opt, headers});
    const txt = await res.text();
    let data = {};
    try { data = txt ? JSON.parse(txt) : {}; } catch(_){ data = {success:false, error:txt || '伺服器回應格式錯誤'}; }
    if(!res.ok || data.success === false){
      const err = new Error(data.error || data.message || ('請求失敗 ' + res.status));
      err.payload = data; err.status = res.status; throw err;
    }
    return data;
  }
  window.yxApi = window.yxApi || api60;

  function effectiveQty(expr, fallback=0){
    const raw = normalizeX(expr);
    const right = raw.includes('=') ? raw.split('=').slice(1).join('=') : raw;
    const parts = right.split(/[+＋,，;；]/).map(x=>x.trim()).filter(Boolean);
    let total = 0, parsed = false;
    parts.forEach(seg=>{
      const explicit = seg.match(/(\d+)\s*[件片]/);
      if(explicit){ total += parseInt(explicit[1],10); parsed = true; return; }
      const mx = seg.match(/x\s*(\d+)/i);
      if(mx){ total += parseInt(mx[1],10); parsed = true; return; }
      if(/\d/.test(seg)){ total += 1; parsed = true; }
    });
    return parsed ? total : Number(fallback || 0);
  }
  function splitProduct(text){
    const raw = normalizeX(text);
    const i = raw.indexOf('=');
    return {
      raw,
      size: i>=0 ? raw.slice(0,i).trim() : raw.trim(),
      support: i>=0 ? raw.slice(i+1).trim() : '',
      qty: effectiveQty(raw, 0)
    };
  }
  function materialOf(row){
    const p = normalizeX(row?.product_text || '');
    let m = clean(row?.material || row?.product_code || '');
    if(!m) return '';
    const noSpace = normalizeX(m).replace(/\s+/g,'');
    if(noSpace === normalizeX(p).replace(/\s+/g,'')) return '';
    if(/^\d+(?:x\d+(?:\.\d+)?){1,2}(?:=|$)/i.test(noSpace)) return '';
    if(/^\d+(?:x\d+)?(?:\+\d+(?:x\d+)?)*$/i.test(noSpace)) return '';
    return m.toUpperCase();
  }
  function qtyOf(row){
    const q = effectiveQty(row?.product_text || '', row?.qty || 0);
    return q || Number(row?.qty || 0) || 0;
  }
  function rowText(row){
    const s = splitProduct(row?.product_text || '');
    return `${materialOf(row)} ${s.size} ${s.support} ${row?.customer_name||''}`.toLowerCase();
  }
  function endpoints(source){
    return source==='inventory' ? '/api/inventory' : source==='orders' ? '/api/orders' : '/api/master_orders';
  }
  function sourceTitle(source){
    return source==='inventory'?'庫存':source==='orders'?'訂單':'總單';
  }
  function sectionFor(source){
    if(source==='inventory') return $('inventory-inline-panel') || $('inventory-summary-section') || document.querySelector('#inventory-inline-list')?.parentElement;
    if(source==='orders') return $('orders-list-section');
    return $('master-list-section');
  }
  function listFor(source){
    if(source==='inventory') return $('inventory-inline-list');
    if(source==='orders') return $('orders-list');
    return $('master-list');
  }
  function getSelectedCustomer(){
    const i = $('customer-name');
    return clean(i?.value || window.__YX_SELECTED_CUSTOMER__ || window.state?.currentCustomer || '');
  }
  function rowsStore(source, rows){
    if(!window.__yx60Rows) window.__yx60Rows = {inventory:[],orders:[],master_order:[]};
    if(rows) window.__yx60Rows[source] = rows;
    if(source==='inventory') window.__yxInventoryRows = rows || window.__yxInventoryRows || [];
    if(source==='orders') window.__yxOrderRows = rows || window.__yxOrderRows || [];
    if(source==='master_order') window.__yxMasterRows = rows || window.__yxMasterRows || [];
    return window.__yx60Rows[source] || [];
  }
  function getRows(source){
    return (window.__yx60Rows && window.__yx60Rows[source]) || 
      (source==='inventory' ? window.__yxInventoryRows : source==='orders' ? window.__yxOrderRows : window.__yxMasterRows) || [];
  }
  function filteredRows(source){
    let rows = [...getRows(source)];
    const kw = clean($(`yx60-${source}-search`)?.value || '').toLowerCase();
    if(source === 'master_order'){
      const c = getSelectedCustomer();
      rows = c ? rows.filter(r => clean(r.customer_name) === c) : [];
    }
    if(kw) rows = rows.filter(r=>rowText(r).includes(kw));
    rows.sort((a,b)=>{
      const sa = splitProduct(a.product_text||'').size, sb = splitProduct(b.product_text||'').size;
      return sa.localeCompare(sb, 'zh-Hant') || splitProduct(a.product_text||'').support.localeCompare(splitProduct(b.product_text||'').support, 'zh-Hant');
    });
    return rows;
  }
  function removeDuplicateControls(source){
    const sec = sectionFor(source); if(!sec) return;
    const keep = $(`yx60-${source}-toolbar`);
    sec.querySelectorAll('.fix52-list-toolbar,.fix55-list-toolbar,.fix56-toolbar,.fix57-toolbar,.yx59-toolbar-normalized,.fix55-summary-panel,.fix56-summary-panel,.fix57-summary-panel,#fix52-inventory-summary,#fix55-inventory-summary').forEach(el=>{
      if(keep && keep.contains(el)) return;
      if(el.id && el.id.startsWith('yx60-')) return;
      el.style.display = 'none';
      el.setAttribute('aria-hidden','true');
    });
  }
  function materialOptions(){
    return `<option value="">批量加材質</option>` + MATERIALS.map(m=>`<option value="${m}">${m}</option>`).join('');
  }
  function ensureToolbar(source){
    const sec = sectionFor(source); if(!sec) return null;
    removeDuplicateControls(source);
    let bar = $(`yx60-${source}-toolbar`);
    if(!bar){
      bar = document.createElement('div');
      bar.id = `yx60-${source}-toolbar`;
      bar.className = 'yx60-toolbar';
      bar.innerHTML = `
        <label class="yx60-select-all"><input type="checkbox" id="yx60-${source}-selectall"> 全選目前清單</label>
        <input id="yx60-${source}-search" class="text-input yx60-search" placeholder="搜尋商品 / 客戶 / 材質">
        <select id="yx60-${source}-material" class="text-input yx60-material">${materialOptions()}</select>
        <button id="yx60-${source}-apply" class="ghost-btn small-btn" type="button">套用材質</button>
        <button id="yx60-${source}-delete" class="ghost-btn small-btn danger-btn" type="button">批量刪除</button>
        <button id="yx60-${source}-refresh" class="ghost-btn small-btn" type="button">重新整理</button>`;
      const head = sec.querySelector('.section-head') || sec.firstElementChild || sec;
      head.insertAdjacentElement('afterend', bar);
      $(`yx60-${source}-search`)?.addEventListener('input',()=>renderSummary(source));
      $(`yx60-${source}-selectall`)?.addEventListener('change', e=>{
        document.querySelectorAll(`.yx60-row-check[data-source="${source}"]`).forEach(ch=>ch.checked=e.target.checked);
      });
      $(`yx60-${source}-apply`)?.addEventListener('click',()=>bulkMaterial(source));
      $(`yx60-${source}-delete`)?.addEventListener('click',()=>bulkDelete(source));
      $(`yx60-${source}-refresh`)?.addEventListener('click',()=>refreshSource(source, true));
    }
    return bar;
  }
  function ensureSummary(source){
    const sec = sectionFor(source); if(!sec) return null;
    ensureToolbar(source);
    let host = $(`yx60-${source}-summary`);
    if(!host){
      host = document.createElement('div');
      host.id = `yx60-${source}-summary`;
      host.className = 'yx60-summary table-card';
      const list = listFor(source);
      if(list) list.insertAdjacentElement('beforebegin', host); else sec.appendChild(host);
    }
    return host;
  }
  function renderSummary(source){
    const host = ensureSummary(source); if(!host) return;
    removeDuplicateControls(source);
    const rows = filteredRows(source);
    const total = rows.reduce((s,r)=>s+qtyOf(r),0);
    const title = sourceTitle(source);
    if(source === 'master_order' && !getSelectedCustomer()){
      host.innerHTML = `<div class="yx60-summary-head"><strong>${title}統整</strong><span>請先點選客戶，只顯示該客戶的總單清單。</span></div>`;
      return;
    }
    const expanded = localStorage.getItem(`yx60-${source}-expanded`) === '1';
    const shown = expanded ? rows : rows.slice(0,120);
    const col = source === 'inventory' ? 6 : 5;
    host.innerHTML = `
      <div class="yx60-summary-head"><strong>${total}件 / ${rows.length}筆商品</strong><span>${title}統整</span></div>
      <div class="yx60-table-wrap">
        <table class="yx60-summary-table">
          <thead><tr><th class="check-col">選取</th><th>材質</th><th>尺寸</th><th>支數 x 件數</th><th>數量</th>${source==='inventory'?'<th>客戶</th>':''}</tr></thead>
          <tbody>${shown.length ? shown.map(r=>{
            const sp = splitProduct(r.product_text || '');
            return `<tr><td><input class="yx60-row-check" type="checkbox" data-source="${source}" data-id="${Number(r.id||0)}"></td><td>${esc(materialOf(r))}</td><td>${esc(sp.size)}</td><td>${esc(sp.support)}</td><td>${qtyOf(r)}</td>${source==='inventory'?`<td>${esc(r.customer_name||'')}</td>`:''}</tr>`;
          }).join('') : `<tr><td colspan="${col}">目前沒有資料</td></tr>`}</tbody>
        </table>
      </div>
      ${rows.length>120 ? `<button class="ghost-btn small-btn yx60-toggle" type="button" id="yx60-${source}-toggle">${expanded?'收合':'顯示全部'}</button>` : ''}`;
    $(`yx60-${source}-toggle`)?.addEventListener('click',()=>{
      localStorage.setItem(`yx60-${source}-expanded`, expanded ? '0':'1');
      renderSummary(source);
    });
  }
  async function refreshSource(source, silent=false){
    ensureToolbar(source);
    try{
      const data = await api60(endpoints(source)+'?ts='+Date.now());
      rowsStore(source, data.items || []);
      renderSummary(source);
      if(!silent) notify(`${sourceTitle(source)}已刷新`, 'ok');
      return data.items || [];
    }catch(e){
      if(!silent) notify(e.message || `${sourceTitle(source)}讀取失敗`, 'error');
      return getRows(source);
    }
  }
  function selectedItems(source){
    return [...document.querySelectorAll(`.yx60-row-check[data-source="${source}"]:checked`)].map(ch=>({
      source,
      id: Number(ch.dataset.id || 0)
    })).filter(x=>x.id>0);
  }
  function allVisibleItems(source){
    return filteredRows(source).map(r=>({source, id:Number(r.id||0)})).filter(x=>x.id>0);
  }
  async function bulkMaterial(source){
    let material = clean($(`yx60-${source}-material`)?.value || '').toUpperCase();
    if(!material) return notify('請先選擇材質', 'warn');
    let items = selectedItems(source);
    if(!items.length){
      if(!confirm(`沒有勾選商品，是否套用到目前清單全部商品？`)) return;
      items = allVisibleItems(source);
    }
    if(!items.length) return notify('目前沒有可套用的商品', 'warn');
    try{
      const data = await api60('/api/customer-items/batch-material', {method:'POST', body:JSON.stringify({material, items})});
      notify(`已套用材質 ${material}：${data.count || items.length} 筆`, 'ok');
      await refreshSource(source, true);
      try { if(source==='inventory' && typeof window.loadInventory === 'function') window.loadInventory(); } catch(_){}
      try { if(source==='orders' && typeof window.loadOrdersList === 'function') window.loadOrdersList(); } catch(_){}
      try { if(source==='master_order' && typeof window.loadMasterList === 'function') window.loadMasterList(); } catch(_){}
    }catch(e){ notify(e.message || '批量加材質失敗', 'error'); }
  }
  async function bulkDelete(source){
    let items = selectedItems(source);
    if(!items.length){
      if(!confirm(`沒有勾選商品，是否刪除目前清單全部商品？`)) return;
      items = allVisibleItems(source);
    }
    if(!items.length) return notify('目前沒有可刪除的商品', 'warn');
    if(!confirm(`確定刪除 ${items.length} 筆商品？此動作會保留操作紀錄。`)) return;
    try{
      const data = await api60('/api/customer-items/batch-delete', {method:'POST', body:JSON.stringify({items})});
      notify(`已刪除 ${data.count || items.length} 筆`, 'ok');
      await refreshSource(source, true);
      try { if(source==='inventory' && typeof window.loadInventory === 'function') window.loadInventory(); } catch(_){}
      try { if(source==='orders' && typeof window.loadOrdersList === 'function') window.loadOrdersList(); } catch(_){}
      try { if(source==='master_order' && typeof window.loadMasterList === 'function') window.loadMasterList(); } catch(_){}
    }catch(e){ notify(e.message || '批量刪除失敗', 'error'); }
  }

  function hideCustomerDetailPanels(){
    document.querySelectorAll('#customer-modal,#customer-detail-modal,#selected-customer-items,.customer-products-panel,.customer-detail-products,.customer-items-table').forEach(el=>{
      el.classList.add('hidden'); el.style.display = 'none'; el.setAttribute('aria-hidden','true');
    });
  }
  function bindLongPressDelete(){
    const cards = document.querySelectorAll('.customer-region-card,.yx-customer-card,.customer-card,[data-customer]');
    cards.forEach(card=>{
      if(card.dataset.yx60LongPress === '1') return;
      const text = (card.textContent || '').trim();
      if(!text || /第\s*\d+\s*格|空格/.test(text)) return;
      card.dataset.yx60LongPress = '1';
      let timer = null, fired = false;
      const start = (ev)=>{
        fired = false;
        clearTimeout(timer);
        timer = setTimeout(async ()=>{
          fired = true;
          const name = clean(card.dataset.customer || card.dataset.name || card.querySelector('.yx-customer-left,.customer-card-name,.fix52-customer-name')?.textContent || text.split(/\s+/)[0]);
          const uid = clean(card.dataset.customerUid || card.dataset.uid || '');
          if(!name) return;
          if(!confirm(`確定刪除 / 封存客戶「${name}」？\n有歷史資料會改為封存，不會刪掉紀錄。`)) return;
          try{
            card.style.opacity = '0.35';
            const data = await api60(`/api/customers/${encodeURIComponent(name)}`, {method:'DELETE', body:JSON.stringify({customer_uid:uid})});
            notify(data.message || '客戶已刪除 / 封存', 'ok');
            card.remove();
            if(typeof window.loadCustomerBlocks === 'function') setTimeout(()=>window.loadCustomerBlocks(), 80);
            if(typeof window.renderCustomers === 'function') setTimeout(()=>window.renderCustomers(), 120);
          }catch(e){
            card.style.opacity = '';
            notify(e.message || '刪除客戶失敗', 'error');
          }
        }, 700);
      };
      const cancel = (ev)=>{
        clearTimeout(timer);
        if(fired && ev){ ev.preventDefault(); ev.stopPropagation(); }
      };
      card.addEventListener('pointerdown', start, {passive:true});
      ['pointerup','pointerleave','pointercancel','dragstart','touchend'].forEach(t=>card.addEventListener(t,cancel,true));
      card.addEventListener('contextmenu', ev=>{ ev.preventDefault(); start(ev); setTimeout(()=>cancel(ev),760); });
    });
  }

  function parseShipItems(){
    const raw = clean($('ocr-text')?.value || '');
    if(!raw) return [];
    const lines = raw.split(/\n+/).map(x=>normalizeX(x).trim()).filter(Boolean);
    return lines.map(line=>{
      const sp = splitProduct(line);
      return {product_text: line, product: line, qty: sp.qty || 1, product_code:'', material:''};
    }).filter(it=>it.product_text);
  }
  function calcLengthAndVolume(items){
    let totalQty = 0, totalLength = 0, volume = 0;
    for(const it of items){
      const raw = normalizeX(it.product_text);
      const [left, right=''] = raw.split('=');
      const dims = left.split('x').map(x=>parseFloat(x)).filter(n=>!isNaN(n));
      const L = dims[0] || 0, W = dims[1] || 0, H = dims[2] || 0;
      const qty = effectiveQty(raw, it.qty || 0) || 1;
      totalQty += qty;
      const segs = right.split(/[+＋]/).map(x=>x.trim()).filter(Boolean);
      if(segs.length){
        segs.forEach(seg=>{
          let m = seg.match(/^(\d+(?:\.\d+)?)(?:x(\d+))?$/i);
          if(m){
            const len = parseFloat(m[1]) || 0;
            const n = parseInt(m[2] || '1',10);
            totalLength += len * n;
            volume += (len/100) * (W/10 || 0) * (H/10 || 0) * n;
          }
        });
      }else{
        totalLength += L * qty;
        volume += (L/100) * (W/10 || 0) * (H/10 || 0) * qty;
      }
    }
    return {totalQty, totalLength, volume: Math.round(volume*1000)/1000};
  }
  function previewModal(preview, stats){
    return new Promise(resolve=>{
      document.querySelectorAll('.yx60-ship-modal').forEach(x=>x.remove());
      const rows = (preview.items || []).map(it=>{
        const locs = (it.locations||[]).map(l=>`<span class="yx60-loc">${esc(l.zone)}-${esc(l.column_index)}-${String(l.visual_slot||l.slot_number||'').padStart(2,'0')}｜可出 ${esc(l.ship_qty||l.qty||0)}</span>`).join('') || '<span class="muted">倉庫圖尚未找到位置</span>';
        const shortage = (it.shortage_reasons||[]).join('、');
        return `<tr><td>${esc(it.product_text||'')}</td><td>${esc(it.qty||0)}</td><td>總單 ${esc(it.master_available||0)}｜訂單 ${esc(it.order_available||0)}｜庫存 ${esc(it.inventory_available||0)}${shortage?`<br><b class="danger-text">${esc(shortage)}</b>`:''}</td><td>${locs}</td></tr>`;
      }).join('');
      const modal = document.createElement('div');
      modal.className = 'yx60-ship-modal';
      modal.innerHTML = `<div class="yx60-ship-card">
        <div class="yx60-modal-head"><div><h3>出貨預覽確認</h3><div class="muted">先確認材積、總長度與倉庫位置，按確認後才扣總單 / 訂單 / 庫存。</div></div><button class="icon-btn" data-cancel type="button">✕</button></div>
        <div class="yx60-stats"><div>件數<b>${esc(stats.totalQty)}</b></div><div>總長度<b>${esc(stats.totalLength)}</b></div><div>材積<b>${esc(stats.volume)}</b></div><div>扣除模式<b>${preview.needs_inventory_fallback?'改扣庫存':'正常扣除'}</b></div></div>
        <div class="yx60-table-wrap"><table class="yx60-preview-table"><thead><tr><th>商品</th><th>件數</th><th>可扣來源</th><th>倉庫圖位置</th></tr></thead><tbody>${rows || '<tr><td colspan="4">沒有商品</td></tr>'}</tbody></table></div>
        <div class="yx60-modal-actions"><a class="ghost-btn" href="/warehouse" target="_blank">開啟倉庫圖</a><button class="ghost-btn" data-cancel type="button">取消</button><button class="primary-btn" data-ok type="button">確認扣除</button></div>
      </div>`;
      document.body.appendChild(modal);
      modal.querySelectorAll('[data-cancel]').forEach(b=>b.addEventListener('click',()=>{modal.remove(); resolve(false);}));
      modal.querySelector('[data-ok]')?.addEventListener('click',()=>{modal.remove(); resolve(true);});
    });
  }
  const previousConfirm = window.confirmSubmit;
  window.confirmSubmit = async function(){
    if(mod() !== 'ship') return previousConfirm ? previousConfirm.apply(this, arguments) : undefined;
    const customer = clean($('customer-name')?.value || '');
    const items = parseShipItems();
    if(!customer) return notify('請先輸入客戶名稱', 'warn');
    if(!items.length) return notify('沒有可送出的商品資料', 'warn');
    const btn = $('submit-btn');
    try{
      if(btn){ btn.disabled=true; btn.textContent='計算預覽…'; }
      const preview = await api60('/api/ship-preview', {method:'POST', body:JSON.stringify({customer_name:customer, items})});
      const ok = await previewModal(preview, calcLengthAndVolume(items));
      if(!ok) return;
      if(btn){ btn.textContent='送出中…'; }
      const result = await api60('/api/ship', {method:'POST', body:JSON.stringify({customer_name:customer, items, allow_inventory_fallback:!!preview.needs_inventory_fallback})});
      notify(result.message || '出貨完成', 'ok');
      const out = $('module-result');
      if(out){ out.classList.remove('hidden'); out.style.display=''; out.innerHTML = '<b>出貨完成</b>'; }
      if($('ocr-text')) $('ocr-text').value = '';
      try { await refreshSource('inventory', true); await refreshSource('orders', true); await refreshSource('master_order', true); } catch(_){}
    }catch(e){
      const out = $('module-result');
      if(out){ out.classList.remove('hidden'); out.style.display=''; out.innerHTML = `<b>送出失敗</b><br>${esc(e.message || '出貨失敗')}`; }
      notify(e.message || '出貨失敗', 'error');
    }finally{
      if(btn){ btn.disabled=false; btn.textContent='確認送出'; }
    }
  };

  function hardenLogin(){
    const form = $('login-form');
    if(!form || form.dataset.yx60Login === '1') return;
    form.dataset.yx60Login = '1';
    form.addEventListener('submit', async (ev)=>{
      ev.preventDefault(); ev.stopPropagation();
      const username = clean($('login-username')?.value || '');
      const password = clean($('login-password')?.value || '');
      const err = $('login-error'), btn = $('login-submit-btn');
      if(err){ err.classList.add('hidden'); err.textContent=''; }
      if(!username || !password){ if(err){err.textContent='請輸入帳號與密碼'; err.classList.remove('hidden');} return false; }
      try{
        if(btn){ btn.disabled = true; btn.textContent='登入中…'; }
        await api60('/api/login', {method:'POST', body:JSON.stringify({username, password})});
        localStorage.setItem('yxLastUsername', username);
        location.href = '/';
      }catch(e){
        if(err){ err.textContent = e.message || '登入失敗'; err.classList.remove('hidden'); } else notify(e.message || '登入失敗', 'error');
      }finally{
        if(btn){ btn.disabled = false; btn.textContent='登入'; }
      }
      return false;
    }, true);
  }

  function bootstrap(){
    document.documentElement.dataset.yxFix60 = VERSION;
    hardenLogin();
    hideCustomerDetailPanels();
    bindLongPressDelete();
    const m = mod();
    ['inventory','orders','master_order'].forEach(source=>{
      if(m === source || (source==='inventory' && $('inventory-inline-list')) || (source==='orders' && $('orders-list')) || (source==='master_order' && $('master-list'))){
        ensureToolbar(source);
        renderSummary(source);
        if(!getRows(source).length) refreshSource(source, true); else renderSummary(source);
      }
    });
    document.querySelectorAll('.customer-region-card,.yx-customer-card').forEach(card=>card.classList.add('yx60-customer-card'));
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap); else setTimeout(bootstrap, 0);

  const mo = new MutationObserver(()=>{
    clearTimeout(window.__yx60Tick);
    window.__yx60Tick = setTimeout(bootstrap, 120);
  });
  try { mo.observe(document.body, {childList:true, subtree:true}); } catch(_){}
  setInterval(bootstrap, 1800);

  window.yx60RefreshSource = refreshSource;
  window.yx60RenderSummary = renderSummary;
})();

/* ==== FIX60 end ==== */
