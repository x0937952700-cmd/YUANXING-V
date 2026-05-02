/* 沅興木業 v25-one-table-master todos page master
   補回代辦事項頁 inline 按鈕事件：上傳檔案、拍照、新增代辦、清空、完成、還原、刪除、拖拉排序。 */
(function(){
  'use strict';
  const YX = window.YXHardLock;
  const clean = v => String(v ?? '').replace(/\s+/g, ' ').trim();
  const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const moduleKey = () => (YX && typeof YX.moduleKey === 'function' ? YX.moduleKey() : (document.body?.dataset?.module || ''));
  if (moduleKey() !== 'todos') return;

  const $ = id => document.getElementById(id);
  const state = { files: [], items: [], dragId: '', dragDone: '' };

  function toast(message, kind='ok'){
    if (YX && typeof YX.toast === 'function') return YX.toast(message, kind);
    try { (window.toast || window.showToast || window.notify || console.log)(message, kind); }
    catch(_e) { console.log(message); }
  }
  function today(){
    const d = new Date();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    return `${d.getFullYear()}-${m}-${day}`;
  }
  function setLoading(on){
    const btn = $('todo-save-btn');
    if (!btn) return;
    btn.disabled = !!on;
    btn.classList.toggle('is-loading', !!on);
    btn.textContent = on ? '新增中…' : '新增代辦';
  }
  function parseImages(raw){
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.filter(Boolean).map(String);
    const text = String(raw || '').trim();
    if (!text) return [];
    try {
      const data = JSON.parse(text);
      if (Array.isArray(data)) return data.filter(Boolean).map(String);
    } catch(_e) {}
    return [text].filter(Boolean);
  }
  function imageUrl(name){ return `/todo-image/${encodeURIComponent(String(name || ''))}`; }
  function itemId(item){ return String(item?.id ?? item?.todo_id ?? ''); }
  function isDone(item){ return Number(item?.is_done || 0) === 1 || !!item?.completed_at; }
  function dueLabel(date){
    date = clean(date);
    if (!date) return '未設定日期';
    const t = today();
    if (date < t) return `逾期｜${date}`;
    if (date === t) return `今天到期｜${date}`;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate()+1);
    const tm = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth()+1).padStart(2,'0')}-${String(tomorrow.getDate()).padStart(2,'0')}`;
    if (date === tm) return `明天｜${date}`;
    return date;
  }
  function dueClass(date){
    date = clean(date);
    if (!date) return '';
    if (date < today()) return 'todo-chip-overdue';
    if (date === today()) return 'todo-chip-today';
    return 'todo-chip-tomorrow';
  }
  function renderPreview(){
    const box = $('todo-selected-preview');
    if (!box) return;
    if (!state.files.length) {
      box.classList.add('hidden');
      box.innerHTML = '';
      return;
    }
    box.classList.remove('hidden');
    box.innerHTML = `<div class="todo-preview-grid">${state.files.map((f, idx) => {
      const url = URL.createObjectURL(f);
      return `<div class="todo-preview-card todo-image-preview-card"><img src="${url}" alt="預覽 ${idx+1}"><div><strong>${esc(f.name || `圖片 ${idx+1}`)}</strong><div class="muted">${Math.round((f.size||0)/1024)} KB</div></div></div>`;
    }).join('')}</div>`;
  }
  function clearTodoForm(){
    state.files = [];
    const img = $('todo-image-input');
    const cam = $('todo-camera-input');
    if (img) img.value = '';
    if (cam) cam.value = '';
    if ($('todo-note')) $('todo-note').value = '';
    if ($('todo-date')) $('todo-date').value = today();
    renderPreview();
  }
  function renderTodoCard(item){
    const id = itemId(item);
    const done = isDone(item);
    const imgs = parseImages(item?.image_filename || item?.images || item?.image);
    const first = imgs[0] || '';
    const date = clean(item?.due_date || '');
    const note = clean(item?.note || '');
    const createdBy = clean(item?.created_by || '');
    const createdAt = clean(item?.created_at || '');
    const chips = [
      `<span class="todo-chip ${dueClass(date)}">${esc(dueLabel(date))}</span>`,
      done ? '<span class="todo-chip todo-chip-accent">已完成</span>' : '<span class="todo-chip todo-chip-accent">未完成</span>',
      imgs.length > 1 ? `<span class="todo-chip">${imgs.length} 張照片</span>` : ''
    ].filter(Boolean).join('');
    const thumbs = imgs.length ? `<div class="todo-thumb-wrap"><div class="todo-thumb-grid">${imgs.map(name => `<img class="todo-thumb" src="${imageUrl(name)}" alt="代辦照片" onclick="window.open('${imageUrl(name)}','_blank')">`).join('')}</div></div>` : '<div class="empty-state-card compact-empty">無照片</div>';
    return `<div class="todo-card premium-todo-card glass ${done ? 'todo-card-done' : ''}" draggable="true" data-todo-id="${esc(id)}" data-todo-done="${done ? 1 : 0}">
      <div class="todo-card-top"><div class="todo-top-badges">${chips}</div><div class="todo-top-hint">${done ? '可還原或刪除' : '完成後可移到已完成區'}</div></div>
      <div class="todo-card-main">
        ${thumbs}
        <div class="todo-card-info">
          <div class="todo-title">${esc(note || '未填備忘')}</div>
          <div class="todo-meta-grid">
            <div class="todo-meta-item"><span class="todo-meta-label">日期</span><span class="todo-meta-value">${esc(date || '未設定')}</span></div>
            <div class="todo-meta-item"><span class="todo-meta-label">建立者</span><span class="todo-meta-value">${esc(createdBy || '—')}</span></div>
            <div class="todo-meta-item"><span class="todo-meta-label">建立時間</span><span class="todo-meta-value">${esc(createdAt || '—')}</span></div>
            <div class="todo-meta-item"><span class="todo-meta-label">狀態</span><span class="todo-meta-value">${done ? '已完成' : '未完成'}</span></div>
          </div>
        </div>
      </div>
      <div class="todo-card-actions">
        ${done ? `<button class="ghost-btn small-btn" type="button" data-todo-action="restore" data-id="${esc(id)}">還原</button>` : `<button class="primary-btn small-btn" type="button" data-todo-action="complete" data-id="${esc(id)}">完成</button>`}
        <button class="ghost-btn small-btn danger-btn" type="button" data-todo-action="delete" data-id="${esc(id)}">刪除</button>
      </div>
    </div>`;
  }
  function renderTodos(items){
    state.items = Array.isArray(items) ? items : [];
    const list = $('todo-list');
    if (!list) return;
    if (!state.items.length) {
      list.innerHTML = '<div class="empty-state-card"><div class="empty-state-title">目前沒有代辦事項</div><div>可上傳照片或拍照新增。</div></div>';
      return;
    }
    const active = state.items.filter(x => !isDone(x));
    const done = state.items.filter(isDone);
    const block = (heading, arr, doneFlag) => `<div class="todo-section-block" data-todo-group="${doneFlag ? 1 : 0}"><div class="todo-date-heading">${heading}（${arr.length}）</div>${arr.length ? arr.map(renderTodoCard).join('') : '<div class="empty-state-card compact-empty">沒有資料</div>'}</div>`;
    list.innerHTML = block('未完成', active, 0) + block('已完成', done, 1);
  }
  async function loadTodos(){
    try {
      const res = await fetch('/api/todos', {credentials:'same-origin', cache:'no-store'});
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) throw new Error(data.error || data.message || '代辦事項載入失敗');
      renderTodos(data.items || []);
    } catch(e) { toast(e.message || '代辦事項載入失敗', 'error'); }
  }
  async function saveTodoItem(){
    try {
      if (!state.files.length) { toast('請先上傳檔案或拍照', 'warn'); return; }
      setLoading(true);
      const fd = new FormData();
      state.files.forEach(f => fd.append('images', f));
      fd.append('note', clean($('todo-note')?.value || ''));
      fd.append('due_date', clean($('todo-date')?.value || ''));
      const res = await fetch('/api/todos', {method:'POST', credentials:'same-origin', body:fd});
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) throw new Error(data.error || data.message || '代辦事項儲存失敗');
      clearTodoForm();
      renderTodos(data.items || []);
      toast('新增代辦成功', 'ok');
    } catch(e) { toast(e.message || '代辦事項儲存失敗', 'error'); }
    finally { setLoading(false); }
  }
  async function todoAction(id, action){
    try {
      id = clean(id);
      if (!id) return;
      let url = `/api/todos/${encodeURIComponent(id)}`;
      let opt = {credentials:'same-origin', cache:'no-store'};
      if (action === 'complete' || action === 'restore') { url += `/${action}`; opt.method = 'POST'; }
      else if (action === 'delete') {
        if (!confirm('確定刪除這筆代辦？')) return;
        opt.method = 'DELETE';
      } else return;
      const res = await fetch(url, opt);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) throw new Error(data.error || data.message || '操作失敗');
      if (Array.isArray(data.items)) renderTodos(data.items); else await loadTodos();
      toast('已更新代辦事項', 'ok');
    } catch(e) { toast(e.message || '操作失敗', 'error'); }
  }
  async function reorderGroup(doneFlag){
    try {
      const group = document.querySelector(`[data-todo-group="${Number(doneFlag)}"]`);
      if (!group) return;
      const ids = Array.from(group.querySelectorAll('[data-todo-id]')).map(el => el.getAttribute('data-todo-id')).filter(Boolean);
      if (!ids.length) return;
      const res = await fetch('/api/todos/reorder', {method:'POST', credentials:'same-origin', cache:'no-store', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ids, done_flag:Number(doneFlag)})});
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) throw new Error(data.error || data.message || '排序失敗');
      if (Array.isArray(data.items)) renderTodos(data.items);
    } catch(e) { toast(e.message || '排序失敗', 'error'); }
  }
  function openTodoAlbumPicker(){ $('todo-image-input')?.click(); }
  function openTodoCameraPicker(){ $('todo-camera-input')?.click(); }
  function bind(){
    const date = $('todo-date');
    if (date && !date.value) date.value = today();
    const fileChange = e => {
      const files = Array.from(e.target.files || []).filter(Boolean);
      state.files = state.files.concat(files);
      renderPreview();
    };
    $('todo-image-input')?.addEventListener('change', fileChange);
    $('todo-camera-input')?.addEventListener('change', fileChange);
    document.addEventListener('click', e => {
      const btn = e.target.closest('[data-todo-action]');
      if (!btn) return;
      e.preventDefault();
      todoAction(btn.getAttribute('data-id'), btn.getAttribute('data-todo-action'));
    }, true);
    document.addEventListener('dragstart', e => {
      const card = e.target.closest('[data-todo-id]');
      if (!card) return;
      state.dragId = card.getAttribute('data-todo-id') || '';
      state.dragDone = card.getAttribute('data-todo-done') || '0';
      card.classList.add('is-dragging');
      try { e.dataTransfer.effectAllowed = 'move'; } catch(_e) {}
    });
    document.addEventListener('dragend', e => {
      const card = e.target.closest('[data-todo-id]');
      if (card) card.classList.remove('is-dragging');
      state.dragId = '';
    });
    document.addEventListener('dragover', e => {
      const card = e.target.closest('[data-todo-id]');
      if (card && card.getAttribute('data-todo-done') === state.dragDone) e.preventDefault();
    });
    document.addEventListener('drop', e => {
      const target = e.target.closest('[data-todo-id]');
      const dragging = state.dragId ? document.querySelector(`[data-todo-id="${CSS.escape(state.dragId)}"]`) : null;
      if (!target || !dragging || target === dragging || target.getAttribute('data-todo-done') !== state.dragDone) return;
      e.preventDefault();
      target.parentNode.insertBefore(dragging, target);
      reorderGroup(Number(state.dragDone || 0));
    });
  }

  const assign = (name, fn) => {
    if (YX && typeof YX.hardAssign === 'function' && typeof YX.mark === 'function') return YX.hardAssign(name, YX.mark(fn, `v20_${name}`), {allowReplace:true});
    window[name] = fn;
    return fn;
  };
  assign('openTodoAlbumPicker', openTodoAlbumPicker);
  assign('openTodoCameraPicker', openTodoCameraPicker);
  assign('saveTodoItem', saveTodoItem);
  assign('clearTodoForm', clearTodoForm);
  assign('loadTodos', loadTodos);
  assign('renderTodos', renderTodos);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { bind(); loadTodos(); });
  else { bind(); loadTodos(); }
})();
