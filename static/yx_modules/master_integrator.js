/* FIX121 母版整合器：最後載入、最後接管；華麗標籤 + 客戶資料安全硬鎖 */
(function(){
  'use strict';
  const YX = window.YXHardLock;
  if (!YX || window.__YX121_MASTER_INTEGRATOR__) return;
  window.__YX121_MASTER_INTEGRATOR__ = true;

  function install(){
    document.documentElement.dataset.yx113Master = 'installed';
    document.documentElement.dataset.yx114Master = 'installed';
    document.documentElement.dataset.yx115Master = 'installed';
    document.documentElement.dataset.yx116Master = 'installed';
    document.documentElement.dataset.yx118Master = 'installed';
    document.documentElement.dataset.yx121Master = 'installed';
    const m = YX.moduleKey();
    YX.install('customer_data_guard', {force:true});
    YX.install('apple_ui', {force:true});
    if (m === 'today_changes') YX.install('today_changes', {force:true});
    if (m === 'warehouse') YX.install('warehouse', {force:true});
    if (['orders','master_order','ship','customers'].includes(m)) YX.install('customer_regions', {force:true});
    if (m === 'ship') YX.install('ship_picker', {force:true});
    if (['inventory','orders','master_order'].includes(m)) YX.install('product_sort', {force:true});
    if (['inventory','orders','master_order'].includes(m)) YX.install('product_actions', {force:true});
    if (m === 'settings' || (location.pathname || '').includes('/settings')) YX.install('settings_audit', {force:true});
    YX.install('legacy_isolation', {force:true});
    YX.install('luxury_label_ui', {force:true});
    try { window.YXLuxuryLabelUI && window.YXLuxuryLabelUI.install && window.YXLuxuryLabelUI.install(); } catch(_e) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true}); else install();
  window.addEventListener('pageshow', install);
  window.addEventListener('yx:legacy-rendered', install);
  setTimeout(install, 0);
  setTimeout(install, 250);
  setTimeout(install, 900);
  setTimeout(install, 1800);
  setTimeout(install, 3200);
})();
