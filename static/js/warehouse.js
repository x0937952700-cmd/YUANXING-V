let currentZone=localStorage.getItem('yx_zone')||'A';
let dragItem=null;
let dragFromCell=null;
document.addEventListener('DOMContentLoaded',()=>{
  YX.$$('.seg button').forEach(b=>b.onclick=()=>{ currentZone=b.dataset.zone; localStorage.setItem('yx_zone',currentZone); loadWarehouse(); });
  YX.$('#highlightUnlisted').onclick=async()=>{ const d=await YX.api('/api/activity/unlisted'); YX.toast(`未錄入倉庫圖總件數：${d.total}`); loadUnlistedItems(); };
  YX.$('#highlightSame').onclick=()=>highlightSameCustomer();
  YX.$('#clearHighlight').onclick=()=>YX.$$('.cell').forEach(c=>c.classList.remove('highlight'));
  YX.$('#undoWarehouse').onclick=()=>undoWarehouse();
  YX.$('#warehouseSearchBtn').onclick=()=>searchWarehouse();
  YX.$('#warehouseSearch').addEventListener('keydown',e=>{ if(e.key==='Enter') searchWarehouse(); });
  document.addEventListener('yx:sync',()=>{ if(document.visibilityState==='visible') loadUnlistedItems(); });
  const initialQ=new URLSearchParams(location.search).get('q');
  if(initialQ && YX.$('#warehouseSearch')) YX.$('#warehouseSearch').value=initialQ;
  loadWarehouse().then(()=>{ if(initialQ) searchWarehouse(); }); loadUnlistedItems();
});
async function loadWarehouse(){
  YX.$$('.seg button').forEach(b=>b.classList.toggle('active',b.dataset.zone===currentZone));
  const url='/api/warehouse'+(currentZone==='ALL'?'':'?zone='+currentZone);
  const d=await YX.api(url); renderWarehouse(d.cells||[]);
}
async function loadUnlistedItems(){
  const box=YX.$('#unlistedItems'); if(!box) return;
  const d=await YX.api('/api/warehouse/unlisted-items');
  if(!d.items.length){ box.innerHTML='<div class="hint">目前沒有未錄入倉庫圖商品</div>'; return; }
  box.innerHTML=d.items.slice(0,120).map(it=>`<button class="mini-item" draggable="true" data-item='${YX.esc(JSON.stringify(it))}'><b>${YX.esc(it.customer_name||'庫存')}</b>｜${YX.esc(it.product_text)}｜${it.pieces}件｜${it.source}</button>`).join('');
  YX.$$('.mini-item',box).forEach(el=>{
    el.ondragstart=e=>{ try{ dragItem=JSON.parse(el.dataset.item); e.dataTransfer.setData('text/plain',el.dataset.item); }catch(_){ dragItem=null; } };
    el.onclick=()=>{ try{ dragItem=JSON.parse(el.dataset.item); YX.toast('已選取商品，點倉庫格可放入最前排'); }catch(_){ dragItem=null; YX.toast('商品資料格式錯誤',true); } };
  });
}
function renderWarehouse(cells){
  const box=YX.$('#warehouseMap'); const zones=[...new Set(cells.map(c=>c.zone))];
  box.innerHTML=zones.map(z=>`<section><div class="zone-title">${z} 倉</div>${[1,2,3,4,5,6].map(b=>renderBand(z,b,cells.filter(c=>c.zone===z&&c.band===b))).join('')}</section>`).join('');
  bindCells();
}
function bindCells(root=document){
  YX.$$('.cell',root).forEach(cell=>{
    let pressTimer=null, longPressed=false;
    const hasItems=()=>{ try{return JSON.parse(cell.dataset.items||'[]').length>0;}catch(_){return false;} };
    cell.draggable=hasItems();
    cell.onpointerdown=()=>{ longPressed=false; pressTimer=setTimeout(()=>{longPressed=true; cellMenu(cell);},650); };
    cell.onpointerup=()=>clearTimeout(pressTimer);
    cell.onpointermove=()=>clearTimeout(pressTimer);
    cell.ondragstart=e=>{ if(!hasItems()) return; dragFromCell=cell; dragItem=null; e.dataTransfer.setData('application/x-yx-cell','1'); };
    cell.ondragend=()=>{ dragFromCell=null; };
    cell.ondragover=e=>e.preventDefault();
    cell.ondrop=async e=>{
      e.preventDefault(); clearTimeout(pressTimer);
      const raw=e.dataTransfer.getData('text/plain');
      if(raw){ try{ dragItem=JSON.parse(raw); }catch(_){ dragItem=null; } }
      if(dragItem){ await dropItemToCell(cell, dragItem); dragItem=null; return; }
      if(dragFromCell && dragFromCell!==cell){ await moveCellItems(dragFromCell, cell); dragFromCell=null; }
    };
    cell.onclick=async()=>{ if(longPressed) return; if(dragItem){ await dropItemToCell(cell, dragItem); dragItem=null; } else { editCell(cell); } };
  });
}
function renderBand(z,b,cells){
  const row=(rn,label)=>`<div class="wh-row"><div class="row-label">${label}</div>${cells.filter(c=>c.row_name===rn).sort((a,b)=>a.slot-b.slot).map(renderCell).join('')}</div>`;
  return `<div class="band"><div class="band-title">第 ${b} 段</div>${row('front','前排')}${row('back','後排')}</div>`;
}
function renderCell(c){
  const items=c.items||[]; const used=items.length;
  const groups=new Map();
  items.forEach(i=>{ const name=i.customer||i.customer_name||'庫存'; const cur=groups.get(name)||[]; cur.push(Number(i.pieces||0)); groups.set(name,cur); });
  const customer=used?Array.from(groups.keys()).join('/'):'空';
  const counts=used?Array.from(groups.values()).map(arr=>arr.join('+')).join('/') : '';
  const total=items.reduce((sum,i)=>sum+Number(i.pieces||0),0);
  return `<div class="cell ${used?'used':''}" data-zone="${c.zone}" data-band="${c.band}" data-row="${c.row_name}" data-slot="${c.slot}" data-items='${YX.esc(JSON.stringify(items))}'><div class="cell-top"><span>${c.slot}</span><span class="cell-customer">${YX.esc(customer)}</span></div><div><span class="cell-count">${YX.esc(counts)}</span>${used?`<span class="cell-count cell-total">${total}件</span>`:'<span class="cell-empty">未使用</span>'}</div></div>`;
}
async function dropItemToCell(cell,item){
  const items=JSON.parse(cell.dataset.items||'[]');
  const newItem={source:item.source,id:item.id,source_id:item.id,customer:item.customer_name||'庫存',customer_name:item.customer_name||'庫存',product_text:item.product_text,material:item.material,pieces:item.pieces};
  items.unshift(newItem); // 已有商品時，新商品放最前排
  await saveCell(cell,items);
  await loadUnlistedItems();
}
async function editCell(cell){
  const items=JSON.parse(cell.dataset.items||'[]');
  const detail=items.length?items.map(i=>`${i.customer||i.customer_name||'庫存'} ${i.product_text||''} ${i.pieces||0}件`).join('\n'):'目前空格';
  if(!confirm(`${detail}\n\n按確定可手動覆寫此格簡化件數，按取消只查看。`)) return;
  const customer=prompt('客戶名稱，空白代表庫存', items[0]?.customer||items[0]?.customer_name||''); if(customer===null) return;
  const pieces=prompt('件數加總式，例如 4+2+1', items.map(i=>i.pieces).join('+')||''); if(pieces===null) return;
  const arr=pieces.split('+').filter(Boolean).map(p=>({customer:customer||'庫存',customer_name:customer||'庫存',pieces:Number(p)||0}));
  await saveCell(cell,arr);
}
async function cellMenu(cell){
  const act=prompt('長按格子：輸入 1 插入格子，2 刪除格子，其他取消');
  if(act==='1') await YX.api('/api/warehouse/insert-slot',{method:'POST',body:{zone:cell.dataset.zone,band:Number(cell.dataset.band),row_name:cell.dataset.row,slot:Number(cell.dataset.slot),request_key:YX.key()}});
  if(act==='2') await YX.api('/api/warehouse/delete-slot',{method:'POST',body:{zone:cell.dataset.zone,band:Number(cell.dataset.band),row_name:cell.dataset.row,slot:Number(cell.dataset.slot),request_key:YX.key()}});
  if(act==='1'||act==='2'){ await loadWarehouse(); await loadUnlistedItems(); }
}
async function saveCell(cell,items){
  const d=await YX.api('/api/warehouse/cell',{method:'POST',body:{zone:cell.dataset.zone,band:Number(cell.dataset.band),row_name:cell.dataset.row,slot:Number(cell.dataset.slot),items,request_key:YX.key()}});
  YX.toast('格子已儲存');
  await refreshCell(cell.dataset.zone, cell.dataset.band, cell.dataset.row, cell.dataset.slot, d.items);
}
async function refreshCell(zone,band,row,slot,itemsOverride=null){
  let cellData={zone,band:Number(band),row_name:row,slot:Number(slot),items:itemsOverride};
  if(!itemsOverride){ const d=await YX.api(`/api/warehouse/cell?zone=${zone}&band=${band}&row_name=${row}&slot=${slot}`); cellData=d.cell; }
  const old=YX.$(`.cell[data-zone="${zone}"][data-band="${band}"][data-row="${row}"][data-slot="${slot}"]`);
  if(old){ old.outerHTML=renderCell(cellData); bindCells(document); }
}
async function moveCellItems(fromCell,toCell){
  const sourceItems=JSON.parse(fromCell.dataset.items||'[]');
  if(!sourceItems.length) return;
  const d=await YX.api('/api/warehouse/move-cell',{method:'POST',body:{
    from:{zone:fromCell.dataset.zone,band:Number(fromCell.dataset.band),row_name:fromCell.dataset.row,slot:Number(fromCell.dataset.slot)},
    to:{zone:toCell.dataset.zone,band:Number(toCell.dataset.band),row_name:toCell.dataset.row,slot:Number(toCell.dataset.slot)},
    request_key:YX.key()
  }});
  if(d.to) await refreshCell(d.to.zone,d.to.band,d.to.row_name,d.to.slot,d.to.items);
  if(d.from) await refreshCell(d.from.zone,d.from.band,d.from.row_name,d.from.slot,d.from.items);
  YX.toast('已移動格子');
  await loadUnlistedItems();
}
async function undoWarehouse(){
  await YX.api('/api/warehouse/undo',{method:'POST',body:{request_key:YX.key()}});
  YX.toast('已撤回上一步');
  await loadWarehouse(); await loadUnlistedItems();
}
async function searchWarehouse(){
  const q=YX.$('#warehouseSearch').value.trim(); if(!q) return YX.toast('請輸入搜尋文字',true);
  const d=await YX.api('/api/warehouse/search?q='+encodeURIComponent(q));
  if(!d.matches.length) return YX.toast('找不到倉庫位置',true);
  const m=d.matches[0];
  currentZone=m.zone; localStorage.setItem('yx_zone',currentZone);
  await loadWarehouse();
  const sel=`.cell[data-zone="${m.zone}"][data-band="${m.band}"][data-row="${m.row_name}"][data-slot="${m.slot}"]`;
  const cell=YX.$(sel);
  if(cell){ cell.scrollIntoView({behavior:'smooth',block:'center',inline:'center'}); cell.classList.add('highlight','flash'); setTimeout(()=>cell.classList.remove('flash'),1600); }
  YX.toast(`已定位：${m.zone}-${m.band}-${m.row_name}-${m.slot}`);
}
function highlightSameCustomer(){
  const q=prompt('輸入要高亮的客戶名稱');
  if(!q) return;
  YX.$$('.cell').forEach(c=>{
    const items=JSON.parse(c.dataset.items||'[]');
    c.classList.toggle('highlight',items.some(i=>String(i.customer||i.customer_name||'').includes(q)));
  });
}
