/* V507 data spine: local-first bridge with no-empty-overwrite guard and sync metadata. No renderer, no timer, no observer, no cache-core change. */
(function(){
  'use strict';
  if (window.YXDataStore && window.YXDataStore.version === 'v514-postdeploy-evidence-collector-pack24') return;
  const VERSION = 'v514-postdeploy-evidence-collector-pack24';
  const PRODUCT_KEY = {inventory:'inventory', orders:'orders', master_order:'master_order'};
  const clean = v => String(v == null ? '' : v).replace(/[\u3000\s]+/g,' ').trim();
  const clone = v => { try { return JSON.parse(JSON.stringify(v)); } catch(_e) { return v; } };
  const rowsOf = data => Array.isArray(data?.items) ? data.items : (Array.isArray(data?.rows) ? data.rows : []);
  const hasUsefulRows = data => rowsOf(data).length > 0 || (Array.isArray(data?.cells) && data.cells.length > 0) || !!(data && data.zones);
  const normalizeSource = s => {
    s = clean(s);
    if (s === 'master_orders' || s === 'master' || s === '總單') return 'master_order';
    if (s === 'order' || s === '訂單') return 'orders';
    if (s === '庫存') return 'inventory';
    return s;
  };
  const staticToken = () => String(window.__YX_STATIC_VERSION__ || window.YX?.version || VERSION).replace(/[^A-Za-z0-9_-]/g,'_');
  function localProductRows(source){
    source = normalizeSource(source);
    const rows = [];
    let newest = 0;
    try{
      const p1 = 'yx_v406_cache_products_' + source + '_';
      const p2 = 'products_' + source + '_';
      for(let i=0;i<localStorage.length;i++){
        const k = localStorage.key(i) || '';
        if(!k.startsWith(p1) && !k.startsWith(p2)) continue;
        const obj = JSON.parse(localStorage.getItem(k) || 'null') || {};
        const at = Number(obj.saved_at || obj.data?.saved_at || 0);
        const data = obj.data || obj;
        const arr = Array.isArray(data.rows) ? data.rows : (Array.isArray(data.items) ? data.items : []);
        if(arr.length || (at >= newest && newest === 0)){ newest = Math.max(newest, at); rows.splice(0, rows.length, ...arr); }
      }
    }catch(_e){}
    return {rows:clone(rows), saved_at:newest, hasPayload:newest>0};
  }
  function writeProductLocal(source, rows){
    try{
      source = normalizeSource(source); if(!source) return;
      rows = Array.isArray(rows) ? rows : [];
      const payload = {saved_at:Date.now(), data:{rows:clone(rows), items:clone(rows), selectedCustomer:clean(window.__YX_SELECTED_CUSTOMER__||''), from_yx_data_store:true, version:VERSION}};
      localStorage.setItem('yx_v406_cache_products_' + source + '_' + staticToken(), JSON.stringify(payload));
      try { window.YX?.cache?.write?.('products_' + source + '_' + staticToken(), {rows:clone(rows), items:clone(rows), saved_at:Date.now(), from_yx_data_store:true}); } catch(_e) {}
      window.__YX112_ROWS__ = window.__YX112_ROWS__ || {}; window.__yx63Rows = window.__yx63Rows || {};
      window.__YX112_ROWS__[source] = clone(rows); window.__yx63Rows[source] = clone(rows);
    }catch(_e){}
  }
  async function getPayload(key, maxAgeMs){
    try{
      if(window.YXDeviceSync && typeof window.YXDeviceSync.readCachedPayload === 'function'){
        const data = await window.YXDeviceSync.readCachedPayload(key, maxAgeMs || 1000*60*60*24*14);
        if(data && typeof data === 'object') return clone(data);
      }
    }catch(_e){}
    return null;
  }
  async function getRowsMeta(source){
    source = normalizeSource(source);
    const key = PRODUCT_KEY[source] || source;
    let data = await getPayload(key, 1000*60*60*24*14);
    if(data && typeof data === 'object'){
      const rows = rowsOf(data);
      writeProductLocal(source, rows);
      return {rows, hasPayload:true, source:'indexeddb', saved_at:Date.now(), payload:data};
    }
    const local = localProductRows(source);
    if(local.hasPayload) return Object.assign({source:'localStorage'}, local);
    return {rows:[], hasPayload:false, source:'none', saved_at:0};
  }
  async function getRows(source){ return (await getRowsMeta(source)).rows || []; }
  function productRowsSync(source){ return localProductRows(source).rows || []; }
  function rowsForCustomerSync(source, customer){
    source = normalizeSource(source); customer = clean(customer);
    return productRowsSync(source).filter(r => clean(r.customer_name || r.customer || r.name || '') === customer);
  }
  function allProductRowsSync(){
    return ['orders','master_order','inventory'].flatMap(src => productRowsSync(src).map(r => Object.assign({}, r, {__source:src})));
  }
  function localCustomersFromProducts(sources){
    const map = new Map();
    (sources || ['orders','master_order']).forEach(src => {
      productRowsSync(src).forEach(r => {
        const name = clean(r.customer_name || r.customer || r.name || ''); if(!name) return;
        const text = clean(r.product_text || r.product || r.size || '');
        let qty = 1;
        try { qty = Number(window.YX30EffectiveQty ? window.YX30EffectiveQty(text, r.qty || 1) : (r.qty || 1)); } catch(_e) { qty = Number(r.qty || 1); }
        if(!Number.isFinite(qty) || qty <= 0) return;
        const old = map.get(name) || {name, customer_name:name, region:r.region || r.customer_region || '北區', relation_counts:{order_rows:0,order_qty:0,master_rows:0,master_qty:0}, item_count:0, row_count:0, total_qty:0};
        if(src === 'orders'){ old.relation_counts.order_rows += 1; old.relation_counts.order_qty += qty; }
        if(src === 'master_order'){ old.relation_counts.master_rows += 1; old.relation_counts.master_qty += qty; }
        old.item_count += 1; old.row_count += 1; old.total_qty += qty;
        map.set(name, old);
      });
    });
    return Array.from(map.values());
  }
  async function getWarehouse(){ return await getPayload('warehouse', 1000*60*60*24*14); }
  async function getWarehouseAvailable(){ return await getPayload('warehouse_available', 1000*60*60*24*14); }
  async function getToday(){ return await getPayload('today_changes', 1000*60*60*24*14); }
  function customerOfRow(r){ return clean(r && (r.customer_name || r.customer || r.name || '')); }
  function qtyOfRow(r){
    try { const n = Number(window.YX30EffectiveQty ? window.YX30EffectiveQty(r?.product_text || r?.product || '', r?.qty || 1) : (r?.qty || 1)); return Number.isFinite(n) && n > 0 ? n : 0; }
    catch(_e){ const n = Number(r?.qty || 1); return Number.isFinite(n) && n > 0 ? n : 0; }
  }
  function stableRowKey(r){
    return String(r?.id || r?.uuid || r?.row_id || r?.key || [customerOfRow(r), clean(r?.product_text || r?.product || r?.size || ''), clean(r?.material || r?.product_code || ''), clean(r?.source || r?.source_table || '')].join('|'));
  }
  function setRows(source, rows, opts){
    source = normalizeSource(source); rows = Array.isArray(rows) ? rows.filter(r => qtyOfRow(r) > 0 || source === 'inventory') : [];
    writeProductLocal(source, rows);
    try { window.YXDeviceSync?.writeCachedPayload?.(PRODUCT_KEY[source] || source, {success:true, items:clone(rows), rows:clone(rows), sync_authority:true, from_yx_data_store:true, reason:opts?.reason || 'setRows', saved_at:Date.now()}); } catch(_e) {}
    try { window.dispatchEvent(new CustomEvent('yx:data-store-updated', {detail:{source, rows:clone(rows), reason:opts?.reason || 'setRows'}})); } catch(_e) {}
    return rows;
  }
  function upsertRows(source, incoming, opts){
    source = normalizeSource(source); incoming = Array.isArray(incoming) ? incoming : [];
    const map = new Map(productRowsSync(source).map(r => [stableRowKey(r), r]));
    incoming.forEach(r => { if(qtyOfRow(r) > 0 || source === 'inventory') map.set(stableRowKey(r), Object.assign({}, map.get(stableRowKey(r)) || {}, r)); });
    return setRows(source, Array.from(map.values()), Object.assign({reason:'upsertRows'}, opts||{}));
  }
  function removeRows(source, idsOrRows, opts){
    source = normalizeSource(source); const remove = new Set((Array.isArray(idsOrRows)?idsOrRows:[idsOrRows]).map(x => typeof x === 'object' ? stableRowKey(x) : String(x)).filter(Boolean));
    const rows = productRowsSync(source).filter(r => !remove.has(stableRowKey(r)) && !remove.has(String(r.id || r.uuid || r.row_id || '')));
    return setRows(source, rows, Object.assign({reason:'removeRows'}, opts||{}));
  }
  function savedRegionFor(name){ try { return (JSON.parse(localStorage.getItem('yx_customer_regions_v18') || '{}') || {})[name] || ''; } catch(_e) { return ''; } }
  function buildCustomerRows(source){
    source = normalizeSource(source);
    const rows = productRowsSync(source).filter(r => qtyOfRow(r) > 0 && customerOfRow(r));
    const by = new Map();
    rows.forEach(r => {
      const name = customerOfRow(r);
      const old = by.get(name) || {name, customer_name:name, region:r.region || r.customer_region || savedRegionFor(name) || '北區', relation_counts:{order_rows:0,order_qty:0,master_rows:0,master_qty:0,inventory_rows:0,inventory_qty:0}, item_count:0,row_count:0,total_qty:0,merge_names:[name], from_rows_store:true};
      const q = qtyOfRow(r);
      if(source === 'orders'){ old.relation_counts.order_rows += 1; old.relation_counts.order_qty += q; }
      else if(source === 'master_order'){ old.relation_counts.master_rows += 1; old.relation_counts.master_qty += q; }
      else { old.relation_counts.inventory_rows = Number(old.relation_counts.inventory_rows||0)+1; old.relation_counts.inventory_qty = Number(old.relation_counts.inventory_qty||0)+q; }
      old.item_count += 1; old.row_count += 1; old.total_qty += q; by.set(name, old);
    });
    return Array.from(by.values());
  }
  function buildCustomersFromSources(sources){
    const by = new Map();
    (sources || ['orders','master_order']).forEach(src => {
      buildCustomerRows(src).forEach(c => {
        const name = clean(c.name || c.customer_name || ''); if(!name) return;
        const old = by.get(name) || {name, customer_name:name, region:c.region || savedRegionFor(name) || '北區', relation_counts:{order_rows:0,order_qty:0,master_rows:0,master_qty:0,inventory_rows:0,inventory_qty:0}, item_count:0,row_count:0,total_qty:0,merge_names:[name], from_rows_store:true};
        const rc = c.relation_counts || {};
        ['order_rows','order_qty','master_rows','master_qty','inventory_rows','inventory_qty'].forEach(k => old.relation_counts[k] = Number(old.relation_counts[k]||0) + Number(rc[k]||0));
        old.item_count += Number(c.item_count || c.row_count || 0); old.row_count += Number(c.row_count || c.item_count || 0); old.total_qty += Number(c.total_qty || 0);
        by.set(name, old);
      });
    });
    return Array.from(by.values()).filter(c => Number(c.total_qty||0) > 0 || Number(c.row_count||c.item_count||0) > 0);
  }
  async function rowsForCustomer(source, customer){
    await getRowsMeta(source).catch(()=>null);
    return rowsForCustomerSync(source, customer);
  }
  function applyResponseRows(source, data, opts){
    source = normalizeSource(source); if(!source || !data) return false;
    // V488: warehouse/cell/slot action responses are not product-row snapshots.
    // Do not let mutation bridge/regression guard treat them as empty inventory/order/master rows.
    try{
      const keys = Object.keys(data || {});
      const isWarehouseAction = !!(data.column_cells || data.saved_cell || data.slot_identity_map || data.warehouse_stability || data.column_signature || data.column_revision || data.operation_action || data.db_readback);
      const hasProductRows = !!(data.snapshots || Array.isArray(data.changed_items) || Array.isArray(data.delta_items) || Array.isArray(data.exact_customer_items) || Array.isArray(data.saved_items) || Array.isArray(data.items) || Array.isArray(data.rows));
      if(isWarehouseAction && !hasProductRows) return false;
    }catch(_e){}
    const snaps = data.snapshots || {};
    let rows = Array.isArray(snaps[source]) ? snaps[source] : null;
    if(!rows && source === 'master_order' && Array.isArray(snaps.master_orders)) rows = snaps.master_orders;
    if(Array.isArray(rows)){ setRows(source, rows, Object.assign({reason:'applyResponseRows'}, opts||{})); return true; }
    const delta = Array.isArray(data.changed_items) ? data.changed_items : (Array.isArray(data.delta_items) ? data.delta_items : null);
    if(delta && delta.length){ upsertRows(source, delta, Object.assign({reason:'applyResponseRows-delta'}, opts||{})); return true; }
    if(Array.isArray(data.exact_customer_items) && data.exact_customer_items.length){ upsertRows(source, data.exact_customer_items, Object.assign({reason:'applyResponseRows-exact-customer'}, opts||{})); return true; }
    if(Array.isArray(data.saved_items) && data.saved_items.length){ upsertRows(source, data.saved_items, Object.assign({reason:'applyResponseRows-saved-items'}, opts||{})); return true; }
    if(Array.isArray(data.items) && !data.items_are_delta && !data.delta_items && !data.changed_items){ setRows(source, data.items, Object.assign({reason:'applyResponseRows-items'}, opts||{})); return true; }
    return false;
  }
  async function getTodayWithUnplaced(){
    let today = await getToday().catch(()=>null);
    if(!today || typeof today !== 'object') today = {success:true, summary:{}, feed:{inbound:[],new_orders:[],new_masters:[],outbound:[],others:[]}, unplaced_items:[]};
    let wz = await getWarehouseAvailable().catch(()=>null);
    if(wz && typeof wz === 'object'){
      try{ wz = filterAvailableAgainstWarehouse(wz, await getWarehouse().catch(()=>null)); }catch(_e){}
      const items = Array.isArray(wz.items) ? wz.items : (Array.isArray(wz.available) ? wz.available : []);
      const total = items.reduce((n,it)=>n+(Number(it.unplaced_qty||it.qty||1)||1),0);
      today = Object.assign({}, today, {summary:Object.assign({}, today.summary||{}), unplaced_items:items});
      today.summary.unplaced_row_count = items.length;
      today.summary.unplaced_count = Number((wz.zone_summary||{}).total || total || 0);
      today.summary.unplaced_zone_summary = wz.zone_summary || today.summary.unplaced_zone_summary || {};
      today.summary.from_data_store_unplaced = true;
    }
    return today;
  }

  function queryParam(url, name){ try { return new URL(String(url), location.origin).searchParams.get(name) || ''; } catch(_e){ return ''; } }
  function pathOf(url){ try { return new URL(String(url), location.origin).pathname || String(url); } catch(_e){ return String(url).split('?')[0] || ''; } }
  function moduleKey(){
    try{ const b=document.body?.dataset?.module; if(b) return b; }catch(_e){}
    const p=String(location.pathname||'');
    if(p.includes('/master-order')) return 'master_order'; if(p.includes('/orders')) return 'orders'; if(p.includes('/ship')) return 'ship';
    if(p.includes('/inventory')) return 'inventory'; if(p.includes('/warehouse')) return 'warehouse'; if(p.includes('/today-changes')) return 'today_changes';
    return '';
  }
  function productEndpointSource(path){
    if(/\/api\/master_orders?\b/.test(path)) return 'master_order';
    if(/\/api\/orders\b/.test(path)) return 'orders';
    if(/\/api\/inventory\b/.test(path)) return 'inventory';
    return '';
  }
  function shouldLocalFirst(url, opt){
    const method=String(opt?.method||'GET').toUpperCase(); if(method!=='GET') return false;
    // V480: old page refresh/force flags are not allowed to bypass the local authority.
    // Only the real sync pipeline or an explicit yxDbOnly/yxRawFetch call may hit DB first.
    if(opt && (opt.yxRawFetch || opt.yxDbOnly || opt.yxDeviceLocalFirst===false)) return false;
    const u=String(url||'');
    if(u.includes('yx_device_sync=1') || u.includes('sync_full=1') || u.includes('/api/login') || u.includes('/api/health')) return false;
    return true;
  }
  function rowsResponse(source, rows){ return {success:true, ok:true, items:clone(rows||[]), rows:clone(rows||[]), total:(rows||[]).length, has_more:false, from_yx_data_store:true, local_first:true, source, version:VERSION}; }
  function customerMatches(row, names){ const n=customerOfRow(row); return !!n && names.has(n); }
  function itemsForCustomerFromLocal(name, mode, url){
    name=clean(name); if(!name) return [];
    const names=new Set([name]);
    try{ const v=queryParam(url||'', 'variants'); JSON.parse(v||'[]').forEach(x=>{x=clean(x); if(x) names.add(x);}); }catch(_e){}
    const sources = mode==='ship' ? ['orders','master_order','inventory'] : [mode==='master_order'?'master_order':mode==='orders'?'orders':'orders'];
    const out=[];
    sources.forEach(src=>{
      productRowsSync(src).forEach(r=>{
        if(!customerMatches(r,names)) return;
        const text=clean(r.product_text||r.product||r.size||r.size_text||''); if(!text) return;
        const label=src==='orders'?'訂單':src==='master_order'?'總單':'庫存';
        out.push(Object.assign({}, r, {customer_name:customerOfRow(r), product_text:text, product:text, source:r.source||label, source_label:r.source_label||label, source_preference:r.source_preference||label, deduct_source:r.deduct_source||label, available_qty:r.available_qty||r.remaining_qty||r.qty||qtyOfRow(r)||1}));
      });
    });
    const seen=new Set();
    return out.filter(it=>{ const k=[it.source_preference||it.source_label||it.source||'', clean(it.customer_name), clean(it.material||it.product_code||''), clean(it.product_text)].join('|'); if(seen.has(k)) return false; seen.add(k); return true; });
  }
  async function localResponseForApi(url, opt){
    if(!shouldLocalFirst(url,opt)) return null;
    const path=pathOf(url); const mode=moduleKey();
    const src=productEndpointSource(path);
    if(src){ const meta=await getRowsMeta(src).catch(()=>null); if(meta && meta.hasPayload) return rowsResponse(src, meta.rows||[]); return null; }
    if(/\/api\/customers\b/.test(path) && !/\/api\/customers\//.test(path)){
      let items=[];
      if(mode==='orders') items=buildCustomerRows('orders');
      else if(mode==='master_order') items=buildCustomerRows('master_order');
      else if(mode==='ship') items=buildCustomersFromSources(['orders','master_order']);
      else items=buildCustomersFromSources(['orders','master_order']);
      // V488: /api/customers may fail during route switches; return a safe local fallback even when empty.
      // This prevents failed homepage/customer preloads from being reported as a functional failure.
      return {success:true, ok:true, items, customers:items, total:items.length, from_yx_data_store:true, local_first:true, source:'customers-local-fallback', version:VERSION};
    }
    if(/\/api\/customer-items\b/.test(path)){
      const name=queryParam(url,'name'); const items=itemsForCustomerFromLocal(name, mode, url);
      if(items.length || ['orders','master_order','ship'].includes(mode)) return {success:true, ok:true, items, total:items.length, from_yx_data_store:true, local_first:true, version:VERSION};
      return null;
    }
    if(/\/api\/warehouse\/available-items\b/.test(path)){
      let d=await getWarehouseAvailable().catch(()=>null); if(d){ try{ d=filterAvailableAgainstWarehouse(d, await getWarehouse().catch(()=>null)); }catch(_e){} return Object.assign({success:true, ok:true, from_yx_data_store:true, local_first:true, version:VERSION}, clone(d)); }
      return null;
    }
    if(/\/api\/today-changes\/(count|badge)\b/.test(path)){
      const d=await getTodayWithUnplaced().catch(()=>null);
      if(d){
        const summary=d.summary||{}; const feed=d.feed||{};
        const countFeed=Object.values(feed).reduce((n,v)=>n+(Array.isArray(v)?v.length:0),0);
        const itemsCount=Array.isArray(d.items)?d.items.length:0;
        const total=Number(summary.total||summary.today_total||itemsCount||countFeed||0)||0;
        const unread=Number(summary.unread||summary.unread_count||d.unread||0)||0;
        const unplaced=Number(summary.unplaced_count||summary.unplaced_total||d.unplaced_count||0)||0;
        return {success:true, ok:true, total, unread, unread_count:unread, unplaced_count:unplaced, unplaced_row_count:Number(summary.unplaced_row_count||0)||0, zone_summary:summary.unplaced_zone_summary||{}, summary:clone(summary), from_yx_data_store:true, local_first:true, version:VERSION};
      }
      return null;
    }
    if(/\/api\/today-changes\b/.test(path)){
      const d=await getTodayWithUnplaced().catch(()=>null); if(d) return Object.assign({success:true, ok:true, from_yx_data_store:true, local_first:true, version:VERSION}, clone(d));
      return null;
    }
    if(path==='/api/warehouse' || /\/api\/warehouse\b/.test(path) && !/\/api\/warehouse\/(search|source-qty-map|available-items)/.test(path)){
      const d=await getWarehouse().catch(()=>null); if(d && (Array.isArray(d.cells)||d.zones)) return Object.assign({success:true, ok:true, from_yx_data_store:true, local_first:true, version:VERSION}, clone(d));
      return null;
    }
    return null;
  }

  function makeJsonResponse(data){
    try{
      const body = JSON.stringify(data == null ? {} : data);
      if(typeof Response === 'function'){
        return new Response(body, {status:200, statusText:'OK', headers:{'Content-Type':'application/json; charset=utf-8','X-YX-DataStore':VERSION,'X-YX-Local-First':'1'}});
      }
    }catch(_e){}
    return null;
  }

  function isMutatingApi(url, opt){
    try{
      const u = new URL(String(url || ''), location.origin);
      const m = String((opt && opt.method) || 'GET').toUpperCase();
      return u.origin === location.origin && /^\/api\//.test(u.pathname) && m !== 'GET' && m !== 'HEAD';
    }catch(_e){ return false; }
  }
  async function resilientMutatingRequest(original, input, init, url, opt){
    try{
      return await original(input, init);
    }catch(err){
      try{
        if(isMutatingApi(url, opt) && window.YXBackgroundSave && typeof window.YXBackgroundSave.enqueue === 'function'){
          const queued = window.YXBackgroundSave.enqueue(url, (function(){try{return JSON.parse(opt.body||'{}');}catch(_e){return opt.body||{};}})(), {method:opt.method || 'POST', headers:opt.headers || {'Content-Type':'application/json'}, reason:'v483-network-fallback-queue'});
          const payload = {success:false, queued:true, background_saved:true, error:'網路中斷，已加入背景儲存佇列，下次開啟會繼續送出。', queue_item_id:queued && queued.id, version:VERSION};
          const res = makeJsonResponse(payload);
          if(res) return res;
        }
      }catch(_e){}
      throw err;
    }
  }
  async function requestResponse(input, init){
    let url=''; let opt=init || {};
    try{
      url = (typeof input === 'string') ? input : (input && input.url) || '';
      if(!init && input && typeof Request !== 'undefined' && input instanceof Request){
        opt = {method:input.method || 'GET', headers:input.headers, body:input.body};
      }
    }catch(_e){ url = String(input || ''); opt = init || {}; }
    try{
      const u = new URL(String(url || ''), location.origin);
      if(u.origin === location.origin && /^\/api\//.test(u.pathname) && shouldLocalFirst(u.href, opt || {})){
        const local = await localResponseForApi(u.href, opt || {}).catch(()=>null);
        if(local){ const res = makeJsonResponse(local); if(res) return res; }
      }
    }catch(_e){}
    const original = (window.fetch && window.fetch.__yxOriginalFetch) ? window.fetch.__yxOriginalFetch.bind(window) : (window.fetch ? window.fetch.bind(window) : null);
    if(!original) throw new Error('瀏覽器不支援網路請求');
    return resilientMutatingRequest(original, input, init, url, opt || {});
  }
  async function requestJson(url, opt){
    opt = opt || {};
    const res = await requestResponse(url, Object.assign({credentials:'same-origin', cache:'no-store'}, opt));
    const txt = await res.text();
    let data = {};
    try { data = txt ? JSON.parse(txt) : {}; } catch(_e) { data = {success:false, error:txt || '伺服器回應格式錯誤'}; }
    if(!res.ok || data.success === false){
      const e = new Error(data.error || data.message || `請求失敗：${res.status}`);
      e.payload = data; e.status = res.status; throw e;
    }
    try{ const src=productEndpointSource(pathOf(url)); if(src && data) applyResponseRows(src,data,{reason:'request-json-response'}); }catch(_e){}
    return data;
  }

  function installFetchBridge(){
    try{
      if(typeof window.fetch !== 'function' || window.fetch.__yxDataSpineFetchV480) return !!(window.fetch && window.fetch.__yxDataSpineFetchV480);
      const original = window.fetch.bind(window);
      const bridged = async function(input, init){
        let url=''; let opt=init || {};
        try{
          url = (typeof input === 'string') ? input : (input && input.url) || '';
          if(!init && input && typeof Request !== 'undefined' && input instanceof Request){
            opt = {method:input.method || 'GET', headers:input.headers};
          }
        }catch(_e){ url = String(input || ''); opt = init || {}; }
        try{
          const u = new URL(String(url || ''), location.origin);
          if(u.origin === location.origin && /^\/api\//.test(u.pathname) && shouldLocalFirst(u.href, opt)){
            const local = await localResponseForApi(u.href, opt || {}).catch(()=>null);
            if(local){
              const res = makeJsonResponse(local);
              if(res) return res;
            }
          }
        }catch(_e){}
        return resilientMutatingRequest(original, input, init, url, opt || {});
      };
      bridged.__yxDataSpineFetchV480 = true;
      bridged.__yxOriginalFetch = original;
      window.fetch = bridged;
      return true;
    }catch(_e){ return false; }
  }

  function installApiBridge(){
    try{
      if(!window.YX || typeof window.YX.api !== 'function' || window.YX.api.__yxDataSpineV480) return !!(window.YX && window.YX.api && window.YX.api.__yxDataSpineV480);
      const original=window.YX.api.bind(window.YX);
      const bridged=async function(url,opt){
        const local=await localResponseForApi(url,opt||{}).catch(()=>null);
        if(local) return local;
        const data=await original(url,opt);
        try{ const src=productEndpointSource(pathOf(url)); if(src && data) applyResponseRows(src,data,{reason:'api-bridge-response'}); }catch(_e){}
        return data;
      };
      bridged.__yxDataSpineV480=true; bridged.__yxOriginalApi=original; window.YX.api=bridged; return true;
    }catch(_e){ return false; }
  }


  function warehouseProductText(row){ return clean(row?.product_text || row?.product || row?.product_size || row?.display_product_size || row?.base_product_size || row?.size || row?.size_text || row?.dimension || row?.dimensions || row?.raw_text || row?.label || row?.text || ''); }
  function warehouseSizeOnly(text){
    const left = clean(text).replace(/[×ＸX✕＊*]/g,'x').replace(/＝/g,'=').split('=')[0] || '';
    const parts = left.toLowerCase().split('x').filter(Boolean);
    if(parts.length >= 3 && parts.slice(0,3).every(x=>/^\d+$/.test(x.trim()))) return parts.slice(0,3).map(x=>String(parseInt(x,10))).join('x');
    return clean(left).toLowerCase();
  }
  function warehouseExactOnly(text){
    const raw = clean(text).replace(/[×ＸX✕＊*]/g,'x').replace(/＝/g,'=').replace(/\s+/g,'').toLowerCase();
    const size = warehouseSizeOnly(raw);
    const right = raw.includes('=') ? raw.split('=').slice(1).join('=') : '';
    return right ? `${size}=${right}` : size;
  }
  function warehouseItemKey(row, opts){
    opts = opts || {};
    const source = normalizeSource(row?.source_table || row?.source || row?.type || row?.deduct_source || '');
    const ids = [row?.source_id, row?.origin_source_id, row?.row_id, row?.id, row?.uuid, row?.key].map(clean).filter(Boolean).join('|');
    const details = Array.isArray(row?.source_details) ? row.source_details : [];
    const detailIds = details.map(d=>clean(d?.source_id || d?.origin_source_id || d?.row_id || d?.id || d?.uuid || '')).filter(Boolean).join('|');
    const idPart = ids || detailIds;
    const text = warehouseProductText(row);
    const exact = opts.baseOnly ? warehouseSizeOnly(text) : warehouseExactOnly(text);
    const customer = clean(row?.customer_name || row?.customer || row?.client || '庫存');
    const material = clean(row?.material || row?.wood_type || row?.product_code || '');
    const zone = opts.ignoreZone ? '' : clean(row?.zone || row?.warehouse_zone || row?.location || '');
    if(idPart) return ['src', source, idPart, exact, material, customer, zone].join('::');
    return ['text', source, customer, material, exact, zone].join('::');
  }
  function warehousePlacedKeySet(payload){
    const map = new Map();
    const cells = Array.isArray(payload?.cells) ? payload.cells : [];
    cells.forEach(cell=>{
      const items = Array.isArray(cell?.items) ? cell.items : [];
      items.forEach(it=>{
        const q = qtyOfRow(it) || Number(it?.qty || it?.available_qty || it?.remaining_qty || 1) || 1;
        const k = warehouseItemKey(Object.assign({}, it, {zone:it?.zone || cell.zone || it?.warehouse_zone}), {ignoreZone:false});
        if(!k) return;
        map.set(k, (map.get(k)||0) + Math.max(0, Math.floor(q)));
      });
    });
    return map;
  }
  function filterAvailableAgainstWarehouse(availablePayload, warehousePayload){
    const items = Array.isArray(availablePayload?.items) ? availablePayload.items : (Array.isArray(availablePayload?.available) ? availablePayload.available : []);
    const placed = warehousePlacedKeySet(warehousePayload || {});
    if(!items.length || !placed.size) return clone(availablePayload || {});
    const next=[];
    items.forEach(row=>{
      const q = qtyOfRow(row) || Number(row?.unplaced_qty || row?.available_qty || row?.remaining_qty || row?.qty || 0) || 0;
      const k = warehouseItemKey(row, {ignoreZone:false});
      const take = Math.min(q, Number(placed.get(k)||0));
      if(take > 0) placed.set(k, Math.max(0, Number(placed.get(k)||0)-take));
      const left = Math.max(0, q - take);
      if(left > 0){
        const out = Object.assign({}, row, {qty:left, unplaced_qty:left, available_qty:left, remaining_qty:left});
        next.push(out);
      }
    });
    const byZone = {A:[], B:[]};
    next.forEach(it=>{ const z=clean(it.zone || it.warehouse_zone || '').toUpperCase(); (z==='B'?byZone.B:byZone.A).push(it); });
    const out = Object.assign({}, clone(availablePayload || {}), {items:next, available:next, availableByZone:byZone, zone_summary:{A:byZone.A.reduce((n,it)=>n+qtyOfRow(it),0), B:byZone.B.reduce((n,it)=>n+qtyOfRow(it),0), total:next.reduce((n,it)=>n+qtyOfRow(it),0)}});
    return out;
  }


  function installLegacyRefreshCleanup(){
    // V480: final cleanout for old forced refresh / patch glue. It does not create a renderer or timer/observer.
    try{
      if(window.__YX_V480_REFRESH_CLEANUP__) return;
      window.__YX_V480_REFRESH_CLEANUP__=true;
      const stripForce = detail => {
        try{
          if(detail && typeof detail==='object'){
            if(detail.force === true) detail.force = false;
            if(detail.yx_device_network === true) detail.yx_device_network = false;
            if(detail.yx_force_network === true) detail.yx_force_network = false;
            detail.local_first = true;
            detail.v480_refresh_cleanup = true;
          }
        }catch(_e){}
        return detail;
      };
      const NativeCustomEvent = window.CustomEvent;
      if(typeof NativeCustomEvent === 'function' && !NativeCustomEvent.__yxV480Patched){
        const PatchedCustomEvent = function(type, params){
          try{
            if(/^yx:/.test(String(type||'')) && params && params.detail && !params.detail.yxDbOnly) stripForce(params.detail);
          }catch(_e){}
          return new NativeCustomEvent(type, params);
        };
        PatchedCustomEvent.prototype = NativeCustomEvent.prototype;
        PatchedCustomEvent.__yxV480Patched = true;
        window.CustomEvent = PatchedCustomEvent;
      }
    }catch(_e){}
  }
  function installMinimalUiGlue(){
    try{
      if(window.__YX_V480_MINIMAL_UI_GLUE__) return;
      window.__YX_V480_MINIMAL_UI_GLUE__=true;
      const $=id=>document.getElementById(id);
      const mod=()=>document.body?.dataset?.module||'';
      const removeUndo=()=>{try{document.querySelectorAll('#yx-global-page-undo-btn,#yx-page-undo-btn,.yx-page-undo-btn').forEach(el=>{try{el.remove();}catch(_e){el.style.display='none';}});}catch(_e){}};
      const showShipPreview=()=>{try{if(mod()!=='ship')return; const panel=$('ship-preview-panel')||$('module-result'); if(panel){panel.classList.remove('hidden'); panel.style.display=''; if(!panel.innerHTML.trim()) panel.innerHTML='<div class="empty-state-card compact-empty">出貨預覽建立中…</div>';}}catch(_e){}};
      const forceCustomerVisible=()=>{try{const m=mod(); if(m!=='orders'&&m!=='master_order')return; const name=clean($('customer-name')?.value||window.__YX_SELECTED_CUSTOMER__||''); if(!name)return; window.__YX_SELECTED_CUSTOMER__=name; window.YX113CustomerRegions?.renderFromCurrentRows?.(); window.YX113CustomerRegions?.selectCustomer?.(name);}catch(_e){}};
      const closeMenus=ev=>{try{const menu=$('yx113-customer-actions'); if(!menu||menu.classList.contains('hidden'))return; if(ev&&ev.target?.closest?.('#yx113-customer-actions,[data-yx113-customer-act]'))return; menu.classList.add('hidden'); menu.style.display='none';}catch(_e){}};
      document.addEventListener('click',ev=>{try{ if(ev.target?.closest?.('#submit-btn')){ forceCustomerVisible(); showShipPreview(); } else closeMenus(ev); }catch(_e){}},true);
      document.addEventListener('keydown',ev=>{try{if(ev.key==='Escape')closeMenus(ev);}catch(_e){}},true);
      removeUndo();
      window.addEventListener('pageshow',removeUndo,false);
      window.addEventListener('yx:product-batch-write-success',forceCustomerVisible,false);
    }catch(_e){}
  }

  window.YXDataStore = {version:VERSION, getPayload, getRowsMeta, getRows, productRowsSync, rowsForCustomerSync, rowsForCustomer, allProductRowsSync, writeProductLocal, setRows, upsertRows, removeRows, stableRowKey, applyResponseRows, buildCustomerRows, buildCustomersFromSources, localCustomersFromProducts, getWarehouse, getWarehouseAvailable, getToday, getTodayWithUnplaced, localResponseForApi, requestResponse, requestJson, installApiBridge, installFetchBridge, warehouseItemKey, filterAvailableAgainstWarehouse, hasUsefulRows};
  installLegacyRefreshCleanup();
  installApiBridge();
  installFetchBridge();
  installMinimalUiGlue();
  try{ document.addEventListener('DOMContentLoaded', function(){ installLegacyRefreshCleanup(); installApiBridge(); installFetchBridge(); installMinimalUiGlue(); }, {once:true}); }catch(_e){}
})();
