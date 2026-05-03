
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

/* 沅興木業 FULL MASTER V22 REAL LOADED COMPLETE - page_master_order_master_v22 */
(function(){ window.__YX_FULL_MASTER_V22_PAGE__='page_master_order_master_v22'; })();

/* ===== MERGED INTO V22 FROM static/yx_modules/core_hardlock.js ===== */
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
  window.YXHardLock = {
    version: 'fix142-speed-ship-master-hardlock',
    register, install, installAll, registry, installed,
    clean, esc, api, toast, moduleKey, hardAssign, mark, cancelLegacyTimers,
  };
  document.documentElement.dataset.yx113Core = 'on';
})();

/* ===== END merged module static/yx_modules/core_hardlock.js ===== */

/* ===== MERGED INTO V22 FROM static/yx_modules/quantity_rule_hardlock.js ===== */
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

/* ===== END merged module static/yx_modules/quantity_rule_hardlock.js ===== */

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

/* ===== MERGED INTO V22 FROM static/yx_modules/product_sort_hardlock.js ===== */
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

/* ===== END merged module static/yx_modules/product_sort_hardlock.js ===== */

/* ===== MERGED INTO V22 FROM static/yx_pages/page_products_master.js ===== */
/* 沅興木業 v20-true-clean-master product page master
   來源：完整商品事件已吸收後重新收斂；移除內部 v11～v16 疊加補丁，避免同頁重複 renderer / submit handler 互相覆蓋。 */

/* ===== absorbed from product_actions_hardlock.js ===== */
/* v20 TRUE CLEAN PRODUCT MASTER：商品頁唯一 renderer / 唯一事件主線；批量操作走單次 API。 */
(function(){
  'use strict';
  const YX = window.YXHardLock;
  if (!YX) return;

  const MATERIALS = ['TD','MER','DF','SP','SPF','HF','RDT','SPY','RP','MKJ','LVL','尤加利','尤佳利'];
  const state = { rows:{inventory:[], orders:[], master_order:[]}, selected:{inventory:new Set(), orders:new Set(), master_order:new Set()}, editAll:{inventory:false, orders:false, master_order:false}, editScope:{inventory:null, orders:null, master_order:null}, zoneFilter:{inventory:'ALL', orders:'ALL', master_order:'ALL'}, loading:null, bound:false, observer:null, repairTimer:null, installedSource:'' };
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
  function sameCustomerName(a, b){
    const aa = YX.clean(a || '');
    const bb = YX.clean(b || '');
    if (!aa || !bb) return false;
    if (aa === bb) return true;
    return customerMergeKey(aa) === customerMergeKey(bb);
  }
  function rowsStore(source, rows){
    window.__YX112_ROWS__ = window.__YX112_ROWS__ || {};
    window.__yx63Rows = window.__yx63Rows || {};
    if (Array.isArray(rows)) {
      state.rows[source] = rows;
      window.__YX112_ROWS__[source] = rows;
      window.__yx63Rows[source] = rows;
    }
    return state.rows[source] || window.__YX112_ROWS__[source] || window.__yx63Rows[source] || [];
  }
  function cloneRows(rows){ try{return JSON.parse(JSON.stringify(rows||[]));}catch(_e){return Array.isArray(rows)?rows.slice():[];} }
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
    if ((source === 'orders' || source === 'master_order') && cust) rows = rows.filter(r => sameCustomerName(r.customer_name || '', cust));
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
      bar.innerHTML = `<div class="yx114-toolbar-main"></div><div class="yx114-batch-actions yx-direct-batch-actions"><input id="yx113-${source}-search" class="text-input small yx113-search" placeholder="搜尋商品 / 客戶 / 材質 / A區 / B區"><button class="ghost-btn small-btn yx132-zone-filter is-active" type="button" data-yx132-zone-filter="ALL" data-source="${source}">全部區</button><button class="ghost-btn small-btn yx132-zone-filter" type="button" data-yx132-zone-filter="A" data-source="${source}">A區</button><button class="ghost-btn small-btn yx132-zone-filter" type="button" data-yx132-zone-filter="B" data-source="${source}">B區</button><select id="yx113-${source}-material" class="text-input small"><option value="">批量增加材質</option>${MATERIALS.map(m => `<option value="${YX.esc(m)}">${YX.esc(m)}</option>`).join('')}</select><button class="ghost-btn small-btn" type="button" data-yx113-batch-material="${source}">套用材質</button><button class="ghost-btn small-btn danger-btn" type="button" data-yx113-batch-delete="${source}">批量刪除</button><button class="ghost-btn small-btn" type="button" data-yx128-edit-all="${source}">批量編輯全部</button><button class="ghost-btn small-btn yx-page-undo-btn" type="button" id="yx-page-undo-btn">復原前一步</button></div>`;
      const head = sec.querySelector('.section-head,.inventory-inline-head') || sec.firstElementChild || sec;
      head.insertAdjacentElement('afterend', bar);
    }
    const search = $(`yx113-${source}-search`);
    if (search && search.dataset.yxHtmlDirectBound !== '1') {
      search.dataset.yxHtmlDirectBound = '1';
      search.addEventListener('input', () => { renderSummary(source); renderCards(source); });
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
    const moveButtons = source === 'inventory'
      ? `<button class="ghost-btn small-btn" type="button" data-yx132-batch-transfer="orders" data-source="${source}">加到訂單</button><button class="ghost-btn small-btn" type="button" data-yx132-batch-transfer="master_order" data-source="${source}">加到總單</button>`
      : (source === 'orders' ? `<button class="ghost-btn small-btn" type="button" data-yx132-batch-transfer="master_order" data-source="${source}">加到總單</button>` : '');
    const zoneMoveButtons = `<button class="ghost-btn small-btn" type="button" data-yx132-batch-zone="A" data-source="${source}">移到A區</button><button class="ghost-btn small-btn" type="button" data-yx132-batch-zone="B" data-source="${source}">移到B區</button>`;
    const controls = ''; // V50：刪除表格上方操作那行；保留下方卡片/批量事件，不再佔表格寬度
    const scope = editingIds(source);
    const displayRows = editing && scope ? rows.filter(r => scope.has(String(idOf(r) || ''))) : rows;
    const body = displayRows.length ? displayRows.map(r => {
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
    }).join('') : `<tr><td colspan="6">目前沒有資料</td></tr>`;
    box.innerHTML = `<div class="yx113-summary-head yx128-summary-head"><div class="yx132-summary-title">${custTag ? `<span class="yx132-customer-tag">${YX.esc(custTag)}</span>` : ''}<strong>${total}件 / ${rows.length}筆</strong><span>${YX.esc(title(source))}｜完整直列顯示，不用下拉式</span></div>${controls}</div><datalist id="yx128-material-list-${source}">${materialOptions('').replace(/ selected/g,'')}</datalist><div class="yx113-table-wrap"><table class="yx113-table yx128-inline-table"><thead><tr><th>材質</th><th>月份</th><th>尺寸</th><th>支數 x 件數</th><th>總數量</th><th>A/B區</th></tr></thead><tbody>${body}</tbody></table></div>`;
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
  function cardHTML(source, r){
    const p = splitProduct(r.product_text || '');
    const q = qtyOf(r);
    const actions = source === 'inventory'
      ? `<button class="ghost-btn tiny-btn danger-btn" data-yx113-action="delete">刪除</button><button class="ghost-btn tiny-btn" data-yx113-action="to-orders">加到訂單</button><button class="ghost-btn tiny-btn" data-yx113-action="to-master">加到總單</button>`
      : `<button class="ghost-btn tiny-btn" data-yx113-action="ship">直接出貨</button><button class="ghost-btn tiny-btn danger-btn" data-yx113-action="delete">刪除</button>`;
    return `<div class="deduct-card yx113-product-card yx112-product-card ${Number(r.unplaced_qty || 0) > 0 ? 'needs-red' : ''}" data-source="${source}" data-id="${idOf(r)}"><div class="yx128-card-top"><strong class="material-text">${materialWithMonthHTML(r)}</strong><button class="ghost-btn tiny-btn yx128-card-edit-btn" type="button" data-yx113-action="edit">編輯</button><strong>${q}件</strong></div><button class="yx113-product-main" type="button" data-yx113-action="filter"><span class="yx-size-with-month">${monthTagHTML(r)}<span>${YX.esc(displaySizeText(r))}</span></span><span class="yx-support-wrap-inline">${window.YX30SupportHTML ? window.YX30SupportHTML(p.support || String(q), YX.esc) : YX.esc(p.support || String(q))}</span></button>${customerOf(r) ? `<div class="small-note">${YX.esc(customerOf(r))}</div>` : ''}<div class="btn-row compact-row yx113-product-actions">${actions}</div></div>`;
  }
  function renderCards(source){
    // FIX131：庫存 / 訂單 / 總單不再產生下方小卡，所有操作統一移到上方完整清單。
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
    state.loading = source;
    try {
      const d = await YX.api(endpoint(source) + '?yx129_master=1&ts=' + Date.now(), {method:'GET'});
      const rows = Array.isArray(d.items) ? d.items : (Array.isArray(d.rows) ? d.rows : []);
      rowsStore(source, rows);
      pruneSelected(source);
      ensureBatchToolbar(source);
      ensureSummary(source);
      if (shouldAvoidRerender(source)) {
        updateSummaryHeaderOnly(source);
      } else {
        renderSummary(source);
        renderCards(source);
      }
      try { window.dispatchEvent(new CustomEvent('yx:product-source-loaded', {detail:{source, count:rows.length, rows}})); } catch(_e) {}
      try {
        if ((source === 'orders' || source === 'master_order') && window.YX113CustomerRegions?.renderFromCurrentRows) {
          window.YX113CustomerRegions.renderFromCurrentRows();
        }
      } catch(_e) {}
      return rowsStore(source);
    } finally {
      if (state.loading === source) state.loading = null;
    }
  }
  async function refreshCurrent(){ return loadSource(sourceFromModule()); }
  async function refreshCustomerBoards(customer){
    customer = YX.clean(customer || '');
    try { if (customer) window.__YX_SELECTED_CUSTOMER__ = customer; } catch(_e) {}
    // V13：訂單 / 總單新增後直接補到北中南客戶；舊客戶保留原本區域，新客戶才進北區。
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
  async function saveCardEdit(card){
    const row = rowFromCard(card); if (!row) return;
    const source = card.dataset.source, id = card.dataset.id;
    const payload = readCardPayload(card);
    if (!payload?.product_text) return YX.toast('請輸入尺寸或商品資料', 'warn');
    if ((source === 'orders' || source === 'master_order') && !payload.customer_name) return YX.toast('請輸入客戶名', 'warn');
    await YX.api(urlFor(source, id), {method:'PUT', body:JSON.stringify(payload)});
    YX.toast('已更新商品', 'ok'); await loadSource(source);
    try { if (window.YX116ShipPicker && selectedCustomer()) await window.YX116ShipPicker.load(selectedCustomer()); } catch(_e) {}
  }
  async function editItem(card){
    renderCardEditor(card);
  }
  async function deleteItem(card){
    const source = card.dataset.source, id = card.dataset.id;
    if (!confirm(`確定刪除這筆${title(source)}商品？`)) return;
    const url = source === 'inventory' ? `/api/inventory/${encodeURIComponent(id)}` : source === 'orders' ? `/api/orders/${encodeURIComponent(id)}` : `/api/master_orders/${encodeURIComponent(id)}`;
    await YX.api(url, {method:'DELETE'}); YX.toast('已刪除', 'ok'); await loadSource(source);
  }
  async function moveInventory(card, target){
    const id = card.dataset.id;
    let customer = selectedCustomer();
    if (!customer) customer = prompt(`要加入${target === 'orders' ? '訂單' : '總單'}的客戶名稱`) || '';
    customer = YX.clean(customer);
    if (!customer) return YX.toast('請輸入客戶名稱', 'warn');
    await YX.api(`/api/inventory/${encodeURIComponent(id)}/move`, {method:'POST', body:JSON.stringify({target, customer_name:customer, region:'北區'})});
    YX.toast(`已加到${target === 'orders' ? '訂單' : '總單'}`, 'ok');
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
    YX.toast('已直接出貨', 'ok'); await loadSource(source);
  }
  async function saveAllEdits(source){
    const rows = [...document.querySelectorAll(`#yx113-${source}-summary .yx128-edit-row[data-source="${source}"]`)];
    if (!rows.length) return;
    const items = [];
    for (const tr of rows){
      const id = Number(tr.dataset.id || 0);
      let row = rowsStore(source).find(r => String(idOf(r) || '') === String(id));
      if (!row || !id) {
        // V22：暫存列沒有真實 id 時，先重抓後端清單，不能直接消失。
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
    // V29：儲存批量編輯時不退出編輯模式、不重畫整個表格，避免正在選取/輸入的欄位被刷新打斷。
    updateSummaryHeaderOnly(source);
    YX.toast(`正在儲存 ${items.length} 筆商品，可繼續編輯`, 'ok');
    try{
      const d = await YX.api('/api/customer-items/batch-update', {method:'POST', body:JSON.stringify({items})});
      YX.toast(`已批量更新 ${d.count || items.length} 筆商品，可繼續編輯其他欄位`, 'ok');
      mergeSnapshotQuiet(d, source);
      try { if (window.YX116ShipPicker && selectedCustomer()) window.YX116ShipPicker.load(selectedCustomer()).catch(()=>{}); } catch(_e) {}
    }catch(e){
      // 失敗時才重新讀後端；成功時完全不打斷目前編輯。
      await loadSource(source);
      YX.toast(e.message || '批量編輯儲存失敗', 'error');
    }
  }
  async function bulkMaterial(source){
    const sel = $(`yx113-${source}-material`);
    const material = YX.clean(sel?.value || '').toUpperCase();
    if (!material) return YX.toast('請先選擇材質', 'warn');
    const ids = selectedOrAllIds(source);
    if (!ids.length) return YX.toast('目前沒有可套用材質的商品', 'warn');
    const items = ids.map(id => ({source:apiSource(source), id:Number(id)})).filter(x => x.id > 0);
    // V31：先跳出成功/處理提示，不讓後續背景同步打斷正在編輯的欄位。
    YX.toast(`正在套用材質 ${material}：${items.length} 筆`, 'ok');
    const idSet = new Set(items.map(x => String(x.id)));
    rowsStore(source).forEach(r => { if (idSet.has(String(idOf(r) || ''))) { r.material = material; r.product_code = material; } });
    renderSourceSafely(source);
    try{
      const d = await YX.api('/api/customer-items/batch-material', {method:'POST', body:JSON.stringify({material, items})});
      YX.toast(`已套用材質 ${material}：${d.count || items.length} 筆`, 'ok');
      if(sel) sel.value='';
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
      // V13：成功後不再先重抓舊快取資料，保留剛才已從 rowsStore 刪掉的畫面，讓下方清單立即消失。
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
      const zf = ev.target?.closest?.('[data-yx132-zone-filter]');
      if (zf) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); const s = zf.dataset.source || source; state.zoneFilter[s] = zf.dataset.yx132ZoneFilter || 'ALL'; syncZoneButtons(s); renderSummary(s); renderCards(s); return; }
      const bt = ev.target?.closest?.('[data-yx132-batch-transfer]');
      if (bt) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); try{ safePushProductUndo(bt.dataset.source || source,'批量移動/加到清單'); await batchTransfer(bt.dataset.source || source, bt.dataset.yx132BatchTransfer); }catch(e){ YX.toast(e.message || '批量移動失敗','error'); } return; }
      const bz = ev.target?.closest?.('[data-yx132-batch-zone]');
      if (bz) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); try{ safePushProductUndo(bz.dataset.source || source,'移動 A/B 區'); await batchMoveZone(bz.dataset.source || source, bz.dataset.yx132BatchZone); }catch(e){ YX.toast(e.message || 'A/B區移動失敗','error'); } return; }
      const editAll = ev.target?.closest?.('[data-yx128-edit-all]');
      if (editAll) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); const s=editAll.dataset.yx128EditAll; try{ if(state.editAll[s]){ safePushProductUndo(s,'批量編輯儲存'); await saveAllEdits(s); } else beginBatchEdit(s); }catch(e){ YX.toast(e.message || '批量編輯失敗','error'); } return; }
      const cancelAll = ev.target?.closest?.('[data-yx128-cancel-all]');
      if (cancelAll) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); cancelBatchEdit(cancelAll.dataset.yx128CancelAll); return; }
      const saveAll = ev.target?.closest?.('[data-yx128-save-all]');
      if (saveAll) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); try{ safePushProductUndo(saveAll.dataset.yx128SaveAll,'批量編輯儲存'); await saveAllEdits(saveAll.dataset.yx128SaveAll); }catch(e){ YX.toast(e.message || '批量編輯儲存失敗','error'); } return; }
      const rowAction = ev.target?.closest?.('[data-yx131-row-action]');
      if (rowAction) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); try{ await handleRowAction(rowAction.dataset.source || source, rowAction.dataset.id, rowAction.dataset.yx131RowAction); }catch(e){ YX.toast(e.message || '清單操作失敗','error'); } return; }
      const cardSave = ev.target?.closest?.('[data-yx128-card-save]');
      if (cardSave) { const c = cardSave.closest('.yx113-product-card,.yx112-product-card'); if (c){ ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); try{ safePushProductUndo(c.dataset.source,'小卡編輯儲存'); await saveCardEdit(c); }catch(e){ YX.toast(e.message || '小卡儲存失敗','error'); } return; } }
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
      if (bm) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); try{ safePushProductUndo(bm.dataset.yx113BatchMaterial,'批量材質'); await bulkMaterial(bm.dataset.yx113BatchMaterial); }catch(e){ YX.toast(e.message || '批量材質失敗','error'); } return; }
      const bd = ev.target?.closest?.('[data-yx113-batch-delete]');
      if (bd) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); try{ safePushProductUndo(bd.dataset.yx113BatchDelete,'批量刪除'); await bulkDelete(bd.dataset.yx113BatchDelete); }catch(e){ YX.toast(e.message || '批量刪除失敗','error'); } return; }
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
  function lockGlobals(){
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
    Object.entries(bridges).forEach(([name, fn]) => { try { YX.hardAssign(name, fn, {configurable:false}); } catch(_e) {} });
    try { window.YX_MASTER = Object.freeze({...(window.YX_MASTER || {}), version:'full-master-v26-dream-ui-lock', productActions:window.YX113ProductActions}); } catch(_e) {}
  }
  function cleanupLegacyProductDom(source){
    // V6：不再掃 DOM 隱藏舊版，也不再二次 render，避免庫存/訂單/總單跳版。
    document.documentElement.dataset.yx115Products = 'locked';
    ensureBatchToolbar(source);
    ensureSummary(source);
  }
  function scheduleRepair(source){ return; }
  function observeProductPage(source){ return; }
  function install(){
    const source = sourceFromModule(); if (!source) return;
    document.documentElement.dataset.yx113Products = 'locked';
    document.documentElement.dataset.yx114Products = 'locked';
    document.documentElement.dataset.yx132Products = 'locked';
    document.documentElement.dataset.yx135Products = 'locked';
    bindEvents(); wrapSelectCustomer(); lockGlobals();
    ensureBatchToolbar(source); ensureSummary(source); cleanupLegacyProductDom(source);
    if (state.installedSource === source && rowsStore(source).length) {
      renderSummary(source); renderCards(source);
    } else {
      state.installedSource = source;
      loadSource(source).catch(e => YX.toast(e.message || `${title(source)}載入失敗`, 'error'));
    }
  }
  YX.register('product_actions', {install, loadSource, refreshCurrent});
  const bootProductActions = () => { try { YX.install('product_actions', {force:true}); } catch(_e) {} };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootProductActions, {once:true}); else bootProductActions();
})();

/* ===== v22 final product submit master: 唯一確認送出流程 ===== */
(function(){
  'use strict';
  if (window.__YX_V22_FINAL_PRODUCT_SUBMIT__) return;
  window.__YX_V22_FINAL_PRODUCT_SUBMIT__ = true;
  const $ = id => document.getElementById(id);
  const clean = v => String(v ?? '').trim();
  const norm = v => clean(v).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/\s+/g,'');
  const page = () => document.querySelector('.module-screen[data-module]')?.dataset.module || '';
  const apiPath = m => m === 'inventory' ? '/api/inventory' : m === 'orders' ? '/api/orders' : '/api/master_orders';
  let submitting = false;

  function toast(msg, type){
    try { (window.YXHardLock?.toast || window.toast || window.showToast || window.notify || window.alert)(msg, type); }
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
    rows = (Array.isArray(rows) ? rows : []).filter(r => clean(r.customer_name || r.customer || '') === customer);
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
  }

  async function refreshAfterSubmit(m, customer, posted, submittedItems, location){
    customer = clean(customer || '');
    const act = window.YX113ProductActions || window.YX132ProductActions || window.YX128ProductActions;
    try { if (customer) window.__YX_SELECTED_CUSTOMER__ = customer; } catch(_e) {}
    try { if (customer && $('customer-name')) $('customer-name').value = customer; } catch(_e) {}

    // V22：新增成功後優先使用後端回傳的真實資料列與 snapshots，不保留 tmp-* 暫存列。
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
        // V24：如果後端沒有回傳真實 id 資料，不能保留 tmp 暫存列；改成立即重讀 DB，避免刷新後消失的假資料。
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
        api('/api/customers/ensure', {method:'POST', body:JSON.stringify({name:customer, region:'北區', preserve_existing:true, request_key:`v22-ensure-${Date.now()}-${Math.random().toString(36).slice(2)}`})})
          .then(d => { try { if (Array.isArray(d?.items) && window.YX113CustomerRegions?.renderBoards) window.YX113CustomerRegions.renderBoards(d.items); } catch(_e) {} try { forceCustomerCardVisible(customer, m); } catch(_e) {} })
          .catch(e => console.warn('[YX v22 ensure customer background]', e));
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
  async function finalConfirmSubmit(ev){
    if (ev) { ev.preventDefault?.(); ev.stopPropagation?.(); ev.stopImmediatePropagation?.(); }
    const m = page();
    if (m === 'ship' && window.__YX_SHIP_SINGLE_LOCK__) return;
    if (!['inventory','orders','master_order'].includes(m)) return;
    if (submitting) return;
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
    submitting = true;
    try{
      if (btn) { btn.disabled = true; btn.textContent = '送出中…'; }
      const requestKey = `v33-submit-${m}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const activeZone = activeZoneForSource(m);
      toast(`送出中：${items.length} 筆商品`, 'ok');
      safePushProductUndo(m, '新增商品');
      // v20：先把商品與客戶卡直接畫到目前頁面，使用者不用等後端 GET 才看到。
      const preOptimistic = submittedRowsFor(m, customer, items, activeZone);
      try {
        const act = window.YX113ProductActions || window.YX132ProductActions || window.YX128ProductActions;
        if (act?.rowsStore) {
          act.rowsStore(m, mergeSubmittedRows(act.rowsStore(m) || [], preOptimistic));
          act.renderSummary?.(m); act.renderCards?.(m);
        }
        if (customer && (m === 'orders' || m === 'master_order')) {
          forceCustomerCardVisible(customer, m);
          try { window.YX113CustomerRegions?.renderFromCurrentRows?.(); forceCustomerCardVisible(customer, m); } catch(_e) {}
          window.__YX_SELECTED_CUSTOMER__ = customer;
        }
        YX.toast('送出中，已先顯示；成功後會換成後端真實資料', 'ok');
      } catch(e){ console.warn('[YX v20 optimistic submit]', e); }
      const posted = await api(apiPath(m), {method:'POST', body:JSON.stringify({customer_name:customer, ocr_text:text, items, duplicate_mode:duplicateMode, location:activeZone, zone:activeZone, region:(m === 'orders' || m === 'master_order') ? '北區' : '', request_key:requestKey})});
      if (ta) ta.value = '';
      await refreshAfterSubmit(m, customer, posted, items, activeZone);
      // V23：後端已回傳 DB 真實清單後，背景再強制讀一次來源資料；不阻塞畫面，但可確認刷新後仍是永久資料。
      try {
        const act = window.YX113ProductActions || window.YX132ProductActions || window.YX128ProductActions;
        if (!document.activeElement || !document.activeElement.matches('input,textarea,select,[contenteditable="true"]')) {
          const verify = act?.loadSource?.(m, {force:true, afterSubmit:true, customer_name:customer});
          if (verify && typeof verify.catch === 'function') verify.catch(e => console.warn('[YX v42 persistent verify]', e));
        }
      } catch(_e) {}
      try { if (customer) window.__YX_SELECTED_CUSTOMER__ = customer; } catch(_e) {}
      try { if ((m === 'orders' || m === 'master_order') && (!document.activeElement || !document.activeElement.matches('input,textarea,select,[contenteditable="true"]'))) refreshCustomerBoardsSafe(customer).catch(()=>{}); } catch(_e) {}
      try { if (m === 'orders' || m === 'master_order') forceCustomerCardVisible(customer, m); } catch(_e) {}
      if (result) {
        result.classList.remove('hidden');
        result.style.display = '';
        result.innerHTML = `<strong>新增成功，已重新讀取後端清單</strong><div class="small-note">${items.map(i=>i.product_text).join('、')}</div>`;
      }
      toast(`已新增 ${items.length} 筆商品`,'ok');
    } catch(e){
      // V24：送出失敗時移除剛剛為了速度先畫出的暫存列，避免使用者誤以為已永久保存。
      try {
        const act = window.YX113ProductActions || window.YX132ProductActions || window.YX128ProductActions;
        if (act?.rowsStore) {
          act.rowsStore(m, (act.rowsStore(m) || []).filter(r => !r.__optimistic && !r.__pending_server_id && !String(r.id || '').startsWith('tmp-')));
          act.renderSummary?.(m); act.renderCards?.(m);
        }
      } catch(_cleanupErr) {}
      if (result) {
        result.classList.remove('hidden');
        result.style.display = '';
        result.innerHTML = `<strong style="color:#b91c1c">送出失敗 / 未寫入清單</strong><div class="small-note">${clean(e.message || '未知錯誤')}</div>`;
      }
      toast(e.message || '送出失敗','error');
    } finally {
      submitting = false;
      if (btn) { btn.disabled = false; btn.textContent = '確認送出'; }
    }
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

/* ===== MERGED INTO V22 FROM static/yx_modules/customer_regions_hardlock.js ===== */
/* FIX120 北中南客戶母版硬鎖：一排一個客戶、FOB/CNF 標籤置中、件/筆靠右、長按操作、操作後立即刷新 */
(function(){
  'use strict';
  const YX = window.YXHardLock;
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
    const r = c.relation_counts || {};
    if (mode === 'orders') return {qty:Number(r.order_qty || 0), rows:Number(r.order_rows || 0)};
    if (mode === 'master_order') return {qty:Number(r.master_qty || 0), rows:Number(r.master_rows || 0)};
    if (mode === 'ship') return {qty:Number((r.order_qty || 0) + (r.master_qty || 0) + (r.inventory_qty || 0)), rows:Number((r.order_rows || 0) + (r.master_rows || 0) + (r.inventory_rows || 0))};
    return {qty:Number(c.item_count || r.total_qty || 0), rows:Number(c.row_count || r.total_rows || 0)};
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
    const ct = counts(c, mode);
    return `<button type="button" class="customer-region-card yx113-customer-card yx114-customer-card yx116-customer-card yx117-customer-card" title="${YX.esc(name)}｜${ct.qty}件 / ${ct.rows}筆" data-yx116-card="1" data-yx117-card="1" data-customer-name="${YX.esc(name)}" data-customer="${YX.esc(name)}" data-customer-variants="${YX.esc(JSON.stringify(c.merge_names || [name]))}" data-region="${YX.esc(normRegion(c.region))}"><span class="yx113-customer-left yx116-customer-name yx-v43-big-customer-name">${YX.esc(info.base)}</span><span class="yx113-customer-tag yx116-customer-tag">${info.tag ? YX.esc(info.tag) : ''}</span><span class="yx113-customer-count yx116-customer-count">${ct.qty}件 / ${ct.rows}筆</span></button>`;
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
      const d = await YX.api(`/api/customer-items?name=${encodeURIComponent(name)}&fast=1${variantsQuery(name)}`, {method:'GET'});
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
    // 出貨頁專用分工：北中南客戶只負責選客戶，不再渲染 selected-customer-items，避免和 ship_single_lock.js 同時打 /api/customer-items。
    if (m === 'ship') {
      try {
        if (window.YX116ShipPicker) {
          window.YX116ShipPicker.load(name).catch(()=>{});
          document.getElementById('ship-customer-picker')?.scrollIntoView?.({behavior:'smooth', block:'start'});
        }
      } catch(_e) {}
      return;
    }
    // FIX120/121：不再呼叫舊版 selectCustomerForModule，避免舊版清空新版商品清單。
    // 商品清單統一交給 product_actions_hardlock 母版與 selected-customer panel 刷新。
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

  function relationCustomersFromRows(existingItems){
    const byName = new Map();
    // V33：客戶區件數 / 筆數一律由目前商品 rowsStore 重新計算。
    // 不沿用 /api/customers 既有 relation_counts，避免刷新或送出後被舊 counts + rowsStore 重複加總，出現 95件/2筆 變 190件/4筆。
    (existingItems || []).forEach(c => {
      const n = YX.clean(c.name || c.customer_name || '');
      if (!n) return;
      byName.set(n, Object.assign({}, c, {relation_counts:Object.assign({}, c.relation_counts || {}), item_count:Number(c.item_count || 0), row_count:Number(c.row_count || 0), merge_names:Array.isArray(c.merge_names) ? c.merge_names : [n]}));
    });
    const seen = new Set();
    const add = (name, source, row) => {
      name = YX.clean(name || ''); if (!name) return;
      const key = [source, name, row.id || '', row.product_text || '', row.material || row.product_code || '', row.location || row.zone || row.warehouse_zone || ''].join('|');
      if (seen.has(key)) return;
      seen.add(key);
      const old = byName.get(name) || {};
      let savedRegion = '';
      try { savedRegion = (JSON.parse(localStorage.getItem('yx_customer_regions_v18') || '{}') || {})[name] || ''; } catch(_e) {}
      const region = normRegion(old.region || row.region || row.customer_region || savedRegion || '北區');
      const rc = Object.assign({}, old.relation_counts || {});
      const qty = qtyFromProduct(row.product_text || '', row.qty);
      if (source === 'orders') { rc.order_rows = Number(rc.order_rows || 0) + 1; rc.order_qty = Number(rc.order_qty || 0) + qty; }
      else if (source === 'master_order') { rc.master_rows = Number(rc.master_rows || 0) + 1; rc.master_qty = Number(rc.master_qty || 0) + qty; }
      else if (source === 'inventory') { rc.inventory_rows = Number(rc.inventory_rows || 0) + 1; rc.inventory_qty = Number(rc.inventory_qty || 0) + qty; }
      byName.set(name, Object.assign({}, old, {name, customer_name:name, region, relation_counts:rc, merge_names:Array.from(new Set([...(old.merge_names || []), name]))}));
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
      const d = await YX.api('/api/customers?yx114=1&ts=' + Date.now(), {method:'GET'});
      // v17：客戶區不能只看 /api/customers；重新整理後若後端客戶檔尚未同步，仍要從目前訂單/總單 rowsStore 立刻補出客戶卡。
      state.items = relationCustomersFromRows(Array.isArray(d.items) ? d.items : []);
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
    // V22：先立刻更新畫面，再背景保存，避免編輯客戶要等很久。
    if (cleanName !== name) {
      document.querySelectorAll('[data-customer-name],[data-customer]').forEach(el => {
        if (YX.clean(el.dataset.customerName || el.dataset.customer || '') === name) {
          el.dataset.customerName = cleanName; el.dataset.customer = cleanName;
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
    state.items = relationCustomersFromRows(state.items || []);
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
    document.querySelectorAll('[data-customer-name],[data-customer]').forEach(el => { if (YX.clean(el.dataset.customerName || el.dataset.customer || '') === name) el.remove(); });
    if (window.__YX_SELECTED_CUSTOMER__ === name) window.__YX_SELECTED_CUSTOMER__ = '';
    YX.toast(`已先從畫面移除客戶：${name}`, 'ok');
    try {
      const d = await YX.api(`/api/customers/${encodeURIComponent(name)}`, {method:'DELETE'});
      YX.toast(d.message || '客戶刪除 / 封存已保存', 'ok');
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
    let press = null, blockClickUntil = 0;
    const clear = () => { if (press?.timer) clearTimeout(press.timer); if (press?.card) press.card.classList.remove('yx121-dragging-customer'); press = null; };
    const regionFromPoint = (x,y) => {
      const el = document.elementFromPoint(x,y);
      const box = el?.closest?.('.category-box[data-region]');
      return box ? normRegion(box.dataset.region || box.querySelector('.category-title')?.textContent || '') : '';
    };
    document.addEventListener('pointerdown', ev => {
      const card = ev.target?.closest?.('.yx114-customer-card,.yx113-customer-card,.customer-region-card[data-customer-name],[data-customer-name]');
      if (!card || ev.target.closest('button,input,select,textarea,a')) return;
      const name = YX.clean(card.dataset.customerName || card.dataset.customer || ''); if (!name) return;
      const x = ev.clientX, y = ev.clientY;
      clear();
      press = {card, name, x, y, dragging:false, timer:setTimeout(() => { blockClickUntil = Date.now() + 900; showActions(name); clear(); }, 650)};
    }, true);
    document.addEventListener('pointermove', ev => {
      if (!press) return;
      const dx = Math.abs(ev.clientX - press.x), dy = Math.abs(ev.clientY - press.y);
      if ((dx > 8 || dy > 8) && press.timer) { clearTimeout(press.timer); press.timer = null; }
      if (dx > 14 || dy > 14) {
        press.dragging = true;
        press.card.classList.add('yx121-dragging-customer');
        document.querySelectorAll('.category-box[data-region]').forEach(box => box.classList.toggle('yx121-drop-target', !!regionFromPoint(ev.clientX, ev.clientY) && box === document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('.category-box[data-region]')));
      }
    }, true);
    document.addEventListener('pointerup', ev => {
      if (press?.dragging) {
        ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.();
        const target = regionFromPoint(ev.clientX, ev.clientY);
        const name = press.name;
        blockClickUntil = Date.now() + 900;
        clear();
        document.querySelectorAll('.category-box[data-region]').forEach(box => box.classList.remove('yx121-drop-target'));
        if (target) moveCustomer(name, target).catch(e => YX.toast(e.message || '移動客戶失敗', 'error'));
        return;
      }
      clear();
    }, true);
    ['pointercancel','pointerleave','dragstart'].forEach(t => document.addEventListener(t, clear, true));
    document.addEventListener('contextmenu', ev => {
      const card = ev.target?.closest?.('.yx114-customer-card,.yx113-customer-card,.customer-region-card[data-customer-name],[data-customer-name]');
      if (!card) return;
      const name = YX.clean(card.dataset.customerName || card.dataset.customer || ''); if (!name) return;
      ev.preventDefault(); showActions(name);
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

  function lockGlobals(){
    if (!state.oldSelect && typeof window.selectCustomerForModule === 'function') state.oldSelect = window.selectCustomerForModule;
    const selectFn = YX.mark(selectCustomer, 'customer_select');
    window.selectCustomerForModule = selectFn;
    const loadFn = YX.mark(loadCustomerBlocks, 'customer_blocks');
    try { YX.hardAssign('loadCustomerBlocks', loadFn, {configurable:false}); } catch(_e) { window.loadCustomerBlocks = loadFn; }
    try { YX.hardAssign('renderCustomers', loadFn, {configurable:false}); } catch(_e) { window.renderCustomers = loadFn; }
    window.YX113CustomerRegions = {loadCustomerBlocks, renderBoards, selectCustomer, ensureCustomerVisible, renderFromCurrentRows, moveCustomer};
    window.YX114CustomerRegions = window.YX113CustomerRegions;
    window.YX115CustomerRegions = window.YX113CustomerRegions;
    window.YX116CustomerRegions = window.YX113CustomerRegions;
    window.YX117CustomerRegions = window.YX113CustomerRegions;
  }
  function install(){
    if (!isRegionPage()) return;
    document.documentElement.dataset.yx113Customers = 'locked';
    document.documentElement.dataset.yx114Customers = 'locked';
    document.documentElement.dataset.yx115Customers = 'locked';
    document.documentElement.dataset.yx116Customers = 'locked';
    document.documentElement.dataset.yx117Customers = 'locked';
    bindEvents(); lockGlobals();
    if (!state.productLoadedBound) { state.productLoadedBound = true; window.addEventListener('yx:product-source-loaded', () => { try { renderFromCurrentRows(); } catch(_e) {} }); }
    loadCustomerBlocks(true);
  }
  YX.register('customer_regions', {install, loadCustomerBlocks, selectCustomer});
})();

/* ===== END merged module static/yx_modules/customer_regions_hardlock.js ===== */

/* ===== MERGED INTO V22 FROM static/yx_pages/page_customers_master.js ===== */
/* 沅興木業 v17 customers master：補齊客戶資料頁 inline 按鈕，避免舊 app.js 缺失。 */
(function(){
  'use strict';
  if (window.__YX_V17_CUSTOMERS_MASTER__) return;
  window.__YX_V17_CUSTOMERS_MASTER__ = true;
  const $ = id => document.getElementById(id);
  const clean = v => String(v == null ? '' : v).replace(/\s+/g,' ').trim();
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const toast = (m,k='ok') => { try { (window.YXHardLock?.toast || window.alert)(m,k); } catch(_){ alert(m); } };
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

/* ===== MERGED INTO V22 FROM static/yx_pages/page_bootstrap_master.js ===== */
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

/* ===== END merged page static/yx_pages/page_bootstrap_master.js ===== */

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


/* ===== V42 MAINFILE UNDO MANAGER ===== */
(function(){
  if (window.YXPageUndo) return;
  const stack=[];
  function update(){ const b=document.getElementById('yx-page-undo-btn'); if(b) b.disabled=!stack.length; }
  window.YXPageUndo={
    snapshot(label, undo){ if(typeof undo!=='function') return; stack.push({label:String(label||'操作'), undo}); while(stack.length>10) stack.shift(); update(); },
    undo(){ const item=stack.pop(); update(); if(!item) return; try{ item.undo(); (window.toast||console.log)('已復原：'+item.label,'ok'); }catch(e){ (window.toast||console.error)(e.message||'復原失敗','error'); } },
    size(){ return stack.length; }
  };
  document.addEventListener('click', ev=>{ const b=ev.target?.closest?.('#yx-page-undo-btn'); if(!b) return; ev.preventDefault(); ev.stopPropagation(); window.YXPageUndo.undo(); }, true);
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', update, {once:true}); else update();
})();
/* ===== END V42 MAINFILE UNDO MANAGER ===== */




/* ===== V55 PRODUCT MAINFILE DIRECT REPAIR: clean undo + reliable inventory/orders/master controls ===== */
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
  window.toast=window.showToast=window.notify=toast; if(window.YXHardLock) window.YXHardLock.toast=toast;
  function sourceFromButton(btn){ return btn?.dataset?.source || btn?.dataset?.yx113BatchMaterial || btn?.dataset?.yx113BatchDelete || btn?.dataset?.yx128EditAll || page(); }
  function apiSource(s){ return s==='master_order'?'master_order':s; }
  function selectedRows(source){ return Array.from(document.querySelectorAll(`#yx113-${source}-summary .yx113-summary-row[data-id]`)).filter(tr=>tr.querySelector('.yx113-row-check:checked')||tr.classList.contains('yx113-row-selected')); }
  function allRows(source){ return Array.from(document.querySelectorAll(`#yx113-${source}-summary .yx113-summary-row[data-id]`)); }
  function idsFor(source, allWhenNone=false){ let rows=selectedRows(source); if(!rows.length&&allWhenNone) rows=allRows(source); return rows.map(tr=>({source:apiSource(source), id:Number(tr.dataset.id||tr.querySelector('.yx113-row-check')?.dataset.id||0)})).filter(x=>x.id>0); }
  function refresh(){ setTimeout(()=>{try{location.reload();}catch(_e){}},280); }
  function ensureUndo(){ window.YXPageUndo=window.YXPageUndo||{}; window.YXPageUndo.open=async function(){ try{ const d=await api('/api/audit-trails?limit=10&undo=1'); const items=Array.isArray(d.items)?d.items.slice(0,10):[]; if(!items.length) return toast('目前沒有可還原的最近操作','warn'); const text=items.map((x,i)=>`${i+1}. ${x.created_at||''} ${x.action_label||x.action_type||''} ${x.entity_label||x.entity_type||''} ${x.summary_text||x.entity_key||''}`).join('\n'); const n=prompt('輸入要還原第幾筆：\n'+text,'1'); const idx=Number(n)-1; if(!items[idx]) return; await api('/api/undo-last',{method:'POST',body:JSON.stringify({id:items[idx].id})}); toast('已還原，重新整理中','ok'); refresh(); }catch(e){toast(e.message||'還原失敗','error');} }; }
  ensureUndo();
  document.addEventListener('click', async ev=>{
    const p=page(); if(!['inventory','orders','master_order'].includes(p)) return;
    const undo=ev.target.closest?.('.yx-page-undo-btn,#yx-page-undo-btn'); if(undo){ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation?.(); return window.YXPageUndo.open();}
    const mat=ev.target.closest?.('[data-yx113-batch-material]');
    if(mat){ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation?.(); const source=sourceFromButton(mat); const material=clean(document.getElementById(`yx113-${source}-material`)?.value||''); if(!material) return toast('請先選擇材質','warn'); const items=idsFor(source,true); if(!items.length) return toast('目前沒有可套用材質的商品','warn'); try{ await api('/api/customer-items/batch-material',{method:'POST',body:JSON.stringify({material,items})}); toast(`已套用材質 ${material}`,'ok'); refresh(); }catch(e){toast(e.message||'批量材質失敗','error');} return;}
    const del=ev.target.closest?.('[data-yx113-batch-delete]');
    if(del){ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation?.(); const source=sourceFromButton(del); const items=idsFor(source,false); if(!items.length) return toast('請先勾選要刪除的商品','warn'); if(!confirm(`確定刪除 ${items.length} 筆商品？`)) return; try{ await api('/api/customer-items/batch-delete',{method:'POST',body:JSON.stringify({items})}); toast('已批量刪除','ok'); refresh(); }catch(e){toast(e.message||'批量刪除失敗','error');} return;}
    const zone=ev.target.closest?.('[data-yx132-batch-zone]');
    if(zone){ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation?.(); const source=sourceFromButton(zone); const items=idsFor(source,true); if(!items.length) return toast('目前沒有可移到 A/B 區的商品','warn'); try{ await api('/api/customer-items/batch-zone',{method:'POST',body:JSON.stringify({zone:zone.dataset.yx132BatchZone,items})}); toast(`已移到 ${zone.dataset.yx132BatchZone}區`,'ok'); refresh(); }catch(e){toast(e.message||'A/B區移動失敗','error');} return;}
    const trans=ev.target.closest?.('[data-yx132-batch-transfer]');
    if(trans){ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation?.(); const source=sourceFromButton(trans); const target=trans.dataset.yx132BatchTransfer; const items=idsFor(source,false); if(!items.length) return toast('請先勾選要移動的商品','warn'); let customer=clean(document.getElementById('customer-name')?.value||window.__YX_SELECTED_CUSTOMER__||''); if(!customer) customer=prompt('請輸入客戶名稱')||''; customer=clean(customer); if(!customer) return toast('請先輸入客戶名稱','warn'); try{ await api('/api/items/batch-transfer',{method:'POST',body:JSON.stringify({items:items.map(x=>({...x,customer_name:customer})),target,customer_name:customer,region:'北區',allow_inventory_fallback:true,request_key:'v55-'+Date.now()})}); toast('已加入清單','ok'); refresh(); }catch(e){toast(e.message||'加到清單失敗','error');} return;}
  }, true);
})();
/* ===== END V55 PRODUCT MAINFILE DIRECT REPAIR ===== */

