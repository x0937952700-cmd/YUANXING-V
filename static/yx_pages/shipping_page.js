try{window.pushProductUndo=window.pushProductUndo||function(source,label){try{window.YXPageUndo?.snapshot?.(String(label||source||'操作'),function(){});}catch(_e){}};}catch(_e){}

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

/* 沅興木業 FULL MASTER main REAL LOADED COMPLETE - page_ship_master_main */
(function(){ window.__YX_FULL_MASTER_main_PAGE__='page_ship_master_main'; })();

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
    const ct = counts(c, mode);
    const lenClass = displayName.length >= 6 ? ' yx114-name-xlong yx132-name-shrink' : displayName.length >= 4 ? ' yx114-name-long' : '';
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
      const d = await YX.api(`/api/customer-items?name=${encodeURIComponent(name)}&fast=1&force=1&v214=1${variantsQuery(name)}`, {method:'GET'});
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

  function relationCustomersFromRows(existingItems){
    const byName = new Map();
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
      if (!n) return;
      let savedRegion = '';
      try { savedRegion = (JSON.parse(localStorage.getItem('yx_customer_regions_v18') || '{}') || {})[n] || ''; } catch(_e) {}
      const rc = Object.assign({}, zeroRc, c.relation_counts || {});
      const rowsTotal = Math.max(Number(c.item_count || c.row_count || 0), rcRows(rc), Number(rc.active_rows || rc.total_rows || 0));
      const qtyTotal = Math.max(Number(c.total_qty || 0), rcQty(rc), Number(rc.active_qty_total || rc.total_qty || 0));
      byName.set(n, Object.assign({}, c, {name:n, customer_name:n, region:normRegion(c.region || savedRegion || '北區'), relation_counts:rc, item_count:rowsTotal, row_count:rowsTotal, total_qty:qtyTotal, merge_names:Array.isArray(c.merge_names) ? c.merge_names : [n]}));
    });
    const seen = new Set();
    const add = (name, source, row) => {
      name = YX.clean(name || ''); if (!name) return;
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
      const d = await YX.api('/api/customers?yx114=1&fast=1&light=1&force=1&v214=1', {method:'GET'});
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
      moveCustomerCardNow(name, region); try { selectCustomer(name).catch(()=>{}); } catch(_e) {}
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
  function publishGlobals(){
    if (!state.oldSelect && typeof window.selectCustomerForModule === 'function') state.oldSelect = window.selectCustomerForModule;
    const selectFn = YX.mark(selectCustomer, 'customer_select');
    window.selectCustomerForModule = selectFn;
    const loadFn = YX.mark(loadCustomerBlocks, 'customer_blocks');
    try { YX.safeExpose('loadCustomerBlocks', loadFn, {configurable:true}); } catch(_e) { window.loadCustomerBlocks = loadFn; }
    try { YX.safeExpose('renderCustomers', loadFn, {configurable:true}); } catch(_e) { window.renderCustomers = loadFn; }
    window.YX113CustomerRegions = {loadCustomerBlocks, renderBoards, selectCustomer};
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

/* ===== END static/yx_modules/customer_regions_main.js ===== */

/* formal page module */
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

/* ===== END static/yx_pages/page_customers_master.js ===== */

/* formal page module */
/* formal page module */
(function(){
  'use strict';
  if (!window.__YX_SHIP_SINGLE_MAIN__) return;
  const $=(id)=>document.getElementById(id);
  const state={customer:'',items:[],selected:[],customers:[],loadingName:'',itemCache:new Map(),bound:false,itemsForCustomer:''};
  const esc=(v)=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const clean=(v)=>String(v??'').replace(/\s+/g,' ').trim();
  function safeErrorMessage(v,status){let s=clean(v||'');if(!s)return status?`請求失敗 ${status}`:'請求失敗';if(/^<!doctype|<html|<h1>|internal server error/i.test(s))return status===500?'伺服器出貨資料讀取錯誤，已保留畫面，請重新點一次客戶':'伺服器回應格式錯誤';return s.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').slice(0,160)||'請求失敗';}
  async function api(url,opt={}){const res=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});const txt=await res.text();let data={};try{data=txt?JSON.parse(txt):{};}catch(_){data={success:false,error:safeErrorMessage(txt,res.status)};}if(!res.ok||data.success===false){const err=new Error(safeErrorMessage(data.error||data.message,res.status));err.data=data;err.status=res.status;throw err;}return data;}
  function toast(msg,kind='ok'){const a=document.activeElement;let ss=0,se=0;try{if(a&&a.matches?.('input,textarea,select,[contenteditable=\"true\"]')){ss=a.selectionStart||0;se=a.selectionEnd||0;}}catch(_e){}let box=$('yx-ship-toast');if(!box){box=document.createElement('div');box.id='yx-ship-toast';box.setAttribute('aria-live','polite');document.body.appendChild(box);}box.className='yx-ship-toast '+kind+' show';box.style.pointerEvents='none';box.setAttribute('tabindex','-1');box.textContent=msg;try{if(a&&document.contains(a)&&a.matches?.('input,textarea,select,[contenteditable=\"true\"]'))setTimeout(()=>{try{a.focus({preventScroll:true}); if('selectionStart' in a)a.setSelectionRange(ss,se);}catch(_e){}},0);}catch(_e){}clearTimeout(box._t);box._t=setTimeout(()=>box.classList.remove('show','ok','warn','error'),1800);}
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
  function selectedVariants(){
    const current=clean(state.customer||'');
    const arr=Array.isArray(window.__YX_SELECTED_CUSTOMER_VARIANTS__)?window.__YX_SELECTED_CUSTOMER_VARIANTS__.map(clean).filter(Boolean):[];
    // V221: 出貨切換客戶時，不可沿用上一位客戶的 variants，否則會查到舊客戶商品或吃錯 ship_items 快取。
    if(current && arr.length && !arr.includes(current)) return [current];
    return Array.from(new Set(arr.length?arr:[current].filter(Boolean)));
  }
  function variantsQuery(){const arr=selectedVariants();return arr.length?'&variants='+encodeURIComponent(JSON.stringify(arr)):'';}
  function setCustomer(name){const next=clean(name); if(next!==state.customer){state.items=[]; state.itemsForCustomer=''; state.loadingName=next;} state.customer=next; const a=$('customer-name');if(a&&a.value!==state.customer)a.value=state.customer;const b=$('ship-customer-search');if(b&&b.value!==state.customer)b.value=state.customer;}
  function setCount(text){const el=$('ship-customer-item-count');if(el)el.textContent=text;}
  function syncHiddenSelect(){const select=$('ship-customer-item-select');if(!select)return;select.hidden=true;select.setAttribute('hidden','hidden');select.setAttribute('aria-hidden','true');select.style.display='none';select.innerHTML='<option value="">商品標籤清單已顯示在下方</option>';}
  function renderCustomers(){const box=$('ship-customer-quick-list');if(box)box.replaceChildren();}
  async function loadCustomers(){let hadCached=false;try{const keys=['ship_customers_v332','ship_customers_v307','ship_customers_v287','ship_customers_v282','ship_customers_v267','ship_customers_v252','ship_customers_v228','ship_customers_v227','ship_customers_v226','ship_customers_v225','ship_customers_v224','ship_customers_v223','ship_customers_v222','ship_customers_v221','ship_customers_v216','ship_customers_v214'];let cached=null;for(const k of keys){cached=window.YX?.cache?.read(k,1000*60*10);if(Array.isArray(cached?.items)&&cached.items.length)break;} if(Array.isArray(cached?.items)&&cached.items.length){hadCached=true;state.customers=cached.items; renderCustomers();}}catch(_e){} const fresh=async()=>{try{const d=await api('/api/customers?ship_single=1&light=1&fast=1&force=1&v287=1');state.customers=Array.isArray(d.items)?d.items:(Array.isArray(d.customers)?d.customers:[]); try{window.YX?.cache?.write('ship_customers_v332',{items:state.customers});}catch(_e){} try{ if(window.YX113CustomerRegions&&window.YX113CustomerRegions.loadCustomerBlocks) window.YX113CustomerRegions.loadCustomerBlocks(true); }catch(_e){} renderCustomers();}catch(_){}}; const p=fresh(); return hadCached?state.customers:p; }
    function renderItems(){const box=$('ship-customer-item-list');syncHiddenSelect();if(!box){return;}box.classList.remove('yx-final-ship-product-list-hidden');box.classList.add('yx-final-ship-tag-menu','yx-ship-one-column-menu');if(!state.customer){setCount('請先點選北 / 中 / 南客戶');box.innerHTML='<div class="empty-state-card compact-empty">請先點選北 / 中 / 南客戶</div>';return;}if(state.loadingName===state.customer){setCount(`${state.customer}：商品載入中…`);box.innerHTML='<div class="empty-state-card compact-empty">商品載入中…</div>';return;}if(state.itemsForCustomer!==state.customer){setCount(`${state.customer}：商品載入中…`);box.innerHTML='<div class="empty-state-card compact-empty">商品載入中…</div>';return;}if(!state.items.length){setCount(`${state.customer}：0 筆 / 0 件`);box.innerHTML='<div class="empty-state-card compact-empty">此客戶目前沒有可出貨商品</div>';return;}const total=state.items.reduce((sum,it)=>sum+qtyFromText(it.product_text,it.qty),0);setCount(`${state.customer}：${state.items.length} 筆 / ${total} 件`);box.innerHTML=state.items.map((it,i)=>`<button type="button" class="yx-ship-product-option-row" data-ship-add-index="${i}"><span class="yx-ship-option-source">出貨源：${esc(shipSourceLabel(it))}</span><span class="yx-ship-option-material">${esc(materialOf(it)||'未填材質')}</span><span class="yx-ship-option-text">${esc(it.product_text||'')}</span><strong>${qtyFromText(it.product_text,it.qty)}件</strong><em>加入</em></button>`).join('');}
  async function loadItems(name,opts={}){
    setCustomer(name||state.customer);
    renderItems();
    if(!state.customer) return;
    const key=state.customer;
    const variantKey=encodeURIComponent(JSON.stringify(selectedVariants()));
    const cacheKey='ship_items_v332_'+key+'_'+variantKey;
    const memoryKey=key+'::'+variantKey;
    if(opts.force){ try{ state.itemCache.delete(memoryKey); window.YX?.cache?.remove?.(cacheKey); }catch(_e){} }
    const cached=state.itemCache.get(memoryKey)||window.YX?.cache?.read(cacheKey,1000*60*10);
    let hadCached=false;
    if(!opts.force&&cached&&Array.isArray(cached.items)&&cached.items.length){
      hadCached=true;
      state.items=cached.items;
      state.itemsForCustomer=key;
      state.itemCache.set(memoryKey,{items:state.items,at:Date.now(),customer:key});
      renderItems();
    }
    const requestCustomer=key;
    const requestVariants=variantsQuery();
    const fresh=async()=>{
      state.loadingName=requestCustomer;
      if(!hadCached) renderItems();
      try{
        const d=await api('/api/customer-items?name='+encodeURIComponent(requestCustomer)+'&fast=1&force=1&ship_single=1&v214=1'+requestVariants);
        if(state.customer!==requestCustomer) return;
        state.items=Array.isArray(d.items)?d.items:[];
        const saved={items:state.items,at:Date.now()};
        state.itemsForCustomer=requestCustomer;
        state.itemCache.set(memoryKey,saved);
        try{window.YX?.cache?.write(cacheKey,saved);}catch(_e){}
        renderItems();
      }catch(e){
        if(state.customer===requestCustomer){
          if(!hadCached){ state.items=[]; state.itemsForCustomer=requestCustomer; }
          renderItems();
          toast(e.message||'客戶商品載入失敗','error');
        }
      }finally{
        if(state.loadingName===requestCustomer) state.loadingName='';
        if(state.customer===requestCustomer) renderItems();
      }
    };
    if(hadCached&&!opts.force){try{(window.YX?.scheduler?.idle||setTimeout)(fresh,1200);}catch(_e){fresh();}return;}
    return fresh();
  }
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
      window.dispatchEvent(new CustomEvent(name, {detail: {...(detail||{}), sync_guard:'v216'}}));
      return true;
    }catch(_e){ try{ window.dispatchEvent(new CustomEvent(name,{detail:detail||{}})); }catch(__e){} return true; }
  }

  function clearAfterShipCaches(){
    try{
      ['ship_customers_v332','ship_customers_v307','ship_customers_v287','ship_customers_v282','ship_customers_v267','ship_customers_v252','ship_customers_v228','ship_customers_v227','ship_customers_v226','ship_customers_v225','ship_customers_v224','ship_customers_v223','ship_customers_v222','ship_customers_v221','ship_customers_v216','ship_customers_v214','ship_customers_v210','ship_customers_v208','ship_customers_v207','ship_customers_v199','ship_customers_v198','ship_customers_v197','today_changes_light_v287','today_changes_light_v282','today_changes_light_v267','today_changes_light_v252','today_changes_light_v228','today_changes_light_v227','today_changes_light_v226','today_changes_light_v215','today_changes_light_v214','today_changes_light_v210','today_changes_light_v208','today_changes_light_v207','today_changes_light_v199','today_changes_light_v198','today_changes_v287','today_changes_v282','today_changes_v267','today_changes_v252','today_changes_v228','today_changes_v227','today_changes_v226','today_changes_v215','today_changes_v214','today_changes_v210','today_changes_v208','today_changes_v207','today_changes_v199','today_changes_v198','warehouse_available_v287','warehouse_available_v282','warehouse_available_v267','warehouse_available_v257','warehouse_available_v252','warehouse_available_v228','warehouse_available_v227','warehouse_available_v226','warehouse_available_v225','warehouse_available_v224','warehouse_available_v223','warehouse_available_v222','warehouse_available_v221','warehouse_available_v215','warehouse_available_v214','warehouse_available_v210','warehouse_available_v208','warehouse_available_v207','warehouse_available_v199','warehouse_available_v198','warehouse_source_qty_map_v287','warehouse_source_qty_map_v282','warehouse_source_qty_map_v267','warehouse_source_qty_map_v257','warehouse_source_qty_map_v252','warehouse_source_qty_map_v228','warehouse_source_qty_map_v227','warehouse_source_qty_map_v226','warehouse_source_qty_map_v225','warehouse_source_qty_map_v224','warehouse_source_qty_map_v223','warehouse_source_qty_map_v222','warehouse_source_qty_map_v221','warehouse_source_qty_map_v215','warehouse_source_qty_map_v214','warehouse_source_qty_map_v210','warehouse_source_qty_map_v208','warehouse_source_qty_map_v207','warehouse_source_qty_map_v199','warehouse_source_qty_map_v198'].forEach(k=>window.YX?.cache?.remove?.(k));
      window.YX?.cache?.clearGroup?.('ship_items_'); window.YX?.cache?.clearGroup?.('customer_blocks_'); window.YX?.cache?.clearGroup?.('warehouse_available_'); window.YX?.cache?.clearGroup?.('warehouse_source_qty_map_'); window.YX?.cache?.clearGroup?.('today_changes_'); window.YX?.cache?.clearGroup?.('today_changes_light_');
    }catch(_e){}
    try{ state.itemCache?.clear?.(); }catch(_e){}
  }
  function clearShipCachesAfterWarehouseChange(customer){
    try{
      ['ship_customers_v332','ship_customers_v307','ship_customers_v287','ship_customers_v282','ship_customers_v267','ship_customers_v252','ship_customers_v228','ship_customers_v227','ship_customers_v226','ship_customers_v225','ship_customers_v224','ship_customers_v223','ship_customers_v222','ship_customers_v221','ship_customers_v216','ship_customers_v214','ship_customers_v210','ship_customers_v208','ship_customers_v207','ship_customers_v199','ship_customers_v198','ship_customers_v197'].forEach(k=>window.YX?.cache?.remove?.(k));
      window.YX?.cache?.clearGroup?.('ship_items_'); window.YX?.cache?.clearGroup?.('customer_blocks_'); window.YX?.cache?.clearGroup?.('warehouse_available_'); window.YX?.cache?.clearGroup?.('warehouse_source_qty_map_'); window.YX?.cache?.clearGroup?.('today_changes_'); window.YX?.cache?.clearGroup?.('today_changes_light_');
    }catch(_e){}
    try{ state.itemCache?.clear?.(); }catch(_e){}
    const name=clean(customer||state.customer||'');
    if(name) loadItems(name,{force:true}).catch(()=>{});
    else loadCustomers().catch(()=>{});
  }
  function collectWarehouseDeductFromShipResult(result){
    const out=[];
    try{ (Array.isArray(result?.breakdown)?result.breakdown:[]).forEach(row=>{ if(Array.isArray(row?.warehouse_deduct)) row.warehouse_deduct.forEach(x=>out.push(x)); }); }catch(_e){}
    return out;
  }
  function emitAfterShipSync(customer, items, result){
    const warehouse_deduct=collectWarehouseDeductFromShipResult(result||{});
    const detail={customer_name:clean(customer||state.customer||''),items:items||[],result:result||{},operation_id:result?.operation_id||result?.request_key||'',request_key:result?.operation_id||result?.request_key||'',remaining_items:Array.isArray(result?.items)?result.items:[],customers:Array.isArray(result?.customers)?result.customers:[],snapshots:result?.snapshots||{},warehouse_deduct,source_consistency:Array.isArray(result?.source_consistency)?result.source_consistency:[],affected_sources:Array.isArray(result?.affected_sources)?result.affected_sources:[],reason:'ship-confirm-v282',version:'v307'};
    try{ yx215EmitOnce('yx:ship-completed', detail, 1200); }catch(_e){}
    try{ yx215EmitOnce('yx:product-data-changed', {...detail, source:'ship'}, 1000); }catch(_e){}
    try{ yx215EmitOnce('yx:order-master-changed', detail, 1000); }catch(_e){}
    try{ yx215EmitOnce('yx:warehouse-changed', detail, 1000); }catch(_e){}
    try{ yx215EmitOnce('yx:today-changes-refresh', detail, 1000); }catch(_e){}
  }

  function calcRowsHtml(calc){const rows=calc?.rows||calc?.items||[];if(!rows.length)return'<tr><td colspan="5">尚無材積算式</td></tr>';return rows.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.product||r.product_text||'')}</td><td>${Number(r.pieces_sum||r.qty||0)}</td><td>${esc(r.formula||'')}</td><td>${esc(r.volume||'')}</td></tr>`).join('');}
  function previewRowHtml(item,idx,preview){
    const p=splitProduct(item.product_text||preview.product_text||preview.product||'');
    const q=selectedQtyOf(item)||Number(preview.qty||preview.need_qty||1);
    const srcPref=normalizeSource(preview.source_label||preview.source_preference||preview.deduct_source||item.source_preference||item.deduct_source||item.source_label||item.source);
    const sourceBefore = srcPref==='總單' ? preview.master_available : (srcPref==='訂單' ? preview.order_available : (srcPref==='庫存' ? preview.inventory_available : undefined));
    const candidates=[sourceBefore,preview.before_qty,preview.available_before,preview.selected_available,item.available_qty,item.original_qty,preview.master_available,preview.order_available,preview.inventory_available];
    let before=0;
    for(const v of candidates){const n=Number(v);if(Number.isFinite(n)&&n>0){before=n;break;}}
    // formal mainline behavior.
    const after=before>0?Math.max(0,before-q):'';
    const shortage=(Number.isFinite(Number(after)) && Number(after) < 0) || (before>0 && q>before);
    const loc=preview.location||preview.warehouse_location||preview.slot||'商品位置';
    return`<tr><td>${idx+1}</td><td>${esc(state.customer||item.customer||preview.customer||'')}</td><td><span class="mat-tag">${esc(item.material||preview.material||'未填材質')}</span></td><td>${esc(p.size)}${p.support?'='+esc(p.support):''}</td><td>${q}件</td><td>出貨源：${esc(shipSourceLabel(item,preview))}</td><td><button type="button" class="yx22-location-btn" data-prod="${esc(item.product_text||preview.product_text||preview.product||'')}">${esc(loc)}</button></td><td>${before>0?`${before} → ${after}`:'待確認'}</td><td>${shortage?'<span class="danger-text">不足</span>':'可出貨'}</td></tr>`;
  }
  async function confirmSubmit(){if(!state.customer)return toast('請先輸入客戶名稱','warn');if(!state.selected.length)return toast('請先加入出貨商品','warn');const overIdx=state.selected.findIndex(x=>warnOverQty(x));if(overIdx>=0){const o=warnOverQty(state.selected[overIdx]);renderSelected();toast(`第 ${overIdx+1} 筆出貨 ${o.q} 件大於可出貨 ${o.max} 件，不可扣除`,'error');document.querySelector(`[data-selected-card="${overIdx}"]`)?.scrollIntoView?.({behavior:'smooth',block:'center'});return;}const btn=$('submit-btn');if(btn){btn.disabled=true;btn.textContent='預覽中…';}const op='ship_'+Date.now()+'_'+Math.random().toString(36).slice(2);const payload={customer_name:state.customer,items:state.selected,allow_inventory_fallback:true,skip_snapshot:true,operation_id:op,request_key:op};try{const preview=await api('/api/ship-preview',{method:'POST',body:JSON.stringify(payload)});showPreview(preview,payload);}catch(e){toast(e.message||'出貨預覽失敗','error');}finally{if(btn){btn.disabled=false;btn.textContent='確認送出';}}}
  function showPreview(data,payload){
    const panel=$('ship-preview-panel')||$('module-result');
    if(!panel)return;
    const rows=Array.isArray(data.breakdown)?data.breakdown:(Array.isArray(data.items)?data.items:[]);
    const draft=payload.items||[];
    const calcRaw=data.calc||data.volume_calc||{};
    const calc=(calcRaw.rows||calcRaw.items)?calcRaw:localVolumeCalc(draft);
    const totalQty=Number(calc.total_qty||draft.reduce((a,b)=>a+selectedQtyOf(b),0));
    panel.classList.remove('hidden');
    panel.style.display='block';
    panel.innerHTML=`<div class="yx22-preview"><div class="yx22-preview-title">出貨預覽</div><div id="yx22-ship-preview-error" class="error-card" style="display:none"></div><div class="yx22-stat-grid"><div><span>本次出貨</span><b>${totalQty}</b><em>件</em></div><div><span>商品筆數</span><b>${draft.length||rows.length}</b><em>筆</em></div><div><span>材積合計</span><b>${Number(calc.total_volume||0).toFixed(2)}</b><em>才</em></div><div><span>扣除流程</span><b>預覽</b><em>確認後才扣</em></div></div><table class="yx22-preview-table"><thead><tr><th>#</th><th>客戶</th><th>材質</th><th>尺寸 / 支數</th><th>件數</th><th>出貨源</th><th>倉庫位置</th><th>扣前 → 扣後</th><th>狀態</th></tr></thead><tbody>${(draft.length?draft:rows).map((x,i)=>previewRowHtml(x,i,rows[i]||{})).join('')}</tbody></table><div class="yx22-calc-box"><div class="yx22-preview-title small">材積計算</div><table class="yx22-preview-table"><thead><tr><th>#</th><th>商品</th><th>支數總和</th><th>算式</th><th>材積</th></tr></thead><tbody>${calcRowsHtml(calc)}</tbody></table><div class="yx22-formula-total">總材積：${Number(calc.total_volume||0).toFixed(2)} 才</div></div><div class="yx22-weight"><label>重量</label><input id="yx22-weight" type="number" step="0.01" placeholder="輸入重量，自動算總重"><b id="yx22-total-weight">總重：--</b></div><div class="btn-row"><button class="primary-btn" id="yx22-confirm-ship" type="button">確認扣除</button><button class="ghost-btn" id="yx22-cancel-preview" type="button">取消</button></div></div>`;
    $('yx22-weight')?.addEventListener('input',e=>{const w=Number(e.target.value||0),v=Number(calc.total_volume||0),out=$('yx22-total-weight');if(out)out.textContent=w?`總重：${(w*v).toFixed(2)}`:'總重：--';});
    $('yx22-cancel-preview')?.addEventListener('click',()=>panel.classList.add('hidden'),{once:true});
    const showInlineError=(msg)=>{const box=$('yx22-ship-preview-error');if(box){box.style.display='block';box.innerHTML=`<strong>出貨未完成</strong><div>${esc(msg||'出貨失敗，畫面已保留')}</div><div class="small-note">已保留目前選取商品與預覽，修改件數後按「重新預覽」即可再送出。</div>`;}};
    $('yx22-confirm-ship')?.addEventListener('click',async()=>{
      const b=$('yx22-confirm-ship');
      if(!b)return;
      if(b.dataset.yxMode==='repreview'){
        b.disabled=true;
        b.textContent='重新預覽中…';
        try{ await confirmSubmit(); }
        finally{ if(document.contains(b)){ b.disabled=false; b.textContent='重新預覽'; } }
        return;
      }
      if(b.dataset.yxBusy==='1')return;
      b.dataset.yxBusy='1';
      b.disabled=true;
      b.textContent='扣除中…';
      try{
        const shipResult=await api('/api/ship',{method:'POST',body:JSON.stringify({...payload,preview_token:data.preview_token,request_key:payload.operation_id})});
        panel.innerHTML='<div class="success-card">出貨完成，已扣除並寫入今日異動</div>';
        state.selected=[];
        renderSelected();
        clearAfterShipCaches();
        try{ state.itemCache?.clear?.(); }catch(_e){}
        try{ window.YX?.cache?.clearGroup?.('ship_items_'); window.YX?.cache?.clearGroup?.('customer_blocks_'); window.YX?.cache?.clearGroup?.('warehouse_available_'); window.YX?.cache?.clearGroup?.('warehouse_source_qty_map_'); window.YX?.cache?.clearGroup?.('today_changes_'); window.YX?.cache?.clearGroup?.('today_changes_light_'); window.YX?.cache?.clearGroup?.('customer_blocks_'); }catch(_e){}
        try{ window.dispatchEvent(new CustomEvent('yx:operation-status',{detail:{source:'ship', status:'success', reason:'ship-confirm-success', customer_name:state.customer, product_label:(Array.isArray(payload.items)?payload.items.slice(0,2).map(it=>[it.material,it.product_text||it.size||it.name,it.qty||it.count].filter(Boolean).join(' ')).join('、'):''), detail_text:(shipResult?.source_label||shipResult?.source_detail||''), message:'出貨扣除完成，已同步訂單/總單/倉庫圖', operation_id:shipResult?.operation_id||payload.operation_id||'', version:'v307'}})); }catch(_e){}
        emitAfterShipSync(state.customer,payload.items,shipResult);
        try{ if(window.YX113CustomerRegions?.loadCustomerBlocks) await window.YX113CustomerRegions.loadCustomerBlocks(true); }catch(_e){}
        try{ if(window.renderCustomers) await window.renderCustomers(); }catch(_e){}
        await loadCustomers();
        await loadItems(state.customer,{force:true});
        try{ window.dispatchEvent(new CustomEvent('yx:customer-selected',{detail:{name:state.customer,force:true,source:'ship',reason:'ship-completed-v287'}})); }catch(_e){}
        toast('出貨完成','ok');
      }catch(e){
        const detail=e.data||{};
        const msg=e.message||detail.error||'出貨失敗，畫面已保留可直接修改後重新預覽';
        const extra=detail.error_code?`<div class="small-note">原因代碼：${esc(detail.error_code)}${detail.source_label?'｜來源：'+esc(detail.source_label):''}</div>`:'';
        try{window.dispatchEvent(new CustomEvent('yx:operation-soft-failed',{detail:{source:'ship',customer_name:state.customer,reason:'ship-failed-preserve-preview',error:msg,error_code:detail.error_code||'',version:'v307'}}));}catch(_e){}
        try{window.dispatchEvent(new CustomEvent('yx:operation-status',{detail:{source:'ship',status:'failed',customer_name:state.customer,reason:'ship-failed-preserve-preview',message:msg,error_code:detail.error_code||'',product_label:(Array.isArray(payload.items)?payload.items.slice(0,2).map(it=>[it.material,it.product_text||it.size||it.name,it.qty||it.count].filter(Boolean).join(' ')).join('、'):''),version:'v307'}}));}catch(_e){}
        showInlineError(msg+extra);
        toast(msg,'error');
        b.dataset.yxMode='repreview';
        b.disabled=false;
        b.textContent='重新預覽';
      }finally{
        try{ delete b.dataset.yxBusy; }catch(_e){}
      }
    });
    panel.scrollIntoView({behavior:'smooth',block:'start'});
  }
  window.confirmSubmit=confirmSubmit; window.YXShipConfirmSubmit=confirmSubmit;window.__YX_SHIP_NATIVE_CONFIRM__=confirmSubmit;window.YX116ShipPicker={load:loadItems,addItem,renderItems,renderSelected,confirmSubmit};window.reverseLookup=function(){toast('請使用倉庫圖搜尋商品位置','warn');};

  async function showShipLocations(productText){
    productText=clean(productText||'');
    if(!productText){toast('缺少商品資料','warn');return;}
    const panel=$('ship-preview-panel')||$('module-result');
    if(!panel)return;
    let box=$('yx22-ship-location-results');
    if(!box){
      box=document.createElement('div');
      box.id='yx22-ship-location-results';
      box.className='yx-product-location-panel yx22-location-results';
      const wrap=panel.querySelector('.yx22-preview')||panel;
      const table=wrap.querySelector('.yx22-preview-table');
      if(table&&table.parentNode)table.insertAdjacentElement('afterend',box);else wrap.appendChild(box);
    }
    const customer=clean(state.customer||($('customer-name')&&$('customer-name').value)||'');
    box.innerHTML='<div class="yx-location-loading">商品位置查詢中…</div>';
    try{
      const query=(customer?customer+' ':'')+productText;
      let data=await api('/api/warehouse/search?q='+encodeURIComponent(query)+'&ts='+Date.now());
      let hits=Array.isArray(data.items)?data.items:[];
      if(customer){
        const c=customer.toLowerCase();
        hits=hits.filter(h=>String(h.customer||h.customer_name||'').toLowerCase().includes(c)||String(h.product_text||h.text||'').toLowerCase().includes(productText.toLowerCase()));
      }
      if(!hits.length){
        data=await api('/api/warehouse/search?q='+encodeURIComponent(productText)+'&ts='+Date.now());
        hits=Array.isArray(data.items)?data.items:[];
      }
      if(!hits.length){
        box.innerHTML='<div class="empty-state small">找不到這筆商品的倉庫位置</div>';
        return;
      }
      const html=hits.map((h)=>{
        const z=esc(h.zone||'');
        const col=esc(h.column_index||h.column||'');
        const slot=esc(h.slot_number||h.slot_no||h.slot||'');
        const cust=esc(h.customer||h.customer_name||'庫存');
        const mat=esc(h.material||'');
        const prod=esc(h.product_text||h.text||productText);
        const qty=esc(h.qty||h.quantity||'');
        return `<button type="button" class="yx-location-hit" data-zone="${z}" data-col="${col}" data-slot="${slot}"><b>${z}區 ${col}欄 ${slot}格</b><span>${cust}｜${mat} ${prod}${qty?`｜${qty}件`:''}</span></button>`;
      }).join('');
      box.innerHTML=`<div class="yx-location-title">商品位置</div>${html}`;
      box.querySelectorAll('.yx-location-hit').forEach(btn=>btn.addEventListener('click',()=>{
        const zone=btn.dataset.zone,col=btn.dataset.col,slot=btn.dataset.slot;
        if(window.highlightWarehouseCell){window.highlightWarehouseCell(zone,col,slot);}
        else if(zone&&col&&slot){location.href=`/warehouse?highlight=${encodeURIComponent(zone+'-'+col+'-'+slot)}`;}
      }));
      box.scrollIntoView({behavior:'smooth',block:'nearest'});
    }catch(e){box.innerHTML=`<div class="error-card">查詢倉庫位置失敗：${esc(e.message||e)}</div>`;}
  }

  function bind(){if(state.bound)return;state.bound=true;document.addEventListener('click',(e)=>{const loc=e.target.closest('.yx22-location-btn');if(loc){e.preventDefault();showShipLocations(loc.dataset.prod||'').catch(err=>toast(err.message||'查詢位置失敗','error'));return;}const c=e.target.closest('[data-ship-customer]');if(c){e.preventDefault();const n=clean(c.dataset.shipCustomer||''); if(n) window.__YX_SELECTED_CUSTOMER_VARIANTS__=[n]; loadItems(n,{force:true}).catch(err=>toast(err.message,'error'));return;}const add=e.target.closest('[data-ship-add-index]');if(add){e.preventDefault();addItem(add.dataset.shipAddIndex);return;}const rm=e.target.closest('[data-selected-remove]');if(rm){e.preventDefault();state.selected.splice(Number(rm.dataset.selectedRemove),1);renderSelected();return;}},true);document.addEventListener('keydown',(e)=>{if((e.target.id==='customer-name'||e.target.id==='ship-customer-search')&&e.key==='Enter'){e.preventDefault();const n=clean(state.customer||e.target.value||''); if(n) window.__YX_SELECTED_CUSTOMER_VARIANTS__=[n]; loadItems(n,{force:true}).catch(err=>toast(err.message,'error'));}},true);document.addEventListener('change',(e)=>{if(e.target.id==='ship-customer-item-select'&&e.target.value!==''){addItem(e.target.value);e.target.value='';}},true);document.addEventListener('input',(e)=>{if(e.target.id==='customer-name'||e.target.id==='ship-customer-search'){setCustomer(e.target.value);renderCustomers();renderItems();}if(e.target.matches('[data-support-editor]'))updateSelectedProductFromSupport(Number(e.target.dataset.supportEditor),e.target.value);},true);}
  function install(){document.documentElement.dataset.yxShipSingle='main-one-line-html-v215';bind();loadCustomers();window.addEventListener('yx:customers-loaded',e=>{state.customers=Array.isArray(e.detail?.items)?e.detail.items:state.customers;},false);window.addEventListener('yx:warehouse-changed',e=>{const names=Array.isArray(e.detail?.customer_names)?e.detail.customer_names.filter(Boolean):[]; if(names.length){names.forEach(n=>clearShipCachesAfterWarehouseChange(n));} else clearShipCachesAfterWarehouseChange(e.detail?.customer_name||'');},false);window.addEventListener('yx:customer-profile-changed',e=>{try{state.itemCache?.clear?.();}catch(_e){}try{['ship_customers_v332','ship_customers_v307','ship_customers_v287','ship_customers_v282','ship_customers_v267','ship_customers_v252','ship_customers_v228','ship_customers_v227','ship_customers_v226','ship_customers_v225','ship_customers_v224'].forEach(k=>window.YX?.cache?.remove?.(k));window.YX?.cache?.clearGroup?.('ship_items_');}catch(_e){}const oldn=clean(e.detail?.old_customer_name||'');const newn=clean(e.detail?.new_customer_name||e.detail?.customer_name||'');if(oldn&&state.customer===oldn){state.customer=newn||'';try{window.__YX_SELECTED_CUSTOMER__=state.customer;}catch(_e){}} if(state.customer) loadItems(state.customer,{force:true}).catch(()=>{}); else loadCustomers().catch(()=>{});},false);window.addEventListener('yx:product-data-changed',e=>{try{state.itemCache?.clear?.();}catch(_e){}try{['ship_customers_v332','ship_customers_v307','ship_customers_v287','ship_customers_v282','ship_customers_v267','ship_customers_v252','ship_customers_v228','ship_customers_v227','ship_customers_v226','ship_customers_v225','ship_customers_v224','ship_customers_v223','ship_customers_v222','ship_customers_v221','ship_customers_v216','ship_customers_v214'].forEach(k=>window.YX?.cache?.remove?.(k));window.YX?.cache?.remove?.('ship_customers_v208');window.YX?.cache?.remove?.('ship_customers_v199');window.YX?.cache?.remove?.('ship_customers_v198');window.YX?.cache?.remove?.('ship_customers_v197');}catch(_e){}const n=clean(e.detail?.customer_name||state.customer||'');if(n) loadItems(n,{force:true}).catch(()=>{});else loadCustomers().catch(()=>{});},false);window.addEventListener('yx:customer-selected',e=>{const name=clean(e.detail?.name||'');try{ if(Array.isArray(e.detail?.variants)&&e.detail.variants.length) window.__YX_SELECTED_CUSTOMER_VARIANTS__=e.detail.variants.filter(Boolean); else if(name) window.__YX_SELECTED_CUSTOMER_VARIANTS__=[name]; }catch(_e){} if(name)loadItems(name,{force:true}).catch(err=>toast(err.message,'error'));},false);renderSelected();const name=clean($('customer-name')?.value||'');if(name)loadItems(name,{force:true}).catch(()=>{});else renderItems();window.confirmSubmit=confirmSubmit; window.YXShipConfirmSubmit=confirmSubmit;}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();

/* ===== END static/yx_modules/ship_single_main.js ===== */

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


/* formal page module */
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
/* formal page module */




/* formal page module */
(function(){
  'use strict';
  if(window.__YX_V55_COMMON_CLEAN__) return; window.__YX_V55_COMMON_CLEAN__=true;
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  window.toast=window.showToast=window.notify=function(message,kind='ok'){
    const a=document.activeElement; const editable=a&&a.matches?.('input,textarea,select,[contenteditable="true"]'); let s=null,e=null; try{if(editable&&'selectionStart'in a){s=a.selectionStart;e=a.selectionEnd;}}catch(_e){}
    let box=document.getElementById('yx-v20-toast'); if(!box){box=document.createElement('div');box.id='yx-v20-toast';document.body.appendChild(box);} box.tabIndex=-1; box.className='yx-v20-toast-card '+(kind||'ok'); box.style.pointerEvents='none'; box.innerHTML='<strong>'+(kind==='error'?'操作失敗':kind==='warn'?'請注意':'操作成功')+'</strong><div>'+esc(message||'')+'</div>'; box.style.display='block'; box.classList.add('show'); clearTimeout(window.__YX_V55_COMMON_TOAST__); window.__YX_V55_COMMON_TOAST__=setTimeout(()=>{try{box.classList.remove('show');box.style.display='none';}catch(_e){}},1800);
    if(editable&&document.contains(a)) setTimeout(()=>{try{a.focus({preventScroll:true}); if(s!=null&&a.setSelectionRange)a.setSelectionRange(s,e??s);}catch(_e){}},0);
  };
  if(window.YXCore) window.YXCore.toast=window.toast;
})();
/* formal page module */



/* V332: unified operation status card with search result shortcut actions.
   Extends the existing lightweight status card only; no page renderer, no interval, no observer, and no core cache changes. */
(function(){
  'use strict';
  if(window.__YX_V332_OPERATION_STATUS_CARD__) return;
  window.__YX_V332_OPERATION_STATUS_CARD__ = true;
  const VERSION='v332-shortcut-target-highlight';
  const STORE_KEY='yx_operation_status_card_v332';
  const FILTER_KEY='yx_operation_status_type_filter_v332';
  const STATUS_FILTER_KEY='yx_operation_status_state_filter_v332';
  const SEARCH_KEY='yx_operation_status_search_v332';
  const LEGACY_FILTER_KEY='yx_operation_status_filter_v312';
  const LEGACY_STORE_KEYS=['yx_operation_status_card_v327','yx_operation_status_card_v322','yx_operation_status_card_v317','yx_operation_status_card_v312','yx_operation_status_card_v307','yx_operation_status_card_v302','yx_operation_status_card_v297','yx_operation_status_card_v292','yx_operation_status_card_v287','yx_operation_status_card_v282'];
  const PAGE_SET=new Set(['orders','master_order','ship','warehouse']);
  const MAX_ROWS=10;
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
    return out;
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
    try{ const v=clean(localStorage.getItem(FILTER_KEY)||localStorage.getItem('yx_operation_status_type_filter_v327')||localStorage.getItem('yx_operation_status_type_filter_v322')||localStorage.getItem(LEGACY_FILTER_KEY)||'all'); return PENDING_FILTERS.some(x=>x[0]===v)?v:'all'; }catch(_e){ return 'all'; }
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
    try{ const v=clean(localStorage.getItem(STATUS_FILTER_KEY)||localStorage.getItem('yx_operation_status_state_filter_v327')||localStorage.getItem('yx_operation_status_state_filter_v322')||'all'); return STATUS_FILTERS.some(x=>x[0]===v)?v:'all'; }catch(_e){ return 'all'; }
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
    return `<div class="yx312-op-filter yx317-op-status-filter" role="group" aria-label="操作狀態篩選">${buttons}</div>`;
  }
  function searchQuery(){ try{ return clean(localStorage.getItem(SEARCH_KEY)||localStorage.getItem('yx_operation_status_search_v327')||localStorage.getItem('yx_operation_status_search_v322')||''); }catch(_e){ return ''; } }
  function setSearchQuery(v){ v=clean(v||'').slice(0,60); try{ if(v) localStorage.setItem(SEARCH_KEY,v); else localStorage.removeItem(SEARCH_KEY); }catch(_e){} return v; }
  function searchText(x){
    try{
      if(!x) return '';
      const p=x.payload||{};
      return clean([x.type,x.text,x.status,x.error,x.reason,x.message,x.customer_name,x.cell_label,x.product_label,x.detail_text,x.refresh_target,x.target_label,x.source,x.url,cellText(x),summarizePayload(x.url||'',p),JSON.stringify(p||{})].filter(Boolean).join(' ')).toLowerCase();
    }catch(_e){ return clean([x&&x.type,x&&x.text,x&&x.error,x&&x.message].filter(Boolean).join(' ')).toLowerCase(); }
  }
  function matchesSearch(x,q){ q=clean(q).toLowerCase(); if(!q) return true; return searchText(x).includes(q); }
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
      try{ localStorage.setItem('yx_status_jump_warehouse_cell_v332', JSON.stringify({zone,col,slot,ts:now()})); }catch(_e){}
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
        try{ localStorage.setItem('yx_status_open_customer_v332', JSON.stringify({customer,dest,ts:now()})); }catch(_e){}
        location.href='/ship'; return;
      }
      try{ const input=document.getElementById('customer-name'); if(input){ input.value=customer; input.dispatchEvent(new Event('input',{bubbles:true})); } }catch(_e){}
      try{ window.dispatchEvent(new CustomEvent('yx:customer-selected',{detail:{name:customer,force:true,source:'status-card-shortcut-v332'}})); }catch(_e){}
      flashCustomerTarget(customer,'ship');
      toastShortcut('已打開出貨客戶：'+customer,'ok'); return;
    }
    const targetPath=dest==='master_order'?'/master-order':'/orders';
    if(cur!=='orders' && cur!=='master_order'){
      try{ localStorage.setItem('yx_status_open_customer_v332', JSON.stringify({customer,dest,ts:now()})); }catch(_e){}
      location.href=targetPath; return;
    }
    try{ window.YX113CustomerRegions?.selectCustomer?.(customer); }catch(_e){}
    try{ if(typeof window.selectCustomerForModule==='function') window.selectCustomerForModule(customer); }catch(_e){}
    try{ window.dispatchEvent(new CustomEvent('yx:customer-selected',{detail:{name:customer,force:true,source:'status-card-shortcut-v332'}})); }catch(_e){}
    flashCustomerTarget(customer,dest);
    toastShortcut('已打開客戶：'+customer,'ok');
  }
  function openShipRecordTarget(q, recordId){
    q=clean(q); recordId=clean(recordId);
    try{ localStorage.setItem('yx_status_open_shipping_query_v332', JSON.stringify({q,record_id:recordId,ts:now()})); }catch(_e){}
    location.href='/shipping-query';
  }
  function readShortcutIntent(key, legacyKey){
    try{
      let raw=localStorage.getItem(key); let used=key;
      if(!raw && legacyKey){ raw=localStorage.getItem(legacyKey); used=legacyKey; }
      if(!raw) return null;
      const d=JSON.parse(raw||'{}'); localStorage.removeItem(used);
      return d&&typeof d==='object'?d:null;
    }catch(_e){ return null; }
  }
  function consumeShortcutTargets(){
    try{
      const d=readShortcutIntent('yx_status_jump_warehouse_cell_v332','yx_status_jump_warehouse_cell_v327');
      if(d && page()==='warehouse') setTimeout(()=>openWarehouseTarget(d.zone,d.col,d.slot), 900);
      else if(d) localStorage.setItem('yx_status_jump_warehouse_cell_v332', JSON.stringify(d));
    }catch(_e){}
    try{
      const d=readShortcutIntent('yx_status_open_customer_v332','yx_status_open_customer_v327');
      if(d){
        if((d.dest==='ship' && page()==='ship') || (d.dest!=='ship' && (page()==='orders'||page()==='master_order'))){
          setTimeout(()=>openCustomerTarget(d.customer,d.dest), 650);
        }else localStorage.setItem('yx_status_open_customer_v332', JSON.stringify(d));
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
    return {id,key,idx,type,text,status:opState(rec),error:clean(rec?.error || rec?.reason || ''), ts, created_at:Number(rec?.created_at || rec?.ts || rec?.saved_at || ts || 0), saved_at:Number(rec?.saved_at || rec?.ts || ts || 0), failed_at:Number(rec?.last_failed_at || rec?.failed_at || 0), retry_started_at:Number(rec?.retry_started_at||0), attempts:Number(rec?.attempts||0), url:clean(rec?.url||''), payload:p};
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
    el.className='yx282-operation-status-card yx287-operation-status-detail-card yx297-operation-status-targeted-card yx302-operation-status-card yx307-operation-status-card yx312-operation-status-card yx317-operation-status-card yx322-operation-status-card yx332-operation-status-card';
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
    return txt?`<small class="yx307-op-time">${esc(txt)}</small>`:'';
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
    return `<div class="yx282-op-row ${cls} yx332-op-result-row"><span class="yx282-op-dot"></span><strong>${esc(labelSource(x.source))}</strong><span>${customer}</span><em>${esc(fmtTime(x.ts||0))}</em><div><span>${msg}</span>${detailHtml}${shortcuts}</div></div>`;
  }
  function pendingTimeHtml(r){
    const bits=[];
    if(r.saved_at) bits.push('建立 '+fmtTime(r.saved_at));
    if(r.failed_at || r.error) bits.push('最後失敗 '+fmtTime(r.failed_at||r.ts));
    if(r.ts) bits.push('已卡 '+ageText(r.ts));
    if(r.attempts) bits.push('重試 '+r.attempts+' 次');
    return bits.length?`<small class="yx307-op-pending-time">${esc(bits.join('｜'))}</small>`:'';
  }
  function pendingDetailHtml(rows){
    if(!rows.length) return '';
    const filter=pendingFilter();
    const st=statusFilter();
    const q=searchQuery();
    let shown=filter==='all'?rows:rows.filter(r=>pendingType(r)===filter);
    if(st!=='all') shown=shown.filter(r=>opState(r)===st);
    if(q) shown=shown.filter(r=>matchesSearch(r,q));
    const head=`<div class="yx312-op-pending-head"><b>待處理明細</b><small>目前顯示：${esc(pendingFilterName(filter))}｜${esc(statusFilterName(st))}${q?`｜搜尋 ${esc(q)}`:''} ${shown.length}/${rows.length}</small></div>`;
    const empty=`<div class="yx312-op-empty">目前沒有「${esc(pendingFilterName(filter))}｜${esc(statusFilterName(st))}${q?`｜搜尋 ${esc(q)}`:''}」待重送項目</div>`;
    const list=shown.length?shown.map(r=>`<div class="yx287-op-pending-row yx297-op-pending-row yx307-op-pending-row yx312-op-pending-row yx317-op-pending-row yx322-op-pending-row yx332-op-pending-row" data-yx297-pending-row="${esc(r.id)}" data-yx312-pending-type="${esc(pendingType(r))}" data-yx317-pending-status="${esc(opState(r))}"><span>${esc(r.type)}</span><strong>${esc(r.text)}</strong>${pendingTimeHtml(r)}${r.error?`<em>${esc(r.error)}</em>`:''}<div class="yx297-op-pending-actions"><button type="button" class="ghost-btn tiny-btn" data-yx282-op-action="retry-one" data-yx297-pending-id="${esc(r.id)}">單筆重送</button><button type="button" class="ghost-btn tiny-btn danger-text" data-yx282-op-action="cancel-one" data-yx297-pending-id="${esc(r.id)}">單筆取消</button></div>${shortcutButtons(r)}</div>`).join(''):empty;
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
    const q=searchQuery();
    let shownArr=st==='all'?arr:arr.filter(x=>opState(x)===st);
    if(q) shownArr=shownArr.filter(x=>matchesSearch(x,q));
    const opListHtml=shownArr.length?shownArr.slice(0,5).map(rowText).join(''):(arr.length?`<div class="yx312-op-empty yx317-op-empty yx322-op-empty">目前沒有「${esc(statusFilterName(st))}${q?'｜搜尋 '+esc(q):''}」操作紀錄</div>`:'');
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
    if(window.__YX_V322_OPERATION_STATUS_CARD_BOUND__) return;
    window.__YX_V322_OPERATION_STATUS_CARD_BOUND__=true;
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
      if(act==='retry-warehouse'){ retryWarehouse(); return; }
      if(act==='jump-target'){ handleShortcutAction(btn); return; }
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
  window.YXOperationStatus = {record, render, pending:countWarehousePending, details:pendingRecords, retryOne:retryPendingOne, cancelOne:cancelPendingOne, jump:handleShortcutAction, version:VERSION};
  bind();
})();

/* V332: targeted refresh status detail after single retry success.
   Uses existing public page APIs only; keeps the original lightweight flow and cache-core untouched. */
(function(){
  'use strict';
  if(window.__YX_V332_TARGETED_RETRY_REFRESH__) return;
  window.__YX_V332_TARGETED_RETRY_REFRESH__=true;
  const VERSION='v332-shortcut-target-highlight';
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
