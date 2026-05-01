/* ==== FIX105: warehouse modal dropdown + current cell batch sync master ==== */
(function(){
  'use strict';
  const VERSION='FIX105_WAREHOUSE_BATCH_DROPDOWN_CURRENT_CELL_SYNC';
  if(window.__YX105_WAREHOUSE_BATCH_SYNC__) return;
  window.__YX105_WAREHOUSE_BATCH_SYNC__=true;

  const $=id=>document.getElementById(id);
  const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const isWarehouse=()=>/\/warehouse/.test(location.pathname||'')||!!$('zone-A-grid')||!!$('zone-B-grid');
  const isToday=()=>/\/today_changes/.test(location.pathname||'')||!!$('today-feed')||!!$('today-summary-cards');
  const toast=(m,k='ok')=>{try{(window.toast||window.showToast||window.notify||console.log)(m,k);}catch(_e){}};
  const api=window.yxApi||window.requestJSON||(async function(url,opt={}){
    const res=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});
    const txt=await res.text(); let data={};
    try{data=txt?JSON.parse(txt):{};}catch(_e){data={success:false,error:txt||'伺服器回應格式錯誤'};}
    if(!res.ok||data.success===false){const e=new Error(data.error||data.message||`請求失敗：${res.status}`);e.payload=data;throw e;}
    return data;
  });
  function wh(){window.state=window.state||{};window.state.warehouse=window.state.warehouse||{cells:[],zones:{A:{},B:{}},availableItems:[],activeZone:'A'};return window.state.warehouse;}
  function parseItems(raw){if(Array.isArray(raw))return raw;if(!raw)return[];try{const v=JSON.parse(raw);return Array.isArray(v)?v:[];}catch(_e){return[];}}
  function cellAt(zone,col,slot){zone=clean(zone).toUpperCase();col=Number(col);slot=Number(slot);return(wh().cells||[]).find(c=>clean(c.zone).toUpperCase()===zone&&Number(c.column_index)===col&&Number(c.slot_number)===slot);}
  function cellItems(zone,col,slot){return parseItems(cellAt(zone,col,slot)?.items_json??cellAt(zone,col,slot)?.items).map(x=>({...x}));}
  function qtyOf(it){const n=Number(it?.qty??it?.unplaced_qty??it?.total_qty??0);return Number.isFinite(n)?Math.max(0,Math.floor(n)):0;}
  function productText(it){return clean(it?.product_text||it?.product_size||it?.size||it?.product||'');}
  function materialText(it){const raw=clean(it?.material||it?.product_code||'');if(!raw||raw.includes('=')||/^\d+(?:x|×)/i.test(raw))return'未填';return raw;}
  function customerName(raw){const s=clean(raw||'未指定客戶');return clean(s.replace(/\s*(FOB代|FOB|CNF)\s*$/i,''))||s||'未指定客戶';}
  function placement(idx,it){return clean(it?.placement_label||it?.layer_label||it?.position_label||(idx===0?'後排':idx===1?'中間':idx===2?'前排':`第${idx+1}筆`));}
  function itemKey(it,prefix='item',idx=0){return `${prefix}:${idx}:${clean(it?.customer_name)}|${productText(it)}|${materialText(it)}|${clean(it?.source_summary||it?.source||'')}`;}
  function optionText(it,isCurrent=false){const c=customerName(it.customer_name||'未指定客戶');const p=productText(it)||'未填尺寸';const q=qtyOf(it);const src=clean(it.source_summary||it.source||'');return `${isCurrent?'格內｜':'未入倉｜'}${c}｜${p}｜${q}件${src?'｜'+src:''}`;}
  function maxSlot(zone,col){const nums=(wh().cells||[]).filter(c=>clean(c.zone).toUpperCase()===zone&&Number(c.column_index)===Number(col)).map(c=>Number(c.slot_number)||0).filter(Boolean);return Math.max(20,...nums);}
  function groupForSlot(items){const map=new Map();(items||[]).forEach(it=>{const name=customerName(it.customer_name||'未指定客戶');if(!map.has(name))map.set(name,{name,qtys:[],total:0});const q=qtyOf(it)||1;map.get(name).qtys.push(q);map.get(name).total+=q;});return Array.from(map.values());}
  function slotHTML(zone,col,slot){const items=cellItems(zone,col,slot);const groups=groupForSlot(items);const key1=[zone,col,'direct',slot].join('|'),key2=`${zone}-${col}-${slot}`;const hi=!!(window.state?.searchHighlightKeys&&(window.state.searchHighlightKeys.has(key1)||window.state.searchHighlightKeys.has(key2)));const body=groups.length?groups.map(g=>`<div class="yx105-slot-group"><div class="yx105-slot-head"><span>第${String(slot).padStart(2,'0')}格</span> <span class="yx105-slot-customer">${esc(g.name)}</span></div><div class="yx105-slot-qty"><span class="yx105-slot-sum">${esc(g.qtys.join('+'))}</span><span class="yx105-slot-total">${g.total}件</span></div></div>`).join(''):`<div class="yx105-slot-head"><span>第${String(slot).padStart(2,'0')}格</span> <span class="yx105-slot-empty">空格</span></div>`;return `<div class="yx105-slot yx103-slot yx102-slot yx96-slot vertical-slot ${groups.length?'filled':''} ${hi?'highlight':''}" data-zone="${esc(zone)}" data-column="${Number(col)}" data-slot="${Number(slot)}" draggable="true">${body}</div>`;}
  function bindSlot(el){if(el.dataset.yx105Bound==='1')return;el.dataset.yx105Bound='1';el.setAttribute('role','button');el.setAttribute('tabindex','0');el.title='點一下編輯格位，長按增刪或返回未入倉';el.addEventListener('dragover',ev=>{ev.preventDefault();el.classList.add('drag-over');});el.addEventListener('dragleave',()=>el.classList.remove('drag-over'));el.addEventListener('drop',async ev=>{ev.preventDefault();el.classList.remove('drag-over');const zone=clean(el.dataset.zone).toUpperCase(),col=Number(el.dataset.column),slot=Number(el.dataset.slot);try{const raw=ev.dataTransfer?.getData('text/plain')||'';const data=JSON.parse(raw||'{}');if(data.kind==='warehouse-item'&&typeof window.moveWarehouseItem==='function'){await window.moveWarehouseItem(data.fromKey,[zone,col,'direct',slot],data.product_text,data.qty);}else if(data.product_text){const items=cellItems(zone,col,slot);items.push({product_text:data.product_text,product_code:data.product_code||data.material||'',material:data.material||data.product_code||'',qty:qtyOf(data)||1,customer_name:data.customer_name||'',source:'unplaced',source_summary:data.source_summary||''});await api('/api/warehouse/cell',{method:'POST',body:JSON.stringify({zone,column_index:col,slot_type:'direct',slot_number:slot,items})});}await renderWarehouse(true);}catch(e){toast(e.message||'拖曳失敗','error');}});}
  function renderGrid(){['A','B'].forEach(zone=>{const grid=$(zone==='A'?'zone-A-grid':'zone-B-grid');if(!grid)return;grid.className='zone-grid six-grid vertical-card-grid yx105-warehouse-grid';grid.innerHTML='';for(let col=1;col<=6;col++){const card=document.createElement('div');card.className='yx105-warehouse-column vertical-column-card';card.dataset.zone=zone;card.dataset.column=String(col);let rows='';for(let slot=1;slot<=maxSlot(zone,col);slot++)rows+=slotHTML(zone,col,slot);card.innerHTML=`<div class="yx105-warehouse-column-title"><span>${zone} 區第 ${col} 欄</span><span class="small-note">長按增刪</span></div><div class="yx105-slot-list vertical-slot-list">${rows}</div>`;grid.appendChild(card);}const note=$(zone==='A'?'zone-A-count-note':'zone-B-count-note');if(note)note.textContent='格位唯一新版';});document.querySelectorAll('.yx105-slot').forEach(bindSlot);const active=localStorage.getItem('warehouseActiveZone')||wh().activeZone||'A';try{if(typeof window.setWarehouseZone==='function')window.setWarehouseZone(active,false);}catch(_e){}}
  let loading=null;async function renderWarehouse(force=false){if(loading)return loading;loading=(async()=>{try{const d=await api('/api/warehouse?yx105=1&ts='+Date.now(),{method:'GET'});wh().cells=Array.isArray(d.cells)?d.cells:[];wh().zones=d.zones||{A:{},B:{}};renderGrid();try{if(typeof window.installUnplacedPill99==='function')window.installUnplacedPill99();}catch(_e){}}catch(e){toast(e.message||'倉庫圖載入失敗','error');}finally{loading=null;}})();

  return loading;
  }
  window.renderWarehouse = renderWarehouse;
  window.yx105RenderWarehouse = renderWarehouse;
  window.setWarehouseZone = window.setWarehouseZone || function(zone){
    zone=clean(zone||'A').toUpperCase(); wh().activeZone=zone; localStorage.setItem('warehouseActiveZone', zone);
    const a=$('zone-A-grid'), b=$('zone-B-grid');
    if(a) a.closest('.warehouse-zone-panel,section,div').style.display = (zone==='B'?'none':'');
    if(b) b.closest('.warehouse-zone-panel,section,div').style.display = (zone==='A'?'none':'');
  };
  function install105(){ if(isWarehouse()) renderWarehouse(true); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', install105, {once:true}); else install105();
})();

/* ==== PACK14: SP material + FIX105 exact warehouse action-sheet fallback ==== */
(function(){
  'use strict';
  if(window.__YX_PACK14_WAREHOUSE_105_FALLBACK__) return;
  window.__YX_PACK14_WAREHOUSE_105_FALLBACK__=true;
  const $=id=>document.getElementById(id);
  const toast=(m,k)=>{try{(window.toast||window.showToast||console.log)(m,k)}catch(_){}};
  const api=window.yxApi||window.requestJSON||(async function(url,opt={}){const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{'Content-Type':'application/json',...(opt.headers||{})}});const t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch{d={error:t}};if(!r.ok||d.ok===false||d.success===false)throw new Error(d.error||d.message||'請求失敗');return d;});
  function ensureSheet(){let m=$('yx14-slot-sheet');if(m)return m;m=document.createElement('div');m.id='yx14-slot-sheet';m.className='yx14-slot-sheet hidden';m.innerHTML='<div class="yx14-sheet-card"><div id="yx14-sheet-title" class="yx14-sheet-title"></div><button id="yx14-sheet-open">開啟 / 編輯格位</button><button id="yx14-sheet-insert">在此格後插入格子</button><button id="yx14-sheet-delete" class="danger">刪除此格</button><button id="yx14-sheet-close">取消</button></div>';document.body.appendChild(m);$('yx14-sheet-close').onclick=()=>m.classList.add('hidden');m.addEventListener('click',e=>{if(e.target===m)m.classList.add('hidden')});return m;}
  window.showWarehouseSlotActionSheet=function(zone,col,slot){const m=ensureSheet();$('yx14-sheet-title').textContent=`${zone} 區第 ${col} 欄第 ${String(slot).padStart(2,'0')} 格`;m.classList.remove('hidden');$('yx14-sheet-open').onclick=()=>{m.classList.add('hidden');(window.openWarehouseModal||window.openWarehouseCellEditor101)?.(zone,col,slot)};$('yx14-sheet-insert').onclick=async()=>{try{await api('/api/warehouse/add-slot',{method:'POST',body:JSON.stringify({zone,column_index:col,slot_number:slot})});m.classList.add('hidden');toast('已插入格子');(window.renderWarehouse||function(){location.reload()})();}catch(e){toast(e.message||'插入失敗','error')}};$('yx14-sheet-delete').onclick=async()=>{if(!confirm('確定刪除此格？格內有商品時不可刪除'))return;try{await api('/api/warehouse/remove-slot',{method:'POST',body:JSON.stringify({zone,column_index:col,slot_number:slot})});m.classList.add('hidden');toast('已刪除格子');(window.renderWarehouse||function(){location.reload()})();}catch(e){toast(e.message||'刪除失敗','error')}};};
  function patchMaterialSelects(){const mats=['TD','MER','DF','SP','SPF','HF','尤加利','LVL'];document.querySelectorAll('#yx-batch-material,#batch-material,select[name="material"],select[data-material]').forEach(sel=>{const first=sel.querySelector('option')?.textContent||'批量增加材質';sel.innerHTML=`<option value="">${first.includes('不指定')?'不指定材質':'批量增加材質'}</option>`+mats.map(x=>`<option value="${x}">${x}</option>`).join('');});}
  function install(){document.documentElement.dataset.yxPack14Warehouse105='locked';patchMaterialSelects();setTimeout(patchMaterialSelects,500);if((location.pathname||'').includes('/warehouse')){setTimeout(()=>{try{window.renderWarehouse&&window.renderWarehouse(true)}catch(_){ }},120);}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
