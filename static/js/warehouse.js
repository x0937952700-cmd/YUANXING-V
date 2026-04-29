let currentZone=localStorage.getItem('yx_zone')||'A';
document.addEventListener('DOMContentLoaded',()=>{
  YX.$$('.seg button').forEach(b=>b.onclick=()=>{ currentZone=b.dataset.zone; localStorage.setItem('yx_zone',currentZone); loadWarehouse(); });
  YX.$('#highlightUnlisted').onclick=async()=>{ const d=await YX.api('/api/activity/unlisted'); YX.toast(`未錄入倉庫圖總件數：${d.total}`); };
  YX.$('#clearHighlight').onclick=()=>YX.$$('.cell').forEach(c=>c.classList.remove('highlight'));
  loadWarehouse();
});
async function loadWarehouse(){
  YX.$$('.seg button').forEach(b=>b.classList.toggle('active',b.dataset.zone===currentZone));
  const url='/api/warehouse'+(currentZone==='ALL'?'':'?zone='+currentZone);
  const d=await YX.api(url); renderWarehouse(d.cells||[]);
}
function renderWarehouse(cells){
  const box=YX.$('#warehouseMap'); const zones=[...new Set(cells.map(c=>c.zone))];
  box.innerHTML=zones.map(z=>`<section><div class="zone-title">${z} 倉</div>${[1,2,3,4,5,6].map(b=>renderBand(z,b,cells.filter(c=>c.zone===z&&c.band===b))).join('')}</section>`).join('');
  YX.$$('.cell').forEach(cell=>{
    let pressTimer=null;
    cell.onpointerdown=()=>{ pressTimer=setTimeout(()=>cellMenu(cell),650); };
    cell.onpointerup=()=>clearTimeout(pressTimer);
    cell.onpointermove=()=>clearTimeout(pressTimer);
    cell.onclick=()=>editCell(cell);
  });
}
function renderBand(z,b,cells){
  const row=(rn,label)=>`<div class="wh-row"><div class="row-label">${label}</div>${cells.filter(c=>c.row_name===rn).sort((a,b)=>a.slot-b.slot).map(renderCell).join('')}</div>`;
  return `<div class="band"><div class="band-title">第 ${b} 段</div>${row('front','前排')}${row('back','後排')}</div>`;
}
function renderCell(c){
  const items=c.items||[]; const used=items.length; const customer=used?items.map(i=>i.customer||'庫存').join('/'):'空'; const counts=used?items.map(i=>i.pieces||0).join('+'):''; const total=items.reduce((s,i)=>s+Number(i.pieces||0),0);
  return `<div class="cell ${used?'used':''}" data-zone="${c.zone}" data-band="${c.band}" data-row="${c.row_name}" data-slot="${c.slot}" data-items='${YX.esc(JSON.stringify(items))}'><div class="cell-top"><span>${c.slot}</span><span class="cell-customer">${YX.esc(customer)}</span></div><div><span class="cell-count">${YX.esc(counts)}</span>${used?`<span class="cell-count" style="float:right">${total}件</span>`:'<span class="cell-empty">未使用</span>'}</div></div>`;
}
async function editCell(cell){
  const items=JSON.parse(cell.dataset.items||'[]');
  const customer=prompt('客戶名稱，空白代表庫存', items[0]?.customer||''); if(customer===null) return;
  const pieces=prompt('件數加總式，例如 4+2+1', items.map(i=>i.pieces).join('+')||''); if(pieces===null) return;
  const arr=pieces.split('+').filter(Boolean).map(p=>({customer:customer||'庫存',pieces:Number(p)||0}));
  await saveCell(cell,arr);
}
async function cellMenu(cell){
  const act=prompt('長按格子：輸入 1 插入格子，2 刪除格子，其他取消');
  if(act==='1') await YX.api('/api/warehouse/insert-slot',{method:'POST',body:{zone:cell.dataset.zone,band:cell.dataset.band,row_name:cell.dataset.row,slot:cell.dataset.slot,request_key:YX.key()}});
  if(act==='2') await YX.api('/api/warehouse/delete-slot',{method:'POST',body:{zone:cell.dataset.zone,band:cell.dataset.band,row_name:cell.dataset.row,slot:cell.dataset.slot,request_key:YX.key()}});
  if(act==='1'||act==='2') loadWarehouse();
}
async function saveCell(cell,items){ await YX.api('/api/warehouse/cell',{method:'POST',body:{zone:cell.dataset.zone,band:Number(cell.dataset.band),row_name:cell.dataset.row,slot:Number(cell.dataset.slot),items,request_key:YX.key()}}); YX.toast('格子已儲存'); loadWarehouse(); }
