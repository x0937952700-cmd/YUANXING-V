/* FIX123 母版整合器：先硬鎖、app.js 後補相容，再二次硬鎖
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

    const m = YX.moduleKey();
    // 只在已有新版母版完整接管的頁面清掉舊版延遲重畫；設定 / 出貨查詢 / 代辦仍保留原本初始化。
    if (['today_changes','warehouse','orders','master_order','inventory','ship','customers'].includes(m)) {
      try { YX.cancelLegacyTimers('fix123-master-integrator'); } catch(_e) {}
    }

    safeInstall('apple_ui');
    if (m === 'today_changes') safeInstall('today_changes');
    if (m === 'warehouse') safeInstall('warehouse');
    if (['orders','master_order','ship','customers'].includes(m)) safeInstall('customer_regions');
    if (m === 'ship') safeInstall('ship_picker');
    if (['inventory','orders','master_order'].includes(m)) safeInstall('product_sort');
    if (['inventory','orders','master_order'].includes(m)) safeInstall('product_actions');
    if (m === 'settings' || (location.pathname || '').includes('/settings')) safeInstall('settings_audit');
    safeInstall('legacy_isolation');

    try { document.dispatchEvent(new CustomEvent('yx:master-installed', {detail:{module:m, version:'fix123-ornate-gray-master-hardlock'}})); } catch(_e) {}
  }

  window.__YX_MASTER_REINSTALL__ = install;
  window.YX_MASTER_BRIDGE = Object.freeze({version:'fix123-ornate-gray-master-hardlock', install});

  // 同一支檔案會在 app.js 前 / 後各載一次。第二次不跳過，直接重新硬鎖。
  install();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true});
  else setTimeout(install, 0);
  window.addEventListener('pageshow', install);
  window.addEventListener('yx:legacy-rendered', install);
  [80, 220, 520, 1100, 2200, 4200].forEach(ms => setTimeout(install, ms));
})();
