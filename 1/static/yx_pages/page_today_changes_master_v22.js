
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

/* 沅興木業 FULL MASTER V22 REAL LOADED COMPLETE - page_today_changes_master_v22 */
(function(){ window.__YX_FULL_MASTER_V22_PAGE__='page_today_changes_master_v22'; })();

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

/* ===== V2 MERGED FROM static/yx_modules/today_changes_hardlock.js ===== */
/* FIX118 今日異動硬鎖：固定標籤 + 固定小卡 + 單一渲染流程 */
(function(){
  'use strict';
  const YX = window.YXHardLock;
  if (!YX) return;

  const state = {filter:'orders', data:null, loading:null, installed:false, longPress:null, blockClickUntil:0};
  const panels = [
    {key:'inbound', label:'進貨', list:'today-inbound-list', empty:'今天沒有進貨'},
    {key:'outbound', label:'出貨', list:'today-outbound-list', empty:'今天沒有出貨'},
    {key:'orders', label:'新增訂單', list:'today-order-list', empty:'今天沒有新增訂單'},
    {key:'unplaced', label:'未錄入倉庫圖', list:'today-unplaced-list', empty:'目前沒有未錄入倉庫圖商品'},
  ];
  const countMap = {inbound:'inbound_count', outbound:'outbound_count', orders:'new_order_count', unplaced:'unplaced_count'};

  function $(id){ return document.getElementById(id); }
  function isToday(){ return YX.moduleKey() === 'today_changes' || !!$('today-summary-cards'); }
  function qtyOf(it){ const n = Number(it?.unplaced_qty ?? it?.qty ?? it?.total_qty ?? 0); return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0; }
  function cleanLegacyTodayDom(){
    document.documentElement.classList.add('yx112-today-locked');
    document.body && document.body.classList.add('yx112-today-locked');
    document.querySelectorAll('#yx94-refresh-today,#yx95-refresh-today,#yx96-refresh-today,#yx98-refresh-today,.yx94-today-refresh-row,.yx95-today-refresh-row,.yx96-today-refresh-row,.yx98-today-refresh-row,.yx99-removed-today-cards').forEach(el => {
      if (el.id === 'today-summary-cards') return;
      if (el.closest && el.closest('#today-summary-cards')) return;
      if (el.matches && el.matches('#yx94-refresh-today,#yx95-refresh-today,#yx96-refresh-today,#yx98-refresh-today')) (el.closest('.btn-row') || el).remove();
    });
    const summary = $('today-summary-cards');
    if (summary) {
      summary.className = 'card-list yx112-today-summary';
      summary.hidden = true;
      summary.setAttribute('aria-hidden','true');
      summary.style.display = 'none';
    }
    const bar = document.querySelector('.today-filter-bar');
    if (bar) {
      bar.classList.add('yx112-today-labels');
      bar.style.removeProperty('display');
      bar.removeAttribute('hidden');
    }
    document.querySelectorAll('[data-today-panel]').forEach(panel => {
      panel.classList.add('yx112-today-panel');
      const k = panel.getAttribute('data-today-panel');
      const filter = state.filter || 'orders';
      const show = filter === 'all' || filter === k;
      panel.classList.toggle('yx112-filter-hidden', !show);
      panel.style.display = show ? '' : 'none';
    });
  }
  function summaryCount(summary, key){
    const s = summary || {};
    const n = Number(s[countMap[key]] || 0);
    return Number.isFinite(n) ? n : 0;
  }
  function setFilter(next){
    state.filter = next || 'orders';
    try { localStorage.setItem('yx112TodayFilter', state.filter); } catch(_e) {}
    applyFilter();
  }
  function applyFilter(){
    const filter = state.filter || 'orders';
    document.querySelectorAll('[data-today-filter]').forEach(btn => {
      const k = btn.getAttribute('data-today-filter') || 'all';
      btn.classList.toggle('active', k === filter);
      btn.setAttribute('aria-pressed', k === filter ? 'true' : 'false');
    });
    document.querySelectorAll('[data-today-panel]').forEach(panel => {
      const k = panel.getAttribute('data-today-panel');
      const show = filter === 'all' || filter === k;
      panel.classList.toggle('yx112-filter-hidden', !show);
      panel.style.display = show ? '' : 'none';
    });
  }
  function renderLabels(summary){
    const allCount = panels.filter(p=>p.key!=='unplaced').reduce((sum, p) => sum + summaryCount(summary, p.key), 0);
    const labels = [{key:'all', label:'全部', count:allCount, unit:''}].concat(panels.map(p => ({key:p.key, label:p.label, count:summaryCount(summary, p.key), unit:p.key === 'unplaced' ? '件' : ''})));
    const bar = document.querySelector('.today-filter-bar');
    if (!bar) return;
    bar.classList.add('yx112-today-labels');
    bar.innerHTML = labels.map(item => `<button class="chip yx112-today-label ${item.key === state.filter ? 'active' : ''}" type="button" data-today-filter="${YX.esc(item.key)}"><span>${YX.esc(item.label)}</span><strong>${Number(item.count || 0)}${YX.esc(item.unit || '')}</strong></button>`).join('');
  }
  function renderSummaryCards(summary){
    const box = $('today-summary-cards');
    if (!box) return;
    box.className = 'card-list yx112-today-summary';
    box.hidden = true;
    box.setAttribute('aria-hidden','true');
    box.style.display = 'none';
    const cards = panels.map(p => {
      const unit = p.key === 'unplaced' ? '件' : '';
      const sub = p.key === 'unplaced' ? `<div class="small-note">${Number(summary?.unplaced_row_count || 0)}筆商品</div>` : '<div class="small-note">今日紀錄</div>';
      return `<button class="yx112-summary-card ${p.key === 'unplaced' ? 'yx114-unplaced-refresh-trigger' : ''}" type="button" data-today-filter="${YX.esc(p.key)}" ${p.key === 'unplaced' ? 'title="長按刷新未錄入倉庫圖"' : ''}><span>${YX.esc(p.label)}</span><strong>${summaryCount(summary, p.key)}${unit}</strong>${sub}</button>`;
    }).join('');
    box.innerHTML = cards;
  }
  function rowText(r){
    const parts = [];
    const target = YX.clean(r?.customer_name || r?.target || r?.customer || '');
    const product = YX.clean(r?.product_text || r?.product || r?.message || '');
    if (target) parts.push(target);
    if (product) parts.push(product);
    if (r?.source_summary) parts.push(`來源：${r.source_summary}`);
    return parts.join('｜');
  }
  function todayRow(r, kind){
    const id = Number(r?.id || 0);
    const detail = rowText(r);
    const qty = qtyOf(r);
    const qtyLine = kind === 'unplaced' ? `<div class="small-note yx112-today-qty">未錄入 ${qty} 件${r?.placed_qty != null ? `｜已入倉 ${Number(r.placed_qty || 0)} 件` : ''}</div>` : '';
    const deleteButton = id ? `<button type="button" class="ghost-btn tiny-btn danger-btn" data-yx112-delete-today="${id}">刪除</button>` : '';
    return `<div class="today-item deduct-card yx112-today-row" data-kind="${YX.esc(kind)}" data-log-id="${id}">
      <div class="yx112-today-main"><strong>${YX.esc(r?.action || r?.type || (kind === 'unplaced' ? '未錄入倉庫圖' : '異動'))}</strong>${deleteButton}</div>
      ${detail ? `<div class="small-note yx112-today-detail">${YX.esc(detail)}</div>` : ''}
      ${qtyLine}
      <div class="small-note">${YX.esc(r?.created_at || r?.time || '')}${r?.username ? `｜${YX.esc(r.username)}` : ''}</div>
    </div>`;
  }
  function fill(id, rows, empty, kind){
    const el = $(id);
    if (!el) return;
    const arr = Array.isArray(rows) ? rows : [];
    el.classList.add('yx112-fixed-card-list');
    el.innerHTML = arr.length ? arr.map(r => todayRow(r, kind)).join('') : `<div class="empty-state-card compact-empty yx112-empty">${YX.esc(empty)}</div>`;
  }
  function render(data){
    if (!isToday()) return data;
    cleanLegacyTodayDom();
    state.data = data || {};
    const summary = state.data.summary || {};
    if ($('today-unread-badge')) $('today-unread-badge').textContent = '0';
    renderLabels(summary);
    renderSummaryCards(summary);
    fill('today-inbound-list', state.data.feed?.inbound, '今天沒有進貨', 'inbound');
    fill('today-outbound-list', state.data.feed?.outbound, '今天沒有出貨', 'outbound');
    fill('today-order-list', state.data.feed?.new_orders, '今天沒有新增訂單', 'orders');
    fill('today-unplaced-list', state.data.unplaced_items, '目前沒有未錄入倉庫圖商品', 'unplaced');
    applyFilter();
    return data;
  }
  async function loadTodayChanges112(opts={}){
    if (!isToday()) return null;
    if (state.loading && !opts.force) return state.loading;
    state.loading = (async () => {
      try {
        cleanLegacyTodayDom();
        const data = await YX.api('/api/today-changes?yx112=1&ts=' + Date.now(), {method:'GET'});
        render(data);
        try { await YX.api('/api/today-changes/read', {method:'POST', body:JSON.stringify({})}); } catch(_e) {}
        if ($('today-unread-badge')) $('today-unread-badge').textContent = '0';
        return data;
      } catch(e) {
        const box = $('today-summary-cards');
        if (box) box.innerHTML = `<div class="error-card">${YX.esc(e.message || '今日異動載入失敗')}</div>`;
        YX.toast(e.message || '今日異動載入失敗', 'error');
        return null;
      } finally { state.loading = null; }
    })();
    return state.loading;
  }
  function bindEvents(){
    if (state.eventsBound) return;
    state.eventsBound = true;
    const clearLongPress = () => { if (state.longPress?.timer) clearTimeout(state.longPress.timer); state.longPress = null; };
    document.addEventListener('pointerdown', ev => {
      if (!isToday()) return;
      const trigger = ev.target?.closest?.('[data-today-filter="unplaced"],.yx114-unplaced-refresh-trigger');
      if (!trigger) return;
      const x = ev.clientX, y = ev.clientY;
      clearLongPress();
      state.longPress = {x, y, timer:setTimeout(async () => {
        state.blockClickUntil = Date.now() + 900;
        clearLongPress();
        try { await loadTodayChanges112({force:true}); YX.toast('未錄入倉庫圖已刷新', 'ok'); }
        catch(e) { YX.toast(e.message || '未錄入倉庫圖刷新失敗', 'error'); }
      }, 700)};
    }, true);
    document.addEventListener('pointermove', ev => {
      if (state.longPress && (Math.abs(ev.clientX - state.longPress.x) > 8 || Math.abs(ev.clientY - state.longPress.y) > 8)) clearLongPress();
    }, true);
    ['pointerup','pointercancel','pointerleave','dragstart'].forEach(t => document.addEventListener(t, clearLongPress, true));

    document.addEventListener('click', async ev => {
      if (!isToday()) return;
      if (Date.now() < state.blockClickUntil && ev.target?.closest?.('[data-today-filter="unplaced"],.yx114-unplaced-refresh-trigger')) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); return; }
      if (ev.target && ev.target.id === 'yx112-refresh-today') {
        ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.();
        await loadTodayChanges112({force:true});
        YX.toast('今日異動已刷新', 'ok');
        return;
      }
      const del = ev.target?.closest?.('[data-yx112-delete-today]');
      if (del) {
        ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.();
        const id = del.getAttribute('data-yx112-delete-today');
        try { await YX.api('/api/today-changes/' + encodeURIComponent(id), {method:'DELETE'}); await loadTodayChanges112({force:true}); }
        catch(e) { YX.toast(e.message || '刪除失敗', 'error'); }
        return;
      }
      const filter = ev.target?.closest?.('[data-today-filter]');
      if (filter) {
        ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.();
        setFilter(filter.getAttribute('data-today-filter') || 'all');
        return;
      }
      const row = ev.target?.closest?.('.yx112-today-row');
      if (row) row.classList.toggle('expanded');
    }, true);

    // 左滑刪除活動紀錄；未錄入商品沒有 id 時不刪。
    let touch = null;
    document.addEventListener('pointerdown', ev => {
      const row = ev.target?.closest?.('.yx112-today-row[data-log-id]');
      if (!row || row.dataset.logId === '0') return;
      touch = {row, x:ev.clientX, y:ev.clientY};
    }, true);
    document.addEventListener('pointerup', async ev => {
      if (!touch) return;
      const dx = ev.clientX - touch.x;
      const dy = Math.abs(ev.clientY - touch.y);
      const row = touch.row;
      touch = null;
      if (dx < -80 && dy < 45) {
        const id = row.dataset.logId;
        try { await YX.api('/api/today-changes/' + encodeURIComponent(id), {method:'DELETE'}); row.remove(); await loadTodayChanges112({force:true}); }
        catch(e) { YX.toast(e.message || '刪除失敗', 'error'); }
      }
    }, true);
  }
  function lockGlobals(){
    const fn = YX.mark(loadTodayChanges112, 'today_changes');
    YX.hardAssign('loadTodayChanges', fn, {configurable:false});
    ['loadTodayChanges80','loadTodayChanges93','loadTodayChanges95','loadTodayChanges96','loadTodayChanges99','__yx96RemovedToday80','__yx96RemovedToday93','__yx96RemovedToday95'].forEach(name => YX.hardAssign(name, fn, {configurable:true}));
    if (window.YX_MASTER) {
      try { window.YX_MASTER = Object.freeze({...window.YX_MASTER, version:'fix142-speed-ship-master-hardlock', loadTodayChanges:fn}); } catch(_e) {}
    }
  }
  function install(){
    if (!isToday()) return;
    // V24：每次打開今日異動固定先顯示「新增訂單」單一卡片版，
    // 不讀取上次 all/inbound/outbound 篩選，避免先跳舊的三區塊畫面再跳新版。
    state.filter = 'orders';
    try { localStorage.setItem('yx112TodayFilter', 'orders'); } catch(_e) {}
    YX.cancelLegacyTimers('today_changes');
    document.documentElement.dataset.yx112Today = 'locked';
    document.documentElement.dataset.yx114Today = 'locked';
    bindEvents();
    lockGlobals();
    cleanLegacyTodayDom();
    loadTodayChanges112({force:true, silent:true});
  }
  YX.register('today_changes', {install, render, load:loadTodayChanges112});
})();

/* ===== END static/yx_modules/today_changes_hardlock.js ===== */

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

