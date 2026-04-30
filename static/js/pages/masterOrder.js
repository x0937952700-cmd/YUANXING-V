import { get, post, put, del } from '../core/api.js';
import { navigate } from '../core/router.js';
import { state } from '../core/state.js';
import { pageShell, esc, toast, installLongPress } from '../utils/dom.js';
import { itemTable, customerCard } from './sharedItems.js';
import { openCustomerActionModal, submitWithDuplicateCheck } from './customerActions.js';

async function loadItems(customerUid='') { return (await get(customerUid ? `/api/master_orders?customer_uid=${encodeURIComponent(customerUid)}` : '/api/master_orders')).items || []; }
async function loadCustomerSummary() {
  const [customers, items] = await Promise.all([get('/api/customers'), get('/api/master_orders')]);
  const map = new Map((customers.items || []).map(c => [c.uid, {...c,total_qty:0,total_rows:0}]));
  for (const item of items.items || []) {
    if (!item.customer_uid) continue;
    if (!map.has(item.customer_uid)) map.set(item.customer_uid, {uid:item.customer_uid,name:item.customer_name,region:'北區',trade_type:'',total_qty:0,total_rows:0});
    const c = map.get(item.customer_uid); c.total_qty += Number(item.qty||0); c.total_rows += 1;
  }
  return Array.from(map.values()).filter(c => c.total_rows > 0);
}
function renderCustomers(customers) { const active = state.selectedCustomer?.uid || ''; return ['北區','中區','南區'].map(r => `<div class="region-col"><div class="region-title">${r}</div>${customers.filter(c=>c.region===r).map(c=>customerCard(c,active)).join('') || '<div class="empty">目前沒有客戶</div>'}</div>`).join(''); }
function renderItems(items) { const actions = row => `<button class="small" data-edit="${row.id}">編輯</button><button class="small" data-direct-ship="${row.id}">直接出貨</button><button class="small danger" data-delete="${row.id}">刪除</button>`; document.getElementById('masterItems').innerHTML = itemTable(items, 'master_orders', actions); }
export async function renderMasterOrder(app) {
  state.selectedCustomer = null;
  app.innerHTML = pageShell('總單', `<div class="card top-input-panel">
    <form id="addMaster" class="form-grid">
      <label class="field"><span>客戶名稱</span><input name="customer_name" list="customerList" required placeholder="可直接輸入，或貼上商品資料後自動帶入客戶名稱"></label><datalist id="customerList"></datalist>
      <input type="hidden" name="material" value=""><input type="hidden" name="zone" value="">
      <label class="field wide-textarea"><span>商品資料</span><textarea name="product_text" required></textarea></label>
      <div><button class="primary">確認送出</button></div>
    </form></div>
    <div class="section-title" style="margin-top:28px">北中南客戶</div>
    <div class="muted" style="text-align:right">點選客戶後自動帶入客戶名稱，並顯示該客戶商品</div>
    <div id="customerRegions" class="customer-grid"></div>
    <div class="card list-card"><div class="section-title">總單商品 <span id="selectedName" class="muted"></span></div><div class="toolbar"><input id="batchMaterial" placeholder="批量材質"><button id="applyMaterialBtn" class="secondary">套用材質</button><button id="bulkDeleteBtn" class="danger">批量刪除</button><button id="moveABtn" class="secondary">移到 A 區</button><button id="moveBBtn" class="secondary">移到 B 區</button><button id="bulkEditBtn" class="secondary">編輯全部</button></div><div id="masterItems" class="empty">請先點客戶</div></div>`);
  const suggestions = await get('/api/customer-suggestions?q='); document.getElementById('customerList').innerHTML = (suggestions.items||[]).map(c=>`<option value="${esc(c.name)}"></option>`).join('');
  const customers = await loadCustomerSummary(); document.getElementById('customerRegions').innerHTML = renderCustomers(customers);
  async function openByUid(uid, name){ state.selectedCustomer={uid,name}; document.getElementById('selectedName').textContent=name; document.getElementById('customerRegions').innerHTML = renderCustomers(customers); renderItems(await loadItems(uid)); }
  document.getElementById('addMaster').addEventListener('submit', async e=>{ e.preventDefault(); const data=Object.fromEntries(new FormData(e.currentTarget).entries()); await submitWithDuplicateCheck({ target:'master_orders', payload:data, postPath:'/api/master_orders', onDone: async(msg)=>{ toast(msg === '已合併商品' ? msg : '總單已新增'); e.currentTarget.reset(); await renderMasterOrder(app); } }); });
  document.getElementById('customerRegions').addEventListener('click', async e=>{ const card=e.target.closest('.customer-card'); if(!card)return; await openByUid(card.dataset.customerUid, card.dataset.customerName); });
  installLongPress(document.getElementById('customerRegions'), '.customer-card', (card)=>openCustomerActionModal(card,{onOpen:openByUid,onRefresh:()=>renderMasterOrder(app)}));
  async function selectedIds(){ return Array.from(document.querySelectorAll('#masterItems .row-check:checked')).map(x=>x.dataset.id); }
  document.getElementById('applyMaterialBtn').addEventListener('click', async()=>{ for(const id of await selectedIds()) await put(`/api/master_orders/${id}`,{material:document.getElementById('batchMaterial').value}); toast('已套用材質'); if(state.selectedCustomer) renderItems(await loadItems(state.selectedCustomer.uid)); });
  document.getElementById('bulkDeleteBtn').addEventListener('click', async()=>{ if(!confirm('刪除勾選總單？'))return; for(const id of await selectedIds()) await del(`/api/master_orders/${id}`); toast('已刪除'); if(state.selectedCustomer) renderItems(await loadItems(state.selectedCustomer.uid)); });
  document.getElementById('moveABtn').addEventListener('click', async()=>{ for(const id of await selectedIds()) await put(`/api/master_orders/${id}`,{zone:'A'}); toast('已移到 A'); if(state.selectedCustomer) renderItems(await loadItems(state.selectedCustomer.uid)); });
  document.getElementById('moveBBtn').addEventListener('click', async()=>{ for(const id of await selectedIds()) await put(`/api/master_orders/${id}`,{zone:'B'}); toast('已移到 B'); if(state.selectedCustomer) renderItems(await loadItems(state.selectedCustomer.uid)); });
  document.getElementById('bulkEditBtn').addEventListener('click', async () => {
    const ids = await selectedIds();
    if (!ids.length) { toast('請先勾選商品', 'error'); return; }
    const material = prompt('批量修改材質（留空不改）') || '';
    const zone = prompt('批量修改 A/B 區（A、B 或留空不改）') || '';
    const product_text = prompt('批量修改商品文字（留空不改）') || '';
    await post('/api/items/bulk-update', { table:'master_orders', ids, material, zone, product_text });
    toast('已批量編輯'); if(state.selectedCustomer) renderItems(await loadItems(state.selectedCustomer.uid));
  });
  document.getElementById('masterItems').addEventListener('click', async e=>{ const id=e.target.dataset.edit||e.target.dataset.delete||e.target.dataset.directShip; if(!id)return; if(e.target.dataset.delete){ if(confirm('確定刪除？')){ await del(`/api/master_orders/${id}`); toast('已刪除'); renderItems(await loadItems(state.selectedCustomer.uid)); }} if(e.target.dataset.edit){ const product_text=prompt('修改商品文字'); if(product_text){ await put(`/api/master_orders/${id}`,{product_text}); toast('已更新'); renderItems(await loadItems(state.selectedCustomer.uid)); }} if(e.target.dataset.directShip){ state.shippingDraftItems=[{source:'master_orders',id:Number(id),qty:1}]; navigate('shipping',{customer:state.selectedCustomer}); } });
}
