(function(){
  'use strict';
  const VERSION = 'v16-fast-customer-warehouse-fixed';
  window.__YX_V16_FAST_FIX__ = VERSION;
  const $ = (id)=>document.getElementById(id);
  const esc = (s)=>String(s ?? '').replace(/[&<>"]/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
  const page = () => (document.querySelector('.module-screen')?.dataset?.module || '').trim();
  function normCustomer(s){ return String(s||'').replace(/\s+(CNF|FOB代付|FOB代|FOB)\s*$/i,'').replace(/\s+/g,'').trim().toLowerCase(); }
  async function yxApi(url, opts){
    const fn = window.requestJSON || window.api;
    if (typeof fn === 'function') return await fn(url, opts || {method:'GET'});
    const res = await fetch(url, Object.assign({headers:{'Content-Type':'application/json'}}, opts||{}));
    const txt = await res.text();
    let data = {}; try{ data = txt ? JSON.parse(txt) : {}; }catch(_e){ data = {success:false,error:txt}; }
    if (!res.ok || data.success === false) throw new Error(data.error || data.message || ('HTTP '+res.status));
    return data;
  }
  function productCard(row){
    const src = row.source_label || (row.source==='master_orders'?'總單':row.source==='orders'?'訂單':row.source==='inventory'?'庫存':'商品');
    return `<div class="yx-v16-product-card" data-source="${esc(row.source||'')}" data-id="${Number(row.id||0)}">
      <div class="yx-v16-product-top"><b>${esc(src)}</b><span>${Number(row.qty||0)}件</span></div>
      <div class="yx-v16-product-text">${esc(row.product_text||'')}</div>
      <div class="yx-v16-product-meta">${esc(row.material||'未填材質')} ${row.zone?('｜'+esc(row.zone)+'區'):''}</div>
      <div class="yx-v16-product-actions">
        ${page()==='ship' ? `<button type="button" class="ghost-btn small-btn yx-v16-add-ship">加入出貨</button>` : ''}
        <button type="button" class="ghost-btn small-btn" onclick="quickJumpToModule && quickJumpToModule('warehouse','',${JSON.stringify(row.product_text||'')})">查倉位</button>
      </div>
    </div>`;
  }
  function renderSelectedCustomerItems(name, rows, loading){
    const box = $('selected-customer-items');
    if (!box) return;
    box.classList.remove('hidden');
    box.style.display = '';
    if (loading) {
      box.innerHTML = `<div class="section-title">${esc(name)} 商品</div><div class="small-note">資料讀取中…</div>`;
      return;
    }
    const mod = page();
    const title = mod === 'ship' ? '出貨商品清單' : (mod === 'master_order' ? '總單商品' : '訂單商品');
    box.innerHTML = `<div class="section-head"><h3>${esc(name)}｜${title}</h3><span class="muted">${rows.length} 筆，點客戶後立即顯示</span></div>` +
      (rows.length ? `<div class="yx-v16-product-grid">${rows.map(productCard).join('')}</div>` : `<div class="empty-state-card compact-empty">這個客戶目前沒有商品</div>`);
    box.querySelectorAll('.yx-v16-add-ship').forEach(btn=>{
      btn.addEventListener('click', (e)=>{
        e.preventDefault(); e.stopPropagation();
        const card = btn.closest('.yx-v16-product-card');
        const r = rows.find(x=>String(x.id)===String(card?.dataset.id) && String(x.source)===String(card?.dataset.source));
        if (!r) return;
        const text = $('ocr-text');
        if (text) {
          const line = r.product_text || '';
          text.value = (text.value.trim() ? text.value.trim() + '\n' : '') + line;
          text.dispatchEvent(new Event('input',{bubbles:true}));
        }
        if (window.toast) toast('已加入出貨商品', 'ok');
      });
    });
  }
  let customerReqSeq = 0;
  async function fastSelectCustomer(name){
    name = String(name||'').trim();
    if (!name) return;
    const input = $('customer-name');
    if (input) {
      input.value = name;
      input.dispatchEvent(new Event('input',{bubbles:true}));
      input.dispatchEvent(new Event('change',{bubbles:true}));
    }
    const seq = ++customerReqSeq;
    renderSelectedCustomerItems(name, [], true);
    try{
      const data = await yxApi('/api/customer-items?name=' + encodeURIComponent(name) + '&customer_name=' + encodeURIComponent(name) + '&limit=1000', {method:'GET'});
      if (seq !== customerReqSeq) return;
      const rows = Array.isArray(data.items) ? data.items : [];
      renderSelectedCustomerItems(name, rows, false);
      if (page()==='ship') refreshShipPickerFromRows(name, rows);
    }catch(e){
      if (seq !== customerReqSeq) return;
      const box = $('selected-customer-items');
      if (box) box.innerHTML = `<div class="error-card">商品載入失敗：${esc(e.message||e)}</div>`;
    }
  }
  function refreshShipPickerFromRows(name, rows){
    const sel = $('ship-customer-item-select');
    if (!sel) return;
    if (!rows.length) { sel.innerHTML = '<option value="">目前沒有可出貨商品</option>'; return; }
    sel.innerHTML = rows.map((r,idx)=>`<option value="${idx}">${esc(r.source_label||'商品')}｜${esc(r.product_text||'')}｜${Number(r.qty||0)}件</option>`).join('');
    window.__YX_V16_SHIP_ROWS__ = rows;
  }
  function bindCustomerCards(){
    document.addEventListener('click', function(e){
      const card = e.target.closest('.customer-region-card,.yx80-customer-card,.yx81-customer-card,.yx-customer-card,[data-customer-name]');
      if (!card) return;
      if (!['orders','master_order','ship'].includes(page())) return;
      const name = (card.dataset.customerName || card.getAttribute('data-customer-name') || card.dataset.customer || card.querySelector('.customer-card-name,.customer-name,.yx-customer-left')?.textContent || '').trim();
      if (!name) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      fastSelectCustomer(name);
    }, true);
    const refreshBtn = $('ship-refresh-customer-items');
    if (refreshBtn) refreshBtn.onclick = ()=>fastSelectCustomer(($('customer-name')?.value||'').trim());
    const addBtn = $('ship-add-selected-item');
    if (addBtn) addBtn.onclick = ()=>{
      const sel = $('ship-customer-item-select'); const rows = window.__YX_V16_SHIP_ROWS__ || [];
      const r = rows[Number(sel?.value || 0)]; if (!r) return;
      const text = $('ocr-text'); if (text){ text.value = (text.value.trim()?text.value.trim()+'\n':'') + (r.product_text||''); text.dispatchEvent(new Event('input',{bubbles:true})); }
    };
    const allBtn = $('ship-add-all-items');
    if (allBtn) allBtn.onclick = ()=>{
      const rows = window.__YX_V16_SHIP_ROWS__ || []; const text = $('ocr-text'); if(!text || !rows.length) return;
      text.value = (text.value.trim()?text.value.trim()+'\n':'') + rows.map(r=>r.product_text||'').filter(Boolean).join('\n');
      text.dispatchEvent(new Event('input',{bubbles:true}));
    };
  }
  function parseItems(cell){
    try{ return Array.isArray(cell.items_json) ? cell.items_json : JSON.parse(cell.items_json || '[]'); }catch(_e){ return []; }
  }
  function warehouseCellHtml(zone, col, slot, items){
    if (!items.length) return `<button type="button" class="vertical-slot yx-v16-slot" data-zone="${zone}" data-column="${col}" data-num="${slot}"><b>${slot}</b><span>空格</span></button>`;
    const names = [...new Set(items.map(it=>it.customer_name||'庫存'))].slice(0,3).join('/');
    const qtys = items.map(it=>Number(it.qty||0)).filter(Boolean);
    const total = qtys.reduce((a,b)=>a+b,0);
    return `<button type="button" class="vertical-slot yx-v16-slot filled" data-zone="${zone}" data-column="${col}" data-num="${slot}">
      <div class="yx-v16-slot-row"><b>${slot}</b><span class="yx-v16-slot-customer">${esc(names||'庫存')}</span></div>
      <div class="yx-v16-slot-row"><span class="yx-v16-slot-qtys">${esc(qtys.join('+')||'0')}</span><span class="yx-v16-slot-total">${total}件</span></div>
    </button>`;
  }
  function renderFixedWarehouse(data){
    const cells = Array.isArray(data.cells) ? data.cells : [];
    window.state = window.state || {}; state.warehouse = state.warehouse || {};
    state.warehouse.cells = cells;
    ['A','B'].forEach(zone=>{
      const grid = $('zone-'+zone+'-grid'); if(!grid) return;
      const by = new Map();
      cells.filter(c=>String(c.zone||'A').toUpperCase()===zone).forEach(c=>by.set(Number(c.column_index||1)+'-'+Number(c.slot_number||1), c));
      let html = '';
      for(let col=1; col<=6; col++){
        const slots = cells.filter(c=>String(c.zone||'A').toUpperCase()===zone && Number(c.column_index||1)===col).map(c=>Number(c.slot_number||1));
        const maxSlot = Math.max(20, ...slots);
        html += `<div class="vertical-col yx-v16-col"><div class="col-title">${zone} 區第 ${col} 欄</div><div class="small-note">長按格子插入 / 刪除</div>`;
        for(let n=1;n<=maxSlot;n++){
          const cell = by.get(col+'-'+n); html += warehouseCellHtml(zone,col,n,cell?parseItems(cell):[]);
        }
        html += `</div>`;
      }
      grid.innerHTML = html;
    });
    const active = state.warehouse.activeZone || localStorage.getItem('yxWarehouseZone') || 'B';
    setWarehouseZoneFixed(active, false);
  }
  function setWarehouseZoneFixed(zone, save=true){
    zone = zone || 'B';
    if (save) localStorage.setItem('yxWarehouseZone', zone);
    window.state = window.state || {}; state.warehouse = state.warehouse || {}; state.warehouse.activeZone = zone;
    ['A','B'].forEach(z=>{ const el=$('zone-'+z); if(el) el.style.display = (zone==='ALL'||zone===z) ? '' : 'none'; });
    ['A','B','ALL'].forEach(z=> $('zone-switch-'+z)?.classList.toggle('active', z===zone));
    const pill=$('warehouse-selection-pill'); if(pill) pill.textContent = `目前區域：${zone==='ALL'?'全部':zone+' 區'}`;
  }
  async function renderWarehouseFast(){
    if (page() !== 'warehouse') return;
    try{
      const data = await yxApi('/api/warehouse', {method:'GET'});
      renderFixedWarehouse(data);
      yxApi('/api/warehouse/available-items', {method:'GET'}).then(av=>{ const p=$('warehouse-unplaced-pill'); if(p) p.textContent = `未入倉：${Number(av.total_qty || 0)}件`; }).catch(()=>{});
    }catch(e){
      ['A','B'].forEach(z=>{ const grid=$('zone-'+z+'-grid'); if(grid) grid.innerHTML = `<div class="error-card">倉庫圖載入失敗：${esc(e.message||e)}</div>`; });
    }
  }
  function installWarehouse(){
    window.setWarehouseZone = setWarehouseZoneFixed;
    window.renderWarehouse = renderWarehouseFast;
    window.renderWarehouseZones = ()=>renderFixedWarehouse({cells: state?.warehouse?.cells || []});
    document.addEventListener('click', (e)=>{
      const slot = e.target.closest('.yx-v16-slot'); if(!slot) return;
      if (typeof window.openWarehouseModal === 'function') window.openWarehouseModal(slot.dataset.zone, Number(slot.dataset.column), Number(slot.dataset.num));
    }, true);
  }
  function install(){
    window.selectCustomerForModule = fastSelectCustomer;
    bindCustomerCards();
    installWarehouse();
    if (page()==='warehouse') renderWarehouseFast();
    if (['orders','master_order','ship'].includes(page())) {
      const name = ($('customer-name')?.value || '').trim(); if (name) fastSelectCustomer(name);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
  setTimeout(install, 300);
  setTimeout(install, 1200);
})();
