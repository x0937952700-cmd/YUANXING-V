

function getFixedWarehouseColumns(){ return [1,2,3,4,5,6]; }
function getFixedWarehouseSlots(){ return 20; }

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

      for (let n = 1; n <= getFixedWarehouseSlots(); n++) {
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
  renderWarehouseCellItems();
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

function renderWarehouseCellItems(){
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
    chip.querySelector('.edit')?.addEventListener('click', async () => {
      const nextText = window.prompt('編輯格位商品資料', it.product_text || '');
      if (nextText === null) return;
      const nextQtyRaw = window.prompt('編輯數量', String(it.qty || 0));
      if (nextQtyRaw === null) return;
      const nextQty = parseInt(nextQtyRaw, 10);
      if (Number.isNaN(nextQty) || nextQty < 0) return toast('數量格式錯誤', 'error');
      state.currentCellItems[idx] = { ...it, product_text: String(nextText).trim(), qty: nextQty };
      renderWarehouseCellItems();
      toast('已更新格位內容，記得按儲存格位', 'ok');
    });
    chip.querySelector('.remove').addEventListener('click', () => {
      state.currentCellItems.splice(idx, 1);
      renderWarehouseCellItems();
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
  renderWarehouseCellItems();
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

async function moveWarehouseItem(fromKey, toKey, product_text, qty){
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

async async function searchWarehouse(){
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

function highlightWarehouseCell(zone, column, num){
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

// expose globals
window.openAlbumPicker = openAlbumPicker;
window.openCameraPicker = openCameraPicker;
window.resetModuleForm = resetModuleForm;
window.confirmSubmit = confirmSubmit;
window.reverseLookup = reverseLookup;
window.logout = logout;
window.submitLogin = submitLogin;
window.toggleLoginSave = toggleLoginSave;
window.changePassword = changePassword;
window.openCustomerModal = openCustomerModal;
window.closeCustomerModal = closeCustomerModal;
window.saveCustomer = saveCustomer;
window.removeShipItemAt = removeShipItemAt;
window.batchDeleteCustomerItems = batchDeleteCustomerItems;
window.batchApplyCustomerMaterial = batchApplyCustomerMaterial;
window.loadShippingRecords = loadShippingRecords;
window.searchWarehouse = searchWarehouse;
window.closeWarehouseModal = closeWarehouseModal;
window.addSelectedItemToCell = addSelectedItemToCell;
window.saveWarehouseCell = saveWarehouseCell;
window.renderWarehouse = renderWarehouse;
window.renderCustomers = renderCustomers;
window.openTodoAlbumPicker = openTodoAlbumPicker;
window.openTodoCameraPicker = openTodoCameraPicker;
window.saveTodoItem = saveTodoItem;
window.clearTodoForm = clearTodoForm;
window.deleteTodoItem = deleteTodoItem;
window.completeTodoItem = completeTodoItem;
window.restoreTodoItem = restoreTodoItem;
window.openTodoImagePreview = openTodoImagePreview;
window.toggleTodayChanges = toggleTodayChanges;
window.markTodayChangesRead = markTodayChangesRead;
window.toggleTodayUnreadFilter = toggleTodayUnreadFilter;
window.deleteTodayChange = deleteTodayChange;
window.runRoiOcr = runRoiOcr;
window.clearRoiSelection = clearRoiSelection;
window.learnOcrCorrection = learnOcrCorrection;
window.loadShipPreview = loadShipPreview;
window.restoreOcrHistory = restoreOcrHistory;
window.highlightOcrLine = highlightOcrLine;
window.selectCustomerForModule = selectCustomerForModule;
window.addOrderToMaster = addOrderToMaster;

window.setWarehouseZone = setWarehouseZone;
window.highlightWarehouseSameCustomer = highlightWarehouseSameCustomer;
window.toggleWarehouseUnplacedHighlight = toggleWarehouseUnplacedHighlight;
window.clearWarehouseHighlights = clearWarehouseHighlights;
window.jumpToZone = jumpToZone;
window.addWarehouseSlot = addWarehouseSlot;
window.removeWarehouseSlot = removeWarehouseSlot;
window.deleteWarehouseColumn = deleteWarehouseColumn;
window.loadAdminUsers = loadAdminUsers;
window.loadGoogleOcrStatus = loadGoogleOcrStatus;
window.loadBackups = loadBackups;
window.restoreBackupFile = restoreBackupFile;
window.undoLastAction = undoLastAction;
window.moveShipItem = moveShipItem;
window.clearShipSelectedItems = clearShipSelectedItems;
window.createBackup = createBackup;
window.setTodayCategoryFilter = setTodayCategoryFilter;
window.setGoogleOcrEnabled = setGoogleOcrEnabled;
window.addWarehouseVisualSlot = addWarehouseVisualSlot;
window.removeWarehouseVisualSlot = removeWarehouseVisualSlot;
window.toggleUserBlocked = toggleUserBlocked;
/* ===== 第十包覆寫強化 ===== */

function splitManualCompoundLine(line=''){
  const normalized = String(line || '')
    .replace(/[｜|]/g, ' ')
    .replace(/([0-9_\-]{1,4}x[0-9_\-]{1,4}x[0-9_\-]{1,4}=[0-9x+]+)/ig, '\n$1\n')
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
    const rightRaw = parts.join('=').replace(/[。．]/g, '').trim();
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
    const nums = rightRaw.match(/\d+/g) || [];
    const qty = parseInt(nums[1] || nums[0] || '1', 10) || 1;
    const product_text = `${dims.join('x')}=${rightRaw}`;
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

    line = normalizeOcrLine(line).replace(/[^0-9a-zA-Zx=+_\-｜:\u4e00-\u9fff ]/g, '').trim();
    if (!line) return;

    const productPattern = /(?:[_-]|\d{1,4})x(?:[_-]|\d{1,4})x(?:[_-]|\d{1,4})=[0-9x+]+/ig;
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

async function searchWarehouse(){
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
  const listId = scope === 'modal' ? 'customer-modal-items' : 'customer-inline-items';
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

async function openCustomerModal(name){
  try {
    state.currentCustomer = name;
    const [detail, items, recent] = await Promise.all([
      requestJSON(`/api/customers/${encodeURIComponent(name)}`, { method:'GET' }),
      requestJSON(`/api/customer-items?name=${encodeURIComponent(name)}`, { method:'GET' }),
      loadCustomerRecentActivity(name)
    ]);
    $('customer-modal').classList.remove('hidden');
    const body = $('customer-modal-body');
    const stats = buildCommonCustomerStats(items.items || []);
    body.innerHTML = `
      <div class="card-list">
        <div class="card">
          <div class="title">${escapeHTML(name)}</div>
          <div class="sub">電話：${escapeHTML(detail.item?.phone || '')}</div>
          <div class="sub">地址：${escapeHTML(detail.item?.address || '')}</div>
          <div class="sub">特殊要求：${escapeHTML(detail.item?.notes || '')}</div>
          <div class="sub">區域：${escapeHTML(detail.item?.region || '')}</div>
          <div class="sub"><strong>常用材質：</strong>${stats.topMaterials.length ? escapeHTML(stats.topMaterials.join('、')) : '尚未建立'}</div>
          <div class="sub"><strong>常用尺寸：</strong>${stats.topSizes.length ? escapeHTML(stats.topSizes.join('、')) : '尚未建立'}</div>
        </div>
        <div class="card">
          <div class="title">商品</div>
          <div class="recent-activity-card">
            <div class="common-meta-title">最近異動</div>
            <div class="recent-activity-list">${renderCustomerRecentActivity(recent)}</div>
          </div>
          <div class="customer-batch-toolbar">
            <label class="customer-item-batch-check"><input type="checkbox" id="customer-select-all-modal"> 全選</label>
            <input id="customer-item-search-modal" class="text-input small-inline grow-input" placeholder="搜尋此客戶商品">
            <select id="customer-sort-modal" class="text-input small-inline">
              <option value="size">尺寸排序</option>
              <option value="material">材質排序</option>
              <option value="updated">更新時間排序</option>
            </select>
            <select id="customer-batch-material-modal" class="text-input small-inline">
              <option value="">批量套用材質</option>
              <option value="SPF">SPF</option><option value="HF">HF</option><option value="DF">DF</option>
              <option value="ROT">ROT</option><option value="SPY">SPY</option><option value="SP">SP</option>
              <option value="RP">RP</option><option value="TD">TD</option><option value="MLH">MLH</option>
            </select>
            <button class="ghost-btn tiny-btn ship-add-btn" id="customer-batch-add-ship-modal">批量加入出貨</button>
            <button class="ghost-btn tiny-btn" id="customer-batch-apply-modal">套用材質</button>
            <button class="ghost-btn tiny-btn danger-btn" id="customer-batch-delete-modal">批量刪除</button>
          </div>
          <div class="table-card customer-table-wrap"><table><thead><tr><th></th><th>尺寸</th><th>支數 x 件數</th><th>材質</th><th>來源</th><th>操作</th></tr></thead><tbody id="customer-modal-items"></tbody></table></div>
        </div>
      </div>`;
    const list = $('customer-modal-items');
    if (list) list.innerHTML = buildCustomerItemRows(name, items.items || []);
    bindCustomerPanelEnhancements(name, items.items || [], 'modal');
    $('customer-batch-add-ship-modal') && ($('customer-batch-add-ship-modal').onclick = () => batchAddCustomerItemsToShip(name, 'modal'));
    $('customer-batch-apply-modal') && ($('customer-batch-apply-modal').onclick = () => batchApplyCustomerMaterial(name, 'modal'));
    $('customer-batch-delete-modal') && ($('customer-batch-delete-modal').onclick = () => batchDeleteCustomerItems(name, 'modal'));
    $('cust-name').value = detail.item?.name || name;
    $('cust-phone').value = detail.item?.phone || '';
    $('cust-address').value = detail.item?.address || '';
    $('cust-notes').value = detail.item?.notes || '';
    $('cust-region').value = detail.item?.region || '北區';
  } catch (e) {
    toast(e.message, 'error');
  }
}

window.batchAddCustomerItemsToShip = batchAddCustomerItemsToShip;
window.openCustomerModal = openCustomerModal;
window.loadShipPreview = loadShipPreview;
window.renderShipSelectedItems = renderShipSelectedItems;
window.searchWarehouse = searchWarehouse;
window.moveWarehouseItem = moveWarehouseItem;
window.highlightWarehouseCell = highlightWarehouseCell;
