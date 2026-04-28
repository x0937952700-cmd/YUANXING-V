/* FIX124 母版整合器：先硬鎖、app.js 後補相容，再二次硬鎖
   目的：新版頁面只走母版入口；app.js 保留功能庫但不再讓舊版畫面搶先輸出。 */
(function(){
  'use strict';
  const YX = window.YXHardLock;
  if (!YX) return;

  function safeInstall(name){
    try { return YX.install(name, {force:true}); }
    catch(e) { try { YX.toast(`${name} 母版接管失敗：${e.message || e}`, 'error'); } catch(_e){} }
    return null;
  }

  function install(){
    document.documentElement.dataset.yx113Master = 'installed';
    document.documentElement.dataset.yx114Master = 'installed';
    document.documentElement.dataset.yx115Master = 'installed';
    document.documentElement.dataset.yx116Master = 'installed';
    document.documentElement.dataset.yx118Master = 'installed';
    document.documentElement.dataset.yx121Master = 'installed';
    document.documentElement.dataset.yx123Master = 'installed';
    document.documentElement.dataset.yx124Master = 'installed';
    document.documentElement.dataset.yx124OrnateLabel = 'locked';

    const m = YX.moduleKey();
    // 只在已有新版母版完整接管的頁面清掉舊版延遲重畫；設定 / 出貨查詢 / 代辦仍保留原本初始化。
    if (['today_changes','warehouse','orders','master_order','inventory','ship','customers'].includes(m)) {
      try { YX.cancelLegacyTimers('fix124-master-integrator'); } catch(_e) {}
    }

    safeInstall('ornate_label');
    safeInstall('apple_ui');
    if (m === 'today_changes') safeInstall('today_changes');
    if (m === 'warehouse') safeInstall('warehouse');
    if (['orders','master_order','ship','customers'].includes(m)) safeInstall('customer_regions');
    if (m === 'ship') safeInstall('ship_picker');
    if (m === 'ship') safeInstall('ship_text_validate');
    if (['inventory','orders','master_order'].includes(m)) safeInstall('product_sort');
    if (['inventory','orders','master_order'].includes(m)) safeInstall('product_actions');
    if (['inventory','orders','master_order','ship'].includes(m)) safeInstall('product_source_bridge');
    if (['inventory','orders','master_order','ship'].includes(m)) safeInstall('inline_edit_full_list');
    if (m === 'settings' || (location.pathname || '').includes('/settings')) safeInstall('settings_audit');
    safeInstall('legacy_isolation');
    safeInstall('ornate_label');

    try { document.dispatchEvent(new CustomEvent('yx:master-installed', {detail:{module:m, version:'fix136-label-text-master-hardlock'}})); } catch(_e) {}
  }

  window.__YX_MASTER_REINSTALL__ = install;
  window.YX_MASTER_BRIDGE = Object.freeze({version:'fix136-label-text-master-hardlock', install});

  // FIX124：圓型標籤也屬於母版；每次重裝都重新鎖一次，避免舊版黑標籤回彈。
  install();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true});
  else setTimeout(install, 0);
  window.addEventListener('pageshow', install);
  window.addEventListener('yx:legacy-rendered', install);
  [80, 220, 520, 1100, 2200, 4200].forEach(ms => setTimeout(install, ms));
})();
