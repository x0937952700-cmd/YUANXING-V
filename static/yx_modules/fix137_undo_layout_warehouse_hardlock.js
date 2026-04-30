/* FIX137：最後母版接管：還原上一步、修復空白按鈕、出貨客戶載入、倉庫拖拉 */
(function(){
  'use strict';
  const V='fix142-speed-ship-master-hardlock';
  const $=id=>document.getElementById(id);
  const YX=window.YXHardLock;
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  function api(url,opt={}){
    if(YX&&typeof YX.api==='function') return YX.api(url,opt);
    return fetch(url,{credentials:'same-origin',headers:{'Content-Type':'application/json',...(opt.headers||{})},...opt}).then(async r=>{const d=await r.json().catch(()=>({success:false,error:'伺服器回應錯誤'})); if(!r.ok||d.success===false) throw new Error(d.error||d.message||'操作失敗'); return d;});
  }
  function moduleKey(){
    if(YX&&typeof YX.moduleKey==='function') return YX.moduleKey();
    const p=location.pathname;
    if(p.includes('master-order')) return 'master_order';
    if(p.includes('orders')) return 'orders';
    if(p.includes('inventory')) return 'inventory';
    if(p.includes('ship')) return 'ship';
    if(p.includes('warehouse')) return 'warehouse';
    return document.querySelector('[data-module]')?.dataset.module||'home';
  }
  function toast(msg,type='ok'){ if(YX&&typeof YX.toast==='function') YX.toast(msg,type); else alert(msg); }
  const LABEL_SELECTOR=[
    '.yx124-ornate-label','.menu-btn','a.menu-btn','.home-mini-btn','a.home-mini-btn','.user-cell',
    '.primary-btn','button.primary-btn','.ghost-btn','button.ghost-btn','.back-btn','a.back-btn',
    '.danger-btn','button.danger-btn','.btn-danger','.chip','button.chip','.pill','.tiny-btn','.small-btn','.icon-btn',
    '.interactive-pill','.customer-mini-tag','.customer-chip','.customer-region-card','.zone-switch','.pwa-install-btn',
    '.yx113-toolbar button','.yx128-summary-controls button','.yx131-row-action-group button','.yx114-batch-actions button'
  ].join(',');
  function humanButtonLabel(el){
    const a=el.getAttribute('aria-label')||el.getAttribute('title')||el.dataset.label||'';
    if(a.trim()) return a.trim();
    if(el.matches('[data-yx128-edit-all]')) return '編輯全部';
    if(el.matches('[data-yx128-save-all]')) return '儲存全部';
    if(el.matches('[data-yx128-cancel-all]')) return '取消';
    if(el.matches('[data-yx132-batch-transfer="orders"]')) return '加到訂單';
    if(el.matches('[data-yx132-batch-transfer="master_order"]')) return '加到總單';
    if(el.matches('[data-yx132-batch-zone="A"]')) return '移到A區';
    if(el.matches('[data-yx132-batch-zone="B"]')) return '移到B區';
    if(el.matches('[data-yx131-row-action="edit"]')) return '編輯';
    if(el.matches('[data-yx131-row-action="ship"]')) return '直接出貨';
    if(el.matches('[data-yx131-row-action="delete"]')) return '刪除';
    if(el.matches('[data-yx113-selectall]')) return '全選目前清單';
    if(el.matches('[data-yx113-batch-material]')) return '套用材質';
    if(el.matches('[data-yx113-batch-delete]')) return '批量刪除';
    if(el.matches('[data-yx132-zone-filter="ALL"]')) return '全部區';
    if(el.matches('[data-yx132-zone-filter="A"]')) return 'A區';
    if(el.matches('[data-yx132-zone-filter="B"]')) return 'B區';
    return '';
  }
  function wrapText(el){
    if(!el||el.nodeType!==1||['INPUT','TEXTAREA','SELECT'].includes(el.tagName)) return;
    el.classList.add('yx124-ornate-label');
    let text=clean(el.textContent||'');
    if(!text){ const h=humanButtonLabel(el); if(h){ el.textContent=h; text=h; } }
    Array.from(el.childNodes).forEach(node=>{
      if(node.nodeType===3 && node.nodeValue.trim()){
        const span=document.createElement('span'); span.className='yx137-label-text'; span.textContent=node.nodeValue.trim(); el.replaceChild(span,node);
      }else if(node.nodeType===1 && node.classList && !node.matches('svg,path')){
        node.classList.add('yx137-label-text');
      }
    });
    if(!el.querySelector('.yx137-label-text,.yx136-label-text') && text){ const span=document.createElement('span'); span.className='yx137-label-text'; span.textContent=text; el.appendChild(span); }
  }
  function repairLabels(root=document){
    document.documentElement.dataset.yx137Final='locked';
    document.documentElement.dataset.yx136LabelText='locked';
    try{ root.querySelectorAll(LABEL_SELECTOR).forEach(wrapText); }catch(_e){}
  }
  async function undoLast(){
    if(!confirm('確定還原上一筆操作？')) return;
    const d=await api('/api/undo-last',{method:'POST',body:JSON.stringify({scope:'any'})});
    toast(d.message||'已還原上一筆操作','ok');
    try{ if(window.YX113ProductActions) await window.YX113ProductActions.refreshCurrent(); }catch(_e){}
    try{ if(window.YX116Warehouse) await window.YX116Warehouse.render(true); else if(typeof window.renderWarehouse==='function') await window.renderWarehouse(true); }catch(_e){}
    try{ if(window.loadCustomerBlocks) await window.loadCustomerBlocks(true); }catch(_e){}
    try{ if(window.YX116ShipPicker && $('customer-name')?.value) await window.YX116ShipPicker.load($('customer-name').value); }catch(_e){}
  }
  function injectUndoButton(){
    if($('yx137-undo-btn')) return;
    const m=moduleKey(); if(m==='home'||m==='login_page') return;
    const target=document.querySelector('.module-topbar .spacer')||document.querySelector('.module-topbar')||document.querySelector('.page-shell');
    if(!target) return;
    const btn=document.createElement('button');
    btn.id='yx137-undo-btn'; btn.type='button'; btn.className='ghost-btn small-btn yx137-undo-btn'; btn.textContent='還原上一步';
    btn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();undoLast().catch(err=>toast(err.message||'還原失敗','error'));},true);
    target.insertAdjacentElement(target.classList?.contains('spacer')?'beforebegin':'beforeend',btn);
    wrapText(btn);
  }
  function ensureShipCustomer(){
    if(moduleKey()!=='ship') return;
    const input=$('customer-name'); if(input){ input.style.display=''; input.removeAttribute('hidden'); input.placeholder='輸入或點選客戶後會顯示客戶商品'; input.setAttribute('list','yx137-customer-list'); }
    let dl=$('yx137-customer-list'); if(!dl){ dl=document.createElement('datalist'); dl.id='yx137-customer-list'; document.body.appendChild(dl); }
    api('/api/customers?yx137=1&ts='+Date.now(),{method:'GET'}).then(d=>{
      const items=Array.isArray(d.items)?d.items:[];
      dl.innerHTML=items.map(c=>`<option value="${esc(c.name||'')}"></option>`).join('');
      setTimeout(()=>{
        if(document.querySelector('.customer-region-card')) return;
        const picker=$('ship-customer-picker'); if(!picker||$('yx137-ship-customer-quick-list')) return;
        const q=document.createElement('div'); q.id='yx137-ship-customer-quick-list'; q.className='yx137-ship-customer-quick-list';
        q.innerHTML='<div class="small-note">客戶快速選擇</div>'+items.slice(0,80).map(c=>`<button type="button" class="ghost-btn tiny-btn" data-yx137-ship-customer="${esc(c.name||'')}">${esc(c.name||'')}</button>`).join('');
        picker.insertAdjacentElement('afterbegin',q); repairLabels(q);
      },300);
    }).catch(()=>{});
    if(input && !input.dataset.yx137ShipBound){ input.dataset.yx137ShipBound='1'; ['input','change','blur'].forEach(ev=>input.addEventListener(ev,()=>{ const name=clean(input.value); window.__YX_SELECTED_CUSTOMER__=name; if(name&&window.YX116ShipPicker) window.YX116ShipPicker.load(name); },true)); }
    document.querySelectorAll('#region-north,#region-center,#region-south').forEach(el=>el.style.display='');
    if(!document.documentElement.dataset.yx137ShipQuickBound){
      document.documentElement.dataset.yx137ShipQuickBound='1';
      document.addEventListener('click',ev=>{
        const b=ev.target?.closest?.('[data-yx137-ship-customer]'); if(!b) return;
        ev.preventDefault(); ev.stopPropagation();
        const name=clean(b.dataset.yx137ShipCustomer||'');
        if(input){ input.value=name; input.dispatchEvent(new Event('input',{bubbles:true})); input.dispatchEvent(new Event('change',{bubbles:true})); }
        window.__YX_SELECTED_CUSTOMER__=name; if(name&&window.YX116ShipPicker) window.YX116ShipPicker.load(name);
      },true);
    }
  }
  function parseItems(raw){ if(Array.isArray(raw)) return raw; try{return JSON.parse(raw||'[]')||[];}catch(_e){return [];} }
  function whCells(){ return (window.state&&window.state.warehouse&&Array.isArray(window.state.warehouse.cells))?window.state.warehouse.cells:[]; }
  function cellAt(z,c,s){ z=clean(z).toUpperCase(); c=Number(c); s=Number(s); return whCells().find(x=>clean(x.zone).toUpperCase()===z&&Number(x.column_index)===c&&Number(x.slot_number)===s); }
  let dragData=null;
  function slotMovePayload(slot){
    const from=[slot.dataset.zone,Number(slot.dataset.column),'direct',Number(slot.dataset.slot)];
    const arr=parseItems(cellAt(from[0],from[1],from[3])?.items_json).filter(it=>Number(it.qty||0)>0);
    const it=arr[0];
    if(!it) return null;
    return {from_key:from,product_text:it.product_text||it.product||'',customer_name:it.customer_name||'',qty:Number(it.qty||1)||1,placement_label:'前排'};
  }
  async function moveWarehousePayloadToSlot(payload, slot){
    if(!payload||!slot) return;
    const to=[slot.dataset.zone,Number(slot.dataset.column),'direct',Number(slot.dataset.slot)];
    if(String(to)===String(payload.from_key)) return;
    const d=await api('/api/warehouse/move',{method:'POST',body:JSON.stringify({...payload,to_key:to,placement_label:'前排'})});
    if(d.success===false) throw new Error(d.error||'拖拉移動失敗');
    toast('已移動到前排','ok');
    if(window.YX116Warehouse) await window.YX116Warehouse.render(true); else if(typeof window.renderWarehouse==='function') await window.renderWarehouse(true);
  }
  let pointerDrag=null;
  function enableWarehousePointerDrag(){
    if(moduleKey()!=='warehouse') return;
    document.querySelectorAll('.yx108-slot[data-zone][data-column][data-slot],.yx116-slot[data-zone][data-column][data-slot]').forEach(slot=>{
      if(slot.dataset.yx137PointerDragBound==='1') return;
      slot.dataset.yx137PointerDragBound='1';
      slot.addEventListener('pointerdown',ev=>{
        if(ev.button!=null && ev.button!==0) return;
        const payload=slotMovePayload(slot);
        if(!payload) return;
        pointerDrag={startSlot:slot,payload,x:ev.clientX,y:ev.clientY,active:false,pointerId:ev.pointerId};
      },true);
      slot.addEventListener('pointermove',ev=>{
        if(!pointerDrag||pointerDrag.pointerId!==ev.pointerId) return;
        const dx=Math.abs(ev.clientX-pointerDrag.x), dy=Math.abs(ev.clientY-pointerDrag.y);
        if(dx+dy>12){ pointerDrag.active=true; pointerDrag.startSlot.classList.add('yx137-warehouse-dragging'); ev.preventDefault(); }
        if(pointerDrag.active){
          document.querySelectorAll('.yx137-warehouse-drop-target').forEach(x=>x.classList.remove('yx137-warehouse-drop-target'));
          const el=document.elementFromPoint(ev.clientX,ev.clientY)?.closest?.('.yx108-slot[data-zone][data-column][data-slot],.yx116-slot[data-zone][data-column][data-slot]');
          if(el) el.classList.add('yx137-warehouse-drop-target');
        }
      },{passive:false,capture:true});
      slot.addEventListener('pointerup',ev=>{
        if(!pointerDrag||pointerDrag.pointerId!==ev.pointerId) return;
        const pd=pointerDrag; pointerDrag=null;
        pd.startSlot.classList.remove('yx137-warehouse-dragging');
        document.querySelectorAll('.yx137-warehouse-drop-target').forEach(x=>x.classList.remove('yx137-warehouse-drop-target'));
        if(!pd.active) return;
        ev.preventDefault(); ev.stopPropagation();
        const target=document.elementFromPoint(ev.clientX,ev.clientY)?.closest?.('.yx108-slot[data-zone][data-column][data-slot],.yx116-slot[data-zone][data-column][data-slot]');
        if(!target) return;
        moveWarehousePayloadToSlot(pd.payload,target).catch(e=>toast(e.message||'拖拉移動失敗','error'));
      },true);
      slot.addEventListener('pointercancel',()=>{ if(pointerDrag){ pointerDrag.startSlot.classList.remove('yx137-warehouse-dragging'); pointerDrag=null; } document.querySelectorAll('.yx137-warehouse-drop-target').forEach(x=>x.classList.remove('yx137-warehouse-drop-target')); },true);
    });
  }
  function enableWarehouseDrag(){
    if(moduleKey()!=='warehouse') return;
    document.querySelectorAll('.yx108-slot[data-zone][data-column][data-slot],.yx116-slot[data-zone][data-column][data-slot]').forEach(slot=>{
      const items=parseItems(cellAt(slot.dataset.zone,slot.dataset.column,slot.dataset.slot)?.items_json);
      if(items.length){ slot.draggable=true; slot.dataset.yx137Drag='1'; } else { slot.draggable=false; }
      if(slot.dataset.yx137DragBound==='1') return;
      slot.dataset.yx137DragBound='1';
      slot.addEventListener('dragstart',ev=>{
        const from=[slot.dataset.zone,Number(slot.dataset.column),'direct',Number(slot.dataset.slot)];
        const arr=parseItems(cellAt(from[0],from[1],from[3])?.items_json).filter(it=>Number(it.qty||0)>0);
        const it=arr[0]; if(!it){ ev.preventDefault(); return; }
        dragData={from_key:from,product_text:it.product_text||it.product||'',customer_name:it.customer_name||'',qty:Number(it.qty||1)||1,placement_label:'前排'};
        slot.classList.add('yx137-warehouse-dragging');
        try{ ev.dataTransfer.effectAllowed='move'; ev.dataTransfer.setData('application/json',JSON.stringify(dragData)); }catch(_e){}
      });
      slot.addEventListener('dragend',()=>{slot.classList.remove('yx137-warehouse-dragging'); document.querySelectorAll('.yx137-warehouse-drop-target').forEach(x=>x.classList.remove('yx137-warehouse-drop-target')); setTimeout(()=>{dragData=null;},80);});
      slot.addEventListener('dragover',ev=>{ if(dragData){ ev.preventDefault(); slot.classList.add('yx137-warehouse-drop-target'); } });
      slot.addEventListener('dragleave',()=>slot.classList.remove('yx137-warehouse-drop-target'));
      slot.addEventListener('drop',ev=>{
        if(!dragData) return;
        ev.preventDefault(); ev.stopPropagation(); slot.classList.remove('yx137-warehouse-drop-target');
        const to=[slot.dataset.zone,Number(slot.dataset.column),'direct',Number(slot.dataset.slot)];
        if(String(to)===String(dragData.from_key)) return;
        api('/api/warehouse/move',{method:'POST',body:JSON.stringify({...dragData,to_key:to,placement_label:'前排'})}).then(async d=>{
          if(d.success===false) throw new Error(d.error||'拖拉移動失敗');
          toast('已移動到前排','ok');
          if(window.YX116Warehouse) await window.YX116Warehouse.render(true); else if(typeof window.renderWarehouse==='function') await window.renderWarehouse(true);
        }).catch(e=>toast(e.message||'拖拉移動失敗','error'));
      });
    });
  }
  function keepAlive(){ repairLabels(document); injectUndoButton(); ensureShipCustomer(); enableWarehouseDrag(); enableWarehousePointerDrag(); }
  function install(){ keepAlive(); [50,150,350,800,1600,3200].forEach(ms=>setTimeout(keepAlive,ms)); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
  window.addEventListener('pageshow',install);
  document.addEventListener('yx:master-installed',install);
  document.addEventListener('yx:product-source-loaded',()=>setTimeout(keepAlive,20));
  try{ const MO=window.__YX96_NATIVE_MUTATION_OBSERVER__||window.MutationObserver; if(MO){ const obs=new MO(()=>{ clearTimeout(window.__yx137Timer); window.__yx137Timer=setTimeout(keepAlive,60); }); if(document.body) obs.observe(document.body,{childList:true,subtree:true}); }}catch(_e){}
  try{ window.YX137Final=Object.freeze({version:V,install,undoLast,repairLabels,enableWarehouseDrag}); }catch(_e){}
})();
