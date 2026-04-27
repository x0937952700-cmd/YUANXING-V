/* ==== FIX149: inventory cards + customer detail cards + batch material hard lock ==== */
(function FIX149_CUSTOMER_INVENTORY_ACTION_HARD_LOCK(){
  'use strict';
  if (window.__YX149_CUSTOMER_INVENTORY_ACTION_HARD_LOCK__) return;
  window.__YX149_CUSTOMER_INVENTORY_ACTION_HARD_LOCK__ = true;

  const d = document;
  const $ = id => d.getElementById(id);
  const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const toast = (msg, kind='ok') => { try { (window.toast || window.showToast || window.notify || console.log)(msg, kind); } catch(_e) {} };
  const moduleKey = () => d.querySelector('.module-screen')?.dataset?.module || d.body?.dataset?.module || '';
  const normalizeX = v => String(v || '').replace(/[×ＸX✕＊*]/g,'x').replace(/[＝]/g,'=').replace(/\s*x\s*/ig,'x').replace(/\s*=\s*/g,'=');
  const parseJsonSafe = text => { try { return text ? JSON.parse(text) : {}; } catch(_e) { return {success:false, error:text || '伺服器回應格式錯誤'}; } };

  async function api(url, opt={}){
    const res = await fetch(url, {credentials:'same-origin', cache:'no-store', ...opt, headers:{'Content-Type':'application/json', ...(opt.headers || {})}});
    const text = await res.text();
    const data = parseJsonSafe(text);
    if (!res.ok || data.success === false) throw new Error(data.error || data.message || text || `請求失敗：${res.status}`);
    return data;
  }

  function sourceKey(s){
    s = clean(s);
    if (/總單|master/i.test(s)) return 'master_order';
    if (/訂單|order/i.test(s)) return 'orders';
    if (/庫存|inventory/i.test(s)) return 'inventory';
    return s || moduleKey() || 'inventory';
  }
  function apiSource(s){ s = sourceKey(s); return s === 'master_order' ? 'master_orders' : s; }
  function sourceTitle(s){ s = sourceKey(s); return s === 'master_order' ? '總單' : s === 'orders' ? '訂單' : '庫存'; }
  function materialOf(r){ const m = clean(r?.material || r?.product_code || ''); return /\d+\s*x\s*\d+|=/.test(m) ? '' : m; }
  function splitProduct(text){ const p = normalizeX(text || ''); const parts = p.split('='); return {size: clean(parts[0] || ''), support: clean(parts.slice(1).join('=') || '')}; }
  function qtyFromText(text, fallback=0){
    const right = normalizeX(String(text || '').split('=').slice(1).join('='));
    if (!right) return Number(fallback || 0) || 0;
    let total = 0, parsed = false;
    right.split(/[+＋,，;；]/).map(clean).filter(Boolean).forEach(seg => {
      const m = seg.match(/x\s*(\d+)\b/i);
      if (m) { total += Number(m[1] || 0); parsed = true; }
      else if (/\d+\s*(件|片|包)/.test(seg)) { total += Number((seg.match(/\d+/)||['0'])[0]); parsed = true; }
      else if (/\d/.test(seg)) { total += 1; parsed = true; }
    });
    return parsed ? total : (Number(fallback || 0) || 0);
  }
  function rowQty(r){ return Number(r?.qty || r?.quantity || 0) || qtyFromText(r?.product_text || r?.product || '', 0); }
  function sizeSortTuple(text){
    const left = normalizeX(String(text || '').split('=')[0] || '');
    const mm = left.match(/^(\d{1,2})\s*月(.+)$/);
    const month = mm ? Number(mm[1]) : 99;
    const body = mm ? mm[2] : left;
    const nums = (body.match(/\d+(?:\.\d+)?/g) || []).map(Number);
    return nums.length >= 3 ? [month, nums[2], nums[1], nums[0]] : [month, 999999, 999999, 999999];
  }
  function rowSort(a,b){
    const ak = [materialOf(a).toUpperCase(), ...sizeSortTuple(a.product_text || a.product || ''), -rowQty(a), String(a.customer_name || '')];
    const bk = [materialOf(b).toUpperCase(), ...sizeSortTuple(b.product_text || b.product || ''), -rowQty(b), String(b.customer_name || '')];
    for (let i=0;i<ak.length;i++){ if (ak[i] < bk[i]) return -1; if (ak[i] > bk[i]) return 1; }
    return Number(a.id || 0) - Number(b.id || 0);
  }
  function productLine(r){ const p = splitProduct(r.product_text || r.product || r.size || ''); return p.support ? `${p.size}=${p.support}` : p.size; }
  function sameProductKey(r){ const p = splitProduct(r.product_text || r.product || ''); return `${materialOf(r).toUpperCase()}__${p.size.replace(/\s+/g,'').toLowerCase()}__${p.support.replace(/\s+/g,'').toLowerCase()}`; }
  function setCustomer(name, uid=''){
    window.__YX_SELECTED_CUSTOMER__ = clean(name);
    window.state = window.state || {};
    window.state.currentCustomer = clean(name);
    window.state.currentCustomerUid = clean(uid);
    const input = $('customer-name');
    if (input) { input.value = clean(name); input.dataset.customerUid = clean(uid); }
  }

  const store = window.__YX149_STORE__ = window.__YX149_STORE__ || {inventoryRows:[], inventorySelectedKey:'', activeCustomer:{name:'', uid:'', source:'', rows:[]}};
  function clearOldMiniHosts(){ d.querySelectorAll('#yx147-inventory-mini-cards,#yx148-inventory-mini-cards,#yx143-selected-mini-cards').forEach(el => el.remove()); }
  function inventoryHost(){
    let host = $('inventory-inline-list');
    if (!host) {
      const panel = $('inventory-inline-panel') || $('inventory-summary-section') || d.querySelector('[data-module="inventory"]');
      if (!panel) return null;
      host = d.createElement('div'); host.id = 'inventory-inline-list'; host.className = 'card-list inventory-inline-list'; panel.appendChild(host);
    }
    host.classList.add('yx149-mini-grid','yx149-inventory-host');
    host.dataset.yxModule = 'productCards';
    host.dataset.yxOwner = 'fix149';
    return host;
  }
  function inventoryRowFromDom(row){
    const id = Number(row?.dataset?.id || 0);
    if (id) return store.inventoryRows.find(r => Number(r.id||0) === id) || {id};
    const txt = clean(row?.textContent || '');
    return store.inventoryRows.find(r => txt.includes(splitProduct(r.product_text||'').size) && txt.includes(String(rowQty(r)))) || null;
  }
  async function fetchInventoryRows(force=false){
    if (!force && Array.isArray(store.inventoryRows) && store.inventoryRows.length) return store.inventoryRows;
    const data = await api('/api/inventory?raw=1&exact=1&yx149=1&ts=' + Date.now(), {method:'GET'});
    store.inventoryRows = (data.items || data.records || data.inventory || []).map(r => ({...r, source:'inventory'})).sort(rowSort);
    return store.inventoryRows;
  }
  function renderInventoryCards(rows){
    if (moduleKey() !== 'inventory') return;
    clearOldMiniHosts();
    const host = inventoryHost(); if (!host) return;
    rows = (rows || store.inventoryRows || []).slice().sort(rowSort);
    const selectedKey = store.inventorySelectedKey || '';
    const shown = selectedKey ? rows.filter(r => String(r.id||'') === selectedKey || sameProductKey(r) === selectedKey) : rows;
    host.innerHTML = shown.length ? shown.map(r => {
      const id = Number(r.id || 0); const mat = materialOf(r) || '未填材質'; const qty = rowQty(r); const line = productLine(r);
      return `<div class="yx149-item-card yx149-inventory-card" data-yx-owner="fix149" data-source="inventory" data-id="${id}" data-product-text="${esc(line)}" data-material="${esc(mat)}" data-qty="${qty}">
        <div class="yx149-card-head"><span class="yx149-card-material">${esc(mat)}</span><span class="yx149-card-qty">${qty}件</span></div>
        <div class="yx149-card-product">${esc(line)}</div>
        ${r.customer_name ? `<div class="yx149-card-customer">${esc(r.customer_name)}</div>` : ''}
        <div class="yx149-card-actions">
          <button type="button" class="ghost-btn tiny-btn" data-yx149-action="edit">編輯</button>
          <button type="button" class="ghost-btn tiny-btn danger-btn" data-yx149-action="delete">刪除</button>
          <button type="button" class="ghost-btn tiny-btn" data-yx149-action="add-order">加到訂單</button>
          <button type="button" class="ghost-btn tiny-btn" data-yx149-action="add-master">加到總單</button>
        </div>
      </div>`;
    }).join('') : '<div class="empty-state-card compact-empty">目前沒有庫存商品</div>';
    d.querySelectorAll('.yx63-summary-row[data-source="inventory"]').forEach(row => {
      const r = inventoryRowFromDom(row); const on = selectedKey && r && (String(r.id||'') === selectedKey || sameProductKey(r) === selectedKey);
      row.classList.toggle('yx149-current-row', !!on);
    });
  }
  async function renderInventoryNow(force=false){
    if (moduleKey() !== 'inventory') return;
    try { const rows = await fetchInventoryRows(force); renderInventoryCards(rows); } catch(e) { const host=inventoryHost(); if(host) host.innerHTML = `<div class="error-card">${esc(e.message || '庫存商品載入失敗')}</div>`; }
  }
  function chooseInventoryRow(row){
    const r = inventoryRowFromDom(row); if (!r) return;
    const id = String(r.id || ''); const key = id || sameProductKey(r);
    store.inventorySelectedKey = store.inventorySelectedKey === key ? '' : key;
    renderInventoryCards(store.inventoryRows);
  }

  let customerRefreshTimer = 0;
  async function loadCustomerBlocks149(force=false){
    clearTimeout(customerRefreshTimer);
    return new Promise(resolve => {
      customerRefreshTimer = setTimeout(async () => { try { await window.loadCustomerBlocks?.(!!force); } catch(_e) {} resolve(true); }, force ? 30 : 120);
    });
  }
  async function refreshAllAfterChange(source, opts={}){
    try { window.__YX127_CLEAR_SHORT_API_CACHE__?.('fix149'); } catch(_e) {}
    const jobs = [];
    if (sourceKey(source) === 'inventory' || opts.inventory) jobs.push(renderInventoryNow(true));
    if (['orders','master_order'].includes(sourceKey(source)) || opts.customers) jobs.push(loadCustomerBlocks149(true));
    if (store.activeCustomer.name && ['orders','master_order'].includes(store.activeCustomer.source)) jobs.push(selectCustomer149(store.activeCustomer.name, store.activeCustomer.uid, store.activeCustomer.source, {silent:true, force:true}));
    await Promise.allSettled(jobs);
  }
  async function inventoryCardAction(card, action){
    const id = Number(card?.dataset?.id || 0); if (!id) return toast('找不到商品 ID', 'error');
    const row = store.inventoryRows.find(r => Number(r.id||0) === id) || {};
    if (action === 'edit') {
      const next = prompt('修改商品資料', productLine(row)); if (next === null) return;
      const q = prompt('修改數量', String(rowQty(row))); if (q === null) return;
      const mat = prompt('修改材質', materialOf(row)); if (mat === null) return;
      await api(`/api/inventory/${id}`, {method:'PUT', body:JSON.stringify({product_text:normalizeX(next), qty:Number(q)||qtyFromText(next, rowQty(row)), material:clean(mat), product_code:clean(mat), customer_name:row.customer_name || ''})});
      toast('庫存已更新', 'ok');
      await refreshAllAfterChange('inventory', {inventory:true});
    } else if (action === 'delete') {
      if (!confirm('確定刪除此庫存商品？')) return;
      card.style.opacity = '0.45';
      await api(`/api/inventory/${id}`, {method:'DELETE'});
      card.remove(); toast('庫存已刪除', 'ok');
      await refreshAllAfterChange('inventory', {inventory:true});
    } else if (action === 'add-order' || action === 'add-master') {
      const target = action === 'add-order' ? 'orders' : 'master_order';
      let customer = clean(row.customer_name || $('customer-name')?.value || window.__YX_SELECTED_CUSTOMER__ || '');
      customer = prompt(`請輸入要加入${target==='orders'?'訂單':'總單'}的客戶名稱`, customer) || '';
      customer = clean(customer);
      if (!customer) return toast('請輸入客戶名稱', 'warn');
      const q = Number(prompt('移動數量', String(rowQty(row))) || rowQty(row)) || rowQty(row);
      await api(`/api/inventory/${id}/move`, {method:'POST', body:JSON.stringify({target, customer_name:customer, qty:q})});
      toast(`已加入${target==='orders'?'訂單':'總單'}`, 'ok');
      await refreshAllAfterChange('inventory', {inventory:true, customers:true});
    }
  }

  async function fetchCustomerItems149(name, uid, source){
    source = sourceKey(source);
    const qs = new URLSearchParams({name:clean(name), customer_uid:clean(uid), source:apiSource(source), raw:'1', exact:'1', no_aggregate:'1', yx149:'1', ts:String(Date.now())});
    const data = await api('/api/customer-items?' + qs.toString(), {method:'GET'});
    return (data.items || []).map(it => ({...it, customer_name:clean(name), customer_uid:clean(uid || it.customer_uid || ''), source})).sort(rowSort);
  }
  function detailPanelHost(){ const panel = $('selected-customer-items'); if (!panel) return null; panel.dataset.yxModule='productTable'; panel.dataset.yxOwner='fix149'; panel.classList.remove('hidden'); panel.hidden=false; panel.style.removeProperty('display'); return panel; }
  function renderCustomerDetail149(name, rows, source){
    const panel = detailPanelHost(); if (!panel) return;
    source = sourceKey(source); const title = sourceTitle(source); const total = (rows || []).reduce((s,r) => s + rowQty(r), 0);
    const tableRows = rows.length ? rows.map(r => { const p=splitProduct(r.product_text||''); return `<tr class="yx149-detail-row" data-source="${source}" data-id="${Number(r.id||0)}"><td>${esc(materialOf(r))}</td><td>${esc(p.size)}</td><td>${esc(p.support)}</td><td class="yx149-num">${rowQty(r)}</td></tr>`; }).join('') : `<tr><td colspan="4">此客戶目前沒有${title}商品</td></tr>`;
    const cards = rows.length ? rows.map(r => { const line=productLine(r), qty=rowQty(r), mat=materialOf(r)||'未填材質'; return `<div class="yx149-item-card yx149-customer-card" data-yx-owner="fix149" data-source="${source}" data-id="${Number(r.id||0)}" data-customer="${esc(name)}" data-product-text="${esc(line)}" data-material="${esc(mat)}" data-qty="${qty}">
      <div class="yx149-card-head"><span class="yx149-card-material">${esc(mat)}</span><span class="yx149-card-qty">${qty}件</span></div>
      <div class="yx149-card-product">${esc(line)}</div>
      <div class="yx149-card-actions"><button type="button" class="ghost-btn tiny-btn" data-yx149-action="edit">編輯</button><button type="button" class="ghost-btn tiny-btn" data-yx149-action="ship">直接出貨</button><button type="button" class="ghost-btn tiny-btn danger-btn" data-yx149-action="delete">刪除</button></div>
    </div>`; }).join('') : `<div class="empty-state-card compact-empty">此客戶目前沒有${title}商品</div>`;
    panel.innerHTML = `<div class="customer-detail-card yx149-detail-card"><div class="customer-detail-header"><div><div class="section-title">${esc(title)}清單｜${esc(name)}</div><div class="muted">${total}件 / ${rows.length}筆商品</div></div></div><div class="table-card customer-table-wrap yx149-detail-table"><table><thead><tr><th>材質</th><th>尺寸</th><th>支數 x 件數</th><th>數量</th></tr></thead><tbody>${tableRows}</tbody></table></div><div class="yx149-mini-grid yx149-customer-mini-grid">${cards}</div></div>`;
  }
  let selectSeq = 0;
  async function selectCustomer149(name, uid='', source='', opts={}){
    name = clean(name); uid = clean(uid); source = sourceKey(source || moduleKey());
    if (!name || !['orders','master_order','ship'].includes(source)) return [];
    const seq = ++selectSeq;
    setCustomer(name, uid);
    const panel = detailPanelHost(); if (panel && !opts.silent) panel.innerHTML = '<div class="empty-state-card compact-empty">客戶商品載入中…</div>';
    try {
      const rows = await fetchCustomerItems149(name, uid, source === 'ship' ? 'master_order' : source);
      if (seq !== selectSeq && !opts.force) return rows;
      store.activeCustomer = {name, uid, source: source === 'ship' ? 'master_order' : source, rows};
      renderCustomerDetail149(name, rows, source === 'ship' ? 'master_order' : source);
      return rows;
    } catch(e) { if (panel) panel.innerHTML = `<div class="error-card">${esc(e.message || '載入客戶商品失敗')}</div>`; toast(e.message || '載入客戶商品失敗', 'error'); return []; }
  }
  async function customerItemAction(card, action){
    const source = sourceKey(card?.dataset?.source || store.activeCustomer.source || moduleKey());
    const id = Number(card?.dataset?.id || 0); if (!id) return toast('找不到商品 ID', 'error');
    const rows = store.activeCustomer.rows || [];
    const row = rows.find(r => Number(r.id||0) === id) || {product_text:card.dataset.productText, qty:Number(card.dataset.qty||0), material:card.dataset.material, customer_name:store.activeCustomer.name};
    if (action === 'ship') {
      const draft = {customer_name:store.activeCustomer.name || row.customer_name || clean($('customer-name')?.value || ''), product_text:productLine(row), material:materialOf(row), source:apiSource(source), source_customer_name:store.activeCustomer.name || row.customer_name || '', at:Date.now()};
      localStorage.setItem('yxShipDraft', JSON.stringify(draft));
      if (moduleKey() === 'ship') { if ($('customer-name')) $('customer-name').value = draft.customer_name; if ($('ocr-text')) $('ocr-text').value = draft.product_text; toast('已加入出貨商品', 'ok'); }
      else location.href = '/ship';
      return;
    }
    if (action === 'delete') {
      if (!confirm('確定刪除此商品？')) return;
      card.style.opacity = '0.45';
      await api('/api/customer-item', {method:'DELETE', body:JSON.stringify({source:apiSource(source), id})});
      card.remove(); toast('已刪除商品', 'ok');
      await refreshAllAfterChange(source, {customers:true});
      return;
    }
    if (action === 'edit') {
      const next = prompt('修改商品資料', productLine(row)); if (next === null) return;
      const q = prompt('修改數量', String(rowQty(row))); if (q === null) return;
      const mat = prompt('修改材質', materialOf(row)); if (mat === null) return;
      await api('/api/customer-item', {method:'POST', body:JSON.stringify({source:apiSource(source), id, product_text:normalizeX(next), qty:Number(q)||qtyFromText(next, rowQty(row)), material:clean(mat)})});
      toast('商品已更新', 'ok');
      await refreshAllAfterChange(source, {customers:true});
    }
  }

  function cardName(card){ return clean(card?.dataset?.customer || card?.dataset?.customerName || card?.getAttribute?.('data-customer-name') || card?.querySelector?.('.customer-card-name,.customer-name,.yx-customer-left')?.textContent || ''); }
  function cardUid(card){ return clean(card?.dataset?.customerUid || card?.dataset?.uid || ''); }
  function handleCustomerPointer149(ev){
    if (!['orders','master_order','ship'].includes(moduleKey())) return;
    if (ev.target?.closest?.('button,a,input,textarea,select,.yx122-card-menu,.customer-action-btn')) return;
    const card = ev.target?.closest?.('.customer-region-card,.yx122-customer-card,.yx143-apple-customer-card,[data-customer-name]');
    if (!card) return;
    const name = cardName(card); if (!name) return;
    const uid = cardUid(card);
    window.setTimeout(() => selectCustomer149(name, uid, moduleKey(), {force:true}).catch(()=>{}), 0);
  }

  function selectedBatchItems(source){
    source = sourceKey(source);
    const out = new Map(); const add = (src,id) => { src=apiSource(src); id=Number(id||0); if(id>0) out.set(`${src}:${id}`, {source:src, id}); };
    d.querySelectorAll(`.yx63-row-check[data-source="${source}"]:checked,.yx63-summary-row[data-source="${source}"].yx63-row-selected,.yx63-summary-row[data-source="${source}"].yx149-current-row`).forEach(el => { const row = el.closest?.('.yx63-summary-row') || el; add(source, row.dataset.id || el.dataset.id); });
    d.querySelectorAll(`#selected-customer-items .yx149-item-card[data-source="${source}"].is-selected,#selected-customer-items .yx149-detail-row[data-source="${source}"].yx63-row-selected`).forEach(el => add(source, el.dataset.id));
    return Array.from(out.values());
  }
  function visibleBatchItems(source){ source = sourceKey(source); if (source === 'inventory') return (store.inventoryRows || []).map(r => ({source:apiSource(source), id:Number(r.id||0)})).filter(x=>x.id); return (store.activeCustomer.rows || []).filter(r => sourceKey(r.source || source) === source).map(r => ({source:apiSource(source), id:Number(r.id||0)})).filter(x=>x.id); }
  async function batchMaterial149(source, btn){
    source = sourceKey(source || moduleKey());
    let material = clean($(`yx63-${source}-material`)?.value || $('batch-material')?.value || btn?.parentElement?.querySelector?.('select')?.value || '').toUpperCase();
    if (!material) return toast('請先選擇材質', 'warn');
    let items = selectedBatchItems(source);
    if (!items.length) { if (!confirm('沒有勾選商品，是否套用到目前清單全部商品？')) return; items = visibleBatchItems(source); }
    if (!items.length) return toast('目前沒有可套用的商品', 'warn');
    btn && (btn.disabled = true);
    try {
      await api('/api/customer-items/batch-material', {method:'POST', body:JSON.stringify({material, items})});
      items.forEach(it => { d.querySelectorAll(`[data-source="${source}"][data-id="${it.id}"], [data-source="${apiSource(source)}"][data-id="${it.id}"]`).forEach(el => { el.dataset.material = material; el.querySelectorAll('.yx63-material-cell,.yx149-card-material,.yx94-mat').forEach(m => m.textContent = material); }); });
      toast(`已套用材質 ${material}：${items.length} 筆`, 'ok');
      if (source === 'inventory') await renderInventoryNow(true);
      else await selectCustomer149(store.activeCustomer.name || clean($('customer-name')?.value || ''), store.activeCustomer.uid || $('customer-name')?.dataset?.customerUid || '', source, {silent:true, force:true});
      await loadCustomerBlocks149(false);
    } catch(e) { toast(e.message || '批量加材質失敗', 'error'); }
    finally { btn && (btn.disabled = false); }
  }

  async function loadShipItems149(arg={}){
    if (moduleKey() !== 'ship') return [];
    const name = clean((typeof arg === 'string' ? arg : arg.name) || $('customer-name')?.value || window.__YX_SELECTED_CUSTOMER__ || '');
    const uid = clean((typeof arg === 'object' ? arg.customer_uid : '') || $('customer-name')?.dataset?.customerUid || '');
    const sel = $('ship-customer-item-select');
    if (!name && !uid) { if(sel) sel.innerHTML = '<option value="">請先選擇 / 輸入客戶名稱</option>'; window.__YX_SHIP_CUSTOMER_ITEMS__=[]; return []; }
    if (sel && !arg.silent) sel.innerHTML = '<option value="">載入中…</option>';
    const qs = new URLSearchParams({name, customer_uid:uid, source:'master_orders', raw:'1', exact:'1', yx149:'1', ts:String(Date.now())});
    const data = await api('/api/customer-items?' + qs.toString(), {method:'GET'});
    const items = (data.items || []).map(it => ({...it, source:'master_order', customer_name:name})).sort(rowSort);
    window.__YX_SHIP_CUSTOMER_ITEMS__ = items; window.__YX83_SHIP_ITEMS__ = items;
    if (sel) sel.innerHTML = '<option value="">請選擇商品</option>' + items.map((it,i)=>`<option value="${i}" data-yx149-option="1">${esc(materialOf(it)||'未填材質')}｜${esc(productLine(it))}｜${rowQty(it)}件</option>`).join('');
    return items;
  }
  function applyShipDraft149(){
    if (moduleKey() !== 'ship') return;
    let draft = null; try { draft = JSON.parse(localStorage.getItem('yxShipDraft') || 'null'); } catch(_e) {}
    if (!draft || Date.now() - Number(draft.at || 0) > 10*60*1000) return;
    if ($('customer-name')) $('customer-name').value = draft.customer_name || '';
    if ($('ocr-text')) $('ocr-text').value = draft.product_text || '';
    try { localStorage.removeItem('yxShipDraft'); } catch(_e) {}
    loadShipItems149({name:draft.customer_name || '', silent:true}).catch(()=>{});
  }

  function dispatchClick149(ev){
    const actionBtn = ev.target?.closest?.('[data-yx149-action]');
    if (actionBtn) {
      const card = actionBtn.closest('.yx149-item-card'); if (!card) return;
      ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.();
      const src = sourceKey(card.dataset.source || moduleKey());
      Promise.resolve(src === 'inventory' ? inventoryCardAction(card, actionBtn.dataset.yx149Action) : customerItemAction(card, actionBtn.dataset.yx149Action)).catch(e => toast(e.message || '商品操作失敗', 'error'));
      return;
    }
    const batchBtn = ev.target?.closest?.('button');
    if (batchBtn && (/^yx63-.+-apply$/.test(batchBtn.id || '') || clean(batchBtn.textContent) === '批量加材質')) {
      const m = (batchBtn.id || '').match(/^yx63-(inventory|orders|master_order)-apply$/);
      const source = m ? m[1] : moduleKey();
      if (['inventory','orders','master_order'].includes(sourceKey(source))) {
        ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.();
        batchMaterial149(source, batchBtn).catch(e => toast(e.message || '批量加材質失敗', 'error'));
      }
    }
  }
  function dispatchPointer149(ev){
    const row = ev.target?.closest?.('.yx63-summary-row[data-source="inventory"]');
    if (row && moduleKey() === 'inventory' && !ev.target.closest('button,a,input,select,textarea')) window.setTimeout(() => chooseInventoryRow(row), 0);
    handleCustomerPointer149(ev);
  }
  function hardLockGlobals149(){
    try { window.loadInventory = function yx149LoadInventory(){ return renderInventoryNow(true); }; } catch(_e) {}
    try { window.renderInventoryCards149 = renderInventoryCards; window.renderInventoryNow149 = renderInventoryNow; } catch(_e) {}
    try { window.selectCustomerForModule = selectCustomer149; window.selectCustomer149 = selectCustomer149; window.yx149SelectCustomerForModule = selectCustomer149; } catch(_e) {}
    try { window.loadShipCustomerItems = loadShipItems149; window.yx149LoadShipCustomerItems = loadShipItems149; } catch(_e) {}
    try { window.__YX149_BATCH_MATERIAL__ = batchMaterial149; } catch(_e) {}
  }
  function installListeners149(){
    if (d.documentElement.dataset.yx149Listeners === '1') return;
    d.documentElement.dataset.yx149Listeners = '1';
    d.addEventListener('click', dispatchClick149, true);
    d.addEventListener('pointerup', dispatchPointer149, true);
    d.addEventListener('change', ev => { if (ev.target?.id === 'customer-name' && moduleKey() === 'ship') loadShipItems149({name:ev.target.value, silent:true}).catch(()=>{}); }, true);
  }
  let bootedAt = 0;
  function boot149(){
    bootedAt = Date.now();
    try { d.documentElement.dataset.yxFix149 = 'customer-inventory-action-hard-lock'; window.__YX_BUILD_VERSION__ = 'fix149-hard-lock-cards-customer-actions-20260427'; } catch(_e) {}
    hardLockGlobals149(); installListeners149(); clearOldMiniHosts();
    if (moduleKey() === 'inventory') renderInventoryNow(true);
    if (['orders','master_order'].includes(moduleKey())) { const existing = clean($('customer-name')?.value || window.__YX_SELECTED_CUSTOMER__ || ''); if (existing) selectCustomer149(existing, $('customer-name')?.dataset?.customerUid || '', moduleKey(), {silent:true, force:true}).catch(()=>{}); }
    applyShipDraft149();
    if (moduleKey() === 'ship') loadShipItems149({silent:true}).catch(()=>{});
    try { window.__YX121_OBSERVER__?.disconnect?.(); } catch(_e) {}
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot149, {once:true}); else boot149();
  window.addEventListener('pageshow', boot149, true);
  window.addEventListener('yx147:cache-cleared', () => { if (Date.now() - bootedAt > 150) boot149(); }, true);
})();
/* ==== FIX149 end ==== */
