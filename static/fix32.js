/* ==== FIX32：商用細節整理版（1～10 全部升級） ==== */
(function(){
  'use strict';
  const VERSION = 'fix32-commercial-detail';
  const $ = id => document.getElementById(id);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  const esc = v => String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const username = () => String(window.__YX_USERNAME__ || '').trim();
  const isAdmin = () => username() === '陳韋廷';
  const moduleKey = () => document.querySelector('.module-screen')?.dataset?.module ||
    (location.pathname.includes('/master-order') ? 'master_order' :
     location.pathname.includes('/orders') ? 'orders' :
     location.pathname.includes('/inventory') ? 'inventory' :
     location.pathname.includes('/ship') ? 'ship' :
     location.pathname.includes('/warehouse') ? 'warehouse' :
     location.pathname.includes('/today-changes') ? 'today' : '');
  const sourceLabel = s => s === 'inventory' ? '庫存' : s === 'orders' ? '訂單' : s === 'master_order' || s === 'master_orders' ? '總單' : '資料';
  const targetLabel = t => t === 'inventory' ? '庫存' : t === 'orders' ? '訂單' : t === 'ship' ? '出貨' : t === 'delete' ? '刪除' : '總單';
  const apiPath = (source, id) => source === 'inventory' ? `/api/inventory/${id}` : source === 'orders' ? `/api/orders/${id}` : `/api/master_orders/${id}`;

  window.__YUANXING_FIX_VERSION__ = VERSION;
  document.documentElement.dataset.yxVersion = VERSION;

  async function api(url, options={}){
    const opts = { credentials:'same-origin', ...options };
    opts.headers = { 'Content-Type':'application/json', ...(options.headers || {}) };
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => ({}));
    if(!res.ok || data.success === false){
      const err = new Error(data.error || data.message || `請求失敗：${res.status}`);
      err.payload = data; err.status = res.status;
      throw err;
    }
    return data;
  }

  function say(msg, type='ok'){
    if(typeof window.toast === 'function') window.toast(msg, type);
    else alert(msg);
  }

  async function confirmHtml(title, html, confirmText='確認'){
    if(typeof window.confirmHtml === 'function') return window.confirmHtml(title, html, confirmText);
    if(typeof window.confirmDialog === 'function') return window.confirmDialog({title, message:html, confirmText});
    return confirm(String(html || '').replace(/<[^>]+>/g,''));
  }

  function cleanCaches(){
    try{ localStorage.setItem('yuanxing_fix_version', VERSION); }catch(_){}
    try{
      navigator.serviceWorker?.getRegistrations?.().then(regs => {
        regs.forEach(reg => {
          // PWA 安全版：只清掉舊頁面快取，不強制移除目前的安全 SW。
          if(!String(reg.active?.scriptURL || '').includes('service-worker.js')) reg.unregister().catch(()=>null);
        });
      }).catch(()=>null);
    }catch(_){}
    try{
      caches?.keys?.().then(keys => keys.filter(k => !String(k).includes('yuanxing-pwa-icons')).forEach(k => caches.delete(k))).catch(()=>null);
    }catch(_){}
  }

  function qtyFromCard(card){
    const input = card?.querySelector('[data-fix30-action-qty], [data-act-qty], [data-fix31-bulk-qty], [data-fix32-op-qty]');
    const max = Number(input?.max || 0);
    if(max > 0) return max;
    const t = card?.textContent || '';
    const m = t.match(/數量[:：\s]*(\d+)/) || t.match(/總數量[:：\s]*(\d+)/) || t.match(/×\s*(\d+)/);
    return Math.max(1, Number(m?.[1] || 1) || 1);
  }

  function currentQty(card, max){
    const input = card?.querySelector('[data-fix30-action-qty], [data-act-qty], [data-fix31-bulk-qty], [data-fix32-op-qty]');
    const raw = Number.parseInt(input?.value || max || '1', 10) || 1;
    const qty = Math.max(1, Math.min(Math.max(1, max || 1), raw));
    if(input) input.value = String(qty);
    return qty;
  }

  function cardListBox(source=moduleKey()){
    if(source === 'inventory') return $('inventory-inline-list');
    if(source === 'orders') return $('orders-list');
    if(source === 'master_order') return $('master-list');
    return null;
  }

  function allCards(source=moduleKey()){
    const box = cardListBox(source);
    return box ? Array.from(box.querySelectorAll('.fix28-action-card')) : [];
  }

  function visibleCards(source=moduleKey()){
    return allCards(source).filter(card => card.offsetParent !== null);
  }

  function selectedCards(source=moduleKey()){
    return allCards(source).filter(card => card.style.display !== 'none' && card.querySelector('.fix31-row-check, .fix32-row-check')?.checked);
  }

  function refreshCurrent(){
    const m = moduleKey();
    if(m === 'inventory') return window.loadInventory?.();
    if(m === 'orders') return window.loadOrdersList?.();
    if(m === 'master_order') return window.loadMasterList?.();
    if(m === 'warehouse') return window.renderWarehouse?.();
    if(m === 'today') return window.renderTodayChangesPage?.();
  }

  function ensureQtyInput(card){
    if(!card || card.querySelector('[data-fix30-action-qty], [data-act-qty], [data-fix31-bulk-qty], [data-fix32-op-qty]')) return;
    const max = qtyFromCard(card);
    const actions = card.querySelector('.fix28-card-actions') || card;
    actions.insertAdjacentHTML('beforebegin', `<div class="fix32-qty-row"><label>本次操作數量</label><input class="text-input tiny-qty-input" data-fix32-op-qty type="number" min="1" max="${max}" value="${max}"><span class="small-note">剩餘會自動保留</span></div>`);
  }

  function addCardBadges(card, source){
    if(!card || card.querySelector('.fix32-status-strip')) return;
    const total = qtyFromCard(card);
    const text = card.textContent || '';
    const unplacedMatch = text.match(/未錄入倉庫圖[:：\s]*(\d+)/);
    const unplaced = Number(unplacedMatch?.[1] || 0);
    const placed = Math.max(0, total - unplaced);
    const status = unplaced > 0 ? '尚未完全入倉' : '已入倉或待確認';
    const statusClass = unplaced > 0 ? 'warn' : 'ok';
    const customerMatch = text.match(/客戶[:：]\s*([^\n｜]+)/);
    const customer = customerMatch?.[1]?.trim() || '';
    card.dataset.fix32Qty = String(total);
    card.dataset.fix32Unplaced = String(unplaced);
    card.dataset.fix32Placed = String(placed);
    card.dataset.fix32Source = source;
    card.insertAdjacentHTML('beforeend', `<div class="fix32-status-strip">
      <span class="mini-pill">來源：${esc(sourceLabel(source))}</span>
      <span class="mini-pill">總數量：${total}</span>
      <span class="mini-pill ${statusClass}">未入倉：${unplaced}</span>
      <span class="mini-pill">已入倉：${placed}</span>
      ${customer ? `<span class="mini-pill">客戶：${esc(customer)}</span>` : ''}
      <span class="mini-pill ${statusClass}">${status}</span>
    </div>`);
    ensureQtyInput(card);
  }

  function enhanceCards(){
    const source = moduleKey();
    if(!['inventory','orders','master_order'].includes(source)) return;
    allCards(source).forEach(card => {
      addCardBadges(card, source);
      if(!card.querySelector('.fix31-row-check') && !card.querySelector('.fix32-row-check')){
        card.insertAdjacentHTML('afterbegin', `<label class="fix32-card-check"><input class="fix32-row-check" type="checkbox"> 選取</label>`);
      }
      const input = card.querySelector('[data-fix30-action-qty], [data-act-qty], [data-fix31-bulk-qty], [data-fix32-op-qty]');
      if(input && !input.dataset.fix32Bound){
        input.dataset.fix32Bound = '1';
        input.addEventListener('input', () => {
          const max = qtyFromCard(card);
          const qty = currentQty(card, max);
          const remain = Math.max(0, max - qty);
          let note = card.querySelector('.fix32-remain-note');
          if(!note){
            note = document.createElement('div');
            note.className = 'small-note fix32-remain-note';
            input.closest('.fix32-qty-row,.fix30-action-qty-row,.fix31-bulk-qty-row')?.appendChild(note);
          }
          note.textContent = `本次 ${qty} 件，操作後剩餘 ${remain} 件`;
        });
        input.dispatchEvent(new Event('input'));
      }
    });
  }

  function ensureListFilters(){
    const old = document.getElementById('fix32-list-filters');
    if(old) old.remove();
    return;
    const source = moduleKey();
    if(!['inventory','orders','master_order'].includes(source)) return;
    const host = source === 'inventory' ? $('inventory-inline-panel') : (source === 'orders' ? $('orders-list-section') : $('master-list-section'));
    if(!host || $('fix32-list-filters')) return;
    const reportType = source === 'inventory' ? 'inventory' : (source === 'orders' ? 'orders' : 'master_orders');
    host.querySelector('.section-head')?.insertAdjacentHTML('afterend', `<div id="fix32-list-filters" class="fix32-filter-panel">
      <input id="fix32-filter-keyword" class="text-input" placeholder="搜尋尺寸 / 客戶 / 倉庫格位">
      <select id="fix32-filter-warehouse" class="text-input small">
        <option value="all">全部入倉狀態</option>
        <option value="unplaced">只看未入倉</option>
        <option value="placed">只看已入倉</option>
        <option value="low">低數量 1～2 件</option>
      </select>
      <input id="fix32-filter-date" class="text-input small" type="date" title="依畫面日期文字篩選">
      <button id="fix32-filter-clear" class="ghost-btn small-btn" type="button">清除篩選</button>
      <button id="fix32-export-current" class="primary-btn small-btn" type="button">匯出目前報表</button>
    </div>`);
    ['fix32-filter-keyword','fix32-filter-warehouse','fix32-filter-date'].forEach(id => $(id)?.addEventListener('input', applyListFilters));
    $('fix32-filter-warehouse')?.addEventListener('change', applyListFilters);
    $('fix32-filter-clear')?.addEventListener('click', () => {
      ['fix32-filter-keyword','fix32-filter-date'].forEach(id => { if($(id)) $(id).value=''; });
      if($('fix32-filter-warehouse')) $('fix32-filter-warehouse').value='all';
      applyListFilters();
    });
    $('fix32-export-current')?.addEventListener('click', () => {
      window.open(`/api/reports/export?type=${encodeURIComponent(reportType)}`, '_blank');
    });
  }

  function applyListFilters(){
    const source = moduleKey();
    if(!['inventory','orders','master_order'].includes(source)) return;
    const kw = ($('fix32-filter-keyword')?.value || '').trim().toLowerCase();
    const stateFilter = $('fix32-filter-warehouse')?.value || 'all';
    const date = $('fix32-filter-date')?.value || '';
    allCards(source).forEach(card => {
      const hay = (card.textContent || '').toLowerCase();
      const qty = Number(card.dataset.fix32Qty || qtyFromCard(card) || 0);
      const unplaced = Number(card.dataset.fix32Unplaced || 0);
      let ok = true;
      if(kw && !hay.includes(kw)) ok = false;
      if(date && !hay.includes(date)) ok = false;
      if(stateFilter === 'unplaced' && unplaced <= 0) ok = false;
      if(stateFilter === 'placed' && unplaced > 0) ok = false;
      if(stateFilter === 'low' && qty > 2) ok = false;
      card.style.display = ok ? '' : 'none';
    });
    const count = allCards(source).filter(card => card.style.display !== 'none').length;
    let note = $('fix32-filter-count');
    if(!note && $('fix32-list-filters')){
      $('fix32-list-filters').insertAdjacentHTML('beforeend', '<span id="fix32-filter-count" class="pill">0 筆</span>');
      note = $('fix32-filter-count');
    }
    if(note) note.textContent = `顯示 ${count} 筆`;
  }

  async function loadRowsForBatch(cards, source){
    const rows = [];
    for(const card of cards){
      const id = Number(card.dataset.id || card.querySelector('.fix31-row-check,.fix32-row-check')?.value || 0);
      if(!id) continue;
      const data = await api(apiPath(source, id), {method:'GET'});
      const row = data.item || {};
      const max = Math.max(1, Number(row.qty || qtyFromCard(card) || 1) || 1);
      const qty = currentQty(card, max);
      if(qty > max) throw new Error(`${row.product_text || id} 操作數量不可超過 ${max}`);
      rows.push({id, row, max, qty, remain:max-qty});
    }
    return rows;
  }

  async function resolveCustomer(target, rows){
    if(target === 'inventory' || target === 'delete') return '';
    const names = Array.from(new Set(rows.map(r => String(r.row.customer_name || '').trim()).filter(Boolean)));
    const missing = rows.some(r => !String(r.row.customer_name || '').trim());
    if(!missing && names.length >= 1) return '__USE_EACH__';
    const def = names[0] || '';
    const ans = prompt(`請輸入這批要${target === 'ship' ? '出貨' : '移到' + targetLabel(target)}的客戶名稱`, def);
    if(ans === null) return null;
    const customer = String(ans || '').trim();
    if(!customer){ say('請輸入客戶名稱', 'warn'); return null; }
    return customer;
  }

  function batchConfirmHtml(source, target, rows, customerMode){
    const total = rows.reduce((sum, r) => sum + Number(r.qty || 0), 0);
    const rowsHtml = rows.map(r => `<tr>
      <td>${esc(r.row.customer_name || (customerMode === '__USE_EACH__' ? '未指定' : customerMode || ''))}</td>
      <td>${esc(r.row.product_text || '')}</td>
      <td>${r.max}</td><td><b>${r.qty}</b></td><td>${r.remain}</td>
    </tr>`).join('');
    return `<div class="fix32-confirm-summary">
      <div>來源：<b>${sourceLabel(source)}</b> → 目標：<b>${targetLabel(target)}</b></div>
      <div>筆數：<b>${rows.length}</b>，本次總數量：<b>${total}</b></div>
      <div>客戶：${customerMode === '__USE_EACH__' ? '依每筆商品原客戶' : esc(customerMode || '不需要')}</div>
    </div>
    <div class="fix32-table-wrap"><table class="fix32-confirm-table">
      <thead><tr><th>客戶</th><th>商品</th><th>原數量</th><th>本次</th><th>剩餘</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table></div>
    <div class="small-note danger-text">請確認數量與客戶正確；批量刪除會刪除所選資料，其他操作只移動本次數量。</div>`;
  }

  async function runBatchFixed(target, btn){
    const source = moduleKey();
    if(!['inventory','orders','master_order'].includes(source)) return;
    enhanceCards();
    const cards = selectedCards(source);
    if(!cards.length) return say('請先勾選要批量操作的商品', 'warn');
    try{
      if(btn) btn.disabled = true;
      const rows = await loadRowsForBatch(cards, source);
      const customerMode = target === 'delete' ? '' : await resolveCustomer(target, rows);
      if(customerMode === null) return;
      const ok = await confirmHtml(`確認批量${targetLabel(target)}`, batchConfirmHtml(source, target, rows, customerMode), `批量${targetLabel(target)}`);
      if(!ok) return;
      let done = 0, failed = 0, errors = [];
      if(target === 'delete'){
        const ok2 = await confirmHtml('再次確認刪除', `<div class="danger-text">確定刪除 ${rows.length} 筆${sourceLabel(source)}資料？</div><div>這只刪除勾選商品，不會自動回補其他地方。</div>`, '確定刪除');
        if(!ok2) return;
        for(const r of rows){
          try{ await api(apiPath(source, r.id), {method:'DELETE'}); done++; }catch(e){ failed++; errors.push(e.message); }
        }
      }else{
        for(const r of rows){
          const customer = customerMode === '__USE_EACH__' ? String(r.row.customer_name || '').trim() : String(customerMode || '').trim();
          try{
            await api('/api/items/transfer', {method:'POST', body:JSON.stringify({source, id:r.id, target, qty:r.qty, customer_name:customer, allow_inventory_fallback:true})});
            done++;
          }catch(e){ failed++; errors.push(`${r.row.product_text || r.id}：${e.message}`); }
        }
      }
      if(failed) console.warn('[FIX32 batch errors]', errors);
      say(failed ? `完成 ${done} 筆，失敗 ${failed} 筆` : `已完成 ${done} 筆批量${targetLabel(target)}`, failed ? 'warn' : 'ok');
      await refreshCurrent();
      setTimeout(enhanceAll, 250);
    }catch(e){ say(e.message || '批量操作失敗', 'error'); }
    finally{ if(btn) btn.disabled = false; }
  }

  // 攔截 FIX31 的批量按鈕，改用更完整的商用確認清單與防超量。
  document.addEventListener('click', ev => {
    const btn = ev.target.closest?.('[data-fix31-batch]');
    if(!btn) return;
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();
    runBatchFixed(btn.dataset.fix31Batch, btn);
  }, true);

  function ensureShipCommercialPreview(){
    if(moduleKey() !== 'ship') return;
    if($('fix32-ship-commercial-panel')) return;
    const target = $('ship-preview-section') || $('ship-selected-section') || document.querySelector('.manual-entry-panel');
    target?.insertAdjacentHTML('beforebegin', `<section id="fix32-ship-commercial-panel" class="subsection">
      <div class="section-head"><div><h3>正式出貨預覽</h3><span class="muted">會先顯示扣總單 / 訂單 / 庫存，以及倉庫格位，再確認出貨。</span></div></div>
      <div class="glass panel">
        <div class="btn-row compact-row">
          <button id="fix32-ship-preview-btn" class="primary-btn small-btn" type="button">產生出貨預覽</button>
          <button id="fix32-undo-last-btn" class="ghost-btn small-btn" type="button">取消上一筆操作</button>
          <button id="fix32-export-shipping" class="ghost-btn small-btn" type="button">匯出出貨紀錄</button>
        </div>
        <div id="fix32-ship-preview-box" class="card-list"></div>
      </div>
    </section>`);
    $('fix32-ship-preview-btn')?.addEventListener('click', renderShipPreview);
    $('fix32-undo-last-btn')?.addEventListener('click', async () => {
      const ok = await confirmHtml('取消上一筆操作', '確定要還原上一筆可還原操作？', '還原');
      if(!ok) return;
      try{ const d = await api('/api/undo-last', {method:'POST', body:'{}'}); say(d.message || '已還原', 'ok'); await refreshCurrent(); }catch(e){ say(e.message || '還原失敗', 'error'); }
    });
    $('fix32-export-shipping')?.addEventListener('click', () => window.open('/api/reports/export?type=shipping', '_blank'));
  }

  function collectShipItems(){
    if(typeof window.parseTextareaItems === 'function'){
      try{ const arr = window.parseTextareaItems(); if(Array.isArray(arr) && arr.length) return arr; }catch(_){}
    }
    if(typeof window.collectSubmitItems === 'function'){
      try{ const arr = window.collectSubmitItems(); if(Array.isArray(arr) && arr.length) return arr; }catch(_){}
    }
    const text = $('ocr-text')?.value || '';
    const rows = [];
    text.split(/\n+/).forEach(line => {
      const m = String(line).replace(/[×X＊*]/g,'x').match(/(\d+\s*x\s*\d+\s*x\s*\d+)[^=]*=?\s*(\d+)?(?:\s*x\s*(\d+))?/i);
      if(m) rows.push({product_text:m[0].replace(/\s+/g,''), product_code:m[0].replace(/\s+/g,''), qty:Math.max(1, Number(m[3] || 1) || 1)});
    });
    return rows;
  }

  async function renderShipPreview(){
    const box = $('fix32-ship-preview-box');
    if(!box) return;
    const customer = ($('customer-name')?.value || '').trim();
    const items = collectShipItems();
    if(!customer) return say('請先輸入客戶名稱', 'warn');
    if(!items.length) return say('請先輸入要出貨的商品', 'warn');
    box.innerHTML = '<div class="empty-state-card compact-empty">產生預覽中…</div>';
    try{
      const data = await api('/api/ship-preview', {method:'POST', body:JSON.stringify({customer_name:customer, items})});
      const rows = data.items || [];
      box.innerHTML = rows.map(x => {
        const locs = (x.locations || []).map(l => `${l.location || `${l.zone||''}-${l.column_index||''}-${String(l.slot_number||'').padStart(2,'0')}`} ${l.qty ? `×${l.qty}` : ''}`).join('、') || '尚未找到格位';
        const sourceRows = (x.source_breakdown || []).map(s => `<span class="mini-pill">${esc(s.source)}：${Number(s.available||0)}</span>`).join('');
        return `<div class="card fix32-ship-preview-card ${x.strict_ok ? 'ok' : (x.inventory_only_ok ? 'warn' : 'danger')}">
          <div class="section-title">${esc(x.product_text || '')}｜本次 ${Number(x.qty||0)} 件</div>
          <div class="fix32-status-strip">${sourceRows}</div>
          <div class="small-note">倉庫位置：${esc(locs)}</div>
          <div class="small-note">${esc(x.recommendation || '')}${Array.isArray(x.shortage_reasons)&&x.shortage_reasons.length ? '｜' + esc(x.shortage_reasons.join('、')) : ''}</div>
        </div>`;
      }).join('') || '<div class="empty-state-card compact-empty">沒有可預覽的商品</div>';
    }catch(e){ box.innerHTML = `<div class="error-card">${esc(e.message || '出貨預覽失敗')}</div>`; }
  }

  const oldSubmit = window.confirmSubmit;
  if(oldSubmit && !oldSubmit.__fix32Wrapped){
    const wrapped = async function(){
      if(moduleKey() === 'ship'){
        await renderShipPreview();
        const ok = await confirmHtml('確認出貨', '<div>已產生正式出貨預覽。</div><div class="small-note">請確認扣除來源與倉庫位置，按確認才會送出。</div>', '確認出貨');
        if(!ok) return;
      }
      const res = await oldSubmit.apply(this, arguments);
      if(moduleKey() === 'ship') setTimeout(renderShipPreview, 500);
      return res;
    };
    wrapped.__fix32Wrapped = true;
    window.confirmSubmit = wrapped;
  }

  function enhanceWarehouse(){
    if(moduleKey() !== 'warehouse') return;
    $$('.vertical-slot').forEach(slot => {
      const lines = Array.from(slot.querySelectorAll('.slot-line')).filter(x => !x.classList.contains('empty'));
      const customers = new Set(lines.map(x => (x.textContent || '').split('｜')[1] || '').filter(Boolean));
      const total = lines.reduce((sum, line) => {
        const m = (line.textContent || '').match(/[×x]\s*(\d+)/);
        return sum + (Number(m?.[1] || 0) || 0);
      }, 0);
      slot.classList.remove('slot-empty','slot-used','slot-mixed','slot-full','slot-warning');
      if(lines.length === 0) slot.classList.add('slot-empty');
      else slot.classList.add('slot-used');
      if(customers.size > 1) slot.classList.add('slot-mixed');
      if(total >= 20) slot.classList.add('slot-full');
      else if(total >= 12) slot.classList.add('slot-warning');
      if(!slot.querySelector('.fix32-slot-meta')){
        slot.insertAdjacentHTML('beforeend', `<div class="fix32-slot-meta">${lines.length ? `${total} 件 / ${customers.size || 1} 客戶` : '可放入'}</div>`);
      }else{
        slot.querySelector('.fix32-slot-meta').textContent = lines.length ? `${total} 件 / ${customers.size || 1} 客戶` : '可放入';
      }
    });
    if(!$('fix32-warehouse-tools')){
      const bar = document.querySelector('.warehouse-toolbar-panel .warehouse-meta-bar') || document.querySelector('.warehouse-toolbar-panel');
      bar?.insertAdjacentHTML('beforeend', `<div id="fix32-warehouse-tools" class="btn-row compact-row">
        <button class="ghost-btn small-btn" type="button" id="fix32-warehouse-export">匯出倉庫位置表</button>
        <button class="ghost-btn small-btn" type="button" id="fix32-warehouse-unplaced-export">匯出未入倉報表</button>
      </div>`);
      $('fix32-warehouse-export')?.addEventListener('click', () => window.open('/api/reports/export?type=warehouse', '_blank'));
      $('fix32-warehouse-unplaced-export')?.addEventListener('click', () => window.open('/api/reports/export?type=unplaced', '_blank'));
    }
  }

  function ensureTodayOperations(){
    if(!location.pathname.includes('/today-changes') && !$('today-summary-cards')) return;
    if($('fix32-today-tools')) return;
    const host = document.querySelector('.today-filter-bar') || $('today-summary-cards');
    host?.insertAdjacentHTML('beforebegin', `<div id="fix32-today-tools" class="fix32-filter-panel">
      <input id="fix32-today-keyword" class="text-input" placeholder="搜尋今日異動 / 操作紀錄">
      <input id="fix32-today-start" class="text-input small" type="date">
      <input id="fix32-today-end" class="text-input small" type="date">
      <select id="fix32-today-type" class="text-input small">
        <option value="all">全部類型</option><option value="inventory">庫存</option><option value="orders">訂單</option><option value="master_orders">總單</option><option value="shipping_records">出貨</option><option value="warehouse_cells">倉庫</option>
      </select>
      <button id="fix32-export-audit" class="primary-btn small-btn" type="button">匯出操作紀錄</button>
    </div>`);
    $('fix32-export-audit')?.addEventListener('click', () => window.open('/api/reports/export?type=audit_trails', '_blank'));
    ['fix32-today-keyword','fix32-today-start','fix32-today-end','fix32-today-type'].forEach(id => $(id)?.addEventListener('input', filterTodayDom));
    $('fix32-today-type')?.addEventListener('change', filterTodayDom);
  }

  function filterTodayDom(){
    const kw = ($('fix32-today-keyword')?.value || '').trim().toLowerCase();
    $$('.inline-activity-card').forEach(card => {
      const hay = (card.textContent || '').toLowerCase();
      card.style.display = !kw || hay.includes(kw) ? '' : 'none';
    });
  }

  function ensureReportHub(){
    if($('fix32-report-hub')) return;
    const isHome = location.pathname === '/' || document.querySelector('.home-shell');
    if(!isHome && !document.querySelector('.module-screen')) return;
    const host = document.querySelector('.home-shell') || document.querySelector('.module-screen') || document.body;
    const html = `<div id="fix32-report-hub" class="fix32-report-hub glass">
      <div class="section-title">報表 / 系統工具</div>
      <div class="btn-row compact-row">
        <button class="ghost-btn tiny-btn" data-report="inventory">庫存總表</button>
        <button class="ghost-btn tiny-btn" data-report="orders">訂單總表</button>
        <button class="ghost-btn tiny-btn" data-report="master_orders">客戶總單</button>
        <button class="ghost-btn tiny-btn" data-report="shipping">出貨紀錄</button>
        <button class="ghost-btn tiny-btn" data-report="unplaced">未入倉商品</button>
        <button class="ghost-btn tiny-btn" data-report="warehouse">倉庫位置表</button>
        ${isAdmin() ? '<button class="ghost-btn tiny-btn" data-report="audit_trails">操作紀錄</button>' : ''}
      </div>
      <div class="small-note">版本：FIX32 商用細節整理版｜PWA 安全快取</div>
    </div>`;
    host.insertAdjacentHTML('beforeend', html);
    $('fix32-report-hub')?.querySelectorAll('[data-report]').forEach(btn => btn.addEventListener('click', () => window.open(`/api/reports/export?type=${btn.dataset.report}`, '_blank')));
  }

  function enhanceCustomerUID(){
    const input = $('customer-name');
    if(!input || input.dataset.fix32Uid) return;
    input.dataset.fix32Uid = '1';
    input.insertAdjacentHTML('afterend', '<div id="fix32-customer-hint" class="small-note">客戶資料已使用 UID 強化；改名會盡量同步關聯，避免同名混淆。</div>');
    input.addEventListener('blur', async () => {
      const name = input.value.trim();
      if(!name) return;
      try{
        const d = await api(`/api/customers/${encodeURIComponent(name)}`, {method:'GET'});
        const hint = $('fix32-customer-hint');
        if(hint && d.item) hint.textContent = `已匹配客戶：${d.item.name || name}｜區域：${d.item.region || '未設定'}｜UID：${d.item.customer_uid || '已建立'}`;
      }catch(_){}
    });
  }

  function enhanceErrorsAndMobile(){
    // 送出防重複點、手機安全區、空白資料防呆提示
    $$('button').forEach(btn => {
      if(btn.dataset.fix32Button) return;
      btn.dataset.fix32Button = '1';
      btn.addEventListener('pointerdown', () => btn.classList.add('fix32-pressed'));
      btn.addEventListener('pointerup', () => btn.classList.remove('fix32-pressed'));
      btn.addEventListener('pointercancel', () => btn.classList.remove('fix32-pressed'));
    });
    const submit = $('submit-btn');
    if(submit && !submit.dataset.fix32Guard){
      submit.dataset.fix32Guard = '1';
      submit.addEventListener('click', ev => {
        const module = moduleKey();
        const text = ($('ocr-text')?.value || '').trim();
        const customer = ($('customer-name')?.value || '').trim();
        if(!text){
          ev.preventDefault(); ev.stopPropagation();
          say('商品資料不可空白', 'warn');
        }else if(['orders','master_order','ship'].includes(module) && !customer){
          ev.preventDefault(); ev.stopPropagation();
          say('請先選擇或輸入客戶', 'warn');
        }
      }, true);
    }
  }

  function enhanceAll(){
    cleanCaches();
    ensureListFilters();
    enhanceCards();
    applyListFilters();
    ensureShipCommercialPreview();
    enhanceWarehouse();
    ensureTodayOperations();
    ensureReportHub();
    enhanceCustomerUID();
    enhanceErrorsAndMobile();
  }

  function wrapLoaders(){
    [['loadInventory'], ['loadOrdersList'], ['loadMasterList'], ['renderWarehouse'], ['renderTodayChangesPage']].forEach(([name]) => {
      const old = window[name];
      if(old && !old.__fix32Wrapped){
        const wrapped = async function(){
          const res = await old.apply(this, arguments);
          setTimeout(enhanceAll, 80);
          return res;
        };
        wrapped.__fix32Wrapped = true;
        window[name] = wrapped;
      }
    });
  }

  function boot(){
    wrapLoaders();
    enhanceAll();
    const mo = new MutationObserver(() => {
      clearTimeout(window.__fix32EnhanceTimer);
      window.__fix32EnhanceTimer = setTimeout(enhanceAll, 120);
    });
    mo.observe(document.body, {childList:true, subtree:true});
    setTimeout(() => refreshCurrent()?.catch?.(()=>null), 160);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();