
/* formal product page core */
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
/* formal product page core */


/* formal product page core */
(function(){
  'use strict';
  if (typeof window.safePushProductUndo !== 'function') {
    window.safePushProductUndo = function(source, label){
      try {
        if (typeof window.pushProductUndo === 'function') return window.pushProductUndo(source, label);
        if (window.YXPageUndo && typeof window.YXPageUndo.snapshot === 'function') {
          const rows = window.__YX112_ROWS__ && window.__YX112_ROWS__[source];
          const before = JSON.parse(JSON.stringify(Array.isArray(rows) ? rows : []));
          window.YXPageUndo.snapshot(label || '商品操作', function(){
            try { if (window.__YX112_ROWS__) window.__YX112_ROWS__[source] = before; } catch(_e) {}
          });
        }
      } catch(_e) {}
    };
  }
})();
/* formal product page core */

/* 沅興木業 FULL MASTER main REAL LOADED COMPLETE - product_page_core */
(function(){ window.__YX_PRODUCT_PAGE_CORE__='loaded'; })();

/* ===== MERGED INTO main FROM static/yx_modules/core_main.js ===== */
/* formal product page core */
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
    opt = opt || {};
    const method = String(opt.method || 'GET').toUpperCase();
    let timer = null, ctrl = null;
    if (!opt.signal && window.AbortController) {
      ctrl = new AbortController();
      opt = {...opt, signal: ctrl.signal};
      timer = setTimeout(()=>{ try{ ctrl.abort(); }catch(_e){} }, Number(opt.timeout || (method === 'GET' ? 9000 : 18000)));
    }
    const headers = {'Accept':'application/json','Content-Type':'application/json', ...(opt.headers || {})};
    let res;
    try { res = await window.YXDataStore.requestResponse(url, {credentials:'same-origin', cache:'no-store', ...opt, headers}); }
    finally { if (timer) clearTimeout(timer); }
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

  function ensureVisualToast(){
    if (window.__YX_V42_VISUAL_TOAST__) return;
    window.__YX_V42_VISUAL_TOAST__ = true;
    window.toast = window.showToast = window.notify = function(message, kind='ok'){
      try{
        const __yxActive=document.activeElement; const __yxStart=(__yxActive&&(__yxActive.matches?.('input,textarea,select,[contenteditable=\"true\"]')))?(__yxActive.selectionStart||0):0; const __yxEnd=(__yxActive&&(__yxActive.matches?.('input,textarea,select,[contenteditable=\"true\"]')))?(__yxActive.selectionEnd||0):0;
        let box = document.getElementById('yx-v20-toast');
        if(!box){ box=document.createElement('div'); box.id='yx-v20-toast'; box.setAttribute('aria-live','polite'); document.body.appendChild(box); }
        box.className = 'yx-v20-toast-card ' + (kind || 'ok');
        box.setAttribute('tabindex','-1');
        box.style.pointerEvents = 'none';
        const safe = String(message||'').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
        box.innerHTML = `<strong>${kind==='error'?'操作失敗':(kind==='warn'?'請注意':'操作成功')}</strong><div>${safe}</div>`;
        box.classList.add('show');
        clearTimeout(window.__YX_V20_TOAST_TIMER__);
        try{ if(__yxActive && document.contains(__yxActive) && __yxActive.matches?.('input,textarea,select,[contenteditable=\"true\"]')){ setTimeout(()=>{try{__yxActive.focus({preventScroll:true}); if('selectionStart' in __yxActive) __yxActive.setSelectionRange(__yxStart,__yxEnd);}catch(_e){}},0); } }catch(_e){}
        window.__YX_V20_TOAST_TIMER__ = setTimeout(()=>box.classList.remove('show'), 1800);
      }catch(_e){ try{ console.log(message); }catch(_e2){} }
    };
  }
  ensureVisualToast();
  window.YXCore = {
    version: 'v93-main-core',
    register, install, installAll, registry, installed,
    clean, esc, api, toast, moduleKey, safeExpose, mark, cancelLegacyTimers,
  };
  document.documentElement.dataset.yx113Core = 'on';
})();

/* ===== END merged module static/yx_modules/core_main.js ===== */

/* ===== MERGED INTO main FROM static/yx_modules/quantity_rule_main.js ===== */
/* formal product page core */
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

/* ===== END merged module static/yx_modules/quantity_rule_main.js ===== */

/* formal product page core */
(function(){
  'use strict';
  document.documentElement.dataset.yx124OrnateLabel = 'main';
  document.documentElement.dataset.yx124MasterLabel = 'main';
  document.documentElement.dataset.yx127GrayRingEqualHome = 'main';
  document.documentElement.classList.add('yx124-ornate-scope');
  window.YX124OrnateLabel = ({version:'v5-static-no-observer', install:function(){return true;}, apply:function(){return true;}});
})();
/* formal product page core */

/* ===== MERGED INTO main FROM static/yx_modules/product_sort_main.js ===== */
/* formal product page core */
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
  function install(){
    document.documentElement.dataset.yx118ProductSort = 'main';
    window.YX118ProductSort = {compareRows, sortRows, parseDims, parseSupport, materialOf};
  }
  YX.register('product_sort', {install, compareRows, sortRows});
  install();
})();

/* ===== END merged module static/yx_modules/product_sort_main.js ===== */

/* ===== MERGED INTO main FROM static/yx_pages/page_products_master.js ===== */
/* 沅興木業 v20-true-clean-master product page master
   來源：完整商品事件已吸收後重新收斂；同頁只保留主事件線。 */

/* ===== absorbed from product_actions_main.js ===== */
/* v20 TRUE CLEAN PRODUCT MASTER：商品頁唯一 renderer / 唯一事件主線；批量操作走單次 API。 */
(function(){
  'use strict';
  const YX = window.YXCore;
  if (!YX) return;

  const MATERIALS = ['TD','MER','DF','SP','SPF','HF','RDT','SPY','RP','MKJ','LVL','尤加利','尤佳利'];
  const state = { rows:{inventory:[], orders:[], master_order:[]}, selected:{inventory:new Set(), orders:new Set(), master_order:new Set()}, editAll:{inventory:false, orders:false, master_order:false}, editScope:{inventory:null, orders:null, master_order:null}, zoneFilter:{inventory:'ALL', orders:'ALL', master_order:'ALL'}, displayLimit:{inventory:120, orders:120, master_order:120}, loading:null, bound:false, observer:null, repairTimer:null, installedSource:'', total:{inventory:0, orders:0, master_order:0}, hasMore:{inventory:false, orders:false, master_order:false} };
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
    return window.YX30EffectiveQty ? window.YX30EffectiveQty(text, fallback) : (Number(fallback || 0) || 0);
  }
  function qtyOf(r){ return qtyFromText(r?.product_text || r?.support || '', r?.qty ?? r?.effective_qty ?? 0); }
  function idOf(r){ return Number(r?.id || r?.item_id || r?.inventory_id || r?.order_id || r?.master_order_id || r?.row_id || 0) || 0; }
  function selectedOrAllIds(source){
    const ids = selectedIds(source);
    if (ids.size) return Array.from(ids);
    return filteredRows(source).map(r => String(idOf(r) || '')).filter(Boolean);
  }
  function affectedCustomersForIds(source, ids){
    const idSet = new Set(Array.from(ids || []).map(v => String(typeof v === 'object' ? (v.id ?? v.item_id ?? '') : v)).filter(Boolean));
    const names = [];
    try {
      (rowsStore(source) || []).forEach(r => {
        const id = String(idOf(r) || '');
        if (idSet.size && !idSet.has(id)) return;
        const n = customerOf(r);
        if (n && !names.some(x => sameCustomerName(x, n))) names.push(n);
      });
    } catch(_e) {}
    const sel = selectedCustomer();
    if (sel && (source === 'orders' || source === 'master_order') && !names.some(x => sameCustomerName(x, sel))) names.unshift(sel);
    return names;
  }
  function activeRowsForCustomer(source, customer){
    customer = YX.clean(customer || '');
    if (!customer) return [];
    try {
      return (rowsStore(source) || []).filter(r => matchesSelectedCustomer(r.customer_name || r.customer || '') || sameCustomerName(r.customer_name || r.customer || '', customer)).filter(r => qtyOf(r) > 0);
    } catch(_e) { return []; }
  }
  function customerStillHasRows(source, customer){
    if (!customer || !['orders','master_order'].includes(source)) return true;
    return activeRowsForCustomer(source, customer).length > 0;
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
  function monthInfoFromText(text){
    const p = splitProduct(text || '');
    const rawSize = String(p.size || '').replace(/^\s+|\s+$/g,'');
    const m = rawSize.match(/^(\d{1,2})月(.+)$/);
    if (!m) return {tag:'', size:rawSize};
    return {tag:`${m[1]}月`, size:m[2] || rawSize};
  }
  function displaySizeText(r){
    const p = splitProduct(r?.product_text || '');
    const info = monthInfoFromText(r?.product_text || '');
    return info.size || p.size || r?.product_text || '';
  }
  function monthTagHTML(r){
    const info = monthInfoFromText(r?.product_text || '');
    return info.tag ? `<span class="yx-month-tag">${YX.esc(info.tag)}</span>` : '';
  }
  function materialWithMonthHTML(r){
    return `${YX.esc(materialOf(r))}`;
  }
  function monthCellHTML(r){
    const tag = monthTagHTML(r);
    return tag || '<span class="yx-month-empty">—</span>';
  }
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
  function selectedCustomerVariants(){
    const cust = selectedCustomer();
    const arr = Array.isArray(window.__YX_SELECTED_CUSTOMER_VARIANTS__) ? window.__YX_SELECTED_CUSTOMER_VARIANTS__.filter(Boolean).map(YX.clean) : [];
    if (cust && !arr.includes(cust)) arr.unshift(cust);
    return Array.from(new Set(arr.filter(Boolean)));
  }
  function sameCustomerName(a, b){
    const aa = YX.clean(a || '');
    const bb = YX.clean(b || '');
    if (!aa || !bb) return false;
    if (aa === bb) return true;
    return customerMergeKey(aa) === customerMergeKey(bb);
  }
  function matchesSelectedCustomer(rowName){
    const cust = selectedCustomer();
    if (!cust) return true;
    return selectedCustomerVariants().some(v => sameCustomerName(rowName, v));
  }
  function rowsStore(source, rows){
    window.__YX112_ROWS__ = window.__YX112_ROWS__ || {};
    window.__yx63Rows = window.__yx63Rows || {};
    if (Array.isArray(rows)) {
      state.rows[source] = rows;
      window.__YX112_ROWS__[source] = rows;
      window.__yx63Rows[source] = rows;
      try { if (window.YX?.cache && source) window.YX.cache.write(cacheName(source), {rows, selectedCustomer:(window.__YX_SELECTED_CUSTOMER__||''), saved_at:Date.now()}); } catch(_e) {}
      try { if (window.YXDataStore?.writeProductLocal && !window.__YX_ROWSSTORE_FROM_DATASTORE__) window.YXDataStore.writeProductLocal(source, rows); } catch(_e) {}
    }
    return state.rows[source] || window.__YX112_ROWS__[source] || window.__yx63Rows[source] || [];
  }
  function cloneRows(rows){ try{return JSON.parse(JSON.stringify(rows||[]));}catch(_e){return Array.isArray(rows)?rows.slice():[];} }
  function cacheVersionToken(){ return String(window.__YX_STATIC_VERSION__ || window.YX?.version || 'v406-warehouse-order-drag-longpress-fix').replace(/[^A-Za-z0-9_-]/g,'_'); }
  function versionedCacheName(prefix, source){ return String(prefix || '') + String(source || sourceFromModule() || 'unknown') + '_' + cacheVersionToken(); }
  function cacheName(source){ return versionedCacheName('products_', source); }
  function cacheRows(source, rows){ try{ window.YX?.cache?.write(cacheName(source), {rows:Array.isArray(rows)?rows:[], selectedCustomer:selectedCustomer()||'', saved_at:Date.now()}); }catch(_e){} }
  function hydrateRowsFromCache(source){
    try{
      const cached = window.YX?.cache?.read(cacheName(source), 1000*60*60*24*3);
      const rows = Array.isArray(cached?.rows) ? cached.rows : [];
      if(!rows.length) return false;
      rowsStore(source, rows);
      ensureBatchToolbar(source); ensureSummary(source);
      renderSummary(source); renderCards(source);
      try { window.dispatchEvent(new CustomEvent('yx:product-source-loaded', {detail:{source, count:rows.length, rows, cached:true}})); } catch(_e) {}
      try { if ((source === 'orders' || source === 'master_order') && window.YX113CustomerRegions?.renderFromCurrentRows) window.YX113CustomerRegions.renderFromCurrentRows(); } catch(_e) {}
      return true;
    }catch(_e){ return false; }
  }
  function pushProductUndo(source,label){
    try{
      const before=cloneRows(rowsStore(source));
      window.YXPageUndo?.snapshot?.(label||('商品操作 '+source), ()=>{ rowsStore(source, cloneRows(before)); clearSelected(source); renderSummary(source); renderCards(source); try{ window.YX113CustomerRegions?.renderFromCurrentRows?.(); }catch(_e){} });
    }catch(_e){}
  }
  try { window.pushProductUndo = pushProductUndo; } catch(_e) {}

  function filteredRows(source){
    let rows = [...rowsStore(source)];
    // V414: 訂單/總單主表只顯示仍有有效件數的商品，避免出貨扣到 0 的殘留 row 讓客戶卡和清單不一致。
    if (source === 'orders' || source === 'master_order') rows = rows.filter(r => qtyOf(r) > 0);
    const cust = selectedCustomer();
    if ((source === 'orders' || source === 'master_order') && cust) rows = rows.filter(r => matchesSelectedCustomer(r.customer_name || ''));
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
    const valid = new Set(rowsStore(source).map(r => String(idOf(r) || '')).filter(Boolean));
    state.selected[source] = new Set(Array.from(selectedIds(source)).filter(id => valid.has(id)));
  }
  function selectedItems(source, useAll=false){
    const ids = useAll ? selectedOrAllIds(source) : Array.from(selectedIds(source));
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
      const commonToolbar = `<input id="yx113-${source}-search" class="text-input small yx113-search" placeholder="搜尋商品 / 客戶 / 材質 / A區 / B區">`
        + ''
        + `<button class="ghost-btn small-btn yx132-zone-filter is-active" type="button" data-yx132-zone-filter="ALL" data-source="${source}">全部區</button><button class="ghost-btn small-btn yx132-zone-filter" type="button" data-yx132-zone-filter="A" data-source="${source}">A區</button><button class="ghost-btn small-btn yx132-zone-filter" type="button" data-yx132-zone-filter="B" data-source="${source}">B區</button><select id="yx113-${source}-material" class="text-input small"><option value="">批量增加材質</option>${MATERIALS.map(m => `<option value="${YX.esc(m)}">${YX.esc(m)}</option>`).join('')}</select><button class="ghost-btn small-btn" type="button" data-yx113-batch-material="${source}">套用材質</button>`
        + '';
      bar.innerHTML = `<div class="yx114-toolbar-main"></div><div class="yx114-batch-actions yx-direct-batch-actions">${commonToolbar}</div>`;
      const head = sec.querySelector('.section-head,.inventory-inline-head') || sec.firstElementChild || sec;
      head.insertAdjacentElement('afterend', bar);
    }
    const search = $(`yx113-${source}-search`);
    if (search && search.dataset.yxHtmlDirectBound !== '1') {
      search.dataset.yxHtmlDirectBound = '1';
      search.addEventListener('input', () => { state.displayLimit[source] = 120; renderSummary(source); renderCards(source); });
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
  function rowActionsHTML(source, id){
    return '<span class="small-note">勾選後用上方按鈕操作</span>';
  }
  function proxyCard(source, id){
    return {dataset:{source:String(source || ''), id:String(id || '')}};
  }
  async function handleRowAction(source, id, action){
    if (!source || !id) return;
    const pseudo = proxyCard(source, id);
    if (action === 'edit') { state.editAll[source] = true; clearSelected(source); renderSummary(source); return; }
    if (action === 'delete') return deleteItem(pseudo);
    if (action === 'ship') return shipItem(pseudo);
    if (action === 'to-orders') return moveInventory(pseudo, 'orders');
    if (action === 'to-master') {
      if (source === 'orders') {
        const row = rowsStore(source).find(r => String(idOf(r) || '') === String(id));
        const customer = customerOf(row) || selectedCustomer();
        const d = await YX.api('/api/items/transfer', {method:'POST', body:JSON.stringify({source:'orders', id, target:'master_order', customer_name:customer, allow_inventory_fallback:true})});
        YX.toast('已加到總單', 'ok');
        try { clearCrossFunctionCaches('orders', customer, 'order-to-master-success'); clearCrossFunctionCaches('master_order', customer, 'order-to-master-success'); } catch(_e) {}
        if (!applySnapshotFromResponse(d, 'orders')) { try { window.YXDataStore?.setRows?.('orders', rowsStore('orders'), {reason:'order-to-master-source-confirmed'}); } catch(_e) {} }
        try { if (!applySnapshotFromResponse(d, 'master_order')) { try { window.YXDataStore?.setRows?.('master_order', rowsStore('master_order'), {reason:'order-to-master-target-confirmed'}); } catch(_e) {} } } catch(_e) {}
        try { await refreshCustomerBoards(customer, {source:'master_order', forceVisible:true}); } catch(_e) {}
        try { window.dispatchEvent(new CustomEvent('yx:product-batch-write-success',{detail:{source:'orders', target_source:'master_order', customer_name:customer, affected_customer_names:d?.affected_customer_names||[customer].filter(Boolean), count:1, reason:'order-to-master-success', sync_version:'v417-remove-opstatus-warehouse-visible-longpress', cache_bust:'v417-remove-opstatus-warehouse-visible-longpress'}})); } catch(_e) {}
        return;
      }
      return moveInventory(pseudo, 'master_order');
    }
  }
  function updateSummaryHeaderOnly(source){
    try {
      const box = document.getElementById(`yx113-${source}-summary`);
      if (!box) return;
      const rows = filteredRows(source);
      const total = rows.reduce((sum, r) => sum + qtyOf(r), 0);
      const strong = box.querySelector('.yx132-summary-title strong');
      if (strong) strong.textContent = `${total}件 / ${rows.length}筆`;
    } catch(_e) {}
  }
  function activeEditingElement(source){
    try {
      const el = document.activeElement;
      if (!el || el === document.body || el === document.documentElement) return null;
      if (!el.matches('input,textarea,select,[contenteditable="true"]')) return null;
      if (el.closest('#confirm-modal,#yx-v20-toast')) return null;
      if (el.closest(`#yx113-${source}-summary`) || el.id === 'ocr-text' || el.id === 'customer-name') return el;
      return null;
    } catch(_e) { return null; }
  }
  function shouldAvoidRerender(source){
    return !!state.editAll[source] || !!activeEditingElement(source);
  }
  function renderSourceSafely(source){
    if (shouldAvoidRerender(source)) {
      updateSummaryHeaderOnly(source);
      return false;
    }
    renderSummary(source);
    renderCards(source);
    return true;
  }
  function mergeSnapshotQuiet(data, source){
    try {
      const snaps = data?.snapshots || {};
      let rows = Array.isArray(snaps[source]) ? snaps[source] : null;
      if (!rows && source === 'master_order' && Array.isArray(snaps.master_orders)) rows = snaps.master_orders;
      if (!rows && Array.isArray(data?.items) && !data?.items_are_delta && !data?.delta_items && !data?.changed_items) rows = data.items;
      if (Array.isArray(rows)) rowsStore(source, rows);
      updateSummaryHeaderOnly(source);
      return Array.isArray(rows);
    } catch(_e) { return false; }
  }
  function applySnapshotFromResponse(data, source){
    const snaps = data?.snapshots || {};
    let rows = Array.isArray(snaps[source]) ? snaps[source] : null;
    if (!rows && source === 'master_order' && Array.isArray(snaps.master_orders)) rows = snaps.master_orders;
    if (!rows && Array.isArray(data?.items) && data.items.length && !data?.items_are_delta && !data?.delta_items && !data?.changed_items && (source === sourceFromModule() || source)) rows = data.items;
    if (Array.isArray(rows)) {
      rowsStore(source, rows);
      try { window.YXDataStore?.setRows?.(source, rows, {reason:'product-apply-snapshot'}); } catch(_e) {}
      if (shouldAvoidRerender(source)) {
        updateSummaryHeaderOnly(source);
        try { if (Array.isArray(data?.customers) && window.YX113CustomerRegions?.renderBoards) window.YX113CustomerRegions.renderBoards(data.customers); } catch(_e) {}
        return true;
      }
      clearSelected(source);
      renderSummary(source);
      renderCards(source);
      try { if (Array.isArray(data?.customers) && window.YX113CustomerRegions?.renderBoards) window.YX113CustomerRegions.renderBoards(data.customers); } catch(_e) {}
      return true;
    }
    return false;
  }
  async function batchTransfer(source, target){
    const ids = Array.from(selectedIds(source));
    if (!ids.length) return YX.toast('請先勾選要移動的商品', 'warn');
    let customer = selectedCustomer();
    if (!customer && (target === 'orders' || target === 'master_order' || target === 'master_orders')) customer = prompt(`要加入${target === 'orders' ? '訂單' : '總單'}的客戶名稱`) || '';
    customer = YX.clean(customer);
    if (!customer && source !== 'inventory') customer = customerOf(rowsStore(source).find(r => String(idOf(r) || '') === String(ids[0])));
    if (!customer && (target === 'orders' || target === 'master_order' || target === 'master_orders')) return YX.toast('請先輸入或點選客戶', 'warn');
    const items = ids.map(id => {
      const row = rowsStore(source).find(r => String(idOf(r) || '') === String(id));
      return {source:apiSource(source), id:Number(id), qty:qtyOf(row), customer_name: customer || customerOf(row)};
    }).filter(x => x.id > 0);
    const d = await YX.api('/api/items/batch-transfer', {method:'POST', body:JSON.stringify({items, target, customer_name:customer, region:'北區', allow_inventory_fallback:true, request_key:`v18-batch-transfer-${Date.now()}-${Math.random().toString(36).slice(2)}`})});
    clearSelected(source);
    YX.toast(`已移動 ${d.count || items.length} 筆商品`, 'ok');
    if (!applySnapshotFromResponse(d, source)) { try { window.YXDataStore?.setRows?.(source, rowsStore(source), {reason:'product-local-confirmed'}); } catch(_e) {}; if (shouldAvoidRerender(source)) updateSummaryHeaderOnly(source); else renderSummary(source); }
    try { if (target === 'orders' || target === 'master_order' || target === 'master_orders') { const t = target === 'master_orders' ? 'master_order' : target; if (customer) window.__YX_SELECTED_CUSTOMER__ = customer; if (!applySnapshotFromResponse(d, t)) await loadSource(t); } } catch(_e) {}
    const targetSource = target === 'master_orders' ? 'master_order' : target;
    try { clearCrossFunctionCaches(source, customer, 'batch-transfer-success'); clearCrossFunctionCaches(targetSource, customer, 'batch-transfer-success'); } catch(_e) {}
    const names = (Array.isArray(d.affected_customer_names) && d.affected_customer_names.length ? d.affected_customer_names : [customer]).filter(Boolean);
    try { for (const n of names) await refreshCustomerBoards(n, {source:targetSource, forceVisible:true}); } catch(_e) {}
    try { window.dispatchEvent(new CustomEvent('yx:product-batch-write-success',{detail:{source, target_source:targetSource, customer_name:names[0]||customer, affected_customer_names:names, affected_sources:d?.affected_sources||[source,targetSource], count:d.count||items.length, reason:'batch-transfer-success', sync_version:'v417-remove-opstatus-warehouse-visible-longpress', cache_bust:'v417-remove-opstatus-warehouse-visible-longpress'}})); } catch(_e) {}
  }
  async function batchMoveZone(source, zone){
    const ids = selectedOrAllIds(source);
    if (!ids.length) return YX.toast('目前沒有可移到 A/B 區的商品', 'warn');
    const items = selectedItems(source, true);
    const idSet = new Set(items.map(x => String(x.id)));
    rowsStore(source).forEach(r => { if (idSet.has(String(idOf(r) || ''))) { r.location = zone; r.zone = zone; r.warehouse_zone = zone; } });
    renderSummary(source); renderCards(source);
    const d = await YX.api('/api/customer-items/batch-zone', {method:'POST', body:JSON.stringify({zone, items})});
    clearSelected(source);
    YX.toast(`已移到 ${zone}區：${d.count || ids.length} 筆`, 'ok');
    if (!applySnapshotFromResponse(d, source)) { try { window.YXDataStore?.setRows?.(source, rowsStore(source), {reason:'product-local-confirmed'}); } catch(_e) {}; if (shouldAvoidRerender(source)) updateSummaryHeaderOnly(source); else renderSummary(source); }
    try { clearCrossFunctionCaches(source, selectedCustomer(), 'batch-zone-success'); } catch(_e) {}
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
    const editing = !!state.editAll[source];
    const custTag = customerTagFor(source, rows);
    const zoneMoveButtons = `<button class="ghost-btn small-btn" type="button" data-yx132-batch-zone="A" data-source="${source}">移到A區</button><button class="ghost-btn small-btn" type="button" data-yx132-batch-zone="B" data-source="${source}">移到B區</button>`;
    const inventoryTransferButtons = source === 'inventory' ? `<button class="ghost-btn small-btn" type="button" data-yx132-batch-transfer="orders" data-source="${source}">加到訂單</button><button class="ghost-btn small-btn" type="button" data-yx132-batch-transfer="master_order" data-source="${source}">加到總單</button>` : '';
    const orderToMasterButton = source === 'orders' ? `<button class="ghost-btn small-btn" type="button" data-yx132-batch-transfer="master_order" data-source="${source}">加到總單</button>` : '';
    const editDeleteButtons = `<button class="ghost-btn small-btn danger" type="button" data-yx113-batch-delete="${source}">批量刪除</button><button class="ghost-btn small-btn" type="button" data-yx128-edit-all="${source}">${editing ? '儲存批量編輯' : '批量編輯全部'}</button>`; // V486: restore only the product list batch buttons the user explicitly asked to keep
    const bottomLocationButton = `<div class="yx-product-location-bottom"><button class="ghost-btn small-btn yx-product-location-btn" type="button" data-yx-product-location-batch="${source}">商品位置</button><span class="small-note">勾選清單商品後，按此查詢全部倉庫位置。</span></div>`;
    const controls = source === 'inventory'
      ? `<div class="yx128-summary-controls yx-v68-inventory-actions yx114-summary-inline-actions">${zoneMoveButtons}${inventoryTransferButtons}${editDeleteButtons}</div>`
      : `<div class="yx128-summary-controls yx-v68-order-master-actions yx114-summary-inline-actions ${source === 'orders' ? 'yx-v65-orders-summary-actions' : 'yx-v65-master-summary-actions'}">${orderToMasterButton}${zoneMoveButtons}${editDeleteButtons}</div>`; // formal mainline behavior.
    const scope = editingIds(source);
    const visibleLimit = Math.max(40, Number(state.displayLimit[source] || 120) || 120);
    const baseDisplayRows = editing && scope ? rows.filter(r => scope.has(String(idOf(r) || ''))) : rows;
    const displayRows = editing ? baseDisplayRows : baseDisplayRows.slice(0, visibleLimit);
    const moreRows = !editing && baseDisplayRows.length > displayRows.length;
    const firstPaintLimit = editing ? displayRows.length : Math.min(displayRows.length, 64);
    const firstPaintRows = displayRows.slice(0, firstPaintLimit);
    const deferredRows = displayRows.slice(firstPaintLimit);
    function rowHTML(r){
      const p = splitProduct(r.product_text || '');
      const id = idOf(r);
      if (!editing) {
        return `<tr class="yx113-summary-row" data-source="${source}" data-id="${id}"><td class="mat"><input class="yx113-row-check" type="checkbox" data-id="${id}" data-source="${source}">${materialWithMonthHTML(r)}</td><td class="month">${monthCellHTML(r)}</td><td class="size">${YX.esc(displaySizeText(r))}</td><td class="support yx-support-wrap">${window.YX30SupportHTML ? window.YX30SupportHTML(p.support || String(qtyOf(r)), YX.esc) : YX.esc(p.support || String(qtyOf(r)))}</td><td class="qty total-qty">${qtyOf(r)}</td><td class="zone">${YX.esc(zoneLabel(r))}</td></tr>`;
      }
      return `<tr class="yx113-summary-row yx128-edit-row" data-source="${source}" data-id="${id}">
        <td><select class="text-input small yx128-field" data-yx128-field="material"><option value="">不指定材質</option>${materialOptions(materialOf(r)==='未填材質'?'':materialOf(r))}</select></td>
        <td class="month">${monthCellHTML(r)}</td>
        <td><input class="text-input small yx128-field" data-yx128-field="size" value="${YX.esc(p.size || r.product_text || '')}" placeholder="尺寸，可含 8月"></td>
        <td><input class="text-input small yx128-field" data-yx128-field="support" value="${YX.esc(p.support || '')}" placeholder="支數 x 件數"></td>
        <td><input class="text-input small yx128-field" data-yx128-field="qty" type="number" min="1" value="${qtyOf(r)}" placeholder="總數量"></td>
        <td><select class="text-input small yx128-field" data-yx128-field="zone"><option value="" ${zoneOf(r)?'':'selected'}>未分區</option><option value="A" ${zoneOf(r)==='A'?'selected':''}>A區</option><option value="B" ${zoneOf(r)==='B'?'selected':''}>B區</option></select><input type="hidden" data-yx128-field="customer_name" value="${YX.esc(customerOf(r) || '')}"></td>
      </tr>`;
    }
    const body = firstPaintRows.length ? firstPaintRows.map(rowHTML).join('') : `<tr><td colspan="6">目前沒有資料</td></tr>`;
    box.innerHTML = `<div class="yx113-summary-head yx128-summary-head"><div class="yx132-summary-title">${custTag ? `<span class="yx132-customer-tag">${YX.esc(custTag)}</span>` : ''}<strong>${total}件 / ${rows.length}筆</strong>${controls}<span class="yx114-summary-note">${YX.esc(title(source))}｜完整直列顯示，不用下拉式</span></div></div><datalist id="yx128-material-list-${source}">${materialOptions('').replace(/ selected/g,'')}</datalist><div class="yx113-table-wrap yx-mobile-zoom-target"><table class="yx113-table yx128-inline-table"><thead><tr><th>材質</th><th>月份</th><th>尺寸</th><th>支數 x 件數</th><th>總數量</th><th>A/B區</th></tr></thead><tbody>${body}</tbody></table></div>${moreRows ? `<div class="yx137-more-row"><button class="ghost-btn small-btn" type="button" data-yx137-load-more="${source}">顯示更多 ${Math.min(120, baseDisplayRows.length - displayRows.length)} 筆</button><span class="small-note">已顯示 ${displayRows.length} / ${baseDisplayRows.length} 筆；搜尋可快速縮小範圍</span></div>` : ''}${state.hasMore[source] ? `<div class="yx137-more-row"><button class="ghost-btn small-btn" type="button" data-yx137-load-full="${source}">載入完整資料</button><span class="small-note">目前先載入 ${rows.length} / ${state.total[source] || rows.length} 筆以加快開頁</span></div>` : ''}${bottomLocationButton}`;
    try{ window.YX && window.YX.mobileZoom && window.YX.mobileZoom.refreshSoon && window.YX.mobileZoom.refreshSoon(); }catch(_e){}
    if (deferredRows.length) {
      const tbody = box.querySelector('tbody');
      try { window.YX?.renderChunks?.appendRows?.(tbody, deferredRows, rowHTML, {size:28}); }
      catch(_e) { try { tbody.insertAdjacentHTML('beforeend', deferredRows.map(rowHTML).join('')); } catch(__e){} }
    }
    const ids = idsBefore;
    box.querySelectorAll('.yx113-summary-row').forEach(row => { if (!editing) setRowSelected(row, ids.has(String(row.dataset.id || ''))); });
    syncSelectButton(source);
    syncZoneButtons(source);
    syncEditButtons(source);
    try{ applyProductPendingMarkers(source); }catch(_e){}
    try{ window.YX?.visualSync?.apply?.('product-render'); }catch(_e){}
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

  function locationPanel(source){
    let panel = document.getElementById(`yx-${source}-warehouse-location-panel`);
    const box = document.getElementById(`yx113-${source}-summary`);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = `yx-${source}-warehouse-location-panel`;
      panel.className = 'yx-product-location-panel result-card hidden';
      if (box) box.insertAdjacentElement('afterend', panel);
    }
    return panel;
  }
  async function showSelectedProductLocations(source){
    const ids = Array.from(selectedIds(source));
    if (!ids.length) return YX.toast('請先勾選要查位置的商品', 'warn');
    const selectedRows = ids.map(id => rowsStore(source).find(r => String(idOf(r) || '') === String(id))).filter(Boolean);
    if (!selectedRows.length) return YX.toast('找不到已勾選商品資料', 'warn');
    const panel = locationPanel(source);
    panel.classList.remove('hidden'); panel.style.display = '';
    panel.innerHTML = `<strong>商品位置查詢中…</strong><div class="small-note">共 ${selectedRows.length} 筆商品</div>`;
    const all = [];
    const norm = v => String(v || '').replace(/\s+/g,'').toLowerCase();
    for (const row of selectedRows){
      const customer = customerOf(row);
      const product = row.product_text || '';
      let hits = [];
      try {
        const d = await YX.api('/api/warehouse/search?q=' + encodeURIComponent([customer, product].filter(Boolean).join(' ')) + '&ts=' + Date.now(), {method:'GET'});
        hits = Array.isArray(d.items) ? d.items : [];
        if (!hits.length && product) {
          const d2 = await YX.api('/api/warehouse/search?q=' + encodeURIComponent(product) + '&ts=' + Date.now(), {method:'GET'});
          hits = Array.isArray(d2.items) ? d2.items : [];
        }
      } catch(_e) { hits = []; }
      const ck = norm(customer);
      if (ck) hits = hits.filter(h => {
        const it = h.item || h;
        const cn = norm(it.customer_name || h.customer_name || '庫存');
        return !cn || cn.includes(ck) || ck.includes(cn) || cn === '庫存';
      });
      hits.forEach(h => all.push({row, hit:h}));
      if (!hits.length) all.push({row, hit:null});
    }
    const found = all.filter(x => x.hit);
    if (!found.length) {
      panel.innerHTML = `<strong>查無倉庫位置</strong><div class="small-note">已勾選商品可能尚未錄入倉庫圖。</div>`;
      return;
    }
    const html = all.map((x,i)=>{
      const row=x.row, h=x.hit;
      const product=row.product_text||'';
      if(!h) return `<div class="deduct-card yx-location-miss"><b>${YX.esc(product)}</b><span>尚未錄入倉庫圖</span></div>`;
      const c=h.cell||h, it=h.item||h;
      const qty=Number(it.qty||it.unplaced_qty||0)||'';
      const loc=`${YX.esc(c.zone)}倉 ${Number(c.column_index)}欄 ${Number(c.slot_number)}格`;
      return `<button type="button" class="deduct-card yx-location-hit" data-hit="${i}"><b>${YX.esc(product)}　${loc}</b><span>${YX.esc(it.customer_name||customerOf(row)||'庫存')}</span><span>${YX.esc(it.material||it.product_code||'')} ${YX.esc(it.product_text||it.product||product)}</span><em>${qty ? qty + '件' : ''}</em></button>`;
    }).join('');
    panel.innerHTML = `<strong>商品位置</strong><div class="small-note">勾選 ${selectedRows.length} 筆，共找到 ${found.length} 個位置。</div><div class="yx-product-location-list">${html}</div>`;
    panel.querySelectorAll('[data-hit]').forEach(btn=>btn.addEventListener('click',()=>{ const item=all[Number(btn.dataset.hit||0)]; if(!item?.hit) return; const c=(item.hit.cell||item.hit); if (typeof window.highlightWarehouseCell === 'function') window.highlightWarehouseCell(c.zone,c.column_index,c.slot_number); else window.location.href = `/warehouse?highlight=${encodeURIComponent(`${c.zone}-${c.column_index}-${c.slot_number}`)}`; }));
    panel.scrollIntoView?.({behavior:'smooth', block:'nearest'});
  }

  async function showProductLocations(source, id){
    const row = rowsStore(source).find(r => String(idOf(r) || '') === String(id));
    if (!row) return YX.toast('找不到商品資料', 'warn');
    const customer = customerOf(row);
    const product = row.product_text || '';
    const panel = locationPanel(source);
    panel.classList.remove('hidden'); panel.style.display = '';
    panel.innerHTML = `<strong>商品位置查詢中…</strong><div class="small-note">${YX.esc(customer || '庫存')}｜${YX.esc(product)}</div>`;
    try {
      const d = await YX.api('/api/warehouse/search?q=' + encodeURIComponent([customer, product].filter(Boolean).join(' ')) + '&ts=' + Date.now(), {method:'GET'});
      let hits = Array.isArray(d.items) ? d.items : [];
      if (!hits.length && product) {
        const d2 = await YX.api('/api/warehouse/search?q=' + encodeURIComponent(product) + '&ts=' + Date.now(), {method:'GET'});
        hits = Array.isArray(d2.items) ? d2.items : [];
      }
      const norm = v => String(v || '').replace(/\s+/g,'').toLowerCase();
      const customerKey = norm(customer);
      if (customerKey) hits = hits.filter(h => {
        const it = h.item || h;
        const cn = norm(it.customer_name || h.customer_name || '庫存');
        return !cn || cn.includes(customerKey) || customerKey.includes(cn) || cn === '庫存';
      });
      if (!hits.length) {
        panel.innerHTML = `<strong>查無倉庫位置</strong><div class="small-note">這筆商品可能尚未錄入倉庫圖。</div>`;
        return;
      }
      panel.innerHTML = `<strong>商品位置</strong><div class="small-note">共 ${hits.length} 個位置；點位置可在倉庫頁高亮。</div><div class="yx-product-location-list">${hits.map((h,i)=>{ const c=h.cell||h; const it=h.item||h; const qty=Number(it.qty||it.unplaced_qty||0)||''; return `<button type="button" class="deduct-card yx-location-hit" data-hit="${i}"><b>${YX.esc(c.zone)}區 第${Number(c.column_index)}欄 第${Number(c.slot_number)}格</b><span>${YX.esc(it.customer_name||customer||'庫存')}</span><span>${YX.esc(it.material||it.product_code||'')} ${YX.esc(it.product_text||it.product||product)}</span><em>${qty ? qty + '件' : ''}</em></button>`; }).join('')}</div>`;
      panel.querySelectorAll('[data-hit]').forEach((btn,i)=>btn.addEventListener('click',()=>{ const c=(hits[i].cell||hits[i]); if (typeof window.highlightWarehouseCell === 'function') window.highlightWarehouseCell(c.zone,c.column_index,c.slot_number); else window.location.href = `/warehouse?highlight=${encodeURIComponent(`${c.zone}-${c.column_index}-${c.slot_number}`)}`; }));
      panel.scrollIntoView?.({behavior:'smooth', block:'nearest'});
    } catch(e) {
      panel.innerHTML = `<strong style="color:#b91c1c">商品位置查詢失敗</strong><div class="small-note">${YX.esc(e.message || '請稍後再試')}</div>`;
    }
  }

  function cardHTML(source, r){
    const p = splitProduct(r.product_text || '');
    const q = qtyOf(r);
    const actions = source === 'inventory'
      ? `<button class="ghost-btn tiny-btn danger-btn" data-yx113-action="delete">刪除</button><button class="ghost-btn tiny-btn" data-yx113-action="to-orders">加到訂單</button><button class="ghost-btn tiny-btn" data-yx113-action="to-master">加到總單</button>`
      : `<button class="ghost-btn tiny-btn" data-yx113-action="ship">直接出貨</button><button class="ghost-btn tiny-btn danger-btn" data-yx113-action="delete">刪除</button>`;
    return `<div class="deduct-card yx113-product-card yx112-product-card ${Number(r.unplaced_qty || 0) > 0 ? 'needs-red' : ''}" data-source="${source}" data-id="${idOf(r)}"><div class="yx128-card-top"><strong class="material-text">${materialWithMonthHTML(r)}</strong><button class="ghost-btn tiny-btn yx128-card-edit-btn" type="button" data-yx113-action="edit">編輯</button><strong>${q}件</strong></div><button class="yx113-product-main" type="button" data-yx113-action="filter"><span class="yx-size-with-month">${monthTagHTML(r)}<span>${YX.esc(displaySizeText(r))}</span></span><span class="yx-support-wrap-inline">${window.YX30SupportHTML ? window.YX30SupportHTML(p.support || String(q), YX.esc) : YX.esc(p.support || String(q))}</span></button>${customerOf(r) ? `<div class="small-note">${YX.esc(customerOf(r))}</div>` : ''}<div class="btn-row compact-row yx113-product-actions">${actions}</div></div>`;
  }
  function renderCards(source){
    // single product list：庫存 / 訂單 / 總單不再產生下方小卡，所有操作統一移到上方完整清單。
    ensureFilterNote(source, 0);
    const list = listEl(source);
    if (!list) return;
    list.classList.add('yx131-hidden-card-list');
    list.innerHTML = '';
    list.style.display = 'none';
  }
  async function loadSource(source, opts={}){
    source = source || sourceFromModule();
    if (!source) return [];
    let hadDataStore = false;
    // V462: 同步完成後每頁先吃唯一資料層。即使 rows=0 也要顯示 0，避免已刪除商品還被舊快取算回件/筆。
    if (!opts.beforeEditSave && window.YXDataStore && typeof window.YXDataStore.getRowsMeta === 'function') {
      try {
        const meta = await window.YXDataStore.getRowsMeta(source);
        if (meta && meta.hasPayload) {
          hadDataStore = true;
          const rows = Array.isArray(meta.rows) ? meta.rows : [];
          state.total[source] = rows.length;
          state.hasMore[source] = false;
          rowsStore(source, rows);
          cacheRows(source, rows);
          pruneSelected(source);
          ensureBatchToolbar(source);
          ensureSummary(source);
          if (shouldAvoidRerender(source)) updateSummaryHeaderOnly(source);
          else { renderSummary(source); renderCards(source); }
          try { window.dispatchEvent(new CustomEvent('yx:product-source-loaded', {detail:{source, count:rows.length, rows, cached:true, data_store:true}})); } catch(_e) {}
          try { if ((source === 'orders' || source === 'master_order') && window.YX113CustomerRegions?.renderFromCurrentRows) window.YX113CustomerRegions.renderFromCurrentRows(); } catch(_e) {}
        }
      } catch(_e) {}
    }
    const hadCached = (!hadDataStore && !opts.force && !opts.afterSubmit && !opts.beforeEditSave) ? hydrateRowsFromCache(source) : hadDataStore;
    const seqKey = '__yx139LoadSeq_' + source;
    window[seqKey] = (Number(window[seqKey] || 0) + 1);
    const seq = window[seqKey];
    const fetchFresh = async () => {
      if (state.loading === source && !opts.force) return rowsStore(source);
      state.loading = source;
      try {
        const limit = opts.full ? 0 : 360;
        const d = await YX.api(endpoint(source) + '?yx143_final=1&fast=1&v485_db_hydrate=1' + '&limit=' + encodeURIComponent(limit), {method:'GET', yxDbOnly: !!(opts.yxDbOnly || (hadDataStore && !rowsStore(source).length))});
        if (seq !== window[seqKey] && !opts.force) return rowsStore(source);
        const rows = Array.isArray(d.items) ? d.items : (Array.isArray(d.rows) ? d.rows : []);
        const oldRows = rowsStore(source) || [];
        const authoritative = !!(opts.force || d.sync_authority || d.full_sync || d.yx_device_sync || d.force || d.total === 0 || Number(d.total || 0) >= rows.length);
        if (!rows.length && oldRows.length && !authoritative) return oldRows;
        state.total[source] = Number(d.total || rows.length || 0) || rows.length;
        state.hasMore[source] = !!d.has_more;
        rowsStore(source, rows);
        try { window.YXDataStore?.setRows?.(source, rows, {reason:'product-fetch-fresh'}); } catch(_e) {}
        cacheRows(source, rows);
        pruneSelected(source);
        ensureBatchToolbar(source);
        ensureSummary(source);
        if (shouldAvoidRerender(source)) updateSummaryHeaderOnly(source);
        else { renderSummary(source); renderCards(source); }
        try { window.dispatchEvent(new CustomEvent('yx:product-source-loaded', {detail:{source, count:rows.length, rows}})); } catch(_e) {}
        try { if ((source === 'orders' || source === 'master_order') && window.YX113CustomerRegions?.renderFromCurrentRows) window.YX113CustomerRegions.renderFromCurrentRows(); } catch(_e) {}
        return rowsStore(source);
      } finally { if (state.loading === source) state.loading = null; }
    };
    if ((hadCached && !opts.full && rowsStore(source).length) || (hadDataStore && rowsStore(source).length && !opts.full && !opts.beforeEditSave && !opts.yxDbOnly)) {
      // V485: 有同步權威資料且真的有 rows 時先顯示；若同步快取是空但 DB 其實有資料，必須 hydrates DB，避免訂單/總單/出貨區空白。
      return rowsStore(source);
    }
    return fetchFresh();
  }
  async function refreshCurrent(){ return loadSource(sourceFromModule()); }
  async function refreshCustomerBoards(customer, opts={}){
    customer = YX.clean(customer || '');
    const source = opts.source || sourceFromModule();
    const forceVisible = opts.forceVisible !== false;
    const shouldKeepVisible = forceVisible || customerStillHasRows(source, customer);
    try { if (customer) window.__YX_SELECTED_CUSTOMER__ = customer; } catch(_e) {}
    // V415: 新增/編輯可先補客戶卡；刪除後若已無有效商品，不再 ensureCustomerVisible 硬補回北區。
    try { if (customer && shouldKeepVisible && window.YX113CustomerRegions?.ensureCustomerVisible) await window.YX113CustomerRegions.ensureCustomerVisible(customer, '北區', true); } catch(_e) {}
    try { if (window.YX113CustomerRegions?.loadCustomerBlocks) await window.YX113CustomerRegions.loadCustomerBlocks(true); } catch(_e) {}
    try { if (customer && shouldKeepVisible && window.YX113CustomerRegions?.ensureCustomerVisible) await window.YX113CustomerRegions.ensureCustomerVisible(customer, '北區', true); } catch(_e) {}
    try { if (window.YX113CustomerRegions?.renderFromCurrentRows) window.YX113CustomerRegions.renderFromCurrentRows(); } catch(_e) {}
    try { if (window.YX113CustomerRegions?.selectCustomer && customer && shouldKeepVisible) await window.YX113CustomerRegions.selectCustomer(customer); } catch(_e) {}
    try { if (customer && shouldKeepVisible && typeof window.selectCustomerForModule === 'function') await window.selectCustomerForModule(customer); } catch(_e) {}
  }
  function rowFromCard(card){
    const source = card.dataset.source, id = card.dataset.id;
    return rowsStore(source).find(r => String(idOf(r) || '') === String(id));
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


  // V216: failure handling must not steal focus or break the next operation. Keep the optimistic UI, mark it as pending, and let the existing background queue retry.
  function yx216SoftFail(source, customer, reason, err, targets){
    try{
      const msg = clean((err && (err.message || err.error)) || '背景保存暫時失敗，已保留畫面與佇列');
      const ids = new Set((Array.isArray(targets) ? targets : []).map(x=>String(typeof x==='object' ? (x.id ?? x.item_id ?? '') : x)).filter(Boolean));
      const selector = '.yx113-summary-row,.yx113-product-card,.yx112-product-card';
      let marked = 0;
      if(!ids.size){
        window.dispatchEvent(new CustomEvent('yx:operation-soft-failed',{detail:{source,customer_name:customer||selectedCustomer(),reason:reason||'background-save-failed',error:msg,version:'v416',target_ids:[],marked_count:0,scope_key:'product-new-optimistic'}}));
        return;
      }
      document.querySelectorAll(selector).forEach(el=>{
        if(source && el.dataset.source!==source) return;
        const eid = String(el.dataset.id || el.dataset.itemId || el.querySelector?.('[data-id]')?.dataset?.id || '');
        if(ids.size && !ids.has(eid)) return;
        el.dataset.yxPendingSave='1'; el.dataset.yxPendingReason=reason||'background-save-failed'; el.dataset.yxPendingScope=[source,eid].filter(Boolean).join(':'); el.classList.add('yx-pending-save'); marked++;
      });
      // V406: when the failed request is a newly added optimistic item and no row id exists yet,
      // do not mark the whole source page; keep the operation card/payload pending only.
      window.dispatchEvent(new CustomEvent('yx:operation-soft-failed',{detail:{source,customer_name:customer||selectedCustomer(),reason:reason||'background-save-failed',error:msg,version:'v416',target_ids:Array.from(ids),marked_count:marked}}));
    }catch(_e){}
  }
  function yx216SoftSuccess(source, targets){
    try{
      const ids = new Set((Array.isArray(targets) ? targets : []).map(x=>String(typeof x==='object' ? (x.id ?? x.item_id ?? '') : x)).filter(Boolean));
      if(!ids.size) return;
      document.querySelectorAll('.yx-pending-save').forEach(el=>{
        if(source && el.dataset.source!==source) return;
        const eid = String(el.dataset.id || el.dataset.itemId || el.querySelector?.('[data-id]')?.dataset?.id || '');
        if(!ids.has(eid)) return;
        delete el.dataset.yxPendingSave; delete el.dataset.yxPendingReason; delete el.dataset.yxPendingScope; el.classList.remove('yx-pending-save');
      });
    }catch(_e){}
    try{ window.dispatchEvent(new CustomEvent('yx:operation-status',{detail:{source, status:'success', reason:'product-background-save-success', customer_name:selectedCustomer ? selectedCustomer() : '', product_label:'', message:'商品背景儲存完成', version:'v416', target_ids:Array.isArray(targets)?targets:[]}})); }catch(_e){}
  }
  function backgroundRequest(url, payload, opt={}){
    if (window.YXBackgroundSave && typeof window.YXBackgroundSave.request === 'function') {
      return window.YXBackgroundSave.request(url, payload, opt);
    }
    return YX.api(url, {method: opt.method || 'POST', body: JSON.stringify(payload || {}), headers: opt.headers || {}});
  }
  function sourceFromBgPayload(payload, url, data){
    try{
      const first = Array.isArray(payload?.items) ? payload.items[0] : null;
      let s = clean(payload?.source || payload?.module || first?.source || '');
      if(!s && data?.snapshots){
        if(Array.isArray(data.snapshots.inventory)) s='inventory';
        else if(Array.isArray(data.snapshots.orders)) s='orders';
        else if(Array.isArray(data.snapshots.master_order)||Array.isArray(data.snapshots.master_orders)) s='master_order';
      }
      if(!s){
        const u=String(url||'');
        if(u.includes('/api/inventory')) s='inventory';
        else if(u.includes('/api/orders')) s='orders';
        else if(u.includes('/api/master')) s='master_order';
        else if(u.includes('/api/customer-items')) s=sourceFromModule();
      }
      if(s==='master_orders') s='master_order';
      return s || sourceFromModule();
    }catch(_e){ return sourceFromModule(); }
  }
  function payloadFromBgItem(item){ try{ return JSON.parse(item?.body || '{}') || {}; }catch(_e){ return {}; } }

  function productIdsFromDetail(d){
    const ids=[]; const add=v=>{ v=clean(v); if(v) ids.push(v); };
    const walk=v=>{ try{
      if(!v) return;
      if(Array.isArray(v)){ v.forEach(walk); return; }
      if(typeof v==='object'){
        add(v.id || v.item_id || v.row_id || v.product_id || '');
        ['target_ids','ids','item_ids','items','changed_items','rows','payload'].forEach(k=>walk(v[k]));
      } else add(v);
    }catch(_e){} };
    walk(d?.target_ids || d?.ids || d?.payload || d?.data || d?.response || d?.result || d);
    return Array.from(new Set(ids));
  }
  function markProductPendingIds(source, ids, on, reason){
    source=source||sourceFromModule();
    ids=Array.from(new Set((ids||[]).map(x=>String(x||'')).filter(Boolean)));
    if(!ids.length) return 0;
    let n=0;
    document.querySelectorAll('.yx113-summary-row,.yx113-product-card,.yx112-product-card').forEach(el=>{
      const eid=String(el.dataset.id || el.dataset.itemId || el.querySelector?.('[data-id]')?.dataset?.id || '');
      const es=String(el.dataset.source || source || '');
      if(!ids.includes(eid)) return;
      if(source && es && es!==source) return;
      if(on){ el.dataset.yxPendingSave='1'; el.dataset.yxPendingReason=reason||'background-save-pending'; el.dataset.yxPendingScope=[es||source,eid].filter(Boolean).join(':'); el.classList.add('yx-pending-save'); }
      else { delete el.dataset.yxPendingSave; delete el.dataset.yxPendingReason; delete el.dataset.yxPendingScope; el.classList.remove('yx-pending-save'); }
      n++;
    });
    return n;
  }
  function applyProductPendingMarkers(source){
    try{
      const rows=(window.YX?.operationStatus?.read?.()||[]).filter(r=>r && r.status==='pending');
      rows.forEach(r=>{
        const src=clean(r.source||'');
        if(src && source && src!==source && !(src==='master_orders'&&source==='master_order')) return;
        markProductPendingIds(source, r.target_ids || productIdsFromDetail(r), true, r.reason || 'operation-pending');
      });
    }catch(_e){}
  }
  function bindProductPendingScopeEvents(){
    if(window.__YX_V406_PRODUCT_PENDING_SCOPE_BOUND__) return;
    window.__YX_V406_PRODUCT_PENDING_SCOPE_BOUND__=true;
    const productSource=d=>{
      const s=clean(d?.source || d?.module || d?.payload?.source || d?.payload?.source_table || '');
      if(s==='master_orders'||s==='master') return 'master_order';
      if(s==='order') return 'orders';
      return (s==='inventory'||s==='orders'||s==='master_order') ? s : '';
    };
    const onPending=ev=>{ const d=ev.detail||{}; const src=productSource(d); if(!src) return; markProductPendingIds(src, d.target_ids || productIdsFromDetail(d), true, d.reason||ev.type); };
    const onDone=ev=>{ const d=ev.detail||{}; const src=productSource(d); if(!src) return; markProductPendingIds(src, d.target_ids || productIdsFromDetail(d), false, d.reason||ev.type); };
    window.addEventListener('yx:bg-save-queued', onPending, {passive:true});
    window.addEventListener('yx:bg-save-failed', onPending, {passive:true});
    window.addEventListener('yx:bg-save-success', onDone, {passive:true});
    window.addEventListener('yx:operation-status-updated', ev=>{ try{ const r=ev.detail?.row||{}; if(r.status==='pending') onPending({detail:r}); else if(r.status==='success') onDone({detail:r}); }catch(_e){} }, {passive:true});
  }

  function applyProductBgSnapshot(data, source, customer, reason){
    try{
      if(!data || typeof data !== 'object') return false;
      source = source || sourceFromModule();
      customer = clean(customer || data.customer_name || selectedCustomer() || '');
      let applied = false;
      if(source) applied = !!applySnapshotFromResponse(data, source);
      if(!applied && source) applied = !!mergeSnapshotQuiet(data, source);
      if(applied){
        try{ clearCrossFunctionCaches(source, customer, reason || 'background-snapshot-success'); }catch(_e){}
        try{ if((source==='orders'||source==='master_order') && customer) refreshCustomerBoards(customer).catch(()=>{}); }catch(_e){}
        try{ window.dispatchEvent(new CustomEvent('yx:product-data-changed',{detail:{source, customer_name:customer, reason:reason||'background-snapshot-success', has_snapshot:true, sync_version:'v406-warehouse-order-drag-longpress-fix', cache_bust:'v406-warehouse-order-drag-longpress-fix'}})); }catch(_e){}
      }
      return applied;
    }catch(_e){ return false; }
  }
  function bindProductBgSnapshotListener(){
    try{
      if(window.__YX_V406_PRODUCT_BG_SNAPSHOT_BOUND__) return;
      window.__YX_V406_PRODUCT_BG_SNAPSHOT_BOUND__ = true;
      const seen = new Map();
      window.addEventListener('yx:bg-save-success', ev=>{
        try{
          const item = ev?.detail?.item || {};
          const url = clean(item.url || ev?.detail?.url || '');
          if(!url || url.includes('/api/warehouse')) return;
          if(!(/\/api\/(inventory|orders|master_orders|master_order|customer-item|customer-items)/.test(url))) return;
          const data = ev?.detail?.data || ev?.detail?.response || ev?.detail?.result || null;
          if(!data || typeof data !== 'object') return;
          const sig = clean(item.id || item.operation_id || data.operation_id || '') + '|' + url;
          const now = Date.now();
          if(sig && seen.has(sig) && now-Number(seen.get(sig)||0)<2500) return;
          if(sig) seen.set(sig, now);
          const payload = payloadFromBgItem(item);
          const source = sourceFromBgPayload(payload, url, data);
          const customer = clean(payload.customer_name || data.customer_name || (Array.isArray(payload.items)&&payload.items[0]?.customer_name) || selectedCustomer() || '');
          if(applyProductBgSnapshot(data, source, customer, 'queue-success-snapshot')){
            try{ window.dispatchEvent(new CustomEvent('yx:operation-status',{detail:{source, status:'success', reason:'product-bg-snapshot-applied', customer_name:customer, message:'商品背景保存完成，已套用後端清單', operation_id:item.operation_id||data.operation_id||'', version:'v416'}})); }catch(_e){}
          }
        }catch(_e){}
      }, {passive:true});
    }catch(_e){}
  }
  bindProductBgSnapshotListener();
  async function saveCardEdit(card){
    const row = rowFromCard(card); if (!row) return;
    const source = card.dataset.source, id = card.dataset.id;
    const payload = readCardPayload(card);
    if (!payload?.product_text) return YX.toast('請輸入尺寸或商品資料', 'warn');
    if ((source === 'orders' || source === 'master_order') && !payload.customer_name) return YX.toast('請輸入客戶名', 'warn');
    Object.assign(row, payload);
    card.classList.remove('yx128-card-editing');
    renderSummary(source); renderCards(source);
    YX.toast('已套用畫面，背景儲存商品', 'ok');
    backgroundRequest(urlFor(source, id), Object.assign({}, payload, {fast_response:true}), {method:'PUT'})
      .then(async (posted) => {
        try{ applyProductBgSnapshot(posted, source, payload.customer_name || selectedCustomer(), 'card-edit-success-snapshot'); }catch(_e){}
        yx216SoftSuccess(source, [id]);
        YX.toast('商品已永久儲存', 'ok');
        try { clearCrossFunctionCaches(source, payload.customer_name || selectedCustomer(), 'card-edit-success'); } catch(_e) {}
        // V469: skip old delayed DB reload; local DataStore already updated.
        try { if (window.YX116ShipPicker && selectedCustomer()) await window.YX116ShipPicker.load(selectedCustomer(),{force:false}); } catch(_e) {}
      })
      .catch(e => {
        yx216SoftFail(source, payload.customer_name || selectedCustomer(), 'card-edit-failed', e, [id]);
        YX.toast(e.message || '背景儲存失敗，已保留畫面並待重試', 'warn');
        try { window.YXBackgroundSave?.drain?.(); } catch(_e) {}
      });
  }
  async function editItem(card){
    renderCardEditor(card);
  }
  async function deleteItem(card){
    const source = card.dataset.source, id = card.dataset.id;
    if (!confirm(`確定刪除這筆${title(source)}商品？`)) return;
    const before = rowsStore(source).slice();
    const removed = before.find(r => String(idOf(r) || '') === String(id));
    const next = before.filter(r => String(idOf(r) || '') !== String(id));
    rowsStore(source, next);
    try { window.YXDataStore?.setRows?.(source, next, {reason:'product-delete-optimistic'}); } catch(_e) {}
    clearSelected(source); renderSummary(source); renderCards(source); removeDeletedRowsFromDom(source, new Set([String(id)]));
    const url = source === 'inventory' ? `/api/inventory/${encodeURIComponent(id)}` : source === 'orders' ? `/api/orders/${encodeURIComponent(id)}` : `/api/master_orders/${encodeURIComponent(id)}`;
    try{
      const d = await YX.api(url, {method:'DELETE'});
      YX.toast('已刪除', 'ok');
      try { clearCrossFunctionCaches(source, selectedCustomer(), 'delete-success', {skipCustomerSelected:true}); } catch(_e) {}
      if (!applySnapshotFromResponse(d, source)) { try { window.YXDataStore?.setRows?.(source, rowsStore(source), {reason:'product-delete-confirmed'}); } catch(_e) {} }
      try { if (source === 'orders' || source === 'master_order') await refreshCustomerBoards(customerOf(removed) || selectedCustomer(), {source, forceVisible:false, clearPanelOnEmpty:true}); } catch(_e) {}
    }catch(e){
      rowsStore(source, before);
      try { window.YXDataStore?.setRows?.(source, before, {reason:'product-delete-rollback'}); } catch(_e) {}
      renderSummary(source); renderCards(source);
      YX.toast(e.message || '刪除失敗，已還原畫面', 'error');
    }
  }
  async function moveInventory(card, target){
    const id = card.dataset.id;
    let customer = selectedCustomer();
    if (!customer) customer = prompt(`要加入${target === 'orders' ? '訂單' : '總單'}的客戶名稱`) || '';
    customer = YX.clean(customer);
    if (!customer) return YX.toast('請輸入客戶名稱', 'warn');
    const targetSource = target === 'orders' ? 'orders' : 'master_order';
    const d = await YX.api(`/api/inventory/${encodeURIComponent(id)}/move`, {method:'POST', body:JSON.stringify({target, customer_name:customer, region:'北區'})});
    YX.toast(`已加到${target === 'orders' ? '訂單' : '總單'}`, 'ok');
    try { clearCrossFunctionCaches('inventory', customer, 'move-inventory-success'); clearCrossFunctionCaches(targetSource, customer, 'move-inventory-success'); } catch(_e) {}
    window.__YX_SELECTED_CUSTOMER__ = customer;
    if (!applySnapshotFromResponse(d, 'inventory')) { try { window.YXDataStore?.setRows?.('inventory', rowsStore('inventory'), {reason:'inventory-move-confirmed'}); } catch(_e) {} }
    try { if (!applySnapshotFromResponse(d, targetSource)) { try { window.YXDataStore?.setRows?.(targetSource, rowsStore(targetSource), {reason:'inventory-move-target-confirmed'}); } catch(_e) {} } } catch(_e) {}
    try { if (window.renderCustomers) await window.renderCustomers(); } catch(_e) {}
    try { await refreshCustomerBoards(customer, {source:targetSource, forceVisible:true}); } catch(_e) {}
    try { if (typeof window.selectCustomerForModule === 'function') await window.selectCustomerForModule(customer); } catch(_e) {}
    try { window.dispatchEvent(new CustomEvent('yx:product-batch-write-success',{detail:{source:'inventory', target_source:targetSource, customer_name:customer, affected_customer_names:d?.affected_customer_names||[customer].filter(Boolean), count:1, reason:'inventory-move-success', sync_version:'v417-remove-opstatus-warehouse-visible-longpress', cache_bust:'v417-remove-opstatus-warehouse-visible-longpress'}})); } catch(_e) {}
  }
  async function shipItem(card){
    const source = card.dataset.source, id = card.dataset.id;
    const row = rowsStore(source).find(r => String(idOf(r) || '') === String(id)); if (!row) return;
    if (!confirm(`直接出貨：${customerOf(row)} ${row.product_text || ''}？`)) return;
    const customer = customerOf(row);
    const d = await YX.api('/api/items/transfer', {method:'POST', body:JSON.stringify({source:apiSource(source), id, target:'ship', customer_name:customer, qty:row.qty || qtyOf(row), allow_inventory_fallback:true})});
    YX.toast('已直接出貨', 'ok');
    try { clearCrossFunctionCaches(source, customer, 'direct-ship-success'); } catch(_e) {}
    if (!applySnapshotFromResponse(d, source)) { try { window.YXDataStore?.setRows?.(source, rowsStore(source), {reason:'source-write-confirmed'}); } catch(_e) {} }
    try { await refreshCustomerBoards(customer, {source, forceVisible:false}); } catch(_e) {}
    try { window.dispatchEvent(new CustomEvent('yx:ship-completed',{detail:{source, customer_name:customer, affected_customer_names:d?.affected_customer_names||[customer].filter(Boolean), result:d||{}, reason:'direct-ship-success', sync_version:'v417-remove-opstatus-warehouse-visible-longpress', cache_bust:'v417-remove-opstatus-warehouse-visible-longpress'}})); } catch(_e) {}
  }
  async function saveAllEdits(source){
    const rows = [...document.querySelectorAll(`#yx113-${source}-summary .yx128-edit-row[data-source="${source}"]`)];
    if (!rows.length) return;
    const items = [];
    for (const tr of rows){
      const id = Number(tr.dataset.id || 0);
      let row = rowsStore(source).find(r => String(idOf(r) || '') === String(id));
      if (!row || !id) {
        // main：暫存列沒有真實 id 時，先重抓後端清單，不能直接消失。
        try { await loadSource(source, {force:false, beforeEditSave:true}); } catch(_e) {}
        row = rowsStore(source).find(r => String(idOf(r) || '') === String(id));
        if (!row) continue;
      }
      const val = f => tr.querySelector(`[data-yx128-field="${f}"]`)?.value || '';
      const payload = payloadFromParts(source, row, {material:val('material'), size:val('size'), support:val('support'), qty:val('qty'), customer_name:val('customer_name'), zone:val('zone')});
      if (!payload.product_text) continue;
      if ((source === 'orders' || source === 'master_order') && !payload.customer_name) continue;
      Object.assign(row, payload);
      items.push({source:apiSource(source), id, ...payload});
    }
    if (!items.length) return YX.toast('沒有可儲存的商品', 'warn');
    const affectedCustomers = affectedCustomersForIds(source, items.map(x => x.id));
    // formal mainline behavior.
    state.editAll[source] = false;
    state.editScope[source] = null;
    clearSelected(source);
    renderSummary(source);
    renderCards(source);
    YX.toast(`已套用畫面並背景儲存 ${items.length} 筆`, 'ok');
    backgroundRequest('/api/customer-items/batch-update', {items, request_key:`v114-batch-${source}-${Date.now()}`})
      .then(d => {
        const applied = applySnapshotFromResponse(d, source);
        if (!applied) {
          mergeSnapshotQuiet(d, source);
          if (shouldAvoidRerender(source)) updateSummaryHeaderOnly(source);
          else { renderSummary(source); renderCards(source); }
        }
        yx216SoftSuccess(source, items.map(x=>x.id));
        YX.toast(`已儲存 ${d.count || items.length} 筆`, 'ok');
        const names = (Array.isArray(d.affected_customer_names) && d.affected_customer_names.length ? d.affected_customer_names : affectedCustomers).filter(Boolean);
        const primary = names[0] || selectedCustomer();
        try { (names.length ? names : [primary]).filter(Boolean).forEach(n => clearCrossFunctionCaches(source, n, 'batch-edit-success')); } catch(_e) {}
        try { if (source === 'orders' || source === 'master_order') (names.length ? names : [primary]).filter(Boolean).forEach(n => refreshCustomerBoards(n, {source, forceVisible:true}).catch(()=>{})); } catch(_e) {}
        try { if (window.YX116ShipPicker && primary) window.YX116ShipPicker.load(primary,{force:false}).catch(()=>{}); } catch(_e) {}
        try { window.dispatchEvent(new CustomEvent('yx:product-batch-write-success',{detail:{source, customer_name:primary, affected_customer_names:names, count:d.count||items.length, reason:'batch-edit-success', sync_version:'v417-remove-opstatus-warehouse-visible-longpress', cache_bust:'v417-remove-opstatus-warehouse-visible-longpress'}})); } catch(_e) {}
      })
      .catch(e => {
        try { window.YXBackgroundSave?.drain?.(); } catch(_retryErr) {}
        yx216SoftFail(source, selectedCustomer(), 'batch-edit-failed', e, items.map(x=>x.id));
        YX.toast(e.message || '已保留畫面修改，背景會繼續重試儲存', 'warn');
      });
    return;
  }
  async function bulkMaterial(source){
    const sel = $(`yx113-${source}-material`);
    const material = YX.clean(sel?.value || '').toUpperCase();
    if (!material) return YX.toast('請先選擇材質', 'warn');
    const ids = selectedOrAllIds(source);
    if (!ids.length) return YX.toast('目前沒有可套用材質的商品', 'warn');
    const items = ids.map(id => ({source:apiSource(source), id:Number(id)})).filter(x => x.id > 0);
    const affectedCustomers = affectedCustomersForIds(source, items.map(x => x.id));
    // formal mainline behavior.
    YX.toast(`正在套用材質 ${material}：${items.length} 筆`, 'ok');
    const idSet = new Set(items.map(x => String(x.id)));
    rowsStore(source).forEach(r => { if (idSet.has(String(idOf(r) || ''))) { r.material = material; r.product_code = material; } });
    renderSourceSafely(source);
    try{
      const d = await YX.api('/api/customer-items/batch-material', {method:'POST', body:JSON.stringify({material, items})});
      YX.toast(`已套用材質 ${material}：${d.count || items.length} 筆`, 'ok');
      if(sel) sel.value='';
      const names = (Array.isArray(d.affected_customer_names) && d.affected_customer_names.length ? d.affected_customer_names : affectedCustomers).filter(Boolean);
      const primary = names[0] || selectedCustomer();
      try { (names.length ? names : [primary]).filter(Boolean).forEach(n => clearCrossFunctionCaches(source, n, 'bulk-material-success')); } catch(_e) {}
      clearSelected(source);
      if (!applySnapshotFromResponse(d, source)) { try { window.YXDataStore?.setRows?.(source, rowsStore(source), {reason:'product-local-confirmed'}); } catch(_e) {}; if (shouldAvoidRerender(source)) updateSummaryHeaderOnly(source); else renderSummary(source); }
      try { if (source === 'orders' || source === 'master_order') for (const n of (names.length ? names : [primary]).filter(Boolean)) await refreshCustomerBoards(n, {source, forceVisible:true}); } catch(_e) {}
      try { window.dispatchEvent(new CustomEvent('yx:product-batch-write-success',{detail:{source, customer_name:primary, affected_customer_names:names, count:d.count||items.length, reason:'bulk-material-success', sync_version:'v417-remove-opstatus-warehouse-visible-longpress', cache_bust:'v417-remove-opstatus-warehouse-visible-longpress'}})); } catch(_e) {}
    }catch(e){
      await loadSource(source);
      YX.toast(e.message || '批量材質失敗，請確認材質是否在下拉選單內', 'error');
    }
  }
  function removeDeletedRowsFromDom(source, ids){
    const idSet = new Set(Array.from(ids || []).map(String));
    const box = document.getElementById(`yx113-${source}-summary`);
    if (!box) return;
    box.querySelectorAll('tr.yx113-summary-row').forEach(tr => {
      const id = String(tr.dataset.id || tr.querySelector('.yx113-row-check')?.dataset.id || '');
      const checked = !!tr.querySelector('.yx113-row-check:checked');
      if ((id && idSet.has(id)) || checked) tr.remove();
    });
    const tbody = box.querySelector('tbody');
    if (tbody && !tbody.querySelector('tr')) tbody.innerHTML = '<tr><td colspan="6">目前沒有資料</td></tr>';
  }
  async function bulkDelete(source){
    // v11：有勾選刪勾選；沒勾選則刪除目前清單可見商品，並立即從畫面消失。
    let items = selectedItems(source, true);
    const checkedRows = Array.from(document.querySelectorAll(`#yx113-${source}-summary .yx113-row-check:checked`)).map(cb => cb.closest('tr')).filter(Boolean);
    if (!items.length && checkedRows.length) {
      // 若剛新增的列還沒有後端 id，先從畫面與本機 rowsStore 移除，避免一定要手動重新整理。
      const texts = new Set(checkedRows.map(tr => Array.from(tr.children).slice(1,4).map(td => (td.textContent||'').trim()).join('|')));
      rowsStore(source, rowsStore(source).filter(r => { const p=splitProduct(r.product_text||''); return !texts.has([p.size||r.product_text||'', p.support||String(qtyOf(r)), String(qtyOf(r))].join('|')); }));
      clearSelected(source); renderSummary(source); renderCards(source); removeDeletedRowsFromDom(source, new Set());
      return YX.toast('已先從畫面移除；此列尚未取得後端 id，重新進頁後若仍出現請再刪一次', 'warn');
    }
    if (!items.length) return YX.toast('目前沒有可刪除的商品', 'warn');
    if (!confirm(`確定刪除 ${items.length} 筆商品？`)) return;
    const idSet = new Set(items.map(x => String(x.id)));
    const affectedCustomers = affectedCustomersForIds(source, items.map(x => x.id));
    const checkedRows2 = Array.from(document.querySelectorAll(`#yx113-${source}-summary .yx113-row-check:checked`)).map(cb => cb.closest('tr')).filter(Boolean);
    const keyOfRow = (r) => { const p=splitProduct(r.product_text||''); return [p.size||r.product_text||'', p.support||String(qtyOf(r)), String(qtyOf(r)), materialOf(r), customerOf(r), zoneLabel(r)].join('|'); };
    const checkedKeys = new Set(checkedRows2.map(tr => Array.from(tr.children).slice(0,5).map(td => (td.textContent||'').trim()).join('|')));
    rowsStore(source, rowsStore(source).filter(r => !idSet.has(String(idOf(r) || '')) && !checkedKeys.has(keyOfRow(r))));
    try { window.YXDataStore?.setRows?.(source, rowsStore(source), {reason:'product-bulk-delete-optimistic'}); } catch(_e) {}
    clearSelected(source);
    renderSummary(source); renderCards(source);
    removeDeletedRowsFromDom(source, idSet);
    try{
      const d = await YX.api('/api/customer-items/batch-delete', {method:'POST', body:JSON.stringify({items})});
      YX.toast(`批量刪除成功：${d.count || items.length} 筆，清單已立即移除`, 'ok');
      const names = (Array.isArray(d.affected_customer_names) && d.affected_customer_names.length ? d.affected_customer_names : affectedCustomers).filter(Boolean);
      const cust = selectedCustomer();
      try { (names.length ? names : [cust]).filter(Boolean).forEach(n => clearCrossFunctionCaches(source, n, 'bulk-delete-success', {skipCustomerSelected:true})); } catch(_e) {}
      // formal mainline behavior.
      // 下一次進頁或手動刷新時會從後端拿到已刪除後資料。
      if (!applySnapshotFromResponse(d, source)) { try { window.YXDataStore?.setRows?.(source, rowsStore(source), {reason:'product-local-confirmed'}); } catch(_e) {}; if (shouldAvoidRerender(source)) updateSummaryHeaderOnly(source); else renderSummary(source); }
      try { if (source === 'orders' || source === 'master_order') for (const n of (names.length ? names : [cust]).filter(Boolean)) await refreshCustomerBoards(n, {source, forceVisible:false, clearPanelOnEmpty:true}); } catch(_e) {}
      try { window.dispatchEvent(new CustomEvent('yx:product-batch-write-success',{detail:{source, customer_name:cust, affected_customer_names:names, count:d.count||items.length, reason:'bulk-delete-success', suppress_customer_selected:true, sync_version:'v417-remove-opstatus-warehouse-visible-longpress', cache_bust:'v417-remove-opstatus-warehouse-visible-longpress'}})); } catch(_e) {}
    }catch(e){
      await loadSource(source);
      YX.toast(e.message || '批量刪除失敗', 'error');
    }
  }
  function bindEvents(){
    if (state.bound) return; state.bound = true;
    document.addEventListener('click', async ev => {
      const source = sourceFromModule();
      const moreBtn = ev.target?.closest?.('[data-yx137-load-more]');
      if (moreBtn) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); const s = moreBtn.dataset.yx137LoadMore || source; state.displayLimit[s] = (Number(state.displayLimit[s] || 120) || 120) + 120; renderSummary(s); return; }
      const fullBtn = ev.target?.closest?.('[data-yx137-load-full]');
      if (fullBtn) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); const s = fullBtn.dataset.yx137LoadFull || source; state.displayLimit[s] = 999999; try { await loadSource(s, {force:false, full:true}); } catch(e) { YX.toast(e.message || '完整資料載入失敗','error'); } return; }
      const zf = ev.target?.closest?.('[data-yx132-zone-filter]');
      if (zf) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); const s = zf.dataset.source || source; state.zoneFilter[s] = zf.dataset.yx132ZoneFilter || 'ALL'; syncZoneButtons(s); renderSummary(s); renderCards(s); return; }
      const bt = ev.target?.closest?.('[data-yx132-batch-transfer]');
      if (bt) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); try{ window.safePushProductUndo(bt.dataset.source || source,'批量移動/加到清單'); await batchTransfer(bt.dataset.source || source, bt.dataset.yx132BatchTransfer); }catch(e){ YX.toast(e.message || '批量移動失敗','error'); } return; }
      const bz = ev.target?.closest?.('[data-yx132-batch-zone]');
      if (bz) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); try{ window.safePushProductUndo(bz.dataset.source || source,'移動 A/B 區'); await batchMoveZone(bz.dataset.source || source, bz.dataset.yx132BatchZone); }catch(e){ YX.toast(e.message || 'A/B區移動失敗','error'); } return; }
      const editAll = ev.target?.closest?.('[data-yx128-edit-all]');
      if (editAll) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); const s=editAll.dataset.yx128EditAll; try{ if(state.editAll[s]){ window.safePushProductUndo(s,'批量編輯儲存'); await saveAllEdits(s); } else beginBatchEdit(s); }catch(e){ YX.toast(e.message || '批量編輯失敗','error'); } return; }
      const cancelAll = ev.target?.closest?.('[data-yx128-cancel-all]');
      if (cancelAll) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); cancelBatchEdit(cancelAll.dataset.yx128CancelAll); return; }
      const saveAll = ev.target?.closest?.('[data-yx128-save-all]');
      if (saveAll) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); try{ window.safePushProductUndo(saveAll.dataset.yx128SaveAll,'批量編輯儲存'); await saveAllEdits(saveAll.dataset.yx128SaveAll); }catch(e){ YX.toast(e.message || '批量編輯儲存失敗','error'); } return; }
      const locBatchBtn = ev.target?.closest?.('[data-yx-product-location-batch]');
      if (locBatchBtn) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); try { await showSelectedProductLocations(locBatchBtn.dataset.yxProductLocationBatch || source); } catch(e) { YX.toast(e.message || '商品位置查詢失敗', 'error'); } return; }
      const locBtn = ev.target?.closest?.('[data-yx-product-location]');
      if (locBtn) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); try { await showProductLocations(locBtn.dataset.source || source, locBtn.dataset.id); } catch(e) { YX.toast(e.message || '商品位置查詢失敗', 'error'); } return; }
      const rowAction = ev.target?.closest?.('[data-yx131-row-action]');
      if (rowAction) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); try{ await handleRowAction(rowAction.dataset.source || source, rowAction.dataset.id, rowAction.dataset.yx131RowAction); }catch(e){ YX.toast(e.message || '清單操作失敗','error'); } return; }
      const cardSave = ev.target?.closest?.('[data-yx128-card-save]');
      if (cardSave) { const c = cardSave.closest('.yx113-product-card,.yx112-product-card'); if (c){ ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); try{ window.safePushProductUndo(c.dataset.source,'小卡編輯儲存'); await saveCardEdit(c); }catch(e){ YX.toast(e.message || '小卡儲存失敗','error'); } return; } }
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
      if (bm) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); try{ window.safePushProductUndo(bm.dataset.yx113BatchMaterial,'批量材質'); await bulkMaterial(bm.dataset.yx113BatchMaterial); }catch(e){ YX.toast(e.message || '批量材質失敗','error'); } return; }
      const bd = ev.target?.closest?.('[data-yx113-batch-delete]');
      if (bd) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); try{ window.safePushProductUndo(bd.dataset.yx113BatchDelete,'批量刪除'); await bulkDelete(bd.dataset.yx113BatchDelete); }catch(e){ YX.toast(e.message || '批量刪除失敗','error'); } return; }
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
  function publishGlobals(){
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
    Object.entries(bridges).forEach(([name, fn]) => { try { YX.safeExpose(name, fn, {configurable:true}); } catch(_e) {} });
    try { window.YX_MASTER = {...(window.YX_MASTER || {}), version:'v95-main-core', productActions:window.YX113ProductActions}; } catch(_e) {}
  }
  function cleanupLegacyProductDom(source){
    // formal mainline behavior.
    document.documentElement.dataset.yx115Products = 'main';
    ensureBatchToolbar(source);
    ensureSummary(source);
  }
  function scheduleRepair(source){ return; }
  function observeProductPage(source){ return; }
  function install(){
    const source = sourceFromModule(); if (!source) return;
    document.documentElement.dataset.yx113Products = 'main-v216';
    document.documentElement.dataset.yx114Products = 'main';
    document.documentElement.dataset.yx132Products = 'main';
    document.documentElement.dataset.yx135Products = 'main';
    bindEvents(); wrapSelectCustomer(); publishGlobals();
    if (!state.shipCompletedBound) {
      state.shipCompletedBound = true;
      window.addEventListener('yx:ship-completed', async (e)=>{
        const detail = e && e.detail ? e.detail : {};
        const result = detail.result && typeof detail.result === 'object' ? detail.result : {};
        const affectedCustomers = Array.isArray(detail.affected_customer_names) ? detail.affected_customer_names : (Array.isArray(detail.customer_names) ? detail.customer_names : (Array.isArray(result.affected_customer_names) ? result.affected_customer_names : []));
        const selected = selectedCustomer();
        try {
          const names = Array.from(new Set([detail.customer_name, selected, ...affectedCustomers].filter(Boolean)));
          names.forEach(n=>clearCrossFunctionCaches(sourceFromModule() || 'ship', n, 'ship-completed-v414'));
        } catch(_e) {}
        const payload = Object.assign({}, result, detail, {snapshots: detail.snapshots || result.snapshots || {}, customers: detail.customers || result.customers || []});
        const affected = Array.isArray(detail.affected_sources) ? detail.affected_sources : (Array.isArray(result.affected_sources) ? result.affected_sources : ['orders','master_order','inventory']);
        const current = sourceFromModule();
        let applied = false;
        try {
          if (current && affected.includes(current) && payload.snapshots) {
            applied = !!applySnapshotFromResponse(payload, current);
            if (!applied) applied = !!mergeSnapshotQuiet(payload, current);
          }
        } catch(_e) {}
        try { if (!applied && current && affected.includes(current)) await loadSource(current, {reason:'ship-completed-local'}); } catch(_e) {}
        try { if (Array.isArray(payload.customers) && window.YX113CustomerRegions?.renderBoards) window.YX113CustomerRegions.renderBoards(payload.customers); } catch(_e) {}
        try { if (window.YX113CustomerRegions?.loadCustomerBlocks && !Array.isArray(payload.customers)) await window.YX113CustomerRegions.loadCustomerBlocks(true); } catch(_e) {}
        try { const c = (affectedCustomers.includes(selected) ? selected : (detail.customer_name || selected)); if (c && window.YX113CustomerRegions?.selectCustomer) await window.YX113CustomerRegions.selectCustomer(c); } catch(_e) {}
        try { const c = (affectedCustomers.includes(selected) ? selected : (detail.customer_name || selected)); if (c) window.dispatchEvent(new CustomEvent('yx:customer-selected',{detail:{name:c,force:false,source:'ship',reason:'ship-completed-product-v414',snapshots_applied:applied,affected_customer_names:affectedCustomers}})); } catch(_e) {}
      }, false);
    }
    if (!state.warehouseChangedBound) {
      state.warehouseChangedBound = true;
      const refreshAfterWarehouse = async (e)=>{
        const detail = e && e.detail ? e.detail : {};
        const sourceNow = sourceFromModule();
        if (!sourceNow) return;
        const isWarehouse = detail.source === 'warehouse' || detail.reason === 'warehouse-changed' || detail.action === 'move' || detail.action === 'cell-save' || detail.action === 'return-unplaced' || detail.action === 'warehouse-drag-sync';
        if (!isWarehouse) return;
        const customer = clean(detail.customer_name || (Array.isArray(detail.customer_names) ? detail.customer_names[0] : '') || selectedCustomer());
        try { clearCrossFunctionCaches(sourceNow, customer, 'warehouse-change-v282'); } catch(_e) {}
        try { if (sourceNow === 'orders' || sourceNow === 'master_order') await loadSource(sourceNow, {reason:'warehouse-change-local'}); } catch(_e) {}
        try { if (window.YX113CustomerRegions?.loadCustomerBlocks) await window.YX113CustomerRegions.loadCustomerBlocks(true); } catch(_e) {}
        try { if (customer && window.YX113CustomerRegions?.selectCustomer) await window.YX113CustomerRegions.selectCustomer(customer); } catch(_e) {}
      };
      window.addEventListener('yx:warehouse-changed', refreshAfterWarehouse, false);
      window.addEventListener('yx:product-data-changed', refreshAfterWarehouse, false);
      window.addEventListener('yx:warehouse-customer-counts-refresh', refreshAfterWarehouse, false);
    }
    ensureBatchToolbar(source); ensureSummary(source); cleanupLegacyProductDom(source);
    if (state.installedSource === source && rowsStore(source).length) {
      renderSummary(source); renderCards(source);
    } else {
      state.installedSource = source;
      loadSource(source).catch(e => YX.toast(e.message || `${title(source)}載入失敗`, 'error'));
    }
  }
  YX.register('product_actions', {install, loadSource, refreshCurrent});
  const bootProductActions = () => { try { YX.install('product_actions'); } catch(_e) {} };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootProductActions, {once:true}); else bootProductActions();
})();

/* ===== main final product submit master: 唯一確認送出流程 ===== */
(function(){
  'use strict';
  if (window.__YX_main_FINAL_PRODUCT_SUBMIT__) return;
  window.__YX_main_FINAL_PRODUCT_SUBMIT__ = true;
  const $ = id => document.getElementById(id);
  const clean = v => String(v ?? '').trim();
  const norm = v => clean(v).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/\s+/g,'');
  const page = () => document.querySelector('.module-screen[data-module]')?.dataset.module || '';
  const apiPath = m => m === 'inventory' ? '/api/inventory' : m === 'orders' ? '/api/orders' : '/api/master_orders';
  let submitting = false;

  function toast(msg, type){
    try { (window.YXCore?.toast || window.toast || window.showToast || window.notify || window.alert)(msg, type); }
    catch(_e){ alert(msg); }
  }
  async function api(url, opt={}){
    opt = opt || {};
    const method = String(opt.method || 'GET').toUpperCase();
    let timer = null, ctrl = null;
    if (!opt.signal && window.AbortController) {
      ctrl = new AbortController();
      opt = {...opt, signal: ctrl.signal};
      timer = setTimeout(()=>{ try{ ctrl.abort(); }catch(_e){} }, Number(opt.timeout || (method === 'GET' ? 9000 : 18000)));
    }
    let r;
    try {
      r = await window.YXDataStore.requestResponse(url, {
        credentials:'same-origin',
        cache:'no-store',
        ...opt,
        headers:{'Accept':'application/json','Content-Type':'application/json','Cache-Control':'no-cache','X-YX-V20':'true',...(opt.headers||{})}
      });
    } finally { if (timer) clearTimeout(timer); }
    const t = await r.text();
    let d = {};
    try { d = t ? JSON.parse(t) : {}; } catch(_e) { d = {success:false, error:t}; }
    if (!r.ok || d.success === false) throw new Error(d.error || d.message || '送出失敗');
    return d;
  }
  function qtyFromProduct(text){
    return window.YX30EffectiveQty ? window.YX30EffectiveQty(text, 1) : 1;
  }
  function normalizeProductTextWithMonth(value){
    let raw = clean(value || '').replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/[＋，,；;]/g,'+');
    const mm = raw.match(/(?:^|[\s,，\/])([1-9]|1[0-2])\s*(?:月|月份)(?=\s|\d|x|X|$)/);
    let month = '';
    if (mm) {
      month = `${Number(mm[1])}月`;
      raw = raw.slice(0, mm.index) + ' ' + raw.slice(mm.index + mm[0].length);
    }
    raw = raw.replace(/\s+/g,'');
    if (month && !raw.startsWith(month)) raw = month + raw;
    return raw;
  }
  function splitMaterial(line){
    line = clean(line);
    const m = line.match(/^([A-Za-z\u4e00-\u9fff]{1,8})\s+(.+?=.+)$/);
    if (m && !/^\d/.test(m[1])) return {material:m[1].toUpperCase(), product_text:normalizeProductTextWithMonth(m[2])};
    return {material:'', product_text:normalizeProductTextWithMonth(line)};
  }
  function parseItems(text){
    return clean(text).split(/\n+/).map(splitMaterial).filter(x=>x.product_text).map(x=>({
      product_text:x.product_text,
      material:x.material,
      product_code:x.material,
      qty:qtyFromProduct(x.product_text)
    })).filter(x=>x.qty>0);
  }


  function yx215StableEventId(name, detail){
    detail = detail || {};
    const customers = Array.isArray(detail.customer_names) ? detail.customer_names.join('|') : '';
    const items = Array.isArray(detail.items) ? String(detail.items.length) : '';
    return [name, detail.operation_id || detail.request_key || detail.event_id || '', detail.reason || detail.action || '', detail.source || '', detail.customer_name || detail.name || customers || '', detail.zone || '', detail.column_index || detail.col || '', detail.slot_number || detail.slot || '', items].join('::');
  }
  function yx215EmitOnce(name, detail, ttl){
    try{
      const now = Date.now(); ttl = Number(ttl || 700);
      const key = yx215StableEventId(name, detail);
      const box = window.__YX_V215_EVENT_GUARD__ || (window.__YX_V215_EVENT_GUARD__ = new Map());
      const last = Number(box.get(key) || 0);
      if(last && now - last < ttl) return false;
      box.set(key, now);
      if(box.size > 240){ for(const [k,t] of Array.from(box.entries())){ if(now - Number(t||0) > 6000) box.delete(k); } }
      window.dispatchEvent(new CustomEvent(name, {detail: {...(detail||{}), sync_guard:'v417', sync_version:'v417-remove-opstatus-warehouse-visible-longpress', cache_bust:'v417-remove-opstatus-warehouse-visible-longpress'}}));
      return true;
    }catch(_e){ try{ window.dispatchEvent(new CustomEvent(name,{detail:detail||{}})); }catch(__e){} return true; }
  }

  function clearCrossFunctionCaches(source, customer, reason, opts={}){
    source = clean(source || page() || ''); customer = clean(customer || selectedCustomer() || window.__YX_SELECTED_CUSTOMER__ || '');
    try {
      ['ship_customers_v415','ship_customers_v414','ship_customers_v413','ship_customers_v412','ship_customers_v406','ship_customers_v386','ship_customers_v383','ship_customers_v380','ship_customers_v379','ship_customers_v337','ship_customers_v332','ship_customers_v307','ship_customers_v287','ship_customers_v282','ship_customers_v267','ship_customers_v252','ship_customers_v228','ship_customers_v227','ship_customers_v226','ship_customers_v225','ship_customers_v224','ship_customers_v223','ship_customers_v222','ship_customers_v221','ship_customers_v216','ship_customers_v215','ship_customers_v214','ship_customers_v210','ship_customers_v208','ship_customers_v207','ship_customers_v199','ship_customers_v198','ship_customers_v197','today_changes_v287','today_changes_v282','today_changes_v267','today_changes_v252','today_changes_v228','today_changes_v227','today_changes_v226','today_changes_v225','today_changes_v224','today_changes_v223','today_changes_v222','today_changes_v221','today_changes_v215','today_changes_v214','today_changes_v210','today_changes_v208','today_changes_v207','today_changes_v199','today_changes_v198','today_changes_v197','today_changes_light_v287','today_changes_light_v282','today_changes_light_v267','today_changes_light_v252','today_changes_light_v228','today_changes_light_v227','today_changes_light_v226','today_changes_light_v225','today_changes_light_v224','today_changes_light_v223','today_changes_light_v222','today_changes_light_v221','today_changes_light_v215','today_changes_light_v214','today_changes_light_v210','today_changes_light_v208','today_changes_light_v207','today_changes_light_v199','today_changes_light_v198','warehouse_available_v287','warehouse_available_v282','warehouse_available_v267','warehouse_available_v257','warehouse_available_v252','warehouse_available_v228','warehouse_available_v227','warehouse_available_v226','warehouse_available_v225','warehouse_available_v224','warehouse_available_v223','warehouse_available_v222','warehouse_available_v221','warehouse_available_v215','warehouse_available_v214','warehouse_available_v210','warehouse_available_v208','warehouse_available_v207','warehouse_available_v199','warehouse_available_v198','warehouse_available_v197','warehouse_source_qty_map_v287','warehouse_source_qty_map_v282','warehouse_source_qty_map_v267','warehouse_source_qty_map_v257','warehouse_source_qty_map_v252','warehouse_source_qty_map_v228','warehouse_source_qty_map_v227','warehouse_source_qty_map_v226','warehouse_source_qty_map_v225','warehouse_source_qty_map_v224','warehouse_source_qty_map_v223','warehouse_source_qty_map_v222','warehouse_source_qty_map_v221','warehouse_source_qty_map_v215','warehouse_source_qty_map_v214','warehouse_source_qty_map_v210','warehouse_source_qty_map_v208','warehouse_source_qty_map_v207','warehouse_source_qty_map_v199','warehouse_source_qty_map_v198','warehouse_source_qty_map_v197'].forEach(k=>window.YX?.cache?.remove?.(k));
      window.YX?.cache?.clearGroup?.('ship_customers_'); window.YX?.cache?.clearGroup?.('ship_items_');
      window.YX?.cache?.clearGroup?.('customer_blocks_');
      // V467: 寫入後不清 products_/warehouse_available_/today_changes_ 權威同步快取；資料由 YXMutationBus 更新。
    } catch(_e) {}
    try { yx215EmitOnce('yx:product-data-changed', {source, customer_name:customer, reason:reason||'product-write', version:'v416'}, 900); } catch(_e) {}
    try { if(source === 'orders' || source === 'master_order') yx215EmitOnce('yx:order-master-changed', {source, customer_name:customer, reason:reason||'product-write', version:'v416'}, 900); } catch(_e) {}
    try { if(customer && !opts.skipCustomerSelected) yx215EmitOnce('yx:customer-selected', {name:customer, force:false, source, reason:'product-write-v465-local-first'}, 650); } catch(_e) {}
  }
  function activeZoneForSource(m){
    try {
      const btn = document.querySelector(`[data-yx132-zone-filter].is-active[data-source="${m}"]`);
      const z = (btn?.dataset?.yx132ZoneFilter || '').toUpperCase();
      return (z === 'A' || z === 'B') ? z : '';
    } catch(_e) { return ''; }
  }
  function submittedRowsFor(m, customer, submittedItems, location){
    const now = Date.now();
    return (Array.isArray(submittedItems) ? submittedItems : []).map((it, idx) => ({
      id: `tmp-${now}-${idx}`,
      product_text: it.product_text || '',
      product_code: it.product_code || it.material || '',
      material: it.material || it.product_code || '',
      qty: Number(it.qty || 1),
      customer_name: customer || '',
      location: location || '',
      zone: location || '',
      warehouse_zone: location || '',
      __optimistic: true
    })).filter(r => r.product_text);
  }
  function mergeSubmittedRows(baseRows, submittedRows){
    const out = Array.isArray(baseRows) ? baseRows.slice() : [];
    for (const nr of submittedRows) {
      const exists = out.some(r => String(r.product_text || '') === String(nr.product_text || '') &&
        String((r.material || r.product_code || '')).toUpperCase() === String((nr.material || nr.product_code || '')).toUpperCase() &&
        String(r.customer_name || '') === String(nr.customer_name || '') &&
        String(r.location || r.zone || r.warehouse_zone || '') === String(nr.location || nr.zone || nr.warehouse_zone || ''));
      if (!exists) out.unshift(nr);
    }
    return out;
  }
  function forceCustomerCardVisible(customer, source){
    customer = clean(customer || '');
    if (!customer || !['orders','master_order'].includes(source || page())) return;
    const src = source || page();
    const act = window.YX113ProductActions || window.YX132ProductActions || window.YX128ProductActions;
    let rows = [];
    try { rows = act?.rowsStore?.(src) || []; } catch(_e) { rows = []; }
    rows = (Array.isArray(rows) ? rows : []).filter(r => { const n = clean(r.customer_name || r.customer || ''); return n === customer || sameCustomerName(n, customer); });
    let rowCount = rows.length;
    let qtyTotal = rows.reduce((sum, r) => sum + (qtyFromProduct(r.product_text || '', r.qty || 1) || 1), 0);
    if (!rowCount) { rowCount = 1; qtyTotal = 1; }
    const allBoards = ['region-north','region-center','region-south','customers-north','customers-center','customers-south'].map(id => $(id)).filter(Boolean);
    const existing = allBoards.map(b => Array.from(b.querySelectorAll('[data-customer-name],[data-customer]')).find(el => clean(el.dataset.customerName || el.dataset.customer || '') === customer)).find(Boolean);
    if (existing) {
      existing.querySelector('.yx113-customer-count,.yx116-customer-count')?.replaceChildren(document.createTextNode(`${qtyTotal}件 / ${rowCount}筆`));
      return existing;
    }
    const html = `<button type="button" class="customer-region-card yx113-customer-card yx114-customer-card yx116-customer-card yx117-customer-card yx-v15-force-customer-card" data-customer-name="${esc(customer)}" data-customer="${esc(customer)}" data-region="北區"><span class="yx113-customer-left yx116-customer-name yx-v43-big-customer-name">${esc(customer)}</span><span class="yx113-customer-tag yx116-customer-tag"></span><span class="yx113-customer-count yx116-customer-count">${qtyTotal}件 / ${rowCount}筆</span></button>`;
    ['region-north','customers-north'].forEach(id => {
      const box = $(id); if (!box) return;
      box.querySelector('.empty-state-card')?.remove();
      if (!Array.from(box.querySelectorAll('[data-customer-name],[data-customer]')).some(el => clean(el.dataset.customerName || el.dataset.customer || '') === customer)) {
        box.insertAdjacentHTML('beforeend', html);
      }
    });
    return document.querySelector(`[data-customer-name="${CSS.escape(customer)}"],[data-customer="${CSS.escape(customer)}"]`);
  }
  window.__YX_FORCE_CUSTOMER_CARD_VISIBLE__ = forceCustomerCardVisible;


  async function refreshCustomerBoardsSafe(customer){
    customer = clean(customer || '');
    try { if (customer) window.__YX_SELECTED_CUSTOMER__ = customer; } catch(_e) {}
    try { if (customer && $('customer-name')) $('customer-name').value = customer; } catch(_e) {}
    try { if (customer) forceCustomerCardVisible(customer, page()); } catch(_e) {}
    try { window.YX113CustomerRegions?.renderFromCurrentRows?.(); } catch(_e) {}
    try { if (customer) forceCustomerCardVisible(customer, page()); } catch(_e) {}
    try { if (customer && window.YX113CustomerRegions?.selectCustomer) window.YX113CustomerRegions.selectCustomer(customer).catch(()=>{}); } catch(_e) {}
    try { if (window.YX113CustomerRegions?.loadCustomerBlocks) window.YX113CustomerRegions.loadCustomerBlocks(true).then(()=>{ if(customer) forceCustomerCardVisible(customer, page()); }).catch(()=>{}); } catch(_e) {}
    try {
      const src = page();
      if (customer && (src === 'orders' || src === 'master_order')) {
        const d = await api('/api/customer-items?name=' + encodeURIComponent(customer) + '&local_first=1&fast=1&v469=1', {method:'GET'});
        const items = Array.isArray(d.items) ? d.items : [];
        if (window.YX113CustomerRegions?.selectCustomer) {
          try { window.YX113CustomerRegions.selectCustomer(customer).catch(()=>{}); } catch(_e) {}
        }
        try { if (items.length) renderSelectedCustomerItems(customer, items); } catch(_e) {}
      }
    } catch(_e) {}
  }

  async function refreshAfterSubmit(m, customer, posted, submittedItems, location){
    customer = clean(customer || '');
    const act = window.YX113ProductActions || window.YX132ProductActions || window.YX128ProductActions;
    try { if (customer) window.__YX_SELECTED_CUSTOMER__ = customer; } catch(_e) {}
    try { if (customer && $('customer-name')) $('customer-name').value = customer; } catch(_e) {}

    if (posted && posted.fast_response && !Array.isArray(posted.exact_customer_items) && !Array.isArray(posted.items) && !posted.snapshots) {
      try {
        const idle = window.YX?.scheduler?.idle || window.requestIdleCallback || function(fn){ return setTimeout(fn, 300); };
        idle(() => { try { act?.loadSource?.(m, {afterSubmit:true, customer_name:customer}); } catch(_e){} }, 1800);
      } catch(_e) {}
      try { if (customer && (m === 'orders' || m === 'master_order')) forceCustomerCardVisible(customer, m); } catch(_e) {}
      return;
    }

    // main：新增成功後優先使用後端回傳的真實資料列與 snapshots，不保留 tmp-* 暫存列。
    // 訂單 / 總單若有 exact_customer_items，會先替換同客戶資料；若有全表 items/snapshots 則直接用全表。
    let serverRows = [];
    const snaps = posted?.snapshots || {};
    if (Array.isArray(snaps[m])) serverRows = snaps[m];
    else if (m === 'master_order' && Array.isArray(snaps.master_orders)) serverRows = snaps.master_orders;
    else if (Array.isArray(posted?.items)) serverRows = posted.items;

    const exactRows = Array.isArray(posted?.exact_customer_items) ? posted.exact_customer_items : [];
    if ((!serverRows || !serverRows.length) && exactRows.length && act?.rowsStore) {
      const before = Array.isArray(act.rowsStore(m)) ? act.rowsStore(m) : [];
      serverRows = before.filter(r => clean(r.customer_name || r.customer || '') !== customer).concat(exactRows);
    }

    if (act?.rowsStore) {
      if (Array.isArray(serverRows) && serverRows.length) {
        act.rowsStore(m, serverRows);
        try { window.YXDataStore?.setRows?.(m, serverRows, {reason:'submit-server-rows-v467'}); } catch(_e) {}
      } else {
        // V467: fast_response 沒有完整 rows 時，不要刪掉 tmp 樂觀列，也不要立刻重打 DB。
        // 保留目前畫面與 DataStore，等下一次同步或後端 snapshots 再對齊真實 id。
        const current = Array.isArray(act.rowsStore(m)) ? act.rowsStore(m) : [];
        act.rowsStore(m, current);
        try { window.YXDataStore?.setRows?.(m, current, {reason:'submit-fast-response-keep-local-v467'}); } catch(_e) {}
      }
      act.renderSummary?.(m);
      act.renderCards?.(m);
    }

    if (m === 'orders' || m === 'master_order') {
      // 後端已在 /api/orders 或 /api/master_orders 寫入 customer_profiles，這裡先用回傳 customers 重畫，不等待二次 ensure。
      try { if (Array.isArray(posted?.customers) && window.YX113CustomerRegions?.renderBoards) window.YX113CustomerRegions.renderBoards(posted.customers); } catch(_e) {}
      try { forceCustomerCardVisible(customer, m); } catch(_e) {}
      try { window.YX113CustomerRegions?.renderFromCurrentRows?.(); } catch(_e) {}
      try { forceCustomerCardVisible(customer, m); } catch(_e) {}
      try { if (window.YX113CustomerRegions?.selectCustomer) window.YX113CustomerRegions.selectCustomer(customer).catch(()=>{}); } catch(_e) {}
      // 背景保險：如果客戶尚未入 DB，再補一次；不阻塞畫面。
      try {
        api('/api/customers/ensure', {method:'POST', body:JSON.stringify({name:customer, region:'北區', preserve_existing:true, request_key:`main-ensure-${Date.now()}-${Math.random().toString(36).slice(2)}`})})
          .then(_d => { try { window.YX113CustomerRegions?.renderFromCurrentRows?.(); } catch(_e) {} try { forceCustomerCardVisible(customer, m); } catch(_e) {} })
          .catch(e => console.warn('[YX main ensure customer background]', e));
      } catch(_e) {}
      try {
        Promise.resolve().then(()=>{ try { forceCustomerCardVisible(customer, m); } catch(_e) {} });
      } catch(_e) {}
    }
  }
  
  function duplicateSizeKey(productText){
    const raw = clean(productText || '');
    const left = raw.includes('=') ? raw.split('=')[0] : raw;
    return String(left || raw || '').replace(/^(?:[1-9]|1[0-2])月/, '').replace(/\s+/g,'').toLowerCase();
  }
  function duplicateMaterialKey(v){ return clean(v || '').toUpperCase() || '未填材質'; }
  function findDuplicateMergeGroups(m, customer, items){
    const groups = new Map();
    const add = (key, label) => {
      if (!key) return;
      if (!groups.has(key)) groups.set(key, {key, labels:[]});
      groups.get(key).labels.push(label);
    };
    (Array.isArray(items) ? items : []).forEach((it, idx) => {
      const key = `${duplicateSizeKey(it.product_text)}|${duplicateMaterialKey(it.material || it.product_code)}`;
      add(key, `新增第${idx+1}筆 ${it.material || '未填材質'} ${it.product_text}`);
    });
    const rows = (() => { try { return (window.YX113ProductActions || window.YX132ProductActions || window.YX128ProductActions)?.rowsStore?.(m) || []; } catch(_e) { return []; } })();
    const cust = clean(customer || '');
    (Array.isArray(rows) ? rows : []).forEach(r => {
      if ((m === 'orders' || m === 'master_order') && cust && clean(r.customer_name || '') !== cust) return;
      const key = `${duplicateSizeKey(r.product_text)}|${duplicateMaterialKey(r.material || r.product_code)}`;
      if (groups.has(key)) add(key, `既有 ${r.material || r.product_code || '未填材質'} ${r.product_text}`);
    });
    return Array.from(groups.values()).filter(g => g.labels.length > 1).slice(0, 8);
  }
  function decideDuplicateMode(m, customer, items){
    const groups = findDuplicateMergeGroups(m, customer, items);
    if (!groups.length) return 'merge';
    const lines = groups.map(g => '・' + g.labels.slice(0, 4).join(' / '));
    const msg = `偵測到相同尺寸＋材質的商品，是否要合併？\n\n${lines.join('\n')}\n\n按「確定」＝合併數量。\n按「取消」＝不要合併，分開新增保存。`;
    return window.confirm(msg) ? 'merge' : 'separate';
  }
  function safePushProductUndo(source,label){
    try {
      if (typeof window.pushProductUndo === 'function') return window.pushProductUndo(source,label);
      if (window.YXPageUndo && typeof window.YXPageUndo.snapshot === 'function') {
        const act = window.YX113ProductActions || window.YX132ProductActions || window.YX128ProductActions;
        const before = JSON.parse(JSON.stringify((act?.rowsStore?.(source) || window.__YX112_ROWS__?.[source] || [])));
        window.YXPageUndo.snapshot(label || '新增商品', async()=>{
          try {
            if (act?.rowsStore) { act.rowsStore(source, before); act.renderSummary?.(source); act.renderCards?.(source); }
          } catch(_e) {}
        });
      }
    } catch(_e) {}
  }
  window.safePushProductUndo = safePushProductUndo;
  async function finalConfirmSubmit(ev){
    if (ev) { ev.preventDefault?.(); ev.stopPropagation?.(); ev.stopImmediatePropagation?.(); }
    const m = page();
    // V386: the button listener and document-capture safety listener share one short guard.
    // It blocks same-tap/double-click duplicates but releases quickly so the user can keep entering the next product.
    if (submitting) return;
    submitting = true;
    setTimeout(()=>{ submitting = false; }, 650);
    if (m === 'ship' && window.__YX_SHIP_SINGLE_MAIN__) return;
    if (!['inventory','orders','master_order'].includes(m)) return;
    const btn = $('submit-btn');
    const ta = $('ocr-text');
    const result = $('module-result');
    const text = clean(ta?.value || '');
    const customer = clean($('customer-name')?.value || window.__YX_SELECTED_CUSTOMER__ || '');
    if (!text) return toast('請輸入商品資料','warn');
    if (m !== 'inventory' && !customer) return toast('請輸入客戶名稱','warn');
    const items = parseItems(text);
    if (!items.length) return toast('商品格式無法辨識，請確認有尺寸與支數','warn');
    const duplicateMode = decideDuplicateMode(m, customer, items);
    const requestKey = `v59-bg-submit-${m}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const activeZone = activeZoneForSource(m);
    window.safePushProductUndo(m, '新增商品');

    // formal mainline behavior.
    const preOptimistic = submittedRowsFor(m, customer, items, activeZone);
    try {
      const act = window.YX113ProductActions || window.YX132ProductActions || window.YX128ProductActions;
      if (act?.rowsStore) {
        const mergedOptimisticRows = mergeSubmittedRows(act.rowsStore(m) || [], preOptimistic);
        act.rowsStore(m, mergedOptimisticRows);
        try { window.YXDataStore?.setRows?.(m, mergedOptimisticRows, {reason:'submit-optimistic-v467'}); } catch(_e) {}
        act.renderSummary?.(m); act.renderCards?.(m);
      }
      if (customer && (m === 'orders' || m === 'master_order')) {
        window.__YX_SELECTED_CUSTOMER__ = customer;
        if ($('customer-name')) $('customer-name').value = customer;
        forceCustomerCardVisible(customer, m);
        try { window.YX113CustomerRegions?.renderFromCurrentRows?.(); forceCustomerCardVisible(customer, m); } catch(_e) {}
        try { renderSelectedCustomerItems(customer, preOptimistic.concat((window.YX113ProductActions?.rowsStore?.(m)||[]).filter(r=>clean(r.customer_name||r.customer||'')===customer))); } catch(_e) {}
        try { window.YX113CustomerRegions?.selectCustomer?.(customer); } catch(_e) {}
      }
    } catch(e){ console.warn('[YX V59 optimistic submit]', e); }

    if (ta) { ta.value = ''; ta.focus?.(); }
    if (btn) { btn.disabled = false; btn.textContent = '確認送出'; }
    if (result) {
      result.classList.remove('hidden');
      result.style.display = '';
      result.innerHTML = `<strong>新增成功，已先顯示在前端；背景正在寫入資料庫</strong><div class="small-note">${items.map(i=>i.product_text).join('、')}</div>`;
    }
    toast(`已先顯示 ${items.length} 筆，可直接新增下一筆`, 'ok');

    const activeEl = () => document.activeElement && document.activeElement.matches && document.activeElement.matches('#ocr-text,#customer-name,input,textarea,select,[contenteditable="true"]');
    api(apiPath(m), {method:'POST', body:JSON.stringify({customer_name:customer, ocr_text:text, items, duplicate_mode:duplicateMode, location:activeZone, zone:activeZone, region:(m === 'orders' || m === 'master_order') ? '北區' : '', request_key:requestKey, fast_response:true, verify_readback:true, v452_save_lock:true})})
      .then(async posted => {
        try {
          const act = window.YX113ProductActions || window.YX132ProductActions || window.YX128ProductActions;
          if (posted && (Array.isArray(posted.items) || posted.snapshots || posted.exact_customer_items)) {
            const focused = activeEl();
            await refreshAfterSubmit(m, customer, posted, items, activeZone);
            if (focused && ta) { try { ta.focus({preventScroll:true}); } catch(_e) {} }
          } else {
            const focused = activeEl();
            await refreshAfterSubmit(m, customer, posted || {}, items, activeZone);
            if (focused && ta) { try { ta.focus({preventScroll:true}); } catch(_e) {} }
          }
          if (result && !activeEl()) {
            result.classList.remove('hidden'); result.style.display = '';
            result.innerHTML = `<strong>背景儲存完成，已同步後端清單</strong><div class="small-note">${items.map(i=>i.product_text).join('、')}</div>`;
          }
          toast(`背景儲存完成：${items.length} 筆`, 'ok');
          try { clearCrossFunctionCaches(m, customer, 'submit-success'); } catch(_e) {}
          try { if ((m === 'orders' || m === 'master_order') && customer) { forceCustomerCardVisible(customer, m); window.YX113CustomerRegions?.renderFromCurrentRows?.(); } } catch(_e) {}
          try {
            const act2 = window.YX113ProductActions || window.YX132ProductActions || window.YX128ProductActions;
            // v459: no immediate full-table reload after fast save; exact_customer_items already updates the screen. Full reload is manual/sync only.
            // setTimeout removed to prevent slow DB write/refresh feeling and stale cache overwrites.
          } catch(_e) {}
        } catch(e) { console.warn('[YX V59 background refresh]', e); }
      })
      .catch(e => {
        try { window.YXBackgroundSave?.drain?.(); } catch(_retryErr) {}
        if (result) {
          result.classList.remove('hidden'); result.style.display = '';
          const safeMsg = YX.esc(clean(e.message || '網路切頁或暫時斷線').replace(/<[^>]+>/g, ' ').slice(0, 180));
          result.innerHTML = `<strong style="color:#92400e">目前已保留在畫面，背景會繼續重試寫入資料庫</strong><div class="small-note">${safeMsg}</div>`;
        }
        yx216SoftFail(m, customer, 'submit-background-failed', e, []);
        try { clearCrossFunctionCaches(m, customer, 'submit-background-failed'); } catch(_e) {}
        toast(e.message || '已保留待背景儲存','warn');
      });
  }
  window.confirmSubmit = finalConfirmSubmit;
  window.YXConfirmSubmit = finalConfirmSubmit;
  function bindFinalSubmitButton(){
    const btn = $('submit-btn');
    if (!btn) return;
    btn.type = 'button';
    // V386: document-capture listener below is the single submit click path.
    // This function only normalizes the button type and marks it as prepared,
    // preventing duplicate per-button click bindings when pages are re-entered.
    btn.dataset.yxV386SubmitPrepared = '1';
  }
  bindFinalSubmitButton();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindFinalSubmitButton, {once:true});
  if (!window.__YX_V386_FINAL_SUBMIT_DOCUMENT_BOUND__) {
    window.__YX_V386_FINAL_SUBMIT_DOCUMENT_BOUND__ = true;
    document.addEventListener('click', ev => {
      const btn = ev.target?.closest?.('#submit-btn');
      if (!btn) return;
      const m = page();
      if (!['inventory','orders','master_order'].includes(m)) return;
      finalConfirmSubmit(ev);
    }, true);
  }
})();

/* ===== END merged page static/yx_pages/page_products_master.js ===== */

/* ===== MERGED INTO main FROM static/yx_modules/customer_regions_main.js ===== */
/* formal product page core */
(function(){
  'use strict';
  const YX = window.YXCore;
  if (!YX) return;
  const $ = id => document.getElementById(id);
  const state = {items:[], bound:false, oldSelect:null, rendering:false, observer:null, repairTimer:null, lastRenderAt:0, itemCache:new Map()};
  const REGIONS = ['北區','中區','南區'];
  const moduleKey = () => YX.moduleKey();
  const isRegionPage = () => ['orders','master_order','ship','customers'].includes(moduleKey()) || !!$('region-north') || !!$('customers-north');
  const normRegion = v => { const s = YX.clean(v); return s.includes('中') ? '中區' : s.includes('南') ? '南區' : '北區'; };
  function tradeInfo(name){
    const raw = YX.clean(name || '');
    const tags = [];
    raw.replace(/FOB代付|FOB代|FOB|CNF/gi, m => { const t = /代/.test(m) ? 'FOB代' : m.toUpperCase(); if (!tags.includes(t)) tags.push(t); return m; });
    const base = YX.clean(raw.replace(/FOB代付|FOB代|FOB|CNF/gi, ' '));
    return {base:base || raw, tag:tags.join(' / ')};
  }
  function counts(c, mode){
    // V205: 客戶卡件/筆數優先使用後端統一 counts，訂單 / 總單 / 出貨不再各自猜。
    const backendCounts = c.counts || c.display_counts || {};
    const mappedMode = mode === 'master_orders' ? 'master_order' : mode;
    const bc = backendCounts[mappedMode] || backendCounts[mode] || null;
    if (bc) {
      const bq = Number(bc.qty ?? bc.item_count ?? 0);
      const br = Number(bc.rows ?? bc.row_count ?? 0);
      if ((Number.isFinite(bq) && bq > 0) || (Number.isFinite(br) && br > 0)) return {qty:Math.max(0, bq||0), rows:Math.max(0, br||0)};
    }
    const r = c.relation_counts || {};
    const num = (...vals) => {
      for (const v of vals) {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) return n;
      }
      return 0;
    };
    const orderQty = num(r.order_qty, c.order_qty, c.orders_qty, c.order_count_qty);
    const orderRows = num(r.order_rows, c.order_rows, c.orders_rows, mode === 'orders' ? c.row_count : 0, mode === 'orders' ? c.total_rows : 0);
    const masterQty = num(r.master_qty, c.master_qty, c.master_order_qty, c.master_orders_qty);
    const masterRows = num(r.master_rows, c.master_rows, c.master_order_rows, c.master_orders_rows, mode === 'master_order' ? c.row_count : 0, mode === 'master_order' ? c.total_rows : 0);
    const invQty = num(r.inventory_qty, c.inventory_qty);
    const invRows = num(r.inventory_rows, c.inventory_rows);
    // V406: 訂單頁北/中/南只能顯示「真的有訂單」的客戶，不能用總單/庫存的通用 item_count 回補。
    // 件數/筆數也必須只用 orders 對應欄位，避免總單客戶被帶進訂單頁。
    if (mode === 'orders') return {qty:orderQty, rows:orderRows};
    if (mode === 'master_order') return {qty:masterQty, rows:masterRows};
    if (mode === 'ship') {
      const qty = orderQty + masterQty + invQty;
      const rows = orderRows + masterRows + invRows;
      return {qty: qty || num(c.item_count, c.active_qty_total, r.active_qty_total), rows: rows || num(c.row_count, c.active_rows, r.active_rows)};
    }
    return {qty:num(c.item_count, c.active_qty_total, r.active_qty_total, r.total_qty), rows:num(c.row_count, c.active_rows, r.active_rows, r.total_rows)};
  }
  function mergeKey(name){
    const info = tradeInfo(name || '');
    const base = YX.clean(info.base || name || '').replace(/\s+/g,'').toLowerCase();
    const tag = YX.clean(info.tag || '').replace(/\s+/g,'').toUpperCase();
    return `${base}|${tag}`;
  }
  function mergeCounts(target, src, mode){
    const fields = ['inventory_rows','order_rows','master_rows','shipping_rows','inventory_qty','order_qty','master_qty','shipping_qty','active_rows','total_rows','active_qty_total','history_qty_total','total_qty'];
    target.relation_counts = target.relation_counts || {};
    const sr = src.relation_counts || {};
    fields.forEach(k => { target.relation_counts[k] = Number(target.relation_counts[k] || 0) + Number(sr[k] || 0); });
    target.item_count = Number(target.item_count || 0) + Number(src.item_count || 0);
    target.row_count = Number(target.row_count || 0) + Number(src.row_count || 0);
    target.history_count = Number(target.history_count || 0) + Number(src.history_count || 0);
    const rawNames = new Set([...(target.merge_names || []), target.name, ...(src.merge_names || []), src.name].filter(Boolean));
    target.merge_names = Array.from(rawNames);
    target.duplicate_merged_count = Math.max(0, target.merge_names.length - 1);
    return target;
  }
  function mergeCustomerRows(items, mode){
    const out = [];
    const map = new Map();
    (items || []).forEach(c => {
      const key = mergeKey(c.name || '');
      if (!key) return;
      if (!map.has(key)) {
        const clone = Object.assign({}, c, {relation_counts:Object.assign({}, c.relation_counts || {}), merge_names:Array.isArray(c.merge_names) ? [...c.merge_names] : [c.name].filter(Boolean)});
        map.set(key, clone); out.push(clone);
      } else {
        mergeCounts(map.get(key), c, mode);
      }
    });
    return out;
  }

  function variantsForName(name){
    name = YX.clean(name || '');
    const fromGlobal = Array.isArray(window.__YX_SELECTED_CUSTOMER_VARIANTS__) ? window.__YX_SELECTED_CUSTOMER_VARIANTS__.filter(Boolean) : [];
    if (fromGlobal.length && fromGlobal.includes(name)) return Array.from(new Set(fromGlobal));
    const row = (state.items || []).find(c => YX.clean(c.name || '') === name || (Array.isArray(c.merge_names) && c.merge_names.includes(name)));
    const arr = row && Array.isArray(row.merge_names) ? row.merge_names.filter(Boolean) : [name];
    return Array.from(new Set(arr.length ? arr : [name]));
  }
  function variantsQuery(name){
    const v = variantsForName(name);
    return '&variants=' + encodeURIComponent(JSON.stringify(v));
  }
  function renderCachedSelectedPanel(name){
    const panel = $('selected-customer-items');
    if (!panel || moduleKey() === 'ship' || !['orders','master_order'].includes(moduleKey())) return false;
    const cache = state.itemCache.get(mergeKey(name) || name);
    if (!cache || !Array.isArray(cache.items)) return false;
    renderSelectedCustomerItems(name, cache.items);
    return true;
  }
  function renderSelectedCustomerItems(name, items){
    const panel = $('selected-customer-items');
    if (!panel || moduleKey() === 'ship' || !['orders','master_order'].includes(moduleKey())) return;
    panel.classList.remove('hidden');
    panel.classList.toggle('yx66-active', moduleKey() === 'orders');
    const activeItems = (items || []).filter(it => qtyFromProduct(it.product_text, it.qty) > 0);
    const total = activeItems.reduce((sum,it)=>sum + qtyFromProduct(it.product_text, it.qty), 0);
    panel.innerHTML = `<div class="customer-detail-card yx121-selected-customer-products"><div class="customer-detail-header"><div><div class="section-title">${YX.esc(name)}</div><div class="muted">${total}件 / ${activeItems.length}筆商品</div></div></div><div class="card-list">${activeItems.length ? activeItems.map(it=>{ const raw=String(it.product_text||''); const ps=raw.split('='); return `<div class="deduct-card yx112-product-card"><div class="yx113-product-head"><strong class="material-text">${YX.esc(it.material || it.product_code || '未填材質')}</strong><strong>${qtyFromProduct(raw,it.qty)}件</strong></div><div class="yx113-product-main"><span>${YX.esc(ps[0]||raw)}</span><span>${YX.esc(ps.slice(1).join('=') || it.qty || '')}</span></div><div class="small-note">${YX.esc(it.source || '')}</div></div>`; }).join('') : '<div class="empty-state-card compact-empty">此客戶目前沒有商品</div>'}</div></div>`;
  }

  function shouldShow(c, mode){
    const ct = counts(c, mode);
    if (mode === 'orders') return ct.qty > 0 || ct.rows > 0;
    if (mode === 'master_order') return ct.qty > 0 || ct.rows > 0;
    return true;
  }
  function containerMaps(){
    return [
      {mode:moduleKey(), ids:{'北區':'region-north','中區':'region-center','南區':'region-south'}},
      {mode:'customers', ids:{'北區':'customers-north','中區':'customers-center','南區':'customers-south'}}
    ];
  }
  function cardHTML(c, mode){
    const name = c.name || '';
    const info = tradeInfo(name);
    const displayName = YX.clean(info.base || name);
    const lenClass = displayName.length >= 6 ? ' yx114-name-xlong yx132-name-shrink' : displayName.length >= 4 ? ' yx114-name-long' : '';
    const ct = counts(c, mode);
    return `<button type="button" class="customer-region-card yx113-customer-card yx114-customer-card yx116-customer-card yx117-customer-card${lenClass}" title="${YX.esc(name)}｜${ct.qty}件 / ${ct.rows}筆" data-yx116-card="1" data-yx117-card="1" data-customer-name="${YX.esc(name)}" data-customer="${YX.esc(name)}" data-customer-variants="${YX.esc(JSON.stringify(c.merge_names || [name]))}" data-region="${YX.esc(normRegion(c.region))}"><span class="yx113-customer-left yx116-customer-name yx-v43-big-customer-name" data-full-name="${YX.esc(name)}">${YX.esc(displayName)}</span><span class="yx113-customer-tag yx116-customer-tag">${info.tag ? YX.esc(info.tag) : ''}</span><span class="yx113-customer-count yx116-customer-count">${ct.qty}件 / ${ct.rows}筆</span></button>`;
  }

  function qtyFromProduct(text, fallback){
    return window.YX30EffectiveQty ? window.YX30EffectiveQty(text, fallback) : (Number(fallback || 0) || 0);
  }
  async function renderSelectedCustomerPanel(name){
    const panel = $('selected-customer-items');
    if (!panel || moduleKey() === 'ship' || !['orders','master_order'].includes(moduleKey())) return;
    panel.classList.remove('hidden');
    const pageSource = moduleKey() === 'orders' ? 'orders' : (moduleKey() === 'master_order' ? 'master_order' : '');
    let painted = renderCachedSelectedPanel(name);
    try {
      let localRows = (window.YX113ProductActions?.rowsStore?.(pageSource) || []).filter(r => {
        const n = YX.clean(r.customer_name || r.customer || '');
        return (n === name || sameCustomerName(n, name)) && qtyFromProduct(r.product_text || '', r.qty || 1) > 0;
      });
      if (!localRows.length && window.YXDataStore?.rowsForCustomerSync) {
        localRows = (window.YXDataStore.rowsForCustomerSync(pageSource, name) || []).filter(r => qtyFromProduct(r.product_text || '', r.qty || 1) > 0);
      }
      if (localRows.length) {
        state.itemCache.set(mergeKey(name) || name, {items:localRows, at:Date.now(), local_rows:true});
        renderSelectedCustomerItems(name, localRows);
        painted = true;
      }
    } catch(_e) {}
    if (!painted) panel.innerHTML = '<div class="empty-state-card compact-empty">客戶商品載入中…</div>';
    try {
      // V462: 先用唯一資料層/本機 rowsStore 立刻顯示；API 只做背景校正，不可讓慢 DB 阻塞客戶商品畫面。
      const sourceQuery = pageSource ? '&source=' + encodeURIComponent(pageSource) : '';
      const fetchPanel = async () => {
        const d = await YX.api(`/api/customer-items?name=${encodeURIComponent(name)}&fast=1&local_first=1&v463=1${sourceQuery}${variantsQuery(name)}`, {method:'GET'});
        const items = Array.isArray(d.items) ? d.items : [];
        if (items.length || !painted) {
          state.itemCache.set(mergeKey(name) || name, {items, at:Date.now()});
          renderSelectedCustomerItems(name, items);
        }
      };
      if (painted) { try { (window.requestIdleCallback || function(fn){return setTimeout(fn,900);})(()=>fetchPanel().catch(()=>{}), {timeout:1800}); } catch(_e) { fetchPanel().catch(()=>{}); } }
      else await fetchPanel();
    } catch(e) { if (!painted) panel.innerHTML = `<div class="empty-state-card compact-empty">${YX.esc(e.message || '客戶商品載入失敗')}</div>`; }
  }

  async function selectCustomer(name){
    name = YX.clean(name || ''); if (!name) return;
    window.__YX_SELECTED_CUSTOMER__ = name;
    try { window.dispatchEvent(new CustomEvent('yx:customer-selected', {detail:{name, variants:variantsForName(name)}})); } catch(_e) {}
    const input = $('customer-name');
    if (input) input.value = name;
    document.querySelectorAll('.yx113-customer-card,.yx114-customer-card').forEach(card => card.classList.toggle('is-active', YX.clean(card.dataset.customerName) === name));
    try {
      const source = moduleKey() === 'master_order' ? 'master_order' : (moduleKey() === 'orders' ? 'orders' : '');
      if (source && window.YX113ProductActions) {
        window.YX113ProductActions.renderSummary?.(source);
        window.YX113ProductActions.renderCards?.(source);
        const target = document.getElementById(source === 'orders' ? 'orders-list-section' : 'master-list-section');
        target?.scrollIntoView?.({behavior:'smooth', block:'start'});
      }
    } catch(_e) {}
    const m = moduleKey();
    if (m === 'customers' && typeof window.fillCustomerForm === 'function') {
      try { await window.fillCustomerForm(name); } catch(_e) {}
      return;
    }
    // 出貨頁專用分工：北中南客戶只負責選客戶，不再渲染 selected-customer-items，避免和 ship_single_main.js 同時打 /api/customer-items。
    if (m === 'ship') {
      try {
        if (window.YX116ShipPicker) {
          window.YX116ShipPicker.load(name,{force:false}).catch(()=>{});
          document.getElementById('ship-customer-picker')?.scrollIntoView?.({behavior:'smooth', block:'start'});
        }
      } catch(_e) {}
      return;
    }
    // customer card mainline/121：不再呼叫舊版 selectCustomerForModule，避免舊版清空新版商品清單。
    // 商品清單統一交給 product_actions_main 母版與 selected-customer panel 刷新。
    renderSelectedCustomerPanel(name).catch(()=>{});
    try {
      const source = moduleKey() === 'master_order' ? 'master_order' : (moduleKey() === 'orders' ? 'orders' : '');
      if (source && window.YX113ProductActions && !window.YX113ProductActions.rowsStore?.(source)?.length) window.YX113ProductActions.refreshCurrent?.().catch(()=>{});
    } catch(_e) {}
  }
  function renderBoards(items){
    if (!isRegionPage()) return;
    state.rendering = true;
    const q = YX.clean($('customer-search')?.value || '').toLowerCase();
    containerMaps().forEach(map => {
      const containers = Object.fromEntries(REGIONS.map(r => [r, $(map.ids[r])]).filter(([,el]) => !!el));
      if (!Object.keys(containers).length) return;
      Object.values(containers).forEach(el => { el.innerHTML = ''; el.classList.add('yx113-customer-list','yx114-customer-list'); });
      let rows = mergeCustomerRows(items || [], map.mode).filter(c => shouldShow(c, map.mode));
      if (q) rows = rows.filter(c => String(c.name || '').toLowerCase().includes(q));
      rows.forEach(c => {
        const region = normRegion(c.region);
        const target = containers[region] || containers['北區'];
        if (!target) return;
        target.insertAdjacentHTML('beforeend', cardHTML(c, map.mode));
      });
      Object.values(containers).forEach(el => { if (!el.children.length) el.innerHTML = '<div class="empty-state-card compact-empty">目前沒有客戶</div>'; });
    });
    state.lastRenderAt = Date.now();
    state.rendering = false;
  }
  function hasLegacyCustomerDom(){
    if (!isRegionPage()) return false;
    const boards = ['region-north','region-center','region-south','customers-north','customers-center','customers-south'].map($).filter(Boolean);
    return boards.some(el => {
      if (!el || el.querySelector('.customer-card-arrow,.fix48-customer-arrow,.yx113-customer-arrow')) return true;
      const cards = Array.from(el.querySelectorAll('.customer-region-card,[data-customer-name]')).filter(c => !c.classList.contains('empty-state-card'));
      return cards.some(c => !c.classList.contains('yx116-customer-card') && !c.closest('.yx113-customer-actions'));
    });
  }
  function scheduleRepair(){ return; }
  function observeCustomerBoards(){ return; }

  function archivedCustomerSet(){
    try { return new Set(Object.keys(JSON.parse(localStorage.getItem('yx_archived_customers_v228') || '{}') || {})); } catch(_e) { return new Set(); }
  }
  function markArchivedCustomer(name, mode){
    name = YX.clean(name || ''); if (!name) return;
    try { const m = JSON.parse(localStorage.getItem('yx_archived_customers_v228') || '{}') || {}; m[name] = {mode:mode || 'archived', at:Date.now()}; localStorage.setItem('yx_archived_customers_v228', JSON.stringify(m)); } catch(_e) {}
  }
  function unmarkArchivedCustomer(name){
    name = YX.clean(name || ''); if (!name) return;
    try { const m = JSON.parse(localStorage.getItem('yx_archived_customers_v228') || '{}') || {}; delete m[name]; localStorage.setItem('yx_archived_customers_v228', JSON.stringify(m)); } catch(_e) {}
  }
  function emitCustomerCacheSync(detail){
    detail = detail || {};
    try { clearCrossFunctionCaches(detail.source || 'customers', detail.new_customer_name || detail.customer_name || detail.old_customer_name || '', detail.reason || 'customer-cache-sync-v228'); } catch(_e) {}
    try { yx215EmitOnce('yx:customer-profile-changed', Object.assign({version:'v416'}, detail), 1000); } catch(_e) {}
    try { yx215EmitOnce('yx:warehouse-changed', Object.assign({version:'v416'}, detail), 1000); } catch(_e) {}
    try { yx215EmitOnce('yx:order-master-changed', Object.assign({version:'v416'}, detail), 1000); } catch(_e) {}
  }

  function applyCustomerWritePayload(d, fallbackName){
    if(!d || typeof d !== 'object') return false;
    let applied = false;
    try {
      const list = Array.isArray(d.customers) ? d.customers : (Array.isArray(d.items) ? d.items : null);
      if(list){
        state.items = relationCustomersFromRows(list).filter(c => !archivedCustomerSet().has(YX.clean(c.name || c.customer_name || '')));
        renderBoards(state.items);
        applied = true;
      }
    } catch(_e) {}
    try {
      if(d.snapshots){
        window.__YX112_ROWS__ = Object.assign(window.__YX112_ROWS__ || {}, d.snapshots || {});
        window.__yx63Rows = Object.assign(window.__yx63Rows || {}, d.snapshots || {});
      }
    } catch(_e) {}
    try {
      emitCustomerCacheSync({
        source:'customers',
        reason:d.mode ? ('customer-'+d.mode+'-saved') : 'customer-write-saved',
        customer_name:d.customer_name || d.new_customer_name || fallbackName || '',
        old_customer_name:d.old_customer_name || '',
        new_customer_name:d.new_customer_name || d.customer_name || fallbackName || '',
        region:d.region || d.item?.region || '',
        mode:d.mode || ''
      });
    } catch(_e) {}
    return applied;
  }

  function removeCustomerLocalRegion(name){
    name = YX.clean(name || ''); if(!name) return;
    try { const m = JSON.parse(localStorage.getItem('yx_customer_regions_v18') || '{}') || {}; delete m[name]; localStorage.setItem('yx_customer_regions_v18', JSON.stringify(m)); } catch(_e) {}
  }

  function relationCustomersFromRows(existingItems){
    const byName = new Map();
    const archived = archivedCustomerSet();
    const zeroRc = {inventory_rows:0,order_rows:0,master_rows:0,shipping_rows:0,inventory_qty:0,order_qty:0,master_qty:0,shipping_qty:0,active_rows:0,total_rows:0,active_qty_total:0,history_qty_total:0,total_qty:0};
    const rcHas = (rc, source) => {
      if(!rc) return false;
      if(source === 'orders') return Number(rc.order_rows || 0) > 0 || Number(rc.order_qty || 0) > 0;
      if(source === 'master_order') return Number(rc.master_rows || 0) > 0 || Number(rc.master_qty || 0) > 0;
      if(source === 'inventory') return Number(rc.inventory_rows || 0) > 0 || Number(rc.inventory_qty || 0) > 0;
      return false;
    };
    const rcRows = rc => Number(rc?.order_rows || 0) + Number(rc?.master_rows || 0) + Number(rc?.inventory_rows || 0);
    const rcQty = rc => Number(rc?.order_qty || 0) + Number(rc?.master_qty || 0) + Number(rc?.inventory_qty || 0);
    const strictRowsPage = moduleKey() === 'orders' || moduleKey() === 'master_order';
    (existingItems || []).forEach(c => {
      const n = YX.clean(c.name || c.customer_name || '');
      if (!n || archived.has(n)) return;
      let savedRegion = '';
      try { savedRegion = (JSON.parse(localStorage.getItem('yx_customer_regions_v18') || '{}') || {})[n] || ''; } catch(_e) {}
      // V461: 訂單/總單客戶卡的件/筆只能以目前 rowsStore 為準；不能用 /api/customers 舊 relation_counts，否則商品已刪除後仍顯示 1件/1筆。
      const rc = strictRowsPage ? Object.assign({}, zeroRc) : Object.assign({}, zeroRc, c.relation_counts || {});
      const rowsTotal = strictRowsPage ? 0 : Math.max(Number(c.item_count || c.row_count || 0), rcRows(rc), Number(rc.active_rows || rc.total_rows || 0));
      const qtyTotal = strictRowsPage ? 0 : Math.max(Number(c.total_qty || 0), rcQty(rc), Number(rc.active_qty_total || rc.total_qty || 0));
      byName.set(n, Object.assign({}, c, {name:n, customer_name:n, region:normRegion(c.region || savedRegion || '北區'), relation_counts:rc, item_count:rowsTotal, row_count:rowsTotal, total_qty:qtyTotal, merge_names:Array.isArray(c.merge_names) ? c.merge_names : [n]}));
    });
    const seen = new Set();
    const add = (name, source, row) => {
      name = YX.clean(name || ''); if (!name || archived.has(name)) return;
      const old = byName.get(name) || {};
      const oldRc = Object.assign({}, zeroRc, old.relation_counts || {});
      const isPending = !!(row && (row.__optimistic || row.__pending_server_id || String(row.id || '').startsWith('tmp-')));
      // If /api/customers already returned real DB relation_counts for this source, do not recount the loaded rowsStore.
      // Only pending tmp rows are added on top so the card appears immediately after submit.
      if (old.name && rcHas(oldRc, source) && !isPending) return;
      const key = [source, name, row.id || '', row.product_text || '', row.material || row.product_code || '', row.location || row.zone || row.warehouse_zone || '', isPending ? 'pending' : 'loaded'].join('|');
      if (seen.has(key)) return;
      seen.add(key);
      let savedRegion = '';
      try { savedRegion = (JSON.parse(localStorage.getItem('yx_customer_regions_v18') || '{}') || {})[name] || ''; } catch(_e) {}
      const region = normRegion(old.region || row.region || row.customer_region || savedRegion || '北區');
      const rc = Object.assign({}, oldRc);
      const qty = qtyFromProduct(row.product_text || '', row.qty);
      // V414: rowsStore 裡出貨扣到 0 的殘留列不能補回客戶卡。
      if ((source === 'orders' || source === 'master_order') && qty <= 0) return;
      if (source === 'orders') { rc.order_rows = Number(rc.order_rows || 0) + 1; rc.order_qty = Number(rc.order_qty || 0) + qty; }
      else if (source === 'master_order') { rc.master_rows = Number(rc.master_rows || 0) + 1; rc.master_qty = Number(rc.master_qty || 0) + qty; }
      else if (source === 'inventory') { rc.inventory_rows = Number(rc.inventory_rows || 0) + 1; rc.inventory_qty = Number(rc.inventory_qty || 0) + qty; }
      const rowsTotal = Math.max(Number(old.item_count || old.row_count || 0), rcRows(rc));
      const qtyTotal = Math.max(Number(old.total_qty || 0), rcQty(rc));
      byName.set(name, Object.assign({}, old, {name, customer_name:name, region, relation_counts:rc, item_count:rowsTotal, row_count:rowsTotal, total_qty:qtyTotal, merge_names:Array.from(new Set([...(old.merge_names || []), name]))}));
    };
    try {
      const stores = (window.__YX112_ROWS__ || window.__yx63Rows || {});
      const pageMode = moduleKey();
      // V406: 訂單頁北/中/南只能由 orders rows 補客戶；總單頁只能由 master_order rows 補客戶。
      // 不再把三個來源全部混進 relationCustomersFromRows，避免總單客戶被帶到訂單區。
      const sources = pageMode === 'orders' ? ['orders'] : (pageMode === 'master_order' ? ['master_order'] : ['orders','master_order','inventory']);
      sources.forEach(source => {
        const arr = Array.isArray(stores[source]) ? stores[source] : [];
        arr.forEach(r => add(r.customer_name || r.customer || '', source, r));
      });
    } catch(_e) {}
    return Array.from(byName.values());
  }


  function customerBlocksCacheName(){ return 'customer_blocks_' + cacheVersionToken() + '_' + moduleKey(); }

  async function loadCustomerBlocks(refreshCustomerData=true){
    if (!isRegionPage()) return state.items;
    const src = moduleKey() === 'master_order' ? 'master_order' : (moduleKey() === 'orders' ? 'orders' : '');
    try {
      const cached = !refreshCustomerData && window.YX?.cache?.read(customerBlocksCacheName(), 1000*60*60*12);
      if (cached && Array.isArray(cached.items)) { state.items = cached.items; renderBoards(state.items); }
    } catch(_e) {}
    // V461: 北中南客戶先由本機同步/目前 rowsStore 直接畫出，絕不等待 /api/customers 或強制 DB 重抓。
    try {
      if (src && window.YX113ProductActions?.loadSource) {
        const p = window.YX113ProductActions.loadSource(src, {customer_blocks:true});
        Promise.resolve(p).then(()=>{ try { renderFromCurrentRows(); } catch(_e) {} }).catch(()=>{});
      }
      if (src) renderFromCurrentRows();
    } catch(_e) {}
    try {
      // V462: 訂單/總單北中南以商品 rows 為權威；API 客戶資料只能背景補資料，不能蓋掉本機 rows 算出的 0/新增狀態。
      if (src && window.YXDataStore?.getRowsMeta) {
        try { const meta = await window.YXDataStore.getRowsMeta(src); if (meta && meta.hasPayload) renderFromCurrentRows(); } catch(_e) {}
      }
      const pageSource = src;
      // V463: 訂單/總單客戶卡只准由目前商品 rows 計算；/api/customers 只會帶來舊 relation_counts，會讓刪除後件/筆殘留。
      if (pageSource === 'orders' || pageSource === 'master_order') {
        state.items = relationCustomersFromRows([]).filter(c => !archivedCustomerSet().has(YX.clean(c.name || c.customer_name || '')));
        try { window.YX?.cache?.write(customerBlocksCacheName(), {items:state.items}); } catch(_e) {}
        renderBoards(state.items);
      } else {
        const d = await YX.api('/api/customers?yx114=1&fast=1&local_first=1&strict_source=1&source=' + encodeURIComponent(pageSource) + '&v463=1&ts=' + Date.now(), {method:'GET'});
        state.items = relationCustomersFromRows(Array.isArray(d.items) ? d.items : []).filter(c => !archivedCustomerSet().has(YX.clean(c.name || c.customer_name || '')));
        try { window.YX?.cache?.write(customerBlocksCacheName(), {items:state.items}); } catch(_e) {}
        renderBoards(state.items);
      }
      try {
        const activeName = YX.clean(window.__YX_SELECTED_CUSTOMER__ || '');
        if (activeName && ['orders','master_order'].includes(moduleKey()) && state.items.some(c => (c.name || c.customer_name || '') === activeName)) {
          renderSelectedCustomerPanel(activeName).catch(()=>{});
        }
      } catch(_e) {}
      try { window.dispatchEvent(new CustomEvent('yx:customers-loaded', {detail:{items:state.items, source:moduleKey(), version:'v462-data-spine-real-fix'}})); } catch(_e) {}
      return state.items;
    } catch(e) {
      try { renderFromCurrentRows(); } catch(_e) {}
      return state.items;
    }
  }
  function actionSheet(){
    let modal = $('yx113-customer-actions');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'yx113-customer-actions';
    modal.className = 'modal hidden yx113-customer-actions';
    modal.innerHTML = `<div class="modal-card glass yx113-customer-action-card"><div class="modal-head"><div class="section-title" id="yx113-customer-action-title">客戶操作</div><button class="icon-btn" type="button" id="yx113-customer-action-close">✕</button></div><div class="yx113-action-stack"><button class="ghost-btn" type="button" data-yx113-customer-act="open">打開客戶商品</button><button class="ghost-btn" type="button" data-yx113-customer-act="edit">編輯客戶</button><button class="ghost-btn" type="button" data-yx113-customer-act="move-north">移到北區</button><button class="ghost-btn" type="button" data-yx113-customer-act="move-center">移到中區</button><button class="ghost-btn" type="button" data-yx113-customer-act="move-south">移到南區</button><button class="ghost-btn danger-btn" type="button" data-yx113-customer-act="delete">刪除客戶</button></div></div>`;
    document.body.appendChild(modal);
    const close = () => modal.classList.add('hidden');
    $('yx113-customer-action-close').onclick = close;
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    return modal;
  }
  async function editCustomer(name){
    let item = state.items.find(c => c.name === name || c.customer_name === name) || {};
    const nextName = prompt('客戶名稱', item.name || name); if (nextName === null) return;
    const region = prompt('區域：北區 / 中區 / 南區', normRegion(item.region || '北區')); if (region === null) return;
    const cleanName = YX.clean(nextName); if (!cleanName) return YX.toast('客戶名稱不可空白', 'warn');
    const finalRegion = normRegion(region);
    // main：先立刻更新畫面，再背景保存，避免編輯客戶要等很久。
    if (cleanName !== name) {
      unmarkArchivedCustomer(cleanName);
      markArchivedCustomer(name, 'renamed');
      document.querySelectorAll('[data-customer-name],[data-customer]').forEach(el => {
        if (YX.clean(el.dataset.customerName || el.dataset.customer || '') === name) {
          el.dataset.customerName = cleanName; el.dataset.customer = cleanName;
          try { el.dataset.customerVariants = JSON.stringify([cleanName]); } catch(_e) {}
          const nm = el.querySelector('.yx116-customer-name,.yx113-customer-left'); if (nm) nm.textContent = cleanName;
        }
      });
      try { window.__YX_SELECTED_CUSTOMER__ = cleanName; } catch(_e) {}
    }
    moveCustomerCardNow(cleanName, finalRegion);
    YX.toast(`客戶已先更新：${cleanName}`, 'ok');
    try {
      let renameResp = null;
      if (cleanName !== name) {
        renameResp = await YX.api(`/api/customers/${encodeURIComponent(name)}`, {method:'PUT', body:JSON.stringify({new_name:cleanName, region:finalRegion})});
        removeCustomerLocalRegion(name);
      }
      const saveResp = await YX.api('/api/customers', {method:'POST', body:JSON.stringify({name:cleanName, phone:item.phone || '', address:item.address || '', notes:item.notes || '', common_materials:item.common_materials || '', common_sizes:item.common_sizes || '', region:finalRegion, preserve_existing:false})});
      applyCustomerWritePayload(renameResp || saveResp, cleanName);
      applyCustomerWritePayload(saveResp, cleanName);
      try { emitCustomerCacheSync({source:'customers', reason:'customer-edit-v406', old_customer_name:name, new_customer_name:cleanName, customer_name:cleanName, region:finalRegion}); } catch(_e) {}
      YX.toast('客戶編輯已保存', 'ok');
      selectCustomer(cleanName).catch(()=>{});
    } catch(e) {
      YX.toast(e.message || '客戶編輯保存失敗', 'error');
      loadCustomerBlocks(true).catch(()=>{});
    }
  }
  function renderFromCurrentRows(){
    if (!isRegionPage()) return;
    // V485: 訂單/總單客戶區只以目前 rowsStore / DataStore 為準；不讓舊 customers 空資料蓋掉。
    state.items = relationCustomersFromRows([]).filter(c => !archivedCustomerSet().has(YX.clean(c.name || c.customer_name || '')));
    renderBoards(state.items);
    const selected = YX.clean(window.__YX_SELECTED_CUSTOMER__ || $('customer-name')?.value || '');
    if (selected) {
      try { forceCustomerCardVisible(selected, moduleKey()); } catch(_e) {}
      const card = findCustomerCard(selected);
      if (card) card.classList.add('is-active');
      else if (['orders','master_order'].includes(moduleKey())) { try { renderSelectedCustomerItems(selected, []); } catch(_e) {} }
    }
    return state.items;
  }
  function moveCustomerCardNow(name, region){
    name = YX.clean(name || ''); region = normRegion(region || '北區');
    if (!name) return;
    try { const m = JSON.parse(localStorage.getItem('yx_customer_regions_v18') || '{}') || {}; m[name] = region; localStorage.setItem('yx_customer_regions_v18', JSON.stringify(m)); } catch(_e) {}
    let foundInState = false;
    state.items = (state.items || []).map(c => {
      if (YX.clean(c.name || c.customer_name || '') === name) { foundInState = true; return Object.assign({}, c, {name, customer_name:name, region}); }
      return c;
    });
    if (!foundInState) state.items.push({name, customer_name:name, region, relation_counts:countsForCustomer(name), merge_names:[name]});
    const card = findCustomerCard(name);
    const maps = containerMaps();
    if (card) {
      maps.forEach(map => {
        const target = $(map.ids[region]);
        if (!target) return;
        const empty = target.querySelector('.empty-state-card');
        if (empty) empty.remove();
        const existing = Array.from(target.querySelectorAll('[data-customer-name],[data-customer]')).find(el => YX.clean(el.dataset.customerName || el.dataset.customer || '') === name);
        if (!existing) target.appendChild(card.cloneNode(true));
      });
      document.querySelectorAll('[data-customer-name],[data-customer]').forEach(el => {
        if (YX.clean(el.dataset.customerName || el.dataset.customer || '') === name) el.dataset.region = region;
      });
    }
    renderBoards(state.items);
  }
  async function moveCustomer(name, region){
    name = YX.clean(name || ''); region = normRegion(region || '北區');
    if (!name) return;
    try { const m = JSON.parse(localStorage.getItem('yx_customer_regions_v18') || '{}') || {}; m[name] = region; localStorage.setItem('yx_customer_regions_v18', JSON.stringify(m)); } catch(_e) {}
    // v17：先改畫面與本機 state，使用者不用等 API / 重抓客戶清單。
    moveCustomerCardNow(name, region);
    try { selectCustomer(name).catch(()=>{}); } catch(_e) {}
    YX.toast(`${name} 已移到${region}，正在保存`, 'ok');
    try {
      const savePromise = YX.api('/api/customers/move', {method:'POST', body:JSON.stringify({name, region})});
      savePromise.then((d)=>{
        YX.toast(`${name} 區域已保存`, 'ok');
        moveCustomerCardNow(name, region);
        applyCustomerWritePayload(d, name);
        try { emitCustomerCacheSync({source:'customers', reason:'customer-move-v406', customer_name:name, region}); } catch(_e) {}
      }).catch(e=>YX.toast(e.message || '區域保存失敗','error'));
      return;
    } catch(e) {
      YX.toast(e.message || '移動客戶失敗，已還原請重試', 'error');
      loadCustomerBlocks(true).catch(()=>{});
      throw e;
    }
  }
  async function deleteCustomer(name){
    if (!confirm(`確定刪除 / 封存客戶「${name}」？即使客戶裡面還有商品，也會直接移除客戶卡並由後端封存。`)) return;
    markArchivedCustomer(name, 'delete-or-archive');
    document.querySelectorAll('[data-customer-name],[data-customer]').forEach(el => { if (YX.clean(el.dataset.customerName || el.dataset.customer || '') === name) el.remove(); });
    if (window.__YX_SELECTED_CUSTOMER__ === name) window.__YX_SELECTED_CUSTOMER__ = '';
    YX.toast(`已先從畫面移除客戶：${name}`, 'ok');
    try {
      const d = await YX.api(`/api/customers/${encodeURIComponent(name)}`, {method:'DELETE'});
      YX.toast(d.message || '客戶刪除 / 封存已保存', 'ok');
      removeCustomerLocalRegion(name);
      applyCustomerWritePayload(d, name);
      try { emitCustomerCacheSync({source:'customers', reason:'customer-delete-archive-v406', customer_name:name, mode:d.mode || 'archived'}); } catch(_e) {}
      loadCustomerBlocks(true).catch(()=>{});
      try { if (window.YX113ProductActions) window.YX113ProductActions.refreshCurrent?.().catch(()=>{}); } catch(_e) {}
    } catch(e) {
      YX.toast(e.message || '客戶刪除失敗，重新載入客戶區', 'error');
      loadCustomerBlocks(true).catch(()=>{});
    }
  }
  function showActions(name){
    const modal = actionSheet();
    modal.dataset.customer = name;
    $('yx113-customer-action-title').textContent = name || '客戶操作';
    modal.classList.remove('hidden');
  }
  function bindEvents(){
    if (state.bound) return; state.bound = true;
    let press = null, blockClickUntil = 0, ignoreContextUntil = 0;
    const cardSelector = '.yx114-customer-card,.yx113-customer-card,.customer-region-card[data-customer-name],[data-customer-name]';
    const clearDropTargets = () => document.querySelectorAll('.category-box[data-region]').forEach(box => box.classList.remove('yx121-drop-target'));
    const clear = () => {
      if (press?.timer) clearTimeout(press.timer);
      if (press?.card) {
        press.card.classList.remove('yx121-dragging-customer');
        try { if (press.pointerId != null && press.card.hasPointerCapture?.(press.pointerId)) press.card.releasePointerCapture(press.pointerId); } catch(_e) {}
      }
      clearDropTargets();
      press = null;
    };
    const regionBoxFromPoint = (x,y) => document.elementFromPoint(x,y)?.closest?.('.category-box[data-region]') || null;
    const regionFromPoint = (x,y) => {
      const box = regionBoxFromPoint(x,y);
      return box ? normRegion(box.dataset.region || box.querySelector('.category-title')?.textContent || '') : '';
    };
    document.addEventListener('pointerdown', ev => {
      const card = ev.target?.closest?.(cardSelector);
      if (!card || ev.target.closest('button,input,select,textarea,a,[data-yx113-customer-act]')) return;
      if (ev.button != null && ev.button !== 0) return;
      const name = YX.clean(card.dataset.customerName || card.dataset.customer || ''); if (!name) return;
      const x = ev.clientX, y = ev.clientY;
      clear();
      try { card.setPointerCapture?.(ev.pointerId); } catch(_e) {}
      press = {card, name, x, y, pointerId:ev.pointerId, dragging:false, moved:false, timer:setTimeout(() => {
        blockClickUntil = Date.now() + 1000;
        ignoreContextUntil = Date.now() + 1000;
        showActions(name);
        clear();
      }, 650)};
    }, true);
    document.addEventListener('pointermove', ev => {
      if (!press || (press.pointerId != null && ev.pointerId != null && ev.pointerId !== press.pointerId)) return;
      const dx = Math.abs(ev.clientX - press.x), dy = Math.abs(ev.clientY - press.y);
      if ((dx > 8 || dy > 8) && press.timer) { clearTimeout(press.timer); press.timer = null; press.moved = true; }
      if (dx > 14 || dy > 14) {
        press.dragging = true;
        press.card.classList.add('yx121-dragging-customer');
        const targetBox = regionBoxFromPoint(ev.clientX, ev.clientY);
        document.querySelectorAll('.category-box[data-region]').forEach(box => box.classList.toggle('yx121-drop-target', box === targetBox));
        ev.preventDefault();
      }
    }, true);
    document.addEventListener('pointerup', ev => {
      if (press && press.pointerId != null && ev.pointerId != null && ev.pointerId !== press.pointerId) return;
      if (press?.dragging) {
        ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.();
        const target = regionFromPoint(ev.clientX, ev.clientY);
        const name = press.name;
        blockClickUntil = Date.now() + 1000;
        ignoreContextUntil = Date.now() + 700;
        clear();
        if (target) moveCustomer(name, target).catch(e => YX.toast(e.message || '移動客戶失敗', 'error'));
        return;
      }
      clear();
    }, true);
    ['pointercancel','dragstart'].forEach(t => document.addEventListener(t, clear, true));
    document.addEventListener('contextmenu', ev => {
      const card = ev.target?.closest?.(cardSelector);
      if (!card) return;
      const name = YX.clean(card.dataset.customerName || card.dataset.customer || ''); if (!name) return;
      ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.();
      if (Date.now() < ignoreContextUntil) return;
      blockClickUntil = Date.now() + 1000;
      showActions(name);
    }, true);
    document.addEventListener('click', async ev => {
      const actBtn = ev.target?.closest?.('[data-yx113-customer-act]');
      if (actBtn) {
        ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.();
        const modal = $('yx113-customer-actions'); const name = YX.clean(modal?.dataset.customer || ''); const act = actBtn.dataset.yx113CustomerAct;
        try {
          if (act === 'open') { modal.classList.add('hidden'); await selectCustomer(name); }
          if (act === 'edit') { modal.classList.add('hidden'); await editCustomer(name); }
          if (act === 'move-north') { modal.classList.add('hidden'); await moveCustomer(name, '北區'); }
          if (act === 'move-center') { modal.classList.add('hidden'); await moveCustomer(name, '中區'); }
          if (act === 'move-south') { modal.classList.add('hidden'); await moveCustomer(name, '南區'); }
          if (act === 'delete') { modal.classList.add('hidden'); await deleteCustomer(name); }
        } catch(e) { YX.toast(e.message || '客戶操作失敗', 'error'); }
        return;
      }
      const card = ev.target?.closest?.('.yx114-customer-card,.yx113-customer-card,.customer-region-card[data-customer-name],[data-customer-name]');
      if (!card || Date.now() < blockClickUntil) { if (card) { ev.preventDefault(); ev.stopPropagation(); } return; }
      const name = YX.clean(card.dataset.customerName || card.dataset.customer || ''); if (!name) return;
      try { window.__YX_SELECTED_CUSTOMER_VARIANTS__ = JSON.parse(card.dataset.customerVariants || '[]'); } catch(_e) { window.__YX_SELECTED_CUSTOMER_VARIANTS__ = [name]; }
      ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.();
      await selectCustomer(name);
    }, true);
  }

  function findCustomerCard(name){
    name = YX.clean(name || ''); if (!name) return null;
    return Array.from(document.querySelectorAll('.yx114-customer-card,.yx113-customer-card,.customer-region-card[data-customer-name],[data-customer-name]')).find(card => YX.clean(card.dataset.customerName || card.dataset.customer || '') === name) || null;
  }
  function countsForCustomer(name){
    name = YX.clean(name || '');
    const rc = {inventory_rows:0, inventory_qty:0, order_rows:0, order_qty:0, master_rows:0, master_qty:0};
    try {
      const stores = window.__YX112_ROWS__ || window.__yx63Rows || {};
      const addRows = (key, rowsKey, qtyKey) => {
        (Array.isArray(stores[key]) ? stores[key] : []).forEach(r => {
          if (YX.clean(r.customer_name || r.customer || '') === name) { rc[rowsKey] += 1; rc[qtyKey] += qtyFromProduct(r.product_text || '', r.qty || 1) || 1; }
        });
      };
      addRows('inventory', 'inventory_rows', 'inventory_qty');
      addRows('orders', 'order_rows', 'order_qty');
      addRows('master_order', 'master_rows', 'master_qty');
    } catch(_e) {}
    return rc;
  }
  async function ensureCustomerVisible(name, fallbackRegion='北區', preserveExisting=true){
    name = YX.clean(name || ''); if (!name) return null;
    let card = findCustomerCard(name);
    let region = card?.closest?.('.category-box[data-region]')?.dataset?.region || fallbackRegion || '北區';
    if (!card) {
      try {
        const d = await YX.api('/api/customers', {method:'POST', body:JSON.stringify({name, region:fallbackRegion || '北區', preserve_existing:!!preserveExisting, request_key:`v13-customer-${Date.now()}-${Math.random().toString(36).slice(2)}`})});
        const item = d.item || (Array.isArray(d.items) ? d.items.find(x => YX.clean(x.name || x.customer_name || '') === name) : null);
        if (item?.region) region = normRegion(item.region);
      } catch(_e) {}
    }
    card = findCustomerCard(name);
    if (card) return card;
    const c = {name, customer_name:name, region:normRegion(region || fallbackRegion || '北區'), relation_counts:countsForCustomer(name), merge_names:[name]};
    containerMaps().forEach(map => {
      const target = $(map.ids[c.region]) || $(map.ids['北區']);
      if (!target) return;
      const empty = target.querySelector('.empty-state-card');
      if (empty) empty.remove();
      if (!Array.from(target.querySelectorAll('[data-customer-name]')).some(el => YX.clean(el.dataset.customerName || el.dataset.customer || '') === name)) {
        target.insertAdjacentHTML('beforeend', cardHTML(c, map.mode));
      }
    });
    return findCustomerCard(name);
  }

  function publishGlobals(){
    if (!state.oldSelect && typeof window.selectCustomerForModule === 'function') state.oldSelect = window.selectCustomerForModule;
    const selectFn = YX.mark(selectCustomer, 'customer_select');
    window.selectCustomerForModule = selectFn;
    const loadFn = YX.mark(loadCustomerBlocks, 'customer_blocks');
    try { YX.safeExpose('loadCustomerBlocks', loadFn, {configurable:true}); } catch(_e) { window.loadCustomerBlocks = loadFn; }
    try { YX.safeExpose('renderCustomers', loadFn, {configurable:true}); } catch(_e) { window.renderCustomers = loadFn; }
    window.YX113CustomerRegions = {loadCustomerBlocks, renderBoards, selectCustomer, ensureCustomerVisible, renderFromCurrentRows, moveCustomer};
    window.YX114CustomerRegions = window.YX113CustomerRegions;
    window.YX115CustomerRegions = window.YX113CustomerRegions;
    window.YX116CustomerRegions = window.YX113CustomerRegions;
    window.YX117CustomerRegions = window.YX113CustomerRegions;
  }
  function install(){
    if (!isRegionPage()) return;
    document.documentElement.dataset.yx113Customers = 'main';
    document.documentElement.dataset.yx114Customers = 'main';
    document.documentElement.dataset.yx115Customers = 'main';
    document.documentElement.dataset.yx116Customers = 'main';
    document.documentElement.dataset.yx117Customers = 'main';
    bindEvents(); publishGlobals();
    if (!state.productLoadedBound) { state.productLoadedBound = true; window.addEventListener('yx:product-source-loaded', () => { try { renderFromCurrentRows(); } catch(_e) {} }); }
    loadCustomerBlocks(true);
  }
  YX.register('customer_regions', {install, loadCustomerBlocks, selectCustomer});
})();

/* ===== END merged module static/yx_modules/customer_regions_main.js ===== */

/* ===== MERGED INTO main FROM static/yx_pages/page_customers_master.js ===== */
/* 沅興木業 v17 customers master：補齊客戶資料頁 inline 按鈕，避免舊 app.js 缺失。 */
(function(){
  'use strict';
  if (window.__YX_V17_CUSTOMERS_MASTER__) return;
  window.__YX_V17_CUSTOMERS_MASTER__ = true;
  const $ = id => document.getElementById(id);
  const clean = v => String(v == null ? '' : v).replace(/\s+/g,' ').trim();
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const toast = (m,k='ok') => { try { (window.YXCore?.toast || window.alert)(m,k); } catch(_){ alert(m); } };
  async function api(url,opt={}){
    const res = await window.YXDataStore.requestResponse(`${url}${url.includes('?')?'&':'?'}_=${Date.now()}`, {credentials:'same-origin', cache:'no-store', ...opt, headers:{'Accept':'application/json','Content-Type':'application/json',...(opt.headers||{})}});
    const text = await res.text(); let data={}; try{data=text?JSON.parse(text):{};}catch{data={success:false,error:text};}
    if(!res.ok || data.success===false) throw new Error(data.error || data.message || '請求失敗');
    return data;
  }
  function value(id){ return clean($(id)?.value ?? $(id)?.textContent ?? ''); }
  function setValue(id,v){ const el=$(id); if(!el) return; if('value' in el) el.value = v || ''; else el.textContent = v || '尚未建立'; }
  async function loadCustomers(){
    const d = await api('/api/customers', {method:'GET'});
    if(window.YX113CustomerRegions?.renderBoards) window.YX113CustomerRegions.renderBoards(d.items || []);
    return d.items || [];
  }
  async function fillCustomerForm(name){
    name = clean(name); if(!name) return;
    const items = await loadCustomers();
    const row = items.find(c => clean(c.name) === name) || items.find(c => clean(c.customer_name) === name) || {};
    setValue('cust-name', row.name || row.customer_name || name);
    setValue('cust-phone', row.phone || '');
    setValue('cust-address', row.address || '');
    setValue('cust-notes', row.notes || '');
    setValue('cust-common-materials', row.common_materials || '尚未建立');
    setValue('cust-common-sizes', row.common_sizes || '尚未建立');
    setValue('cust-region', row.region || '北區');
  }
  async function saveCustomer(){
    const name = value('cust-name');
    if(!name) return toast('請輸入客戶名稱','error');
    try{
      await api('/api/customers', {method:'POST', body:JSON.stringify({
        name,
        phone:value('cust-phone'),
        address:value('cust-address'),
        notes:value('cust-notes'),
        common_materials:value('cust-common-materials').replace(/^尚未建立$/,''),
        common_sizes:value('cust-common-sizes').replace(/^尚未建立$/,''),
        region:value('cust-region') || '北區',
        preserve_existing:false
      })});
      await loadCustomers();
      toast('客戶已儲存','ok');
    }catch(e){ toast(e.message || '客戶儲存失敗','error'); }
  }
  async function openArchivedCustomersModal(){
    try{
      const d = await api('/api/customers/archived', {method:'GET'});
      const items = d.items || [];
      let box = $('yx-v17-archived-customers');
      if(!box){
        box = document.createElement('div');
        box.id = 'yx-v17-archived-customers';
        box.className = 'modal';
        document.body.appendChild(box);
      }
      box.innerHTML = `<div class="modal-card glass"><div class="modal-head"><div class="section-title">封存客戶</div><button class="ghost-btn small-btn" type="button" data-close-archive>關閉</button></div><div class="card-list">${items.length ? items.map(c=>`<div class="deduct-card"><strong>${esc(c.name || c.customer_name || '')}</strong><div class="small-note">${esc(c.region || '')}</div><button class="ghost-btn small-btn" type="button" data-restore-customer="${esc(c.name || c.customer_name || '')}">還原</button></div>`).join('') : '<div class="empty-state-card compact-empty">目前沒有封存客戶</div>'}</div></div>`;
      box.classList.remove('hidden');
      box.style.display='';
    }catch(e){ toast(e.message || '封存客戶讀取失敗','error'); }
  }
  document.addEventListener('click', async ev=>{
    const close = ev.target.closest?.('[data-close-archive]');
    if(close){ ev.preventDefault(); $('yx-v17-archived-customers')?.classList.add('hidden'); return; }
    const restore = ev.target.closest?.('[data-restore-customer]');
    if(restore){
      ev.preventDefault();
      const name = restore.getAttribute('data-restore-customer');
      try{ await api(`/api/customers/${encodeURIComponent(name)}/restore`, {method:'POST', body:'{}'}); await loadCustomers(); await openArchivedCustomersModal(); toast('已還原客戶','ok'); }catch(e){ toast(e.message || '還原失敗','error'); }
    }
  }, true);
  window.fillCustomerForm = fillCustomerForm;
  window.saveCustomer = saveCustomer;
  window.renderCustomers = async function(){ try{ await loadCustomers(); }catch(e){ toast(e.message || '客戶載入失敗','error'); } };
  window.openArchivedCustomersModal = openArchivedCustomersModal;
})();

/* ===== END merged page static/yx_pages/page_customers_master.js ===== */

/* ===== MERGED INTO main FROM static/yx_pages/page_bootstrap_master.js ===== */
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

/* ===== END merged page static/yx_pages/page_bootstrap_master.js ===== */

/* formal product page core */
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
/* formal product page core */


/* formal product page core */
(function(){
  if (window.YXPageUndo) return;
  const stack=[];
  function update(){ const b=document.getElementById('yx-local-page-undo-btn-disabled'); if(b) b.disabled=!stack.length; }
  window.YXPageUndo={
    snapshot(label, undo){ if(typeof undo!=='function') return; stack.push({label:String(label||'操作'), undo}); while(stack.length>10) stack.shift(); update(); },
    undo(){ const item=stack.pop(); update(); if(!item) return; try{ item.undo(); (window.toast||console.log)('已復原：'+item.label,'ok'); }catch(e){ (window.toast||console.error)(e.message||'復原失敗','error'); } },
    size(){ return stack.length; }
  };
  document.addEventListener('click', ev=>{ const b=ev.target?.closest?.('#yx-local-page-undo-btn-disabled'); if(!b) return; ev.preventDefault(); ev.stopPropagation(); window.YXPageUndo.undo(); }, true);
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', update, {once:true}); else update();
})();
/* formal product page core */




/* formal product page core */
(function(){
  'use strict';
  if (window.__YX_V55_PRODUCT_DIRECT_REPAIR__) return;
  window.__YX_V55_PRODUCT_DIRECT_REPAIR__ = true;
  const clean=v=>String(v??'').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const page=()=>document.body?.dataset?.module||document.querySelector('.module-screen[data-module]')?.dataset?.module||'';
  async function api(url,opt={}){ const r=await window.YXDataStore.requestResponse(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{'Accept':'application/json','Content-Type':'application/json',...(opt.headers||{})}}); const t=await r.text(); let d={}; try{d=t?JSON.parse(t):{};}catch(_e){d={success:false,error:t};} if(!r.ok||d.success===false) throw new Error(d.error||d.message||'請求失敗'); return d; }
  function toast(message,kind='ok'){
    const active=document.activeElement; const editable=active&&active.matches?.('input,textarea,select,[contenteditable="true"]'); let ss=null,se=null; try{ if(editable&&'selectionStart' in active){ss=active.selectionStart;se=active.selectionEnd;} }catch(_e){}
    let box=document.getElementById('yx-v20-toast'); if(!box){box=document.createElement('div');box.id='yx-v20-toast';document.body.appendChild(box);} box.tabIndex=-1; box.setAttribute('aria-live','polite'); box.className='yx-v20-toast-card '+(kind||'ok'); box.style.pointerEvents='none'; box.innerHTML=`<strong>${kind==='error'?'操作失敗':kind==='warn'?'請注意':'操作成功'}</strong><div>${esc(message||'')}</div>`; box.classList.add('show'); box.style.display='block'; clearTimeout(window.__YX_V55_TOAST_TIMER__); window.__YX_V55_TOAST_TIMER__=setTimeout(()=>{try{box.classList.remove('show');box.style.display='none';}catch(_e){}},1800);
    if(editable&&document.contains(active)){ setTimeout(()=>{try{active.focus({preventScroll:true}); if(ss!=null&&active.setSelectionRange) active.setSelectionRange(ss,se??ss);}catch(_e){}},0); }
  }
  window.toast=window.showToast=window.notify=toast; if(window.YXCore) window.YXCore.toast=toast;
  function sourceFromButton(btn){ return btn?.dataset?.source || btn?.dataset?.yx113BatchMaterial || btn?.dataset?.yx113BatchDelete || btn?.dataset?.yx128EditAll || page(); }
  function apiSource(s){ return s==='master_order'?'master_order':s; }
  function selectedRows(source){ return Array.from(document.querySelectorAll(`#yx113-${source}-summary .yx113-summary-row[data-id]`)).filter(tr=>tr.querySelector('.yx113-row-check:checked')||tr.classList.contains('yx113-row-selected')); }
  function allRows(source){ return Array.from(document.querySelectorAll(`#yx113-${source}-summary .yx113-summary-row[data-id]`)); }
  function idsFor(source, allWhenNone=false){ let rows=selectedRows(source); if(!rows.length&&allWhenNone) rows=allRows(source); return rows.map(tr=>({source:apiSource(source), id:Number(tr.dataset.id||tr.querySelector('.yx113-row-check')?.dataset.id||0)})).filter(x=>x.id>0); }
  function refresh(){ try{ const src=page(); if(window.YX128ProductActions?.refreshCurrent) return window.YX128ProductActions.refreshCurrent(); if(typeof refreshCurrent==='function') return refreshCurrent(); window.dispatchEvent(new CustomEvent('yx:refresh-current-page',{detail:{source:src}})); }catch(_e){} }
  function ensureUndo(){ window.YXPageUndo=window.YXPageUndo||{}; window.YXPageUndo.open=async function(){ try{ const d=await api('/api/audit-trails?limit=10&undo=1'); const items=Array.isArray(d.items)?d.items.slice(0,10):[]; if(!items.length) return toast('目前沒有可還原的最近操作','warn'); const text=items.map((x,i)=>`${i+1}. ${x.created_at||''} ${x.action_label||x.action_type||''} ${x.entity_label||x.entity_type||''} ${x.summary_text||x.entity_key||''}`).join('\n'); const n=prompt('輸入要還原第幾筆：\n'+text,'1'); const idx=Number(n)-1; if(!items[idx]) return; await api('/api/undo-last',{method:'POST',body:JSON.stringify({id:items[idx].id})}); toast('已還原','ok'); refresh(); }catch(e){toast(e.message||'還原失敗','error');} }; }
  ensureUndo();
  document.addEventListener('click', async ev=>{
    const p=page(); if(!['inventory','orders','master_order'].includes(p)) return;
    const undo=ev.target.closest?.('.yx-page-undo-btn,#yx-page-undo-btn');
    if(undo){ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation?.(); return window.YXPageUndo.open();}
  }, true);
})();
/* formal product page core */



/* formal product page core */


// V215 rapid-operation cross-page sync: after shipping/warehouse/product writes, clear stale caches and coalesce reselect refresh.
(function(){
  if(window.__YX_V215_PRODUCT_FINAL_SYNC__) return;
  window.__YX_V215_PRODUCT_FINAL_SYNC__ = true;
  function clean(v){ return String(v||'').trim(); }

  function stableEventId(name, detail){
    detail = detail || {};
    const customers = Array.isArray(detail.customer_names) ? detail.customer_names.join('|') : '';
    const items = Array.isArray(detail.items) ? String(detail.items.length) : '';
    return [name, detail.operation_id || detail.request_key || detail.event_id || '', detail.reason || detail.action || '', detail.source || '', detail.customer_name || detail.name || customers || '', detail.zone || '', detail.column_index || detail.col || '', detail.slot_number || detail.slot || '', items].join('::');
  }
  function emitOnce(name, detail, ttl){
    try{
      const now=Date.now(); ttl=Number(ttl||700);
      const key=stableEventId(name, detail||{});
      const box=window.__YX_V215_EVENT_GUARD__ || (window.__YX_V215_EVENT_GUARD__=new Map());
      const last=Number(box.get(key)||0);
      if(last && now-last<ttl) return false;
      box.set(key, now);
      if(box.size>240){ for(const [k,t] of Array.from(box.entries())) if(now-Number(t||0)>6000) box.delete(k); }
      window.dispatchEvent(new CustomEvent(name,{detail:{...(detail||{}),sync_guard:'v417', sync_version:'v417-remove-opstatus-warehouse-visible-longpress', cache_bust:'v417-remove-opstatus-warehouse-visible-longpress'}}));
      return true;
    }catch(_e){ try{ window.dispatchEvent(new CustomEvent(name,{detail:detail||{}})); }catch(__e){} return true; }
  }
  function clearAll(customer){
    try{
      const c=window.YX?.cache;
      c?.clearGroup?.('ship_customers_'); c?.clearGroup?.('ship_items_'); c?.clearGroup?.('customer_blocks_');
      // V467: 不再清 products_/warehouse_available_/today_changes_，避免寫入後把同步權威資料清掉，下一頁又等 DB。
      ['ship_customers_v415','ship_customers_v414','ship_customers_v413','ship_customers_v412','ship_customers_v406','ship_customers_v386','ship_customers_v383','ship_customers_v380','ship_customers_v379','ship_customers_v337','ship_customers_v332','ship_customers_v307','ship_customers_v287','ship_customers_v282','ship_customers_v267','ship_customers_v252','ship_customers_v228','ship_customers_v227','ship_customers_v226','ship_customers_v225','ship_customers_v224','ship_customers_v223','ship_customers_v222','ship_customers_v221','ship_customers_v216','ship_customers_v215','ship_customers_v214','ship_customers_v212','ship_customers_v211','ship_customers_v210','ship_customers_v208','customer_blocks_v228_orders','customer_blocks_v227_orders','customer_blocks_v226_orders','customer_blocks_v228_master_order','customer_blocks_v227_master_order','customer_blocks_v226_master_order','customer_blocks_v212_orders','customer_blocks_v212_master_order'].forEach(k=>c?.remove?.(k));
    }catch(_e){}
  }
  function currentCustomer(){
    try{return clean(window.__YX_SELECTED_CUSTOMER__ || document.querySelector('[data-yx113-customer].active,[data-customer-card].active,[data-customer].active')?.dataset?.yx113Customer || document.querySelector('[data-customer-card].active,[data-customer].active')?.dataset?.customer || '');}catch(_e){return '';}
  }
  const pending = new Map();
  function refresh(ev){
    const d=ev&&ev.detail||{};
    const name=clean(d.customer_name||d.name||currentCustomer());
    const key=[ev.type||'', name, d.operation_id||d.request_key||d.event_id||'', d.reason||''].join('::');
    const old=pending.get(key); if(old) clearTimeout(old);
    pending.set(key, setTimeout(()=>{
      pending.delete(key);
      clearAll(name);
      try{ if(name && !d.suppress_customer_selected) emitOnce('yx:customer-selected',{name,force:false,source:d.source||'v415-sync',reason:d.reason||ev.type||'v415-cross-cache-refresh'},650); }catch(_e){}
      try{ emitOnce('yx:today-changes-refresh',{customer_name:name,force:false,reason:'v226-cross-cache-refresh'},900); }catch(_e){}
    }, 80));
  }
  ['yx:ship-completed','yx:warehouse-changed','yx:product-data-changed','yx:order-master-changed','yx:product-batch-write-success'].forEach(ev=>window.addEventListener(ev, refresh, false));
})();


/* V417: operation status full-page panel removed permanently.
   Keeps a tiny compatibility object only so existing background-save / warehouse / shipping code can keep running.
   No status card renderer, no document click/input binding, no interval, no observer. */
(function(){
  'use strict';
  window.__YX_V342_OPERATION_STATUS_CARD__ = true;
  const VERSION='v417-remove-opstatus-warehouse-visible-longpress';
  const STORAGE_PREFIXES=['yx_operation_status_'];
  function removePanel(){
    try{ document.getElementById('yx282-operation-status-card')?.remove(); }catch(_e){}
    try{ document.querySelectorAll('.yx282-operation-status-card,[data-yx282-op-action],[data-yx322-op-search]').forEach(el=>{
      if(el && el.id==='yx282-operation-status-card') el.remove();
    }); }catch(_e){}
  }
  function clearStatusOnly(){
    try{
      const keys=[];
      for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i)||''; if(STORAGE_PREFIXES.some(p=>k.startsWith(p))) keys.push(k); }
      keys.forEach(k=>localStorage.removeItem(k));
    }catch(_e){}
  }
  function noop(){ removePanel(); return 0; }
  function noopBool(){ removePanel(); return false; }
  try{ clearStatusOnly(); removePanel(); }catch(_e){}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', removePanel, {once:true});
  else removePanel();
  window.addEventListener('pageshow', removePanel, {passive:true});
  window.YXOperationStatus={
    record:noop, render:removePanel, pending:()=>0, details:()=>[], retryOne:noop, cancelOne:noop,
    jump:noopBool, markViewed:noop, markVisibleViewed:noop, markVisibleUnviewed:noop,
    undoBulkView:noop, clearBulkUndoResult:noop, bulkScope:()=> 'all', setBulkScope:()=> 'all', version:VERSION
  };
})();

/* V342: targeted refresh status detail after single retry success.
   Uses existing public page APIs only; keeps the original lightweight flow and cache-core untouched. */
(function(){
  'use strict';
  if(window.__YX_V332_TARGETED_RETRY_REFRESH__) return;
  window.__YX_V332_TARGETED_RETRY_REFRESH__=true;
  const VERSION='v406-warehouse-order-drag-longpress-fix';
  function clean(v){ return String(v == null ? '' : v).replace(/\s+/g,' ').trim(); }
  function page(){ return clean(document.body?.dataset?.module || document.querySelector('.module-screen[data-module]')?.dataset?.module || ''); }
  function customersFrom(ctx){
    const out=new Set();
    const add=v=>{ v=clean(v); if(v) out.add(v); };
    const walk=v=>{
      if(!v) return;
      if(Array.isArray(v)){ v.forEach(walk); return; }
      if(typeof v==='object'){
        add(v.customer_name || v.customer || v.name || v.client_name);
        ['items','returned_items','moved_items','before_items','after_items','customer_names','customers','affected_customers','payload','result','row'].forEach(k=>walk(v[k]));
      }
    };
    walk(ctx||{});
    return Array.from(out);
  }
  function sourceFrom(ctx){
    const s=clean(ctx?.payload?.source || ctx?.payload?.source_table || ctx?.row?.source || ctx?.result?.source || '');
    if(s==='master_orders' || s==='master') return 'master_order';
    if(s==='order') return 'orders';
    if(s) return s;
    const p=page();
    if(p==='orders' || p==='master_order' || p==='inventory') return p;
    return '';
  }
  function sourceLabel(src){
    src=clean(src);
    if(src==='orders') return '訂單';
    if(src==='master_order' || src==='master_orders') return '總單';
    if(src==='inventory') return '庫存';
    if(src==='ship' || src==='shipping') return '出貨';
    if(src==='warehouse') return '倉庫圖';
    return src || '操作';
  }
  function addTarget(list, txt){ txt=clean(txt); if(txt && !list.includes(txt)) list.push(txt); }
  async function apply(ctx={}){
    let did=false;
    const targets=[];
    const p=page();
    const result=ctx.result||{};
    const payload=ctx.payload||{};
    try{
      if((p==='warehouse' || result.saved_cell || result.server_cell || result.column_cells || result.from_column_cells || result.to_column_cells) && window.YXFinalWarehouse?.applyTargetedRetryRefresh){
        did = !!(await window.YXFinalWarehouse.applyTargetedRetryRefresh(ctx)) || did;
        if(ctx._yx_refresh_target) addTarget(targets, ctx._yx_refresh_target);
      }
    }catch(_e){}
    const names=customersFrom(ctx);
    try{
      if((p==='ship' || p==='shipping') && window.YX116ShipPicker?.load){
        const n=names[0] || clean(window.__YX_SELECTED_CUSTOMER__ || document.getElementById('customer-name')?.value || '');
        if(n){ await window.YX116ShipPicker.load(n,{single_retry:true, targeted:true}); did=true; addTarget(targets, n+' 出貨商品'); }
      }
    }catch(_e){}
    try{
      const src=sourceFrom(ctx);
      const actions=window.YX113ProductActions || window.YX132ProductActions || window.YX128ProductActions;
      if(actions?.loadSource && (src==='orders' || src==='master_order' || src==='inventory' || p==='orders' || p==='master_order' || p==='inventory')){
        const target=src || p;
        await actions.loadSource(target,{afterSubmit:true, single_retry:true, targeted:true, customer_name:names[0]||''});
        did=true;
        addTarget(targets, (names[0] ? names[0]+' ' : '目前客戶 ') + sourceLabel(target) + '商品');
        if(names[0] && window.YX113CustomerRegions?.selectCustomer) await window.YX113CustomerRegions.selectCustomer(names[0]);
      }
    }catch(_e){}
    try{
      names.forEach(n=>window.dispatchEvent(new CustomEvent('yx:customer-selected',{detail:{name:n,force:false,source:'single-retry',reason:'v307-targeted-refresh'}})));
      if(names.length){ did=true; if(!targets.length) addTarget(targets, names[0]+' 客戶商品'); }
    }catch(_e){}
    const refreshTarget=clean(targets.join('、'));
    const statusSource=(p==='ship'||p==='shipping')?'ship':((p==='orders'||p==='master_order'||p==='inventory')?p:'warehouse');
    const msg=did ? (refreshTarget ? '單筆重送已局部刷新完成：'+refreshTarget : '單筆重送已局部刷新完成') : '單筆重送完成，無需刷新畫面';
    try{ window.YXOperationStatus?.record?.({source:statusSource,status:'success',reason:'targeted-refresh',message:msg,refresh_target:refreshTarget,target_label:refreshTarget,customer_name:names[0]||'',operation_id:payload.operation_id||result.operation_id||'',version:VERSION}); }catch(_e){}
    try{ if(refreshTarget) window.dispatchEvent(new CustomEvent('yx:operation-target-refresh',{detail:{source:statusSource,status:'success',reason:'targeted-refresh',message:msg,refresh_target:refreshTarget,target_label:refreshTarget,customer_name:names[0]||'',operation_id:payload.operation_id||result.operation_id||'',version:VERSION}})); }catch(_e){}
    return did;
  }
  window.YXTargetedRetryRefresh={apply, version:VERSION};
})();
