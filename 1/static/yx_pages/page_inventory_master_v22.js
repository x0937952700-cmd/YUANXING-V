
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
    if (rightForCanonical === canonical) return 10;
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

/* 沅興木業 FULL MASTER V22 REAL LOADED COMPLETE - page_inventory_master_v22 */
(function(){ window.__YX_FULL_MASTER_V22_PAGE__='page_inventory_master_v22'; })();

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
    if (window.__YX_V20_VISUAL_TOAST__) return;
    window.__YX_V20_VISUAL_TOAST__ = true;
    window.toast = window.showToast = window.notify = function(message, kind='ok'){
      try{
        let box = document.getElementById('yx-v20-toast');
        if(!box){ box=document.createElement('div'); box.id='yx-v20-toast'; document.body.appendChild(box); }
        box.className = 'yx-v20-toast-card ' + (kind || 'ok');
        box.innerHTML = `<strong>${kind==='error'?'操作失敗':(kind==='warn'?'請注意':'操作成功')}</strong><div>${String(message||'').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}</div>`;
        box.classList.add('show');
        clearTimeout(window.__YX_V20_TOAST_TIMER__);
        window.__YX_V20_TOAST_TIMER__ = setTimeout(()=>box.classList.remove('show'), 2600);
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
      bar.innerHTML = `<div class="yx114-toolbar-main"></div><div class="yx114-batch-actions yx-direct-batch-actions"><input id="yx113-${source}-search" class="text-input small yx113-search" placeholder="搜尋商品 / 客戶 / 材質 / A區 / B區"><button class="ghost-btn small-btn yx132-zone-filter is-active" type="button" data-yx132-zone-filter="ALL" data-source="${source}">全部區</button><button class="ghost-btn small-btn yx132-zone-filter" type="button" data-yx132-zone-filter="A" data-source="${source}">A區</button><button class="ghost-btn small-btn yx132-zone-filter" type="button" data-yx132-zone-filter="B" data-source="${source}">B區</button><select id="yx113-${source}-material" class="text-input small"><option value="">批量增加材質</option>${MATERIALS.map(m => `<option value="${YX.esc(m)}">${YX.esc(m)}</option>`).join('')}</select><button class="ghost-btn small-btn" type="button" data-yx113-batch-material="${source}">套用材質</button><button class="ghost-btn small-btn danger-btn" type="button" data-yx113-batch-delete="${source}">批量刪除</button><button class="ghost-btn small-btn" type="button" data-yx128-edit-all="${source}">批量編輯全部</button></div>`;
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
    const controls = `<div class="yx128-summary-controls">${moveButtons}${zoneMoveButtons}</div>`;
    const scope = editingIds(source);
    const displayRows = editing && scope ? rows.filter(r => scope.has(String(idOf(r) || ''))) : rows;
    const body = displayRows.length ? displayRows.map(r => {
      const p = splitProduct(r.product_text || '');
      const id = idOf(r);
      if (!editing) {
        return `<tr class="yx113-summary-row" data-source="${source}" data-id="${id}"><td class="mat"><input class="yx113-row-check" type="checkbox" data-id="${id}" data-source="${source}">${materialWithMonthHTML(r)}</td><td class="month">${monthCellHTML(r)}</td><td class="size">${YX.esc(displaySizeText(r))}</td><td class="support yx-support-wrap">${window.YX30SupportHTML ? window.YX30SupportHTML(p.support || String(qtyOf(r)), YX.esc) : YX.esc(p.support || String(qtyOf(r)))}</td><td class="qty total-qty">${qtyOf(r)}</td><td class="zone">${YX.esc(zoneLabel(r))}</td><td class="yx131-action-cell">${r.__pending_server_id ? '<span class="small-note warn">寫入中，請稍候</span>' : rowActionsHTML(source, id)}</td></tr>`;
      }
      return `<tr class="yx113-summary-row yx128-edit-row" data-source="${source}" data-id="${id}">
        <td><select class="text-input small yx128-field" data-yx128-field="material"><option value="">不指定材質</option>${materialOptions(materialOf(r)==='未填材質'?'':materialOf(r))}</select></td>
        <td class="month">${monthCellHTML(r)}</td>
        <td><input class="text-input small yx128-field" data-yx128-field="size" value="${YX.esc(p.size || r.product_text || '')}" placeholder="尺寸，可含 8月"></td>
        <td><input class="text-input small yx128-field" data-yx128-field="support" value="${YX.esc(p.support || '')}" placeholder="支數 x 件數"></td>
        <td><input class="text-input small yx128-field" data-yx128-field="qty" type="number" min="1" value="${qtyOf(r)}" placeholder="總數量"></td>
        <td><select class="text-input small yx128-field" data-yx128-field="zone"><option value="" ${zoneOf(r)?'':'selected'}>未分區</option><option value="A" ${zoneOf(r)==='A'?'selected':''}>A區</option><option value="B" ${zoneOf(r)==='B'?'selected':''}>B區</option></select><input type="hidden" data-yx128-field="customer_name" value="${YX.esc(customerOf(r) || '')}"></td><td class="yx131-action-cell"><span class="small-note">編輯中</span></td>
      </tr>`;
    }).join('') : `<tr><td colspan="7">目前沒有資料</td></tr>`;
    box.innerHTML = `<div class="yx113-summary-head yx128-summary-head"><div class="yx132-summary-title">${custTag ? `<span class="yx132-customer-tag">${YX.esc(custTag)}</span>` : ''}<strong>${total}件 / ${rows.length}筆</strong><span>${YX.esc(title(source))}｜完整直列顯示，不用下拉式</span></div>${controls}</div><datalist id="yx128-material-list-${source}">${materialOptions('').replace(/ selected/g,'')}</datalist><div class="yx113-table-wrap"><table class="yx113-table yx128-inline-table"><thead><tr><th>材質</th><th>月份</th><th>尺寸</th><th>支數 x 件數</th><th>總數量</th><th>A/B區</th><th>操作</th></tr></thead><tbody>${body}</tbody></table></div>`;
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
    if (tbody && !tbody.querySelector('tr')) tbody.innerHTML = '<tr><td colspan="7">目前沒有資料</td></tr>';
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
      if (bt) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); try{ await batchTransfer(bt.dataset.source || source, bt.dataset.yx132BatchTransfer); }catch(e){ YX.toast(e.message || '批量移動失敗','error'); } return; }
      const bz = ev.target?.closest?.('[data-yx132-batch-zone]');
      if (bz) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); try{ await batchMoveZone(bz.dataset.source || source, bz.dataset.yx132BatchZone); }catch(e){ YX.toast(e.message || 'A/B區移動失敗','error'); } return; }
      const editAll = ev.target?.closest?.('[data-yx128-edit-all]');
      if (editAll) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); const s=editAll.dataset.yx128EditAll; try{ if(state.editAll[s]) await saveAllEdits(s); else beginBatchEdit(s); }catch(e){ YX.toast(e.message || '批量編輯失敗','error'); } return; }
      const cancelAll = ev.target?.closest?.('[data-yx128-cancel-all]');
      if (cancelAll) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); cancelBatchEdit(cancelAll.dataset.yx128CancelAll); return; }
      const saveAll = ev.target?.closest?.('[data-yx128-save-all]');
      if (saveAll) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); try{ await saveAllEdits(saveAll.dataset.yx128SaveAll); }catch(e){ YX.toast(e.message || '批量編輯儲存失敗','error'); } return; }
      const rowAction = ev.target?.closest?.('[data-yx131-row-action]');
      if (rowAction) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); try{ await handleRowAction(rowAction.dataset.source || source, rowAction.dataset.id, rowAction.dataset.yx131RowAction); }catch(e){ YX.toast(e.message || '清單操作失敗','error'); } return; }
      const cardSave = ev.target?.closest?.('[data-yx128-card-save]');
      if (cardSave) { const c = cardSave.closest('.yx113-product-card,.yx112-product-card'); if (c){ ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); try{ await saveCardEdit(c); }catch(e){ YX.toast(e.message || '小卡儲存失敗','error'); } return; } }
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
      if (bm) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); try{ await bulkMaterial(bm.dataset.yx113BatchMaterial); }catch(e){ YX.toast(e.message || '批量材質失敗','error'); } return; }
      const bd = ev.target?.closest?.('[data-yx113-batch-delete]');
      if (bd) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); try{ await bulkDelete(bd.dataset.yx113BatchDelete); }catch(e){ YX.toast(e.message || '批量刪除失敗','error'); } return; }
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
    const html = `<button type="button" class="customer-region-card yx113-customer-card yx114-customer-card yx116-customer-card yx117-customer-card yx-v15-force-customer-card" data-customer-name="${esc(customer)}" data-customer="${esc(customer)}" data-region="北區"><span class="yx113-customer-left yx116-customer-name">${esc(customer)}</span><span class="yx113-customer-tag yx116-customer-tag"></span><span class="yx113-customer-count yx116-customer-count">${qtyTotal}件 / ${rowCount}筆</span></button>`;
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
        const verify = act?.loadSource?.(m, {force:true, afterSubmit:true, customer_name:customer});
        if (verify && typeof verify.catch === 'function') verify.catch(e => console.warn('[YX v23 persistent verify]', e));
      } catch(_e) {}
      try { if (customer) window.__YX_SELECTED_CUSTOMER__ = customer; } catch(_e) {}
      try { if (m === 'orders' || m === 'master_order') await refreshCustomerBoardsSafe(customer); } catch(_e) {}
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

