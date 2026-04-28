/* FIX139 README 統整母版：把 README/歷代 FIX 指定行為最後接管；未改動功能仍走舊版函式輔助 */
(function(){
  'use strict';
  const V='fix139-readme-unified-master-hardlock';
  const YX=window.YXHardLock||{};
  const $=id=>document.getElementById(id);
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const mod=()=>{try{return YX.moduleKey?YX.moduleKey():'';}catch(_e){const p=location.pathname; if(p.includes('warehouse'))return'warehouse'; if(p.includes('ship'))return'ship'; if(p.includes('master-order'))return'master_order'; if(p.includes('orders'))return'orders'; if(p.includes('inventory'))return'inventory'; return p==='/'?'home':'';}};
  async function api(url,opt={}){ if(YX.api) return YX.api(url,opt); const res=await fetch(url,{credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json',...(opt.headers||{})},...opt}); const data=await res.json().catch(()=>({success:false,message:'回應格式錯誤'})); if(!res.ok||data.success===false) throw new Error(data.message||data.error||'操作失敗'); return data; }
  function toast(msg,type='ok'){ try{ if(YX.toast) return YX.toast(msg,type); }catch(_e){} try{(window.toast||window.showToast||console.log)(msg,type);}catch(_e){} }
  function buttonLabel(btn){
    const d=btn.dataset||{};
    if(d.yx128EditAll) return '編輯全部';
    if(d.yx128SaveAll) return '儲存全部';
    if(d.yx128CancelAll) return '取消';
    if(d.yx132BatchTransfer==='orders') return '加到訂單';
    if(d.yx132BatchTransfer==='master_order'||d.yx132BatchTransfer==='master_orders') return '加到總單';
    if(d.yx132BatchZone==='A') return '移到A區';
    if(d.yx132BatchZone==='B') return '移到B區';
    if(d.yx113BatchMaterial) return '套用材質';
    if(d.yx113BatchDelete) return '批量刪除';
    if(d.yx113Selectall) return '全選目前清單';
    if(d.yx131RowAction==='edit'||d.yx113Action==='edit') return '編輯';
    if(d.yx131RowAction==='ship'||d.yx113Action==='ship') return '直接出貨';
    if(d.yx131RowAction==='delete'||d.yx113Action==='delete') return '刪除';
    if(d.yx113Action==='to-orders') return '加到訂單';
    if(d.yx113Action==='to-master') return '加到總單';
    if(d.yx113CustomerAct==='open') return '打開客戶商品';
    if(d.yx113CustomerAct==='edit') return '編輯客戶';
    if(d.yx113CustomerAct==='delete') return '刪除客戶';
    if(d.yx113CustomerAct==='move-north') return '移到北區';
    if(d.yx113CustomerAct==='move-center') return '移到中區';
    if(d.yx113CustomerAct==='move-south') return '移到南區';
    if(btn.id==='yx137-undo-btn') return '還原上一步';
    if(btn.id==='ship-add-selected-item') return '加入選取商品';
    if(btn.id==='ship-add-all-items') return '整個加入下方商品資料';
    if(btn.id==='ship-refresh-customer-items') return '重新整理';
    if(btn.classList.contains('back-btn')) return '← 返回';
    return '';
  }
  function isDanger(btn){ const d=btn.dataset||{}; return btn.classList.contains('danger-btn')||d.yx113BatchDelete||d.yx131RowAction==='delete'||d.yx113Action==='delete'||d.yx113CustomerAct==='delete'||/刪除|批量刪除/.test(clean(btn.textContent)); }
  function isImportant(btn){ return btn.classList.contains('primary-btn')||/確認送出|儲存|出貨|還原/.test(clean(btn.textContent)); }
  function repairButtons(){
    document.querySelectorAll('button,.ghost-btn,.primary-btn,.tiny-btn,.small-btn,.chip,.menu-btn,.home-mini-btn,.back-btn').forEach(btn=>{
      const label=buttonLabel(btn);
      if(label && !clean(btn.textContent)) btn.textContent=label;
      btn.style.opacity='1'; btn.style.visibility='visible'; btn.style.webkitTextFillColor='';
      if(isDanger(btn)){ btn.dataset.yx139Danger='1'; btn.style.color='#dc2626'; }
      else { btn.style.color='#0b1220'; }
      if(isImportant(btn)) btn.dataset.yx139Important='1';
    });
  }
  function normalizeCustomerCards(){
    document.querySelectorAll('.customer-region-card[data-customer-name],.yx116-customer-card,.yx117-customer-card,.yx113-customer-card').forEach(card=>{
      if(card.querySelector('.yx116-customer-name,.yx113-customer-left,.yx139-customer-left')) return;
      const raw=clean(card.textContent||card.getAttribute('title')||card.dataset.customerName||'');
      if(!raw) return;
      const m=raw.match(/^(.*?)(\bCNF\b|\bFOB代\b|\bFOB\b)?\s*(\d+\s*件\s*\/\s*\d+\s*筆)?$/i);
      const name=clean((m&&m[1])||card.dataset.customerName||raw).replace(/[｜|].*$/,'');
      const tag=clean((m&&m[2])||'');
      const count=clean((m&&m[3])||'');
      card.innerHTML=`<span class="yx139-customer-left">${esc(name)}</span><span class="yx139-customer-tag">${esc(tag)}</span><span class="yx139-customer-count">${esc(count)}</span>`;
    });
  }
  function stopLegacyVisuals(){
    document.querySelectorAll('#warehouse-detail-panel,#yx71-warehouse-cell-menu,#yx91-warehouse-batch-panel,#yx97-warehouse-batch-panel,#yx99-warehouse-batch-panel,#yx102-warehouse-batch-panel,#yx103-warehouse-batch-panel,#yx105-warehouse-batch-panel').forEach(el=>{el.style.display='none'; el.style.pointerEvents='none';});
    document.querySelectorAll('.yx113-product-card,.yx112-product-card').forEach(el=>{ if(mod()==='inventory'||mod()==='orders'||mod()==='master_order') el.style.display='none'; });
    document.querySelectorAll('#yx113-master_order-summary .yx131-action-cell').forEach(td=>{td.innerHTML=''; td.setAttribute('aria-hidden','true');});
  }
  function zoneFromWarehouse(){ const z=clean(window.state?.warehouse?.activeZone||localStorage.getItem('warehouseActiveZone')||'A').toUpperCase(); return (z==='A'||z==='B')?z:''; }
  function installWarehouseBridge(){
    if(window.__YX139_WAREHOUSE_BRIDGE__) return; window.__YX139_WAREHOUSE_BRIDGE__=true;
    const nativeFetch=window.fetch.bind(window);
    window.fetch=function(input,init){
      try{
        let url=typeof input==='string'?input:input.url;
        if(url && url.includes('/api/warehouse/available-items') && !url.includes('zone=')){
          const z=zoneFromWarehouse();
          if(z){ const u=new URL(url,location.origin); u.searchParams.set('zone',z); input=typeof input==='string'?u.pathname+u.search:new Request(u.toString(),input); }
        }
      }catch(_e){}
      return nativeFetch(input,init);
    };
    const names=['renderWarehouse','renderWarehouse108','renderWarehouseZones','loadWarehouseDynamic','renderWarehouse82','renderWarehouse95','renderWarehouse96','renderWarehouse102'];
    names.forEach(name=>{ const old=window[name]; if(typeof old==='function'&&!old.__yx139Wrapped){ window[name]=function(...args){ const wh=window.YX121Warehouse||window.YX116Warehouse; if(wh&&typeof wh.render==='function') return wh.render(true); return old.apply(this,args); }; window[name].__yx139Wrapped=true; } });
  }
  async function loadCustomers(){
    const d=await api('/api/customers?yx139=1&ts='+Date.now());
    return Array.isArray(d.customers)?d.customers:(Array.isArray(d.items)?d.items:[]);
  }
  function customerName(){ return clean($('customer-name')?.value||window.__YX_SELECTED_CUSTOMER__||''); }
  async function loadCustomerItems(name){
    name=clean(name); if(!name) return [];
    try{ const d=await api('/api/customer-items?name='+encodeURIComponent(name)+'&yx139=1&ts='+Date.now()); return Array.isArray(d.items)?d.items:[]; }
    catch(_e){ return []; }
  }
  function renderShipCustomers(rows){
    const picker=$('ship-customer-picker')||document.querySelector('.ship-customer-picker,.ship-panel,.module-card'); if(!picker) return;
    let box=$('yx139-ship-customer-quick');
    if(!box){ box=document.createElement('div'); box.id='yx139-ship-customer-quick'; box.className='yx139-ship-customer-quick'; picker.insertAdjacentElement('afterbegin',box); }
    const list=rows.slice(0,80).map(c=>{ const n=clean(c.display_name||c.customer_name||c.name||''); if(!n) return ''; return `<button type="button" class="ghost-btn tiny-btn" data-yx139-ship-customer="${esc(n)}">${esc(n)}</button>`; }).join('');
    box.innerHTML=`<div class="small-note">選擇出貨客戶</div><div class="yx139-ship-customer-list">${list||'<span class="small-note">目前沒有客戶資料</span>'}</div>`;
  }
  function renderShipItems(items,name){
    const picker=$('ship-customer-picker')||document.querySelector('.ship-customer-picker,.ship-panel,.module-card'); if(!picker) return;
    let list=$('ship-customer-item-list');
    if(!list){ list=document.createElement('div'); list.id='ship-customer-item-list'; list.className='ship-customer-item-list yx128-ship-full-list'; picker.appendChild(list); }
    const rows=items.map((it,i)=>{ const p=clean(it.product_text||it.product||''); const mat=clean(it.material||it.product_code||'未填材質'); const src=clean(it.source||it.source_label||'商品'); return `<button type="button" class="ghost-btn small-btn yx128-ship-index" data-yx128-ship-index="${i}">${esc(src)}｜${esc(mat)}｜${esc(p)}</button>`; }).join('');
    window.__YX_SHIP_CUSTOMER_ITEMS__=items;
    list.innerHTML=name ? (rows||'<div class="empty-state-card compact-empty">此客戶目前沒有可出貨商品</div>') : '<div class="empty-state-card compact-empty">請先點選或輸入客戶名稱</div>';
  }
  async function repairShip(){
    if(mod()!=='ship') return;
    try{ renderShipCustomers(await loadCustomers()); }catch(_e){}
    const name=customerName(); if(name) renderShipItems(await loadCustomerItems(name),name);
  }
  function bind(){
    if(window.__YX139_BOUND__) return; window.__YX139_BOUND__=true;
    document.addEventListener('click',async e=>{
      const c=e.target?.closest?.('[data-yx139-ship-customer]');
      if(c){ e.preventDefault(); e.stopPropagation(); const name=clean(c.dataset.yx139ShipCustomer); window.__YX_SELECTED_CUSTOMER__=name; if($('customer-name')) $('customer-name').value=name; try{renderShipItems(await loadCustomerItems(name),name);}catch(err){toast(err.message||'客戶商品載入失敗','error');} return; }
    },true);
    document.addEventListener('input',e=>{ if(e.target?.id==='customer-name'&&mod()==='ship'){ clearTimeout(window.__YX139_SHIP_TIMER__); window.__YX139_SHIP_TIMER__=setTimeout(()=>repairShip(),180); } },true);
  }
  function install(){
    document.documentElement.dataset.yx139ReadmeMaster='locked';
    window.__YX_MASTER_BRIDGE_VERSION__=V;
    window.__YX124_BLOCK_LEGACY_VISUAL_BOOT__=true;
    installWarehouseBridge(); repairButtons(); normalizeCustomerCards(); stopLegacyVisuals(); bind(); repairShip();
    [80,180,360,800,1600,3200,5200].forEach(ms=>setTimeout(()=>{repairButtons();normalizeCustomerCards();stopLegacyVisuals();repairShip();},ms));
    if(!window.__YX139_OBSERVER__&&window.MutationObserver){ window.__YX139_OBSERVER__=new MutationObserver(()=>{ clearTimeout(window.__YX139_REPAIR__); window.__YX139_REPAIR__=setTimeout(()=>{repairButtons();normalizeCustomerCards();stopLegacyVisuals();},60); }); window.__YX139_OBSERVER__.observe(document.body,{childList:true,subtree:true}); }
  }
  window.YX139Master={version:V,install,repairButtons,normalizeCustomerCards,repairShip};
  if(YX.register) YX.register('fix139_readme_master',{install});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
  document.addEventListener('yx:master-installed',install);
})();
