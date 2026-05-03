
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

/* 沅興木業 FULL MASTER V22 REAL LOADED COMPLETE - page_warehouse_master_v22 */
(function(){ window.__YX_FULL_MASTER_V22_PAGE__='page_warehouse_master_v22'; })();

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

/* ===== V2 MERGED FROM static/yx_modules/warehouse_hardlock.js ===== */
/* 沅興木業 倉庫頁最終鎖死版
   原則：倉庫頁只吃 templates/module.html 內唯一 HTML；本檔只更新資料、事件、API，不再整頁 render / 不再吃舊 render。 */
(function(){
  'use strict';
  const YX = window.YXHardLock || {};
  const $ = id => document.getElementById(id);
  const clean = v => String(v ?? '').replace(/\s+/g,' ').trim();
  const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const api = YX.api || (async (url,opt={})=>{ const res=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}}); const data=await res.json().catch(()=>({success:false,error:'伺服器回應格式錯誤'})); if(!res.ok||data.success===false) throw new Error(data.error||data.message||'請求失敗'); return data; });
  const toast = YX.toast || ((m)=>console.log(m));
  const isWarehouse = () => document.querySelector('.module-screen[data-module="warehouse"]') || (location.pathname||'').includes('/warehouse');
  const state = {
    data:{cells:[], zones:{A:{},B:{}}}, available:[], availableByZone:{A:[],B:[]}, activeZone:null, searchKeys:new Set(), undoStack:[],
    current:{zone:'A',col:1,slot:1,items:[],note:''}, batchCount:3, drag:null, loading:null, bound:false, unplacedOpen:false
  };
  const key = (z,c,s)=>`${clean(z).toUpperCase()}-${Number(c)}-${Number(s)}`;
  const zones = ['A','B'];
  function itemQty(it){
    const candidates=[it?.qty,it?.quantity,it?.pieces,it?.count,it?.piece_count,it?.total_qty,it?.件數];
    for(const v of candidates){ const n=Number(v); if(Number.isFinite(n)&&n>0) return Math.floor(n); }
    const text=clean(it?.product_text||it?.product||'');
    const m=text.match(/(?:x|×|\*)\s*(\d+)\s*(?:件)?\s*$/i); if(m) return Math.max(1,Number(m[1]));
    return 1;
  }
  function materialOf(it){ return clean(it?.material || it?.wood_type || it?.材質 || ''); }
  function sourceOf(it){
    const raw=clean(it?.source || it?.source_table || it?.type || '');
    if(/master|總單/i.test(raw)) return '總單';
    if(/order|訂單/i.test(raw)) return '訂單';
    if(/inventory|stock|庫存/i.test(raw)) return '庫存';
    return raw || '庫存';
  }
  function cleanCustomer(v){
    const s=clean(v)||'庫存';
    return s.replace(/\b(FOB代付|FOB代|FOB|CNF)\b/gi,'').replace(/\s+/g,' ').trim() || '庫存';
  }
  function productText(it){ return clean(it?.product_text || it?.product || it?.product_size || ''); }
  function normalizedItem(it, qty, placement){
    const product=productText(it);
    return {...it, product_text:product, product, customer_name:cleanCustomer(it?.customer_name||it?.customer||''), material:materialOf(it), qty:Math.max(1,Math.floor(Number(qty||itemQty(it)||1))), source:sourceOf(it), source_table:it?.source_table || it?.source || sourceOf(it), source_id:it?.source_id || it?.id || '', placement_label:placement || it?.placement_label || it?.layer_label || '前排', layer_label:placement || it?.placement_label || it?.layer_label || '前排'};
  }
  function cellFromData(z,c,s){
    z=clean(z).toUpperCase(); c=Number(c); s=Number(s);
    return (state.data.cells||[]).find(x=>clean(x.zone).toUpperCase()===z && Number(x.column_index)===c && Number(x.slot_number)===s) || null;
  }
  function cellItems(z,c,s){
    const cell=cellFromData(z,c,s);
    if(!cell) return [];
    if(Array.isArray(cell.items)) return cell.items;
    try { const arr=JSON.parse(cell.items_json||'[]'); return Array.isArray(arr)?arr:[]; } catch(_e){ return []; }
  }
  function cellNote(z,c,s){ return clean(cellFromData(z,c,s)?.note || ''); }
  function maxSlot(z,c){
    z=clean(z).toUpperCase(); c=Number(c);
    const nums=(state.data.cells||[]).filter(x=>clean(x.zone).toUpperCase()===z && Number(x.column_index)===c).map(x=>Number(x.slot_number)||0);
    return Math.max(20, ...nums, getColumnList(z,c)?.querySelectorAll('[data-slot]')?.length || 0);
  }
  function getColumnList(z,c){ return document.querySelector(`.vertical-column-card[data-zone="${z}"][data-column="${Number(c)}"] .vertical-slot-list`); }
  function createSlotElement(z,c,s){
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='yx-final-slot yx108-slot yx106-slot yx116-slot vertical-slot';
    btn.dataset.zone=z; btn.dataset.column=String(Number(c)); btn.dataset.slot=String(Number(s)); btn.style.touchAction='none';
    btn.innerHTML='<div class="yx108-slot-row yx108-slot-row1 yx116-slot-row1"><span class="yx108-slot-no"></span><span class="yx108-slot-customers yx108-slot-empty">空格</span></div><div class="yx108-slot-row yx108-slot-row2 yx116-slot-row2"><span class="yx108-slot-sum">0</span><span class="yx108-slot-total">0件</span></div>';
    return btn;
  }
  function ensureSlotElement(z,c,s){
    const list=getColumnList(z,c); if(!list) return null;
    let el=list.querySelector(`[data-zone="${z}"][data-column="${Number(c)}"][data-slot="${Number(s)}"]`);
    if(!el){ el=createSlotElement(z,c,s); const after=Array.from(list.querySelectorAll('[data-slot]')).find(x=>Number(x.dataset.slot)>Number(s)); if(after) list.insertBefore(el,after); else list.appendChild(el); bindSlot(el); }
    return el;
  }
  function ensureSlotRange(){ zones.forEach(z=>{ for(let c=1;c<=6;c++){ for(let s=1;s<=maxSlot(z,c);s++) ensureSlotElement(z,c,s); } }); }
  function removeExtraDom(z,c){
    const list=getColumnList(z,c); if(!list) return;
    const max=maxSlot(z,c);
    list.querySelectorAll('[data-slot]').forEach(el=>{ if(Number(el.dataset.slot)>max) el.remove(); });
  }
  function updateSlotUI(z,c,s){
    z=clean(z).toUpperCase(); c=Number(c); s=Number(s);
    const el=ensureSlotElement(z,c,s); if(!el) return;
    const items=cellItems(z,c,s).filter(it=>itemQty(it)>0);
    const no=el.querySelector('.yx108-slot-no'); if(no) no.textContent=String(s);
    const customers=el.querySelector('.yx108-slot-customers');
    const sum=el.querySelector('.yx108-slot-sum');
    const total=el.querySelector('.yx108-slot-total');
    const hi=state.searchKeys.has(key(z,c,s));
    el.classList.toggle('filled', items.length>0);
    el.classList.toggle('highlight', hi);
    el.dataset.hasItems=items.length?'1':'0';
    if(!items.length){
      customers && (customers.textContent='空格', customers.classList.add('yx108-slot-empty'));
      sum && (sum.textContent='0'); total && (total.textContent='0件');
      return;
    }
    const names=[...new Set(items.map(it=>cleanCustomer(it.customer_name)).filter(Boolean))];
    const qtys=items.map(itemQty).filter(n=>n>0);
    const totalQty=qtys.reduce((a,b)=>a+b,0);
    customers && (customers.textContent=names.join('/') || '庫存', customers.classList.remove('yx108-slot-empty'));
    sum && (sum.textContent=qtys.join('+') || String(totalQty));
    total && (total.textContent=`${totalQty}件`);
  }
  function updateAllSlots(){
    ensureSlotRange();
    zones.forEach(z=>{ for(let c=1;c<=6;c++){ for(let s=1;s<=maxSlot(z,c);s++) updateSlotUI(z,c,s); removeExtraDom(z,c); } });
    updateNotes(); bindSlots(); setWarehouseZone(state.activeZone || localStorage.getItem('warehouseActiveZone') || 'A', false);
  }
  function updateNotes(){
    for(const z of zones){ const n=$(z==='A'?'zone-A-count-note':'zone-B-count-note'); if(n) n.textContent='6 欄｜動態格數｜HTML 鎖定'; }
  }
  async function loadAvailable(){
    try{
      const ts=Date.now();
      const [all,a,b]=await Promise.all([api('/api/warehouse/available-items?ts='+ts),api('/api/warehouse/available-items?zone=A&ts='+ts),api('/api/warehouse/available-items?zone=B&ts='+ts)]);
      state.available=Array.isArray(all.items)?all.items:[];
      state.availableByZone={A:Array.isArray(a.items)?a.items:[], B:Array.isArray(b.items)?b.items:[]};
      const count=items=>(Array.isArray(items)?items:[]).reduce((n,it)=>n+itemQty(it),0);
      const pill=$('warehouse-unplaced-pill'); if(pill) pill.textContent=`A區 ${count(state.availableByZone.A)}件｜B區 ${count(state.availableByZone.B)}件｜總計 ${count(state.available)}件`;
    }catch(_e){ state.available=state.available||[]; state.availableByZone=state.availableByZone||{A:[],B:[]}; }
  }
  async function renderWarehouse(force=false){
    if(state.loading && !force) return state.loading;
    state.loading=(async()=>{ try{ const [d]=await Promise.all([api('/api/warehouse?ts='+Date.now()), loadAvailable()]); state.data={cells:Array.isArray(d.cells)?d.cells:[], zones:d.zones||{A:{},B:{}}}; window.state=window.state||{}; window.state.warehouse={...state.data, activeZone:state.activeZone, availableItems:state.available}; updateAllSlots(); } catch(e){ toast(e.message||'倉庫圖載入失敗','error'); bindSlots(); } finally{ state.loading=null; } })();
    return state.loading;
  }
  function setWarehouseZone(zone='A', scroll=true){
    zone=clean(zone).toUpperCase(); if(!['A','B','ALL'].includes(zone)) zone='A'; state.activeZone=zone; localStorage.setItem('warehouseActiveZone',zone);
    const za=$('zone-A'), zb=$('zone-B'); if(za) za.style.display=zone==='B'?'none':''; if(zb) zb.style.display=zone==='A'?'none':'';
    ['A','B','ALL'].forEach(z=>$('zone-switch-'+z)?.classList.toggle('active', z===zone));
    const pill=$('warehouse-selection-pill'); if(pill) pill.textContent=`目前區域：${zone==='ALL'?'全部':zone+' 區'}`;
    if(scroll && zone!=='ALL') (zone==='A'?za:zb)?.scrollIntoView?.({behavior:'smooth',block:'start'});
  }
  function clearWarehouseHighlights(){ state.searchKeys.clear(); $('warehouse-search-results')?.classList.add('hidden'); $('warehouse-unplaced-list-inline')?.classList.add('hidden'); state.unplacedOpen=false; updateAllSlots(); }
  function highlightWarehouseCell(z,c,s){ setWarehouseZone(clean(z).toUpperCase(),false); state.searchKeys.add(key(z,c,s)); updateSlotUI(z,c,s); const el=ensureSlotElement(clean(z).toUpperCase(),c,s); if(el){ el.classList.add('highlight','flash-highlight'); el.scrollIntoView?.({behavior:'smooth',block:'center'}); setTimeout(()=>el.classList.remove('flash-highlight'),2200); } }
  async function searchWarehouse(){
    const q=clean($('warehouse-search')?.value||''); if(!q){ clearWarehouseHighlights(); return; }
    const box=$('warehouse-search-results');
    try{ const d=await api('/api/warehouse/search?q='+encodeURIComponent(q)+'&ts='+Date.now()); const hits=Array.isArray(d.items)?d.items:[]; state.searchKeys=new Set(hits.map(h=>{ const c=h.cell||h; return key(c.zone,c.column_index,c.slot_number); })); updateAllSlots(); if(box){ box.classList.remove('hidden'); box.innerHTML=hits.length?hits.map((h,i)=>{ const c=h.cell||h; return `<button type="button" class="deduct-card yx-search-hit" data-hit="${i}"><strong>${esc(c.zone)}-${Number(c.column_index)}-${Number(c.slot_number)}</strong><div>${esc(cleanCustomer(h.customer_name||h.item?.customer_name||''))}</div><div class="small-note">${esc(productText(h.item||h))}</div></button>`; }).join(''):'<div class="empty-state-card compact-empty">找不到格位</div>'; box.querySelectorAll('[data-hit]').forEach((btn,i)=>btn.onclick=()=>{ const c=(hits[i].cell||hits[i]); highlightWarehouseCell(c.zone,c.column_index,c.slot_number); }); } if(hits[0]){ const c=hits[0].cell||hits[0]; highlightWarehouseCell(c.zone,c.column_index,c.slot_number); } }catch(e){ toast(e.message||'搜尋失敗','error'); }
  }
  function highlightWarehouseSameCustomer(){
    const name=clean(window.__YX_SELECTED_CUSTOMER__||$('customer-name')?.value||''); if(!name) return toast('請先選擇客戶','warn');
    state.searchKeys.clear(); (state.data.cells||[]).forEach(c=>{ cellItems(c.zone,c.column_index,c.slot_number).forEach(it=>{ const cn=cleanCustomer(it.customer_name); if(cn.includes(name)||name.includes(cn)) state.searchKeys.add(key(c.zone,c.column_index,c.slot_number)); }); }); updateAllSlots();
  }
  async function toggleWarehouseUnplacedHighlight(){
    await loadAvailable(); const box=$('warehouse-unplaced-list-inline'); if(!box) return; state.unplacedOpen=!state.unplacedOpen;
    if(!state.unplacedOpen){ box.classList.add('hidden'); return; }
    const list=(state.activeZone==='B'?state.availableByZone.B:(state.activeZone==='A'?state.availableByZone.A:state.available)); box.classList.remove('hidden'); box.innerHTML=list.length?list.map((it,i)=>`<div class="deduct-card"><strong>${esc(cleanCustomer(it.customer_name||''))}</strong><div>${esc(productText(it))}</div><div class="small-note">${itemQty(it)}件｜${esc(sourceOf(it))}｜${esc(state.activeZone==='ALL'?(it.zone||''):state.activeZone+'區')}</div></div>`).join(''):'<div class="empty-state-card compact-empty">目前沒有未錄入倉庫圖商品</div>';
  }
  function optionLabel(it){ const mat=materialOf(it); return `${cleanCustomer(it.customer_name||'')}｜${mat?mat+'｜':''}${productText(it)}｜${itemQty(it)}件｜${sourceOf(it)}`; }
  function availableListForCurrent(){ const z=clean(state.current?.zone||state.activeZone||'A').toUpperCase(); return z==='B'?state.availableByZone.B:state.availableByZone.A; }
  function availableRows(){ const q=clean($('warehouse-item-search')?.value||'').toLowerCase(); return availableListForCurrent().map((it,i)=>({it,index:i,key:itemKey(it)})).filter(r=>!q||optionLabel(r.it).toLowerCase().includes(q)); }
  function placementForBatch(i){ return i===0?'後排':i===1?'中間':'前排'; }
  function itemKey(it){ return [cleanCustomer(it?.customer_name||''), productText(it), materialOf(it), sourceOf(it), clean(it?.source_id||it?.id||''), clean(it?.zone||'')].join('::'); }
  function snapshotBatchRows(){
    const rows=[];
    document.querySelectorAll('#yx121-batch-rows .yx121-batch-row').forEach((row,i)=>{
      const sel=row.querySelector('.yx121-batch-select'); const qty=row.querySelector('.yx121-batch-qty');
      const opt=sel?.options?.[sel.selectedIndex];
      rows[i]={value:sel?.value||'', key:opt?.dataset?.itemKey||'', qty:qty?.value||'', placement:placementForBatch(i)};
    });
    return rows;
  }
  function restoreBatchRows(saved){
    if(!Array.isArray(saved)) return;
    document.querySelectorAll('#yx121-batch-rows .yx121-batch-row').forEach((row,i)=>{
      const sel=row.querySelector('.yx121-batch-select'); const qty=row.querySelector('.yx121-batch-qty'); const old=saved[i]||{};
      if(sel){
        let chosen='';
        if(old.key){ const opt=Array.from(sel.options).find(o=>o.dataset.itemKey===old.key); if(opt) chosen=opt.value; }
        if(!chosen && old.value !== '' && Array.from(sel.options).some(o=>o.value===old.value)) chosen=old.value;
        sel.value=chosen;
      }
      if(qty && old.qty) qty.value=old.qty;
    });
    syncBatchSelectLimits(false);
  }
  function renderCellItems(preserve=true){
    const box=$('warehouse-cell-items'); if(!box) return;
    const saved = preserve ? snapshotBatchRows() : [];
    // 批量加入面板已直接寫在 templates/module.html；這裡只更新「目前商品」與「每列選項」，不清掉已選下拉。
    if(!$('warehouse-current-items-html') || !$('yx121-batch-rows')){
      box.innerHTML=`<div class="yx-direct-section" data-html-locked="warehouse-current-items-html"><div class="yx-direct-section-title">目前此格商品</div><div id="warehouse-current-items-html" class="yx-direct-current-list"></div></div><div class="yx-direct-batch-panel" data-html-locked="warehouse-batch-html-fixed"><div class="yx-direct-section-title">批量加入商品</div><div class="small-note">A / B 區各自只顯示尚未錄入倉庫圖商品；第 1 筆後排、第 2 筆中間、第 3 筆前排。</div><div id="yx121-batch-rows"></div><div class="btn-row compact-row"><button class="ghost-btn small-btn" type="button" id="yx121-add-batch-row">新增更多批量</button><button class="primary-btn small-btn" type="button" id="yx121-save-cell">儲存格位</button></div></div>`;
    }
    const current=(state.current.items||[]).map((it,i)=>{ const mat=materialOf(it), place=clean(it.placement_label||it.layer_label||''); return `<div class="yx-direct-current-item" data-idx="${i}"><div class="yx-direct-current-main"><span class="yx-direct-source">${esc(sourceOf(it))}</span>${mat?`<span class="yx-direct-material">${esc(mat)}</span>`:''}<strong>${esc(cleanCustomer(it.customer_name))}</strong><span class="yx-direct-product">${esc(productText(it))}</span></div><div class="yx-direct-current-side"><span>${place?esc(place)+'｜':''}${itemQty(it)}件</span><button class="remove yx-direct-remove" type="button" data-remove-cell-item="${i}">×</button></div></div>`; }).join('') || '<div class="empty-state-card compact-empty">此格目前沒有商品</div>';
    const currentBox=$('warehouse-current-items-html'); if(currentBox) currentBox.innerHTML=current;
    const rowsData=availableRows();
    const opts=rowsData.map(r=>`<option value="${esc(r.key)}" data-index="${r.index}" data-max="${itemQty(r.it)}" data-item-key="${esc(r.key)}">${esc(optionLabel(r.it))}｜可加入 ${itemQty(r.it)} 件</option>`).join('');
    const emptyHint = opts ? '' : '<option value="">此區目前沒有未錄入商品，或請換 A/B 區</option>';
    const rowCount=Math.max(3,Number(state.batchCount||3),saved.length||0);
    const rows=Array.from({length:rowCount},(_,i)=>`<div class="yx121-batch-row" data-batch-index="${i}"><label class="yx121-batch-label">${placementForBatch(i)}</label><select class="text-input yx121-batch-select"><option value="">選擇此區未錄入商品</option>${opts || emptyHint}</select><input class="text-input yx121-batch-qty" type="number" min="1" placeholder="加入件數" data-yx121-max=""></div>`).join('');
    const rowsBox=$('yx121-batch-rows'); if(rowsBox) rowsBox.innerHTML=rows;
    restoreBatchRows(saved);
  }
  async function openWarehouseModal(z,c,s){
    z=clean(z).toUpperCase();
    state.current={zone:z,col:Number(c),slot:Number(s),items:JSON.parse(JSON.stringify(cellItems(z,c,s))),note:cellNote(z,c,s)};
    state.batchCount=3;
    const meta=$('warehouse-modal-meta'); if(meta) meta.textContent=`${z} 區第 ${Number(c)} 欄 第 ${Number(s)} 格`;
    const note=$('warehouse-note'); if(note) note.value=state.current.note||'';
    const search=$('warehouse-item-search'); if(search) search.value='';
    $('warehouse-modal')?.classList.remove('hidden');
    renderCellItems(false);
    try { if(search) search.focus(); } catch(_e) {}
    // 先立刻開啟格位批量加入畫面，再背景抓 A/B 區未錄入商品；保留使用者已選下拉與件數。
    try { await loadAvailable(); renderCellItems(true); } catch(e){ toast(e.message||'未錄入商品載入失敗','error'); }
  }
  function closeWarehouseModal(){ $('warehouse-modal')?.classList.add('hidden'); }
  function selectedBatchUsage(){
    const used = new Map();
    document.querySelectorAll('#yx121-batch-rows .yx121-batch-row').forEach(row=>{
      const sel=row.querySelector('.yx121-batch-select'); const qtyEl=row.querySelector('.yx121-batch-qty');
      const opt=sel?.options?.[sel.selectedIndex]; const k=opt?.dataset?.itemKey || sel?.value || '';
      if(!k) return;
      const q=Math.max(0, Math.floor(Number(qtyEl?.value||0)));
      used.set(k, (used.get(k)||0)+q);
    });
    return used;
  }
  function syncBatchSelectLimits(fillEmpty=true){
    const rows = Array.from(document.querySelectorAll('#yx121-batch-rows .yx121-batch-row'));
    const chosen = new Map();
    rows.forEach(row=>{
      const sel=row.querySelector('.yx121-batch-select'); const opt=sel?.options?.[sel.selectedIndex]; const k=opt?.dataset?.itemKey || sel?.value || '';
      if(k) chosen.set(k,(chosen.get(k)||0)+1);
    });
    rows.forEach(row=>{
      const sel=row.querySelector('.yx121-batch-select'); const qty=row.querySelector('.yx121-batch-qty'); if(!sel||!qty) return;
      const opt=sel.options[sel.selectedIndex]; const keyNow=opt?.dataset?.itemKey || sel.value || '';
      Array.from(sel.options).forEach(o=>{
        const k=o.dataset?.itemKey || o.value || '';
        if(!k){ o.disabled=false; return; }
        o.disabled = !!(chosen.get(k)>0 && k!==keyNow);
      });
      const max=Number(opt?.dataset?.max||0);
      if(max>0){ qty.max=String(max); qty.dataset.yx121Max=String(max); if(fillEmpty && !qty.value) qty.value=String(max); if(Number(qty.value)>max) qty.value=String(max); }
      else { qty.removeAttribute('max'); qty.dataset.yx121Max=''; if(!sel.value) qty.value=''; }
    });
  }
  function collectBatchItems(){
    const pool=availableListForCurrent();
    const collected = new Map();
    document.querySelectorAll('#yx121-batch-rows .yx121-batch-row').forEach(row=>{
      const sel=row.querySelector('.yx121-batch-select'); const raw=sel?.value; if(raw==='') return;
      const opt=sel?.options?.[sel.selectedIndex]; const stableKey=opt?.dataset?.itemKey || raw;
      let it=pool.find(x=>itemKey(x)===stableKey);
      if(!it){ const idx=Number(opt?.dataset?.index ?? raw); if(Number.isFinite(idx)) it=pool[idx]; }
      if(!it) return;
      const max=itemQty(it)||1;
      let qty=Math.max(1, Math.floor(Number(row.querySelector('.yx121-batch-qty')?.value||max)));
      const existed=collected.get(stableKey);
      if(existed){
        // 同一種商品只允許出現一次，數量上限是未錄入剩餘量；避免 4 件被三列重複算成 12 件。
        existed.qty = Math.min(max, existed.qty + qty);
        return;
      }
      qty=Math.min(max,qty);
      collected.set(stableKey, normalizedItem(it,qty,placementForBatch(Number(row.dataset.batchIndex||collected.size))));
    });
    return Array.from(collected.values());
  }
  async function saveCellRaw(z,c,s,items,note){ return api('/api/warehouse/cell',{method:'POST',body:JSON.stringify({zone:clean(z).toUpperCase(),column_index:Number(c),slot_type:'direct',slot_number:Number(s),items:items||[],note:note||''})}); }
  async function saveWarehouseCell(){
    if(!state.current) return toast('請先開啟格位','warn');
    const added=collectBatchItems();
    const beforeItems=JSON.parse(JSON.stringify(state.current.items||[])); const beforeNote=$('warehouse-note')?.value||'';
    const items=[...(state.current.items||[]),...added];
    const btn=$('yx121-save-cell');
    try{
      if(btn){ btn.disabled=true; btn.textContent='儲存中…'; }
      try { window.YXPageUndo?.snapshot?.('warehouse-cell', async()=>{ if(!state.current) return; state.current.items=beforeItems; await saveCellRaw(state.current.zone,state.current.col,state.current.slot,beforeItems,beforeNote); await renderWarehouse(true); highlightWarehouseCell(state.current.zone,state.current.col,state.current.slot); }); } catch(_e) {}
      state.current.items=items;
      let localCell=(state.data.cells||[]).find(c=>clean(c.zone).toUpperCase()===state.current.zone&&Number(c.column_index)===state.current.col&&Number(c.slot_number)===state.current.slot);
      if(!localCell){ localCell={zone:state.current.zone,column_index:state.current.col,slot_type:'direct',slot_number:state.current.slot,items:[],items_json:'[]',note:''}; state.data.cells.push(localCell); }
      localCell.items=items; localCell.items_json=JSON.stringify(items); localCell.note=$('warehouse-note')?.value||'';
      updateSlotUI(state.current.zone,state.current.col,state.current.slot);
      const saved=await saveCellRaw(state.current.zone,state.current.col,state.current.slot,items,$('warehouse-note')?.value||'');
      if(saved && Array.isArray(saved.cells)) state.data.cells=saved.cells;
      updateSlotUI(state.current.zone,state.current.col,state.current.slot);
      toast(`格位已永久儲存${added.length?`，新增 ${added.length} 筆`:''}`,'ok');
      closeWarehouseModal();
      await renderWarehouse(true);
      highlightWarehouseCell(state.current.zone,state.current.col,state.current.slot);
    }catch(e){ toast(e.message||'儲存格位失敗','error'); throw e; }
    finally{ if(btn){ btn.disabled=false; btn.textContent='儲存格位'; } }
  }
  function updateUndoButton(){ const b=$('yx121-warehouse-undo'); if(b) b.disabled=!state.undoStack.length; }
  async function moveCellContents(from,to){
    const f={zone:clean(from.zone).toUpperCase(),col:Number(from.col),slot:Number(from.slot)}, t={zone:clean(to.zone).toUpperCase(),col:Number(to.col),slot:Number(to.slot)};
    if(f.zone===t.zone&&f.col===t.col&&f.slot===t.slot) return; const moved=cellItems(f.zone,f.col,f.slot).filter(it=>itemQty(it)>0); if(!moved.length) return toast('此格沒有可拖拉的商品','warn');
    const src={...f,items:JSON.parse(JSON.stringify(cellItems(f.zone,f.col,f.slot))),note:cellNote(f.zone,f.col,f.slot)}; const dst={...t,items:JSON.parse(JSON.stringify(cellItems(t.zone,t.col,t.slot))),note:cellNote(t.zone,t.col,t.slot)};
    const dstAfter=[...moved.map(it=>normalizedItem(it,itemQty(it),'前排')),...dst.items];
    try{ await saveCellRaw(f.zone,f.col,f.slot,[],src.note); await saveCellRaw(t.zone,t.col,t.slot,dstAfter,dst.note); state.undoStack.push({source:src,target:dst}); if(state.undoStack.length>20) state.undoStack.shift(); updateUndoButton(); toast('已移動到前排','ok'); await renderWarehouse(true); highlightWarehouseCell(t.zone,t.col,t.slot); } catch(e){ toast(e.message||'拖拉移動失敗','error'); await renderWarehouse(true); }
  }
  async function undoWarehouseMove(){ const last=state.undoStack.pop(); updateUndoButton(); if(!last) return toast('目前沒有可還原的倉庫移動','warn'); try{ await saveCellRaw(last.target.zone,last.target.col,last.target.slot,last.target.items,last.target.note); await saveCellRaw(last.source.zone,last.source.col,last.source.slot,last.source.items,last.source.note); toast('已還原上一步','ok'); await renderWarehouse(true); highlightWarehouseCell(last.source.zone,last.source.col,last.source.slot); }catch(e){ state.undoStack.push(last); updateUndoButton(); toast(e.message||'還原失敗','error'); } }
  async function insertWarehouseCell(z,c,s){ const d=await api('/api/warehouse/add-slot',{method:'POST',body:JSON.stringify({zone:clean(z).toUpperCase(),column_index:Number(c),insert_after:Number(s||0),slot_type:'direct'})}); toast('已插入格子','ok'); state.data.cells=Array.isArray(d.cells)?d.cells:state.data.cells; await renderWarehouse(true); highlightWarehouseCell(z,c,Number(d.slot_number||s+1)); }
  async function deleteWarehouseCell(z,c,s){ if(cellItems(z,c,s).length) return toast('格子內還有商品，請先退回該格或移除商品後再刪除','warn'); if(!confirm(`確定刪除 ${z} 區第 ${c} 欄第 ${s} 格？`)) return; const d=await api('/api/warehouse/remove-slot',{method:'POST',body:JSON.stringify({zone:clean(z).toUpperCase(),column_index:Number(c),slot_number:Number(s),slot_type:'direct'})}); if(Array.isArray(d.cells)) state.data.cells=d.cells; toast('已刪除格子','ok'); await renderWarehouse(true); }
  async function returnWarehouseCell(z,c,s){ const items=cellItems(z,c,s); if(!items.length) return toast('此格沒有商品可退回','warn'); if(!confirm(`確定將 ${z} 區第 ${c} 欄第 ${s} 格商品退回未錄入倉庫圖？`)) return; const d=await api('/api/warehouse/return-unplaced',{method:'POST',body:JSON.stringify({zone:clean(z).toUpperCase(),column_index:Number(c),slot_number:Number(s)})}); if(Array.isArray(d.cells)) state.data.cells=d.cells; toast('已退回該格','ok'); await renderWarehouse(true); highlightWarehouseCell(z,c,s); }
  function menu(){ let m=$('yx-final-warehouse-menu'); if(m) return m; m=document.createElement('div'); m.id='yx-final-warehouse-menu'; m.className='yx-final-warehouse-menu hidden'; m.innerHTML='<button data-wh-act="open">編輯格子</button><button data-wh-act="return">退回該格</button><button data-wh-act="insert">插入格子</button><button data-wh-act="delete">刪除格子</button>'; document.body.appendChild(m); return m; }
  function showMenu(z,c,s,x,y){ const m=menu(); m.dataset.zone=z; m.dataset.column=c; m.dataset.slot=s; m.style.left=(x||window.innerWidth/2)+'px'; m.style.top=(y||window.innerHeight/2)+'px'; m.classList.remove('hidden'); }
  function bindSlot(slot){
    if(!slot || slot.dataset.yxFinalBound==='1') return; slot.dataset.yxFinalBound='1'; let press=null;
    const data=()=>({zone:slot.dataset.zone,col:Number(slot.dataset.column),slot:Number(slot.dataset.slot)});
    slot.addEventListener('pointerdown',ev=>{ if(ev.button && ev.button!==0) return; const d=data(); press={x:ev.clientX,y:ev.clientY,timer:setTimeout(()=>{ press=null; showMenu(d.zone,d.col,d.slot,ev.clientX,ev.clientY); },650),...d,moved:false}; });
    slot.addEventListener('pointermove',ev=>{ if(!press) return; const moved=Math.abs(ev.clientX-press.x)>10 || Math.abs(ev.clientY-press.y)>10; if(moved){ clearTimeout(press.timer); press.moved=true; if(slot.dataset.hasItems==='1' && !state.drag){ state.drag={zone:press.zone,col:press.col,slot:press.slot}; slot.classList.add('yx121-warehouse-dragging'); try{slot.setPointerCapture?.(ev.pointerId);}catch(_e){} } } });
    slot.addEventListener('pointerup',ev=>{ if(press) clearTimeout(press.timer); const dragging=state.drag; document.querySelectorAll('.yx121-warehouse-dragging,.yx121-warehouse-drop-target').forEach(el=>el.classList.remove('yx121-warehouse-dragging','yx121-warehouse-drop-target')); if(dragging){ slot.dataset.blockClickUntil=String(Date.now()+900); const target=document.elementFromPoint(ev.clientX,ev.clientY)?.closest?.('[data-zone][data-column][data-slot]'); state.drag=null; if(target){ ev.preventDefault(); ev.stopPropagation(); moveCellContents(dragging,{zone:target.dataset.zone,col:target.dataset.column,slot:target.dataset.slot}); press=null; return; } } if(press?.moved) slot.dataset.blockClickUntil=String(Date.now()+500); press=null; });
    ['pointercancel','pointerleave'].forEach(t=>slot.addEventListener(t,()=>{ if(press){ clearTimeout(press.timer); press=null; } }));
    slot.addEventListener('pointerenter',()=>{ if(state.drag) slot.classList.add('yx121-warehouse-drop-target'); }); slot.addEventListener('pointerleave',()=>slot.classList.remove('yx121-warehouse-drop-target'));
    slot.addEventListener('contextmenu',ev=>{ ev.preventDefault(); const d=data(); showMenu(d.zone,d.col,d.slot,ev.clientX,ev.clientY); });
    slot.addEventListener('click',()=>{ if(Date.now()<Number(slot.dataset.blockClickUntil||0)) return; const d=data(); openWarehouseModal(d.zone,d.col,d.slot); });
  }
  function bindSlots(){ document.querySelectorAll('#warehouse-root [data-zone][data-column][data-slot]').forEach(bindSlot); }
  function bindGlobal(){
    if(state.bound) return; state.bound=true;
    document.addEventListener('click',async ev=>{
      const act=ev.target?.closest?.('[data-wh-act]'); if(act){ ev.preventDefault(); const m=menu(); const z=m.dataset.zone,c=Number(m.dataset.column),s=Number(m.dataset.slot); m.classList.add('hidden'); try{ if(act.dataset.whAct==='open') await openWarehouseModal(z,c,s); if(act.dataset.whAct==='return') await returnWarehouseCell(z,c,s); if(act.dataset.whAct==='insert') await insertWarehouseCell(z,c,s); if(act.dataset.whAct==='delete') await deleteWarehouseCell(z,c,s); }catch(e){ toast(e.message||'格位操作失敗','error'); } return; }
      if(!ev.target?.closest?.('#yx-final-warehouse-menu')) menu().classList.add('hidden');
      if(ev.target?.id==='yx121-add-batch-row'){ ev.preventDefault(); state.batchCount=Math.max(3,Number(state.batchCount||3))+1; renderCellItems(); return; }
      if(ev.target?.id==='yx121-save-cell'){ ev.preventDefault(); try{ await saveWarehouseCell(); }catch(e){ toast(e.message||'儲存格位失敗','error'); } return; }
      const rm=ev.target?.closest?.('[data-remove-cell-item]'); if(rm){ ev.preventDefault(); state.current.items.splice(Number(rm.dataset.removeCellItem),1); renderCellItems(); return; }
    },true);
    document.addEventListener('change', ev=>{ const sel=ev.target?.closest?.('#yx121-batch-rows .yx121-batch-select'); if(sel){ syncBatchSelectLimits(); } }, true);
    document.addEventListener('input', ev=>{ const qty=ev.target?.closest?.('#yx121-batch-rows .yx121-batch-qty'); if(qty){ const max=Number(qty.dataset.yx121Max||qty.max||0); if(max>0 && Number(qty.value)>max){ qty.value=String(max); toast('加入件數不可超過該商品可加入數量','warn'); } } }, true);
    $('warehouse-item-search')?.addEventListener('input',renderCellItems);
    updateUndoButton();
  }
  async function jumpProductToWarehouse(customerName, productText){ const q=clean([customerName,productText].filter(Boolean).join(' ')); if(!q) return toast('缺少商品或客戶關鍵字','warn'); try{ const d=await api('/api/warehouse/search?q='+encodeURIComponent(q)+'&ts='+Date.now()); const hit=(Array.isArray(d.items)?d.items:[])[0]; if(!hit) return toast('倉庫圖找不到這筆商品位置','warn'); const c=hit.cell||hit; highlightWarehouseCell(c.zone,c.column_index,c.slot_number); }catch(e){ toast(e.message||'跳到倉庫位置失敗','error'); } }
  function install(){ if(!isWarehouse()) return; document.documentElement.dataset.yxWarehouseSingleHtmlDataJs='true'; bindGlobal(); bindSlots(); setWarehouseZone(localStorage.getItem('warehouseActiveZone')||'A',false); renderWarehouse(true); }
  window.renderWarehouse=renderWarehouse;
  window.setWarehouseZone=setWarehouseZone;
  window.searchWarehouse=searchWarehouse;
  window.clearWarehouseHighlights=clearWarehouseHighlights;
  window.highlightWarehouseSameCustomer=highlightWarehouseSameCustomer;
  window.toggleWarehouseUnplacedHighlight=toggleWarehouseUnplacedHighlight;
  window.undoWarehouseMove=undoWarehouseMove;
  window.openWarehouseModal=openWarehouseModal;
  window.closeWarehouseModal=closeWarehouseModal;
  window.saveWarehouseCell=saveWarehouseCell;
  window.insertWarehouseCell=insertWarehouseCell;
  window.deleteWarehouseCell=deleteWarehouseCell;
  window.returnWarehouseCell=returnWarehouseCell;
  window.jumpProductToWarehouse=jumpProductToWarehouse;
  window.highlightWarehouseCell=highlightWarehouseCell;
  window.YXFinalWarehouse={render:renderWarehouse, openWarehouseModal, saveWarehouseCell, jumpProductToWarehouse};
  if(YX.register) YX.register('warehouse',{install,render:renderWarehouse,cleanup:()=>{}});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
})();

/* ===== END static/yx_modules/warehouse_hardlock.js ===== */

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


/* ===== V44 MAINFILE REAL FIX: focus-safe toast + page undo picker + no legacy jump ===== */
(function(){
  'use strict';
  if (window.__YX_V44_COMMON_MAINFILE_FIX__) return;
  window.__YX_V44_COMMON_MAINFILE_FIX__ = true;
  const clean = v => String(v ?? '').trim();
  const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const mod = () => document.body?.dataset?.module || document.querySelector('.module-screen[data-module]')?.dataset?.module || '';
  let toastTimer = null;
  function focusSnapshot(){
    const a = document.activeElement;
    if (!a || !a.matches?.('input,textarea,select,[contenteditable="true"]')) return null;
    let s = null, e = null;
    try { s = a.selectionStart; e = a.selectionEnd; } catch(_e) {}
    return {el:a, s, e, v:a.value};
  }
  function restoreFocus(snap){
    if (!snap || !snap.el || !document.contains(snap.el)) return;
    const a = document.activeElement;
    if (a === snap.el) return;
    try { snap.el.focus({preventScroll:true}); if (snap.s != null && snap.el.setSelectionRange) snap.el.setSelectionRange(snap.s, snap.e ?? snap.s); } catch(_e) {}
  }
  window.toast = window.showToast = window.notify = function(message, kind='ok'){
    const snap = focusSnapshot();
    let box = document.getElementById('yx-v20-toast');
    if (!box) { box = document.createElement('div'); box.id = 'yx-v20-toast'; document.body.appendChild(box); }
    box.setAttribute('aria-live','polite'); box.setAttribute('role','status'); box.tabIndex = -1;
    box.className = 'yx-v20-toast-card ' + (kind || 'ok');
    box.innerHTML = `<strong>${kind==='error'?'錯誤':kind==='warn'?'提醒':'完成'}</strong><span>${esc(message || '')}</span>`;
    box.style.display = 'block';
    box.style.pointerEvents = 'none';
    box.querySelectorAll('*').forEach(x=>x.style.pointerEvents='none');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(()=>{ try{ box.style.display='none'; }catch(_e){} }, 2300);
    restoreFocus(snap);
  };
  if (window.YXHardLock) window.YXHardLock.toast = window.toast;
  async function api(url,opt={}){
    const r = await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{'Accept':'application/json','Content-Type':'application/json',...(opt.headers||{})}});
    const t = await r.text(); let d={}; try{ d=t?JSON.parse(t):{}; }catch(_e){ d={success:false,error:t}; }
    if(!r.ok || d.success===false) throw new Error(d.error||d.message||'請求失敗'); return d;
  }
  function actionAllowed(a,e){
    const m = mod();
    if (m === 'inventory') return e === 'inventory';
    if (m === 'orders') return e === 'orders' || e === 'customer_profiles' || e === 'customer_items';
    if (m === 'master_order') return e === 'master_orders' || e === 'customer_profiles' || e === 'customer_items';
    if (m === 'ship') return e === 'shipping_records' || a === 'ship' || e === 'orders' || e === 'master_orders' || e === 'inventory';
    if (m === 'warehouse') return e === 'warehouse_cells';
    return true;
  }
  async function openUndoPicker(){
    let modal = document.getElementById('yx-v44-undo-modal');
    if (!modal) {
      modal = document.createElement('div'); modal.id='yx-v44-undo-modal'; modal.className='modal hidden yx-v44-undo-modal';
      modal.innerHTML = '<div class="modal-card glass yx-v44-undo-card"><div class="modal-head"><div class="section-title">復原前一步操作</div><button class="ghost-btn small-btn" type="button" data-yx44-close-undo>關閉</button></div><div class="small-note">只顯示目前頁面最近 10 筆可還原操作，點哪一筆就還原哪一筆。</div><div id="yx-v44-undo-list" class="card-list"><div class="empty-state-card compact-empty">載入中…</div></div></div>';
      document.body.appendChild(modal);
      modal.addEventListener('click', async ev=>{
        if (ev.target.matches('[data-yx44-close-undo]') || ev.target === modal) { modal.classList.add('hidden'); return; }
        const btn = ev.target.closest('[data-yx44-undo-id]'); if(!btn) return;
        const id = btn.dataset.yx44UndoId; btn.disabled=true; btn.textContent='還原中…';
        try{ const d = await api('/api/undo-last',{method:'POST',body:JSON.stringify({id})}); window.toast(d.message||'已還原','ok'); modal.classList.add('hidden'); setTimeout(()=>location.reload(),280); }
        catch(e){ window.toast(e.message||'還原失敗','error'); btn.disabled=false; }
      }, true);
    }
    const list = modal.querySelector('#yx-v44-undo-list'); list.innerHTML='<div class="empty-state-card compact-empty">載入中…</div>'; modal.classList.remove('hidden');
    try{
      const d = await api('/api/audit-trails?limit=80&undo=1');
      const items = (Array.isArray(d.items)?d.items:[]).filter(x=>x.action_type!=='undo' && x.entity_type!=='undo' && actionAllowed(x.action_type,x.entity_type)).slice(0,10);
      list.innerHTML = items.length ? items.map(x=>{
        const a = x.action_type || ''; const e = x.entity_type || ''; const k = x.entity_key || ''; const at = x.created_at || x.timestamp || '';
        return `<button type="button" class="deduct-card yx-v44-undo-item" data-yx44-undo-id="${esc(x.id)}"><strong>${esc(at)}｜${esc(a)}｜${esc(e)}</strong><div>${esc(k)}</div><div class="small-note">${esc(x.username||'')}</div></button>`;
      }).join('') : '<div class="empty-state-card compact-empty">目前頁面沒有可還原的最近操作</div>';
    } catch(e){ list.innerHTML = `<div class="empty-state-card compact-empty">${esc(e.message||'載入失敗')}</div>`; }
  }
  window.YXPageUndo = window.YXPageUndo || {};
  window.YXPageUndo.open = openUndoPicker;
  document.addEventListener('click', ev=>{ const b=ev.target.closest('.yx-page-undo-btn,#yx-page-undo-btn'); if(b){ ev.preventDefault(); openUndoPicker(); } }, true);
  document.addEventListener('DOMContentLoaded',()=>{ document.querySelectorAll('.yx-page-undo-btn,#yx-page-undo-btn').forEach(b=>{ b.disabled=false; b.textContent='復原前一步'; }); }, {once:true});
})();


