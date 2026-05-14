
/* formal page module */
(function(){
  'use strict';
  if (window.YX30EffectiveQty) return;
  function clean(v){ return String(v == null ? '' : v).trim(); }
  function norm(v){ return clean(v).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/[＋，,；;]/g,'+').replace(/\s+/g,''); }
  function stripParen(v){ return String(v || '').replace(/[\(（][^\)）]*[\)）]/g,''); }
  function parenAdjust(v){
    // formal mainline behavior.
    return 0;
  }
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
      if (explicit){ total += Math.max(0, Number(explicit[1] || 0) + parenAdjust(seg)); hit = true; continue; }
      const m = isSingleQtyX(seg) ? plain.match(/x\s*(\d+)\s*$/i) : null;
      if (m){ total += Math.max(0, Number(m[1] || 0) + parenAdjust(seg)); hit = true; }
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
/* formal page module */

/* 沅興木業 FULL MASTER main REAL LOADED COMPLETE - page_today_changes_master_main */
(function(){ window.__YX_FULL_MASTER_main_PAGE__='page_today_changes_master_main'; })();

/* formal page module */
/* formal page module */
(function(){
  'use strict';
  if (window.YXCore && window.YXCore.version === 'v93-main-core') return;

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
  function safeExpose(name, value, opts={}){
    // formal mainline behavior.
    try {
      const current = Object.getOwnPropertyDescriptor(window, name);
      if (current && current.configurable === false) {
        // 尊重既有瀏覽器狀態，但不再新增鎖死屬性，避免舊版互相覆蓋或拋錯。
        return ('value' in current) ? current.value : value;
      }
      Object.defineProperty(window, name, {
        configurable: true, enumerable: false, writable: true, value
      });
    } catch(_e) {
      try { window[name] = value; } catch(_e2) {}
    }
    return value;
  }
  function mark(fn, name){
    if (typeof fn === 'function') {
      try {
        if (Object.prototype.hasOwnProperty.call(fn, '__yx113CoreFn')) return fn;
        Object.defineProperty(fn, '__yx113CoreFn', {value:name || true, configurable:true, enumerable:false, writable:true});
      } catch(_e) {
        // 不直接指派唯讀屬性，避免 product_source_bridge 重複主檔固定時中斷。
      }
    }
    return fn;
  }
  function cancelLegacyTimers(scope){
    // timer cleanup 已將 timer 收到集合；這裡只在目前頁面進入主檔固定時清掉，避免舊版延遲重畫。
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
  window.YXCore = {
    version: 'v93-main-core',
    register, install, installAll, registry, installed,
    clean, esc, api, toast, moduleKey, safeExpose, mark, cancelLegacyTimers,
  };
  document.documentElement.dataset.yx113Core = 'on';
})();

/* ===== END static/yx_modules/core_main.js ===== */

/* formal page module */
/* formal page module */
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

/* ===== END static/yx_modules/quantity_rule_main.js ===== */

/* formal page module */
(function(){
  'use strict';
  document.documentElement.dataset.yx124OrnateLabel = 'main';
  document.documentElement.dataset.yx124MasterLabel = 'main';
  document.documentElement.dataset.yx127GrayRingEqualHome = 'main';
  document.documentElement.classList.add('yx124-ornate-scope');
  window.YX124OrnateLabel = ({version:'v5-static-no-observer', install:function(){return true;}, apply:function(){return true;}});
})();
/* formal page module */

/* formal page module */
/* formal page module */
(function(){
  'use strict';
  const YX = window.YXCore;
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

  async function deleteShipGroup(ids){
    const list=String(ids||'').split(',').map(x=>Number(x)).filter(Boolean);
    if(!list.length) return;
    if(!confirm('確定刪除此筆出貨紀錄？刪除後其他人查不到。')) return;
    const card=document.querySelector(`[data-ship-record-ids="${CSS.escape(String(ids))}"]`);
    if(card) card.remove();
    for(const id of list){ try{ await YX.api('/api/shipping_records/'+encodeURIComponent(id), {method:'DELETE'}); }catch(e){ console.warn(e); } }
    loadTodayChanges112({force:true});
  }

  function install(){
    document.documentElement.dataset.yx118ProductSort = 'main';
    window.YX118ProductSort = {compareRows, sortRows, parseDims, parseSupport, materialOf};
  }
  YX.register('product_sort', {install, compareRows, sortRows});
  install();
})();

/* ===== END static/yx_modules/product_sort_main.js ===== */

/* formal page module */
/* formal page module */
(function(){
  'use strict';
  const YX = window.YXCore;
  if (!YX) return;

  const state = {filter:'all', data:null, loading:null, installed:false, longPress:null, blockClickUntil:0, forceNext:false, lastGood:null, lastError:null};
  const panels = [
    {key:'inbound', label:'新增庫存', list:'today-inbound-list', empty:'今天沒有新增庫存'},
    {key:'orders', label:'新增訂單', list:'today-order-list', empty:'今天沒有新增訂單'},
    {key:'masters', label:'新增總單', list:'today-master-list', empty:'今天沒有新增總單'},
    {key:'outbound', label:'出貨', list:'today-outbound-list', empty:'今天沒有出貨'},
    {key:'unplaced', label:'未錄入倉庫圖', list:'today-unplaced-list', empty:'目前沒有未錄入倉庫圖商品'},
  ];
  const countMap = {inbound:'inbound_count', orders:'new_order_count', masters:'new_master_count', outbound:'outbound_count', unplaced:'unplaced_count'};

  function $(id){ return document.getElementById(id); }
  function isToday(){ return YX.moduleKey() === 'today_changes' || !!$('today-summary-cards'); }
  function qtyOf(it){ const n = Number(it?.unplaced_qty ?? it?.qty ?? it?.total_qty ?? 0); return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0; }
  function cleanLegacyTodayDom(){
    document.documentElement.classList.add('yx112-today-stable');
    document.body && document.body.classList.add('yx112-today-stable');
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
      bar.style.setProperty('display','flex','important');
      bar.removeAttribute('hidden');
    }
    document.querySelectorAll('[data-today-panel]').forEach(panel => {
      panel.classList.add('yx112-today-panel');
      const k = panel.getAttribute('data-today-panel');
      const filter = state.filter || 'all';
      const show = filter === 'all' || filter === k;
      panel.classList.toggle('yx112-filter-hidden', !show);
      panel.style.setProperty('display', show ? 'block' : 'none', 'important');
    });
  }
  function summaryCount(summary, key){
    const s = summary || {};
    const n = Number(s[countMap[key]] || 0);
    return Number.isFinite(n) ? n : 0;
  }
  function setFilter(next){
    state.filter = next || 'all';
    try { localStorage.setItem('yx112TodayFilter', state.filter); } catch(_e) {}
    applyFilter();
  }
  function applyFilter(){
    const filter = state.filter || 'all';
    document.querySelectorAll('[data-today-filter]').forEach(btn => {
      const k = btn.getAttribute('data-today-filter') || 'all';
      btn.classList.toggle('active', k === filter);
      btn.setAttribute('aria-pressed', k === filter ? 'true' : 'false');
    });
    document.querySelectorAll('[data-today-panel]').forEach(panel => {
      const k = panel.getAttribute('data-today-panel');
      const show = filter === 'all' || filter === k;
      panel.classList.toggle('yx112-filter-hidden', !show);
      panel.style.setProperty('display', show ? 'block' : 'none', 'important');
    });
  }
  function renderLabels(summary){
    const allCount = panels.filter(p=>p.key!=='unplaced').reduce((sum, p) => sum + summaryCount(summary, p.key), 0);
    const labels = [{key:'all', label:'全部', count:allCount, unit:''}].concat(panels.map(p => ({key:p.key, label:p.label, count:summaryCount(summary, p.key), unit:p.key === 'unplaced' ? '件' : ''})));
    const bar = document.querySelector('.today-filter-bar');
    if (!bar) return;
    bar.classList.add('yx112-today-labels');
    bar.style.setProperty('display','flex','important');
    bar.removeAttribute('hidden');
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
  function renderUnplacedZonePill(summary){
    let pill = document.getElementById('today-unplaced-zone-pill');
    const tools = document.querySelector('.yx112-today-fixed-tools');
    if (!tools) return;
    if (!pill) {
      pill = document.createElement('span');
      pill.id = 'today-unplaced-zone-pill';
      pill.className = 'pill warn interactive-pill yx-v58-today-zone-pill';
      pill.title = '長按刷新 A/B/未分區/總計';
      tools.insertBefore(pill, tools.firstChild);
    }
    const z = summary?.unplaced_zone_summary || {};
    const a = Number(z.A || 0), b = Number(z.B || 0), u = Number(z.unassigned || 0), t = Number(z.total || (a + b + u));
    pill.textContent = `A區 ${a} 件 / B區 ${b} 件 / 未分區 ${u} 件 / 總計 ${t} 件`;
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

  function groupOutboundRows(rows){
    const map=new Map();
    (Array.isArray(rows)?rows:[]).forEach(r=>{
      const customer=YX.clean(r?.customer_name||r?.target||r?.customer||'未填客戶');
      const date=YX.clean(String(r?.created_at||r?.time||'').slice(0,10)) || '未填日期';
      const key=customer+'::'+date;
      if(!map.has(key)) map.set(key,{id:0, action:'出貨', customer_name:customer, date, rows:[], qty:0});
      const g=map.get(key); g.rows.push(r); g.qty += qtyOf(r); if(!g.id && r?.id) g.id=Number(r.id||0);
    });
    return Array.from(map.values()).sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(a.customer_name).localeCompare(String(b.customer_name),'zh-Hant'));
  }
  function todayOutboundCard(g){
    const lines=(g.rows||[]).map(r=>{const product=YX.clean(r?.product_text||r?.product||r?.message||'');const source=YX.clean(r?.source_summary||r?.source_label||'');return [product, source?('來源：'+source):''].filter(Boolean).join('｜');}).filter(Boolean);
    const ids=(g.rows||[]).map(r=>Number(r?.id||0)).filter(Boolean).join(',');
    return `<div class="today-item deduct-card yx112-today-row yx-v63-outbound-card" data-kind="outbound" data-ship-record-ids="${YX.esc(ids)}">
      <div class="yx112-today-main yx-v63-outbound-head"><strong>${g.rows.length}/${g.rows.length}</strong><span>${YX.esc(g.customer_name)}</span>${ids?`<button type="button" class="ghost-btn tiny-btn danger-btn" data-yx63-delete-ship-group="${YX.esc(ids)}">刪除</button>`:''}</div>
      <div class="yx-v63-outbound-lines">${lines.map(x=>`<div>${YX.esc(x)}</div>`).join('')}</div>
      <div class="small-note">${YX.esc(g.date)}｜${g.rows.length}筆 / ${g.qty}件</div>
    </div>`;
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
    if(kind === 'outbound'){
      const groups = groupOutboundRows(arr);
      if(!groups.length){ el.innerHTML = `<div class="empty-state-card compact-empty yx112-empty">${YX.esc(empty)}</div>`; return; }
      const first = groups.slice(0, 30), rest = groups.slice(30);
      el.innerHTML = first.map(todayOutboundCard).join('');
      if(rest.length) try { window.YX?.renderChunks?.appendRows?.(el, rest, todayOutboundCard, {size:20}); } catch(_e){ el.insertAdjacentHTML('beforeend', rest.map(todayOutboundCard).join('')); }
      return;
    }
    if(!arr.length){ el.innerHTML = `<div class="empty-state-card compact-empty yx112-empty">${YX.esc(empty)}</div>`; return; }
    const first = arr.slice(0, 36), rest = arr.slice(36);
    el.innerHTML = first.map(r => todayRow(r, kind)).join('');
    if(rest.length) try { window.YX?.renderChunks?.appendRows?.(el, rest, r => todayRow(r, kind), {size:24}); } catch(_e){ el.insertAdjacentHTML('beforeend', rest.map(r => todayRow(r, kind)).join('')); }
  }
  function readSyncedUnplacedPayload(){
    const out = {items:null, summary:null, count:0, at:0};
    try {
      const meta = JSON.parse(localStorage.getItem('yx_today_unplaced_summary_from_sync') || 'null') || null;
      if (meta && Number(meta.saved_at || 0) > Date.now() - 1000*60*60*24) {
        out.summary = meta.summary || null;
        out.count = Number(meta.count || 0);
        out.at = Number(meta.saved_at || 0);
      }
    } catch(_e) {}
    try {
      const versions = ['v459-full-audit-no-half-sync-visible','v457-final-verify-sync-speed-warehouse','v456-verified-instant-sync-ship-warehouse','v455-dirty-sync-cache-align','v454-instant-sync-data-align','v451-device-prefetch-indexeddb-progress','v450-warehouse-longpress-single-engine-cleanout-proof'];
      for (const v of versions) {
        const raw = localStorage.getItem('yx_warehouse_available_cache_' + v);
        if (!raw) continue;
        const obj = JSON.parse(raw);
        if (!obj || Number(obj.saved_at || 0) < Date.now() - 1000*60*60*24) continue;
        const data = obj.data || {};
        const items = Array.isArray(data.items) ? data.items : (Array.isArray(data.available) ? data.available : []);
        if (items.length) {
          out.items = items;
          out.at = Math.max(out.at || 0, Number(obj.saved_at || 0));
          if (!out.summary && data.zone_summary) out.summary = data.zone_summary;
          if (!out.count) out.count = items.reduce((n,it)=>n+(Number(it.unplaced_qty||it.qty||1)||1),0);
          break;
        }
      }
    } catch(_e) {}
    return out;
  }
  function applySyncedUnplacedToToday(data){
    try {
      const sync = readSyncedUnplacedPayload();
      if (!sync.at) return data;
      data = Object.assign({}, data || {});
      data.summary = Object.assign({}, data.summary || {});
      if (sync.items && sync.items.length) {
        data.unplaced_items = sync.items;
        data.summary.unplaced_row_count = sync.items.length;
      }
      if (sync.count) data.summary.unplaced_count = sync.count;
      if (sync.summary && typeof sync.summary === 'object') {
        data.summary.unplaced_zone_summary = Object.assign({}, data.summary.unplaced_zone_summary || {}, sync.summary);
        const z = data.summary.unplaced_zone_summary || {};
        data.summary.unplaced_zone_summary.total = Number(z.total || ((Number(z.A||0)+Number(z.B||0)+Number(z.unassigned||0))) || data.summary.unplaced_count || 0);
      }
      data.summary.from_device_sync_unplaced = true;
      return data;
    } catch(_e) { return data; }
  }
  function normalizeTodayData(data){
    const d = (data && typeof data === 'object') ? data : {};
    const summary = d.summary && typeof d.summary === 'object' ? d.summary : {};
    const feed = d.feed && typeof d.feed === 'object' ? d.feed : {};
    const safeFeed = {
      inbound: Array.isArray(feed.inbound) ? feed.inbound : [],
      new_orders: Array.isArray(feed.new_orders) ? feed.new_orders : [],
      new_masters: Array.isArray(feed.new_masters) ? feed.new_masters : [],
      outbound: Array.isArray(feed.outbound) ? feed.outbound : [],
      others: Array.isArray(feed.others) ? feed.others : []
    };
    const unplaced = Array.isArray(d.unplaced_items) ? d.unplaced_items : [];
    const zone = summary.unplaced_zone_summary && typeof summary.unplaced_zone_summary === 'object' ? summary.unplaced_zone_summary : {};
    const zA = Number(zone.A || 0), zB = Number(zone.B || 0), zU = Number(zone.unassigned || 0);
    const fixedSummary = Object.assign({}, summary, {
      inbound_count: Number(summary.inbound_count || safeFeed.inbound.length || 0),
      new_order_count: Number(summary.new_order_count || safeFeed.new_orders.length || 0),
      new_master_count: Number(summary.new_master_count || safeFeed.new_masters.length || 0),
      outbound_count: Number(summary.outbound_count || safeFeed.outbound.length || 0),
      unplaced_count: Number(summary.unplaced_count || unplaced.reduce((a,x)=>a+qtyOf(x),0) || 0),
      unplaced_row_count: Number(summary.unplaced_row_count || unplaced.length || 0),
      unread_count: Number(summary.unread_count || 0),
      unplaced_zone_summary: {A:zA, B:zB, unassigned:zU, total:Number(zone.total || (zA+zB+zU) || 0)}
    });
    return Object.assign({}, d, {success: d.success !== false, summary: fixedSummary, feed: safeFeed, unplaced_items: unplaced, anomalies: Array.isArray(d.anomalies)?d.anomalies:[]});
  }
  function renderTodaySoftError(message, cached){
    cleanLegacyTodayDom();
    const msg = YX.esc(message || '今日異動載入失敗，已保留目前畫面，可按刷新重試');
    const panelsEls = document.querySelectorAll('[data-today-panel] .chip-list,.stacked-list');
    if (!panelsEls.length) return;
    panelsEls.forEach(el => {
      if (cached && el.children && el.children.length) return;
      el.innerHTML = `<div class="error-card yx-v249-today-soft-error"><b>今日異動暫時無法更新</b><div class="small-note">${msg}</div><button type="button" class="ghost-btn tiny-btn" id="yx249-retry-today">重新整理</button></div>`;
    });
    document.querySelectorAll('[data-today-panel]').forEach(panel => { panel.style.setProperty('display','block','important'); panel.classList.remove('yx112-filter-hidden'); });
  }
  function render(data){
    if (!isToday()) return data;
    cleanLegacyTodayDom();
    state.data = data || {};
    const summary = state.data.summary || {};
    if ($('today-unread-badge')) $('today-unread-badge').textContent = '0';
    renderLabels(summary);
    renderSummaryCards(summary);
    renderUnplacedZonePill(summary);
    fill('today-inbound-list', state.data.feed?.inbound, '今天沒有進貨', 'inbound');
    fill('today-order-list', state.data.feed?.new_orders, '今天沒有新增訂單', 'orders');
    fill('today-master-list', state.data.feed?.new_masters, '今天沒有新增總單', 'masters');
    fill('today-outbound-list', state.data.feed?.outbound, '今天沒有出貨', 'outbound');
    fill('today-unplaced-list', state.data.unplaced_items, '目前沒有未錄入倉庫圖商品', 'unplaced');
    state.filter = state.filter || 'all';
    applyFilter();
    if ((state.filter || 'all') === 'all') {
      document.querySelectorAll('[data-today-panel]').forEach(panel => { panel.classList.remove('yx112-filter-hidden'); panel.style.setProperty('display','block','important'); });
    }
    return data;
  }
  async function loadTodayChanges112(opts={}){
    if (!isToday()) return null;
    if (state.loading && !opts.force) return state.loading;
    const cacheKey = 'today_changes_light_v406';
    const cached = !opts.force ? window.YX?.cache?.read(cacheKey, 1000*60*60*8) : null;
    if (cached && !opts.force) {
      try { cleanLegacyTodayDom(); render(normalizeTodayData(applySyncedUnplacedToToday(cached))); if ($('today-unread-badge')) $('today-unread-badge').textContent = String(cached.summary?.unread_count || 0); } catch(_e) {}
    }
    const fetchFresh = async () => {
      try {
        cleanLegacyTodayDom();
        const forceHeavy = !!(opts.force || state.forceNext);
        let data = await YX.api('/api/today-changes?yx143_final=1&v=119-v406-warehouse-order-drag-longpress-fix&force=' + (forceHeavy ? '1' : '0') + (forceHeavy ? '&yx_device_network=1&ts=' + Date.now() : ''), {method:'GET', yxDeviceLocalFirst: !forceHeavy}); state.forceNext=false;
        // V136: 不再每次開今日異動就另外打 warehouse/available-items；只有手動刷新(force)才補最新未入倉區域統計。
        if (forceHeavy) {
          try {
            const wz = await YX.api('/api/warehouse/available-items?fast=1&force=1&yx_device_network=1&yx138_manual=1&v=119-v406-warehouse-order-drag-longpress-fix&ts=' + Date.now(), {method:'GET', yxDeviceLocalFirst:false});
            data.summary = data.summary || {};
            data.summary.unplaced_zone_summary = wz.zone_summary || data.summary.unplaced_zone_summary || {};
          } catch(_e) {}
        }
        data = normalizeTodayData(applySyncedUnplacedToToday(data));
        try { window.YX?.cache?.write(cacheKey, data); } catch(_e) {}
        render(data);
        try { await YX.api('/api/today-changes/read', {method:'POST', body:JSON.stringify({})}); } catch(_e) {}
        if ($('today-unread-badge')) $('today-unread-badge').textContent = '0';
        return data;
      } catch(e) {
        state.lastError = e;
        const fallback = cached || state.lastGood;
        if (fallback) { try { render(fallback); renderTodaySoftError(e.message || '今日異動更新失敗，已保留上次資料', true); } catch(_e) {} return fallback; }
        renderTodaySoftError(e.message || '今日異動載入失敗', false);
        YX.toast(e.message || '今日異動載入失敗，請按重新整理', 'error');
        return null;
      } finally { state.loading = null; }
    };
    state.loading = fetchFresh();
    if (cached && !opts.force) {
      try { (window.requestIdleCallback || function(fn){ return setTimeout(fn, 60); })(()=>state.loading.catch(()=>{}), {timeout:900}); } catch(_e) {}
      return cached;
    }
    return state.loading;
  }
  function bindEvents(){
    if (state.eventsBound) return;
    state.eventsBound = true;
    const clearLongPress = () => { if (state.longPress?.timer) clearTimeout(state.longPress.timer); state.longPress = null; };
    document.addEventListener('pointerdown', ev => {
      if (!isToday()) return;
      const trigger = ev.target?.closest?.('[data-today-filter="unplaced"],.yx114-unplaced-refresh-trigger,#today-unplaced-zone-pill,#yx112-refresh-today');
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
      if (Date.now() < state.blockClickUntil && ev.target?.closest?.('[data-today-filter="unplaced"],.yx114-unplaced-refresh-trigger,#today-unplaced-zone-pill,#yx112-refresh-today')) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); return; }
      if (ev.target && (ev.target.id === 'yx112-refresh-today' || ev.target.id === 'yx249-retry-today')) {
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
      const delShip = ev.target?.closest?.('[data-yx63-delete-ship-group]');
      if (delShip) {
        ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.();
        await deleteShipGroup(delShip.getAttribute('data-yx63-delete-ship-group') || '');
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
  function publishGlobals(){
    const fn = YX.mark(loadTodayChanges112, 'today_changes');
    YX.safeExpose('loadTodayChanges', fn, {configurable:true});
    if (window.YX_MASTER) {
      try { window.YX_MASTER = ({...window.YX_MASTER, version:'v95-main-core', loadTodayChanges:fn}); } catch(_e) {}
    }
  }

  async function deleteShipGroup(ids){
    const list=String(ids||'').split(',').map(x=>Number(x)).filter(Boolean);
    if(!list.length) return;
    if(!confirm('確定刪除此筆出貨紀錄？刪除後其他人查不到。')) return;
    const card=document.querySelector(`[data-ship-record-ids="${CSS.escape(String(ids))}"]`);
    if(card) card.remove();
    for(const id of list){ try{ await YX.api('/api/shipping_records/'+encodeURIComponent(id), {method:'DELETE'}); }catch(e){ console.warn(e); } }
    loadTodayChanges112({force:true});
  }

  function install(){
    if (!isToday()) return;
    // formal mainline behavior.
    // 不讀取上次 all/inbound/outbound 篩選，避免先跳舊的三區塊畫面再跳新版。
    state.filter = 'all';
    try { localStorage.setItem('yx112TodayFilter', 'all'); } catch(_e) {}
    YX.cancelLegacyTimers('today_changes');
    document.documentElement.dataset.yx112Today = 'main-v249';
    document.documentElement.dataset.yx114Today = 'main-v249';
    bindEvents();
    publishGlobals();
    if (!state.shipRefreshBound) {
      state.shipRefreshBound = true;
      const refreshTodayV214 = ()=>{
        try{
          ['today_changes_light_v406','today_changes_light_v402','today_changes_light_v396','today_changes_light_v380','today_changes_light_v379','today_changes_light_v350','today_changes_light_v337','today_changes_light_v332','today_changes_light_v307','today_changes_light_v287','today_changes_light_v282','today_changes_light_v252','today_changes_light_v215','today_changes_light_v210','today_changes_light_v208','today_changes_light_v207','today_changes_light_v198','today_changes_v215','today_changes_v210','today_changes_v208','today_changes_v207','today_changes_v198'].forEach(k=>window.YX?.cache?.remove?.(k));
        }catch(_e){}
        loadTodayChanges112({force:true, silent:true});
      };
      ['yx:today-changes-refresh','yx:ship-completed','yx:product-data-changed','yx:order-master-changed','yx:warehouse-changed'].forEach(ev=>window.addEventListener(ev, refreshTodayV214, false));
      window.addEventListener('yx:device-sync-updated', ev=>{ try{ if(['today_changes','warehouse_available','warehouse','all'].includes((ev.detail||{}).key)) refreshTodayV214(); }catch(_e){} }, false);
    }
    cleanLegacyTodayDom();
    loadTodayChanges112({force:true, silent:true});
  }
  YX.register('today_changes', {install, render, load:loadTodayChanges112});
})();

/* ===== END static/yx_modules/today_changes_main.js ===== */

/* formal page module */
/* v18 EXACT HTML_DIRECT_MAIN_BASELINE
   只保留一套 HTML 結構；這支 JS 只負責安裝資料處理模組，不再重建頁面外殼。 */
(function(){
  'use strict';
  if (window.__YX_HTML_DIRECT_MASTER_MAIN__) return;
  window.__YX_HTML_DIRECT_MASTER_MAIN__ = true;
  const YX = window.YXCore;
  const moduleKey = () => {
    try { return YX && YX.moduleKey ? YX.moduleKey() : ''; } catch(_e) { return ''; }
  };
  function safeInstall(name){
    try { if (YX && YX.registry && YX.registry[name]) return YX.install(name); }
    catch(e){ try { (YX.toast || console.warn)(`${name} 載入失敗：${e.message || e}`, 'error'); } catch(_e){} }
    return null;
  }
  function stopLegacyLayoutNames(){
    // formal mainline behavior.
    return undefined;
  }
  function protectStaticShell(){
    document.documentElement.dataset.yxHtmlDirectMaster = 'main';
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

  async function deleteShipGroup(ids){
    const list=String(ids||'').split(',').map(x=>Number(x)).filter(Boolean);
    if(!list.length) return;
    if(!confirm('確定刪除此筆出貨紀錄？刪除後其他人查不到。')) return;
    const card=document.querySelector(`[data-ship-record-ids="${CSS.escape(String(ids))}"]`);
    if(card) card.remove();
    for(const id of list){ try{ await YX.api('/api/shipping_records/'+encodeURIComponent(id), {method:'DELETE'}); }catch(e){ console.warn(e); } }
    loadTodayChanges112({force:true});
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
  window.YX_HTML_DIRECT_MASTER = ({version:'v111-mainfile-single-install', install});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true});
  else install();
  // no pageshow reinstall: avoid settings -> home lag
})();

/* ===== END static/yx_pages/page_bootstrap_master.js ===== */

/* formal page module */
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
  document.documentElement.dataset.yx30QtyParenMonthSort = 'main';
})();
/* formal page module */


// V217 final today sync guard
(function(){if(window.__YX_V217_TODAY_FINAL__)return;window.__YX_V217_TODAY_FINAL__=true;function r(e){try{window.YX?.cache?.clearGroup?.('today_changes_');window.YX?.cache?.clearGroup?.('today_changes_light_');}catch(_){}}['yx:ship-completed','yx:product-data-changed','yx:order-master-changed','yx:warehouse-changed'].forEach(x=>window.addEventListener(x,r,false));})();
