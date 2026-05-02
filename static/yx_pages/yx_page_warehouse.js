// CLEAN V22 warehouse page JS. One page = one JS. Old FIX JS is not loaded.
(function(){
  'use strict';
  if (window.__YX_CLEAN_COMMON__) return; window.__YX_CLEAN_COMMON__ = true;
  window.$ = window.$ || ((s, r=document)=>r.querySelector(s));
  window.$$ = window.$$ || ((s, r=document)=>Array.from(r.querySelectorAll(s)));
  window.yxApi = async function(url, opt={}){
    const o = Object.assign({credentials:'same-origin'}, opt);
    o.headers = Object.assign({'Content-Type':'application/json'}, o.headers||{});
    const r = await fetch(url, o); let data={}; try{data=await r.json();}catch(e){}
    if(!r.ok || data.success===false){ throw new Error(data.message || data.error || ('HTTP '+r.status)); }
    return data;
  };
  window.yxToast = function(msg){
    let el = $('#yx-clean-toast'); if(!el){ el=document.createElement('div'); el.id='yx-clean-toast'; el.style.cssText='position:fixed;right:18px;top:18px;z-index:99999;background:#111827;color:#fff;padding:10px 14px;border-radius:12px;box-shadow:0 8px 24px #0002;font-weight:700;max-width:70vw'; document.body.appendChild(el); }
    el.textContent=msg; el.style.display='block'; clearTimeout(el._t); el._t=setTimeout(()=>el.style.display='none',2600);
  };
  window.yxErr = e => yxToast((e && e.message) ? e.message : String(e||'操作失敗'));
  window.yxQty = function(text){
    text=String(text||''); const rhs=(text.split('=')[1]||text).trim(); if(!rhs) return 0;
    return rhs.split('+').map(x=>x.trim()).filter(Boolean).reduce((sum,p)=>{ const m=p.match(/(?:^|\D)(\d+)\s*[xX×*]\s*(\d+)$/); if(m) return sum+parseInt(m[2]||0,10); return sum+1; },0);
  };
  window.yxMaterial = function(row){ return (row.material || row.product_code || '未填材質').trim(); };
  window.yxSize = function(row){ return (row.product_text || row.product || '').trim(); };
})();

(function(){
'use strict';
if(window.__YX_CLEAN_WAREHOUSE__) return; window.__YX_CLEAN_WAREHOUSE__=true;
let cells=[], available=[], current={zone:'A',column:1,slot:1,items:[],note:''}, currentZone='A', actionSlot=null, savingCell=false;
let longTimer=null, longMoved=false, suppressNextSlotClick=false;
function esc(v){ return String(v==null?'':v).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c])); }
function parseItemsJson(c){ try{return JSON.parse(c.items_json||'[]')}catch(e){return []} }
function findCell(zone,column,slot){ return cells.find(x=>String(x.zone)===String(zone) && Number(x.column_index)===Number(column) && Number(x.slot_number)===Number(slot)); }
function maxSlot(zone,column){ const nums=cells.filter(x=>String(x.zone)===zone && Number(x.column_index)===Number(column)).map(x=>Number(x.slot_number)||0).filter(Boolean); return nums.length ? Math.max(...nums) : 20; }
function slotHtml(zone,col,slot){ return `<button type="button" class="yx108-slot yx106-slot yx116-slot vertical-slot" data-zone="${zone}" data-column="${col}" data-slot="${slot}"><div class="yx108-slot-row yx108-slot-row1 yx116-slot-row1"><span class="yx108-slot-no">${slot}</span><span class="yx108-slot-customers yx108-slot-empty">空格</span></div><div class="yx108-slot-row yx108-slot-row2 yx116-slot-row2"><span class="yx108-slot-sum">0</span><span class="yx108-slot-total">0件</span></div></button>`; }
function ensureDynamicSlots(){
  ['A','B'].forEach(zone=>{
    for(let col=1; col<=6; col++){
      const wrap=document.querySelector(`.yx106-warehouse-column[data-zone="${zone}"][data-column="${col}"] .yx106-slot-list`);
      if(!wrap) continue;
      const n=maxSlot(zone,col);
      const existing=$$('.yx108-slot', wrap).map(b=>Number(b.dataset.slot)||0);
      if(existing.length!==n || Math.max(0,...existing)!==n){
        wrap.innerHTML=Array.from({length:n},(_,i)=>slotHtml(zone,col,i+1)).join('');
      }
    }
  });
}
function fillSlot(btn, cell){ const items=cell?parseItemsJson(cell):[]; const customers=[...new Set(items.map(x=>x.customer_name||'庫存').filter(Boolean))]; const qtys=items.map(x=>Number(x.qty||0)).filter(Boolean); $('.yx108-slot-customers',btn).textContent=customers.length?customers.join('/'):'空格'; $('.yx108-slot-customers',btn).classList.toggle('yx108-slot-empty',!customers.length); $('.yx108-slot-sum',btn).textContent=qtys.length?qtys.join('+'):'0'; $('.yx108-slot-total',btn).textContent=(qtys.reduce((a,b)=>a+b,0))+'件'; }
function fillAllSlots(){ ensureDynamicSlots(); $$('.yx108-slot').forEach(btn=>{ const c=findCell(btn.dataset.zone,btn.dataset.column,btn.dataset.slot); fillSlot(btn,c); }); ['A','B'].forEach(z=>{ const n=$$('.yx108-slot[data-zone=\"'+z+'\"]').length; const note=$('#zone-'+z+'-count-note'); if(note) note.textContent='目前 '+n+' 格｜資料庫動態'; }); }
async function load(){ try{ const d=await yxApi('/api/warehouse'); cells=d.cells||[]; fillAllSlots(); await loadAvail(currentZone); updateUnplacedPill(); }catch(e){yxErr(e);} }
async function loadAvail(zone){ const d=await yxApi('/api/warehouse/available-items?zone='+encodeURIComponent(zone||'')); available=d.items||[]; fillBatchOptions(); updateUnplacedPill(); }
function updateUnplacedPill(){ const pill=$('#warehouse-unplaced-pill'); if(!pill) return; const a=available.filter(x=>(x.location||x.zone||'').toUpperCase().startsWith('A')).reduce((s,x)=>s+Number(x.unplaced_qty||x.qty||0),0); const b=available.filter(x=>(x.location||x.zone||'').toUpperCase().startsWith('B')).reduce((s,x)=>s+Number(x.unplaced_qty||x.qty||0),0); if(currentZone==='A') pill.textContent=`A區 ${a||available.reduce((s,x)=>s+Number(x.unplaced_qty||x.qty||0),0)}件｜B區 -｜總計 ${a||available.reduce((s,x)=>s+Number(x.unplaced_qty||x.qty||0),0)}件`; else if(currentZone==='B') pill.textContent=`A區 -｜B區 ${b||available.reduce((s,x)=>s+Number(x.unplaced_qty||x.qty||0),0)}件｜總計 ${b||available.reduce((s,x)=>s+Number(x.unplaced_qty||x.qty||0),0)}件`; }
function fillBatchOptions(){
  const keyword=(($('#warehouse-item-search')||{}).value||'').trim().toLowerCase();
  const picked=new Set($$('.yx121-batch-select').map(s=>s.value).filter(v=>v!==''));
  $$('.yx121-batch-select').forEach(sel=>{
    const val=sel.value;
    sel.innerHTML='<option value="">選擇此區未錄入商品</option>'+available.map((it,i)=>{
      const max=Number(it.unplaced_qty||it.qty||0);
      const text=((it.customer_name||'庫存')+' '+(it.product_text||it.product_size||'')+' '+(it.source_summary||'')).toLowerCase();
      if(keyword && !text.includes(keyword)) return '';
      const label=`${it.customer_name||'庫存'}｜${it.product_text||it.product_size||''}｜剩 ${max} 件${it.source_summary?'｜'+it.source_summary:''}`;
      const disabled=(picked.has(String(i)) && String(i)!==String(val))?' disabled':'';
      return `<option value="${i}" data-max="${max}"${disabled}>${esc(label)}</option>`;
    }).join('');
    if(val && available[Number(val)]) sel.value=val;
  });
  syncBatchQtyLimits();
}
function syncBatchQtyLimits(){ $$('.yx121-batch-row').forEach(row=>{ const sel=$('.yx121-batch-select',row), qty=$('.yx121-batch-qty',row); if(!sel||!qty) return; const it=available[Number(sel.value)]; const max=it?Number(it.unplaced_qty||it.qty||0):''; if(max){ qty.max=String(max); qty.placeholder='最多 '+max+' 件'; if(!qty.value) qty.value=String(max); if(Number(qty.value)>max) qty.value=String(max); }else{ qty.removeAttribute('max'); qty.placeholder='件數'; } }); }
function resetBatchRows(){ $$('.yx121-batch-select').forEach(s=>s.value=''); $$('.yx121-batch-qty').forEach(i=>{i.value=''; i.removeAttribute('max'); i.placeholder='件數';}); }
function openCell(btn){ currentZone=btn.dataset.zone; current={zone:btn.dataset.zone,column:Number(btn.dataset.column),slot:Number(btn.dataset.slot),items:[],note:''}; const c=findCell(current.zone,current.column,current.slot); if(c){ current.items=parseItemsJson(c); current.note=c.note||''; } $('#warehouse-modal')?.classList.remove('hidden'); $('#warehouse-modal-meta').textContent=`${current.zone} 區第 ${current.column} 欄第 ${current.slot} 格`; if($('#warehouse-note')) $('#warehouse-note').value=current.note||''; resetBatchRows(); renderCurrent(); loadAvail(current.zone); }
function renderCurrent(){ const box=$('#warehouse-current-items-html'); if(box) box.innerHTML=current.items.length?current.items.map((it,i)=>`<div class="yx-warehouse-current-row"><span class="material-tag">${esc(it.material||it.product_code||'未填材質')}</span><span>${esc(it.customer_name||'庫存')}｜${esc(it.product_text||it.product)}</span><input class="text-input small wh-current-qty" data-i="${i}" type="number" min="1" value="${Number(it.qty||1)}"><button class="ghost-btn small-btn danger-btn" data-wh-del="${i}" type="button">刪除</button></div>`).join(''):'<div class="empty-state-card compact-empty">此格目前沒有商品</div>'; }
window.closeWarehouseModal=function(){ $('#warehouse-modal')?.classList.add('hidden'); };
function closeActionSheet(){ $('#warehouse-action-sheet')?.classList.add('hidden'); actionSlot=null; }
function openActionSheet(btn){ actionSlot=btn; suppressNextSlotClick=true; const m=$('#warehouse-action-meta'); if(m) m.textContent=`${btn.dataset.zone} 區第 ${btn.dataset.column} 欄第 ${btn.dataset.slot} 格`; $('#warehouse-action-sheet')?.classList.remove('hidden'); setTimeout(()=>{suppressNextSlotClick=false;},450); }
window.setWarehouseZone=function(z){ currentZone=z; $$('.warehouse-zone-card').forEach(el=>{el.style.display=(z==='ALL'||el.id==='zone-'+z)?'':'none'}); $$('.zone-switch').forEach(b=>b.classList.toggle('active',b.id==='zone-switch-'+z)); const p=$('#warehouse-selection-pill'); if(p) p.textContent='目前區域：'+(z==='ALL'?'全部':z+' 區'); loadAvail(z==='ALL'?'':z); };
window.renderWarehouse=load;
window.searchWarehouse=function(){ const q=($('#warehouse-search')||{}).value||''; $$('.yx108-slot').forEach(b=>{ const text=b.textContent; b.style.outline=q&&text.includes(q)?'3px solid #f59e0b':''; });};
window.toggleWarehouseUnplacedHighlight=function(){ const box=$('#warehouse-unplaced-list-inline'); if(!box) return; box.classList.toggle('hidden'); if(!box.classList.contains('hidden')) box.innerHTML=available.length?available.map(it=>`<div class="result-card"><b>${esc(it.customer_name||'庫存')}</b>｜${esc(it.product_text||it.product_size||'')}｜${Number(it.unplaced_qty||it.qty||0)}件</div>`).join(''):'<div class="empty-state-card compact-empty">目前沒有未錄入商品</div>'; };
window.highlightWarehouseSameCustomer=function(){yxToast('請先搜尋客戶名稱')};
window.clearWarehouseHighlights=function(){ $$('.yx108-slot').forEach(b=>b.style.outline=''); $('#warehouse-search-results')?.classList.add('hidden'); $('#warehouse-unplaced-list-inline')?.classList.add('hidden');};
window.undoWarehouseMove=function(){yxToast('目前沒有可還原的拖拉動作')};
function addBatchRow(){ const i=$$('.yx121-batch-row').length; const lab=i===0?'後排':i===1?'中間':i===2?'前排':'追加'; const row=document.createElement('div'); row.className='yx121-batch-row'; row.dataset.batchIndex=i; row.innerHTML=`<label class="yx121-batch-label">${lab}</label><select class="text-input yx121-batch-select"><option value="">選擇此區未錄入商品</option></select><input class="text-input yx121-batch-qty" type="number" min="1" placeholder="件數">`; $('#yx121-batch-rows')?.appendChild(row); fillBatchOptions(); }
async function saveCell(){ if(savingCell) return; savingCell=true; try{ const added=[]; const used=new Set(); $$('.yx121-batch-row').forEach((row,idx)=>{ const sel=$('.yx121-batch-select',row), qtyEl=$('.yx121-batch-qty',row); if(!sel||sel.value==='') return; if(used.has(sel.value)) throw new Error('同一商品不可在批量列重複加入'); used.add(sel.value); const it=available[Number(sel.value)]; if(!it) return; const max=Number(it.unplaced_qty||it.qty||0); const qty=Number(qtyEl.value||max||1); if(qty<=0) throw new Error('加入件數必須大於 0'); if(qty>max) throw new Error(`${it.product_text||it.product_size} 最多只能加入 ${max} 件`); added.push({customer_name:it.customer_name||'',product_text:it.product_text||it.product_size,product:it.product_text||it.product_size,material:it.material||'',product_code:it.material||'',qty,placement_label:idx===0?'後排':idx===1?'中間':idx===2?'前排':'追加',source:it.source||''}); }); $$('.wh-current-qty').forEach(inp=>{ const i=Number(inp.dataset.i); const q=Number(inp.value||1); if(q<=0) throw new Error('目前格位商品件數必須大於 0'); if(current.items[i]) current.items[i].qty=q; }); const items=current.items.concat(added); await yxApi('/api/warehouse/cell',{method:'POST',body:JSON.stringify({zone:current.zone,column_index:current.column,slot_number:current.slot,note:($('#warehouse-note')||{}).value||'',items})}); yxToast('格位已儲存'); resetBatchRows(); closeWarehouseModal(); await load(); }catch(e){yxErr(e);} finally{ savingCell=false; } }
function cellHasItems(zone,column,slot){ const c=findCell(zone,column,slot); return c && parseItemsJson(c).length>0; }
async function insertAfterSlot(btn){ try{ await yxApi('/api/warehouse/add-slot',{method:'POST',body:JSON.stringify({zone:btn.dataset.zone,column_index:Number(btn.dataset.column),insert_after:Number(btn.dataset.slot)})}); yxToast('已在此格後插入格子'); closeActionSheet(); await load(); }catch(e){yxErr(e);} }
async function removeSlot(btn){ try{ if(cellHasItems(btn.dataset.zone,btn.dataset.column,btn.dataset.slot)) throw new Error('格子內有商品，請先移除商品再刪除'); if(!confirm('確定刪除此格？後方格號會自動往前補')) return; await yxApi('/api/warehouse/remove-slot',{method:'POST',body:JSON.stringify({zone:btn.dataset.zone,column_index:Number(btn.dataset.column),slot_number:Number(btn.dataset.slot)})}); yxToast('已刪除格子'); closeActionSheet(); await load(); }catch(e){yxErr(e);} }

document.addEventListener('click',e=>{
  const slot=e.target.closest('.yx108-slot');
  if(slot){ if(suppressNextSlotClick){ e.preventDefault(); return; } openCell(slot); return; }
  if(e.target.id==='yx121-add-batch-row') addBatchRow();
  if(e.target.id==='yx121-save-cell') saveCell();
  const del=e.target.closest('[data-wh-del]'); if(del){ current.items.splice(Number(del.dataset.whDel),1); renderCurrent(); }
  if(e.target.id==='warehouse-action-close') closeActionSheet();
  if(e.target.id==='warehouse-action-open' && actionSlot){ closeActionSheet(); openCell(actionSlot); }
  if(e.target.id==='warehouse-action-insert' && actionSlot) insertAfterSlot(actionSlot);
  if(e.target.id==='warehouse-action-delete' && actionSlot) removeSlot(actionSlot);
  const z=e.target.closest('[data-yx-zone]'); if(z){ window.setWarehouseZone(z.dataset.yxZone); return; }
  const a=e.target.closest('[data-yx-action]'); if(a){ const k=a.dataset.yxAction; if(k==='warehouse-search') window.searchWarehouse(); if(k==='warehouse-clear-search'){ const s=$('#warehouse-search'); if(s) s.value=''; window.clearWarehouseHighlights(); } if(k==='warehouse-unplaced') window.toggleWarehouseUnplacedHighlight(); if(k==='warehouse-same-customer') window.highlightWarehouseSameCustomer(); if(k==='warehouse-clear-highlight') window.clearWarehouseHighlights(); if(k==='warehouse-undo') window.undoWarehouseMove(); if(k==='warehouse-close-modal') window.closeWarehouseModal(); }
});
document.addEventListener('change',e=>{ if(e.target.classList && e.target.classList.contains('yx121-batch-select')){ fillBatchOptions(); syncBatchQtyLimits(); } if(e.target.classList && e.target.classList.contains('yx121-batch-qty')) syncBatchQtyLimits(); });
document.addEventListener('contextmenu',e=>{ const slot=e.target.closest('.yx108-slot'); if(slot){ e.preventDefault(); openActionSheet(slot); } });
document.addEventListener('pointerdown',e=>{ const slot=e.target.closest('.yx108-slot'); if(!slot) return; longMoved=false; clearTimeout(longTimer); longTimer=setTimeout(()=>{ if(!longMoved) openActionSheet(slot); },650); });
document.addEventListener('pointermove',()=>{ longMoved=true; clearTimeout(longTimer); });
document.addEventListener('pointerup',()=>clearTimeout(longTimer));
document.addEventListener('input',e=>{ if(e.target.classList && e.target.classList.contains('wh-current-qty')){ const i=Number(e.target.dataset.i); if(current.items[i]) current.items[i].qty=Number(e.target.value||1); } if(e.target && e.target.id==='warehouse-item-search') fillBatchOptions(); });
document.addEventListener('DOMContentLoaded',load); if(document.readyState!=='loading') load();
})();


// V28_EVENT_COMPLETE_WAREHOUSE_COMPAT: 補回目前滿意倉庫舊入口名稱，仍由本頁單 JS 管理。
(function(){'use strict'; if(window.__YX_V28_EVENT_COMPLETE_WAREHOUSE_COMPAT__) return; window.__YX_V28_EVENT_COMPLETE_WAREHOUSE_COMPAT__=true;
  window.__YX_FINAL_WAREHOUSE_HTML_LOCK__=true;
  function action(name){ const el=document.querySelector('[data-yx-action="'+name+'"]'); if(el){ el.click(); return true; } return false; }
  window.searchWarehouse = window.searchWarehouse || function(){ return action('warehouse-search'); };
  window.clearWarehouseSearch = window.clearWarehouseSearch || function(){ return action('warehouse-clear-search'); };
  window.refreshWarehouseUnplaced = window.refreshWarehouseUnplaced || function(){ return action('warehouse-unplaced'); };
  window.undoWarehouse = window.undoWarehouse || function(){ return action('warehouse-undo'); };
  window.closeWarehouseModal = window.closeWarehouseModal || function(){ const m=document.getElementById('warehouse-modal'); if(m) m.classList.add('hidden'); };
  document.addEventListener('DOMContentLoaded',()=>{document.body.classList.add('yx-v27-warehouse-satisfied');});
})();


// CLEAN_EVENTS_V28_EVENT_COMPLETE: 補齊倉庫頁所有 HTML 按鈕/事件入口；不恢復舊 FIX 多支載入。
(function(){'use strict'; if(window.__YX_V28_WAREHOUSE_EVENT_COMPLETE__) return; window.__YX_V28_WAREHOUSE_EVENT_COMPLETE__=true;
  function safe(fn){ try{ if(typeof fn==='function') return fn(); }catch(e){ if(window.yxErr) yxErr(e); else console.error(e); } }
  window.clearWarehouseSearch = window.clearWarehouseSearch || function(){ const s=document.getElementById('warehouse-search'); if(s) s.value=''; safe(window.clearWarehouseHighlights); };
  window.refreshWarehouseUnplaced = window.refreshWarehouseUnplaced || function(){ return safe(window.toggleWarehouseUnplacedHighlight); };
  window.undoWarehouse = window.undoWarehouse || function(){ return safe(window.undoWarehouseMove); };
  document.addEventListener('click', function(e){
    const htmlLock=e.target.closest('[data-html-button-lock]');
    if(!htmlLock) return;
    if(htmlLock.dataset.htmlButtonLock==='warehouse-add-batch' && htmlLock.id!=='yx121-add-batch-row'){
      document.getElementById('yx121-add-batch-row')?.click();
    }
    if(htmlLock.dataset.htmlButtonLock==='warehouse-save-cell' && htmlLock.id!=='yx121-save-cell'){
      document.getElementById('yx121-save-cell')?.click();
    }
  }, true);
})();
