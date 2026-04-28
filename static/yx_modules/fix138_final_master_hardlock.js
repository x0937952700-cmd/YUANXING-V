/* FIX138 最終母版：舊版隔離、倉庫A/B未入倉篩選、出貨修復、按鈕文字修復 */
(function(){
  'use strict';
  const V='fix144-modular-master-hardlock';
  const YX=window.YXHardLock;
  const $=id=>document.getElementById(id);
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const esc=v=>String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  function moduleKey(){
    try{ if(YX&&YX.moduleKey) return YX.moduleKey(); }catch(_e){}
    const p=location.pathname;
    if(p.includes('master-order')) return 'master_order';
    if(p.includes('orders')) return 'orders';
    if(p.includes('inventory')) return 'inventory';
    if(p.includes('ship')) return 'ship';
    if(p.includes('warehouse')) return 'warehouse';
    if(p.includes('customers')) return 'customers';
    return '';
  }
  async function api(url, opts={}){
    const res=await fetch(url,{credentials:'same-origin',headers:{'Content-Type':'application/json',...(opts.headers||{})},...opts});
    const data=await res.json().catch(()=>({success:false,message:'回應格式錯誤'}));
    if(!res.ok||data.success===false) throw new Error(data.message||data.error||'操作失敗');
    return data;
  }
  function qtyOf(text, fallback=0){
    if(typeof window.YX126Qty==='function') return Number(window.YX126Qty(text,fallback)||0);
    const raw=String(text||'').replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'=');
    const right=raw.includes('=')?raw.split('=').slice(1).join('='):raw;
    const parts=right.split('+').map(x=>x.trim()).filter(Boolean);
    if(!parts.length) return raw?1:(Number(fallback)||0);
    let total=0, hit=false;
    for(const seg of parts){ const m=seg.match(/x\s*(\d+)$/i); if(m){total+=Number(m[1]||0); hit=true;} else if(/\d/.test(seg)){total+=1; hit=true;} }
    return hit?total:(raw?1:(Number(fallback)||0));
  }
  function splitProduct(text){ const raw=clean(text).replace(/[Ｘ×✕＊*X]/g,'x').replace(/[＝]/g,'='); const i=raw.indexOf('='); return {size:i>=0?raw.slice(0,i):raw, support:i>=0?raw.slice(i+1):''}; }
  function materialOf(it){ const p=clean(it.product_text||''); const m=clean(it.material||it.product_code||''); if(!m||m===p||m.includes('=')||/^\d+(?:x|×)/i.test(m)) return '未填材質'; return m; }
  function sourceLabel(it){ const s=clean(it.source_label||it.source||it.type||''); if(/master/i.test(s)||s==='master_orders'||s==='總單') return '總單'; if(/order/i.test(s)||s==='orders'||s==='訂單') return '訂單'; if(/inventory/i.test(s)||s==='庫存') return '庫存'; return s||'商品'; }
  function customerName(){ return clean($('customer-name')?.value||window.__YX_SELECTED_CUSTOMER__||''); }
  function toast(msg,type='ok'){ try{ if(YX&&YX.toast) return YX.toast(msg,type); }catch(_e){} alert(msg); }

  function forceButtonText(){
    document.querySelectorAll('button,.ghost-btn,.primary-btn,.tiny-btn,.small-btn,.chip,.menu-btn,.home-mini-btn,.back-btn').forEach(btn=>{
      btn.style.opacity='1'; btn.style.visibility='visible';
      if(btn.matches('.danger-btn,[data-yx113-batch-delete],[data-yx131-row-action="delete"],[data-yx113-action="delete"]')) btn.style.color='#dc2626';
      else btn.style.color='#0f172a';
      btn.querySelectorAll('*').forEach(ch=>{ ch.style.opacity='1'; ch.style.visibility='visible'; });
    });
  }
  function clearMasterRowButtons(){
    document.querySelectorAll('#yx113-master_order-summary .yx131-action-cell').forEach(td=>{ td.innerHTML=''; td.setAttribute('aria-hidden','true'); });
  }
  function cleanWarehouseLegacy(){
    if(moduleKey()!=='warehouse') return;
    document.querySelectorAll('#warehouse-detail-panel,#yx71-warehouse-cell-menu,#yx91-warehouse-batch-panel,#yx97-warehouse-batch-panel,#yx99-warehouse-batch-panel,#yx102-warehouse-batch-panel,#yx103-warehouse-batch-panel,#yx105-warehouse-batch-panel').forEach(el=>{
      if(el.id==='warehouse-detail-panel'){ el.innerHTML=''; el.classList.add('hidden'); el.style.display='none'; }
      else el.remove();
    });
  }
  function activeWarehouseZone(){
    const z=clean(window.state?.warehouse?.activeZone||localStorage.getItem('warehouseActiveZone')||'A').toUpperCase();
    return ['A','B','ALL'].includes(z)?z:'A';
  }
  function installFetchZoneFilter(){
    if(window.__YX138_FETCH_ZONE_FILTER__) return;
    window.__YX138_FETCH_ZONE_FILTER__=true;
    const nativeFetch=window.fetch.bind(window);
    window.fetch=function(input, init){
      try{
        let url = typeof input==='string' ? input : input.url;
        if(url && url.includes('/api/warehouse/available-items') && !url.includes('zone=')){
          const z=activeWarehouseZone();
          if(z==='A'||z==='B'){
            const u=new URL(url, location.origin);
            u.searchParams.set('zone',z);
            input = typeof input==='string' ? u.pathname+u.search : new Request(u.toString(), input);
          }
        }
      }catch(_e){}
      return nativeFetch(input,init);
    };
  }
  function lockWarehouseGlobals(){
    if(moduleKey()!=='warehouse') return;
    const wh=window.YX121Warehouse||window.YX116Warehouse;
    if(wh&&typeof wh.render==='function'){
      const render=wh.render;
      ['renderWarehouse','renderWarehouse108','renderWarehouseZones','loadWarehouseDynamic','renderWarehouse82','renderWarehouse95','renderWarehouse96','renderWarehouse102'].forEach(name=>{
        try{ window[name]=function(){ cleanWarehouseLegacy(); return render(true); }; }catch(_e){}
      });
    }
    const oldSet=window.setWarehouseZone;
    if(typeof oldSet==='function'&&!oldSet.__yx138Wrapped){
      const wrapped=function(zone,...args){ const ret=oldSet.call(this,zone,...args); setTimeout(()=>{ try{ (window.YX121Warehouse||window.YX116Warehouse)?.render?.(true); }catch(_e){} },60); return ret; };
      wrapped.__yx138Wrapped=true; window.setWarehouseZone=wrapped;
    }
  }
  function enableWarehouseDragFallback(){
    if(moduleKey()!=='warehouse'||window.__YX138_WAREHOUSE_DRAG__) return;
    window.__YX138_WAREHOUSE_DRAG__=true;
    let drag=null;
    function slotFrom(e){ return e.target?.closest?.('.yx116-slot[data-zone][data-column][data-slot],.yx108-slot[data-zone][data-column][data-slot]'); }
    document.addEventListener('pointerdown',e=>{
      const s=slotFrom(e); if(!s||e.target.closest('button,input,select,textarea,a')) return;
      const filled=s.classList.contains('filled')||s.querySelector('.yx108-slot-customers');
      if(!filled) return;
      drag={slot:s,x:e.clientX,y:e.clientY,active:false};
    },true);
    document.addEventListener('pointermove',e=>{
      if(!drag) return;
      if(Math.abs(e.clientX-drag.x)+Math.abs(e.clientY-drag.y)>14) drag.active=true;
      if(drag.active){ drag.slot.classList.add('yx138-warehouse-dragging'); document.querySelectorAll('.yx138-warehouse-drop').forEach(x=>x.classList.remove('yx138-warehouse-drop')); const t=slotFrom(e); if(t&&t!==drag.slot) t.classList.add('yx138-warehouse-drop'); e.preventDefault(); }
    },true);
    document.addEventListener('pointerup',async e=>{
      if(!drag) return;
      const d=drag; drag=null; d.slot.classList.remove('yx138-warehouse-dragging'); document.querySelectorAll('.yx138-warehouse-drop').forEach(x=>x.classList.remove('yx138-warehouse-drop'));
      const to=slotFrom(e); if(!d.active||!to||to===d.slot) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation?.();
      const from=[d.slot.dataset.zone,Number(d.slot.dataset.column),'direct',Number(d.slot.dataset.slot)];
      const target=[to.dataset.zone,Number(to.dataset.column),'direct',Number(to.dataset.slot)];
      const product=clean(d.slot.querySelector('.yx108-slot-row2 .yx108-slot-sum')?.textContent||d.slot.dataset.productText||'');
      const customer=clean(d.slot.querySelector('.yx108-slot-customers')?.textContent||'');
      try{
        // 優先使用既有新版拖拉資料；若抓不到商品文字，打開原格位讓使用者選明細，避免錯移。
        if(!product){ toast('請先點開格位確認商品後再拖拉', 'warn'); return; }
        await api('/api/warehouse/move',{method:'POST',body:JSON.stringify({from_key:from,to_key:target,product_text:product,qty:1,customer_name:customer,placement_label:'前排'})});
        toast('已移到前排','ok');
        await (window.YX121Warehouse||window.YX116Warehouse)?.render?.(true);
      }catch(err){ toast(err.message||'拖拉移動失敗','error'); }
    },true);
  }

  async function fallbackCustomerItems(name){
    const out=[];
    const wanted=clean(name).replace(/\s+/g,'').toLowerCase();
    const same=n=>clean(n).replace(/\s+/g,'').toLowerCase()===wanted;
    const pulls=[['/api/master_orders','總單'],['/api/orders','訂單'],['/api/inventory','庫存']];
    for(const [url,label] of pulls){
      try{
        const d=await api(url+'?yx138=1&ts='+Date.now());
        const rows=Array.isArray(d.items)?d.items:(Array.isArray(d.rows)?d.rows:[]);
        rows.forEach(r=>{ if(label==='庫存'||same(r.customer_name||'')) out.push({...r,source:label}); });
      }catch(_e){}
    }
    return out.filter(it=>labelForShipItem(it,name));
  }
  function labelForShipItem(it,name){
    if(sourceLabel(it)==='庫存') return true;
    const n=clean(it.customer_name||'').replace(/\s+/g,'').toLowerCase();
    const w=clean(name).replace(/\s+/g,'').toLowerCase();
    return !w||n===w;
  }
  function renderShipList(items,name){
    const picker=$('ship-customer-picker'); if(!picker) return;
    let list=$('ship-customer-item-list');
    if(!list){ list=document.createElement('div'); list.id='ship-customer-item-list'; list.className='ship-customer-item-list yx128-ship-full-list'; picker.appendChild(list); }
    const sel=$('ship-customer-item-select'); if(sel){ sel.innerHTML='<option value="">已改完整清單顯示</option>'+items.map((it,i)=>`<option value="${i}">${esc(sourceLabel(it))}｜${esc(materialOf(it))}｜${esc(it.product_text||'')}｜${qtyOf(it.product_text,it.qty)}件</option>`).join(''); }
    window.__YX_SHIP_CUSTOMER_ITEMS__=items;
    if(!name){ list.innerHTML='<div class="empty-state-card compact-empty">請先點選或輸入客戶名稱</div>'; return; }
    if(!items.length){ list.innerHTML='<div class="empty-state-card compact-empty">此客戶目前沒有可出貨商品</div>'; return; }
    list.innerHTML=`<div class="yx128-ship-list-head"><strong>${esc(name)} 全部商品</strong><span>${items.reduce((s,it)=>s+qtyOf(it.product_text,it.qty),0)}件 / ${items.length}筆</span></div>`+items.map((it,i)=>{ const p=splitProduct(it.product_text||''); return `<button type="button" class="yx128-ship-item" data-yx138-ship-index="${i}"><span class="yx128-ship-src">${esc(sourceLabel(it))}</span><strong>${esc(materialOf(it))}</strong><span class="yx128-ship-size">${esc(p.size||it.product_text||'')}</span><span class="yx128-ship-support">${esc(p.support||qtyOf(it.product_text,it.qty))}</span><span class="yx128-ship-qty">${qtyOf(it.product_text,it.qty)}件</span><em>加入</em></button>`; }).join('');
  }
  async function loadShipItems(name){
    name=clean(name||customerName());
    if(!name){ renderShipList([], ''); return []; }
    let items=[];
    try{ const d=await api('/api/customer-items?name='+encodeURIComponent(name)+'&yx138_ship=1&ts='+Date.now()); items=Array.isArray(d.items)?d.items:[]; }catch(_e){}
    if(!items.length) items=await fallbackCustomerItems(name);
    renderShipList(items,name);
    return items;
  }
  function appendShipText(items){
    const box=$('ocr-text'); if(!box) return;
    const lines=items.map(it=>clean(it.product_text||it.product_size||it.size||'')).filter(Boolean);
    if(!lines.length) return;
    box.value=clean(box.value)?box.value.trim()+'\n'+lines.join('\n'):lines.join('\n');
    box.dispatchEvent(new Event('input',{bubbles:true}));
  }
  async function buildShipCustomerQuick(){
    if(moduleKey()!=='ship'||$('yx138-ship-customer-quick')) return;
    const picker=$('ship-customer-picker')||$('customer-name')?.parentElement; if(!picker) return;
    const box=document.createElement('div'); box.id='yx138-ship-customer-quick'; box.className='yx138-ship-customer-quick'; box.innerHTML='<div class="yx138-ship-customer-quick-title">客戶快速選擇載入中…</div>';
    picker.insertAdjacentElement('afterbegin',box);
    try{
      const d=await api('/api/customers?yx138_ship=1&ts='+Date.now());
      const rows=(Array.isArray(d.items)?d.items:[]).filter(c=>c&&c.name);
      box.innerHTML='<div class="yx138-ship-customer-quick-title">客戶快速選擇</div><div class="yx138-ship-customer-quick-list">'+rows.slice(0,80).map(c=>`<button type="button" class="ghost-btn tiny-btn" data-yx138-ship-customer="${esc(c.name)}">${esc(c.name)}</button>`).join('')+'</div>';
    }catch(e){ box.innerHTML='<div class="empty-state-card compact-empty">客戶載入失敗，可直接輸入客戶名</div>'; }
  }
  function parseShipLines(){
    return String($('ocr-text')?.value||'').split(/[\n;；]+/).map(x=>clean(x)).filter(Boolean).map(line=>({product_text:line, qty:qtyOf(line,1)}));
  }
  function showShipPreview(preview,payload){
    const panel=$('ship-preview-panel')||$('module-result'); if(!panel) return;
    const rows=Array.isArray(preview.items)?preview.items:[];
    panel.classList.remove('hidden'); panel.style.display='block';
    panel.innerHTML=`<div class="section-title">出貨預覽</div><div class="yx68-scroll-table"><table class="yx68-record-table"><thead><tr><th>商品</th><th>需求</th><th>總單</th><th>訂單</th><th>庫存</th><th>狀態</th></tr></thead><tbody>${rows.map(it=>{ const shortage=Number(it.shortage||it.shortage_qty||0); return `<tr><td>${esc(it.product_text||'')}</td><td>${Number(it.qty||it.need_qty||0)}</td><td>${Number(it.master_available||0)}</td><td>${Number(it.order_available||0)}</td><td>${Number(it.inventory_available||0)}</td><td>${shortage>0?'<span class="danger-text">數量不足</span>':'可出貨'}</td></tr>`; }).join('')}</tbody></table></div><div class="btn-row compact-row"><button class="ghost-btn" type="button" id="yx138-ship-cancel">取消</button><button class="primary-btn" type="button" id="yx138-ship-confirm">確認扣除</button></div>`;
    $('yx138-ship-cancel')?.addEventListener('click',()=>panel.classList.add('hidden'));
    $('yx138-ship-confirm')?.addEventListener('click',async()=>{ try{ await api('/api/ship',{method:'POST',body:JSON.stringify({...payload,allow_inventory_fallback:true,request_key:'ship_'+Date.now()+'_'+Math.random().toString(36).slice(2)})}); panel.innerHTML='<div class="section-title">出貨完成</div><div class="muted">已扣除總單 / 訂單 / 庫存。</div>'; toast('出貨完成','ok'); try{ await loadShipItems(customerName()); }catch(_e){} }catch(e){ toast(e.message||'出貨失敗','error'); } });
  }
  function installShipRepair(){
    if(moduleKey()!=='ship') return;
    buildShipCustomerQuick();
    window.YX138ShipRepair={load:loadShipItems};
    window.YX116ShipPicker={load:loadShipItems,items:()=>window.__YX_SHIP_CUSTOMER_ITEMS__||[],render:()=>renderShipList(window.__YX_SHIP_CUSTOMER_ITEMS__||[],customerName())};
    window.loadShipCustomerItems=loadShipItems; window.loadShipCustomerItems66=loadShipItems; window.loadShipCustomerItems82=loadShipItems; window.loadShipCustomerItems83=loadShipItems;
    const oldConfirm=window.confirmSubmit;
    if(!oldConfirm||!oldConfirm.__yx138Ship){
      const fn=async function(){
        if(moduleKey()!=='ship'&&typeof oldConfirm==='function') return oldConfirm.apply(this,arguments);
        const name=customerName(); if(!name) return toast('請先選擇客戶','warn');
        const items=parseShipLines(); if(!items.length) return toast('請先加入出貨商品','warn');
        const payload={customer_name:name,items,ocr_text:items.map(x=>x.product_text).join('\n')};
        try{ const preview=await api('/api/ship-preview',{method:'POST',body:JSON.stringify(payload)}); showShipPreview(preview,payload); }catch(e){ toast(e.message||'出貨預覽失敗','error'); }
      };
      fn.__yx138Ship=true; window.confirmSubmit=fn;
    }
  }
  function bindEvents(){
    if(window.__YX138_EVENTS__) return; window.__YX138_EVENTS__=true;
    document.addEventListener('click',e=>{
      const c=e.target?.closest?.('[data-yx138-ship-customer]');
      if(c){ e.preventDefault(); e.stopPropagation(); const name=clean(c.dataset.yx138ShipCustomer); window.__YX_SELECTED_CUSTOMER__=name; if($('customer-name')) $('customer-name').value=name; loadShipItems(name); return; }
      const item=e.target?.closest?.('[data-yx138-ship-index]');
      if(item&&moduleKey()==='ship'){ e.preventDefault(); e.stopPropagation(); const it=(window.__YX_SHIP_CUSTOMER_ITEMS__||[])[Number(item.dataset.yx138ShipIndex)]; if(it) appendShipText([it]); return; }
      if(e.target?.id==='ship-refresh-customer-items'&&moduleKey()==='ship'){ e.preventDefault(); e.stopPropagation(); loadShipItems(customerName()); return; }
      if(e.target?.id==='ship-add-selected-item'&&moduleKey()==='ship'){ e.preventDefault(); const it=(window.__YX_SHIP_CUSTOMER_ITEMS__||[])[0]; if(it) appendShipText([it]); else toast('請先點選商品','warn'); return; }
      if(e.target?.id==='ship-add-all-items'&&moduleKey()==='ship'){ e.preventDefault(); appendShipText(window.__YX_SHIP_CUSTOMER_ITEMS__||[]); return; }
    },true);
    document.addEventListener('input',e=>{ if(e.target?.id==='customer-name'&&moduleKey()==='ship') { clearTimeout(window.__YX138_SHIP_TIMER__); window.__YX138_SHIP_TIMER__=setTimeout(()=>loadShipItems(customerName()),180); } },true);
  }
  function install(){
    document.documentElement.dataset.yx138FinalMaster='locked';
    installFetchZoneFilter(); forceButtonText(); clearMasterRowButtons(); cleanWarehouseLegacy(); lockWarehouseGlobals(); enableWarehouseDragFallback(); installShipRepair(); bindEvents();
    if(moduleKey()==='ship'&&customerName()) loadShipItems(customerName());
    if(moduleKey()==='warehouse') setTimeout(()=>{ try{(window.YX121Warehouse||window.YX116Warehouse)?.render?.(true);}catch(_e){} },80);
    [60,180,420].forEach(ms=>setTimeout(()=>{ forceButtonText(); clearMasterRowButtons(); cleanWarehouseLegacy(); lockWarehouseGlobals(); installShipRepair(); },ms));
    if(!window.__YX138_OBSERVER__&&window.MutationObserver){
      window.__YX138_OBSERVER__=new MutationObserver(()=>{ clearTimeout(window.__YX138_REPAIR_TIMER__); window.__YX138_REPAIR_TIMER__=setTimeout(()=>{ forceButtonText(); clearMasterRowButtons(); cleanWarehouseLegacy(); },50); });
      window.__YX138_OBSERVER__.observe(document.body,{childList:true,subtree:true});
    }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
  document.addEventListener('yx:master-installed',install);
})();
