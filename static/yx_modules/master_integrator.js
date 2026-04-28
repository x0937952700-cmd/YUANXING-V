/* FIX124 母版整合器：最後載入、最後接管；簡約淡灰標籤硬鎖 */
(function(){
  'use strict';
  const YX = window.YXHardLock;
  if (!YX || window.__YX122_MASTER_INTEGRATOR__) return;
  window.__YX122_MASTER_INTEGRATOR__ = true;

  function install(){
    document.documentElement.dataset.yx113Master = 'installed';
    document.documentElement.dataset.yx114Master = 'installed';
    document.documentElement.dataset.yx115Master = 'installed';
    document.documentElement.dataset.yx116Master = 'installed';
    document.documentElement.dataset.yx118Master = 'installed';
    document.documentElement.dataset.yx121Master = 'installed';
    document.documentElement.dataset.yx122Master = 'installed';
    document.documentElement.dataset.yx124Master = 'installed';
    const m = YX.moduleKey();
    YX.install('customer_data_guard', {force:true});
    // FIX124：最後用簡約淡灰母版覆蓋華麗金框 / 蘋果風，只改視覺，不動功能。
    if (m === 'today_changes') YX.install('today_changes', {force:true});
    if (m === 'warehouse') YX.install('warehouse', {force:true});
    if (['orders','master_order','ship','customers'].includes(m)) YX.install('customer_regions', {force:true});
    if (m === 'ship') YX.install('ship_picker', {force:true});
    if (['inventory','orders','master_order'].includes(m)) YX.install('product_sort', {force:true});
    if (['inventory','orders','master_order'].includes(m)) YX.install('product_actions', {force:true});
    if (m === 'settings' || (location.pathname || '').includes('/settings')) YX.install('settings_audit', {force:true});
    YX.install('legacy_isolation', {force:true});
    YX.install('luxury_label_ui', {force:true});
    YX.install('luxury_label_ui_v122', {force:true});
    YX.install('minimal_grey_ui_v124', {force:true});
    try { window.YXLuxuryLabelUI && window.YXLuxuryLabelUI.install && window.YXLuxuryLabelUI.install(); } catch(_e) {}
    try { window.YXLuxuryLabelUI122 && window.YXLuxuryLabelUI122.install && window.YXLuxuryLabelUI122.install(); } catch(_e) {}
    try { window.YXMinimalGreyUI124 && window.YXMinimalGreyUI124.install && window.YXMinimalGreyUI124.install(); } catch(_e) {}
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
