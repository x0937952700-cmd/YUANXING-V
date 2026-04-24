/* ==== FIX30：批量刪除 / 中文操作紀錄 / 操作數量強化 ==== */
(function(){
  'use strict';
  const VERSION = 'fix30';
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
  const isAdmin = () => String(window.__YX_USERNAME__ || '').trim() === '陳韋廷';
  window.__YUANXING_FIX_VERSION__ = VERSION;

  async function api(url, options={}){
    const opts = { credentials:'same-origin', ...options };
    opts.headers = { 'Content-Type':'application/json', ...(options.headers || {}) };
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => ({}));
    if(!res.ok || data.success === false){
      const err = new Error(data.error || data.message || `請求失敗：${res.status}`);
      err.status = res.status; err.payload = data;
      throw err;
    }
    return data;
  }
  function say(msg, type='ok'){
    if(typeof window.toast === 'function') window.toast(msg, type); else alert(msg);
  }
  async function confirmFix(title, html, text='確認'){
    if(typeof window.confirmHtml === 'function') return window.confirmHtml(title, html, text);
    return confirm((html || '').replace(/<[^>]+>/g, ''));
  }
  function moduleKey(){
    return document.querySelector('.module-screen')?.dataset?.module ||
      (location.pathname.includes('/master-order')?'master_order':location.pathname.includes('/orders')?'orders':location.pathname.includes('/inventory')?'inventory':location.pathname.includes('/ship')?'ship':'');
  }
  function sourceForPage(){
    const m = moduleKey();
    if(m === 'inventory') return 'inventory';
    if(m === 'orders') return 'orders';
    if(m === 'master_order') return 'master_order';
    return '';
  }
  function apiPathForSource(src, id){
    if(src === 'inventory') return `/api/inventory/${id}`;
    if(src === 'orders') return `/api/orders/${id}`;
    if(src === 'master_order' || src === 'master_orders') return `/api/master_orders/${id}`;
    return '';
  }
  function targetLabel(t){
    return t === 'inventory' ? '庫存' : t === 'orders' ? '訂單' : t === 'ship' ? '出貨' : '總單';
  }
  function sourceLabel(t){
    return t === 'inventory' ? '庫存' : t === 'orders' ? '訂單' : '總單';
  }
  function refreshCurrent(){
    const m = moduleKey();
    if(m === 'inventory') return window.loadInventory?.();
    if(m === 'orders') return window.loadOrdersList?.();
    if(m === 'master_order') return window.loadMasterList?.();
  }

  function enhanceActionCards(){
    document.querySelectorAll('.fix28-action-card').forEach(card => {
      if(!card.querySelector('[data-fix30-action-qty]')){
        const currentText = card.textContent || '';
        const qtyMatch = currentText.match(/數量[:：\s]*(\d+)/) || currentText.match(/×\s*(\d+)/);
        const maxQty = Number(qtyMatch?.[1] || card.querySelector('[data-act-qty]')?.max || card.querySelector('[data-act-qty]')?.value || 1) || 1;
        const actions = card.querySelector('.fix28-card-actions');
        if(actions){
          actions.insertAdjacentHTML('beforebegin', `<div class="fix30-action-qty-row"><label>本次操作數量</label><input class="text-input tiny-qty-input" data-fix30-action-qty type="number" min="1" max="${maxQty}" value="${maxQty}"></div>`);
        }
      }
    });
  }

  async function transferFromCard(card, target){
    const source = sourceForPage();
    const id = Number(card?.dataset?.id || 0);
    if(!source || !id) return;
    const rowData = await api(apiPathForSource(source, id), {method:'GET'});
    const row = rowData.item || {};
    const maxQty = Math.max(1, Number(row.qty || 1) || 1);
    const qtyInput = card.querySelector('[data-fix30-action-qty]') || card.querySelector('[data-act-qty]');
    const qty = Math.max(1, Math.min(maxQty, parseInt(qtyInput?.value || maxQty, 10) || maxQty));
    if(qtyInput) qtyInput.value = qty;
    let customer = String(row.customer_name || '').trim();
    if(['orders','master_order','master_orders','ship'].includes(target)){
      const next = prompt(`選擇客戶（${targetLabel(target)}）`, customer || '');
      if(next === null) return;
      customer = String(next || '').trim();
      if(!customer) return say('請選擇客戶', 'warn');
    }
    const ok = await confirmFix('確認操作數量', `<div><b>${esc(row.product_text || '')}</b></div><div>來源：${sourceLabel(source)}</div><div>目標：${targetLabel(target)}</div><div>數量：${qty} / ${maxQty}</div>${customer?`<div>客戶：${esc(customer)}</div>`:''}`, '確認執行');
    if(!ok) return;
    const data = await api('/api/items/transfer', {method:'POST', body:JSON.stringify({source, id, target, qty, customer_name:customer, allow_inventory_fallback:true})});
    say(data.message || `已移到${targetLabel(target)}`, 'ok');
    await refreshCurrent();
    setTimeout(enhanceActionCards, 120);
  }

  document.addEventListener('click', async ev => {
    const btn = ev.target.closest?.('.fix28-action-card [data-act]');
    if(!btn) return;
    const act = btn.dataset.act;
    if(!['orders','master_order','master_orders','inventory','ship'].includes(act)) return;
    const card = btn.closest('.fix28-action-card');
    if(!card) return;
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation();
    try{ await transferFromCard(card, act); }catch(e){ say(e.message || '操作失敗', 'error'); }
  }, true);

  function ensureTodayBulkToolbar(){
    if(!isAdmin() || !$('today-summary-cards')) return;
    if($('fix30-today-bulk-toolbar')) return;
    const host = document.querySelector('.today-filter-bar') || $('today-summary-cards');
    host?.insertAdjacentHTML('beforebegin', `<div id="fix30-today-bulk-toolbar" class="fix30-bulk-toolbar"><label class="fix30-check-label"><input type="checkbox" id="fix30-today-select-all"> 全選目前顯示異動</label><button class="ghost-btn small-btn danger-btn" id="fix30-today-delete-selected" type="button">批量刪除</button></div>`);
    $('fix30-today-select-all').onchange = () => {
      const on = $('fix30-today-select-all').checked;
      document.querySelectorAll('.today-bulk-check').forEach(cb => {
        const card = cb.closest('.inline-activity-card');
        if(card && card.offsetParent !== null) cb.checked = on;
      });
    };
    $('fix30-today-delete-selected').onclick = deleteSelectedToday;
  }
  function decorateTodayCards(){
    if(!isAdmin()) return;
    ensureTodayBulkToolbar();
    document.querySelectorAll('.inline-activity-card[data-log-id]').forEach(card => {
      if(card.querySelector('.today-bulk-check')) return;
      const id = Number(card.dataset.logId || 0);
      if(id) card.insertAdjacentHTML('afterbegin', `<label class="fix30-card-check"><input class="today-bulk-check" type="checkbox" value="${id}"> 選取</label>`);
    });
  }
  async function deleteSelectedToday(){
    const ids = [...document.querySelectorAll('.today-bulk-check:checked')].map(cb => Number(cb.value)).filter(Boolean);
    if(!ids.length) return say('請先勾選要刪除的今日異動', 'warn');
    const ok = await confirmFix('批量刪除今日異動', `<div>確定刪除已勾選的 ${ids.length} 筆今日異動？</div><div class="small-note">只刪除畫面紀錄，不影響庫存 / 訂單 / 總單。</div>`, '批量刪除');
    if(!ok) return;
    try{ await api('/api/today-changes/bulk-delete', {method:'POST', body:JSON.stringify({ids})}); say('已批量刪除', 'ok'); await window.renderTodayChangesPage?.(); }catch(e){ say(e.message || '批量刪除失敗', 'error'); }
  }

  function ensureAuditPanel(){
    if(!$('today-summary-cards')) return null;
    if(!isAdmin()){
      $('fix28-operation-center')?.remove();
      return null;
    }
    let panel = $('fix28-operation-center');
    if(!panel){
      const host = document.querySelector('.feature-card') || document.querySelector('.home-shell') || document.body;
      panel = document.createElement('div');
      panel.id = 'fix28-operation-center';
      panel.className = 'glass feature-card fix28-operation-center';
      host.insertAdjacentElement('afterend', panel);
    }
    if(!panel.dataset.fix30Ready){
      panel.dataset.fix30Ready = '1';
      panel.innerHTML = `<div class="section-head"><div><h3>操作紀錄中心</h3><span class="muted">僅陳韋廷可查看。已改成中文紀錄，可批量刪除。</span></div></div><div class="fix28-audit-toolbar"><input id="fix30-audit-keyword" class="text-input" placeholder="搜尋客戶 / 商品 / 操作者 / 格位"><select id="fix30-audit-entity" class="text-input small"><option value="all">全部類型</option><option value="inventory">庫存</option><option value="orders">訂單</option><option value="master_orders">總單</option><option value="shipping_records">出貨</option><option value="warehouse_cells">倉庫</option><option value="customer_profiles">客戶</option></select><select id="fix30-audit-action" class="text-input small"><option value="all">全部操作</option><option value="create">新增</option><option value="update">修改</option><option value="move">移動</option><option value="delete">刪除</option><option value="ship">出貨</option><option value="transfer">互通</option><option value="upsert">儲存</option></select><button id="fix30-audit-refresh" class="primary-btn small-btn" type="button">查詢</button></div><div class="fix30-bulk-toolbar"><label class="fix30-check-label"><input type="checkbox" id="fix30-audit-select-all"> 全選目前結果</label><button id="fix30-audit-delete-selected" class="ghost-btn small-btn danger-btn" type="button">批量刪除操作紀錄</button></div><div id="fix30-audit-list" class="card-list"></div>`;
      $('fix30-audit-refresh').onclick = loadAudit;
      $('fix30-audit-keyword').oninput = () => { clearTimeout(window.__fix30AuditTimer); window.__fix30AuditTimer = setTimeout(loadAudit, 250); };
      $('fix30-audit-entity').onchange = loadAudit;
      $('fix30-audit-action').onchange = loadAudit;
      $('fix30-audit-select-all').onchange = () => document.querySelectorAll('.audit-bulk-check').forEach(cb => cb.checked = $('fix30-audit-select-all').checked);
      $('fix30-audit-delete-selected').onclick = deleteSelectedAudit;
    }
    return panel;
  }
  function fieldText(row, key){ return String(row?.[key] || '').trim() || '沒有資料'; }
  async function loadAudit(){
    const panel = ensureAuditPanel(); if(!panel) return;
    const box = $('fix30-audit-list');
    box.innerHTML = '<div class="empty-state-card compact-empty">載入中…</div>';
    const params = new URLSearchParams({limit:'120'});
    const q = $('fix30-audit-keyword')?.value || '';
    const entity = $('fix30-audit-entity')?.value || 'all';
    const act = $('fix30-audit-action')?.value || 'all';
    if(q) params.set('q', q);
    if(entity !== 'all') params.set('entity_type', entity);
    const data = await api('/api/audit-trails?' + params.toString(), {method:'GET'});
    let items = data.items || [];
    if(act !== 'all') items = items.filter(x => String(x.action_type || '').includes(act));
    if(!items.length){ box.innerHTML = '<div class="empty-state-card compact-empty">沒有符合的操作紀錄</div>'; return; }
    box.innerHTML = items.map(x => `<div class="recent-activity-item inline-activity-card fix28-audit-card" data-audit-id="${Number(x.id||0)}"><label class="fix30-card-check"><input class="audit-bulk-check" type="checkbox" value="${Number(x.id||0)}"> 選取</label><strong>${esc((x.created_at||'').slice(0,16))}｜${esc(x.username||'')}</strong><div>${esc(x.summary_text || '')}</div><div class="small-note">${esc(x.entity_label || '')}｜${esc(x.entity_key || '')}</div><div class="btn-row compact-row" style="justify-content:flex-end"><button class="ghost-btn tiny-btn" type="button" data-audit-detail="${Number(x.id||0)}">查看明細</button></div></div>`).join('');
    box.querySelectorAll('[data-audit-detail]').forEach(btn => btn.onclick = () => {
      const row = items.find(x => Number(x.id) === Number(btn.dataset.auditDetail));
      const html = `<div class="fix28-detail-grid"><div><b>時間</b><div>${esc(row.created_at||'')}</div></div><div><b>操作者</b><div>${esc(row.username||'')}</div></div><div><b>操作</b><div>${esc(row.action_label||'')}</div></div><div><b>資料</b><div>${esc(row.entity_label||'')}｜${esc(row.entity_key||'')}</div></div></div><label class="field-label">變更前</label><div class="fix30-cn-box">${esc(fieldText(row,'before_text')).replace(/\n/g,'<br>')}</div><label class="field-label">變更後</label><div class="fix30-cn-box">${esc(fieldText(row,'after_text')).replace(/\n/g,'<br>')}</div>`;
      if(typeof window.confirmDialog === 'function') window.confirmDialog({title:'操作明細', message:html, confirmText:'關閉'});
      else alert((row.summary_text || '') + '\n\n變更前：\n' + fieldText(row,'before_text') + '\n\n變更後：\n' + fieldText(row,'after_text'));
    });
  }
  async function deleteSelectedAudit(){
    const ids = [...document.querySelectorAll('.audit-bulk-check:checked')].map(cb => Number(cb.value)).filter(Boolean);
    if(!ids.length) return say('請先勾選要刪除的操作紀錄', 'warn');
    const ok = await confirmFix('批量刪除操作紀錄', `<div>確定刪除已勾選的 ${ids.length} 筆操作紀錄？</div><div class="small-note">只刪除操作紀錄，不會更動資料。</div>`, '批量刪除');
    if(!ok) return;
    try{ await api('/api/audit-trails/bulk-delete', {method:'POST', body:JSON.stringify({ids})}); say('操作紀錄已批量刪除', 'ok'); await loadAudit(); }catch(e){ say(e.message || '批量刪除失敗', 'error'); }
  }

  window.loadAuditTrails = async function(){
    const box = $('audit-trails-list'); if(!box) return;
    if(!isAdmin()){ box.innerHTML = '<div class="empty-state-card compact-empty">操作紀錄中心僅陳韋廷可以查看</div>'; return; }
    box.innerHTML = '<div class="empty-state-card compact-empty">載入中…</div>';
    try{
      const params = new URLSearchParams();
      [['q','audit-q'],['username','audit-user'],['entity_type','audit-entity'],['start_date','audit-start'],['end_date','audit-end']].forEach(([k,id]) => { const v=$(id)?.value||''; if(v) params.set(k,v); });
      const data = await api('/api/audit-trails?' + params.toString(), {method:'GET'});
      const items = data.items || [];
      box.innerHTML = items.length ? items.map(x => `<div class="recent-activity-item inline-activity-card"><strong>${esc(x.created_at||'')}</strong><div>${esc(x.username||'')}｜${esc(x.summary_text||'')}</div><div class="small-note">${esc(x.entity_label||'')}｜${esc(x.entity_key||'')}</div></div>`).join('') : '<div class="empty-state-card compact-empty">沒有差異紀錄</div>';
    }catch(e){ box.innerHTML = `<div class="error-card">${esc(e.message || '載入失敗')}</div>`; }
  };

  function boot(){
    document.documentElement.dataset.yxVersion = VERSION;
    setTimeout(enhanceActionCards, 150);
    setTimeout(decorateTodayCards, 250);
    if(isAdmin()) setTimeout(loadAudit, 350); else setTimeout(() => $('fix28-operation-center')?.remove(), 350);
    const oldRender = window.renderTodayChangesPage;
    if(oldRender && !oldRender.__fix30Wrapped){
      const wrapped = async function(){
        const result = await oldRender.apply(this, arguments);
        decorateTodayCards();
        if(isAdmin()) await loadAudit(); else $('fix28-operation-center')?.remove();
        return result;
      };
      wrapped.__fix30Wrapped = true;
      window.renderTodayChangesPage = wrapped;
    }
    const mo = new MutationObserver(() => { enhanceActionCards(); decorateTodayCards(); });
    mo.observe(document.body, { childList:true, subtree:true });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
