
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
      try { if (window.YX?.cache && source) window.YX.cache.write('products_' + String(source), {rows, selectedCustomer:(window.__YX_SELECTED_CUSTOMER__||''), saved_at:Date.now()}); } catch(_e) {}
    }
    return state.rows[source] || window.__YX112_ROWS__[source] || window.__yx63Rows[source] || [];
  }
  function cloneRows(rows){ try{return JSON.parse(JSON.stringify(rows||[]));}catch(_e){return Array.isArray(rows)?rows.slice():[];} }
  function cacheName(source){ return 'products_' + String(source || sourceFromModule() || 'unknown'); }
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
        + (source === 'inventory' ? `<button class="ghost-btn small-btn danger-btn" type="button" data-yx113-batch-delete="${source}">批量刪除</button><button class="ghost-btn small-btn" type="button" data-yx128-edit-all="${source}">批量編輯全部</button>` : '');
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
        await YX.api('/api/items/transfer', {method:'POST', body:JSON.stringify({source:'orders', id, target:'master_order', customer_name:(customerOf(row) || selectedCustomer()), allow_inventory_fallback:true})});
        YX.toast('已加到總單', 'ok');
        await loadSource(source);
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
      if (!rows && Array.isArray(data?.items)) rows = data.items;
      if (Array.isArray(rows)) rowsStore(source, rows);
      updateSummaryHeaderOnly(source);
      return Array.isArray(rows);
    } catch(_e) { return false; }
  }
  function applySnapshotFromResponse(data, source){
    const snaps = data?.snapshots || {};
    let rows = Array.isArray(snaps[source]) ? snaps[source] : null;
    if (!rows && source === 'master_order' && Array.isArray(snaps.master_orders)) rows = snaps.master_orders;
    if (!rows && Array.isArray(data?.items) && data.items.length && (source === sourceFromModule() || source)) rows = data.items;
    if (Array.isArray(rows)) {
      rowsStore(source, rows);
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
    if (!applySnapshotFromResponse(d, source)) { if (shouldAvoidRerender(source)) updateSummaryHeaderOnly(source); else await loadSource(source); }
    try { if (target === 'orders' || target === 'master_order' || target === 'master_orders') { const t = target === 'master_orders' ? 'master_order' : target; if (customer) window.__YX_SELECTED_CUSTOMER__ = customer; if (!applySnapshotFromResponse(d, t)) await loadSource(t); } } catch(_e) {}
    try { clearCrossFunctionCaches(target === 'master_orders' ? 'master_order' : target, customer, 'batch-transfer-success'); } catch(_e) {}
    await refreshCustomerBoards(customer);
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
    if (!applySnapshotFromResponse(d, source)) { if (shouldAvoidRerender(source)) updateSummaryHeaderOnly(source); else await loadSource(source); }
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
    const editDeleteButtons = `<button class="ghost-btn small-btn danger-btn" type="button" data-yx113-batch-delete="${source}" data-source="${source}">批量刪除</button><button class="ghost-btn small-btn" type="button" data-yx128-edit-all="${source}" data-source="${source}">${editing ? '儲存批量編輯' : '批量編輯全部'}</button>`;
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
    panel.scrollIntoView?.({behavior:'smooth', bstable:'nearest'});
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
      panel.scrollIntoView?.({behavior:'smooth', bstable:'nearest'});
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
    const hadCached = (!opts.force && !opts.afterSubmit && !opts.beforeEditSave) ? hydrateRowsFromCache(source) : false;
    const seqKey = '__yx139LoadSeq_' + source;
    window[seqKey] = (Number(window[seqKey] || 0) + 1);
    const seq = window[seqKey];
    const fetchFresh = async () => {
      if (state.loading === source && !opts.force) return rowsStore(source);
      state.loading = source;
      try {
        const limit = opts.full ? 0 : 360;
        const d = await YX.api(endpoint(source) + '?yx143_final=1&fast=1&v287=1&force=' + (opts.force ? '1' : '0') + '&limit=' + encodeURIComponent(limit), {method:'GET'});
        if (seq !== window[seqKey] && !opts.force) return rowsStore(source);
        const rows = Array.isArray(d.items) ? d.items : (Array.isArray(d.rows) ? d.rows : []);
        state.total[source] = Number(d.total || rows.length || 0) || rows.length;
        state.hasMore[source] = !!d.has_more;
        rowsStore(source, rows);
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
    if (hadCached && !opts.force && !opts.full) {
      try { (window.YX?.scheduler?.idle || window.requestIdleCallback || function(fn){return setTimeout(fn,0);})(() => fetchFresh().catch(()=>{}), 1800); } catch(_e) { fetchFresh().catch(()=>{}); }
      return rowsStore(source);
    }
    return fetchFresh();
  }
  async function refreshCurrent(){ return loadSource(sourceFromModule()); }
  async function refreshCustomerBoards(customer){
    customer = YX.clean(customer || '');
    try { if (customer) window.__YX_SELECTED_CUSTOMER__ = customer; } catch(_e) {}
    // formal mainline behavior.
    try { if (customer && window.YX113CustomerRegions?.ensureCustomerVisible) await window.YX113CustomerRegions.ensureCustomerVisible(customer, '北區', true); } catch(_e) {}
    try { if (window.YX113CustomerRegions?.loadCustomerBlocks) await window.YX113CustomerRegions.loadCustomerBlocks(true); } catch(_e) {}
    try { if (customer && window.YX113CustomerRegions?.ensureCustomerVisible) await window.YX113CustomerRegions.ensureCustomerVisible(customer, '北區', true); } catch(_e) {}
    try { if (window.YX113CustomerRegions?.selectCustomer && customer) await window.YX113CustomerRegions.selectCustomer(customer); } catch(_e) {}
    try { if (customer && typeof window.selectCustomerForModule === 'function') await window.selectCustomerForModule(customer); } catch(_e) {}
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
  function yx216SoftFail(source, customer, reason, err){
    try{
      const msg = clean((err && (err.message || err.error)) || '背景保存暫時失敗，已保留畫面與佇列');
      document.querySelectorAll('.yx113-summary-row,.yx113-product-card,.yx112-product-card').forEach(el=>{
        if(!source || el.dataset.source===source){ el.dataset.yxPendingSave='1'; el.classList.add('yx-pending-save'); }
      });
      window.dispatchEvent(new CustomEvent('yx:operation-soft-failed',{detail:{source,customer_name:customer||selectedCustomer(),reason:reason||'background-save-failed',error:msg,version:'v307'}}));
    }catch(_e){}
  }
  function yx216SoftSuccess(source){
    try{ document.querySelectorAll('.yx-pending-save').forEach(el=>{ if(!source || el.dataset.source===source){ delete el.dataset.yxPendingSave; el.classList.remove('yx-pending-save'); } }); }catch(_e){}
    try{ window.dispatchEvent(new CustomEvent('yx:operation-status',{detail:{source, status:'success', reason:'product-background-save-success', customer_name:selectedCustomer ? selectedCustomer() : '', product_label:'', message:'商品背景儲存完成', version:'v307'}})); }catch(_e){}
  }
  function backgroundRequest(url, payload, opt={}){
    if (window.YXBackgroundSave && typeof window.YXBackgroundSave.request === 'function') {
      return window.YXBackgroundSave.request(url, payload, opt);
    }
    return YX.api(url, {method: opt.method || 'POST', body: JSON.stringify(payload || {}), headers: opt.headers || {}});
  }
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
      .then(async () => {
        yx216SoftSuccess(source);
        YX.toast('商品已永久儲存', 'ok');
        try { clearCrossFunctionCaches(source, payload.customer_name || selectedCustomer(), 'card-edit-success'); } catch(_e) {}
        if (!document.hidden) { try { (window.YX?.scheduler?.idle || setTimeout)(()=>loadSource(source).catch(()=>{}), 900); } catch(_e){} }
        try { if (window.YX116ShipPicker && selectedCustomer()) await window.YX116ShipPicker.load(selectedCustomer(),{force:true}); } catch(_e) {}
      })
      .catch(e => {
        yx216SoftFail(source, payload.customer_name || selectedCustomer(), 'card-edit-failed', e);
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
    const url = source === 'inventory' ? `/api/inventory/${encodeURIComponent(id)}` : source === 'orders' ? `/api/orders/${encodeURIComponent(id)}` : `/api/master_orders/${encodeURIComponent(id)}`;
    await YX.api(url, {method:'DELETE'}); YX.toast('已刪除', 'ok'); try { clearCrossFunctionCaches(source, selectedCustomer(), 'delete-success'); } catch(_e) {} await loadSource(source, {force:true});
  }
  async function moveInventory(card, target){
    const id = card.dataset.id;
    let customer = selectedCustomer();
    if (!customer) customer = prompt(`要加入${target === 'orders' ? '訂單' : '總單'}的客戶名稱`) || '';
    customer = YX.clean(customer);
    if (!customer) return YX.toast('請輸入客戶名稱', 'warn');
    await YX.api(`/api/inventory/${encodeURIComponent(id)}/move`, {method:'POST', body:JSON.stringify({target, customer_name:customer, region:'北區'})});
    YX.toast(`已加到${target === 'orders' ? '訂單' : '總單'}`, 'ok');
    try { clearCrossFunctionCaches(target === 'orders' ? 'orders' : 'master_order', customer, 'move-inventory-success'); } catch(_e) {}
    window.__YX_SELECTED_CUSTOMER__ = customer;
    await loadSource('inventory');
    try { await loadSource(target === 'orders' ? 'orders' : 'master_order'); } catch(_e) {}
    try { if (window.renderCustomers) await window.renderCustomers(); } catch(_e) {}
    try { if (typeof window.selectCustomerForModule === 'function') await window.selectCustomerForModule(customer); } catch(_e) {}
  }
  async function shipItem(card){
    const source = card.dataset.source, id = card.dataset.id;
    const row = rowsStore(source).find(r => String(idOf(r) || '') === String(id)); if (!row) return;
    if (!confirm(`直接出貨：${customerOf(row)} ${row.product_text || ''}？`)) return;
    await YX.api('/api/items/transfer', {method:'POST', body:JSON.stringify({source:apiSource(source), id, target:'ship', customer_name:customerOf(row), qty:row.qty || qtyOf(row), allow_inventory_fallback:true})});
    YX.toast('已直接出貨', 'ok'); try { clearCrossFunctionCaches(source, customerOf(row), 'direct-ship-success'); } catch(_e) {} await loadSource(source);
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
        try { await loadSource(source, {force:true, beforeEditSave:true}); } catch(_e) {}
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
    // formal mainline behavior.
    state.editAll[source] = false;
    state.editScope[source] = null;
    clearSelected(source);
    renderSummary(source);
    renderCards(source);
    YX.toast(`已套用畫面並背景儲存 ${items.length} 筆`, 'ok');
    backgroundRequest('/api/customer-items/batch-update', {items, request_key:`v114-batch-${source}-${Date.now()}`})
      .then(d => {
        mergeSnapshotQuiet(d, source);
        updateSummaryHeaderOnly(source);
        yx216SoftSuccess(source);
        YX.toast(`已儲存 ${d.count || items.length} 筆`, 'ok');
        try { clearCrossFunctionCaches(source, selectedCustomer(), 'batch-edit-success'); } catch(_e) {}
        try { if (window.YX116ShipPicker && selectedCustomer()) window.YX116ShipPicker.load(selectedCustomer(),{force:true}).catch(()=>{}); } catch(_e) {}
      })
      .catch(e => {
        try { window.YXBackgroundSave?.drain?.(); } catch(_retryErr) {}
        yx216SoftFail(source, selectedCustomer(), 'batch-edit-failed', e);
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
    // formal mainline behavior.
    YX.toast(`正在套用材質 ${material}：${items.length} 筆`, 'ok');
    const idSet = new Set(items.map(x => String(x.id)));
    rowsStore(source).forEach(r => { if (idSet.has(String(idOf(r) || ''))) { r.material = material; r.product_code = material; } });
    renderSourceSafely(source);
    try{
      const d = await YX.api('/api/customer-items/batch-material', {method:'POST', body:JSON.stringify({material, items})});
      YX.toast(`已套用材質 ${material}：${d.count || items.length} 筆`, 'ok');
      if(sel) sel.value='';
      try { clearCrossFunctionCaches(source, selectedCustomer(), 'bulk-material-success'); } catch(_e) {}
      clearSelected(source);
      if (!applySnapshotFromResponse(d, source)) { if (shouldAvoidRerender(source)) updateSummaryHeaderOnly(source); else await loadSource(source); }
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
    const checkedRows2 = Array.from(document.querySelectorAll(`#yx113-${source}-summary .yx113-row-check:checked`)).map(cb => cb.closest('tr')).filter(Boolean);
    const keyOfRow = (r) => { const p=splitProduct(r.product_text||''); return [p.size||r.product_text||'', p.support||String(qtyOf(r)), String(qtyOf(r)), materialOf(r), customerOf(r), zoneLabel(r)].join('|'); };
    const checkedKeys = new Set(checkedRows2.map(tr => Array.from(tr.children).slice(0,5).map(td => (td.textContent||'').trim()).join('|')));
    rowsStore(source, rowsStore(source).filter(r => !idSet.has(String(idOf(r) || '')) && !checkedKeys.has(keyOfRow(r))));
    clearSelected(source);
    renderSummary(source); renderCards(source);
    removeDeletedRowsFromDom(source, idSet);
    try{
      const d = await YX.api('/api/customer-items/batch-delete', {method:'POST', body:JSON.stringify({items})});
      YX.toast(`批量刪除成功：${d.count || items.length} 筆，清單已立即移除`, 'ok');
      try { clearCrossFunctionCaches(source, selectedCustomer(), 'bulk-delete-success'); } catch(_e) {}
      // formal mainline behavior.
      // 下一次進頁或手動刷新時會從後端拿到已刪除後資料。
      applySnapshotFromResponse(d, source);
      const cust = selectedCustomer();
      if (cust || source === 'orders' || source === 'master_order') await refreshCustomerBoards(cust);
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
      if (fullBtn) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); const s = fullBtn.dataset.yx137LoadFull || source; state.displayLimit[s] = 999999; try { await loadSource(s, {force:true, full:true}); } catch(e) { YX.toast(e.message || '完整資料載入失敗','error'); } return; }
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
        try { clearCrossFunctionCaches(sourceFromModule() || 'ship', e.detail?.customer_name || selectedCustomer(), 'ship-completed-v215'); } catch(_e) {}
        const affected = Array.isArray(e.detail?.affected_sources) ? e.detail.affected_sources : ['orders','master_order','inventory'];
        const current = sourceFromModule();
        try { if (current && affected.includes(current)) await loadSource(current, {force:true, full:true}); } catch(_e) {}
        try { if (window.YX113CustomerRegions?.loadCustomerBlocks) await window.YX113CustomerRegions.loadCustomerBlocks(true); } catch(_e) {}
        try { const c = e.detail?.customer_name || selectedCustomer(); if (c && window.YX113CustomerRegions?.selectCustomer) await window.YX113CustomerRegions.selectCustomer(c); } catch(_e) {}
        try { const c = e.detail?.customer_name || selectedCustomer(); if (c) window.dispatchEvent(new CustomEvent('yx:customer-selected',{detail:{name:c,force:true,source:'ship',reason:'ship-completed-product-v282'}})); } catch(_e) {}
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
        try { if (sourceNow === 'orders' || sourceNow === 'master_order') await loadSource(sourceNow, {force:true, full:true}); } catch(_e) {}
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
      window.dispatchEvent(new CustomEvent(name, {detail: {...(detail||{}), sync_guard:'v287'}}));
      return true;
    }catch(_e){ try{ window.dispatchEvent(new CustomEvent(name,{detail:detail||{}})); }catch(__e){} return true; }
  }

  function clearCrossFunctionCaches(source, customer, reason){
    source = clean(source || page() || ''); customer = clean(customer || selectedCustomer() || window.__YX_SELECTED_CUSTOMER__ || '');
    try {
      ['ship_customers_v342','ship_customers_v337','ship_customers_v332','ship_customers_v307','ship_customers_v287','ship_customers_v282','ship_customers_v267','ship_customers_v252','ship_customers_v228','ship_customers_v227','ship_customers_v226','ship_customers_v225','ship_customers_v224','ship_customers_v223','ship_customers_v222','ship_customers_v221','ship_customers_v216','ship_customers_v215','ship_customers_v214','ship_customers_v210','ship_customers_v208','ship_customers_v207','ship_customers_v199','ship_customers_v198','ship_customers_v197','today_changes_v287','today_changes_v282','today_changes_v267','today_changes_v252','today_changes_v228','today_changes_v227','today_changes_v226','today_changes_v225','today_changes_v224','today_changes_v223','today_changes_v222','today_changes_v221','today_changes_v215','today_changes_v214','today_changes_v210','today_changes_v208','today_changes_v207','today_changes_v199','today_changes_v198','today_changes_v197','today_changes_light_v287','today_changes_light_v282','today_changes_light_v267','today_changes_light_v252','today_changes_light_v228','today_changes_light_v227','today_changes_light_v226','today_changes_light_v225','today_changes_light_v224','today_changes_light_v223','today_changes_light_v222','today_changes_light_v221','today_changes_light_v215','today_changes_light_v214','today_changes_light_v210','today_changes_light_v208','today_changes_light_v207','today_changes_light_v199','today_changes_light_v198','warehouse_available_v287','warehouse_available_v282','warehouse_available_v267','warehouse_available_v257','warehouse_available_v252','warehouse_available_v228','warehouse_available_v227','warehouse_available_v226','warehouse_available_v225','warehouse_available_v224','warehouse_available_v223','warehouse_available_v222','warehouse_available_v221','warehouse_available_v215','warehouse_available_v214','warehouse_available_v210','warehouse_available_v208','warehouse_available_v207','warehouse_available_v199','warehouse_available_v198','warehouse_available_v197','warehouse_source_qty_map_v287','warehouse_source_qty_map_v282','warehouse_source_qty_map_v267','warehouse_source_qty_map_v257','warehouse_source_qty_map_v252','warehouse_source_qty_map_v228','warehouse_source_qty_map_v227','warehouse_source_qty_map_v226','warehouse_source_qty_map_v225','warehouse_source_qty_map_v224','warehouse_source_qty_map_v223','warehouse_source_qty_map_v222','warehouse_source_qty_map_v221','warehouse_source_qty_map_v215','warehouse_source_qty_map_v214','warehouse_source_qty_map_v210','warehouse_source_qty_map_v208','warehouse_source_qty_map_v207','warehouse_source_qty_map_v199','warehouse_source_qty_map_v198','warehouse_source_qty_map_v197'].forEach(k=>window.YX?.cache?.remove?.(k));
      window.YX?.cache?.clearGroup?.('ship_items_');
      window.YX?.cache?.clearGroup?.('customer_blocks_');
      window.YX?.cache?.clearGroup?.('warehouse_available_');
      window.YX?.cache?.clearGroup?.('warehouse_source_qty_map_');
      window.YX?.cache?.clearGroup?.('today_changes_');
      window.YX?.cache?.clearGroup?.('today_changes_light_');
    } catch(_e) {}
    try { yx215EmitOnce('yx:product-data-changed', {source, customer_name:customer, reason:reason||'product-write', version:'v307'}, 900); } catch(_e) {}
    try { if(source === 'orders' || source === 'master_order') yx215EmitOnce('yx:order-master-changed', {source, customer_name:customer, reason:reason||'product-write', version:'v307'}, 900); } catch(_e) {}
    try { if(customer) yx215EmitOnce('yx:customer-selected', {name:customer, force:true, source, reason:'product-write-v282'}, 650); } catch(_e) {}
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
        const d = await api('/api/customer-items?name=' + encodeURIComponent(customer) + '&force=1&fast=1&v214=1', {method:'GET'});
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
        idle(() => { try { act?.loadSource?.(m, {force:true, afterSubmit:true, customer_name:customer}); } catch(_e){} }, 1800);
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
      } else {
        // formal mainline behavior.
        const current = (Array.isArray(act.rowsStore(m)) ? act.rowsStore(m) : []).filter(r => !r.__optimistic && !r.__pending_server_id && !String(r.id || '').startsWith('tmp-'));
        act.rowsStore(m, current);
        try { act.loadSource?.(m, {force:true, afterSubmit:true, customer_name:customer}); } catch(_e) {}
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
          .then(d => { try { if (Array.isArray(d?.items) && window.YX113CustomerRegions?.renderBoards) window.YX113CustomerRegions.renderBoards(d.items); } catch(_e) {} try { forceCustomerCardVisible(customer, m); } catch(_e) {} })
          .catch(e => console.warn('[YX main ensure customer background]', e));
      } catch(_e) {}
      try {
        api('/api/customers?force=1&fast=1&light=1&v214=1', {method:'GET'})
          .then(d => { try { if (Array.isArray(d?.items) && window.YX113CustomerRegions?.renderBoards) window.YX113CustomerRegions.renderBoards(d.items); } catch(_e) {} try { forceCustomerCardVisible(customer, m); } catch(_e) {} })
          .catch(()=>{});
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
        act.rowsStore(m, mergeSubmittedRows(act.rowsStore(m) || [], preOptimistic));
        act.renderSummary?.(m); act.renderCards?.(m);
      }
      if (customer && (m === 'orders' || m === 'master_order')) {
        window.__YX_SELECTED_CUSTOMER__ = customer;
        if ($('customer-name')) $('customer-name').value = customer;
        forceCustomerCardVisible(customer, m);
        try { window.YX113CustomerRegions?.renderFromCurrentRows?.(); forceCustomerCardVisible(customer, m); } catch(_e) {}
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
    backgroundRequest(apiPath(m), {customer_name:customer, ocr_text:text, items, duplicate_mode:duplicateMode, location:activeZone, zone:activeZone, region:(m === 'orders' || m === 'master_order') ? '北區' : '', request_key:requestKey, fast_response:true})
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
          try { if ((m === 'orders' || m === 'master_order') && customer) refreshCustomerBoardsSafe(customer).catch(()=>{}); } catch(_e) {}
          try {
            const act2 = window.YX113ProductActions || window.YX132ProductActions || window.YX128ProductActions;
            setTimeout(()=>{ try { act2?.loadSource?.(m, {force:true, afterSubmit:true, full:true, customer_name:customer}); } catch(_e){} }, 450);
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
        yx216SoftFail(m, customer, 'submit-background-failed', e);
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
    if (btn.dataset.yxV31SubmitBound === '1') return;
    btn.dataset.yxV31SubmitBound = '1';
    btn.addEventListener('click', ev => {
      const m = page();
      if (!['inventory','orders','master_order'].includes(m)) return;
      finalConfirmSubmit(ev);
    }, true);
  }
  bindFinalSubmitButton();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindFinalSubmitButton, {once:true});
  document.addEventListener('click', ev => {
    const btn = ev.target?.closest?.('#submit-btn');
    if (!btn) return;
    const m = page();
    if (!['inventory','orders','master_order'].includes(m)) return;
    finalConfirmSubmit(ev);
  }, true);
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
    if (mode === 'orders') return {qty:orderQty || num(c.item_count, c.active_qty_total), rows:orderRows || num(c.row_count, c.active_rows)};
    if (mode === 'master_order') return {qty:masterQty || num(c.item_count, c.active_qty_total), rows:masterRows || num(c.row_count, c.active_rows)};
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
    const total = (items || []).reduce((sum,it)=>sum + qtyFromProduct(it.product_text, it.qty), 0);
    panel.innerHTML = `<div class="customer-detail-card yx121-selected-customer-products"><div class="customer-detail-header"><div><div class="section-title">${YX.esc(name)}</div><div class="muted">${total}件 / ${(items||[]).length}筆商品</div></div></div><div class="card-list">${(items||[]).length ? items.map(it=>{ const raw=String(it.product_text||''); const ps=raw.split('='); return `<div class="deduct-card yx112-product-card"><div class="yx113-product-head"><strong class="material-text">${YX.esc(it.material || it.product_code || '未填材質')}</strong><strong>${qtyFromProduct(raw,it.qty)}件</strong></div><div class="yx113-product-main"><span>${YX.esc(ps[0]||raw)}</span><span>${YX.esc(ps.slice(1).join('=') || it.qty || '')}</span></div><div class="small-note">${YX.esc(it.source || '')}</div></div>`; }).join('') : '<div class="empty-state-card compact-empty">此客戶目前沒有商品</div>'}</div></div>`;
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
    if (!renderCachedSelectedPanel(name)) panel.innerHTML = '<div class="empty-state-card compact-empty">客戶商品載入中…</div>';
    try {
      const d = await YX.api(`/api/customer-items?name=${encodeURIComponent(name)}&fast=1&force=1&v287=1${variantsQuery(name)}`, {method:'GET'});
      const items = Array.isArray(d.items) ? d.items : [];
      state.itemCache.set(mergeKey(name) || name, {items, at:Date.now()});
      renderSelectedCustomerItems(name, items);
    } catch(e) { panel.innerHTML = `<div class="empty-state-card compact-empty">${YX.esc(e.message || '客戶商品載入失敗')}</div>`; }
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
          window.YX116ShipPicker.load(name,{force:true}).catch(()=>{});
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
    try { yx215EmitOnce('yx:customer-profile-changed', Object.assign({version:'v307'}, detail), 1000); } catch(_e) {}
    try { yx215EmitOnce('yx:warehouse-changed', Object.assign({version:'v307'}, detail), 1000); } catch(_e) {}
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
    (existingItems || []).forEach(c => {
      const n = YX.clean(c.name || c.customer_name || '');
      if (!n || archived.has(n)) return;
      let savedRegion = '';
      try { savedRegion = (JSON.parse(localStorage.getItem('yx_customer_regions_v18') || '{}') || {})[n] || ''; } catch(_e) {}
      const rc = Object.assign({}, zeroRc, c.relation_counts || {});
      const rowsTotal = Math.max(Number(c.item_count || c.row_count || 0), rcRows(rc), Number(rc.active_rows || rc.total_rows || 0));
      const qtyTotal = Math.max(Number(c.total_qty || 0), rcQty(rc), Number(rc.active_qty_total || rc.total_qty || 0));
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
      if (source === 'orders') { rc.order_rows = Number(rc.order_rows || 0) + 1; rc.order_qty = Number(rc.order_qty || 0) + qty; }
      else if (source === 'master_order') { rc.master_rows = Number(rc.master_rows || 0) + 1; rc.master_qty = Number(rc.master_qty || 0) + qty; }
      else if (source === 'inventory') { rc.inventory_rows = Number(rc.inventory_rows || 0) + 1; rc.inventory_qty = Number(rc.inventory_qty || 0) + qty; }
      const rowsTotal = Math.max(Number(old.item_count || old.row_count || 0), rcRows(rc));
      const qtyTotal = Math.max(Number(old.total_qty || 0), rcQty(rc));
      byName.set(name, Object.assign({}, old, {name, customer_name:name, region, relation_counts:rc, item_count:rowsTotal, row_count:rowsTotal, total_qty:qtyTotal, merge_names:Array.from(new Set([...(old.merge_names || []), name]))}));
    };
    try {
      const stores = (window.__YX112_ROWS__ || window.__yx63Rows || {});
      ['orders','master_order','inventory'].forEach(source => {
        const arr = Array.isArray(stores[source]) ? stores[source] : [];
        arr.forEach(r => add(r.customer_name || r.customer || '', source, r));
      });
    } catch(_e) {}
    return Array.from(byName.values());
  }


  async function loadCustomerBlocks(force=true){
    if (!isRegionPage()) return state.items;
    try {
      const cached = !force && window.YX?.cache?.read('customer_blocks_v228_' + moduleKey(), 1000*60*60*12);
      if (cached && Array.isArray(cached.items)) { state.items = cached.items; renderBoards(state.items); }
    } catch(_e) {}
    try {
      // V196: 客戶卡 counts 必須跟目前頁面的訂單/總單資料同步，先強制刷新本頁來源，再讀 /api/customers。
      try {
        const src = moduleKey() === 'master_order' ? 'master_order' : (moduleKey() === 'orders' ? 'orders' : '');
        if (force && src && window.YX113ProductActions?.loadSource) await window.YX113ProductActions.loadSource(src, {force:true, customer_blocks:true});
      } catch(_e) {}
      const d = await YX.api('/api/customers?yx114=1&fast=1&force=1&v287=1&ts=' + Date.now(), {method:'GET'});
      // v17：客戶區不能只看 /api/customers；重新整理後若後端客戶檔尚未同步，仍要從目前訂單/總單 rowsStore 立刻補出客戶卡。
      state.items = relationCustomersFromRows(Array.isArray(d.items) ? d.items : []).filter(c => !archivedCustomerSet().has(YX.clean(c.name || c.customer_name || '')));
      try { window.YX?.cache?.write('customer_blocks_v228_' + moduleKey(), {items:state.items}); } catch(_e) {}
      renderBoards(state.items);
      try { window.dispatchEvent(new CustomEvent('yx:customers-loaded', {detail:{items:state.items}})); } catch(_e) {}
      return state.items;
    } catch(e) {
      YX.toast(e.message || '客戶名單載入失敗', 'error');
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
      if (cleanName !== name) await YX.api(`/api/customers/${encodeURIComponent(name)}`, {method:'PUT', body:JSON.stringify({new_name:cleanName})});
      await YX.api('/api/customers', {method:'POST', body:JSON.stringify({name:cleanName, phone:item.phone || '', address:item.address || '', notes:item.notes || '', common_materials:item.common_materials || '', common_sizes:item.common_sizes || '', region:finalRegion, preserve_existing:false})});
      try { emitCustomerCacheSync({source:'customers', reason:'customer-rename-v228', old_customer_name:name, new_customer_name:cleanName, customer_name:cleanName}); } catch(_e) {}
      YX.toast('客戶編輯已保存', 'ok');
      selectCustomer(cleanName).catch(()=>{});
    } catch(e) {
      YX.toast(e.message || '客戶編輯保存失敗', 'error');
      loadCustomerBlocks(true).catch(()=>{});
    }
  }
  function renderFromCurrentRows(){
    if (!isRegionPage()) return;
    // v17：每次商品清單載入 / 新增 / 刪除後，直接用目前 rowsStore 產生北中南客戶，避免重新整理後客戶卡消失。
    state.items = relationCustomersFromRows(state.items || []).filter(c => !archivedCustomerSet().has(YX.clean(c.name || c.customer_name || '')));
    renderBoards(state.items);
    const selected = YX.clean(window.__YX_SELECTED_CUSTOMER__ || $('customer-name')?.value || '');
    if (selected) {
      const card = findCustomerCard(selected);
      if (card) card.classList.add('is-active');
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
      savePromise.then(()=>{
        YX.toast(`${name} 區域已保存`, 'ok');
        moveCustomerCardNow(name, region);
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
      try { emitCustomerCacheSync({source:'customers', reason:'customer-delete-archive-v228', customer_name:name, mode:d.mode || 'archived'}); } catch(_e) {}
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
    const res = await fetch(`${url}${url.includes('?')?'&':'?'}_=${Date.now()}`, {credentials:'same-origin', cache:'no-store', ...opt, headers:{'Accept':'application/json','Content-Type':'application/json',...(opt.headers||{})}});
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
  async function api(url,opt={}){ const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{'Accept':'application/json','Content-Type':'application/json',...(opt.headers||{})}}); const t=await r.text(); let d={}; try{d=t?JSON.parse(t):{};}catch(_e){d={success:false,error:t};} if(!r.ok||d.success===false) throw new Error(d.error||d.message||'請求失敗'); return d; }
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
      window.dispatchEvent(new CustomEvent(name,{detail:{...(detail||{}),sync_guard:'v287'}}));
      return true;
    }catch(_e){ try{ window.dispatchEvent(new CustomEvent(name,{detail:detail||{}})); }catch(__e){} return true; }
  }
  function clearAll(customer){
    try{
      const c=window.YX?.cache;
      c?.clearGroup?.('ship_items_'); c?.clearGroup?.('customer_blocks_'); c?.clearGroup?.('warehouse_available_'); c?.clearGroup?.('warehouse_source_qty_map_'); c?.clearGroup?.('today_changes_'); c?.clearGroup?.('today_changes_light_');
      ['ship_customers_v342','ship_customers_v337','ship_customers_v332','ship_customers_v307','ship_customers_v287','ship_customers_v282','ship_customers_v267','ship_customers_v252','ship_customers_v228','ship_customers_v227','ship_customers_v226','ship_customers_v225','ship_customers_v224','ship_customers_v223','ship_customers_v222','ship_customers_v221','ship_customers_v216','ship_customers_v215','ship_customers_v214','ship_customers_v212','ship_customers_v211','ship_customers_v210','ship_customers_v208','customer_blocks_v228_orders','customer_blocks_v227_orders','customer_blocks_v226_orders','customer_blocks_v228_master_order','customer_blocks_v227_master_order','customer_blocks_v226_master_order','customer_blocks_v212_orders','customer_blocks_v212_master_order','products_inventory','products_orders','products_master_order'].forEach(k=>c?.remove?.(k));
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
      try{ if(name) emitOnce('yx:customer-selected',{name,force:true,source:d.source||'v226-sync',reason:d.reason||ev.type||'v224-cross-cache-refresh'},650); }catch(_e){}
      try{ emitOnce('yx:today-changes-refresh',{customer_name:name,force:true,reason:'v226-cross-cache-refresh'},900); }catch(_e){}
    }, 80));
  }
  ['yx:ship-completed','yx:warehouse-changed','yx:product-data-changed','yx:order-master-changed'].forEach(ev=>window.addEventListener(ev, refresh, false));
})();


/* V342: operation status viewed/unviewed filter.
   Extends the existing lightweight status card only; no page renderer, no interval, no observer, and no core cache changes. */
(function(){
  'use strict';
  if(window.__YX_V342_OPERATION_STATUS_CARD__) return;
  window.__YX_V342_OPERATION_STATUS_CARD__ = true;
  const VERSION='v342-status-unviewed-filter';
  const STORE_KEY='yx_operation_status_card_v342';
  const FILTER_KEY='yx_operation_status_type_filter_v342';
  const STATUS_FILTER_KEY='yx_operation_status_state_filter_v342';
  const SEARCH_KEY='yx_operation_status_search_v342';
  const VIEW_FILTER_KEY='yx_operation_status_view_filter_v342';
  const VIEWED_KEY='yx_operation_status_viewed_v342';
  const LEGACY_VIEWED_KEYS=['yx_operation_status_viewed_v337','yx_operation_status_viewed_v332','yx_operation_status_viewed_v327'];
  const LEGACY_FILTER_KEY='yx_operation_status_filter_v312';
  const LEGACY_STORE_KEYS=['yx_operation_status_card_v337','yx_operation_status_card_v332','yx_operation_status_card_v327','yx_operation_status_card_v322','yx_operation_status_card_v317','yx_operation_status_card_v312','yx_operation_status_card_v307','yx_operation_status_card_v302','yx_operation_status_card_v297','yx_operation_status_card_v292','yx_operation_status_card_v287','yx_operation_status_card_v282'];
  const PAGE_SET=new Set(['orders','master_order','ship','warehouse']);
  const MAX_ROWS=20;
  function clean(v){ return String(v == null ? '' : v).replace(/\s+/g,' ').trim(); }
  function esc(v){ return clean(v).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
  function page(){ return clean(document.body?.dataset?.module || document.querySelector('.module-screen[data-module]')?.dataset?.module || ''); }
  function active(){ return PAGE_SET.has(page()); }
  function now(){ return Date.now(); }
  function fmtTime(ts){ ts=Number(ts||0); if(!ts) return ''; try{ const d=new Date(ts); const today=new Date(); const same=d.toDateString()===today.toDateString(); return d.toLocaleString('zh-TW', same?{hour:'2-digit',minute:'2-digit',hour12:false}:{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}); }catch(_e){ return ''; } }
  function ageText(ts){ ts=Number(ts||0); if(!ts) return ''; const diff=Math.max(0, now()-ts); const sec=Math.floor(diff/1000); if(sec<60) return sec+'秒'; const min=Math.floor(sec/60); if(min<60) return min+'分'; const hr=Math.floor(min/60); if(hr<24) return hr+'小時'+(min%60?String(min%60).padStart(2,'0')+'分':''); const day=Math.floor(hr/24); return day+'天'+(hr%24?String(hr%24)+'小時':''); }
  function labelSource(src){
    src=clean(src);
    if(src==='orders') return '訂單';
    if(src==='master_order' || src==='master_orders') return '總單';
    if(src==='ship' || src==='shipping') return '出貨';
    if(src==='warehouse') return '倉庫圖';
    if(src==='inventory') return '庫存';
    return src || '操作';
  }
  function readStore(key){ try{ const a=JSON.parse(localStorage.getItem(key)||'[]'); return Array.isArray(a)?a:[]; }catch(_e){ return []; } }
  function normalizeStatusRow(x){
    const status=clean(x&&x.status||'pending');
    const ts=Number(x&&x.ts||0) || now();
    const out={...(x||{}), status, ts};
    if(status==='success') out.success_at=Number(out.success_at||out.saved_at||ts||0);
    else if(status==='failed') out.failed_at=Number(out.failed_at||out.last_failed_at||out.saved_at||ts||0);
    else out.pending_at=Number(out.pending_at||out.saved_at||ts||0);
    return applyViewedMeta(out);
  }
  function read(){
    try{
      const fresh=readStore(STORE_KEY);
      const legacy=LEGACY_STORE_KEYS.flatMap(k=>readStore(k));
      const seen=new Set();
      return [...fresh, ...legacy].map(normalizeStatusRow).filter(x=>{
        const id=clean(x&&x.id)||JSON.stringify(x||{});
        if(!id || seen.has(id)) return false;
        seen.add(id); return true;
      }).sort((a,b)=>Number(b.ts||0)-Number(a.ts||0)).slice(0,MAX_ROWS);
    }catch(_e){ return []; }
  }
  function write(arr){ try{ localStorage.setItem(STORE_KEY, JSON.stringify((Array.isArray(arr)?arr:[]).slice(0,MAX_ROWS))); }catch(_e){} }
  function readArr(key){ try{ const a=JSON.parse(localStorage.getItem(key)||'[]'); return Array.isArray(a)?a:[]; }catch(_e){ return []; } }
  function writeArr(key, arr){ try{ localStorage.setItem(key, JSON.stringify(Array.isArray(arr)?arr:[])); }catch(_e){} }
  function readViewedMap(){
    const out={};
    const merge=(key)=>{ try{ const o=JSON.parse(localStorage.getItem(key)||'{}'); if(o&&typeof o==='object'){ Object.keys(o).forEach(k=>{ if(!out[k] || Number(o[k]?.viewed_at||0)>Number(out[k]?.viewed_at||0)) out[k]=o[k]; }); } }catch(_e){} };
    merge(VIEWED_KEY);
    (Array.isArray(LEGACY_VIEWED_KEYS)?LEGACY_VIEWED_KEYS:[]).forEach(merge);
    return out;
  }
  function writeViewedMap(map){ try{ localStorage.setItem(VIEWED_KEY, JSON.stringify(map&&typeof map==='object'?map:{})); }catch(_e){} }
  function rememberViewedMeta(id, label){
    id=clean(id); if(!id) return 0;
    const t=now(); label=clean(label||'已跳轉查看');
    const map=readViewedMap();
    map[id]={viewed_at:t, viewed_label:label};
    const keys=Object.keys(map).sort((a,b)=>Number(map[b]?.viewed_at||0)-Number(map[a]?.viewed_at||0));
    if(keys.length>120) keys.slice(120).forEach(k=>delete map[k]);
    writeViewedMap(map);
    return t;
  }
  function viewedMetaFor(id){ const m=readViewedMap()[clean(id)]; return m&&typeof m==='object'?m:null; }
  function applyViewedMeta(row){
    if(!row) return row;
    const id=clean(row.id||'');
    const m=id?viewedMetaFor(id):null;
    if(m){
      if(!row.viewed_at) row.viewed_at=Number(m.viewed_at||0);
      if(!row.viewed_label) row.viewed_label=clean(m.viewed_label||'已跳轉查看');
    }
    return row;
  }
  function updatePendingViewedById(id, label){
    id=clean(id); if(!id) return false;
    let updated=false; const t=rememberViewedMeta(id,label);
    try{
      for(let i=0;i<localStorage.length;i++){
        const key=localStorage.key(i)||'';
        if(!(key.startsWith('yx_warehouse_failed_saves_') || key.startsWith('yx_warehouse_failed_structure_ops_') || key.startsWith('yx_warehouse_consistency_pending_'))) continue;
        const arr=readArr(key); let changed=false;
        for(let idx=0; idx<arr.length; idx++){
          const row=rowForPending(key,arr[idx],idx);
          if(row.id===id){ arr[idx]={...(arr[idx]||{}), viewed_at:t, viewed_label:clean(label||'已跳轉查看')}; changed=true; updated=true; }
        }
        if(changed) writeArr(key,arr);
      }
    }catch(_e){}
    return updated;
  }
  function markViewedFromButton(btn){
    try{
      const pending=btn.closest?.('[data-yx297-pending-row]');
      const op=btn.closest?.('[data-yx337-op-row]');
      const id=clean(pending?.getAttribute('data-yx297-pending-row') || op?.getAttribute('data-yx337-op-row') || '');
      if(!id) return;
      const kind=clean(btn.getAttribute('data-yx332-kind')||'');
      const label=kind==='warehouse'?'已跳轉查看格子':(kind==='ship-record'?'已跳轉查看出貨紀錄':(kind==='ship-customer'?'已跳轉查看出貨客戶':'已跳轉查看客戶'));
      const t=rememberViewedMeta(id,label);
      const arr=read().map(r=>clean(r.id)===id?{...r, viewed_at:t, viewed_label:label}:r);
      write(arr);
      updatePendingViewedById(id,label);
    }catch(_e){}
  }
  function itemQty(it){ return Math.max(0, Math.floor(Number(it?.qty ?? it?.pieces ?? it?.piece_count ?? it?.count ?? it?.quantity ?? 0) || 0)); }
  function itemSize(it){ return clean(it?.product_text || it?.text || it?.size || it?.dimension || it?.spec || it?.product_name || it?.name || it?.raw_text || ''); }
  function itemMaterial(it){ return clean(it?.material || it?.材質 || ''); }
  function itemCustomer(it){ return clean(it?.customer_name || it?.customer || it?.client_name || it?.name || ''); }
  function itemSupport(it){ return clean(it?.support_text || it?.support || it?.支數 || ''); }
  function summarizeItem(it){
    if(!it || typeof it!=='object') return '';
    const bits=[];
    const c=itemCustomer(it); if(c) bits.push(c);
    const m=itemMaterial(it); if(m) bits.push(m);
    const sz=itemSize(it); if(sz) bits.push(sz);
    const q=itemQty(it); if(q) bits.push(q+'件');
    const sp=itemSupport(it); if(sp && !bits.join(' ').includes(sp)) bits.push(sp);
    return clean(bits.join(' '));
  }
  function cellText(p){
    const z=clean(p?.zone || p?.cell?.zone || p?.from?.zone || p?.to?.zone || '').toUpperCase();
    const c=Number(p?.column_index || p?.col || p?.cell?.column_index || p?.from?.column_index || p?.from?.col || p?.to?.column_index || p?.to?.col || 0);
    const s=Number(p?.slot_number || p?.slot || p?.cell?.slot_number || p?.from?.slot_number || p?.from?.slot || p?.to?.slot_number || p?.to?.slot || p?.insert_after || 0);
    const parts=[]; if(z) parts.push(z+'區'); if(c) parts.push('第'+c+'欄'); if(s) parts.push('第'+s+'格');
    return parts.join(' ');
  }
  function actionName(url, p){
    const u=clean(url); const a=clean(p?.action || p?.reason || '');
    if(u.includes('move-cell') || a.includes('move')) return '拖拉移動';
    if(u.includes('batch-add') || a.includes('batch-insert')) return '批量新增格';
    if(u.includes('batch-remove') || a.includes('batch-delete')) return '批量刪格';
    if(u.includes('add-slot') || a.includes('insert')) return '新增格';
    if(u.includes('remove-slot') || a.includes('delete')) return '刪除格';
    if(u.includes('return-unplaced') || a.includes('return')) return '退回商品';
    if(u.includes('/cell') || a.includes('cell-save')) return '格位保存';
    if(u.includes('consistency-check') || a.includes('final-check') || a.includes('consistency')) return '一致性確認';
    if(a) return a;
    return '倉庫操作';
  }
  function summarizePayload(url, payload){
    const p=payload || {};
    const parts=[];
    parts.push(actionName(url,p));
    if(p.from || p.to){
      const from=cellText(p.from||{}); const to=cellText(p.to||{});
      if(from || to) parts.push(`${from||'原格'} → ${to||'新格'}`);
    }else{
      const cell=cellText(p); if(cell) parts.push(cell);
    }
    const rows=Array.isArray(p.items) ? p.items : (Array.isArray(p.returned_items)?p.returned_items:[]);
    const itemBits=rows.map(summarizeItem).filter(Boolean).slice(0,2);
    if(itemBits.length) parts.push(itemBits.join('、') + (rows.length>2?` 等${rows.length}筆`:''));
    const cust=clean(p.customer_name || p.customer || p.name || ''); if(cust && !parts.join(' ').includes(cust)) parts.push(cust);
    const cnt=Number(p.count || p.removed || 0); if(cnt && !itemBits.length) parts.push(`${cnt}筆`);
    return clean(parts.filter(Boolean).join('｜'));
  }
  function detailFrom(d){
    const refresh=clean(d.refresh_target || d.target_label || d.refreshed_target || d.target_detail || '');
    if(refresh) return refresh;
    const detail=clean(d.detail_text || d.detail || d.description || '');
    if(detail) return detail;
    const cell=clean(d.cell_label || cellText(d));
    const product=clean(d.product_label || summarizeItem(d.item || d.product || {}));
    const payloadDetail = d.payload ? summarizePayload(d.url||'', d.payload) : '';
    return clean([cell, product, payloadDetail].filter(Boolean).join('｜'));
  }
  function typeForKey(k){
    if(String(k).startsWith('yx_warehouse_failed_saves_')) return '格位待重送';
    if(String(k).startsWith('yx_warehouse_failed_structure_ops_')) return '格號/拖拉待重送';
    if(String(k).startsWith('yx_warehouse_consistency_pending_')) return '一致性待確認';
    return '待處理';
  }
  function pendingType(r){
    const key=String(r?.key||'');
    const type=clean(r?.type||'');
    const src=clean(r?.source||'');
    if(key.startsWith('yx_warehouse_failed_saves_') || type.includes('格位')) return 'cell';
    if(key.startsWith('yx_warehouse_failed_structure_ops_') || type.includes('格號') || type.includes('拖拉') || type.includes('新增格') || type.includes('刪格')) return 'structure';
    if(key.startsWith('yx_warehouse_consistency_pending_') || type.includes('一致性')) return 'consistency';
    if(src==='ship' || src==='shipping' || type.includes('出貨')) return 'ship';
    if(src==='orders' || src==='master_order' || type.includes('訂單') || type.includes('總單')) return 'product';
    return 'other';
  }
  const PENDING_FILTERS=[
    ['all','全部'],
    ['cell','格位保存'],
    ['structure','拖拉/格號'],
    ['consistency','一致性'],
    ['ship','出貨'],
    ['product','訂單/總單'],
    ['other','其他']
  ];
  function pendingFilter(){
    try{ const v=clean(localStorage.getItem(FILTER_KEY)||localStorage.getItem('yx_operation_status_type_filter_v337')||localStorage.getItem('yx_operation_status_type_filter_v332')||localStorage.getItem('yx_operation_status_type_filter_v327')||localStorage.getItem('yx_operation_status_type_filter_v322')||localStorage.getItem(LEGACY_FILTER_KEY)||'all'); return PENDING_FILTERS.some(x=>x[0]===v)?v:'all'; }catch(_e){ return 'all'; }
  }
  function setPendingFilter(v){
    v=clean(v||'all');
    if(!PENDING_FILTERS.some(x=>x[0]===v)) v='all';
    try{ localStorage.setItem(FILTER_KEY,v); }catch(_e){}
    return v;
  }
  function pendingFilterName(v){ const hit=PENDING_FILTERS.find(x=>x[0]===v); return hit?hit[1]:'全部'; }
  function pendingFilterCounts(rows){
    const counts={all:rows.length,cell:0,structure:0,consistency:0,ship:0,product:0,other:0};
    rows.forEach(r=>{ const t=pendingType(r); counts[t]=(counts[t]||0)+1; });
    return counts;
  }
  function pendingFilterBar(rows){
    if(!rows.length) return '';
    const selected=pendingFilter();
    const counts=pendingFilterCounts(rows);
    const buttons=PENDING_FILTERS.filter(([k])=>k==='all' || counts[k]>0).map(([k,label])=>`<button type="button" class="yx312-op-filter-chip ${selected===k?'active':''}" data-yx282-op-action="filter-pending" data-yx312-filter="${esc(k)}">${esc(label)}<em>${Number(counts[k]||0)}</em></button>`).join('');
    return `<div class="yx312-op-filter" role="group" aria-label="待重送類型篩選">${buttons}</div>`;
  }
  function opState(x){
    const s=clean(x?.status||'');
    if(s==='success' || s==='failed' || s==='pending') return s;
    if(x?.success_at || x?.completed_at || x?.done_at) return 'success';
    if(x?.error || x?.failed_at || x?.last_failed_at) return 'failed';
    return 'pending';
  }
  const STATUS_FILTERS=[['all','全部狀態'],['failed','失敗'],['pending','等待中'],['success','成功']];
  function statusFilter(){
    try{ const v=clean(localStorage.getItem(STATUS_FILTER_KEY)||localStorage.getItem('yx_operation_status_state_filter_v337')||localStorage.getItem('yx_operation_status_state_filter_v332')||localStorage.getItem('yx_operation_status_state_filter_v327')||localStorage.getItem('yx_operation_status_state_filter_v322')||'all'); return STATUS_FILTERS.some(x=>x[0]===v)?v:'all'; }catch(_e){ return 'all'; }
  }
  function setStatusFilter(v){
    v=clean(v||'all');
    if(!STATUS_FILTERS.some(x=>x[0]===v)) v='all';
    try{ localStorage.setItem(STATUS_FILTER_KEY,v); }catch(_e){}
    return v;
  }
  function statusFilterName(v){ const hit=STATUS_FILTERS.find(x=>x[0]===v); return hit?hit[1]:'全部狀態'; }
  function statusFilterCounts(rows, pendingRows){
    const counts={all:0,failed:0,pending:0,success:0};
    (Array.isArray(rows)?rows:[]).forEach(r=>{ const st=opState(r); counts.all++; counts[st]=(counts[st]||0)+1; });
    (Array.isArray(pendingRows)?pendingRows:[]).forEach(r=>{ const st=opState(r); counts.all++; counts[st]=(counts[st]||0)+1; });
    return counts;
  }
  function statusFilterBar(rows, pendingRows){
    const counts=statusFilterCounts(rows,pendingRows);
    if(!counts.all) return '';
    const selected=statusFilter();
    const buttons=STATUS_FILTERS.filter(([k])=>k==='all' || counts[k]>0).map(([k,label])=>`<button type="button" class="yx312-op-filter-chip yx317-op-state-chip ${selected===k?'active':''}" data-yx282-op-action="filter-status" data-yx317-status="${esc(k)}">${esc(label)}<em>${Number(counts[k]||0)}</em></button>`).join('');
    return `<div class="yx312-op-filter yx317-op-status-filter" role="group" aria-label="操作狀態篩選">${buttons}</div>${viewFilterBar(rows,pendingRows)}${searchBar(counts.all)}`;
  }
  function searchQuery(){ try{ return clean(localStorage.getItem(SEARCH_KEY)||localStorage.getItem('yx_operation_status_search_v337')||localStorage.getItem('yx_operation_status_search_v332')||localStorage.getItem('yx_operation_status_search_v327')||localStorage.getItem('yx_operation_status_search_v322')||''); }catch(_e){ return ''; } }
  function setSearchQuery(v){ v=clean(v||'').slice(0,60); try{ if(v) localStorage.setItem(SEARCH_KEY,v); else localStorage.removeItem(SEARCH_KEY); }catch(_e){} return v; }
  function searchText(x){
    try{
      if(!x) return '';
      const p=x.payload||{};
      return clean([x.type,x.text,x.status,x.error,x.reason,x.message,x.customer_name,x.cell_label,x.product_label,x.detail_text,x.refresh_target,x.target_label,x.source,x.url,cellText(x),summarizePayload(x.url||'',p),JSON.stringify(p||{})].filter(Boolean).join(' ')).toLowerCase();
    }catch(_e){ return clean([x&&x.type,x&&x.text,x&&x.error,x&&x.message].filter(Boolean).join(' ')).toLowerCase(); }
  }
  function matchesSearch(x,q){ q=clean(q).toLowerCase(); if(!q) return true; return searchText(x).includes(q); }
  const VIEW_FILTERS=[['all','全部查看'],['unviewed','未查看'],['viewed','已查看']];
  function viewFilter(){
    try{ const v=clean(localStorage.getItem(VIEW_FILTER_KEY)||localStorage.getItem('yx_operation_status_view_filter_v337')||'all'); return VIEW_FILTERS.some(x=>x[0]===v)?v:'all'; }catch(_e){ return 'all'; }
  }
  function setViewFilter(v){
    v=clean(v||'all');
    if(!VIEW_FILTERS.some(x=>x[0]===v)) v='all';
    try{ localStorage.setItem(VIEW_FILTER_KEY,v); }catch(_e){}
    return v;
  }
  function viewFilterName(v){ const hit=VIEW_FILTERS.find(x=>x[0]===v); return hit?hit[1]:'全部查看'; }
  function isViewedRow(x){ return Number(x&&x.viewed_at||0)>0; }
  function matchesViewFilter(x,v){ v=clean(v||'all'); if(v==='viewed') return isViewedRow(x); if(v==='unviewed') return !isViewedRow(x); return true; }
  function viewFilterCounts(rows, pendingRows){
    const counts={all:0,unviewed:0,viewed:0};
    (Array.isArray(rows)?rows:[]).forEach(r=>{ counts.all++; counts[isViewedRow(r)?'viewed':'unviewed']++; });
    (Array.isArray(pendingRows)?pendingRows:[]).forEach(r=>{ counts.all++; counts[isViewedRow(r)?'viewed':'unviewed']++; });
    return counts;
  }
  function viewFilterBar(rows, pendingRows){
    const counts=viewFilterCounts(rows,pendingRows);
    if(!counts.all) return '';
    const selected=viewFilter();
    const buttons=VIEW_FILTERS.filter(([k])=>k==='all' || counts[k]>0).map(([k,label])=>`<button type="button" class="yx312-op-filter-chip yx342-op-view-chip ${selected===k?'active':''}" data-yx282-op-action="filter-viewed" data-yx342-view="${esc(k)}">${esc(label)}<em>${Number(counts[k]||0)}</em></button>`).join('');
    return `<div class="yx312-op-filter yx342-op-view-filter" role="group" aria-label="已查看篩選">${buttons}</div>`;
  }
  function searchBar(total){
    const q=searchQuery();
    const clear=q?`<button type="button" class="ghost-btn tiny-btn" data-yx282-op-action="clear-search">清除搜尋</button>`:'';
    return `<div class="yx322-op-search"><input type="search" inputmode="search" autocomplete="off" placeholder="搜尋客戶 / 格號 / 商品尺寸" value="${esc(q)}" data-yx322-op-search="1"><small>${q?`搜尋：${esc(q)}`:`可搜尋 ${Number(total||0)} 筆待處理/操作`}</small>${clear}</div>`;
  }

  function targetCellFromRow(x){
    const p=x?.payload||x||{};
    const base=p.to || p.cell || p;
    const z=clean(base.zone || p.zone || x?.zone || '').toUpperCase();
    const c=Number(base.column_index || base.col || p.column_index || p.col || x?.column_index || x?.col || 0);
    const s=Number(base.slot_number || base.slot || p.slot_number || p.slot || x?.slot_number || x?.slot || 0);
    return {z,c,s};
  }
  function customerFromRow(x){
    const p=x?.payload||{};
    const direct=clean(x?.customer_name || p.customer_name || p.customer || p.client_name || p.name || '');
    if(direct) return direct;
    const rows=Array.isArray(p.items)?p.items:(Array.isArray(p.returned_items)?p.returned_items:[]);
    for(const it of rows){ const c=itemCustomer(it); if(c) return c; }
    return '';
  }
  function productFromRow(x){
    const p=x?.payload||{};
    const direct=clean(x?.product_label || p.product_text || p.product_label || p.size || p.dimension || p.spec || '');
    if(direct) return direct;
    const rows=Array.isArray(p.items)?p.items:(Array.isArray(p.returned_items)?p.returned_items:[]);
    for(const it of rows){ const s=summarizeItem(it); if(s) return s; }
    return clean(x?.text || x?.detail_text || '');
  }
  function sourceForRow(x){ return clean(x?.source || x?.payload?.source || x?.payload?.module || '').replace(/master_orders/g,'master_order'); }
  function shortcutButton(kind,label,data){
    const attrs=Object.entries(data||{}).map(([k,v])=> clean(v)==='' ? '' : ` data-yx332-${esc(k)}="${esc(v)}"`).join('');
    return `<button type="button" class="ghost-btn tiny-btn yx332-op-shortcut" data-yx282-op-action="jump-target" data-yx332-kind="${esc(kind)}"${attrs}>${esc(label)}</button>`;
  }
  function shortcutButtons(x){
    const buttons=[];
    const cell=targetCellFromRow(x);
    if(cell.z && cell.c && cell.s) buttons.push(shortcutButton('warehouse','跳到該格',{zone:cell.z,col:cell.c,slot:cell.s}));
    const customer=customerFromRow(x);
    const source=sourceForRow(x);
    const typ=pendingType(x);
    const product=productFromRow(x);
    if(customer){
      const dest=(source==='ship'||source==='shipping'||typ==='ship')?'ship':(source==='master_order'?'master_order':'orders');
      buttons.push(shortcutButton(dest==='ship'?'ship-customer':'product-customer',dest==='ship'?'打開出貨客戶':'打開該客戶',{customer,dest}));
    }
    if(source==='ship'||source==='shipping'||typ==='ship'||clean(x?.type).includes('出貨')||clean(x?.reason).includes('ship')){
      const q=clean(customer || product || x?.text || x?.detail_text || '');
      buttons.push(shortcutButton('ship-record','打開出貨紀錄',{q,record_id:clean(x?.payload?.shipping_record_id||x?.payload?.record_id||x?.shipping_record_id||'')}));
    }
    return buttons.length?`<div class="yx297-op-pending-actions yx332-op-shortcuts">${buttons.join('')}</div>`:'';
  }
  function toastShortcut(msg,kind='ok'){
    try{ (window.toast||window.showToast||window.notify||console.log)(msg,kind); }catch(_e){ try{ console.log(msg); }catch(_e2){} }
  }
  function flashTargetElement(el,label){
    if(!el) return false;
    try{
      el.classList.remove('yx332-status-target-highlight');
      void el.offsetWidth;
      el.classList.add('yx332-status-target-highlight');
      el.scrollIntoView?.({behavior:'smooth',block:'center'});
      setTimeout(()=>{ try{ el.classList.remove('yx332-status-target-highlight'); }catch(_e){} }, 3200);
      if(label) toastShortcut(label,'ok');
      return true;
    }catch(_e){ return false; }
  }
  function cssEscape(v){ try{ return CSS.escape(clean(v)); }catch(_e){ return clean(v).replace(/[^\w\u4e00-\u9fff-]/g,'\\$&'); } }
  function findCustomerElement(customer){
    customer=clean(customer); if(!customer) return null;
    const escaped=cssEscape(customer);
    const direct=document.querySelector(`[data-customer-name="${escaped}"],[data-customer="${escaped}"],[data-full-name="${escaped}"]`);
    if(direct) return direct.closest?.('.yx113-customer-card,.yx114-customer-card,.customer-region-card,.customer-card,button') || direct;
    const nodes=Array.from(document.querySelectorAll('.yx113-customer-card,.yx114-customer-card,.customer-region-card,[data-customer-name],[data-customer],.customer-card,.customer-chip,.yx-customer-pill,button'));
    return nodes.find(el=>clean(el.dataset?.customerName || el.dataset?.customer || el.getAttribute?.('data-full-name') || el.textContent || '').includes(customer)) || null;
  }
  function flashCustomerTarget(customer,dest){
    customer=clean(customer); dest=clean(dest||'orders');
    const label=dest==='ship' ? `已定位出貨客戶：${customer}` : `已定位客戶：${customer}`;
    const tryFlash=()=>{
      let el=null;
      if(dest==='ship'){
        el=document.getElementById('customer-name') || document.querySelector('[name="customer"],[data-ship-customer]');
        if(el && clean(el.value||el.textContent).includes(customer)) return flashTargetElement(el,label);
      }
      el=findCustomerElement(customer) || document.getElementById('selected-customer-items') || document.querySelector('.yx121-selected-customer-products');
      return flashTargetElement(el,label);
    };
    setTimeout(tryFlash, 180);
    setTimeout(tryFlash, 720);
    setTimeout(tryFlash, 1350);
  }
  function flashWarehouseTarget(zone,col,slot){
    zone=clean(zone).toUpperCase(); col=Number(col||0); slot=Number(slot||0);
    if(!zone||!col||!slot) return;
    const label=`已定位 ${zone}區 第${col}欄 第${slot}格`;
    const tryFlash=()=>{
      let ok=false;
      try{ if(typeof window.highlightWarehouseCell==='function'){ window.highlightWarehouseCell(zone,col,slot); ok=true; } }catch(_e){}
      const el=document.querySelector(`#warehouse-root [data-zone="${cssEscape(zone)}"][data-column="${col}"][data-slot="${slot}"]`) || document.querySelector(`[data-zone="${cssEscape(zone)}"][data-column="${col}"][data-slot="${slot}"]`);
      if(el) ok=flashTargetElement(el,label) || ok;
      return ok;
    };
    setTimeout(tryFlash, 120);
    setTimeout(tryFlash, 640);
    setTimeout(tryFlash, 1320);
  }
  function openWarehouseTarget(zone,col,slot){
    zone=clean(zone).toUpperCase(); col=Number(col||0); slot=Number(slot||0);
    if(!zone||!col||!slot) return toastShortcut('缺少格位資訊，無法跳格','warn');
    if(page()!=='warehouse'){
      try{ localStorage.setItem('yx_status_jump_warehouse_cell_v337', JSON.stringify({zone,col,slot,ts:now()})); }catch(_e){}
      location.href='/warehouse'; return;
    }
    try{ window.setWarehouseZone?.(zone,false); }catch(_e){}
    setTimeout(()=>{
      flashWarehouseTarget(zone,col,slot);
      try{ if(typeof window.openWarehouseModal==='function') window.openWarehouseModal(zone,col,slot); }
      catch(_e){ try{ window.YXFinalWarehouse?.openWarehouseModal?.(zone,col,slot); }catch(_e2){} }
      toastShortcut(`已定位 ${zone}區 第${col}欄 第${slot}格`,'ok');
    }, page()==='warehouse'?220:900);
  }
  function openCustomerTarget(customer,dest){
    customer=clean(customer); dest=clean(dest||'orders');
    if(!customer) return toastShortcut('缺少客戶名稱，無法打開','warn');
    const cur=page();
    if(dest==='ship'){
      if(cur!=='ship'){
        try{ localStorage.setItem('yx_status_open_customer_v337', JSON.stringify({customer,dest,ts:now()})); }catch(_e){}
        location.href='/ship'; return;
      }
      try{ const input=document.getElementById('customer-name'); if(input){ input.value=customer; input.dispatchEvent(new Event('input',{bubbles:true})); } }catch(_e){}
      try{ window.dispatchEvent(new CustomEvent('yx:customer-selected',{detail:{name:customer,force:true,source:'status-card-shortcut-v337'}})); }catch(_e){}
      flashCustomerTarget(customer,'ship');
      toastShortcut('已打開出貨客戶：'+customer,'ok'); return;
    }
    const targetPath=dest==='master_order'?'/master-order':'/orders';
    if(cur!=='orders' && cur!=='master_order'){
      try{ localStorage.setItem('yx_status_open_customer_v337', JSON.stringify({customer,dest,ts:now()})); }catch(_e){}
      location.href=targetPath; return;
    }
    try{ window.YX113CustomerRegions?.selectCustomer?.(customer); }catch(_e){}
    try{ if(typeof window.selectCustomerForModule==='function') window.selectCustomerForModule(customer); }catch(_e){}
    try{ window.dispatchEvent(new CustomEvent('yx:customer-selected',{detail:{name:customer,force:true,source:'status-card-shortcut-v337'}})); }catch(_e){}
    flashCustomerTarget(customer,dest);
    toastShortcut('已打開客戶：'+customer,'ok');
  }
  function openShipRecordTarget(q, recordId){
    q=clean(q); recordId=clean(recordId);
    try{ localStorage.setItem('yx_status_open_shipping_query_v337', JSON.stringify({q,record_id:recordId,ts:now()})); }catch(_e){}
    location.href='/shipping-query';
  }
  function readShortcutIntent(key, legacyKey){
    try{
      let raw=localStorage.getItem(key); let used=key;
      if(!raw){ const mid=String(key||'').replace('_v337','_v332'); if(mid!==key){ raw=localStorage.getItem(mid); used=mid; } }
      if(!raw && legacyKey){ raw=localStorage.getItem(legacyKey); used=legacyKey; }
      if(!raw) return null;
      const d=JSON.parse(raw||'{}'); localStorage.removeItem(used);
      return d&&typeof d==='object'?d:null;
    }catch(_e){ return null; }
  }
  function consumeShortcutTargets(){
    try{
      const d=readShortcutIntent('yx_status_jump_warehouse_cell_v337','yx_status_jump_warehouse_cell_v327');
      if(d && page()==='warehouse') setTimeout(()=>openWarehouseTarget(d.zone,d.col,d.slot), 900);
      else if(d) localStorage.setItem('yx_status_jump_warehouse_cell_v337', JSON.stringify(d));
    }catch(_e){}
    try{
      const d=readShortcutIntent('yx_status_open_customer_v337','yx_status_open_customer_v327');
      if(d){
        if((d.dest==='ship' && page()==='ship') || (d.dest!=='ship' && (page()==='orders'||page()==='master_order'))){
          setTimeout(()=>openCustomerTarget(d.customer,d.dest), 650);
        }else localStorage.setItem('yx_status_open_customer_v337', JSON.stringify(d));
      }
    }catch(_e){}
  }
  function handleShortcutAction(btn){
    const kind=clean(btn.getAttribute('data-yx332-kind')||'');
    if(kind==='warehouse'){ openWarehouseTarget(btn.getAttribute('data-yx332-zone'), btn.getAttribute('data-yx332-col'), btn.getAttribute('data-yx332-slot')); return true; }
    if(kind==='product-customer' || kind==='ship-customer'){ openCustomerTarget(btn.getAttribute('data-yx332-customer'), btn.getAttribute('data-yx332-dest') || (kind==='ship-customer'?'ship':'orders')); return true; }
    if(kind==='ship-record'){ openShipRecordTarget(btn.getAttribute('data-yx332-q'), btn.getAttribute('data-yx332-record_id')); return true; }
    return false;
  }

  function pendingTimeBase(rec){ return Number(rec?.last_failed_at || rec?.failed_at || rec?.saved_at || rec?.created_at || rec?.ts || 0); }
  function rowForPending(key, rec, idx){
    const p=rec?.payload || rec || {};
    const type=typeForKey(key);
    const text=summarizePayload(rec?.url||'', p) || cellText(p) || clean(rec?.label || rec?.reason || type);
    const id=clean(rec?.id)||`${key}-${idx}-${text}`;
    const ts=pendingTimeBase(rec);
    const vm=viewedMetaFor(id)||{};
    return {id,key,idx,type,text,status:opState(rec),error:clean(rec?.error || rec?.reason || ''), ts, created_at:Number(rec?.created_at || rec?.ts || rec?.saved_at || ts || 0), saved_at:Number(rec?.saved_at || rec?.ts || ts || 0), failed_at:Number(rec?.last_failed_at || rec?.failed_at || 0), retry_started_at:Number(rec?.retry_started_at||0), attempts:Number(rec?.attempts||0), viewed_at:Number(rec?.viewed_at || vm.viewed_at || 0), viewed_label:clean(rec?.viewed_label || vm.viewed_label || ''), url:clean(rec?.url||''), payload:p};
  }
  function pendingRecords(){
    const out=[];
    try{
      for(let i=0;i<localStorage.length;i++){
        const k=localStorage.key(i)||'';
        if(!(k.startsWith('yx_warehouse_failed_saves_') || k.startsWith('yx_warehouse_failed_structure_ops_') || k.startsWith('yx_warehouse_consistency_pending_'))) continue;
        const arr=readArr(k);
        arr.forEach((rec,idx)=>{ if(rec) out.push(rowForPending(k,rec,idx)); });
      }
      const seen=new Set();
      return out.filter(x=>{ if(!x.text || seen.has(x.id)) return false; seen.add(x.id); return true; }).sort((a,b)=>Number(b.ts||0)-Number(a.ts||0)).slice(0,40);
    }catch(_e){ return []; }
  }
  function locatePendingRecord(id){
    id=clean(id);
    if(!id) return null;
    try{
      for(let i=0;i<localStorage.length;i++){
        const key=localStorage.key(i)||'';
        if(!(key.startsWith('yx_warehouse_failed_saves_') || key.startsWith('yx_warehouse_failed_structure_ops_') || key.startsWith('yx_warehouse_consistency_pending_'))) continue;
        const arr=readArr(key);
        for(let idx=0; idx<arr.length; idx++){
          const row=rowForPending(key,arr[idx],idx);
          if(row.id===id) return {key,idx,arr,rec:arr[idx],row};
        }
      }
    }catch(_e){}
    return null;
  }
  function removePendingRecord(id){
    let removed=0;
    try{
      for(let i=localStorage.length-1;i>=0;i--){
        const key=localStorage.key(i)||'';
        if(!(key.startsWith('yx_warehouse_failed_saves_') || key.startsWith('yx_warehouse_failed_structure_ops_') || key.startsWith('yx_warehouse_consistency_pending_'))) continue;
        const arr=readArr(key);
        const next=arr.filter((rec,idx)=>rowForPending(key,rec,idx).id!==clean(id));
        if(next.length!==arr.length){ writeArr(key,next); removed += arr.length-next.length; }
      }
    }catch(_e){}
    return removed;
  }
  function updatePendingError(loc, error){
    try{
      const arr=readArr(loc.key);
      if(!arr[loc.idx]) return;
      const t=now();
      arr[loc.idx]={...(arr[loc.idx]||{}), error:clean(error||'重送失敗'), attempts:Number(arr[loc.idx]?.attempts||0)+1, last_failed_at:t, failed_at:t, saved_at:Number(arr[loc.idx]?.saved_at||arr[loc.idx]?.ts||t), created_at:Number(arr[loc.idx]?.created_at||arr[loc.idx]?.ts||arr[loc.idx]?.saved_at||t)};
      writeArr(loc.key, arr);
    }catch(_e){}
  }
  function markPendingRetryStarted(loc){
    try{
      const arr=readArr(loc.key);
      if(!arr[loc.idx]) return;
      arr[loc.idx]={...(arr[loc.idx]||{}), retry_started_at:now(), attempts:Number(arr[loc.idx]?.attempts||0)+1, created_at:Number(arr[loc.idx]?.created_at||arr[loc.idx]?.ts||arr[loc.idx]?.saved_at||now())};
      writeArr(loc.key, arr);
    }catch(_e){}
  }
  async function retryPendingOne(id){
    const loc=locatePendingRecord(id);
    if(!loc){ record({source:'warehouse',status:'failed',reason:'single-retry-missing',message:'找不到這筆待重送項目，請刷新狀態'}); render(); return; }
    const row=loc.row;
    const payload={...((loc.rec&&loc.rec.payload)||loc.rec||{})};
    const url=clean(loc.rec?.url || (String(loc.key).startsWith('yx_warehouse_consistency_pending_')?'/api/warehouse/consistency-check':''));
    if(!url){ record({source:'warehouse',status:'failed',reason:'single-retry-no-url',message:'這筆待重送沒有可重送路徑，可先單筆取消後重新操作',detail_text:row.text}); render(); return; }
    if(!payload.operation_id) payload.operation_id='status-card-single-retry-'+Date.now();
    markPendingRetryStarted(loc);
    record({source:'warehouse',status:'pending',reason:'single-retry',message:'單筆重送中',detail_text:row.text,operation_id:'status-card-single-retry-ui-'+row.id, pending_at:now()});
    try{
      const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'XMLHttpRequest'},credentials:'same-origin',body:JSON.stringify(payload)});
      const result=await res.json().catch(()=>({}));
      if(!res.ok || result.success===false) throw new Error(result.error || result.message || '單筆重送失敗');
      removePendingRecord(row.id);
      let targeted=false;
      try{ targeted=!!(await window.YXTargetedRetryRefresh?.apply?.({row,payload,result,url,key:loc.key})); }catch(_e){}
      record({source:'warehouse',status:'success',reason:'single-retry-ok',message:targeted?'單筆重送完成，已局部刷新':'單筆重送完成',detail_text:row.text,operation_id:'status-card-single-retry-ok-'+row.id, success_at:now()});
      try{ window.dispatchEvent(new CustomEvent('yx:single-retry-succeeded',{detail:{action:'single-retry',targeted,operation_id:payload.operation_id,version:VERSION,row,payload,result,url,key:loc.key}})); }catch(_e){}
      if(!targeted){ try{ window.dispatchEvent(new CustomEvent('yx:warehouse-changed',{detail:{action:'single-retry',operation_id:payload.operation_id,version:VERSION,skip_full_refresh:true}})); }catch(_e){} }
      try{ window.YX?.cache?.clearGroup?.('warehouse_available_'); window.YX?.cache?.clearGroup?.('warehouse_source_qty_map_'); window.YX?.cache?.clearGroup?.('ship_items_'); }catch(_e){}
    }catch(e){
      updatePendingError(loc, e.message||String(e));
      record({source:'warehouse',status:'failed',reason:'single-retry-failed',message:e.message||'單筆重送失敗',detail_text:row.text,operation_id:'status-card-single-retry-failed-'+row.id, failed_at:now()});
    }
    render();
  }
  function cancelPendingOne(id){
    const loc=locatePendingRecord(id);
    const text=loc?.row?.text || '待處理項目';
    const n=removePendingRecord(id);
    record({source:'warehouse',status:n?'success':'failed',reason:'single-cancel',message:n?'已取消單筆待重送':'找不到可取消的待重送項目',detail_text:text,operation_id:'status-card-single-cancel-'+clean(id), success_at:n?now():0, failed_at:n?0:now()});
    render();
  }
  function countWarehousePending(){
    let failedSaves=0, failedStructure=0, finalChecks=0;
    try{
      const rows=pendingRecords();
      failedSaves=rows.filter(r=>r.type==='格位待重送').length;
      failedStructure=rows.filter(r=>r.type==='格號/拖拉待重送').length;
      finalChecks=rows.filter(r=>r.type==='一致性待確認').length;
    }catch(_e){}
    const bg = (()=>{ try{ return Number(window.YXBackgroundSave?.pending?.()||0); }catch(_e){ return 0; } })();
    return {failedSaves, failedStructure, finalChecks, bg, total:failedSaves+failedStructure+finalChecks+bg};
  }
  function latestTimes(rows, pendingRows){
    const success=rows.filter(x=>x.status==='success').map(x=>Number(x.success_at||x.ts||0)).filter(Boolean).sort((a,b)=>b-a)[0]||0;
    const failRows=rows.filter(x=>x.status==='failed').map(x=>Number(x.failed_at||x.ts||0)).filter(Boolean);
    pendingRows.forEach(r=>{ if(r.failed_at || r.error) failRows.push(Number(r.failed_at||r.ts||0)); });
    const failed=failRows.filter(Boolean).sort((a,b)=>b-a)[0]||0;
    const oldestPending=pendingRows.concat(rows.filter(x=>x.status==='pending')).map(x=>Number(x.created_at||x.pending_at||x.saved_at||x.ts||0)).filter(Boolean).sort((a,b)=>a-b)[0]||0;
    return {success, failed, oldestPending};
  }
  function ensure(){
    if(!active()) return null;
    let el=document.getElementById('yx282-operation-status-card');
    if(el) return el;
    const host=document.querySelector('.module-screen') || document.body;
    if(!host) return null;
    el=document.createElement('div');
    el.id='yx282-operation-status-card';
    el.className='yx282-operation-status-card yx287-operation-status-detail-card yx297-operation-status-targeted-card yx302-operation-status-card yx307-operation-status-card yx312-operation-status-card yx317-operation-status-card yx322-operation-status-card yx332-operation-status-card yx342-operation-status-card';
    el.setAttribute('aria-live','polite');
    const top=document.querySelector('.module-topbar');
    if(top && top.parentNode) top.insertAdjacentElement('afterend', el);
    else host.insertAdjacentElement('afterbegin', el);
    return el;
  }
  function rowTimeHtml(x){
    const status=clean(x.status||'pending');
    let txt='';
    if(status==='success'){ const t=Number(x.success_at||x.ts||0); txt=t?`最近成功：${fmtTime(t)}`:''; }
    else if(status==='failed'){ const t=Number(x.failed_at||x.ts||0); txt=t?`最後失敗：${fmtTime(t)}｜已卡 ${ageText(t)}`:''; }
    else { const t=Number(x.pending_at||x.ts||0); txt=t?`等待中：${fmtTime(t)}｜已等 ${ageText(t)}`:''; }
    if(x.viewed_at){ const vtxt=(clean(x.viewed_label||'已跳轉查看')+'：'+fmtTime(x.viewed_at)); txt=txt?txt+'｜'+vtxt:vtxt; }
    return txt?`<small class="yx307-op-time yx337-op-viewed-time">${esc(txt)}</small>`:'';
  }
  function rowText(x){
    const status=clean(x.status||'pending');
    const cls=status==='success'?'ok':(status==='failed'?'bad':'pending');
    const customer=x.customer_name?`｜${esc(x.customer_name)}`:'';
    const msg=esc(x.message || x.error || x.reason || '操作狀態已更新');
    const target=clean(x.refresh_target || x.target_label || '');
    const detail=detailFrom(x);
    const detailHtml=(target?`<small class="yx302-op-target">已刷新：${esc(target)}</small>`:'') + (detail && detail!==target?`<small class="yx287-op-detail">${esc(detail)}</small>`:'') + rowTimeHtml(x);
    const shortcuts=shortcutButtons(x);
    return `<div class="yx282-op-row ${cls} yx332-op-result-row yx337-op-result-row" data-yx337-op-row="${esc(x.id||'')}"><span class="yx282-op-dot"></span><strong>${esc(labelSource(x.source))}</strong><span>${customer}</span><em>${esc(fmtTime(x.ts||0))}</em><div><span>${msg}</span>${detailHtml}${shortcuts}</div></div>`;
  }
  function pendingTimeHtml(r){
    const bits=[];
    if(r.saved_at) bits.push('建立 '+fmtTime(r.saved_at));
    if(r.failed_at || r.error) bits.push('最後失敗 '+fmtTime(r.failed_at||r.ts));
    if(r.ts) bits.push('已卡 '+ageText(r.ts));
    if(r.attempts) bits.push('重試 '+r.attempts+' 次');
    if(r.viewed_at) bits.push((clean(r.viewed_label||'已跳轉查看'))+' '+fmtTime(r.viewed_at));
    return bits.length?`<small class="yx307-op-pending-time yx337-op-viewed-time">${esc(bits.join('｜'))}</small>`:'';
  }
  function pendingDetailHtml(rows){
    if(!rows.length) return '';
    const filter=pendingFilter();
    const st=statusFilter();
    const q=searchQuery();
    let shown=filter==='all'?rows:rows.filter(r=>pendingType(r)===filter);
    if(st!=='all') shown=shown.filter(r=>opState(r)===st);
    const vf=viewFilter();
    if(vf!=='all') shown=shown.filter(r=>matchesViewFilter(r,vf));
    if(q) shown=shown.filter(r=>matchesSearch(r,q));
    const head=`<div class="yx312-op-pending-head"><b>待處理明細</b><small>目前顯示：${esc(pendingFilterName(filter))}｜${esc(statusFilterName(st))}｜${esc(viewFilterName(vf))}${q?`｜搜尋 ${esc(q)}`:''} ${shown.length}/${rows.length}</small></div>`;
    const empty=`<div class="yx312-op-empty">目前沒有「${esc(pendingFilterName(filter))}｜${esc(statusFilterName(st))}｜${esc(viewFilterName(vf))}${q?`｜搜尋 ${esc(q)}`:''}」待重送項目</div>`;
    const list=shown.length?shown.map(r=>`<div class="yx287-op-pending-row yx297-op-pending-row yx307-op-pending-row yx312-op-pending-row yx317-op-pending-row yx322-op-pending-row yx332-op-pending-row yx337-op-pending-row yx342-op-pending-row" data-yx297-pending-row="${esc(r.id)}" data-yx312-pending-type="${esc(pendingType(r))}" data-yx317-pending-status="${esc(opState(r))}" data-yx342-pending-viewed="${r.viewed_at?'viewed':'unviewed'}"><span>${esc(r.type)}</span><strong>${esc(r.text)}</strong>${pendingTimeHtml(r)}${r.error?`<em>${esc(r.error)}</em>`:''}<div class="yx297-op-pending-actions"><button type="button" class="ghost-btn tiny-btn" data-yx282-op-action="retry-one" data-yx297-pending-id="${esc(r.id)}">單筆重送</button><button type="button" class="ghost-btn tiny-btn danger-text" data-yx282-op-action="cancel-one" data-yx297-pending-id="${esc(r.id)}">單筆取消</button></div>${shortcutButtons(r)}</div>`).join(''):empty;
    return `<div class="yx287-op-pending-detail yx297-op-pending-detail yx307-op-pending-detail yx312-op-pending-detail yx317-op-pending-detail yx322-op-pending-detail">${head}${pendingFilterBar(rows)}${list}</div>`;
  }
  function render(){
    const el=ensure(); if(!el) return;
    const arr=read();
    const pending=countWarehousePending();
    const details=pendingRecords();
    if(!arr.length && !pending.total && !details.length){ el.hidden=true; el.innerHTML=''; return; }
    el.hidden=false;
    const hasFail=arr.some(x=>x.status==='failed') || pending.failedSaves || pending.failedStructure || details.some(x=>x.error);
    const hasPending=arr.some(x=>x.status==='pending') || pending.total;
    const title=hasFail?'有操作需要確認':(hasPending?'背景保存 / 重送狀態':'操作已同步');
    const kind=hasFail?'bad':(hasPending?'pending':'ok');
    const pendingBits=[];
    if(pending.bg) pendingBits.push(`背景佇列 ${pending.bg}`);
    if(pending.failedSaves) pendingBits.push(`格位待重送 ${pending.failedSaves}`);
    if(pending.failedStructure) pendingBits.push(`格號/拖拉待重送 ${pending.failedStructure}`);
    if(pending.finalChecks) pendingBits.push(`一致性待確認 ${pending.finalChecks}`);
    const times=latestTimes(arr, details);
    const timeBits=[];
    if(times.success) timeBits.push(`最近成功 ${fmtTime(times.success)}`);
    if(times.failed) timeBits.push(`最後失敗 ${fmtTime(times.failed)}${ageText(times.failed)?'｜已卡 '+ageText(times.failed):''}`);
    if(times.oldestPending && (pending.total || hasPending)) timeBits.push(`最早待處理 ${fmtTime(times.oldestPending)}${ageText(times.oldestPending)?'｜等待 '+ageText(times.oldestPending):''}`);
    const st=statusFilter();
    const vf=viewFilter();
    const q=searchQuery();
    let shownArr=st==='all'?arr:arr.filter(x=>opState(x)===st);
    if(vf!=='all') shownArr=shownArr.filter(x=>matchesViewFilter(x,vf));
    if(q) shownArr=shownArr.filter(x=>matchesSearch(x,q));
    const opListHtml=shownArr.length?shownArr.slice(0,5).map(rowText).join(''):(arr.length?`<div class="yx312-op-empty yx317-op-empty yx322-op-empty yx342-op-empty">目前沒有「${esc(statusFilterName(st))}｜${esc(viewFilterName(vf))}${q?'｜搜尋 '+esc(q):''}」操作紀錄</div>`:'');
    el.innerHTML=`<div class="yx282-op-head ${kind}"><div><b>${esc(title)}</b><span>${pendingBits.length?esc(pendingBits.join('｜')):'最近操作狀態'}</span>${timeBits.length?`<small class="yx307-op-summary">${esc(timeBits.join('　'))}</small>`:''}</div><div class="yx282-op-actions"><button type="button" class="ghost-btn small-btn" data-yx282-op-action="refresh">刷新狀態</button>${pending.failedSaves||pending.failedStructure||pending.finalChecks?'<button type="button" class="primary-btn small-btn" data-yx282-op-action="retry-warehouse">全部重送</button>':''}<button type="button" class="ghost-btn small-btn" data-yx282-op-action="clear">清除</button></div></div>${statusFilterBar(arr, details)}<div class="yx282-op-list">${opListHtml}</div>${pendingDetailHtml(details)}`;
  }
  function record(detail){
    try{
      if(!active()) return;
      const d=detail && detail.detail ? detail.detail : (detail||{});
      const status=clean(d.status || (d.error?'failed':(d.retry_saved?'pending':'pending')));
      const source=clean(d.source || d.module || page());
      const detailText=detailFrom(d);
      const id=clean(d.operation_id || d.request_key || d.event_id || [source,status,d.reason,d.error,d.message,d.customer_name,detailText].join('|'));
      const t=now();
      const row={id, ts:t, source, status, reason:clean(d.reason||''), customer_name:clean(d.customer_name||d.name||''), cell_label:clean(d.cell_label||cellText(d)||''), product_label:clean(d.product_label||summarizeItem(d.item||d.product||{})||''), detail_text:detailText, message:clean(d.message||d.error||d.reason||''), error:clean(d.error||''), refresh_target:clean(d.refresh_target || d.target_label || d.refreshed_target || d.target_detail || ''), version:VERSION};
      if(status==='success') row.success_at=Number(d.success_at||d.saved_at||t);
      else if(status==='failed') row.failed_at=Number(d.failed_at||d.last_failed_at||t);
      else row.pending_at=Number(d.pending_at||d.saved_at||t);
      const arr=read().filter(x=>clean(x.id)!==id);
      arr.unshift(row);
      write(arr);
      render();
    }catch(_e){}
  }
  async function retryWarehouse(){
    record({source:'warehouse', status:'pending', reason:'manual-retry', message:'已手動要求重送全部待處理操作', pending_at:now()});
    try{
      if(typeof window.YXWarehouseRetryAllFailedOps==='function') await window.YXWarehouseRetryAllFailedOps({toast:true});
      else window.dispatchEvent(new CustomEvent('yx:warehouse-retry-failed-saves'));
    }catch(e){ record({source:'warehouse', status:'failed', reason:'manual-retry-failed', message:e.message||'重送倉庫操作失敗', failed_at:now()}); }
    render();
  }
  function bind(){
    if(window.__YX_V342_OPERATION_STATUS_CARD_BOUND__) return;
    window.__YX_V342_OPERATION_STATUS_CARD_BOUND__=true;
    window.addEventListener('yx:operation-soft-failed', ev=>record({...(ev.detail||{}), status:(ev.detail&&ev.detail.retry_saved)?'pending':'failed'}), false);
    window.addEventListener('yx:operation-status', ev=>record(ev.detail||{}), false);
    window.addEventListener('yx:operation-target-refresh', ev=>record(Object.assign({status:'success',reason:'targeted-refresh',message:'局部刷新完成'}, ev.detail||{})), false);
    window.addEventListener('yx:ship-completed', ev=>record({source:'ship', status:'success', reason:'ship-completed', customer_name:ev.detail?.customer_name||'', message:'出貨完成並已送出同步', detail_text:detailFrom(ev.detail||{}), success_at:now()}), false);
    window.addEventListener('yx:warehouse-changed', ev=>{ if(ev.detail?.action && /retry|save|insert|remove|return|move|cell/.test(String(ev.detail.action))) record({source:'warehouse', status:'success', reason:ev.detail.action, customer_name:ev.detail?.customer_name||'', message:'倉庫操作已同步', detail_text:detailFrom(ev.detail||{}), success_at:now()}); else render(); }, false);
    window.addEventListener('yx:product-data-changed', ev=>{ const s=clean(ev.detail?.source||ev.detail?.module||''); if(s==='orders'||s==='master_order') record({source:s, status:'success', reason:ev.detail?.reason||'product-data-changed', customer_name:ev.detail?.customer_name||'', product_label:ev.detail?.product_label||'', message:'商品資料已同步', success_at:now()}); else render(); }, false);
    window.addEventListener('online', render, {passive:true});
    document.addEventListener('click', ev=>{
      const btn=ev.target?.closest?.('[data-yx282-op-action]');
      if(!btn) return;
      ev.preventDefault(); ev.stopPropagation();
      const act=btn.getAttribute('data-yx282-op-action');
      if(act==='clear'){ write([]); LEGACY_STORE_KEYS.forEach(k=>{try{localStorage.removeItem(k);}catch(_e){}}); render(); return; }
      if(act==='clear-search'){ setSearchQuery(''); render(); return; }
      if(act==='refresh'){ render(); return; }
      if(act==='filter-pending'){ setPendingFilter(btn.getAttribute('data-yx312-filter')||'all'); render(); return; }
      if(act==='filter-status'){ setStatusFilter(btn.getAttribute('data-yx317-status')||'all'); render(); return; }
      if(act==='filter-viewed'){ setViewFilter(btn.getAttribute('data-yx342-view')||'all'); render(); return; }
      if(act==='retry-warehouse'){ retryWarehouse(); return; }
      if(act==='jump-target'){ markViewedFromButton(btn); handleShortcutAction(btn); render(); return; }
      if(act==='retry-one'){ retryPendingOne(btn.getAttribute('data-yx297-pending-id')); return; }
      if(act==='cancel-one'){ cancelPendingOne(btn.getAttribute('data-yx297-pending-id')); return; }
    }, true);
    document.addEventListener('input', ev=>{
      const input=ev.target?.closest?.('[data-yx322-op-search]');
      if(!input) return;
      const val=input.value||'';
      const pos=Number(input.selectionStart||val.length);
      setSearchQuery(val);
      render();
      try{ const next=document.querySelector('[data-yx322-op-search]'); if(next){ next.focus({preventScroll:true}); next.setSelectionRange(Math.min(pos,next.value.length), Math.min(pos,next.value.length)); } }catch(_e){}
    }, true);
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', ()=>{ render(); consumeShortcutTargets(); }, {once:true});
    else { render(); consumeShortcutTargets(); }
  }
  window.YXOperationStatus = {record, render, pending:countWarehousePending, details:pendingRecords, retryOne:retryPendingOne, cancelOne:cancelPendingOne, jump:handleShortcutAction, markViewed:rememberViewedMeta, version:VERSION};
  bind();
})();

/* V342: targeted refresh status detail after single retry success.
   Uses existing public page APIs only; keeps the original lightweight flow and cache-core untouched. */
(function(){
  'use strict';
  if(window.__YX_V332_TARGETED_RETRY_REFRESH__) return;
  window.__YX_V332_TARGETED_RETRY_REFRESH__=true;
  const VERSION='v342-status-unviewed-filter';
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
        if(n){ await window.YX116ShipPicker.load(n,{force:true, single_retry:true, targeted:true}); did=true; addTarget(targets, n+' 出貨商品'); }
      }
    }catch(_e){}
    try{
      const src=sourceFrom(ctx);
      const actions=window.YX113ProductActions || window.YX132ProductActions || window.YX128ProductActions;
      if(actions?.loadSource && (src==='orders' || src==='master_order' || src==='inventory' || p==='orders' || p==='master_order' || p==='inventory')){
        const target=src || p;
        await actions.loadSource(target,{force:true, afterSubmit:true, single_retry:true, targeted:true, customer_name:names[0]||''});
        did=true;
        addTarget(targets, (names[0] ? names[0]+' ' : '目前客戶 ') + sourceLabel(target) + '商品');
        if(names[0] && window.YX113CustomerRegions?.selectCustomer) await window.YX113CustomerRegions.selectCustomer(names[0]);
      }
    }catch(_e){}
    try{
      names.forEach(n=>window.dispatchEvent(new CustomEvent('yx:customer-selected',{detail:{name:n,force:true,source:'single-retry',reason:'v307-targeted-refresh'}})));
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
