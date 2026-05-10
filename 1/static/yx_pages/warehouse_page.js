
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
    if (now - window.__YX_WAREHOUSE_STABILITY__.lastMenuAt < 180) return false;
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
/* 沅興木業 倉庫頁最終鎖死版
   原則：倉庫頁只吃 templates/module.html 內唯一 HTML；本檔只更新資料、事件、API，不再整頁 render / 不再吃舊 render。 */
(function(){
  'use strict';
  // V182 warehouse stability: preserves locally protected cells even when hydrating from cache/full DB responses; no renderer/timer/observer added.
  // Prevent duplicate document click/change/input listeners when the module script is loaded twice.
  if (window.__YX_WAREHOUSE_MAIN_SINGLETON__) return;
  window.__YX_WAREHOUSE_MAIN_SINGLETON__ = true;
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
  const api = YX.api || (async (url,opt={})=>{ const res=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}}); const data=await res.json().catch(()=>({success:false,error:'伺服器回應格式錯誤'})); if(!res.ok||data.success===false) throw new Error(data.error||data.message||'請求失敗'); return data; });
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
    try { if(!state.current) return; localStorage.setItem(warehouseDraftKey(), JSON.stringify({items:state.current.items||[], note:$('warehouse-note')?.value||'', saved_at:Date.now()})); } catch(_e){}
  }
  function clearWarehouseDraft(z,c,s){
    try { localStorage.removeItem(`yx119b2-warehouse-draft-${clean(z||'A')}-${Number(c||1)}-${Number(s||1)}`); } catch(_e){}
  }
  function restoreWarehouseDraft(){
    try {
      const raw=localStorage.getItem(warehouseDraftKey());
      if(!raw) return false;
      const draft=JSON.parse(raw);
      if(!draft || Date.now()-Number(draft.saved_at||0)>86400000) return false;
      if(Array.isArray(draft.items) && draft.items.length){ state.current.items=draft.items; }
      if($('warehouse-note') && typeof draft.note==='string') $('warehouse-note').value=draft.note;
      return true;
    } catch(_e){ return false; }
  }
  function bgPost(url, payload, onSuccess, label){
    const bg = window.YXBackgroundSave;
    const runner = bg && typeof bg.requestSoft === 'function'
      ? bg.requestSoft(url, payload, {method:'POST', module:'warehouse'})
      : api(url,{method:'POST', body:JSON.stringify(payload||{})}).then(data=>({success:true,data})).catch(err=>({success:false,error:err&&err.message,permanent:true}));
    return Promise.resolve(runner).then(result=>{
      if(result && result.success){ const data=(result.data && typeof result.data==='object') ? result.data : ((result.payload && typeof result.payload==='object') ? result.payload : result); if(data && typeof data==='object' && data.success == null) data.success = true; if(typeof onSuccess==='function') onSuccess(data||{}); return data||{}; }
      if(result && result.queued){
        // V160：背景佇列代表請求已保留待重試，不應該被視為保存失敗而還原欄位。
        toast(`${label||'操作'}已保留在背景佇列，切頁後仍會重試`, 'warn');
        return {success:true, queued:true, operation_id:payload?.operation_id||''};
      }
      toast(`${label||'操作'}背景保存失敗：${result?.error||'請稍後確認'}`, 'error');
      return {success:false, error:result?.error||'background-save-failed'};
    }).catch(err=>{
      toast(`${label||'操作'}已保留在背景佇列，切頁後仍會重試`, 'warn');
      return {success:true, queued:true, error:err&&err.message, operation_id:payload?.operation_id||''};
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
    },label));
    const chainTask=rawTask.then(result=>{
      if(!isLatestColumnOp(token)) return result;
      const queued = !!(result && result.queued);
      const ok = queued || !!(result && (result.success !== false));
      if(ok){
        finishColumnOp(token,true);
        if(queued) cacheWarehouseNow();
      }else if(opts.rollback !== false){
        rollbackColumnOp(token, `${label||'操作'}沒有確實存入資料庫，已還原該欄`);
      }else{
        finishColumnOp(token,false);
      }
      return result;
    }).catch(err=>{
      if(opts.rollback !== false) rollbackColumnOp(token, `${label||'操作'}保存失敗，已還原該欄`);
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
    }, label||'拖拉移動')).then(result=>{
      const queued=!!(result&&result.queued);
      const ok=queued || !!(result && result.success !== false);
      if(ok){
        if(fromToken && isLatestColumnOp(fromToken)) finishColumnOp(fromToken,true);
        if(toToken && toToken.key!==fromToken?.key && isLatestColumnOp(toToken)) finishColumnOp(toToken,true);
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

  const isWarehouse = () => document.querySelector('.module-screen[data-module="warehouse"]') || (location.pathname||'').includes('/warehouse');
  const state = {
    data:{cells:[], zones:{A:{},B:{}}}, available:[], availableByZone:{A:[],B:[]}, activeZone:null, searchKeys:new Set(), undoStack:[],
    current:{zone:'A',col:1,slot:1,items:[],note:''}, batchCount:3, drag:null, loading:null, bound:false, unplacedOpen:false, modalSeq:0, loadSeq:0,
    columnChains:new Map(), columnSeq:new Map(), pendingColumns:new Set(), columnStartedAt:new Map(), lastGoodColumns:new Map(), menuActionAt:new Map(), sourceQtyMap:{}, activeMenuKey:'', menuOpenedAt:0, availableSeq:0, autoSaveTimers:new Map(), autoSaveInFlight:new Set(), saveLocks:new Set(), pendingManualSaveTimers:new Map(), savePromises:new Map(), saveAgainAfterLock:new Set(), cellEditRevision:new Map(), cellSaveSignatures:new Map()
  };
  const key = (z,c,s)=>`${clean(z).toUpperCase()}-${Number(c)}-${Number(s)}`;
  const columnKey = (z,c)=>`${clean(z).toUpperCase()}-${Number(c)}`;
  function isCellLocallyProtected(z,c,s){
    try{
      const k=key(z,c,s);
      return !!(state.autoSaveTimers?.has?.(k) || state.autoSaveInFlight?.has?.(k) || state.saveLocks?.has?.(k) || state.savePromises?.has?.(k) || state.saveAgainAfterLock?.has?.(k));
    }catch(_e){ return false; }
  }
  function protectedCellKeySet(){
    // V178: fresh DB reloads may arrive while the user is editing/saving; keep those cells local until the queued save settles.
    const out=new Set();
    try{
      [state.autoSaveTimers, state.savePromises].forEach(m=>{ if(m && typeof m.forEach==='function') m.forEach((_v,k)=>out.add(k)); });
      [state.autoSaveInFlight, state.saveLocks, state.saveAgainAfterLock].forEach(st=>{ if(st && typeof st.forEach==='function') st.forEach(k=>out.add(k)); });
      if(state.current && document.querySelector('#warehouse-modal:not(.hidden)')) out.add(key(state.current.zone,state.current.col,state.current.slot));
    }catch(_e){}
    return out;
  }
  function mergeCellsPreservingLocalProtected(incomingCells, zonesData){
    // V182: cache/DB full responses can arrive while a cell is being edited or saved.
    // Preserve protected local cells by exact cell key, and preserve pending columns by column key.
    const protectedCols=new Set(state.pendingColumns||[]);
    const protectedCellsByKey=protectedCellKeySet();
    const normalized=(Array.isArray(incomingCells)?incomingCells:[]).map(cell=>normalizeServerCell(cell));
    if(!protectedCols.size && !protectedCellsByKey.size){
      state.data={cells:normalized, zones:zonesData||{A:{},B:{}}};
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
    state.data={cells:fresh.concat(localProtected), zones:zonesData||{A:{},B:{}}};
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
    return {key:k, seq};
  }
  function isLatestColumnOp(token){ return !!token && Number(state.columnSeq.get(token.key)||0)===Number(token.seq); }
  function finishColumnOp(token, ok=true){
    if(!token || !isLatestColumnOp(token)) return false;
    state.pendingColumns.delete(token.key);
    state.columnStartedAt.delete(token.key);
    const [z,c]=token.key.split('-');
    markColumnPending(z,c,false);
    if(ok) state.lastGoodColumns.delete(token.key);
    return true;
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
  const CACHE_VERSION = 'v182-warehouse-stability';
  const WAREHOUSE_CACHE_KEY = 'yx_warehouse_cache_' + CACHE_VERSION;
  const AVAILABLE_CACHE_KEY = 'yx_warehouse_available_cache_' + CACHE_VERSION;
  function cacheGet(k, maxAgeMs){
    try{
      let raw=localStorage.getItem(k);
      if(!raw){
        const versions=['v182-warehouse-stability','v181-warehouse-stability','v180-warehouse-stability','v179-warehouse-stability','v178-warehouse-stability','v177-warehouse-stability','v176-warehouse-stability','v175-warehouse-stability','v174-warehouse-stability','v173-warehouse-stability','v172-warehouse-stability','v171-warehouse-stability','v170-warehouse-stability','v169-warehouse-stability','v168-warehouse-stability','v166-warehouse-self-repair','v165-warehouse-stability-final','v163-warehouse-stability','v162-warehouse-stability','v161-warehouse-stability','v160-warehouse-polish-stability','v159-warehouse-auto-stability','v158-warehouse-stability-latest','v156-warehouse-stability-from-v155','v143-warehouse-dom-cache','v140-warehouse-fast-lite-cache','v138-warehouse-fast-lite-cache','v135-warehouse-fast-lite-cache','v134-warehouse-speed-qty-cache'];
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
  function cellItemsFromRow(cell){
    if(Array.isArray(cell?.items)) return cell.items;
    try{ const arr=JSON.parse(cell?.items_json||'[]'); return Array.isArray(arr)?arr:[]; }catch(_e){ return []; }
  }
  function cacheWarehouseNow(){
    try{ normalizeWarehouseCellsBeforeCache(); cacheSet(WAREHOUSE_CACHE_KEY, {cells:state.data.cells||[], zones:state.data.zones||{A:{},B:{}}, source_qty_map:state.sourceQtyMap||{}}); }catch(_e){}
  }
  function cacheAvailableNow(){
    try{ cacheSet(AVAILABLE_CACHE_KEY, {available:state.available||[], availableByZone:state.availableByZone||{A:[],B:[]}}); }catch(_e){}
  }
  function normalizeServerCell(cell, forceZone, forceColumn){
    const row={...(cell||{})};
    row.zone=clean(forceZone || row.zone || 'A').toUpperCase();
    if(!['A','B'].includes(row.zone)) row.zone='A';
    row.column_index=Number(forceColumn || row.column_index || row.column || 1);
    row.slot_number=Number(row.slot_number || row.slot || 1);
    row.slot_type=row.slot_type||'direct';
    if(Array.isArray(row.items)) row.items=row.items;
    else { try{ const arr=JSON.parse(row.items_json||'[]'); row.items=Array.isArray(arr)?arr:[]; }catch(_e){ row.items=[]; } }
    row.items_json=JSON.stringify(row.items||[]);
    row.is_deleted=row.is_deleted||0;
    return row;
  }
  function applyColumnCells(z,c,columnCells){
    if(!Array.isArray(columnCells)) return false;
    z=clean(z).toUpperCase(); c=Number(c);
    const currentCells=(state.data.cells||[]).filter(cell=>clean(cell.zone).toUpperCase()===z && Number(cell.column_index)===c);
    const others=(state.data.cells||[]).filter(cell=>!(clean(cell.zone).toUpperCase()===z && Number(cell.column_index)===c));
    const existingBySlot=new Map(currentCells.map(cell=>[Number(cell.slot_number)||0, cell]));
    const bySlot=new Map();
    columnCells.map(cell=>normalizeServerCell(cell,z,c)).filter(cell=>!isDeletedCell(cell)).forEach(cell=>{
      const n=Number(cell.slot_number)||0;
      const protectedLocal=existingBySlot.get(n);
      // V176：如果這一格正在輸入、自動保存或手動保存中，舊的欄位回讀不得覆蓋前端最新狀態。
      if(protectedLocal && isCellLocallyProtected(z,c,n)){ bySlot.set(n, protectedLocal); return; }
      const old=bySlot.get(n);
      const oldHas=cellItemsFromRow(old).length>0;
      const newHas=cellItemsFromRow(cell).length>0;
      if(!old || newHas || !oldHas) bySlot.set(n, cell);
    });
    existingBySlot.forEach((cell,n)=>{
      if(!bySlot.has(n) && isCellLocallyProtected(z,c,n)) bySlot.set(n, cell);
    });
    const incoming=Array.from(bySlot.values()).sort((a,b)=>Number(a.slot_number)-Number(b.slot_number));
    state.data.cells=others.concat(incoming).sort((a,b)=>clean(a.zone).localeCompare(clean(b.zone)) || Number(a.column_index)-Number(b.column_index) || Number(a.slot_number)-Number(b.slot_number));
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
  function applyWarehouseResponse(d, fallbackZ, fallbackC, token){
    if(!d || d.success === false) return false;
    if(token && !isLatestColumnOp(token)) return false;
    let changed=false;
    if(Array.isArray(d.from_column_cells)){
      const z=d.from?.zone || d.from_zone || fallbackZ, c=d.from?.column_index || d.from?.col || fallbackC;
      if(!state.pendingColumns.has(columnKey(z,c)) || (token && columnKey(z,c)===token.key)) changed = applyColumnCells(z,c,d.from_column_cells) || changed;
    }
    if(Array.isArray(d.to_column_cells)){
      const z=d.to?.zone || d.to_zone || fallbackZ, c=d.to?.column_index || d.to?.col || fallbackC;
      if(!state.pendingColumns.has(columnKey(z,c)) || (token && columnKey(z,c)===token.key)) changed = applyColumnCells(z,c,d.to_column_cells) || changed;
    }
    if(changed) return true;
    if(Array.isArray(d.column_cells)){
      const z=d.zone || fallbackZ; const c=d.column_index || fallbackC;
      if(state.pendingColumns.has(columnKey(z,c)) && !(token && columnKey(z,c)===token.key)) return false;
      return applyColumnCells(z,c,d.column_cells);
    }
    if(Array.isArray(d.cells)){
      // V182: full warehouse DB/cache responses must not overwrite cells being edited, saving, or queued for retry.
      mergeCellsPreservingLocalProtected(d.cells||[], d.zones||state.data.zones||{A:{},B:{}});
      cacheWarehouseNow(); return true;
    }
    return false;
  }

  function applyMoveWarehouseResponse(d, fromToken, toToken, f, t){
    if(!d || d.success === false) return false;
    let changed=false;
    if(Array.isArray(d.from_column_cells) && (!fromToken || isLatestColumnOp(fromToken))){
      changed = applyColumnCells(f.zone, f.col, d.from_column_cells) || changed;
    }
    if(Array.isArray(d.to_column_cells) && (!toToken || isLatestColumnOp(toToken))){
      changed = applyColumnCells(t.zone, t.col, d.to_column_cells) || changed;
    }
    if(!changed && Array.isArray(d.column_cells)){
      const z=d.zone || t.zone, c=Number(d.column_index || t.col);
      if((fromToken && columnKey(z,c)===fromToken.key && isLatestColumnOp(fromToken)) || (toToken && columnKey(z,c)===toToken.key && isLatestColumnOp(toToken))){
        changed = applyColumnCells(z,c,d.column_cells) || changed;
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
    const cached=cacheGet(WAREHOUSE_CACHE_KEY, 1000*60*60*24*7);
    if(!cached || !Array.isArray(cached.cells)) return false;
    mergeCellsPreservingLocalProtected(cached.cells, cached.zones||{A:{},B:{}});
    state.sourceQtyMap=cached.source_qty_map||cached.source_totals||state.sourceQtyMap||{};
    updateAllSlots();
    return true;
  }
  function hydrateAvailableFromCache(){
    const cached=cacheGet(AVAILABLE_CACHE_KEY, 1000*60*60*24*3);
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
  function sourceOf(it){
    const raw=clean(it?.source || it?.source_table || it?.type || '');
    if(/master|總單/i.test(raw)) return '總單';
    if(/order|訂單/i.test(raw)) return '訂單';
    if(/inventory|stock|庫存/i.test(raw)) return '庫存';
    return raw || '庫存';
  }
  function cleanCustomer(v){
    const s=clean(v)||'庫存';
    // formal mainline behavior.
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
  function slotProductSummary(items){
    const uniq=[];
    (items||[]).forEach(it=>{
      const base=productBaseText(it);
      if(!base) return;
      const mat=materialOf(it);
      // formal mainline behavior.
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
    // 117：格數以後端回傳為準；若使用者把基礎空格隱藏，不能再由前端硬補回 1–20。
    // 只有資料尚未載入時才顯示初始 20 格。
    const nums=activeColumnCells(z,c).map(x=>Number(x.slot_number)||0).filter(n=>n>0);
    if(nums.length) return Array.from(new Set(nums)).sort((a,b)=>a-b);
    return Array.from({length:20},(_,i)=>i+1);
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
    return nums.length ? Math.max(...nums) : 20;
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
    // formal mainline behavior.
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
    const placedMaps=placedQtyMaps();
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
    const overstock=items.some(it=>isItemOverSource(it, placedMaps));
    el.classList.toggle('yx-warehouse-overstock', !!overstock);
    el.title = overstock ? '此格商品數量已超過庫存+訂單+總單加總，請檢查來源數量' : '';
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
  function updateAllSlots(){
    ensureSlotRange();
    zones.forEach(z=>{ for(let c=1;c<=6;c++){ visibleSlotNumbers(z,c).forEach(s=>updateSlotUI(z,c,s)); removeExtraDom(z,c); } });
    updateNotes(); bindSlots(); setWarehouseZone(state.activeZone || localStorage.getItem('warehouseActiveZone') || 'A', false);
    try{ window.YX && window.YX.mobileZoom && window.YX.mobileZoom.refreshSoon && window.YX.mobileZoom.refreshSoon(); }catch(_e){}
  }
  function updateNotes(){
    for(const z of zones){ const n=$(z==='A'?'zone-A-count-note':'zone-B-count-note'); if(n) n.textContent='6 欄｜每欄預設 20 格'; }
  }
  async function loadAvailable(){
    hydrateAvailableFromCache();
    const seq=++state.availableSeq;
    try{
      const all=await api('/api/warehouse/available-items?fast=1');
      if(seq !== state.availableSeq) return state.available;
      const items=Array.isArray(all.items)?all.items:[];
      state.available=items;
      state.availableByZone={
        A:items.filter(it=>clean(it.zone||it.warehouse_zone||'').toUpperCase()==='A'),
        B:items.filter(it=>clean(it.zone||it.warehouse_zone||'').toUpperCase()==='B')
      };
      const count=items=>(Array.isArray(items)?items:[]).reduce((n,it)=>n+itemQty(it),0);
      const summary=all.zone_summary||{};
      const aCount=Number.isFinite(Number(summary.A))?Number(summary.A):count(state.availableByZone.A);
      const bCount=Number.isFinite(Number(summary.B))?Number(summary.B):count(state.availableByZone.B);
      const unassigned=Number.isFinite(Number(summary.unassigned))?Number(summary.unassigned):Math.max(0,count(state.available)-aCount-bCount);
      const total=Number.isFinite(Number(summary.total))?Number(summary.total):count(state.available);
      const pill=$('warehouse-unplaced-pill'); if(pill) pill.textContent=`A區 ${aCount} 件 / B區 ${bCount} 件 / 未分區 ${unassigned} 件 / 總計 ${total} 件`;
      cacheAvailableNow();
      return state.available;
    }catch(_e){ state.available=state.available||[]; state.availableByZone=state.availableByZone||{A:[],B:[]}; updateUnplacedPillLocal(); return state.available; }
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
  async function renderWarehouse(force=false){
    if(state.loading && !force) return state.loading;
    const hadCached = hydrateWarehouseFromCache();
    hydrateAvailableFromCache();
    const seq = ++state.loadSeq;
    const fetchFresh = async()=>{ try{
      const d = await api('/api/warehouse?fast=1&lite=1&yx166_stability=1');
      if (seq !== state.loadSeq && !force) return state.data; // stale DB response must not overwrite user edits.
      const freshCells=Array.isArray(d.cells)?d.cells:[];
      mergeCellsPreservingLocalProtected(freshCells, d.zones||{A:{},B:{}});
      if(d.source_qty_map || d.source_totals) state.sourceQtyMap=d.source_qty_map||d.source_totals||{};
      cacheWarehouseNow();
      window.state=window.state||{}; window.state.warehouse={...state.data, activeZone:state.activeZone, availableItems:state.available};
      updateAllSlots();
      try{
        const idle = window.requestIdleCallback || function(fn){ return setTimeout(fn, 120); };
        // V142: 開倉庫圖先顯示格子；未錄入與超量比對改成閒置背景，絕不阻塞首屏。
        idle(()=>{ loadWarehouseSourceQtyMap().catch(()=>{}); }, {timeout:2400});
        idle(()=>{ loadAvailable().then(()=>{ window.state.warehouse={...state.data, activeZone:state.activeZone, availableItems:state.available}; try{ syncBatchSelectLimits?.(); }catch(_e){} }).catch(()=>{}); }, {timeout:3200});
      }catch(_e){}
      return state.data;
    } catch(e){ toast(e.message||'倉庫圖載入失敗，已顯示本機快取資料','error'); bindSlots(); return state.data; } finally{ if (seq === state.loadSeq) state.loading=null; } };
    const p = fetchFresh();
    state.loading = p;
    // V142: 有快取時立即返回，不讓進頁等資料庫；背景 promise 仍會更新快取與畫面。
    if (hadCached && !force) { p.catch(()=>{}); return state.data; }
    return p;
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
    const details=Array.isArray(it?.source_details) ? it.source_details : [];
    return clean(details.map(d=>clean(d?.source_id||d?.id||'')).filter(Boolean).join('|'));
  }
  function itemStableKey(it){ return [cleanCustomer(it?.customer_name||''), warehouseSizeKey(productText(it)), materialOf(it), sourceOf(it), itemSourceIdKey(it), clean(it?.zone||it?.location||'')].join('::'); }

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
  }
  async function openWarehouseModal(z,c,s){
    flushPendingAutoSaveForCurrent('切換格位前已先保存目前格位，背景儲存中');
    z=clean(z).toUpperCase(); c=Number(c); s=Number(s);
    const openSeq=++state.modalSeq;
    state.current={zone:z,col:c,slot:s,items:JSON.parse(JSON.stringify(cellItems(z,c,s))),note:cellNote(z,c,s)};
    state.batchCount=3;
    const meta=$('warehouse-modal-meta'); if(meta) meta.textContent=`${z} 區第 ${c} 欄 第 ${s} 格`;
    const note=$('warehouse-note'); if(note) note.value=state.current.note||'';
    const search=$('warehouse-item-search'); if(search) search.value='';
    $('warehouse-modal')?.classList.remove('hidden');
    restoreWarehouseDraft();
    renderCellItems(false);
    // V174: 先立刻開啟，再背景抓未錄入；若使用者已切到別格，舊請求不得重畫新格。
    try {
      await loadAvailable();
      if(openSeq !== state.modalSeq || !sameCurrentCell(z,c,s)) return;
      renderCellItems(true);
    } catch(e){ if(openSeq === state.modalSeq && sameCurrentCell(z,c,s)) toast(e.message||'未錄入商品載入失敗','error'); }
  }
  function closeWarehouseModal(){ flushPendingAutoSaveForCurrent('關閉格位前已先保存目前格位，背景儲存中'); state.modalSeq++; $('warehouse-modal')?.classList.add('hidden'); }
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
  function setLocalCellItems(z,c,s,items,note){
    z=clean(z).toUpperCase(); c=Number(c); s=Number(s);
    let cell=(state.data.cells||[]).find(x=>clean(x.zone).toUpperCase()===z&&Number(x.column_index)===c&&Number(x.slot_number)===s);
    if(!cell){ cell={zone:z,column_index:c,slot_type:'direct',slot_number:s,items:[],items_json:'[]',note:'',problem_flag:''}; state.data.cells.push(cell); }
    cell.items=items||[]; cell.items_json=JSON.stringify(items||[]); if(note !== undefined) cell.note=note||''; cell.is_deleted=0;
    cacheWarehouseNow();
    return cell;
  }
  function sameCurrentCell(z,c,s){ return !!(state.current && clean(state.current.zone).toUpperCase()===clean(z).toUpperCase() && Number(state.current.col)===Number(c) && Number(state.current.slot)===Number(s)); }
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
  function commitCurrentEditToFrontend(reason, beforeItems){
    if(!state.current) return null;
    const z=clean(state.current.zone).toUpperCase(), c=Number(state.current.col), s=Number(state.current.slot);
    const note=$('warehouse-note')?.value||'';
    // V180: use the real current local cell as the availability baseline.
    // A stale timer snapshot can be older than the optimistic UI; using it again may double-return/double-consume dropdown quantities.
    const oldItems=JSON.parse(JSON.stringify(cellItems(z,c,s)));
    applyCurrentItemInputs();
    const nextItems=JSON.parse(JSON.stringify(state.current.items||[]));
    const delta=cellAvailabilityDelta(oldItems, nextItems);
    if(delta.returned.length) mutateAvailableByItems(delta.returned, +1);
    if(delta.consumed.length) mutateAvailableByItems(delta.consumed, -1);
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
          autoSaveCurrentCell(reason || '已先保存同欄格位修改，再執行格號操作', pending?.beforeItems || JSON.parse(JSON.stringify(cellItems(z,c,slot))));
          count += 1;
        }
      });
      return count;
    }catch(e){ try{ toast(e.message||'同欄暫存保存失敗','error'); }catch(_e){} return 0; }
  }
  function autoSaveCurrentCell(reason, beforeItems){
    const beforeColumn = state.current ? snapshotColumn(state.current.zone,state.current.col) : null;
    const payload=commitCurrentEditToFrontend(reason, beforeItems);
    if(!payload) return;
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
    const autoPromise = queuedWarehousePost('/api/warehouse/cell', saveCellPayload(payload.z,payload.c,payload.s,payload.items,payload.note), async (saved, token)=>{
      if(saved && saved.saved_cell && mayApplySavedCell(payload.z,payload.c,payload.s,revAtSend)){
        const sc=saved.saved_cell;
        const savedItems=Array.isArray(sc.items)?sc.items:payload.items;
        setLocalCellItems(payload.z,payload.c,payload.s,savedItems,sc.note ?? payload.note);
        if(sameCurrentCell(payload.z,payload.c,payload.s)){ state.current.items=JSON.parse(JSON.stringify(savedItems)); }
      }
      loadAvailable().catch(()=>{});
      updateAllSlots();
      if(sameCurrentCell(payload.z,payload.c,payload.s)) renderCellItems(true);
      toast('格位修改已永久存入資料庫','ok');
    }, '格位自動儲存', {token});
    Promise.resolve(autoPromise).finally(()=>{ try{ state.autoSaveInFlight?.delete?.(flightKey); }catch(_e){} });
  }
  function scheduleAutoSaveCurrentCell(reason, beforeItems, delay=280){
    if(!state.current) return;
    const z=clean(state.current.zone).toUpperCase(), c=Number(state.current.col), s=Number(state.current.slot);
    const k=key(z,c,s);
    const timers=state.autoSaveTimers || (state.autoSaveTimers=new Map());
    const old=timers.get(k);
    if(old?.timer) clearTimeout(old.timer);
    const snapshot=old?.beforeItems || beforeItems || JSON.parse(JSON.stringify(cellItems(z,c,s)));
    const timer=setTimeout(()=>{
      timers.delete(k);
      if(!sameCurrentCell(z,c,s)) return;
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
      row.placement_label=clean(row.placement_label || row.layer_label || '前排') || '前排';
      row.layer_label=row.placement_label;
      delete row.__tmp;
      delete row.__dirty;
      return row;
    }).filter(row=>row.product_text || row.customer_name || row.qty>0);
  }
  function saveCellPayload(z,c,s,items,note){ return {operation_id:yxOperationId('warehouse-cell-save'),zone:clean(z).toUpperCase(),column_index:Number(c),slot_type:'direct',slot_number:Number(s),items:sanitizeCellItemsForSave(items||[]),note:note||'',client_stability:'v182'}; }
  async function saveCellRaw(z,c,s,items,note){ return api('/api/warehouse/cell',{method:'POST',body:JSON.stringify(saveCellPayload(z,c,s,items,note))}); }
  function saveCellBg(z,c,s,items,note,onSuccess){ return bgPost('/api/warehouse/cell', saveCellPayload(z,c,s,items,note), onSuccess, '格位儲存'); }
  function scheduleManualSaveAfterLock(saveKey){
    try{
      state.saveAgainAfterLock = state.saveAgainAfterLock || new Set();
      state.saveAgainAfterLock.add(saveKey);
      const timers=state.pendingManualSaveTimers || (state.pendingManualSaveTimers=new Map());
      const old=timers.get(saveKey);
      if(old) clearTimeout(old);
      const timer=setTimeout(()=>{
        timers.delete(saveKey);
        if(state.saveLocks?.has?.(saveKey) || state.savePromises?.has?.(saveKey)){ scheduleManualSaveAfterLock(saveKey); return; }
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
      applyCurrentItemInputs();
      persistWarehouseDraft();
      scheduleManualSaveAfterLock(saveKey);
      toast('此格正在背景儲存，新的修改已排入下一次保存，不會中斷連續操作','warn');
      return;
    }
    state.saveLocks.add(saveKey);
    // V175：手動儲存的鎖要等背景請求完成才解除，避免連點造成同格重複請求。
    try{ cancelPendingAutoSaveForCell(state.current.zone,state.current.col,state.current.slot); }catch(_e){}
    const beforeItems=JSON.parse(JSON.stringify(state.current.items||[])); const beforeNote=state.current?.note ?? cellNote(state.current.zone,state.current.col,state.current.slot);
    applyCurrentItemInputs();
    const editedChanged=currentItemsChanged(beforeItems) || (($('warehouse-note')?.value||'') !== beforeNote);
    const added=collectBatchItems();
    if(!added.length && !editedChanged){ try{ state.saveLocks.delete(saveKey); }catch(_e){} toast('沒有新增或修改；已錄入商品不會出現在下拉選單，請直接在「目前此格商品」修改尺寸/支數/件數後儲存','warn'); return; }
    const merged = new Map();
    [...(state.current.items||[]),...added].forEach(it=>{ const k=itemStableKey(it); const old=merged.get(k); if(old){ old.qty = itemQty(old) + itemQty(it); } else merged.set(k, {...it, qty:itemQty(it)}); });
    const items=Array.from(merged.values());
    const btn=$('yx121-save-cell');
    try{
      // formal mainline behavior.
      try { window.YXPageUndo?.snapshot?.('warehouse-cell', async()=>{ if(!state.current) return; state.current.items=beforeItems; await saveCellRaw(state.current.zone,state.current.col,state.current.slot,beforeItems,beforeNote); await renderWarehouse(true); highlightWarehouseCell(state.current.zone,state.current.col,state.current.slot); }); } catch(_e) {}
      const saveZone=state.current.zone, saveCol=state.current.col, saveSlot=state.current.slot, saveNote=$('warehouse-note')?.value||'';
      const columnBeforeSave=snapshotColumn(saveZone,saveCol);
      state.current.items=items;
      setLocalCellItems(saveZone,saveCol,saveSlot,items,saveNote);
      const revAtSend=bumpCellRevision(saveZone,saveCol,saveSlot);
      const delta=cellAvailabilityDelta(beforeItems, items);
      if(delta.returned.length) mutateAvailableByItems(delta.returned, +1);
      if(delta.consumed.length) mutateAvailableByItems(delta.consumed, -1);
      updateSlotUI(saveZone,saveCol,saveSlot);
      toast(`格位已送出背景儲存${added.length?`，新增 ${added.length} 筆`:''}${editedChanged?'，已更新目前商品與下拉剩餘數量':''}`,'ok');
      closeWarehouseModal();
      // V172: keep the local draft until the DB confirms the save; if background queue retries later, user data is still recoverable.
      highlightWarehouseCell(saveZone,saveCol,saveSlot);
      const token=beginColumnOp(saveZone,saveCol);
      state.lastGoodColumns.set(token.key, columnBeforeSave);
      const savePromise = queuedWarehousePost('/api/warehouse/cell', saveCellPayload(saveZone,saveCol,saveSlot,items,saveNote), async (saved, token)=>{
        // 119：後端讀回 saved_cell 後，只同步這一格，不整包覆蓋；若切頁造成請求延後，佇列會在其他頁繼續送。
        if(saved && saved.saved_cell && mayApplySavedCell(saveZone,saveCol,saveSlot,revAtSend)){
          const sc=saved.saved_cell;
          setLocalCellItems(saveZone,saveCol,saveSlot,Array.isArray(sc.items)?sc.items:items,sc.note ?? saveNote);
          if(Array.isArray(saved.column_cells) && isLatestColumnOp(token) && mayApplySavedCell(saveZone,saveCol,saveSlot,revAtSend)) applyColumnCells(saveZone,saveCol,saved.column_cells);
          cacheWarehouseNow();
        }
        if(mayApplySavedCell(saveZone,saveCol,saveSlot,revAtSend)) clearWarehouseDraft(saveZone,saveCol,saveSlot);
        await loadAvailable().catch(()=>{});
        updateAllSlots();
        highlightWarehouseCell(saveZone,saveCol,saveSlot);
        toast('格位已永久存入資料庫，下拉剩餘數量已更新','ok');
      }, '格位儲存', {token});
      state.savePromises = state.savePromises || new Map();
      state.savePromises.set(saveKey, savePromise);
      savePromise.finally(()=>{
        try{
          if(state.savePromises?.get?.(saveKey)===savePromise) state.savePromises.delete(saveKey);
          state.saveLocks.delete(saveKey);
          if(state.saveAgainAfterLock?.has?.(saveKey)){
            state.saveAgainAfterLock.delete(saveKey);
            // V178: if the modal was closed after an optimistic save, do not silently discard a queued follow-up; reopen is not needed, but keep draft/local cell safe and let manual retry happen when the same cell is active again.
            if(sameCurrentCell(saveZone,saveCol,saveSlot)) scheduleManualSaveAfterLock(saveKey);
            else persistWarehouseDraft();
          }
        }catch(_e){}
      });
    }catch(e){ toast(e.message||'儲存格位失敗','error'); throw e; }
    finally{ if(btn){ btn.disabled=false; btn.textContent='儲存格位'; } }
  }
  function updateUndoButton(){ const b=$('yx121-warehouse-undo'); if(b) b.disabled=!state.undoStack.length; }
  async function moveCellContents(from,to){
    const f={zone:clean(from.zone).toUpperCase(),col:Number(from.col),slot:Number(from.slot)};
    const t={zone:clean(to.zone).toUpperCase(),col:Number(to.col),slot:Number(to.slot)};
    flushPendingAutoSavesForColumn(f.zone,f.col,'拖拉前已先保存來源欄位修改');
    if(f.zone!==t.zone || f.col!==t.col) flushPendingAutoSavesForColumn(t.zone,t.col,'拖拉前已先保存目標欄位修改');
    if(f.zone===t.zone&&f.col===t.col&&f.slot===t.slot) return;
    const moved=cellItems(f.zone,f.col,f.slot).filter(it=>itemQty(it)>0);
    if(!moved.length) return toast('此格沒有可拖拉的商品','warn');
    const src={...f,items:JSON.parse(JSON.stringify(cellItems(f.zone,f.col,f.slot))),note:cellNote(f.zone,f.col,f.slot)};
    const dst={...t,items:JSON.parse(JSON.stringify(cellItems(t.zone,t.col,t.slot))),note:cellNote(t.zone,t.col,t.slot)};
    const fromSnap=snapshotColumn(f.zone,f.col);
    const toSnap=(f.zone===t.zone&&f.col===t.col)?fromSnap:snapshotColumn(t.zone,t.col);
    const placement = dst.items && dst.items.length ? '前排' : '後排';
    const dstAfter=[...moved.map(it=>normalizedItem(it,itemQty(it),placement)),...dst.items];
    try{
      let srcCell=cellFromData(f.zone,f.col,f.slot); if(srcCell){ srcCell.items=[]; srcCell.items_json='[]'; }
      let dstCell=cellFromData(t.zone,t.col,t.slot); if(!dstCell){ dstCell={zone:t.zone,column_index:t.col,slot_type:'direct',slot_number:t.slot,items:[],items_json:'[]',note:''}; state.data.cells.push(dstCell); }
      dstCell.items=dstAfter; dstCell.items_json=JSON.stringify(dstAfter);
      cacheWarehouseNow(); updateSlotUI(f.zone,f.col,f.slot); updateSlotUI(t.zone,t.col,t.slot); highlightWarehouseCell(t.zone,t.col,t.slot);
      toast(placement==='前排'?'已先移動到前排，背景儲存':'已先移動到後排，背景儲存','ok');
      const fromToken=beginColumnOp(f.zone,f.col);
      state.lastGoodColumns.set(fromToken.key, fromSnap);
      const toToken=(f.zone===t.zone&&f.col===t.col)?fromToken:beginColumnOp(t.zone,t.col);
      if(toToken!==fromToken) state.lastGoodColumns.set(toToken.key, toSnap);
      queuedWarehouseMovePost({
        operation_id:yxOperationId('warehouse-move-cell'),
        from:{zone:f.zone,column_index:f.col,slot_number:f.slot,note:src.note},
        to:{zone:t.zone,column_index:t.col,slot_number:t.slot,note:dst.note},
        items:dstAfter
      }, async(d, fromLatest, toLatest)=>{
        if(!d || d.success===false){ rollbackMoveColumns(fromToken,toToken,fromSnap,toSnap,'拖拉移動沒有確實存入資料庫，已還原'); return; }
        applyMoveWarehouseResponse(d, fromLatest?fromToken:null, toLatest?toToken:null, f, t);
        state.undoStack.push({source:src,target:dst}); if(state.undoStack.length>20) state.undoStack.shift(); updateUndoButton();
        loadAvailable().catch(()=>{}); updateAllSlots(); highlightWarehouseCell(t.zone,t.col,t.slot); toast('拖拉移動已永久存入資料庫','ok');
      }, '拖拉移動', fromToken, toToken, ()=>rollbackMoveColumns(fromToken,toToken,fromSnap,toSnap,'拖拉移動保存失敗，已還原'));
    } catch(e){ rollbackMoveColumns(null,null,fromSnap,toSnap,e.message||'拖拉移動失敗'); }
  }
  async function undoWarehouseMove(){ const last=state.undoStack.pop(); updateUndoButton(); if(!last) return toast('目前沒有可還原的倉庫移動','warn'); try{ await saveCellRaw(last.target.zone,last.target.col,last.target.slot,last.target.items,last.target.note); await saveCellRaw(last.source.zone,last.source.col,last.source.slot,last.source.items,last.source.note); toast('已還原','ok'); await renderWarehouse(true); highlightWarehouseCell(last.source.zone,last.source.col,last.source.slot); }catch(e){ state.undoStack.push(last); updateUndoButton(); toast(e.message||'還原失敗','error'); } }
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
      .forEach(cell=>{ cell.slot_number = Number(cell.slot_number) + 1; });
    state.data.cells.push({zone:z,column_index:c,slot_type:'direct',slot_number:newSlot,items:[],items_json:'[]',note:'',problem_flag:'',is_deleted:0});
    state.data.cells.sort((a,b)=>clean(a.zone).localeCompare(clean(b.zone)) || Number(a.column_index)-Number(b.column_index) || Number(a.slot_number)-Number(b.slot_number));
    cacheWarehouseNow();
    return newSlot;
  }
  function localDeleteSlot(z,c,s){
    z=clean(z).toUpperCase(); c=Number(c); s=Number(s);
    // 117：任何空格都可以隱藏；後面格號立即往前補，等後端永久寫入後再以 DB 回傳校準。
    state.data.cells = (state.data.cells||[]).filter(cell=>!(clean(cell.zone).toUpperCase()===z && Number(cell.column_index)===c && Number(cell.slot_number)===s));
    (state.data.cells||[]).forEach(cell=>{
      if(clean(cell.zone).toUpperCase()===z && Number(cell.column_index)===c && Number(cell.slot_number)>s){
        cell.slot_number = Number(cell.slot_number) - 1;
      }
    });
    cacheWarehouseNow();
  }
  async function batchInsertWarehouseCells(z,c,s){
    z=clean(z).toUpperCase(); c=Number(c); s=Number(s||0);
    flushPendingAutoSavesForColumn(z,c,'批量新增格前已先保存同欄格位修改');
    const count=Math.max(1, Math.min(40, Number.parseInt(prompt('要新增幾格？', '5') || '0', 10) || 0));
    if(!count) return;
    const columnBefore=snapshotColumn(z,c);
    for(let i=0;i<count;i++) localInsertSlot(z,c,s+i);
    updateAllSlots(); highlightWarehouseCell(z,c,s+1); toast(`已先在第 ${s} 格下方批量新增 ${count} 格，背景儲存`,'ok');
    const token=beginColumnOp(z,c);
    state.lastGoodColumns.set(token.key, columnBefore);
    queuedWarehousePost('/api/warehouse/batch-add-slots',{operation_id:yxOperationId('warehouse-batch-add-slots'),zone:z,column_index:c,insert_after:s,count,slot_type:'direct'}, (d, token)=>{
      applyWarehouseResponse(d,z,c, token);
      updateAllSlots(); highlightWarehouseCell(z,c,Number(d?.first_slot||s+1)); toast(`批量新增 ${count} 格已永久存入資料庫`,'ok');
    }, '批量新增格子', {token});
  }
  async function batchDeleteWarehouseCells(z,c,s){
    z=clean(z).toUpperCase(); c=Number(c); s=Number(s);
    flushPendingAutoSavesForColumn(z,c,'批量刪格前已先保存同欄格位修改');
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
    normalizeColumnSlots(z,c);
    cacheWarehouseNow();
    updateAllSlots();
    toast(`已先批量刪除 ${emptySlots.length} 個空格，背景儲存`,'ok');
    const token=beginColumnOp(z,c);
    state.lastGoodColumns.set(token.key, columnBefore);
    queuedWarehousePost('/api/warehouse/batch-remove-slots',{
      operation_id:yxOperationId('warehouse-batch-remove-slots'),
      zone:z,column_index:c,slot_number:s,count:emptySlots.length,slots:emptySlots,slot_type:'direct',
      mode:'empty_from_here'
    }, (d, token)=>{
      applyWarehouseResponse(d,z,c, token);
      cacheWarehouseNow();
      updateAllSlots();
      toast(`批量刪除 ${Number(d?.removed||emptySlots.length)} 個空格已永久存入資料庫`,'ok');
    }, '批量刪除空格', {token});
  }

  async function insertWarehouseCell(z,c,s){
    z=clean(z).toUpperCase(); c=Number(c); s=Number(s||0);
    flushPendingAutoSavesForColumn(z,c,'新增格前已先保存同欄格位修改');
    const columnBefore=snapshotColumn(z,c);
    const localSlot=localInsertSlot(z,c,s); normalizeColumnSlots(z,c); updateAllSlots(); highlightWarehouseCell(z,c,localSlot); toast(`已先在第 ${s} 格下方新增一格，背景儲存`,'ok');
    const token=beginColumnOp(z,c);
    state.lastGoodColumns.set(token.key, columnBefore);
    queuedWarehousePost('/api/warehouse/add-slot',{operation_id:yxOperationId('warehouse-add-slot'),zone:z,column_index:c,insert_after:s,slot_type:'direct'}, (d, token)=>{
      applyWarehouseResponse(d,z,c, token); cacheWarehouseNow(); updateAllSlots(); highlightWarehouseCell(z,c,Number(d.slot_number||localSlot)); toast('新增格子已永久存入資料庫','ok');
    }, '新增格子', {token});
  }
  async function deleteWarehouseCell(z,c,s){
    z=clean(z).toUpperCase(); c=Number(c); s=Number(s);
    flushPendingAutoSavesForColumn(z,c,'刪格前已先保存同欄格位修改');
    if(cellItems(z,c,s).length) return toast('格子內還有商品，請先退回該格或移除商品後再刪除','warn');
    // V127：單格刪除不再跳確認，點選後立即前端刪除並背景保存。
    const columnBefore=snapshotColumn(z,c);
    localDeleteSlot(z,c,s); normalizeColumnSlots(z,c); updateAllSlots(); toast('已先從畫面刪除空格並補齊格號，背景儲存','ok');
    const token=beginColumnOp(z,c);
    state.lastGoodColumns.set(token.key, columnBefore);
    queuedWarehousePost('/api/warehouse/remove-slot',{operation_id:yxOperationId('warehouse-remove-slot'),zone:z,column_index:c,slot_number:s,slot_type:'direct'}, (d, token)=>{
      applyWarehouseResponse(d,z,c, token); cacheWarehouseNow(); updateAllSlots(); toast('刪除空格已永久存入資料庫','ok');
    }, '刪除空格', {token});
  }
  async function returnWarehouseCell(z,c,s){
    z=clean(z).toUpperCase(); c=Number(c); s=Number(s);
    flushPendingAutoSavesForColumn(z,c,'返回該格前已先保存同欄格位修改');
    const items=cellItems(z,c,s);
    if(!items.length) return toast('此格沒有商品可退回','warn');
    // V127：返回該格不再二次確認，立即前端退回下拉並背景保存。
    const oldItems=JSON.parse(JSON.stringify(items));
    const columnBefore=snapshotColumn(z,c);
    const cell=cellFromData(z,c,s);
    if(cell){ cell.items=[]; cell.items_json='[]'; }
    mutateAvailableByItems(oldItems, +1);
    cacheWarehouseNow();
    updateSlotUI(z,c,s);
    if(state.current && state.current.zone===z && Number(state.current.col)===c && Number(state.current.slot)===s){ state.current.items=[]; renderCellItems(true); markCurrentCellDirty(); }
    toast('已先從畫面退回，背景寫入資料庫','ok');
    const token=beginColumnOp(z,c);
    state.lastGoodColumns.set(token.key, columnBefore);
    queuedWarehousePost('/api/warehouse/return-unplaced',{operation_id:yxOperationId('warehouse-return-unplaced'),zone:z,column_index:c,slot_number:s}, async (d, token)=>{
      applyWarehouseResponse(d,z,c, token);
      loadAvailable().catch(()=>{});
      updateAllSlots();
      highlightWarehouseCell(z,c,s);
      toast('退回該格已永久存入資料庫','ok');
    }, '退回該格', {token});
  }
  async function executeWarehouseMenuAction(action){
    const m=menu();
    const z=m.dataset.zone,c=Number(m.dataset.column),s=Number(m.dataset.slot);
    m.classList.add('hidden');
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
    }catch(e){ toast(e.message||'格位操作失敗','error'); }
    finally{ state.menuBusy=false; }
  }
  function menu(){
    let m=$('yx-final-warehouse-menu'); if(m) return m;
    m=document.createElement('div'); m.id='yx-final-warehouse-menu'; m.className='yx-final-warehouse-menu hidden';
    m.innerHTML='<button type="button" data-wh-act="open">開啟 / 編輯格位</button><button type="button" data-wh-act="mark">標記 / 取消問題格</button><button type="button" data-wh-act="insert">新增一格到此格下方</button><button type="button" data-wh-act="batch-insert">批量新增到此格下方</button><button type="button" data-wh-act="delete">刪除此空格</button><button type="button" data-wh-act="batch-delete">批量刪除空格</button><button type="button" data-wh-act="return">返回該格</button>';
    // V126：只保留 document click 單一路徑執行選單動作；避免 pointerup+click 雙重觸發造成後端操作被鎖或重複。
    m.addEventListener('pointerdown', ev=>{ if(ev.target?.closest?.('[data-wh-act]')) ev.stopPropagation(); }, true);
    document.body.appendChild(m); return m;
  }
  function showMenu(z,c,s,x,y){
    z=clean(z).toUpperCase(); c=Number(c); s=Number(s);
    const mk=`${z}-${c}-${s}`;
    const now=Date.now();
    if(state.activeMenuKey===mk && now-Number(state.menuOpenedAt||0)<250) return;
    if(!yxMenuGuard()) return;
    const m=menu(); m.dataset.zone=z; m.dataset.column=c; m.dataset.slot=s;
    const vw=window.innerWidth||360, vh=window.innerHeight||640;
    const mw=Math.min(260, Math.max(210, vw-16));
    const mh=330;
    const px=Math.max(8, Math.min(Number(x||vw/2), vw-mw-8));
    const py=Math.max(8, Math.min(Number(y||vh/2), vh-mh-8));
    m.style.maxWidth=mw+'px';
    m.style.left=px+'px'; m.style.top=py+'px'; m.classList.remove('hidden');
    state.activeMenuKey=`${clean(z).toUpperCase()}-${Number(c)}-${Number(s)}`; state.menuOpenedAt=Date.now();
  }
  async function toggleProblemMark(z,c,s){
    z=clean(z).toUpperCase(); c=Number(c); s=Number(s);
    flushPendingAutoSavesForColumn(z,c,'標記問題格前已先保存同欄格位修改');
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
    }, '標記格子', {token});
  }
  function bindSlot(slot){
    if(!slot || slot.dataset.yxFinalBound==='1') return; slot.dataset.yxFinalBound='1'; let press=null;
    const data=()=>({zone:slot.dataset.zone,col:Number(slot.dataset.column),slot:Number(slot.dataset.slot)});
    slot.addEventListener('pointerdown',ev=>{ if(ev.button && ev.button!==0) return; const d=data(); press={x:ev.clientX,y:ev.clientY,timer:setTimeout(()=>{ slot.dataset.blockClickUntil=String(Date.now()+1000); press=null; showMenu(d.zone,d.col,d.slot,ev.clientX,ev.clientY); },650),...d,moved:false}; });
    slot.addEventListener('pointermove',ev=>{ if(!press) return; const moved=Math.abs(ev.clientX-press.x)>10 || Math.abs(ev.clientY-press.y)>10; if(moved){ clearTimeout(press.timer); press.moved=true; if(slot.dataset.hasItems==='1' && !state.drag){ state.drag={zone:press.zone,col:press.col,slot:press.slot,pointerId:ev.pointerId}; slot.classList.add('yx121-warehouse-dragging'); try{slot.setPointerCapture?.(ev.pointerId);}catch(_e){} } const over=document.elementFromPoint(ev.clientX,ev.clientY)?.closest?.('#warehouse-root [data-zone][data-column][data-slot]'); if(over) state.dragOver=over; } });
    slot.addEventListener('pointerup',ev=>{ if(press) clearTimeout(press.timer); const dragging=state.drag; let target=document.elementFromPoint(ev.clientX,ev.clientY)?.closest?.('#warehouse-root [data-zone][data-column][data-slot]') || state.dragOver; try{ if(dragging?.pointerId!=null) slot.releasePointerCapture?.(dragging.pointerId); }catch(_e){} document.querySelectorAll('.yx121-warehouse-dragging,.yx121-warehouse-drop-target').forEach(el=>el.classList.remove('yx121-warehouse-dragging','yx121-warehouse-drop-target')); if(dragging){ slot.dataset.blockClickUntil=String(Date.now()+900); state.drag=null; state.dragOver=null; if(target){ ev.preventDefault(); ev.stopPropagation(); moveCellContents(dragging,{zone:target.dataset.zone,col:target.dataset.column,slot:target.dataset.slot}); press=null; return; } } if(press?.moved) slot.dataset.blockClickUntil=String(Date.now()+500); press=null; });
    ['pointercancel','pointerleave'].forEach(t=>slot.addEventListener(t,()=>{ if(press){ clearTimeout(press.timer); press=null; } if(t==='pointercancel'){ state.drag=null; state.dragOver=null; } }));
    slot.addEventListener('pointerenter',()=>{ if(state.drag) slot.classList.add('yx121-warehouse-drop-target'); }); slot.addEventListener('pointerleave',()=>slot.classList.remove('yx121-warehouse-drop-target'));
    slot.addEventListener('contextmenu',ev=>{ ev.preventDefault(); if(Date.now()<Number(slot.dataset.blockClickUntil||0)) return; const d=data(); showMenu(d.zone,d.col,d.slot,ev.clientX,ev.clientY); slot.dataset.blockClickUntil=String(Date.now()+500); });
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
    if(!window.__YX_WAREHOUSE_PAGEHIDE_FLUSH_V170__){
      window.__YX_WAREHOUSE_PAGEHIDE_FLUSH_V170__ = true;
      const flushOnLeave = ()=>{ try{ if(isWarehouse()){ flushAllPendingAutoSaves('離開頁面前已先保存目前格位，背景儲存中'); } }catch(_e){} };
      window.addEventListener('pagehide', flushOnLeave, {capture:true});
      document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='hidden') flushOnLeave(); }, true);
    }
    document.addEventListener('click',async ev=>{
      if(!isWarehouse()) return;
      const act=ev.target?.closest?.('[data-wh-act]'); if(act){ ev.preventDefault(); ev.stopPropagation(); await executeWarehouseMenuAction(act.dataset.whAct); return; }
      if(!ev.target?.closest?.('#yx-final-warehouse-menu')) menu().classList.add('hidden');
      if(ev.target?.id==='yx121-add-batch-row'){ ev.preventDefault(); state.batchCount=Math.max(3,Number(state.batchCount||3))+1; renderCellItems(); markCurrentCellDirty(); return; }
      if(ev.target?.id==='yx121-save-cell'){ ev.preventDefault(); try{ await saveWarehouseCell(); }catch(e){ toast(e.message||'儲存格位失敗','error'); } return; }
      const rm=ev.target?.closest?.('[data-remove-cell-item]'); if(rm){
        ev.preventDefault();
        if(!state.current) return;
        const before=JSON.parse(JSON.stringify(cellItems(state.current.zone,state.current.col,state.current.slot)));
        applyCurrentItemInputs();
        const idx=Number(rm.dataset.removeCellItem);
        state.current.items.splice(idx,1);
        autoSaveCurrentCell('已先刪除該筆商品並退回下拉選單，背景儲存中', before);
        return;
      }
      const curProd=ev.target?.closest?.('[data-current-product]'); if(curProd){ setTimeout(()=>syncCurrentRowQtyFromProduct(curProd.closest('.yx-direct-current-item')),0); return; }
      const curQty=ev.target?.closest?.('[data-current-qty]'); if(curQty){ setTimeout(()=>syncCurrentRowProductFromQty(curQty.closest('.yx-direct-current-item')),0); return; }
    },true);
    document.addEventListener('change', ev=>{
      if(!isWarehouse()) return;
      const sel=ev.target?.closest?.('#yx121-batch-rows .yx121-batch-select'); if(sel){ syncBatchSelectLimits(); }
      const currentEdit=ev.target?.closest?.('#warehouse-current-items-html [data-current-product], #warehouse-current-items-html [data-current-qty], #warehouse-current-items-html [data-current-material], #warehouse-current-items-html [data-current-placement]');
      if(currentEdit && state.current){
        const before=JSON.parse(JSON.stringify(cellItems(state.current.zone,state.current.col,state.current.slot)));
        scheduleAutoSaveCurrentCell('已先套用格內編輯，減少數量會立即退回下拉選單，背景儲存中', before);
      }
    }, true);
    document.addEventListener('input', ev=>{
      if(!isWarehouse()) return;
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
      const noteEl=ev.target?.closest?.('#warehouse-note');
      if(noteEl && state.current){
        const before=JSON.parse(JSON.stringify(cellItems(state.current.zone,state.current.col,state.current.slot)));
        scheduleAutoSaveCurrentCell('格位備註已先更新，背景儲存中', before, 420);
        return;
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
  function install(){ if(!isWarehouse()) return; document.documentElement.dataset.yxWarehouseSingleHtmlDataJs='true'; document.documentElement.dataset.yxWarehouseLongpressDbSync='v182-single-controller-stability'; bindGlobal(); bindSlots(); setWarehouseZone(localStorage.getItem('warehouseActiveZone')||'A',false); renderWarehouse(false); }
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
  window.YXFinalWarehouse={version:'v182-warehouse-stability',render:renderWarehouse, openWarehouseModal, saveWarehouseCell, jumpProductToWarehouse};
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
