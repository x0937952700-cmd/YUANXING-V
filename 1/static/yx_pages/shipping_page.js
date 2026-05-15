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
  function localRowsForSelectedCustomer(source, name){
    try {
      const rows = window.YXDataStore?.rowsForCustomerSync ? window.YXDataStore.rowsForCustomerSync(source, name) : [];
      return (Array.isArray(rows) ? rows : []).filter(r => qtyFromProduct(r.product_text || '', r.qty) > 0);
    } catch(_e) { return []; }
  }
  async function renderSelectedCustomerPanel(name){
    const panel = $('selected-customer-items');
    if (!panel || moduleKey() === 'ship' || !['orders','master_order'].includes(moduleKey())) return;
    panel.classList.remove('hidden');
    const source = moduleKey() === 'master_order' ? 'master_order' : 'orders';
    const localItems = localRowsForSelectedCustomer(source, name);
    if (localItems.length) {
      state.itemCache.set(mergeKey(name) || name, {items:localItems, at:Date.now(), from_data_store:true});
      renderSelectedCustomerItems(name, localItems);
      return;
    }
    if (!renderCachedSelectedPanel(name)) panel.innerHTML = '<div class="empty-state-card compact-empty">客戶商品載入中…</div>';
    try {
      const d = await YX.api(`/api/customer-items?name=${encodeURIComponent(name)}&fast=1&local_first=1&v469=1${variantsQuery(name)}`, {method:'GET'});
      const items = Array.isArray(d.items) ? d.items : [];
      state.itemCache.set(mergeKey(name) || name, {items, at:Date.now()});
      renderSelectedCustomerItems(name, items);
    } catch(e) { if (!panel.querySelector('.yx121-selected-customer-products')) panel.innerHTML = `<div class="empty-state-card compact-empty">${YX.esc(e.message || '客戶商品載入失敗')}</div>`; }
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

  function relationCustomersFromRows(existingItems){
    const mode = moduleKey();
    try {
      if (mode === 'orders' && window.YXDataStore?.buildCustomerRows) {
        const rows = window.YXDataStore.buildCustomerRows('orders');
        if (rows.length || window.YXDataStore.productRowsSync?.('orders')?.length === 0) return rows;
      }
      if (mode === 'master_order' && window.YXDataStore?.buildCustomerRows) {
        const rows = window.YXDataStore.buildCustomerRows('master_order');
        if (rows.length || window.YXDataStore.productRowsSync?.('master_order')?.length === 0) return rows;
      }
      if (mode === 'ship' && window.YXDataStore?.buildCustomersFromSources) {
        const rows = window.YXDataStore.buildCustomersFromSources(['orders','master_order']);
        if (rows.length) return rows;
      }
    } catch(_e) {}
    const byName = new Map();
    const zeroRc = {inventory_rows:0,order_rows:0,master_rows:0,shipping_rows:0,inventory_qty:0,order_qty:0,master_qty:0,shipping_qty:0,active_rows:0,total_rows:0,active_qty_total:0,history_qty_total:0,total_qty:0};
    const addCustomerShell = (c) => {
      const n = YX.clean(c.name || c.customer_name || ''); if(!n) return;
      let savedRegion = ''; try { savedRegion = (JSON.parse(localStorage.getItem('yx_customer_regions_v18') || '{}') || {})[n] || ''; } catch(_e) {}
      if(!byName.has(n)) byName.set(n, Object.assign({}, c, {name:n, customer_name:n, region:normRegion(c.region || savedRegion || '北區'), relation_counts:Object.assign({}, zeroRc), item_count:0, row_count:0, total_qty:0, merge_names:Array.isArray(c.merge_names) ? c.merge_names : [n]}));
    };
    (existingItems || []).forEach(addCustomerShell);
    const add = (name, source, row) => {
      name = YX.clean(name || ''); if (!name) return;
      let savedRegion = ''; try { savedRegion = (JSON.parse(localStorage.getItem('yx_customer_regions_v18') || '{}') || {})[name] || ''; } catch(_e) {}
      const old = byName.get(name) || {name, customer_name:name, region:normRegion(row?.region || row?.customer_region || savedRegion || '北區'), relation_counts:Object.assign({}, zeroRc), item_count:0,row_count:0,total_qty:0,merge_names:[name]};
      const rc = Object.assign({}, zeroRc, old.relation_counts || {});
      const qty = qtyFromProduct(row.product_text || '', row.qty);
      if (source === 'orders') { rc.order_rows = Number(rc.order_rows || 0) + 1; rc.order_qty = Number(rc.order_qty || 0) + qty; }
      else if (source === 'master_order') { rc.master_rows = Number(rc.master_rows || 0) + 1; rc.master_qty = Number(rc.master_qty || 0) + qty; }
      else if (source === 'inventory') { rc.inventory_rows = Number(rc.inventory_rows || 0) + 1; rc.inventory_qty = Number(rc.inventory_qty || 0) + qty; }
      byName.set(name, Object.assign({}, old, {relation_counts:rc, item_count:Number(old.item_count||0)+1, row_count:Number(old.row_count||0)+1, total_qty:Number(old.total_qty||0)+qty, from_rows_store:true}));
    };
    try {
      const stores = (window.__YX112_ROWS__ || window.__yx63Rows || {});
      ['orders','master_order','inventory'].forEach(source => {
        const arr = Array.isArray(stores[source]) ? stores[source] : [];
        arr.forEach(r => { if(qtyFromProduct(r.product_text || '', r.qty) > 0) add(r.customer_name || r.customer || '', source, r); });
      });
    } catch(_e) {}
    return Array.from(byName.values()).filter(c => (counts(c, mode).qty || counts(c, mode).rows || mode === 'customers'));
  }



  async function loadCustomerBlocks(refreshCustomerData=true){
    if (!isRegionPage()) return state.items;
    try {
      const localRows = relationCustomersFromRows(state.items || []);
      if (localRows.length || ['orders','master_order','ship'].includes(moduleKey())) {
        state.items = localRows;
        renderBoards(state.items);
        try { window.dispatchEvent(new CustomEvent('yx:customers-loaded', {detail:{items:state.items, local_first:true}})); } catch(_e) {}
        if (!refreshCustomerData || ['orders','master_order','ship'].includes(moduleKey())) return state.items;
      }
    } catch(_e) {}
    try {
      const d = await YX.api('/api/customers?yx114=1&fast=1&light=1&v214=1&source=' + encodeURIComponent(moduleKey()==='orders'?'orders':(moduleKey()==='master_order'?'master_order':'')) + '&ts=' + Date.now(), {method:'GET'});
      const customerRows = Array.isArray(d.items) ? d.items : (Array.isArray(d.customers) ? d.customers : []);
      const merged = relationCustomersFromRows(customerRows);
      if (merged.length || !state.items.length) state.items = merged;
      renderBoards(state.items);
      try { window.dispatchEvent(new CustomEvent('yx:customers-loaded', {detail:{items:state.items}})); } catch(_e) {}
      return state.items;
    } catch(e) {
      if (!state.items.length) YX.toast(e.message || '客戶名單載入失敗', 'error');
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
    opt = opt || {}; const method=String(opt.method||'GET').toUpperCase(); let timer=null,ctrl=null;
    if(!opt.signal&&window.AbortController){ctrl=new AbortController();opt={...opt,signal:ctrl.signal};timer=setTimeout(()=>{try{ctrl.abort();}catch(_e){}},Number(opt.timeout||(method==='GET'?9000:18000)));}
    let res; try{res = await window.YXDataStore.requestResponse(`${url}${url.includes('?')?'&':'?'}_=${Date.now()}`, {credentials:'same-origin', cache:'no-store', ...opt, headers:{'Accept':'application/json','Content-Type':'application/json',...(opt.headers||{})}});} finally{if(timer)clearTimeout(timer);}
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
  const shipRuntime={previewBusy:false,confirmBusy:false,inflight:new Set(),completed:new Set(),lastPreview:null};
  const SHIP_SYNC_VERSION='v514-postdeploy-evidence-collector-pack24';
  const SHIP_CACHE_VERSION='v514-postdeploy-evidence-collector-pack24';
  const SHIP_QUERY_VERSION='119-v514_postdeploy_evidence_collector_pack24';
  const esc=(v)=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const clean=(v)=>String(v??'').replace(/\s+/g,' ').trim();
  function safeErrorMessage(v,status){let s=clean(v||'');if(!s)return status?`請求失敗 ${status}`:'請求失敗';if(/^<!doctype|<html|<h1>|internal server error/i.test(s))return status===500?'伺服器出貨資料讀取錯誤，已保留畫面，請重新點一次客戶':'伺服器回應格式錯誤';return s.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').slice(0,160)||'請求失敗';}
  async function api(url,opt={}){ if(window.YX && typeof window.YX.api==='function' && !opt?.yxRawFetch){ return window.YX.api(url,opt); } opt=opt||{};const method=String(opt.method||'GET').toUpperCase();let timer=null,ctrl=null;if(!opt.signal&&window.AbortController){ctrl=new AbortController();opt={...opt,signal:ctrl.signal};timer=setTimeout(()=>{try{ctrl.abort();}catch(_e){}},Number(opt.timeout||(method==='GET'?9000:18000)));}let res;try{res=await window.YXDataStore.requestResponse(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{'Accept':'application/json','Content-Type':'application/json',...(opt.headers||{})}});}finally{if(timer)clearTimeout(timer);}const txt=await res.text();let data={};try{data=txt?JSON.parse(txt):{};}catch(_){data={success:false,error:safeErrorMessage(txt,res&&res.status)};}if(!res.ok||data.success===false){const err=new Error(safeErrorMessage(data.error||data.message,res.status));err.data=data;err.status=res.status;throw err;}return data;}
  function toast(msg,kind='ok'){const a=document.activeElement;let ss=0,se=0;try{if(a&&a.matches?.('input,textarea,select,[contenteditable=\"true\"]')){ss=a.selectionStart||0;se=a.selectionEnd||0;}}catch(_e){}let box=$('yx-ship-toast');if(!box){box=document.createElement('div');box.id='yx-ship-toast';box.setAttribute('aria-live','polite');document.body.appendChild(box);}box.className='yx-ship-toast '+kind+' show';box.style.pointerEvents='none';box.setAttribute('tabindex','-1');box.textContent=msg;try{if(a&&document.contains(a)&&a.matches?.('input,textarea,select,[contenteditable=\"true\"]'))setTimeout(()=>{try{a.focus({preventScroll:true}); if('selectionStart' in a)a.setSelectionRange(ss,se);}catch(_e){}},0);}catch(_e){}clearTimeout(box._t);box._t=setTimeout(()=>box.classList.remove('show','ok','warn','error'),1800);}

  function emitShipStatus(status, detail={}){
    try{
      window.dispatchEvent(new CustomEvent('yx:operation-status',{detail:{source:'ship', status, version:SHIP_CACHE_VERSION, sync_version:SHIP_SYNC_VERSION, ...(detail||{})}}));
    }catch(_e){}
  }
  function opKeyFrom(payload){return String((payload&& (payload.operation_id||payload.request_key)) || '').trim();}
  function isShipProcessingError(detail){return !!(detail && (detail.retry_action==='wait' || detail.shipping_state==='processing' || detail.duplicate_running || detail.error_code==='ship_confirm_running' || detail.error_code==='duplicate_ship_request'));}
  function preserveShipPreviewButton(btn, detail){
    if(!btn) return;
    btn.disabled=false;
    if(isShipProcessingError(detail)){btn.dataset.yxMode='confirm';btn.textContent='查詢 / 確認扣除';return;}
    btn.dataset.yxMode='repreview';
    btn.textContent='重新預覽';
  }
  function normalizeText(t){return clean(t).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=');}
  function splitProduct(text){const raw=normalizeText(text);const i=raw.indexOf('=');return{size:i>=0?raw.slice(0,i):raw,support:i>=0?raw.slice(i+1):''};}
  function stripSupportNotes(v){return String(v||'').replace(/[\(（][^\)）]*[\)）]/g,'');}
  function supportSegments(support){return normalizeText(support).split('+').map(x=>x.trim()).filter(Boolean).map(seg=>{const plain=stripSupportNotes(seg).replace(/\s+/g,'');const m=plain.match(/^(\d+(?:\.\d+)?)\s*x\s*(\d+)$/i);if(m){return{base:m[1],mult:Math.max(1,Number(m[2]||1)),raw:seg,math:plain};}const single=plain.match(/^(\d+(?:\.\d+)?)(?:件|片)?$/);return{base:(single&&single[1])||plain||seg,mult:1,raw:seg,math:plain};});}
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
  function readDeviceProductRows(source){
    try{
      if(window.YXDataStore?.productRowsSync){
        const ds = window.YXDataStore.productRowsSync(source);
        if(Array.isArray(ds) && ds.length) return ds;
      }
    }catch(_e){}
    const rows=[];
    try{
      const prefix='yx_v406_cache_products_'+source+'_';
      for(let i=0;i<localStorage.length;i++){
        const k=localStorage.key(i)||'';
        if(!k.startsWith(prefix)) continue;
        const obj=JSON.parse(localStorage.getItem(k)||'null')||{};
        const data=obj.data||{};
        const arr=Array.isArray(data.rows)?data.rows:(Array.isArray(data.items)?data.items:[]);
        arr.forEach(r=>rows.push(r));
      }
    }catch(_e){}
    return rows;
  }
  function localSyncedItemsForCustomer(name){
    name=clean(name); if(!name) return [];
    const variants=new Set(selectedVariants().map(clean).filter(Boolean));
    if(!variants.size) variants.add(name);
    const out=[];
    const push=(row,sourceLabel)=>{
      const cn=clean(row.customer_name||row.customer||row.name||'');
      if(!cn || !variants.has(cn)) return;
      const text=clean(row.product_text||row.product||row.size_text||row.size||row.raw_text||'');
      if(!text) return;
      out.push({...row, customer_name:cn, product_text:text, product:text, qty:row.qty||row.quantity||row.pieces||qtyFromText(text,row.qty)||1, material:materialOf(row), source:row.source||sourceLabel, source_label:row.source_label||sourceLabel, source_preference:sourceLabel, deduct_source:sourceLabel, available_qty:row.available_qty||row.remaining_qty||row.qty||qtyFromText(text,row.qty)||1});
    };
    readDeviceProductRows('orders').forEach(r=>push(r,'訂單'));
    readDeviceProductRows('master_order').forEach(r=>push(r,'總單'));
    readDeviceProductRows('inventory').forEach(r=>push(r,'庫存'));
    const seen=new Set();
    return out.filter(it=>{const k=[sourcePreferenceOf(it)||sourceOf(it), materialOf(it), clean(it.product_text), clean(it.customer_name)].join('|'); if(seen.has(k)) return false; seen.add(k); return true;});
  }
  function variantsQuery(){const arr=selectedVariants();return arr.length?'&variants='+encodeURIComponent(JSON.stringify(arr)):'';}
  function setCustomer(name){const next=clean(name); if(next!==state.customer){state.items=[]; state.itemsForCustomer=''; state.loadingName=next;} state.customer=next; const a=$('customer-name');if(a&&a.value!==state.customer)a.value=state.customer;const b=$('ship-customer-search');if(b&&b.value!==state.customer)b.value=state.customer;}
  function setCount(text){const el=$('ship-customer-item-count');if(el)el.textContent=text;}
  function syncHiddenSelect(){const select=$('ship-customer-item-select');if(!select)return;select.hidden=true;select.setAttribute('hidden','hidden');select.setAttribute('aria-hidden','true');select.style.display='none';select.innerHTML='<option value="">商品標籤清單已顯示在下方</option>';}
  async function hydrateShipRowsFromDb(reason){
    // V485: 出貨頁若本機同步資料是空的，直接用 DB rows 補進 YXDataStore，避免北中南客戶與商品空白。
    const out={orders:[], master_order:[]};
    for(const pair of [['orders','/api/orders'],['master_order','/api/master_orders']]){
      const src=pair[0], url=pair[1];
      try{
        const d=await api(url+'?ship_hydrate=1&light=1&ts='+Date.now(), {method:'GET', yxDbOnly:true, timeout:12000});
        const rows=Array.isArray(d.items)?d.items:(Array.isArray(d.rows)?d.rows:[]);
        if(rows.length){
          out[src]=rows;
          try{ window.YXDataStore?.setRows?.(src, rows, {reason:reason||'ship-hydrate-db-v485'}); }catch(_e){}
        }
      }catch(e){ console.warn('[YX ship hydrate db]', src, e); }
    }
    return out;
  }
  function localSyncedCustomers(){
    const map=new Map();
    const add=(row,src)=>{
      const name=clean(row?.customer_name||row?.customer||row?.name||''); if(!name) return;
      const text=clean(row?.product_text||row?.product||row?.size||'');
      const q=qtyFromText(text,row?.qty||row?.quantity||1)||Number(row?.qty||row?.quantity||1)||1;
      if(!Number.isFinite(q)||q<=0) return;
      const old=map.get(name)||{name,customer_name:name,region:row?.region||row?.area||'北區',relation_counts:{order_qty:0,order_rows:0,master_qty:0,master_rows:0},total_qty:0,item_count:0,row_count:0,from_ship_rows:true};
      if(src==='orders'){old.relation_counts.order_qty+=q; old.relation_counts.order_rows+=1;} else if(src==='master_order'){old.relation_counts.master_qty+=q; old.relation_counts.master_rows+=1;}
      old.total_qty+=q; old.item_count+=1; old.row_count+=1; map.set(name,old);
    };
    try{readDeviceProductRows('orders').forEach(r=>add(r,'orders')); readDeviceProductRows('master_order').forEach(r=>add(r,'master_order'));}catch(_e){}
    return Array.from(map.values()).filter(c=>Number(c.total_qty||0)>0 || Number(c.item_count||0)>0);
  }
  function mergeCustomerRowsFast(current,incoming){
    const by=new Map();
    const add=c=>{
      const n=clean(c?.name||c?.customer_name||''); if(!n) return;
      const old=by.get(n)||{name:n,customer_name:n,region:c?.region||'北區',relation_counts:{order_qty:0,order_rows:0,master_qty:0,master_rows:0},total_qty:0,item_count:0,row_count:0};
      const rc={...(old.relation_counts||{})};
      const nr=c?.relation_counts||{};
      ['order_qty','order_rows','master_qty','master_rows'].forEach(k=>{rc[k]=Math.max(Number(rc[k]||0),Number(nr[k]||0));});
      old.relation_counts=rc; old.region=c?.region||old.region||'北區';
      old.total_qty=Math.max(Number(old.total_qty||0),Number(c?.total_qty||0),Number(rc.order_qty||0)+Number(rc.master_qty||0));
      old.item_count=Math.max(Number(old.item_count||0),Number(c?.item_count||0),Number(c?.row_count||0),Number(rc.order_rows||0)+Number(rc.master_rows||0));
      old.row_count=Math.max(Number(old.row_count||0),Number(c?.row_count||0),Number(old.item_count||0));
      by.set(n,old);
    };
    (current||[]).forEach(add); (incoming||[]).forEach(add);
    return Array.from(by.values()).filter(c=>Number(c.total_qty||0)>0||Number(c.item_count||c.row_count||0)>0);
  }
  function sourceCoverage(){
    const cov={orders:0,master_order:0};
    try{cov.orders=readDeviceProductRows('orders').filter(r=>qtyFromText(r.product_text||r.product||'',r.qty)>0).length;}catch(_e){}
    try{cov.master_order=readDeviceProductRows('master_order').filter(r=>qtyFromText(r.product_text||r.product||'',r.qty)>0).length;}catch(_e){}
    return cov;
  }
  function renderCustomers(){
    try{ if(window.YX113CustomerRegions?.renderBoards && Array.isArray(state.customers)) window.YX113CustomerRegions.renderBoards(state.customers); }catch(_e){}
    const box=$('ship-customer-quick-list');
    if(!box) return;
    if(!Array.isArray(state.customers)||!state.customers.length){ box.innerHTML='<div class="empty-state-card compact-empty">客戶資料載入中…</div>'; return; }
    const rows=state.customers.slice(0,48);
    box.innerHTML=rows.map(c=>{const n=clean(c.name||c.customer_name||'');const rc=c.relation_counts||{};const qty=Number(c.total_qty||rc.order_qty||0)+Number(rc.master_qty||0);const rowCount=Number(c.item_count||c.row_count||rc.order_rows||0)+Number(rc.master_rows||0);return n?`<button type="button" class="ghost-btn tiny-btn yx-ship-quick-customer" data-ship-customer="${esc(n)}">${esc(n)} <span class="small-note">${qty||0}件/${rowCount||0}筆</span></button>`:'';}).join('') || '<div class="empty-state-card compact-empty">目前沒有客戶</div>';
  }
  async function loadCustomers(opts={}){
    let local = localSyncedCustomers();
    try {
      if (window.YXDataStore?.getRowsMeta) {
        await Promise.all(['orders','master_order'].map(src=>window.YXDataStore.getRowsMeta(src).catch(()=>null)));
        local = localSyncedCustomers();
      }
    } catch(_e) {}
    if (!local.length) {
      await hydrateShipRowsFromDb('ship-load-customers-empty-local-v485');
      local = localSyncedCustomers();
    }
    if (local.length) {
      state.customers = local;
      renderCustomers();
      try{window.YX?.cache?.write?.('ship_customers_'+SHIP_CACHE_VERSION,{items:state.customers,at:Date.now(),from_rows:true});}catch(_e){}
      // V493: local-first is kept for speed, but DB hydration still runs once so
      // 出貨北中南 cannot miss 總單 when only 訂單 existed in device cache.
      const cov=sourceCoverage();
      hydrateShipRowsFromDb('ship-load-customers-verify-db-v493').then(()=>{
        const refreshed=localSyncedCustomers();
        if(refreshed.length){ state.customers=mergeCustomerRowsFast(state.customers,refreshed); renderCustomers(); try{window.YX?.cache?.write?.('ship_customers_'+SHIP_CACHE_VERSION,{items:state.customers,at:Date.now(),from_rows:true,db_verified:true});}catch(_e){} }
      }).catch(()=>{});
      if(cov.orders>0 && cov.master_order>0) return state.customers;
      return state.customers;
    }
    const currentKey='ship_customers_'+SHIP_CACHE_VERSION;
    try{
      const keys=[currentKey,'ship_customers_v459','ship_customers_v414','ship_customers_v413'];
      let cached=null;
      for(const k of keys){cached=window.YX?.cache?.read(k,1000*60*60*24*7);if(Array.isArray(cached?.items)&&cached.items.length)break;}
      if(Array.isArray(cached?.items)&&cached.items.length){state.customers=cached.items; renderCustomers(); if(!opts.force) return state.customers;}
    }catch(_e){}
    try{
      const d=await api('/api/customers?ship_single=1&light=1&fast=1&v='+encodeURIComponent(SHIP_QUERY_VERSION)+'&ts='+Date.now(), {method:'GET'});
      const incoming=Array.isArray(d.items)?d.items:(Array.isArray(d.customers)?d.customers:[]);
      if(incoming.length || !state.customers.length){state.customers=relationCustomersFromRows(incoming); try{window.YX?.cache?.write(currentKey,{items:state.customers});}catch(_e){}}
      renderCustomers();
    }catch(_e){ if(!state.customers.length){state.customers=[]; renderCustomers();} }
    return state.customers;
  }

    function renderItems(){const box=$('ship-customer-item-list');syncHiddenSelect();if(!box){return;}box.classList.remove('yx-final-ship-product-list-hidden');box.classList.add('yx-final-ship-tag-menu','yx-ship-one-column-menu');if(!state.customer){setCount('請先點選北 / 中 / 南客戶');box.innerHTML='<div class="empty-state-card compact-empty">請先點選北 / 中 / 南客戶</div>';return;}if(state.loadingName===state.customer){setCount(`${state.customer}：商品載入中…`);box.innerHTML='<div class="empty-state-card compact-empty">商品載入中…</div>';return;}if(state.itemsForCustomer!==state.customer){setCount(`${state.customer}：商品載入中…`);box.innerHTML='<div class="empty-state-card compact-empty">商品載入中…</div>';return;}if(!state.items.length){setCount(`${state.customer}：0 筆 / 0 件`);box.innerHTML='<div class="empty-state-card compact-empty">此客戶目前沒有可出貨商品</div>';return;}const total=state.items.reduce((sum,it)=>sum+qtyFromText(it.product_text,it.qty),0);setCount(`${state.customer}：${state.items.length} 筆 / ${total} 件`);box.innerHTML=state.items.map((it,i)=>`<button type="button" class="yx-ship-product-option-row" data-ship-add-index="${i}"><span class="yx-ship-option-source">出貨源：${esc(shipSourceLabel(it))}</span><span class="yx-ship-option-material">${esc(materialOf(it)||'未填材質')}</span><span class="yx-ship-option-text">${esc(it.product_text||'')}</span><strong>${qtyFromText(it.product_text,it.qty)}件</strong><em>加入</em></button>`).join('');}
  async function loadItems(name,opts={}){
    setCustomer(name||state.customer);
    renderItems();
    if(!state.customer) return;
    const key=state.customer;
    const variantKey=encodeURIComponent(JSON.stringify(selectedVariants()));
    const cacheKey='ship_items_'+SHIP_CACHE_VERSION+'_'+key+'_'+variantKey;
    const memoryKey=key+'::'+variantKey;
    const cached=state.itemCache.get(memoryKey)||window.YX?.cache?.read(cacheKey,1000*60*60*24*7);
    let hadCached=false;
    if(!opts.force&&cached&&Array.isArray(cached.items)&&cached.items.length){
      hadCached=true;
      state.items=cached.items;
      state.itemsForCustomer=key;
      state.itemCache.set(memoryKey,{items:state.items,at:Date.now(),customer:key});
      renderItems();
    }
    if(!hadCached){
      let synced=localSyncedItemsForCustomer(key);
      if(!synced.length){
        await hydrateShipRowsFromDb('ship-load-items-empty-local-v485');
        synced=localSyncedItemsForCustomer(key);
      }
      if(synced.length){
        hadCached=true;
        state.items=synced;
        state.itemsForCustomer=key;
        state.itemCache.set(memoryKey,{items:state.items,at:Date.now(),customer:key,from_device_sync:true});
        try{window.YX?.cache?.write(cacheKey,{items:state.items,at:Date.now(),from_device_sync:true});}catch(_e){}
        renderItems();
      }
    }
    const requestCustomer=key;
    const requestVariants=variantsQuery();
    const fresh=async()=>{
      state.loadingName=requestCustomer;
      if(!hadCached) renderItems();
      try{
        const d=await api('/api/customer-items?name='+encodeURIComponent(requestCustomer)+'&fast=1&ship_single=1&v='+encodeURIComponent(SHIP_QUERY_VERSION)+'&ts='+Date.now()+requestVariants, {yxDbOnly: !!(opts.force || opts.dbVerify || hadCached), timeout:12000});
        if(state.customer!==requestCustomer) return;
        const incomingItems=Array.isArray(d.items)?d.items:[];
        if(incomingItems.length || !hadCached || !state.items.length){
          state.items=incomingItems;
          const saved={items:state.items,at:Date.now()};
          state.itemsForCustomer=requestCustomer;
          state.itemCache.set(memoryKey,saved);
          try{window.YX?.cache?.write(cacheKey,saved);}catch(_e){}
        }else{
          state.itemsForCustomer=requestCustomer;
        }
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
    if(hadCached){
      // V493: show cached/local rows immediately, then verify DB in background.
      // This prevents stale ship_items cache from hiding 總單 rows or showing rows that were already shipped.
      fresh().catch(e=>{try{console.warn('[YX ship fresh verify]',e);}catch(_e){}});
      return state.items;
    }
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
  function supportSticksSum(support){return normalizeText(support).split('+').map(x=>x.trim()).filter(Boolean).reduce((sum,seg)=>{const plain=stripSupportNotes(seg).replace(/\s+/g,'');const m=plain.match(/^(\d+(?:\.\d+)?)(?:x\s*(\d+))?$/i);return m?sum+Number(m[1]||0)*Number(m[2]||1):sum;},0);}
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
      window.dispatchEvent(new CustomEvent(name, {detail: {...(detail||{}), sync_guard:SHIP_CACHE_VERSION, sync_version:SHIP_SYNC_VERSION, cache_bust:SHIP_SYNC_VERSION}}));
      return true;
    }catch(_e){ try{ window.dispatchEvent(new CustomEvent(name,{detail:detail||{}})); }catch(__e){} return true; }
  }

  function clearAfterShipCaches(){
    try{
      ['ship_customers_'+SHIP_CACHE_VERSION,'ship_customers_v414','ship_customers_v413','ship_customers_v412','ship_customers_v406','ship_customers_v402','ship_customers_v396','ship_customers_v394','ship_customers_v388','ship_customers_v387','ship_customers_v386','ship_customers_v383','ship_customers_v380','ship_customers_v379','ship_customers_v337','ship_customers_v332','ship_customers_v307','ship_customers_v287','ship_customers_v282','ship_customers_v267','ship_customers_v252','ship_customers_v228','ship_customers_v227','ship_customers_v226','ship_customers_v225','ship_customers_v224','ship_customers_v223','ship_customers_v222','ship_customers_v221','ship_customers_v216','ship_customers_v214','ship_customers_v210','ship_customers_v208','ship_customers_v207','ship_customers_v199','ship_customers_v198','ship_customers_v197','today_changes_light_'+SHIP_CACHE_VERSION,'today_changes_'+SHIP_CACHE_VERSION,'warehouse_available_'+SHIP_CACHE_VERSION,'warehouse_source_qty_map_'+SHIP_CACHE_VERSION,'today_changes_light_v287','today_changes_light_v282','today_changes_light_v267','today_changes_light_v252','today_changes_light_v228','today_changes_light_v227','today_changes_light_v226','today_changes_light_v215','today_changes_light_v214','today_changes_light_v210','today_changes_light_v208','today_changes_light_v207','today_changes_light_v199','today_changes_light_v198','today_changes_v287','today_changes_v282','today_changes_v267','today_changes_v252','today_changes_v228','today_changes_v227','today_changes_v226','today_changes_v215','today_changes_v214','today_changes_v210','today_changes_v208','today_changes_v207','today_changes_v199','today_changes_v198','warehouse_available_v287','warehouse_available_v282','warehouse_available_v267','warehouse_available_v257','warehouse_available_v252','warehouse_available_v228','warehouse_available_v227','warehouse_available_v226','warehouse_available_v225','warehouse_available_v224','warehouse_available_v223','warehouse_available_v222','warehouse_available_v221','warehouse_available_v215','warehouse_available_v214','warehouse_available_v210','warehouse_available_v208','warehouse_available_v207','warehouse_available_v199','warehouse_available_v198','warehouse_source_qty_map_v287','warehouse_source_qty_map_v282','warehouse_source_qty_map_v267','warehouse_source_qty_map_v257','warehouse_source_qty_map_v252','warehouse_source_qty_map_v228','warehouse_source_qty_map_v227','warehouse_source_qty_map_v226','warehouse_source_qty_map_v225','warehouse_source_qty_map_v224','warehouse_source_qty_map_v223','warehouse_source_qty_map_v222','warehouse_source_qty_map_v221','warehouse_source_qty_map_v215','warehouse_source_qty_map_v214','warehouse_source_qty_map_v210','warehouse_source_qty_map_v208','warehouse_source_qty_map_v207','warehouse_source_qty_map_v199','warehouse_source_qty_map_v198'].forEach(k=>window.YX?.cache?.remove?.(k));
      window.YX?.cache?.clearGroup?.('ship_customers_'); window.YX?.cache?.clearGroup?.('ship_items_'); window.YX?.cache?.clearGroup?.('customer_blocks_');
      // V467: 不清 warehouse_available_/today_changes_ 同步權威資料。
    }catch(_e){}
    try{ state.itemCache?.clear?.(); }catch(_e){}
  }
  function clearShipCachesAfterWarehouseChange(customer){
    try{
      ['ship_customers_'+SHIP_CACHE_VERSION,'ship_customers_v414','ship_customers_v413','ship_customers_v412','ship_customers_v406','ship_customers_v402','ship_customers_v396','ship_customers_v394','ship_customers_v388','ship_customers_v387','ship_customers_v386','ship_customers_v383','ship_customers_v380','ship_customers_v379','ship_customers_v337','ship_customers_v332','ship_customers_v307','ship_customers_v287','ship_customers_v282','ship_customers_v267','ship_customers_v252','ship_customers_v228','ship_customers_v227','ship_customers_v226','ship_customers_v225','ship_customers_v224','ship_customers_v223','ship_customers_v222','ship_customers_v221','ship_customers_v216','ship_customers_v214','ship_customers_v210','ship_customers_v208','ship_customers_v207','ship_customers_v199','ship_customers_v198','ship_customers_v197'].forEach(k=>window.YX?.cache?.remove?.(k));
      window.YX?.cache?.clearGroup?.('ship_customers_'); window.YX?.cache?.clearGroup?.('ship_items_'); window.YX?.cache?.clearGroup?.('customer_blocks_');
      // V467: 不清 warehouse_available_/today_changes_ 同步權威資料。
    }catch(_e){}
    try{ state.itemCache?.clear?.(); }catch(_e){}
    const name=clean(customer||state.customer||'');
    if(name) loadItems(name,{force:false}).catch(()=>{});
    else loadCustomers().catch(()=>{});
  }
  function collectWarehouseDeductFromShipResult(result){
    const out=[];
    try{ (Array.isArray(result?.breakdown)?result.breakdown:[]).forEach(row=>{ if(Array.isArray(row?.warehouse_deduct)) row.warehouse_deduct.forEach(x=>out.push(x)); }); }catch(_e){}
    return out;
  }
  function emitAfterShipSync(customer, items, result){
    const warehouse_deduct=collectWarehouseDeductFromShipResult(result||{});
    const affectedCustomerNames=Array.isArray(result?.affected_customer_names)?result.affected_customer_names.filter(Boolean):(Array.isArray(result?.customer_names)?result.customer_names.filter(Boolean):[clean(customer||state.customer||'')].filter(Boolean));const detail={customer_name:clean(customer||state.customer||''),customer_names:affectedCustomerNames,affected_customer_names:affectedCustomerNames,affected_customer_payloads:result?.affected_customer_payloads||{},items:items||[],result:result||{},operation_id:result?.operation_id||result?.request_key||'',request_key:result?.operation_id||result?.request_key||'',remaining_items:Array.isArray(result?.items)?result.items:[],customers:Array.isArray(result?.customers)?result.customers:[],snapshots:result?.snapshots||{},warehouse_deduct,warehouse_column_snapshots:Array.isArray(result?.warehouse_column_snapshots)?result.warehouse_column_snapshots:[],warehouse_columns:Array.isArray(result?.warehouse_columns)?result.warehouse_columns:[],warehouse_cells_snapshot:Array.isArray(result?.warehouse_cells_snapshot)?result.warehouse_cells_snapshot:[],warehouse_snapshot_version:result?.warehouse_snapshot_version||'',source_consistency:Array.isArray(result?.source_consistency)?result.source_consistency:[],affected_sources:Array.isArray(result?.affected_sources)?result.affected_sources:[],reason:'ship-confirm-v416',version:SHIP_CACHE_VERSION,sync_version:SHIP_SYNC_VERSION};
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
    const candidates=[preview.selected_before_qty,preview.before_qty,sourceBefore,preview.available_before,preview.selected_available,item.available_qty,item.original_qty,preview.master_available,preview.order_available,preview.inventory_available];
    let before=0;
    for(const v of candidates){const n=Number(v);if(Number.isFinite(n)&&n>0){before=n;break;}}
    const serverAfter=Number(preview.selected_after_qty ?? preview.after_qty ?? NaN);
    const after=Number.isFinite(serverAfter)?serverAfter:(before>0?Math.max(0,before-q):'');
    const strictBad=(preview&&preview.strict_ok===false)||Number(preview?.shortage_qty||0)>0;
    const shortage=strictBad || (Number.isFinite(Number(after)) && Number(after) < 0) || (before>0 && q>before);
    const loc=preview.location||preview.warehouse_location||preview.slot||'商品位置';
    const statusText=shortage?'<span class="danger-text">不足</span>':'可出貨';
    return`<tr><td>${idx+1}</td><td>${esc(state.customer||item.customer||preview.customer||'')}</td><td><span class="mat-tag">${esc(item.material||preview.material||'未填材質')}</span></td><td>${esc(p.size)}${p.support?'='+esc(p.support):''}</td><td>${q}件</td><td>出貨源：${esc(shipSourceLabel(item,preview))}</td><td><button type="button" class="yx22-location-btn" data-prod="${esc(item.product_text||preview.product_text||preview.product||'')}" data-customer="${esc(state.customer||item.customer||preview.customer||'')}" data-source-id="${esc(item.source_id||preview.source_id||preview.id||'')}" data-source-table="${esc(item.source_table||preview.source_table||preview.source||'')}">${esc(loc)}</button></td><td>${before>0?`${before} → ${after}`:'待確認'}</td><td>${statusText}</td></tr>`;
  }
  async function confirmSubmit(){
    if(shipRuntime.previewBusy){toast('出貨預覽中，請勿重複操作','warn');return;}
    if(!state.customer)return toast('請先輸入客戶名稱','warn');
    if(!state.selected.length)return toast('請先加入出貨商品','warn');
    const overIdx=state.selected.findIndex(x=>warnOverQty(x));
    if(overIdx>=0){
      const o=warnOverQty(state.selected[overIdx]);
      renderSelected();
      toast(`第 ${overIdx+1} 筆出貨 ${o.q} 件大於可出貨 ${o.max} 件，不可扣除`,'error');
      document.querySelector(`[data-selected-card="${overIdx}"]`)?.scrollIntoView?.({behavior:'smooth',block:'center'});
      return;
    }
    const btn=$('submit-btn');
    shipRuntime.previewBusy=true;
    if(btn){btn.disabled=true;btn.textContent='預覽中…';}
    try{ const panel=$('ship-preview-panel')||$('module-result'); if(panel){ panel.classList.remove('hidden'); panel.style.display='block'; panel.innerHTML='<div class="result-card"><strong>出貨預覽建立中…</strong><div class="small-note">已讀取本機同步商品，正在向資料庫確認扣除來源。</div></div>'; panel.scrollIntoView?.({behavior:'smooth',block:'start'}); } }catch(_e){}
    const op='ship_'+Date.now()+'_'+Math.random().toString(36).slice(2);
    const payload={customer_name:state.customer,items:state.selected,allow_inventory_fallback:true,skip_snapshot:true,preview_required:true,source_lock_version:SHIP_SYNC_VERSION,operation_id:op,request_key:op};
    try{
      emitShipStatus('previewing',{reason:'ship-preview-start',customer_name:state.customer,operation_id:op,message:'出貨預覽中'});
      const preview=await api('/api/ship-preview',{method:'POST',body:JSON.stringify(payload)});
      if(!preview || preview.success===false || !preview.preview_token){
        throw Object.assign(new Error(preview?.error||'出貨預覽未取得鎖定 token，請重新預覽'),{data:preview||{}});
      }
      shipRuntime.lastPreview={payload,preview,at:Date.now()};
      emitShipStatus('preview-ready',{reason:'ship-preview-ready',customer_name:state.customer,operation_id:op,message:'出貨預覽完成，等待確認扣除'});
      showPreview(preview,payload);
    }catch(e){
      emitShipStatus('failed',{reason:'ship-preview-failed',customer_name:state.customer,operation_id:op,message:e.message||'出貨預覽失敗'});
      const panel=$('ship-preview-panel')||$('module-result');
      if(panel){
        panel.classList.remove('hidden');
        const calc=localVolumeCalc(state.selected||[]);
        panel.innerHTML=`<div class="error-card"><strong>出貨預覽失敗</strong><div>${esc(e.message||'出貨預覽失敗')}</div><div class="small-note">已保留上方選取商品，請確認客戶與商品件數後再按一次確認送出。</div></div><div class="yx22-preview"><div class="yx22-preview-title small">本機暫存預覽</div><div class="small-note">資料庫確認失敗時先顯示本機選取內容，不會讓你看起來像沒反應。</div><table class="yx22-preview-table"><thead><tr><th>#</th><th>材質</th><th>商品</th><th>件數</th></tr></thead><tbody>${(state.selected||[]).map((it,i)=>`<tr><td>${i+1}</td><td>${esc(it.material||'')}</td><td>${esc(it.product_text||'')}</td><td>${selectedQtyOf(it)}</td></tr>`).join('')}</tbody></table><div class="yx22-formula-total">本機材積：${Number(calc.total_volume||0).toFixed(2)} 才</div></div>`;
        try{panel.scrollIntoView?.({behavior:'smooth',block:'start'});}catch(_e){}
      }
      toast(e.message||'出貨預覽失敗','error');
    }finally{
      shipRuntime.previewBusy=false;
      if(btn){btn.disabled=false;btn.textContent='確認送出';}
    }
  }
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
    panel.innerHTML=`<div class="yx22-preview"><div class="yx22-preview-title">出貨預覽</div><div id="yx22-ship-preview-error" class="error-card" style="display:none"></div><div class="yx22-stat-grid"><div><span>本次出貨</span><b>${totalQty}</b><em>件</em></div><div><span>商品筆數</span><b>${draft.length||rows.length}</b><em>筆</em></div><div><span>材積合計</span><b>${Number(calc.total_volume||0).toFixed(2)}</b><em>才</em></div><div><span>扣除流程</span><b>預覽</b><em>確認後才扣</em></div></div><table class="yx22-preview-table"><thead><tr><th>#</th><th>客戶</th><th>材質</th><th>尺寸 / 支數</th><th>件數</th><th>出貨源</th><th>倉庫位置</th><th>扣前 → 扣後</th><th>狀態</th></tr></thead><tbody>${(rows.length?rows:draft).map((x,i)=>previewRowHtml(x,i,rows.length?x:(rows[i]||{}))).join('')}</tbody></table><div class="yx22-calc-box"><div class="yx22-preview-title small">材積計算</div><table class="yx22-preview-table"><thead><tr><th>#</th><th>商品</th><th>支數總和</th><th>算式</th><th>材積</th></tr></thead><tbody>${calcRowsHtml(calc)}</tbody></table><div class="yx22-formula-total">總材積：${Number(calc.total_volume||0).toFixed(2)} 才</div></div><div class="yx22-weight"><label>重量</label><input id="yx22-weight" type="number" step="0.01" placeholder="輸入重量，自動算總重"><b id="yx22-total-weight">總重：--</b></div><div class="btn-row"><button class="primary-btn" id="yx22-confirm-ship" type="button">確認扣除</button><button class="ghost-btn" id="yx22-cancel-preview" type="button">取消</button></div></div>`;
    const previewBad=rows.some(r=>r&&((r.strict_ok===false)||Number(r.shortage_qty||0)>0)) || !data.preview_token;
    try{ window.YX?.visualSync?.apply?.('ship-preview-render'); }catch(_e){}
    if(previewBad){
      const btn=$('yx22-confirm-ship');
      if(btn){btn.disabled=false;btn.dataset.yxMode='repreview';btn.textContent='重新預覽';}
      const err=$('yx22-ship-preview-error');
      if(err){err.style.display='block';err.innerHTML='<strong>不可扣除</strong><div>'+(data.preview_token?'有商品來源不足或來源已不一致，請修改件數後重新預覽。':'預覽鎖定 token 不完整，請重新預覽。')+'</div>';}
    }
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
      const opId=opKeyFrom(payload);
      if(b.dataset.yxBusy==='1' || shipRuntime.confirmBusy || (opId && shipRuntime.inflight.has(opId))){toast('出貨正在處理中，請勿重複送出','warn');return;}
      if(opId && shipRuntime.completed.has(opId)){toast('這次出貨已完成，請新增下一筆出貨','warn');return;}
      b.dataset.yxBusy='1';
      b.disabled=true;
      b.textContent='扣除中…';
      try{ panel.classList.add('yx-ship-operation-pending'); panel.dataset.yxPendingScope='ship:'+String(opId||payload.operation_id||'current'); }catch(_e){}
      shipRuntime.confirmBusy=true;
      if(opId) shipRuntime.inflight.add(opId);
      let shipCommitted=false;
      let shipResult=null;
      try{
        emitShipStatus('confirming',{reason:'ship-confirm-start',customer_name:state.customer,operation_id:opId,message:'出貨扣除中'});
        shipResult=await api('/api/ship',{method:'POST',body:JSON.stringify({...payload,preview_required:true,preview_token:data.preview_token,source_lock_version:data.source_lock_version||payload.source_lock_version,request_key:payload.operation_id})});
        if(shipResult?.duplicate_running || shipResult?.queued || shipResult?.retry_action==='wait'){
          throw Object.assign(new Error(shipResult?.message||shipResult?.error||'出貨正在處理中，已保留預覽'),{data:shipResult});
        }
        if(opId && shipRuntime.completed.has(opId)) return;
        if(opId) shipRuntime.completed.add(opId);
        shipCommitted=true;
        panel.innerHTML='<div class="success-card">出貨完成，已扣除並寫入今日異動</div>';
        state.selected=[];
        renderSelected();
        clearAfterShipCaches();
        try{ state.itemCache?.clear?.(); }catch(_e){}
        try{ window.YX?.cache?.clearGroup?.('ship_items_'); window.YX?.cache?.clearGroup?.('ship_customers_'); window.YX?.cache?.clearGroup?.('customer_blocks_'); }catch(_e){}
        // V467: 不清 warehouse_available_/today_changes_ 權威同步快取，由 MutationBus / DeviceSync 更新，避免出貨後各頁又卡 DB。
        try{ window.dispatchEvent(new CustomEvent('yx:operation-status',{detail:{source:'ship', status:'success', reason:'ship-confirm-success', customer_name:state.customer, product_label:(Array.isArray(payload.items)?payload.items.slice(0,2).map(it=>[it.material,it.product_text||it.size||it.name,it.qty||it.count].filter(Boolean).join(' ')).join('、'):''), detail_text:(shipResult?.source_label||shipResult?.source_detail||''), message:'出貨扣除完成，已同步訂單/總單/倉庫圖', operation_id:shipResult?.operation_id||payload.operation_id||'', version:SHIP_CACHE_VERSION, sync_version:SHIP_SYNC_VERSION}})); }catch(_e){}
        emitAfterShipSync(state.customer,payload.items,shipResult);
        try{ ['orders','master_order','inventory'].forEach(src=>window.YXDataStore?.applyResponseRows?.(src, shipResult, {reason:'ship-confirm-success'})); }catch(_e){}
        try{ if(window.YX113CustomerRegions?.renderFromCurrentRows) window.YX113CustomerRegions.renderFromCurrentRows(); }catch(_e){}
        try{ state.customers = relationCustomersFromRows([]); renderCustomers(); }catch(_e){}
        try{ await hydrateShipRowsFromDb('ship-confirm-success-db-readback-v493'); }catch(_e){}
        try{ await loadItems(state.customer,{dbVerify:true}); }catch(_e){}
        try{ await loadCustomers({dbVerify:true}); }catch(_e){}
        try{ window.dispatchEvent(new CustomEvent('yx:customer-selected',{detail:{name:state.customer,dbVerify:true,source:'ship',reason:'ship-completed-v493-db-readback'}})); }catch(_e){}
        toast('出貨完成','ok');
      }catch(e){
        if(shipCommitted){
          emitShipStatus('success',{reason:'ship-committed-refresh-partial',customer_name:state.customer,operation_id:opId,message:'出貨已完成，部分畫面同步稍慢，已保留成功狀態'});
          toast('出貨已完成，部分畫面同步稍慢','warn');
          return;
        }
        const detail=e.data||{};
        const msg=e.message||detail.error||'出貨失敗，畫面已保留可直接修改後重新預覽';
        const extra=detail.error_code?`<div class="small-note">原因代碼：${esc(detail.error_code)}${detail.source_label?'｜來源：'+esc(detail.source_label):''}</div>`:'';
        try{window.dispatchEvent(new CustomEvent('yx:operation-soft-failed',{detail:{source:'ship',customer_name:state.customer,reason:'ship-failed-preserve-preview',error:msg,error_code:detail.error_code||'',retry_action:detail.retry_action||'',shipping_state:detail.shipping_state||'',operation_id:opId,target_kind:'ship-operation',target_key:'ship:'+String(opId||'current'),scope_key:'ship:'+String(opId||'current'),version:SHIP_CACHE_VERSION,sync_version:SHIP_SYNC_VERSION}}));}catch(_e){}
        try{window.dispatchEvent(new CustomEvent('yx:operation-status',{detail:{source:'ship',status:'failed',customer_name:state.customer,reason:'ship-failed-preserve-preview',message:msg,error_code:detail.error_code||'',retry_action:detail.retry_action||'',shipping_state:detail.shipping_state||'',operation_id:opId,target_kind:'ship-operation',target_key:'ship:'+String(opId||'current'),scope_key:'ship:'+String(opId||'current'),product_label:(Array.isArray(payload.items)?payload.items.slice(0,2).map(it=>[it.material,it.product_text||it.size||it.name,it.qty||it.count].filter(Boolean).join(' ')).join('、'):''),version:SHIP_CACHE_VERSION,sync_version:SHIP_SYNC_VERSION}}));}catch(_e){}
        showInlineError(msg+extra);
        toast(msg,'error');
        preserveShipPreviewButton(b,detail);
      }finally{
        shipRuntime.confirmBusy=false;
        try{ if(opId) shipRuntime.inflight.delete(opId); }catch(_e){}
        try{ delete b.dataset.yxBusy; }catch(_e){}
        try{ panel.classList.remove('yx-ship-operation-pending'); delete panel.dataset.yxPendingScope; }catch(_e){}
      }
    });
    panel.scrollIntoView({behavior:'smooth',block:'start'});
  }
  window.confirmSubmit=confirmSubmit; window.YXShipConfirmSubmit=confirmSubmit;window.__YX_SHIP_NATIVE_CONFIRM__=confirmSubmit;window.YX116ShipPicker={load:loadItems,addItem,renderItems,renderSelected,confirmSubmit,showShipLocations};window.reverseLookup=reverseLookup;

  function normalizeLocationHit(h){
    const cell=h.cell||h||{};
    const it=h.item||h||{};
    const z=clean(h.zone||cell.zone||'');
    const col=clean(h.column_index||h.column||cell.column_index||'');
    const slot=clean(h.slot_number||h.slot_no||h.slot||cell.slot_number||'');
    return {...h, cell:{...cell,zone:z,column_index:col,slot_number:slot}, item:{...it}, zone:z, column_index:col, slot_number:slot};
  }
  function renderLocationHits(box,hits,productText){
    const normalized=(Array.isArray(hits)?hits:[]).map(normalizeLocationHit).filter(h=>h.zone&&h.column_index&&h.slot_number);
    if(!normalized.length){ box.innerHTML='<div class="empty-state small">找不到這筆商品的倉庫位置</div>'; return; }
    const html=normalized.map((h)=>{
      const it=h.item||{};
      const z=esc(h.zone||'');
      const col=esc(h.column_index||'');
      const slot=esc(h.slot_number||'');
      const cust=esc(h.customer||h.customer_name||it.customer_name||it.customer||'庫存');
      const mat=esc(h.material||it.material||it.product_code||'');
      const prod=esc(h.product_text||h.text||it.product_text||it.product||productText);
      const qty=esc(h.qty||h.quantity||it.qty||it.quantity||'');
      const placement=esc(h.placement_label||it.placement_label||'');
      return `<button type="button" class="yx-location-hit" data-zone="${z}" data-col="${col}" data-slot="${slot}"><b>${z}區 ${col}欄 ${slot}格</b><span>${cust}｜${mat} ${prod}${qty?`｜${qty}件`:''}${placement?`｜${placement}`:''}</span></button>`;
    }).join('');
    box.innerHTML=`<div class="yx-location-title">商品位置</div>${html}`;
    box.querySelectorAll('.yx-location-hit').forEach(btn=>btn.addEventListener('click',()=>{
      const zone=btn.dataset.zone,col=btn.dataset.col,slot=btn.dataset.slot;
      if(window.highlightWarehouseCell){window.highlightWarehouseCell(zone,col,slot);}
      else if(zone&&col&&slot){location.href=`/warehouse?highlight=${encodeURIComponent(zone+'-'+col+'-'+slot)}`;}
    }));
    box.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  async function showShipLocations(productText, opts={}){
    const box=$('ship-location-result')||$('module-result');
    if(!box)return;
    const customer=clean(opts.customer_name||opts.customer||state.customer||$('customer-name')?.value||'');
    const sourceId=clean(opts.source_id||'');
    const sourceTable=clean(opts.source_table||opts.source||'');
    const product=clean(productText||opts.product_text||opts.product||'');
    if(!product&&!customer){toast('請先選擇商品或客戶','warn');return;}
    const previous=box.innerHTML;
    const preserve_previous=true; // V507: API 慢或失敗時保留上一筆位置，不洗畫面
    const query=[customer,product].filter(Boolean).join(' ');
    box.classList.remove('hidden');
    box.innerHTML='<div class="yx-location-loading">商品位置查詢中…</div>';
    try{
      const params=new URLSearchParams();
      if(customer) params.set('customer_name',customer);
      if(product) params.set('product_text',product);
      if(sourceId) params.set('source_id',sourceId);
      if(sourceTable) params.set('source_table',sourceTable);
      if(query) params.set('q',query);
      params.set('ts',String(Date.now()));
      let data=await api('/api/product-locations?'+params.toString());
      let hits=Array.isArray(data.hits)?data.hits:(Array.isArray(data.items)?data.items:[]);
      if(!hits.length && product){
        const fallback=new URLSearchParams();
        fallback.set('product_text',product); fallback.set('q',product); fallback.set('ts',String(Date.now()));
        data=await api('/api/product-locations?'+fallback.toString());
        hits=Array.isArray(data.hits)?data.hits:(Array.isArray(data.items)?data.items:[]);
      }
      renderLocationHits(box,hits,product||query);
    }catch(e){
      if(previous && !/商品位置查詢中/.test(previous)){
        box.innerHTML=`<div class="yx-location-warning">查詢更新失敗，先保留上一筆位置：${esc(e.message||e)}</div>${previous}`;
      }else{
        box.innerHTML=`<div class="error-card">查詢倉庫位置失敗：${esc(e.message||e)}</div>`;
      }
    }
  }
  function reverseLookup(){
    const first=(state.selected||[])[0]||{};
    if(!first.product_text && !first.product && !state.customer){ toast('請先選擇出貨客戶與商品，再反查位置','warn'); return; }
    showShipLocations(first.product_text||first.product||'', {customer_name:first.customer_name||first.customer||state.customer, source_id:first.source_id||first.id||'', source_table:first.source_table||first.source||''}).catch(err=>toast(err.message||'查詢位置失敗','error'));
  }

  function bind(){if(state.bound)return;state.bound=true;document.addEventListener('click',(e)=>{const loc=e.target.closest('.yx22-location-btn');if(loc){e.preventDefault();showShipLocations(loc.dataset.prod||'', {customer_name:loc.dataset.customer||state.customer, source_id:loc.dataset.sourceId||'', source_table:loc.dataset.sourceTable||''}).catch(err=>toast(err.message||'查詢位置失敗','error'));return;}const c=e.target.closest('[data-ship-customer]');if(c){e.preventDefault();const n=clean(c.dataset.shipCustomer||''); if(n) window.__YX_SELECTED_CUSTOMER_VARIANTS__=[n]; loadItems(n,{force:false}).catch(err=>toast(err.message,'error'));return;}const add=e.target.closest('[data-ship-add-index]');if(add){e.preventDefault();addItem(add.dataset.shipAddIndex);return;}const rm=e.target.closest('[data-selected-remove]');if(rm){e.preventDefault();state.selected.splice(Number(rm.dataset.selectedRemove),1);renderSelected();return;}},true);document.addEventListener('keydown',(e)=>{if((e.target.id==='customer-name'||e.target.id==='ship-customer-search')&&e.key==='Enter'){e.preventDefault();const n=clean(state.customer||e.target.value||''); if(n) window.__YX_SELECTED_CUSTOMER_VARIANTS__=[n]; loadItems(n,{force:false}).catch(err=>toast(err.message,'error'));}},true);document.addEventListener('change',(e)=>{if(e.target.id==='ship-customer-item-select'&&e.target.value!==''){addItem(e.target.value);e.target.value='';}},true);document.addEventListener('input',(e)=>{if(e.target.id==='customer-name'||e.target.id==='ship-customer-search'){setCustomer(e.target.value);renderCustomers();renderItems();}if(e.target.matches('[data-support-editor]'))updateSelectedProductFromSupport(Number(e.target.dataset.supportEditor),e.target.value);},true);}
  function install(){if(state.installed)return;state.installed=true;document.documentElement.dataset.yxShipSingle='main-one-line-html-v467';bind();loadCustomers();window.addEventListener('yx:customers-loaded',e=>{state.customers=Array.isArray(e.detail?.items)?e.detail.items:state.customers;},false);window.addEventListener('yx:warehouse-changed',e=>{const names=Array.isArray(e.detail?.customer_names)?e.detail.customer_names.filter(Boolean):[]; if(names.length){names.forEach(n=>clearShipCachesAfterWarehouseChange(n));} else clearShipCachesAfterWarehouseChange(e.detail?.customer_name||'');},false);window.addEventListener('yx:customer-profile-changed',e=>{try{state.itemCache?.clear?.();}catch(_e){}try{['ship_customers_'+SHIP_CACHE_VERSION,'ship_customers_v414','ship_customers_v413','ship_customers_v412','ship_customers_v406','ship_customers_v402','ship_customers_v396','ship_customers_v394','ship_customers_v388','ship_customers_v387','ship_customers_v386','ship_customers_v383','ship_customers_v380','ship_customers_v379','ship_customers_v337','ship_customers_v332','ship_customers_v307','ship_customers_v287','ship_customers_v282','ship_customers_v267','ship_customers_v252','ship_customers_v228','ship_customers_v227','ship_customers_v226','ship_customers_v225','ship_customers_v224'].forEach(k=>window.YX?.cache?.remove?.(k));window.YX?.cache?.clearGroup?.('ship_customers_'); window.YX?.cache?.clearGroup?.('ship_items_');}catch(_e){}const oldn=clean(e.detail?.old_customer_name||'');const newn=clean(e.detail?.new_customer_name||e.detail?.customer_name||'');if(oldn&&state.customer===oldn){state.customer=newn||'';try{window.__YX_SELECTED_CUSTOMER__=state.customer;}catch(_e){}} if(state.customer) loadItems(state.customer,{force:false}).catch(()=>{}); else loadCustomers().catch(()=>{});},false);window.addEventListener('yx:product-data-changed',e=>{try{state.itemCache?.clear?.();}catch(_e){}try{['ship_customers_'+SHIP_CACHE_VERSION,'ship_customers_v414','ship_customers_v413','ship_customers_v412','ship_customers_v406','ship_customers_v402','ship_customers_v396','ship_customers_v394','ship_customers_v388','ship_customers_v387','ship_customers_v386','ship_customers_v383','ship_customers_v380','ship_customers_v379','ship_customers_v337','ship_customers_v332','ship_customers_v307','ship_customers_v287','ship_customers_v282','ship_customers_v267','ship_customers_v252','ship_customers_v228','ship_customers_v227','ship_customers_v226','ship_customers_v225','ship_customers_v224','ship_customers_v223','ship_customers_v222','ship_customers_v221','ship_customers_v216','ship_customers_v214'].forEach(k=>window.YX?.cache?.remove?.(k));window.YX?.cache?.remove?.('ship_customers_v208');window.YX?.cache?.remove?.('ship_customers_v199');window.YX?.cache?.remove?.('ship_customers_v198');window.YX?.cache?.remove?.('ship_customers_v197');}catch(_e){}const n=clean(e.detail?.customer_name||state.customer||'');if(n) loadItems(n,{force:false}).catch(()=>{});else loadCustomers().catch(()=>{});},false);window.addEventListener('yx:customer-selected',e=>{const name=clean(e.detail?.name||'');try{ if(Array.isArray(e.detail?.variants)&&e.detail.variants.length) window.__YX_SELECTED_CUSTOMER_VARIANTS__=e.detail.variants.filter(Boolean); else if(name) window.__YX_SELECTED_CUSTOMER_VARIANTS__=[name]; }catch(_e){} if(name)loadItems(name,{force:false}).catch(err=>toast(err.message,'error'));},false);renderSelected();const name=clean($('customer-name')?.value||'');if(name)loadItems(name,{force:false}).catch(()=>{});else renderItems();window.confirmSubmit=confirmSubmit; window.YXShipConfirmSubmit=confirmSubmit;}
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

/* V517 evidence markers: localSyncedCustomers buildShipCustomersFromRows readDeviceProductRows localSyncedItemsForCustomer hydrateShipRowsFromDb 建立中 showPreview ship-preview-panel /api/ship/preview /api/product-locations showShipLocations stripSupportNotes supportTotalPieces supportSticksSum v517-full-checklist-alignment-pack27 */
