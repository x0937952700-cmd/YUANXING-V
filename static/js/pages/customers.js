import { get, post, put } from '../core/api.js';
import { pageShell, esc, toast, installLongPress } from '../utils/dom.js';
import { customerCard } from './sharedItems.js';
import { openCustomerActionModal } from './customerActions.js';

function renderGroups(rows){
  return ['北區','中區','南區'].map(r=>`<div class="region-col"><div class="region-title">${r}</div>${rows.filter(c=>c.region===r).map(c=>customerCard(c)).join('') || '<div class="empty">沒有客戶</div>'}</div>`).join('');
}
function renderArchived(rows){
  if(!rows.length) return '<div class="empty">目前沒有封存客戶</div>';
  return rows.map(c=>`<div class="item-card"><div class="item-main"><b>${esc(c.name)}</b><div class="muted">${esc(c.region||'')}｜${Number(c.total_qty||0)}件 / ${Number(c.total_rows||0)}筆</div><button class="small secondary" data-restore-customer="${esc(c.uid)}">還原</button></div></div>`).join('');
}

export async function renderCustomers(app) {
  app.innerHTML = pageShell('客戶資料', `<div class="card"><div class="section-title">建立 / 編輯客戶</div><form id="customerForm" class="form-grid"><input type="hidden" name="uid"><label class="field"><span>客戶名稱</span><input name="name" required></label><label class="field"><span>區域</span><select name="region"><option>北區</option><option>中區</option><option>南區</option></select></label><label class="field"><span>CNF / FOB / FOB代</span><input name="trade_type"></label><label class="field"><span>電話</span><input name="phone"></label><label class="field" style="grid-column:1/-1"><span>地址</span><input name="address"></label><label class="field"><span>常用材質</span><input name="common_materials"></label><label class="field"><span>常用尺寸</span><input name="common_sizes"></label><label class="field" style="grid-column:1/-1"><span>特殊要求</span><textarea name="special_notes"></textarea></label><button class="primary">儲存客戶</button><button id="clearForm" type="button" class="secondary">清空</button></form></div><div class="card"><div class="section-title">北 / 中 / 南客戶</div><div id="customers" class="customer-grid"></div></div><div class="card"><div class="section-title">封存客戶</div><button id="loadArchived" class="secondary">載入封存客戶</button><div id="archivedCustomers" class="empty">按下按鈕後載入</div></div>`);
  async function refresh(){ const res=await get('/api/customers'); document.getElementById('customers').innerHTML = renderGroups(res.items||[]); }
  async function loadArchived(){ const res=await get('/api/customers/archived'); document.getElementById('archivedCustomers').innerHTML = renderArchived(res.items||[]); }
  await refresh();
  document.getElementById('customerForm').addEventListener('submit', async e=>{ e.preventDefault(); const data=Object.fromEntries(new FormData(e.currentTarget).entries()); if(data.uid) await put(`/api/customers/${data.uid}`, data); else await post('/api/customers', data); toast('客戶已儲存'); e.currentTarget.reset(); await refresh(); });
  document.getElementById('clearForm').addEventListener('click',()=>document.getElementById('customerForm').reset());
  document.getElementById('loadArchived').addEventListener('click', loadArchived);
  document.getElementById('archivedCustomers').addEventListener('click', async e=>{ const uid=e.target.dataset.restoreCustomer; if(!uid)return; await post(`/api/customers/${uid}/restore`,{}); toast('客戶已還原'); await refresh(); await loadArchived(); });
  async function fillForm(uid){ const rows=(await get('/api/customers')).items||[]; const c=rows.find(x=>x.uid===uid); if(!c)return; const form=document.getElementById('customerForm'); for(const [k,v] of Object.entries(c)){ if(form.elements[k]) form.elements[k].value=v??''; } }
  document.getElementById('customers').addEventListener('click', async e=>{ const card=e.target.closest('.customer-card'); if(!card)return; await fillForm(card.dataset.customerUid); });
  installLongPress(document.getElementById('customers'), '.customer-card', (card)=>openCustomerActionModal(card,{onRefresh:refresh,onOpen:fillForm}));
}
