import { get, post } from '../core/api.js';
import { state } from '../core/state.js';
import { pageShell, esc, toast } from '../utils/dom.js';
import { itemTable } from './sharedItems.js';

function draftKey(item){ return `${item.source}:${item.id}`; }
function renderDraft(){
  const box = document.getElementById('draftItems');
  if (!state.shippingDraftItems.length) { box.innerHTML = '<div class="empty">尚未加入出貨商品</div>'; return; }
  box.innerHTML = state.shippingDraftItems.map((it, idx)=>`<div class="item-card"><div class="item-main"><div><span class="pill">${esc(it.source_label || it.source)}</span> <span class="material">${esc(it.material || '')}</span></div><div class="product-text">${esc(it.product_text || ('#'+it.id))}</div><label class="field"><span>本次出貨件數</span><input type="number" min="1" data-draft-qty="${idx}" value="${it.qty || 1}"></label><button class="small danger" data-remove-draft="${idx}">刪除</button></div></div>`).join('');
}
async function hydrateDraft(){
  if (!state.shippingDraftItems.length) return;
  for (const it of state.shippingDraftItems) {
    if (it.product_text) continue;
    try {
      const all = await get('/api/customer-items');
      const found = (all.items||[]).find(x=>x.source===it.source && Number(x.id)===Number(it.id));
      if (found) Object.assign(it, found, { qty: it.qty || 1 });
    } catch {}
  }
}
function renderQuickCustomers(items){
  const regions = ['北區','中區','南區'];
  const buckets = Object.fromEntries(regions.map(r=>[r, []]));
  for (const c of items || []) if (buckets[c.region || '北區']) buckets[c.region || '北區'].push(c);
  return `<div class="customer-grid quick-customer-grid">${regions.map(r=>`<div class="region-col"><div class="region-title">${r}</div>${(buckets[r]||[]).map(c=>`<div class="customer-card" data-quick-customer="${esc(c.name)}"><span class="customer-name">${esc(c.name)}</span><span class="trade">${esc(c.trade_type||'')}</span><span class="count">選取</span></div>`).join('') || '<div class="empty">無客戶</div>'}</div>`).join('')}</div>`;
}
function locationChips(locations){
  if(!locations || !locations.length) return '<span class="muted">未錄入倉庫圖</span>';
  return locations.map(loc=>`<button class="small secondary" data-jump-warehouse="${esc(loc.zone)}" data-jump-col="${loc.column_index}" data-jump-slot="${loc.slot_number}">${esc(loc.label)}</button>`).join(' ');
}
export async function renderShipping(app, params={}) {
  const customer = params.customer || state.selectedCustomer || null;
  app.innerHTML = pageShell('出貨', `<div class="card"><div class="section-title">客戶快速選擇</div><div id="quickCustomers" class="loading-card">載入中…</div></div><div class="card"><div class="section-title">客戶選擇</div><div class="form-grid"><label class="field"><span>客戶名稱</span><input id="shipCustomer" list="customerList" value="${esc(customer?.name || '')}" placeholder="輸入第一個字"></label><datalist id="customerList"></datalist><button id="loadItemsBtn" class="primary">載入客戶商品</button><button id="clearDraftBtn" class="danger">一鍵清空已選商品</button></div></div>
    <div class="card"><div class="section-title">客戶商品清單</div><div id="customerItems" class="empty">請先載入客戶商品</div></div>
    <div class="card"><div class="section-title">已選出貨商品</div><div id="draftItems"></div><div class="toolbar"><label class="field"><span>重量</span><input id="weightInput" type="number" step="0.01" value="0"></label><button id="previewBtn" class="primary">確認送出 / 出貨預覽</button></div></div>
    <div class="card"><div class="section-title">出貨預覽</div><div id="previewBox" class="empty">尚未產生預覽</div></div>`);
  const suggestions = await get('/api/customer-suggestions?q=');
  const customers = (await get('/api/customers')).items || [];
  document.getElementById('customerList').innerHTML = (suggestions.items||[]).map(c=>`<option value="${esc(c.name)}"></option>`).join('');
  document.getElementById('quickCustomers').innerHTML = renderQuickCustomers(customers);
  await hydrateDraft(); renderDraft();
  async function loadCustomerItems(){
    const name = document.getElementById('shipCustomer').value.trim();
    const res = await get(`/api/customer-items?customer_name=${encodeURIComponent(name)}`);
    const actions = row => `<button class="small" data-add-source="${row.source}" data-id="${row.id}">加入選取商品</button><button class="small" data-add-all-source="${row.source}" data-id="${row.id}" data-qty="${row.qty}">整個加入</button>`;
    document.getElementById('customerItems').innerHTML = itemTable(res.items||[], 'mixed', actions);
  }
  document.getElementById('quickCustomers').addEventListener('click', async e=>{ const name=e.target.closest('[data-quick-customer]')?.dataset.quickCustomer; if(!name)return; document.getElementById('shipCustomer').value=name; await loadCustomerItems(); });
  document.getElementById('loadItemsBtn').addEventListener('click', loadCustomerItems);
  if(customer?.name) await loadCustomerItems();
  document.getElementById('clearDraftBtn').addEventListener('click', ()=>{ state.shippingDraftItems=[]; renderDraft(); document.getElementById('previewBox').innerHTML='<div class="empty">尚未產生預覽</div>'; });
  document.getElementById('customerItems').addEventListener('click', async e=>{
    const add = e.target.dataset.addSource || e.target.dataset.addAllSource; if(!add) return;
    const rowEl = e.target.closest('tr'); const id = Number(e.target.dataset.id); const source = add; const product_text = rowEl?.children[2]?.textContent || ''; const material = rowEl?.children[1]?.textContent || ''; const qty = e.target.dataset.addAllSource ? Number(e.target.dataset.qty || 1) : 1;
    const existing = state.shippingDraftItems.find(x=>draftKey(x)===`${source}:${id}`);
    if(existing) existing.qty += qty; else state.shippingDraftItems.push({source,id,qty,product_text,material});
    toast('已加入出貨商品'); renderDraft();
  });
  document.getElementById('draftItems').addEventListener('input', e=>{ if(e.target.dataset.draftQty){ state.shippingDraftItems[Number(e.target.dataset.draftQty)].qty = Number(e.target.value || 1); }});
  document.getElementById('draftItems').addEventListener('click', e=>{ if(e.target.dataset.removeDraft){ state.shippingDraftItems.splice(Number(e.target.dataset.removeDraft),1); renderDraft(); }});
  document.getElementById('previewBox').addEventListener('click', e=>{ const b=e.target.closest('[data-jump-warehouse]'); if(!b)return; sessionStorage.setItem('yx_jump_cell', JSON.stringify({zone:b.dataset.jumpWarehouse, col:Number(b.dataset.jumpCol), slot:Number(b.dataset.jumpSlot)})); import('../core/router.js').then(m=>m.navigate('warehouse')); });
  document.getElementById('previewBtn').addEventListener('click', async()=>{
    const customer_name = document.getElementById('shipCustomer').value.trim();
    const weight_input = Number(document.getElementById('weightInput').value || 0);
    const payload = { customer_name, weight_input, items: state.shippingDraftItems.map(x=>({source:x.source,id:x.id,qty:x.qty})) };
    try {
      const res = await post('/api/ship-preview', payload);
      const p = res.preview;
      document.getElementById('previewBox').innerHTML = `<div class="preview-box"><b>本次出貨：</b>${p.total_qty}件\n<b>材積算式：</b>${esc(p.volume_formula || '無可計算商品')}\n<b>材積合計：</b>${p.volume_total}\n<b>總重：</b>${p.total_weight}</div>${p.problems?.length ? `<div class="error-card">${p.problems.map(esc).join('<br>')}</div>` : '<div class="success-card">可確認扣除</div>'}<div class="table-wrap"><table><thead><tr><th>來源</th><th>商品</th><th>倉庫位置</th><th>扣除前</th><th>本次扣</th><th>扣除後</th><th>借貨</th></tr></thead><tbody>${p.items.map(i=>`<tr><td>${esc(i.source_label)}</td><td>${esc(i.product_text)}</td><td>${locationChips(i.warehouse_locations)}</td><td>${i.before_qty}</td><td>${i.qty}</td><td>${i.after_qty}</td><td>${esc(i.borrowed_from||'')}</td></tr>`).join('')}</tbody></table></div><button id="confirmShipBtn" class="primary" ${p.can_submit?'':'disabled'}>確認扣除</button>`;
      const btn = document.getElementById('confirmShipBtn');
      if(btn) btn.addEventListener('click', async()=>{ await post('/api/ship', payload); toast('出貨完成'); state.shippingDraftItems=[]; renderDraft(); document.getElementById('previewBox').innerHTML = '<div class="success-card">出貨完成，已寫入出貨查詢與今日異動。</div>'; });
    } catch(err){ document.getElementById('previewBox').innerHTML = `<div class="error-card">${esc(err.message)}</div>`; }
  });
}
