
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

/* 沅興木業 FULL MASTER V22 REAL LOADED COMPLETE - page_ship_master_v22 */
(function(){ window.__YX_FULL_MASTER_V22_PAGE__='page_ship_master_v22'; })();

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

/* ===== V2 MERGED FROM static/yx_modules/customer_regions_hardlock.js ===== */
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
    return `<button type="button" class="customer-region-card yx113-customer-card yx114-customer-card yx116-customer-card yx117-customer-card" title="${YX.esc(name)}｜${ct.qty}件 / ${ct.rows}筆" data-yx116-card="1" data-yx117-card="1" data-customer-name="${YX.esc(name)}" data-customer="${YX.esc(name)}" data-customer-variants="${YX.esc(JSON.stringify(c.merge_names || [name]))}" data-region="${YX.esc(normRegion(c.region))}"><span class="yx113-customer-left yx116-customer-name">${YX.esc(info.base)}</span><span class="yx113-customer-tag yx116-customer-tag">${info.tag ? YX.esc(info.tag) : ''}</span><span class="yx113-customer-count yx116-customer-count">${ct.qty}件 / ${ct.rows}筆</span></button>`;
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
      byName.set(n, Object.assign({}, c, {relation_counts:{}, item_count:0, row_count:0, merge_names:Array.isArray(c.merge_names) ? c.merge_names : [n]}));
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
    let item = state.items.find(c => c.name === name) || {};
    try { const d = await YX.api(`/api/customers/${encodeURIComponent(name)}`, {method:'GET'}); item = d.item || item; } catch(_e) {}
    const nextName = prompt('客戶名稱', item.name || name); if (nextName === null) return;
    const region = prompt('區域：北區 / 中區 / 南區', normRegion(item.region || '北區')); if (region === null) return;
    const cleanName = YX.clean(nextName); if (!cleanName) return YX.toast('客戶名稱不可空白', 'warn');
    if (cleanName !== name) await YX.api(`/api/customers/${encodeURIComponent(name)}`, {method:'PUT', body:JSON.stringify({new_name:cleanName})});
    await YX.api('/api/customers', {method:'POST', body:JSON.stringify({name:cleanName, phone:item.phone || '', address:item.address || '', notes:item.notes || '', common_materials:item.common_materials || '', common_sizes:item.common_sizes || '', region:normRegion(region), preserve_existing:false})});
    YX.toast('客戶已更新', 'ok'); await loadCustomerBlocks(true); await selectCustomer(cleanName);
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
    state.items = (state.items || []).map(c => YX.clean(c.name || c.customer_name || '') === name ? Object.assign({}, c, {region}) : c);
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
    try { await selectCustomer(name); } catch(_e) {}
    YX.toast(`${name} 已移到${region}`, 'ok');
    try {
      await YX.api('/api/customers/move', {method:'POST', body:JSON.stringify({name, region})});
      // 背景重新校正，不阻塞畫面；回來後仍維持最新區域。
      loadCustomerBlocks(true).then(()=>{ moveCustomerCardNow(name, region); selectCustomer(name).catch(()=>{}); }).catch(()=>{});
    } catch(e) {
      YX.toast(e.message || '移動客戶失敗，已還原請重試', 'error');
      loadCustomerBlocks(true).catch(()=>{});
      throw e;
    }
  }
  async function deleteCustomer(name){
    if (!confirm(`確定刪除 / 封存客戶「${name}」？`)) return;
    const d = await YX.api(`/api/customers/${encodeURIComponent(name)}`, {method:'DELETE'});
    YX.toast(d.message || '客戶已更新', 'ok');
    if (window.__YX_SELECTED_CUSTOMER__ === name) window.__YX_SELECTED_CUSTOMER__ = '';
    await loadCustomerBlocks(true);
    try { if (window.YX113ProductActions) await window.YX113ProductActions.refreshCurrent(); } catch(_e) {}
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
  function lockGlobals(){
    if (!state.oldSelect && typeof window.selectCustomerForModule === 'function') state.oldSelect = window.selectCustomerForModule;
    const selectFn = YX.mark(selectCustomer, 'customer_select');
    window.selectCustomerForModule = selectFn;
    const loadFn = YX.mark(loadCustomerBlocks, 'customer_blocks');
    try { YX.hardAssign('loadCustomerBlocks', loadFn, {configurable:false}); } catch(_e) { window.loadCustomerBlocks = loadFn; }
    try { YX.hardAssign('renderCustomers', loadFn, {configurable:false}); } catch(_e) { window.renderCustomers = loadFn; }
    window.YX113CustomerRegions = {loadCustomerBlocks, renderBoards, selectCustomer};
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

/* ===== END static/yx_modules/customer_regions_hardlock.js ===== */

/* ===== V2 MERGED FROM static/yx_pages/page_customers_master.js ===== */
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

/* ===== END static/yx_pages/page_customers_master.js ===== */

/* ===== V2 MERGED FROM static/yx_modules/ship_single_lock.js ===== */
/* 沅興木業 出貨單一母版 V7：HTML 固定完整商品清單 + 已選商品一商品一行，JS 只接資料事件 */
(function(){
  'use strict';
  if (!window.__YX_SHIP_SINGLE_LOCK__) return;
  const $=(id)=>document.getElementById(id);
  const state={customer:'',items:[],selected:[],customers:[],loadingName:'',itemCache:new Map(),bound:false};
  const esc=(v)=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const clean=(v)=>String(v??'').replace(/\s+/g,' ').trim();
  async function api(url,opt={}){const res=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});const txt=await res.text();let data={};try{data=txt?JSON.parse(txt):{};}catch(_){data={success:false,error:txt||'伺服器回應格式錯誤'};}if(!res.ok||data.success===false)throw new Error(data.error||data.message||`請求失敗 ${res.status}`);return data;}
  function toast(msg,kind='ok'){let box=$('yx-ship-toast');if(!box){box=document.createElement('div');box.id='yx-ship-toast';document.body.appendChild(box);}box.className='yx-ship-toast '+kind;box.textContent=msg;clearTimeout(box._t);box._t=setTimeout(()=>box.classList.remove('ok','warn','error'),2800);}
  function normalizeText(t){return clean(t).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=');}
  function splitProduct(text){const raw=normalizeText(text);const i=raw.indexOf('=');return{size:i>=0?raw.slice(0,i):raw,support:i>=0?raw.slice(i+1):''};}
  function supportSegments(support){return normalizeText(support).split('+').map(x=>x.trim()).filter(Boolean).map(seg=>{const m=seg.match(/^(.*?)(?:x\s*(\d+))?$/i);const base=clean((m&&m[1])||seg).replace(/x\s*$/i,'');const mult=Number((m&&m[2])||1);return{base:base||seg.replace(/x\s*\d+$/i,''),mult:Math.max(1,Number.isFinite(mult)?mult:1)};});}
  function supportTotalPieces(support){return supportSegments(support).reduce((a,b)=>a+Math.max(1,Number(b.mult||1)),0);}
  function qtyFromText(text,fallback=0){const raw=normalizeText(text);const right=raw.includes('=')?raw.split('=').slice(1).join('='):raw;if(right){const n=supportTotalPieces(right);if(n)return n;}const f=Number(fallback||0);return Number.isFinite(f)&&f>0?Math.floor(f):0;}
  function materialOf(it){return clean(it.material||it.product_code||it.wood_type||it['材質']||'未填材質');}
  function normalizeSource(v){const raw=clean(v);if(/總單|master_order|master_orders|master/i.test(raw))return'總單';if(/訂單|orders|order/i.test(raw))return'訂單';if(/庫存|inventory|stock/i.test(raw))return'庫存';return'';}
  function sourceOf(it){return normalizeSource(it.source_preference||it.source||it.deduct_source||it.source_label)||'自動';}
  function sourcePreferenceOf(it){return normalizeSource(it.source_preference||it.deduct_source||it.source||it.source_label);}
  function shipSourceLabelFrom(v){const s=normalizeSource(v); if(s==='總單')return'該客戶總單'; if(s==='訂單')return'該客戶訂單'; if(s==='庫存')return'庫存'; return s||'自動判斷';}
  function shipSourceLabel(it,preview){return shipSourceLabelFrom(preview?.source_label||preview?.source_preference||preview?.deduct_source||it?.source_preference||it?.deduct_source||it?.source_label||it?.source);}
  function productFromSupport(size,support){const sp=normalizeText(support);return`${normalizeText(size)}${sp?'='+sp:''}`;}
  function productLabel(it){const p=splitProduct(it.product_text||it.product||'');const q=qtyFromText(it.product_text,it.qty);return`${sourceOf(it)}｜${materialOf(it)}｜${p.size}${p.support?'='+p.support:''}｜${q}件`;}
  function productKey(it){const p=splitProduct(it.product_text||it.product||'');return[sourcePreferenceOf(it)||sourceOf(it)||'自動',materialOf(it)||'',normalizeText(p.size),normalizeText(p.support)].join('|').toLowerCase();}
  function availableQtyOf(it){const vals=[it.available_qty,it.total_qty,it.remaining_qty,it.qty,it.pieces,it.count,it.quantity];for(const v of vals){const n=Number(v);if(Number.isFinite(n)&&n>0)return Math.floor(n);}return qtyFromText(it.product_text||it.product,it.qty)||0;}
  function selectedQtyOf(row){const p=splitProduct(row.product_text||'');return supportTotalPieces(p.support)||qtyFromText(row.product_text,row.qty)||Number(row.qty||0)||0;}
  function warnOverQty(row){const q=selectedQtyOf(row),max=Number(row.available_qty||row.original_qty||0);return max>0&&q>max?{q,max}:null;}
  function variantsQuery(){const arr=Array.isArray(window.__YX_SELECTED_CUSTOMER_VARIANTS__)?window.__YX_SELECTED_CUSTOMER_VARIANTS__.filter(Boolean):[];return arr.length?'&variants='+encodeURIComponent(JSON.stringify(arr)):'';}
  function setCustomer(name){state.customer=clean(name);const a=$('customer-name');if(a&&a.value!==state.customer)a.value=state.customer;const b=$('ship-customer-search');if(b&&b.value!==state.customer)b.value=state.customer;}
  function setCount(text){const el=$('ship-customer-item-count');if(el)el.textContent=text;}
  function syncHiddenSelect(){const select=$('ship-customer-item-select');if(!select)return;select.hidden=true;select.setAttribute('hidden','hidden');select.setAttribute('aria-hidden','true');select.style.display='none';select.innerHTML='<option value="">商品標籤清單已顯示在下方</option>';}
  function renderCustomers(){const box=$('ship-customer-quick-list');if(box)box.replaceChildren();}
  async function loadCustomers(){try{const cards=Array.from(document.querySelectorAll('[data-customer-name]')).map(el=>({name:el.dataset.customerName||el.dataset.customer||''})).filter(x=>x.name);if(cards.length){state.customers=cards;renderCustomers();return;}const d=await api('/api/customers?ship_single=1&light=1&ts='+Date.now());state.customers=Array.isArray(d.items)?d.items:(Array.isArray(d.customers)?d.customers:[]);renderCustomers();}catch(_){}}
  function renderItems(){const box=$('ship-customer-item-list');syncHiddenSelect();if(!box){return;}box.classList.remove('yx-final-ship-product-list-hidden');box.classList.add('yx-final-ship-tag-menu','yx-ship-one-column-menu');if(!state.customer){setCount('請先點選北 / 中 / 南客戶');box.innerHTML='<div class="empty-state-card compact-empty">請先點選北 / 中 / 南客戶</div>';return;}if(state.loadingName===state.customer){setCount(`${state.customer}：商品載入中…`);box.innerHTML='<div class="empty-state-card compact-empty">商品載入中…</div>';return;}if(!state.items.length){setCount(`${state.customer}：0 筆 / 0 件`);box.innerHTML='<div class="empty-state-card compact-empty">此客戶目前沒有可出貨商品</div>';return;}const total=state.items.reduce((sum,it)=>sum+qtyFromText(it.product_text,it.qty),0);setCount(`${state.customer}：${state.items.length} 筆 / ${total} 件`);box.innerHTML=state.items.map((it,i)=>`<button type="button" class="yx-ship-product-option-row" data-ship-add-index="${i}"><span class="yx-ship-option-source">出貨源：${esc(shipSourceLabel(it))}</span><span class="yx-ship-option-material">${esc(materialOf(it)||'未填材質')}</span><span class="yx-ship-option-text">${esc(it.product_text||'')}</span><strong>${qtyFromText(it.product_text,it.qty)}件</strong><em>加入</em></button>`).join('');}
  async function loadItems(name,opts={}){setCustomer(name||state.customer);renderItems();if(!state.customer)return;const key=state.customer;const cached=state.itemCache.get(key);if(!opts.force&&cached&&Date.now()-cached.at<15000){state.items=cached.items;renderItems();return;}if(state.loadingName===key)return;state.loadingName=key;renderItems();try{const d=await api('/api/customer-items?name='+encodeURIComponent(state.customer)+'&fast=1&ship_single=1'+variantsQuery()+'&ts='+Date.now());state.items=Array.isArray(d.items)?d.items:[];state.itemCache.set(key,{items:state.items,at:Date.now()});renderItems();}finally{state.loadingName='';renderItems();}}
  function selectedCardHtml(it,i){const p=splitProduct(it.product_text);const q=selectedQtyOf(it);const over=warnOverQty(it);return`<div class="yx-ship-selected-html-card yx-ship-selected-tag-card yx-ship-one-line-card ${over?'is-over-qty':''}" data-selected-card="${i}"><div class="yx-ship-selected-main yx-ship-selected-main-editable" title="直接在這一行修改支數；例如 220x12 改成 220x9，或刪掉不要的 +段"><span class="yx-ship-source-pill">出貨源：${esc(shipSourceLabel(it))}</span><span class="yx-ship-material-pill yx-ship-material-green">${esc(it.material||'未填材質')}</span><span class="yx-ship-selected-size">${esc(p.size)}=</span><input class="text-input yx-ship-support-editor" value="${esc(p.support)}" data-support-editor="${i}" placeholder="直接改 220x12 或刪除不要的 +段"><span class="yx-ship-selected-total" data-selected-total="${i}">${q}件</span><span class="yx-ship-over-note" data-over-note="${i}">${over?`超出可出貨 ${over.max} 件`:''}</span><button class="ghost-btn small-btn danger-btn" type="button" data-selected-remove="${i}">刪除此商品</button></div></div>`;}
  function updateSelectedProductFromSupport(i,support){const row=state.selected[i];if(!row)return;const p=splitProduct(row.product_text||'');const spt=normalizeText(support);row.product_text=productFromSupport(p.size,spt);row.qty=supportTotalPieces(spt)||qtyFromText(row.product_text,row.qty)||1;const total=document.querySelector(`[data-selected-total="${i}"]`);if(total)total.textContent=`${row.qty}件`;const over=warnOverQty(row);const card=document.querySelector(`[data-selected-card="${i}"]`);if(card)card.classList.toggle('is-over-qty',!!over);const note=document.querySelector(`[data-over-note="${i}"]`);if(note)note.textContent=over?`超出可出貨 ${over.max} 件`:'';if(over)toast(`出貨 ${over.q} 件大於可出貨 ${over.max} 件，請先修改`,'warn');const hidden=$('ocr-text');if(hidden)hidden.value=state.selected.map(it=>it.product_text).join('\n');}
  function renderSelected(){const box=$('ship-selected-items');if(!box)return;if(!state.selected.length)box.innerHTML='<div class="empty-state-card compact-empty">尚未加入出貨商品</div>';else box.innerHTML=state.selected.map(selectedCardHtml).join('');const hidden=$('ocr-text');if(hidden)hidden.value=state.selected.map(it=>it.product_text).join('\n');}
  function addItem(i){const it=state.items[Number(i)];if(!it)return toast('找不到商品','warn');const max=availableQtyOf(it)||qtyFromText(it.product_text,it.qty)||9999;const product_text=it.product_text||'';const row={product_text,qty:qtyFromText(product_text,it.qty)||max,material:materialOf(it),product_code:materialOf(it),source:shipSourceLabel(it),source_preference:sourcePreferenceOf(it),deduct_source:sourcePreferenceOf(it),source_label:shipSourceLabel(it),id:it.id,original_id:it.id,available_qty:max,original_qty:max,_key:productKey(it)};const exists=state.selected.findIndex(x=>(x._key||productKey(x))===row._key);if(exists>=0){toast('同樣商品已加入，請直接在下面那一行修改，不會重複添加','warn');const card=document.querySelector(`[data-selected-card="${exists}"]`);card?.scrollIntoView?.({behavior:'smooth',block:'center'});card?.classList.add('flash-highlight');return;}state.selected.push(row);renderSelected();toast('已加入出貨商品，可直接修改件數','ok');$('ship-selected-items')?.scrollIntoView?.({behavior:'smooth',block:'nearest'});}
  window.clearShipSelectedItems=function(){state.selected=[];renderSelected();};
  function volumeCoeffLength(v){const n=Number(String(v||'').replace(/^0+(?=\d)/,''));return Number.isFinite(n)?(n>210?n/1000:n/100):0;}
  function volumeCoeffWidth(v){const n=Number(String(v||'').replace(/^0+(?=\d)/,''));return Number.isFinite(n)?n/10:0;}
  function volumeCoeffHeight(v){const raw=String(v||'').trim();const n=Number(raw.replace(/^0+(?=\d)/,''));return Number.isFinite(n)?(n>=100?n/100:n/10):0;}
  function supportSticksSum(support){return normalizeText(support).split('+').map(x=>x.trim()).filter(Boolean).reduce((sum,seg)=>{const m=seg.match(/^(\d+(?:\.\d+)?)(?:x\s*(\d+))?$/i);return m?sum+Number(m[1]||0)*Number(m[2]||1):sum;},0);}
  function localVolumeCalc(items){const rows=(items||[]).map(it=>{const p=splitProduct(it.product_text||'');const dims=p.size.match(/(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)/i);if(!dims)return null;const sticks=supportSticksSum(p.support);const lc=volumeCoeffLength(dims[1]),wc=volumeCoeffWidth(dims[2]),hc=volumeCoeffHeight(dims[3]);const volume=sticks*lc*wc*hc;return{product:p.size+(p.support?'='+p.support:''),pieces_sum:sticks,formula:`${sticks} × ${lc} × ${wc} × ${hc}`,volume:Number.isFinite(volume)?volume:0};}).filter(Boolean);return{rows,total_qty:(items||[]).reduce((a,b)=>a+selectedQtyOf(b),0),total_volume:rows.reduce((a,b)=>a+Number(b.volume||0),0)};}
  function calcRowsHtml(calc){const rows=calc?.rows||calc?.items||[];if(!rows.length)return'<tr><td colspan="5">尚無材積算式</td></tr>';return rows.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.product||r.product_text||'')}</td><td>${Number(r.pieces_sum||r.qty||0)}</td><td>${esc(r.formula||'')}</td><td>${esc(r.volume||'')}</td></tr>`).join('');}
  function previewRowHtml(item,idx,preview){
    const p=splitProduct(item.product_text||preview.product_text||preview.product||'');
    const q=selectedQtyOf(item)||Number(preview.qty||preview.need_qty||1);
    const srcPref=normalizeSource(preview.source_label||preview.source_preference||preview.deduct_source||item.source_preference||item.deduct_source||item.source_label||item.source);
    const sourceBefore = srcPref==='總單' ? preview.master_available : (srcPref==='訂單' ? preview.order_available : (srcPref==='庫存' ? preview.inventory_available : undefined));
    const candidates=[sourceBefore,preview.before_qty,preview.available_before,preview.selected_available,item.available_qty,item.original_qty,preview.master_available,preview.order_available,preview.inventory_available];
    let before=0;
    for(const v of candidates){const n=Number(v);if(Number.isFinite(n)&&n>0){before=n;break;}}
    const shortage=Number(preview.shortage||preview.shortage_qty||0)>0||(before>0&&q>before);
    const after=before>0?Math.max(0,before-q):'';
    const loc=preview.location||preview.warehouse_location||preview.slot||'商品位置';
    return`<tr><td>${idx+1}</td><td>${esc(state.customer||item.customer||preview.customer||'')}</td><td><span class="mat-tag">${esc(item.material||preview.material||'未填材質')}</span></td><td>${esc(p.size)}${p.support?'='+esc(p.support):''}</td><td>${q}件</td><td>出貨源：${esc(shipSourceLabel(item,preview))}</td><td><button type="button" class="yx22-location-btn" data-prod="${esc(item.product_text||preview.product_text||preview.product||'')}">${esc(loc)}</button></td><td>${before>0?`${before} → ${after}`:'待確認'}</td><td>${shortage?'<span class="danger-text">不足</span>':'可出貨'}</td></tr>`;
  }
  async function confirmSubmit(){if(!state.customer)return toast('請先輸入客戶名稱','warn');if(!state.selected.length)return toast('請先加入出貨商品','warn');const overIdx=state.selected.findIndex(x=>warnOverQty(x));if(overIdx>=0){const o=warnOverQty(state.selected[overIdx]);renderSelected();toast(`第 ${overIdx+1} 筆出貨 ${o.q} 件大於可出貨 ${o.max} 件，不可扣除`,'error');document.querySelector(`[data-selected-card="${overIdx}"]`)?.scrollIntoView?.({behavior:'smooth',block:'center'});return;}const btn=$('submit-btn');if(btn){btn.disabled=true;btn.textContent='預覽中…';}const payload={customer_name:state.customer,items:state.selected,allow_inventory_fallback:true,skip_snapshot:true,request_key:'ship_single_'+Date.now()+'_'+Math.random().toString(36).slice(2)};try{const preview=await api('/api/ship-preview',{method:'POST',body:JSON.stringify(payload)});showPreview(preview,payload);}catch(e){toast(e.message||'出貨預覽失敗','error');}finally{if(btn){btn.disabled=false;btn.textContent='確認送出';}}}
  function showPreview(data,payload){const panel=$('ship-preview-panel')||$('module-result');if(!panel)return;const rows=Array.isArray(data.breakdown)?data.breakdown:(Array.isArray(data.items)?data.items:[]);const draft=payload.items||[];const calcRaw=data.calc||data.volume_calc||{};const calc=(calcRaw.rows||calcRaw.items)?calcRaw:localVolumeCalc(draft);const totalQty=Number(calc.total_qty||draft.reduce((a,b)=>a+selectedQtyOf(b),0));panel.classList.remove('hidden');panel.style.display='block';panel.innerHTML=`<div class="yx22-preview"><div class="yx22-preview-title">出貨預覽</div><div class="yx22-stat-grid"><div><span>本次出貨</span><b>${totalQty}</b><em>件</em></div><div><span>商品筆數</span><b>${draft.length||rows.length}</b><em>筆</em></div><div><span>材積合計</span><b>${Number(calc.total_volume||0).toFixed(2)}</b><em>才</em></div><div><span>扣除流程</span><b>預覽</b><em>確認後才扣</em></div></div><table class="yx22-preview-table"><thead><tr><th>#</th><th>客戶</th><th>材質</th><th>尺寸 / 支數</th><th>件數</th><th>出貨源</th><th>倉庫位置</th><th>扣前 → 扣後</th><th>狀態</th></tr></thead><tbody>${(draft.length?draft:rows).map((x,i)=>previewRowHtml(x,i,rows[i]||{})).join('')}</tbody></table><div class="yx22-calc-box"><div class="yx22-preview-title small">材積計算</div><table class="yx22-preview-table"><thead><tr><th>#</th><th>商品</th><th>支數總和</th><th>算式</th><th>材積</th></tr></thead><tbody>${calcRowsHtml(calc)}</tbody></table><div class="yx22-formula-total">總材積：${Number(calc.total_volume||0).toFixed(2)} 才</div></div><div class="yx22-weight"><label>重量</label><input id="yx22-weight" type="number" step="0.01" placeholder="輸入重量，自動算總重"><b id="yx22-total-weight">總重：--</b></div><div class="btn-row"><button class="primary-btn" id="yx22-confirm-ship" type="button">確認扣除</button><button class="ghost-btn" id="yx22-cancel-preview" type="button">取消</button></div></div>`;$('yx22-weight')?.addEventListener('input',e=>{const w=Number(e.target.value||0),v=Number(calc.total_volume||0),out=$('yx22-total-weight');if(out)out.textContent=w?`總重：${(w*v).toFixed(2)}`:'總重：--';});$('yx22-cancel-preview')?.addEventListener('click',()=>panel.classList.add('hidden'),{once:true});$('yx22-confirm-ship')?.addEventListener('click',async()=>{const b=$('yx22-confirm-ship');if(b){b.disabled=true;b.textContent='扣除中…';}try{await api('/api/ship',{method:'POST',body:JSON.stringify({...payload,request_key:'ship_confirm_'+Date.now()+'_'+Math.random().toString(36).slice(2)})});panel.innerHTML='<div class="success-card">出貨完成，已扣除並寫入今日異動</div>';state.selected=[];renderSelected();state.itemCache.delete(state.customer);await loadItems(state.customer,{force:true});toast('出貨完成','ok');}catch(e){toast(e.message||'出貨失敗','error');if(b){b.disabled=false;b.textContent='確認扣除';}}},{once:true});panel.scrollIntoView({behavior:'smooth',block:'start'});}
  window.confirmSubmit=confirmSubmit;window.__YX_SHIP_NATIVE_CONFIRM__=confirmSubmit;window.YX116ShipPicker={load:loadItems,addItem,renderItems,renderSelected,confirmSubmit};window.reverseLookup=function(){toast('請使用倉庫圖搜尋商品位置','warn');};
  function bind(){if(state.bound)return;state.bound=true;document.addEventListener('click',(e)=>{const c=e.target.closest('[data-ship-customer]');if(c){e.preventDefault();loadItems(c.dataset.shipCustomer).catch(err=>toast(err.message,'error'));return;}const add=e.target.closest('[data-ship-add-index]');if(add){e.preventDefault();addItem(add.dataset.shipAddIndex);return;}const rm=e.target.closest('[data-selected-remove]');if(rm){e.preventDefault();state.selected.splice(Number(rm.dataset.selectedRemove),1);renderSelected();return;}},true);document.addEventListener('keydown',(e)=>{if((e.target.id==='customer-name'||e.target.id==='ship-customer-search')&&e.key==='Enter'){e.preventDefault();loadItems(state.customer,{force:true}).catch(err=>toast(err.message,'error'));}},true);document.addEventListener('change',(e)=>{if(e.target.id==='ship-customer-item-select'&&e.target.value!==''){addItem(e.target.value);e.target.value='';}},true);document.addEventListener('input',(e)=>{if(e.target.id==='customer-name'||e.target.id==='ship-customer-search'){setCustomer(e.target.value);renderCustomers();renderItems();}if(e.target.matches('[data-support-editor]'))updateSelectedProductFromSupport(Number(e.target.dataset.supportEditor),e.target.value);},true);}
  function install(){document.documentElement.dataset.yxShipSingle='locked-one-line-html-v12';bind();loadCustomers();window.addEventListener('yx:customers-loaded',e=>{state.customers=Array.isArray(e.detail?.items)?e.detail.items:state.customers;},false);window.addEventListener('yx:customer-selected',e=>{const name=clean(e.detail?.name||'');if(name)loadItems(name,{force:true}).catch(err=>toast(err.message,'error'));},false);renderSelected();const name=clean($('customer-name')?.value||'');if(name)loadItems(name).catch(()=>{});else renderItems();window.confirmSubmit=confirmSubmit;}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();

/* ===== END static/yx_modules/ship_single_lock.js ===== */

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

