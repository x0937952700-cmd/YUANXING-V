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
  const VERSION = 'fix64-mobile-fast-select';
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
  function filteredRows(source){
    let rows = [...getRows(source)];
    if(source==='master_order'){
      const c = selectedCustomer();
      rows = c ? rows.filter(r => clean(r.customer_name) === c) : [];
    }
    const q = clean($(`yx63-${source}-search`)?.value || '').toLowerCase();
    if(q) rows = rows.filter(r => itemKey(r).includes(q));
    return rows.sort((a,b)=>rowMaterial(a).localeCompare(rowMaterial(b),'zh-Hant') || rowSize(a).localeCompare(rowSize(b),'zh-Hant',{numeric:true}) || rowSupport(a).localeCompare(rowSupport(b),'zh-Hant',{numeric:true}));
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
    panel.innerHTML=`<div class="section-title">出貨預覽</div><div class="yx63-ship-summary"><div>件數：<b>${tq}</b></div><div>長度：<b>${tl.toLocaleString()}</b></div><div>材積：<b>${Number(tv||0).toLocaleString()}</b></div></div><div class="yx63-table-wrap"><table class="yx63-summary-table"><thead><tr><th>商品</th><th>件數</th><th>長度</th><th>材積</th><th>可扣來源</th><th>倉庫圖位置</th></tr></thead><tbody>${items.map(it=>{ const locs=(it.locations||[]).map(loc=>`${esc(loc.zone||'')}-${esc(loc.column_index||'')}-${String(loc.visual_slot||loc.slot_number||'').padStart(2,'0')}`).join('、')||'倉庫圖尚未找到位置'; const shortage=Number(it.shortage||it.shortage_qty||0); const src=`總單 ${it.master_available??it.master_qty??0}｜訂單 ${it.order_available??it.order_qty??0}｜庫存 ${it.inventory_available??it.inventory_qty??0}${shortage>0?`<br><span class="danger-text">不足 ${shortage}</span>`:''}`; return `<tr><td>${esc(it.product_text||'')}</td><td>${it.qty||it.need_qty||0}</td><td>${Number(it.length_total||it.total_length||0).toLocaleString()}</td><td>${Number(it.volume||it.volume_total||0).toLocaleString()}</td><td>${src}</td><td>${locs}</td></tr>`; }).join('')}</tbody></table></div><div class="btn-row"><button class="ghost-btn" type="button" id="yx63-ship-cancel">取消</button><button class="primary-btn" type="button" id="yx63-ship-confirm">確認扣除</button></div>`;
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
  const YX64 = 'fix64-mobile-fast-select';
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

