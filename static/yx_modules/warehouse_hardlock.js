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
  function availableRows(){ const q=clean($('warehouse-item-search')?.value||'').toLowerCase(); return availableListForCurrent().map((it,i)=>({it,index:i})).filter(r=>!q||optionLabel(r.it).toLowerCase().includes(q)); }
  function placementForBatch(i){ return i===0?'後排':i===1?'中間':'前排'; }
  function renderCellItems(){
    const box=$('warehouse-cell-items'); if(!box) return;
    // 批量加入面板已直接寫在 templates/module.html；這裡只更新「目前商品」與「每列選項」，不再整塊覆蓋 HTML。
    if(!$('warehouse-current-items-html') || !$('yx121-batch-rows')){
      box.innerHTML=`<div class="yx-direct-section" data-html-locked="warehouse-current-items-html"><div class="yx-direct-section-title">目前此格商品</div><div id="warehouse-current-items-html" class="yx-direct-current-list"></div></div><div class="yx-direct-batch-panel" data-html-locked="warehouse-batch-html-fixed"><div class="yx-direct-section-title">批量加入商品</div><div class="small-note">A / B 區各自只顯示尚未錄入倉庫圖商品；第 1 筆後排、第 2 筆中間、第 3 筆前排。</div><div id="yx121-batch-rows"></div><div class="btn-row compact-row"><button class="ghost-btn small-btn" type="button" id="yx121-add-batch-row">新增更多批量</button><button class="primary-btn small-btn" type="button" id="yx121-save-cell">儲存格位</button></div></div>`;
    }
    const current=(state.current.items||[]).map((it,i)=>{ const mat=materialOf(it), place=clean(it.placement_label||it.layer_label||''); return `<div class="yx-direct-current-item" data-idx="${i}"><div class="yx-direct-current-main"><span class="yx-direct-source">${esc(sourceOf(it))}</span>${mat?`<span class="yx-direct-material">${esc(mat)}</span>`:''}<strong>${esc(cleanCustomer(it.customer_name))}</strong><span class="yx-direct-product">${esc(productText(it))}</span></div><div class="yx-direct-current-side"><span>${place?esc(place)+'｜':''}${itemQty(it)}件</span><button class="remove yx-direct-remove" type="button" data-remove-cell-item="${i}">×</button></div></div>`; }).join('') || '<div class="empty-state-card compact-empty">此格目前沒有商品</div>';
    const currentBox=$('warehouse-current-items-html'); if(currentBox) currentBox.innerHTML=current;
    const opts=availableRows().map(r=>`<option value="${r.index}">${esc(optionLabel(r.it))}</option>`).join('');
    const rows=Array.from({length:Math.max(3,Number(state.batchCount||3))},(_,i)=>`<div class="yx121-batch-row" data-batch-index="${i}"><label class="yx121-batch-label">${placementForBatch(i)}</label><select class="text-input yx121-batch-select"><option value="">選擇此區未錄入商品</option>${opts}</select><input class="text-input yx121-batch-qty" type="number" min="1" placeholder="件數"></div>`).join('');
    const rowsBox=$('yx121-batch-rows'); if(rowsBox) rowsBox.innerHTML=rows;
  }
  async function openWarehouseModal(z,c,s){ await loadAvailable(); z=clean(z).toUpperCase(); state.current={zone:z,col:Number(c),slot:Number(s),items:JSON.parse(JSON.stringify(cellItems(z,c,s))),note:cellNote(z,c,s)}; state.batchCount=3; const meta=$('warehouse-modal-meta'); if(meta) meta.textContent=`${z} 區第 ${Number(c)} 欄 第 ${Number(s)} 格`; const note=$('warehouse-note'); if(note) note.value=state.current.note||''; $('warehouse-modal')?.classList.remove('hidden'); renderCellItems(); }
  function closeWarehouseModal(){ $('warehouse-modal')?.classList.add('hidden'); }
  function collectBatchItems(){ const added=[]; const pool=availableListForCurrent(); document.querySelectorAll('#yx121-batch-rows .yx121-batch-row').forEach(row=>{ const raw=row.querySelector('.yx121-batch-select')?.value; if(raw==='') return; const idx=Number(raw); if(!Number.isFinite(idx)) return; const it=pool[idx]; if(!it) return; let qty=Number(row.querySelector('.yx121-batch-qty')?.value||itemQty(it)||1); qty=Math.max(1,Math.min(itemQty(it)||qty,qty)); added.push(normalizedItem(it,qty,placementForBatch(Number(row.dataset.batchIndex||added.length)))); }); return added; }
  async function saveCellRaw(z,c,s,items,note){ return api('/api/warehouse/cell',{method:'POST',body:JSON.stringify({zone:clean(z).toUpperCase(),column_index:Number(c),slot_type:'direct',slot_number:Number(s),items:items||[],note:note||''})}); }
  async function saveWarehouseCell(){ const items=[...(state.current.items||[]),...collectBatchItems()]; await saveCellRaw(state.current.zone,state.current.col,state.current.slot,items,$('warehouse-note')?.value||''); toast('格位已儲存','ok'); closeWarehouseModal(); await renderWarehouse(true); highlightWarehouseCell(state.current.zone,state.current.col,state.current.slot); }
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
  async function deleteWarehouseCell(z,c,s){ if(cellItems(z,c,s).length) return toast('格子內還有商品，請先移除商品後再刪除','warn'); if(!confirm(`確定刪除 ${z} 區第 ${c} 欄第 ${s} 格？`)) return; await api('/api/warehouse/remove-slot',{method:'POST',body:JSON.stringify({zone:clean(z).toUpperCase(),column_index:Number(c),slot_number:Number(s),slot_type:'direct'})}); toast('已刪除格子','ok'); await renderWarehouse(true); }
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
      const act=ev.target?.closest?.('[data-wh-act]'); if(act){ ev.preventDefault(); const m=menu(); const z=m.dataset.zone,c=Number(m.dataset.column),s=Number(m.dataset.slot); m.classList.add('hidden'); try{ if(act.dataset.whAct==='open') await openWarehouseModal(z,c,s); if(act.dataset.whAct==='insert') await insertWarehouseCell(z,c,s); if(act.dataset.whAct==='delete') await deleteWarehouseCell(z,c,s); }catch(e){ toast(e.message||'格位操作失敗','error'); } return; }
      if(!ev.target?.closest?.('#yx-final-warehouse-menu')) menu().classList.add('hidden');
      if(ev.target?.id==='yx121-add-batch-row'){ ev.preventDefault(); state.batchCount=Math.max(3,Number(state.batchCount||3))+1; renderCellItems(); return; }
      if(ev.target?.id==='yx121-save-cell'){ ev.preventDefault(); try{ await saveWarehouseCell(); }catch(e){ toast(e.message||'儲存格位失敗','error'); } return; }
      const rm=ev.target?.closest?.('[data-remove-cell-item]'); if(rm){ ev.preventDefault(); state.current.items.splice(Number(rm.dataset.removeCellItem),1); renderCellItems(); return; }
    },true);
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
  window.jumpProductToWarehouse=jumpProductToWarehouse;
  window.highlightWarehouseCell=highlightWarehouseCell;
  window.YXFinalWarehouse={render:renderWarehouse, openWarehouseModal, saveWarehouseCell, jumpProductToWarehouse};
  if(YX.register) YX.register('warehouse',{install,render:renderWarehouse,cleanup:()=>{}});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
})();
