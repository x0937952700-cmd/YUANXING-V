/* FIX135 最終母版保險鎖：最後載入，重新接管新版畫面與舊版入口，不刪功能 */
(function(){
  'use strict';
  const V = 'fix139-readme-unified-master-hardlock';
  const YX = window.YXHardLock;
  const $ = id => document.getElementById(id);
  function moduleKey(){
    try { return YX?.moduleKey?.() || document.querySelector('.module-screen[data-module]')?.dataset.module || (location.pathname === '/' ? 'home' : ''); }
    catch(_e){ return ''; }
  }
  function setFlags(){
    const d = document.documentElement.dataset;
    d.yx135MasterFinal = 'locked';
    d.yx124OrnateLabel = 'locked';
    if (['inventory','orders','master_order'].includes(moduleKey())) {
      d.yx113Products = 'locked'; d.yx132Products = 'locked'; d.yx135Products = 'locked';
    }
    if (moduleKey() === 'home' || location.pathname === '/') d.yx133HomeBg = 'locked';
  }
  function hideLegacyProducts(){
    if (!['inventory','orders','master_order'].includes(moduleKey())) return;
    const bad = '.yx63-toolbar,.yx62-toolbar,.fix57-toolbar,.fix56-toolbar,.fix55-toolbar,.fix52-list-toolbar,.yx63-summary,.yx62-summary,.fix57-summary-panel,.fix56-summary-panel,.fix55-summary-panel,.yx63-card-list,.yx62-card-list,.fix57-card-list,.deduct-card.yx113-product-card,.deduct-card.yx112-product-card,.yx113-product-list,.yx112-product-list,.yx128-product-list';
    document.querySelectorAll(bad).forEach(el => {
      if (el.id && /^yx113-(inventory|orders|master_order)-summary$/.test(el.id)) return;
      if (el.closest && el.closest('.yx113-summary')) return;
      el.classList.add('yx135-hidden-legacy-product');
      el.style.display = 'none';
      el.style.pointerEvents = 'none';
      el.setAttribute('aria-hidden','true');
    });
    document.querySelectorAll('.yx113-table-wrap').forEach(el => { el.style.maxHeight = 'none'; el.style.height = 'auto'; });
  }
  function removeOldShipDropdown(){
    if (moduleKey() !== 'ship') return;
    const sel = $('ship-customer-item-select');
    if (sel) { sel.classList.add('yx128-hidden-select'); sel.style.display='none'; sel.setAttribute('aria-hidden','true'); sel.tabIndex=-1; }
    try { window.YX116ShipPicker?.render?.(); } catch(_e) {}
  }
  function installCoreModules(){
    if (!YX) return;
    const m = moduleKey();
    const names = ['ornate_label'];
    if (m === 'today_changes') names.push('today_changes');
    if (m === 'warehouse') names.push('warehouse');
    if (['orders','master_order','ship','customers'].includes(m)) names.push('customer_regions');
    if (m === 'ship') names.push('ship_picker','ship_text_validate');
    if (['inventory','orders','master_order'].includes(m)) names.push('product_sort','product_actions','product_source_bridge','inline_edit_full_list');
    if (m === 'settings') names.push('settings_audit');
    names.push('legacy_isolation','apple_ui','ornate_label');
    names.forEach(name => { try { YX.install(name, {force:true, final:true}); } catch(e) { try { console.warn('[YX135]', name, e); } catch(_e) {} } });
  }
  function refreshProductOnce(){
    const m = moduleKey();
    if (!['inventory','orders','master_order'].includes(m)) return;
    try {
      const pa = window.YX135ProductActions || window.YX132ProductActions || window.YX113ProductActions;
      if (pa && typeof pa.refreshCurrent === 'function') pa.refreshCurrent().catch(()=>{});
    } catch(_e) {}
  }
  function exposeMasterStatus(){
    try {
      window.YX135MasterFinal = Object.freeze({version:V, install, refreshProductOnce, hideLegacyProducts});
      window.__YX_MASTER_REINSTALL__ = install;
    } catch(_e) {}
  }
  let installing = false;
  function install(){
    if (installing) return;
    installing = true;
    try {
      setFlags();
      installCoreModules();
      hideLegacyProducts();
      removeOldShipDropdown();
      exposeMasterStatus();
    } finally {
      installing = false;
    }
  }
  install();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { install(); setTimeout(refreshProductOnce, 80); }, {once:true});
  else setTimeout(() => { install(); refreshProductOnce(); }, 0);
  window.addEventListener('pageshow', install);
  window.addEventListener('yx:master-installed', install);
  window.addEventListener('yx:legacy-rendered', install);
  [100, 300, 800, 1600, 3200, 5200].forEach(ms => setTimeout(install, ms));
  try {
    const MO = window.__YX96_NATIVE_MUTATION_OBSERVER__ || window.MutationObserver;
    if (MO) {
      const obs = new MO(() => { setFlags(); hideLegacyProducts(); removeOldShipDropdown(); });
      if (document.body) obs.observe(document.body, {childList:true, subtree:true});
      else document.addEventListener('DOMContentLoaded', () => obs.observe(document.body, {childList:true, subtree:true}), {once:true});
    }
  } catch(_e) {}
})();
