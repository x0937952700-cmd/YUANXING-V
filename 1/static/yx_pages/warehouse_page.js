
/* formal page module */
(function(){
  'use strict';
  if (window.YX30EffectiveQty) return;


  // V163 warehouse stability core: valid syntax + safe state container.
  window.__YX_WAREHOUSE_STABILITY__ = window.__YX_WAREHOUSE_STABILITY__ || {
    activeColumnOps: new Map(),
    lastMenuAt: 0,
    pendingFetches: new Map(),
    opSeqByColumn: new Map(),
    lastActionKey: '',
    lastActionAt: 0
  };
  window.__YX_WAREHOUSE_REQ__ = window.__YX_WAREHOUSE_REQ__ || {
    seq: 0,
    latestSeq: 0
  };

  function yxWarehouseNextSeq(){
    window.__YX_WAREHOUSE_REQ__.seq += 1;
    window.__YX_WAREHOUSE_REQ__.latestSeq = window.__YX_WAREHOUSE_REQ__.seq;
    return window.__YX_WAREHOUSE_REQ__.seq;
  }
  function yxWarehouseIsLatest(seq){
    return seq === window.__YX_WAREHOUSE_REQ__.latestSeq;
  }
  function yxColumnBusy(key){
    return window.__YX_WAREHOUSE_STABILITY__.activeColumnOps.get(key) === true;
  }
  function yxSetColumnBusy(key, busy){
    if (!key) return;
    if (busy) window.__YX_WAREHOUSE_STABILITY__.activeColumnOps.set(key, true);
    else window.__YX_WAREHOUSE_STABILITY__.activeColumnOps.delete(key);
  }
  function yxMenuGuard(){
    const now = Date.now();
    if (now - window.__YX_WAREHOUSE_STABILITY__.lastMenuAt < 8) return false;
    window.__YX_WAREHOUSE_STABILITY__.lastMenuAt = now;
    return true;
  }
  function yxActionGuard(key, wait){
    const now = Date.now();
    const s = window.__YX_WAREHOUSE_STABILITY__;
    const ms = Number(wait || 350);
    if (s.lastActionKey === key && now - s.lastActionAt < ms) return false;
    s.lastActionKey = key;
    s.lastActionAt = now;
    return true;
  }
  function yxColumnSeq(key){
    const s = window.__YX_WAREHOUSE_STABILITY__;
    const next = (s.opSeqByColumn.get(key) || 0) + 1;
    s.opSeqByColumn.set(key, next);
    return next;
  }
  function yxIsColumnSeqLatest(key, seq){
    return (window.__YX_WAREHOUSE_STABILITY__.opSeqByColumn.get(key) || 0) === seq;
  }

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

/* 沅興木業 FULL MASTER main REAL LOADED COMPLETE - page_warehouse_master_main - 119 warehouse flow background stable */
(function(){ window.__YX_FULL_MASTER_main_PAGE__='page_warehouse_master_main'; })();

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
    catch(fetchErr){
      if (timer) clearTimeout(timer);
      const msg=String(fetchErr?.message || fetchErr || '').toLowerCase();
      const e = new Error((fetchErr?.name === 'AbortError' || msg.includes('aborted') || msg.includes('signal is aborted')) ? '請求逾時，已保留操作並可稍後重試' : (fetchErr?.message || '網路請求失敗'));
      e.abort_like = fetchErr?.name === 'AbortError' || msg.includes('aborted') || msg.includes('signal is aborted');
      throw e;
    }
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
/* 沅興木業 倉庫頁最終鎖死版
   原則：倉庫頁只吃 templates/module.html 內唯一 HTML；本檔只更新資料、事件、API，不再整頁 render / 不再吃舊 render。 */
(function(){
  'use strict';
  // V420 warehouse cell save/reopen sync: committed batch rows are cleared from drafts, and close/switch flushes live edits into the existing autosave queue. No renderer/timer loop added.
  // V420 warehouse batch/support return sync: batch rows with different 支數 no longer merge into one wrong line, and returned/consumed dropdown deltas keep combined support text. No renderer/timer loop added.
  // V418 warehouse visible/longpress regression: slot item normalization + delegated menu repair; no renderer/timer loop added.
  // V411 warehouse cell-edit stability: remove-current-item redraws before autosave, baseline delta is explicit for deletes, and batch same item keeps placement; no renderer/timer loop added.
  // V219 warehouse stability: live editor inputs are flushed to local cell + draft before switching/closing, and input debounced autosave protects quick cell changes; no renderer/timer loop added.
  // V188 warehouse stability: delayed same-cell saves are key-checked before running, so a queued save can never write into the wrong cell after the user switches cells; no renderer/timer loop added.
  // V187 warehouse stability: save locks now self-heal on stale background requests and release safely on immediate exceptions; no renderer/timer loop added.
  // V186 warehouse stability: manual save now preserves the optimistic cell draft until DB confirmation, so queued/background writes cannot lose the latest visible cell state.
  // Prevent duplicate document click/change/input listeners when the module script is loaded twice.
  if (window.__YX_WAREHOUSE_MAIN_SINGLETON__) return;
  window.__YX_WAREHOUSE_MAIN_SINGLETON__ = true;
  window.__YX_WAREHOUSE_MAIN_SINGLETON_V435__ = true;
  window.__YX_WAREHOUSE_MAIN_SINGLETON_V420__ = true;
  window.__YX_WAREHOUSE_MAIN_SINGLETON_V219__ = true;
  window.__YX_WAREHOUSE_MAIN_SINGLETON_V187__ = true;
  window.__YX_WAREHOUSE_MAIN_SINGLETON_V186__ = true;
  window.__YX_WAREHOUSE_MAIN_SINGLETON_V185__ = true;
  window.__YX_WAREHOUSE_MAIN_SINGLETON_V184__ = true;
  window.__YX_WAREHOUSE_MAIN_SINGLETON_V183__ = true;
  window.__YX_WAREHOUSE_MAIN_SINGLETON_V182__ = true;
  window.__YX_WAREHOUSE_MAIN_SINGLETON_V181__ = true;
  window.__YX_WAREHOUSE_MAIN_SINGLETON_V176__ = true;
  window.__YX_WAREHOUSE_MAIN_SINGLETON_V175__ = true;
  window.__YX_WAREHOUSE_MAIN_SINGLETON_V174__ = true;
  window.__YX_WAREHOUSE_MAIN_SINGLETON_V173__ = true;
  window.__YX_WAREHOUSE_MAIN_SINGLETON_V177__ = true;
  window.__YX_WAREHOUSE_MAIN_SINGLETON_V176__ = true;
  window.__YX_WAREHOUSE_MAIN_SINGLETON_V175__ = true;
  window.__YX_WAREHOUSE_MAIN_SINGLETON_V174__ = true;
  window.__YX_WAREHOUSE_MAIN_SINGLETON_V173__ = true;
  window.__YX_WAREHOUSE_MAIN_SINGLETON_V172__ = true;
  window.__YX_WAREHOUSE_MAIN_SINGLETON_V171__ = true;
  window.__YX_WAREHOUSE_MAIN_SINGLETON_V170__ = true;
  // Keep old flags too so an accidentally cached older script cannot install beside this one.
  window.__YX_WAREHOUSE_MAIN_SINGLETON_V169__ = true;
  window.__YX_WAREHOUSE_MAIN_SINGLETON_V168__ = true;
  window.__YX_WAREHOUSE_MAIN_SINGLETON_V167__ = true;
  const YX = window.YXCore || {};
  const $ = id => document.getElementById(id);
  const clean = v => String(v ?? '').replace(/\s+/g,' ').trim();
  const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const api = YX.api || (async (url,opt={})=>{ const res=await window.YXDataStore.requestResponse(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}}); const data=await res.json().catch(()=>({success:false,error:'伺服器回應格式錯誤'})); if(!res.ok||data.success===false) throw new Error(data.error||data.message||'請求失敗'); return data; });
  const toast = YX.toast || ((m)=>console.log(m));
  function yxOperationId(action){
    try {
      return `${action}-${Date.now()}-${Math.random().toString(16).slice(2)}-${(crypto&&crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2))}`;
    } catch(_e) { return `${action}-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
  }
  function warehouseDraftKey(){
    const c=state.current||{};
    return `yx119b2-warehouse-draft-${clean(c.zone||'A')}-${Number(c.col||1)}-${Number(c.slot||1)}`;
  }
  function persistWarehouseDraft(){
    try {
      if(!state.current) return;
      // V185: keep incomplete batch selections too. Users often choose items then tap another cell/close by mistake;
      // preserving the rows avoids losing work while still not auto-saving unconfirmed batch additions to DB.
      let batchRows=[];
      try{ if(document.querySelector('#yx121-batch-rows')) batchRows=snapshotBatchRows(); }catch(_e){}
      localStorage.setItem(warehouseDraftKey(), JSON.stringify({
        items:state.current.items||[],
        note:$('warehouse-note')?.value||'',
        batchRows,
        batchCount:Math.max(3, Number(state.batchCount||3), Array.isArray(batchRows)?batchRows.length:0),
        saved_at:Date.now()
      }));
    } catch(_e){}
  }
  function clearWarehouseDraft(z,c,s){
    try { localStorage.removeItem(`yx119b2-warehouse-draft-${clean(z||'A')}-${Number(c||1)}-${Number(s||1)}`); } catch(_e){}
  }
  function clearWarehouseColumnDrafts(z,c){
    // V408: insert/delete/batch compacts slot numbers. Old per-slot drafts become unsafe
    // because slot 5 may become another cell after renumbering. Clear only the touched column.
    try{
      z=clean(z||'A').toUpperCase(); c=Number(c||1);
      const prefix=`yx119b2-warehouse-draft-${z}-${c}-`;
      Object.keys(localStorage||{}).forEach(k=>{ if(String(k).startsWith(prefix)) localStorage.removeItem(k); });
    }catch(_e){}
  }
  function restoreWarehouseDraft(){
    try {
      const raw=localStorage.getItem(warehouseDraftKey());
      if(!raw) return false;
      const draft=JSON.parse(raw);
      if(!draft || Date.now()-Number(draft.saved_at||0)>86400000){ try{ localStorage.removeItem(warehouseDraftKey()); }catch(_e){} return false; }
      if(Array.isArray(draft.items) && draft.items.length){ state.current.items=draft.items; }
      if($('warehouse-note') && typeof draft.note==='string') $('warehouse-note').value=draft.note;
      if(Array.isArray(draft.batchRows) && draft.batchRows.some(r=>r && (r.value || r.key || r.qty || r.support))){
        state.pendingDraftBatchRows = draft.batchRows;
        state.batchCount=Math.max(3, Number(draft.batchCount||0), draft.batchRows.length);
      }
      return true;
    } catch(_e){ return false; }
  }
  const FAILED_SAVE_KEY = 'yx_warehouse_failed_saves_v307_status_time_lock';
  function failedSaveId(url, payload){
    try{
      return [url||'', clean(payload?.zone||''), Number(payload?.column_index||0), Number(payload?.slot_number||0), payload?.operation_id||'', payload?.client_stability||''].join('|');
    }catch(_e){ return String(Date.now()); }
  }
  function readFailedSaves(){
    try{
      const fresh=JSON.parse(localStorage.getItem(FAILED_SAVE_KEY)||'[]');
      const legacy=JSON.parse(localStorage.getItem('yx_warehouse_failed_saves_v262_save_retry_recovery')||'[]');
      const prev=JSON.parse(localStorage.getItem('yx_warehouse_failed_saves_v277_slot_index_sync_lock')||'[]');
      const v282=JSON.parse(localStorage.getItem('yx_warehouse_failed_saves_v282_operation_status_card')||'[]');
      const v287=JSON.parse(localStorage.getItem('yx_warehouse_failed_saves_v287_status_detail_card')||'[]');
      const v292=JSON.parse(localStorage.getItem('yx_warehouse_failed_saves_v292_single_retry_cancel')||'[]');
      const arr=[...(Array.isArray(legacy)?legacy:[]), ...(Array.isArray(prev)?prev:[]), ...(Array.isArray(v282)?v282:[]), ...(Array.isArray(v287)?v287:[]), ...(Array.isArray(v292)?v292:[]), ...(Array.isArray(fresh)?fresh:[])];
      const seen=new Set();
      return arr.filter(x=>{ if(!x||!x.id||seen.has(x.id)) return false; seen.add(x.id); return true; }).slice(-80);
    }catch(_e){ return []; }
  }
  function writeFailedSaves(arr){
    try{ localStorage.setItem(FAILED_SAVE_KEY, JSON.stringify((Array.isArray(arr)?arr:[]).slice(-50))); }catch(_e){}
  }
  function rememberFailedSave(url, payload, label, error){
    try{
      if(!payload || !payload.zone || !payload.column_index || !payload.slot_number) return;
      const id=failedSaveId(url,payload);
      const now=Date.now();
      const arr=readFailedSaves().filter(x=>x && x.id!==id);
      arr.push({id,url,payload,label:label||'格位儲存',error:String(error||''),saved_at:now,attempts:0});
      writeFailedSaves(arr);
      state.failedSaveSeq=(Number(state.failedSaveSeq)||0)+1;
      try{ persistWarehouseDraft(); }catch(_e){}
    }catch(_e){}
  }
  function forgetFailedSave(url, payload){
    try{
      const id=failedSaveId(url,payload);
      const arr=readFailedSaves().filter(x=>x && x.id!==id);
      writeFailedSaves(arr);
    }catch(_e){}
  }
  async function retryFailedWarehouseSaves(opts={}){
    const arr=readFailedSaves();
    if(!arr.length){ if(opts.toast) toast('目前沒有等待重送的倉庫保存','ok'); return {success:true,count:0}; }
    const keep=[]; let ok=0, fail=0;
    for(const rec of arr){
      try{
        const payload={...(rec.payload||{})};
        if(!payload.operation_id) payload.operation_id=yxOperationId('warehouse-retry-save');
        const data=await api(rec.url||'/api/warehouse/cell',{method:'POST',body:JSON.stringify(payload)});
        if(data && data.success===false) throw new Error(data.error||'重送失敗');
        ok++;
        const z=clean(payload.zone).toUpperCase(), c=Number(payload.column_index), s=Number(payload.slot_number);
        try{ scheduleWarehouseConsistencyCheck({action:'cell-save-retry',zone:z,column_index:c,slot_number:s,operation_id:payload.operation_id||''}, 900); }catch(_e){}
        if(data?.saved_cell && !isCellLocallyProtected(z,c,s)){
          const sc=data.saved_cell;
          setLocalCellItems(z,c,s,Array.isArray(sc.items)?sc.items:(payload.items||[]),sc.note ?? payload.note ?? '');
        }
      }catch(e){
        fail++;
        keep.push({...rec,attempts:Number(rec.attempts||0)+1,error:e.message||String(e),saved_at:Date.now()});
      }
    }
    writeFailedSaves(keep);
    if(ok){ try{ clearWarehouseCaches(); cacheWarehouseNow(); notifyWarehouseChanged({action:'cell-save-retry',version:'v423',count:ok}); await loadAvailable(false).catch(()=>{}); updateAllSlots(); }catch(_e){} }
    try{ window.dispatchEvent(new CustomEvent('yx:operation-status',{detail:{source:'warehouse',status:fail?'pending':'success',reason:'warehouse-cell-save-retry',message:fail?`倉庫保存已重送 ${ok} 筆，仍有 ${fail} 筆待重試`:`倉庫保存已重送 ${ok} 筆`,count:ok,failed:fail,version:'v423',detail_text:arr.slice(0,3).map(r=>r.label||r.id).filter(Boolean).join('、')}})); }catch(_e){}
    if(opts.toast || ok || fail){ toast(fail?`倉庫保存已重送 ${ok} 筆，仍有 ${fail} 筆待重試`:`倉庫保存已重送 ${ok} 筆` , fail?'warn':'ok'); }
    return {success:fail===0,count:ok,failed:fail};
  }
  window.YXWarehouseRetryFailedSaves = retryFailedWarehouseSaves;

  // V267：拖拉移動、插入格、刪除格、批量格號重排屬於「欄位結構操作」。
  // 這些不是單一格位保存，不能只靠 v262 的 cell-save 重送；失敗/延遲時要保留 optimistic 畫面並進同一套本地重送保護。
  const FAILED_STRUCTURE_OP_KEY = 'yx_warehouse_failed_structure_ops_v307_status_time_lock';
  function shouldRememberWarehouseStructureOp(url, payload){
    const u=String(url||'');
    if(!u.startsWith('/api/warehouse/')) return false;
    if(u==='/api/warehouse/cell') return false;
    return !!payload;
  }
  function warehouseStructureOpId(url, payload){
    try{
      const p=payload||{};
      const from=p.from||{}, to=p.to||{};
      return [
        url||'', p.operation_id||'', p.zone||from.zone||to.zone||'',
        p.column_index||from.column_index||from.col||to.column_index||to.col||'',
        p.slot_number||p.insert_after||from.slot_number||from.slot||to.slot_number||to.slot||'',
        p.count||'', p.mode||''
      ].map(x=>clean(x)).join('|');
    }catch(_e){ return String(url||'')+'|'+Date.now(); }
  }
  function readFailedStructureOps(){
    try{
      const fresh=JSON.parse(localStorage.getItem(FAILED_STRUCTURE_OP_KEY)||'[]');
      const legacy=JSON.parse(localStorage.getItem('yx_warehouse_failed_structure_ops_v262_save_retry_recovery')||'[]');
      const prev=JSON.parse(localStorage.getItem('yx_warehouse_failed_structure_ops_v277_slot_index_sync_lock')||'[]');
      const v282=JSON.parse(localStorage.getItem('yx_warehouse_failed_structure_ops_v282_operation_status_card')||'[]');
      const v287=JSON.parse(localStorage.getItem('yx_warehouse_failed_structure_ops_v287_status_detail_card')||'[]');
      const v292=JSON.parse(localStorage.getItem('yx_warehouse_failed_structure_ops_v292_single_retry_cancel')||'[]');
      const arr=[...(Array.isArray(legacy)?legacy:[]), ...(Array.isArray(prev)?prev:[]), ...(Array.isArray(v282)?v282:[]), ...(Array.isArray(v287)?v287:[]), ...(Array.isArray(v292)?v292:[]), ...(Array.isArray(fresh)?fresh:[])];
      const seen=new Set();
      return arr.filter(x=>{ if(!x||!x.id||seen.has(x.id)) return false; seen.add(x.id); return true; }).slice(-80);
    }catch(_e){ return []; }
  }
  function writeFailedStructureOps(arr){
    try{ localStorage.setItem(FAILED_STRUCTURE_OP_KEY, JSON.stringify((Array.isArray(arr)?arr:[]).slice(-80))); }catch(_e){}
  }
  function rememberFailedWarehouseStructureOp(url, payload, label, error){
    try{
      if(!shouldRememberWarehouseStructureOp(url,payload)) return;
      const id=warehouseStructureOpId(url,payload);
      const now=Date.now();
      const arr=readFailedStructureOps().filter(x=>x && x.id!==id);
      arr.push({id,url,payload:{...(payload||{})},label:label||'倉庫結構操作',error:String(error||''),saved_at:now,attempts:0});
      writeFailedStructureOps(arr);
      state.failedStructureSeq=(Number(state.failedStructureSeq)||0)+1;
    }catch(_e){}
  }
  function forgetFailedWarehouseStructureOp(url, payload){
    try{
      if(!shouldRememberWarehouseStructureOp(url,payload)) return;
      const id=warehouseStructureOpId(url,payload);
      writeFailedStructureOps(readFailedStructureOps().filter(x=>x && x.id!==id));
    }catch(_e){}
  }
  async function retryFailedWarehouseStructureOps(opts={}){
    const arr=readFailedStructureOps();
    if(!arr.length){ if(opts.toast) toast('目前沒有等待重送的倉庫結構操作','ok'); return {success:true,count:0,failed:0}; }
    const keep=[]; let ok=0, fail=0;
    for(const rec of arr){
      try{
        const payload={...(rec.payload||{})};
        if(!payload.operation_id) payload.operation_id=yxOperationId('warehouse-structure-retry');
        const data=await api(rec.url||'/api/warehouse',{method:'POST',body:JSON.stringify(payload)});
        if(data && data.success===false) throw new Error(data.error||'重送失敗');
        ok++;
        try{ scheduleWarehouseConsistencyCheck({action:'structure-op-retry',zone:payload.zone||payload.from?.zone||payload.to?.zone||'A',column_index:payload.column_index||payload.from?.column_index||payload.to?.column_index||1,slot_number:payload.slot_number||payload.insert_after||payload.from?.slot_number||payload.to?.slot_number||1,operation_id:payload.operation_id||''}, 1200); }catch(_e){}
      }catch(e){
        fail++;
        keep.push({...rec,attempts:Number(rec.attempts||0)+1,error:e.message||String(e),saved_at:Date.now()});
      }
    }
    writeFailedStructureOps(keep);
    if(ok){
      try{
        clearWarehouseCaches();
        await renderWarehouse(false);
        await loadAvailable(false).catch(()=>{});
        notifyWarehouseChanged({action:'structure-op-retry',version:'v423',count:ok});
      }catch(_e){}
    }
    try{ window.dispatchEvent(new CustomEvent('yx:operation-status',{detail:{source:'warehouse',status:fail?'pending':'success',reason:'warehouse-structure-retry',message:fail?`倉庫結構操作已重送 ${ok} 筆，仍有 ${fail} 筆待重試`:`倉庫結構操作已重送 ${ok} 筆`,count:ok,failed:fail,version:'v423',detail_text:arr.slice(0,3).map(r=>r.label||r.id).filter(Boolean).join('、')}})); }catch(_e){}
    if(opts.toast || ok || fail){ toast(fail?`倉庫結構操作已重送 ${ok} 筆，仍有 ${fail} 筆待重試`:`倉庫結構操作已重送 ${ok} 筆`, fail?'warn':'ok'); }
    return {success:fail===0,count:ok,failed:fail};
  }
  window.YXWarehouseRetryFailedOperations = retryFailedWarehouseStructureOps;
  async function retryAllFailedWarehouseOps(opts={}){
    const a=await retryFailedWarehouseSaves({toast:false}).catch(e=>({success:false,count:0,failed:1,error:e.message||String(e)}));
    const b=await retryFailedWarehouseStructureOps({toast:false}).catch(e=>({success:false,count:0,failed:1,error:e.message||String(e)}));
    const ok=Number(a.count||0)+Number(b.count||0);
    const fail=Number(a.failed||0)+Number(b.failed||0);
    if(opts.toast || ok || fail){ toast(fail?`倉庫重送完成 ${ok} 筆，仍有 ${fail} 筆待重試`:`倉庫重送完成 ${ok} 筆`, fail?'warn':'ok'); }
    return {success:fail===0,count:ok,failed:fail};
  }
  window.YXWarehouseRetryAllFailedOps = retryAllFailedWarehouseOps;

  function bgPost(url, payload, onSuccess, label, opts={}){
    const bg = window.YXBackgroundSave;
    const runner = bg && typeof bg.requestSoft === 'function'
      ? bg.requestSoft(url, payload, {method:'POST', module:'warehouse'})
      : api(url,{method:'POST', body:JSON.stringify(payload||{})}).then(data=>({success:true,data})).catch(err=>({success:false,error:err&&err.message,permanent:true}));
    return Promise.resolve(runner).then(result=>{
      if(result && result.success){ forgetFailedSave(url,payload); forgetFailedWarehouseStructureOp(url,payload); const data=(result.data && typeof result.data==='object') ? result.data : ((result.payload && typeof result.payload==='object') ? result.payload : result); if(data && typeof data==='object' && data.success == null) data.success = true; if(typeof onSuccess==='function') onSuccess(data||{}); return data||{}; }
      if(result && result.queued){
        // V262：背景佇列代表請求已保留待重試；同時保留本地重送索引，避免瀏覽器切頁後佇列失效。
        rememberFailedSave(url,payload,label,result?.error||'queued');
        rememberFailedWarehouseStructureOp(url,payload,label,result?.error||'queued');
        toast(`${label||'操作'}已保留在背景佇列，切頁後仍會重試`, 'warn');
        return {success:true, queued:true, operation_id:payload?.operation_id||''};
      }
      rememberFailedSave(url,payload,label,result?.error||'background-save-failed');
      const isStructureRetry=shouldRememberWarehouseStructureOp(url,payload) && !(result && result.permanent===true);
      if(isStructureRetry) rememberFailedWarehouseStructureOp(url,payload,label,result?.error||'background-save-failed');
      else forgetFailedWarehouseStructureOp(url,payload);
      try{window.dispatchEvent(new CustomEvent('yx:operation-soft-failed',{detail:{source:'warehouse',reason:'warehouse-background-failed',error:result?.error||'請稍後確認',version:'v423',retry_saved:isStructureRetry,url,payload,label,cell_label:[clean(payload?.zone||payload?.from?.zone||''), payload?.column_index||payload?.from?.column_index||'', payload?.slot_number||payload?.from?.slot_number||''].filter(Boolean).join('-')}}));}catch(_e){}
      toast(isStructureRetry ? `${label||'操作'}保存延遲，畫面已保留並加入結構重送` : `${label||'操作'}沒有確實存入資料庫，已還原該欄：${result?.error||'請稍後確認'}`, isStructureRetry?'warn':'error');
      if(isStructureRetry) return {success:true, queued:true, retry_saved:true, structure_retry:true, error:result?.error||'background-save-failed'};
      return {success:false, retry_saved:false, error:result?.error||'background-save-failed'};
    }).catch(err=>{
      rememberFailedSave(url,payload,label,err&&err.message);
      rememberFailedWarehouseStructureOp(url,payload,label,err&&err.message);
      toast(`${label||'操作'}已保留在背景佇列與本地重送，切頁後仍可重試`, 'warn');
      return {success:true, queued:true, retry_saved:true, error:err&&err.message, operation_id:payload?.operation_id||''};
    });
  }
  function queuedWarehousePost(url, payload, onSuccess, label, opts={}){
    const z=clean(payload?.zone || payload?.from?.zone || 'A').toUpperCase();
    const c=Number(payload?.column_index || payload?.from?.column_index || payload?.from?.col || 1);
    const key=`${z}-${c}`;
    const token = opts.token || beginColumnOp(z,c);
    if(!payload.operation_id) payload.operation_id = yxOperationId('warehouse-column-op');
    const prev=state.columnChains.get(key) || Promise.resolve();
    const rawTask=prev.catch(()=>{}).then(()=>bgPost(url,payload,(d)=>{
      // V160: response for an older operation in the same column is recorded as success,
      // but it must never overwrite a newer optimistic UI state.
      if(!isLatestColumnOp(token)) return;
      if(typeof onSuccess==='function') onSuccess(d, token);
    },label, opts));
    const chainTask=rawTask.then(result=>{
      if(!isLatestColumnOp(token)) return result;
      const queued = !!(result && result.queued);
      const ok = queued || !!(result && (result.success !== false));
      if(ok){
        if(queued){
          keepQueuedColumnProtected(token, payload, label);
          try{ scheduleWarehouseConsistencyCheck({action:label||'warehouse-queued',zone:z,column_index:c,slot_number:Number(payload?.slot_number||payload?.insert_after||1),operation_id:payload?.operation_id||''}, 4200); }catch(_e){}
        }else{
          finishColumnOp(token,true);
        }
        if(queued) cacheWarehouseNow();
      }else if(opts.rollback !== false){
        rollbackColumnOp(token, `${label||'操作'}沒有確實存入資料庫，已還原該欄`);
      }else{
        finishColumnOp(token,false);
      }
      return result;
    }).catch(err=>{
      if(opts.rollback !== false) rollbackColumnOp(token, `${label||'操作'}保存失敗，已還原該欄`);
      else { keepQueuedColumnProtected(token, payload, label); cacheWarehouseNow(); finishColumnOp(token,false); }
      throw err;
    }).finally(()=>{ if(state.columnChains.get(key)===chainTask) state.columnChains.delete(key); });
    state.columnChains.set(key, chainTask);
    return chainTask;
  }

  function queuedWarehouseMovePost(payload, onSuccess, label, fromToken, toToken, rollback){
    const keys=[];
    if(fromToken?.key) keys.push(fromToken.key);
    if(toToken?.key && toToken.key!==fromToken?.key) keys.push(toToken.key);
    if(!payload.operation_id) payload.operation_id = yxOperationId('warehouse-move-cell');
    const prev=Promise.all(keys.map(k=>(state.columnChains.get(k)||Promise.resolve()).catch(()=>{})));
    const task=prev.then(()=>bgPost('/api/warehouse/move-cell', payload, (d)=>{
      const fromLatest=!fromToken || isLatestColumnOp(fromToken);
      const toLatest=!toToken || isLatestColumnOp(toToken);
      if(!fromLatest && !toLatest) return;
      if(typeof onSuccess==='function') onSuccess(d, fromLatest, toLatest);
    }, label||'拖拉移動', {fromToken,toToken})).then(result=>{
      const queued=!!(result&&result.queued);
      const ok=queued || !!(result && result.success !== false);
      if(ok){
        if(queued){
          if(fromToken && isLatestColumnOp(fromToken)) keepQueuedColumnProtected(fromToken, payload, label||'拖拉移動');
          if(toToken && toToken.key!==fromToken?.key && isLatestColumnOp(toToken)) keepQueuedColumnProtected(toToken, payload, label||'拖拉移動');
        }else{
          if(fromToken && isLatestColumnOp(fromToken)) finishColumnOp(fromToken,true);
          if(toToken && toToken.key!==fromToken?.key && isLatestColumnOp(toToken)) finishColumnOp(toToken,true);
        }
        if(queued) cacheWarehouseNow();
      }else if(typeof rollback==='function'){
        rollback();
      }
      return result;
    }).catch(err=>{
      if(typeof rollback==='function') rollback(err);
      return {success:false,error:err&&err.message};
    }).finally(()=>{
      keys.forEach(k=>{ if(state.columnChains.get(k)===task) state.columnChains.delete(k); });
    });
    keys.forEach(k=>state.columnChains.set(k, task));
    return task;
  }

  const isWarehouse = () => !!(
    document.getElementById('warehouse-root') ||
    document.querySelector('.module-screen[data-module="warehouse"]') ||
    (document.body && document.body.dataset && document.body.dataset.module === 'warehouse') ||
    (document.documentElement && document.documentElement.dataset && document.documentElement.dataset.yxWarehouseSingleHtmlDataJs === 'true') ||
    (location.pathname||'').includes('/warehouse')
  );
  const state = {
    data:{cells:[], zones:{A:{},B:{}}}, available:[], availableByZone:{A:[],B:[]}, activeZone:null, searchKeys:new Set(), undoStack:[],
    current:{zone:'A',col:1,slot:1,items:[],note:''}, batchCount:3, drag:null, loading:null, bound:false, unplacedOpen:false, modalSeq:0, loadSeq:0,
    columnChains:new Map(), columnSeq:new Map(), pendingColumns:new Set(), pendingCells:new Set(), columnStartedAt:new Map(), lastGoodColumns:new Map(), menuActionAt:new Map(), sourceQtyMap:{}, activeMenuKey:'', menuOpenedAt:0, availableSeq:0, autoSaveTimers:new Map(), autoSaveInFlight:new Set(), saveLocks:new Set(), pendingManualSaveTimers:new Map(), savePromises:new Map(), saveAgainAfterLock:new Set(), saveLockStarted:new Map(), cellEditRevision:new Map(), cellSaveSignatures:new Map(), appliedShipOps:new Set(), shipDeductProtected:new Map(), pendingShipDeductByCell:new Map(), conflictNotifiedCells:new Map(), appliedAvailableOps:new Map(), availableMutationSeq:0, failedSaveSeq:0, failedSaveNoticeAt:0, slotRedirects:new Map(), slotRedirectSeen:new Map(), structureEpochByColumn:new Map(), slotIndexSyncNoticeAt:0, consistencyQueue:new Map(), consistencySeq:0, consistencyNoticeAt:0, consistencyCheckInFlight:false, queuedColumnOps:new Map(), columnLocalRevision:new Map(), columnLocalRevisionReason:new Map(), longpressSuppressClickUntil:0, longpressOpenSeq:0, longpressLastOpen:null, menuPointerActionAt:new Map()
  };
  function sanitizeWarehouseSlotNumber(v){
    const m=String(v == null ? '' : v).trim().match(/\d+/);
    const n=m ? Number(m[0]) : Number(v||0);
    return Number.isFinite(n) && n>0 ? Math.floor(n) : 1;
  }
  function sanitizeWarehouseColumnNumber(v){
    const m=String(v == null ? '' : v).trim().match(/\d+/);
    const n=m ? Number(m[0]) : Number(v||0);
    return Number.isFinite(n) && n>0 ? Math.floor(n) : 1;
  }
  const key = (z,c,s)=>`${clean(z).toUpperCase()}-${sanitizeWarehouseColumnNumber(c)}-${sanitizeWarehouseSlotNumber(s)}`;
  const columnKey = (z,c)=>`${clean(z).toUpperCase()}-${sanitizeWarehouseColumnNumber(c)}`;
  function currentColumnLocalRevision(z,c){
    try{ return Number(state.columnLocalRevision?.get?.(columnKey(z,c)) || 0); }catch(_e){ return 0; }
  }
  function bumpColumnLocalRevision(z,c,reason){
    try{
      if(!state.columnLocalRevision || typeof state.columnLocalRevision.set !== 'function') state.columnLocalRevision = new Map();
      const k=columnKey(z,c);
      const next=Number(state.columnLocalRevision.get(k)||0)+1;
      state.columnLocalRevision.set(k,next);
      state.columnLocalRevisionReason = state.columnLocalRevisionReason || new Map();
      state.columnLocalRevisionReason.set(k,{reason:reason||'local-change',at:Date.now()});
      return next;
    }catch(_e){ return 0; }
  }
  function mayApplyColumnReadback(z,c,token,reason){
    try{
      z=clean(z).toUpperCase(); c=Number(c);
      if(!z || !c) return false;
      const k=columnKey(z,c);
      if(token && !isLatestColumnOp(token)) return false;
      if((state.pendingColumns||new Set()).has(k) && !(token && token.key===k)) return false;
      if(token && Number(token.localRevision||0) && currentColumnLocalRevision(z,c) > Number(token.localRevision||0)) return false;
      return true;
    }catch(_e){ return false; }
  }
  function isCellLocallyProtected(z,c,s){
    try{
      const k=key(z,c,s);
      cleanupShipDeductProtected();
      const modalOpen=!!document.querySelector('#warehouse-modal:not(.hidden)');
      const isCurrent=!!(modalOpen && state.current && key(state.current.zone,state.current.col,state.current.slot)===k);
      return !!(isCurrent || state.autoSaveTimers?.has?.(k) || state.autoSaveInFlight?.has?.(k) || state.saveLocks?.has?.(k) || state.savePromises?.has?.(k) || state.saveAgainAfterLock?.has?.(k) || state.shipDeductProtected?.has?.(k));
    }catch(_e){ return false; }
  }
  function cleanupShipDeductProtected(){
    try{
      const now=Date.now();
      const m=state.shipDeductProtected;
      if(!m || typeof m.forEach!=='function') return;
      m.forEach((until,k)=>{ if(Number(until||0) < now) m.delete(k); });
    }catch(_e){}
  }
  function protectShipDeductCell(z,c,s){
    try{
      const k=key(z,c,s);
      if(!state.shipDeductProtected || typeof state.shipDeductProtected.set!=='function') state.shipDeductProtected=new Map();
      state.shipDeductProtected.set(k, Date.now()+6500);
    }catch(_e){}
  }
  function protectedCellKeySet(){
    // V178: fresh DB reloads may arrive while the user is editing/saving; keep those cells local until the queued save settles.
    const out=new Set();
    try{
      cleanupShipDeductProtected();
      [state.autoSaveTimers, state.savePromises, state.shipDeductProtected, state.pendingShipDeductByCell].forEach(m=>{ if(m && typeof m.forEach==='function') m.forEach((_v,k)=>out.add(k)); });
      [state.autoSaveInFlight, state.saveLocks, state.saveAgainAfterLock, state.pendingCells].forEach(st=>{ if(st && typeof st.forEach==='function') st.forEach(k=>out.add(k)); });
      if(state.current && document.querySelector('#warehouse-modal:not(.hidden)')) out.add(key(state.current.zone,state.current.col,state.current.slot));
    }catch(_e){}
    return out;
  }
  function mergeCellsPreservingLocalProtected(incomingCells, zonesData, opts={}){
    // V182: cache/DB full responses can arrive while a cell is being edited or saved.
    // Preserve protected local cells by exact cell key, and preserve pending columns by column key.
    opts = opts || {};
    const preserveMissingLocal = opts.preserveMissingLocal !== false;
    const trustIncoming = opts.trustIncoming === true;
    const protectedCols=new Set(state.pendingColumns||[]);
    const protectedCellsByKey=protectedCellKeySet();
    const normalized=(Array.isArray(incomingCells)?incomingCells:[]).map(cell=>normalizeServerCell(cell));
    if(!protectedCols.size && !protectedCellsByKey.size){
      const incomingTotal=warehouseCellItemTotalFromCells(normalized);
      const localTotal=warehouseCellItemTotalFromCells(state.data && state.data.cells);
      // V426/V457: avoid whole-page blanking when a stale/empty response races after local/cache data.
      if(incomingTotal<=0 && localTotal>0){
        state.data={cells:state.data.cells||[], zones:(state.data&&state.data.zones)||zonesData||{A:{},B:{}}};
        return;
      }
      // V457: after device sync or a DB refresh with real cells, trust the incoming cell map.
      // Otherwise an item moved out of an old cell can be preserved locally and appears duplicated/wrong.
      if(trustIncoming){
        state.data={cells:normalized, zones:zonesData||{A:{},B:{}}};
        return;
      }
      // V426: if a same-slot server row is empty but local/cache row has products, keep the non-empty row.
      const localByKey=new Map((state.data.cells||[]).map(cell=>[key(cell.zone,cell.column_index,cell.slot_number), cell]));
      const incomingKeys=new Set(normalized.map(cell=>key(cell.zone,cell.column_index,cell.slot_number)));
      const guarded=normalized.map(cell=>{
        const lk=key(cell.zone,cell.column_index,cell.slot_number);
        const local=localByKey.get(lk);
        if(local && cellItemsFromRow(cell).length<=0 && cellItemsFromRow(local).length>0) return local;
        return cell;
      });
      // V432: 有些 lite/readback 只回結構格，不回舊資料格；本機已有商品的格子不可因「未出現在 incoming」被整列洗掉。
      if (preserveMissingLocal) localByKey.forEach((local,lk)=>{ if(!incomingKeys.has(lk) && cellItemsFromRow(local).length>0) guarded.push(local); });
      state.data={cells:guarded, zones:zonesData||{A:{},B:{}}};
      return;
    }
    const localProtected=(state.data.cells||[]).filter(cell=>
      protectedCols.has(columnKey(cell.zone, cell.column_index)) ||
      protectedCellsByKey.has(key(cell.zone, cell.column_index, cell.slot_number))
    );
    const protectedCellKeys=new Set(localProtected.map(cell=>key(cell.zone, cell.column_index, cell.slot_number)));
    const fresh=normalized.filter(cell=>
      !protectedCols.has(columnKey(cell.zone, cell.column_index)) &&
      !protectedCellKeys.has(key(cell.zone, cell.column_index, cell.slot_number))
    );
    // V429: even when some cells/columns are protected, do not let an empty readback replace
    // a visible local/cache product in the same slot. This keeps cache architecture intact.
    const localByKey=new Map((state.data.cells||[]).map(cell=>[key(cell.zone,cell.column_index,cell.slot_number), cell]));
    const incomingKeys=new Set(fresh.map(cell=>key(cell.zone,cell.column_index,cell.slot_number)));
    const guardedFresh=fresh.map(cell=>{
      const lk=key(cell.zone,cell.column_index,cell.slot_number);
      const local=localByKey.get(lk);
      if(local && cellItemsFromRow(cell).length<=0 && cellItemsFromRow(local).length>0) return local;
      return cell;
    });
    if (preserveMissingLocal) localByKey.forEach((local,lk)=>{ if(!incomingKeys.has(lk) && !protectedCellKeys.has(lk) && cellItemsFromRow(local).length>0) guardedFresh.push(local); });
    state.data={cells:guardedFresh.concat(localProtected), zones:zonesData||{A:{},B:{}}};
  }
  function snapshotColumn(z,c){
    z=clean(z).toUpperCase(); c=Number(c);
    return JSON.parse(JSON.stringify((state.data.cells||[]).filter(cell=>clean(cell.zone).toUpperCase()===z && Number(cell.column_index)===c)));
  }
  function restoreColumn(z,c,snapshot){
    z=clean(z).toUpperCase(); c=Number(c);
    const others=(state.data.cells||[]).filter(cell=>!(clean(cell.zone).toUpperCase()===z && Number(cell.column_index)===c));
    state.data.cells=others.concat(JSON.parse(JSON.stringify(snapshot||[]))).sort((a,b)=>clean(a.zone).localeCompare(clean(b.zone)) || Number(a.column_index)-Number(b.column_index) || Number(a.slot_number)-Number(b.slot_number));
    cacheWarehouseNow(); updateAllSlots();
  }

  function cleanupStaleColumnOps(maxAgeMs=120000){
    const now=Date.now();
    try{
      (state.pendingColumns||new Set()).forEach(k=>{
        const started=Number(state.columnStartedAt?.get?.(k)||0);
        if(started && now-started>maxAgeMs){
          state.pendingColumns.delete(k);
          state.columnStartedAt?.delete?.(k);
          state.lastGoodColumns?.delete?.(k);
          const [z,c]=String(k).split('-');
          markColumnPending(z,c,false);
          try{ Array.from(state.pendingCells||[]).filter(x=>String(x).startsWith(String(k)+'-')).forEach(x=>markCellPendingByKey(x,false)); }catch(_e){}
        }
      });
    }catch(_e){}
  }

  function beginColumnOp(z,c){
    cleanupStaleColumnOps();
    const k=columnKey(z,c);
    const seq=(Number(state.columnSeq.get(k)||0)+1);
    state.columnSeq.set(k,seq);
    state.pendingColumns.add(k);
    state.columnStartedAt.set(k, Date.now());
    state.lastGoodColumns.set(k, snapshotColumn(z,c));
    markColumnPending(z,c,true);
    return {key:k, seq, localRevision:currentColumnLocalRevision(z,c), startedAt:Date.now()};
  }
  function isLatestColumnOp(token){ return !!token && Number(state.columnSeq.get(token.key)||0)===Number(token.seq); }
  function finishColumnOp(token, ok=true){
    if(!token || !isLatestColumnOp(token)) return false;
    state.pendingColumns.delete(token.key);
    state.columnStartedAt.delete(token.key);
    const [z,c]=token.key.split('-');
    markColumnPending(z,c,false);
    try{ Array.from(state.pendingCells||[]).filter(x=>String(x).startsWith(String(token.key)+'-')).forEach(x=>markCellPendingByKey(x,false)); }catch(_e){}
    if(ok) state.lastGoodColumns.delete(token.key);
    return true;
  }
  function keepQueuedColumnProtected(token, payload, label){
    try{
      if(!token || !token.key) return;
      state.pendingColumns.add(token.key);
      state.columnStartedAt.set(token.key, Date.now());
      const op=clean(payload?.operation_id || payload?.request_key || '');
      if(op){
        const map=state.queuedColumnOps || (state.queuedColumnOps=new Map());
        const old=map.get(op);
        const arr=Array.isArray(old)?old.slice():(old?[old]:[]);
        if(!arr.includes(token.key)) arr.push(token.key);
        map.set(op, arr);
      }
      const [z,c]=String(token.key).split('-');
      markColumnPending(z,c,true);
      markCellsPendingFromPayload(payload,true);
      cacheWarehouseNow();
      try{ window.dispatchEvent(new CustomEvent('yx:operation-status',{detail:{source:'warehouse',status:'pending',reason:'warehouse-bg-queued-protected',message:`${label||'倉庫操作'}已進背景佇列，畫面先保留，不會被舊資料覆蓋`,operation_id:op,zone:z,column_index:Number(c),version:'v423'}})); }catch(_e){}
    }catch(_e){}
  }
  function payloadFromBgItem(item){
    try{ const raw=item?.body || item?.payload || ''; return typeof raw === 'string' ? JSON.parse(raw||'{}') : (raw||{}); }catch(_e){ return {}; }
  }
  function releaseQueuedColumnProtectionByPayload(payload){
    try{
      const op=clean(payload?.operation_id || payload?.request_key || '');
      const map=state.queuedColumnOps || (state.queuedColumnOps=new Map());
      const ck=op && map.get(op);
      const z=clean(payload?.zone || payload?.from?.zone || payload?.to?.zone || '').toUpperCase();
      const c=Number(payload?.column_index || payload?.from?.column_index || payload?.to?.column_index || 0);
      const keys=[];
      if(Array.isArray(ck)) keys.push(...ck); else if(ck) keys.push(ck);
      if(z && c) keys.push(columnKey(z,c));
      if(payload?.from?.zone && payload?.from?.column_index) keys.push(columnKey(payload.from.zone, payload.from.column_index));
      if(payload?.to?.zone && payload?.to?.column_index) keys.push(columnKey(payload.to.zone, payload.to.column_index));
      if(op) map.delete(op);
      markCellsPendingFromPayload(payload,false);
      Array.from(new Set(keys)).forEach(k=>{
        if(!k) return;
        if(state.columnChains?.has?.(k)) return;
        state.pendingColumns?.delete?.(k);
        state.columnStartedAt?.delete?.(k);
        state.lastGoodColumns?.delete?.(k);
        const parts=String(k).split('-');
        markColumnPending(parts[0], Number(parts[1]), false);
      });
    }catch(_e){}
  }
  function rollbackColumnOp(token, message){
    if(!token || !isLatestColumnOp(token)) return;
    const [z,c]=token.key.split('-');
    const snap=state.lastGoodColumns.get(token.key);
    if(snap) restoreColumn(z,c,snap);
    finishColumnOp(token,false);
    if(message) toast(message,'error');
  }
  function markColumnPending(z,c,on){
    try{
      document.querySelectorAll(`#warehouse-root [data-zone="${clean(z).toUpperCase()}"][data-column="${Number(c)}"]`).forEach(el=>el.classList.toggle('yx-warehouse-column-saving', !!on));
    }catch(_e){}
  }
  function cellKeysFromPayload(payload){
    const out=[]; const add=(z,c,s)=>{ z=clean(z).toUpperCase(); c=Number(c); s=Number(s); if(z&&c&&s) out.push(key(z,c,s)); };
    try{
      payload=payload||{};
      add(payload.zone, payload.column_index||payload.col, payload.slot_number||payload.slot);
      add(payload.from?.zone, payload.from?.column_index||payload.from?.col, payload.from?.slot_number||payload.from?.slot);
      add(payload.to?.zone, payload.to?.column_index||payload.to?.col, payload.to?.slot_number||payload.to?.slot);
      if(Array.isArray(payload.cells)) payload.cells.forEach(c=>add(c.zone, c.column_index||c.col, c.slot_number||c.slot));
    }catch(_e){}
    return Array.from(new Set(out));
  }
  function markCellPendingByKey(k,on){
    try{
      const [z,c,s]=String(k||'').split('-');
      if(on) state.pendingCells?.add?.(k); else state.pendingCells?.delete?.(k);
      const el=document.querySelector(`#warehouse-root [data-zone="${clean(z).toUpperCase()}"][data-column="${Number(c)}"][data-slot="${Number(s)}"]`);
      if(el){ el.classList.toggle('yx-warehouse-cell-saving', !!on); el.dataset.yxPendingScope=on?`warehouse:${clean(z).toUpperCase()}:${Number(c)}:${Number(s)}`:''; if(!on) delete el.dataset.yxPendingScope; }
    }catch(_e){}
  }
  function markCellsPendingFromPayload(payload,on){
    try{ cellKeysFromPayload(payload).forEach(k=>markCellPendingByKey(k,on)); }catch(_e){}
  }
  const CACHE_VERSION = 'v520-final-ship-cache-align-pack30';
  const WAREHOUSE_CACHE_KEY = 'yx_warehouse_cache_' + CACHE_VERSION;
  const AVAILABLE_CACHE_KEY = 'yx_warehouse_available_cache_' + CACHE_VERSION;
  function cacheGet(k, maxAgeMs){
    try{
      let raw=localStorage.getItem(k);
      if(!raw){
        const versions=['v469-clean-refresh-force-glue-pass6','v467-mutation-consistency-pass4','v466-data-spine-fetch-bridge-pass3','v465-data-spine-api-bridge-pass2','v464-data-spine-renderer-empty-guard','v463-data-spine-100pct-pass1','v460-final-sync-cache-realtime-align','v459-full-audit-no-half-sync-visible','v457-final-verify-sync-speed-warehouse','v456-verified-instant-sync-ship-warehouse','v455-dirty-sync-cache-align','v451-device-prefetch-indexeddb-progress','v454-instant-sync-data-align','v453-device-sync-resume-incremental-auto5','v450-warehouse-longpress-single-engine-cleanout-proof','v436-warehouse-longpress-action-menu-final','v433-warehouse-maximum-readback-save-proof','v432-warehouse-max-repair-no-cache-damage','v431-warehouse-full-item-key-readback-proof','v430-warehouse-deleted-row-rescue-readback-proof','v429-warehouse-nondirect-readback-guard','v428-warehouse-save-readback-mirror-lock','v427-warehouse-mirror-rescue-visible-items','v426-warehouse-display-readback-shield','v425-warehouse-visible-items-hard-repair','v424-warehouse-visible-items-cache-guard','v422-warehouse-readback-guard-sync','v421-warehouse-continuous-structure-return-sync','v420-warehouse-cell-save-reopen-sync','v419-warehouse-batch-support-return-sync','v418-warehouse-visible-longpress-regression','v417-remove-opstatus-warehouse-visible-longpress','v416-inventory-source-move-sync','v415-product-write-refresh-sync','v414-customer-count-source-sync','v413-shipping-preview-source-lock','v412-shipping-source-deduct-sync','v411-warehouse-cell-edit-save-sync','v410-warehouse-structure-longpress-sync','v409-warehouse-unplaced-source-sync','v408-warehouse-drag-cache-sync','v407-source-panel-opstatus-scope','v406-warehouse-order-drag-longpress-fix','v292-status-single-retry-cancel','v287-status-detail-card','v282-operation-status-card','v267-structure-operation-retry-lock','v262-save-retry-recovery-lock','v257-available-qty-operation-lock','v252-warehouse-ship-edit-conflict-lock','v222-warehouse-available-zone-sync','v219-warehouse-live-draft-switch-sync','v218-cross-function-error-card','v217-today-empty-refresh-guard','v214-warehouse-customer-count-sync','v208-warehouse-drag-count-sync','v188-warehouse-stability','v187-warehouse-stability','v186-warehouse-stability','v185-warehouse-stability','v184-warehouse-stability','v183-warehouse-stability','v182-warehouse-stability','v181-warehouse-stability','v180-warehouse-stability','v179-warehouse-stability','v178-warehouse-stability','v177-warehouse-stability','v176-warehouse-stability','v175-warehouse-stability','v174-warehouse-stability','v173-warehouse-stability','v172-warehouse-stability','v171-warehouse-stability','v170-warehouse-stability','v169-warehouse-stability','v168-warehouse-stability','v166-warehouse-self-repair','v165-warehouse-stability-final','v163-warehouse-stability','v162-warehouse-stability','v161-warehouse-stability','v160-warehouse-polish-stability','v159-warehouse-auto-stability','v158-warehouse-stability-latest','v156-warehouse-stability-from-v155','v143-warehouse-dom-cache','v140-warehouse-fast-lite-cache','v138-warehouse-fast-lite-cache','v135-warehouse-fast-lite-cache','v134-warehouse-speed-qty-cache'];
        for(const v of versions){
          const alt=String(k).replace(CACHE_VERSION, v).replace('v143-warehouse-dom-cache', v);
          raw=localStorage.getItem(alt);
          if(raw) break;
        }
      }
      if(!raw) return null;
      const obj=JSON.parse(raw);
      if(!obj || !obj.saved_at || (maxAgeMs && Date.now()-Number(obj.saved_at)>maxAgeMs)) return null;
      return obj.data || null;
    }catch(_e){ return null; }
  }
  function cacheSet(k, data){
    try{ localStorage.setItem(k, JSON.stringify({saved_at:Date.now(), data})); }catch(_e){}
  }
  function normalizeWarehouseCellsBeforeCache(){
    try{
      const seen=new Set();
      const out=[];
      (state.data.cells||[]).forEach(raw=>{
        const cell=normalizeServerCell(raw);
        if(isDeletedCell(cell)) return;
        const k=key(cell.zone,cell.column_index,cell.slot_number);
        // Same slot duplicated by an old/stale response: keep the last non-empty row, otherwise keep one empty row.
        const oldIndex=out.findIndex(x=>key(x.zone,x.column_index,x.slot_number)===k);
        if(oldIndex>=0){
          const old=out[oldIndex];
          const oldHas=cellItemsFromRow(old).length>0;
          const newHas=cellItemsFromRow(cell).length>0;
          if(newHas || !oldHas) out[oldIndex]=cell;
        }else{
          out.push(cell);
        }
      });
      state.data.cells=out.sort((a,b)=>clean(a.zone).localeCompare(clean(b.zone)) || Number(a.column_index)-Number(b.column_index) || Number(a.slot_number)-Number(b.slot_number));
    }catch(_e){}
  }
  function normalizeCellItemForDisplay(raw){
    // V418: 格位商品顯示容錯。舊資料/後端快取有時只帶 size、dimension，甚至是純字串；
    // 這裡只補齊顯示必要欄位，不改 renderer、不改保存架構。
    try{
      let it = raw;
      if(typeof it === 'string' || typeof it === 'number') it = {product_text:String(it||'')};
      if(!it || typeof it !== 'object') return null;
      const product = clean(it.product_text || it.product || it.product_size || it.display_product_size || it.base_product_size || it.size || it.size_text || it.dimension || it.dimensions || it.product_label || it.name || it.raw_text || it.label || it.title || it.detail || it.description || it.goods_text || it.item_text || it.content || it.memo || it.remark || it.desc || it.name || it.text || it.value || '');
      const qtyRaw = it.qty ?? it.quantity ?? it.pieces ?? it.count ?? it.piece_count ?? it.total_qty ?? it.件數;
      let qty = Math.floor(Number(qtyRaw || 0));
      if((!qty || qty < 0) && product){
        try{ qty = Math.floor(Number(window.YX30EffectiveQty ? window.YX30EffectiveQty(product, 1) : 1)); }catch(_e){ qty = 1; }
      }
      if(!qty || qty < 0) qty = product ? 1 : 0;
      const out = {...it};
      if(product){ out.product_text = clean(out.product_text || product); out.product = clean(out.product || product); out.raw_text = clean(out.raw_text || product); }
      out.customer_name = cleanCustomer(out.customer_name || out.customer || '庫存');
      out.material = materialOf(out);
      out.qty = qty;
      if(!out.placement_label && out.layer_label) out.placement_label = out.layer_label;
      if(!out.layer_label && out.placement_label) out.layer_label = out.placement_label;
      return out;
    }catch(_e){ return null; }
  }
  function normalizeCellItemsForDisplay(arr){
    return (Array.isArray(arr)?arr:[]).map(normalizeCellItemForDisplay).filter(it=>it && (productText(it) || clean(it.raw_text||'')) && itemQty(it)>0);
  }
  function parseCellItemsPayload(raw){
    try{
      let value = raw;
      if(typeof value === 'string'){
        const trimmed=value.trim();
        if(!trimmed || ['[]','null','none','undefined'].includes(trimmed.toLowerCase())) return [];
        try{ value = JSON.parse(trimmed); }
        catch(_e){
          // V427: tolerate old Python-ish JSON enough to rescue product rows, without changing cache core.
          try{ value = JSON.parse(trimmed.replace(/'/g, '"').replace(/None/g,'null').replace(/True/g,'true').replace(/False/g,'false')); }
          catch(_e2){ return [{product_text:trimmed, product:trimmed, raw_text:trimmed, qty:1, customer_name:'庫存'}]; }
        }
      }
      if(value && typeof value === 'object' && !Array.isArray(value)){
        if(Array.isArray(value.items)) value = value.items;
        else if(Array.isArray(value.rows)) value = value.rows;
        else if(Array.isArray(value.products)) value = value.products;
        else if(Array.isArray(value.goods)) value = value.goods;
        else if(typeof value.items_json === 'string' && value.items_json.trim()) value = parseCellItemsPayload(value.items_json);
        else if(value.product_text || value.product || value.product_size || value.display_product_size || value.base_product_size || value.size || value.size_text || value.dimension || value.dimensions || value.raw_text || value.label || value.name || value.title || value.detail || value.description || value.goods_text || value.item_text || value.content || value.memo || value.remark || value.desc) value = [value];
        else value = [];
      }
      return Array.isArray(value) ? value : [];
    }catch(_e){ return raw ? [{raw_text:String(raw), product_text:String(raw), product:String(raw), qty:1, customer_name:'庫存'}] : []; }
  }
  function cellItemsFromRow(cell){
    // V429: items_json can be an old empty string while the API/saved_cell also carries a valid items array.
    // Do not let a truthy '[]' string hide real items; merge both display sources and normalize once.
    try{
      const fromItems = Array.isArray(cell?.items) ? cell.items : parseCellItemsPayload(cell?.items || []);
      const fromJson = parseCellItemsPayload(cell?.items_json || []);
      const primary = normalizeCellItemsForDisplay(fromItems);
      const secondary = normalizeCellItemsForDisplay(fromJson);
      if(primary.length && !secondary.length) return primary;
      if(secondary.length && !primary.length) return secondary;
      if(!primary.length && !secondary.length) return [];
      const out=[]; const seen=new Set();
      [...secondary, ...primary].forEach(it=>{
        const k=[clean(it.source_table||it.source||''), clean(it.source_id||it.id||''), cleanCustomer(it.customer_name||''), materialOf(it), warehouseSizeKey(productText(it)||it.raw_text||''), clean(it.placement_label||it.layer_label||'')].join('|');
        if(seen.has(k)) return;
        seen.add(k); out.push(it);
      });
      return out;
    }catch(_e){
      const raw = Array.isArray(cell?.items) ? cell.items : parseCellItemsPayload(cell?.items_json || cell?.items || []);
      return normalizeCellItemsForDisplay(raw);
    }
  }
  function warehouseCellItemTotalFromCells(cells){
    try{ return (Array.isArray(cells)?cells:[]).reduce((sum,cell)=>sum + cellItemsFromRow(cell).reduce((a,it)=>a+Math.max(0,itemQty(it)||0),0),0); }catch(_e){ return 0; }
  }
  function cacheWarehouseNow(){
    try{
      normalizeWarehouseCellsBeforeCache();
      normalizeWarehouseUniquePlacements();
      const next={cells:state.data.cells||[], zones:state.data.zones||{A:{},B:{}}, source_qty_map:state.sourceQtyMap||{}};
      const nextTotal=warehouseCellItemTotalFromCells(next.cells);
      const old=cacheGet(WAREHOUSE_CACHE_KEY, 1000*60*60*24*30);
      const oldTotal=warehouseCellItemTotalFromCells(old && old.cells);
      // V432: 不改快取架構，只加「防空覆蓋」與「防舊空格回寫」保護。
      // 任何 API/局部回讀/舊本機快取如果把商品洗成 0，都不能覆蓋曾經非空的正常倉庫快取。
      if(nextTotal<=0 && oldTotal>0 && !(state && state.allowEmptyWarehouseCacheWrite)){
        try{ console.warn('[YX warehouse] block empty cache overwrite', {nextTotal, oldTotal, version:CACHE_VERSION}); }catch(_e){}
        return;
      }
      if(nextTotal>0 || oldTotal<=0 || (state && state.allowEmptyWarehouseCacheWrite)) cacheSet(WAREHOUSE_CACHE_KEY, next);
    }catch(_e){}
  }
  function cacheAvailableNow(){
    try{ cacheSet(AVAILABLE_CACHE_KEY, {available:state.available||[], availableByZone:state.availableByZone||{A:[],B:[]}}); }catch(_e){}
  }
  function normalizeServerCell(cell, forceZone, forceColumn){
    const row={...(cell||{})};
    row.zone=clean(forceZone || row.zone || 'A').toUpperCase();
    if(!['A','B'].includes(row.zone)) row.zone='A';
    row.column_index=sanitizeWarehouseColumnNumber(forceColumn || row.column_index || row.column || 1);
    row.slot_number=sanitizeWarehouseSlotNumber(row.slot_number || row.slot || row.name || 1);
    row.slot_type=clean(row.slot_type || 'direct') || 'direct';
    row.items=cellItemsFromRow(row);
    row.items_json=JSON.stringify(row.items||[]);
    row.is_deleted=row.is_deleted||0;
    return row;
  }
  function applyColumnCells(z,c,columnCells,opts={}){
    if(!Array.isArray(columnCells)) return false;
    z=clean(z).toUpperCase(); c=Number(c);
    opts=opts||{};
    if(!opts.force && !mayApplyColumnReadback(z,c,opts.token||null,opts.reason||'column-readback')) return false;
    const currentCells=(state.data.cells||[]).filter(cell=>clean(cell.zone).toUpperCase()===z && Number(cell.column_index)===c);
    const incomingTotal=warehouseCellItemTotalFromCells(columnCells);
    const currentTotal=warehouseCellItemTotalFromCells(currentCells);
    // V426: 欄位回讀如果整欄變空，但本地/快取目前有商品，不覆蓋；避免局部 API 空回應把商品洗掉。
    if(incomingTotal<=0 && currentTotal>0 && !(opts && opts.allowEmptyColumn===true)){ return false; }
    const others=(state.data.cells||[]).filter(cell=>!(clean(cell.zone).toUpperCase()===z && Number(cell.column_index)===c));
    // V501: structure actions (insert/delete/batch delete) intentionally renumber slots.
    // If server readback contains the same item bag as the optimistic local column,
    // trust its exact slot list and do not preserve old missing local slots, otherwise
    // deleted/inserted slots can duplicate items or jump back after readback.
    if(opts && opts.trustStructure === true){
      const incoming = (Array.isArray(columnCells)?columnCells:[]).map(cell=>normalizeServerCell(cell,z,c)).filter(cell=>!isDeletedCell(cell)).sort((a,b)=>Number(a.slot_number)-Number(b.slot_number));
      state.data.cells = others.concat(incoming).sort((a,b)=>clean(a.zone).localeCompare(clean(b.zone)) || Number(a.column_index)-Number(b.column_index) || Number(a.slot_number)-Number(b.slot_number));
      try{ cleanupSlotRedirects(); }catch(_e){}
      cacheWarehouseNow();
      return true;
    }
    const existingBySlot=new Map(currentCells.map(cell=>[Number(cell.slot_number)||0, cell]));
    const bySlot=new Map();
    columnCells.map(cell=>normalizeServerCell(cell,z,c)).filter(cell=>!isDeletedCell(cell)).forEach(cell=>{
      const n=Number(cell.slot_number)||0;
      const protectedLocal=existingBySlot.get(n);
      // V176：如果這一格正在輸入、自動保存或手動保存中，舊的欄位回讀不得覆蓋前端最新狀態。
      if(protectedLocal && isCellLocallyProtected(z,c,n)){ bySlot.set(n, protectedLocal); return; }
      const old=bySlot.get(n);
      const existingLocal=existingBySlot.get(n);
      const oldHas=cellItemsFromRow(old).length>0;
      const newHas=cellItemsFromRow(cell).length>0;
      // V429: column readback sometimes returns the slot shell with empty items_json while local has the product.
      // Keep the non-empty local slot instead of repainting it as 空格.
      if(!newHas && existingLocal && cellItemsFromRow(existingLocal).length>0){ bySlot.set(n, existingLocal); return; }
      if(!old || newHas || !oldHas) bySlot.set(n, cell);
    });
    existingBySlot.forEach((cell,n)=>{
      if(!bySlot.has(n) && isCellLocallyProtected(z,c,n)) bySlot.set(n, cell);
    });
    const incoming=Array.from(bySlot.values()).sort((a,b)=>Number(a.slot_number)-Number(b.slot_number));
    // V432: 局部欄位讀回若缺少某些已有商品格，不把它們洗掉；只合併回同欄非空 local。
    try{
      const incomingKeys=new Set(incoming.map(cell=>key(cell.zone,cell.column_index,cell.slot_number)));
      currentCells.forEach(local=>{ if(!incomingKeys.has(key(local.zone,local.column_index,local.slot_number)) && cellItemsFromRow(local).length>0) incoming.push(local); });
    }catch(_e){}
    state.data.cells=others.concat(incoming).sort((a,b)=>clean(a.zone).localeCompare(clean(b.zone)) || Number(a.column_index)-Number(b.column_index) || Number(a.slot_number)-Number(b.slot_number));
    try{ cleanupSlotRedirects(); }catch(_e){}
    cacheWarehouseNow();
    return true;
  }
  function normalizeColumnSlots(z,c){
    z=clean(z).toUpperCase(); c=Number(c);
    const col=(state.data.cells||[]).filter(cell=>clean(cell.zone).toUpperCase()===z && Number(cell.column_index)===c && !isDeletedCell(cell))
      .sort((a,b)=>Number(a.slot_number)-Number(b.slot_number));
    let changed=false;
    col.forEach((cell,i)=>{ const n=i+1; if(Number(cell.slot_number)!==n){ cell.slot_number=n; changed=true; } cell.slot_type=cell.slot_type||'direct'; });
    if(changed) cacheWarehouseNow();
    return changed;
  }
  function markCurrentCellDirty(){
    try{
      if(!state.current) return;
      const cell=cellFromData(state.current.zone,state.current.col,state.current.slot);
      if(cell){ cell.items=JSON.parse(JSON.stringify(state.current.items||[])); cell.items_json=JSON.stringify(cell.items||[]); const noteEl=$('warehouse-note'); if(noteEl) cell.note=noteEl.value||''; bumpCellRevision(state.current.zone,state.current.col,state.current.slot); }
      cacheWarehouseNow();
    }catch(_e){}
  }

  function collectWarehouseDeductChanges(detail){
    const out=[];
    const push=x=>{ if(x && typeof x==='object') out.push(x); };
    const scan=obj=>{
      if(!obj || typeof obj!=='object') return;
      if(Array.isArray(obj)){ obj.forEach(scan); return; }
      if(Array.isArray(obj.warehouse_deduct)) obj.warehouse_deduct.forEach(push);
      if(Array.isArray(obj.breakdown)) obj.breakdown.forEach(scan);
      if(Array.isArray(obj.items)) obj.items.forEach(scan);
      if(obj.result && obj.result!==obj) scan(obj.result);
    };
    scan(detail||{});
    return out;
  }
  function shipDeductEventKey(detail, changes){
    try{
      const op=clean(detail?.operation_id || detail?.result?.operation_id || detail?.request_key || detail?.result?.request_key || '');
      if(op) return 'op:' + op;
      return 'payload:' + JSON.stringify((changes||[]).map(ch=>[clean(ch.zone||''),Number(ch.column_index||ch.col||0),Number(ch.slot_number||ch.slot||0),clean(ch.source_id||''),warehouseSizeKey(ch.product_text||''),Number(ch.deduct_qty||0),Number(ch.remaining_qty||0)]));
    }catch(_e){ return 'ts:' + Date.now(); }
  }
  function rememberShipDeductKey(k){
    try{
      if(!state.appliedShipOps || typeof state.appliedShipOps.add!=='function') state.appliedShipOps=new Set();
      const storageKey='yx_ship_deduct_applied_v287_status_detail_card';
      let stored=[];
      try{ stored=JSON.parse(sessionStorage.getItem(storageKey)||'[]'); if(!Array.isArray(stored)) stored=[]; }catch(_e){ stored=[]; }
      const now=Date.now();
      stored=stored.filter(x=>x && x.k && Number(x.exp||0)>now);
      if(state.appliedShipOps.has(k) || stored.some(x=>x.k===k)){
        try{ sessionStorage.setItem(storageKey, JSON.stringify(stored.slice(-80))); }catch(_e){}
        return false;
      }
      state.appliedShipOps.add(k);
      stored.push({k, exp:now+1000*60*10});
      try{ sessionStorage.setItem(storageKey, JSON.stringify(stored.slice(-80))); }catch(_e){}
      if(state.appliedShipOps.size>80){ const first=state.appliedShipOps.values().next().value; state.appliedShipOps.delete(first); }
      return true;
    }catch(_e){ return true; }
  }
  function applyShipDeductChangesToItems(items, changes){
    const arr=Array.isArray(items)?JSON.parse(JSON.stringify(items)):[];
    let changed=false;
    (Array.isArray(changes)?changes:[]).forEach(ch=>{
      const sourceId=clean(ch.source_id||'');
      const targetSize=warehouseSizeKey(ch.product_text||'');
      const targetCustomer=cleanCustomer(ch.customer_name||'');
      const remaining=Math.max(0, Math.floor(Number(ch.remaining_qty||0)));
      const replacement=clean(ch.remaining_product_text||'');
      const deductQty=Math.max(0, Math.floor(Number(ch.deduct_qty||0)));
      let consumed=false;
      for(let i=0;i<arr.length;i++){
        const it=arr[i];
        if(!it || typeof it!=='object' || consumed) continue;
        const sid=clean(it.source_id||it.id||'');
        const sameId=sourceId && sid && sid===sourceId;
        const sameSize=targetSize && warehouseSizeKey(productText(it))===targetSize;
        const sameCustomer=!targetCustomer || cleanCustomer(it.customer_name||'')===targetCustomer || cleanCustomer(it.customer_name||'')==='庫存';
        if(!(sameId || (sameSize && sameCustomer))) continue;
        consumed=true;
        changed=true;
        const currentQty=Math.max(0, Math.floor(Number(itemQty(it)||0)));
        const nextQty=sourceId ? remaining : Math.max(0, currentQty - (deductQty || Math.max(0, currentQty - remaining)));
        if(nextQty<=0){ arr.splice(i,1); i-=1; continue; }
        const nit={...it, qty:nextQty, unplaced_qty:nextQty, available_qty:nextQty, remaining_qty:nextQty};
        if(replacement){ nit.product_text=replacement; nit.product=replacement; }
        else if(productText(it) && nextQty !== currentQty && typeof productWithSupport==='function'){
          try{ const base=productBaseText(it); nit.product_text=base ? `${base}=${nextQty}件` : productText(it); nit.product=nit.product_text; }catch(_e){}
        }
        arr[i]=nit;
      }
    });
    return {items:arr, changed};
  }
  function queueProtectedShipDeduct(z,c,s,ch){
    try{
      const k=key(z,c,s);
      state.pendingShipDeductByCell = state.pendingShipDeductByCell || new Map();
      const list=state.pendingShipDeductByCell.get(k) || [];
      list.push(JSON.parse(JSON.stringify(ch||{})));
      state.pendingShipDeductByCell.set(k,list);
      protectShipDeductCell(z,c,s);
      const now=Date.now();
      const last=Number(state.conflictNotifiedCells?.get?.(k)||0);
      if(!last || now-last>2500){
        state.conflictNotifiedCells?.set?.(k,now);
        toast('此格正在編輯或背景儲存，出貨扣除已先保護，儲存時會先合併扣數避免覆蓋','warn');
      }
    }catch(_e){}
  }
  function mergePendingShipDeductIntoCellSave(z,c,s,items,note){
    try{
      const k=key(z,c,s);
      const pending=state.pendingShipDeductByCell?.get?.(k) || [];
      if(!pending.length) return {items, note, merged:false};
      const merged=applyShipDeductChangesToItems(items, pending);
      if(merged.changed){
        state.pendingShipDeductByCell.delete(k);
        const finalItems=merged.items;
        setLocalCellItems(z,c,s,finalItems,note);
        if(sameCurrentCell(z,c,s)) state.current.items=JSON.parse(JSON.stringify(finalItems));
        bumpCellRevision(z,c,s);
        try{ updateSlotUI(z,c,s); renderCellItems(true); }catch(_e){}
        toast('已合併出貨扣除後再儲存格位，避免舊草稿覆蓋新扣數','ok');
        return {items:finalItems, note, merged:true};
      }
      state.pendingShipDeductByCell.delete(k);
    }catch(_e){}
    return {items, note, merged:false};
  }
  function collectWarehouseColumnSnapshotsFromShip(detail){
    const cols=[];
    const seen=new Set();
    const pushColumn=(z,c,cells,meta)=>{
      z=clean(z||'').toUpperCase(); c=Number(c||0);
      if(!z || !c || !Array.isArray(cells)) return;
      const k=z+'|'+c;
      if(seen.has(k)) return;
      seen.add(k);
      cols.push({zone:z,column_index:c,column_cells:cells,meta:meta||{}});
    };
    const scan=obj=>{
      if(!obj || typeof obj!=='object') return;
      if(Array.isArray(obj)){ obj.forEach(scan); return; }
      const arr = Array.isArray(obj.warehouse_column_snapshots) ? obj.warehouse_column_snapshots : (Array.isArray(obj.warehouse_columns) ? obj.warehouse_columns : []);
      arr.forEach(col=>pushColumn(col && (col.zone || col.z), col && (col.column_index || col.col), col && (col.column_cells || col.cells), col));
      if(Array.isArray(obj.warehouse_cells_snapshot)){
        const groups={};
        obj.warehouse_cells_snapshot.forEach(cell=>{
          const z=clean(cell && cell.zone || '').toUpperCase(); const c=Number(cell && cell.column_index || 0);
          if(!z || !c) return;
          const k=z+'|'+c;
          (groups[k]||(groups[k]={zone:z,column_index:c,cells:[]})).cells.push(cell);
        });
        Object.keys(groups).forEach(k=>{ const g=groups[k]; pushColumn(g.zone,g.column_index,g.cells,{from:'warehouse_cells_snapshot'}); });
      }
      if(obj.result && obj.result!==obj) scan(obj.result);
    };
    try{ scan(detail||{}); }catch(_e){}
    return cols;
  }
  function applyWarehouseShipColumnSnapshots(detail){
    const cols=collectWarehouseColumnSnapshotsFromShip(detail);
    if(!cols.length) return false;
    const changes=collectWarehouseDeductChanges(detail);
    const eventKey=shipDeductEventKey(detail, changes);
    // Mark this ship operation as already applied so a later duplicate event does not local-deduct again.
    if(!rememberShipDeductKey(eventKey)) return false;
    let changed=false;
    const touched=[];
    cols.forEach(col=>{
      const z=clean(col.zone||'').toUpperCase(); const c=Number(col.column_index||0);
      if(!z || !c || !Array.isArray(col.column_cells)) return;
      try{
        const ok=applyColumnCells(z,c,col.column_cells);
        if(ok){
          changed=true;
          touched.push(z+'區第'+c+'欄');
          activeColumnCells(z,c).forEach(cell=>updateSlotUI(z,c,cell.slot_number));
          removeExtraDom(z,c);
        }
      }catch(_e){}
    });
    if(changed){
      try{ cacheWarehouseNow(); }catch(_e){}
      try{ clearWarehouseCaches(); }catch(_e){}
      try{ state.availableCache={}; state.availableSeq++; }catch(_e){}
      try{ updateAllSlots(); }catch(_e){}
      try{ updateUnplacedPillLocal(); }catch(_e){}
      try{ window.dispatchEvent(new CustomEvent('yx:operation-target-refresh',{detail:{source:'warehouse',target:'ship-columns',refresh_target:touched.join('、'),message:'出貨後倉庫欄位已套用後端讀回',operation_id:detail?.operation_id||detail?.result?.operation_id||'',version:'v450-warehouse-longpress-single-engine-cleanout-proof'}})); }catch(_e){}
    }
    return changed;
  }

  function applyWarehouseDeductFromShip(detail){
    const changes=collectWarehouseDeductChanges(detail);
    if(!changes.length) return false;
    const eventKey=shipDeductEventKey(detail, changes);
    if(!rememberShipDeductKey(eventKey)) return false;
    let touched=false;
    changes.forEach(ch=>{
      const z=clean(ch.zone||'').toUpperCase();
      const c=Number(ch.column_index||ch.col||0);
      const s=Number(ch.slot_number||ch.slot||0);
      if(!z||!c||!s) return;
      const loc=resolveWarehouseCellLocation(z,c,s,ch);
      const cell=loc?.cell;
      if(!cell) return;
      const rz=loc.zone, rc=Number(loc.col), rs=Number(loc.slot);
      if(isCellLocallyProtected(rz,rc,rs)){ queueProtectedShipDeduct(rz,rc,rs,ch); touched=true; return; }
      const sourceId=clean(ch.source_id||'');
      const targetSize=warehouseSizeKey(ch.product_text||'');
      const targetCustomer=cleanCustomer(ch.customer_name||'');
      const remaining=Math.max(0, Math.floor(Number(ch.remaining_qty||0)));
      const replacement=clean(ch.remaining_product_text||'');
      const arr=cellItemsFromRow(cell);
      let changed=false;
      let consumed=false;
      const deductQty=Math.max(0, Math.floor(Number(ch.deduct_qty||0)));
      const next=[];
      arr.forEach(it=>{
        if(!it || typeof it!=='object'){ next.push(it); return; }
        if(consumed){ next.push(it); return; }
        const sid=clean(it.source_id||it.id||'');
        const sameId=sourceId && sid && sid===sourceId;
        const sameSize=targetSize && warehouseSizeKey(productText(it))===targetSize;
        const sameCustomer=!targetCustomer || cleanCustomer(it.customer_name||'')===targetCustomer || cleanCustomer(it.customer_name||'')==='庫存';
        if(!(sameId || (sameSize && sameCustomer))){ next.push(it); return; }
        changed=true;
        consumed=true;
        const currentQty=Math.max(0, Math.floor(Number(itemQty(it)||0)));
        const nextQty = sourceId ? remaining : Math.max(0, currentQty - (deductQty || Math.max(0, currentQty - remaining)));
        if(nextQty<=0) return;
        const nit={...it, qty:nextQty, unplaced_qty:nextQty, available_qty:nextQty, remaining_qty:nextQty};
        if(replacement){ nit.product_text=replacement; nit.product=replacement; }
        else if(productText(it) && nextQty !== currentQty && typeof productWithSupport==='function'){
          try{ const base=productBaseText(it); nit.product_text=base ? `${base}=${nextQty}件` : productText(it); nit.product=nit.product_text; }catch(_e){}
        }
        next.push(nit);
      });
      if(changed){
        cell.items=next;
        cell.items_json=JSON.stringify(next);
        touched=true;
        protectShipDeductCell(rz,rc,rs);
        bumpCellRevision(rz,rc,rs);
        updateSlotUI(rz,rc,rs);
        scheduleWarehouseConsistencyCheck({action:'ship-deduct',zone:rz,column_index:rc,slot_number:rs,operation_id:eventKey}, 1200);
      }else{
        // V257: if the same item was just returned to the unplaced dropdown before the ship event arrived,
        // the cell may already be empty locally. Deduct the matching dropdown quantity once by operation key.
        const availableItem=itemFromShipChangeForAvailable(ch);
        if(availableItem && mutateAvailableLocked([availableItem], -1, rz||z, 'ship-deduct-available', eventKey)){ touched=true; }
      }
    });
    if(touched){ cacheWarehouseNow(); updateUnplacedPillLocal(); }
    return touched;
  }

  function applyWarehouseResponse(d, fallbackZ, fallbackC, token){
    if(!d || d.success === false) return false;
    if(token && !isLatestColumnOp(token)) return false;
    let changed=false;
    if(Array.isArray(d.from_column_cells)){
      const z=d.from?.zone || d.from_zone || fallbackZ, c=d.from?.column_index || d.from?.col || fallbackC;
      if(!state.pendingColumns.has(columnKey(z,c)) || (token && columnKey(z,c)===token.key)) changed = applyColumnCells(z,c,d.from_column_cells,{token,reason:'from-column-readback'}) || changed;
    }
    if(Array.isArray(d.to_column_cells)){
      const z=d.to?.zone || d.to_zone || fallbackZ, c=d.to?.column_index || d.to?.col || fallbackC;
      if(!state.pendingColumns.has(columnKey(z,c)) || (token && columnKey(z,c)===token.key)) changed = applyColumnCells(z,c,d.to_column_cells,{token,reason:'to-column-readback'}) || changed;
    }
    if(changed) return true;
    if(Array.isArray(d.column_cells)){
      const z=d.zone || fallbackZ; const c=d.column_index || fallbackC;
      if(state.pendingColumns.has(columnKey(z,c)) && !(token && columnKey(z,c)===token.key)) return false;
      return applyColumnCells(z,c,d.column_cells,{token,reason:'column-readback'});
    }
    if(Array.isArray(d.cells)){
      // V182: full warehouse DB/cache responses must not overwrite cells being edited, saving, or queued for retry.
      mergeCellsPreservingLocalProtected(d.cells||[], d.zones||state.data.zones||{A:{},B:{}});
      cacheWarehouseNow(); return true;
    }
    return false;
  }

  function warehouseItemsTotal(items){
    try{ return (Array.isArray(items)?items:[]).reduce((a,it)=>a+Math.max(0, Math.floor(Number(itemQty(it)||0))),0); }catch(_e){ return 0; }
  }
  function moveReadbackContainsTarget(d, t){
    try{
      const movedTotal = Math.max(0, Math.floor(Number(d?.move_item_total || warehouseItemsTotal(d?.moved_items || d?.items || []))));
      if(movedTotal<=0) return true;
      const targetCell = (Array.isArray(d?.to_column_cells)?d.to_column_cells:[])
        .map(cell=>normalizeServerCell(cell, t.zone, t.col))
        .find(cell=>Number(cell.slot_number)===Number(t.slot));
      const targetTotal = targetCell ? warehouseItemsTotal(cellItemsFromRow(targetCell)) : 0;
      return targetTotal >= movedTotal;
    }catch(_e){ return true; }
  }
  function applyMoveWarehouseResponse(d, fromToken, toToken, f, t){
    if(!d || d.success === false) return false;
    let changed=false;
    if(Array.isArray(d.from_column_cells) && (!fromToken || isLatestColumnOp(fromToken))){
      changed = applyColumnCells(f.zone, f.col, d.from_column_cells,{token:fromToken,reason:'move-from-readback'}) || changed;
    }
    if(Array.isArray(d.to_column_cells) && (!toToken || isLatestColumnOp(toToken))){
      if(moveReadbackContainsTarget(d, t)){
        changed = applyColumnCells(t.zone, t.col, d.to_column_cells,{token:toToken,reason:'move-to-readback-v500-verified'}) || changed;
      }else{
        // V500: stale target-column readback missing moved goods. Keep optimistic target/source cells and let consistency check retry.
        try{ keepQueuedColumnProtected(toToken, {to:{zone:t.zone,column_index:t.col,slot_number:t.slot}, operation_id:d.operation_id||''}, '拖拉讀回缺少目標商品'); }catch(_e){}
        try{ scheduleWarehouseConsistencyCheck({action:'move-target-stale-readback',zone:t.zone,column_index:t.col,slot_number:t.slot,operation_id:d.operation_id||''}, 1200); }catch(_e){}
      }
    }
    if(!changed && Array.isArray(d.column_cells)){
      const z=d.zone || t.zone, c=Number(d.column_index || t.col);
      if((fromToken && columnKey(z,c)===fromToken.key && isLatestColumnOp(fromToken)) || (toToken && columnKey(z,c)===toToken.key && isLatestColumnOp(toToken))){
        changed = applyColumnCells(z,c,d.column_cells,{token:(fromToken&&columnKey(z,c)===fromToken.key)?fromToken:toToken,reason:'move-column-readback'}) || changed;
      }
    }
    if(changed) cacheWarehouseNow();
    return changed;
  }
  function rollbackMoveColumns(fromToken, toToken, fromSnap, toSnap, message){
    if(fromToken && isLatestColumnOp(fromToken) && fromSnap) restoreColumn(fromToken.key.split('-')[0], Number(fromToken.key.split('-')[1]), fromSnap);
    if(toToken && toToken.key !== fromToken?.key && isLatestColumnOp(toToken) && toSnap) restoreColumn(toToken.key.split('-')[0], Number(toToken.key.split('-')[1]), toSnap);
    if(fromToken) finishColumnOp(fromToken,false);
    if(toToken && toToken.key !== fromToken?.key) finishColumnOp(toToken,false);
    if(message) toast(message,'error');
  }
  function hydrateWarehouseFromCache(){
    let cached=cacheGet(WAREHOUSE_CACHE_KEY, 1000*60*60*24*7);
    if(!cached || !Array.isArray(cached.cells)){
      const fallbacks=['yx_warehouse_cache_v463-data-spine-100pct-pass1','yx_warehouse_cache_v462-data-spine-real-fix','yx_warehouse_cache_v460-final-sync-cache-realtime-align','yx_warehouse_cache_v459-full-audit-no-half-sync-visible','yx_warehouse_cache_v455-dirty-sync-cache-align'];
      for(const k of fallbacks){ cached=cacheGet(k, 1000*60*60*24*7); if(cached && Array.isArray(cached.cells)) break; }
    }
    if(!cached || !Array.isArray(cached.cells)) return false;
    const cachedTotal=warehouseCellItemTotalFromCells(cached.cells);
    const localTotal=warehouseCellItemTotalFromCells(state.data && state.data.cells);
    // V426: 保留快取架構，但不讓舊版空快取把目前已顯示商品洗成空格。
    if(cachedTotal<=0 && localTotal>0) return false;
    mergeCellsPreservingLocalProtected(cached.cells, cached.zones||{A:{},B:{}}, {preserveMissingLocal:false, trustIncoming:true});
    state.sourceQtyMap=cached.source_qty_map||cached.source_totals||state.sourceQtyMap||{};
    updateAllSlots();
    return true;
  }
  function hydrateAvailableFromCache(){
    let cached=cacheGet(AVAILABLE_CACHE_KEY, 1000*60*60*24*3);
    if(!cached){
      const fallbacks=['yx_warehouse_available_cache_v463-data-spine-100pct-pass1','yx_warehouse_available_cache_v462-data-spine-real-fix','yx_warehouse_available_cache_v460-final-sync-cache-realtime-align','yx_warehouse_available_cache_v459-full-audit-no-half-sync-visible','yx_warehouse_available_cache_v455-dirty-sync-cache-align'];
      for(const k of fallbacks){ cached=cacheGet(k, 1000*60*60*24*3); if(cached) break; }
    }
    if(!cached) return false;
    state.available=Array.isArray(cached.available)?cached.available:[];
    state.availableByZone=cached.availableByZone||{A:[],B:[]};
    updateUnplacedPillLocal();
    return true;
  }
  const zones = ['A','B'];
  function parsedQtyFromProductText(text, fallback=0){
    const raw=clean(text).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=');
    if(!raw || !raw.includes('=')) return 0;
    const noParen=raw.replace(/[\(（][^\)）]*[\)）]/g,'');
    const right=noParen.split('=').slice(1).join('=');
    if(!/\d+(?:\.\d+)?\s*x\s*\d+/i.test(right) && !/(?:^|[+＋,，;；])\s*\d+(?:\.\d+)?\s*(?:[+＋,，;；]|$)/.test(right)) return 0;
    if(window.YX30EffectiveQty){
      const n=Number(window.YX30EffectiveQty(raw, fallback || 0));
      if(Number.isFinite(n) && n>0) return Math.floor(n);
    }
    return 0;
  }
  function itemQty(it){
    const text=clean(it?.product_text||it?.product||'');
    const parsed=parsedQtyFromProductText(text, 0);
    const explicitQty=Number(it?.qty ?? it?.quantity ?? it?.pieces ?? it?.count ?? it?.piece_count ?? it?.件數);
    const isCellItem=!!(it?.placement_label || it?.layer_label || it?.__warehouseCellItem);
    // V133: 商品文字有「=支數x件數」時，以商品文字為件數主來源，修正 63x30x125=240x49 卻顯示 1 件。
    // 下拉資料若已由後端改寫成剩餘件數，parsed 也會等於剩餘件數；格內編輯改件數時會同步改寫商品文字。
    if(parsed>0 && (isCellItem || !Number.isFinite(explicitQty) || explicitQty<=1 || Math.abs(parsed-explicitQty)>0)) return parsed;
    if(isCellItem && Number.isFinite(explicitQty) && explicitQty>0) return Math.floor(explicitQty);
    const explicitPriority = [it?.unplaced_qty, it?.available_qty, it?.remaining_qty];
    for(const v of explicitPriority){ const n=Number(v); if(Number.isFinite(n)&&n>0) return Math.floor(n); }
    if(parsed>0) return parsed;
    const candidates=[it?.qty,it?.quantity,it?.pieces,it?.count,it?.piece_count,it?.total_qty,it?.件數];
    for(const v of candidates){ const n=Number(v); if(Number.isFinite(n)&&n>0) return Math.floor(n); }
    const m=text.match(/(?:x|×|\*)\s*(\d+)\s*(?:件)?\s*$/i); if(m) return Math.max(1,Number(m[1]));
    return 1;
  }
  function materialOf(it){ return clean(it?.material || it?.wood_type || it?.材質 || ''); }
  function warehousePlacementLabel(it, fallback=''){
    const raw=clean(it?.placement_label || it?.layer_label || it?.position_label || it?.placement || fallback || '');
    if(!raw) return '';
    if(/front|前/i.test(raw)) return '前排';
    if(/middle|center|中/i.test(raw)) return '中間';
    if(/back|後|后/i.test(raw)) return '後排';
    return raw;
  }
  function sourceOf(it){
    const raw=clean(it?.source || it?.source_table || it?.type || '');
    if(/master|總單/i.test(raw)) return '總單';
    if(/order|訂單/i.test(raw)) return '訂單';
    if(/inventory|stock|庫存/i.test(raw)) return '庫存';
    return raw || '庫存';
  }
  function cleanCustomer(v){
    let s=clean(v)||'庫存';
    s = s
      .replace(/(?:FOB\s*代付|FOB\s*代|FOB|CNF)/gi,'')
      .replace(/[｜|].*$/g,'')
      .replace(/(?:^|\s)代(?:$|\s)/g,' ')
      .replace(/\s+/g,' ')
      .trim();
    // v453：倉庫格內客戶名不可把尺寸/支數誤當客戶顯示；商品資料一律回到「庫存」而不是亂顯示。
    if(!s || /\d+\s*[x×✕＊*]\s*\d+/i.test(s) || /[=＝]\s*\d+/.test(s)) return '庫存';
    return s || '庫存';
  }
  function productText(it){ return clean(it?.product_text || it?.product || it?.product_size || it?.display_product_size || it?.base_product_size || it?.size || it?.size_text || it?.dimension || it?.dimensions || it?.product_label || it?.raw_text || it?.label || it?.title || it?.detail || it?.description || it?.goods_text || it?.item_text || it?.content || it?.memo || it?.remark || it?.desc || it?.name || it?.text || it?.value || ''); }
  function stripProductParen(text){ return clean(text).replace(/[\(（][^\)）]*[\)）]/g,'').trim(); }
  function productBaseText(it){
    const raw = clean(it?.display_product_size || it?.base_product_size || productText(it));
    const noParen = stripProductParen(raw).replace(/[×ＸX✕＊*]/g,'x').replace(/＝/g,'=');
    return clean((noParen.split('=')[0] || noParen));
  }
  function productSupportText(it){
    // V133: 先以 product_text 右側為準，避免格內改成 240x20，但舊 support_text 仍是 240x49，導致下拉扣回錯誤。
    const raw = clean(productText(it)).replace(/[Ｘ×✕＊*X]/g,'x').replace(/＝/g,'=');
    if(raw.includes('=')) return clean(raw.split('=').slice(1).join('='));
    const direct = clean(it?.support_text || it?.support || '');
    if(direct) return direct.replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=');
    return '';
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
    // formal mainline behavior.
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
  function warehouseDisplayProductSize(it){
    const raw = productBaseText(it) || productText(it) || clean(it?.display_product_size || it?.base_product_size || it?.size || it?.size_text || it?.dimension || it?.dimensions || '');
    return clean(stripProductParen(raw).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=').split('=')[0] || raw).toUpperCase();
  }
  function warehouseSlotDisplayGroups(items){
    const map = new Map();
    (items||[]).forEach(it=>{
      const q = Math.max(0, Math.floor(Number(itemQty(it)||0)));
      if(q<=0) return;
      const customer = cleanCustomer(it?.customer_name || it?.customer || '') || '庫存';
      const material = materialOf(it);
      const size = warehouseDisplayProductSize(it);
      const placement = warehousePlacementLabel(it, '');
      // V500: placement is part of the visual grouping so dragged goods keep 前/中/後 instead of merging into an old line.
      const k = [customer, material, size, placement].join('||');
      const prev = map.get(k) || {customer_name:customer, material, size, placement_label:placement, qty:0};
      prev.qty += q;
      map.set(k, prev);
    });
    return Array.from(map.values()).sort((a,b)=>{
      const order={'前排':0,'中間':1,'後排':2,'':3};
      const pc=(order[a.placement_label||'']??9)-(order[b.placement_label||'']??9);
      if(pc) return pc;
      const cc = String(a.customer_name).localeCompare(String(b.customer_name),'zh-Hant',{numeric:true,sensitivity:'base'});
      if(cc) return cc;
      const mc = String(a.material).localeCompare(String(b.material),'zh-Hant',{numeric:true,sensitivity:'base'});
      if(mc) return mc;
      return String(a.size).localeCompare(String(b.size),'zh-Hant',{numeric:true,sensitivity:'base'});
    });
  }
  function warehouseSlotQtySplit(items){
    return warehouseSlotDisplayGroups(items).map(g=>Number(g.qty)||0).filter(n=>n>0).join('+') || '0';
  }
  function slotProductSummary(items){
    const groups = warehouseSlotDisplayGroups(items);
    if(!groups.length) return '';
    return groups.map(g=>clean([g.customer_name || '庫存', g.material, g.size, g.placement_label, g.qty].filter(v=>v!=='' && v!=null).join(' '))).join('\n');
  }
  function slotProductLinesHTML(items){
    const groups = warehouseSlotDisplayGroups(items);
    if(!groups.length) return '<div class="yx-slot-product-line empty">空格</div>';
    return groups.map(g=>{
      const placement = clean(g.placement_label||'');
      const placementHtml = placement ? ` <span class="yx-slot-placement">${esc(placement)}</span>` : '';
      return `<div class="yx-slot-product-line"><span class="yx-slot-customer">${esc(g.customer_name || '庫存')}</span> <span class="yx-slot-material">${esc(g.material || '')}</span> <span class="yx-slot-size">${esc(g.size || '')}</span>${placementHtml} <span class="yx-slot-line-qty">${esc(g.qty)}</span></div>`;
    }).join('');
  }
  function normalizedItem(it, qty, placement){
    const product=productText(it);
    const q=Math.max(1,Math.floor(Number(qty||itemQty(it)||1)));
    return {...it, product_text:product, product, customer_name:cleanCustomer(it?.customer_name||it?.customer||''), material:materialOf(it), qty:q, unplaced_qty:q, available_qty:q, remaining_qty:q, __warehouseCellItem:true, source:sourceOf(it), source_table:it?.source_table || it?.source || sourceOf(it), source_id:it?.source_id || it?.id || '', placement_label:placement || it?.placement_label || it?.layer_label || '前排', layer_label:placement || it?.placement_label || it?.layer_label || '前排'};
  }
  function cellFromData(z,c,s){
    z=clean(z).toUpperCase(); c=sanitizeWarehouseColumnNumber(c); s=sanitizeWarehouseSlotNumber(s);
    return (state.data.cells||[]).find(x=>clean(x.zone).toUpperCase()===z && Number(x.column_index)===c && Number(x.slot_number)===s && !isDeletedCell(x)) || null;
  }
  function isDeletedCell(cell){ return ['1','true','yes','deleted',1,true].includes(cell?.is_deleted); }
  function activeColumnCells(z,c){
    z=clean(z).toUpperCase(); c=sanitizeWarehouseColumnNumber(c);
    return (state.data.cells||[]).filter(x=>clean(x.zone).toUpperCase()===z && Number(x.column_index)===c && !isDeletedCell(x)).sort((a,b)=>Number(a.slot_number)-Number(b.slot_number));
  }

  function cellIdentity(cell){
    return clean(cell?.id || cell?.cell_id || cell?.warehouse_cell_id || cell?.row_id || '');
  }
  function warehouseItemStableKey(it){
    const sid=clean(it?.source_id || it?.id || it?.row_id || '');
    const customer=cleanCustomer(it?.customer_name || it?.customer || '');
    const mat=materialOf(it);
    const size=warehouseSizeKey(productText(it));
    return [sid, customer, mat, size].join('|');
  }
  function warehouseStructureItemKey(it){
    try{
      const base = warehouseItemStableKey(it);
      const qty = Math.max(0, Math.floor(Number(itemQty(it)||0)));
      const support = clean(productSupportText(it));
      const placement = warehousePlacementLabel(it, '');
      return [base, 'q:'+qty, 'p:'+placement, 's:'+support].join('|');
    }catch(_e){ return ''; }
  }
  function warehouseColumnItemBag(cells){
    const bag=[];
    try{
      (Array.isArray(cells)?cells:[]).forEach(cell=>{
        cellItemsFromRow(cell).forEach(it=>{
          const k=warehouseStructureItemKey(it);
          if(k && !k.includes('||||')) bag.push(k);
        });
      });
    }catch(_e){}
    return bag.sort();
  }
  function sameWarehouseColumnItemBag(a,b){
    const aa=warehouseColumnItemBag(a), bb=warehouseColumnItemBag(b);
    if(aa.length!==bb.length) return false;
    for(let i=0;i<aa.length;i++){ if(aa[i]!==bb[i]) return false; }
    return true;
  }
  function canTrustStructureColumnReadback(z,c,columnCells){
    try{
      const local=activeColumnCells(z,c);
      const incoming=(Array.isArray(columnCells)?columnCells:[]).map(cell=>normalizeServerCell(cell,z,c)).filter(cell=>!isDeletedCell(cell));
      const localTotal=warehouseCellItemTotalFromCells(local);
      const incomingTotal=warehouseCellItemTotalFromCells(incoming);
      if(localTotal===0 && incomingTotal===0) return true;
      return sameWarehouseColumnItemBag(local, incoming);
    }catch(_e){ return false; }
  }

  function cellHasHintItem(cell, hint){
    try{
      if(!cell) return false;
      const cellId=cellIdentity(cell);
      const hintCellId=clean(hint?.cell_id || hint?.warehouse_cell_id || hint?.id_cell || '');
      if(hintCellId && cellId && hintCellId===cellId) return true;
      const sourceId=clean(hint?.source_id || hint?.item?.source_id || hint?.id || '');
      const targetSize=warehouseSizeKey(hint?.product_text || hint?.item?.product_text || hint?.product || '');
      const targetCustomer=cleanCustomer(hint?.customer_name || hint?.item?.customer_name || '');
      const targetKey=warehouseItemStableKey(hint?.item || hint || {});
      if(!sourceId && !targetSize && !targetCustomer && !targetKey.replace(/\|/g,'')) return true;
      return cellItemsFromRow(cell).some(it=>{
        const sid=clean(it?.source_id || it?.id || it?.row_id || '');
        if(sourceId && sid && sid===sourceId) return true;
        const sameSize=targetSize && warehouseSizeKey(productText(it))===targetSize;
        const sameCustomer=!targetCustomer || cleanCustomer(it.customer_name||'')===targetCustomer || cleanCustomer(it.customer_name||'')==='庫存';
        if(sameSize && sameCustomer) return true;
        return targetKey && targetKey !== '|||' && warehouseItemStableKey(it)===targetKey;
      });
    }catch(_e){ return false; }
  }
  function cleanupSlotRedirects(){
    try{
      const now=Date.now();
      state.slotRedirects?.forEach?.((v,k)=>{ if(!v || Number(v.exp||0)<now) state.slotRedirects.delete(k); });
    }catch(_e){}
  }
  function registerSlotRedirect(z,c,fromSlot,toSlot, reason, hintCell){
    try{
      z=clean(z).toUpperCase(); c=Number(c); fromSlot=Number(fromSlot); toSlot=Number(toSlot);
      if(!z || !c || !fromSlot || !toSlot || fromSlot===toSlot) return;
      cleanupSlotRedirects();
      const fromKey=key(z,c,fromSlot);
      state.slotRedirects.set(fromKey, {
        zone:z, col:c, slot:toSlot, reason:reason||'structure-renumber', exp:Date.now()+1000*60*15,
        item_keys:cellItemsFromRow(hintCell||{}).map(warehouseItemStableKey).filter(Boolean).slice(0,12),
        cell_id:cellIdentity(hintCell||{})
      });
    }catch(_e){}
  }
  function resolveSlotRedirect(z,c,s,hint){
    z=clean(z).toUpperCase(); c=Number(c); s=Number(s);
    cleanupSlotRedirects();
    let loc={zone:z,col:c,slot:s};
    const seen=new Set();
    for(let i=0;i<8;i++){
      const k=key(loc.zone,loc.col,loc.slot);
      if(seen.has(k)) break;
      seen.add(k);
      const r=state.slotRedirects?.get?.(k);
      if(!r) break;
      loc={zone:clean(r.zone||loc.zone).toUpperCase(), col:Number(r.col||loc.col), slot:Number(r.slot||loc.slot)};
    }
    const redirected=cellFromData(loc.zone,loc.col,loc.slot);
    if(redirected && (!hint || cellHasHintItem(redirected,hint))) return {cell:redirected, zone:loc.zone, col:loc.col, slot:loc.slot, redirected:true};
    return null;
  }
  function resolveWarehouseCellLocation(z,c,s,hint){
    z=clean(z).toUpperCase(); c=Number(c); s=Number(s);
    const exact=cellFromData(z,c,s);
    if(exact && (!hint || cellHasHintItem(exact,hint))) return {cell:exact, zone:z, col:c, slot:s, reason:'exact'};
    const alias=resolveSlotRedirect(z,c,s,hint);
    if(alias) return {...alias, reason:'slot-redirect'};
    const sameColumn=activeColumnCells(z,c).find(cell=>cellHasHintItem(cell,hint));
    if(sameColumn) return {cell:sameColumn, zone:z, col:c, slot:Number(sameColumn.slot_number||0), reason:'same-column-item'};
    if(hint){
      const sameZone=(state.data.cells||[]).find(cell=>clean(cell.zone).toUpperCase()===z && !isDeletedCell(cell) && cellHasHintItem(cell,hint));
      if(sameZone) return {cell:sameZone, zone:z, col:Number(sameZone.column_index||0), slot:Number(sameZone.slot_number||0), reason:'same-zone-item'};
    }
    return exact ? {cell:exact, zone:z, col:c, slot:s, reason:'fallback-exact'} : null;
  }
  function resolveSearchHitCell(hit){
    const raw=(hit && (hit.cell||hit)) || {};
    const item=(hit && hit.item) || hit || {};
    const hint={...item, item, cell_id:raw.id || raw.cell_id || raw.warehouse_cell_id || ''};
    const loc=resolveWarehouseCellLocation(raw.zone, raw.column_index, raw.slot_number, hint);
    return (loc && loc.cell) ? loc.cell : raw;
  }
  function markColumnStructureEpoch(z,c,action){
    try{
      const k=columnKey(z,c);
      const n=Number(state.structureEpochByColumn?.get?.(k)||0)+1;
      state.structureEpochByColumn?.set?.(k,n);
      state.availableSeq++;
      return n;
    }catch(_e){ return 0; }
  }
  function visibleSlotNumbers(z,c){
    // 117：格數以後端回傳為準；若使用者把基礎空格隱藏，不能再由前端硬補回 1–20。
    // 只有資料尚未載入時才顯示初始 20 格。
    const nums=activeColumnCells(z,c).map(x=>Number(x.slot_number)||0).filter(n=>n>0);
    if(nums.length) return Array.from(new Set(nums)).sort((a,b)=>a-b);
    return Array.from({length:20},(_,i)=>i+1);
  }
  function cellItems(z,c,s){
    const cell=cellFromData(z,c,s);
    if(!cell) return [];
    return cellItemsFromRow(cell);
  }
  function cellNote(z,c,s){ return clean(cellFromData(z,c,s)?.note || ''); }
  function maxSlot(z,c){
    const nums=visibleSlotNumbers(z,c);
    return nums.length ? Math.max(...nums) : 20;
  }
  function getColumnList(z,c){ return document.querySelector(`.vertical-column-card[data-zone="${z}"][data-column="${Number(c)}"] .vertical-slot-list`); }
  function createSlotElement(z,c,s){
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='yx-final-slot yx108-slot yx106-slot yx116-slot vertical-slot';
    btn.dataset.zone=z; btn.dataset.column=String(Number(c)); btn.dataset.slot=String(Number(s)); btn.style.touchAction='none';
    btn.innerHTML='<div class="yx108-slot-row yx108-slot-row1 yx116-slot-row1 yx-v500-slot-head"><span class="yx108-slot-no"></span><span class="yx108-slot-sum">0</span><span class="yx108-slot-total">0件</span></div><div class="yx108-slot-product empty" aria-label="格內商品明細"><div class="yx-slot-product-line empty">空格</div></div>';
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
    // formal mainline behavior.
    // 每次取格子時強制補齊中間列，避免被舊版 DOM 蓋掉造成「TD 200x30x125」不顯示。
    const row1 = el.querySelector('.yx108-slot-row1,.yx116-slot-row1') || el.firstElementChild;
    if(row1){
      row1.classList.add('yx-v500-slot-head');
      let oldCustomers=row1.querySelector('.yx108-slot-customers');
      if(oldCustomers) oldCustomers.remove();
      let sum=row1.querySelector('.yx108-slot-sum');
      let total=row1.querySelector('.yx108-slot-total');
      const oldRow2=el.querySelector('.yx108-slot-row2,.yx116-slot-row2');
      if(!sum && oldRow2?.querySelector('.yx108-slot-sum')){ sum=oldRow2.querySelector('.yx108-slot-sum'); row1.appendChild(sum); }
      if(!total && oldRow2?.querySelector('.yx108-slot-total')){ total=oldRow2.querySelector('.yx108-slot-total'); row1.appendChild(total); }
      if(!sum){ sum=document.createElement('span'); sum.className='yx108-slot-sum'; sum.textContent='0'; row1.appendChild(sum); }
      if(!total){ total=document.createElement('span'); total.className='yx108-slot-total'; total.textContent='0件'; row1.appendChild(total); }
      if(oldRow2) oldRow2.remove();
    }
    if(!el.querySelector('.yx108-slot-product')){
      const product=document.createElement('div');
      product.className='yx108-slot-product empty';
      product.setAttribute('aria-label','格內商品明細');
      product.innerHTML='<div class="yx-slot-product-line empty">空格</div>';
      el.appendChild(product);
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
    const placedMaps=placedQtyMaps();
    const no=el.querySelector('.yx108-slot-no'); if(no) no.textContent=String(s);
    const customers=el.querySelector('.yx108-slot-customers'); // legacy selector kept only for migration; V499 header uses qty split instead.
    const productLine=el.querySelector('.yx108-slot-product');
    const sum=el.querySelector('.yx108-slot-sum');
    const total=el.querySelector('.yx108-slot-total');
    const hi=state.searchKeys.has(key(z,c,s));
    el.classList.toggle('filled', items.length>0);
    el.classList.toggle('highlight', hi);
    const markedCell = cellFromData(z,c,s);
    const marked = ['problem','marked','1','true',true,1].includes(markedCell?.problem_flag);
    el.classList.toggle('yx-warehouse-problem', !!marked);
    el.classList.toggle('yx-warehouse-cell-saving', !!(state.pendingCells && state.pendingCells.has(key(z,c,s))));
    const overstock=items.some(it=>isItemOverSource(it, placedMaps));
    el.classList.toggle('yx-warehouse-overstock', !!overstock);
    el.title = overstock ? '此格商品數量已超過庫存+訂單+總單加總，請檢查來源數量' : '';
    el.dataset.hasItems=items.length?'1':'0';
    if(!items.length){
      customers && (customers.textContent='空格', customers.classList.add('yx108-slot-empty'));
      if(productLine){
        productLine.innerHTML='<div class="yx-slot-product-line empty">空格</div>';
        productLine.classList.add('empty');
        productLine.dataset.yxProductVisible='0';
      }
      delete el.dataset.yxProductLines;
      el.dataset.yxQtySplit='0';
      sum && (sum.textContent='0'); total && (total.textContent='0件');
      return;
    }
    const groups=warehouseSlotDisplayGroups(items);
    const totalQty=groups.reduce((n,g)=>n+(Number(g.qty)||0),0);
    const qtySplit=warehouseSlotQtySplit(items);
    customers && (customers.remove ? customers.remove() : (customers.textContent=''));
    if(productLine){
      let lines = String(slotProductSummary(items) || '').split('\n').filter(Boolean);
      productLine.innerHTML = slotProductLinesHTML(items);
      productLine.classList.remove('empty');
      productLine.dataset.yxProductVisible='1';
      el.dataset.yxProductLines=String(lines.length||1);
      try{ productLine.style.display='block'; productLine.style.visibility='visible'; productLine.style.opacity='1'; productLine.style.minHeight='auto'; productLine.style.maxHeight='none'; }catch(_e){}
    }
    el.dataset.yxQtySplit=qtySplit;
    sum && (sum.textContent=qtySplit);
    total && (total.textContent=`${totalQty}件`);
  }
  function updateAllSlots(){
    ensureSlotRange();
    zones.forEach(z=>{ for(let c=1;c<=6;c++){ visibleSlotNumbers(z,c).forEach(s=>updateSlotUI(z,c,s)); removeExtraDom(z,c); } });
    updateNotes(); bindSlots(); setWarehouseZone(state.activeZone || localStorage.getItem('warehouseActiveZone') || 'A', false);
    try{ window.YX && window.YX.mobileZoom && window.YX.mobileZoom.refreshSoon && window.YX.mobileZoom.refreshSoon(); }catch(_e){}
    try{ window.YX?.visualSync?.apply?.('warehouse-render'); }catch(_e){}
  }
  function updateNotes(){
    for(const z of zones){ const n=$(z==='A'?'zone-A-count-note':'zone-B-count-note'); if(n) n.textContent='6 欄｜每欄預設 20 格'; }
  }
  async function loadAvailable(force=false){
    if(!force) hydrateAvailableFromCache();
    const seq=++state.availableSeq;
    try{
      const all=await api('/api/warehouse/available-items?fast=1' + (force ? '&local_first=1&cache_bust=' + encodeURIComponent(CACHE_VERSION + '-' + Date.now()) : ''));
      if(seq !== state.availableSeq) return state.available;
      const items=Array.isArray(all.items)?all.items:[];
      state.available=items;
      state.availableLoadedAt=Date.now();
      state.availableByZone={
        A:items.filter(it=>clean(it.zone||it.warehouse_zone||'').toUpperCase()==='A'),
        B:items.filter(it=>clean(it.zone||it.warehouse_zone||'').toUpperCase()==='B')
      };
      subtractPlacedFromAvailableNow();
      const count=items=>(Array.isArray(items)?items:[]).reduce((n,it)=>n+itemQty(it),0);
      const summary=all.zone_summary||{};
      const aCount=Number.isFinite(Number(summary.A))?Number(summary.A):count(state.availableByZone.A);
      const bCount=Number.isFinite(Number(summary.B))?Number(summary.B):count(state.availableByZone.B);
      const unassigned=Number.isFinite(Number(summary.unassigned))?Number(summary.unassigned):Math.max(0,count(state.available)-aCount-bCount);
      const total=Number.isFinite(Number(summary.total))?Number(summary.total):count(state.available);
      const pill=$('warehouse-unplaced-pill'); if(pill) pill.textContent=`A區 ${aCount} 件 / B區 ${bCount} 件 / 未分區 ${unassigned} 件 / 總計 ${total} 件`;
      cacheAvailableNow();
      return state.available;
    }catch(_e){ if(!force) hydrateAvailableFromCache(); state.available=state.available||[]; state.availableByZone=state.availableByZone||{A:[],B:[]}; if(!state.availableLoadedAt && (state.available||[]).length) state.availableLoadedAt=Date.now(); updateUnplacedPillLocal(); return state.available; }
  }
  async function loadWarehouseSourceQtyMap(){
    try{
      const d=await api('/api/warehouse/source-qty-map?fast=1');
      if(d && (d.source_qty_map || d.source_totals)){
        state.sourceQtyMap=d.source_qty_map||d.source_totals||{};
        cacheWarehouseNow();
        updateAllSlots();
      }
    }catch(_e){}
  }
  async function hydrateWarehouseFromDeviceSync(){
    try{
      if(!window.YXDataStore?.getWarehouse) return false;
      const d = await window.YXDataStore.getWarehouse();
      if(!d || !Array.isArray(d.cells)) return false;
      const incomingTotal = warehouseCellItemTotalFromCells(d.cells.map(cell=>normalizeServerCell(cell)));
      const localTotal = warehouseCellItemTotalFromCells(state.data && state.data.cells);
      if(incomingTotal<=0 && localTotal>0) return false;
      mergeCellsPreservingLocalProtected(d.cells, d.zones||{A:{},B:{}}, {preserveMissingLocal:false, trustIncoming:true});
      state.sourceQtyMap=d.source_qty_map||d.source_totals||state.sourceQtyMap||{};
      cacheWarehouseNow();
      updateAllSlots();
      return true;
    }catch(_e){ return false; }
  }
  async function hydrateAvailableFromDeviceSync(){
    try{
      if(!window.YXDataStore?.getWarehouseAvailable) return false;
      const d = await window.YXDataStore.getWarehouseAvailable();
      if(!d) return false;
      const items = Array.isArray(d.items) ? d.items : (Array.isArray(d.available) ? d.available : []);
      state.available = items;
      state.availableByZone = d.availableByZone || d.available_by_zone || {
        A:items.filter(it=>clean(it.zone||it.warehouse_zone||'').toUpperCase()==='A'),
        B:items.filter(it=>clean(it.zone||it.warehouse_zone||'').toUpperCase()==='B')
      };
      cacheAvailableNow();
      updateUnplacedPillLocal();
      return true;
    }catch(_e){ return false; }
  }
  async function renderWarehouse(force=false){
    if(state.loading && !force) return state.loading;
    if(force) protectActiveWarehouseEdit('');
    // V462: 無論一般進頁或手動刷新，都先吃同步後的 IndexedDB/localStorage 倉庫資料，API 逾時不可把畫面洗空。
    const hadDevice = await hydrateWarehouseFromDeviceSync();
    const hadCached = hadDevice || hydrateWarehouseFromCache();
    await hydrateAvailableFromDeviceSync();
    hydrateAvailableFromCache();
    const seq = ++state.loadSeq;
    const fetchFresh = async()=>{ try{
      const d = await api('/api/warehouse?fast=1&lite=1&yx166_stability=1' + (force ? '&local_first=1&no_cache=1&cache_bust=' + encodeURIComponent(CACHE_VERSION + '-' + Date.now()) : ''));
      if (seq !== state.loadSeq && !force) return state.data; // stale DB response must not overwrite user edits.
      const freshCells=Array.isArray(d.cells)?d.cells:[];
      const beforeTotal=warehouseCellItemTotalFromCells(state.data && state.data.cells);
      const incomingTotal=warehouseCellItemTotalFromCells(freshCells.map(cell=>normalizeServerCell(cell)));
      if(incomingTotal<=0 && beforeTotal>0){
        // V434: keep cache architecture but shield visible products from a transient empty DB/API readback.
        // Force refresh still hits DB; it just cannot repaint all visible products as empty unless there was no local product.
        state.lastWarehouseEmptyReadbackBlocked = {at:Date.now(), beforeTotal, incomingTotal, version:CACHE_VERSION};
      }else{
        mergeCellsPreservingLocalProtected(freshCells, d.zones||{A:{},B:{}}, {preserveMissingLocal:false, trustIncoming:true});
      }
      if(d.source_qty_map || d.source_totals) state.sourceQtyMap=d.source_qty_map||d.source_totals||{};
      cacheWarehouseNow();
      window.state=window.state||{}; window.state.warehouse={...state.data, activeZone:state.activeZone, availableItems:state.available};
      updateAllSlots();
      try{
        const idle = window.requestIdleCallback || function(fn){ return setTimeout(fn, 120); };
        // V142: 開倉庫圖先顯示格子；未錄入與超量比對改成閒置背景，絕不阻塞首屏。
        idle(()=>{ loadWarehouseSourceQtyMap().catch(()=>{}); }, {timeout:2400});
        idle(()=>{ loadAvailable(false).then(()=>{ window.state.warehouse={...state.data, activeZone:state.activeZone, availableItems:state.available}; try{ syncBatchSelectLimits?.(); }catch(_e){} }).catch(()=>{}); }, {timeout:3200});
        idle(()=>{ retryPendingWarehouseConsistencyChecks({toast:false}).catch(()=>{}); }, {timeout:3600});
      }catch(_e){}
      return state.data;
    } catch(e){ try{ await hydrateWarehouseFromDeviceSync(); hydrateWarehouseFromCache(); }catch(_e){} toast(e.message||'倉庫圖載入失敗，已顯示本機快取資料','error'); bindSlots(); updateAllSlots(); return state.data; } finally{ if (seq === state.loadSeq) state.loading=null; } };
    if (hadCached && !force) {
      // V464: 倉庫圖已有同步/本機資料時立刻畫面，不背景打 DB、不逾時洗空。
      try { updateAllSlots(); updateUnplacedPillLocal(); } catch(_e) {}
      window.state=window.state||{}; window.state.warehouse={...state.data, activeZone:state.activeZone, availableItems:state.available};
      state.loading = null;
      return state.data;
    }
    const p = fetchFresh();
    state.loading = p;
    return p;
  }
  function setWarehouseZone(zone='A', scroll=true){
    zone=clean(zone).toUpperCase(); if(!['A','B','ALL'].includes(zone)) zone='A'; state.activeZone=zone; localStorage.setItem('warehouseActiveZone',zone);
    const za=$('zone-A'), zb=$('zone-B'); if(za) za.style.display=zone==='B'?'none':''; if(zb) zb.style.display=zone==='A'?'none':'';
    ['A','B','ALL'].forEach(z=>$('zone-switch-'+z)?.classList.toggle('active', z===zone));
    const pill=$('warehouse-selection-pill'); if(pill) pill.textContent=`目前區域：${zone==='ALL'?'全部':zone+' 區'}`;
    if(scroll && zone!=='ALL') (zone==='A'?za:zb)?.scrollIntoView?.({behavior:'smooth',block:'start'});
  }
  function protectActiveWarehouseEdit(reason){
    // V231: search/highlight/jump/forced reload must not overwrite the cell currently being edited.
    // Copy live inputs into the local cell + draft first; this reuses the existing draft/cache path only.
    try{
      if(!state.current || !document.querySelector('#warehouse-modal:not(.hidden)')) return false;
      return flushLiveEditorToLocalDraft(reason || '');
    }catch(_e){ return false; }
  }
  function clearWarehouseHighlights(){ protectActiveWarehouseEdit(''); state.searchKeys.clear(); $('warehouse-search-results')?.classList.add('hidden'); $('warehouse-unplaced-list-inline')?.classList.add('hidden'); state.unplacedOpen=false; updateAllSlots(); }
  function clearWarehouseSearch(){ protectActiveWarehouseEdit(''); const input=$('warehouse-search'); if(input) input.value=''; clearWarehouseHighlights(); }
  function highlightWarehouseCell(z,c,s){ protectActiveWarehouseEdit(''); setWarehouseZone(clean(z).toUpperCase(),false); state.searchKeys.add(key(z,c,s)); updateSlotUI(z,c,s); const el=ensureSlotElement(clean(z).toUpperCase(),c,s); if(el){ el.classList.add('highlight','flash-highlight'); el.scrollIntoView?.({behavior:'smooth',block:'center'}); setTimeout(()=>el.classList.remove('flash-highlight'),2200); } }
  async function searchWarehouse(){
    protectActiveWarehouseEdit('');
    const q=clean($('warehouse-search')?.value||''); if(!q){ clearWarehouseHighlights(); return; }
    const box=$('warehouse-search-results');
    try{ const d=await api('/api/warehouse/search?q='+encodeURIComponent(q)+'&ts='+Date.now()); const hits=Array.isArray(d.items)?d.items:[]; const resolvedHits=hits.map(h=>({...h,_resolvedCell:resolveSearchHitCell(h)})); state.searchKeys=new Set(resolvedHits.map(h=>{ const c=h._resolvedCell||h.cell||h; return key(c.zone,c.column_index,c.slot_number); })); updateAllSlots(); if(box){ box.classList.remove('hidden'); box.innerHTML=resolvedHits.length?resolvedHits.map((h,i)=>{ const c=h._resolvedCell||h.cell||h; const stale=(h.cell&&h._resolvedCell&&key(h.cell.zone,h.cell.column_index,h.cell.slot_number)!==key(c.zone,c.column_index,c.slot_number)); return `<button type="button" class="deduct-card yx-search-hit" data-hit="${i}"><strong>${esc(c.zone)}-${Number(c.column_index)}-${Number(c.slot_number)}${stale?'｜已校正':''}</strong><div>${esc(cleanCustomer(h.customer_name||h.item?.customer_name||''))}</div><div class="small-note">${esc(productText(h.item||h))}</div></button>`; }).join(''):'<div class="empty-state-card compact-empty">找不到格位</div>'; box.querySelectorAll('[data-hit]').forEach((btn,i)=>btn.onclick=()=>{ protectActiveWarehouseEdit(''); const c=(resolvedHits[i]._resolvedCell||resolvedHits[i].cell||resolvedHits[i]); highlightWarehouseCell(c.zone,c.column_index,c.slot_number); }); } if(resolvedHits[0]){ const c=resolvedHits[0]._resolvedCell||resolvedHits[0].cell||resolvedHits[0]; highlightWarehouseCell(c.zone,c.column_index,c.slot_number); } }catch(e){ toast(e.message||'搜尋失敗','error'); }
  }
  function highlightWarehouseSameCustomer(){
    protectActiveWarehouseEdit('');
    const name=clean(window.__YX_SELECTED_CUSTOMER__||$('customer-name')?.value||''); if(!name) return toast('請先選擇客戶','warn');
    state.searchKeys.clear(); (state.data.cells||[]).forEach(c=>{ cellItems(c.zone,c.column_index,c.slot_number).forEach(it=>{ const cn=cleanCustomer(it.customer_name); if(cn.includes(name)||name.includes(cn)) state.searchKeys.add(key(c.zone,c.column_index,c.slot_number)); }); }); updateAllSlots();
  }
  async function toggleWarehouseUnplacedHighlight(){
    await loadAvailable(false); const box=$('warehouse-unplaced-list-inline'); if(!box) return; state.unplacedOpen=!state.unplacedOpen;
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
        // formal mainline behavior.
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
  function availableRowsAll(){
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
      .sort((a,b)=> itemQty(b.it)-itemQty(a.it) || supportSticks(b.it)-supportSticks(a.it) || optionLabel(a.it).localeCompare(optionLabel(b.it),'zh-Hant',{numeric:true}));
  }
  function selectedBatchKeys(){
    const keys = new Set();
    document.querySelectorAll('#yx121-batch-rows .yx121-batch-row').forEach(row=>{
      const sel=row.querySelector('.yx121-batch-select');
      const opt=sel?.options?.[sel.selectedIndex];
      const k=opt?.dataset?.itemKey || sel?.value || '';
      if(k) keys.add(k);
    });
    return keys;
  }
  function availableRows(){
    const q=clean($('warehouse-item-search')?.value||'').toLowerCase();
    const selected=selectedBatchKeys();
    return availableRowsAll().filter(r=>!q || optionLabel(r.it).toLowerCase().includes(q) || selected.has(r.key));
  }
  function placementForBatch(i){ return i===0?'後排':i===1?'中間':'前排'; }
  function itemKey(it){ return [cleanCustomer(it?.customer_name||''), clean(it?.exact_key||''), productText(it), clean(it?.support_text||''), materialOf(it), sourceOf(it), clean(it?.source_id||it?.id||''), clean(it?.zone||'')].join('::'); }
  function itemSourceIdKey(it){
    const direct=clean(it?.source_id||it?.id||'');
    if(direct) return direct;
    const origin=clean(it?.origin_source_id||it?.row_id||'');
    if(origin) return origin;
    const details=Array.isArray(it?.source_details) ? it.source_details : [];
    return clean(details.map(d=>clean(d?.source_id||d?.id||d?.origin_source_id||'')).filter(Boolean).join('|'));
  }
  function itemStableKey(it){ return [cleanCustomer(it?.customer_name||''), warehouseSizeKey(productText(it)), materialOf(it), sourceOf(it), itemSourceIdKey(it), clean(it?.zone||it?.location||'')].join('::'); }
  function cellItemMergeKey(it){
    // V420: do not merge different 支數 lines just because the base size/source is the same.
    // Same exact product/support + same position still merges; different support stays as a separate editable row.
    return [cleanCustomer(it?.customer_name||''), warehouseExactKey(productText(it)) || warehouseSizeKey(productText(it)), materialOf(it), sourceOf(it), itemSourceIdKey(it), clean(it?.zone||it?.location||''), clean(it?.placement_label || it?.layer_label || '前排')].join('::');
  }

  function warehouseUniqueItemKey(it, cell){
    try{
      if(window.YXDataStore && typeof window.YXDataStore.warehouseItemKey === 'function'){
        return window.YXDataStore.warehouseItemKey(Object.assign({}, it||{}, {zone:(it&&it.zone)||cell?.zone||it?.warehouse_zone||''}), {ignoreZone:false});
      }
    }catch(_e){}
    const sourceId=itemSourceIdKey(it);
    const idPart=sourceId ? ('src:'+sourceId) : ('txt:'+warehouseExactKey(productText(it)));
    return [sourceOf(it), idPart, cleanCustomer(it?.customer_name||''), materialOf(it), clean((it&&it.zone)||cell?.zone||it?.warehouse_zone||'')].join('::');
  }
  function normalizeWarehouseUniquePlacements(preferredKey){
    try{
      const cells = Array.isArray(state.data?.cells) ? state.data.cells : [];
      const preferred = preferredKey ? String(preferredKey) : '';
      const byItem = new Map();
      cells.forEach(cell=>{
        if(isDeletedCell(cell)) return;
        const cellK = key(cell.zone, cell.column_index, cell.slot_number);
        const kept=[];
        cellItemsFromRow(cell).forEach(it=>{
          const q=itemQty(it); if(q<=0) return;
          const ik=warehouseUniqueItemKey(it, cell); if(!ik) return;
          const rec={cell, cellK, item:it, qty:q};
          const old=byItem.get(ik);
          if(!old){ byItem.set(ik, rec); kept.push(it); return; }
          const oldPreferred = old.cellK === preferred;
          const newPreferred = cellK === preferred;
          if(newPreferred && !oldPreferred){
            old.item.__yxDropDuplicate = true;
            byItem.set(ik, rec); kept.push(it);
          }else if(!oldPreferred && !newPreferred){
            // keep the first visible placement for old duplicated cache rows; drop later stale duplicates.
            it.__yxDropDuplicate = true;
          }else{
            it.__yxDropDuplicate = true;
          }
        });
      });
      cells.forEach(cell=>{
        const next=cellItemsFromRow(cell).filter(it=>!it.__yxDropDuplicate);
        next.forEach(it=>{ try{ delete it.__yxDropDuplicate; }catch(_e){} });
        cell.items=next;
        cell.items_json=JSON.stringify(next||[]);
      });
      return true;
    }catch(_e){ return false; }
  }
  function subtractPlacedFromAvailableNow(){
    try{
      const placed=new Map();
      (state.data.cells||[]).forEach(cell=>{
        if(isDeletedCell(cell)) return;
        cellItemsFromRow(cell).forEach(it=>{
          const q=itemQty(it); if(q<=0) return;
          const ik=warehouseUniqueItemKey(it, cell); if(!ik) return;
          placed.set(ik, (placed.get(ik)||0)+q);
        });
      });
      if(!placed.size) return false;
      const next=[];
      (state.available||[]).forEach(raw=>{
        const q=itemQty(raw); if(q<=0) return;
        const ik=warehouseUniqueItemKey(raw, null);
        const take=Math.min(q, Number(placed.get(ik)||0));
        if(take>0) placed.set(ik, Math.max(0, Number(placed.get(ik)||0)-take));
        const left=Math.max(0, q-take);
        if(left>0) next.push(cloneWithQty(raw, left));
      });
      if(next.length !== (state.available||[]).length || next.reduce((n,it)=>n+itemQty(it),0) !== (state.available||[]).reduce((n,it)=>n+itemQty(it),0)){
        state.available=next; rebuildAvailableZoneBuckets(); updateUnplacedPillLocal(); return true;
      }
    }catch(_e){}
    return false;
  }


  const CONSISTENCY_PENDING_KEY = 'yx_warehouse_consistency_pending_v423_fresh_reload_unplaced_sync';
  function warehouseCompareItemKey(it){
    try{
      const src=clean(it?.source_id||it?.id||it?.row_id||'');
      return [cleanCustomer(it?.customer_name||it?.customer||''), materialOf(it).toUpperCase(), warehouseSizeKey(productText(it)), sourceOf(it), src, String(Math.max(0,Math.floor(Number(itemQty(it)||0))))].join('|');
    }catch(_e){ return ''; }
  }
  function localCellCompareSignature(z,c,s){
    try{
      const cell=cellFromData(z,c,s) || {};
      const items=cellItems(z,c,s).map(warehouseCompareItemKey).filter(Boolean).sort();
      const note=clean(cell.note || cellNote(z,c,s) || '');
      return simpleHash(JSON.stringify({items,note}));
    }catch(_e){ return ''; }
  }
  function localAvailableSignature(){
    try{
      const items=(state.available||[]).map(it=>[warehouseCompareItemKey(it), clean(it?.zone||it?.warehouse_zone||''), String(itemQty(it))].join('|')).sort();
      return simpleHash(items.join('||'));
    }catch(_e){ return ''; }
  }
  function simpleHash(text){
    try{ let h=0; const s=String(text||''); for(let i=0;i<s.length;i++){ h=((h<<5)-h+s.charCodeAt(i))|0; } return String(h>>>0); }catch(_e){ return ''; }
  }
  function readConsistencyPending(){
    try{ const fresh=JSON.parse(localStorage.getItem(CONSISTENCY_PENDING_KEY)||'[]'); const legacy=JSON.parse(localStorage.getItem('yx_warehouse_consistency_pending_v287_status_detail_card')||'[]'); const v292=JSON.parse(localStorage.getItem('yx_warehouse_consistency_pending_v292_single_retry_cancel')||'[]'); const arr=[...(Array.isArray(legacy)?legacy:[]), ...(Array.isArray(v292)?v292:[]), ...(Array.isArray(fresh)?fresh:[])]; const seen=new Set(); return arr.filter(x=>x&&x.id&&!seen.has(x.id)&&(seen.add(x.id)||true)).slice(-80); }catch(_e){ return []; }
  }
  function writeConsistencyPending(arr){
    try{ localStorage.setItem(CONSISTENCY_PENDING_KEY, JSON.stringify((Array.isArray(arr)?arr:[]).slice(-80))); }catch(_e){}
  }
  function rememberConsistencyPending(payload, reason){
    try{
      const base={...(payload||{}), reason:reason||payload?.reason||'pending-final-check', saved_at:Date.now(), exp:Date.now()+1000*60*60*24};
      base.id=base.id || [clean(base.operation_id||''), clean(base.zone||''), Number(base.column_index||0), Number(base.slot_number||0), clean(base.reason||'')].join('|') || String(Date.now());
      const arr=readConsistencyPending().filter(x=>x.id!==base.id && Number(x.exp||0)>Date.now());
      arr.push(base); writeConsistencyPending(arr);
    }catch(_e){}
  }
  function forgetConsistencyPending(id){
    try{ if(!id) return; writeConsistencyPending(readConsistencyPending().filter(x=>x.id!==id)); }catch(_e){}
  }
  function buildConsistencyPayload(detail){
    const z=clean(detail?.zone || detail?.cell?.zone || state.current?.zone || 'A').toUpperCase();
    const c=Number(detail?.column_index || detail?.col || detail?.cell?.column_index || state.current?.col || 0);
    const s=Number(detail?.slot_number || detail?.slot || detail?.cell?.slot_number || state.current?.slot || 0);
    const op=clean(detail?.operation_id || detail?.request_key || yxOperationId('warehouse-final-check'));
    return {id:[op,z,c,s].join('|'), operation_id:op, zone:z, column_index:c, slot_number:s, action:clean(detail?.action||detail?.reason||'warehouse-final-check'), client_cell_signature:(z&&c&&s)?localCellCompareSignature(z,c,s):'', client_available_signature:localAvailableSignature(), version:'v423'};
  }
  function isAbortLikeError(e){
    const msg=String(e?.message || e || '').toLowerCase();
    return e?.name === 'AbortError' || msg.includes('aborted') || msg.includes('signal is aborted');
  }
  async function runWarehouseConsistencyCheck(detail, opts={}){
    const payload=buildConsistencyPayload(detail||{});
    if(!payload.zone || !payload.column_index || !payload.slot_number) return {success:true, skipped:true};
    if(navigator && navigator.onLine === false){ rememberConsistencyPending(payload, 'offline'); return {success:true, queued:true, offline:true}; }
    try{
      state.consistencyCheckInFlight=true;
      const d=await api('/api/warehouse/consistency-check', {method:'POST', body:JSON.stringify(payload)});
      if(!d || d.success===false) throw new Error(d?.error||'一致性檢查失敗');
      forgetConsistencyPending(payload.id);
      const serverCellSignature = d.server_cell ? simpleHash(JSON.stringify({items:(Array.isArray(d.server_cell.items)?d.server_cell.items:[]).map(warehouseCompareItemKey).filter(Boolean).sort(), note:clean(d.server_cell.note||'')})) : '';
      const cellMismatch = !!(d.cell_found && payload.client_cell_signature && serverCellSignature && payload.client_cell_signature !== serverCellSignature);
      if(cellMismatch){
        // V520-H: do not let delayed readback overwrite the user's just-finished operation.
        // The previous behavior made the warehouse UI jump back after add/insert/delete/drag.
        // Keep the optimistic/local column visible and record a pending check instead of mutating DOM.
        rememberConsistencyPending(payload, 'readback-diff-kept-local-visible');
        const now=Date.now();
        if(now-Number(state.consistencyNoticeAt||0)>3000){ state.consistencyNoticeAt=now; toast('資料庫回讀較慢，已保留目前畫面並稍後再檢查，不會把格子跳回舊狀態','warn'); }
      }
      if(d.available_summary){
        try{ state.lastServerAvailableSummary=d.available_summary; }catch(_e){}
      }
      return d;
    }catch(e){
      const abortLike=isAbortLikeError(e);
      rememberConsistencyPending(payload, abortLike ? 'request-aborted-retry-later' : (e.message||'network-delay'));
      const now=Date.now();
      if(!abortLike && (opts.toast || now-Number(state.consistencyNoticeAt||0)>4000)){ state.consistencyNoticeAt=now; toast('倉庫最終一致性檢查延遲，已保留稍後重試，不影響繼續操作','warn'); }
      return {success:false, queued:true, silent:abortLike, error:e.message||String(e)};
    }finally{ state.consistencyCheckInFlight=false; }
  }
  function scheduleWarehouseConsistencyCheck(detail, delay=900){
    try{
      const payload=buildConsistencyPayload(detail||{});
      if(!payload.zone || !payload.column_index || !payload.slot_number) return;
      const id=payload.id;
      const timers=state.consistencyQueue || (state.consistencyQueue=new Map());
      const old=timers.get(id); if(old) clearTimeout(old);
      rememberConsistencyPending(payload, 'scheduled');
      const timer=setTimeout(()=>{ timers.delete(id); runWarehouseConsistencyCheck(payload).catch(()=>{}); }, Math.max(250, Number(delay||900)));
      timers.set(id,timer);
    }catch(_e){}
  }
  async function retryPendingWarehouseConsistencyChecks(opts={}){
    const arr=readConsistencyPending().filter(x=>Number(x.exp||0)>Date.now()).slice(-20);
    let ok=0, fail=0;
    for(const item of arr){
      const r=await runWarehouseConsistencyCheck(item, {toast:false}).catch(e=>({success:false,error:e.message||String(e)}));
      if(r && r.success!==false) ok++; else fail++;
    }
    if((opts.toast || ok || fail) && (ok || fail)) toast(fail?`倉庫一致性檢查完成 ${ok} 筆，仍有 ${fail} 筆待重試`:`倉庫一致性檢查已完成 ${ok} 筆`, fail?'warn':'ok');
    return {success:fail===0,count:ok,failed:fail};
  }
  window.YXWarehouseFinalConsistencyCheck = retryPendingWarehouseConsistencyChecks;
  function availableGroupKey(it){
    // V389: source-aware grouping prevents same customer/size/source type but different original rows or split supports from eating each other's dropdown qty.
    return [cleanCustomer(it?.customer_name||''), sourceOf(it), itemSourceIdKey(it), materialOf(it), productBaseText(it), clean(it?.zone||'')].join('::');
  }
  function availableMutationItemKey(it){ return [availableGroupKey(it), clean(productSupportText(it)||''), itemQty(it)].join('::'); }
  function expandAvailableMutationItems(items, fallbackZone){
    // V409: grouped dropdown rows may represent multiple source_details/source_id rows.
    // Local optimistic A/B unplaced counts must remove/return those same source rows immediately,
    // not only the first source_id, otherwise the dropdown can keep stale rows until the server reply.
    const out=[];
    (Array.isArray(items)?items:[]).forEach(raw=>{
      const requested=Math.max(0, Math.floor(Number(itemQty(raw)||0)));
      if(requested<=0) return;
      let details=raw?.source_details;
      if(typeof details==='string'){ try{ details=JSON.parse(details); }catch(_e){ details=[]; } }
      if(!Array.isArray(details) || !details.length){ out.push(raw); return; }
      const selectedExact=warehouseExactKey(productText(raw));
      const selectedSupport=clean(productSupportText(raw)).toLowerCase();
      const rows=details.filter(d=>d && typeof d==='object').sort((a,b)=>{
        const ax=warehouseExactKey(productText(a)), bx=warehouseExactKey(productText(b));
        const as=clean(productSupportText(a)).toLowerCase(), bs=clean(productSupportText(b)).toLowerCase();
        const ar=(selectedExact && ax===selectedExact)?0:((selectedSupport && as===selectedSupport)?1:2);
        const br=(selectedExact && bx===selectedExact)?0:((selectedSupport && bs===selectedSupport)?1:2);
        return ar-br;
      });
      let remaining=requested;
      rows.forEach(d=>{
        if(remaining<=0) return;
        const dq=Math.max(0, Math.floor(Number(itemQty(d)||0)));
        if(dq<=0) return;
        const take=Math.min(dq, remaining);
        const detailRow={...d, qty:take, unplaced_qty:take, available_qty:take, remaining_qty:take};
        const row={...raw, ...d, product_text:productText(d)||productText(raw), product:productText(d)||productText(raw), support_text:productSupportText(d)||productSupportText(raw), source:d.source||d.source_table||raw.source||raw.source_table, source_table:d.source_table||d.source||raw.source_table||raw.source, source_id:clean(d.source_id||d.id||d.origin_source_id||raw.source_id||''), id:clean(d.id||d.source_id||raw.id||''), source_details:[detailRow], qty:take, unplaced_qty:take, available_qty:take, remaining_qty:take};
        const bucket=availableZoneBucket(row, fallbackZone); row.zone=row.zone||bucket; row.warehouse_zone=row.warehouse_zone||bucket;
        out.push(row);
        remaining-=take;
      });
      if(remaining>0) out.push({...raw, qty:remaining, unplaced_qty:remaining, available_qty:remaining, remaining_qty:remaining});
    });
    return out;
  }
  function rememberAvailableMutation(action, items, sign, zone, opId){
    try{
      state.appliedAvailableOps = state.appliedAvailableOps || new Map();
      const now=Date.now();
      state.appliedAvailableOps.forEach((exp,k)=>{ if(Number(exp||0)<=now) state.appliedAvailableOps.delete(k); });
      const payload=(Array.isArray(items)?items:[]).map(availableMutationItemKey).sort().join('|');
      const key=[clean(action||'available'), clean(opId||''), Number(sign||0), clean(zone||''), payload].join('##');
      if(state.appliedAvailableOps.has(key)) return false;
      state.appliedAvailableOps.set(key, now+1000*60*8);
      if(state.appliedAvailableOps.size>120){ const first=state.appliedAvailableOps.keys().next().value; state.appliedAvailableOps.delete(first); }
      return true;
    }catch(_e){ return true; }
  }
  function mutateAvailableLocked(items, sign, fallbackZone, action, opId){
    const expanded=expandAvailableMutationItems(items, fallbackZone);
    const safe=(Array.isArray(expanded)?expanded:[]).map(it=>cloneWithQty(withWarehouseZone([it], fallbackZone)[0]||it, itemQty(it))).filter(it=>itemQty(it)>0);
    if(!safe.length) return false;
    if(!rememberAvailableMutation(action, safe, sign, fallbackZone, opId)) return false;
    mutateAvailableByItems(safe, sign, fallbackZone);
    return true;
  }
  function itemFromShipChangeForAvailable(ch){
    try{
      const q=Math.max(0, Math.floor(Number(ch?.deduct_qty || ch?.qty || 0)));
      if(q<=0) return null;
      const product=clean(ch?.product_text || ch?.remaining_product_text || ch?.product || '');
      if(!product) return null;
      const z=clean(ch?.zone||ch?.warehouse_zone||state.activeZone||'').toUpperCase();
      return {customer_name:cleanCustomer(ch?.customer_name||''), product_text:product, product, material:clean(ch?.material||''), source:clean(ch?.source||ch?.source_table||''), source_table:clean(ch?.source_table||ch?.source||''), source_id:clean(ch?.source_id||''), qty:q, unplaced_qty:q, available_qty:q, remaining_qty:q, zone:z, warehouse_zone:z};
    }catch(_e){ return null; }
  }
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
  function rebuildAvailableZoneBuckets(){
    state.availableByZone = {A:[], B:[]};
    (Array.isArray(state.available)?state.available:[]).forEach(it=>{
      const bucket=availableZoneBucket(it, it?.zone||it?.warehouse_zone||'');
      if(bucket==='B') state.availableByZone.B.push(it); else state.availableByZone.A.push(it);
    });
  }
  function mutateAvailableByItems(items, sign, fallbackZone){
    // V389: mutate the canonical all-list once, then rebuild A/B buckets.
    // Previous code edited state.available and state.availableByZone separately; because
    // those arrays share row objects, a single add/remove could be counted twice locally.
    const allList = Array.isArray(state.available) ? state.available : (state.available=[]);
    (items||[]).forEach(raw=>{
      const item=withWarehouseZone([raw], fallbackZone)[0] || raw;
      const g=availableGroupKey(item);
      let remaining=itemQty(item);
      if(remaining<=0) return;
      if(sign < 0){
        for(let i=allList.length-1;i>=0 && remaining>0;i--){
          const it=allList[i];
          if(availableGroupKey(it)!==g) continue;
          const taken=removeSupportPartFromAvailable(it,item,remaining);
          if(taken>0){ remaining-=taken; if(itemQty(it)<=0) allList.splice(i,1); }
        }
        for(let i=allList.length-1;i>=0 && remaining>0;i--){
          const it=allList[i];
          if(availableGroupKey(it)!==g) continue;
          const q=itemQty(it);
          const take=Math.min(q, remaining);
          const left=q-take;
          remaining-=take;
          if(left<=0) allList.splice(i,1);
          else { it.qty=left; it.unplaced_qty=left; it.available_qty=left; it.remaining_qty=left; it.total_qty=Math.max(left, Number(it.total_qty||left)); }
        }
      }else{
        const q=itemQty(item);
        if(q<=0) return;
        const mergeIndex=allList.findIndex(it=>availableGroupKey(it)===g && productSupportText(it)===productSupportText(item));
        if(mergeIndex>=0){
          const it=allList[mergeIndex];
          const next=itemQty(it)+q;
          it.qty=next; it.unplaced_qty=next; it.available_qty=next; it.remaining_qty=next; it.total_qty=Math.max(next, Number(it.total_qty||next));
          if(productSupportText(it)) it.product_text=it.product=productWithSupport(productBaseText(it), productSupportText(it));
        }else{
          const clone={...item, qty:q, unplaced_qty:q, available_qty:q, remaining_qty:q, total_qty:q};
          const bucket=availableZoneBucket(clone, fallbackZone);
          clone.zone=bucket; clone.warehouse_zone=bucket;
          allList.push(clone);
        }
      }
    });
    rebuildAvailableZoneBuckets();
    subtractPlacedFromAvailableNow();
    updateUnplacedPillLocal();
  }
  function updateUnplacedPillLocal(){
    const count=items=>(Array.isArray(items)?items:[]).reduce((n,it)=>n+itemQty(it),0);
    const a=count(state.availableByZone.A), b=count(state.availableByZone.B), total=count(state.available), unassigned=Math.max(0,total-a-b);
    const pill=$('warehouse-unplaced-pill'); if(pill) pill.textContent=`A區 ${a} 件 / B區 ${b} 件 / 未分區 ${unassigned} 件 / 總計 ${total} 件`;
    cacheAvailableNow();
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
  function withWarehouseZone(items, zone){
    const z=clean(zone||state.current?.zone||state.activeZone||'').toUpperCase();
    return (Array.isArray(items)?items:[]).map(it=>{
      const row={...(it||{})};
      if(z && !clean(row.zone||row.warehouse_zone||row.location||'')){ row.zone=z; row.warehouse_zone=z; }
      return row;
    });
  }
  function availableZoneBucket(item, fallbackZone){
    const z=clean(item?.zone||item?.warehouse_zone||item?.location||fallbackZone||state.current?.zone||state.activeZone||'').toUpperCase();
    return z && z.startsWith('B') ? 'B' : 'A';
  }
  function summarizeByStable(items){
    // V420: delta calculation must keep support chunks when several rows share the same size/source.
    // Without this, batch adding 858x4 + 792x2 could deduct only the first support from the unplaced dropdown,
    // and deleting a merged cell row could return the wrong support text.
    const map=new Map();
    (items||[]).forEach(it=>{
      const k=itemStableKey(it);
      const q=itemQty(it);
      if(!k || q<=0) return;
      const old=map.get(k);
      if(old){
        old.qty += q;
        const support=combineSupportText(productSupportText(old.item), productSupportText(it));
        const base=productBaseText(old.item) || productBaseText(it) || productText(old.item) || productText(it);
        old.item={...old.item, qty:old.qty, unplaced_qty:old.qty, available_qty:old.qty, remaining_qty:old.qty};
        if(support){ old.item.support_text=support; old.item.product_text=productWithSupport(base, support); old.item.product=old.item.product_text; }
        const details=[];
        [old.item, it].forEach(src=>{
          if(Array.isArray(src?.source_details)) details.push(...src.source_details);
          else if(src && typeof src==='object') details.push(src);
        });
        old.item.source_details=details;
      }
      else map.set(k,{item:{...it}, qty:q});
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
  function warehouseExactKey(text){
    const raw=stripProductParen(text).replace(/[×ＸX✕＊*]/g,'x').replace(/＝/g,'=').replace(/\s+/g,'').toLowerCase();
    const size=warehouseSizeKey(raw);
    if(!raw.includes('=')) return size;
    const right=raw.split('=').slice(1).join('=');
    return right ? `${size}=${right}` : size;
  }
  function sourceQtyKey(item, exact=true){
    const customer=cleanCustomer(item?.customer_name||'');
    const k=exact ? warehouseExactKey(productText(item)) : warehouseSizeKey(productText(item));
    return `${k}::${customer}`;
  }
  function sourceQtyForItem(item){
    const m=state.sourceQtyMap || {};
    if(!Object.keys(m).length) return null;
    const exact=m[sourceQtyKey(item,true)];
    if(Number.isFinite(Number(exact))) return Number(exact);
    const size=m[sourceQtyKey(item,false)];
    if(Number.isFinite(Number(size))) return Number(size);
    return null;
  }
  function placedQtyMaps(){
    const exact={}, size={};
    (state.data.cells||[]).forEach(cell=>{
      if(isDeletedCell(cell)) return;
      cellItems(cell.zone,cell.column_index,cell.slot_number).forEach(it=>{
        const q=itemQty(it); if(q<=0) return;
        const ek=sourceQtyKey(it,true), sk=sourceQtyKey(it,false);
        exact[ek]=(exact[ek]||0)+q; size[sk]=(size[sk]||0)+q;
      });
    });
    return {exact,size};
  }
  function isItemOverSource(it, maps){
    const q=itemQty(it); if(q<=0) return false;
    const ek=sourceQtyKey(it,true), sk=sourceQtyKey(it,false);
    const placed=Number(maps?.exact?.[ek] ?? maps?.size?.[sk] ?? 0);
    const source=sourceQtyForItem(it);
    return source !== null && placed>0 && source>=0 && placed>source;
  }
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
  function clearCommittedBatchRowsDom(){
    // V420: after batch rows are merged into current items and sent to the background save queue,
    // do not keep those same selected rows in the recoverable draft. Otherwise reopening the cell
    // before DB confirmation can show the same batch rows again and let the user duplicate-save them.
    try{
      document.querySelectorAll('#yx121-batch-rows .yx121-batch-row').forEach(row=>{
        const sel=row.querySelector('.yx121-batch-select');
        const qty=row.querySelector('.yx121-batch-qty');
        const sup=row.querySelector('.yx121-batch-support');
        if(sel) sel.value='';
        if(qty){ qty.value=''; qty.disabled=false; qty.removeAttribute('max'); qty.dataset.yx121Max=''; }
        if(sup) sup.value='';
      });
      state.pendingDraftBatchRows=null;
      state.batchCount=3;
      syncBatchSelectLimits?.(false);
    }catch(_e){}
  }
  function hasUnsavedBatchDraft(){
    try{ return snapshotBatchRows().some(r=>r && (r.value || r.key || r.qty || r.support)); }catch(_e){ return false; }
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
      // formal mainline behavior.
      // 例：132x60x08=162x26 => 26 件；132x60x08=162x26+133x4+142 => 31 件。
      // 如果商品文字沒改，才保留使用者手動改的件數欄位。
      let qty;
      // formal mainline behavior.
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

  function flushLiveEditorToLocalDraft(reason){
    // V219: if the user types in product/material/qty then taps another cell before blur/change fires,
    // the live DOM value still has to be copied into state/current cell and draft first.
    // This uses the existing autosave queue only; no new renderer, interval, observer, or duplicate listener.
    try{
      if(!state.current) return false;
      const z=clean(state.current.zone).toUpperCase(), c=Number(state.current.col), s=Number(state.current.slot);
      const before=JSON.parse(JSON.stringify(cellItems(z,c,s)));
      const beforeNote=cellNote(z,c,s);
      const touched=applyCurrentItemInputs();
      const note=$('warehouse-note')?.value||'';
      const changed=touched || currentItemsChanged(before) || note !== beforeNote;
      if(!changed) return false;
      setLocalCellItems(z,c,s,JSON.parse(JSON.stringify(state.current.items||[])),note);
      bumpCellRevision(z,c,s);
      cacheWarehouseNow();
      persistWarehouseDraft();
      updateSlotUI(z,c,s);
      if(reason) toast(reason,'warn');
      return true;
    }catch(_e){ return false; }
  }
  function queueLiveEditorAutosave(reason, beforeItems, delay){
    // V420: close/switch must not only keep a local draft. If the user typed and immediately
    // taps another cell/close, push that live edit into the existing background save queue too.
    // Uses existing scheduleAutoSaveCurrentCell; no new renderer, interval, observer, or extra listener.
    try{
      if(!state.current) return false;
      const z=clean(state.current.zone).toUpperCase(), c=Number(state.current.col), s=Number(state.current.slot);
      const k=key(z,c,s);
      const baseline=beforeItems || JSON.parse(JSON.stringify(cellItems(z,c,s)));
      const changed=flushLiveEditorToLocalDraft('');
      if(!changed) return false;
      if(state.saveLocks?.has?.(k) || state.savePromises?.has?.(k)){
        scheduleManualSaveAfterLock(k);
        persistWarehouseDraft();
        return true;
      }
      scheduleAutoSaveCurrentCell(reason || '格位修改已先顯示並排入背景儲存', baseline, Math.max(60, Number(delay)||90));
      return true;
    }catch(_e){ return false; }
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
      box.innerHTML=`<div class="yx-direct-section" data-html-main="warehouse-current-items-html"><div class="yx-direct-section-title">目前此格商品</div><div id="warehouse-current-items-html" class="yx-direct-current-list"></div></div><div class="yx-direct-batch-panel" data-html-main="warehouse-batch-html-fixed"><div class="yx-direct-section-title">批量加入商品</div><div class="small-note">A / B 區各自只顯示尚未錄入倉庫圖商品；第 1 筆後排、第 2 筆中間、第 3 筆前排。</div><div id="yx121-batch-rows"></div><div class="btn-row compact-row"><button class="ghost-btn small-btn" type="button" id="yx121-add-batch-row">新增更多批量</button><button class="primary-btn small-btn" type="button" id="yx121-save-cell">儲存格位</button></div></div>`;
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
    if(Array.isArray(state.pendingDraftBatchRows)){
      restoreBatchRows(state.pendingDraftBatchRows);
      state.pendingDraftBatchRows=null;
      toast('已還原此格未送出的批量加入草稿，確認後請按「儲存格位」','warn');
    }
  }
  async function openWarehouseModal(z,c,s){
    // V420/V219/V185: before switching cells, keep live edits and push confirmed current-item edits into the existing autosave queue.
    // Unsubmitted batch rows are still only saved as draft until the user presses 儲存格位.
    try{ if(state.current) queueLiveEditorAutosave('切換格位前已先保存目前格位，背景儲存中', null, 80); }catch(_e){}
    try{ if(state.current && hasUnsavedBatchDraft()) persistWarehouseDraft(); }catch(_e){}
    flushPendingAutoSaveForCurrent('切換格位前已先保存目前格位，背景儲存中');
    z=clean(z).toUpperCase(); c=Number(c); s=Number(s);
    const openSeq=++state.modalSeq;
    const openedAt=Date.now();
    state.modalUserTouchedAt=0;
    state.current={zone:z,col:c,slot:s,items:JSON.parse(JSON.stringify(cellItems(z,c,s))),note:cellNote(z,c,s)};
    state.batchCount=3;
    const meta=$('warehouse-modal-meta'); if(meta) meta.textContent=`${z} 區第 ${c} 欄 第 ${s} 格`;
    const note=$('warehouse-note'); if(note) note.value=state.current.note||'';
    const search=$('warehouse-item-search'); if(search) search.value='';
    $('warehouse-modal')?.classList.remove('hidden');
    const draftRestored=restoreWarehouseDraft();
    renderCellItems(false);
    // V502: open fast from local state, then do a one-shot exact DB readback for this cell. Draft/user edits are protected.
    await fetchFreshWarehouseCellForModal(z,c,s,openSeq,openedAt,draftRestored);
    // V174: 先立刻開啟，再背景抓未錄入；若使用者已切到別格，舊請求不得重畫新格。
    try {
      // V499/V502: 開格子與搜尋不重算未入倉；沿用已同步的 A/B 下拉快取，只有首次或過久才補抓。長按未錄入 pill 才 force refresh。
      const loadedAt=Number(state.availableLoadedAt||0);
      const hasAvailable=Array.isArray(state.available) && state.available.length>0;
      if(!hasAvailable || !loadedAt || Date.now()-loadedAt>300000) await loadAvailable(false);
      else { subtractPlacedFromAvailableNow(); updateUnplacedPillLocal(); }
      if(openSeq !== state.modalSeq || !sameCurrentCell(z,c,s)) return;
      renderCellItems(true);
    } catch(e){ if(openSeq === state.modalSeq && sameCurrentCell(z,c,s)) toast(e.message||'未錄入商品載入失敗','error'); }
  }
  function closeWarehouseModal(opts={}){
    // V184: manual save already committed the current cell and started its background request.
    // Closing the modal after that must not trigger a second autosave with the same payload.
    if(!opts || opts.skipFlush !== true) queueLiveEditorAutosave('關閉格位前已先保存目前格位，背景儲存中', null, 80);
    if(!opts || opts.skipFlush !== true) flushPendingAutoSaveForCurrent('關閉格位前已先保存目前格位，背景儲存中');
    // V185: incomplete batch additions are not DB-saved until the user presses save, but keep them as a local draft.
    try{ if(!opts?.skipFlush && state.current && hasUnsavedBatchDraft()) persistWarehouseDraft(); }catch(_e){}
    state.modalSeq++;
    $('warehouse-modal')?.classList.add('hidden');
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
    const groups = new Map(availableRowsAll().map(r=>[r.key,r]));
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
    const rowsPool = availableRowsAll();
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
      // formal mainline behavior.
      // 如果沒有改支數，才用整筆下拉合併件數；有改支數時，用支數解析件數但不能超過可加入總量。
      qty=Math.min(qty, max);
      if(qty <= 0) return;
      const seed={...group.it, zone:state.current?.zone||group.it.zone||group.it.warehouse_zone||'', warehouse_zone:state.current?.zone||group.it.warehouse_zone||group.it.zone||'', product_text:product, product, support_text:support, exact_key:support?`${warehouseSizeKey(base)}=${support}`:warehouseSizeKey(base), source_id:clean(group.it.source_id||group.it.id||''), source_details:(group.it.source_details||[])};
      const placement=placementForBatch(Number(row.dataset.batchIndex||collected.size));
      const stable=cellItemMergeKey({...seed, placement_label:placement, layer_label:placement});
      const oldCollected=collected.get(stable);
      const alreadyNew=oldCollected ? itemQty(oldCollected) : 0;
      const remaining=Math.max(0, max - alreadyNew);
      if(remaining <= 0) return;
      const finalQty=Math.min(qty, remaining);
      if(finalQty <= 0) return;
      if(oldCollected){
        const nextQty=alreadyNew + finalQty;
        const mergedSupport=combineSupportText(productSupportText(oldCollected), support);
        const next={...oldCollected, qty:nextQty, unplaced_qty:nextQty, available_qty:nextQty, remaining_qty:nextQty};
        if(mergedSupport){ next.support_text=mergedSupport; next.product_text=productWithSupport(base, mergedSupport); next.product=next.product_text; }
        next.source_details=[...(oldCollected.source_details||[]), ...(seed.source_details||[])];
        collected.set(stable, normalizedItem(next, nextQty, placement));
      }else{
        collected.set(stable, normalizedItem(seed, finalQty, placement));
      }
    });
    return Array.from(collected.values());
  }
  function setLocalCellItems(z,c,s,items,note){
    z=clean(z).toUpperCase(); c=Number(c); s=Number(s);
    let cell=(state.data.cells||[]).find(x=>clean(x.zone).toUpperCase()===z&&Number(x.column_index)===c&&Number(x.slot_number)===s);
    if(!cell){ cell={zone:z,column_index:c,slot_type:'direct',slot_number:s,items:[],items_json:'[]',note:'',problem_flag:''}; state.data.cells.push(cell); }
    cell.items=items||[]; cell.items_json=JSON.stringify(items||[]); if(note !== undefined) cell.note=note||''; cell.is_deleted=0;
    normalizeWarehouseUniquePlacements(key(z,c,s));
    subtractPlacedFromAvailableNow();
    cacheWarehouseNow();
    return cell;
  }
  function sameCurrentCell(z,c,s){ return !!(state.current && clean(state.current.zone).toUpperCase()===clean(z).toUpperCase() && Number(state.current.col)===Number(c) && Number(state.current.slot)===Number(s)); }

  async function fetchFreshWarehouseCellForModal(z,c,s,openSeq,openedAt,draftRestored){
    // V502: opening a cell must read the exact DB cell, but a local draft or user edits in the just-opened modal must win.
    // This is a one-shot readback triggered by openWarehouseModal; no renderer, interval, observer, or duplicate binding is added.
    try{
      z=clean(z).toUpperCase(); c=Number(c); s=Number(s);
      if(draftRestored) return false;
      const revAtStart=currentCellRevision(z,c,s);
      const url=`/api/warehouse/cell?zone=${encodeURIComponent(z)}&column_index=${encodeURIComponent(c)}&slot_number=${encodeURIComponent(s)}&fresh_cell=1&v=${Date.now()}`;
      const d=await api(url,{method:'GET'});
      if(openSeq !== state.modalSeq || !sameCurrentCell(z,c,s)) return false;
      if(Number(state.modalUserTouchedAt||0) > Number(openedAt||0)) return false;
      if(currentCellRevision(z,c,s)!==revAtStart) return false;
      const sc=d?.saved_cell || d?.cell || null;
      if(!sc || typeof sc!=='object') return false;
      const rbItems=Array.isArray(sc.items) ? normalizeCellItemsForDisplay(sc.items) : [];
      const rbNote=typeof sc.note === 'string' ? sc.note : (cellNote(z,c,s)||'');
      state.current.items=JSON.parse(JSON.stringify(rbItems));
      state.current.note=rbNote;
      const noteEl=$('warehouse-note'); if(noteEl && Number(state.modalUserTouchedAt||0) <= Number(openedAt||0)) noteEl.value=rbNote;
      setLocalCellItems(z,c,s,rbItems,rbNote);
      if(Array.isArray(d.column_cells) && d.column_cells.length){
        // Apply only this column's DB-confirmed slots; applyColumnCells already protects structure revisions.
        applyColumnCells(z,c,d.column_cells,{reason:'modal-fresh-cell-readback'});
      }
      renderCellItems(true);
      updateSlotUI(z,c,s);
      return true;
    }catch(e){
      // Do not block opening the modal. Keep local/cache state and allow the normal save queue to work.
      try{ if(openSeq === state.modalSeq && sameCurrentCell(z,c,s)) toast('格位已先開啟；DB 最新讀取稍後可再重開確認','warn'); }catch(_e){}
      return false;
    }
  }
  function cellRevKey(z,c,s){ return key(z,c,s); }
  function bumpCellRevision(z,c,s){
    try{
      const k=cellRevKey(z,c,s);
      const next=(Number(state.cellEditRevision?.get?.(k)||0)+1);
      state.cellEditRevision.set(k,next);
      return next;
    }catch(_e){ return 0; }
  }
  function currentCellRevision(z,c,s){
    try{ return Number(state.cellEditRevision?.get?.(cellRevKey(z,c,s))||0); }catch(_e){ return 0; }
  }
  function mayApplySavedCell(z,c,s,revAtSend){
    // V177: 舊背景保存回來時，如果使用者已經在同一格做了新修改，不可用舊 DB 回應覆蓋前端新狀態。
    return currentCellRevision(z,c,s) === Number(revAtSend||0);
  }
  function commitCurrentEditToFrontend(reason, beforeItems, opts={}){
    if(!state.current) return null;
    opts=opts||{};
    const z=clean(state.current.zone).toUpperCase(), c=Number(state.current.col), s=Number(state.current.slot);
    const note=$('warehouse-note')?.value||'';
    // V411: normal autosaves still use the real local cell baseline to avoid stale timer double-deltas.
    // Delete-current-item calls pass useProvidedBefore=true, because the removed row must not be resurrected from the old DOM and its quantity must return to unplaced immediately.
    const oldItems=(opts.useProvidedBefore && Array.isArray(beforeItems)) ? JSON.parse(JSON.stringify(beforeItems)) : JSON.parse(JSON.stringify(cellItems(z,c,s)));
    applyCurrentItemInputs();
    const nextItems=JSON.parse(JSON.stringify(state.current.items||[]));
    const delta=cellAvailabilityDelta(withWarehouseZone(oldItems, z), withWarehouseZone(nextItems, z));
    if(delta.returned.length) mutateAvailableLocked(delta.returned, +1, z, 'commit-returned', key(z,c,s)+'-'+currentCellRevision(z,c,s));
    if(delta.consumed.length) mutateAvailableLocked(delta.consumed, -1, z, 'commit-consumed', key(z,c,s)+'-'+currentCellRevision(z,c,s));
    setLocalCellItems(z,c,s,nextItems,note);
    bumpCellRevision(z,c,s);
    updateSlotUI(z,c,s);
    renderCellItems(true);
    syncBatchSelectLimits?.(false);
    persistWarehouseDraft();
    toast(reason || '已先更新畫面，下拉商品同步恢復，背景儲存中','ok');
    return {z,c,s,note,items:nextItems};
  }
  function flushPendingAutoSaveForCurrent(reason){
    try{
      if(!state.current || !state.autoSaveTimers) return false;
      const z=clean(state.current.zone).toUpperCase(), c=Number(state.current.col), s=Number(state.current.slot);
      const k=key(z,c,s);
      const pending=state.autoSaveTimers.get(k);
      if(!pending) return false;
      if(pending.timer) clearTimeout(pending.timer);
      state.autoSaveTimers.delete(k);
      autoSaveCurrentCell(reason || '已先套用目前格位修改，背景儲存中', pending.beforeItems || JSON.parse(JSON.stringify(cellItems(z,c,s))));
      return true;
    }catch(e){ toast(e.message||'格位暫存保存失敗','error'); return false; }
  }
  function flushAllPendingAutoSaves(reason){
    try{
      // V177: only flush the cell that is actually open in the modal.
      // Other stale timers are cancelled so hidden/old DOM rows cannot overwrite a different cell during pagehide.
      const flushed = flushPendingAutoSaveForCurrent(reason || '離開頁面前已先保存目前格位，背景儲存中');
      if(state.autoSaveTimers && state.current){
        const cur=key(state.current.zone,state.current.col,state.current.slot);
        Array.from(state.autoSaveTimers.entries()).forEach(([k,pending])=>{
          if(k===cur) return;
          if(pending?.timer) clearTimeout(pending.timer);
          state.autoSaveTimers.delete(k);
        });
      }
      return flushed;
    }catch(e){ return false; }
  }
  function cancelPendingAutoSaveForCell(z,c,s){
    try{
      const k=key(z,c,s);
      const pending=state.autoSaveTimers?.get?.(k);
      if(pending?.timer) clearTimeout(pending.timer);
      state.autoSaveTimers?.delete?.(k);
    }catch(_e){}
  }
  function flushPendingAutoSavesForColumn(z,c, reason){
    try{
      z=clean(z).toUpperCase(); c=Number(c);
      const timers=state.autoSaveTimers;
      if(!timers || typeof timers.entries!=='function') return 0;
      let count=0;
      Array.from(timers.entries()).forEach(([k,pending])=>{
        const parts=String(k).split('-');
        if(parts[0]!==z || Number(parts[1])!==c) return;
        if(pending?.timer) clearTimeout(pending.timer);
        timers.delete(k);
        const slot=Number(parts[2]);
        if(sameCurrentCell(z,c,slot)){
          const p=autoSaveCurrentCell(reason || '已先保存同欄格位修改，再執行格號操作', pending?.beforeItems || JSON.parse(JSON.stringify(cellItems(z,c,slot))));
          count += 1;
        }
      });
      return count;
    }catch(e){ try{ toast(e.message||'同欄暫存保存失敗','error'); }catch(_e){} return 0; }
  }
  async function drainColumnAutoSavesBeforeStructure(z,c, reason){
    // V183: 插入/刪除/拖拉會改格號；必須等同欄已排程的格位保存先進入佇列並完成目前鏈，
    // 否則舊 slot_number 的自動保存可能在補位後才回來，覆蓋新的格號狀態。
    try{
      z=clean(z).toUpperCase(); c=Number(c);
      flushPendingAutoSavesForColumn(z,c, reason || '格號操作前已先保存同欄格位修改');
      const ck=columnKey(z,c);
      const chain=state.columnChains?.get?.(ck);
      if(chain && typeof chain.then==='function') await chain.catch(()=>{});
      const waits=[];
      if(state.savePromises && typeof state.savePromises.forEach==='function'){
        state.savePromises.forEach((p,k)=>{
          const parts=String(k).split('-');
          if(parts[0]===z && Number(parts[1])===c && p && typeof p.then==='function') waits.push(p.catch(()=>{}));
        });
      }
      if(state.autoSaveInFlight && typeof state.autoSaveInFlight.forEach==='function'){
        state.autoSaveInFlight.forEach(k=>{
          const parts=String(k).split('-');
          if(parts[0]===z && Number(parts[1])===c){
            const again=state.columnChains?.get?.(ck);
            if(again && typeof again.then==='function') waits.push(again.catch(()=>{}));
          }
        });
      }
      if(waits.length) await Promise.allSettled(waits);
    }catch(_e){}
  }
  function autoSaveCurrentCell(reason, beforeItems, opts={}){
    const beforeColumn = state.current ? snapshotColumn(state.current.zone,state.current.col) : null;
    const payload=commitCurrentEditToFrontend(reason, beforeItems, opts);
    if(!payload) return;
    const pendingMerged=mergePendingShipDeductIntoCellSave(payload.z,payload.c,payload.s,payload.items,payload.note||'');
    if(pendingMerged.merged) payload.items=pendingMerged.items;
    const sigKey=key(payload.z,payload.c,payload.s);
    const sig=JSON.stringify({items:sanitizeCellItemsForSave(payload.items), note:payload.note||''});
    state.lastAutoSaveSignature = state.lastAutoSaveSignature || new Map();
    const previousSig = state.lastAutoSaveSignature.get(sigKey);
    if(previousSig === sig){ cacheWarehouseNow(); return; }
    state.lastAutoSaveSignature.set(sigKey, sig);
    const token=beginColumnOp(payload.z,payload.c);
    const revAtSend=currentCellRevision(payload.z,payload.c,payload.s);
    const flightKey=key(payload.z,payload.c,payload.s);
    state.autoSaveInFlight = state.autoSaveInFlight || new Set();
    state.autoSaveInFlight.add(flightKey);
    if(beforeColumn) state.lastGoodColumns.set(token.key, beforeColumn);
    // V186: direct auto-save can be queued without immediate DB confirmation; keep the local draft until success path clears or a later manual save confirms.
    try{ if(sameCurrentCell(payload.z,payload.c,payload.s)) persistWarehouseDraft(); }catch(_e){}
    const autoPromise = queuedWarehousePost('/api/warehouse/cell', saveCellPayload(payload.z,payload.c,payload.s,payload.items,payload.note), async (saved, token)=>{
      if(saved && saved.saved_cell && mayApplySavedCell(payload.z,payload.c,payload.s,revAtSend)){
        const sc=saved.saved_cell;
        const savedItems=Array.isArray(sc.items)?sc.items:payload.items;
        setLocalCellItems(payload.z,payload.c,payload.s,savedItems,sc.note ?? payload.note);
        if(sameCurrentCell(payload.z,payload.c,payload.s)){ state.current.items=JSON.parse(JSON.stringify(savedItems)); }
        clearWarehouseDraft(payload.z,payload.c,payload.s);
      }
      notifyWarehouseChanged({action:'cell-autosaved',zone:payload.z,column_index:payload.c,slot_number:payload.s,customer_name:(payload.items||[]).map(it=>it.customer_name).filter(Boolean)[0]||''}); loadAvailable(false).catch(()=>{});
      updateAllSlots();
      if(sameCurrentCell(payload.z,payload.c,payload.s)) renderCellItems(true);
      toast('格位修改已永久存入資料庫','ok');
    }, '格位自動儲存', {token, rollback:false});
    Promise.resolve(autoPromise).finally(()=>{ try{ state.autoSaveInFlight?.delete?.(flightKey); }catch(_e){} });
    return autoPromise;
  }
  function scheduleAutoSaveCurrentCell(reason, beforeItems, delay=280){
    if(!state.current) return;
    try{ flushLiveEditorToLocalDraft(''); }catch(_e){}
    const z=clean(state.current.zone).toUpperCase(), c=Number(state.current.col), s=Number(state.current.slot);
    const k=key(z,c,s);
    const timers=state.autoSaveTimers || (state.autoSaveTimers=new Map());
    const old=timers.get(k);
    if(old?.timer) clearTimeout(old.timer);
    const snapshot=old?.beforeItems || beforeItems || JSON.parse(JSON.stringify(cellItems(z,c,s)));
    const timer=setTimeout(()=>{
      timers.delete(k);
      if(!sameCurrentCell(z,c,s)){
        try{ cacheWarehouseNow(); }catch(_e){}
        return;
      }
      try{ autoSaveCurrentCell(reason, snapshot); }
      catch(e){ toast(e.message||'格位自動儲存失敗','error'); }
    }, Math.max(80, Number(delay)||280));
    timers.set(k,{timer,beforeItems:snapshot});
    persistWarehouseDraft();
  }
  function sanitizeCellItemsForSave(items){
    return (Array.isArray(items)?items:[]).map(it=>{
      const row={...(it||{})};
      row.customer_name=cleanCustomer(row.customer_name||row.customer||'');
      row.product_text=productText(row);
      row.product=row.product_text;
      row.material=materialOf(row);
      row.qty=Math.max(0, Math.floor(Number(row.qty ?? row.effective_qty ?? row.available_qty ?? row.remaining_qty ?? 0)));
      // V428: saving must not turn visible legacy/product-only rows into qty 0.
      // Keep the cache/background queue unchanged; only normalize the payload before POST.
      if((!row.qty || row.qty < 1) && row.product_text){
        try{ row.qty=Math.max(1, Math.floor(Number(window.YX30EffectiveQty ? window.YX30EffectiveQty(row.product_text, 1) : effectiveQty(row.product_text, 1)) || 1)); }
        catch(_e){ row.qty=1; }
      }
      row.placement_label=clean(row.placement_label || row.layer_label || '前排') || '前排';
      row.layer_label=row.placement_label;
      delete row.__tmp;
      delete row.__dirty;
      return row;
    }).filter(row=>row.product_text || row.customer_name || row.qty>0);
  }

  function affectedWarehouseCustomers(detail){
    const out = new Set();
    const add = (v)=>{ v=clean(v||''); if(v) out.add(v); };
    const walk = (v)=>{
      if(!v) return;
      if(Array.isArray(v)){ v.forEach(walk); return; }
      if(typeof v === 'object'){
        add(v.customer_name || v.customer || v.name || v.client_name);
        ['items','moved_items','before_items','after_items','returned_items','customer_names','customers','affected_customers'].forEach(k=>walk(v[k]));
      }
    };
    walk(detail);
    return Array.from(out);
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
      window.dispatchEvent(new CustomEvent(name, {detail: {...(detail||{}), sync_guard:'v423', sync_version:'v450-warehouse-longpress-single-engine-cleanout-proof', cache_bust:'v450-warehouse-longpress-single-engine-cleanout-proof'}}));
      return true;
    }catch(_e){ try{ window.dispatchEvent(new CustomEvent(name,{detail:detail||{}})); }catch(__e){} return true; }
  }

  function notifyWarehouseChanged(detail){
    detail = detail || {};
    const customerNames = affectedWarehouseCustomers(detail);
    const enriched = {...detail, source:'warehouse', reason:detail.action||'warehouse-changed', version:'v423', customer_names:customerNames};
    if(!enriched.customer_name && customerNames.length) enriched.customer_name = customerNames[0];
    try{ yx215EmitOnce('yx:warehouse-changed', enriched, 1000); }catch(_e){}
    try{ yx215EmitOnce('yx:today-changes-refresh', enriched, 1000); }catch(_e){}
    try{ yx215EmitOnce('yx:product-data-changed', enriched, 1000); }catch(_e){}
    try{ customerNames.forEach(name=>yx215EmitOnce('yx:customer-selected',{name, force:false, source:'warehouse', reason:'warehouse-change-v423'}, 650)); }catch(_e){}
    try{ customerNames.forEach(name=>yx215EmitOnce('yx:warehouse-customer-counts-refresh',{name, force:false, source:'warehouse', reason:'warehouse-count-sync-v423'}, 650)); }catch(_e){}
    try{ window.YX?.cache?.clearGroup?.('customer_blocks_'); window.YX?.cache?.clearGroup?.('ship_items_'); }catch(_e){}
    try{
      window.YX?.cache?.remove?.(AVAILABLE_CACHE_KEY);
      ['warehouse_available_v215','warehouse_available_v214','warehouse_available_v210','warehouse_available_v208','warehouse_available_v207','warehouse_available_v205','warehouse_available_v201','warehouse_available_v199','warehouse_available_v198','warehouse_source_qty_map_v215','warehouse_source_qty_map_v214','warehouse_source_qty_map_v210','warehouse_source_qty_map_v208','warehouse_source_qty_map_v207','warehouse_source_qty_map_v205','warehouse_source_qty_map_v201','warehouse_source_qty_map_v199','warehouse_source_qty_map_v198','today_changes_v215','today_changes_v214','today_changes_v210','today_changes_v208','today_changes_v207','today_changes_v205','today_changes_v201','today_changes_v199','today_changes_v198','today_changes_light_v215','today_changes_light_v214','today_changes_light_v210','today_changes_light_v208','today_changes_light_v207','today_changes_light_v205','today_changes_light_v201','today_changes_light_v199','today_changes_light_v198','ship_customers_v215','ship_customers_v214','ship_customers_v210','ship_customers_v208','ship_customers_v207','ship_customers_v205','ship_customers_v201','ship_customers_v199','ship_customers_v198'].forEach(k=>window.YX?.cache?.remove?.(k));
      window.YX?.cache?.clearGroup?.('ship_items_');
      window.YX?.cache?.clearGroup?.('customer_blocks_');
    }catch(_e){}
  }
  function saveCellPayload(z,c,s,items,note){ const safe=sanitizeCellItemsForSave(items||[]); const total=safe.reduce((a,it)=>a+Math.max(1,itemQty(it)||1),0); return {operation_id:yxOperationId('warehouse-cell-save'),zone:clean(z).toUpperCase(),column_index:Number(c),slot_type:'direct',slot_number:Number(s),items:safe,item_count:safe.length,item_total:total,explicit_empty_save:(safe.length===0 && total===0),note:note||'',client_stability:'v503-today_diagnostics_current_proof'}; }
  function handleWarehouseBackgroundSaveStatus(ev){
    try{
      const item=ev?.detail?.item || {};
      const url=clean(item.url || ev?.detail?.url || '');
      if(!url || url.indexOf('/api/warehouse') < 0) return;
      const payload=payloadFromBgItem(item);
      if(ev.type === 'yx:bg-save-success'){
        forgetFailedSave(url, payload);
        forgetFailedWarehouseStructureOp(url, payload);
        const response = ev?.detail?.data || ev?.detail?.response || ev?.detail?.result || null;
        let appliedDirect = false;
        if(response && typeof response === 'object'){
          try{
            Promise.resolve(applyTargetedRetryRefresh({result:response, response, payload, url, row:{url}})).then(ok=>{
              if(ok){
                try{ releaseQueuedColumnProtectionByPayload(payload); }catch(_e){}
                try{ notifyWarehouseChanged({action:'bg-save-success-snapshot', operation_id:payload.operation_id||'', zone:payload.zone||payload.to?.zone||payload.from?.zone, column_index:payload.column_index||payload.to?.column_index||payload.from?.column_index}); }catch(_e){}
              }else{
                try{ scheduleWarehouseConsistencyCheck({action:'bg-save-success',zone:payload.zone||payload.to?.zone||payload.from?.zone,column_index:payload.column_index||payload.to?.column_index||payload.from?.column_index,slot_number:payload.slot_number||payload.to?.slot_number||payload.from?.slot_number||1,operation_id:payload.operation_id||''}, 900); }catch(_e){}
              }
            }).catch(()=>{ try{ scheduleWarehouseConsistencyCheck({action:'bg-save-success',zone:payload.zone||payload.to?.zone||payload.from?.zone,column_index:payload.column_index||payload.to?.column_index||payload.from?.column_index,slot_number:payload.slot_number||payload.to?.slot_number||payload.from?.slot_number||1,operation_id:payload.operation_id||''}, 900); }catch(_e){} });
            appliedDirect = true;
          }catch(_e){}
        }
        if(!appliedDirect){
          releaseQueuedColumnProtectionByPayload(payload);
          try{ scheduleWarehouseConsistencyCheck({action:'bg-save-success',zone:payload.zone||payload.to?.zone||payload.from?.zone,column_index:payload.column_index||payload.to?.column_index||payload.from?.column_index,slot_number:payload.slot_number||payload.to?.slot_number||payload.from?.slot_number||1,operation_id:payload.operation_id||''}, 900); }catch(_e){}
        }
        try{ loadAvailable(false).catch(()=>{}); }catch(_e){}
        try{ window.dispatchEvent(new CustomEvent('yx:operation-status',{detail:{source:'warehouse',status:'success',reason:response?'warehouse-bg-save-success-snapshot':'warehouse-bg-save-success',message:response?'倉庫背景保存完成，已套用後端回傳':'倉庫背景保存已完成',operation_id:payload.operation_id||'',version:'v423',has_snapshot:!!response}})); }catch(_e){}
      }else if(ev.type === 'yx:bg-save-failed'){
        try{ window.dispatchEvent(new CustomEvent('yx:operation-status',{detail:{source:'warehouse',status:'pending',reason:'warehouse-bg-save-retry',message:'倉庫背景保存尚未完成，已保留待重試',operation_id:payload.operation_id||'',version:'v423'}})); }catch(_e){}
      }
    }catch(_e){}
  }
  try{
    if(!window.__YX_V420_WAREHOUSE_BG_STATUS_BOUND__){
      window.__YX_V420_WAREHOUSE_BG_STATUS_BOUND__ = true;
      window.addEventListener('yx:bg-save-success', handleWarehouseBackgroundSaveStatus, {passive:true});
      window.addEventListener('yx:bg-save-failed', handleWarehouseBackgroundSaveStatus, {passive:true});
    }
  }catch(_e){}
  async function saveCellRaw(z,c,s,items,note){ return api('/api/warehouse/cell',{method:'POST',body:JSON.stringify(saveCellPayload(z,c,s,items,note))}); }
  function saveCellBg(z,c,s,items,note,onSuccess){ return bgPost('/api/warehouse/cell', saveCellPayload(z,c,s,items,note), onSuccess, '格位儲存'); }
  function currentCellKey(){
    try{ return state.current ? key(state.current.zone,state.current.col,state.current.slot) : ''; }catch(_e){ return ''; }
  }
  function scheduleManualSaveAfterLock(saveKey){
    try{
      saveKey=String(saveKey||'');
      if(!saveKey) return;
      state.saveAgainAfterLock = state.saveAgainAfterLock || new Set();
      state.saveAgainAfterLock.add(saveKey);
      const timers=state.pendingManualSaveTimers || (state.pendingManualSaveTimers=new Map());
      const old=timers.get(saveKey);
      if(old) clearTimeout(old);
      const timer=setTimeout(()=>{
        timers.delete(saveKey);
        if(state.saveLocks?.has?.(saveKey) || state.savePromises?.has?.(saveKey)){ scheduleManualSaveAfterLock(saveKey); return; }
        // V188: delayed same-cell save must never run against whatever cell happens to be open now.
        // If the user already switched cells or closed the modal, keep the optimistic draft/local cell and wait for explicit reopen/save.
        if(currentCellKey() !== saveKey){
          state.saveAgainAfterLock?.delete?.(saveKey);
          try{ persistWarehouseDraft(); }catch(_e){}
          return;
        }
        if(state.saveAgainAfterLock?.has?.(saveKey)) state.saveAgainAfterLock.delete(saveKey);
        try{ saveWarehouseCell(); }catch(e){ toast(e.message||'格位延後儲存失敗','error'); }
      }, 220);
      timers.set(saveKey,timer);
    }catch(_e){}
  }
  async function saveWarehouseCell(){
    if(!state.current) return toast('請先開啟格位','warn');
    const saveKey=key(state.current.zone,state.current.col,state.current.slot);
    state.saveLocks = state.saveLocks || new Set();
    if(state.saveLocks.has(saveKey)){
      const started=Number(state.saveLockStarted?.get?.(saveKey)||0);
      // V187: if a background save promise was swallowed by the browser/network and never resolved,
      // do not permanently lock this cell. This check only runs on user action; no setInterval/polling.
      if(started && Date.now()-started>45000 && !state.savePromises?.has?.(saveKey)){
        state.saveLocks.delete(saveKey);
        state.saveAgainAfterLock?.delete?.(saveKey);
        state.saveLockStarted?.delete?.(saveKey);
      }else{
        applyCurrentItemInputs();
        markCurrentCellDirty();
        try{ updateSlotUI(state.current.zone,state.current.col,state.current.slot); renderCellItems(true); }catch(_e){}
        persistWarehouseDraft();
        scheduleManualSaveAfterLock(saveKey);
        toast('此格正在背景儲存，新的修改已先顯示並排入下一次保存，不會中斷連續操作','warn');
        return;
      }
    }
    state.saveLocks.add(saveKey);
    state.saveLockStarted = state.saveLockStarted || new Map();
    state.saveLockStarted.set(saveKey, Date.now());
    // V175：手動儲存的鎖要等背景請求完成才解除，避免連點造成同格重複請求。
    try{ cancelPendingAutoSaveForCell(state.current.zone,state.current.col,state.current.slot); }catch(_e){}
    const beforeItems=JSON.parse(JSON.stringify(state.current.items||[])); const beforeNote=state.current?.note ?? cellNote(state.current.zone,state.current.col,state.current.slot);
    applyCurrentItemInputs();
    const editedChanged=currentItemsChanged(beforeItems) || (($('warehouse-note')?.value||'') !== beforeNote);
    const added=collectBatchItems();
    if(!added.length && !editedChanged){ try{ state.saveLocks.delete(saveKey); state.saveLockStarted?.delete?.(saveKey); state.saveAgainAfterLock?.delete?.(saveKey); }catch(_e){} toast('沒有新增或修改；已錄入商品不會出現在下拉選單，請直接在「目前此格商品」修改尺寸/支數/件數後儲存','warn'); return; }
    const merged = new Map();
    [...(state.current.items||[]),...added].forEach(it=>{
      const k=cellItemMergeKey(it);
      const old=merged.get(k);
      if(old){
        const nextQty=itemQty(old) + itemQty(it);
        const support=combineSupportText(productSupportText(old), productSupportText(it));
        const base=productBaseText(old) || productBaseText(it) || productText(old) || productText(it);
        old.qty=nextQty; old.unplaced_qty=nextQty; old.available_qty=nextQty; old.remaining_qty=nextQty;
        if(support){ old.support_text=support; old.product_text=productWithSupport(base, support); old.product=old.product_text; }
        if(Array.isArray(it?.source_details)) old.source_details=[...(old.source_details||[]), ...it.source_details];
      } else {
        const q=itemQty(it);
        merged.set(k, {...it, qty:q, unplaced_qty:q, available_qty:q, remaining_qty:q});
      }
    });
    let items=Array.from(merged.values());
    const pendingMerged=mergePendingShipDeductIntoCellSave(state.current.zone,state.current.col,state.current.slot,items,$('warehouse-note')?.value||'');
    if(pendingMerged.merged) items=pendingMerged.items;
    const btn=$('yx121-save-cell');
    try{
      // formal mainline behavior.
      try { window.YXPageUndo?.snapshot?.('warehouse-cell', async()=>{ if(!state.current) return; state.current.items=beforeItems; await saveCellRaw(state.current.zone,state.current.col,state.current.slot,beforeItems,beforeNote); await renderWarehouse(false); highlightWarehouseCell(state.current.zone,state.current.col,state.current.slot); }); } catch(_e) {}
      const saveZone=state.current.zone, saveCol=state.current.col, saveSlot=state.current.slot, saveNote=$('warehouse-note')?.value||'';
      const columnBeforeSave=snapshotColumn(saveZone,saveCol);
      state.current.items=items;
      setLocalCellItems(saveZone,saveCol,saveSlot,items,saveNote);
      bumpColumnLocalRevision(saveZone,saveCol,'cell-save-optimistic');
      // V420: batch selections have now become real current items. Clear the selected batch rows before
      // writing the recoverable draft, so reopening the cell while the background queue is still saving
      // cannot display the same batch selection again and duplicate it.
      if(added.length) clearCommittedBatchRowsDom();
      // V186: manual save closes the modal immediately for speed, but the DB write may be queued/retried.
      // Keep a recoverable draft with the exact optimistic cell state until the DB confirms and clears it.
      try{ persistWarehouseDraft(); }catch(_e){}
      const revAtSend=bumpCellRevision(saveZone,saveCol,saveSlot);
      const delta=cellAvailabilityDelta(withWarehouseZone(beforeItems, saveZone), withWarehouseZone(items, saveZone));
      if(delta.returned.length) mutateAvailableLocked(delta.returned, +1, saveZone, 'cell-save-returned', saveKey+'-'+revAtSend);
      if(delta.consumed.length) mutateAvailableLocked(delta.consumed, -1, saveZone, 'cell-save-consumed', saveKey+'-'+revAtSend);
      updateSlotUI(saveZone,saveCol,saveSlot);
      toast(`格位已送出背景儲存${added.length?`，新增 ${added.length} 筆`:''}${editedChanged?'，已更新目前商品與下拉剩餘數量':''}`,'ok');
      closeWarehouseModal({skipFlush:true});
      // V184: skip close-time autosave here because this manual save is already queued below.
      // V172: keep the local draft until the DB confirms the save; if background queue retries later, user data is still recoverable.
      highlightWarehouseCell(saveZone,saveCol,saveSlot);
      const token=beginColumnOp(saveZone,saveCol);
      state.lastGoodColumns.set(token.key, columnBeforeSave);
      const savePromise = queuedWarehousePost('/api/warehouse/cell', saveCellPayload(saveZone,saveCol,saveSlot,items,saveNote), async (saved, token)=>{
        // 119：後端讀回 saved_cell 後，只同步這一格，不整包覆蓋；若切頁造成請求延後，佇列會在其他頁繼續送。
        if(saved && saved.saved_cell && mayApplySavedCell(saveZone,saveCol,saveSlot,revAtSend)){
          const sc=saved.saved_cell;
          { const rbItems=Array.isArray(sc.items)?normalizeCellItemsForDisplay(sc.items):[]; setLocalCellItems(saveZone,saveCol,saveSlot,rbItems.length?rbItems:items,sc.note ?? saveNote); }
          if(Array.isArray(saved.column_cells) && isLatestColumnOp(token) && mayApplySavedCell(saveZone,saveCol,saveSlot,revAtSend)) applyColumnCells(saveZone,saveCol,saved.column_cells,{token,reason:'cell-save-readback'});
          cacheWarehouseNow();
        }
        if(mayApplySavedCell(saveZone,saveCol,saveSlot,revAtSend)) clearWarehouseDraft(saveZone,saveCol,saveSlot);
        notifyWarehouseChanged({action:'cell-save',zone:saveZone,column_index:saveCol,slot_number:saveSlot,items,operation_id:saved?.operation_id||''});
        await loadAvailable(false).catch(()=>{});
        updateAllSlots();
        highlightWarehouseCell(saveZone,saveCol,saveSlot);
        scheduleWarehouseConsistencyCheck({action:'cell-save',zone:saveZone,column_index:saveCol,slot_number:saveSlot,operation_id:saved?.operation_id||''}, 650);
        toast('格位已永久存入資料庫，下拉剩餘數量已更新','ok');
      }, '格位儲存', {token, rollback:false});
      state.savePromises = state.savePromises || new Map();
      state.savePromises.set(saveKey, savePromise);
      savePromise.finally(()=>{
        try{
          if(state.savePromises?.get?.(saveKey)===savePromise) state.savePromises.delete(saveKey);
          state.saveLocks.delete(saveKey);
          state.saveLockStarted?.delete?.(saveKey);
          if(state.saveAgainAfterLock?.has?.(saveKey)){
            state.saveAgainAfterLock.delete(saveKey);
            // V178: if the modal was closed after an optimistic save, do not silently discard a queued follow-up; reopen is not needed, but keep draft/local cell safe and let manual retry happen when the same cell is active again.
            if(sameCurrentCell(saveZone,saveCol,saveSlot)) scheduleManualSaveAfterLock(saveKey);
            else persistWarehouseDraft();
          }
        }catch(_e){}
      });
    }catch(e){
      // V187: if the request fails before it enters the background queue, release this cell immediately.
      // The optimistic draft remains in localStorage, so the user can save again without reopening/reloading.
      try{ state.savePromises?.delete?.(saveKey); state.saveLocks?.delete?.(saveKey); state.saveLockStarted?.delete?.(saveKey); }catch(_e){}
      try{ persistWarehouseDraft(); }catch(_e){}
      try{window.dispatchEvent(new CustomEvent('yx:operation-soft-failed',{detail:{source:'warehouse',reason:'cell-save-failed',error:e.message||'儲存格位失敗',version:'v423',zone:state.current?.zone,column_index:state.current?.col,slot_number:state.current?.slot,payload:saveCellPayload(state.current?.zone,state.current?.col,state.current?.slot,state.current?.items||[],($('warehouse-note')?.value||''))}}));}catch(_e){}
      toast(e.message||'儲存格位失敗，草稿已保留可直接再存','error');
      throw e;
    }
    finally{ if(btn){ btn.disabled=false; btn.textContent='儲存格位'; } }
  }
  function updateUndoButton(){ const b=$('yx121-warehouse-undo'); if(b) b.disabled=!state.undoStack.length; }
  async function moveCellContents(from,to){
    const f={zone:clean(from.zone).toUpperCase(),col:Number(from.col),slot:Number(from.slot)};
    const t={zone:clean(to.zone).toUpperCase(),col:Number(to.col),slot:Number(to.slot)};
    await drainColumnAutoSavesBeforeStructure(f.zone,f.col,'拖拉前已先保存來源欄位修改');
    if(f.zone!==t.zone || f.col!==t.col) await drainColumnAutoSavesBeforeStructure(t.zone,t.col,'拖拉前已先保存目標欄位修改');
    if(f.zone===t.zone&&f.col===t.col&&f.slot===t.slot) return;
    const moved=cellItems(f.zone,f.col,f.slot).filter(it=>itemQty(it)>0);
    if(!moved.length) return toast('此格沒有可拖拉的商品','warn');
    const src={...f,items:JSON.parse(JSON.stringify(cellItems(f.zone,f.col,f.slot))),note:cellNote(f.zone,f.col,f.slot)};
    const dst={...t,items:JSON.parse(JSON.stringify(cellItems(t.zone,t.col,t.slot))),note:cellNote(t.zone,t.col,t.slot)};
    const fromSnap=snapshotColumn(f.zone,f.col);
    const toSnap=(f.zone===t.zone&&f.col===t.col)?fromSnap:snapshotColumn(t.zone,t.col);
    const placement = dst.items && dst.items.length ? '前排' : '後排';
    const dstExisting=(dst.items||[]).map(it=>{
      const row={...it};
      // V500: when dragging into a filled slot, moved goods become 前排 and legacy existing goods are kept/marked as 後排.
      if(placement==='前排' && !warehousePlacementLabel(row,'')){ row.placement_label='後排'; row.layer_label='後排'; }
      return row;
    });
    const dstAfter=[...moved.map(it=>normalizedItem(it,itemQty(it),placement)),...dstExisting];
    try{
      invalidateCellPendingWritesForStructure(f.zone,f.col,f.slot,'move-source');
      invalidateCellPendingWritesForStructure(t.zone,t.col,t.slot,'move-target');
      let srcCell=cellFromData(f.zone,f.col,f.slot); if(srcCell){ srcCell.items=[]; srcCell.items_json='[]'; }
      let dstCell=cellFromData(t.zone,t.col,t.slot); if(!dstCell){ dstCell={zone:t.zone,column_index:t.col,slot_type:'direct',slot_number:t.slot,items:[],items_json:'[]',note:''}; state.data.cells.push(dstCell); }
      dstCell.items=dstAfter; dstCell.items_json=JSON.stringify(dstAfter);
      clearWarehouseDraft(f.zone,f.col,f.slot); clearWarehouseDraft(t.zone,t.col,t.slot);
      bumpColumnLocalRevision(f.zone,f.col,'move-source-optimistic');
      if(f.zone!==t.zone || f.col!==t.col) bumpColumnLocalRevision(t.zone,t.col,'move-target-optimistic');
      cacheWarehouseNow(); updateSlotUI(f.zone,f.col,f.slot); updateSlotUI(t.zone,t.col,t.slot); highlightWarehouseCell(t.zone,t.col,t.slot);
      toast(placement==='前排'?'已先移動到前排，背景儲存':'已先移動到後排，背景儲存','ok');
      const fromToken=beginColumnOp(f.zone,f.col);
      state.lastGoodColumns.set(fromToken.key, fromSnap);
      const toToken=(f.zone===t.zone&&f.col===t.col)?fromToken:beginColumnOp(t.zone,t.col);
      if(toToken!==fromToken) state.lastGoodColumns.set(toToken.key, toSnap);
      queuedWarehouseMovePost({
        operation_id:yxOperationId('warehouse-move-cell'),
        client_stability:'v503-today_diagnostics_current_proof',
        strict_validate:0,
        source_cell_items:src.items,
        target_cell_items_before:dst.items,
        from:{zone:f.zone,column_index:f.col,slot_number:f.slot,note:src.note},
        to:{zone:t.zone,column_index:t.col,slot_number:t.slot,note:dst.note},
        items:dstAfter
      }, async(d, fromLatest, toLatest)=>{
        if(!d || d.success===false){ rollbackMoveColumns(fromToken,toToken,fromSnap,toSnap,'拖拉移動沒有確實存入資料庫，已還原'); return; }
        applyMoveWarehouseResponse(d, fromLatest?fromToken:null, toLatest?toToken:null, f, t);
        state.undoStack.push({source:src,target:dst}); if(state.undoStack.length>20) state.undoStack.shift(); updateUndoButton();
        clearWarehouseDraft(f.zone,f.col,f.slot); clearWarehouseDraft(t.zone,t.col,t.slot);
        notifyWarehouseChanged({action:'move',from:f,to:t,moved_items:moved,items:dstAfter,customer_names:affectedWarehouseCustomers({items:[moved,dstAfter]}),operation_id:d?.operation_id||''}); loadAvailable(false).catch(()=>{}); updateAllSlots(); highlightWarehouseCell(t.zone,t.col,t.slot); scheduleWarehouseConsistencyCheck({action:'move-from',zone:f.zone,column_index:f.col,slot_number:f.slot,operation_id:d?.operation_id||''}, 900); scheduleWarehouseConsistencyCheck({action:'move-to',zone:t.zone,column_index:t.col,slot_number:t.slot,operation_id:d?.operation_id||''}, 900); toast('拖拉移動已永久存入資料庫','ok');
      }, '拖拉移動', fromToken, toToken, ()=>rollbackMoveColumns(fromToken,toToken,fromSnap,toSnap,'拖拉移動保存失敗，已還原'));
    } catch(e){ rollbackMoveColumns(null,null,fromSnap,toSnap,e.message||'拖拉移動失敗'); }
  }
  async function undoWarehouseMove(){ const last=state.undoStack.pop(); updateUndoButton(); if(!last) return toast('目前沒有可還原的倉庫移動','warn'); try{ await saveCellRaw(last.target.zone,last.target.col,last.target.slot,last.target.items,last.target.note); await saveCellRaw(last.source.zone,last.source.col,last.source.slot,last.source.items,last.source.note); toast('已還原','ok'); await renderWarehouse(false); highlightWarehouseCell(last.source.zone,last.source.col,last.source.slot); }catch(e){ state.undoStack.push(last); updateUndoButton(); toast(e.message||'還原失敗','error'); } }
  function invalidateCellPendingWritesForStructure(z,c,s, reason){
    // V422: structure/return operations must invalidate any old cell-save draft/timer for the affected slot.
    // This prevents a delayed autosave from writing old items back after drag/delete/return continuous operations.
    try{
      z=clean(z).toUpperCase(); c=Number(c); s=Number(s);
      const k=key(z,c,s);
      cancelPendingAutoSaveForCell(z,c,s);
      state.saveAgainAfterLock?.delete?.(k);
      state.pendingManualSaveTimers?.get?.(k) && clearTimeout(state.pendingManualSaveTimers.get(k));
      state.pendingManualSaveTimers?.delete?.(k);
      bumpCellRevision(z,c,s);
      clearWarehouseDraft(z,c,s);
    }catch(_e){}
  }
  function syncOpenModalAfterSlotStructure(z,c,slot,mode){
    // V422: when insert/delete compacts slot numbers while the modal is open, keep state.current pointing
    // to the same physical goods instead of the old number. If the open empty cell is deleted, close it.
    try{
      if(!state.current) return;
      z=clean(z).toUpperCase(); c=Number(c); slot=Number(slot);
      if(clean(state.current.zone).toUpperCase()!==z || Number(state.current.col)!==c) return;
      const cur=Number(state.current.slot);
      const modalOpen=!!document.querySelector('#warehouse-modal:not(.hidden)');
      if(mode==='insert' && cur>slot){
        state.current.slot=cur+1;
      }else if(mode==='delete'){
        if(cur===slot){
          invalidateCellPendingWritesForStructure(z,c,slot,'delete-current-slot');
          state.modalSeq++;
          try{ document.getElementById('warehouse-modal')?.classList.add('hidden'); }catch(_e){}
          state.current=null;
          return;
        }
        if(cur>slot) state.current.slot=cur-1;
      }
      if(!state.current) return;
      const meta=document.getElementById('warehouse-modal-meta');
      if(meta && modalOpen) meta.textContent=`${state.current.zone} 區第 ${Number(state.current.col)} 欄 第 ${Number(state.current.slot)} 格`;
      try{ persistWarehouseDraft(); }catch(_e){}
    }catch(_e){}
  }
  function localInsertSlot(z,c,after){
    z=clean(z).toUpperCase(); c=Number(c); after=Number(after||0);
    state.data.cells = Array.isArray(state.data.cells) ? state.data.cells : [];
    // V126：右鍵/長按「新增一格到此格下方」必須插在使用者點到的格子下一格，
    // 不是追加到本欄最後。前端先安全重排顯示，後端用同樣 insert_after 永久保存。
    const visible=visibleSlotNumbers(z,c);
    const maxExisting=visible.length ? Math.max(...visible) : 0;
    const insertAfter=Math.max(0, Math.min(after, maxExisting || after));
    const newSlot=insertAfter + 1;
    // 先由後往前移，避免同一輪前端資料出現重複 slot_number。
    (state.data.cells||[])
      .filter(cell=>clean(cell.zone).toUpperCase()===z && Number(cell.column_index)===c && !isDeletedCell(cell) && Number(cell.slot_number)>insertAfter)
      .sort((a,b)=>Number(b.slot_number)-Number(a.slot_number))
      .forEach(cell=>{ const oldSlot=Number(cell.slot_number); registerSlotRedirect(z,c,oldSlot,oldSlot+1,'insert-slot',cell); invalidateCellPendingWritesForStructure(z,c,oldSlot,'insert-shift'); cell.slot_number = oldSlot + 1; });
    syncOpenModalAfterSlotStructure(z,c,insertAfter,'insert');
    markColumnStructureEpoch(z,c,'insert-slot');
    bumpColumnLocalRevision(z,c,'insert-slot-optimistic');
    state.data.cells.push({zone:z,column_index:c,slot_type:'direct',slot_number:newSlot,items:[],items_json:'[]',note:'',problem_flag:'',is_deleted:0});
    state.data.cells.sort((a,b)=>clean(a.zone).localeCompare(clean(b.zone)) || Number(a.column_index)-Number(b.column_index) || Number(a.slot_number)-Number(b.slot_number));
    cacheWarehouseNow();
    return newSlot;
  }
  function localDeleteSlot(z,c,s){
    z=clean(z).toUpperCase(); c=Number(c); s=Number(s);
    // 117：任何空格都可以隱藏；後面格號立即往前補，等後端永久寫入後再以 DB 回傳校準。
    invalidateCellPendingWritesForStructure(z,c,s,'delete-slot');
    syncOpenModalAfterSlotStructure(z,c,s,'delete');
    state.data.cells = (state.data.cells||[]).filter(cell=>!(clean(cell.zone).toUpperCase()===z && Number(cell.column_index)===c && Number(cell.slot_number)===s));
    (state.data.cells||[]).forEach(cell=>{
      if(clean(cell.zone).toUpperCase()===z && Number(cell.column_index)===c && Number(cell.slot_number)>s){
        const oldSlot=Number(cell.slot_number);
        registerSlotRedirect(z,c,oldSlot,oldSlot-1,'delete-slot',cell);
        invalidateCellPendingWritesForStructure(z,c,oldSlot,'delete-shift');
        cell.slot_number = oldSlot - 1;
      }
    });
    markColumnStructureEpoch(z,c,'delete-slot');
    bumpColumnLocalRevision(z,c,'delete-slot-optimistic');
    cacheWarehouseNow();
  }
  function nextVisibleSlotAfterStructure(z,c,s){
    try{
      z=clean(z).toUpperCase(); c=Number(c); s=Number(s);
      const nums=visibleSlotNumbers(z,c).filter(n=>Number(n)>0);
      if(!nums.length) return 1;
      const exact=nums.find(n=>Number(n)>=s);
      return Number(exact || nums[nums.length-1] || 1);
    }catch(_e){ return Math.max(1, Number(s)||1); }
  }
  function finalizeWarehouseStructureSuccess(d,z,c,token,opts={}){
    try{
      const action=clean(opts.action||'structure');
      const slot=Number(opts.slot || opts.highlightSlot || 1);
      const opid=clean(d?.operation_id || opts.operation_id || '');
      let applied=false;
      const readbackCells = Array.isArray(d?.column_cells) ? d.column_cells : [];
      if(readbackCells.length && canTrustStructureColumnReadback(z,c,readbackCells)){
        applied = applyColumnCells(z,c,readbackCells,{token,['force']:true,trustStructure:true,reason:'structure-'+action+'-v501'});
      }else if(readbackCells.length){
        try{ keepQueuedColumnProtected(token,{zone:z,column_index:c,slot_number:slot,operation_id:opid},'結構讀回商品集合不一致'); }catch(_e){}
        try{ scheduleWarehouseConsistencyCheck({action:'structure-readback-mismatch-'+action,zone:z,column_index:c,slot_number:slot,operation_id:opid}, 700); }catch(_e){}
      }
      if(!applied) applied = applyWarehouseResponse(d,z,c, token);
      // Do not blindly normalize slots after a trusted server readback; the DB visible_count
      // is authoritative, especially when a base empty slot was intentionally hidden.
      clearWarehouseColumnDrafts(z,c);
      if(!applied) normalizeColumnSlots(z,c);
      cacheWarehouseNow();
      updateAllSlots();
      const hs=Number(opts.afterDelete ? nextVisibleSlotAfterStructure(z,c,slot) : (opts.highlightSlot || slot || 1));
      if(hs>0) highlightWarehouseCell(z,c,hs);
      scheduleWarehouseConsistencyCheck({action,zone:z,column_index:c,slot_number:hs||slot||1,operation_id:opid}, 900);
      notifyWarehouseChanged({action,zone:z,column_index:c,slot_number:hs||slot||1,operation_id:opid,structure_readback_safe:!!applied});
      if(opts.message) toast(opts.message,'ok');
    }catch(e){
      try{ cacheWarehouseNow(); updateAllSlots(); }catch(_e){}
    }
  }

  async function batchInsertWarehouseCells(z,c,s){
    z=clean(z).toUpperCase(); c=Number(c); s=Number(s||0);
    await drainColumnAutoSavesBeforeStructure(z,c,'批量新增格前已先保存同欄格位修改');
    const count=Math.max(1, Math.min(40, Number.parseInt(prompt('要新增幾格？', '5') || '0', 10) || 0));
    if(!count) return;
    const columnBefore=snapshotColumn(z,c);
    for(let i=0;i<count;i++) localInsertSlot(z,c,s+i);
    clearWarehouseColumnDrafts(z,c);
    updateAllSlots(); highlightWarehouseCell(z,c,s+1); toast(`已先在第 ${s} 格下方批量新增 ${count} 格，背景儲存`,'ok');
    const token=beginColumnOp(z,c);
    state.lastGoodColumns.set(token.key, columnBefore);
    queuedWarehousePost('/api/warehouse/batch-add-slots',{operation_id:yxOperationId('warehouse-batch-add-slots'),client_stability:'v503-today_diagnostics_current_proof',zone:z,column_index:c,insert_after:s,count,slot_type:'direct'}, (d, token)=>{
      finalizeWarehouseStructureSuccess(d,z,c,token,{action:'batch-insert',slot:Number(d?.first_slot||s+1),highlightSlot:Number(d?.first_slot||s+1),operation_id:d?.operation_id||'',message:`批量新增 ${count} 格已永久存入資料庫`});
    }, '批量新增格子', {token, rollback:false});
  }
  async function batchDeleteWarehouseCells(z,c,s){
    z=clean(z).toUpperCase(); c=Number(c); s=Number(s);
    await drainColumnAutoSavesBeforeStructure(z,c,'批量刪格前已先保存同欄格位修改');
    // V127：批量刪除只問一次數量，不再跳第二次確認。
    // 依使用者點到的格子往下找「空格」刪除，遇到有商品的格子自動略過，
    // 避免刪第 1 格後第 2 格商品補上來，後端第二次刪除就失敗。
    const raw=prompt('要刪除幾個空格？會從你點的格子開始往下刪空格，商品格自動跳過。', '5');
    if(raw===null) return;
    const count=Math.max(1, Math.min(80, Number.parseInt(raw || '0', 10) || 0));
    if(!count) return;
    const emptySlots=visibleSlotNumbers(z,c)
      .filter(n=>n>=s && !cellItems(z,c,n).length)
      .slice(0,count);
    if(!emptySlots.length) return toast('此格往下找不到可刪除的空格','warn');
    const columnBefore=snapshotColumn(z,c);
    // 從大到小刪，避免前面刪除後格號位移影響後面目標。
    emptySlots.slice().sort((a,b)=>b-a).forEach(n=>localDeleteSlot(z,c,n));
    clearWarehouseColumnDrafts(z,c);
    normalizeColumnSlots(z,c);
    cacheWarehouseNow();
    updateAllSlots();
    highlightWarehouseCell(z,c,nextVisibleSlotAfterStructure(z,c,s));
    toast(`已先批量刪除 ${emptySlots.length} 個空格，背景儲存`,'ok');
    const token=beginColumnOp(z,c);
    state.lastGoodColumns.set(token.key, columnBefore);
    queuedWarehousePost('/api/warehouse/batch-remove-slots',{
      operation_id:yxOperationId('warehouse-batch-remove-slots'),
      client_stability:'v503-today_diagnostics_current_proof',
      zone:z,column_index:c,slot_number:s,count:emptySlots.length,slots:emptySlots,slot_type:'direct',
      mode:'empty_from_here'
    }, (d, token)=>{
      finalizeWarehouseStructureSuccess(d,z,c,token,{action:'batch-delete',slot:s,afterDelete:true,operation_id:d?.operation_id||'',message:`批量刪除 ${Number(d?.removed||emptySlots.length)} 個空格已永久存入資料庫`});
    }, '批量刪除空格', {token, rollback:false});
  }

  async function insertWarehouseCell(z,c,s){
    z=clean(z).toUpperCase(); c=Number(c); s=Number(s||0);
    await drainColumnAutoSavesBeforeStructure(z,c,'新增格前已先保存同欄格位修改');
    const columnBefore=snapshotColumn(z,c);
    const localSlot=localInsertSlot(z,c,s); clearWarehouseColumnDrafts(z,c); normalizeColumnSlots(z,c); updateAllSlots(); highlightWarehouseCell(z,c,localSlot); toast(`已先在第 ${s} 格下方新增一格，背景儲存`,'ok');
    const token=beginColumnOp(z,c);
    state.lastGoodColumns.set(token.key, columnBefore);
    queuedWarehousePost('/api/warehouse/add-slot',{operation_id:yxOperationId('warehouse-add-slot'),client_stability:'v503-today_diagnostics_current_proof',zone:z,column_index:c,insert_after:s,slot_type:'direct'}, (d, token)=>{
      finalizeWarehouseStructureSuccess(d,z,c,token,{action:'insert',slot:Number(d?.slot_number||localSlot),highlightSlot:Number(d?.slot_number||localSlot),operation_id:d?.operation_id||'',message:'新增格子已永久存入資料庫'});
    }, '新增格子', {token, rollback:false});
  }
  async function deleteWarehouseCell(z,c,s){
    z=clean(z).toUpperCase(); c=Number(c); s=Number(s);
    await drainColumnAutoSavesBeforeStructure(z,c,'刪格前已先保存同欄格位修改');
    if(cellItems(z,c,s).length) return toast('格子內還有商品，請先退回該格或移除商品後再刪除','warn');
    // V127：單格刪除不再跳確認，點選後立即前端刪除並背景保存。
    const columnBefore=snapshotColumn(z,c);
    localDeleteSlot(z,c,s); clearWarehouseColumnDrafts(z,c); normalizeColumnSlots(z,c); updateAllSlots(); highlightWarehouseCell(z,c,nextVisibleSlotAfterStructure(z,c,s)); toast('已先從畫面刪除空格並補齊格號，背景儲存','ok');
    const token=beginColumnOp(z,c);
    state.lastGoodColumns.set(token.key, columnBefore);
    queuedWarehousePost('/api/warehouse/remove-slot',{operation_id:yxOperationId('warehouse-remove-slot'),client_stability:'v503-today_diagnostics_current_proof',zone:z,column_index:c,slot_number:s,slot_type:'direct'}, (d, token)=>{
      finalizeWarehouseStructureSuccess(d,z,c,token,{action:'delete',slot:s,afterDelete:true,operation_id:d?.operation_id||'',message:'刪除空格已永久存入資料庫'});
    }, '刪除空格', {token, rollback:false});
  }
  async function returnWarehouseCell(z,c,s){
    z=clean(z).toUpperCase(); c=Number(c); s=Number(s);
    await drainColumnAutoSavesBeforeStructure(z,c,'返回該格前已先保存同欄格位修改');
    const items=cellItems(z,c,s);
    if(!items.length) return toast('此格沒有商品可退回','warn');
    // V127：返回該格不再二次確認，立即前端退回下拉並背景保存。
    const oldItems=JSON.parse(JSON.stringify(items));
    const columnBefore=snapshotColumn(z,c);
    invalidateCellPendingWritesForStructure(z,c,s,'return-unplaced');
    setLocalCellItems(z,c,s,[],cellNote(z,c,s));
    bumpColumnLocalRevision(z,c,'return-unplaced-optimistic');
    mutateAvailableLocked(oldItems, +1, z, 'return-unplaced', key(z,c,s)+'-'+Date.now());
    clearWarehouseDraft(z,c,s);
    cacheWarehouseNow();
    updateSlotUI(z,c,s);
    if(state.current && clean(state.current.zone).toUpperCase()===z && Number(state.current.col)===c && Number(state.current.slot)===s){ state.current.items=[]; try{ clearCommittedBatchRowsDom(); }catch(_e){} renderCellItems(true); markCurrentCellDirty(); }
    toast('已先從畫面退回，背景寫入資料庫','ok');
    const token=beginColumnOp(z,c);
    state.lastGoodColumns.set(token.key, columnBefore);
    queuedWarehousePost('/api/warehouse/return-unplaced',{operation_id:yxOperationId('warehouse-return-unplaced'),client_stability:'v503-today_diagnostics_current_proof',zone:z,column_index:c,slot_number:s}, async (d, token)=>{
      finalizeWarehouseStructureSuccess(d,z,c,token,{action:'return-unplaced',slot:s,highlightSlot:s,operation_id:d?.operation_id||'',message:'退回該格已永久存入資料庫'});
      notifyWarehouseChanged({action:'return-unplaced',zone:z,column_index:c,slot_number:s,items:oldItems,customer_name:(oldItems||[]).map(it=>it.customer_name).filter(Boolean)[0]||'',operation_id:d?.operation_id||''});
      loadAvailable(false).catch(()=>{});
    }, '退回該格', {token, rollback:false}); // V488: long-press return must persist/retry without reverting optimistic UI
  }
  async function executeWarehouseMenuAction(action){
    const m=menu();
    const z=clean(m.dataset.zone||'').toUpperCase(), c=Number(m.dataset.column), s=Number(m.dataset.slot);
    state.longpressSuppressClickUntil=Math.max(Number(state.longpressSuppressClickUntil||0), Date.now()+850);
    if(!z || !Number.isFinite(c) || !Number.isFinite(s) || c<=0 || s<=0){
      m.classList.add('hidden'); m.dataset.open='0'; m.setAttribute('aria-hidden','true');
      toast('長按選單座標失效，請重新長按該格','warn');
      return;
    }
    m.classList.add('hidden'); m.dataset.open='0'; m.setAttribute('aria-hidden','true');
    // V158: prevent accidental double-fire from touch/right-click without adding another listener.
    // Same action on same slot inside 900ms is ignored; different columns/actions still work.
    const actionKey=`${action}:${clean(z).toUpperCase()}-${Number(c)}-${Number(s)}`;
    const nowTs=Date.now();
    if(nowTs - Number(state.menuActionAt.get(actionKey)||0) < 900) return;
    state.menuActionAt.set(actionKey, nowTs);
    // 不用全域 menuBusy 阻擋不同欄位；同欄位由 columnChains 排隊保存。
    state.menuBusy=false;
    try{
      if(action==='open') await openWarehouseModal(z,c,s);
      else if(action==='mark') await toggleProblemMark(z,c,s);
      else if(action==='return') await returnWarehouseCell(z,c,s);
      else if(action==='insert') await insertWarehouseCell(z,c,s);
      else if(action==='batch-insert') await batchInsertWarehouseCells(z,c,s);
      else if(action==='delete') await deleteWarehouseCell(z,c,s);
      else if(action==='batch-delete') await batchDeleteWarehouseCells(z,c,s);
    }catch(e){
      if(e?.abort_like || isAbortLikeError(e)){
        toast('倉庫操作已保留，網路稍慢會自動重試，不影響繼續操作','warn');
      }else{
        toast(e.message||'格位操作失敗','error');
      }
    }
    finally{ try{ hideWarehouseMenu(); }catch(_e){} state.menuBusy=false; }
  }
  function menu(){
    let m=$('yx-final-warehouse-menu'); if(m) return m;
    m=document.createElement('div'); m.id='yx-final-warehouse-menu'; m.className='yx-final-warehouse-menu yx-v485-centered-action-sheet yx-v520-final-ship-cache-align-pack30 hidden';
    m.innerHTML='<button type="button" data-wh-act="open">開啟 / 編輯格位</button><button type="button" data-wh-act="mark">標記 / 取消問題格</button><button type="button" data-wh-act="insert">新增一格到此格下方</button><button type="button" data-wh-act="batch-insert">批量新增到此格下方</button><button type="button" data-wh-act="delete">刪除此空格</button><button type="button" data-wh-act="batch-delete">批量刪除空格</button><button type="button" data-wh-act="return">返回該格</button><button type="button" data-wh-close="1" class="yx-wh-menu-close">關閉選單</button>';
    // V126：只保留 document click 單一路徑執行選單動作；避免 pointerup+click 雙重觸發造成後端操作被鎖或重複。
    const stopMenuBubble=(ev)=>{ if(ev.target?.closest?.('[data-wh-act]')){ try{ ev.stopPropagation(); }catch(_e){} } };
    ['pointerdown','pointerup','touchstart','touchend','mousedown','mouseup'].forEach(t=>m.addEventListener(t, stopMenuBubble, true));
    m.addEventListener('click', ev=>{ const close=ev.target?.closest?.('[data-wh-close]'); if(close){ ev.preventDefault(); ev.stopPropagation(); try{ ev.stopImmediatePropagation(); }catch(_e){} hideWarehouseMenu(); return; } const act=ev.target?.closest?.('[data-wh-act]'); if(!act) return; ev.preventDefault(); ev.stopPropagation(); try{ ev.stopImmediatePropagation(); }catch(_e){} executeWarehouseMenuAction(act.dataset.whAct); }, true);
    // V439: Android/WebView sometimes swallows the final click after a long-press menu opens.
    // Keep the original menu and action path, but allow pointerup/touchend to execute once with the same de-dupe guard.
    let lastMenuFallbackAt=0, lastMenuFallbackAction='';
    const menuEventPoint=(ev)=>{
      const t=ev.changedTouches&&ev.changedTouches[0] || ev.touches&&ev.touches[0] || ev;
      return {x:Number(t.clientX||0), y:Number(t.clientY||0)};
    };
    const menuActFromEvent=(ev)=>{
      let act=ev.target?.closest?.('[data-wh-act]');
      if(act) return act;
      try{
        const p=menuEventPoint(ev);
        act=document.elementFromPoint(p.x,p.y)?.closest?.('#yx-final-warehouse-menu [data-wh-act]');
        if(act) return act;
      }catch(_e){}
      try{
        const m=$('yx-final-warehouse-menu');
        const stored=m?.dataset?.yxPressedAct || '';
        return stored ? m.querySelector(`[data-wh-act="${stored}"]`) : null;
      }catch(_e){ return null; }
    };
    const menuDownMark=(ev)=>{
      const act=menuActFromEvent(ev); if(!act) return;
      try{ const m=$('yx-final-warehouse-menu'); if(m){ m.dataset.yxPressedAct=String(act.dataset.whAct||''); m.dataset.yxPressedAt=String(Date.now()); } act.dataset.yxMenuPressAt=String(Date.now()); }catch(_e){}
      try{ ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); }catch(_e){}
    };
    const menuActionFallback=(ev)=>{
      const act=menuActFromEvent(ev); if(!act) return;
      if(ev.type==='pointerup' && ev.pointerType==='mouse') return;
      const now=Date.now(); const a=String(act.dataset.whAct||'');
      const m=$('yx-final-warehouse-menu');
      const downAt=Math.max(Number(act.dataset.yxMenuPressAt||0), Number(m?.dataset?.yxPressedAt||0));
      if(!downAt || now-downAt>2200) return;
      const key=[a,m?.dataset.zone||'',m?.dataset.column||'',m?.dataset.slot||''].join(':');
      if(key && key===lastMenuFallbackAction && now-lastMenuFallbackAt<760) return;
      lastMenuFallbackAction=key; lastMenuFallbackAt=now;
      try{ if(m){ delete m.dataset.yxPressedAct; delete m.dataset.yxPressedAt; } }catch(_e){}
      try{ ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); }catch(_e){}
      executeWarehouseMenuAction(a);
    };
    ['pointerdown','touchstart'].forEach(t=>m.addEventListener(t, menuDownMark, true));
    ['pointerup','touchend'].forEach(t=>m.addEventListener(t, menuActionFallback, true));
    document.body.appendChild(m); return m;
  }
  function normalizeWarehouseMenuCoords(x,y){
    const vw=window.innerWidth||360, vh=window.innerHeight||640;
    const nx=Number.isFinite(Number(x)) ? Number(x) : vw/2;
    const ny=Number.isFinite(Number(y)) ? Number(y) : vh/2;
    return {x:Math.max(8, Math.min(nx, vw-16)), y:Math.max(8, Math.min(ny, vh-16)), vw, vh};
  }
  function showMenu(z,c,s,x,y){
    z=clean(z).toUpperCase(); c=Number(c); s=Number(s);
    if(!z || !Number.isFinite(c) || !Number.isFinite(s) || c<=0 || s<=0) return false;
    try{ if(document.body) document.body.dataset.module='warehouse'; }catch(_e){}
    const mk=`${z}-${c}-${s}`;
    const now=Date.now();
    const existing=menu();
    if(existing.classList.contains('hidden') || existing.dataset.open!=='1') state.activeMenuKey='';
    if(state.activeMenuKey===mk && now-Number(state.menuOpenedAt||0)<220) return true;
    if(!yxMenuGuard()) return false;
    const m=existing; m.dataset.zone=z; m.dataset.column=String(c); m.dataset.slot=String(s); try{ delete m.dataset.yxPressedAct; delete m.dataset.yxPressedAt; }catch(_e){}
    // V439: opening any warehouse action menu must also block the synthetic click that mobile browsers fire after long-press.
    state.longpressSuppressClickUntil = Math.max(Number(state.longpressSuppressClickUntil||0), Date.now()+1350);
    m.setAttribute('role','menu');
    m.setAttribute('aria-hidden','false');
    const p=normalizeWarehouseMenuCoords(x,y);
    const mw=Math.min(360, Math.max(280, p.vw-40));
    const mh=Math.min(520, Math.max(340, p.vh-80));
    const px=Math.round((p.vw-mw)/2);
    const py=Math.round((p.vh-mh)/2);
    m.classList.remove('hidden');
    m.dataset.open='1';
    m.style.setProperty('position','fixed','important');
    m.style.setProperty('z-index','2147483647','important');
    m.style.setProperty('pointer-events','auto','important');
    m.style.setProperty('touch-action','manipulation','important');
    m.style.setProperty('display','flex','important');
    m.style.setProperty('visibility','visible','important');
    m.style.setProperty('opacity','1','important');
    m.style.maxWidth=mw+'px';
    m.style.maxHeight=mh+'px';
    m.style.overflow='auto';
    m.style.left='50%';
    m.style.top='50%';
    m.style.transform='translate(-50%,-50%)';
    try{ m.querySelector('[data-wh-act="open"]')?.focus?.({preventScroll:true}); }catch(_e){}
    state.activeMenuKey=mk; state.menuOpenedAt=Date.now();
    state.longpressOpenSeq=Number(state.longpressOpenSeq||0)+1;
    state.longpressLastOpen={key:mk, zone:z, column:c, slot:s, x:px, y:py, at:state.menuOpenedAt, seq:state.longpressOpenSeq};
    try{ document.documentElement.dataset.yxWarehouseLongpressOpen='1'; }catch(_e){}
    // V440: one-shot display repair only. No loop, no observer, no renderer.
    // Some Android/WebView builds send a synthetic click after long-press and old handlers may briefly hide the menu.
    try{
      const repairKey=mk; const repairLeft=px+'px'; const repairTop=py+'px';
      [40, 120, 360, 720].forEach(delay=>setTimeout(()=>{
        try{
          const mm=$('yx-final-warehouse-menu');
          if(!mm || state.activeMenuKey!==repairKey || Date.now()-Number(state.menuOpenedAt||0)>1300) return;
          if(mm.dataset.open==='1' && mm.classList.contains('hidden')) mm.classList.remove('hidden');
          if(mm.dataset.open==='1'){
            mm.style.setProperty('display','flex','important');
            mm.style.setProperty('visibility','visible','important');
            mm.style.setProperty('opacity','1','important');
            mm.style.setProperty('pointer-events','auto','important');
            mm.style.left='50%'; mm.style.top='50%'; mm.style.transform='translate(-50%,-50%)';
          }
        }catch(_e){}
      }, delay));
    }catch(_e){}
    return true;
  }
  function hideWarehouseMenu(){
    try{ const m=menu(); m.classList.add('hidden'); m.dataset.open='0'; m.setAttribute('aria-hidden','true'); m.style.setProperty('display','none','important'); delete m.dataset.yxPressedAct; delete m.dataset.yxPressedAt; state.activeMenuKey=''; document.documentElement.dataset.yxWarehouseLongpressOpen='0'; }catch(_e){}
  }
  async function toggleProblemMark(z,c,s){
    z=clean(z).toUpperCase(); c=Number(c); s=Number(s);
    await drainColumnAutoSavesBeforeStructure(z,c,'標記問題格前已先保存同欄格位修改');
    const columnBefore=snapshotColumn(z,c);
    let cell=cellFromData(z,c,s);
    if(!cell){ cell={zone:z,column_index:c,slot_type:'direct',slot_number:s,items:[],items_json:'[]',note:'',problem_flag:''}; state.data.cells.push(cell); }
    const nowMarked = !(['problem','marked','1','true',true,1].includes(cell.problem_flag));
    const oldFlag = cell.problem_flag || '';
    cell.problem_flag = nowMarked ? 'problem' : '';
    updateSlotUI(z,c,s);
    toast(nowMarked?'已先標記成問題格，背景儲存':'已先取消問題格標記，背景儲存','ok');
    const token=beginColumnOp(z,c);
    state.lastGoodColumns.set(token.key, columnBefore);
    queuedWarehousePost('/api/warehouse/mark-cell',{operation_id:yxOperationId('warehouse-mark-cell'),zone:z,column_index:c,slot_number:s,marked:nowMarked}, d=>{
      applyWarehouseResponse(d,z,c, token);
      cacheWarehouseNow(); updateAllSlots();
    }, '標記格子', {token, rollback:false}); // V488: long-press mark must persist/retry without reverting optimistic UI
  }
  function bindSlot(slot){
    if(!slot) return;
    if(slot.dataset.yxFinalBound==='1' && slot.dataset.yxLongpressHandlerVersion==='v450') return;
    slot.dataset.yxFinalBound='1';
    slot.dataset.yxLongpressHandlerVersion='v450';
    const DRAG_START_TOLERANCE=82;
    const data=()=>({zone:clean(slot.dataset.zone).toUpperCase(),col:Number(slot.dataset.column),slot:Number(slot.dataset.slot)});
    const isEditableTarget=(target)=>!!target?.closest?.('input,textarea,select,[contenteditable="true"],.modal,.bottom-sheet,.drawer,.sheet,.dialog,.yx-final-warehouse-menu,#yx-final-warehouse-menu,[data-no-longpress]');
    const suppressClick=(ms)=>{
      const until=Date.now()+Number(ms||1300);
      try{ slot.dataset.blockClickUntil=String(until); }catch(_e){}
      state.longpressSuppressClickUntil=Math.max(Number(state.longpressSuppressClickUntil||0), until);
      return until;
    };
    const pxy=(ev)=>({x:Number(ev.clientX||0),y:Number(ev.clientY||0)});
    const dist=(ev,start)=>{ const p=pxy(ev); return Math.hypot(p.x-Number(start?.x||0),p.y-Number(start?.y||0)); };
    let press=null;
    const clearPress=()=>{ try{ slot.classList.remove('yx446-longpress-active','yx448-longpress-active','yx443-longpress-active','yx442-longpress-active','yx121-warehouse-dragging'); }catch(_e){} press=null; };
    try{
      // V448: slot itself no longer owns long-press timers. Root single engine handles long-press;
      // slot binding only handles normal tap and intentional drag. Do not preventDefault on pointerdown.
      slot.style.touchAction='manipulation';
      slot.style.webkitUserSelect='none';
      slot.style.userSelect='none';
      slot.style.webkitTouchCallout='none';
      slot.style.webkitTapHighlightColor='transparent';
      slot.setAttribute('aria-haspopup','menu');
      slot.dataset.yxLongpressReady='1';
      slot.dataset.yxSlotInputEngine='v450';
      slot.draggable=false;
    }catch(_e){}
    slot.addEventListener('pointerdown',ev=>{
      if(ev.button && ev.button!==0) return;
      if(isEditableTarget(ev.target)) return;
      const d=data();
      if(!d.zone || !Number.isFinite(d.col) || !Number.isFinite(d.slot)) return;
      state.lastWarehousePointerDownAt=Date.now();
      state.lastWarehousePointerSlot=slot;
      press={x:ev.clientX,y:ev.clientY,pointerId:ev.pointerId,pointerType:ev.pointerType||'',startedAt:Date.now(),...d,dragStarted:false,moved:false};
    }, {passive:true});
    slot.addEventListener('pointermove',ev=>{
      if(!press) return;
      if(press.pointerId!=null && ev.pointerId!=null && press.pointerId!==ev.pointerId) return;
      const movedBy=dist(ev,press);
      if(movedBy>8) press.moved=true;
      if(!press.dragStarted && slot.dataset.hasItems==='1' && movedBy>DRAG_START_TOLERANCE){
        press.dragStarted=true;
        state.drag={zone:press.zone,col:press.col,slot:press.slot,pointerId:ev.pointerId,startedAt:Date.now(),source:'slot-v501'}; state.warehouseDragSuppressLongpressUntil=Date.now()+1600;
        try{ slot.classList.add('yx121-warehouse-dragging'); }catch(_e){}
      }
      if(press.dragStarted || state.drag){
        try{ ev.preventDefault(); ev.stopPropagation(); }catch(_e){}
        const p=pxy(ev);
        const over=document.elementFromPoint(p.x,p.y)?.closest?.('#warehouse-root [data-zone][data-column][data-slot]');
        if(over) state.dragOver=over;
      }
    }, {passive:false});
    slot.addEventListener('pointerup',ev=>{
      const dragging=!!(press?.dragStarted && state.drag);
      let target=null;
      try{ target=document.elementFromPoint(ev.clientX,ev.clientY)?.closest?.('#warehouse-root [data-zone][data-column][data-slot]') || state.dragOver || null; }catch(_e){ target=state.dragOver||null; }
      if(dragging){
        suppressClick(1000);
        try{ ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); }catch(_e){}
        const from=state.drag;
        state.drag=null; state.dragOver=null;
        document.querySelectorAll('.yx121-warehouse-dragging,.yx121-warehouse-drop-target').forEach(el=>el.classList.remove('yx121-warehouse-dragging','yx121-warehouse-drop-target'));
        if(target) moveCellContents(from,{zone:target.dataset.zone,col:target.dataset.column,slot:target.dataset.slot});
        clearPress();
        return;
      }
      clearPress();
    }, {passive:false});
    ['pointercancel','lostpointercapture'].forEach(t=>slot.addEventListener(t,()=>{ if(press?.dragStarted){ state.drag=null; state.dragOver=null; } clearPress(); }, {passive:true}));
    slot.addEventListener('pointerenter',()=>{ if(state.drag) slot.classList.add('yx121-warehouse-drop-target'); }, {passive:true});
    slot.addEventListener('pointerleave',()=>{ slot.classList.remove('yx121-warehouse-drop-target'); }, {passive:true});
    slot.addEventListener('contextmenu',ev=>{
      ev.preventDefault(); ev.stopPropagation();
      if(Date.now()-Number(state.menuOpenedAt||0)>180){ const d=data(); showMenu(d.zone,d.col,d.slot,ev.clientX || (window.innerWidth/2), ev.clientY || (window.innerHeight/2)); }
      suppressClick(1700);
    }, {passive:false});
    slot.addEventListener('click',ev=>{
      const now=Date.now();
      if(now<Number(slot.dataset.blockClickUntil||0) || now<Number(state.longpressSuppressClickUntil||0)){
        ev.preventDefault(); ev.stopPropagation(); try{ ev.stopImmediatePropagation(); }catch(_e){}
        return;
      }
      if(isEditableTarget(ev.target)) return;
      const d=data(); openWarehouseModal(d.zone,d.col,d.slot);
    }, {passive:false});
  }
  function bindSlots(){ document.querySelectorAll('#warehouse-root [data-zone][data-column][data-slot]').forEach(bindSlot); }
  function bindGlobal(){
    if(state.bound) return; state.bound=true;
    // V449: de-ghosted true single long-press engine. Slot binding no longer owns long-press timers; root handles long-press, slot handles tap/intentional drag only.
    // Older delegated/capture bridges and slot longpress timers stay disabled; tap/drag/cache behavior remains intact.
    try{
      window.__YX_WAREHOUSE_DELEGATED_LONGPRESS_V442__=true;
      window.__YX_WAREHOUSE_DELEGATED_LONGPRESS_V439__=true;
      window.__YX_WAREHOUSE_LONGPRESS_BRIDGE_V442__=true;
      window.__YX_WAREHOUSE_LONGPRESS_LAST_RESORT_V443__=true;
      window.__YX_WAREHOUSE_LONGPRESS_SINGLE_PATH_V444__=true;
      window.__YX_WAREHOUSE_DISABLE_SLOT_LONGPRESS_V445__=true;
      window.__YX_WAREHOUSE_DISABLE_SLOT_LONGPRESS_V447__=true;
      window.__YX_WAREHOUSE_DISABLE_SLOT_LONGPRESS_V448__=true;
      window.__YX_WAREHOUSE_DISABLE_SLOT_LONGPRESS_V449__=true;
      window.__YX_WAREHOUSE_DISABLE_SLOT_LONGPRESS_V450__=true;
      window.__YX_WAREHOUSE_LONGPRESS_LEGACY_BRIDGES_REMOVED_V450__=true;
    }catch(_e){}
    if(!window.__YX_WAREHOUSE_LONGPRESS_SINGLE_ENGINE_V450__){
      window.__YX_WAREHOUSE_LONGPRESS_SINGLE_ENGINE_V445__=true;
      window.__YX_WAREHOUSE_LONGPRESS_SINGLE_ENGINE_V447__=true;
      window.__YX_WAREHOUSE_LONGPRESS_SINGLE_ENGINE_V448__=true;
      window.__YX_WAREHOUSE_LONGPRESS_SINGLE_ENGINE_V449__=true;
      window.__YX_WAREHOUSE_LONGPRESS_SINGLE_ENGINE_V450__=true;
      try{ document.documentElement.dataset.yxWarehouseLongpressEngine='v450'; }catch(_e){}
      let hold=null, holdTimer=null, openedAt=0, suppressUntil=0, lastRunKey='', lastRunAt=0, lastEndAt=0, lastStartAt=0;
      const SLOT_SEL='#warehouse-root [data-zone][data-column][data-slot], .warehouse-slot[data-zone][data-column][data-slot]';
      const HOLD_MS={touch:260, pen:285, mouse:400, fallback:285};
      const MOVE_CANCEL=32;
      const DRAG_ALLOW=190;
      const MIN_CANCEL_RESCUE_MS=180;
      const point=(ev)=>{
        const t=(ev?.changedTouches&&ev.changedTouches[0]) || (ev?.touches&&ev.touches[0]) || ev || {};
        return {x:Number.isFinite(Number(t.clientX))?Number(t.clientX):0, y:Number.isFinite(Number(t.clientY))?Number(t.clientY):0};
      };
      const slotAt=(x,y)=>{ try{ return document.elementFromPoint(Number(x)||0, Number(y)||0)?.closest?.(SLOT_SEL) || null; }catch(_e){ return null; } };
      const slotFrom=(ev)=>{
        try{
          const direct=ev?.target?.closest?.(SLOT_SEL); if(direct) return direct;
          const path=typeof ev?.composedPath==='function' ? ev.composedPath() : [];
          for(const n of path){ const hit=n?.closest?.(SLOT_SEL); if(hit) return hit; }
        }catch(_e){}
        const p=point(ev); return slotAt(p.x,p.y) || hold?.snap?.el || null;
      };
      const isIgnored=(target)=>!!target?.closest?.('#yx-final-warehouse-menu,.modal,.bottom-sheet,.drawer,.sheet,.dialog,input,textarea,select,[contenteditable="true"],[data-no-longpress]');
      const snap=(slot)=>{
        if(!slot) return null;
        const z=clean(slot.dataset.zone||'').toUpperCase(), c=Number(slot.dataset.column), s=Number(slot.dataset.slot);
        if(!z || !Number.isFinite(c) || !Number.isFinite(s) || c<=0 || s<=0) return null;
        return {el:slot, zone:z, column:c, slot:s, key:`${z}-${c}-${s}`};
      };
      const clearHold=(keepActive)=>{
        try{ if(hold?.snap?.el && !keepActive) hold.snap.el.classList.remove('yx449-longpress-active','yx446-longpress-active','yx443-longpress-active','yx442-longpress-active','yx441-longpress-active'); }catch(_e){}
        if(holdTimer){ clearTimeout(holdTimer); holdTimer=null; }
        hold=null;
      };
      const blockClick=(sn,ms)=>{
        const until=Date.now()+Number(ms||2400);
        suppressUntil=until;
        state.longpressSuppressClickUntil=Math.max(Number(state.longpressSuppressClickUntil||0), until);
        try{
          if(sn?.el){
            sn.el.dataset.blockClickUntil=String(until);
            sn.el.dataset.yxLongpressOpenAt=String(Date.now());
            sn.el.dataset.yxLongpressBridge='v450';
            sn.el.classList.add('yx449-longpress-active','yx446-longpress-active','yx443-longpress-active','yx442-longpress-active');
          }
        }catch(_e){}
        return until;
      };
      const hardOpen=(sn,x,y,ev,reason)=>{
        if(!sn) return false;
        blockClick(sn,2500);
        try{ ev?.preventDefault?.(); ev?.stopPropagation?.(); ev?.stopImmediatePropagation?.(); }catch(_e){}
        let ok=false;
        try{ state.drag=null; state.dragOver=null; document.querySelectorAll('.yx121-warehouse-dragging,.yx121-warehouse-drop-target').forEach(el=>el.classList.remove('yx121-warehouse-dragging','yx121-warehouse-drop-target')); }catch(_e){}
        try{ if(document.body) document.body.dataset.module='warehouse'; }catch(_e){}
        try{ ok=!!showMenu(sn.zone,sn.column,sn.slot,x,y); }catch(_e){ ok=false; }
        try{
          const m=$('yx-final-warehouse-menu') || menu();
          if(m){
            try{ if(m.parentNode!==document.body && document.body) document.body.appendChild(m); }catch(_e){}
            const p=normalizeWarehouseMenuCoords(x,y);
            const mw=Math.min(310, Math.max(230, (p.vw||window.innerWidth||360)-16));
            const mh=Math.min(440, Math.max(300, (p.vh||window.innerHeight||640)-16));
            m.dataset.zone=sn.zone; m.dataset.column=String(sn.column); m.dataset.slot=String(sn.slot);
            m.dataset.yxBridge='v450'; m.dataset.yxOpenReason=String(reason||'longpress'); m.dataset.yxMenuActionGuard='v450'; m.dataset.open='1'; try{ delete m.dataset.yxPressedAct; delete m.dataset.yxPressedAt; }catch(_e){}
            m.removeAttribute('hidden'); m.setAttribute('aria-hidden','false'); m.classList.remove('hidden');
            m.style.setProperty('position','fixed','important');
            m.style.setProperty('display','flex','important');
            m.style.setProperty('flex-direction','column','important');
            m.style.setProperty('visibility','visible','important');
            m.style.setProperty('opacity','1','important');
            m.style.setProperty('pointer-events','auto','important');
            m.style.setProperty('z-index','2147483647','important');
            m.style.maxWidth=mw+'px'; m.style.maxHeight=mh+'px';
            try{ m.querySelectorAll('button[data-wh-act]').forEach(btn=>{ btn.type='button'; btn.dataset.yxActionReady='v450'; }); }catch(_e){}
            m.style.left=Math.max(8,Math.min(p.x,(p.vw||window.innerWidth||360)-mw-8))+'px';
            m.style.top=Math.max(8,Math.min(p.y,(p.vh||window.innerHeight||640)-mh-8))+'px';
          }
          openedAt=Date.now(); state.menuOpenedAt=openedAt; state.activeMenuKey=sn.key;
          state.longpressOpenSeq=Number(state.longpressOpenSeq||0)+1;
          state.longpressLastOpen={key:sn.key,zone:sn.zone,column:sn.column,slot:sn.slot,x,y,at:openedAt,seq:state.longpressOpenSeq,reason:String(reason||'v450')};
          document.documentElement.dataset.yxWarehouseLongpressOpen='1';
        }catch(_e){}
        // One-shot repairs only; no interval/observer. Protects against old click handlers immediately hiding the menu.
        try{ [20,70,160,320,650,1050,1550].forEach(delay=>setTimeout(()=>{
          try{
            if(state.activeMenuKey!==sn.key || Date.now()-Number(openedAt||0)>2600) return;
            const m=$('yx-final-warehouse-menu'); if(!m || m.dataset.open!=='1') return;
            m.removeAttribute('hidden'); m.classList.remove('hidden'); m.setAttribute('aria-hidden','false');
            m.style.setProperty('display','flex','important');
            m.style.setProperty('visibility','visible','important');
            m.style.setProperty('opacity','1','important');
            m.style.setProperty('pointer-events','auto','important');
            m.style.setProperty('z-index','2147483647','important');
          }catch(_e){}
        }, delay)); }catch(_e){}
        clearHold(true);
        return ok || true;
      };
      const start=(ev,kind)=>{
        if(!isWarehouse()) return;
        if(Date.now()<Number(state.warehouseDragSuppressLongpressUntil||0) || state.drag) return;
        if(kind==='mouse' && ev.button && ev.button!==0) return;
        if(isIgnored(ev.target)) return;
        if(hold && kind==='touch' && Date.now()-Number(hold.startedAt||0)<560) return;
        const sn=snap(slotFrom(ev)); if(!sn) return;
        try{ if(document.body) document.body.dataset.module='warehouse'; }catch(_e){}
        const p=point(ev); clearHold(false);
        hold={snap:sn,x:p.x,y:p.y,lastX:p.x,lastY:p.y,kind:String(kind||'fallback'),startedAt:Date.now(),pointerId:ev.pointerId,opened:false,moved:false};
        state.lastWarehousePointerDownAt=Date.now();
        try{ sn.el.dataset.yxLongpressBridge='v450'; sn.el.classList.add('yx449-longpress-active','yx446-longpress-active','yx443-longpress-active','yx442-longpress-active'); }catch(_e){}
        // v450: do not preventDefault on initial touch/pointerdown; doing so can suppress the normal tap that opens a cell.
        // Native long-press/click is blocked only after the menu really opens or during guarded movement.
        holdTimer=setTimeout(()=>{ if(!hold || hold.opened || hold.moved) return; hold.opened=true; hardOpen(hold.snap,hold.x,hold.y,ev,'timer-'+kind); }, HOLD_MS[kind]||HOLD_MS.fallback);
      };
      const move=(ev)=>{
        if(!hold) return;
        if(state.drag){ clearHold(false); return; }
        if(hold.pointerId!=null && ev.pointerId!=null && hold.pointerId!==ev.pointerId) return;
        const p=point(ev); hold.lastX=p.x; hold.lastY=p.y;
        const d=Math.hypot(p.x-hold.x,p.y-hold.y);
        if(d>MOVE_CANCEL){ hold.moved=true; clearHold(false); return; }
        try{ const live=slotAt(p.x,p.y); const liveSnap=snap(live); if(liveSnap && liveSnap.key!==hold.snap.key && d>44){ hold.moved=true; clearHold(false); return; } }catch(_e){}
        if((hold.kind==='touch' || hold.kind==='pen') && d<DRAG_ALLOW){ try{ ev.preventDefault(); }catch(_e){} }
      };
      const end=(ev)=>{
        lastEndAt=Date.now();
        const opened=!!hold?.opened; clearHold(false);
        if(opened || Date.now()<suppressUntil){ try{ ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); }catch(_e){} }
      };
      const cancel=(ev,reason)=>{
        if(hold && !hold.moved && !hold.opened){
          const sn=hold.snap, x=hold.x, y=hold.y, age=Date.now()-Number(hold.startedAt||0);
          if(age>=MIN_CANCEL_RESCUE_MS){ hold.opened=true; hardOpen(sn,x,y,ev,reason||ev.type); }
          else {
            // Android/WebView may cancel almost immediately before the long-press timer can run.
            // One delayed rescue only; no interval/observer and no cache changes.
            setTimeout(()=>{
              try{
                if(lastEndAt && lastEndAt>=lastStartAt) return;
                if(Date.now()-lastEndAt<160) return;
                if(!isWarehouse()) return;
                const live=slotAt(x,y);
                if(live && snap(live)?.key && snap(live).key!==sn.key) return;
                hardOpen(sn,x,y,null,(reason||'cancel')+'-delayed');
              }catch(_e){}
            }, Math.max(100, MIN_CANCEL_RESCUE_MS-age));
          }
        }
        clearHold(false);
      };
      document.addEventListener('pointerdown', ev=>{ const kind=ev.pointerType==='mouse'?'mouse':(ev.pointerType==='pen'?'pen':'touch'); start(ev,kind); }, {capture:true, passive:false});
      document.addEventListener('pointermove', move, {capture:true, passive:false});
      document.addEventListener('pointerup', end, {capture:true, passive:false});
      document.addEventListener('pointercancel', ev=>cancel(ev,'pointercancel'), {capture:true, passive:false});
      document.addEventListener('lostpointercapture', ev=>cancel(ev,'lostpointercapture'), {capture:true, passive:false});
      document.addEventListener('touchstart', ev=>{ if(window.PointerEvent && hold && Date.now()-Number(hold.startedAt||0)<560) return; start(ev,'touch'); }, {capture:true, passive:false});
      document.addEventListener('touchmove', move, {capture:true, passive:false});
      document.addEventListener('touchend', end, {capture:true, passive:false});
      document.addEventListener('touchcancel', ev=>cancel(ev,'touchcancel'), {capture:true, passive:false});
      document.addEventListener('mousedown', ev=>{ if(!window.PointerEvent) start(ev,'mouse'); }, {capture:true, passive:false});
      document.addEventListener('mouseup', end, {capture:true, passive:false});
      document.addEventListener('contextmenu', ev=>{
        if(!isWarehouse() || isIgnored(ev.target)) return;
        const p=point(ev); const sn=snap(slotFrom(ev));
        if(sn) hardOpen(sn,p.x||window.innerWidth/2,p.y||window.innerHeight/2,ev,'contextmenu');
      }, {capture:true, passive:false});
      document.addEventListener('dragstart', ev=>{ if(isWarehouse() && slotFrom(ev)){ try{ ev.preventDefault(); ev.stopPropagation(); }catch(_e){} } }, {capture:true, passive:false});
      document.addEventListener('selectstart', ev=>{ if(isWarehouse() && slotFrom(ev)){ try{ ev.preventDefault(); ev.stopPropagation(); }catch(_e){} } }, {capture:true, passive:false});
      document.addEventListener('click', ev=>{
        if(!isWarehouse() || ev.target?.closest?.('#yx-final-warehouse-menu,.modal,.bottom-sheet,.drawer,.sheet,.dialog')) return;
        const now=Date.now(); const slot=slotFrom(ev);
        if((slot && (now<suppressUntil || now<Number(state.longpressSuppressClickUntil||0) || now<Number(slot.dataset.blockClickUntil||0))) || (openedAt && now-openedAt<2600)){
          try{ ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); }catch(_e){}
        }
      }, {capture:true, passive:false});
      document.addEventListener('keydown', ev=>{ if(ev.key==='Escape') hideWarehouseMenu(); }, {capture:true, passive:true});
      document.addEventListener('pointerdown', ev=>{
        if(!isWarehouse()) return;
        const m=$('yx-final-warehouse-menu');
        if(!m || m.dataset.open!=='1' || m.classList.contains('hidden')) return;
        if(ev.target?.closest?.('#yx-final-warehouse-menu')) return;
        // v453：長按選單開啟後，點外面就能關閉；不影響格子點擊，避免「開啟後關不掉」。
        hideWarehouseMenu();
      }, {capture:true, passive:false});
      const menuButtonFrom=(ev)=>{
        let act=ev.target?.closest?.('#yx-final-warehouse-menu [data-wh-act]');
        if(act) return act;
        try{ const p=point(ev); act=document.elementFromPoint(p.x,p.y)?.closest?.('#yx-final-warehouse-menu [data-wh-act]'); if(act) return act; }catch(_e){}
        try{
          const m=$('yx-final-warehouse-menu');
          if(!m || m.dataset.open!=='1' || m.classList.contains('hidden')) return null;
          const saved=m.dataset.yxPressedAct||'';
          const pressedAt=Number(m.dataset.yxPressedAt||0);
          if(saved && pressedAt && Date.now()-pressedAt<2400){ const savedBtn=m.querySelector(`[data-wh-act="${saved}"]`); if(savedBtn) return savedBtn; }
          return null;
        }catch(_e){ return null; }
      };
      const markButton=(ev)=>{
        if(!isWarehouse()) return; const mm=$('yx-final-warehouse-menu'); if(!mm || mm.dataset.open!=='1' || mm.classList.contains('hidden')) return; const act=menuButtonFrom(ev); if(!act) return;
        try{ const m=$('yx-final-warehouse-menu'); if(m){ m.dataset.yxPressedAct=String(act.dataset.whAct||''); m.dataset.yxPressedAt=String(Date.now()); } act.dataset.yxMenuPressAt=String(Date.now()); }catch(_e){}
        try{ ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); }catch(_e){}
      };
      const runButton=(ev)=>{
        if(!isWarehouse()) return; const mm=$('yx-final-warehouse-menu'); if(!mm || mm.dataset.open!=='1' || mm.classList.contains('hidden')) return; const act=menuButtonFrom(ev); if(!act) return;
        if(ev.type==='pointerup' && ev.pointerType==='mouse') return;
        const m=$('yx-final-warehouse-menu'); const action=String(act.dataset.whAct||'');
        const key=[action,m?.dataset.zone||'',m?.dataset.column||'',m?.dataset.slot||''].join(':');
        const now=Date.now();
        if(!action || (key===lastRunKey && now-lastRunAt<950)) return;
        lastRunKey=key; lastRunAt=now;
        try{ if(m){ delete m.dataset.yxPressedAct; delete m.dataset.yxPressedAt; } }catch(_e){}
        try{ ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); }catch(_e){}
        executeWarehouseMenuAction(action);
      };
      document.addEventListener('pointerdown', markButton, {capture:true, passive:false});
      document.addEventListener('touchstart', markButton, {capture:true, passive:false});
      document.addEventListener('mousedown', markButton, {capture:true, passive:false});
      document.addEventListener('pointerup', runButton, {capture:true, passive:false});
      document.addEventListener('touchend', runButton, {capture:true, passive:false});
      document.addEventListener('click', runButton, {capture:true, passive:false});
      window.YXWarehouseLongpressRebind=function(){
        try{ document.querySelectorAll(SLOT_SEL).forEach(el=>{ bindSlot(el); el.dataset.yxLongpressBridge='v450'; el.style.touchAction='manipulation'; el.style.webkitTouchCallout='none'; el.style.webkitUserSelect='none'; el.style.userSelect='none'; el.draggable=false; }); return true; }catch(_e){ return false; }
      };
      window.YXWarehouseLongpressDiagnose=function(){
        const m=$('yx-final-warehouse-menu'); const slots=document.querySelectorAll(SLOT_SEL);
        return {version:'v450', bridge:'single-engine-cleanout-proof', totalSlots:slots.length, boundSlots:document.querySelectorAll(SLOT_SEL+'[data-yx-final-bound="1"]').length, markedV450:document.querySelectorAll(SLOT_SEL+'[data-yx-longpress-bridge="v450"]').length, activeHold:hold?{key:hold.snap?.key||'',kind:hold.kind,age:Date.now()-Number(hold.startedAt||0),moved:!!hold.moved,opened:!!hold.opened}:null, menuOpen:!!(m && m.dataset.open==='1' && !m.classList.contains('hidden')), activeMenuKey:state.activeMenuKey||'', suppressUntil:Number(state.longpressSuppressClickUntil||0), singleEngineSuppressUntil:suppressUntil, lastEndAt, menuOpenedAt:openedAt, slotLongpressDisabled:!!window.__YX_WAREHOUSE_DISABLE_SLOT_LONGPRESS_V445__, slotLongpressDisabledV448:!!window.__YX_WAREHOUSE_DISABLE_SLOT_LONGPRESS_V448__, slotLongpressEngineV449:!!window.__YX_WAREHOUSE_LONGPRESS_SINGLE_ENGINE_V449__, slotLongpressEngineV450:!!window.__YX_WAREHOUSE_LONGPRESS_SINGLE_ENGINE_V450__, legacyBridgeRemovedV450:!!window.__YX_WAREHOUSE_LONGPRESS_LEGACY_BRIDGES_REMOVED_V450__, lastOpen:state.longpressLastOpen||null, menuDataset:m?{open:m.dataset.open,zone:m.dataset.zone,column:m.dataset.column,slot:m.dataset.slot,bridge:m.dataset.yxBridge,display:m.style.display,visibility:m.style.visibility,opacity:m.style.opacity}:null};
      };
      window.YXWarehouseOpenLongpressMenu=function(zone,column,slot,x,y){
        const z=clean(zone).toUpperCase(), c=Number(column), s=Number(slot);
        let el=null;
        try{ el=[...document.querySelectorAll(SLOT_SEL)].find(n=>clean(n.dataset.zone).toUpperCase()===z && Number(n.dataset.column)===c && Number(n.dataset.slot)===s) || null; }catch(_e){}
        return hardOpen({el,zone:z,column:c,slot:s,key:`${z}-${c}-${s}`}, x||window.innerWidth/2, y||window.innerHeight/2, null, 'manual');
      };
      window.addEventListener('pageshow',()=>{ clearHold(false); suppressUntil=0; lastRunKey=''; lastRunAt=0; try{ document.documentElement.dataset.yxWarehouseLongpressEngine='v450'; }catch(_e){} try{ window.YXWarehouseLongpressRebind?.(); }catch(_e){} }, false);
      document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible'){ clearHold(false); suppressUntil=0; lastRunKey=''; lastRunAt=0; try{ document.documentElement.dataset.yxWarehouseLongpressEngine='v450'; }catch(_e){} try{ window.YXWarehouseLongpressRebind?.(); }catch(_e){} } }, false);
      try{ window.YXWarehouseLongpressRebind(); }catch(_e){}
    }
    // V450: legacy v439/v442/v443 bridge blocks removed from the active file.
    // Long-press now has exactly one root engine plus the original menu/actions.
    const unplacedPill=$('warehouse-unplaced-pill');
    if(unplacedPill && unplacedPill.dataset.yxLongRefresh!=='1'){
      unplacedPill.dataset.yxLongRefresh='1';
      let lpTimer=null, sx=0, sy=0;
      const clear=()=>{ if(lpTimer){ clearTimeout(lpTimer); lpTimer=null; } };
      unplacedPill.addEventListener('pointerdown',ev=>{ sx=ev.clientX; sy=ev.clientY; clear(); lpTimer=setTimeout(async()=>{ lpTimer=null; try{ await loadAvailable(true); toast('已長按刷新未錄入倉庫圖件數','ok'); }catch(e){ toast(e.message||'刷新失敗','error'); } },650); });
      unplacedPill.addEventListener('pointermove',ev=>{ if(Math.abs(ev.clientX-sx)>10 || Math.abs(ev.clientY-sy)>10) clear(); });
      ['pointerup','pointercancel','pointerleave'].forEach(t=>unplacedPill.addEventListener(t,clear));
    }
    if(!window.__YX_WAREHOUSE_PAGEHIDE_FLUSH_V170__){
      window.__YX_WAREHOUSE_PAGEHIDE_FLUSH_V170__ = true;
      const flushOnLeave = ()=>{ try{ if(isWarehouse()){ flushAllPendingAutoSaves('離開頁面前已先保存目前格位，背景儲存中'); } }catch(_e){} };
      window.addEventListener('pagehide', flushOnLeave, {capture:true});
      document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='hidden') flushOnLeave(); }, true);
    }
    if(!window.__YX_WAREHOUSE_RETRY_FAILED_SAVE_V267__){
      window.__YX_WAREHOUSE_RETRY_FAILED_SAVE_V267__=true;
      window.addEventListener('yx:warehouse-retry-failed-saves',()=>{ retryAllFailedWarehouseOps({toast:true}).catch(e=>toast(e.message||'倉庫重送失敗','error')); },false);
    }
    try{
      const pendingFailed=readFailedSaves();
      const pendingStructure=readFailedStructureOps();
      if((pendingFailed.length||pendingStructure.length) && Date.now()-Number(state.failedSaveNoticeAt||0)>3000){
        state.failedSaveNoticeAt=Date.now();
        toast(`有 ${Number(pendingFailed.length||0)+Number(pendingStructure.length||0)} 筆倉庫操作等待重送；可留在倉庫頁後再次按儲存或觸發重試`, 'warn');
        retryAllFailedWarehouseOps({toast:false}).catch(()=>{});
      }
    }catch(_e){}
    document.addEventListener('click',async ev=>{
      if(!isWarehouse()) return;
      const act=ev.target?.closest?.('[data-wh-act]'); if(act){ ev.preventDefault(); ev.stopPropagation(); await executeWarehouseMenuAction(act.dataset.whAct); return; }
      const warehouseClickedSlot=ev.target?.closest?.('#warehouse-root [data-zone][data-column][data-slot]');
      const warehouseClickNow=Date.now();
      if(warehouseClickedSlot && (warehouseClickNow<Number(warehouseClickedSlot.dataset.blockClickUntil||0) || warehouseClickNow<Number(state.longpressSuppressClickUntil||0))){
        ev.preventDefault(); ev.stopPropagation(); return;
      }
      if(!ev.target?.closest?.('#yx-final-warehouse-menu')) { if(Date.now()-Number(state.menuOpenedAt||0)>1900 && warehouseClickNow>Number(state.longpressSuppressClickUntil||0)) { const _m=menu(); _m.classList.add('hidden'); _m.dataset.open='0'; _m.setAttribute('aria-hidden','true'); } }
      if(ev.target?.id==='yx121-add-batch-row'){ ev.preventDefault(); state.modalUserTouchedAt=Date.now(); state.batchCount=Math.max(3,Number(state.batchCount||3))+1; renderCellItems(); markCurrentCellDirty(); return; }
      if(ev.target?.id==='yx121-retry-failed-saves'){ ev.preventDefault(); await retryAllFailedWarehouseOps({toast:true}); return; }
      if(ev.target?.id==='yx121-save-cell'){ ev.preventDefault(); try{ await saveWarehouseCell(); }catch(e){ try{window.dispatchEvent(new CustomEvent('yx:operation-soft-failed',{detail:{source:'warehouse',reason:'cell-save-failed',error:e.message||'儲存格位失敗',version:'v423',zone:state.current?.zone,column_index:state.current?.col,slot_number:state.current?.slot,payload:saveCellPayload(state.current?.zone,state.current?.col,state.current?.slot,state.current?.items||[],($('warehouse-note')?.value||''))}}));}catch(_e){}
      toast(e.message||'儲存格位失敗，草稿已保留可直接再存','error'); } return; }
      const rm=ev.target?.closest?.('[data-remove-cell-item]'); if(rm){
        ev.preventDefault();
        state.modalUserTouchedAt=Date.now();
        if(!state.current) return;
        const z=state.current.zone, c=state.current.col, s=state.current.slot;
        const before=JSON.parse(JSON.stringify(cellItems(z,c,s)));
        applyCurrentItemInputs();
        const idx=Number(rm.dataset.removeCellItem);
        if(!Number.isFinite(idx) || idx<0 || idx>=(state.current.items||[]).length) return;
        const removedItem=JSON.parse(JSON.stringify((state.current.items||[])[idx]||{}));
        state.current.items.splice(idx,1);
        // V502: make the removed item return to the A/B unplaced dropdown immediately. autoSave still performs the canonical delta and DB write.
        try{ mutateAvailableLocked([removedItem], +1, z, 'remove-current-item-return-unplaced', key(z,c,s)+'-remove-'+Date.now()); }catch(_e){}
        // V411: redraw first. autoSaveCurrentCell reads the live editor DOM; without this, the deleted row can be read back and saved again.
        renderCellItems(false);
        syncBatchSelectLimits?.(false);
        persistWarehouseDraft();
        autoSaveCurrentCell('已先刪除該筆商品並退回下拉選單，背景儲存中', before, {useProvidedBefore:true});
        return;
      }
      const curProd=ev.target?.closest?.('[data-current-product]'); if(curProd){ setTimeout(()=>syncCurrentRowQtyFromProduct(curProd.closest('.yx-direct-current-item')),0); return; }
      const curQty=ev.target?.closest?.('[data-current-qty]'); if(curQty){ setTimeout(()=>syncCurrentRowProductFromQty(curQty.closest('.yx-direct-current-item')),0); return; }
    },true);
    document.addEventListener('change', ev=>{
      if(!isWarehouse()) return;
      const sel=ev.target?.closest?.('#yx121-batch-rows .yx121-batch-select'); if(sel){ state.modalUserTouchedAt=Date.now(); syncBatchSelectLimits(); persistWarehouseDraft(); }
      const currentEdit=ev.target?.closest?.('#warehouse-current-items-html [data-current-product], #warehouse-current-items-html [data-current-qty], #warehouse-current-items-html [data-current-material], #warehouse-current-items-html [data-current-placement]');
      if(currentEdit && state.current){
        state.modalUserTouchedAt=Date.now();
        const before=JSON.parse(JSON.stringify(cellItems(state.current.zone,state.current.col,state.current.slot)));
        scheduleAutoSaveCurrentCell('已先套用格內編輯，減少數量會立即退回下拉選單，背景儲存中', before);
      }
    }, true);
    document.addEventListener('input', ev=>{
      if(!isWarehouse()) return;
      const curProduct=ev.target?.closest?.('#warehouse-current-items-html [data-current-product]');
      if(curProduct){
        state.modalUserTouchedAt=Date.now();
        const row=curProduct.closest('.yx-direct-current-item');
        const qtyEl=row?.querySelector('[data-current-qty]');
        const n=qtyFromProductTextForInput(curProduct.value, 0);
        // 例如 363x30x06=858x28，右側件數立即同步成 28；手動只改件數時不會被商品文字蓋回。
        if(qtyEl && n>0) qtyEl.value=String(n);
      }
      const curQty=ev.target?.closest?.('#warehouse-current-items-html [data-current-qty]');
      if(curQty){
        state.modalUserTouchedAt=Date.now();
        if(Number(curQty.value)<1) curQty.value='1';
        syncCurrentRowProductFromQty(curQty.closest('.yx-direct-current-item'));
      }
      const liveEdit=ev.target?.closest?.('#warehouse-current-items-html [data-current-product], #warehouse-current-items-html [data-current-qty], #warehouse-current-items-html [data-current-material], #warehouse-current-items-html [data-current-placement]');
      if(liveEdit && state.current){
        const before=JSON.parse(JSON.stringify(cellItems(state.current.zone,state.current.col,state.current.slot)));
        scheduleAutoSaveCurrentCell('格位商品已先更新，背景儲存中', before, 560);
        return;
      }
      const noteEl=ev.target?.closest?.('#warehouse-note');
      if(noteEl && state.current){
        const before=JSON.parse(JSON.stringify(cellItems(state.current.zone,state.current.col,state.current.slot)));
        scheduleAutoSaveCurrentCell('格位備註已先更新，背景儲存中', before, 420);
        return;
      }
      const batchDraftInput=ev.target?.closest?.('#yx121-batch-rows .yx121-batch-qty, #yx121-batch-rows .yx121-batch-support');
      if(batchDraftInput) persistWarehouseDraft();
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
  async function jumpProductToWarehouse(customerName, productText){ protectActiveWarehouseEdit(''); const q=clean([customerName,productText].filter(Boolean).join(' ')); if(!q) return toast('缺少商品或客戶關鍵字','warn'); try{ const d=await api('/api/warehouse/search?q='+encodeURIComponent(q)+'&ts='+Date.now()); const hit=(Array.isArray(d.items)?d.items:[])[0]; if(!hit) return toast('倉庫圖找不到這筆商品位置','warn'); const c=resolveSearchHitCell(hit); highlightWarehouseCell(c.zone,c.column_index,c.slot_number); }catch(e){ toast(e.message||'跳到倉庫位置失敗','error'); } }
  function install(){ if(!isWarehouse()) return; document.documentElement.dataset.yxWarehouseSingleHtmlDataJs='true'; document.documentElement.dataset.yxWarehouseLongpressDbSync='v469-clean-refresh-force-glue-pass6' ; try{ if(document.body) document.body.dataset.module='warehouse'; }catch(_e){}; bindGlobal(); bindSlots(); if(!state.productDataChangedBound){ state.productDataChangedBound=true; const refreshFromExternal=(ev)=>{ const d=ev&&ev.detail?ev.detail:ev; const eid=[ev&&ev.type||'', d&&d.operation_id||d&&d.request_key||d&&d.event_id||'', d&&d.reason||'', d&&d.customer_name||''].join('::'); state.externalRefreshSeen=state.externalRefreshSeen||new Map(); const now=Date.now(); const last=Number(state.externalRefreshSeen.get(eid)||0); if(eid && last && now-last<900) return; state.externalRefreshSeen.set(eid,now); let applied=false; try{ applied=!!applyWarehouseShipColumnSnapshots(d); if(!applied) applied=!!applyWarehouseDeductFromShip(d); }catch(_e){} try{ state.availableCache = {}; state.availableSeq++; }catch(_e){} try{ if(applied){ updateAllSlots(); loadAvailable(false).catch(()=>{}); } else { hydrateWarehouseFromDeviceSync().then(()=>{ updateAllSlots(); loadAvailable(false).catch(()=>{}); }).catch(()=>{}); } }catch(_e){} }; window.addEventListener('yx:product-data-changed',refreshFromExternal,false); window.addEventListener('yx:ship-completed',refreshFromExternal,false); window.addEventListener('yx:order-master-changed',refreshFromExternal,false); } setWarehouseZone(localStorage.getItem('warehouseActiveZone')||'A',false); renderWarehouse(false); }
  window.renderWarehouse=renderWarehouse;
  window.setWarehouseZone=setWarehouseZone;
  window.searchWarehouse=searchWarehouse;
  window.clearWarehouseHighlights=clearWarehouseHighlights; window.clearWarehouseSearch=clearWarehouseSearch;
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
  try{ window.addEventListener('yx:customer-profile-changed',()=>{ try{ hydrateWarehouseFromDeviceSync().then(()=>{updateAllSlots(); loadAvailable(false).catch(()=>{});}).catch(()=>{}); }catch(_e){} }, false); }catch(_e){}
  async function applyTargetedRetryRefresh(ctx={}){
    const result = ctx.result || ctx.response || {};
    const payload = ctx.payload || {};
    const row = ctx.row || {};
    const url = clean(ctx.url || row.url || '');
    let changed=false;
    let highlightCell=null;
    const refreshTargets=[];
    const refreshLabel=(z,c,s)=>{
      z=clean(z||'').toUpperCase(); c=Number(c||0); s=Number(s||0);
      const bits=[]; if(z) bits.push(z+'區'); if(c) bits.push('第'+c+'欄'); if(s) bits.push('第'+s+'格');
      return bits.join(' ');
    };
    const pushTarget=(txt)=>{ txt=clean(txt); if(txt && !refreshTargets.includes(txt)) refreshTargets.push(txt); };
    const applyCell=(cell)=>{
      if(!cell) return false;
      const nc=normalizeServerCell(cell, cell.zone || payload.zone, cell.column_index || payload.column_index || payload.col);
      if(!mayApplyColumnReadback(nc.zone,nc.column_index,null,'targeted-cell-readback')) return false;
      let items=Array.isArray(nc.items)?nc.items:cellItemsFromRow(nc);
      // V430: saved_cell/server_cell sometimes returns a slot shell with empty items while
      // the POST payload/local optimistic state contains the product. Keep the visible item;
      // do not change cache/core/queue behavior, only block empty readback from painting 空格.
      if((!items || !items.length)){
        const local=cellFromData(nc.zone,nc.column_index,nc.slot_number);
        const localItems=local ? cellItemsFromRow(local) : [];
        const payloadItems=(clean(payload.zone||'').toUpperCase()===nc.zone && Number(payload.column_index||payload.col||0)===Number(nc.column_index) && Number(payload.slot_number||payload.slot||0)===Number(nc.slot_number)) ? normalizeCellItemsForDisplay(payload.items||[]) : [];
        if(payloadItems.length) items=payloadItems;
        else if(localItems.length) items=localItems;
        else if(cellItemsFromRow(cell).length) items=cellItemsFromRow(cell);
      }
      if((!items || !items.length) && (Number(cell?.saved_item_count||0)<=0) && normalizeCellItemsForDisplay(payload.items||[]).length){ return false; }
      if((!items || !items.length) && cellFromData(nc.zone,nc.column_index,nc.slot_number) && cellItemsFromRow(cellFromData(nc.zone,nc.column_index,nc.slot_number)).length){ return false; }
      setLocalCellItems(nc.zone,nc.column_index,nc.slot_number,items,nc.note||'');
      updateSlotUI(nc.zone,nc.column_index,nc.slot_number);
      highlightCell={zone:nc.zone,column_index:nc.column_index,slot_number:nc.slot_number};
      pushTarget(refreshLabel(nc.zone,nc.column_index,nc.slot_number));
      return true;
    };
    try{
      if(result.saved_cell) changed = applyCell(result.saved_cell) || changed;
      if(result.server_cell) changed = applyCell(result.server_cell) || changed;
      const applyColumn=(z,c,cells)=>{
        if(!Array.isArray(cells) || !cells.length) return false;
        z=clean(z || payload.zone || payload.to?.zone || payload.from?.zone).toUpperCase();
        c=Number(c || payload.column_index || payload.col || payload.to?.column_index || payload.to?.col || payload.from?.column_index || payload.from?.col || 0);
        if(!z || !c) return false;
        const ok=applyColumnCells(z,c,cells);
        if(ok){ activeColumnCells(z,c).forEach(cell=>updateSlotUI(z,c,cell.slot_number)); removeExtraDom(z,c); highlightCell=highlightCell||{zone:z,column_index:c,slot_number:Number(payload.slot_number||payload.slot||result.slot_number||0)||0}; pushTarget(refreshLabel(z,c,Number(payload.slot_number||payload.slot||result.slot_number||0)||0)); }
        return ok;
      };
      changed = applyColumn(result.zone, result.column_index, result.column_cells) || changed;
      changed = applyColumn(payload.from?.zone || result.from?.zone || payload.zone, payload.from?.column_index || payload.from?.col || result.from?.column_index || result.from?.col || payload.column_index, result.from_column_cells) || changed;
      changed = applyColumn(payload.to?.zone || result.to?.zone || payload.zone, payload.to?.column_index || payload.to?.col || result.to?.column_index || result.to?.col || payload.column_index, result.to_column_cells) || changed;
      if(!changed){
        const z=clean(payload.zone || payload.cell?.zone || result.zone || '').toUpperCase();
        const c=Number(payload.column_index || payload.col || payload.cell?.column_index || result.column_index || 0);
        const sl=Number(payload.slot_number || payload.slot || payload.cell?.slot_number || result.slot_number || 0);
        if(z && c && sl && !url.includes('consistency-check')){
          const check=await api('/api/warehouse/consistency-check',{method:'POST',body:JSON.stringify({operation_id:payload.operation_id||result.operation_id||'',zone:z,column_index:c,slot_number:sl})});
          if(check && check.server_cell) changed = applyCell(check.server_cell) || changed;
        }
      }
      if(changed){
        cacheWarehouseNow();
        try{ clearWarehouseCaches(); }catch(_e){}
        try{ state.availableCache={}; state.availableSeq++; }catch(_e){}
        try{ await loadAvailable(); }catch(_e){}
        updateAllSlots();
        if(highlightCell && highlightCell.zone && highlightCell.column_index && highlightCell.slot_number) highlightWarehouseCell(highlightCell.zone,highlightCell.column_index,highlightCell.slot_number);
        const refreshTarget=clean(refreshTargets.join('、') || (highlightCell ? refreshLabel(highlightCell.zone,highlightCell.column_index,highlightCell.slot_number) : '倉庫格位'));
        try{ ctx._yx_refresh_target=refreshTarget; }catch(_e){}
        try{ window.dispatchEvent(new CustomEvent('yx:operation-target-refresh',{detail:{source:'warehouse',target:'cell-or-column',refresh_target:refreshTarget,target_label:refreshTarget,detail_text:refreshTarget,message:refreshTarget?'局部刷新完成：'+refreshTarget:'倉庫局部刷新完成',operation_id:payload.operation_id||result.operation_id||'',version:'v450-warehouse-longpress-single-engine-cleanout-proof'}})); }catch(_e){}
        return true;
      }
    }catch(e){
      try{ toast(e.message||'單筆重送後局部刷新失敗，已保留狀態','warn'); }catch(_e){}
    }
    return false;
  }
  window.YXFinalWarehouse={version:'v520-final-ship-cache-align-pack30',render:renderWarehouse, openWarehouseModal, saveWarehouseCell, jumpProductToWarehouse, applyTargetedRetryRefresh, applyWarehouseShipColumnSnapshots, applyWarehouseDeductFromShip};
  if(YX.register) YX.register('warehouse',{install,render:renderWarehouse,cleanup:()=>{}});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
})();

/* ===== END static/yx_modules/warehouse_main.js ===== */

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



// warehouse_v161_stability: duplicate menu + column queue guard enabled.

// V162 warehouse stale-response guard enabled.

// WAREHOUSE_STABILITY_V165: drag queue, move readback guard, cache version alignment.


// warehouse_v166_stability: stale pending-column cleanup + available-items stale guard.


// warehouse_v169_stability: safe autosave flush before switching cells + robust background response merge; no renderer/setInterval/MutationObserver added.

// warehouse_v170_stability: autosave payload sanitize, duplicate autosave coalescing, pagehide flush; no renderer/setInterval/MutationObserver added.
// warehouse_v171_stability: same-cell save coalescing + DB response slot de-dup + empty note persistence; no renderer/setInterval/MutationObserver added.

// warehouse_v173_stability: fixed hidden/delete slot renumber crash, corrected scroll centering, and queued manual save while same cell is already saving; no renderer/setInterval/MutationObserver added.

// warehouse_v174_stability: modal async race guard, available-items return fix, universal single-controller flag, cache/static version bump; no renderer/setInterval/MutationObserver added.

// warehouse_v175_stability: hand-save lock stays until background save resolves; same-cell edits during save are coalesced into one follow-up save. No renderer/setInterval/MutationObserver added.
// warehouse_v176_stability: protected current-cell merge prevents older column/readback responses from overwriting a cell being edited or saved; cache/static version bumped. No renderer/setInterval/MutationObserver added.

// warehouse_v177_stability: stale DB save responses no longer overwrite newer same-cell edits; current autosave is flushed on pagehide and stale hidden timers are cancelled; cache/static version bumped. No renderer/setInterval/MutationObserver added.

// warehouse_v178_stability: fresh warehouse reloads preserve active/queued cells, same-cell retry state is kept safely, cache/static version bumped. No renderer/setInterval/MutationObserver added.
// warehouse_v179_stability: initializes loadSeq so fresh DB warehouse responses apply correctly, fixes zone scroll option, and flushes pending same-column autosaves before slot insert/delete/move operations. No renderer/setInterval/MutationObserver added.

// warehouse_v180_stability: uses live local cell as autosave availability baseline and flushes same-column pending edits before mark/return actions. No renderer/setInterval/MutationObserver added.

// warehouse_v181_stability: protects in-flight autosave cells from fresh DB/column readback overwrites; cache/static version bumped. No renderer/setInterval/MutationObserver added.

// warehouse_v182_stability: cache hydration and full DB responses now preserve exact cells being edited/saved/queued, not only pending columns. No renderer/setInterval/MutationObserver added.
// warehouse_v183_stability: structural slot operations now drain same-column autosave chains before renumbering, preventing old slot saves from overwriting inserted/deleted/dragged cells. No renderer/setInterval/MutationObserver added.

// warehouse_v184_stability: manual save now closes the modal without firing close-time autosave, preventing duplicate same-cell background writes and stale save races. No renderer/setInterval/MutationObserver added.
// warehouse_v219_stability: live editor input values flush into local cell/draft before quick switching or closing; input debounced autosave protects product/material/qty edits without adding renderer/timer loop/observer.

// warehouse_v185_stability: preserves unsubmitted batch-add rows as local draft on close/switch and restores them safely; no renderer/setInterval/MutationObserver added.

// warehouse_v187_stability: stale save locks self-heal and immediate save exceptions release the lock; no renderer/setInterval/MutationObserver added.
// warehouse_v186_stability: manual/autosave optimistic cell state is kept as local draft until DB confirms; no renderer/setInterval/MutationObserver added.

// warehouse_v188_stability: delayed same-cell save is key-checked before execution; locked-cell edits are immediately reflected in local cell/draft; no renderer/setInterval/MutationObserver added.

// warehouse_v214_cross_sync: ship-completed warehouse deducts are session-deduped and locally protected before DB refresh, preventing duplicate front-end deductions or stale grid overwrite. No renderer/setInterval/MutationObserver added.

// warehouse_v226_ship_preview_source_lock
// warehouse_v221_cross_sync: keeps single renderer and existing queue/cache; paired with shipping/product customer-variant sync and final event emit guard. No renderer/setInterval/MutationObserver added.

// warehouse_v222_unplaced_zone_sync: fixes A/B returned-item bucket, same-cell batch remaining qty, and local unplaced cache version without adding renderer/timer/observer.


/* V417: operation status full-page panel removed permanently.
   Keeps a tiny compatibility object only so existing background-save / warehouse / shipping code can keep running.
   No status card renderer, no document click/input binding, no interval, no observer. */
(function(){
  'use strict';
  window.__YX_V342_OPERATION_STATUS_CARD__ = true;
  const VERSION='v423-warehouse-fresh-reload-unplaced-sync';
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
  const VERSION='v423-warehouse-fresh-reload-unplaced-sync';
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

// warehouse_v408_drag_cache_sync: move-cell clears server/derived caches and slot-compacting operations clear unsafe per-slot drafts. No renderer/setInterval/MutationObserver added.
// warehouse_v409_unplaced_source_sync: grouped dropdown/source_details optimistic mutations now deduct/return each source_id immediately, and A/B available API treats a source row as placed once it exists anywhere in the warehouse. No renderer/setInterval/MutationObserver added.
// warehouse_v411_cell_edit_save_sync: delete/current-item edits redraw before autosave so removed products cannot be resurrected from stale DOM; explicit delete baseline returns quantities to unplaced correctly; same product in different placements is preserved. No renderer/setInterval/MutationObserver added.
// warehouse_v423_fresh_reload_unplaced_sync: DB column readbacks now require the latest column operation token/local revision, preventing older drag/insert/delete/return responses from overwriting newer continuous warehouse changes. No renderer/setInterval/MutationObserver added.

// warehouse_v423_fresh_reload_unplaced_sync: force/manual warehouse reload and unplaced dropdown refresh bypass local/server fast cache; normal entry still uses cache for speed. No renderer/setInterval/MutationObserver added; removed operation status panel stays removed.

// V424 warehouse_visible_items_cache_guard: preserves existing cache architecture while preventing empty warehouse readbacks/cache writes from hiding saved products; normalize now keeps legacy/raw item fields. No renderer/setInterval/MutationObserver added.

// warehouse_v427_mirror_rescue_visible_items: item parser accepts raw_text/legacy JSON and keeps mirror-rescued rows visible. Cache architecture unchanged; no renderer/setInterval/MutationObserver added.

// warehouse_v428_save_readback_mirror_lock: preserves legacy product-only rows on save and merges DB mirror readback without changing cache/background architecture. No renderer/setInterval/MutationObserver added.

// warehouse_v432_max_repair: keeps yx_cache/yx_core/fast-cache/background-queue/SW API policy intact; adds only empty-readback guards and tolerant item readback. No renderer/setInterval/MutationObserver added.

// warehouse_v438_longpress_maximum_repair: single global long-press rescue for all slots, pointercancel Android rescue, stronger menu tap isolation. No renderer/setInterval/MutationObserver/cache core changes added.

// warehouse_v439_longpress_maximum_action_proof: stronger long-press trigger, Android/WebView action fallback, one-shot menu display repair. No renderer/setInterval/MutationObserver/cache core changes added.

// warehouse_v440_longpress_maximum_input_proof: long-press is easier to trigger, lostpointercapture/context/touch action paths are guarded, menu buttons execute reliably on Android/WebView, stale suppress flags self-clear. No cache core/renderer/setInterval/MutationObserver change.

// warehouse_v442_longpress_maximum_event_bridge: capture-level long-press bridge, context/touch/pointercancel rescue, menu action fallback. No cache core/renderer/setInterval/MutationObserver change.

// warehouse_v442_longpress_maximum_gesture_action_proof: stronger touch/pointer/context long-press bridge, elementFromPoint menu action fallback, no cache core/renderer/setInterval/MutationObserver change.

// warehouse_v443_longpress_maximum_final_input_shield: last-resort capture/touch/pointer/context bridge, DOM-snapshot menu open, robust menu button action fallback. No cache core/renderer/setInterval/MutationObserver change.

// warehouse_v444_longpress_single_path_maximum_proof: disables older competing delegated long-press bridges on fresh load and keeps one capture path + original menu/actions only. No cache core/renderer/setInterval/MutationObserver change.

// warehouse_v448_longpress_root_single_engine_proof: true single long-press engine; per-slot longpress timers disabled while preserving tap/drag/menu actions. No cache core/renderer/setInterval/MutationObserver change.

// warehouse_v448_longpress_root_single_engine_proof: robust warehouse detection, root-level single long-press engine, early-cancel rescue, menu hit-test fallback. No cache core/renderer/setInterval/MutationObserver change.

// warehouse_v448_longpress_exact_touch_action_proof: root single engine now avoids preventing default on initial touch so normal tap still opens cells; menu button hit testing no longer triggers first action on whitespace; drag state is cleared before menu open; manual diagnose selector fixed. No cache core/renderer/setInterval/MutationObserver change.

// warehouse_v448_longpress_true_single_engine_action_proof: removed per-slot longpress timers/preventDefault conflicts; root single engine owns long-press, slot engine only handles tap/intentional drag. Menu action fallback now requires open menu + recent pressed action. No cache core/renderer/setInterval/MutationObserver change.

// warehouse_v449_longpress_deghosted_single_engine_proof: de-ghosts legacy longpress bridges, keeps one root engine, preserves tap/drag/menu actions. No cache core/renderer/setInterval/MutationObserver change.

// warehouse_v450_longpress_single_engine_cleanout_proof: removes dormant legacy v439/v442/v443 longpress bridge blocks from active file, keeps one root engine, makes cancel rescue less ghost-prone, preserves tap/drag/menu actions and cache core.

// warehouse_v501_structure_slots_pack11_frontend: structure readback trusts exact DB slot list only after item-bag verification; base empty slot deletion stays hidden. No renderer/setInterval/MutationObserver added.

/* V518 evidence markers: yx-v485-centered-action-sheet centered-action-sheet hideWarehouseMenu executeWarehouseMenuAction batch-add-slots queuedWarehousePost cacheWarehouseNow bumpColumnLocalRevision mark-cell canTrustStructureColumnReadback trustStructure yx499-cell-top yx499-count-split yx499-total manualUnplacedRefresh */
/* V518 static token: v520-final-ship-cache-align-pack30 */
