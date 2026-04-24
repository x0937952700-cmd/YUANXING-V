/* ==== FIX33：總單客戶清單 + 件數規則 + 高寬長排序 ==== */
(function(){
  'use strict';
  const VERSION = 'fix33-master-customer-qty-sort';
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const moduleKey = () => document.querySelector('.module-screen')?.dataset?.module ||
    (location.pathname.includes('/master-order') ? 'master_order' :
     location.pathname.includes('/orders') ? 'orders' :
     location.pathname.includes('/inventory') ? 'inventory' :
     location.pathname.includes('/ship') ? 'ship' :
     location.pathname.includes('/warehouse') ? 'warehouse' : '');
  window.__YUANXING_FIX_VERSION__ = VERSION;
  document.documentElement.dataset.yxVersion = VERSION;

  async function api(url, options={}){
    const opts = {credentials:'same-origin', ...options};
    opts.headers = {'Content-Type':'application/json', ...(options.headers || {})};
    const res = await fetch(url, opts);
    const data = await res.json().catch(()=>({}));
    if(!res.ok || data.success === false){
      throw new Error(data.error || data.message || `請求失敗：${res.status}`);
    }
    return data;
  }

  function say(msg, type='ok'){
    if(typeof window.toast === 'function') window.toast(msg, type);
    else alert(msg);
  }

  function sizeText(productText, row={}){
    if(row.size_text) return row.size_text;
    const raw = String(productText || '').replace(/[×X＊*]/g,'x').replace('＝','=').trim();
    const left = (raw.split('=',1)[0] || raw);
    const m = left.match(/(\d+)\D+(\d+)\D+(\d+)/);
    if(m) return `${Number(m[1])}x${Number(m[2])}x${String(Number(m[3])).padStart(2,'0')}`;
    return left;
  }

  function supportText(productText, row={}){
    if(row.support_text) return row.support_text;
    const raw = String(productText || '').replace(/[×X＊*]/g,'x').replace('＝','=').trim();
    if(raw.includes('=')){
      const right = raw.split('=',2)[1] || '';
      // 若右側只有支數，搭配 qty 顯示成 支數x件數
      if(right && !/[+＋]/.test(right) && !/x\d+$/i.test(right) && Number(row.qty||0) > 1){
        return `${right}x${Number(row.qty||0)}`;
      }
      return right;
    }
    return String(row.qty || '');
  }

  function sortTuple(productText, row={}){
    const st = sizeText(productText, row);
    const nums = (st.match(/\d+/g)||[]).map(Number);
    if(nums.length >= 3){
      const [l,w,h] = nums;
      return [h,w,l,st];
    }
    return [999999,999999,999999,st];
  }

  function sortRows(rows){
    return [...(rows||[])].sort((a,b)=>{
      const A = sortTuple(a.product_text || '', a);
      const B = sortTuple(b.product_text || '', b);
      for(let i=0;i<3;i++){ if(A[i] !== B[i]) return A[i]-B[i]; }
      return String(A[3]).localeCompare(String(B[3]), 'zh-Hant');
    });
  }

  function renderCustomerItemsPanel(name, items){
    const panel = $('selected-customer-items');
    if(!panel) return;
    const rows = sortRows(items || []);
    const qtyTotal = rows.reduce((sum, it) => sum + (Number(it.qty || 0) || 0), 0);
    panel.classList.remove('hidden');
    if(!rows.length){
      panel.innerHTML = `<div class="customer-detail-card"><div class="section-title">${esc(name || '')}</div><div class="empty-state-card compact-empty">此客戶目前沒有商品</div></div>`;
      return;
    }
    const body = rows.map(it => `<tr>
      <td>${esc(sizeText(it.product_text, it))}</td>
      <td>${esc(supportText(it.product_text, it))}</td>
      <td>${esc(it.material || (it.product_code && it.product_code !== it.product_text ? it.product_code : '') || '')}</td>
      <td>${esc(it.source || '')}</td>
    </tr>`).join('');
    panel.innerHTML = `<div class="customer-detail-card">
      <div class="customer-detail-header">
        <div><div class="section-title">${esc(name || '')}</div><div class="muted">${qtyTotal}件 / ${rows.length}筆商品</div></div>
      </div>
      <div class="table-card customer-table-wrap">
        <table><thead><tr><th>尺寸</th><th>支數 x 件數</th><th>材質</th><th>來源</th></tr></thead><tbody>${body}</tbody></table>
      </div>
    </div>`;
  }

  async function loadSelectedCustomerItems(name){
    if(!name) return [];
    const data = await api(`/api/customer-items?name=${encodeURIComponent(name)}&ts=${Date.now()}`, {method:'GET'});
    return sortRows(data.items || []);
  }

  function selectedCustomer(){
    return String($('customer-name')?.value || window.__YX_SELECTED_CUSTOMER__ || '').trim();
  }

  async function editMasterRow(row){
    const product = prompt('商品資料', row.product_text || '');
    if(product === null) return;
    const qtyText = prompt('數量', String(row.qty || 0));
    if(qtyText === null) return;
    const qty = Math.max(0, parseInt(qtyText,10)||0);
    try{
      await api(`/api/master_orders/${row.id}`, {method:'PUT', body:JSON.stringify({
        product_text:product.trim(), product_code:product.trim(), qty, customer_name: row.customer_name || selectedCustomer()
      })});
      say('已儲存','ok');
      await window.loadMasterList?.();
      const name = selectedCustomer();
      if(name) renderCustomerItemsPanel(name, await loadSelectedCustomerItems(name));
    }catch(e){ say(e.message || '儲存失敗', 'error'); }
  }

  async function deleteMasterRow(row){
    if(!confirm(`確定刪除這筆總單？\n${row.product_text || ''}`)) return;
    try{
      await api(`/api/master_orders/${row.id}`, {method:'DELETE'});
      say('已刪除','ok');
      await window.loadMasterList?.();
      const name = selectedCustomer();
      if(name) renderCustomerItemsPanel(name, await loadSelectedCustomerItems(name));
    }catch(e){ say(e.message || '刪除失敗', 'error'); }
  }

  async function transferMasterRow(row, target){
    let max = Number(row.qty || 0) || 0;
    const qtyText = prompt(`要處理幾件？最多 ${max}`, String(max));
    if(qtyText === null) return;
    const qty = Math.max(1, Math.min(max, parseInt(qtyText,10)||max));
    let customer = row.customer_name || selectedCustomer();
    if(target === 'orders' || target === 'ship'){
      const ans = prompt(target === 'orders' ? '要移到哪個客戶的訂單？' : '出貨客戶名稱', customer);
      if(ans === null) return;
      customer = String(ans || '').trim();
      if(!customer) return say('請輸入客戶名稱','warn');
    }
    const label = target === 'orders' ? '訂單' : target === 'inventory' ? '庫存' : '出貨';
    if(!confirm(`確認${target === 'ship' ? '出貨' : '移到' + label}？\n${row.product_text || ''}\n數量：${qty}\n客戶：${customer || '未指定'}`)) return;
    try{
      await api('/api/items/transfer', {method:'POST', body:JSON.stringify({
        source:'master_order', id:row.id, target, qty, customer_name:customer, allow_inventory_fallback:true
      })});
      say(`已${target === 'ship' ? '出貨' : '移到' + label}`,'ok');
      await window.loadMasterList?.();
      const name = selectedCustomer();
      if(name) renderCustomerItemsPanel(name, await loadSelectedCustomerItems(name));
    }catch(e){ say(e.message || '操作失敗','error'); }
  }

  function renderSelectedMasterList(name, rows){
    const box = $('master-list');
    if(!box) return;
    const section = $('master-list-section');
    if(section) section.style.display = '';
    const masters = sortRows((rows || []).filter(it => it.source === '總單' || it.source === 'master_orders' || it.source === '總單清單'));
    if(!name){
      box.innerHTML = '<div class="empty-state-card compact-empty">請先點選左側客戶，只顯示該客戶的總單商品。</div>';
      return;
    }
    if(!masters.length){
      box.innerHTML = `<div class="empty-state-card compact-empty">${esc(name)} 目前沒有總單商品</div>`;
      return;
    }
    box.innerHTML = masters.map(row => `<div class="card fix28-action-card fix33-master-card" data-id="${Number(row.id||0)}">
      <div class="fix28-item-main">
        <div class="title">${esc(sizeText(row.product_text, row))}</div>
        <div class="sub">支數 x 件數：${esc(supportText(row.product_text, row))}｜數量：${Number(row.qty||0)}</div>
        <div class="sub">客戶：${esc(row.customer_name || name)}</div>
        <div class="sub">材質：${esc(row.material || (row.product_code && row.product_code !== row.product_text ? row.product_code : '') || '未指定')}</div>
      </div>
      <div class="fix28-card-actions">
        <button class="ghost-btn tiny-btn" data-act="edit">編輯</button>
        <button class="ghost-btn tiny-btn" data-act="orders">移到訂單</button>
        <button class="ghost-btn tiny-btn" data-act="inventory">轉回庫存</button>
        <button class="ghost-btn tiny-btn" data-act="ship">直接出貨</button>
        <button class="ghost-btn tiny-btn danger-btn" data-act="delete">刪除</button>
      </div>
    </div>`).join('');
    box.querySelectorAll('.fix33-master-card').forEach(card => {
      const row = masters.find(x => Number(x.id||0) === Number(card.dataset.id));
      card.querySelector('[data-act="edit"]')?.addEventListener('click', () => editMasterRow(row));
      card.querySelector('[data-act="delete"]')?.addEventListener('click', () => deleteMasterRow(row));
      card.querySelector('[data-act="orders"]')?.addEventListener('click', () => transferMasterRow(row, 'orders'));
      card.querySelector('[data-act="inventory"]')?.addEventListener('click', () => transferMasterRow(row, 'inventory'));
      card.querySelector('[data-act="ship"]')?.addEventListener('click', () => transferMasterRow(row, 'ship'));
      card.addEventListener('click', ev => { if(!ev.target.closest('button')) editMasterRow(row); });
    });
  }

  async function refreshCustomerSelection(name){
    window.__YX_SELECTED_CUSTOMER__ = name || '';
    const items = await loadSelectedCustomerItems(name);
    renderCustomerItemsPanel(name, items);
    if(moduleKey() === 'master_order') renderSelectedMasterList(name, items);
  }

  function installSelectCustomerOverride(){
    if(window.__fix33SelectInstalled) return;
    window.__fix33SelectInstalled = true;
    const old = window.selectCustomerForModule;
    window.selectCustomerForModule = async function(name){
      if(typeof old === 'function'){
        try{ await old.apply(this, arguments); }catch(_){}
      }
      try{ await refreshCustomerSelection(name); }catch(e){ say(e.message || '載入客戶商品失敗','error'); }
    };
  }

  function installMasterLoader(){
    if(window.__fix33MasterLoaderInstalled) return;
    window.__fix33MasterLoaderInstalled = true;
    const old = window.loadMasterList;
    window.loadMasterList = async function(){
      if(moduleKey() !== 'master_order'){
        return typeof old === 'function' ? old.apply(this, arguments) : undefined;
      }
      const name = selectedCustomer();
      if(!name){
        renderSelectedMasterList('', []);
        return [];
      }
      try{
        const items = await loadSelectedCustomerItems(name);
        renderSelectedMasterList(name, items);
        renderCustomerItemsPanel(name, items);
        return items;
      }catch(e){
        const box = $('master-list');
        if(box) box.innerHTML = `<div class="error-card">${esc(e.message || '總單載入失敗')}</div>`;
        return [];
      }
    };
  }

  function boot(){
    installSelectCustomerOverride();
    installMasterLoader();
    if(moduleKey() === 'master_order'){
      const name = selectedCustomer();
      if(name) refreshCustomerSelection(name).catch(()=>null);
      else renderSelectedMasterList('', []);
    }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
