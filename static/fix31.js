/* ==== FIX31：庫存 / 訂單 / 總單批量操作正式版 ==== */
(function(){
  'use strict';
  const VERSION = 'fix31-bulk-module-actions';
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  window.__YUANXING_FIX_VERSION__ = VERSION;

  function mod(){
    return document.querySelector('.module-screen')?.dataset?.module ||
      (location.pathname.includes('/master-order') ? 'master_order' :
       location.pathname.includes('/orders') ? 'orders' :
       location.pathname.includes('/inventory') ? 'inventory' : '');
  }
  function sourceLabel(source){ return source === 'inventory' ? '庫存' : source === 'orders' ? '訂單' : '總單'; }
  function targetLabel(target){ return target === 'inventory' ? '庫存' : target === 'orders' ? '訂單' : target === 'ship' ? '出貨' : '總單'; }
  function apiPath(source, id){
    if(source === 'inventory') return `/api/inventory/${id}`;
    if(source === 'orders') return `/api/orders/${id}`;
    if(source === 'master_order' || source === 'master_orders') return `/api/master_orders/${id}`;
    return '';
  }
  function listBoxForSource(source){
    if(source === 'inventory') return $('inventory-inline-list');
    if(source === 'orders') return $('orders-list');
    if(source === 'master_order') return $('master-list');
    return null;
  }
  function toolbarHostForSource(source){
    if(source === 'inventory') return $('inventory-inline-panel');
    if(source === 'orders') return $('orders-list-section');
    if(source === 'master_order') return $('master-list-section');
    return null;
  }
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
    if(typeof window.toast === 'function') window.toast(msg, type); else alert(msg);
  }
  async function askConfirm(title, html, confirmText='確認'){
    if(typeof window.confirmHtml === 'function') return window.confirmHtml(title, html, confirmText);
    if(typeof window.confirmDialog === 'function') return window.confirmDialog({title, message:html, confirmText});
    return confirm(String(html || '').replace(/<[^>]+>/g, ''));
  }
  function parseMaxQty(card){
    const input = card.querySelector('[data-fix30-action-qty], [data-act-qty], [data-fix31-bulk-qty]');
    const attrMax = Number(input?.max || 0);
    if(attrMax > 0) return attrMax;
    const text = card.textContent || '';
    const m = text.match(/數量[:：\s]*(\d+)/) || text.match(/×\s*(\d+)/);
    return Math.max(1, Number(m?.[1] || 1) || 1);
  }
  function ensureQtyInput(card){
    if(card.querySelector('[data-fix30-action-qty], [data-act-qty], [data-fix31-bulk-qty]')) return;
    const max = parseMaxQty(card);
    const actions = card.querySelector('.fix28-card-actions') || card;
    actions.insertAdjacentHTML('beforebegin', `<div class="fix31-bulk-qty-row"><label>本次操作數量</label><input class="text-input tiny-qty-input" data-fix31-bulk-qty type="number" min="1" max="${max}" value="${max}"></div>`);
  }
  function ensureCardCheckboxes(){
    const source = mod();
    if(!['inventory','orders','master_order'].includes(source)) return;
    const box = listBoxForSource(source);
    if(!box) return;
    box.querySelectorAll('.fix28-action-card').forEach(card => {
      ensureQtyInput(card);
      if(!card.querySelector('.fix31-row-check')){
        card.insertAdjacentHTML('afterbegin', `<label class="fix31-card-check"><input class="fix31-row-check" type="checkbox" value="${Number(card.dataset.id || 0)}"> 選取</label>`);
      }
    });
  }
  function ensureToolbar(){
    const source = mod();
    if(!['inventory','orders','master_order'].includes(source)) return;
    const host = toolbarHostForSource(source);
    if(!host || $('fix31-bulk-toolbar')) return;
    let buttons = '';
    if(source === 'inventory'){
      buttons = '<button class="ghost-btn small-btn" data-fix31-batch="orders" type="button">批量移到訂單</button><button class="ghost-btn small-btn" data-fix31-batch="master_order" type="button">批量移到總單</button><button class="ghost-btn small-btn" data-fix31-batch="ship" type="button">批量出貨</button><button class="ghost-btn small-btn danger-btn" data-fix31-batch="delete" type="button">批量刪除</button>';
    }else if(source === 'orders'){
      buttons = '<button class="ghost-btn small-btn" data-fix31-batch="master_order" type="button">批量移到總單</button><button class="ghost-btn small-btn" data-fix31-batch="inventory" type="button">批量轉回庫存</button><button class="ghost-btn small-btn" data-fix31-batch="ship" type="button">批量出貨</button><button class="ghost-btn small-btn danger-btn" data-fix31-batch="delete" type="button">批量刪除</button>';
    }else{
      buttons = '<button class="ghost-btn small-btn" data-fix31-batch="orders" type="button">批量移到訂單</button><button class="ghost-btn small-btn" data-fix31-batch="inventory" type="button">批量轉回庫存</button><button class="ghost-btn small-btn" data-fix31-batch="ship" type="button">批量出貨</button><button class="ghost-btn small-btn danger-btn" data-fix31-batch="delete" type="button">批量刪除</button>';
    }
    const html = `<div id="fix31-bulk-toolbar" class="fix31-bulk-toolbar"><label class="fix31-select-all"><input type="checkbox" id="fix31-select-all"> 全選目前顯示</label><div class="fix31-bulk-actions">${buttons}</div><div class="small-note fix31-bulk-note">先勾選商品，再調整每張卡片的「本次操作數量」，即可批量移動 / 出貨 / 刪除。</div></div>`;
    const existingListToolbar = source === 'inventory' ? host.querySelector('.fix28-list-toolbar') : host.querySelector('.fix28-list-toolbar');
    if(existingListToolbar) existingListToolbar.insertAdjacentHTML('afterend', html);
    else host.querySelector('.section-head')?.insertAdjacentHTML('afterend', html);
    $('fix31-select-all')?.addEventListener('change', () => {
      const on = $('fix31-select-all').checked;
      visibleCards().forEach(card => {
        const cb = card.querySelector('.fix31-row-check');
        if(cb) cb.checked = on;
        card.classList.toggle('fix31-selected', on);
      });
    });
    document.querySelectorAll('[data-fix31-batch]').forEach(btn => btn.addEventListener('click', () => runBatch(btn.dataset.fix31Batch, btn)));
  }
  function visibleCards(){
    const box = listBoxForSource(mod());
    if(!box) return [];
    return [...box.querySelectorAll('.fix28-action-card')].filter(card => card.offsetParent !== null);
  }
  function selectedCards(){
    return visibleCards().filter(card => card.querySelector('.fix31-row-check')?.checked);
  }
  function selectedQty(card, max){
    const input = card.querySelector('[data-fix30-action-qty], [data-act-qty], [data-fix31-bulk-qty]');
    const raw = parseInt(input?.value || max || 1, 10) || 1;
    const qty = Math.max(1, Math.min(Math.max(1, Number(max || 1) || 1), raw));
    if(input) input.value = String(qty);
    return qty;
  }
  async function loadSelectedRows(cards, source){
    const rows = [];
    for(const card of cards){
      const id = Number(card.dataset.id || card.querySelector('.fix31-row-check')?.value || 0);
      if(!id) continue;
      const data = await api(apiPath(source, id), {method:'GET'});
      const row = data.item || {};
      const max = Math.max(1, Number(row.qty || parseMaxQty(card) || 1) || 1);
      rows.push({card, id, row, qty:selectedQty(card, max), max});
    }
    return rows;
  }
  function uniqueNonEmpty(arr){ return [...new Set(arr.map(x => String(x || '').trim()).filter(Boolean))]; }
  async function resolveBatchCustomer(target, rows){
    if(target === 'inventory' || target === 'delete') return '';
    const names = uniqueNonEmpty(rows.map(r => r.row.customer_name));
    const missing = rows.some(r => !String(r.row.customer_name || '').trim());
    if(!missing && names.length === 1) return '__USE_EACH__';
    if(!missing && names.length > 1){
      const ok = await askConfirm('多客戶批量操作', `<div>這次勾選了 ${names.length} 位客戶。</div><div>系統會依照每筆商品自己的客戶執行「${targetLabel(target)}」。</div><div class="small-note">客戶：${esc(names.join('、'))}</div>`, '依各自客戶執行');
      return ok ? '__USE_EACH__' : null;
    }
    const def = names[0] || '';
    const text = target === 'ship' ? '請輸入這批要出貨的客戶名稱' : `請輸入這批要移到${targetLabel(target)}的客戶名稱`;
    const ans = prompt(text, def);
    if(ans === null) return null;
    const customer = String(ans || '').trim();
    if(!customer){ say('請輸入客戶名稱', 'warn'); return null; }
    return customer;
  }
  function buildConfirmHtml(target, rows, customerMode){
    const preview = rows.slice(0, 12).map(r => `<div class="fix31-confirm-row"><b>${esc(r.row.product_text || '')}</b><span>${r.qty} / ${r.max} 件</span><em>${esc(r.row.customer_name || '')}</em></div>`).join('');
    const more = rows.length > 12 ? `<div class="small-note">另外還有 ${rows.length - 12} 筆未顯示。</div>` : '';
    const customer = customerMode && customerMode !== '__USE_EACH__' ? `<div>統一客戶：<b>${esc(customerMode)}</b></div>` : '<div>客戶：依每筆商品原本客戶</div>';
    return `<div>來源：${sourceLabel(mod())}</div><div>目標：${targetLabel(target)}</div><div>筆數：${rows.length}</div>${target !== 'inventory' && target !== 'delete' ? customer : ''}<div class="fix31-confirm-list">${preview}</div>${more}`;
  }
  async function runBatch(target, triggerBtn){
    const source = mod();
    if(!['inventory','orders','master_order'].includes(source)) return;
    ensureCardCheckboxes();
    const cards = selectedCards();
    if(!cards.length) return say('請先勾選要批量操作的商品', 'warn');
    try{
      triggerBtn && (triggerBtn.disabled = true);
      const rows = await loadSelectedRows(cards, source);
      if(!rows.length) return say('找不到可操作的商品', 'warn');
      if(target === 'delete'){
        const ok = await askConfirm('批量刪除商品', `<div>確定刪除已勾選的 ${rows.length} 筆${sourceLabel(source)}商品？</div><div class="small-note">此操作會刪除資料，請確認不是只要移動數量。</div>`, '批量刪除');
        if(!ok) return;
        for(const r of rows){ await api(apiPath(source, r.id), {method:'DELETE'}); }
        say(`已刪除 ${rows.length} 筆商品`, 'ok');
      }else{
        const customerMode = await resolveBatchCustomer(target, rows);
        if(customerMode === null) return;
        const ok = await askConfirm('確認批量操作', buildConfirmHtml(target, rows, customerMode), '批量執行');
        if(!ok) return;
        let done = 0, failed = 0;
        const errors = [];
        for(const r of rows){
          const customer = customerMode === '__USE_EACH__' ? String(r.row.customer_name || '').trim() : String(customerMode || r.row.customer_name || '').trim();
          try{
            await api('/api/items/transfer', {method:'POST', body:JSON.stringify({source, id:r.id, target, qty:r.qty, customer_name:customer, allow_inventory_fallback:true})});
            done += 1;
          }catch(e){
            failed += 1;
            errors.push(`${r.row.product_text || r.id}：${e.message || '失敗'}`);
          }
        }
        if(failed){
          say(`完成 ${done} 筆，失敗 ${failed} 筆`, 'warn');
          console.warn('[FIX31 batch errors]', errors);
        }else{
          say(`已完成 ${done} 筆批量${targetLabel(target)}`, 'ok');
        }
      }
      await refreshCurrentList();
      if(typeof window.loadCustomerBlocks === 'function') window.loadCustomerBlocks().catch(()=>null);
    }catch(e){
      say(e.message || '批量操作失敗', 'error');
    }finally{
      triggerBtn && (triggerBtn.disabled = false);
      setTimeout(() => { ensureToolbar(); ensureCardCheckboxes(); }, 150);
    }
  }
  async function refreshCurrentList(){
    const source = mod();
    if(source === 'inventory') return window.loadInventory?.();
    if(source === 'orders') return window.loadOrdersList?.();
    if(source === 'master_order') return window.loadMasterList?.();
  }
  function boot(){
    document.documentElement.dataset.yxVersion = VERSION;
    ensureToolbar();
    ensureCardCheckboxes();
    document.addEventListener('click', ev => {
      if(ev.target.closest?.('.fix31-card-check, .fix31-bulk-toolbar')){
        ev.stopPropagation();
      }
    }, true);
    document.addEventListener('change', ev => {
      const cb = ev.target.closest?.('.fix31-row-check');
      if(cb){
        cb.closest('.fix28-action-card')?.classList.toggle('fix31-selected', cb.checked);
      }
    }, true);
    const mo = new MutationObserver(() => { ensureToolbar(); ensureCardCheckboxes(); });
    mo.observe(document.body, {childList:true, subtree:true});
    const oldLoadInventory = window.loadInventory;
    if(oldLoadInventory && !oldLoadInventory.__fix31Wrapped){
      const wrapped = async function(){ const res = await oldLoadInventory.apply(this, arguments); ensureToolbar(); ensureCardCheckboxes(); return res; };
      wrapped.__fix31Wrapped = true; window.loadInventory = wrapped;
    }
    const oldLoadOrders = window.loadOrdersList;
    if(oldLoadOrders && !oldLoadOrders.__fix31Wrapped){
      const wrapped = async function(){ const res = await oldLoadOrders.apply(this, arguments); ensureToolbar(); ensureCardCheckboxes(); return res; };
      wrapped.__fix31Wrapped = true; window.loadOrdersList = wrapped;
    }
    const oldLoadMaster = window.loadMasterList;
    if(oldLoadMaster && !oldLoadMaster.__fix31Wrapped){
      const wrapped = async function(){ const res = await oldLoadMaster.apply(this, arguments); ensureToolbar(); ensureCardCheckboxes(); return res; };
      wrapped.__fix31Wrapped = true; window.loadMasterList = wrapped;
    }
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
