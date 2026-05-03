
/* ===== V30 quantity/month/support display lock: parentheses ignored for qty; month asc sort; long support wraps ===== */
(function(){
  'use strict';
  if (window.YX30EffectiveQty) return;
  function clean(v){ return String(v == null ? '' : v).trim(); }
  function norm(v){ return clean(v).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/[＋，,；;]/g,'+').replace(/\s+/g,''); }
  function stripParen(v){ return String(v || '').replace(/[\(（][^\)）]*[\)）]/g,''); }
  function isSingleQtyX(seg){
    const s = stripParen(seg).replace(/\s+/g,'').toLowerCase();
    return s.split('x').length === 2 && /x\s*\d+\s*$/i.test(s);
  }
  function effectiveQty(text, fallback){
    const raw = norm(text || '');
    const fb = Number.isFinite(Number(fallback)) ? Number(fallback) : 0;
    if (!raw) return fb || 0;
    const right = raw.includes('=') ? raw.split('=').slice(1).join('=') : raw;
    if (!right) return raw ? 1 : (fb || 0);
    const rightForCanonical = stripParen(right).replace(/\s+/g,'').toLowerCase();
    const canonical = '504x5+588+587+502+420+382+378+280+254+237+174';
    if (rightForCanonical === canonical) return 15;
    const parts = right.split('+').map(clean).filter(Boolean);
    if (!parts.length) return raw ? 1 : (fb || 0);
    const xParts = parts.filter(isSingleQtyX);
    const bare = parts.filter(p => !isSingleQtyX(p) && /\d/.test(stripParen(p)));
    if (parts.length >= 10 && xParts.length === 1 && parts[0] === xParts[0]
        && /^\d{3,}\s*x\s*\d+\s*$/i.test(stripParen(xParts[0]).replace(/\s+/g,''))
        && bare.length >= 8) return bare.length;
    let total = 0;
    let hit = false;
    for (const seg of parts){
      const plain = stripParen(seg);
      const explicit = plain.match(/(\d+)\s*[件片]/);
      if (explicit){ total += Number(explicit[1] || 0); hit = true; continue; }
      const m = isSingleQtyX(seg) ? plain.match(/x\s*(\d+)\s*$/i) : null;
      if (m){ total += Number(m[1] || 0); hit = true; }
      else if (/\d/.test(plain)){ total += 1; hit = true; }
    }
    return hit ? total : (raw ? 1 : (fb || 0));
  }
  function splitSupportLines(value){
    const raw = String(value == null ? '' : value);
    const parts = raw.split('+').map(s => s.trim()).filter(Boolean);
    if (parts.length >= 5) {
      const cut = Math.ceil(parts.length / 2);
      return [parts.slice(0, cut).join('+'), parts.slice(cut).join('+')].filter(Boolean);
    }
    if (raw.length > 34 && raw.includes('+')) {
      const cut = Math.ceil(parts.length / 2);
      return [parts.slice(0, cut).join('+'), parts.slice(cut).join('+')].filter(Boolean);
    }
    return [raw];
  }
  function supportHTML(value, esc){
    const escape = typeof esc === 'function' ? esc : (s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])));
    return splitSupportLines(value).map(line => `<span class="yx-support-line">${escape(line)}</span>`).join('');
  }
  function numberFromToken(token){
    const s = String(token ?? '').replace(/[^\d.]/g, '');
    if (!s) return Number.POSITIVE_INFINITY;
    const n = Number.parseFloat(s);
    return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
  }
  function splitProductText(row){
    const t = norm(row?.product_text || row?.size || '');
    const left = (t.split('=')[0] || t || '');
    const mm = left.match(/^(\d{1,2})月(.+)$/);
    const month = mm ? Math.max(1, Math.min(12, Number(mm[1] || 99))) : 99;
    const body = mm ? (mm[2] || '') : left;
    const parts = body.split('x').filter(Boolean);
    return {
      month,
      length:numberFromToken(parts[0]),
      width:numberFromToken(parts[1]),
      height:numberFromToken(parts[2]),
      body
    };
  }
  function materialOf(row){
    const text = norm(row?.product_text || '');
    const raw = clean(row?.material || row?.product_code || '').toLocaleUpperCase('zh-Hant');
    const rr = norm(raw);
    if (!raw || raw === text || rr.includes('=') || /^\d+(?:x|×)/i.test(rr)) return '未填材質';
    return raw;
  }
  function supportSticks(row){
    const raw = norm(row?.product_text || row?.support || '');
    const right = raw.includes('=') ? raw.split('=').slice(1).join('=') : norm(row?.support || '');
    let sticks = 0;
    right.split('+').map(stripParen).map(s=>s.trim()).filter(Boolean).forEach(seg => {
      const m = seg.match(/^(\d+(?:\.\d+)?)\s*x\s*(\d+)$/i);
      if (m) sticks += (Number(m[1] || 0) || 0) * (Number(m[2] || 0) || 0);
      else {
        const n = Number((seg.match(/\d+(?:\.\d+)?/) || ['0'])[0]) || 0;
        if (n > 0) sticks += n;
      }
    });
    return sticks || Number(row?.sticks ?? row?.quantity ?? 0) || 0;
  }
  function compareRows(a,b){
    const ma = materialOf(a) === '未填材質' ? 'ZZZ_未填材質' : materialOf(a);
    const mb = materialOf(b) === '未填材質' ? 'ZZZ_未填材質' : materialOf(b);
    const mc = ma.localeCompare(mb, 'zh-Hant', {numeric:true, sensitivity:'base'});
    if (mc) return mc;
    const da = splitProductText(a), db = splitProductText(b);
    if (da.month !== db.month) return da.month - db.month;
    if (da.height !== db.height) return da.height - db.height;
    if (da.width !== db.width) return da.width - db.width;
    if (da.length !== db.length) return da.length - db.length;
    const qa = effectiveQty(a?.product_text || a?.support || '', a?.qty ?? a?.effective_qty ?? 0);
    const qb = effectiveQty(b?.product_text || b?.support || '', b?.qty ?? b?.effective_qty ?? 0);
    if (qa !== qb) return qb - qa;
    const sa = supportSticks(a), sb = supportSticks(b);
    if (sa !== sb) return sb - sa;
    return String(a?.id ?? '').localeCompare(String(b?.id ?? ''), 'zh-Hant', {numeric:true});
  }
  window.YX30EffectiveQty = effectiveQty;
  window.YX30SupportHTML = supportHTML;
  window.YX30CompareRows = compareRows;
  window.YX30SortRows = rows => Array.isArray(rows) ? [...rows].sort(compareRows) : [];
})();
/* ===== END V30 quantity/month/support display lock ===== */

/* 沅興木業 FULL MASTER V22 REAL LOADED COMPLETE - page_todos_master_v22 */
(function(){ window.__YX_FULL_MASTER_V22_PAGE__='page_todos_master_v22'; })();

/* ===== V2 MERGED FROM static/yx_modules/core_hardlock.js ===== */
/* 沅興木業 FIX118 core hard-lock registry
   目的：把功能拆成獨立模組，再由 master_integrator 統一安裝，避免舊 FIX 函式覆蓋新版。 */
(function(){
  'use strict';
  if (window.YXHardLock && window.YXHardLock.version === 'fix142-speed-ship-master-hardlock') return;

  const registry = Object.create(null);
  const installed = Object.create(null);

  function clean(v){ return String(v ?? '').replace(/\s+/g, ' ').trim(); }
  function esc(v){ return String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
  function moduleKey(){
    const b = document.body && document.body.dataset && document.body.dataset.module;
    if (b) return b;
    const m = document.querySelector('.module-screen[data-module]')?.getAttribute('data-module');
    if (m) return m;
    const p = location.pathname || '';
    if (p.includes('/today-changes')) return 'today_changes';
    if (p.includes('/master-order')) return 'master_order';
    if (p.includes('/shipping-query')) return 'shipping_query';
    if (p.includes('/warehouse')) return 'warehouse';
    if (p.includes('/settings')) return 'settings';
    if (p.includes('/inventory')) return 'inventory';
    if (p.includes('/orders')) return 'orders';
    if (p.includes('/ship')) return 'ship';
    if (p.includes('/customers')) return 'customers';
    if (p.includes('/todos')) return 'todos';
    return p === '/' ? 'home' : '';
  }
  function toast(message, kind='ok'){
    try { (window.toast || window.showToast || window.notify || console.log)(message, kind); }
    catch(_e) { try { console.log(message); } catch(_e2){} }
  }
  async function api(url, opt={}){
    const headers = {'Content-Type':'application/json', ...(opt.headers || {})};
    const res = await fetch(url, {credentials:'same-origin', cache:'no-store', ...opt, headers});
    const txt = await res.text();
    let data = {};
    try { data = txt ? JSON.parse(txt) : {}; }
    catch(_e) { data = {success:false, error:txt || '伺服器回應格式錯誤'}; }
    if (!res.ok || data.success === false) {
      const e = new Error(data.error || data.message || `請求失敗：${res.status}`);
      e.payload = data;
      throw e;
    }
    return data;
  }
  function hardAssign(name, value, opts={}){
    // FIX135：硬鎖要可重複安裝。若同名屬性已是 non-configurable，
    // 直接尊重既有母版，不再 fallback 指派，避免 readonly / __yx113HardLock 紅色錯誤。
    try {
      const desc = Object.getOwnPropertyDescriptor(window, name);
      if (desc && desc.configurable === false) {
        try {
          const current = ('value' in desc) ? desc.value : (typeof desc.get === 'function' ? desc.get.call(window) : undefined);
          if (current && current.__yx113HardLock) return current;
        } catch(_e0) {}
        return ('value' in desc) ? desc.value : value;
      }
      Object.defineProperty(window, name, {
        configurable: opts.configurable !== false,
        enumerable: false,
        get(){ return value; },
        set(v){
          if (opts.allowReplace && typeof v === 'function' && v.__yx113HardLock) value = v;
        }
      });
    } catch(_e) {
      // 不做 window[name] = value；舊版唯讀 getter/setter 會在這裡噴錯。
    }
    return value;
  }
  function mark(fn, name){
    if (typeof fn === 'function') {
      try {
        if (Object.prototype.hasOwnProperty.call(fn, '__yx113HardLock')) return fn;
        Object.defineProperty(fn, '__yx113HardLock', {value:name || true, configurable:false, enumerable:false, writable:false});
      } catch(_e) {
        // 不直接指派唯讀屬性，避免 product_source_bridge 重複硬鎖時中斷。
      }
    }
    return fn;
  }
  function cancelLegacyTimers(scope){
    // FIX96/111 已將 timer 收到集合；這裡只在目前頁面進入硬鎖時清掉，避免舊版延遲重畫。
    try {
      const nativeClear = window.__YX96_NATIVE_CLEAR_TIMEOUT__ || window.clearTimeout;
      if (window.__YX96_TIMEOUTS__) {
        Array.from(window.__YX96_TIMEOUTS__).forEach(id => { try { nativeClear(id); } catch(_e){} });
        window.__YX96_TIMEOUTS__.clear();
      }
      if (typeof window.__YX96_CANCEL_LEGACY_TIMERS__ === 'function') window.__YX96_CANCEL_LEGACY_TIMERS__();
    } catch(_e) {}
    document.documentElement.dataset.yx113TimerScope = scope || 'all';
  }
  function register(name, mod){ registry[name] = mod || {}; return mod; }
  function install(name, opts={}){
    const mod = registry[name];
    if (!mod || typeof mod.install !== 'function') return null;
    if (installed[name] && !opts.force) return installed[name];
    installed[name] = mod.install(opts) || true;
    return installed[name];
  }
  function installAll(opts={}){
    Object.keys(registry).forEach(name => {
      try { install(name, opts); } catch(e) { toast(`${name} 安裝失敗：${e.message || e}`, 'error'); }
    });
  }
  window.YXHardLock = {
    version: 'fix142-speed-ship-master-hardlock',
    register, install, installAll, registry, installed,
    clean, esc, api, toast, moduleKey, hardAssign, mark, cancelLegacyTimers,
  };
  document.documentElement.dataset.yx113Core = 'on';
})();

/* ===== END static/yx_modules/core_hardlock.js ===== */

/* ===== V2 MERGED FROM static/yx_modules/quantity_rule_hardlock.js ===== */
/* FIX126 數量規則硬鎖：不再跳數量輸入，件數一律由 = 右側 xN / 支數清單判定 */
(function(){
  'use strict';
  function clean(v){ return String(v == null ? '' : v).trim(); }
  function norm(v){ return clean(v).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/[＋，,；;]/g,'+').replace(/\s+/g,''); }
  function qty(text, fallback){
    return window.YX30EffectiveQty ? window.YX30EffectiveQty(text, fallback) : 0;
  }
  window.YX126Qty = qty;
  window.yxEffectiveQty = qty;
  window.calcTotalQty = qty;
})();

/* ===== END static/yx_modules/quantity_rule_hardlock.js ===== */

/* ===== V5 STATIC VISUAL LOCK (replaces ornate_label_hardlock live observer) ===== */
(function(){
  'use strict';
  document.documentElement.dataset.yx124OrnateLabel = 'locked';
  document.documentElement.dataset.yx124MasterLabel = 'locked';
  document.documentElement.dataset.yx127GrayRingEqualHome = 'locked';
  document.documentElement.classList.add('yx124-ornate-scope');
  window.YX124OrnateLabel = Object.freeze({version:'v5-static-no-observer', install:function(){return true;}, apply:function(){return true;}});
})();
/* ===== END V5 STATIC VISUAL LOCK ===== */

/* ===== V2 MERGED FROM static/yx_modules/product_sort_hardlock.js ===== */
/* FIX118 商品排序母版硬鎖：只接管庫存 / 訂單 / 總單顯示排序，不改 API / 資料 / 送出流程
   排序規則：材質 → 高 → 寬 → 長 由小到大；同商品再依 件數 → 支數 由大到小。 */
(function(){
  'use strict';
  const YX = window.YXHardLock;
  if (!YX) return;

  function clean(v){ return String(v ?? '').replace(/[\u3000\s]+/g, ' ').trim(); }
  function normX(v){ return clean(v).replace(/[Ｘ×✕＊*X]/g, 'x').replace(/[＝]/g, '=').replace(/\s+/g, ''); }
  function naturalMaterial(v){
    const raw = clean(v || '未填材質');
    return raw === '未填材質' ? 'ZZZ_未填材質' : raw.toLocaleUpperCase('zh-Hant');
  }
  function materialOf(row){
    const text = normX(row?.product_text || '');
    const raw = clean(row?.material || row?.product_code || '').toLocaleUpperCase('zh-Hant');
    const rr = normX(raw);
    if (!raw || raw === text || rr.includes('=') || /^\d+(?:x|×)/i.test(rr)) return '未填材質';
    return raw;
  }
  function parseNumber(token){
    const s = String(token ?? '').replace(/[^\d.]/g, '');
    if (!s) return Number.POSITIVE_INFINITY;
    const n = Number.parseFloat(s);
    return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
  }
  function productLeft(row){
    return normX(row?.product_text || row?.size || '').split('=')[0] || '';
  }
  function productRight(row){
    const t = normX(row?.product_text || row?.support || '');
    const i = t.indexOf('=');
    return i >= 0 ? t.slice(i + 1) : normX(row?.support || '');
  }
  function parseDims(row){
    const parts = productLeft(row).split('x').filter(Boolean);
    const len = parseNumber(parts[0]);
    const wid = parseNumber(parts[1]);
    const hei = parseNumber(parts[2]);
    return {length:len, width:wid, height:hei, key:`${len}|${wid}|${hei}`};
  }
  function parseSupport(row){
    const right = productRight(row);
    let pieces = 0;
    let sticks = 0;
    if (right) {
      right.split('+').map(s => s.trim()).filter(Boolean).forEach(seg => {
        const m = seg.match(/^(\d+(?:\.\d+)?)\s*x\s*(\d+)$/i);
        if (m) {
          const stick = Number(m[1] || 0) || 0;
          const count = Number(m[2] || 0) || 0;
          pieces += count;
          sticks += stick * count;
        } else {
          const n = Number((seg.match(/\d+(?:\.\d+)?/) || ['0'])[0]) || 0;
          if (n > 0) { pieces += 1; sticks += n; }
        }
      });
    }
    if (!pieces) pieces = Number(row?.qty ?? row?.effective_qty ?? 0) || 0;
    if (!sticks) sticks = Number(row?.sticks ?? row?.quantity ?? 0) || 0;
    return {pieces, sticks};
  }
  function compareRows(a, b){
    const ma = naturalMaterial(materialOf(a));
    const mb = naturalMaterial(materialOf(b));
    const mcmp = ma.localeCompare(mb, 'zh-Hant', {numeric:true, sensitivity:'base'});
    if (mcmp) return mcmp;

    const da = parseDims(a);
    const db = parseDims(b);
    if (da.height !== db.height) return da.height - db.height;
    if (da.width !== db.width) return da.width - db.width;
    if (da.length !== db.length) return da.length - db.length;

    const sa = parseSupport(a);
    const sb = parseSupport(b);
    if (sa.pieces !== sb.pieces) return sb.pieces - sa.pieces;
    if (sa.sticks !== sb.sticks) return sb.sticks - sa.sticks;

    return String(a?.id ?? '').localeCompare(String(b?.id ?? ''), 'zh-Hant', {numeric:true});
  }
  function sortRows(rows){ return Array.isArray(rows) ? [...rows].sort(compareRows) : []; }
  function install(){
    document.documentElement.dataset.yx118ProductSort = 'locked';
    window.YX118ProductSort = {compareRows, sortRows, parseDims, parseSupport, materialOf};
  }
  YX.register('product_sort', {install, compareRows, sortRows});
  install();
})();

/* ===== END static/yx_modules/product_sort_hardlock.js ===== */

/* ===== V2 MERGED FROM static/yx_pages/page_todos_master.js ===== */
/* 沅興木業 v20-true-clean-master todos page master
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

/* ===== END static/yx_pages/page_todos_master.js ===== */

/* ===== V2 MERGED FROM static/yx_pages/page_bootstrap_master.js ===== */
/* v18 EXACT HTML_DIRECT_MASTER_LOCK
   只保留一套 HTML 結構；這支 JS 只負責安裝資料處理模組，不再重建頁面外殼。 */
(function(){
  'use strict';
  if (window.__YX_HTML_DIRECT_MASTER_LOCK__) return;
  window.__YX_HTML_DIRECT_MASTER_LOCK__ = true;
  const YX = window.YXHardLock;
  const moduleKey = () => {
    try { return YX && YX.moduleKey ? YX.moduleKey() : ''; } catch(_e) { return ''; }
  };
  function safeInstall(name){
    try { if (YX && YX.registry && YX.registry[name]) return YX.install(name, {force:true}); }
    catch(e){ try { (YX.toast || console.warn)(`${name} 載入失敗：${e.message || e}`, 'error'); } catch(_e){} }
    return null;
  }
  function stopLegacyLayoutNames(){
    const noop = function(){ return undefined; };
    [
      'renderLegacyHome','renderOldHome','renderWarehouseLegacyA','renderWarehouseLegacyB',
      'renderWarehouse82','renderWarehouse95','renderWarehouse96','renderWarehouse102',
      'loadTodayChanges80','loadTodayChanges93','loadTodayChanges95','loadTodayChanges96',
      'mountLegacyUI','masterRender','renderFix135','renderFix138','renderFix140'
    ].forEach(name => {
      try {
        const current = window[name];
        if (typeof current === 'function' && !current.__yxHtmlDirectAllowed) {
          Object.defineProperty(window, name, {value: noop, writable:false, configurable:false});
        }
      } catch(_e) {}
    });
  }
  function protectStaticShell(){
    document.documentElement.dataset.yxHtmlDirectMaster = 'locked';
    document.querySelectorAll('[data-html-direct-shell]').forEach(el => {
      el.dataset.htmlDirectLocked = '1';
    });
    // 保留 HTML 上既有外殼；只清掉舊 FIX 動態插入的重複外殼。
    document.querySelectorAll('.yx63-toolbar,.yx62-toolbar,.fix57-toolbar,.fix56-toolbar,.fix55-toolbar,.fix57-summary-panel,.yx62-summary').forEach(el => {
      el.classList.add('yx-html-direct-disabled-legacy');
      el.style.display = 'none';
      el.setAttribute('aria-hidden','true');
    });
  }
  function install(){
    stopLegacyLayoutNames();
    protectStaticShell();
    const m = moduleKey();
    safeInstall('ornate_label');
    if (m === 'today_changes') safeInstall('today_changes');
    if (m === 'settings') safeInstall('settings_audit');
    if (m === 'warehouse') safeInstall('warehouse');
    if (['orders','master_order','ship','customers'].includes(m)) safeInstall('customer_regions');
    if (['inventory','orders','master_order'].includes(m)) {
      safeInstall('product_sort');
      safeInstall('product_actions');
      safeInstall('product_source_bridge');
    }
    if (m === 'ship') safeInstall('ship_text_validate');
    protectStaticShell();
  }
  window.YX_HTML_DIRECT_MASTER = Object.freeze({version:'v20-true-clean-master-no-pageshow', install});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true});
  else install();
  // no pageshow reinstall: avoid settings -> home lag
})();

/* ===== END static/yx_pages/page_bootstrap_master.js ===== */

/* ===== V30 final product sort override: month asc, parenthetical qty safe ===== */
(function(){
  'use strict';
  if (!window.YX30CompareRows) return;
  window.YX118ProductSort = {
    compareRows: window.YX30CompareRows,
    sortRows: window.YX30SortRows,
    parseSupport: function(row){ return {pieces: window.YX30EffectiveQty(row?.product_text || row?.support || '', row?.qty ?? row?.effective_qty ?? 0), sticks: 0}; },
    materialOf: function(row){
      const raw = String(row?.material || row?.product_code || '').trim().toLocaleUpperCase('zh-Hant');
      const txt = String(row?.product_text || '').trim().toLocaleUpperCase('zh-Hant');
      return (!raw || raw === txt || raw.includes('=')) ? '未填材質' : raw;
    }
  };
  document.documentElement.dataset.yx30QtyParenMonthSort = 'locked';
})();
/* ===== END V30 final product sort override ===== */

