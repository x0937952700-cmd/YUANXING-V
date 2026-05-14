/* V452 max repair glue: no yx_cache/yx_core edits, no setInterval, no MutationObserver. */
(function(){
  'use strict';
  if (window.__YX_V452_MAX_REPAIR__) return;
  window.__YX_V452_MAX_REPAIR__ = true;
  const $ = id => document.getElementById(id);
  const clean = v => String(v == null ? '' : v).trim();
  const moduleKey = () => document.body?.dataset?.module || document.querySelector('.module-screen[data-module]')?.dataset?.module || '';
  function removeUndo(){
    document.querySelectorAll('#yx-global-page-undo-btn,#yx-page-undo-btn,.yx-page-undo-btn').forEach(el=>{ try{ el.remove(); }catch(_e){ el.style.display='none'; } });
  }
  function centerCustomerMenu(){
    const m = $('yx113-customer-actions');
    if (!m || m.classList.contains('hidden')) return;
    try {
      if (m.parentElement !== document.body) document.body.appendChild(m);
      m.style.position='fixed'; m.style.inset='0'; m.style.display='flex';
      m.style.alignItems='center'; m.style.justifyContent='center'; m.style.zIndex='2147483400';
      const card = m.querySelector('.yx113-customer-action-card,.modal-card');
      if (card) { card.style.margin='auto'; card.style.left='auto'; card.style.top='auto'; card.style.transform='none'; }
    } catch(_e) {}
  }
  function forceCustomerVisibleFromSubmit(){
    const m = moduleKey();
    if (!['orders','master_order'].includes(m)) return;
    const name = clean($('customer-name')?.value || window.__YX_SELECTED_CUSTOMER__ || '');
    if (!name) return;
    try { window.__YX_SELECTED_CUSTOMER__ = name; } catch(_e) {}
    try { window.YX113CustomerRegions?.renderFromCurrentRows?.(); } catch(_e) {}
    try { window.YX113CustomerRegions?.selectCustomer?.(name); } catch(_e) {}
    try { window.dispatchEvent(new CustomEvent('yx:customer-selected', {detail:{name, v452:true}})); } catch(_e) {}
  }
  function installSubmitVisibilityBridge(){
    document.addEventListener('click', ev=>{
      const btn = ev.target?.closest?.('#submit-btn');
      if (!btn) return;
      setTimeout(forceCustomerVisibleFromSubmit, 50);
      setTimeout(forceCustomerVisibleFromSubmit, 450);
      setTimeout(forceCustomerVisibleFromSubmit, 1200);
    }, false);
  }
  function installCustomerMenuBridge(){
    document.addEventListener('contextmenu', ev=>{
      if (!ev.target?.closest?.('.yx113-customer-card,.yx114-customer-card,.customer-region-card')) return;
      setTimeout(centerCustomerMenu, 0); setTimeout(centerCustomerMenu, 80);
    }, true);
    document.addEventListener('pointerup', ()=>setTimeout(centerCustomerMenu,0), true);
    document.addEventListener('click', ev=>{
      if (ev.target?.closest?.('[data-yx113-customer-act],#yx113-customer-action-close')) return;
      setTimeout(centerCustomerMenu,0);
    }, true);
  }
  function installShipPreviewGuard(){
    if (moduleKey() !== 'ship') return;
    document.addEventListener('click', ev=>{
      const btn = ev.target?.closest?.('#submit-btn,[onclick*="confirmSubmit"],#yx22-confirm-ship');
      if (!btn) return;
      const panel = $('ship-preview-panel') || $('module-result');
      if (panel) {
        panel.classList.remove('hidden'); panel.style.display='';
        if (!panel.innerHTML.trim()) panel.innerHTML='<div class="empty-state-card compact-empty">出貨預覽建立中…</div>';
      }
    }, true);
  }
  function bootstrap(){ removeUndo(); installSubmitVisibilityBridge(); installCustomerMenuBridge(); installShipPreviewGuard(); centerCustomerMenu(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap, {once:true}); else bootstrap();
  window.addEventListener('pageshow', ()=>{ removeUndo(); centerCustomerMenu(); }, false);
  window.addEventListener('yx:product-batch-write-success', forceCustomerVisibleFromSubmit, false);
  window.addEventListener('yx:device-sync-updated', e=>{
    try {
      const key = e.detail?.key || '';
      if (key === 'warehouse' && moduleKey() === 'warehouse' && typeof window.reloadWarehouse === 'function') window.reloadWarehouse({force:true, reason:'v452-device-sync'});
    } catch(_e) {}
  }, false);
})();
