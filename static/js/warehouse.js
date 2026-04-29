import {API} from './api.js';
import {$, $$, toast, empty, modal, escapeHtml} from './ui.js';
let currentZone=localStorage.getItem('yx_zone')||'all';
let lastData={cells:[],items:[]};
export async function renderWarehouse(root){
  root.innerHTML=`<div class="section-head"><h2>倉庫圖</h2><button class="btn ghost" data-nav="home">返回首頁</button></div><div class="warehouse-controls"><button class="btn ${currentZone==='A'?'primary':'secondary'}" data-zone="A">A區</button><button class="btn ${currentZone==='B'?'primary':'secondary'}" data-zone="B">B區</button><button class="btn ${currentZone==='all'?'primary':'secondary'}" data-zone="all">全部</button><button class="btn secondary" id="sameCustomer">同客戶</button><button class="btn secondary" id="unplacedBtn">未入倉</button><button class="btn ghost" id="clearHi">清除高亮</button><input id="whSearch" placeholder="搜尋客戶 / 商品 / 格位"></div><section id="warehouseBody"></section>`;
  $$('[data-zone]',root).forEach(b=>b.onclick=()=>{currentZone=b.dataset.zone;localStorage.setItem('yx_zone',currentZone);renderWarehouse(root);});
  $('#unplacedBtn',root).onclick=async()=>{const d=await API.get('/api/warehouse/unplaced'); toast(`未錄入倉庫圖：${d.pieces}件 / ${d.count}筆`);};
  $('#clearHi',root).onclick=()=>$$('.wh-cell',root).forEach(c=>c.classList.remove('highlight'));
  $('#whSearch',root).oninput=()=>highlightSearch(root,$('#whSearch',root).value);
  $('#sameCustomer',root).onclick=()=>highlightSame(root);
  await load(root);
}
async function load(root){
  const d=await API.get(`/api/warehouse?zone=${currentZone}`); lastData=d; const itemsBy={}; d.items.forEach(it=>{(itemsBy[it.cell_id] ||= []).push(it);});
  const zones=[...new Set(d.cells.map(c=>c.zone))];
  $('#warehouseBody',root).innerHTML=zones.map(zone=>`<div class="warehouse-zone"><h2>${zone}倉</h2>${[1,2,3,4,5,6].map(sec=>renderSection(d.cells.filter(c=>c.zone===zone&&c.section===sec),itemsBy,sec)).join('')}</div>`).join('');
  $$('.wh-cell',root).forEach(cell=>{
    let timer=null,moved=false,start={x:0,y:0};
    cell.onclick=()=>{ if(!moved) editCell(root, Number(cell.dataset.cell)); };
    cell.addEventListener('contextmenu',e=>{e.preventDefault(); cellSheet(root,Number(cell.dataset.cell));});
    cell.addEventListener('pointerdown',e=>{moved=false;start={x:e.clientX,y:e.clientY};timer=setTimeout(()=>{if(!moved) cellSheet(root,Number(cell.dataset.cell));},650);});
    cell.addEventListener('pointermove',e=>{ if(Math.abs(e.clientX-start.x)+Math.abs(e.clientY-start.y)>10){moved=true;clearTimeout(timer);} });
    cell.addEventListener('pointerup',()=>clearTimeout(timer));
  });
}
function renderSection(cells,itemsBy,sec){
  const front=cells.filter(c=>c.row_name==='front').sort((a,b)=>a.slot_index-b.slot_index);
  const back=cells.filter(c=>c.row_name==='back').sort((a,b)=>a.slot_index-b.slot_index);
  return `<div class="warehouse-section"><div class="sec-label">${sec}</div><div class="row-wrap"><div class="wh-row"><span class="front-label">前</span>${front.map(c=>renderCell(c,itemsBy[c.id]||[])).join('')}</div><div class="wh-row"><span class="front-label">後</span>${back.map(c=>renderCell(c,itemsBy[c.id]||[])).join('')}</div></div></div>`;
}
function renderCell(c,items){
  const names=[...new Set(items.map(x=>x.customer||'庫存'))].join('/');
  const counts=items.map(x=>x.pieces||0).filter(Boolean);
  const total=counts.reduce((a,b)=>a+Number(b||0),0);
  return `<div class="wh-cell ${items.length?'used':''}" data-cell="${c.id}" data-key="${escapeHtml((names+' '+items.map(x=>x.product_text).join(' ')).toLowerCase())}"><div class="wh-line1"><span class="wh-no">${c.slot_index}</span><span class="wh-customer">${escapeHtml(names||'空格')}</span></div><div class="wh-line2"><span class="wh-counts">${counts.join('+')}</span><span class="wh-total">${total?total+'件':''}</span></div></div>`;
}
function highlightSearch(root,q){ q=(q||'').toLowerCase().trim(); $$('.wh-cell',root).forEach(c=>c.classList.toggle('highlight', q && c.dataset.key.includes(q))); }
function highlightSame(root){ const name=prompt('要高亮哪個客戶？'); if(!name) return; $$('.wh-cell',root).forEach(c=>c.classList.toggle('highlight', c.dataset.key.includes(name.toLowerCase()))); }
async function editCell(root,cellId){
  const items=lastData.items.filter(x=>Number(x.cell_id)===Number(cellId));
  const dlg=modal(`<h3>格子明細 / 編輯</h3><p class="subtle">每行格式：客戶｜材質｜商品資料｜件數</p><textarea id="cellText">${items.map(x=>`${x.customer||'庫存'}｜${x.material||''}｜${x.product_text||''}｜${x.pieces||0}`).join('\n')}</textarea><div class="modal-actions"><button class="btn ghost" data-close>取消</button><button class="btn primary" id="saveCell">儲存此格</button></div>`);
  $('#saveCell',dlg).onclick=async()=>{const lines=$('#cellText',dlg).value.split('\n').map(x=>x.trim()).filter(Boolean); const payload=lines.map(line=>{const [customer,material,product_text,pieces]=line.split('｜'); return {customer:customer==='庫存'?'':customer,material,product_text,pieces:Number(pieces||0)};}); await API.post(`/api/warehouse/cells/${cellId}/items`,{items:payload}); dlg.close(); toast('已儲存格子'); load(root);};
}
function cellSheet(root,cellId){
  const dlg=modal(`<h3>格子操作</h3><div class="toolbar"><button class="btn primary" id="editCellBtn">查看/編輯</button><button class="btn secondary" id="insertCellBtn">插入格子</button><button class="btn danger" id="deleteCellBtn">刪除格子</button><button class="btn ghost" data-close>關閉</button></div>`);
  $('#editCellBtn',dlg).onclick=()=>{dlg.close();editCell(root,cellId);};
  $('#insertCellBtn',dlg).onclick=async()=>{await API.post(`/api/warehouse/cells/${cellId}/insert`,{});dlg.close();toast('已插入格子');load(root);};
  $('#deleteCellBtn',dlg).onclick=async()=>{if(confirm('刪除格子也會清除此格明細，確定？')){await API.del(`/api/warehouse/cells/${cellId}`);dlg.close();toast('已刪除格子');load(root);}};
}
