/* YX 20260518a: read-chain rescue for settings/product/customer/warehouse pages.
   Reads real DB through /api/bootstrap-data only when the visible page is empty, then paints a minimal safe table.
   No setInterval, no MutationObserver, no duplicate click binding. */
(function(){
  'use strict';
  if (window.__YX_READ_CHAIN_REPAIR_20260518A__) return;
  window.__YX_READ_CHAIN_REPAIR_20260518A__ = true;
  const clean = v => String(v == null ? '' : v).trim();
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const moduleKey = () => document.body?.dataset?.module || document.querySelector('.module-screen[data-module]')?.dataset?.module || '';
  const qty = row => Number(row?.effective_qty ?? row?.qty ?? row?.quantity ?? 0) || 0;
  const mat = row => clean(row?.material || row?.product_code || '');
  const zone = row => clean(row?.location || row?.area || row?.zone || row?.warehouse_zone || '');
  const customer = row => clean(row?.customer_name || row?.customer || row?.name || '');
  function productRowsFor(mod, data){
    if(mod === 'inventory') return Array.isArray(data.inventory) ? data.inventory : [];
    if(mod === 'orders') return Array.isArray(data.orders) ? data.orders : [];
    if(mod === 'master_order') return Array.isArray(data.master_orders) ? data.master_orders : [];
    if(mod === 'ship') return Array.isArray(data.customer_items) ? data.customer_items : [];
    return [];
  }
  function expectedBox(mod){
    if(mod === 'inventory') return document.getElementById('yx113-inventory-summary') || document.getElementById('inventory-inline-list');
    if(mod === 'orders') return document.getElementById('yx113-orders-summary') || document.getElementById('orders-list');
    if(mod === 'master_order') return document.getElementById('yx113-master_order-summary') || document.getElementById('master-list');
    return null;
  }
  function hasVisibleRows(box){
    if(!box) return false;
    if(box.querySelector('tbody tr[data-id], .yx113-summary-row[data-id], .deduct-card[data-id]')) return true;
    const txt = clean(box.textContent || '');
    return /\d+件\s*\/\s*\d+筆/.test(txt) && !/0件\s*\/\s*0筆/.test(txt);
  }
  function ensureSummaryBox(mod){
    let id = `yx113-${mod}-summary`;
    let box = document.getElementById(id);
    if(box) return box;
    const list = mod==='inventory' ? document.getElementById('inventory-inline-list') : mod==='orders' ? document.getElementById('orders-list') : document.getElementById('master-list');
    const sec = mod==='inventory' ? document.getElementById('inventory-inline-panel') : mod==='orders' ? document.getElementById('orders-list-section') : document.getElementById('master-list-section');
    box = document.createElement('div'); box.id = id; box.className = 'yx113-summary table-card yx-read-chain-rescue';
    if(list) list.insertAdjacentElement('beforebegin', box); else (sec || document.querySelector('.module-screen') || document.body).appendChild(box);
    return box;
  }
  function renderProductRescue(mod, rows){
    if(!rows.length) return;
    const box = ensureSummaryBox(mod);
    const label = mod==='inventory'?'庫存清單':mod==='orders'?'訂單清單':'總單清單';
    const total = rows.reduce((s,r)=>s+qty(r),0);
    const body = rows.map(r => {
      const p = clean(r.product_text || r.product || r.size || '');
      const parts = p.split('=');
      return `<tr class="yx113-summary-row" data-source="${esc(mod)}" data-id="${esc(r.id||'')}"><td class="mat">${esc(mat(r)||'未填材質')}</td><td class="size">${esc(parts[0]||p)}</td><td class="support">${esc(parts.slice(1).join('=')||qty(r))}</td><td class="qty total-qty">${qty(r)}</td><td class="zone">${esc(zone(r)||'未分區')}</td><td>${esc(customer(r))}</td></tr>`;
    }).join('');
    box.innerHTML = `<div class="yx113-summary-head yx128-summary-head"><div class="yx132-summary-title"><strong>${total}件 / ${rows.length}筆</strong><span>${esc(label)}｜資料讀取救援已接回 DB</span></div></div><div class="yx113-table-wrap"><table class="yx113-table yx128-inline-table"><thead><tr><th>材質</th><th>尺寸</th><th>支數 x 件數</th><th>總數量</th><th>A/B區</th><th>客戶</th></tr></thead><tbody>${body}</tbody></table></div>`;
  }
  function renderCustomers(data){
    const customers = Array.isArray(data.customers) ? data.customers : [];
    if(!customers.length) return;
    const ids = ['region-north','region-center','region-south'];
    const any = ids.some(id => clean(document.getElementById(id)?.textContent || ''));
    if(any) return;
    const map = {'北區':'region-north','中區':'region-center','南區':'region-south'};
    customers.forEach(c => {
      const name = customer(c); if(!name) return;
      const id = map[clean(c.region)||'北區'] || 'region-north';
      const box = document.getElementById(id); if(!box) return;
      const btn = document.createElement('button'); btn.type='button'; btn.className='customer-card yx-read-chain-customer'; btn.textContent = name;
      btn.addEventListener('click', function(){
        window.__YX_SELECTED_CUSTOMER__ = name;
        const input = document.getElementById('customer-name'); if(input) input.value = name;
        try { window.YX113CustomerRegions?.selectCustomer?.(name); } catch(_e) {}
      }, {once:false});
      box.appendChild(btn);
    });
  }
  function renderWarehouse(data){
    const mod = moduleKey(); if(mod !== 'warehouse') return;
    const cells = data?.warehouse?.cells || [];
    const grid = document.getElementById('zone-A-grid') || document.querySelector('.warehouse-grid');
    const existing = document.querySelectorAll('.warehouse-slot.has-items,.warehouse-cell.has-items,.slot-filled').length;
    if(existing || !grid || !cells.length) return;
    // Leave the original warehouse renderer in charge; just expose data for it and fire one event.
    window.__YX_BOOTSTRAP_WAREHOUSE_CELLS__ = cells;
    try { window.dispatchEvent(new CustomEvent('yx:warehouse-bootstrap-ready', {detail:{cells}})); } catch(_e) {}
  }
  async function run(){
    const mod = moduleKey();
    if(!['inventory','orders','master_order','ship','warehouse','settings'].includes(mod)) return;
    let data;
    try {
      const r = await fetch('/api/bootstrap-data?ts=' + Date.now(), {credentials:'same-origin', cache:'no-store', headers:{'Accept':'application/json','Cache-Control':'no-cache'}});
      data = await r.json();
      if(!r.ok || data.success === false) return;
    } catch(_e){ return; }
    window.__YX_BOOTSTRAP_DATA__ = data;
    renderCustomers(data);
    if(['inventory','orders','master_order'].includes(mod)){
      const box = expectedBox(mod);
      if(!hasVisibleRows(box)) renderProductRescue(mod, productRowsFor(mod, data));
    }
    renderWarehouse(data);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(run, 900), {once:true});
  else setTimeout(run, 900);
  window.addEventListener('pageshow', () => setTimeout(run, 900), {once:true});
})();
