import { get, post, put, del } from '../core/api.js';
import { pageShell, toast } from '../utils/dom.js';
import { itemTable } from './sharedItems.js';

async function loadItems() {
  const q = document.getElementById('searchInput')?.value || '';
  const zone = document.getElementById('zoneFilter')?.value || '';
  const res = await get(`/api/inventory?search=${encodeURIComponent(q)}&zone=${encodeURIComponent(zone)}`);
  return res.items || [];
}

function renderTable(items) {
  const actions = (row) => `<button class="small" data-edit="${row.id}">編輯</button><button class="small danger" data-delete="${row.id}">刪除</button><button class="small" data-transfer="orders" data-id="${row.id}">加到訂單</button><button class="small" data-transfer="master_orders" data-id="${row.id}">加到總單</button>`;
  document.getElementById('inventoryList').innerHTML = itemTable(items, 'inventory', actions);
  document.getElementById('inventoryCount').textContent = `${items.reduce((sum,x)=>sum+Number(x.qty||0),0)}件 / ${items.length}筆`;
}

export async function renderInventory(app) {
  app.innerHTML = pageShell('庫存', `<div class="card top-input-panel">
    <form id="addInventory" class="form-grid">
      <input type="hidden" name="material" value="">
      <input type="hidden" name="zone" value="">
      <label class="field wide-textarea"><span>商品資料</span><textarea name="product_text" id="productText" placeholder="132x23x05=249x3\n179x___=131x4"></textarea></label>
      <div class="file-row">
        <label><input class="native-file" id="albumInput" type="file" accept="image/*"><button type="button" onclick="document.getElementById('albumInput').click()">上傳檔案</button></label>
        <label><input class="native-file" id="cameraInput" type="file" accept="image/*" capture="environment"><button type="button" onclick="document.getElementById('cameraInput').click()">拍照</button></label>
        <span class="muted">手機辨識後可直接貼到商品資料框。</span>
      </div>
      <div><button class="primary" type="submit">確認送出</button></div>
    </form>
  </div>
  <div class="card list-card"><div class="list-card-head"><div class="section-title">庫存清單</div><div class="muted">送出完成後會直接顯示在這裡，可點開編輯或移到訂單 / 總單</div></div>
    <div class="toolbar">
      <button id="selectAllBtn" class="secondary">全選目前清單</button>
      <input id="searchInput" class="search-input" placeholder="搜尋商品 / 客戶 / 材質 / A區 / B區">
      <select id="zoneFilter"><option value="">全部區</option><option value="A">A區</option><option value="B">B區</option></select>
      <input id="batchMaterial" placeholder="批量增加材質">
      <button id="applyMaterialBtn" class="secondary">套用材質</button>
      <button id="bulkDeleteBtn" class="danger">批量刪除</button>
    </div>
    <div class="list-title-row">
      <span class="pill list-title-pill">庫存</span>
      <b id="inventoryCount">0件 / 0筆</b>
      <span class="table-caption">庫存清單｜完整直列顯示，不用下拉式</span>
      <button id="bulkEditBtn" class="secondary">編輯全部</button>
      <button data-bulk-transfer="orders" class="secondary">加到訂單</button>
      <button data-bulk-transfer="master_orders" class="secondary">加到總單</button>
      <button id="moveABtn" class="secondary">移到A區</button>
      <button id="moveBBtn" class="secondary">移到B區</button>
      <span class="table-caption">排序：材質 → 高 → 寬 → 長 / 同商品件數 → 支數</span>
    </div>
    <div id="inventoryList" class="loading-card">載入中…</div>
  </div>`);
  async function refresh(){ renderTable(await loadItems()); }
  await refresh();
  document.getElementById('addInventory').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    try { await post('/api/inventory', data); e.currentTarget.reset(); toast('庫存已新增'); await refresh(); }
    catch(err){ toast(err.message, 'error'); }
  });
  document.getElementById('zoneFilter').addEventListener('change', refresh);
  document.getElementById('searchInput').addEventListener('input', () => { clearTimeout(window.__invSearch); window.__invSearch = setTimeout(refresh, 180); });
  document.getElementById('selectAllBtn').addEventListener('click', () => document.querySelectorAll('.row-check').forEach(x => x.checked = true));
  async function selectedIds(){ return Array.from(document.querySelectorAll('.row-check:checked')).map(x => x.dataset.id); }
  async function transferSelected(target){
    const ids = await selectedIds();
    if (!ids.length) { toast('請先勾選商品', 'error'); return; }
    const customer_name = prompt('要加入哪位客戶？');
    if (!customer_name) return;
    for (const id of ids) await post('/api/items/transfer', { source:'inventory', target, id, customer_name });
    toast(target === 'orders' ? '已加到訂單' : '已加到總單');
    await refresh();
  }
  document.querySelectorAll('[data-bulk-transfer]').forEach(btn => btn.addEventListener('click', () => transferSelected(btn.dataset.bulkTransfer)));
  document.getElementById('applyMaterialBtn').addEventListener('click', async () => {
    const material = document.getElementById('batchMaterial').value.trim();
    for (const id of await selectedIds()) await put(`/api/inventory/${id}`, { material });
    toast('已套用材質'); await refresh();
  });
  document.getElementById('bulkDeleteBtn').addEventListener('click', async () => {
    if (!confirm('確定刪除勾選庫存？')) return;
    for (const id of await selectedIds()) await del(`/api/inventory/${id}`);
    toast('已批量刪除'); await refresh();
  });
  document.getElementById('moveABtn').addEventListener('click', async () => { for (const id of await selectedIds()) await put(`/api/inventory/${id}`, { zone:'A' }); toast('已移到 A 區'); refresh(); });
  document.getElementById('moveBBtn').addEventListener('click', async () => { for (const id of await selectedIds()) await put(`/api/inventory/${id}`, { zone:'B' }); toast('已移到 B 區'); refresh(); });
  document.getElementById('bulkEditBtn').addEventListener('click', async () => {
    const ids = await selectedIds();
    if (!ids.length) { toast('請先勾選商品', 'error'); return; }
    const material = prompt('批量修改材質（留空不改）') || '';
    const zone = prompt('批量修改 A/B 區（A、B 或留空不改）') || '';
    const product_text = prompt('批量修改商品文字（留空不改）') || '';
    try { await post('/api/items/bulk-update', { table:'inventory', ids, material, zone, product_text }); toast('已批量編輯'); await refresh(); }
    catch(err){ toast(err.message, 'error'); }
  });
  document.getElementById('inventoryList').addEventListener('click', async (e) => {
    const id = e.target.dataset.id || e.target.dataset.edit || e.target.dataset.delete;
    if (!id) return;
    if (e.target.dataset.delete) { if(confirm('確定刪除？')) { await del(`/api/inventory/${id}`); toast('已刪除'); refresh(); } return; }
    if (e.target.dataset.edit) {
      const product_text = prompt('修改商品文字');
      if (product_text) { await put(`/api/inventory/${id}`, { product_text }); toast('已更新'); refresh(); }
      return;
    }
    if (e.target.dataset.transfer) {
      const customer_name = prompt('要加入哪位客戶？輸入第一字可先到客戶資料建立，這裡會自動同步新客戶。');
      if (!customer_name) return;
      const row = e.target.closest('tr');
      const material = row?.children[1]?.textContent?.trim() || '';
      const product_text = row?.children[2]?.textContent?.trim() || '';
      const target = e.target.dataset.transfer;
      const check = await post('/api/duplicate-check', { target, customer_name, product_text, material });
      if (check.has_duplicate && check.items?.length) {
        const first = check.items[0];
        if (confirm(`發現相同客戶 + 相同尺寸 + 相同材質，要合併嗎？\n\n舊資料：${first.product_text}｜${first.material || '未填材質'}｜${first.qty}件\n新資料：${check.normalized_text}｜${material || '未填材質'}｜${check.qty}件`)) {
          await post('/api/items/merge', { target, duplicate_id:first.id, product_text, material, qty:check.qty });
          toast('已合併商品'); refresh(); return;
        }
      }
      await post('/api/items/transfer', { source:'inventory', target, id, customer_name });
      toast(target === 'orders' ? '已加到訂單' : '已加到總單');
      refresh();
    }
  });
}
