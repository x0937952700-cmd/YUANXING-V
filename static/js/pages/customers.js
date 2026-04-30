import { get, post, put } from '../core/api.js';
import { pageShell, esc, toast, installLongPress } from '../utils/dom.js';
import { customerCard } from './sharedItems.js';
import { openCustomerActionModal } from './customerActions.js';

function renderGroups(rows){
  return ['北區','中區','南區'].map(r=>`<div class="region-col"><div class="region-title">${r}</div>${rows.filter(c=>c.region===r).map(c=>customerCard(c)).join('') || '<div class="empty">目前沒有客戶</div>'}</div>`).join('');
}
function renderArchived(rows){
  if(!rows.length) return '<div class="empty">目前沒有封存客戶</div>';
  return rows.map(c=>`<div class="item-card"><div class="item-main"><b>${esc(c.name)}</b><div class="muted">${esc(c.region||'')}｜${Number(c.total_qty||0)}件 / ${Number(c.total_rows||0)}筆</div><button class="small secondary" data-restore-customer="${esc(c.uid)}">還原</button></div></div>`).join('');
}

export async function renderCustomers(app) {
  app.innerHTML = pageShell('客戶資料', `<div class="section-title">客戶資料</div>
  <div class="customers-layout">
    <div class="card"><form id="customerForm" class="form-grid"><input type="hidden" name="uid"><label class="field"><span>客戶名稱</span><input name="name" required></label><label class="field"><span>電話</span><input name="phone"></label><label class="field"><span>地址</span><input name="address"></label><label class="field"><span>特殊要求</span><textarea name="special_notes"></textarea></label><label class="field"><span>常用材質：</span><input name="common_materials" placeholder="尚未建立"></label><label class="field"><span>常用尺寸：</span><input name="common_sizes" placeholder="尚未建立"></label><label class="field"><span>區域</span><select name="region"><option>北區</option><option>中區</option><option>南區</option></select></label><label class="field"><span>CNF / FOB / FOB代</span><input name="trade_type"></label><button class="primary">儲存客戶</button><button id="clearForm" type="button" class="secondary">清空</button></form></div>
    <div><div class="muted" style="text-align:right;margin-bottom:12px">可手動編輯名稱、電話、地址、特殊要求、常用材質、常用尺寸</div><div class="toolbar"><input id="customerSearch" placeholder="搜尋客戶"><button id="loadArchived" class="secondary">封存客戶</button></div><div id="customers" class="customer-grid"></div><div id="archivedCustomers" class="card hidden"></div></div>
  </div>`);
  let allRows = [];
  async function refresh(){ const res=await get('/api/customers'); allRows=res.items||[]; renderFiltered(); }
  function renderFiltered(){ const q=(document.getElementById('customerSearch')?.value||'').trim(); const rows=q?allRows.filter(c=>String(c.name||'').includes(q) || String(c.phone||'').includes(q) || String(c.address||'').includes(q)):allRows; document.getElementById('customers').innerHTML = renderGroups(rows); }
  async function loadArchived(){ const res=await get('/api/customers/archived'); const box=document.getElementById('archivedCustomers'); box.classList.remove('hidden'); box.innerHTML = `<div class="section-title">封存客戶</div>${renderArchived(res.items||[])}`; }
  await refresh();
  document.getElementById('customerSearch').addEventListener('input', renderFiltered);
  document.getElementById('customerForm').addEventListener('submit', async e=>{ e.preventDefault(); const data=Object.fromEntries(new FormData(e.currentTarget).entries()); if(data.uid) await put(`/api/customers/${data.uid}`, data); else await post('/api/customers', data); toast('客戶已儲存'); e.currentTarget.reset(); await refresh(); });
  document.getElementById('clearForm').addEventListener('click',()=>document.getElementById('customerForm').reset());
  document.getElementById('loadArchived').addEventListener('click', loadArchived);
  document.getElementById('archivedCustomers').addEventListener('click', async e=>{ const uid=e.target.dataset.restoreCustomer; if(!uid)return; await post(`/api/customers/${uid}/restore`,{}); toast('客戶已還原'); await refresh(); await loadArchived(); });
  async function fillForm(uid){ const c=allRows.find(x=>x.uid===uid) || (await get('/api/customers')).items?.find(x=>x.uid===uid); if(!c)return; const form=document.getElementById('customerForm'); for(const [k,v] of Object.entries(c)){ if(form.elements[k]) form.elements[k].value=v??''; } }
  document.getElementById('customers').addEventListener('click', async e=>{ const card=e.target.closest('.customer-card'); if(!card)return; await fillForm(card.dataset.customerUid); });
  installLongPress(document.getElementById('customers'), '.customer-card', (card)=>openCustomerActionModal(card,{onRefresh:refresh,onOpen:fillForm}));
}
