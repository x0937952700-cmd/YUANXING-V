import { get, post } from '../core/api.js';
import { state } from '../core/state.js';
import { pageShell, esc, toast, modal } from '../utils/dom.js';

function cellHtml(cell) {
  const s = cell.summary || {};
  const used = (cell.items || []).length > 0;
  return `<div class="cell ${used?'used':''}" draggable="${used ? 'true' : 'false'}" data-zone="${cell.zone}" data-col="${cell.column_index}" data-slot="${cell.slot_number}">
    <div class="cell-row"><span class="cell-no">${cell.slot_number}</span><span class="cell-names">${esc(s.names || '')}</span></div>
    <div class="cell-row"><span class="cell-qty-expr">${esc(s.qty_expr || '')}</span><span class="cell-total">${s.total_qty ? s.total_qty + '件' : ''}</span></div>
  </div>`;
}
function renderCells(cells) {
  const zones = state.warehouse.activeZone === 'ALL' ? ['A','B'] : [state.warehouse.activeZone];
  return zones.map(zone => {
    const zoneCells = cells.filter(c=>c.zone===zone);
    const cols = [1,2,3,4,5,6].map(col => `<div class="warehouse-col"><div class="col-title">${zone}-${col}</div>${zoneCells.filter(c=>c.column_index===col).map(cellHtml).join('')}</div>`).join('');
    return `<section class="warehouse-zone"><div class="section-title">${zone} 區</div><div class="warehouse-columns">${cols}</div></section>`;
  }).join('');
}
function jumpToStoredCell(){
  const raw = sessionStorage.getItem('yx_jump_cell'); if(!raw) return;
  try{
    const j = JSON.parse(raw);
    if(state.warehouse.activeZone !== 'ALL' && state.warehouse.activeZone !== j.zone){ state.warehouse.activeZone=j.zone; localStorage.setItem('yx_active_zone', j.zone); loadWarehouse(); return; }
    const el=document.querySelector(`.cell[data-zone="${j.zone}"][data-col="${j.col}"][data-slot="${j.slot}"]`);
    if(el){ el.classList.add('highlight','flash'); el.scrollIntoView({block:'center',inline:'center',behavior:'smooth'}); setTimeout(()=>el.classList.remove('flash'),1600); sessionStorage.removeItem('yx_jump_cell'); }
  }catch{}
}
async function loadWarehouse(){ const zone = state.warehouse.activeZone === 'ALL' ? '' : state.warehouse.activeZone; const res=await get(`/api/warehouse?zone=${zone}`); state.warehouse.cells = res.items || []; document.getElementById('warehouseArea').innerHTML = renderCells(state.warehouse.cells); jumpToStoredCell(); }
async function refreshUnlisted(){ const zone = state.warehouse.activeZone === 'ALL' ? '' : state.warehouse.activeZone; const res=await get(`/api/warehouse/available-items?zone=${zone}`); document.getElementById('unlistedCount').textContent = `${res.total_qty || 0}件`; state.warehouse.availableItems = res.items || []; }
function renderCellItems(items){
  return items.length ? items.map((it,i)=>`<div class="item-card cell-item" draggable="true" data-cell-item-index="${i}"><div class="item-main"><b>${esc(it.customer_name||'庫存')}</b><div>${esc(it.product_text||'')}</div><div class="qty">${Number(it.qty||0)}件｜${esc(it.placement_label||'前排')}｜拖拉可調整前後排</div><button class="small danger" data-remove-cell-item="${i}">移除單筆</button></div></div>`).join('') : '<div class="empty">此格沒有商品</div>';
}
export async function renderWarehouse(app) {
  app.innerHTML = pageShell('倉庫圖', `<div class="warehouse-toolbar card"><div class="toolbar"><button data-zonebtn="ALL" class="secondary">全部</button><button data-zonebtn="A" class="secondary">A 區</button><button data-zonebtn="B" class="secondary">B 區</button><span class="pill">未入倉：<b id="unlistedCount">--</b></span><button id="refreshUnlisted" class="secondary">刷新未錄入倉庫圖</button><input id="warehouseSearch" placeholder="搜尋客戶 / 商品 / 格位"><button id="clearHighlight" class="ghost">清除高亮</button><button id="undoWarehouse" class="secondary">還原上一步</button></div></div><div id="warehouseArea" class="warehouse loading-card">載入中…</div>`);
  await loadWarehouse(); await refreshUnlisted();
  document.querySelectorAll('[data-zonebtn]').forEach(btn=>btn.addEventListener('click', async()=>{ state.warehouse.activeZone=btn.dataset.zonebtn; localStorage.setItem('yx_active_zone', state.warehouse.activeZone); await loadWarehouse(); await refreshUnlisted(); }));
  document.getElementById('refreshUnlisted').addEventListener('click', refreshUnlisted);
  document.getElementById('clearHighlight').addEventListener('click',()=>document.querySelectorAll('.cell.highlight').forEach(x=>x.classList.remove('highlight')));
  document.getElementById('undoWarehouse').addEventListener('click', async()=>{ try{ await post('/api/undo-last',{}); toast('已還原上一步'); await loadWarehouse(); await refreshUnlisted(); }catch(err){ toast(err.message,'error'); } });
  document.getElementById('warehouseSearch').addEventListener('input', e=>{ const q=e.target.value.trim(); document.querySelectorAll('.cell').forEach(x=>x.classList.remove('highlight')); if(!q)return; const found = state.warehouse.cells.filter(c => `${c.zone}-${c.column_index}-${c.slot_number}`.includes(q) || JSON.stringify(c.items||[]).includes(q)); for(const c of found){ const el=document.querySelector(`.cell[data-zone="${c.zone}"][data-col="${c.column_index}"][data-slot="${c.slot_number}"]`); if(el){ el.classList.add('highlight'); el.scrollIntoView({block:'center',inline:'center',behavior:'smooth'}); } } });

  let dragSource = null; let pointerStart = null; let pointerMoved = false; let suppressClick = false;
  const cellPayload = (el) => ({zone:el.dataset.zone, column_index:Number(el.dataset.col), slot_number:Number(el.dataset.slot)});
  async function moveCellItem(fromEl, toEl){ if(!fromEl || !toEl || fromEl===toEl) return; await post('/api/warehouse/move', {from:cellPayload(fromEl), to:cellPayload(toEl), item_index:0}); toast('已移到目標格前排'); await loadWarehouse(); await refreshUnlisted(); }
  document.getElementById('warehouseArea').addEventListener('dragstart', e=>{ const el=e.target.closest('.cell.used'); if(!el)return; dragSource=el; e.dataTransfer.setData('text/plain', JSON.stringify(cellPayload(el))); });
  document.getElementById('warehouseArea').addEventListener('dragover', e=>{ if(e.target.closest('.cell')) e.preventDefault(); });
  document.getElementById('warehouseArea').addEventListener('drop', async e=>{ const target=e.target.closest('.cell'); if(!target || !dragSource)return; e.preventDefault(); await moveCellItem(dragSource, target); dragSource=null; });
  document.getElementById('warehouseArea').addEventListener('pointerdown', e=>{ const el=e.target.closest('.cell.used'); if(!el)return; dragSource=el; pointerStart={x:e.clientX,y:e.clientY}; pointerMoved=false; });
  document.getElementById('warehouseArea').addEventListener('pointermove', e=>{ if(!pointerStart || !dragSource)return; if(Math.abs(e.clientX-pointerStart.x)>12 || Math.abs(e.clientY-pointerStart.y)>12){ pointerMoved=true; dragSource.classList.add('dragging'); } });
  document.getElementById('warehouseArea').addEventListener('pointerup', async e=>{ if(!pointerStart || !dragSource)return; const from=dragSource; from.classList.remove('dragging'); if(pointerMoved){ const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('.cell'); dragSource=null; pointerStart=null; pointerMoved=false; suppressClick=true; setTimeout(()=>suppressClick=false, 80); if(target){ await moveCellItem(from,target); } return; } dragSource=null; pointerStart=null; });

  document.getElementById('warehouseArea').addEventListener('click', async e=>{ if(suppressClick || pointerMoved){ pointerMoved=false; return; } const el=e.target.closest('.cell'); if(!el)return; const zone=el.dataset.zone, col=Number(el.dataset.col), slot=Number(el.dataset.slot); const cell=state.warehouse.cells.find(c=>c.zone===zone && Number(c.column_index)===col && Number(c.slot_number)===slot); const body=`<div class="preview-box">目前格位：${zone} 區第 ${col} 欄第 ${slot} 格</div><div id="cellItems">${renderCellItems(cell.items||[])}</div><div class="toolbar"><button id="addAvailable" class="secondary">加入未錄入商品</button><button id="saveCell" class="primary">儲存格位</button><button id="insertAfter" class="secondary">在此格後插入格子</button><button id="deleteSlot" class="danger">刪除此格</button></div><div id="availableBox"></div>`;
    const m = modal('格位操作', body); let items = [...(cell.items||[])]; let draggedIndex=null;
    function rerenderItems(){ const box=m.querySelector('#cellItems'); if(box) box.innerHTML=renderCellItems(items); }
    m.addEventListener('dragstart', ev=>{ const card=ev.target.closest('[data-cell-item-index]'); if(card){ draggedIndex=Number(card.dataset.cellItemIndex); ev.dataTransfer.setData('text/plain', String(draggedIndex)); }});
    m.addEventListener('dragover', ev=>{ if(ev.target.closest('[data-cell-item-index]')) ev.preventDefault(); });
    m.addEventListener('drop', ev=>{ const target=ev.target.closest('[data-cell-item-index]'); if(!target || draggedIndex===null)return; ev.preventDefault(); const to=Number(target.dataset.cellItemIndex); if(to!==draggedIndex){ const [moved]=items.splice(draggedIndex,1); moved.placement_label='前排'; items.splice(to,0,moved); rerenderItems(); toast('已調整順序，請按儲存格位'); } draggedIndex=null; });
    m.addEventListener('click', async ev=>{ if(ev.target.dataset.removeCellItem){ items.splice(Number(ev.target.dataset.removeCellItem),1); rerenderItems(); }
      if(ev.target.id==='addAvailable'){
        await refreshUnlisted();
        document.getElementById('availableBox').innerHTML = (state.warehouse.availableItems||[]).slice(0,30).map(it=>`<div class="item-card"><div class="item-main"><b>${esc(it.customer_name||'庫存')}｜${esc(it.source_label)}</b><div>${esc(it.product_text)}</div><div class="qty">可加入 ${it.qty} 件</div><button class="small" data-add-avail='${JSON.stringify({source:it.source,id:it.id,customer_name:it.customer_name||'庫存',customer_uid:it.customer_uid||'',product_text:it.product_text,material:it.material,qty:it.qty,placement_label:'前排'}).replace(/'/g,'&#39;')}'>加入此格</button></div></div>`).join('') || '<div class="empty">沒有未錄入商品</div>';
      }
      if(ev.target.dataset.addAvail){
        const data = JSON.parse(ev.target.dataset.addAvail);
        const maxQty = Math.max(1, Number(data.qty || 1));
        const raw = prompt(`要加入此格幾件？最多 ${maxQty} 件`, String(maxQty));
        if(raw === null) return;
        const qty = Math.max(1, Math.min(maxQty, Number(raw || 1)));
        data.qty = qty;
        items.unshift(data);
        rerenderItems();
        toast('已加入此格，請按儲存格位');
      }
      if(ev.target.id==='saveCell'){ await post('/api/warehouse/cell',{zone,column_index:col,slot_number:slot,items}); toast('格位已儲存'); m.remove(); await loadWarehouse(); await refreshUnlisted(); }
      if(ev.target.id==='insertAfter'){ await post('/api/warehouse/add-slot',{zone,column_index:col,after_slot:slot}); toast('已插入格子'); m.remove(); await loadWarehouse(); }
      if(ev.target.id==='deleteSlot'){ try{ await post('/api/warehouse/remove-slot',{zone,column_index:col,slot_number:slot}); toast('已刪除格子'); m.remove(); await loadWarehouse(); }catch(err){ toast(err.message,'error'); } }
    });
  });
}
