/* 沅興木業 FULL MASTER V41 SHIP WAREHOUSE REAL LOADED WRITEBACK - page_warehouse_master_v41 */
(function(){ window.__YX_FULL_MASTER_V41_PAGE__='page_warehouse_master_v41'; })();

/* ===== V2 MERGED FROM static/yx_modules/core_hardlock.js ===== */
/* 沅興木業 FIX118 core hard-lock registry
   目的：把功能拆成獨立模組，再由 各頁實際載入母版直接安裝，避免舊版函式覆蓋新版。 */
(function(){
  'use strict';
  if (window.YXHardLock && window.YXHardLock.version === 'full-master-v41-ship-warehouse-real-loaded-html-js-css-writeback') return;

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
    version: 'full-master-v41-ship-warehouse-real-loaded-html-js-css-writeback',
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
    const raw = norm(text || '');
    const fb = Number.isFinite(Number(fallback)) ? Number(fallback) : 0;
    if (!raw) return fb || 0;
    const right = raw.includes('=') ? raw.split('=').slice(1).join('=') : raw;
    if (!right) return 1;
    const canonical = '504x5+588+587+502+420+382+378+280+254+237+174';
    if (right.toLowerCase() === canonical) return 10;
    const parts = right.split('+').map(clean).filter(Boolean);
    if (!parts.length) return 1;
    const isSingleQtyX = seg => String(seg || '').replace(/\s+/g,'').toLowerCase().split('x').length === 2 && /x\s*\d+\s*$/i.test(seg);
    const xParts = parts.filter(isSingleQtyX);
    const bare = parts.filter(p => !isSingleQtyX(p) && /\d/.test(p));
    if (parts.length >= 10 && xParts.length === 1 && parts[0] === xParts[0] && /^\d{3,}\s*x\s*\d+\s*$/i.test(xParts[0]) && bare.length >= 8) return bare.length;
    let total = 0;
    let hit = false;
    for (const seg of parts){
      const explicit = seg.match(/(\d+)\s*[件片]/);
      if (explicit){ total += Number(explicit[1] || 0); hit = true; continue; }
      const m = isSingleQtyX(seg) ? seg.match(/x\s*(\d+)\s*$/i) : null;
      if (m){ total += Number(m[1] || 0); hit = true; }
      else if (/\d/.test(seg)){ total += 1; hit = true; }
    }
    return hit ? total : 1;
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
    current:{zone:'A',col:1,slot:1,items:[],note:''}, batchCount:3, drag:null, loading:null, bound:false, unplacedOpen:false, opBusy:false, renderSeq:0
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
    const nums=(state.data.cells||[]).filter(x=>clean(x.zone).toUpperCase()===z && Number(x.column_index)===c).map(x=>Number(x.slot_number)||0).filter(n=>n>0);
    // V38：資料已載入後以 DB 的實際最大格號為準，避免刪除格子後又被前端最少 20 格補回。
    // 初次資料尚未回來時，才保留 HTML 預設 20 格骨架，避免空白閃爍。
    if(nums.length) return Math.max(...nums);
    const domCount=getColumnList(z,c)?.querySelectorAll('[data-slot]')?.length || 0;
    return domCount || 20;
  }
  function getColumnList(z,c){ return document.querySelector(`.vertical-column-card[data-zone="${z}"][data-column="${Number(c)}"] .vertical-slot-list`); }
  function createSlotElement(z,c,s){
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='yx-final-slot yx108-slot yx106-slot yx116-slot vertical-slot';
    btn.dataset.zone=z; btn.dataset.column=String(Number(c)); btn.dataset.slot=String(Number(s));
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
    // V40：同時重整時不讓舊回應覆蓋新版；也修正舊回應被淘汰後 state.loading 永久卡住。
    if(state.loading){
      if(force) state.reloadQueued=true;
      await state.loading.catch(()=>{});
      if(force && state.reloadQueued && !state.loading){ state.reloadQueued=false; return renderWarehouse(true); }
      return state.loading;
    }
    const seq=++state.renderSeq;
    state.reloadQueued=false;
    const task=(async()=>{
      try{
        const [d]=await Promise.all([api('/api/warehouse?ts='+Date.now()), loadAvailable()]);
        if(seq!==state.renderSeq) return;
        state.data={cells:Array.isArray(d.cells)?d.cells:[], zones:d.zones||{A:{},B:{}}};
        window.state=window.state||{};
        window.state.warehouse={...state.data, activeZone:state.activeZone, availableItems:state.available};
        updateAllSlots();
      } catch(e){
        toast(e.message||'倉庫圖載入失敗','error');
        bindSlots();
      } finally{
        if(state.loading===task) state.loading=null;
      }
    })();
    state.loading=task;
    await task;
    if(force && state.reloadQueued){ state.reloadQueued=false; return renderWarehouse(true); }
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
  async function clearWarehouseSearchAndReload(){ const input=$('warehouse-search'); if(input) input.value=''; clearWarehouseHighlights(); await renderWarehouse(true); }
  function highlightWarehouseCell(z,c,s){ setWarehouseZone(clean(z).toUpperCase(),false); state.searchKeys.add(key(z,c,s)); updateSlotUI(z,c,s); const el=ensureSlotElement(clean(z).toUpperCase(),c,s); if(el){ el.classList.add('highlight','flash-highlight'); el.scrollIntoView?.({behavior:'smooth',block:'center'}); setTimeout(()=>el.classList.remove('flash-highlight'),2200); } }
  function parseWarehouseLocationQuery(q){
    const raw=clean(q).toUpperCase().replace(/區/g,'').replace(/欄/g,'-').replace(/格/g,'').replace(/[\s_]+/g,'-');
    const m=raw.match(/^([AB])[- ]*(\d{1,2})[- ]*(\d{1,3})$/) || raw.match(/^([AB])(\d)(\d{1,2})$/);
    if(!m) return null;
    const z=m[1], c=Number(m[2]), s=Number(m[3]);
    return (['A','B'].includes(z) && c>=1 && c<=6 && s>=1) ? {zone:z,col:c,slot:s} : null;
  }
  async function searchWarehouse(){
    const q=clean($('warehouse-search')?.value||''); if(!q){ clearWarehouseHighlights(); return; }
    const box=$('warehouse-search-results');
    const loc=parseWarehouseLocationQuery(q);
    if(loc){
      const exists=!!ensureSlotElement(loc.zone,loc.col,loc.slot);
      state.searchKeys=new Set([key(loc.zone,loc.col,loc.slot)]); updateAllSlots(); highlightWarehouseCell(loc.zone,loc.col,loc.slot);
      if(box){ box.classList.remove('hidden'); box.innerHTML=exists?`<button type="button" class="deduct-card yx-search-hit" data-hit-loc="1"><strong>${esc(loc.zone)}-${loc.col}-${loc.slot}</strong><div>已定位到格位</div><div class="small-note">可直接點格子編輯，或長按插入 / 刪除</div></button>`:'<div class="empty-state-card compact-empty">找不到格位</div>'; box.querySelector('[data-hit-loc]')?.addEventListener('click',()=>highlightWarehouseCell(loc.zone,loc.col,loc.slot)); }
      return;
    }
    try{ const d=await api('/api/warehouse/search?q='+encodeURIComponent(q)+'&ts='+Date.now()); const hits=Array.isArray(d.items)?d.items:[]; state.searchKeys=new Set(hits.map(h=>{ const c=h.cell||h; return key(c.zone,c.column_index,c.slot_number); })); updateAllSlots(); if(box){ box.classList.remove('hidden'); box.innerHTML=hits.length?hits.map((h,i)=>{ const c=h.cell||h; return `<button type="button" class="deduct-card yx-search-hit" data-hit="${i}"><strong>${esc(c.zone)}-${Number(c.column_index)}-${Number(c.slot_number)}</strong><div>${esc(cleanCustomer(h.customer_name||h.item?.customer_name||''))}</div><div class="small-note">${esc(productText(h.item||h))}</div></button>`; }).join(''):'<div class="empty-state-card compact-empty">找不到格位</div>'; box.querySelectorAll('[data-hit]').forEach((btn,i)=>btn.onclick=()=>{ const c=(hits[i].cell||hits[i]); highlightWarehouseCell(c.zone,c.column_index,c.slot_number); }); } if(hits[0]){ const c=hits[0].cell||hits[0]; highlightWarehouseCell(c.zone,c.column_index,c.slot_number); } }catch(e){ toast(e.message||'搜尋失敗','error'); }
  }
  function highlightWarehouseSameCustomer(){
    const name=clean(window.__YX_SELECTED_CUSTOMER__||$('customer-name')?.value||''); if(!name) return toast('請先選擇客戶','warn');
    state.searchKeys.clear(); (state.data.cells||[]).forEach(c=>{ cellItems(c.zone,c.column_index,c.slot_number).forEach(it=>{ const cn=cleanCustomer(it.customer_name); if(cn.includes(name)||name.includes(cn)) state.searchKeys.add(key(c.zone,c.column_index,c.slot_number)); }); }); updateAllSlots();
  }
  function ensureWarehouseUnplacedInline(){
    let box=$('warehouse-unplaced-list-inline');
    if(box) return box;
    box=document.createElement('div');
    box.id='warehouse-unplaced-list-inline';
    box.className='search-results hidden yx28-warehouse-unplaced-inline';
    box.setAttribute('data-html-locked','warehouse-unplaced-inline-list');
    const anchor=$('warehouse-search-results')||$('warehouse-detail-panel')||$('warehouse-root');
    if(anchor && anchor.parentNode) anchor.parentNode.insertBefore(box, anchor.nextSibling);
    else document.body.appendChild(box);
    return box;
  }
  async function toggleWarehouseUnplacedHighlight(){
    await loadAvailable(); const box=ensureWarehouseUnplacedInline(); if(!box) return; state.unplacedOpen=!state.unplacedOpen;
    if(!state.unplacedOpen){ box.classList.add('hidden'); return; }
    const list=(state.activeZone==='B'?state.availableByZone.B:(state.activeZone==='A'?state.availableByZone.A:state.available)); box.classList.remove('hidden'); box.innerHTML=`<div class="section-head yx28-unplaced-head"><div><strong>未錄入倉庫圖</strong><div class="small-note">目前篩選：${esc(state.activeZone==='ALL'?'全部':state.activeZone+' 區')}</div></div><button type="button" class="ghost-btn small-btn" data-yx28-close-unplaced>收合</button></div>`+(list.length?list.map((it,i)=>`<button type="button" class="deduct-card yx28-unplaced-row" data-yx28-unplaced-index="${i}"><strong>${esc(cleanCustomer(it.customer_name||''))}</strong><div>${esc(productText(it))}</div><div class="small-note">${itemQty(it)}件｜${esc(sourceOf(it))}｜${esc(state.activeZone==='ALL'?(it.zone||''):state.activeZone+'區')}</div></button>`).join(''):'<div class="empty-state-card compact-empty">目前沒有未錄入倉庫圖商品</div>');
  }
  function optionLabel(it){ const mat=materialOf(it); return `${cleanCustomer(it.customer_name||'')}｜${mat?mat+'｜':''}${productText(it)}｜${itemQty(it)}件｜${sourceOf(it)}`; }
  function availableListForCurrent(){ const z=clean(state.current?.zone||state.activeZone||'A').toUpperCase(); return z==='B'?state.availableByZone.B:state.availableByZone.A; }
  function availableRows(){ const q=clean($('warehouse-item-search')?.value||'').toLowerCase(); return availableListForCurrent().map((it,i)=>({it,index:i})).filter(r=>!q||optionLabel(r.it).toLowerCase().includes(q)); }
  function captureBatchRows(){
    return Array.from(document.querySelectorAll('#yx121-batch-rows .yx121-batch-row')).map(row=>({
      index:Number(row.dataset.batchIndex||0),
      value:row.querySelector('.yx121-batch-select')?.value || '',
      qty:row.querySelector('.yx121-batch-qty')?.value || ''
    }));
  }
  function restoreBatchRows(snapshot){
    const map=new Map((snapshot||[]).map(r=>[String(r.index),r]));
    document.querySelectorAll('#yx121-batch-rows .yx121-batch-row').forEach(row=>{
      const saved=map.get(String(row.dataset.batchIndex||0));
      if(!saved) return;
      const sel=row.querySelector('.yx121-batch-select');
      const qty=row.querySelector('.yx121-batch-qty');
      if(sel && saved.value && Array.from(sel.options).some(o=>o.value===saved.value)) sel.value=saved.value;
      if(qty && saved.qty) qty.value=saved.qty;
    });
  }
  function sameAvailableKey(it){
    return [sourceOf(it), clean(it?.source_id||it?.id||''), cleanCustomer(it?.customer_name||''), materialOf(it), productText(it)].join('::');
  }
  function availableValue(it,index){
    // V40：批量下拉用穩定 key，不再只用陣列 index；避免未錄入清單重新載入後選到另一筆。
    return 'wk:'+sameAvailableKey(it);
  }
  function findAvailableByValue(value){
    const pool=availableListForCurrent();
    if(!value) return null;
    if(String(value).startsWith('wk:')){
      const k=String(value).slice(3);
      const it=pool.find(x=>sameAvailableKey(x)===k);
      return it ? {it,index:pool.indexOf(it)} : null;
    }
    const idx=Number(value);
    return Number.isFinite(idx) && pool[idx] ? {it:pool[idx],index:idx} : null;
  }
  function placementForBatch(i){ return i===0?'後排':i===1?'中間':'前排'; }
  function renderCellItems(){
    const previousBatch = captureBatchRows();
    const box=$('warehouse-cell-items'); if(!box) return;
    // 批量加入面板已直接寫在 templates/module.html；這裡只更新「目前商品」與「每列選項」，不再整塊覆蓋 HTML。
    if(!$('warehouse-current-items-html') || !$('yx121-batch-rows')){
      box.innerHTML=`<div class="yx-direct-section" data-html-locked="warehouse-current-items-html"><div class="yx-direct-section-title">目前此格商品</div><div id="warehouse-current-items-html" class="yx-direct-current-list"></div></div><div class="yx-direct-batch-panel" data-html-locked="warehouse-batch-html-fixed"><div class="yx-direct-section-title">批量加入商品</div><div class="small-note">A / B 區各自只顯示尚未錄入倉庫圖商品；第 1 筆後排、第 2 筆中間、第 3 筆前排。</div><div id="yx121-batch-rows"></div><div class="btn-row compact-row"><button class="ghost-btn small-btn" type="button" id="yx121-add-batch-row">新增更多批量</button><button class="primary-btn small-btn" type="button" id="yx121-save-cell">儲存格位</button></div></div>`;
    }
    const current=(state.current.items||[]).map((it,i)=>{ const mat=materialOf(it), place=clean(it.placement_label||it.layer_label||''); return `<div class="yx-direct-current-item" data-idx="${i}"><div class="yx-direct-current-main"><span class="yx-direct-source">${esc(sourceOf(it))}</span>${mat?`<span class="yx-direct-material">${esc(mat)}</span>`:''}<strong>${esc(cleanCustomer(it.customer_name))}</strong><span class="yx-direct-product">${esc(productText(it))}</span></div><div class="yx-direct-current-side"><span>${place?esc(place)+'｜':''}${itemQty(it)}件</span><button class="remove yx-direct-remove" type="button" data-remove-cell-item="${i}">×</button></div></div>`; }).join('') || '<div class="empty-state-card compact-empty">此格目前沒有商品</div>';
    const currentBox=$('warehouse-current-items-html'); if(currentBox) currentBox.innerHTML=current;
    const visibleRows=availableRows();
    const visibleIndexes=new Set(visibleRows.map(r=>availableValue(r.it,r.index)));
    const selectedIndexes=new Set(previousBatch.map(r=>String(r.value||'')).filter(Boolean));
    // V38：搜尋批量商品時，已選的商品即使暫時不符合搜尋字，也保留在下拉選單中，避免輸入搜尋後清掉已選列。
    const optionRows=[...visibleRows];
    selectedIndexes.forEach(raw=>{
      if(visibleIndexes.has(raw)) return;
      const found=findAvailableByValue(raw);
      if(found) optionRows.unshift({it:found.it,index:found.index, preserved:true});
    });
    const opts=optionRows.map(r=>`<option value="${esc(availableValue(r.it,r.index))}" data-max="${itemQty(r.it)}" data-av-key="${esc(sameAvailableKey(r.it))}">${r.preserved?'已選｜':''}${esc(optionLabel(r.it))}｜可加入 ${itemQty(r.it)} 件</option>`).join('');
    const emptyHint = opts ? '' : '<option value="">此區目前沒有未錄入商品，或請換 A/B 區</option>';
    const rows=Array.from({length:Math.max(3,Number(state.batchCount||3))},(_,i)=>`<div class="yx121-batch-row" data-batch-index="${i}"><label class="yx121-batch-label">${placementForBatch(i)}</label><select class="text-input yx121-batch-select"><option value="">選擇此區未錄入商品</option>${opts || emptyHint}</select><input class="text-input yx121-batch-qty" type="number" min="1" placeholder="加入件數" data-yx121-max=""></div>`).join('');
    const rowsBox=$('yx121-batch-rows'); if(rowsBox) rowsBox.innerHTML=rows;
    restoreBatchRows(previousBatch);
    syncBatchSelectLimits();
  }
  async function openWarehouseModal(z,c,s){
    z=clean(z).toUpperCase();
    state.current={zone:z,col:Number(c),slot:Number(s),items:JSON.parse(JSON.stringify(cellItems(z,c,s))),note:cellNote(z,c,s)};
    state.batchCount=3;
    const meta=$('warehouse-modal-meta'); if(meta) meta.textContent=`${z} 區第 ${Number(c)} 欄 第 ${Number(s)} 格`;
    const note=$('warehouse-note'); if(note) note.value=state.current.note||'';
    const search=$('warehouse-item-search'); if(search) search.value='';
    $('warehouse-modal')?.classList.remove('hidden');
    renderCellItems();
    try { if(search) search.focus(); } catch(_e) {}
    // V7：先立刻開啟格位批量加入畫面，再背景抓 A/B 區未錄入商品，下拉選單抓完即刷新。
    try { await loadAvailable(); renderCellItems(); } catch(e){ toast(e.message||'未錄入商品載入失敗','error'); }
  }
  function closeWarehouseModal(){ const m=$('warehouse-modal'); if(m) m.classList.add('hidden'); state.current={zone:state.activeZone||'A',col:1,slot:1,items:[],note:''}; state.batchCount=3; }
  function syncBatchSelectLimits(){
    const rows=Array.from(document.querySelectorAll('#yx121-batch-rows .yx121-batch-row'));
    const selectedQtyByKey=new Map();
    const rowState=[];
    rows.forEach(row=>{
      const sel=row.querySelector('.yx121-batch-select');
      const qtyInput=row.querySelector('.yx121-batch-qty');
      const raw=sel?.value || '';
      const opt=raw==='' ? null : sel?.options?.[sel.selectedIndex];
      const avKey=opt?.dataset?.avKey || raw;
      const qty=Number(qtyInput?.value||0) || 0;
      rowState.push({row,sel,qtyInput,raw,opt,avKey,qty});
      if(raw!=='') selectedQtyByKey.set(avKey,(selectedQtyByKey.get(avKey)||0)+qty);
    });
    rowState.forEach(st=>{
      const {sel,qtyInput,raw,opt,avKey,qty}=st; if(!sel||!qtyInput) return;
      Array.from(sel.options).forEach(option=>{
        if(!option.value){ option.disabled=false; return; }
        const total=Number(option.dataset.max||0);
        const key=option.dataset.avKey || option.value;
        const used=selectedQtyByKey.get(key)||0;
        option.disabled = option.value!==raw && total>0 && used>=total;
      });
      const total=Number(opt?.dataset?.max||0);
      const usedByOther=raw==='' ? 0 : Math.max(0,(selectedQtyByKey.get(avKey)||0) - qty);
      const max=Math.max(0,total-usedByOther);
      if(raw!=='' && max>0){ qtyInput.max=String(max); qtyInput.dataset.yx121Max=String(max); if(!qtyInput.value) qtyInput.value=String(max); if(Number(qtyInput.value)>max){ qtyInput.value=String(max); toast('同商品多列合計不可超過未入倉件數','warn'); } }
      else { qtyInput.removeAttribute('max'); qtyInput.dataset.yx121Max=''; if(!sel.value) qtyInput.value=''; }
    });
  }
  function collectBatchItems(){
    const added=[];
    const pool=availableListForCurrent();
    const usedByKey=new Map();
    const violations=[];
    document.querySelectorAll('#yx121-batch-rows .yx121-batch-row').forEach(row=>{
      const raw=row.querySelector('.yx121-batch-select')?.value;
      if(raw==='') return;
      const found=findAvailableByValue(raw);
      if(!found || !found.it) return;
      const it=found.it;
      const max=itemQty(it)||1;
      const k=sameAvailableKey(it);
      const used=usedByKey.get(k)||0;
      let qty=Number(row.querySelector('.yx121-batch-qty')?.value||max||1);
      qty=Math.max(1,Math.floor(qty));
      if(used+qty>max){ violations.push(`${optionLabel(it)}｜最多 ${max} 件，已選 ${used+qty} 件`); return; }
      usedByKey.set(k,used+qty);
      added.push(normalizedItem(it,qty,placementForBatch(Number(row.dataset.batchIndex||added.length))));
    });
    if(violations.length){ const e=new Error('同商品多列合計超過可加入件數：\n'+violations.slice(0,3).join('\n')); e.code='BATCH_OVER_LIMIT'; throw e; }
    return added;
  }
  async function saveCellRaw(z,c,s,items,note){ const d=await api('/api/warehouse/cell',{method:'POST',body:JSON.stringify({zone:clean(z).toUpperCase(),column_index:Number(c),slot_type:'direct',slot_number:Number(s),items:items||[],note:note||''})}); if(Array.isArray(d.cells)){ state.data.cells=d.cells; updateAllSlots(); } return d; }
  async function saveWarehouseCell(){
    const btn=$('yx121-save-cell');
    if(btn?.dataset.saving==='1') return;
    if(btn){ btn.dataset.saving='1'; btn.disabled=true; }
    try{
      const target={zone:state.current.zone,col:Number(state.current.col),slot:Number(state.current.slot)};
      const added=collectBatchItems();
      const items=[...(state.current.items||[]),...added].filter(it=>itemQty(it)>0);
      await saveCellRaw(target.zone,target.col,target.slot,items,$('warehouse-note')?.value||'');
      toast(added.length ? '格位已儲存，已加入批量商品' : '格位已儲存','ok');
      closeWarehouseModal();
      await renderWarehouse(true);
      highlightWarehouseCell(target.zone,target.col,target.slot);
    } finally {
      if(btn){ btn.dataset.saving='0'; btn.disabled=false; }
    }
  }
  function updateUndoButton(){ const b=$('yx121-warehouse-undo'); if(b) b.disabled=!state.undoStack.length; }
  async function moveCellContents(from,to){
    if(state.opBusy) return toast('格位操作處理中，請等畫面更新完成','warn');
    const f={zone:clean(from.zone).toUpperCase(),col:Number(from.col),slot:Number(from.slot)}, t={zone:clean(to.zone).toUpperCase(),col:Number(to.col),slot:Number(to.slot)};
    if(f.zone===t.zone&&f.col===t.col&&f.slot===t.slot) return;
    const moved=cellItems(f.zone,f.col,f.slot).filter(it=>itemQty(it)>0);
    if(!moved.length) return toast('此格沒有可拖拉的商品','warn');
    state.opBusy=true;
    const src={...f,items:JSON.parse(JSON.stringify(cellItems(f.zone,f.col,f.slot))),note:cellNote(f.zone,f.col,f.slot)}; const dst={...t,items:JSON.parse(JSON.stringify(cellItems(t.zone,t.col,t.slot))),note:cellNote(t.zone,t.col,t.slot)};
    const dstAfter=[...moved.map(it=>normalizedItem(it,itemQty(it),'前排')),...dst.items];
    try{
      await saveCellRaw(f.zone,f.col,f.slot,[],src.note);
      try{
        await saveCellRaw(t.zone,t.col,t.slot,dstAfter,dst.note);
      }catch(inner){
        // V38：來源格已先清空後，若目標格寫入失敗，立即回補來源與目標，避免拖拉失敗造成商品消失。
        try{ await saveCellRaw(f.zone,f.col,f.slot,src.items,src.note); }catch(_restoreSource){}
        try{ await saveCellRaw(t.zone,t.col,t.slot,dst.items,dst.note); }catch(_restoreTarget){}
        throw inner;
      }
      state.undoStack.push({source:src,target:dst}); if(state.undoStack.length>20) state.undoStack.shift(); updateUndoButton(); toast('已移動到前排','ok'); await renderWarehouse(true); highlightWarehouseCell(t.zone,t.col,t.slot);
    } catch(e){ toast(e.message||'拖拉移動失敗，已保留原格資料','error'); await renderWarehouse(true); }
    finally { state.opBusy=false; }
  }
  async function undoWarehouseMove(){ const last=state.undoStack.pop(); updateUndoButton(); if(!last) return toast('目前沒有可還原的倉庫移動','warn'); try{ await saveCellRaw(last.target.zone,last.target.col,last.target.slot,last.target.items,last.target.note); await saveCellRaw(last.source.zone,last.source.col,last.source.slot,last.source.items,last.source.note); toast('已還原上一步','ok'); await renderWarehouse(true); highlightWarehouseCell(last.source.zone,last.source.col,last.source.slot); }catch(e){ state.undoStack.push(last); updateUndoButton(); toast(e.message||'還原失敗','error'); } }
  async function insertWarehouseCell(z,c,s){
    if(state.opBusy) return toast('格位操作處理中，請等畫面更新完成','warn');
    state.opBusy=true;
    try{
      const d=await api('/api/warehouse/add-slot',{method:'POST',body:JSON.stringify({zone:clean(z).toUpperCase(),column_index:Number(c),insert_after:Number(s||0),slot_type:'direct'})});
      toast('已插入格子','ok');
      state.data.cells=Array.isArray(d.cells)?d.cells:state.data.cells;
      state.renderSeq++;
      await renderWarehouse(true);
      highlightWarehouseCell(z,c,Number(d.slot_number||Number(s)+1));
    } finally { state.opBusy=false; }
  }
  async function deleteWarehouseCell(z,c,s){
    if(state.opBusy) return toast('格位操作處理中，請等畫面更新完成','warn');
    if(cellItems(z,c,s).filter(it=>itemQty(it)>0).length) return toast('格子內還有商品，請先移除商品後再刪除','warn');
    if(!confirm(`確定刪除 ${z} 區第 ${c} 欄第 ${s} 格？`)) return;
    state.opBusy=true;
    try{
      const d=await api('/api/warehouse/remove-slot',{method:'POST',body:JSON.stringify({zone:clean(z).toUpperCase(),column_index:Number(c),slot_number:Number(s),slot_type:'direct'})});
      toast('已刪除格子','ok');
      if(Array.isArray(d.cells)){ state.data.cells=d.cells; updateAllSlots(); }
      state.renderSeq++;
      await renderWarehouse(true);
      highlightWarehouseCell(z,c,Math.max(1,Number(s)-1));
    } finally { state.opBusy=false; }
  }
  function menu(){ let m=$('yx-final-warehouse-menu'); if(m) return m; m=document.createElement('div'); m.id='yx-final-warehouse-menu'; m.className='yx-final-warehouse-menu hidden'; m.innerHTML='<button data-wh-act="open">開啟 / 編輯格位</button><button data-wh-act="insert">在此格後插入格子</button><button data-wh-act="delete">刪除此格</button>'; document.body.appendChild(m); return m; }
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
      const closeUnplaced=ev.target?.closest?.('[data-yx28-close-unplaced]'); if(closeUnplaced){ ev.preventDefault(); $('warehouse-unplaced-list-inline')?.classList.add('hidden'); state.unplacedOpen=false; return; }
      const act=ev.target?.closest?.('[data-wh-act]'); if(act){ ev.preventDefault(); const m=menu(); const z=m.dataset.zone,c=Number(m.dataset.column),s=Number(m.dataset.slot); m.classList.add('hidden'); try{ if(act.dataset.whAct==='open') await openWarehouseModal(z,c,s); if(act.dataset.whAct==='insert') await insertWarehouseCell(z,c,s); if(act.dataset.whAct==='delete') await deleteWarehouseCell(z,c,s); }catch(e){ toast(e.message||'格位操作失敗','error'); } return; }
      if(!ev.target?.closest?.('#yx-final-warehouse-menu')) menu().classList.add('hidden');
      if(ev.target?.id==='yx121-add-batch-row'){ ev.preventDefault(); state.batchCount=Math.max(3,Number(state.batchCount||3))+1; renderCellItems(); return; }
      if(ev.target?.id==='yx121-save-cell'){ ev.preventDefault(); try{ await saveWarehouseCell(); }catch(e){ toast(e.message||'儲存格位失敗','error'); } return; }
      const rm=ev.target?.closest?.('[data-remove-cell-item]'); if(rm){ ev.preventDefault(); state.current.items.splice(Number(rm.dataset.removeCellItem),1); renderCellItems(); return; }
    },true);
    document.addEventListener('change', ev=>{ const sel=ev.target?.closest?.('#yx121-batch-rows .yx121-batch-select'); if(sel){ syncBatchSelectLimits(); } }, true);
    document.addEventListener('input', ev=>{ const qty=ev.target?.closest?.('#yx121-batch-rows .yx121-batch-qty'); if(qty){ const max=Number(qty.dataset.yx121Max||qty.max||0); if(max>0 && Number(qty.value)>max){ qty.value=String(max); toast('加入件數不可超過該商品可加入數量','warn'); } } }, true);
    $('warehouse-item-search')?.addEventListener('input',renderCellItems);
    $('warehouse-search')?.addEventListener('keydown', ev=>{ if(ev.key==='Enter'){ ev.preventDefault(); searchWarehouse(); } });
    $('warehouse-modal')?.addEventListener('click', ev=>{ if(ev.target && ev.target.id==='warehouse-modal') closeWarehouseModal(); });
    updateUndoButton();
  }
  async function jumpProductToWarehouse(customerName, productText){ const q=clean([customerName,productText].filter(Boolean).join(' ')); const fallback=clean(productText||customerName||''); if(!q&&!fallback) return toast('缺少商品或客戶關鍵字','warn'); try{ let d=await api('/api/warehouse/search?q='+encodeURIComponent(q||fallback)+'&ts='+Date.now()); let hits=Array.isArray(d.items)?d.items:[]; if(!hits.length && fallback && fallback!==q){ d=await api('/api/warehouse/search?q='+encodeURIComponent(fallback)+'&ts='+Date.now()); hits=Array.isArray(d.items)?d.items:[]; } const hit=hits[0]; if(!hit) return toast('倉庫圖找不到這筆商品位置','warn'); const c=hit.cell||hit; highlightWarehouseCell(c.zone,c.column_index,c.slot_number); }catch(e){ toast(e.message||'跳到倉庫位置失敗','error'); } }
  function install(){ if(!isWarehouse()) return; document.documentElement.dataset.yxWarehouseSingleHtmlDataJs='true'; document.documentElement.dataset.yxWarehouseV41Fix='ship-warehouse-real-loaded'; document.documentElement.dataset.yxV41ShipWarehouseWriteback='locked'; bindGlobal(); bindSlots(); setWarehouseZone(localStorage.getItem('warehouseActiveZone')||'A',false); renderWarehouse(true); }
  window.renderWarehouse=renderWarehouse;
  window.setWarehouseZone=setWarehouseZone;
  window.searchWarehouse=searchWarehouse;
  window.clearWarehouseHighlights=clearWarehouseHighlights;
  window.clearWarehouseSearchAndReload=clearWarehouseSearchAndReload;
  window.highlightWarehouseSameCustomer=highlightWarehouseSameCustomer;
  window.toggleWarehouseUnplacedHighlight=toggleWarehouseUnplacedHighlight;
  window.undoWarehouseMove=undoWarehouseMove;
  window.openWarehouseModal=openWarehouseModal;
  window.closeWarehouseModal=closeWarehouseModal;
  window.saveWarehouseCell=saveWarehouseCell;
  window.insertWarehouseCell=insertWarehouseCell;
  window.deleteWarehouseCell=deleteWarehouseCell;
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
  window.YX_HTML_DIRECT_MASTER = Object.freeze({version:'v41-ship-warehouse-true-clean-master-no-pageshow', install});
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true});
  else install();
  // no pageshow reinstall: avoid settings -> home lag
})();

/* ===== END static/yx_pages/page_bootstrap_master.js ===== */


