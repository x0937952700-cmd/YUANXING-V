/* FIX118 今日異動硬鎖：固定標籤 + 固定小卡 + 單一渲染流程 */
(function(){
  'use strict';
  const YX = window.YXHardLock;
  if (!YX) return;

  const state = {filter:'all', data:null, loading:null, installed:false, longPress:null, blockClickUntil:0};
  const panels = [
    {key:'inbound', label:'進貨', list:'today-inbound-list', empty:'今天沒有進貨'},
    {key:'outbound', label:'出貨', list:'today-outbound-list', empty:'今天沒有出貨'},
    {key:'orders', label:'新增訂單', list:'today-order-list', empty:'今天沒有新增訂單'},
    {key:'unplaced', label:'未錄入倉庫圖', list:'today-unplaced-list', empty:'目前沒有未錄入倉庫圖商品'},
  ];
  const countMap = {inbound:'inbound_count', outbound:'outbound_count', orders:'new_order_count', unplaced:'unplaced_count'};

  function $(id){ return document.getElementById(id); }
  function isToday(){ return YX.moduleKey() === 'today_changes' || !!$('today-summary-cards'); }
  function qtyOf(it){ const n = Number(it?.unplaced_qty ?? it?.qty ?? it?.total_qty ?? 0); return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0; }
  function cleanLegacyTodayDom(){
    document.documentElement.classList.add('yx112-today-locked');
    document.body && document.body.classList.add('yx112-today-locked');
    document.querySelectorAll('#yx94-refresh-today,#yx95-refresh-today,#yx96-refresh-today,#yx98-refresh-today,.yx94-today-refresh-row,.yx95-today-refresh-row,.yx96-today-refresh-row,.yx98-today-refresh-row,.yx99-removed-today-cards').forEach(el => {
      if (el.id === 'today-summary-cards') return;
      if (el.closest && el.closest('#today-summary-cards')) return;
      if (el.matches && el.matches('#yx94-refresh-today,#yx95-refresh-today,#yx96-refresh-today,#yx98-refresh-today')) (el.closest('.btn-row') || el).remove();
    });
    const summary = $('today-summary-cards');
    if (summary) {
      summary.className = 'card-list yx112-today-summary';
      summary.style.removeProperty('display');
    }
    const bar = document.querySelector('.today-filter-bar');
    if (bar) {
      bar.classList.add('yx112-today-labels');
      bar.style.removeProperty('display');
      bar.removeAttribute('hidden');
    }
    document.querySelectorAll('[data-today-panel]').forEach(panel => {
      panel.classList.add('yx112-today-panel');
      panel.style.removeProperty('display');
    });
  }
  function summaryCount(summary, key){
    const s = summary || {};
    const n = Number(s[countMap[key]] || 0);
    return Number.isFinite(n) ? n : 0;
  }
  function setFilter(next){
    state.filter = next || 'all';
    try { localStorage.setItem('yx112TodayFilter', state.filter); } catch(_e) {}
    applyFilter();
  }
  function applyFilter(){
    const filter = state.filter || 'all';
    document.querySelectorAll('[data-today-filter]').forEach(btn => {
      const k = btn.getAttribute('data-today-filter') || 'all';
      btn.classList.toggle('active', k === filter);
      btn.setAttribute('aria-pressed', k === filter ? 'true' : 'false');
    });
    document.querySelectorAll('[data-today-panel]').forEach(panel => {
      const k = panel.getAttribute('data-today-panel');
      const show = filter === 'all' || filter === k;
      panel.classList.toggle('yx112-filter-hidden', !show);
      panel.style.display = show ? '' : 'none';
    });
  }
  function renderLabels(summary){
    const allCount = panels.reduce((sum, p) => sum + summaryCount(summary, p.key), 0);
    const labels = [{key:'all', label:'全部', count:allCount, unit:''}].concat(panels.map(p => ({key:p.key, label:p.label, count:summaryCount(summary, p.key), unit:p.key === 'unplaced' ? '件' : ''})));
    const bar = document.querySelector('.today-filter-bar');
    if (!bar) return;
    bar.classList.add('yx112-today-labels');
    bar.innerHTML = labels.map(item => `<button class="chip yx112-today-label ${item.key === state.filter ? 'active' : ''}" type="button" data-today-filter="${YX.esc(item.key)}"><span>${YX.esc(item.label)}</span><strong>${Number(item.count || 0)}${YX.esc(item.unit || '')}</strong></button>`).join('');
  }
  function renderSummaryCards(summary){
    const box = $('today-summary-cards');
    if (!box) return;
    box.className = 'card-list yx112-today-summary';
    box.style.removeProperty('display');
    const cards = panels.map(p => {
      const unit = p.key === 'unplaced' ? '件' : '';
      const sub = p.key === 'unplaced' ? `<div class="small-note">${Number(summary?.unplaced_row_count || 0)}筆商品</div>` : '<div class="small-note">今日紀錄</div>';
      return `<button class="yx112-summary-card ${p.key === 'unplaced' ? 'yx114-unplaced-refresh-trigger' : ''}" type="button" data-today-filter="${YX.esc(p.key)}" ${p.key === 'unplaced' ? 'title="長按刷新未錄入倉庫圖"' : ''}><span>${YX.esc(p.label)}</span><strong>${summaryCount(summary, p.key)}${unit}</strong>${sub}</button>`;
    }).join('');
    box.innerHTML = cards;
  }
  function rowText(r){
    const parts = [];
    const target = YX.clean(r?.customer_name || r?.target || r?.customer || '');
    const product = YX.clean(r?.product_text || r?.product || r?.message || '');
    if (target) parts.push(target);
    if (product) parts.push(product);
    if (r?.source_summary) parts.push(`來源：${r.source_summary}`);
    return parts.join('｜');
  }
  function todayRow(r, kind){
    const id = Number(r?.id || 0);
    const detail = rowText(r);
    const qty = qtyOf(r);
    const qtyLine = kind === 'unplaced' ? `<div class="small-note yx112-today-qty">未錄入 ${qty} 件${r?.placed_qty != null ? `｜已入倉 ${Number(r.placed_qty || 0)} 件` : ''}</div>` : '';
    const deleteButton = id ? `<button type="button" class="ghost-btn tiny-btn danger-btn" data-yx112-delete-today="${id}">刪除</button>` : '';
    return `<div class="today-item deduct-card yx112-today-row" data-kind="${YX.esc(kind)}" data-log-id="${id}">
      <div class="yx112-today-main"><strong>${YX.esc(r?.action || r?.type || (kind === 'unplaced' ? '未錄入倉庫圖' : '異動'))}</strong>${deleteButton}</div>
      ${detail ? `<div class="small-note yx112-today-detail">${YX.esc(detail)}</div>` : ''}
      ${qtyLine}
      <div class="small-note">${YX.esc(r?.created_at || r?.time || '')}${r?.username ? `｜${YX.esc(r.username)}` : ''}</div>
    </div>`;
  }
  function fill(id, rows, empty, kind){
    const el = $(id);
    if (!el) return;
    const arr = Array.isArray(rows) ? rows : [];
    el.classList.add('yx112-fixed-card-list');
    el.innerHTML = arr.length ? arr.map(r => todayRow(r, kind)).join('') : `<div class="empty-state-card compact-empty yx112-empty">${YX.esc(empty)}</div>`;
  }
  function render(data){
    if (!isToday()) return data;
    cleanLegacyTodayDom();
    state.data = data || {};
    const summary = state.data.summary || {};
    if ($('today-unread-badge')) $('today-unread-badge').textContent = '0';
    renderLabels(summary);
    renderSummaryCards(summary);
    fill('today-inbound-list', state.data.feed?.inbound, '今天沒有進貨', 'inbound');
    fill('today-outbound-list', state.data.feed?.outbound, '今天沒有出貨', 'outbound');
    fill('today-order-list', state.data.feed?.new_orders, '今天沒有新增訂單', 'orders');
    fill('today-unplaced-list', state.data.unplaced_items, '目前沒有未錄入倉庫圖商品', 'unplaced');
    applyFilter();
    return data;
  }
  async function loadTodayChanges112(opts={}){
    if (!isToday()) return null;
    if (state.loading && !opts.force) return state.loading;
    state.loading = (async () => {
      try {
        cleanLegacyTodayDom();
        const data = await YX.api('/api/today-changes?yx112=1&ts=' + Date.now(), {method:'GET'});
        render(data);
        try { await YX.api('/api/today-changes/read', {method:'POST', body:JSON.stringify({})}); } catch(_e) {}
        if ($('today-unread-badge')) $('today-unread-badge').textContent = '0';
        return data;
      } catch(e) {
        const box = $('today-summary-cards');
        if (box) box.innerHTML = `<div class="error-card">${YX.esc(e.message || '今日異動載入失敗')}</div>`;
        YX.toast(e.message || '今日異動載入失敗', 'error');
        return null;
      } finally { state.loading = null; }
    })();
    return state.loading;
  }
  function bindEvents(){
    if (state.eventsBound) return;
    state.eventsBound = true;
    const clearLongPress = () => { if (state.longPress?.timer) clearTimeout(state.longPress.timer); state.longPress = null; };
    document.addEventListener('pointerdown', ev => {
      if (!isToday()) return;
      const trigger = ev.target?.closest?.('[data-today-filter="unplaced"],.yx114-unplaced-refresh-trigger');
      if (!trigger) return;
      const x = ev.clientX, y = ev.clientY;
      clearLongPress();
      state.longPress = {x, y, timer:setTimeout(async () => {
        state.blockClickUntil = Date.now() + 900;
        clearLongPress();
        try { await loadTodayChanges112({force:true}); YX.toast('未錄入倉庫圖已刷新', 'ok'); }
        catch(e) { YX.toast(e.message || '未錄入倉庫圖刷新失敗', 'error'); }
      }, 700)};
    }, true);
    document.addEventListener('pointermove', ev => {
      if (state.longPress && (Math.abs(ev.clientX - state.longPress.x) > 8 || Math.abs(ev.clientY - state.longPress.y) > 8)) clearLongPress();
    }, true);
    ['pointerup','pointercancel','pointerleave','dragstart'].forEach(t => document.addEventListener(t, clearLongPress, true));

    document.addEventListener('click', async ev => {
      if (!isToday()) return;
      if (Date.now() < state.blockClickUntil && ev.target?.closest?.('[data-today-filter="unplaced"],.yx114-unplaced-refresh-trigger')) { ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); return; }
      if (ev.target && ev.target.id === 'yx112-refresh-today') {
        ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.();
        await loadTodayChanges112({force:true});
        YX.toast('今日異動已刷新', 'ok');
        return;
      }
      const del = ev.target?.closest?.('[data-yx112-delete-today]');
      if (del) {
        ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.();
        const id = del.getAttribute('data-yx112-delete-today');
        try { await YX.api('/api/today-changes/' + encodeURIComponent(id), {method:'DELETE'}); await loadTodayChanges112({force:true}); }
        catch(e) { YX.toast(e.message || '刪除失敗', 'error'); }
        return;
      }
      const filter = ev.target?.closest?.('[data-today-filter]');
      if (filter) {
        ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.();
        setFilter(filter.getAttribute('data-today-filter') || 'all');
        return;
      }
      const row = ev.target?.closest?.('.yx112-today-row');
      if (row) row.classList.toggle('expanded');
    }, true);

    // 左滑刪除活動紀錄；未錄入商品沒有 id 時不刪。
    let touch = null;
    document.addEventListener('pointerdown', ev => {
      const row = ev.target?.closest?.('.yx112-today-row[data-log-id]');
      if (!row || row.dataset.logId === '0') return;
      touch = {row, x:ev.clientX, y:ev.clientY};
    }, true);
    document.addEventListener('pointerup', async ev => {
      if (!touch) return;
      const dx = ev.clientX - touch.x;
      const dy = Math.abs(ev.clientY - touch.y);
      const row = touch.row;
      touch = null;
      if (dx < -80 && dy < 45) {
        const id = row.dataset.logId;
        try { await YX.api('/api/today-changes/' + encodeURIComponent(id), {method:'DELETE'}); row.remove(); await loadTodayChanges112({force:true}); }
        catch(e) { YX.toast(e.message || '刪除失敗', 'error'); }
      }
    }, true);
  }
  function lockGlobals(){
    const fn = YX.mark(loadTodayChanges112, 'today_changes');
    YX.hardAssign('loadTodayChanges', fn, {configurable:false});
    ['loadTodayChanges80','loadTodayChanges93','loadTodayChanges95','loadTodayChanges96','loadTodayChanges99','__yx96RemovedToday80','__yx96RemovedToday93','__yx96RemovedToday95'].forEach(name => YX.hardAssign(name, fn, {configurable:true}));
    if (window.YX_MASTER) {
      try { window.YX_MASTER = Object.freeze({...window.YX_MASTER, version:'fix144-modular-master-hardlock', loadTodayChanges:fn}); } catch(_e) {}
    }
  }
  function install(){
    if (!isToday()) return;
    if (!state.filter) state.filter = 'all';
    try { state.filter = localStorage.getItem('yx112TodayFilter') || 'all'; } catch(_e) { state.filter = 'all'; }
    if (!['all','inbound','outbound','orders','unplaced'].includes(state.filter)) state.filter = 'all';
    YX.cancelLegacyTimers('today_changes');
    document.documentElement.dataset.yx112Today = 'locked';
    document.documentElement.dataset.yx114Today = 'locked';
    bindEvents();
    lockGlobals();
    cleanLegacyTodayDom();
    loadTodayChanges112({force:true, silent:true});
    [80, 220, 520, 1000, 1800, 2800].forEach(ms => setTimeout(() => { cleanLegacyTodayDom(); if (state.data) render(state.data); lockGlobals(); }, ms));
  }
  YX.register('today_changes', {install, render, load:loadTodayChanges112});
})();
