import { get } from '../core/api.js';
import { pageShell, esc } from '../utils/dom.js';

function queryString() {
  const q = document.getElementById('search').value || '';
  const days = document.getElementById('daysFilter').value || '';
  const date_from = document.getElementById('dateFrom').value || '';
  const date_to = document.getElementById('dateTo').value || '';
  const params = new URLSearchParams();
  if (q) params.set('search', q);
  if (days) params.set('days', days);
  if (date_from) params.set('date_from', date_from);
  if (date_to) params.set('date_to', date_to);
  return params.toString();
}

export async function renderShippingRecords(app) {
  app.innerHTML = pageShell('出貨查詢', `<div class="card">
    <div class="toolbar">
      <input id="search" placeholder="搜尋客戶 / 商品 / 操作人 / 借貨">
      <select id="daysFilter">
        <option value="">全部日期</option>
        <option value="3">3 天內</option>
        <option value="7">7 天內</option>
        <option value="10">10 天內</option>
        <option value="15">15 天內</option>
      </select>
      <label class="field compact"><span>起日</span><input id="dateFrom" type="date"></label>
      <label class="field compact"><span>迄日</span><input id="dateTo" type="date"></label>
      <button id="refresh" class="secondary">搜尋</button>
    </div>
    <div id="records" class="loading-card">載入中…</div>
  </div>`);
  async function refresh(){
    const res=await get(`/api/shipping_records?${queryString()}`);
    const rows=res.items||[];
    document.getElementById('records').innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr><th>時間</th><th>客戶</th><th>商品</th><th>材質</th><th>件數</th><th>來源</th><th>扣前→扣後</th><th>借貨</th><th>操作人</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.shipped_at)}</td><td>${esc(r.customer_name)}</td><td>${esc(r.product_text)}</td><td>${esc(r.material)}</td><td>${r.qty}</td><td>${esc(r.source)}</td><td>${r.before_qty}→${r.after_qty}</td><td>${esc(r.borrowed_from||'')}</td><td>${esc(r.operator)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">目前沒有出貨紀錄</div>';
  }
  ['refresh','daysFilter','dateFrom','dateTo'].forEach(id=>document.getElementById(id).addEventListener(id==='refresh'?'click':'change', refresh));
  document.getElementById('search').addEventListener('input',()=>{clearTimeout(window.__shipSearch); window.__shipSearch=setTimeout(refresh,180)});
  await refresh();
}
