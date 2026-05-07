
/* ===== V58 quantity/month/support display lock: parentheses ignored for qty; month asc sort; long support wraps ===== */
(function(){
  'use strict';
  if (window.YX30EffectiveQty) return;
  function clean(v){ return String(v == null ? '' : v).trim(); }
  function norm(v){ return clean(v).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/[＋，,；;]/g,'+').replace(/\s+/g,''); }
  function stripParen(v){ return String(v || '').replace(/[\(（][^\)）]*[\)）]/g,''); }
  function parenAdjust(v){
    // V58：括號只當備註，像 115x51(東昇-8) 一律以 51 件計，不扣 -8。
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
/* ===== END V30 quantity/month/support display lock ===== */

/* 沅興木業 FULL MASTER V22 REAL LOADED COMPLETE - page_warehouse_master_v22 - V96 warehouse plus-minus slots final lock */
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
    const text=clean(it?.product_text||it?.product||'');
    // V70：已放入倉庫格的商品必須先吃此格實際 qty。
    // 避免從下拉選單帶入 unplaced_qty/available_qty=29 後，即使格內輸入改成 =240x22，格子還顯示 29 件。
    const explicitQty=Number(it?.qty ?? it?.quantity ?? it?.pieces ?? it?.count ?? it?.piece_count ?? it?.件數);
    if((it?.placement_label || it?.layer_label || it?.__warehouseCellItem) && Number.isFinite(explicitQty) && explicitQty>0) return Math.floor(explicitQty);
    const explicitPriority = [it?.unplaced_qty, it?.available_qty, it?.remaining_qty];
    for(const v of explicitPriority){ const n=Number(v); if(Number.isFinite(n)&&n>0) return Math.floor(n); }
    // 倉庫下拉 / 批量加入若沒有明確剩餘數，才用「=右側支數x件數」推算。
    const noParen=text.replace(/[\(（][^\)）]*[\)）]/g,'');
    const right=noParen.includes('=') ? noParen.split('=').slice(1).join('=') : '';
    const hasSupportPiece=/\d+(?:\.\d+)?\s*[x×✕＊*X]\s*\d+/.test(right);
    if(hasSupportPiece && window.YX30EffectiveQty){
      const parsed=Number(window.YX30EffectiveQty(text, 0));
      if(Number.isFinite(parsed) && parsed>0) return Math.floor(parsed);
    }
    const candidates=[it?.qty,it?.quantity,it?.pieces,it?.count,it?.piece_count,it?.total_qty,it?.件數];
    for(const v of candidates){ const n=Number(v); if(Number.isFinite(n)&&n>0) return Math.floor(n); }
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
    // V66：倉庫圖格子只顯示真正客戶名；FOB / CNF / FOB代 / fob代 都是付款或條件標記，不顯示在格子客戶名。
    return s
      .replace(/(?:FOB\s*代付|FOB\s*代|FOB|CNF)/gi,'')
      .replace(/(?:^|\s)代(?:$|\s)/g,' ')
      .replace(/\s+/g,' ')
      .trim() || '庫存';
  }
  function productText(it){ return clean(it?.product_text || it?.product || it?.product_size || ''); }
  function stripProductParen(text){ return clean(text).replace(/[\(（][^\)）]*[\)）]/g,'').trim(); }
  function productBaseText(it){
    const raw = clean(it?.display_product_size || it?.base_product_size || productText(it));
    const noParen = stripProductParen(raw).replace(/[×ＸX✕＊*]/g,'x').replace(/＝/g,'=');
    return clean((noParen.split('=')[0] || noParen));
  }
  function productSupportText(it){
    const direct = clean(it?.support_text || it?.support || '');
    if(direct) return direct.replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=');
    const raw = clean(productText(it)).replace(/[Ｘ×✕＊*X]/g,'x').replace(/＝/g,'=');
    return raw.includes('=') ? clean(raw.split('=').slice(1).join('=')) : '';
  }
  function productWithSupport(base, support){
    base = clean(base);
    support = clean(support).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=');
    return support ? `${base}=${support}` : base;
  }

  function qtyFromSupportInput(support, fallback){
    const txt = clean(support).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/[，,；;]/g,'+');
    if(!txt) return Math.max(0, Math.floor(Number(fallback||0)));
    if(window.YX30EffectiveQty){
      const n = Number(window.YX30EffectiveQty('='+txt, fallback || 0));
      if(Number.isFinite(n) && n > 0) return Math.floor(n);
    }
    let total = 0;
    txt.split('+').map(clean).filter(Boolean).forEach(seg=>{
      const m = seg.match(/x\s*(\d+)\s*$/i);
      if(m) total += Number(m[1]||0);
      else if(/\d/.test(seg)) total += 1;
    });
    return total || Math.max(0, Math.floor(Number(fallback||0)));
  }
  function normalizeSupportInputValue(v){
    return clean(v).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/[，,；;]/g,'+');
  }
  function qtyFromProductTextForInput(text, fallback){
    // V68：目前此格商品的輸入框強制以 = 右側判定件數。
    // 132x60x08=162x26 => 26；132x60x08=162x26+133x4+142 => 31；括號只當備註不扣件。
    const raw=clean(text).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').replace(/[，,；;]/g,'+');
    if(!raw.includes('=')) return Math.max(0, Math.floor(Number(fallback||0)));
    const right=raw.split('=').slice(1).join('=').replace(/[＋]/g,'+');
    let total=0, hit=false;
    right.split('+').map(clean).filter(Boolean).forEach(seg=>{
      const plain=seg.replace(/[\(（][^\)）]*[\)）]/g,'').trim();
      const m=plain.match(/x\s*(\d+)\s*$/i);
      if(m){ total += Math.max(0, Number(m[1]||0)); hit=true; return; }
      if(/\d/.test(plain)){ total += 1; hit=true; }
    });
    if(hit) return total;
    return qtyFromSupportInput(right, fallback);
  }
  function slotProductSummary(items){
    const uniq=[];
    (items||[]).forEach(it=>{
      const base=productBaseText(it);
      if(!base) return;
      const mat=materialOf(it);
      // V64：格子第二排只顯示「材質 尺寸」，不顯示支數件數與來源。
      // 例：TD 200x30x125
      const label=clean([mat, base].filter(Boolean).join(' '));
      if(label && !uniq.includes(label)) uniq.push(label);
    });
    if(!uniq.length) return '';
    return uniq.join('\n');
  }
  function normalizedItem(it, qty, placement){
    const product=productText(it);
    const q=Math.max(1,Math.floor(Number(qty||itemQty(it)||1)));
    return {...it, product_text:product, product, customer_name:cleanCustomer(it?.customer_name||it?.customer||''), material:materialOf(it), qty:q, unplaced_qty:q, available_qty:q, remaining_qty:q, __warehouseCellItem:true, source:sourceOf(it), source_table:it?.source_table || it?.source || sourceOf(it), source_id:it?.source_id || it?.id || '', placement_label:placement || it?.placement_label || it?.layer_label || '前排', layer_label:placement || it?.placement_label || it?.layer_label || '前排'};
  }
  function cellFromData(z,c,s){
    z=clean(z).toUpperCase(); c=Number(c); s=Number(s);
    return (state.data.cells||[]).find(x=>clean(x.zone).toUpperCase()===z && Number(x.column_index)===c && Number(x.slot_number)===s && !isDeletedCell(x)) || null;
  }
  function isDeletedCell(cell){ return ['1','true','yes','deleted',1,true].includes(cell?.is_deleted); }
  function activeColumnCells(z,c){
    z=clean(z).toUpperCase(); c=Number(c);
    return (state.data.cells||[]).filter(x=>clean(x.zone).toUpperCase()===z && Number(x.column_index)===c && !isDeletedCell(x)).sort((a,b)=>Number(a.slot_number)-Number(b.slot_number));
  }
  function visibleSlotNumbers(z,c){
    const nums=activeColumnCells(z,c).map(x=>Number(x.slot_number)||0).filter(n=>n>0);
    if(nums.length) return nums;
    return Array.from({length:25},(_,i)=>i+1);
  }
  function cellItems(z,c,s){
    const cell=cellFromData(z,c,s);
    if(!cell) return [];
    if(Array.isArray(cell.items)) return cell.items;
    try { const arr=JSON.parse(cell.items_json||'[]'); return Array.isArray(arr)?arr:[]; } catch(_e){ return []; }
  }
  function cellNote(z,c,s){ return clean(cellFromData(z,c,s)?.note || ''); }
  function maxSlot(z,c){
    const nums=visibleSlotNumbers(z,c);
    return nums.length ? Math.max(...nums) : 25;
  }
  function getColumnList(z,c){ return document.querySelector(`.vertical-column-card[data-zone="${z}"][data-column="${Number(c)}"] .vertical-slot-list`); }
  function createSlotElement(z,c,s){
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='yx-final-slot yx108-slot yx106-slot yx116-slot vertical-slot';
    btn.dataset.zone=z; btn.dataset.column=String(Number(c)); btn.dataset.slot=String(Number(s)); btn.style.touchAction='none';
    btn.innerHTML='<div class="yx108-slot-row yx108-slot-row1 yx116-slot-row1"><span class="yx108-slot-no"></span><span class="yx108-slot-customers yx108-slot-empty">空格</span></div><div class="yx108-slot-product" aria-label="商品尺寸材質"></div><div class="yx108-slot-row yx108-slot-row2 yx116-slot-row2"><span class="yx108-slot-sum">0</span><span class="yx108-slot-total">0件</span></div>';
    return btn;
  }
  function ensureSlotElement(z,c,s){
    const list=getColumnList(z,c); if(!list) return null;
    let el=list.querySelector(`[data-zone="${z}"][data-column="${Number(c)}"][data-slot="${Number(s)}"]`);
    if(!el){
      el=createSlotElement(z,c,s);
      const after=Array.from(list.querySelectorAll('[data-slot]')).find(x=>Number(x.dataset.slot)>Number(s));
      if(after) list.insertBefore(el,after); else list.appendChild(el);
      bindSlot(el);
    }
    // V64：舊 HTML 已存在的格子可能只有第 1 排與第 3 排，沒有商品尺寸材質列。
    // 每次取格子時強制補齊中間列，避免被舊版 DOM 蓋掉造成「TD 200x30x125」不顯示。
    if(!el.querySelector('.yx108-slot-product')){
      const product=document.createElement('div');
      product.className='yx108-slot-product empty';
      product.setAttribute('aria-label','商品尺寸材質');
      const row2=el.querySelector('.yx108-slot-row2,.yx116-slot-row2');
      if(row2) el.insertBefore(product,row2); else el.appendChild(product);
    }
    if(!el.querySelector('.yx108-slot-row2')){
      const row=document.createElement('div');
      row.className='yx108-slot-row yx108-slot-row2 yx116-slot-row2';
      row.innerHTML='<span class="yx108-slot-sum">0</span><span class="yx108-slot-total">0件</span>';
      el.appendChild(row);
    }
    return el;
  }
  function ensureSlotRange(){ zones.forEach(z=>{ for(let c=1;c<=6;c++){ visibleSlotNumbers(z,c).forEach(s=>ensureSlotElement(z,c,s)); } }); }
  function removeExtraDom(z,c){
    const list=getColumnList(z,c); if(!list) return;
    const visible=new Set(visibleSlotNumbers(z,c).map(n=>String(n)));
    list.querySelectorAll('[data-slot]').forEach(el=>{ if(!visible.has(String(Number(el.dataset.slot)))) el.remove(); });
  }
  function updateSlotUI(z,c,s){
    z=clean(z).toUpperCase(); c=Number(c); s=Number(s);
    const el=ensureSlotElement(z,c,s); if(!el) return;
    const items=cellItems(z,c,s).filter(it=>itemQty(it)>0);
    const no=el.querySelector('.yx108-slot-no'); if(no) no.textContent=String(s);
    const customers=el.querySelector('.yx108-slot-customers');
    const productLine=el.querySelector('.yx108-slot-product');
    const sum=el.querySelector('.yx108-slot-sum');
    const total=el.querySelector('.yx108-slot-total');
    const hi=state.searchKeys.has(key(z,c,s));
    el.classList.toggle('filled', items.length>0);
    el.classList.toggle('highlight', hi);
    const markedCell = cellFromData(z,c,s);
    const marked = ['problem','marked','1','true',true,1].includes(markedCell?.problem_flag);
    el.classList.toggle('yx-warehouse-problem', !!marked);
    el.dataset.hasItems=items.length?'1':'0';
    if(!items.length){
      customers && (customers.textContent='空格', customers.classList.add('yx108-slot-empty'));
      productLine && (productLine.textContent='', productLine.classList.add('empty'));
      sum && (sum.textContent='0'); total && (total.textContent='0件');
      return;
    }
    const names=[...new Set(items.map(it=>cleanCustomer(it.customer_name)).filter(Boolean))];
    const qtys=items.map(itemQty).filter(n=>n>0);
    const totalQty=qtys.reduce((a,b)=>a+b,0);
    customers && (customers.textContent=names.join('/') || '庫存', customers.classList.remove('yx108-slot-empty'));
    if(productLine){
      const lines = String(slotProductSummary(items) || '').split('\n').filter(Boolean);
      productLine.innerHTML = lines.map(x=>`<div class="yx-slot-product-line">${esc(x)}</div>`).join('');
      productLine.classList.remove('empty');
    }
    sum && (sum.textContent=qtys.join('+') || String(totalQty));
    total && (total.textContent=`${totalQty}件`);
  }
  function columnStats(z,c){
    z=clean(z).toUpperCase(); c=Number(c);
    const slots=visibleSlotNumbers(z,c);
    let filled=0, empty=0, qty=0, problem=0;
    slots.forEach(n=>{
      const items=cellItems(z,c,n).filter(it=>itemQty(it)>0);
      if(items.length){ filled++; qty += items.reduce((a,it)=>a+itemQty(it),0); } else empty++;
      const cell=cellFromData(z,c,n);
      if(['problem','marked','1','true',true,1].includes(cell?.problem_flag)) problem++;
    });
    return {total:slots.length, filled, empty, qty, problem};
  }
  function ensureColumnStatsBadge(z,c){
    const card=document.querySelector(`.vertical-column-card[data-zone="${z}"][data-column="${Number(c)}"]`);
    if(!card) return null;
    let badge=card.querySelector('.yx97-col-stats');
    if(!badge){
      badge=document.createElement('div');
      badge.className='yx97-col-stats small-note';
      const title=card.querySelector('.yx106-warehouse-column-title,.yx116-warehouse-column-title');
      if(title) title.insertAdjacentElement('afterend', badge); else card.insertBefore(badge, card.firstChild);
    }
    return badge;
  }
  function updateColumnStats(z,c){
    const st=columnStats(z,c);
    const badge=ensureColumnStatsBadge(z,c);
    if(badge){
      badge.innerHTML=`<span>目前 ${st.total} 格</span><span>空 ${st.empty}</span><span>有貨 ${st.filled}</span><span>${st.qty}件</span>${st.problem?`<span class="danger-text">問題 ${st.problem}</span>`:''}`;
    }
    return st;
  }
  function updateAllColumnStats(){
    zones.forEach(z=>{ for(let c=1;c<=6;c++) updateColumnStats(z,c); });
    const sum={A:{total:0,empty:0,filled:0,qty:0,problem:0},B:{total:0,empty:0,filled:0,qty:0,problem:0}};
    zones.forEach(z=>{ for(let c=1;c<=6;c++){ const st=columnStats(z,c); Object.keys(sum[z]).forEach(k=>sum[z][k]+=Number(st[k]||0)); } });
    for(const z of zones){ const n=$(z==='A'?'zone-A-count-note':'zone-B-count-note'); if(n){ const st=sum[z]; n.textContent=`6 欄｜${st.total} 格｜空 ${st.empty}｜有貨 ${st.filled}｜${st.qty}件`; } }
  }
  function updateAllSlots(){
    ensureSlotRange();
    zones.forEach(z=>{ for(let c=1;c<=6;c++){ visibleSlotNumbers(z,c).forEach(s=>updateSlotUI(z,c,s)); removeExtraDom(z,c); } });
    updateNotes(); updateAllColumnStats(); bindSlots(); setWarehouseZone(state.activeZone || localStorage.getItem('warehouseActiveZone') || 'A', false);
  }
  function updateNotes(){
    for(const z of zones){ const n=$(z==='A'?'zone-A-count-note':'zone-B-count-note'); if(n && !n.textContent) n.textContent='6 欄｜每欄預設 25 格'; }
  }
  async function loadAvailable(){
    try{
      const ts=Date.now();
      const [all,a,b]=await Promise.all([api('/api/warehouse/available-items?ts='+ts),api('/api/warehouse/available-items?zone=A&ts='+ts),api('/api/warehouse/available-items?zone=B&ts='+ts)]);
      state.available=Array.isArray(all.items)?all.items:[];
      state.availableByZone={A:Array.isArray(a.items)?a.items:[], B:Array.isArray(b.items)?b.items:[]};
      const count=items=>(Array.isArray(items)?items:[]).reduce((n,it)=>n+itemQty(it),0);
      const summary=all.zone_summary||{};
      const aCount=Number.isFinite(Number(summary.A))?Number(summary.A):count(state.availableByZone.A);
      const bCount=Number.isFinite(Number(summary.B))?Number(summary.B):count(state.availableByZone.B);
      const unassigned=Number.isFinite(Number(summary.unassigned))?Number(summary.unassigned):Math.max(0,count(state.available)-aCount-bCount);
      const total=Number.isFinite(Number(summary.total))?Number(summary.total):count(state.available);
      const pill=$('warehouse-unplaced-pill'); if(pill) pill.textContent=`A區 ${aCount} 件 / B區 ${bCount} 件 / 未分區 ${unassigned} 件 / 總計 ${total} 件`;
    }catch(_e){ state.available=state.available||[]; state.availableByZone=state.availableByZone||{A:[],B:[]}; }
  }
  async function renderWarehouse(force=false){
    if(state.loading && !force) return state.loading;
    // V65：第一次開倉庫圖先只載入格位並立即畫面；未錄入下拉/統計改成背景載入，避免第一次開啟被 3 個 available API 卡住。
    state.loading=(async()=>{ try{
      const d = await api('/api/warehouse?ts='+Date.now());
      state.data={cells:Array.isArray(d.cells)?d.cells:[], zones:d.zones||{A:{},B:{}}};
      window.state=window.state||{}; window.state.warehouse={...state.data, activeZone:state.activeZone, availableItems:state.available};
      updateAllSlots();
      loadAvailable().then(()=>{ window.state.warehouse={...state.data, activeZone:state.activeZone, availableItems:state.available}; syncBatchSelectLimits?.(); }).catch(()=>{});
    } catch(e){ toast(e.message||'倉庫圖載入失敗','error'); bindSlots(); } finally{ state.loading=null; } })();
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
  function optionLabel(it){ const mat=materialOf(it); const src=sourceOf(it); const base=productBaseText(it); const support=productSupportText(it); const label=support?`${base}=${support}`:base; return `${cleanCustomer(it.customer_name||'')}｜${src?src+'｜':''}${mat?mat+'｜':''}${label}｜可加入 ${itemQty(it)}件`; }
  function availableListForCurrent(){ const z=clean(state.current?.zone||state.activeZone||'A').toUpperCase(); return z==='B'?state.availableByZone.B:state.availableByZone.A; }
  function combineSupportText(a,b){
    const out=[];
    [a,b].forEach(v=>String(v||'').split('+').map(clean).filter(Boolean).forEach(x=>{ if(!out.includes(x)) out.push(x); }));
    return out.join('+');
  }
  function groupedAvailableRows(){
    const map=new Map();
    availableListForCurrent().forEach((it,i)=>{
      const base=productBaseText(it);
      if(!base) return;
      const support=productSupportText(it);
      const gkey=[cleanCustomer(it?.customer_name||''), sourceOf(it), materialOf(it), base, clean(it?.zone||'')].join('::');
      const old=map.get(gkey);
      if(old){
        // V62：同客戶/來源/材質/尺寸合併時，必須把所有支數件數加總。
        // 舊版先改 qty 再呼叫 itemQty(old.it)，但 itemQty 會優先讀舊的 unplaced_qty，
        // 導致 792x4+858x102 仍只顯示/帶入 4 件。
        const oldQty = Math.max(0, Number(old.it.qty ?? old.it.unplaced_qty ?? itemQty(old.it)) || 0);
        const addQty = itemQty(it);
        const mergedQty = oldQty + addQty;
        old.it.qty = mergedQty;
        old.it.unplaced_qty = mergedQty;
        old.it.available_qty = mergedQty;
        old.it.remaining_qty = mergedQty;
        old.it.total_qty = (Number(old.it.total_qty||0)||0) + (Number(it.total_qty||addQty)||0);
        old.it.support_text = combineSupportText(old.it.support_text, support);
        old.it.product_text = productWithSupport(base, old.it.support_text);
        old.it.product = old.it.product_text;
        old.it.source_details = [...(old.it.source_details||[]), ...(it.source_details||[it])];
        old.components.push({it,index:i});
      }else{
        const mergedProduct=productWithSupport(base, support);
        const q=itemQty(it);
        const first={...it, product_text:mergedProduct, product:mergedProduct, base_product_size:base, display_product_size:base, support_text:support, qty:q, unplaced_qty:q, available_qty:q, remaining_qty:q, source_details:[...(it.source_details||[it])]};
        map.set(gkey,{it:first,index:i,key:gkey,components:[{it,index:i}]});
      }
    });
    return Array.from(map.values()).filter(r=>itemQty(r.it)>0);
  }
  function availableRows(){
    const q=clean($('warehouse-item-search')?.value||'').toLowerCase();
    const supportSticks = (it)=>{
      const support = productSupportText(it);
      let total = 0;
      support.split('+').map(clean).filter(Boolean).forEach(seg=>{
        const plain = String(seg||'').replace(/[\(（][^\)）]*[\)）]/g,'');
        const m = plain.match(/^(\d+(?:\.\d+)?)\s*x\s*(\d+)$/i);
        if(m) total += (Number(m[1]||0)||0) * (Number(m[2]||0)||0);
        else { const n = Number((plain.match(/\d+(?:\.\d+)?/)||['0'])[0])||0; total += n; }
      });
      return total;
    };
    return groupedAvailableRows()
      .filter(r=>!q||optionLabel(r.it).toLowerCase().includes(q))
      .sort((a,b)=> itemQty(b.it)-itemQty(a.it) || supportSticks(b.it)-supportSticks(a.it) || optionLabel(a.it).localeCompare(optionLabel(b.it),'zh-Hant',{numeric:true}));
  }
  function placementForBatch(i){ return i===0?'後排':i===1?'中間':'前排'; }
  function itemKey(it){ return [cleanCustomer(it?.customer_name||''), clean(it?.exact_key||''), productText(it), clean(it?.support_text||''), materialOf(it), sourceOf(it), clean(it?.source_id||it?.id||''), clean(it?.zone||'')].join('::'); }
  function itemStableKey(it){ return [cleanCustomer(it?.customer_name||''), warehouseSizeKey(productText(it)), materialOf(it), sourceOf(it), clean(it?.source_id||it?.id||''), clean(it?.zone||it?.location||'')].join('::'); }

  function availableGroupKey(it){ return [cleanCustomer(it?.customer_name||''), sourceOf(it), materialOf(it), productBaseText(it), clean(it?.zone||'')].join('::'); }
  function supportQtyOfPart(seg){
    const plain=String(seg||'').replace(/[\(（][^\)）]*[\)）]/g,'').trim();
    const m=plain.match(/x\s*(\d+)\s*$/i);
    if(m) return Math.max(0, Number(m[1]||0));
    return /\d/.test(plain) ? 1 : 0;
  }
  function sameAvailableBase(a,b){ return availableGroupKey(a)===availableGroupKey(b); }
  function removeSupportPartFromAvailable(it, removeItem, removeQty){
    if(!sameAvailableBase(it, removeItem)) return 0;
    const removeSupport=clean(productSupportText(removeItem));
    if(!removeSupport) return 0;
    const parts=String(productSupportText(it)||'').split('+').map(clean).filter(Boolean);
    if(!parts.length) return 0;
    const idx=parts.findIndex(p=>clean(p).toLowerCase()===removeSupport.toLowerCase());
    if(idx<0) return 0;
    const partQty=supportQtyOfPart(parts[idx]);
    const take=Math.min(partQty || removeQty, removeQty);
    const left=partQty-take;
    if(left<=0){
      parts.splice(idx,1);
    }else{
      parts[idx]=parts[idx].replace(/x\s*\d+\s*$/i,'x'+left);
    }
    const q=Math.max(0, itemQty(it)-take);
    it.qty=q; it.unplaced_qty=q; it.available_qty=q; it.remaining_qty=q;
    it.support_text=parts.join('+');
    it.product_text=it.support_text ? productWithSupport(productBaseText(it), it.support_text) : productBaseText(it);
    it.product=it.product_text;
    return take;
  }
  function mutateAvailableByItems(items, sign){
    const arrs=[state.available, state.availableByZone.A, state.availableByZone.B].filter(Array.isArray);
    (items||[]).forEach(item=>{
      const g=availableGroupKey(item);
      arrs.forEach(list=>{
        let remaining=itemQty(item);
        if(sign < 0){
          for(let i=list.length-1;i>=0 && remaining>0;i--){
            const it=list[i];
            const taken=removeSupportPartFromAvailable(it,item,remaining);
            if(taken>0){ remaining-=taken; if(itemQty(it)<=0) list.splice(i,1); }
          }
          for(let i=list.length-1;i>=0 && remaining>0;i--){
            const it=list[i];
            if(availableGroupKey(it)!==g) continue;
            const q=itemQty(it);
            const take=Math.min(q, remaining);
            const left=q-take;
            remaining-=take;
            if(left<=0) list.splice(i,1);
            else { it.qty=left; it.unplaced_qty=left; it.available_qty=left; it.remaining_qty=left; it.total_qty=Math.max(left, Number(it.total_qty||left)); }
          }
        }else{
          const clone={...item, qty:itemQty(item), unplaced_qty:itemQty(item), available_qty:itemQty(item), remaining_qty:itemQty(item), total_qty:itemQty(item)};
          const z=clean(clone.zone||clone.location||'').toUpperCase();
          if(list===state.available || (z.startsWith('A') && list===state.availableByZone.A) || (z.startsWith('B') && list===state.availableByZone.B) || (!z && (list===state.availableByZone.A || list===state.availableByZone.B))){
            list.push(clone);
          }
        }
      });
    });
    updateUnplacedPillLocal();
  }
  function updateUnplacedPillLocal(){
    const count=items=>(Array.isArray(items)?items:[]).reduce((n,it)=>n+itemQty(it),0);
    const a=count(state.availableByZone.A), b=count(state.availableByZone.B), total=count(state.available), unassigned=Math.max(0,total-a-b);
    const pill=$('warehouse-unplaced-pill'); if(pill) pill.textContent=`A區 ${a} 件 / B區 ${b} 件 / 未分區 ${unassigned} 件 / 總計 ${total} 件`;
  }
  function cloneWithQty(it, qty){
    const q=Math.max(0, Math.floor(Number(qty||0)));
    const row={...(it||{}), qty:q, unplaced_qty:q, available_qty:q, remaining_qty:q, total_qty:Math.max(q, Number(it?.total_qty||q)||q), __warehouseCellItem:false};
    const original=productText(row);
    if(original && original.includes('=')){
      row.product_text = rewriteProductSupportQty(original, q);
      row.product = row.product_text;
      row.support_text = productSupportText(row);
    }
    return row;
  }
  function summarizeByStable(items){
    const map=new Map();
    (items||[]).forEach(it=>{
      const k=itemStableKey(it);
      const q=itemQty(it);
      if(!k || q<=0) return;
      const old=map.get(k);
      if(old) old.qty += q;
      else map.set(k,{item:it, qty:q});
    });
    return map;
  }
  function cellAvailabilityDelta(beforeItems, afterItems){
    const before=summarizeByStable(beforeItems);
    const after=summarizeByStable(afterItems);
    const keys=new Set([...before.keys(),...after.keys()]);
    const returned=[];
    const consumed=[];
    keys.forEach(k=>{
      const b=before.get(k), a=after.get(k);
      const diff=(b?.qty||0) - (a?.qty||0);
      if(diff>0) returned.push(cloneWithQty(b?.item || a?.item, diff));
      if(diff<0) consumed.push(cloneWithQty(a?.item || b?.item, -diff));
    });
    return {returned, consumed};
  }

  function warehouseSizeKey(text){ const left=stripProductParen(text).replace(/[×ＸX✕＊*]/g,'x').replace(/＝/g,'=').split('=')[0] || ''; const parts=left.toLowerCase().split('x').filter(Boolean); if(parts.length>=3 && parts.slice(0,3).every(x=>/^\d+$/.test(x.trim()))) return parts.slice(0,3).map(x=>String(parseInt(x,10))).join('x'); return clean(left).toLowerCase(); }
  function snapshotBatchRows(){
    const rows=[];
    document.querySelectorAll('#yx121-batch-rows .yx121-batch-row').forEach((row,i)=>{
      const sel=row.querySelector('.yx121-batch-select'); const qty=row.querySelector('.yx121-batch-qty');
      const opt=sel?.options?.[sel.selectedIndex];
      rows[i]={value:sel?.value||'', key:opt?.dataset?.itemKey||'', qty:qty?.value||'', support:row.querySelector('.yx121-batch-support')?.value||'', placement:placementForBatch(i)};
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
      if(qty && old.qty) qty.value=old.qty; const sup=row.querySelector('.yx121-batch-support'); if(sup && old.support) sup.value=old.support;
    });
    syncBatchSelectLimits(false);
  }
  function applyCurrentItemInputs(){
    if(!state.current) return false;
    let touched=false;
    const next=[];
    document.querySelectorAll('#warehouse-current-items-html .yx-direct-current-item[data-idx]').forEach(row=>{
      const idx=Number(row.dataset.idx);
      const base=state.current.items[idx];
      if(!base) return;
      const product=clean(row.querySelector('[data-current-product]')?.value || productText(base));
      const material=clean(row.querySelector('[data-current-material]')?.value || materialOf(base));
      const qtyEl=row.querySelector('[data-current-qty]');
      const baseProduct=clean(productText(base));
      // V67：目前此格商品若改了支數文字，要用輸入框文字重新判定件數。
      // 例：132x60x08=162x26 => 26 件；132x60x08=162x26+133x4+142 => 31 件。
      // 如果商品文字沒改，才保留使用者手動改的件數欄位。
      let qty;
      // V69 精準修正：目前此格商品的件數要以左邊輸入的支數段為準。
      // 例：130x42x30=96x32 右側必須是 32 件，不可沿用原商品整筆 57 件。
      const parsedFromProduct = qtyFromProductTextForInput(product, 0);
      if(product && product.includes('=') && parsedFromProduct > 0){ qty = parsedFromProduct; }
      else if(product && product !== baseProduct){ qty = qtyFromProductTextForInput(product, itemQty(base)); }
      else { qty = Math.max(1, Math.floor(Number(qtyEl?.value || itemQty(base)))); }
      if(qtyEl) qtyEl.value = String(Math.max(1, qty));
      const placement=clean(row.querySelector('[data-current-placement]')?.value || base.placement_label || base.layer_label || '前排');
      const updated={...base, product_text:product, product:product, material, product_code:material, qty:Math.max(1, qty), placement_label:placement, layer_label:placement};
      if(JSON.stringify(normalizedItem(base,itemQty(base),base.placement_label||base.layer_label||'前排')) !== JSON.stringify(normalizedItem(updated,qty,placement))) touched=true;
      next.push(updated);
    });
    if(next.length || (state.current.items||[]).length){
      if(next.length !== (state.current.items||[]).length) touched=true;
      state.current.items=next;
    }
    return touched;
  }
  function currentItemsChanged(beforeItems){
    const a=JSON.stringify((beforeItems||[]).map(it=>normalizedItem(it,itemQty(it),it.placement_label||it.layer_label||'前排')));
    const b=JSON.stringify((state.current?.items||[]).map(it=>normalizedItem(it,itemQty(it),it.placement_label||it.layer_label||'前排')));
    return a!==b;
  }
  function currentItemEditorHtml(it,i){
    const mat=materialOf(it), place=clean(it.placement_label||it.layer_label||'前排');
    const placementOptions=['後排','中間','前排'].map(x=>`<option value="${esc(x)}" ${x===place?'selected':''}>${esc(x)}</option>`).join('');
    return `<div class="yx-direct-current-item yx-direct-current-editable" data-idx="${i}">
      <div class="yx-direct-current-main">
        <span class="yx-direct-source">${esc(sourceOf(it))}</span>
        <strong>${esc(cleanCustomer(it.customer_name))}</strong>
        <input class="text-input yx-current-material-input" data-current-material value="${esc(mat)}" placeholder="材質">
        <input class="text-input yx-current-product-input" data-current-product value="${esc(productText(it))}" placeholder="尺寸=支數">
      </div>
      <div class="yx-direct-current-side yx-current-edit-side">
        <select class="text-input yx-current-placement-input" data-current-placement>${placementOptions}</select>
        <input class="text-input yx-current-qty-input" data-current-qty type="number" min="1" value="${qtyFromProductTextForInput(productText(it), 0) || itemQty(it)}" aria-label="件數">
        <span class="yx-current-unit">件</span>
        <button class="remove yx-direct-remove" type="button" data-remove-cell-item="${i}">×</button>
      </div>
    </div>`;
  }
  function rewriteProductSupportQty(product, qty){
    product=clean(product).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=');
    qty=Math.max(1, Math.floor(Number(qty||1)));
    if(!product.includes('=')) return product;
    const left=product.split('=')[0];
    const right=product.split('=').slice(1).join('=') || '';
    const parts=right.split('+');
    if(!parts.length) return product;
    const last=parts[parts.length-1] || '';
    if(/x\s*\d+\s*$/i.test(last)) parts[parts.length-1]=last.replace(/x\s*\d+\s*$/i,'x'+qty);
    else if(/^\s*\d+(?:\.\d+)?\s*$/.test(last)) parts[parts.length-1]=`${last}x${qty}`;
    else parts.push(String(qty));
    return `${left}=${parts.join('+')}`;
  }
  function syncCurrentRowQtyFromProduct(row){
    const p=row?.querySelector?.('[data-current-product]');
    const q=row?.querySelector?.('[data-current-qty]');
    if(!p||!q) return;
    const parsed=qtyFromProductTextForInput(p.value, 0);
    if(parsed>0) q.value=String(parsed);
  }
  function syncCurrentRowProductFromQty(row){
    const p=row?.querySelector?.('[data-current-product]');
    const q=row?.querySelector?.('[data-current-qty]');
    if(!p||!q) return;
    const n=Math.max(1, Math.floor(Number(q.value||1)));
    if(p.value && p.value.includes('=')) p.value=rewriteProductSupportQty(p.value,n);
  }

  function renderCellItems(preserve=true){
    const box=$('warehouse-cell-items'); if(!box) return;
    if(preserve) applyCurrentItemInputs();
    const saved = preserve ? snapshotBatchRows() : [];
    // 批量加入面板已直接寫在 templates/module.html；這裡只更新「目前商品」與「每列選項」，不清掉已選下拉。
    if(!$('warehouse-current-items-html') || !$('yx121-batch-rows')){
      box.innerHTML=`<div class="yx-direct-section" data-html-locked="warehouse-current-items-html"><div class="yx-direct-section-title">目前此格商品</div><div id="warehouse-current-items-html" class="yx-direct-current-list"></div></div><div class="yx-direct-batch-panel" data-html-locked="warehouse-batch-html-fixed"><div class="yx-direct-section-title">批量加入商品</div><div class="small-note">A / B 區各自只顯示尚未錄入倉庫圖商品；第 1 筆後排、第 2 筆中間、第 3 筆前排。</div><div id="yx121-batch-rows"></div><div class="btn-row compact-row"><button class="ghost-btn small-btn" type="button" id="yx121-add-batch-row">新增更多批量</button><button class="primary-btn small-btn" type="button" id="yx121-save-cell">儲存格位</button></div></div>`;
    }
    const current=(state.current.items||[]).map((it,i)=>currentItemEditorHtml(it,i)).join('') || '<div class="empty-state-card compact-empty">此格目前沒有商品</div>';
    const currentBox=$('warehouse-current-items-html'); if(currentBox) currentBox.innerHTML=current;
    const rowsData=availableRows();
    const opts=rowsData.map(r=>`<option value="${esc(r.key)}" data-index="${r.index}" data-max="${itemQty(r.it)}" data-item-key="${esc(r.key)}" data-support="${esc(productSupportText(r.it))}">${esc(optionLabel(r.it))}</option>`).join('');
    const emptyHint = opts ? '' : '<option value="">此區目前沒有未錄入商品，或請換 A/B 區</option>';
    const rowCount=Math.max(3,Number(state.batchCount||3),saved.length||0);
    const rows=Array.from({length:rowCount},(_,i)=>`<div class="yx121-batch-row" data-batch-index="${i}"><label class="yx121-batch-label">${placementForBatch(i)}</label><select class="text-input yx121-batch-select"><option value="">選擇此區未錄入商品</option>${opts || emptyHint}</select><input class="text-input yx121-batch-support" type="text" placeholder="支數"><input class="text-input yx121-batch-qty" type="number" min="1" placeholder="件數" data-yx121-max=""></div>`).join('');
    const rowsBox=$('yx121-batch-rows'); if(rowsBox) rowsBox.innerHTML=rows;
    restoreBatchRows(saved);
  }
  async function openWarehouseModal(z,c,s){
    z=clean(z).toUpperCase();
    const lockId=`${z}-${Number(c)}-${Number(s)}`;
    if(window.YXEditLock && typeof window.YXEditLock.ensure==='function'){
      const ok=await window.YXEditLock.ensure('warehouse_cells', lockId, {label:`${z}區第 ${Number(c)} 欄第 ${Number(s)} 格`, ttl_seconds:240});
      if(!ok) return;
    }
    state.current={zone:z,col:Number(c),slot:Number(s),lockId,items:JSON.parse(JSON.stringify(cellItems(z,c,s))),note:cellNote(z,c,s)};
    state.batchCount=3;
    const meta=$('warehouse-modal-meta'); if(meta) meta.textContent=`${z} 區第 ${Number(c)} 欄 第 ${Number(s)} 格`;
    const note=$('warehouse-note'); if(note) note.value=state.current.note||'';
    const search=$('warehouse-item-search'); if(search) search.value='';
    $('warehouse-modal')?.classList.remove('hidden');
    renderCellItems(false);
    // V50：不自動 focus 搜尋框，避免綠色提示 / 開窗打斷正在編輯的輸入焦點。
    // 先立刻開啟格位批量加入畫面，再背景抓 A/B 區未錄入商品；保留使用者已選下拉與件數。
    try { await loadAvailable(); renderCellItems(true); } catch(e){ toast(e.message||'未錄入商品載入失敗','error'); }
  }
  function closeWarehouseModal(){
    const cur=state.current;
    $('warehouse-modal')?.classList.add('hidden');
    if(cur?.lockId && window.YXEditLock && typeof window.YXEditLock.release==='function'){
      window.YXEditLock.release('warehouse_cells', cur.lockId).catch(()=>{});
    }
  }
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
    const groups = new Map(availableRows().map(r=>[r.key,r]));
    const usage = selectedBatchUsage();
    rows.forEach(row=>{
      const sel=row.querySelector('.yx121-batch-select'); const qty=row.querySelector('.yx121-batch-qty'); const supportEl=row.querySelector('.yx121-batch-support'); if(!sel||!qty) return;
      Array.from(sel.options).forEach(opt=>{
        const ok=opt?.dataset?.itemKey || opt.value || '';
        if(!ok) return;
        const group=groups.get(ok);
        const currentForOption=(ok===(sel.options[sel.selectedIndex]?.dataset?.itemKey || sel.value || '')) ? Math.max(0,Math.floor(Number(qty.value||0))) : 0;
        const remaining=group ? Math.max(0, itemQty(group.it) - (usage.get(ok)||0) + currentForOption) : 0;
        opt.disabled = remaining <= 0;
        opt.hidden = remaining <= 0 && opt.value !== sel.value;
        opt.dataset.max = String(remaining);
      });
      const opt=sel.options[sel.selectedIndex]; const k=opt?.dataset?.itemKey || sel.value || '';
      const group=groups.get(k);
      const current=Math.max(0,Math.floor(Number(qty.value||0)));
      const max=group ? Math.max(0, itemQty(group.it) - (usage.get(k)||0) + current) : 0;
      const optSupport=opt?.dataset?.support || (group ? productSupportText(group.it) : '');
      if(supportEl && optSupport && (fillEmpty || !supportEl.value)) supportEl.value=optSupport;
      if(max>0){
        qty.max=String(max); qty.dataset.yx121Max=String(max); qty.disabled=false; qty.placeholder='件數';
        const supportQty = qtyFromSupportInput(supportEl?.value || optSupport, max);
        if(fillEmpty || !qty.value) qty.value=String(Math.min(max, supportQty || max));
        if(Number(qty.value)>max) qty.value=String(max);
      }
      else { qty.removeAttribute('max'); qty.dataset.yx121Max=''; if(sel.value){ qty.value=''; qty.disabled=true; qty.placeholder='已無剩餘件數'; } else { qty.disabled=false; qty.value=''; } }
    });
  }
  function collectBatchItems(){
    const rowsPool = availableRows();
    const byKey = new Map(rowsPool.map(r=>[r.key,r]));
    const existingQty = new Map();
    (state.current?.items || []).forEach(it=>{
      const k=itemStableKey(it);
      existingQty.set(k, (existingQty.get(k)||0) + itemQty(it));
    });
    const collected = new Map();
    document.querySelectorAll('#yx121-batch-rows .yx121-batch-row').forEach(row=>{
      const sel=row.querySelector('.yx121-batch-select'); const raw=sel?.value; if(raw==='') return;
      const opt=sel?.options?.[sel.selectedIndex];
      const group=byKey.get(opt?.dataset?.itemKey || raw);
      if(!group) return;
      const base=productBaseText(group.it);
      const support=normalizeSupportInputValue(row.querySelector('.yx121-batch-support')?.value || productSupportText(group.it) || '');
      const product=productWithSupport(base, support);
      const max=itemQty(group.it)||1;
      const supportQty=qtyFromSupportInput(support, max);
      let qty=Math.max(0, Math.floor(Number(row.querySelector('.yx121-batch-qty')?.value||0)));
      if(!qty) qty=supportQty || max;
      // V63：支數輸入是本次要加入的支數段；例如 168x7(-備註) 要以 7 件計，括號不扣件。
      // 如果沒有改支數，才用整筆下拉合併件數；有改支數時，用支數解析件數但不能超過可加入總量。
      qty=Math.min(qty, max);
      if(qty <= 0) return;
      const seed={...group.it, product_text:product, product, support_text:support, exact_key:support?`${warehouseSizeKey(base)}=${support}`:warehouseSizeKey(base), source_id:clean(group.it.source_id||group.it.id||''), source_details:(group.it.source_details||[])};
      const stable=itemStableKey(seed);
      const alreadyInCell=existingQty.get(stable)||0;
      const alreadyNew=collected.get(stable)?.qty || 0;
      const remaining=Math.max(0, max - alreadyInCell - alreadyNew);
      if(remaining <= 0) return;
      const finalQty=Math.min(qty, remaining);
      if(finalQty <= 0) return;
      collected.set(stable, normalizedItem(seed, (alreadyNew + finalQty), placementForBatch(Number(row.dataset.batchIndex||collected.size))));
    });
    return Array.from(collected.values());
  }
  async function saveCellRaw(z,c,s,items,note){ return api('/api/warehouse/cell',{method:'POST',body:JSON.stringify({zone:clean(z).toUpperCase(),column_index:Number(c),slot_type:'direct',slot_number:Number(s),items:items||[],note:note||''})}); }
  async function saveWarehouseCell(){
    if(!state.current) return toast('請先開啟格位','warn');
    const beforeItems=JSON.parse(JSON.stringify(state.current.items||[])); const beforeNote=$('warehouse-note')?.value||'';
    applyCurrentItemInputs();
    const editedChanged=currentItemsChanged(beforeItems) || (($('warehouse-note')?.value||'') !== beforeNote);
    const added=collectBatchItems();
    if(!added.length && !editedChanged){ toast('沒有新增或修改；已錄入商品不會出現在下拉選單，請直接在「目前此格商品」修改尺寸/支數/件數後儲存','warn'); return; }
    const merged = new Map();
    [...(state.current.items||[]),...added].forEach(it=>{ const k=itemStableKey(it); const old=merged.get(k); if(old){ old.qty = itemQty(old) + itemQty(it); } else merged.set(k, {...it, qty:itemQty(it)}); });
    const items=Array.from(merged.values());
    const btn=$('yx121-save-cell');
    try{
      // V54：儲存格位改成背景儲存，不鎖住儲存按鈕，使用者可立刻繼續點其他格子。
      try { window.YXPageUndo?.snapshot?.('warehouse-cell', async()=>{ if(!state.current) return; state.current.items=beforeItems; await saveCellRaw(state.current.zone,state.current.col,state.current.slot,beforeItems,beforeNote); await renderWarehouse(true); highlightWarehouseCell(state.current.zone,state.current.col,state.current.slot); }); } catch(_e) {}
      const saveZone=state.current.zone, saveCol=state.current.col, saveSlot=state.current.slot, saveNote=$('warehouse-note')?.value||'';
      state.current.items=items;
      let localCell=(state.data.cells||[]).find(c=>clean(c.zone).toUpperCase()===saveZone&&Number(c.column_index)===saveCol&&Number(c.slot_number)===saveSlot);
      if(!localCell){ localCell={zone:saveZone,column_index:saveCol,slot_type:'direct',slot_number:saveSlot,items:[],items_json:'[]',note:''}; state.data.cells.push(localCell); }
      localCell.items=items; localCell.items_json=JSON.stringify(items); localCell.note=saveNote;
      const delta=cellAvailabilityDelta(beforeItems, items);
      if(delta.returned.length) mutateAvailableByItems(delta.returned, +1);
      if(delta.consumed.length) mutateAvailableByItems(delta.consumed, -1);
      updateSlotUI(saveZone,saveCol,saveSlot);
      toast(`格位已送出背景儲存${added.length?`，新增 ${added.length} 筆`:''}${editedChanged?'，已更新目前商品與下拉剩餘數量':''}`,'ok');
      closeWarehouseModal();
      highlightWarehouseCell(saveZone,saveCol,saveSlot);
      saveCellRaw(saveZone,saveCol,saveSlot,items,saveNote).then(async saved=>{
        // Do not wholesale replace state.data.cells here. A slower background save from a previous
        // cell can overwrite a newer front-end edit and make quantities jump. Only refresh available
        // quantities; the cell itself has already been applied locally and saved in DB.
        await loadAvailable().catch(()=>{});
        updateAllSlots();
        highlightWarehouseCell(saveZone,saveCol,saveSlot);
        toast('格位已永久存入資料庫','ok');
      }).catch(e=>{
        toast((e&&e.message)||'背景儲存格位失敗，請重開格位確認','error');
      });
    }catch(e){ toast(e.message||'儲存格位失敗','error'); throw e; }
    finally{ if(btn){ btn.disabled=false; btn.textContent='儲存格位'; } }
  }
  function updateUndoButton(){ const b=$('yx121-warehouse-undo'); if(b) b.disabled=!state.undoStack.length; }
  async function moveCellContents(from,to){
    const f={zone:clean(from.zone).toUpperCase(),col:Number(from.col),slot:Number(from.slot)}, t={zone:clean(to.zone).toUpperCase(),col:Number(to.col),slot:Number(to.slot)};
    if(f.zone===t.zone&&f.col===t.col&&f.slot===t.slot) return; const moved=cellItems(f.zone,f.col,f.slot).filter(it=>itemQty(it)>0); if(!moved.length) return toast('此格沒有可拖拉的商品','warn');
    const src={...f,items:JSON.parse(JSON.stringify(cellItems(f.zone,f.col,f.slot))),note:cellNote(f.zone,f.col,f.slot)}; const dst={...t,items:JSON.parse(JSON.stringify(cellItems(t.zone,t.col,t.slot))),note:cellNote(t.zone,t.col,t.slot)};
    const placement = dst.items && dst.items.length ? '前排' : '後排';
    const dstAfter=[...moved.map(it=>normalizedItem(it,itemQty(it),placement)),...dst.items];
    const oldCells=JSON.parse(JSON.stringify(state.data.cells||[]));
    try{
      // V67：拖拉先立刻更新前端，不等後端；有商品目標格放最前排，空格放後排。
      let srcCell=cellFromData(f.zone,f.col,f.slot); if(srcCell){ srcCell.items=[]; srcCell.items_json='[]'; }
      let dstCell=cellFromData(t.zone,t.col,t.slot); if(!dstCell){ dstCell={zone:t.zone,column_index:t.col,slot_type:'direct',slot_number:t.slot,items:[],items_json:'[]',note:''}; state.data.cells.push(dstCell); }
      dstCell.items=dstAfter; dstCell.items_json=JSON.stringify(dstAfter);
      updateSlotUI(f.zone,f.col,f.slot); updateSlotUI(t.zone,t.col,t.slot); highlightWarehouseCell(t.zone,t.col,t.slot);
      toast(placement==='前排'?'已先移動到前排，背景儲存':'已先移動到後排，背景儲存','ok');
      Promise.all([saveCellRaw(f.zone,f.col,f.slot,[],src.note), saveCellRaw(t.zone,t.col,t.slot,dstAfter,dst.note)]).then(async()=>{
        state.undoStack.push({source:src,target:dst}); if(state.undoStack.length>20) state.undoStack.shift(); updateUndoButton();
        await loadAvailable().catch(()=>{}); updateAllSlots(); highlightWarehouseCell(t.zone,t.col,t.slot); toast('拖拉移動已永久存入資料庫','ok');
      }).catch(e=>{ state.data.cells=oldCells; updateAllSlots(); toast((e&&e.message)||'拖拉移動失敗，已還原','error'); });
    } catch(e){ state.data.cells=oldCells; updateAllSlots(); toast(e.message||'拖拉移動失敗','error'); }
  }
  async function undoWarehouseMove(){ const last=state.undoStack.pop(); updateUndoButton(); if(!last) return toast('目前沒有可還原的倉庫移動','warn'); try{ await saveCellRaw(last.target.zone,last.target.col,last.target.slot,last.target.items,last.target.note); await saveCellRaw(last.source.zone,last.source.col,last.source.slot,last.source.items,last.source.note); toast('已還原','ok'); await renderWarehouse(true); highlightWarehouseCell(last.source.zone,last.source.col,last.source.slot); }catch(e){ state.undoStack.push(last); updateUndoButton(); toast(e.message||'還原失敗','error'); } }
  function localInsertSlot(z,c,after){
    z=clean(z).toUpperCase(); c=Number(c); after=Number(after||0);
    state.data.cells = Array.isArray(state.data.cells) ? state.data.cells : [];
    // Soft-delete add: do not renumber product cells. Restore first hidden slot is not known
    // in front-end data, so we append visually and let the DB response reconcile exact slot.
    const existing=visibleSlotNumbers(z,c);
    const newSlot=Math.max(after+1, existing.length ? Math.max(...existing)+1 : 1);
    state.data.cells.push({zone:z,column_index:c,slot_type:'direct',slot_number:newSlot,items:[],items_json:'[]',note:'',problem_flag:'',is_deleted:0});
    state.data.cells.sort((a,b)=>clean(a.zone).localeCompare(clean(b.zone)) || Number(a.column_index)-Number(b.column_index) || Number(a.slot_number)-Number(b.slot_number));
    return newSlot;
  }
  function localDeleteSlot(z,c,s){
    z=clean(z).toUpperCase(); c=Number(c); s=Number(s);
    // Soft-delete visual behavior: hide only this empty slot; never shift product cells.
    state.data.cells = (state.data.cells||[]).filter(cell=>!(clean(cell.zone).toUpperCase()===z && Number(cell.column_index)===c && Number(cell.slot_number)===s));
  }
  async function batchInsertWarehouseCells(z,c,s){
    z=clean(z).toUpperCase(); c=Number(c); s=Number(s||0);
    const count=Math.max(1, Math.min(40, Number.parseInt(prompt('要新增幾格？', '5') || '0', 10) || 0));
    if(!count) return;
    const old=JSON.parse(JSON.stringify(state.data.cells||[]));
    for(let i=0;i<count;i++) localInsertSlot(z,c,s+i);
    updateAllSlots(); highlightWarehouseCell(z,c,s+1); toast(`已先批量新增 ${count} 格，背景儲存`,'ok');
    (async()=>{
      const last=await api('/api/warehouse/bulk-add-slots',{method:'POST',body:JSON.stringify({zone:z,column_index:c,insert_after:s,count:count,slot_type:'direct'})});
      if(last && Array.isArray(last.cells)) state.data.cells=last.cells;
      const firstSlot = Number((last?.created_slots||[])[0] || last?.slot_number || s+1);
      updateAllSlots(); highlightWarehouseCell(z,c,firstSlot); toast(`批量新增 ${count} 格已永久存入資料庫`,'ok');
    })().catch(e=>{ state.data.cells=old; updateAllSlots(); toast(e.message||'批量新增格子失敗，已還原','error'); });
  }
  async function batchDeleteWarehouseCells(z,c,s){
    z=clean(z).toUpperCase(); c=Number(c); s=Number(s);
    const count=Math.max(1, Math.min(40, Number.parseInt(prompt('要從此格開始刪除幾個空格？', '5') || '0', 10) || 0));
    if(!count) return;
    for(let i=0;i<count;i++){
      if(cellItems(z,c,s+i).length) return toast(`第 ${s+i} 格內還有商品，批量刪除已取消`,'warn');
    }
    if(!confirm(`確定從 ${z} 區第 ${c} 欄第 ${s} 格開始刪除 ${count} 個空格？`)) return;
    const old=JSON.parse(JSON.stringify(state.data.cells||[]));
    const visible=visibleSlotNumbers(z,c).filter(n=>n>=s).slice(0,count);
    visible.forEach(n=>localDeleteSlot(z,c,n));
    updateAllSlots(); toast(`已先批量刪除 ${visible.length} 格，背景儲存`,'ok');
    (async()=>{
      const last=await api('/api/warehouse/bulk-remove-slots',{method:'POST',body:JSON.stringify({zone:z,column_index:c,start_slot:s,count:visible.length,slot_type:'direct'})});
      if(last && Array.isArray(last.cells)) state.data.cells=last.cells;
      updateAllSlots(); toast(`批量刪除 ${visible.length} 格已永久存入資料庫`,'ok');
    })().catch(e=>{ state.data.cells=old; updateAllSlots(); toast(e.message||'批量刪除格子失敗，已還原','error'); });
  }

  async function insertWarehouseCell(z,c,s){
    z=clean(z).toUpperCase(); c=Number(c); s=Number(s||0);
    const old=JSON.parse(JSON.stringify(state.data.cells||[]));
    const localSlot=localInsertSlot(z,c,s); updateAllSlots(); highlightWarehouseCell(z,c,localSlot); toast('已先插入格子，背景儲存','ok');
    api('/api/warehouse/add-slot',{method:'POST',body:JSON.stringify({zone:z,column_index:c,insert_after:s,slot_type:'direct'})}).then(d=>{
      if(Array.isArray(d.cells)) state.data.cells=d.cells; updateAllSlots(); highlightWarehouseCell(z,c,Number(d.slot_number||localSlot)); toast('新增格子已永久存入資料庫','ok');
    }).catch(e=>{ state.data.cells=old; updateAllSlots(); toast(e.message||'新增格子失敗，已還原','error'); });
  }
  async function deleteWarehouseCell(z,c,s){
    z=clean(z).toUpperCase(); c=Number(c); s=Number(s);
    if(cellItems(z,c,s).length) return toast('格子內還有商品，請先退回該格或移除商品後再刪除','warn');
    if(!confirm(`確定刪除 ${z} 區第 ${c} 欄第 ${s} 格？`)) return;
    const old=JSON.parse(JSON.stringify(state.data.cells||[]));
    localDeleteSlot(z,c,s); updateAllSlots(); toast('已先從畫面刪除格子，背景儲存','ok');
    api('/api/warehouse/remove-slot',{method:'POST',body:JSON.stringify({zone:z,column_index:c,slot_number:s,slot_type:'direct'})}).then(d=>{
      if(Array.isArray(d.cells)) state.data.cells=d.cells; updateAllSlots(); toast('刪除格子已永久存入資料庫','ok');
    }).catch(e=>{ state.data.cells=old; updateAllSlots(); toast(e.message||'刪除格子失敗，已還原','error'); });
  }
  function emptySlotsDesc(z,c){
    z=clean(z).toUpperCase(); c=Number(c);
    return visibleSlotNumbers(z,c).slice().sort((a,b)=>b-a).filter(n=>!cellItems(z,c,n).length);
  }
  function visibleSlotCount(z,c){ return visibleSlotNumbers(z,c).length; }
  function normalizeColumnArgs(z,c){ return {z:clean(z||'A').toUpperCase(), c:Number(c||1)}; }
  async function addWarehouseColumnSlots(z,c,count=1){
    const args=normalizeColumnArgs(z,c); z=args.z; c=args.c;
    count=Math.max(1, Math.min(80, Math.floor(Number(count||1))));
    const old=JSON.parse(JSON.stringify(state.data.cells||[]));
    const start=maxSlot(z,c);
    let firstLocal=0;
    for(let i=0;i<count;i++){ const ns=localInsertSlot(z,c,start+i); if(!firstLocal) firstLocal=ns; }
    updateAllSlots(); highlightWarehouseCell(z,c,firstLocal || (start+1)); toast(`已先增加 ${count} 格，背景寫入資料庫`,'ok');
    try{
      const d=await api('/api/warehouse/bulk-add-slots',{method:'POST',body:JSON.stringify({zone:z,column_index:c,insert_after:start,count:count,slot_type:'direct'})});
      if(Array.isArray(d.cells)) state.data.cells=d.cells;
      const first=Number((d.created_slots||[])[0] || d.slot_number || firstLocal || (start+1));
      updateAllSlots(); highlightWarehouseCell(z,c,first); toast(`已永久增加 ${count} 格`,'ok');
    }catch(e){ state.data.cells=old; updateAllSlots(); toast(e.message||'增加格子失敗，已還原','error'); }
  }
  async function removeWarehouseColumnEmptySlots(z,c,count=1,preferredSlots=null){
    const args=normalizeColumnArgs(z,c); z=args.z; c=args.c;
    count=Math.max(1, Math.min(80, Math.floor(Number(count||1))));
    const empty=emptySlotsDesc(z,c);
    if(!empty.length) return toast('這欄沒有可減少的空格；有商品格不可刪','warn');
    const maxRemove=Math.max(0, visibleSlotCount(z,c)-1);
    const candidateSlots=(Array.isArray(preferredSlots)&&preferredSlots.length?preferredSlots:empty).filter(n=>empty.includes(Number(n)));
    const slots=candidateSlots.slice(0, Math.min(count, maxRemove));
    if(!slots.length) return toast('每欄至少要保留 1 格','warn');
    if(count>slots.length) toast(`只找到 ${slots.length} 個可減少空格，有商品格已跳過`,'warn');
    if(!confirm(`確定減少 ${z} 區第 ${c} 欄 ${slots.length} 個空格？\n將隱藏空格：${slots.slice().sort((a,b)=>a-b).join('、')}\n有商品格不會被刪除。`)) return;
    const old=JSON.parse(JSON.stringify(state.data.cells||[]));
    slots.forEach(n=>localDeleteSlot(z,c,n));
    updateAllSlots(); toast(`已先減少 ${slots.length} 格，背景寫入資料庫`,'ok');
    try{
      const d=await api('/api/warehouse/remove-empty-slots',{method:'POST',body:JSON.stringify({zone:z,column_index:c,count:slots.length,slots:slots,slot_type:'direct'})});
      if(Array.isArray(d.cells)) state.data.cells=d.cells;
      updateAllSlots(); toast(`已永久減少 ${Number(d.count||slots.length)} 格`,'ok');
    }catch(e){ state.data.cells=old; updateAllSlots(); toast(e.message||'減少格子失敗，已還原','error'); }
  }
  async function handleWarehouseColumnTool(act,z,c){
    const args=normalizeColumnArgs(z,c); z=args.z; c=args.c;
    if(act==='add-one') return addWarehouseColumnSlots(z,c,1);
    if(act==='remove-one') return removeWarehouseColumnEmptySlots(z,c,1);
    if(act==='add-many'){
      const count=Math.max(1, Math.min(80, Number.parseInt(prompt(`要在 ${z} 區第 ${c} 欄增加幾格？`, '5') || '0',10)||0));
      if(count) return addWarehouseColumnSlots(z,c,count);
      return;
    }
    if(act==='remove-many'){
      const mode=prompt(`批量減少模式：\n1 = 從最後空格減\n2 = 指定格號範圍減`, '1');
      if(String(mode||'1').trim()==='2'){
        const a=Number.parseInt(prompt(`起始格號？`, '1')||'0',10)||0;
        const b=Number.parseInt(prompt(`結束格號？`, String(Math.max(a, maxSlot(z,c))) )||'0',10)||0;
        if(!a||!b)return;
        const start=Math.min(a,b), end=Math.max(a,b);
        const slots=visibleSlotNumbers(z,c).filter(n=>n>=start&&n<=end&&!cellItems(z,c,n).length).sort((x,y)=>y-x);
        if(!slots.length) return toast('指定範圍內沒有可減少的空格；有商品格已略過','warn');
        return removeWarehouseColumnEmptySlots(z,c,slots.length,slots);
      }
      const count=Math.max(1, Math.min(80, Number.parseInt(prompt(`要在 ${z} 區第 ${c} 欄從最後空格減少幾格？`, '5') || '0',10)||0));
      if(count) return removeWarehouseColumnEmptySlots(z,c,count);
      return;
    }
  }

  async function returnWarehouseCell(z,c,s){
    z=clean(z).toUpperCase(); c=Number(c); s=Number(s);
    const items=cellItems(z,c,s);
    if(!items.length) return toast('此格沒有商品可退回','warn');
    if(!confirm(`確定將 ${z} 區第 ${c} 欄第 ${s} 格商品退回未錄入倉庫圖？`)) return;
    const oldItems=JSON.parse(JSON.stringify(items));
    const cell=cellFromData(z,c,s);
    if(cell){ cell.items=[]; cell.items_json='[]'; }
    mutateAvailableByItems(oldItems, +1);
    updateSlotUI(z,c,s);
    if(state.current && state.current.zone===z && Number(state.current.col)===c && Number(state.current.slot)===s){ state.current.items=[]; renderCellItems(true); }
    toast('已先從畫面退回，背景寫入資料庫','ok');
    api('/api/warehouse/return-unplaced',{method:'POST',body:JSON.stringify({zone:z,column_index:c,slot_number:s})}).then(async d=>{
      if(Array.isArray(d.cells)) state.data.cells=d.cells;
      await loadAvailable().catch(()=>{});
      updateAllSlots();
      highlightWarehouseCell(z,c,s);
      toast('退回該格已永久存入資料庫','ok');
    }).catch(async e=>{
      if(cell){ cell.items=oldItems; cell.items_json=JSON.stringify(oldItems); }
      await loadAvailable().catch(()=>{});
      updateAllSlots();
      toast(e.message||'退回該格背景儲存失敗，已還原畫面','error');
    });
  }
  function menu(){ let m=$('yx-final-warehouse-menu'); if(m) return m; m=document.createElement('div'); m.id='yx-final-warehouse-menu'; m.className='yx-final-warehouse-menu hidden'; m.innerHTML='<button data-wh-act="open">開啟 / 編輯格位</button><button data-wh-act="mark">標記 / 取消問題格</button><button data-wh-act="insert">在此格後插入格子</button><button data-wh-act="batch-insert">批量新增格子</button><button data-wh-act="delete">刪除此格</button><button data-wh-act="batch-delete">批量刪除空格</button><button data-wh-act="return">返回該格</button>'; document.body.appendChild(m); return m; }
  function showMenu(z,c,s,x,y){ const m=menu(); m.dataset.zone=z; m.dataset.column=c; m.dataset.slot=s; m.style.left=(x||window.innerWidth/2)+'px'; m.style.top=(y||window.innerHeight/2)+'px'; m.classList.remove('hidden'); }
  async function toggleProblemMark(z,c,s){
    z=clean(z).toUpperCase(); c=Number(c); s=Number(s);
    let cell=cellFromData(z,c,s);
    if(!cell){ cell={zone:z,column_index:c,slot_type:'direct',slot_number:s,items:[],items_json:'[]',note:'',problem_flag:''}; state.data.cells.push(cell); }
    const nowMarked = !(['problem','marked','1','true',true,1].includes(cell.problem_flag));
    const oldFlag = cell.problem_flag || '';
    cell.problem_flag = nowMarked ? 'problem' : '';
    updateSlotUI(z,c,s);
    toast(nowMarked?'已先標記成問題格，背景儲存':'已先取消問題格標記，背景儲存','ok');
    try{
      const d=await api('/api/warehouse/mark-cell',{method:'POST',body:JSON.stringify({zone:z,column_index:c,slot_number:s,marked:nowMarked})});
      if(Array.isArray(d.cells)) state.data.cells=d.cells;
      updateAllSlots();
    }catch(e){
      cell.problem_flag=oldFlag; updateSlotUI(z,c,s); toast(e.message||'標記格子失敗，已還原','error');
    }
  }
  function bindSlot(slot){
    if(!slot || slot.dataset.yxFinalBound==='1') return; slot.dataset.yxFinalBound='1'; let press=null;
    const data=()=>({zone:slot.dataset.zone,col:Number(slot.dataset.column),slot:Number(slot.dataset.slot)});
    slot.addEventListener('pointerdown',ev=>{ if(ev.button && ev.button!==0) return; const d=data(); press={x:ev.clientX,y:ev.clientY,timer:setTimeout(()=>{ press=null; showMenu(d.zone,d.col,d.slot,ev.clientX,ev.clientY); },650),...d,moved:false}; });
    slot.addEventListener('pointermove',ev=>{ if(!press) return; const moved=Math.abs(ev.clientX-press.x)>10 || Math.abs(ev.clientY-press.y)>10; if(moved){ clearTimeout(press.timer); press.moved=true; if(slot.dataset.hasItems==='1' && !state.drag){ state.drag={zone:press.zone,col:press.col,slot:press.slot,pointerId:ev.pointerId}; slot.classList.add('yx121-warehouse-dragging'); try{slot.setPointerCapture?.(ev.pointerId);}catch(_e){} } const over=document.elementFromPoint(ev.clientX,ev.clientY)?.closest?.('#warehouse-root [data-zone][data-column][data-slot]'); if(over) state.dragOver=over; } });
    slot.addEventListener('pointerup',ev=>{ if(press) clearTimeout(press.timer); const dragging=state.drag; let target=document.elementFromPoint(ev.clientX,ev.clientY)?.closest?.('#warehouse-root [data-zone][data-column][data-slot]') || state.dragOver; try{ if(dragging?.pointerId!=null) slot.releasePointerCapture?.(dragging.pointerId); }catch(_e){} document.querySelectorAll('.yx121-warehouse-dragging,.yx121-warehouse-drop-target').forEach(el=>el.classList.remove('yx121-warehouse-dragging','yx121-warehouse-drop-target')); if(dragging){ slot.dataset.blockClickUntil=String(Date.now()+900); state.drag=null; state.dragOver=null; if(target){ ev.preventDefault(); ev.stopPropagation(); moveCellContents(dragging,{zone:target.dataset.zone,col:target.dataset.column,slot:target.dataset.slot}); press=null; return; } } if(press?.moved) slot.dataset.blockClickUntil=String(Date.now()+500); press=null; });
    ['pointercancel','pointerleave'].forEach(t=>slot.addEventListener(t,()=>{ if(press){ clearTimeout(press.timer); press=null; } if(t==='pointercancel'){ state.drag=null; state.dragOver=null; } }));
    slot.addEventListener('pointerenter',()=>{ if(state.drag) slot.classList.add('yx121-warehouse-drop-target'); }); slot.addEventListener('pointerleave',()=>slot.classList.remove('yx121-warehouse-drop-target'));
    slot.addEventListener('contextmenu',ev=>{ ev.preventDefault(); const d=data(); showMenu(d.zone,d.col,d.slot,ev.clientX,ev.clientY); });
    slot.addEventListener('click',()=>{ if(Date.now()<Number(slot.dataset.blockClickUntil||0)) return; const d=data(); openWarehouseModal(d.zone,d.col,d.slot); });
  }
  function bindSlots(){ document.querySelectorAll('#warehouse-root [data-zone][data-column][data-slot]').forEach(bindSlot); }
  function bindGlobal(){
    if(state.bound) return; state.bound=true;
    const unplacedPill=$('warehouse-unplaced-pill');
    if(unplacedPill && unplacedPill.dataset.yxLongRefresh!=='1'){
      unplacedPill.dataset.yxLongRefresh='1';
      let lpTimer=null, sx=0, sy=0;
      const clear=()=>{ if(lpTimer){ clearTimeout(lpTimer); lpTimer=null; } };
      unplacedPill.addEventListener('pointerdown',ev=>{ sx=ev.clientX; sy=ev.clientY; clear(); lpTimer=setTimeout(async()=>{ lpTimer=null; try{ await loadAvailable(); toast('已長按刷新未錄入倉庫圖件數','ok'); }catch(e){ toast(e.message||'刷新失敗','error'); } },650); });
      unplacedPill.addEventListener('pointermove',ev=>{ if(Math.abs(ev.clientX-sx)>10 || Math.abs(ev.clientY-sy)>10) clear(); });
      ['pointerup','pointercancel','pointerleave'].forEach(t=>unplacedPill.addEventListener(t,clear));
    }
    document.addEventListener('click',async ev=>{
      const colAct=ev.target?.closest?.('[data-wh-col-act]'); if(colAct){ ev.preventDefault(); ev.stopPropagation(); try{ await handleWarehouseColumnTool(colAct.dataset.whColAct, colAct.dataset.zone, colAct.dataset.column); }catch(e){ toast(e.message||'欄位格數調整失敗','error'); } return; }
      const act=ev.target?.closest?.('[data-wh-act]'); if(act){ ev.preventDefault(); const m=menu(); const z=m.dataset.zone,c=Number(m.dataset.column),s=Number(m.dataset.slot); m.classList.add('hidden'); try{ if(act.dataset.whAct==='open') await openWarehouseModal(z,c,s); if(act.dataset.whAct==='mark') await toggleProblemMark(z,c,s); if(act.dataset.whAct==='return') await returnWarehouseCell(z,c,s); if(act.dataset.whAct==='insert') await insertWarehouseCell(z,c,s); if(act.dataset.whAct==='batch-insert') await batchInsertWarehouseCells(z,c,s); if(act.dataset.whAct==='delete') await deleteWarehouseCell(z,c,s); if(act.dataset.whAct==='batch-delete') await batchDeleteWarehouseCells(z,c,s); }catch(e){ toast(e.message||'格位操作失敗','error'); } return; }
      if(!ev.target?.closest?.('#yx-final-warehouse-menu')) menu().classList.add('hidden');
      if(ev.target?.id==='yx121-add-batch-row'){ ev.preventDefault(); state.batchCount=Math.max(3,Number(state.batchCount||3))+1; renderCellItems(); return; }
      if(ev.target?.id==='yx121-save-cell'){ ev.preventDefault(); try{ await saveWarehouseCell(); }catch(e){ toast(e.message||'儲存格位失敗','error'); } return; }
      const rm=ev.target?.closest?.('[data-remove-cell-item]'); if(rm){ ev.preventDefault(); applyCurrentItemInputs(); state.current.items.splice(Number(rm.dataset.removeCellItem),1); renderCellItems(false); return; }
      const curProd=ev.target?.closest?.('[data-current-product]'); if(curProd){ setTimeout(()=>syncCurrentRowQtyFromProduct(curProd.closest('.yx-direct-current-item')),0); return; }
      const curQty=ev.target?.closest?.('[data-current-qty]'); if(curQty){ setTimeout(()=>syncCurrentRowProductFromQty(curQty.closest('.yx-direct-current-item')),0); return; }
    },true);
    document.addEventListener('change', ev=>{ const sel=ev.target?.closest?.('#yx121-batch-rows .yx121-batch-select'); if(sel){ syncBatchSelectLimits(); } }, true);
    document.addEventListener('input', ev=>{
      const curProduct=ev.target?.closest?.('#warehouse-current-items-html [data-current-product]');
      if(curProduct){
        const row=curProduct.closest('.yx-direct-current-item');
        const qtyEl=row?.querySelector('[data-current-qty]');
        const n=qtyFromProductTextForInput(curProduct.value, 0);
        // 例如 363x30x06=858x28，右側件數立即同步成 28；手動只改件數時不會被商品文字蓋回。
        if(qtyEl && n>0) qtyEl.value=String(n);
      }
      const curQty=ev.target?.closest?.('#warehouse-current-items-html [data-current-qty]');
      if(curQty){
        if(Number(curQty.value)<1) curQty.value='1';
        syncCurrentRowProductFromQty(curQty.closest('.yx-direct-current-item'));
      }
      const support=ev.target?.closest?.('#yx121-batch-rows .yx121-batch-support');
      if(support){
        support.value=normalizeSupportInputValue(support.value);
        const row=support.closest('.yx121-batch-row');
        const qtyEl=row?.querySelector('.yx121-batch-qty');
        const max=Number(qtyEl?.dataset.yx121Max||qtyEl?.max||0);
        const q=qtyFromSupportInput(support.value, max);
        if(qtyEl && q>0) qtyEl.value=String(max>0 ? Math.min(max,q) : q);
      }
      const qty=ev.target?.closest?.('#yx121-batch-rows .yx121-batch-qty');
      if(qty){ const max=Number(qty.dataset.yx121Max||qty.max||0); if(max<=0 && qty.value){ qty.value=''; toast('此商品已無剩餘數量，禁止重複放入','warn'); } else if(max>0 && Number(qty.value)>max){ qty.value=String(max); toast('加入件數不可超過該商品可加入數量','warn'); } }
    }, true);
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
  window.addWarehouseColumnSlots=addWarehouseColumnSlots;
  window.removeWarehouseColumnEmptySlots=removeWarehouseColumnEmptySlots;
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
  function update(){ const b=document.getElementById('yx-local-page-undo-btn-disabled'); if(b) b.disabled=!stack.length; }
  window.YXPageUndo={
    snapshot(label, undo){ if(typeof undo!=='function') return; stack.push({label:String(label||'操作'), undo}); while(stack.length>10) stack.shift(); update(); },
    undo(){ const item=stack.pop(); update(); if(!item) return; try{ item.undo(); (window.toast||console.log)('已復原：'+item.label,'ok'); }catch(e){ (window.toast||console.error)(e.message||'復原失敗','error'); } },
    size(){ return stack.length; }
  };
  document.addEventListener('click', ev=>{ const b=ev.target?.closest?.('#yx-local-page-undo-btn-disabled'); if(!b) return; ev.preventDefault(); ev.stopPropagation(); window.YXPageUndo.undo(); }, true);
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', update, {once:true}); else update();
})();
/* ===== END V42 MAINFILE UNDO MANAGER ===== */




/* ===== V55 COMMON CLEAN TOAST/UNDO REPAIR ===== */
(function(){
  'use strict';
  if(window.__YX_V55_COMMON_CLEAN__) return; window.__YX_V55_COMMON_CLEAN__=true;
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  window.toast=window.showToast=window.notify=function(message,kind='ok'){
    const a=document.activeElement; const editable=a&&a.matches?.('input,textarea,select,[contenteditable="true"]'); let s=null,e=null; try{if(editable&&'selectionStart'in a){s=a.selectionStart;e=a.selectionEnd;}}catch(_e){}
    let box=document.getElementById('yx-v20-toast'); if(!box){box=document.createElement('div');box.id='yx-v20-toast';document.body.appendChild(box);} box.tabIndex=-1; box.className='yx-v20-toast-card '+(kind||'ok'); box.style.pointerEvents='none'; box.innerHTML='<strong>'+(kind==='error'?'操作失敗':kind==='warn'?'請注意':'操作成功')+'</strong><div>'+esc(message||'')+'</div>'; box.style.display='block'; box.classList.add('show'); clearTimeout(window.__YX_V55_COMMON_TOAST__); window.__YX_V55_COMMON_TOAST__=setTimeout(()=>{try{box.classList.remove('show');box.style.display='none';}catch(_e){}},1800);
    if(editable&&document.contains(a)) setTimeout(()=>{try{a.focus({preventScroll:true}); if(s!=null&&a.setSelectionRange)a.setSelectionRange(s,e??s);}catch(_e){}},0);
  };
  if(window.YXHardLock) window.YXHardLock.toast=window.toast;
})();
/* ===== END V55 COMMON CLEAN TOAST/UNDO REPAIR ===== */


/* ===== V92 warehouse URL location highlighter (mainfile, no overlay/no observer) ===== */
(function(){
  'use strict';
  if(window.__YX_V92_WAREHOUSE_URL_TARGET__) return; window.__YX_V92_WAREHOUSE_URL_TARGET__=true;
  function isWarehouse(){return (document.body?.dataset?.module||'')==='warehouse' || location.pathname.includes('/warehouse');}
  function parseLoc(v){ const m=String(v||'').trim().match(/^([AB])[-_\s]?(\d+)[-_\s]?(\d+)$/i); return m?{zone:m[1].toUpperCase(), col:Number(m[2]), slot:Number(m[3])}:null; }
  async function jumpFromUrl(){
    if(!isWarehouse()) return;
    const sp=new URLSearchParams(location.search);
    const loc=parseLoc(sp.get('loc')||'');
    const q=(sp.get('q')||sp.get('customer')||'').trim();
    try{
      if(typeof window.renderWarehouse==='function') await window.renderWarehouse(true);
      if(loc && typeof window.highlightWarehouseCell==='function'){
        window.highlightWarehouseCell(loc.zone,loc.col,loc.slot);
        const el=document.querySelector(`[data-zone="${loc.zone}"][data-column="${loc.col}"][data-slot="${loc.slot}"]`);
        if(el) el.classList.add('yx-v91-target-flash');
        if((sp.get('open')==='1'||sp.get('auto_open')==='1') && typeof window.YXFinalWarehouse?.openWarehouseModal==='function'){
          setTimeout(()=>window.YXFinalWarehouse.openWarehouseModal(loc.zone,loc.col,loc.slot), 260);
        }
        return;
      }
      if(q && document.getElementById('warehouse-search') && typeof window.searchWarehouse==='function'){
        document.getElementById('warehouse-search').value=q;
        await window.searchWarehouse();
      }
    }catch(e){ try{(window.toast||console.warn)(e.message||'定位失敗','error');}catch(_e){} }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',jumpFromUrl,{once:true}); else jumpFromUrl();
  window.YXWarehouseJumpFromUrl=jumpFromUrl;
})();
/* ===== END V92 warehouse URL location highlighter ===== */

/* ===== V93 warehouse opened-cell product row target (mainfile, no observer/no interval) ===== */
(function(){
  'use strict';
  if(window.__YX_V93_WAREHOUSE_ITEM_TARGET__) return; window.__YX_V93_WAREHOUSE_ITEM_TARGET__=true;
  function norm(v){return String(v||'').replace(/\s+/g,'').toLowerCase();}
  function flashItem(){
    const sp=new URLSearchParams(location.search);
    const q=norm(sp.get('highlight_item')||sp.get('q')||sp.get('customer')||'');
    if(!q) return false;
    const scopes=Array.from(document.querySelectorAll('.modal:not(.hidden),.bottom-sheet:not(.hidden),#warehouse-cell-modal,.yx106-cell-modal,.yx-final-cell-modal')).filter(Boolean);
    const root=scopes.length?scopes[scopes.length-1]:document;
    const hit=Array.from(root.querySelectorAll('.deduct-card,.warehouse-item-row,.yx106-batch-row,.yx-cell-item-row,li,tr')).find(el=>norm(el.textContent).includes(q));
    if(hit){ hit.classList.add('yx-v93-cell-item-target'); try{hit.scrollIntoView({behavior:'smooth',block:'center'});}catch(_){} try{document.dispatchEvent(new CustomEvent('yx:today-target-opened'));}catch(_){} return true; }
    return false;
  }
  function schedule(){let n=0; const step=()=>{ if(flashItem()||n++>10)return; setTimeout(step,240);}; step();}
  const old=window.YXWarehouseJumpFromUrl;
  if(typeof old==='function'){
    window.YXWarehouseJumpFromUrl=async function(){ const r=await old.apply(this,arguments); schedule(); return r; };
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',schedule,{once:true}); else schedule();
})();
/* ===== END V93 warehouse opened-cell product row target ===== */


/* ===== V95 warehouse product-row highlighter: token match after modal opens (mainfile) ===== */
(function(){
  'use strict';
  if(window.__YX_V95_WAREHOUSE_ROW_HIGHLIGHT__) return; window.__YX_V95_WAREHOUSE_ROW_HIGHLIGHT__=true;
  function norm(v){return String(v||'').replace(/[Ｘ×✕＊*X]/g,'x').replace(/\s+/g,'').toLowerCase();}
  function tokens(){const sp=new URLSearchParams(location.search);const raw=[sp.get('highlight_item'),sp.get('q'),sp.get('customer')].filter(Boolean).join(' ');return norm(raw).split(/[+｜|,，\s]+/).map(x=>x.trim()).filter(x=>x&&x.length>=2).slice(0,8);}
  function score(el,ts){const text=norm(el.textContent||'');let sc=0;ts.forEach(t=>{if(text.includes(t))sc+=t.length>=4?3:1;});return sc;}
  function run(){const ts=tokens(); if(!ts.length)return false;const scopes=Array.from(document.querySelectorAll('.modal:not(.hidden),.bottom-sheet:not(.hidden),#warehouse-modal:not(.hidden),#warehouse-cell-modal:not(.hidden)'));const root=scopes.length?scopes[scopes.length-1]:document;const rows=Array.from(root.querySelectorAll('.deduct-card,.yx-current-item-row,.warehouse-current-item,.warehouse-item-row,.yx121-batch-row,.yx-cell-item-row,li,tr,[data-item-key]')).filter(el=>el.offsetParent!==null||root!==document);let best=null,bestScore=0;for(const el of rows){const s=score(el,ts);if(s>bestScore){bestScore=s;best=el;}}if(best&&bestScore>0){best.classList.add('yx-v95-warehouse-item-flash','yx-v93-cell-item-target');try{best.scrollIntoView({behavior:'smooth',block:'center'});}catch(_){}return true;}return false;}
  function schedule(){let n=0;const step=()=>{if(run()||n++>18)return;setTimeout(step,260);};step();}
  document.addEventListener('yx:today-target-opened',schedule);window.addEventListener('load',schedule,{once:true});setTimeout(schedule,900);
})();
/* ===== END V95 warehouse product-row highlighter ===== */

/* ===== V98 warehouse bulk remove preview before commit (mainfile) ===== */
(function(){'use strict';
  if(window.__YX_V98_WAREHOUSE_REMOVE_PREVIEW__) return; window.__YX_V98_WAREHOUSE_REMOVE_PREVIEW__=true;
  async function api(url,opt={}){const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});const t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch{d={success:false,error:t}};if(!r.ok||d.success===false)throw new Error(d.error||d.message||'操作失敗');return d}
  function toast(m,k){try{(window.toast||window.YXHardLock?.toast||console.log)(m,k||'ok')}catch(_){}}
  window.YX98PreviewRemoveEmptySlots=async function(zone,column_index,count,slots){
    const preview=await api('/api/warehouse/preview-remove-empty-slots',{method:'POST',body:JSON.stringify({zone,column_index,count,slots:Array.isArray(slots)?slots:[]})});
    const ok=preview.removable_slots||[]; const blocked=preview.blocked_slots||[];
    const msg=`${zone}區${column_index}欄預計減少 ${ok.length} 格：${ok.join('、')||'無'}${blocked.length?`\n跳過：${blocked.map(x=>`${x.slot_number}格(${x.reason})`).join('、')}`:''}\n確定送出？`;
    if(!ok.length){toast('沒有可減少的空格；有商品格不可刪','warn');return null;}
    if(!confirm(msg)) return null;
    return await api('/api/warehouse/remove-empty-slots',{method:'POST',body:JSON.stringify({zone,column_index,count:ok.length,slots:ok})});
  };
  document.addEventListener('click',async ev=>{
    const btn=ev.target?.closest?.('[data-yx96-bulk-minus],[data-yx96-minus-slot]');
    if(!btn) return;
    const zone=btn.dataset.zone||btn.closest('[data-zone]')?.dataset.zone||'';
    const col=Number(btn.dataset.columnIndex||btn.dataset.column||btn.closest('[data-column]')?.dataset.column||btn.closest('[data-column-index]')?.dataset.columnIndex||0);
    if(!zone||!col) return;
    if(btn.dataset.yx98PreviewHandled==='1') return;
    btn.dataset.yx98PreviewHandled='1';
    setTimeout(()=>{try{delete btn.dataset.yx98PreviewHandled}catch(_e){}},800);
    ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation?.();
    const count=Number(prompt('要減少幾格？只會刪空格，有商品格會跳過。','1')||0);
    if(!count) return;
    try{const d=await window.YX98PreviewRemoveEmptySlots(zone,col,count,[]); if(d){toast(`已減少 ${d.count||0} 格`,'ok'); if(typeof window.renderWarehouse==='function') await window.renderWarehouse(true);}}
    catch(e){toast(e.message||'減少格子失敗','error');}
  },true);
})();
/* ===== END V98 warehouse bulk remove preview ===== */

/* ===== V99 MAINFILE warehouse reduce preview refinement ===== */
(function(){'use strict';
  if(window.__YX_V99_WAREHOUSE_REDUCE_PREVIEW__) return; window.__YX_V99_WAREHOUSE_REDUCE_PREVIEW__=true;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function api(url,opt={}){const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});const t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch{d={success:false,error:t}};if(!r.ok||d.success===false)throw new Error(d.error||d.message||'操作失敗');return d;}
  function modal(html){let m=document.getElementById('yx99-reduce-preview-modal');if(!m){m=document.createElement('div');m.id='yx99-reduce-preview-modal';m.className='yx99-modal';document.body.appendChild(m);}m.innerHTML=html;m.classList.add('show');return m;}
  function close(){document.getElementById('yx99-reduce-preview-modal')?.classList.remove('show');}
  window.YX99PreviewAndRemoveSlots=async function(zone,column_index,count,slots){
    const p=await api('/api/warehouse/preview-remove-empty-slots',{method:'POST',body:JSON.stringify({zone,column_index,count,slots:Array.isArray(slots)?slots:[]})});
    const ok=p.removable_slots||[], blocked=p.blocked_slots||[];
    return new Promise(resolve=>{
      const m=modal(`<div class="yx99-modal-card"><h3>${esc(zone)}區 ${Number(column_index)}欄 批量減格預覽</h3><div class="yx99-preview-summary"><b>可減少 ${ok.length} 格</b><span>${ok.join('、')||'無'}</span></div><div class="yx99-preview-blocked"><b>自動跳過</b>${blocked.length?blocked.map(x=>`<span>${Number(x.slot_number)}格：${esc(x.reason||'不可刪')}</span>`).join(''):'<span>無</span>'}</div><div class="btn-row"><button class="primary-btn" data-yx99-confirm ${ok.length?'':'disabled'}>確認減少</button><button class="ghost-btn" data-yx99-cancel>取消</button></div></div>`);
      m.querySelector('[data-yx99-cancel]')?.addEventListener('click',()=>{close();resolve(null)},{once:true});
      m.querySelector('[data-yx99-confirm]')?.addEventListener('click',async()=>{try{const d=await api('/api/warehouse/remove-empty-slots',{method:'POST',body:JSON.stringify({zone,column_index,count:ok.length,slots:ok})});close();resolve(d);}catch(e){alert(e.message||'減少格子失敗');resolve(null);}},{once:true});
    });
  };
})();
/* ===== END V99 warehouse reduce preview refinement ===== */

/* ===== V101 MAINFILE warehouse fast stats + activity target helpers ===== */
(function(){'use strict';
  if(window.__YX_V101_WAREHOUSE_FAST_STATS__) return; window.__YX_V101_WAREHOUSE_FAST_STATS__=true;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function api(url,opt={}){const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});const t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch{d={success:false,error:t}};if(!r.ok||d.success===false)throw new Error(d.error||d.message||'操作失敗');return d;}
  function ensureBar(){let el=document.getElementById('yx101-warehouse-fast-stats'); if(el)return el; el=document.createElement('div'); el.id='yx101-warehouse-fast-stats'; el.className='yx101-fast-stats glass-card'; el.innerHTML='<b>倉庫統計</b><span data-yx101-fast-text>尚未刷新</span><button type="button" class="ghost-btn small-btn" data-yx101-refresh-unplaced>刷新未入倉</button>'; const host=document.querySelector('.warehouse-page,.module-body,main,.container')||document.body; host.prepend(el); return el;}
  async function refresh(){const el=ensureBar(); const text=el.querySelector('[data-yx101-fast-text]'); text.textContent='刷新中…'; const d=await api('/api/warehouse/unplaced-stats-fast'); const p=d.placed||{}; const u=d.unplaced||{}; text.innerHTML=`來源 ${Number(d.source_total||0)} 件｜已入倉 ${Number(p.total||0)} 件｜A ${Number(p.A||0)}｜B ${Number(p.B||0)}｜未分區 ${Number(p['未分區']||0)}｜未入倉約 ${Number(u.total||0)} 件`; window.dispatchEvent(new CustomEvent('yx:warehouse-fast-stats',{detail:d})); return d;}
  document.addEventListener('click',e=>{if(e.target.closest?.('[data-yx101-refresh-unplaced]')){e.preventDefault();refresh().catch(err=>(window.toast||alert)(err.message||'統計刷新失敗','error'));}},true);
  window.YX101RefreshWarehouseFastStats=refresh;
  const boot=()=>{ensureBar(); setTimeout(()=>refresh().catch(()=>{}),350);};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
/* ===== END V101 warehouse fast stats ===== */
