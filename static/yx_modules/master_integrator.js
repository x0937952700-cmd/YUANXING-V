/* FIX125 母版整合器：舊版保留函式但禁止接管畫面；只顯示新版頁面與簡約淡灰標籤 */
(function(){
  'use strict';
  const YX = window.YXHardLock;
  if (!YX || window.__YX125_MASTER_INTEGRATOR__) return;
  window.__YX125_MASTER_INTEGRATOR__ = true;

  function safeInstall(name, opts){
    try { return YX.install(name, opts || {force:true}); }
    catch(e){ try { YX.toast(`${name} 安裝失敗：${e.message || e}`, 'error'); } catch(_e){} return null; }
  }

  function install(){
    document.documentElement.dataset.yx113Master = 'installed';
    document.documentElement.dataset.yx114Master = 'installed';
    document.documentElement.dataset.yx115Master = 'installed';
    document.documentElement.dataset.yx116Master = 'installed';
    document.documentElement.dataset.yx118Master = 'installed';
    document.documentElement.dataset.yx121Master = 'installed';
    document.documentElement.dataset.yx122Master = 'installed';
    document.documentElement.dataset.yx124Master = 'installed';
    document.documentElement.dataset.yx125Master = 'installed';

    // FIX125：先鎖舊版 UI 入口，但暫時不釋放畫面，避免舊版先閃出來。
    safeInstall('interface_single_source_v125', {force:true, release:false});

    const m = YX.moduleKey();
    safeInstall('customer_data_guard', {force:true});
    if (m === 'today_changes') safeInstall('today_changes', {force:true});
    if (m === 'warehouse') safeInstall('warehouse', {force:true});
    if (['orders','master_order','ship','customers'].includes(m)) safeInstall('customer_regions', {force:true});
    if (m === 'ship') safeInstall('ship_picker', {force:true});
    if (['inventory','orders','master_order'].includes(m)) safeInstall('product_sort', {force:true});
    if (['inventory','orders','master_order'].includes(m)) safeInstall('product_actions', {force:true});
    if (m === 'settings' || (location.pathname || '').includes('/settings')) safeInstall('settings_audit', {force:true});

    // 視覺只准使用 FIX124/125 簡約淡灰；不再安裝 121/122 金框或蘋果風，避免標籤跳版。
    safeInstall('minimal_grey_ui_v124', {force:true});
    safeInstall('legacy_isolation', {force:true});
    safeInstall('interface_single_source_v125', {force:true, release:true});
    try { window.YXMinimalGreyUI124 && window.YXMinimalGreyUI124.install && window.YXMinimalGreyUI124.install(); } catch(_e) {}
    try { window.YX125SingleSource && window.YX125SingleSource.install && window.YX125SingleSource.install({release:true}); } catch(_e) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true}); else install();
  window.addEventListener('pageshow', install);
  window.addEventListener('yx:legacy-rendered', install);
  setTimeout(install, 0);
  setTimeout(install, 220);
  setTimeout(install, 760);
  setTimeout(install, 1600);
})();
