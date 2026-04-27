/* FIX112 母版整合器：最後載入、最後接管 */
(function(){
  'use strict';
  const YX = window.YXHardLock;
  if (!YX || window.__YX112_MASTER_INTEGRATOR__) return;
  window.__YX112_MASTER_INTEGRATOR__ = true;
  function install(){
    document.documentElement.dataset.yx112Master = 'installed';
    const m = YX.moduleKey();
    if (m === 'today_changes') YX.install('today_changes', {force:true});
    if (m === 'warehouse') YX.install('warehouse', {force:true});
    if (['inventory','orders','master_order'].includes(m)) YX.install('product_actions', {force:true});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true}); else install();
  window.addEventListener('pageshow', install);
  setTimeout(install, 0);
  setTimeout(install, 500);
})();
