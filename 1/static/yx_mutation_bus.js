/* V483 predeploy mutation bus audit: write-path consistency for inventory/orders/master/shipping/warehouse/today. No renderer, no interval, no observer, no cache-core change. */
(function(){
  'use strict';
  if(window.YXMutationBus && window.YXMutationBus.version === 'v514-postdeploy-evidence-collector-pack24') return;
  const VERSION='v514-postdeploy-evidence-collector-pack24';
  const clean=v=>String(v==null?'':v).replace(/[\u3000\s]+/g,' ').trim();
  const clone=v=>{try{return JSON.parse(JSON.stringify(v));}catch(_e){return v;}};
  const normSource=s=>{s=clean(s); if(['master','master_orders','總單'].includes(s))return'master_order'; if(['order','訂單'].includes(s))return'orders'; if(['庫存'].includes(s))return'inventory'; if(['ship','shipping','出貨'].includes(s))return'ship'; return s;};
  const productSources=['orders','master_order','inventory'];
  function pathOf(url){try{return new URL(String(url), location.origin).pathname||String(url);}catch(_e){return String(url||'').split('?')[0]||'';}}
  function parseBody(opt){try{const b=opt&&opt.body; if(!b)return{}; if(typeof b==='string')return JSON.parse(b||'{}')||{}; if(b instanceof FormData)return{}; if(typeof b==='object')return clone(b)||{};}catch(_e){} return{};}
  function rows(src){try{return window.YXDataStore?.productRowsSync?.(src)||[];}catch(_e){return[];}}
  function setRows(src, arr, reason){try{return window.YXDataStore?.setRows?.(src, Array.isArray(arr)?arr:[], {reason:reason||VERSION});}catch(_e){return arr||[];}}
  function applyRespRows(data, reason){
    if(!data||typeof data!=='object')return false;
    // V488: warehouse structure/cell responses are not product snapshots; never apply them to inventory/orders/master_order.
    try{
      const isWarehouseAction = !!(data.column_cells || data.saved_cell || data.slot_identity_map || data.warehouse_stability || data.column_signature || data.column_revision || data.operation_action || data.db_readback);
      const hasProductSnapshot = !!(data.snapshots || Array.isArray(data.changed_items) || Array.isArray(data.delta_items) || Array.isArray(data.exact_customer_items) || Array.isArray(data.saved_items) || Array.isArray(data.items) || Array.isArray(data.rows));
      if(isWarehouseAction && !hasProductSnapshot) return false;
    }catch(_e){}
    let ok=false;
    try{ productSources.forEach(src=>{ if(window.YXDataStore?.applyResponseRows?.(src,data,{reason:reason||VERSION})) ok=true; }); }catch(_e){}
    try{
      const snaps=data.snapshots||{};
      if(Array.isArray(snaps.master_orders) && !Array.isArray(snaps.master_order)){ window.YXDataStore?.setRows?.('master_order', snaps.master_orders, {reason:reason||VERSION}); ok=true; }
    }catch(_e){}
    return ok;
  }
  function customerOf(r){return clean(r&& (r.customer_name||r.customer||r.name||r.client_name||''));}
  function materialOf(r){return clean(r&&(r.material||r.product_code||''));}
  function productOf(r){return clean(r&&(r.product_text||r.product||r.size||r.size_text||r.name||''));}
  function idOf(r){return clean(r&&(r.id||r.item_id||r.row_id||r.product_id||r.uuid||r.original_id||''));}
  function qtyOf(r){
    const text=productOf(r);
    try{const n=Number(window.YX30EffectiveQty?window.YX30EffectiveQty(text,r?.qty||r?.count||1):(r?.qty||r?.count||1)); return Number.isFinite(n)&&n>0?n:1;}catch(_e){const n=Number(r?.qty||r?.count||1);return Number.isFinite(n)&&n>0?n:1;}
  }
  function productBase(t){t=productOf({product_text:t}); return clean((t.split('=')[0]||t)).toLowerCase().replace(/\s+/g,'');}
  function rowMatchesItem(r,it,cust){
    const rid=idOf(r), iid=idOf(it);
    if(rid && iid && rid===iid) return true;
    const rc=customerOf(r), ic=customerOf(it)||clean(cust||'');
    if(ic && rc && rc!==ic) return false;
    const rm=materialOf(r).toUpperCase(), im=materialOf(it).toUpperCase();
    if(im && rm && rm!==im) return false;
    const rb=productBase(productOf(r)), ib=productBase(productOf(it));
    return !!(rb && ib && rb===ib);
  }
  function sourceFromLabel(v){v=clean(v); if(v.includes('總單'))return'master_order'; if(v.includes('訂單'))return'orders'; if(v.includes('庫存'))return'inventory'; return normSource(v);}
  function reduceSourceRows(src, shipItems, customer, reason){
    src=normSource(src); if(!productSources.includes(src))return false;
    let arr=rows(src).slice(); if(!arr.length)return false;
    let changed=false;
    (Array.isArray(shipItems)?shipItems:[]).forEach(it=>{
      const need=qtyOf(it); let remaining=need;
      arr=arr.map(r=>{
        if(remaining<=0 || !rowMatchesItem(r,it,customer)) return r;
        const before=qtyOf(r);
        const take=Math.min(before,remaining); remaining-=take; changed=true;
        const after=Math.max(0,before-take);
        if(after<=0) return Object.assign({}, r, {__yx_remove_after_ship:true, qty:0});
        return Object.assign({}, r, {qty:after, available_qty:after, remaining_qty:after});
      }).filter(r=>!r.__yx_remove_after_ship);
    });
    if(changed) setRows(src, arr, reason||'ship-local-reduce');
    return changed;
  }
  function reduceAfterShip(body, data){
    const shipItems=Array.isArray(body?.items)?body.items:(Array.isArray(data?.items)?data.items:[]);
    const customer=clean(body?.customer_name||data?.customer_name||'');
    if(!shipItems.length)return false;
    let changed=false;
    shipItems.forEach(it=>{
      const src=sourceFromLabel(it.source_preference||it.deduct_source||it.source_label||it.source||'');
      if(productSources.includes(src)) changed=reduceSourceRows(src,[it],customer,'ship-confirm-local-reduce')||changed;
      else productSources.forEach(s=>{ changed=reduceSourceRows(s,[it],customer,'ship-confirm-local-reduce-auto')||changed; });
    });
    return changed;
  }
  function optimisticInsert(path, body){
    let src=''; if(/\/api\/orders\b/.test(path))src='orders'; else if(/\/api\/master_orders?\b/.test(path))src='master_order'; else if(/\/api\/inventory\b/.test(path))src='inventory';
    if(!src)return false;
    const customer=clean(body.customer_name||'');
    const items=Array.isArray(body.items)?body.items:[];
    if(!items.length)return false;
    const now=Date.now();
    const incoming=items.map((it,i)=>Object.assign({},it,{id:it.id||it.item_id||`local-${src}-${now}-${i}`, customer_name:it.customer_name||customer, product_text:it.product_text||it.product||'', material:it.material||it.product_code||'', product_code:it.product_code||it.material||'', qty:Number(it.qty||it.count||1)||1, zone:it.zone||body.zone||body.location||'', location:it.location||body.location||body.zone||'', __local_mutation:true})).filter(r=>productOf(r));
    if(!incoming.length)return false;
    try{window.YXDataStore?.upsertRows?.(src,incoming,{reason:'write-optimistic-insert'});return true;}catch(_e){return false;}
  }
  function applyDelete(path, body){
    let src='', id='';
    let m=path.match(/\/api\/inventory\/([^/]+)/); if(m){src='inventory'; id=decodeURIComponent(m[1]);}
    m=path.match(/\/api\/orders\/([^/]+)/); if(m){src='orders'; id=decodeURIComponent(m[1]);}
    m=path.match(/\/api\/master_orders?\/([^/]+)/); if(m){src='master_order'; id=decodeURIComponent(m[1]);}
    if(src && id){try{window.YXDataStore?.removeRows?.(src,[id],{reason:'delete-confirm-local'});return true;}catch(_e){}}
    if(Array.isArray(body?.items)){
      const by={inventory:[],orders:[],master_order:[]};
      body.items.forEach(it=>{const s=normSource(it.source||it.source_table||''); if(by[s])by[s].push(it);});
      Object.keys(by).forEach(s=>{if(by[s].length)try{window.YXDataStore?.removeRows?.(s,by[s],{reason:'bulk-delete-confirm-local'});}catch(_e){}});
    }
    return false;
  }
  function appendTodayLocal(kind, detail){
    try{
      const key='today_changes';
      window.YXDeviceSync?.readCachedPayload?.(key,1000*60*60*24*14).then(old=>{
        old=old&&typeof old==='object'?old:{success:true,summary:{},feed:{},items:[]};
        const item={at:new Date().toISOString(), kind:kind||'change', title:detail?.title||detail?.reason||kind||'資料異動', customer_name:detail?.customer_name||'', product_label:detail?.product_label||'', from_mutation_bus:true};
        const feed=Object.assign({},old.feed||{}); const bucket=kind==='ship'?'outbound':kind==='warehouse'?'warehouse':'others';
        feed[bucket]=Array.isArray(feed[bucket])?feed[bucket].slice():[]; feed[bucket].unshift(item);
        old.feed=feed; old.items=Array.isArray(old.items)?old.items.slice():[]; old.items.unshift(item); old.summary=Object.assign({},old.summary||{}, {last_local_change_at:item.at, from_mutation_bus:true});
        window.YXDeviceSync?.writeCachedPayload?.(key, old);
        try{window.dispatchEvent(new CustomEvent('yx:today-changes-refresh',{detail:{reason:'mutation-bus-local-today', local_first:true}}));}catch(_e){}
      }).catch(()=>{});
    }catch(_e){}
  }
  function applyMutation(url, method, body, data){
    const path=pathOf(url); method=String(method||'GET').toUpperCase(); if(method==='GET')return false;
    let changed=false;
    if(data&&typeof data==='object') changed=applyRespRows(data,'mutation-response-snapshot')||changed;
    if(method==='DELETE') changed=applyDelete(path,body)||changed;
    if(method==='POST' && (/\/api\/(orders|master_orders?|inventory)\b/.test(path))) changed=optimisticInsert(path,body)||changed;
    if(method==='POST' && /\/api\/ship\b/.test(path)) changed=reduceAfterShip(body,data||{})||changed;
    if(method==='POST' && /\/api\/customer-items\/batch-update\b/.test(path) && Array.isArray(body?.items)){
      const grouped={}; body.items.forEach(it=>{const s=normSource(it.source||it.source_table||''); if(productSources.includes(s))(grouped[s]||(grouped[s]=[])).push(it);});
      Object.keys(grouped).forEach(s=>{ try{ window.YXDataStore?.upsertRows?.(s, grouped[s], {reason:'batch-update-local-upsert'}); changed=true; }catch(_e){} });
    }
    if(method==='POST' && /\/api\/customer-items\/batch-material\b/.test(path) && Array.isArray(body?.items)){
      const mat=clean(body.material||'').toUpperCase(); const grouped={}; body.items.forEach(it=>{const s=normSource(it.source||''); if(productSources.includes(s))(grouped[s]||(grouped[s]=[])).push(String(it.id||''));});
      Object.keys(grouped).forEach(s=>{ const ids=new Set(grouped[s]); const arr=rows(s).map(r=>ids.has(String(idOf(r)))?Object.assign({},r,{material:mat,product_code:mat}):r); setRows(s,arr,'batch-material-local'); changed=true; });
    }
    if(changed){
      try{window.dispatchEvent(new CustomEvent('yx:local-mutation-applied',{detail:{url:path,method,reason:'mutation-bus',version:VERSION,customer_name:body?.customer_name||data?.customer_name||''}}));}catch(_e){}
      appendTodayLocal(/\/api\/ship\b/.test(path)?'ship':/warehouse/.test(path)?'warehouse':'product',{reason:'mutation-bus',customer_name:body?.customer_name||data?.customer_name||''});
    }
    return changed;
  }
  function installApi(){
    try{
      if(!window.YX||typeof window.YX.api!=='function'||window.YX.api.__yxMutationBusV480)return;
      const original=window.YX.api.bind(window.YX);
      const wrapped=async function(url,opt){
        const method=String(opt?.method||'GET').toUpperCase(); const body=parseBody(opt||{});
        const data=await original(url,opt);
        try{applyMutation(url,method,body,data);}catch(_e){}
        return data;
      };
      wrapped.__yxMutationBusV480=true; wrapped.__yxOriginalApi=original; window.YX.api=wrapped;
    }catch(_e){}
  }
  function installFetch(){
    try{
      if(typeof window.fetch!=='function'||window.fetch.__yxMutationBusV480)return;
      const original=window.fetch.bind(window);
      const wrapped=async function(input,init){
        const url=(typeof input==='string')?input:(input&&input.url)||''; const method=String((init&&init.method)||(input&&input.method)||'GET').toUpperCase(); const body=parseBody(init||{});
        const res=await original(input,init);
        try{
          const u=new URL(String(url||''),location.origin);
          if(u.origin===location.origin && /^\/api\//.test(u.pathname) && method!=='GET'){
            res.clone().json().then(data=>{try{applyMutation(u.href,method,body,data);}catch(_e){}}).catch(()=>{});
          }
        }catch(_e){}
        return res;
      };
      wrapped.__yxMutationBusV480=true; wrapped.__yxOriginalFetch=original; window.fetch=wrapped;
    }catch(_e){}
  }
  function onShip(ev){try{const d=ev.detail||{}; if(!applyRespRows(d.result||d,'ship-event-snapshot')) reduceAfterShip({customer_name:d.customer_name,items:d.items||[]},d.result||d); appendTodayLocal('ship',d);}catch(_e){}}
  function onProduct(ev){try{const d=ev.detail||{}; applyRespRows(d.result||d.response||d,'product-event-snapshot');}catch(_e){}}
  function onWarehouse(ev){try{appendTodayLocal('warehouse',ev.detail||{});}catch(_e){}}
  ['yx:ship-completed'].forEach(n=>window.addEventListener(n,onShip,false));
  ['yx:product-batch-write-success','yx:product-data-changed','yx:order-master-changed'].forEach(n=>window.addEventListener(n,onProduct,false));
  ['yx:warehouse-changed'].forEach(n=>window.addEventListener(n,onWarehouse,false));
  window.YXMutationBus={version:VERSION, applyMutation, reduceAfterShip, applyRespRows, installApi, installFetch};
  installApi(); installFetch();
  try{document.addEventListener('DOMContentLoaded',()=>{installApi();installFetch();},{once:true});}catch(_e){}
})();

/* V515 static token: v515-diagnostic-100-home-logout-removal-pack25 yx_warehouse_cache_v515-diagnostic-100-home-logout-removal-pack25 yx_warehouse_available_cache_v515-diagnostic-100-home-logout-removal-pack25 */
