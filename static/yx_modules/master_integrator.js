/* FIX114 母版整合器：最後載入、最後接管
   功能拆模組後由此統一安裝，避免舊版函式蓋回新版。 */
(function(){
  'use strict';
  const YX = window.YXHardLock;
  if (!YX || window.__YX114_MASTER_INTEGRATOR__) return;
  window.__YX114_MASTER_INTEGRATOR__ = true;

  function install(){
    document.documentElement.dataset.yx113Master = 'installed';
    document.documentElement.dataset.yx114Master = 'installed';
    const m = YX.moduleKey();
    if (m === 'today_changes') YX.install('today_changes', {force:true});
    if (m === 'warehouse') YX.install('warehouse', {force:true});
    if (['orders','master_order','ship','customers'].includes(m)) YX.install('customer_regions', {force:true});
    if (['inventory','orders','master_order'].includes(m)) YX.install('product_actions', {force:true});
    if (m === 'settings' || (location.pathname || '').includes('/settings')) YX.install('settings_audit', {force:true});
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
